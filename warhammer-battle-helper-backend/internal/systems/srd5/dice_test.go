package srd5

import (
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"
)

// The 3D dice replay reads res.Dice, the log reads D20Roll/DamageRoll; they must agree.

func TestRollWithAdvantage_DropsTheOtherDie(t *testing.T) {
	cases := []struct {
		name    string
		diceMod int
		vals    []int
		want    []gsys.RolledDie
	}{
		{"normal", 0, []int{11}, []gsys.RolledDie{{Sides: 20, Value: 12}}},
		{"advantage second higher", 1, []int{4, 16}, []gsys.RolledDie{{Sides: 20, Value: 5, Dropped: true}, {Sides: 20, Value: 17}}},
		{"advantage tie keeps first", 1, []int{9, 9}, []gsys.RolledDie{{Sides: 20, Value: 10}, {Sides: 20, Value: 10, Dropped: true}}},
		{"disadvantage second lower", -1, []int{16, 4}, []gsys.RolledDie{{Sides: 20, Value: 17, Dropped: true}, {Sides: 20, Value: 5}}},
		{"disadvantage first lower", -1, []int{4, 16}, []gsys.RolledDie{{Sides: 20, Value: 5}, {Sides: 20, Value: 17, Dropped: true}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			final, _, dice := newTestPlugin(c.vals...).rollWithAdvantage(c.diceMod)
			if !reflect.DeepEqual(dice, c.want) {
				t.Errorf("dice = %+v, want %+v", dice, c.want)
			}
			if got := gsys.DiceTotal(dice, ""); got != final {
				t.Errorf("dice total %d, final %d", got, final)
			}
		})
	}
}

func TestRollWeapon_CritDamageDiceDoubled(t *testing.T) {
	stats := Stats{
		Info:      CharacterInfo{Level: 1},
		Abilities: Abilities{STR: 16}, // mod 3
		Weapons:   []Weapon{{Name: "Axe", Proficient: true}},
	}
	// d20 natural 20, then 2 × 1d8 for the crit: 6 and 2.
	p := newTestPlugin(19, 5, 1)
	res, err := p.RollWeapon(toRaw(t, stats), "Axe", "str", "1d8", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.D20Roll {
		t.Errorf("attack dice total %d, D20Roll %d", got, res.D20Roll)
	}
	if got := gsys.DiceTotal(res.Dice, gsys.DiceGroupDamage); got != res.DamageRoll-3 {
		t.Errorf("damage dice total %d, want DamageRoll %d minus ability 3", got, res.DamageRoll)
	}
	if n := len(res.Dice); n != 3 {
		t.Errorf("len(Dice) = %d, want 3 (d20 + 2d8)", n)
	}
}

func TestRollWeapon_MissRollsNoDamageDice(t *testing.T) {
	stats := Stats{Info: CharacterInfo{Level: 1}, Abilities: Abilities{STR: 10}}
	// Natural 2 against AC 30: miss, damage not rolled.
	p := newTestPlugin(1)
	res, err := p.RollWeapon(toRaw(t, stats), "Axe", "str", "1d8", 30, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if len(res.Dice) != 1 {
		t.Errorf("Dice = %+v, want only the d20", res.Dice)
	}
}
