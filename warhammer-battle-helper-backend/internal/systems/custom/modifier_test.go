package custom

import (
	"battle-helper/internal/models"
	"testing"
)

func TestResolveModifier(t *testing.T) {
	enabled := func(trad, pool string) *models.ModifierConfig {
		return &models.ModifierConfig{Enabled: true, TraditionalTarget: trad, PoolTarget: pool}
	}

	tests := []struct {
		name       string
		cfg        *models.ModifierConfig
		rollMode   string
		requested  int
		wantTarget string
		wantValue  int
	}{
		{"nil config zeroes the modifier", nil, "traditional", 20, ModTargetNone, 0},
		{"disabled config zeroes the modifier", &models.ModifierConfig{Enabled: false, TraditionalTarget: ModTargetRoll}, "traditional", 20, ModTargetNone, 0},
		{"traditional defaults to roll", enabled("", ""), "traditional", 5, ModTargetRoll, 5},
		{"traditional honours threshold", enabled(ModTargetThreshold, ""), "traditional", -20, ModTargetThreshold, -20},
		{"traditional rejects a pool target", enabled(ModTargetDiceCount, ""), "traditional", 5, ModTargetRoll, 5},
		{"pool defaults to dice count", enabled("", ""), "dice_pool", 2, ModTargetDiceCount, 2},
		{"pool honours success threshold", enabled("", ModTargetSuccessThreshold), "dice_pool", 2, ModTargetSuccessThreshold, 2},
		{"pool rejects a traditional target", enabled("", ModTargetThreshold), "dice_pool", 2, ModTargetDiceCount, 2},
		{"empty roll mode is traditional", enabled(ModTargetThreshold, ""), "", 3, ModTargetThreshold, 3},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target, value := resolveModifier(tc.cfg, &models.RollConfig{RollMode: tc.rollMode}, tc.requested)
			if target != tc.wantTarget || value != tc.wantValue {
				t.Errorf("resolveModifier() = (%q, %d), want (%q, %d)", target, value, tc.wantTarget, tc.wantValue)
			}
		})
	}
}

func TestClampModifier(t *testing.T) {
	tests := []struct {
		name string
		cfg  *models.ModifierConfig
		in   int
		want int
	}{
		{"both limits zero means no limit", &models.ModifierConfig{}, 999, 999},
		{"both limits zero passes negatives", &models.ModifierConfig{}, -999, -999},
		{"clamps above max", &models.ModifierConfig{Min: -60, Max: 60}, 90, 60},
		{"clamps below min", &models.ModifierConfig{Min: -60, Max: 60}, -90, -60},
		{"inside the range is untouched", &models.ModifierConfig{Min: -60, Max: 60}, 10, 10},
		// A cap at zero is expressed by the PAIR of limits, because the "no limits" escape reads
		// both fields together: {0, 0} means unconfigured, {-60, 0} is a real ceiling at zero.
		{"a nonzero min lets max cap at zero", &models.ModifierConfig{Min: -60, Max: 0}, 30, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampModifier(tc.cfg, tc.in); got != tc.want {
				t.Errorf("clampModifier(%d) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

// A disabled modifier must be zeroed server-side, not merely hidden in the UI — otherwise a
// hand-crafted request smuggles a modifier into a card whose template forbids one.
func TestResolveModifier_DisabledIgnoresClamp(t *testing.T) {
	cfg := &models.ModifierConfig{Enabled: false, Min: -10, Max: 10}
	if _, value := resolveModifier(cfg, &models.RollConfig{RollMode: "traditional"}, 5); value != 0 {
		t.Errorf("value = %d, want 0", value)
	}
}

func TestResolveModifier_EdgeDice(t *testing.T) {
	dice := func(mode string, maxEdge, maxSetback int) *models.ModifierConfig {
		return &models.ModifierConfig{Enabled: true, Kind: ModKindDice, DiceMode: mode, MaxEdge: maxEdge, MaxSetback: maxSetback}
	}
	d100 := []models.FormulaBlock{diceBlock("d100")}
	d20 := []models.FormulaBlock{diceBlock("d20")}
	below := func(f []models.FormulaBlock) *models.RollConfig {
		return &models.RollConfig{Formula: f, SuccessType: "below_threshold"}
	}

	tests := []struct {
		name       string
		cfg        *models.ModifierConfig
		roll       *models.RollConfig
		requested  int
		wantTarget string
		wantValue  int
	}{
		{"edge within max", dice(DiceModeFormula, 2, 2), below(d20), 1, ModTargetEdgeDice, 1},
		{"setback within max", dice(DiceModeFormula, 2, 2), below(d20), -2, ModTargetEdgeDice, -2},
		{"edge clamped to max", dice(DiceModeFormula, 1, 2), below(d20), 3, ModTargetEdgeDice, 1},
		{"setback clamped to max", dice(DiceModeFormula, 2, 1), below(d20), -3, ModTargetEdgeDice, -1},
		{"disabled side clamps to nothing", dice(DiceModeFormula, 0, 2), below(d20), 2, ModTargetNone, 0},
		{"zero request is no dice", dice(DiceModeFormula, 2, 2), below(d20), 0, ModTargetNone, 0},
		{"server cap beats a huge config", dice(DiceModeFormula, 99, 99), below(d20), 50, ModTargetEdgeDice, maxEdgeDice},
		{"negative max reads as zero", dice(DiceModeFormula, -3, 2), below(d20), 1, ModTargetNone, 0},
		{"raw field rolls plain", dice(DiceModeFormula, 2, 2), &models.RollConfig{Formula: d20, SuccessType: "raw"}, 1, ModTargetNone, 0},
		{"dice pool rolls plain", dice(DiceModeFormula, 2, 2), &models.RollConfig{Formula: d20, RollMode: "dice_pool"}, 1, ModTargetNone, 0},
		{"tens on d100", dice(DiceModeTens, 2, 2), below(d100), 1, ModTargetEdgeDice, 1},
		{"tens on d20 rolls plain", dice(DiceModeTens, 2, 2), below(d20), 1, ModTargetNone, 0},
		{"tens on d100+5 rolls plain", dice(DiceModeTens, 2, 2), below([]models.FormulaBlock{diceBlock("d100"), opBlock("+"), numBlock(5)}), 1, ModTargetNone, 0},
		// Kind decides the meaning of the number: a dice template never applies it as a numeric
		// modifier, and a number template never turns it into dice.
		{"number kind ignores dice fields", &models.ModifierConfig{Enabled: true, Kind: ModKindNumber, MaxEdge: 2}, below(d20), 1, ModTargetRoll, 1},
		{"empty kind is number", &models.ModifierConfig{Enabled: true, MaxEdge: 2}, below(d20), 1, ModTargetRoll, 1},
		{"disabled dice config zeroes", &models.ModifierConfig{Enabled: false, Kind: ModKindDice, MaxEdge: 2}, below(d20), 1, ModTargetNone, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target, value := resolveModifier(tc.cfg, tc.roll, tc.requested)
			if target != tc.wantTarget || value != tc.wantValue {
				t.Errorf("resolveModifier() = (%q, %d), want (%q, %d)", target, value, tc.wantTarget, tc.wantValue)
			}
		})
	}
}
