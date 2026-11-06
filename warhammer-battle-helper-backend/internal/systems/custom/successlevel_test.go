package custom

import (
	"testing"

	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
)

func tiersCfg() *models.SuccessLevelsConfig {
	return &models.SuccessLevelsConfig{
		Mode:    models.SuccessLevelsTiers,
		Success: models.SuccessTier{Label: "Success", Color: "#000001"},
		Failure: models.SuccessTier{Label: "Failure", Color: "#000002"},
		// Deliberately unsorted: evaluation order comes from the divisor, not the slice.
		Tiers: []models.SuccessTier{
			{ID: "h", Divisor: 2, Label: "Hard", Color: "#000003"},
			{ID: "e", Divisor: 5, Label: "Extreme", Color: "#000004"},
		},
	}
}

func TestApplySuccessLevels_Tens(t *testing.T) {
	cases := []struct {
		name        string
		successType string
		step        int
		roll, tgt   int
		outcome     string
		want        int
	}{
		{"crossing a tens digit counts", "below_threshold", 0, 38, 45, "regular_success", 1},
		{"same tens digit success", "below_threshold", 0, 44, 45, "regular_success", 0},
		{"same tens digit failure", "below_threshold", 0, 47, 45, "failure", 0},
		{"failure counts down", "below_threshold", 0, 72, 45, "failure", -3},
		{"deep success", "below_threshold", 0, 12, 45, "regular_success", 3},
		{"custom step", "below_threshold", 5, 38, 45, "regular_success", 2},
		{"roll over flips the sign", "above_threshold", 0, 72, 45, "regular_success", 3},
		{"empty success type is roll over", "", 0, 38, 45, "failure", -1},
		// Go's / truncates toward zero: -5/10 would be 0 instead of -1.
		{"negative target floors", "below_threshold", 0, 3, -5, "failure", -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &models.SuccessLevelsConfig{Mode: models.SuccessLevelsTens, Step: tc.step}
			res := &gsys.RollResult{Outcome: tc.outcome}
			applySuccessLevels(cfg, tc.successType, tc.roll, tc.tgt, res)
			if !res.HasSuccessLevel || res.SuccessLevel != tc.want {
				t.Fatalf("got has=%v sl=%d, want has=true sl=%d", res.HasSuccessLevel, res.SuccessLevel, tc.want)
			}
			if res.TierLabel != "" || res.TierColor != "" {
				t.Fatalf("tens mode must not set a tier, got %q %q", res.TierLabel, res.TierColor)
			}
		})
	}
}

func TestApplySuccessLevels_Tiers(t *testing.T) {
	cases := []struct {
		name        string
		successType string
		roll, tgt   int
		outcome     string
		wantLabel   string
	}{
		{"hardest tier first", "below_threshold", 12, 60, "regular_success", "Extreme"},
		{"middle tier", "below_threshold", 30, 60, "regular_success", "Hard"},
		{"plain success", "below_threshold", 31, 60, "regular_success", "Success"},
		{"failure", "below_threshold", 61, 60, "failure", "Failure"},
		{"roll over ignores tiers", "above_threshold", 300, 60, "regular_success", "Success"},
		{"roll over failure", "above_threshold", 10, 60, "failure", "Failure"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := &gsys.RollResult{Outcome: tc.outcome}
			applySuccessLevels(tiersCfg(), tc.successType, tc.roll, tc.tgt, res)
			if res.TierLabel != tc.wantLabel {
				t.Fatalf("TierLabel = %q, want %q", res.TierLabel, tc.wantLabel)
			}
			if res.TierColor == "" {
				t.Fatal("TierColor must be copied with the label")
			}
			if res.HasSuccessLevel {
				t.Fatal("tiers mode must not set a success level")
			}
		})
	}
}

func TestApplySuccessLevels_NoOp(t *testing.T) {
	cases := []struct {
		name    string
		cfg     *models.SuccessLevelsConfig
		outcome string
	}{
		{"nil config", nil, "regular_success"},
		{"mode off", &models.SuccessLevelsConfig{Mode: models.SuccessLevelsOff, Tiers: tiersCfg().Tiers}, "regular_success"},
		// evalOutcome prints the number itself for raw rolls and rolls without a threshold.
		{"raw roll", tiersCfg(), "48"},
		{"pool-like outcome", &models.SuccessLevelsConfig{Mode: models.SuccessLevelsTens}, "3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := &gsys.RollResult{Outcome: tc.outcome}
			applySuccessLevels(tc.cfg, "below_threshold", 10, 50, res)
			if res.HasSuccessLevel || res.TierLabel != "" || res.TierColor != "" {
				t.Fatalf("expected no-op, got %+v", res)
			}
		})
	}
}

// End to end through rollFromFormula: the level is scored against the target AFTER a
// threshold-target modifier, and dice-pool rolls never get one.
func TestRollFromFormula_SuccessLevels(t *testing.T) {
	stats := sampleStats()
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
		Threshold:   "55",
	}
	tmpl := tmplWithModifier(ModTargetThreshold, "")
	tmpl.Settings.SuccessLevels = &models.SuccessLevelsConfig{Mode: models.SuccessLevelsTens}

	p := newTestPlugin(27) // d100 -> 28
	res, err := p.rollFromFormula(stats, tmpl, "atk", "str", false, cfg, -20)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	// Target 55-20 = 35: floor(35/10) - floor(28/10) = 3 - 2 = 1.
	if !res.HasSuccessLevel || res.SuccessLevel != 1 {
		t.Fatalf("got has=%v sl=%d, want +1 against the shifted target", res.HasSuccessLevel, res.SuccessLevel)
	}

	poolCfg := &models.RollConfig{
		Formula:              []models.FormulaBlock{diceBlock("d6")},
		RollMode:             "dice_pool",
		PoolSuccessThreshold: 4,
	}
	p = newTestPlugin(4) // d6 -> 5
	poolRes, err := p.rollFromFormula(stats, tmpl, "atk", "str", false, poolCfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula(pool) error: %v", err)
	}
	if poolRes.HasSuccessLevel || poolRes.TierLabel != "" {
		t.Fatalf("dice pool must not be scored, got %+v", poolRes)
	}
}
