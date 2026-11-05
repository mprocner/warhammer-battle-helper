package custom

import (
	"battle-helper/internal/models"
	"reflect"
	"strings"
	"testing"
)

func tmplWithDice(mode string, maxEdge, maxSetback int) *models.SystemTemplate {
	return &models.SystemTemplate{Settings: models.TemplateSettings{
		Modifier: &models.ModifierConfig{Enabled: true, Kind: ModKindDice, DiceMode: mode, MaxEdge: maxEdge, MaxSetback: maxSetback},
	}}
}

func d100Below(threshold string) *models.RollConfig {
	return &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold", Threshold: threshold}
}

func TestEdgeDice_Tens(t *testing.T) {
	tests := []struct {
		name     string
		vals     []int // seqRoller raw values: first Intn(100), then one Intn(10) per extra die
		cfg      *models.RollConfig
		diceMod  int
		wantRoll int
		wantAll  []int
	}{
		// main 47 (units 7), extra tens 2 -> 27; roll-under edge keeps the lower.
		{"edge keeps lower under threshold", []int{46, 2}, d100Below("55"), 1, 27, []int{47, 27}},
		// main 47, extra tens 8 -> 87; roll-under setback keeps the higher.
		{"setback keeps higher under threshold", []int{46, 8}, d100Below("55"), -1, 87, []int{47, 87}},
		// main 50 (units 0), extra tens 0 -> 00+0 = 100, the fumble face.
		{"00 and 0 read as 100", []int{49, 0}, d100Below("55"), -1, 100, []int{50, 100}},
		// roll-over flips the direction: edge keeps the higher.
		{"edge keeps higher over threshold", []int{46, 8},
			&models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "above_threshold", Threshold: "50"}, 1, 87, []int{47, 87}},
		{"two edge dice", []int{46, 5, 1}, d100Below("55"), 2, 17, []int{47, 57, 17}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := newTestPlugin(tc.vals...)
			res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeTens, 2, 2), "atk", "str", false, tc.cfg, tc.diceMod)
			if err != nil {
				t.Fatalf("rollFromFormula() error: %v", err)
			}
			if res.Roll != tc.wantRoll {
				t.Errorf("Roll = %d, want %d", res.Roll, tc.wantRoll)
			}
			if !reflect.DeepEqual(res.AllRolls, tc.wantAll) {
				t.Errorf("AllRolls = %v, want %v", res.AllRolls, tc.wantAll)
			}
			if res.DiceMod != tc.diceMod || res.Modifier != 0 || res.ModifierTarget != ModTargetEdgeDice {
				t.Errorf("DiceMod/Modifier/Target = %d/%d/%q, want %d/0/%q", res.DiceMod, res.Modifier, res.ModifierTarget, tc.diceMod, ModTargetEdgeDice)
			}
		})
	}
}

func TestEdgeDice_Formula(t *testing.T) {
	d20Above := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, SuccessType: "above_threshold", Threshold: "10"}

	t.Run("edge keeps the higher whole formula over threshold", func(t *testing.T) {
		p := newTestPlugin(4, 14) // d20 -> 5, d20 -> 15
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, d20Above, 1)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 15 || !reflect.DeepEqual(res.AllRolls, []int{5, 15}) {
			t.Errorf("Roll/AllRolls = %d/%v, want 15/[5 15]", res.Roll, res.AllRolls)
		}
		if res.Outcome != "regular_success" {
			t.Errorf("Outcome = %q, want regular_success (15 >= 10)", res.Outcome)
		}
		// The breakdown describes the kept roll, not the discarded one.
		if !strings.HasSuffix(res.FormulaBreakdown, "= 15") {
			t.Errorf("FormulaBreakdown = %q, want it to end with the kept 15", res.FormulaBreakdown)
		}
	})

	t.Run("setback keeps the higher under threshold", func(t *testing.T) {
		p := newTestPlugin(9, 79) // d100 -> 10, d100 -> 80
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, d100Below("55"), -1)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 80 || res.Outcome != "failure" {
			t.Errorf("Roll/Outcome = %d/%q, want 80/failure", res.Roll, res.Outcome)
		}
	})

	t.Run("clamped request rolls only the allowed dice", func(t *testing.T) {
		// maxEdge 1: a +3 request rolls twice. seqRoller panics if a third roll is asked for.
		p := newTestPlugin(4, 14)
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 1, 0), "atk", "str", false, d20Above, 3)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.DiceMod != 1 || len(res.AllRolls) != 2 {
			t.Errorf("DiceMod/len(AllRolls) = %d/%d, want 1/2", res.DiceMod, len(res.AllRolls))
		}
	})

	t.Run("raw field ignores the pick", func(t *testing.T) {
		p := newTestPlugin(4) // exactly one roll
		raw := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, SuccessType: "raw"}
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, raw, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 5 || res.DiceMod != 0 || res.AllRolls != nil || res.ModifierTarget != ModTargetNone {
			t.Errorf("got Roll %d DiceMod %d AllRolls %v Target %q, want a plain 5", res.Roll, res.DiceMod, res.AllRolls, res.ModifierTarget)
		}
	})
}

// Weapons attack through rollFromFormula, so they get the dice; damage never does.
func TestRollWeaponWithTemplate_EdgeDiceOnAttackOnly(t *testing.T) {
	template, raw := weaponTemplate()
	template.Sections[0].Fields[0].RollConfig.SuccessType = "above_threshold"
	template.Sections[0].Fields[0].RollConfig.Threshold = "10"
	template.Settings.Modifier = &models.ModifierConfig{Enabled: true, Kind: ModKindDice, MaxEdge: 2}

	// attack d20 Intn 4 -> 5, d20 Intn 9 -> 10 (kept, success); damage 2d6: 3->4, 5->6, + STR 8 => 18.
	p := newTestPlugin(4, 9, 3, 5)
	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "w1", 1)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.Roll != 10 || !reflect.DeepEqual(res.AllRolls, []int{5, 10}) {
		t.Errorf("Roll/AllRolls = %d/%v, want 10/[5 10]", res.Roll, res.AllRolls)
	}
	if res.DamageRoll != 18 {
		t.Errorf("DamageRoll = %d, want 18 — dice do not touch damage", res.DamageRoll)
	}
}

func TestPickIndex_TieKeepsFirst(t *testing.T) {
	if got := pickIndex([]int{30, 30}, 1, true); got != 0 {
		t.Errorf("pickIndex tie = %d, want 0", got)
	}
}
