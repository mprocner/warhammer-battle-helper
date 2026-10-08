package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"fmt"
	"strconv"
	"strings"
)

// ── Formula-block interpreter ─────────────────────────────────────────────────

// rollFromFormula evaluates a visual formula ([]FormulaBlock) against the
// character's stats and returns a RollResult.
func (p *Plugin) rollFromFormula(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, baseFromAttr bool, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	modTarget, modValue := resolveModifier(template.Settings.Modifier, cfg.RollMode, modifier)

	if cfg.RollMode == "dice_pool" {
		return p.rollFromFormulaDicePool(stats, template, skillKey, linkedAttr, baseFromAttr, cfg, modTarget, modValue)
	}

	result, diceType, labelStr, valueStr, err := p.evalFormula(cfg.Formula, stats, skillKey, linkedAttr, baseFromAttr)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval: %w", err)
	}

	// The modifier lands on exactly one side of the comparison: the roll or the target.
	rollMod, thresholdMod := 0, 0
	if modTarget == ModTargetThreshold {
		thresholdMod = modValue
	} else {
		rollMod = modValue
	}

	finalRoll := result + rollMod

	if rollMod != 0 {
		sign := "+"
		if rollMod < 0 {
			sign = ""
		}
		labelStr += fmt.Sprintf("%s%d", sign, rollMod)
		valueStr += fmt.Sprintf("%s%d", sign, rollMod)
	}

	var breakdown string
	if labelStr == valueStr {
		breakdown = fmt.Sprintf("%s = %d", labelStr, finalRoll)
	} else {
		breakdown = fmt.Sprintf("%s = %s = %d", labelStr, valueStr, finalRoll)
	}

	attrValue, attrOK := attrLookup(stats, linkedAttr)
	sv := skillValue(stats, skillKey, linkedAttr, baseFromAttr)
	threshold := evalThreshold(cfg.Threshold)
	hasThreshold := threshold != 0
	if threshold == 0 {
		if skillHasValue(stats, skillKey, linkedAttr, baseFromAttr) {
			threshold = sv
			hasThreshold = true
		} else {
			threshold = attrValue
			hasThreshold = attrOK
		}
	}
	// Only a threshold that actually exists can be shifted. Adding the modifier to a
	// "no data" threshold would invent a target out of nothing (see evalOutcome).
	if hasThreshold {
		threshold += thresholdMod
	}
	outcome := evalOutcome(cfg, finalRoll, threshold, hasThreshold)
	skillLabel := resolveSkillLabel(template, stats, skillKey)

	// A threshold-target modifier on a field with no resolvable threshold changes nothing, so it
	// must not be REPORTED as applied either: the log branches on ModifierTarget to decide whether
	// the modifier is already inside the breakdown, and a phantom target makes it print a number
	// that moved neither the roll nor the goal.
	appliedTarget, appliedValue := modTarget, modValue
	if modTarget == ModTargetThreshold && !hasThreshold {
		appliedTarget, appliedValue = ModTargetNone, 0
	}

	return &gsys.RollResult{
		DiceType:         diceType,
		RollType:         "skill",
		Roll:             finalRoll,
		Target:           threshold,
		Outcome:          outcome,
		SkillKey:         skillKey,
		SkillName:        skillLabel,
		Modifier:         appliedValue,
		ModifierTarget:   appliedTarget,
		FormulaBreakdown: breakdown,
	}, nil
}

// evalFormula parses the formula blocks and evaluates them with operator precedence and
// parentheses (see parseFormula). It returns:
//   - result: the computed integer value
//   - diceType: faces of the first die rolled (for display)
//   - labelStr: formula notation string, e.g. "(STR+2)*d6"
//   - valueStr: resolved values string, e.g. "(8+2)*4"
func (p *Plugin) evalFormula(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, baseFromAttr bool) (result, diceType int, labelStr, valueStr string, err error) {
	root, err := parseFormula(blocks)
	if err != nil {
		return 0, 0, "", "", err
	}
	env := p.formulaEnv(stats, skillKey, linkedAttr, baseFromAttr)
	w := &tradWalk{env: env}
	out, err := w.eval(root)
	if err != nil {
		return 0, 0, "", "", err
	}
	return out.val, w.diceType, env.label(root), out.shown, nil
}

