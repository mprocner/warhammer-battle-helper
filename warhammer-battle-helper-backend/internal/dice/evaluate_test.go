package dice

import "testing"

// seqRoller returns the given face values in order. Intn returns value-1 because
// Evaluate adds 1 to turn Intn's [0, n) into a die face [1, n].
type seqRoller struct {
	t      *testing.T
	values []int
	i      int
}

func (r *seqRoller) Intn(n int) int {
	r.t.Helper()
	if r.i >= len(r.values) {
		r.t.Fatalf("roller exhausted after %d values", len(r.values))
	}
	v := r.values[r.i]
	r.i++
	if v < 1 || v > n {
		r.t.Fatalf("value %d does not fit a d%d", v, n)
	}
	return v - 1
}

func mustEvaluate(t *testing.T, input string, values ...int) Outcome {
	t.Helper()
	expr, err := Parse(input, DefaultLimits())
	if err != nil {
		t.Fatalf("Parse(%q): %v", input, err)
	}
	return Evaluate(expr, &seqRoller{t: t, values: values})
}

func keptFlags(dice []Die) []bool {
	out := make([]bool, len(dice))
	for i, d := range dice {
		out[i] = d.Kept
	}
	return out
}

func equalBools(a, b []bool) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestEvaluate_SumOfMixedTerms(t *testing.T) {
	o := mustEvaluate(t, "2d6 + 1d4 - 1", 4, 2, 3)

	if o.Mode != ModeSum || o.Total != 8 || o.Canonical != "2d6+1d4-1" {
		t.Fatalf("got mode=%s total=%d canonical=%q", o.Mode, o.Total, o.Canonical)
	}
	if len(o.Terms) != 3 {
		t.Fatalf("want 3 terms, got %d", len(o.Terms))
	}
	if o.Terms[0].Subtotal != 6 || o.Terms[1].Subtotal != 3 || o.Terms[2].Subtotal != 1 {
		t.Errorf("subtotals = %d,%d,%d", o.Terms[0].Subtotal, o.Terms[1].Subtotal, o.Terms[2].Subtotal)
	}
	if o.Terms[2].Spec != nil || o.Terms[2].Sign != -1 {
		t.Errorf("third term should be the constant -1")
	}
	if o.Check != nil {
		t.Errorf("no vs in input, Check should be nil")
	}
}

func TestEvaluate_Keep(t *testing.T) {
	cases := []struct {
		name   string
		input  string
		values []int
		kept   []bool
		total  int
	}{
		{"keep highest", "4d6kh3", []int{3, 6, 1, 5}, []bool{true, true, false, true}, 14},
		{"keep lowest", "2d20kl1", []int{17, 4}, []bool{false, true}, 4},
		{"tie keeps earlier (low)", "3d6kl1", []int{2, 2, 5}, []bool{true, false, false}, 2},
		{"tie keeps earlier (high)", "3d6kh2", []int{5, 5, 5}, []bool{true, true, false}, 10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			o := mustEvaluate(t, tc.input, tc.values...)
			if got := keptFlags(o.Terms[0].Dice); !equalBools(got, tc.kept) {
				t.Errorf("kept = %v, want %v", got, tc.kept)
			}
			if o.Total != tc.total {
				t.Errorf("total = %d, want %d", o.Total, tc.total)
			}
		})
	}
}

func TestEvaluate_Pool(t *testing.T) {
	o := mustEvaluate(t, "5d10>=7+1", 7, 3, 10, 6, 8)

	if o.Mode != ModePool {
		t.Fatalf("mode = %s, want pool", o.Mode)
	}
	wantSuccess := []bool{true, false, true, false, true}
	for i, d := range o.Terms[0].Dice {
		if d.Success != wantSuccess[i] {
			t.Errorf("die %d success = %v, want %v", i, d.Success, wantSuccess[i])
		}
	}
	if o.Terms[0].Subtotal != 3 || o.Total != 4 {
		t.Errorf("subtotal=%d total=%d, want 3 and 4", o.Terms[0].Subtotal, o.Total)
	}
}

func TestEvaluate_PoolClampsAtZero(t *testing.T) {
	o := mustEvaluate(t, "2d10>=7-3", 1, 2)
	if o.Total != 0 {
		t.Errorf("total = %d, want 0", o.Total)
	}
}

func TestEvaluate_CheckIsInclusive(t *testing.T) {
	pass := mustEvaluate(t, "d100-10 vs 45", 55)
	if pass.Check == nil || !pass.Check.Success || pass.Check.Target != 45 || pass.Total != 45 {
		t.Errorf("55-10=45 vs 45 should succeed, got %+v total=%d", pass.Check, pass.Total)
	}
	fail := mustEvaluate(t, "d100-10 vs 45", 56)
	if fail.Check == nil || fail.Check.Success {
		t.Errorf("56-10=46 vs 45 should fail, got %+v", fail.Check)
	}
}
