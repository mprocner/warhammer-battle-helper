package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SkillOption is one skill row of a "skill_table" field. ID is a stable, GM-opaque key
// generated once when the option is created; it never derives from Label, so renaming a
// skill does not orphan the value a player stored under "<fieldKey>.<id>". Attr links the
// skill to an attribute (empty unless the field has assignAttrToSkill enabled).
type SkillOption struct {
	ID    string `bson:"id" json:"id"`
	Label string `bson:"label" json:"label"`
	Attr  string `bson:"attr,omitempty" json:"attr,omitempty"`
}

// SectionDef groups related fields under a titled section with a column layout.
type SectionDef struct {
	ID      string     `bson:"id" json:"id"`
	Title   string     `bson:"title" json:"title"`
	Columns int        `bson:"columns" json:"columns"` // 1, 2, or 3
	Fields  []FieldDef `bson:"fields" json:"fields"`
}

// TemplateSettings holds template-wide options configured in the "General" tab
// of the template creator (as opposed to per-field config).
type TemplateSettings struct {
	// DiceButtons is the ordered list of die face counts shown under the chat
	// in the game session. Empty/nil means the client falls back to defaults.
	DiceButtons []int `bson:"diceButtons,omitempty" json:"diceButtons,omitempty"`

	// TokenDisplay configures what extra info renders around a character token on
	// the map (FEATURE-102): 8 radial slots, an HP bar binding and optional squares.
	TokenDisplay *TokenDisplayConfig `bson:"tokenDisplay,omitempty" json:"tokenDisplay,omitempty"`
}

// TokenDisplayConfig is the map-token overlay layout authored in the "Token Display"
// card of the template creator's General tab. It stores only the *layout* (which
// slots show what, HP-bar binding, squares) — the live per-token values live on the
// Character (States for icon slots, TokenOverlay for number/select slots).
type TokenDisplayConfig struct {
	Enabled bool          `bson:"enabled" json:"enabled"`
	Slots   [8]TokenSlot  `bson:"slots" json:"slots"`                       // index 0..7 = angle 0°,45°,...,315° (0 = top, clockwise)
	HPBars  []TokenHPBar  `bson:"hpBars,omitempty" json:"hpBars,omitempty"` // replaces the old single *FieldBinding HPBar
	Squares []TokenSquare `bson:"squares,omitempty" json:"squares,omitempty"`
}

// TokenHPBar is one HP/resource bar on the token. Either field-bound (Field != nil → reads a
// Character.Stats value, shared across every placement of that character) or manual (Field == nil →
// current/max live per-token in GameCharacter.TokenGear.BarValues). DefaultHidden is the blueprint's
// default player-visibility, overridable per-token via CharacterTokenGear.BarOverrides. This same
// struct is reused for GameCharacter.TokenGear.AddedBars (per-token-only bars) — there DefaultHidden
// is the literal (only) hidden flag, no override layer above it.
type TokenHPBar struct {
	ID            string        `bson:"id" json:"id"`
	Label         string        `bson:"label" json:"label"`
	Color         string        `bson:"color,omitempty" json:"color,omitempty"`
	Field         *FieldBinding `bson:"field,omitempty" json:"field,omitempty"`
	DefaultHidden bool          `bson:"defaultHidden,omitempty" json:"defaultHidden,omitempty"`
	// DefaultHideValues: hide the numeric current/max text while keeping the bar's fill visible.
	// For added bars this is the literal (only) flag; blueprint bars override it per-token via
	// CharacterTokenGear.BarHideValues.
	DefaultHideValues bool `bson:"defaultHideValues,omitempty" json:"defaultHideValues,omitempty"`
}

