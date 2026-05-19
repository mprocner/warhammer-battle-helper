package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"fmt"
	"math/rand"
	"strconv"
	"strings"
)

// ── Formula-block interpreter ─────────────────────────────────────────────────

// rollFromFormula evaluates a visual formula ([]FormulaBlock) against the
// character's stats and returns a RollResult.
func rollFromFormula(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	result, diceType, labelStr, valueStr, err := evalFormula(cfg.Formula, stats, skillKey, linkedAttr)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval: %w", err)
	}

	finalRoll := result + modifier

	if modifier != 0 {
		sign := "+"
		if modifier < 0 {
			sign = ""
		}
		labelStr += fmt.Sprintf("%s%d", sign, modifier)
		valueStr += fmt.Sprintf("%s%d", sign, modifier)
	}

	var breakdown string
	if labelStr == valueStr {
		breakdown = fmt.Sprintf("%s = %d", labelStr, finalRoll)
	} else {
		breakdown = fmt.Sprintf("%s = %s = %d", labelStr, valueStr, finalRoll)
	}

	attrValue := stats.Attributes[linkedAttr].Current
	sv := skillValue(stats, skillKey)
	threshold := evalThreshold(cfg.Threshold, attrValue, sv)
	outcome := evalOutcome(cfg, finalRoll, threshold)
	skillLabel := resolveSkillLabel(template, skillKey)

	return &gsys.RollResult{
		DiceType:         diceType,
		RollType:         "skill",
		Roll:             finalRoll,
		Target:           threshold,
		Outcome:          outcome,
		SkillKey:         skillKey,
		SkillName:        skillLabel,
		Modifier:         modifier,
		FormulaBreakdown: breakdown,
	}, nil
}

