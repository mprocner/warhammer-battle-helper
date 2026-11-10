package warhammer4e

import (
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"
)

// The 3D dice replay reads res.Dice, the log reads Roll/DamageRoll; they must agree.

func TestRollSkill_DiceMatchRoll(t *testing.T) {
	for _, raw := range []int{0, 8, 46, 99} { // rolls 1, 9, 47, 100
		p := newTestPlugin(raw)
		res, err := p.RollSkill(toRaw(t, withCurrent(CharacteristicRow{WS: 40})), "attr_WS", 0, 0, 0)
		if err != nil {
			t.Fatalf("RollSkill() error: %v", err)
		}
		if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll {
			t.Errorf("roll %d: dice total %d (%+v)", res.Roll, got, res.Dice)
		}
	}
}

func TestRollSkill_HundredIsDoubleZero(t *testing.T) {
	p := newTestPlugin(99)
	res, err := p.RollSkill(toRaw(t, withCurrent(CharacteristicRow{WS: 40})), "attr_WS", 0, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	want := []gsys.RolledDie{{Sides: 100, Value: 0}, {Sides: 10, Value: 0}}
	if !reflect.DeepEqual(res.Dice, want) {
		t.Errorf("Dice = %+v, want %+v", res.Dice, want)
	}
}

func TestRollWeapon_DamageDiceInOwnGroup(t *testing.T) {
	// Hit 20, damage 2d6+3 with dice 4 and 5 -> 12.
	p := newTestPlugin(19, 3, 4)
	res, err := p.RollWeapon(toRaw(t, withCurrent(CharacteristicRow{WS: 45})), "Axe", "MELEE_BASIC", "2d6+3", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll {
		t.Errorf("hit dice total %d, Roll %d", got, res.Roll)
	}
	if got := gsys.DiceTotal(res.Dice, gsys.DiceGroupDamage); got != res.DamageRoll-3 {
		t.Errorf("damage dice total %d, want DamageRoll %d minus flat 3", got, res.DamageRoll)
	}
	if n := len(res.Dice); n != 4 {
		t.Errorf("len(Dice) = %d, want 4 (tens, units, 2 damage)", n)
	}
}

func TestRollWeapon_FlatDamageAddsNoDice(t *testing.T) {
	p := newTestPlugin(19)
	res, err := p.RollWeapon(toRaw(t, withCurrent(CharacteristicRow{WS: 45})), "Sword", "MELEE_BASIC", "+4", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, gsys.DiceGroupDamage); got != 0 {
		t.Errorf("flat damage produced dice: %+v", res.Dice)
	}
}
