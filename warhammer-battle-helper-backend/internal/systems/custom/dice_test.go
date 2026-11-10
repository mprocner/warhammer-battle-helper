package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"
)

// The 3D dice replay reads res.Dice, the log reads Roll/DamageRoll/PoolFormula; they must agree.

func TestDice_SumModeMatchesFormula(t *testing.T) {
	// 2d6 + 3: dice 4 and 6 -> 13.
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{
		numBlock(2), opBlock("d"), diceBlock("d6"), opBlock("+"), numBlock(3),
	}, SuccessType: "raw"}
	p := newTestPlugin(3, 5)
	res, err := p.rollFromFormula(sampleStats(), &models.SystemTemplate{}, "atk", "str", false, cfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	want := []gsys.RolledDie{{Sides: 6, Value: 4}, {Sides: 6, Value: 6}}
	if !reflect.DeepEqual(res.Dice, want) {
		t.Errorf("Dice = %+v, want %+v (roll %d, %q)", res.Dice, want, res.Roll, res.FormulaBreakdown)
	}
}

func TestDice_D100BlockSplits(t *testing.T) {
	p := newTestPlugin(99) // d100 -> 100
	res, err := p.rollFromFormula(sampleStats(), &models.SystemTemplate{}, "atk", "str", false, d100Below("50"), 0)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll || res.Roll != 100 {
		t.Errorf("dice total %d, Roll %d (%+v)", got, res.Roll, res.Dice)
	}
}

func TestDice_EdgeTensDropsLosingCandidates(t *testing.T) {
	// main 47, edge tens 5 -> 57, 1 -> 17; roll-under edge keeps 17.
	p := newTestPlugin(46, 5, 1)
	res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeTens, 2, 2), "atk", "str", false, d100Below("55"), 2)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	want := []gsys.RolledDie{
		{Sides: 100, Value: 40, Dropped: true},
		{Sides: 100, Value: 50, Dropped: true},
		{Sides: 100, Value: 10},
		{Sides: 10, Value: 7},
	}
	if !reflect.DeepEqual(res.Dice, want) {
		t.Errorf("Dice = %+v, want %+v", res.Dice, want)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll {
		t.Errorf("dice total %d, Roll %d", got, res.Roll)
	}
}

func TestDice_EdgeFormulaDropsLosingRoll(t *testing.T) {
	d20Above := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, SuccessType: "above_threshold", Threshold: "10"}
	p := newTestPlugin(4, 14) // 5, then 15 kept
	res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, d20Above, 1)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	want := []gsys.RolledDie{{Sides: 20, Value: 5, Dropped: true}, {Sides: 20, Value: 15}}
	if !reflect.DeepEqual(res.Dice, want) {
		t.Errorf("Dice = %+v, want %+v", res.Dice, want)
	}
}

func TestDice_PoolModeOneDiePerRoll(t *testing.T) {
	cfg := &models.RollConfig{
		RollMode:             "dice_pool",
		Formula:              []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6"), opBlock("+"), diceBlock("d10")},
		PoolSuccessThreshold: 5,
	}
	p := newTestPlugin(3, 5, 0, 8) // d6: 4, 6, 1; d10: 9
	res, err := p.rollFromFormula(sampleStats(), &models.SystemTemplate{}, "atk", "str", false, cfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	var fromParts []gsys.RolledDie
	for _, part := range res.PoolFormula {
		for _, r := range part.Rolls {
			fromParts = append(fromParts, gsys.RolledDie{Sides: part.Sides, Value: r})
		}
	}
	if !reflect.DeepEqual(res.Dice, fromParts) {
		t.Errorf("Dice = %+v, want %+v", res.Dice, fromParts)
	}
}

func TestDice_WeaponDamageGroup(t *testing.T) {
	template, raw := weaponTemplate()
	template.Sections[0].Fields[0].RollConfig.SuccessType = "above_threshold"
	template.Sections[0].Fields[0].RollConfig.Threshold = "10"

	// attack d20 -> 10 (success); damage 2d6: 4, 6, + STR 8 => 18.
	p := newTestPlugin(9, 3, 5)
	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "w1", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if got := gsys.DiceTotal(res.Dice, ""); got != res.Roll {
		t.Errorf("attack dice total %d, Roll %d", got, res.Roll)
	}
	if got := gsys.DiceTotal(res.Dice, gsys.DiceGroupDamage); got != res.DamageRoll-8 {
		t.Errorf("damage dice total %d, want DamageRoll %d minus STR 8 (%+v)", got, res.DamageRoll, res.Dice)
	}
}
