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
func (p *Plugin) rollFromFormula(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	modTarget, modValue := resolveModifier(template.Settings.Modifier, cfg.RollMode, modifier)

	if cfg.RollMode == "dice_pool" {
		return p.rollFromFormulaDicePool(stats, template, skillKey, linkedAttr, cfg, modTarget, modValue)
	}

	result, diceType, labelStr, valueStr, err := p.evalFormula(cfg.Formula, stats, skillKey, linkedAttr)
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
	sv := skillValue(stats, skillKey)
	threshold := evalThreshold(cfg.Threshold)
	hasThreshold := threshold != 0
	if threshold == 0 {
		if skillHasValue(stats, skillKey) {
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

// evalFormula evaluates the formula blocks left-to-right and returns:
//   - result: the computed integer value
//   - diceType: faces of the first die rolled (for display)
//   - labelStr: formula notation string, e.g. "d6+STR+2"
//   - valueStr: resolved values string, e.g. "3+8+2"
func (p *Plugin) evalFormula(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string) (result, diceType int, labelStr, valueStr string, err error) {
	if len(blocks) == 0 {
		return 0, 0, "", "", fmt.Errorf("formula is empty")
	}

	type segment struct {
		op  string
		val int
	}

	var segments []segment
	var labelParts []string
	var valueParts []string
	pendingOp := "+"

	for _, b := range blocks {
		switch b.Type {
		case "op":
			if b.Value != "d" {
				labelParts = append(labelParts, b.Value)
				valueParts = append(valueParts, b.Value)
			}
			pendingOp = b.Value
		case "dice":
			sides := diceNotationToSides(b.Value)
			if diceType == 0 {
				diceType = sides
			}
			if pendingOp == "d" && len(segments) > 0 {
				count := segments[len(segments)-1].val
				prevOp := segments[len(segments)-1].op
				countLabel := labelParts[len(labelParts)-1]
				segments = segments[:len(segments)-1]
				labelParts = labelParts[:len(labelParts)-1]
				valueParts = valueParts[:len(valueParts)-1]
				total, rollParts := evalDicePool(count, func() int { return p.rng.Intn(sides) + 1 })
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, fmt.Sprintf("%s%s", countLabel, b.Value))
				valueParts = append(valueParts, strings.Join(rollParts, "+"))
			} else {
				rolled := p.rng.Intn(sides) + 1
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, b.Value)
				valueParts = append(valueParts, strconv.Itoa(rolled))
			}
			pendingOp = ""
		case "dice_attr":
			sides := stats.Attributes[b.Key].Current
			if sides < 1 {
				sides = 1
			}
			if diceType == 0 {
				diceType = sides
			}
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			if pendingOp == "d" && len(segments) > 0 {
				count := segments[len(segments)-1].val
				prevOp := segments[len(segments)-1].op
				countLabel := labelParts[len(labelParts)-1]
				segments = segments[:len(segments)-1]
				labelParts = labelParts[:len(labelParts)-1]
				valueParts = valueParts[:len(valueParts)-1]
				total, rollParts := evalDicePool(count, func() int { return p.rng.Intn(sides) + 1 })
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, fmt.Sprintf("%sd(%s)", countLabel, lbl))
				valueParts = append(valueParts, strings.Join(rollParts, "+"))
			} else {
				rolled := p.rng.Intn(sides) + 1
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, "d("+lbl+")")
				valueParts = append(valueParts, strconv.Itoa(rolled))
			}
			pendingOp = ""
		case "dice_skill_attr":
			av := stats.Attributes[linkedAttr].Current
			sv := skillValue(stats, skillKey)
			sides := av + sv
			if sides < 1 {
				sides = 1
			}
			if diceType == 0 {
				diceType = sides
			}
			var diceLabel string
			if linkedAttr == "" {
				diceLabel = fmt.Sprintf("d(%d)", sv)
			} else {
				diceLabel = fmt.Sprintf("d(%d+%d)", av, sv)
			}
			if pendingOp == "d" && len(segments) > 0 {
				count := segments[len(segments)-1].val
				prevOp := segments[len(segments)-1].op
				countLabel := labelParts[len(labelParts)-1]
				segments = segments[:len(segments)-1]
				labelParts = labelParts[:len(labelParts)-1]
				valueParts = valueParts[:len(valueParts)-1]
				total, rollParts := evalDicePool(count, func() int { return p.rng.Intn(sides) + 1 })
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, countLabel+diceLabel)
				valueParts = append(valueParts, strings.Join(rollParts, "+"))
			} else {
				rolled := p.rng.Intn(sides) + 1
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, diceLabel)
				valueParts = append(valueParts, strconv.Itoa(rolled))
			}
			pendingOp = ""
		case "attr":
			val := stats.Attributes[b.Key].Current
			segments = append(segments, segment{op: pendingOp, val: val})
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			labelParts = append(labelParts, lbl)
			valueParts = append(valueParts, strconv.Itoa(val))
			pendingOp = ""
		case "skill":
			sv := skillValue(stats, skillKey)
			segments = append(segments, segment{op: pendingOp, val: sv})
			labelParts = append(labelParts, "umiej.")
			valueParts = append(valueParts, strconv.Itoa(sv))
			pendingOp = ""
		case "attr_linked":
			av := stats.Attributes[linkedAttr].Current
			segments = append(segments, segment{op: pendingOp, val: av})
			if linkedAttr == "" {
				labelParts = append(labelParts, "0")
			} else {
				labelParts = append(labelParts, linkedAttr)
			}
			valueParts = append(valueParts, strconv.Itoa(av))
			pendingOp = ""
		case "const":
			v := 0
			if b.Num != nil {
				v = int(*b.Num)
			}
			segments = append(segments, segment{op: pendingOp, val: v})
			labelParts = append(labelParts, strconv.Itoa(v))
			valueParts = append(valueParts, strconv.Itoa(v))
			pendingOp = ""
		}
	}

	if len(segments) == 0 {
		return 0, 0, "", "", fmt.Errorf("formula produced no values")
	}

	res := segments[0].val
	for _, s := range segments[1:] {
		switch s.op {
		case "+":
			res += s.val
		case "-":
			res -= s.val
		case "*":
			res *= s.val
		case "/":
			if s.val == 0 {
				return 0, 0, "", "", fmt.Errorf("division by zero in formula")
			}
			res /= s.val
		default:
			res += s.val
		}
	}

	return res, diceType, strings.Join(labelParts, ""), strings.Join(valueParts, ""), nil
}

