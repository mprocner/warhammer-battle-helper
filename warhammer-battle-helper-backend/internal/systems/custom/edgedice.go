package custom

import "strconv"

// edgeRoll is one evaluated traditional roll plus, for edge/setback dice, every candidate.
type edgeRoll struct {
	result, diceType   int
	labelStr, valueStr string
	all                []int
}

// lowerIsBetter reads which way edge dice push from the field's own success rule, so the GM
// never configures a direction that could disagree with it. "raw" never gets here
// (resolveEdgeDice drops it); an empty successType is roll-over, as in evalOutcome.
func lowerIsBetter(successType string) bool {
	return successType == "below_threshold"
}

// pickIndex returns the index of the kept candidate: the better one for edge dice (diceMod > 0),
// the worse one for setback dice. Ties keep the earliest roll.
func pickIndex(rolls []int, diceMod int, lowerBetter bool) int {
	wantLow := (diceMod > 0) == lowerBetter
	kept := 0
	for i := 1; i < len(rolls); i++ {
		if (wantLow && rolls[i] < rolls[kept]) || (!wantLow && rolls[i] > rolls[kept]) {
			kept = i
		}
	}
	return kept
}

// rollEdgeTens is the d100 tens-die mechanic: one d100, then one new tens digit per extra die
// with the units kept. 00 with units 0 is 100, the same face a plain d100 reads as 100.
func (p *Plugin) rollEdgeTens(diceMod int, lowerBetter bool) edgeRoll {
	main := p.rng.Intn(100) + 1
	units := main % 10
	all := []int{main}
	for i := 0; i < absInt(diceMod); i++ {
		alt := p.rng.Intn(10)*10 + units
		if alt == 0 {
			alt = 100
		}
		all = append(all, alt)
	}
	kept := all[pickIndex(all, diceMod, lowerBetter)]
	return edgeRoll{result: kept, diceType: 100, labelStr: "d100", valueStr: strconv.Itoa(kept), all: all}
}

// rollEdgeFormula evaluates the whole formula once plus once per extra die and keeps one. The
// kept roll's own label and values become the breakdown, so the log never mixes two rolls.
func rollEdgeFormula(diceMod int, lowerBetter bool, eval func() (int, int, string, string, error)) (edgeRoll, error) {
	n := 1 + absInt(diceMod)
	cands := make([]edgeRoll, 0, n)
	all := make([]int, 0, n)
	for i := 0; i < n; i++ {
		r, dt, l, v, err := eval()
		if err != nil {
			return edgeRoll{}, err
		}
		cands = append(cands, edgeRoll{result: r, diceType: dt, labelStr: l, valueStr: v})
		all = append(all, r)
	}
	kept := cands[pickIndex(all, diceMod, lowerBetter)]
	kept.all = all
	return kept, nil
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