// TokenSlot is one of the 8 fixed ring positions. ID is generated once when the
// TokenDisplayConfig is initialized and never regenerated — it is the position's
// permanent identity, independent of Type. ConditionKey follows the same opaque,
// generated-once rule (see SkillOption.ID) so renaming an icon/label never orphans
// the value stored under it in Character.States.
type TokenSlot struct {
	ID   string `bson:"id" json:"id"`
	Type string `bson:"type" json:"type"` // "empty"|"icon"|"number"|"field"|"select"

	// type == "icon": Icon is the MUI icon component name; ConditionKey is written
	// into Character.States[].Name; ConditionLabel is the display label.
	Icon           string `bson:"icon,omitempty" json:"icon,omitempty"`
	ConditionKey   string `bson:"conditionKey,omitempty" json:"conditionKey,omitempty"`
	ConditionLabel string `bson:"conditionLabel,omitempty" json:"conditionLabel,omitempty"`

	// type == "number": manual counter, keyed into Character.TokenOverlay[slot.ID].
	NumberLabel string `bson:"numberLabel,omitempty" json:"numberLabel,omitempty"`

	// type == "field": read-only live binding to a character-sheet value.
	Field *FieldBinding `bson:"field,omitempty" json:"field,omitempty"`

	// type == "select": manual pick from a list, keyed into Character.TokenOverlay[slot.ID].
	SelectOptions []string `bson:"selectOptions,omitempty" json:"selectOptions,omitempty"`

	// DefaultHidden is the blueprint's default player-visibility for this ring position, before any
	// per-token override (CharacterTokenGear.SlotOverrides[id].Hidden).
	DefaultHidden bool `bson:"defaultHidden,omitempty" json:"defaultHidden,omitempty"`
}

// TokenSquare is a dynamic entry in the row under the token. It carries its own ID
// because squares can be added/removed/reordered (ring slots cannot), so position
// is not a safe storage key.
type TokenSquare struct {
	ID            string        `bson:"id" json:"id"`
	Type          string        `bson:"type" json:"type"` // "number"|"field"|"select"
	Caption       string        `bson:"caption" json:"caption"`
	NumberLabel   string        `bson:"numberLabel,omitempty" json:"numberLabel,omitempty"`
	Field         *FieldBinding `bson:"field,omitempty" json:"field,omitempty"`
	SelectOptions []string      `bson:"selectOptions,omitempty" json:"selectOptions,omitempty"`

	// DefaultHidden is the blueprint's default player-visibility for this square, before any
	// per-token override (CharacterTokenGear.SlotOverrides — squares reuse the slot override map keyed
	// by square id for visibility only; squares have no structural per-token override).
	DefaultHidden bool `bson:"defaultHidden,omitempty" json:"defaultHidden,omitempty"`
}

// FieldBinding points at a live character-sheet value. Key is always expressed
// relative to the Character's `stats` subdocument — the one canonical shape that
// unifies hardcoded systems (whose TokenFields advertise JSON storage paths) and
// custom systems (whose bindable fields come from the template Sections). MaxKey is
// only set for progress bindings (the HP bar).
type FieldBinding struct {
	Key    string `bson:"key" json:"key"`
	MaxKey string `bson:"maxKey,omitempty" json:"maxKey,omitempty"`
	Label  string `bson:"label,omitempty" json:"label,omitempty"`
}

// DefaultDiceButtons is the dice set pre-populated on newly created templates,
// matching the client-side fallback in DiceRollControls.
func DefaultDiceButtons() []int {
	return []int{4, 6, 8, 10, 12, 20, 100}
}

// SystemTemplate defines the structure of a custom game system built via the template creator.
type SystemTemplate struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	OwnerID  primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Name     string             `bson:"name" json:"name"`
	Version  int                `bson:"version" json:"version"`
	Sections []SectionDef       `bson:"sections" json:"sections"`
	Settings TemplateSettings   `bson:"settings,omitempty" json:"settings"`
	// IsPublic exposes the template to everyone creating a game (read-only for non-owners).
	IsPublic bool `bson:"isPublic" json:"isPublic"`
	// OriginTemplateID points to the template this one was cloned from (zero/absent for originals).
	OriginTemplateID primitive.ObjectID `bson:"originTemplateId,omitempty" json:"originTemplateId,omitempty"`
	// BaseSystem is "" for a genuine custom template (sheet described by Sections/FieldDef),
	// or a hardcoded system key ("warhammer4e"/"coc7e"/...) for a named token-display variant
	// of that system. When set, Sections is unused — the character sheet comes from the Go plugin
	// and the template exists purely to carry Settings.TokenDisplay.
	BaseSystem string    `bson:"baseSystem,omitempty" json:"baseSystem,omitempty"`
	CreatedAt  time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt  time.Time `bson:"updatedAt" json:"updatedAt"`

	// IsOwner is computed per-request (not persisted): true when the requesting
	// user owns this template. The client uses it to gate edit/delete actions.
	IsOwner bool `bson:"-" json:"isOwner"`
}

