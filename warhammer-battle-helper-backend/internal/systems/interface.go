package systems

import "go.mongodb.org/mongo-driver/bson"

// RollResult is the generic result returned by any system's roll function.
type RollResult struct {
	// Common fields
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
	Modifier  int    `json:"modifier,omitempty"`

	// Optional weapon-specific
	WeaponName string `json:"weaponName,omitempty"`
	Damage     string `json:"damage,omitempty"`
	DamageRoll int    `json:"damageRoll,omitempty"`

	// Optional sanity-specific (CoC)
	SanLoss       string `json:"sanLoss,omitempty"`
	SanLossResult int    `json:"sanLossResult,omitempty"`
}

// GameSystem is the interface every game-system plugin must implement.
type GameSystem interface {
	// RollSkill performs a skill/characteristic check.
	RollSkill(stats bson.Raw, skillKey string, modifier int) (*RollResult, error)

	// RollWeapon performs a weapon attack roll (hit + damage).
	RollWeapon(stats bson.Raw, weaponName, weaponSkill, damage string, modifier int) (*RollResult, error)

	// DefaultStats returns a zero-value stats document encoded as BSON
	// that can be stored on newly created characters.
	DefaultStats() (bson.Raw, error)

	// ComputeDerived recalculates derived/secondary attributes (wounds, movement, etc.)
	// from the primary stats and returns the updated BSON.
	ComputeDerived(stats bson.Raw) (bson.Raw, error)
}
