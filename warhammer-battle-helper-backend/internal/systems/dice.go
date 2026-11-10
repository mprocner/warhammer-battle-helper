package systems

// RolledDie is one physical die the server rolled, in the shape the client's 3D dice replay
// (PLAYRPG-339). The list on a roll is the single source the animation reads, so it must
// add up to the logged result: every system builds it where it calls the roller, never
// reconstructs it from display strings.
//
// A d100 is two dice — a tens die (Sides 100, Value 0–90) and a units die (Sides 10,
// Value 0–9) — with 00 + 0 reading as 100. Use Faces or PercentileDice to build them.
type RolledDie struct {
	Sides int `json:"sides" bson:"sides"`
	Value int `json:"value" bson:"value"`
	// Dropped marks a die rolled but not counted: the losing d20 of advantage, a discarded
	// bonus/penalty tens die, a kh/kl reject. The zero value is the common case on purpose —
	// a call site that forgets the flag shows a counted die, not a silently dropped one.
	Dropped bool `json:"dropped,omitempty" bson:"dropped,omitempty"`
	// Group separates rolls the client replays one after another; "" is the main roll.
	Group string `json:"group,omitempty" bson:"group,omitempty"`
}

// DiceGroupDamage tags the damage roll of a weapon attack.
const DiceGroupDamage = "damage"

// Faces returns the dice behind one rolled value: a d100 result (1–100) splits into its tens
// and units dice, any other die is itself.
func Faces(sides, value int, group string) []RolledDie {
	if sides == 100 {
		return PercentileDice([]int{value}, 0, group)
	}
	return []RolledDie{{Sides: sides, Value: value, Group: group}}
}

// PercentileDice returns the dice of a d100 roll with bonus/penalty (edge) tens dice:
// candidates share one units die and differ only in their tens, as CoC 7e rolls them.
// Every candidate contributes a tens die; all but candidates[kept] are Dropped.
func PercentileDice(candidates []int, kept int, group string) []RolledDie {
	dice := make([]RolledDie, 0, len(candidates)+1)
	for i, c := range candidates {
		dice = append(dice, RolledDie{Sides: 100, Value: c % 100 / 10 * 10, Dropped: i != kept, Group: group})
	}
	return append(dice, RolledDie{Sides: 10, Value: candidates[0] % 10, Group: group})
}

// DiceTotal adds up the counted dice of one group the way a table reads them: a kept tens
// die and a units die both showing 0 make 100. It assumes at most one percentile pair per
// group, which holds for every roll the systems produce.
func DiceTotal(dice []RolledDie, group string) int {
	total := 0
	tensZero, unitsZero := false, false
	for _, d := range dice {
		if d.Group != group || d.Dropped {
			continue
		}
		total += d.Value
		if d.Sides == 100 && d.Value == 0 {
			tensZero = true
		}
		if d.Sides == 10 && d.Value == 0 {
			unitsZero = true
		}
	}
	if tensZero && unitsZero {
		total += 100
	}
	return total
}
