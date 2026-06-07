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
	if cfg.RollMode == "dice_pool" {
		return rollFromFormulaDicePool(stats, template, skillKey, linkedAttr, cfg, modifier)
	}

	fmt.Println("[ROLL] Rolling from formula ")
	result, diceType, labelStr, valueStr, err := evalFormula(cfg.Formula, stats, skillKey, linkedAttr)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval: %w", err)
	}
	fmt.Printf("[ROLL] result=%v\n", result)
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
	fmt.Printf("[ROLL] Attribute value: %v, linked: %v", attrValue, linkedAttr)
	sv := skillValue(stats, skillKey)
	threshold := evalThreshold(cfg.Threshold)
	fmt.Printf("[ROLL] Threshold eval: %v, skill: %v, attribute: %v", threshold, sv, attrValue)
	if threshold == 0 {
		if sv > 0 {
			threshold = sv
		} else {
			threshold = attrValue
		}
	}
	fmt.Println("[ROLL] Final threshold:", threshold)
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
				total, rollParts := evalDicePool(count, func() int { return rand.Intn(sides) + 1 })
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, fmt.Sprintf("%s%s", countLabel, b.Value))
				valueParts = append(valueParts, strings.Join(rollParts, "+"))
			} else {
				rolled := rand.Intn(sides) + 1
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
				total, rollParts := evalDicePool(count, func() int { return rand.Intn(sides) + 1 })
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, fmt.Sprintf("%sd(%s)", countLabel, lbl))
				valueParts = append(valueParts, strings.Join(rollParts, "+"))
			} else {
				rolled := rand.Intn(sides) + 1
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, "d("+lbl+")")
				valueParts = append(valueParts, strconv.Itoa(rolled))
			}
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
				total, rollParts := evalDicePool(count, func() int { return rand.Intn(sides) + 1 })
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, countLabel+diceLabel)
				valueParts = append(valueParts, strings.Join(rollParts, "+"))
			} else {
				rolled := rand.Intn(sides) + 1
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
func rollFromFormulaDicePool(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	allRolls, diceType, labelStr, err := evalFormulaDicePool(cfg.Formula, stats, skillKey, linkedAttr)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval (pool): %w", err)
	}

	threshold := cfg.PoolSuccessThreshold
	condition := cfg.PoolSuccessCondition
	if condition == "" {
		condition = "gte"
	}

	successes := 0
	for _, r := range allRolls {
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

	outcome := "failure"
	if successes > 0 {
		outcome = "regular_success"
	}

	skillLabel := resolveSkillLabel(template, skillKey)

	return &gsys.RollResult{
		DiceType:             diceType,
		RollType:             "skill",
		Roll:                 successes,
		Target:               threshold,
		Outcome:              outcome,
		SkillKey:             skillKey,
		SkillName:            skillLabel,
		Modifier:             modifier,
		PoolRolls:            allRolls,
		PoolSuccesses:        successes,
		PoolSuccessCondition: condition,
		FormulaBreakdown:     labelStr,
	}, nil
}

// evalFormulaDicePool evaluates the formula for dice-pool mode.
// Returns all individual dice results, die type, and a display label string.
// For "d" operations it collects individual dice; arithmetic ops still work as die-count modifiers.
func evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string) (allRolls []int, diceType int, labelStr string, err error) {
	if len(blocks) == 0 {
		return nil, 0, "", fmt.Errorf("formula is empty")
	}

	type segment struct {
		op  string
		val int
	}

	var segments []segment
	var labelParts []string
	pendingOp := "+"

	for _, b := range blocks {
		switch b.Type {
		case "op":
			if b.Value != "d" {
				labelParts = append(labelParts, b.Value)
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
				rolls := evalDicePoolInts(count, func() int { return rand.Intn(sides) + 1 })
				allRolls = append(allRolls, rolls...)
				total := 0
				for _, r := range rolls {
					total += r
				}
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, fmt.Sprintf("%s%s", countLabel, b.Value))
			} else {
				rolled := rand.Intn(sides) + 1
				allRolls = append(allRolls, rolled)
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, b.Value)
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
				rolls := evalDicePoolInts(count, func() int { return rand.Intn(sides) + 1 })
				allRolls = append(allRolls, rolls...)
				total := 0
				for _, r := range rolls {
					total += r
				}
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, fmt.Sprintf("%sd(%s)", countLabel, lbl))
			} else {
				rolled := rand.Intn(sides) + 1
				allRolls = append(allRolls, rolled)
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, "d("+lbl+")")
			}
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
				rolls := evalDicePoolInts(count, func() int { return rand.Intn(sides) + 1 })
				allRolls = append(allRolls, rolls...)
				total := 0
				for _, r := range rolls {
					total += r
				}
				segments = append(segments, segment{op: prevOp, val: total})
				labelParts = append(labelParts, countLabel+diceLabel)
			} else {
				rolled := rand.Intn(sides) + 1
				allRolls = append(allRolls, rolled)
				segments = append(segments, segment{op: pendingOp, val: rolled})
				labelParts = append(labelParts, diceLabel)
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
			pendingOp = ""
		case "skill":
			sv := stats.Skills[skillKey]
			segments = append(segments, segment{op: pendingOp, val: sv})
			labelParts = append(labelParts, "umiej.")
			pendingOp = ""
		case "attr_linked":
			av := stats.Attributes[linkedAttr].Current
			segments = append(segments, segment{op: pendingOp, val: av})
			if linkedAttr == "" {
				labelParts = append(labelParts, "0")
			} else {
				labelParts = append(labelParts, linkedAttr)
			}
			pendingOp = ""
		case "const":
			v := 0
			if b.Num != nil {
				v = int(*b.Num)
			}
			segments = append(segments, segment{op: pendingOp, val: v})
			labelParts = append(labelParts, strconv.Itoa(v))
			pendingOp = ""
		}
	}

	return allRolls, diceType, strings.Join(labelParts, ""), nil
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

	threshold := evalThreshold(cfg.Threshold)
	if threshold == 0 {
		threshold = skillValue
	}
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
	threshold := evalThreshold(cfg.Threshold)
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

	threshold := evalThreshold(cfg.Threshold)
	if threshold == 0 {
		threshold = attrValue
	}
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
	fmt.Printf("[ROLL] Resolving skill value for key %v, stats: %v\n", key, stats.Skills)
	return stats.Skills[key]
}

// attrModifier converts a raw attribute value to a D&D-style modifier (attr-10)/2.
func attrModifier(attr int) int {
	return (attr - 10) / 2
}

// evalThreshold parses a numeric threshold override. Returns 0 if empty.
func evalThreshold(expr string) int {
	v, _ := strconv.Atoi(strings.TrimSpace(expr))
	return v
}

// evalOutcome determines the outcome string from roll and threshold.
func evalOutcome(cfg *models.RollConfig, roll, threshold int) string {
	if cfg.SuccessType == "raw" || threshold == 0 {
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
