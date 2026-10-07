package dice

import (
	"strconv"
	"strings"
)

// Expression is a parsed and validated dice expression, e.g. "2d6+1d4-1 vs 10".
type Expression struct {
	Terms []Term
	Check *Check // nil when there is no "vs"
}

// Term is one summand. Dice == nil means a constant term holding Constant.
type Term struct {
	Sign     int // +1 or -1
	Constant int
	Dice     *DiceSpec
	Position int // rune offset of the term in the input, used in error reports
}

// DiceSpec is "NdS" with at most one modifier: keep (kh/kl) or a success threshold (>=).
type DiceSpec struct {
	Count     int
	Sides     int
	Keep      *Keep
	Threshold *int // set = success pool, each die >= Threshold counts as one success
}

type Keep struct {
	Highest bool
	Count   int
}

// Check is the trailing "vs N": success when the total is at most Target.
type Check struct {
	Target   int
	Position int // rune offset of the "vs" keyword
}

// IsPool reports whether the expression counts successes instead of summing.
func (e Expression) IsPool() bool {
	for _, t := range e.Terms {
		if t.Dice != nil && t.Dice.Threshold != nil {
			return true
		}
	}
	return false
}

// String renders the canonical notation: explicit dice count, no spaces, lower case.
func (e Expression) String() string {
	var b strings.Builder
	for i, t := range e.Terms {
		if i > 0 {
			if t.Sign < 0 {
				b.WriteByte('-')
			} else {
				b.WriteByte('+')
			}
		}
		if t.Dice == nil {
			b.WriteString(strconv.Itoa(t.Constant))
			continue
		}
		d := t.Dice
		b.WriteString(strconv.Itoa(d.Count))
		b.WriteByte('d')
		b.WriteString(strconv.Itoa(d.Sides))
		if d.Keep != nil {
			if d.Keep.Highest {
				b.WriteString("kh")
			} else {
				b.WriteString("kl")
			}
			b.WriteString(strconv.Itoa(d.Keep.Count))
		}
		if d.Threshold != nil {
			b.WriteString(">=")
			b.WriteString(strconv.Itoa(*d.Threshold))
		}
	}
	if e.Check != nil {
		b.WriteString(" vs ")
		b.WriteString(strconv.Itoa(e.Check.Target))
	}
	return b.String()
}
