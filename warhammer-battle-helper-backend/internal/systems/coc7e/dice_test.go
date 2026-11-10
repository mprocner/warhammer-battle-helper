package coc7e

import (
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"
)

// The 3D dice replay reads res.Dice, the log reads Roll/DamageRoll; they must agree.

func TestRollSkill_TwoPenaltyDice(t *testing.T) {
	// main 23 (units 3); penalty tens 8 -> 83, 0 -> 03. Highest 83 kept.
	p := newTestPlugin(22, 8, 0)
	stats := Stats{Skills: map[string]int{"spot_hidden": 50}}
	res, err := p.RollSkill(toRaw(t, stats), "spot_hidden", 0, -2, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	want := []gsys.RolledDie{
		{Sides: 100, Value: 20, Dropped: true},
		{Sides: 100, Value: 80},
		{Sides: 100, Value: 0, Dropped: true},
		{Sides: 10, Value: 3},
	}
	if !reflect.DeepEqual(res.Dice, want) {
		t.Errorf("Dice = %+v, want %+v", res.Dice, want)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll {
		t.Errorf("dice total %d, Roll %d", got, res.Roll)
	}
}

func TestRollSkill_PenaltyDieMakesHundred(t *testing.T) {
	// main 30 (units 0); penalty tens 0 -> 00+0 = 100, kept.
	p := newTestPlugin(29, 0)
	stats := Stats{Skills: map[string]int{"spot_hidden": 50}}
	res, err := p.RollSkill(toRaw(t, stats), "spot_hidden", 0, -1, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Roll != 100 {
		t.Fatalf("Roll = %d, want 100", res.Roll)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != 100 {
		t.Errorf("dice total %d, want 100 (%+v)", got, res.Dice)
	}
}

func TestRollSkill_BonusDieTieKeepsOneTens(t *testing.T) {
	// main 45; bonus tens 4 -> 45 again. Exactly one tens die may count.
	p := newTestPlugin(44, 4)
	stats := Stats{Skills: map[string]int{"spot_hidden": 50}}
	res, err := p.RollSkill(toRaw(t, stats), "spot_hidden", 0, 1, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != 45 {
		t.Errorf("dice total %d, want 45 (%+v)", got, res.Dice)
	}
}

func TestRollWeapon_DamageAndBonusDice(t *testing.T) {
	// Hit 30; damage "1d4+db" with db "+1d6": 1d4 -> 3, 1d6 -> 5. Damage 8.
	stats := Stats{
		Skills: map[string]int{"fighting_brawl": 50},
		Combat: Combat{DamageBonus: "+1d6"},
	}
	p := newTestPlugin(29, 2, 4)
	res, err := p.RollWeapon(toRaw(t, stats), "Club", "fighting_brawl", "1d4+db", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll {
		t.Errorf("hit dice total %d, Roll %d", got, res.Roll)
	}
	if got := gsys.DiceTotal(res.Dice, gsys.DiceGroupDamage); got != res.DamageRoll {
		t.Errorf("damage dice total %d, DamageRoll %d (%+v)", got, res.DamageRoll, res.Dice)
	}
}
