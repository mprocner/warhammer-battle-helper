package custom

import (
	"sort"

	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
)

// applySuccessLevels scores a traditional roll's degree of success into res (PLAYRPG-289).
// It only acts on a real success/failure: evalOutcome writes the number itself as the outcome for
// raw rolls and rolls without a threshold, and dice-pool rolls never call it.
// threshold is the final target, after any threshold-target modifier.
func applySuccessLevels(cfg *models.SuccessLevelsConfig, successType string, roll, threshold int, res *gsys.RollResult) {
	if cfg == nil {
		return
	}
	success := res.Outcome == "regular_success"
	if !success && res.Outcome != "failure" {
		return
	}
	// Same default as evalOutcome: anything but "below_threshold" is roll-over.
	below := successType == "below_threshold"

	switch cfg.Mode {
	case models.SuccessLevelsTens:
		step := cfg.Step
		if step <= 0 {
			step = models.DefaultSuccessLevelStep
		}
		sl := floorDiv(threshold, step) - floorDiv(roll, step)
		if !below {
			sl = -sl
		}
		res.SuccessLevel = sl
		res.HasSuccessLevel = true
	case models.SuccessLevelsTiers:
		tier := pickTier(cfg, below, success, roll, threshold)
		res.TierLabel = tier.Label
		res.TierColor = tier.Color
	}
}

// pickTier returns the hardest tier the roll reached. Fractions of the target only mean
// "harder" for roll-under, so roll-over falls straight to the fixed Success/Failure rows.
func pickTier(cfg *models.SuccessLevelsConfig, below, success bool, roll, threshold int) models.SuccessTier {
	if !success {
		return cfg.Failure
	}
	if below {
		tiers := append([]models.SuccessTier(nil), cfg.Tiers...)
		sort.SliceStable(tiers, func(i, j int) bool { return tiers[i].Divisor > tiers[j].Divisor })
		for _, tier := range tiers {
			if tier.Divisor >= models.MinTierDivisor && roll <= floorDiv(threshold, tier.Divisor) {
				return tier
			}
		}
	}
	return cfg.Success
}

// floorDiv rounds toward negative infinity. Go's / truncates toward zero, which would score a
// negative target (a real value since FEATURE-162) one level too high.
func floorDiv(a, b int) int {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}
