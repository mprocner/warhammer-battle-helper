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
			target, value := resolveModifier(tc.cfg, tc.rollMode, tc.requested)
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
	if _, value := resolveModifier(cfg, "traditional", 5); value != 0 {
		t.Errorf("value = %d, want 0", value)
	}
}
