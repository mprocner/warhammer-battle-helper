package systems

import (
	"reflect"
	"testing"
)

func TestFacesSplitsPercentile(t *testing.T) {
	cases := []struct {
		roll        int
		tens, units int
	}{
		{1, 0, 1},
		{9, 0, 9},
		{10, 10, 0},
		{47, 40, 7},
		{99, 90, 9},
		{100, 0, 0},
	}
	for _, c := range cases {
		got := Faces(100, c.roll, "")
		want := []RolledDie{{Sides: 100, Value: c.tens}, {Sides: 10, Value: c.units}}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("Faces(100, %d) = %+v, want %+v", c.roll, got, want)
		}
		if total := DiceTotal(got, ""); total != c.roll {
			t.Errorf("DiceTotal(Faces(100, %d)) = %d", c.roll, total)
		}
	}
}

func TestFacesPlainDie(t *testing.T) {
	got := Faces(10, 10, DiceGroupDamage)
	want := []RolledDie{{Sides: 10, Value: 10, Group: DiceGroupDamage}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Faces(10, 10) = %+v, want %+v", got, want)
	}
}

func TestPercentileDiceMarksOnlyKeptTens(t *testing.T) {
	// Two penalty dice: 23, 83, 03 — highest (83) kept.
	got := PercentileDice([]int{23, 83, 3}, 1, "")
	want := []RolledDie{
		{Sides: 100, Value: 20, Dropped: true},
		{Sides: 100, Value: 80},
		{Sides: 100, Value: 0, Dropped: true},
		{Sides: 10, Value: 3},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("PercentileDice = %+v, want %+v", got, want)
	}
	if total := DiceTotal(got, ""); total != 83 {
		t.Errorf("DiceTotal = %d, want 83", total)
	}
}

func TestPercentileDiceKeptHundred(t *testing.T) {
	// Penalty die turns 40 into 00+0 = 100 (fumble).
	got := PercentileDice([]int{40, 100}, 1, "")
	if total := DiceTotal(got, ""); total != 100 {
		t.Errorf("DiceTotal = %d, want 100 (%+v)", total, got)
	}
}

func TestDiceTotalSeparatesGroups(t *testing.T) {
	dice := append(Faces(100, 35, ""), Faces(6, 4, DiceGroupDamage)...)
	dice = append(dice, Faces(6, 2, DiceGroupDamage)...)
	if got := DiceTotal(dice, ""); got != 35 {
		t.Errorf("main total = %d, want 35", got)
	}
	if got := DiceTotal(dice, DiceGroupDamage); got != 6 {
		t.Errorf("damage total = %d, want 6", got)
	}
}
