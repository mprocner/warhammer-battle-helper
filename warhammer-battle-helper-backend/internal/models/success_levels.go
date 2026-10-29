package models

import (
	"errors"
	"regexp"
	"unicode/utf8"
)

// Success level modes (PLAYRPG-289). Off is the zero value, so nil and Mode == "" read the same.
const (
	SuccessLevelsOff   = ""
	SuccessLevelsTens  = "tens"
	SuccessLevelsTiers = "tiers"

	DefaultSuccessLevelStep = 10
	MaxSuccessLevelStep     = 100
	MinTierDivisor          = 2
	MaxTierDivisor          = 100
	MaxTierLabelRunes       = 40
)

// ErrInvalidSuccessLevels is a single sentinel: the creator never sends a bad config (it holds
// invalid input as a local draft), so this only guards the API and needs no per-cause message.
var ErrInvalidSuccessLevels = errors.New("template_invalid_success_levels")

var tierColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// SuccessLevelsConfig configures how a traditional custom roll reports its degree of success.
// "tens" scores floor(target/step) - floor(roll/step); "tiers" names the hardest fraction of the
// target the roll reached. Tiers survive while Mode is off, so a GM toggling back finds them.
type SuccessLevelsConfig struct {
	Mode    string        `bson:"mode" json:"mode"`
	Step    int           `bson:"step,omitempty" json:"step,omitempty"` // tens only; 0 reads as DefaultSuccessLevelStep
	Success SuccessTier   `bson:"success" json:"success"`               // tiers: the fixed 1/1 row
	Failure SuccessTier   `bson:"failure" json:"failure"`               // tiers: the fixed row when nothing is reached
	Tiers   []SuccessTier `bson:"tiers,omitempty" json:"tiers,omitempty"`
}

// SuccessTier is one row of the thresholds table. Divisor is unused on the fixed Success/Failure
// rows. Label is GM-authored free text, never run through i18n; empty falls back to the plain
// outcome label in the log.
type SuccessTier struct {
	ID      string `bson:"id,omitempty" json:"id,omitempty"`
	Divisor int    `bson:"divisor,omitempty" json:"divisor,omitempty"`
	Label   string `bson:"label" json:"label"`
	Color   string `bson:"color" json:"color"`
}

// Validate checks the stored shape regardless of Mode, because an "off" config still carries
// the tiers it will restore. Labels may be empty: the creator autosaves mid-edit.
func (c *SuccessLevelsConfig) Validate() error {
	if c == nil {
		return nil
	}
	switch c.Mode {
	case SuccessLevelsOff, SuccessLevelsTens, SuccessLevelsTiers:
	default:
		return ErrInvalidSuccessLevels
	}
	if c.Step < 0 || c.Step > MaxSuccessLevelStep {
		return ErrInvalidSuccessLevels
	}
	if !validTier(c.Success) || !validTier(c.Failure) {
		return ErrInvalidSuccessLevels
	}
	seen := make(map[int]bool, len(c.Tiers))
	for _, tier := range c.Tiers {
		if tier.Divisor < MinTierDivisor || tier.Divisor > MaxTierDivisor || seen[tier.Divisor] {
			return ErrInvalidSuccessLevels
		}
		seen[tier.Divisor] = true
		if !validTier(tier) {
			return ErrInvalidSuccessLevels
		}
	}
	return nil
}

func validTier(t SuccessTier) bool {
	if utf8.RuneCountInString(t.Label) > MaxTierLabelRunes {
		return false
	}
	return t.Color == "" || tierColorPattern.MatchString(t.Color)
}