// evalFormula evaluates the formula blocks left-to-right and returns:
//   - result: the computed integer value
//   - diceType: faces of the first die rolled (for display)
//   - labelStr: formula notation string, e.g. "d6+STR+2"
//   - valueStr: resolved values string, e.g. "3+8+2"
func evalFormula(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string) (result, diceType int, labelStr, valueStr string, err error) {
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
			labelParts = append(labelParts, b.Value)
			valueParts = append(valueParts, b.Value)
			pendingOp = b.Value
		case "dice":
			sides := diceNotationToSides(b.Value)
			if diceType == 0 {
				diceType = sides
			}
			rolled := rand.Intn(sides) + 1
			segments = append(segments, segment{op: pendingOp, val: rolled})
			labelParts = append(labelParts, b.Value)
			valueParts = append(valueParts, strconv.Itoa(rolled))
			pendingOp = ""
		case "dice_attr":
			sides := stats.Attributes[b.Key].Current
			if sides < 1 {
				sides = 1
			}
			if diceType == 0 {
				diceType = sides
			}
			rolled := rand.Intn(sides) + 1
			segments = append(segments, segment{op: pendingOp, val: rolled})
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			labelParts = append(labelParts, "d("+lbl+")")
			valueParts = append(valueParts, strconv.Itoa(rolled))
			pendingOp = ""
		case "dice_skill_attr":
			av := stats.Attributes[linkedAttr].Current
			sv := stats.Skills[skillKey]
			sides := av + sv
			if sides < 1 {
				sides = 1
			}
			if diceType == 0 {
				diceType = sides
			}
			rolled := rand.Intn(sides) + 1
			segments = append(segments, segment{op: pendingOp, val: rolled})
			if linkedAttr == "" {
				labelParts = append(labelParts, fmt.Sprintf("d(%d)", sv))
			} else {
				labelParts = append(labelParts, fmt.Sprintf("d(%d+%d)", av, sv))
			}
			valueParts = append(valueParts, strconv.Itoa(rolled))
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
			sv := stats.Skills[skillKey]
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

func diceNotationToSides(notation string) int {
	switch notation {
	case "d4":
		return 4
	case "d6":
		return 6
	case "d8":
		return 8
	case "d10":
		return 10
	case "d12":
		return 12
	case "d20":
		return 20
	case "d100":
		return 100
	default:
		return 6
	}
}

// ── Legacy formula types ──────────────────────────────────────────────────────

// rollAttrPlusSkill implements the "attr_plus_skill_die" formula:
//
//	diceSize = attrValue + skillValue
//	roll     = rand(1, diceSize)
//
// The larger the attribute + skill, the bigger the die — and therefore
// the wider the range of outcomes.
func rollAttrPlusSkill(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	attrValue := stats.Attributes[linkedAttr].Current
	skillValue := skillValue(stats, skillKey)

	diceSize := attrValue + skillValue
	if diceSize < 1 {
		diceSize = 1
	}

	roll := rand.Intn(diceSize) + 1
	finalRoll := roll + modifier

	threshold := evalThreshold(cfg.Threshold, attrValue, skillValue)
	outcome := evalOutcome(cfg, finalRoll, threshold)

	skillLabel := resolveSkillLabel(template, skillKey)

	return &gsys.RollResult{
		DiceType:  diceSize,
		RollType:  "skill",
		Roll:      finalRoll,
		Target:    threshold,
		Outcome:   outcome,
		SkillKey:  skillKey,
		SkillName: skillLabel,
		Modifier:  modifier,
	}, nil
}

// rollFixedD100 implements a classic d100 roll-under mechanic.
func rollFixedD100(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	attrValue := stats.Attributes[linkedAttr].Current
	sv := skillValue(stats, skillKey)

	roll := rand.Intn(100) + 1
	threshold := evalThreshold(cfg.Threshold, attrValue, sv)
	if threshold == 0 {
		threshold = attrValue + sv
	}
	target := threshold + modifier
	outcome := evalOutcome(cfg, roll, target)

	skillLabel := resolveSkillLabel(template, skillKey)

	return &gsys.RollResult{
		DiceType:  100,
		RollType:  "skill",
		Roll:      roll,
		Target:    target,
		Outcome:   outcome,
		SkillKey:  skillKey,
		SkillName: skillLabel,
		Modifier:  modifier,
	}, nil
}

// rollFixedD20 implements a d20 + modifier roll.
func rollFixedD20(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	attrValue := stats.Attributes[linkedAttr].Current
	sv := skillValue(stats, skillKey)

	roll := rand.Intn(20) + 1
	bonus := attrModifier(attrValue) + sv + modifier
	finalRoll := roll + bonus

	threshold := evalThreshold(cfg.Threshold, attrValue, sv)
	outcome := evalOutcome(cfg, finalRoll, threshold)

	skillLabel := resolveSkillLabel(template, skillKey)

	return &gsys.RollResult{
		DiceType:   20,
		RollType:   "skill",
		Roll:       finalRoll,
		Target:     threshold,
		Outcome:    outcome,
		SkillKey:   skillKey,
		SkillName:  skillLabel,
		Modifier:   modifier,
		D20Roll:    roll,
		BonusTotal: bonus,
	}, nil
}

// skillValue returns the character's value for the given skill key.
func skillValue(stats *Stats, key string) int {
	return stats.Skills[key]
}

// attrModifier converts a raw attribute value to a D&D-style modifier (attr-10)/2.
func attrModifier(attr int) int {
	return (attr - 10) / 2
}

// evalThreshold parses a simple threshold expression and returns its integer value.
// Supported tokens: "skill" (skill value), "attr" (attribute value), integer literals,
// operators: *, +, -.
func evalThreshold(expr string, attrValue, skillVal int) int {
	if expr == "" {
		return 0
	}
	expr = strings.TrimSpace(expr)
	expr = strings.ReplaceAll(expr, "skill", strconv.Itoa(skillVal))
	expr = strings.ReplaceAll(expr, "attr", strconv.Itoa(attrValue))

	// Simple left-to-right evaluation: handles "14*5", "16+4", "20-2"
	for _, op := range []string{"*", "+", "-"} {
		parts := strings.SplitN(expr, op, 2)
		if len(parts) != 2 {
			continue
		}
		a, errA := strconv.Atoi(strings.TrimSpace(parts[0]))
		b, errB := strconv.Atoi(strings.TrimSpace(parts[1]))
		if errA != nil || errB != nil {
			continue
		}
		switch op {
		case "*":
			return a * b
		case "+":
			return a + b
		case "-":
			return a - b
		}
	}

	v, _ := strconv.Atoi(expr)
	return v
}

// evalOutcome determines the outcome string from roll, threshold and config.
func evalOutcome(cfg *models.RollConfig, roll, threshold int) string {
	if cfg.SuccessType == "raw" || threshold == 0 {
		return fmt.Sprintf("%d", roll)
	}

	var success bool
	switch cfg.SuccessType {
	case "below_threshold":
		success = roll <= threshold
	default: // "above_threshold"
		success = roll >= threshold
	}

	if cfg.CritFail && roll <= 1 {
		return "fumble"
	}
	if cfg.CritSuccess && success {
		var critThreshold int
		if cfg.SuccessType == "below_threshold" {
			critThreshold = threshold / 5
		} else {
			critThreshold = threshold * 2
		}
		if (cfg.SuccessType == "below_threshold" && roll <= critThreshold) ||
			(cfg.SuccessType != "below_threshold" && roll >= critThreshold) {
			return "critical_success"
		}
	}

	if success {
		return "regular_success"
	}
	return "failure"
}

// resolveSkillLabel walks all section fields to find the human-readable label for a skill key.
func resolveSkillLabel(template *models.SystemTemplate, skillKey string) string {
	for _, section := range template.Sections {
		for _, field := range section.Fields {
			if field.Key == skillKey {
				return field.Label
			}
			if field.Type == "skill_tree" && field.Tree != nil {
				if label, ok := findLeafLabel(field.Tree, skillKey, ""); ok {
					return label
				}
			}
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