// rollFromFormulaDicePool handles dice-pool mode: rolls dice individually and counts successes.
// modTarget/modValue come pre-resolved from rollFromFormula, so this function never re-decides
// what the modifier means.
func (p *Plugin) rollFromFormulaDicePool(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, baseFromAttr bool, cfg *models.RollConfig, modTarget string, modValue int) (*gsys.RollResult, error) {
	extraDice, thresholdMod := 0, 0
	switch modTarget {
	case ModTargetDiceCount:
		extraDice = modValue
	case ModTargetSuccessThreshold:
		thresholdMod = modValue
	}

	parts, diceType, err := p.evalFormulaDicePool(cfg.Formula, stats, skillKey, linkedAttr, baseFromAttr, extraDice)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval (pool): %w", err)
	}

	threshold := cfg.PoolSuccessThreshold + thresholdMod
	condition := cfg.PoolSuccessCondition
	if condition == "" {
		condition = "gte"
	}

	successes := 0
	for _, part := range parts {
		for _, r := range part.Rolls {
			if condition == "eq" {
				if r == threshold {
					successes++
				}
			} else {
				if r >= threshold {
					successes++
				}
			}
		}
	}

	outcome := "failure"
	if successes > 0 {
		outcome = "regular_success"
	}

	skillLabel := resolveSkillLabel(template, stats, skillKey)

	return &gsys.RollResult{
		DiceType:             diceType,
		RollType:             "skill",
		Roll:                 successes,
		Target:               threshold,
		Outcome:              outcome,
		SkillKey:             skillKey,
		SkillName:            skillLabel,
		Modifier:             modValue,
		ModifierTarget:       modTarget,
		PoolFormula:          parts,
		PoolSuccesses:        successes,
		PoolSuccessCondition: condition,
	}, nil
}

// evalFormulaDicePool evaluates the formula for dice-pool mode. extraDice (the pool-size
// modifier) is absorbed by the FIRST die term only — the one that defines the displayed
// diceType — and the resulting count is floored at 1; later terms keep their configured
// counts. It returns the formula as a list of parts — text fragments and die terms carrying
// their own rolls — plus the face count of the first die rolled (display only).
func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, baseFromAttr bool, extraDice int) (parts []gsys.PoolFormulaPart, diceType int, err error) {
	root, err := parseFormula(blocks)
	if err != nil {
		return nil, 0, err
	}
	w := &poolWalk{env: p.formulaEnv(stats, skillKey, linkedAttr, baseFromAttr), extraDice: extraDice}
	if _, err := w.eval(root); err != nil {
		return nil, 0, err
	}
	return w.parts, w.diceType, nil
}

// diceNotationToSides parses a "dN" notation into the number of faces. It accepts
// any positive N (not just the standard set), so a weapon damage formula can use a
// player-supplied die such as "d7". Falls back to 6 on a malformed notation.
func diceNotationToSides(notation string) int {
	if sides, err := strconv.Atoi(strings.TrimPrefix(notation, "d")); err == nil && sides > 0 {
		return sides
	}
	return 6
}

// skillValue returns the character's effective value for the given skill key: advances on top of a
// base that is either the character's own stored number or, when the field derives it
// (BaseFromAttr), the linked attribute's current value. Nothing persists the derived base —
// ComputeDerived cannot see the template — so every reader must compose it here.
//
// The front end must compose this same number in exactly one place of its own —
// resolveSkillValues in systems/custom/skillLayout.js. Change one side and you must change the
// other, or the roll log and the sheet disagree about the same skill.
func skillValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) int {
	v := stats.Skills[key]
	if baseFromAttr {
		base, _ := attrLookup(stats, linkedAttr)
		return base + v.Advances
	}
	return v.Base + v.Advances
}