// FieldDef describes one field in a custom character sheet.
type FieldDef struct {
	Key                string         `bson:"key" json:"key"`
	Type               string         `bson:"type" json:"type"` // "attr"|"number"|"progress"|"text_short"|"text_long"|"checkbox"|"select"|"skill_table"|"skill_tree"|"weapons_table"
	Label              string         `bson:"label" json:"label"`
	Abbr               string         `bson:"abbr,omitempty" json:"abbr,omitempty"`
	Min                *int           `bson:"min,omitempty" json:"min,omitempty"`
	Max                *int           `bson:"max,omitempty" json:"max,omitempty"`
	ShowToPlayer       bool           `bson:"showToPlayer" json:"showToPlayer"`
	ShowOnShortCard    bool           `bson:"showOnShortCard,omitempty" json:"showOnShortCard,omitempty"`
	Rollable           bool           `bson:"rollable" json:"rollable"`
	HasAdvances        bool           `bson:"hasAdvances,omitempty" json:"hasAdvances,omitempty"`
	AdvancesLabel      string         `bson:"advancesLabel,omitempty" json:"advancesLabel,omitempty"`
	Options            []string       `bson:"options,omitempty" json:"options,omitempty"` // for type="select"
	Skills             []SkillOption  `bson:"skills,omitempty" json:"skills,omitempty"`   // for type="skill_table"
	AssignAttrToSkill  bool           `bson:"assignAttrToSkill,omitempty" json:"assignAttrToSkill,omitempty"`
	RollConfig         *RollConfig    `bson:"rollConfig,omitempty" json:"rollConfig,omitempty"`
	Tree               *SkillTreeNode `bson:"tree,omitempty" json:"tree,omitempty"` // only for type="skill_tree"
	PlayerCanAddSkills bool           `bson:"playerCanAddSkills,omitempty" json:"playerCanAddSkills,omitempty"`

	// weapons_table only: GM defines the columns; the player fills in weapon rows on the sheet.
	Columns       []WeaponColumn `bson:"columns,omitempty" json:"columns,omitempty"`
	DamageFormula []FormulaBlock `bson:"damageFormula,omitempty" json:"damageFormula,omitempty"`
	// PresetWeapons are GM-authored weapons attached to the template (weapons_table only).
	// An AlwaysOn preset is shown read-only on every character sheet and is never copied
	// into the character's stats — it is rendered and rolled straight from the template,
	// so a GM edit propagates to all players. A non-AlwaysOn preset is a catalog entry the
	// player can copy into an editable weapon row of their own.
	PresetWeapons []PresetWeapon `bson:"presetWeapons,omitempty" json:"presetWeapons,omitempty"`
}

// PresetWeapon is a GM-authored weapon template attached to a weapons_table field.
// Cells and Damage mirror WeaponRow exactly (column key → value, damage block id → number),
// so a preset is just a "row template": copying it to a player row is a plain value copy,
// and rolling an AlwaysOn preset reuses the same WeaponRow-based roll path.
type PresetWeapon struct {
	ID       string             `bson:"id" json:"id"`
	Cells    map[string]string  `bson:"cells,omitempty" json:"cells,omitempty"`
	Damage   map[string]float64 `bson:"damage,omitempty" json:"damage,omitempty"`
	AlwaysOn bool               `bson:"alwaysOn,omitempty" json:"alwaysOn,omitempty"`
}

// WeaponColumn defines one GM-authored column of a weapons_table field.
// Type is "text" | "number" | "select". For a select column the player picks from
// Options (manual list), unless OptionsFromSkills is true — then the choices are the
// character's skills and the picked skill drives the weapon's attack roll.
type WeaponColumn struct {
	Key               string   `bson:"key" json:"key"`
	Label             string   `bson:"label" json:"label"`
	Type              string   `bson:"type" json:"type"` // "text"|"number"|"select"
	Options           []string `bson:"options,omitempty" json:"options,omitempty"`
	OptionsFromSkills bool     `bson:"optionsFromSkills,omitempty" json:"optionsFromSkills,omitempty"`
}

