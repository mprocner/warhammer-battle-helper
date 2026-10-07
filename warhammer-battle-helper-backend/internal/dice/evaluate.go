package dice

import "sort"

// Roller is the domain's source of randomness. systems.DefaultRoller() satisfies it
// structurally, so this package does not import the systems package.
type Roller interface {
	Intn(n int) int
}

type Mode string

const (
	ModeSum  Mode = "sum"
	ModePool Mode = "pool"
)

// Outcome is the full, explainable result of one evaluated expression.
type Outcome struct {
	Canonical string
	Mode      Mode
	Terms     []TermOutcome
	Total     int // sum, or the success count in pool mode
	Check     *CheckOutcome
}

// TermOutcome mirrors one Term. Spec == nil means a constant; Subtotal then holds it.
type TermOutcome struct {
	Sign     int
	Spec     *DiceSpec
	Dice     []Die
	Subtotal int // kept-dice sum, success count, or the constant — always unsigned
}

type Die struct {
	Value   int
	Kept    bool // false = dropped by kh/kl
	Success bool // pool mode only
}

type CheckOutcome struct {
	Target  int
	Success bool
}

// Evaluate rolls a validated expression. It cannot fail: Parse already rejected
// everything Evaluate would not know how to handle.
func Evaluate(expr Expression, rng Roller) Outcome {
	out := Outcome{Canonical: expr.String(), Mode: ModeSum}
	if expr.IsPool() {
		out.Mode = ModePool
	}

	for _, t := range expr.Terms {
		to := TermOutcome{Sign: t.Sign}
		if t.Dice == nil {
			to.Subtotal = t.Constant
		} else {
			to.Spec = t.Dice
			to.Dice = rollDice(t.Dice, rng)
			to.Subtotal = subtotal(to.Dice, t.Dice)
		}
		out.Total += t.Sign * to.Subtotal
		out.Terms = append(out.Terms, to)
	}

	if out.Mode == ModePool && out.Total < 0 {
		out.Total = 0
	}
	if expr.Check != nil {
		out.Check = &CheckOutcome{Target: expr.Check.Target, Success: out.Total <= expr.Check.Target}
	}
	return out
}

func rollDice(spec *DiceSpec, rng Roller) []Die {
	dice := make([]Die, spec.Count)
	for i := range dice {
		dice[i] = Die{Value: rng.Intn(spec.Sides) + 1, Kept: true}
	}
	if spec.Keep != nil {
		applyKeep(dice, *spec.Keep)
	}
	if spec.Threshold != nil {
		for i := range dice {
			dice[i].Success = dice[i].Value >= *spec.Threshold
		}
	}
	return dice
}

// applyKeep marks all but the best k.Count dice as dropped. The stable sort keeps
// equal values in roll order, so on a tie the earlier die survives.
func applyKeep(dice []Die, k Keep) {
	order := make([]int, len(dice))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool {
		va, vb := dice[order[a]].Value, dice[order[b]].Value
		if k.Highest {
			return va > vb
		}
		return va < vb
	})
	for i := range dice {
		dice[i].Kept = false
	}
	for _, idx := range order[:k.Count] {
		dice[idx].Kept = true
	}
}

func subtotal(dice []Die, spec *DiceSpec) int {
	n := 0
	for _, d := range dice {
		switch {
		case spec.Threshold != nil:
			if d.Success {
				n++
			}
		case d.Kept:
			n += d.Value
		}
	}
	return n
}
