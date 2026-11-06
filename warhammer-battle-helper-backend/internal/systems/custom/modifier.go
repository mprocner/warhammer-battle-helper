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
	ModTargetEdgeDice         = "edge_dice"         // dice kind: |value| extra rolls, best (edge) or worst (setback) kept
)

// Modifier kinds and edge-dice modes. Shared with the frontend like the targets above.
const (
	ModKindNumber   = "number"
	ModKindDice     = "dice"
	DiceModeFormula = "formula"
	DiceModeTens    = "tens"
)

// maxEdgeDice caps edge/setback dice whatever the template says: formula mode evaluates the
// whole formula once per die, so the count is a cost a request must not pick freely.
const maxEdgeDice = 5

// resolveModifier is the single place that decides where a requested modifier goes and how big
// it may be. Every roller asks it instead of keeping its own rule — the four rollers each
// applying the modifier differently is exactly what FEATURE-164 set out to fix.
//
// A nil or disabled config returns (ModTargetNone, 0): the server does not trust a modifier the
// template does not allow, so a hand-crafted request cannot smuggle one past the UI.
//
// An unrecognised target falls back to that mode's default rather than erroring — a target
// string is GM data, and a typo in it must not make every roll on the card fail.
func resolveModifier(cfg *models.ModifierConfig, roll *models.RollConfig, requested int) (target string, value int) {
	if cfg == nil || !cfg.Enabled {
		return ModTargetNone, 0
	}
	if cfg.Kind == ModKindDice {
		return resolveEdgeDice(cfg, roll, requested)
	}
	value = clampModifier(cfg, requested)

	if roll.RollMode == "dice_pool" {
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

// resolveEdgeDice decides whether edge/setback dice apply to this roll and how many. A field they
// cannot apply to rolls plainly instead of failing: the client shows the dice column for every
// roll (it cannot resolve a field's roll config), so the server is where an unusable pick drops.
func resolveEdgeDice(cfg *models.ModifierConfig, roll *models.RollConfig, requested int) (string, int) {
	if roll.RollMode == "dice_pool" || roll.SuccessType == "raw" {
		return ModTargetNone, 0
	}
	if cfg.DiceMode == DiceModeTens && !isSingleD100(roll.Formula) {
		return ModTargetNone, 0
	}
	v := clampEdgeDice(cfg, requested)
	if v == 0 {
		return ModTargetNone, 0
	}
	return ModTargetEdgeDice, v
}

// clampEdgeDice bounds the request to [-MaxSetback, MaxEdge], each side itself bounded to
// [0, maxEdgeDice] so a hand-edited negative or huge max cannot widen the range.
func clampEdgeDice(cfg *models.ModifierConfig, v int) int {
	hi := min(max(cfg.MaxEdge, 0), maxEdgeDice)
	lo := -min(max(cfg.MaxSetback, 0), maxEdgeDice)
	return min(max(v, lo), hi)
}

// isSingleD100 reports whether a formula is exactly one d100 — the only shape tens mode can
// reroll, since it replaces the tens digit of that one die.
func isSingleD100(blocks []models.FormulaBlock) bool {
	return len(blocks) == 1 && blocks[0].Type == "dice" && blocks[0].Value == "d100"
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
