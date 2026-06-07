package systems

import "go.mongodb.org/mongo-driver/bson"

// RollResult is the generic result returned by any system's roll function.
type RollResult struct {
	// Common fields
	DiceType      int    `json:"diceType"` // 20 for D&D 5e, 100 for Warhammer/CoC
	RollType      string `json:"rollType"` // "skill" | "weapon" | "attribute" | "sanity"
	CharacterID   string `json:"characterId"`
	CharacterName string `json:"characterName"`
	Username      string `json:"username"`
	Roll          int    `json:"roll"`
	Target        int    `json:"target"`
	Outcome       string `json:"outcome"`      // "critical_success"|"extreme_success"|"hard_success"|"regular_success"|"failure"|"fumble"
	SuccessLevel  int    `json:"successLevel"` // SL for Warhammer; 0 for CoC (degree encoded in Outcome)

	// Optional skill-specific
	SkillKey  string `json:"skillKey,omitempty"`
	SkillName string `json:"skillName,omitempty"`
	Modifier  int    `json:"modifier"`

	// Optional weapon-specific
	WeaponName      string `json:"weaponName,omitempty"`
	Damage          string `json:"damage,omitempty"`
	DamageRoll      int    `json:"damageRoll"`
	DamageBreakdown string `json:"damageBreakdown,omitempty"`

	// Optional sanity-specific (CoC)
	SanLoss       string `json:"sanLoss,omitempty"`
	SanLossResult int    `json:"sanLossResult,omitempty"`

	// Optional bonus/penalty dice (CoC)
	DiceMod  int   `json:"diceMod,omitempty"`  // +1/+2 bonus, -1/-2 penalty
	AllRolls []int `json:"allRolls,omitempty"` // all candidates; final = Roll

	// D&D 5e specific fields (omitempty — no impact on CoC/Warhammer results)
	D20Roll        int  `json:"d20Roll,omitempty"`        // raw d20 before modifiers
	BonusTotal     int  `json:"bonusTotal,omitempty"`     // total modifier applied
	IsAdvantage    bool `json:"isAdvantage,omitempty"`    // rolled with advantage
	IsDisadvantage bool `json:"isDisadvantage,omitempty"` // rolled with disadvantage
	IsCriticalHit  bool `json:"isCriticalHit,omitempty"`  // natural 20 on attack

	// Custom formula breakdown — e.g. "d6+STR+2 = 3+8+2 = 13"
	FormulaBreakdown string `json:"formulaBreakdown,omitempty"`

	// Dice-pool mode results (only present when rolled in dice_pool mode).
	PoolRolls            []int  `json:"poolRolls,omitempty"`
	PoolSuccesses        int    `json:"poolSuccesses,omitempty"`
	PoolSuccessCondition string `json:"poolSuccessCondition,omitempty"` // "gte" | "eq"
}

// GameSystem is the interface every game-system plugin must implement.
type GameSystem interface {
	// RollSkill performs a skill/characteristic check.
	// target is the DC for D&D 5e (0 = no DC check); Warhammer/CoC ignore it.
	RollSkill(stats bson.Raw, skillKey string, modifier int, diceMod int, target int) (*RollResult, error)

	// RollWeapon performs a weapon attack roll (hit + damage).
	RollWeapon(stats bson.Raw, weaponName, weaponSkill, damage string, modifier int, diceMod int) (*RollResult, error)

	// DefaultStats returns a zero-value stats document encoded as BSON
	// that can be stored on newly created characters.
	DefaultStats() (bson.Raw, error)

	// ComputeDerived recalculates derived/secondary attributes (wounds, movement, etc.)
	// from the primary stats and returns the updated BSON.
	ComputeDerived(stats bson.Raw) (bson.Raw, error)

	// GetDisplayName extracts the human-readable display name from a stats document.
	// Returns "" if the system does not embed the name in stats.
	GetDisplayName(stats bson.Raw) string

	// SetDisplayName writes name into the stats document and returns updated BSON.
	// Systems that do not embed the name return stats unchanged and a nil error.
	SetDisplayName(stats bson.Raw, name string) (bson.Raw, error)
}