// skillHasValue reports whether the character has any data for this skill. A skill whose base and
// advances are both zero is indistinguishable from one the character never touched, so it keeps the
// old fall-back-to-the-attribute behaviour; a skill whose parts are non-zero uses its own total,
// even when that total is zero or negative (base 30 with advances -30 is a real 0, not a blank).
// Current is deliberately not consulted: base + advances is the whole truth about a skill's value
// (see skillValue), so a Current that disagrees can only be stale.
//
// With BaseFromAttr the derived base can come from either half of skillValue's sum: an attribute
// present and reading 0 gives a real threshold of 0 + advances, the same way a computed zero does
// above, and advances alone are just as real when the skill has NO attribute assigned — skillValue,
// the "skill" formula block and the sheet all report that number, so the threshold must too.
// Only a skill with neither (no attribute behind it, no advances on it) is genuinely blank.
func skillHasValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) bool {
	v := stats.Skills[key]
	if baseFromAttr {
		if _, ok := attrLookup(stats, linkedAttr); ok {
			return true
		}
		return v.Advances != 0
	}
	return v.Base != 0 || v.Advances != 0
}

// attrLookup returns an attribute's current value and whether the attribute is actually
// present in stats. A missing key also reads as Current == 0 via Go's zero value, which is
// indistinguishable from a real, computed 0 unless the presence of the map entry itself is
// checked — needed to tell "no attribute linked" apart from "attribute cancelled to zero".
func attrLookup(stats *Stats, key string) (value int, ok bool) {
	v, ok := stats.Attributes[key]
	return v.Current, ok
}

// evalThreshold parses a numeric threshold override. Returns 0 if empty.
func evalThreshold(expr string) int {
	v, _ := strconv.Atoi(strings.TrimSpace(expr))
	return v
}

// evalOutcome determines the outcome string from roll and threshold. hasThreshold tells
// it whether threshold was actually determined (from an explicit cfg.Threshold override, a
// skill, or an attribute) as opposed to defaulting to 0 because nothing was configured —
// threshold == 0 stopped being a usable "no data" sentinel once a fully cancelled skill or
// attribute (base + advances landing on exactly 0) became a real, computed target.
func evalOutcome(cfg *models.RollConfig, roll, threshold int, hasThreshold bool) string {
	if cfg.SuccessType == "raw" || !hasThreshold {
		return fmt.Sprintf("%d", roll)
	}

	switch cfg.SuccessType {
	case "below_threshold":
		if roll <= threshold {
			return "regular_success"
		}
	default: // "above_threshold"
		if roll >= threshold {
			return "regular_success"
		}
	}
	return "failure"
}

// resolveSkillLabel finds the human-readable label for a skill key, checking template-defined
// fields/skills/tree-nodes first, then player-added custom skill nodes (which live only in
// stats, keyed by their opaque full path). Falls back to the raw key if nothing matches.
func resolveSkillLabel(template *models.SystemTemplate, stats *Stats, skillKey string) string {
	for _, section := range template.Sections {
		for _, field := range flattenFields(section.Fields) {
			if field.Key == skillKey {
				return field.Label
			}
			if field.Type == "skill_table" && strings.HasPrefix(skillKey, field.Key+".") {
				suffix := skillKey[len(field.Key)+1:]
				for _, opt := range field.Skills {
					if opt.ID == suffix {
						return opt.Label
					}
				}
			}
			if field.Type == "skill_tree" && field.Tree != nil {
				if label, ok := findLeafLabel(field.Tree, skillKey, ""); ok {
					return label
				}
			}
		}
	}
	if stats != nil {
		if node, ok := stats.CustomSkillNodes[skillKey]; ok && node.Label != "" {
			return node.Label
		}
	}
	return skillKey
}

func findLeafLabel(node *models.SkillTreeNode, target, path string) (string, bool) {
	current := node.Key
	if path != "" {
		current = path + "." + node.Key
	}
	if current == target {
		return node.Label, true
	}
	for i := range node.Children {
		if label, ok := findLeafLabel(&node.Children[i], target, current); ok {
			return label, true
		}
	}
	return "", false
}
