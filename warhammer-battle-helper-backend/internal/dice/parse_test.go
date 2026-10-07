package dice

import (
	"errors"
	"strings"
	"testing"
)

func TestParse_ValidExpressions(t *testing.T) {
	cases := []struct {
		input     string
		canonical string
		pool      bool
	}{
		{"d10", "1d10", false},
		{"3d100", "3d100", false},
		{"d100 -1", "1d100-1", false},
		{"d100-1", "1d100-1", false},
		{"2d6 + 1d4 + 3", "2d6+1d4+3", false},
		{"4d6kh3", "4d6kh3", false},
		{"2D20KL1", "2d20kl1", false},
		{"6d10>=7", "6d10>=7", true},
		{"6d10>=7+1", "6d10>=7+1", true},
		{"d100-10 vs 45", "1d100-10 vs 45", false},
		{"  1d6  ", "1d6", false},
		{"d6+0", "1d6+0", false},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			expr, err := Parse(tc.input, DefaultLimits())
			if err != nil {
				t.Fatalf("Parse(%q) error: %v", tc.input, err)
			}
			if got := expr.String(); got != tc.canonical {
				t.Errorf("String() = %q, want %q", got, tc.canonical)
			}
			if got := expr.IsPool(); got != tc.pool {
				t.Errorf("IsPool() = %v, want %v", got, tc.pool)
			}
		})
	}
}

func TestParse_Errors(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		code     string
		position int
		params   map[string]int
	}{
		{"empty", "", CodeEmpty, -1, nil},
		{"blank", "   ", CodeEmpty, -1, nil},
		{"too long", strings.Repeat(" ", 99) + "d6", CodeTooLong, -1, map[string]int{"max": 100}},
		{"bare d", "d", CodeUnexpectedEnd, 1, nil},
		{"keep without count", "2d6kh", CodeUnexpectedEnd, 5, nil},
		{"vs without target", "d6 vs", CodeUnexpectedEnd, 5, nil},
		{"unknown character", "2x6", CodeUnexpectedToken, 1, nil},
		{"leading sign", "-2+d6", CodeUnexpectedToken, 0, nil},
		{"term after check", "d6 vs 10 + 2", CodeUnexpectedToken, 9, nil},
		{"missing operator", "2d6 3", CodeUnexpectedToken, 4, nil},
		{"broken keep", "2d6kx1", CodeUnexpectedToken, 3, nil},
		{"lone greater-than", "d6>4", CodeUnexpectedToken, 2, nil},
		{"constant only", "5", CodeNoDice, -1, nil},
		{"pool plus dice", "d6>=4+d6", CodePoolMixed, 0, nil},
		{"subtracted pool", "10-d6>=4", CodePoolMixed, 3, nil},
		{"pool with check", "d6>=4 vs 2", CodePoolWithCheck, 6, nil},
		{"keep too many", "3d6kh4", CodeKeepOutOfRange, 0, map[string]int{"max": 3}},
		{"keep zero", "3d6kh0", CodeKeepOutOfRange, 0, map[string]int{"max": 3}},
		{"threshold above sides", "d6>=7", CodeThresholdOutOfRange, 0, map[string]int{"max": 6}},
		{"one-sided die", "d1", CodeSidesOutOfRange, 0, map[string]int{"min": 2, "max": 1000}},
		{"huge die", "d1001", CodeSidesOutOfRange, 0, map[string]int{"min": 2, "max": 1000}},
		{"overflowing number", "d99999999999999999999", CodeSidesOutOfRange, 0, map[string]int{"min": 2, "max": 1000}},
		{"too many in term", "21d6", CodeCountOutOfRange, 0, map[string]int{"max": 20}},
		{"zero dice", "0d6", CodeCountOutOfRange, 0, map[string]int{"max": 20}},
		{"too many dice", "20d6+20d6+11d6", CodeTooManyDice, -1, map[string]int{"max": 50}},
		{"too many terms", "d2+1+1+1+1+1+1+1+1+1+1", CodeTooManyTerms, -1, map[string]int{"max": 10}},
		{"constant too big", "d6+1001", CodeNumberOutOfRange, 3, map[string]int{"max": 1000}},
		{"target too big", "d6 vs 10001", CodeNumberOutOfRange, 3, map[string]int{"max": 10000}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse(tc.input, DefaultLimits())
			var de *Error
			if !errors.As(err, &de) {
				t.Fatalf("Parse(%q) error = %v, want *dice.Error", tc.input, err)
			}
			if de.Code != tc.code || de.Position != tc.position {
				t.Errorf("got (%s, %d), want (%s, %d)", de.Code, de.Position, tc.code, tc.position)
			}
			for k, v := range tc.params {
				if de.Params[k] != v {
					t.Errorf("Params[%q] = %d, want %d", k, de.Params[k], v)
				}
			}
		})
	}
}
