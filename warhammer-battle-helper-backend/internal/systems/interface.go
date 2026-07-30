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
	PoolFormula          []PoolFormulaPart `json:"poolFormula,omitempty"`
	PoolSuccesses        int               `json:"poolSuccesses,omitempty"`
	PoolSuccessCondition string            `json:"poolSuccessCondition,omitempty"` // "gte" | "eq"
}

// PoolFormulaPart is one term of a dice-pool formula: either a text fragment
// (operator, attribute label, constant) or a die term carrying the results it
// produced. Keeping the rolls inside the term is what lets the client label every
// result with the die that produced it — a flat roll list cannot say whether a 4
// came off a d6 or a d10.
type PoolFormulaPart struct {
	Kind       string `json:"kind"`                 // "text" | "dice"
	Text       string `json:"text,omitempty"`       // kind=text: "+", "STR", "3"
	Sides      int    `json:"sides,omitempty"`      // kind=dice: resolved face count
	CountLabel string `json:"countLabel,omitempty"` // kind=dice: multiplier shown before the die, e.g. "3"
	SidesLabel string `json:"sidesLabel,omitempty"` // kind=dice: source expression when faces are computed, e.g. "STR"
	Rolls      []int  `json:"rolls,omitempty"`      // kind=dice: one entry per die rolled
}

// TokenFieldDef describes one character-sheet value that a GM can bind to a map-token
// slot, a square or the HP bar (FEATURE-102). Key is a path relative to the Character's
// `stats` subdocument; ProgressMaxKey is only set for progress fields (HP-bar candidates).
type TokenFieldDef struct {
	Key            string `json:"key"`
	Label          string `json:"label"`
	Category       string `json:"category"` // "attribute" | "number" | "progress"
	ProgressMaxKey string `json:"progressMaxKey,omitempty"`
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

	// TokenFields lists the character-sheet values bindable to a map-token slot,
	// square or HP bar (FEATURE-102). The custom system returns nil — its bindable
	// fields come from the template's own Sections, not the registry.
	TokenFields() []TokenFieldDef
}