// evalDicePool rolls count dice using rollFn and returns the total and individual roll strings.
// count is clamped to a minimum of 1.
func evalDicePool(count int, rollFn func() int) (total int, parts []string) {
	if count < 1 {
		count = 1
	}
	for i := 0; i < count; i++ {
		r := rollFn()
		total += r
		parts = append(parts, strconv.Itoa(r))
	}
	return
}

// evalDicePoolInts rolls count dice and returns individual results as ints.
func evalDicePoolInts(count int, rollFn func() int) []int {
	if count < 1 {
		count = 1
	}
	rolls := make([]int, count)
	for i := 0; i < count; i++ {
		rolls[i] = rollFn()
	}
	return rolls
}

// rollFromFormulaDicePool handles dice-pool mode: rolls dice individually and counts successes.
// modTarget/modValue come pre-resolved from rollFromFormula, so this function never re-decides
// what the modifier means.
func (p *Plugin) rollFromFormulaDicePool(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modTarget string, modValue int) (*gsys.RollResult, error) {
	extraDice, thresholdMod := 0, 0
	switch modTarget {
	case ModTargetDiceCount:
		extraDice = modValue
	case ModTargetSuccessThreshold:
		thresholdMod = modValue
	}

	parts, diceType, err := p.evalFormulaDicePool(cfg.Formula, stats, skillKey, linkedAttr, extraDice)
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
// Arithmetic ops still work as die-count modifiers.
func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, extraDice int) (parts []gsys.PoolFormulaPart, diceType int, err error) {
	if len(blocks) == 0 {
		return nil, 0, fmt.Errorf("formula is empty")
	}

	type segment struct {
		op  string
		val int
	}

	var segments []segment
	pendingOp := "+"

	// extraDice (the pool-size modifier) is absorbed by the first die term — the one that
	// already defines the displayed diceType. Later terms keep their configured counts.
	extraApplied := false

	// takeCount consumes the preceding part as the multiplier of a "d" operation.
	// A text part (constant or attribute label) is absorbed into the die term's
	// CountLabel. A die part stays where it is — its own rolls must survive — and the
	// new term renders without a multiplier, so "d6d10" reads as "K6K10".
	takeCount := func() string {
		if len(parts) == 0 || parts[len(parts)-1].Kind != "text" {
			return ""
		}
		label := parts[len(parts)-1].Text
		parts = parts[:len(parts)-1]
		return label
	}

	// rollTerm appends one die term: `count` dice when it follows a "d" operator, a single die
	// otherwise, plus the pool-size modifier on the first term. sidesLabel is empty for a
	// literal die (d6) and holds the source expression when the face count is computed (d(STR)).
	rollTerm := func(sides int, sidesLabel string) {
		if diceType == 0 {
			diceType = sides
		}
		roll := func() int { return p.rng.Intn(sides) + 1 }

		count := 1
		countLabel := ""
		termOp := pendingOp
		if pendingOp == "d" && len(segments) > 0 {
			count = segments[len(segments)-1].val
			termOp = segments[len(segments)-1].op
			segments = segments[:len(segments)-1]
			countLabel = takeCount()
		}
		if !extraApplied {
			extraApplied = true
			count += extraDice
		}
		// A pool of zero dice can never succeed and reads as a bug rather than as a very hard
		// roll, so the modifier can shrink a pool but never erase it.
		if count < 1 {
			count = 1
		}

		rolls := evalDicePoolInts(count, roll)
		total := 0
		for _, r := range rolls {
			total += r
		}
		segments = append(segments, segment{op: termOp, val: total})
		parts = append(parts, gsys.PoolFormulaPart{
			Kind: "dice", Sides: sides, SidesLabel: sidesLabel, CountLabel: countLabel, Rolls: rolls,
		})
		pendingOp = ""
	}

	// addText appends a non-die term and records its value as a possible die count.
	addText := func(text string, val int) {
		segments = append(segments, segment{op: pendingOp, val: val})
		parts = append(parts, gsys.PoolFormulaPart{Kind: "text", Text: text})
		pendingOp = ""
	}

	for _, b := range blocks {
		switch b.Type {
		case "op":
			if b.Value != "d" {
				parts = append(parts, gsys.PoolFormulaPart{Kind: "text", Text: b.Value})
			}
			pendingOp = b.Value
		case "dice":
			rollTerm(diceNotationToSides(b.Value), "")
		case "dice_attr":
			sides := stats.Attributes[b.Key].Current
			if sides < 1 {
				sides = 1
			}
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			rollTerm(sides, lbl)
		case "dice_skill_attr":
			av := stats.Attributes[linkedAttr].Current
			sv := skillValue(stats, skillKey)
			sides := av + sv
			if sides < 1 {
				sides = 1
			}
			lbl := strconv.Itoa(sv)
			if linkedAttr != "" {
				lbl = fmt.Sprintf("%d+%d", av, sv)
			}
			rollTerm(sides, lbl)
		case "attr":
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			addText(lbl, stats.Attributes[b.Key].Current)
		case "skill":
			addText("umiej.", skillValue(stats, skillKey))
		case "attr_linked":
			lbl := "0"
			if linkedAttr != "" {
				lbl = linkedAttr
			}
			addText(lbl, stats.Attributes[linkedAttr].Current)
		case "const":
			v := 0
			if b.Num != nil {
				v = int(*b.Num)
			}
			addText(strconv.Itoa(v), v)
		}
	}

	return parts, diceType, nil
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

// skillValue returns the character's effective value for the given skill key: base +
// advances. This used to read Current instead, falling back to Base only when Current
// was 0 — but Current == 0 no longer means "not computed yet": a permanent penalty that
// cancels the base out (30 base, -30 advances) is a real, computed 0. Summing directly
// avoids trusting a Current that could be stale or ambiguous either way.
func skillValue(stats *Stats, key string) int {
	v := stats.Skills[key]
	return v.Base + v.Advances
}

// skillHasValue reports whether the character has any data for this skill. A skill whose
// base and advances are both zero is indistinguishable from one the character never
// touched, so it keeps the old fall-back-to-the-attribute behaviour; a skill whose parts
// are non-zero uses its own total, even when that total is zero or negative (base 30 with
// advances -30 is a real 0, not a blank). Current is deliberately not consulted: base +
// advances is the whole truth about a skill's value (see skillValue), so a Current that
// disagrees can only be stale, and checking it here would report "has value" for the same
// {Base: 0, Advances: 0} blank shape skillValue reads as 0 — the two functions would agree
// on nothing.
func skillHasValue(stats *Stats, key string) bool {
	v := stats.Skills[key]
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
		for _, field := range section.Fields {
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
