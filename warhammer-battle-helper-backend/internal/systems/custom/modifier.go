package custom

import "battle-helper/internal/models"

// Where a roll modifier lands. Two targets per roll mode — see models.ModifierConfig for why
// the config cannot hold just one. These exact strings are shared with the frontend
// (src/systems/custom/modifierConfig.js), so they must not be renamed on one side only.
const (
	ModTargetNone             = ""                  // disabled: nothing is applied
	ModTargetRoll             = "roll"              // traditional: finalRoll = result + modifier
	ModTargetThreshold        = "threshold"         // traditional: threshold += modifier
	ModTargetDiceCount        = "dice_count"        // pool: the first die term rolls `modifier` more dice
	ModTargetSuccessThreshold = "success_threshold" // pool: success threshold += modifier
)

// resolveModifier is the single place that decides where a requested modifier goes and how big
// it may be. Every roller asks it instead of keeping its own rule — the four rollers each
// applying the modifier differently is exactly what FEATURE-164 set out to fix.
//
// A nil or disabled config returns (ModTargetNone, 0): the server does not trust a modifier the
// template does not allow, so a hand-crafted request cannot smuggle one past the UI.
//
// An unrecognised target falls back to that mode's default rather than erroring — a target
// string is GM data, and a typo in it must not make every roll on the card fail.
func resolveModifier(cfg *models.ModifierConfig, rollMode string, requested int) (target string, value int) {
	if cfg == nil || !cfg.Enabled {
		return ModTargetNone, 0
	}
	value = clampModifier(cfg, requested)

	if rollMode == "dice_pool" {
		if cfg.PoolTarget == ModTargetSuccessThreshold {
			return ModTargetSuccessThreshold, value
		}
		return ModTargetDiceCount, value
	}
	if cfg.TraditionalTarget == ModTargetThreshold {
		return ModTargetThreshold, value
	}
	return ModTargetRoll, value
}

// clampModifier applies the config's Min/Max. Both zero means "no limit", so a template that
// never configured limits keeps accepting whatever the GM types.
//
// The rule reads both fields together, which is what makes a cap at exactly zero expressible:
// {Min: -60, Max: 0} forbids positive modifiers, while {0, 0} is the unconfigured case. The only
// setting this cannot express is "clamp everything to zero" — and that is what Enabled: false
// already does. Hence plain ints: no field has to tell "unset" apart from "zero".
func clampModifier(cfg *models.ModifierConfig, v int) int {
	if cfg.Min == 0 && cfg.Max == 0 {
		return v
	}
	if v < cfg.Min {
		return cfg.Min
	}
	if v > cfg.Max {
		return cfg.Max
	}
	return v
}
