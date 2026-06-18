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
	CreatedAt        time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt        time.Time          `bson:"updatedAt" json:"updatedAt"`

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