// SkillTreeNode is a recursive tree node for hierarchical skill definitions.
// LinkedAttr can be set on any node (not just leaves) to associate it with a character attribute.
type SkillTreeNode struct {
	Key        string          `bson:"key" json:"key"`
	Label      string          `bson:"label" json:"label"`
	Children   []SkillTreeNode `bson:"children,omitempty" json:"children,omitempty"`
	LinkedAttr string          `bson:"linkedAttr,omitempty" json:"linkedAttr,omitempty"`
	Rollable   bool            `bson:"rollable" json:"rollable"`
}

// FormulaBlock is one element of a visual roll formula built in the template creator.
// The Type field controls which other fields are present:
//
//	"dice"      — standard die; Value is the die notation string ("d20", "d100", …)
//	"dice_attr" — die whose face count equals an attribute value; Key + Label identify the attr
//	"op"        — arithmetic operator; Value is "+", "-", "*", or "/"
//	"attr"      — character attribute value; Key + Label identify the attr
//	"const"     — literal number; Num holds the value
type FormulaBlock struct {
	ID    string   `bson:"id" json:"id"`
	Type  string   `bson:"type" json:"type"`
	Value string   `bson:"value,omitempty" json:"value,omitempty"` // dice notation or operator symbol
	Key   string   `bson:"key,omitempty" json:"key,omitempty"`
	Label string   `bson:"label,omitempty" json:"label,omitempty"`
	Num   *float64 `bson:"num,omitempty" json:"num,omitempty"` // for type="const"
}

// RollConfig defines how a rollable field or skill-tree node is rolled.
type RollConfig struct {
	// Formula is the ordered list of blocks that form the roll expression,
	// as built by the visual FormulaBuilder in the template creator.
	Formula []FormulaBlock `bson:"formula,omitempty" json:"formula,omitempty"`

	// RollMode selects the evaluation strategy: "traditional" (sum formula, compare to threshold)
	// or "dice_pool" (roll dice individually, count successes).
	RollMode string `bson:"rollMode,omitempty" json:"rollMode,omitempty"`

	SuccessType string `bson:"successType" json:"successType"` // "above_threshold"|"below_threshold"|"raw"
	// Threshold is a simple formula string evaluated at roll time, e.g. "skill*5".
	Threshold   string `bson:"threshold,omitempty" json:"threshold,omitempty"`
	CritSuccess bool   `bson:"critSuccess" json:"critSuccess"`
	CritFail    bool   `bson:"critFail" json:"critFail"`
	RollAdvType string `bson:"rollAdvType" json:"rollAdvType"` // "standard"|"advantage"|"disadvantage"

	// Dice-pool mode fields (only used when RollMode == "dice_pool").
	PoolSuccessThreshold int    `bson:"poolSuccessThreshold,omitempty" json:"poolSuccessThreshold,omitempty"`
	PoolSuccessCondition string `bson:"poolSuccessCondition,omitempty" json:"poolSuccessCondition,omitempty"` // "gte" | "eq"

	// Deprecated: superseded by Formula. Kept for backward compat with existing roller logic.
	FormulaType string `bson:"formulaType,omitempty" json:"formulaType,omitempty"`
	LinkedAttr  string `bson:"linkedAttr,omitempty" json:"linkedAttr,omitempty"`
}

// CreateTemplateRequest is the request body for POST /templates.
type CreateTemplateRequest struct {
	Name     string       `json:"name" binding:"required"`
	Sections []SectionDef `json:"sections"`
	// BaseSystem is set only when creating a named token-display variant of a hardcoded
	// system (e.g. "warhammer4e"); empty for genuine custom templates.
	BaseSystem string `json:"baseSystem,omitempty"`
}

// UpdateTemplateRequest is the request body for PATCH /templates/:id.
type UpdateTemplateRequest struct {
	Name     *string           `json:"name"`
	Sections []SectionDef      `json:"sections"`
	Settings *TemplateSettings `json:"settings"`
	IsPublic *bool             `json:"isPublic"`
}

// CloneTemplateRequest is the request body for POST /templates/:id/clone.
type CloneTemplateRequest struct {
	Name string `json:"name"` // full localized name (with "(copy)" suffix); optional
}
