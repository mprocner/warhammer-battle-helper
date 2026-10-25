package models

import (
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SkillOption is one skill row of a "skill_table" field. ID is a stable, GM-opaque key
// generated once when the option is created; it never derives from Label, so renaming a
// skill does not orphan the value a player stored under "<fieldKey>.<id>". Attr links the
// skill to an attribute (empty unless the field has assignAttrToSkill enabled). Default is
// the base a freshly created character starts with (PLAYRPG-277); nil means "no default",
// which is not the same as a default of 0. It is ignored while the field derives the base
// from the attribute.
type SkillOption struct {
	ID      string `bson:"id" json:"id"`
	Label   string `bson:"label" json:"label"`
	Attr    string `bson:"attr,omitempty" json:"attr,omitempty"`
	Default *int   `bson:"default,omitempty" json:"default,omitempty"`
}

// AttrRow is one attribute of an "attr_table" field (PLAYRPG-235). Its ID is the attribute's
// key in Stats.Attributes: globally unique (genId), never a slug of the label and never prefixed
// with the table's key, so the "attr" / "dice_attr" blocks and SkillOption.Attr address a row
// exactly the way they address a standalone "attr" field.
type AttrRow struct {
	ID              string `bson:"id" json:"id"`
	Label           string `bson:"label" json:"label"`
	Abbr            string `bson:"abbr,omitempty" json:"abbr,omitempty"`
	Default         *int   `bson:"default,omitempty" json:"default,omitempty"`
	Min             *int   `bson:"min,omitempty" json:"min,omitempty"`
	Max             *int   `bson:"max,omitempty" json:"max,omitempty"`
	ShowOnShortCard bool   `bson:"showOnShortCard,omitempty" json:"showOnShortCard,omitempty"`
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

	// Modifier configures the roll-modifier prompt of a custom card (FEATURE-164). nil means
	// disabled, which is how every pre-existing template starts — no migration needed.
	Modifier *ModifierConfig `bson:"modifier,omitempty" json:"modifier,omitempty"`

	// SheetWidth is the character sheet window's opening width in pixels, authored by the GM in
	// the creator's General tab (FEATURE-212). 0 or absent means the client's default — a plain
	// int, not a pointer, because 0 is not a legal width (the slider floor is 600), so omitempty
	// cannot erase a meaningful value the way it could for FieldDef.Default, whose 0 is real.
	// Nothing in Go reads it: the client is the only consumer.
	SheetWidth int `bson:"sheetWidth,omitempty" json:"sheetWidth,omitempty"`
}

// ModifierConfig is the template-wide setup of the roll-modifier prompt shown before a roll on
// a custom card. It holds two independent targets because RollMode ("traditional" | "dice_pool")
// is per field while this config is per template: the mechanic picks its own target, so a card
// mixing both modes never applies a rule that makes no sense for one of them.
type ModifierConfig struct {
	Enabled bool `bson:"enabled" json:"enabled"`

	// TraditionalTarget: "roll" (added to the result, default) | "threshold" (added to the
	// success threshold — the roll-under convention, e.g. WFRP/CoC).
	TraditionalTarget string `bson:"traditionalTarget,omitempty" json:"traditionalTarget,omitempty"`
	// PoolTarget: "dice_count" (adds/removes dice, default) | "success_threshold".
	PoolTarget string `bson:"poolTarget,omitempty" json:"poolTarget,omitempty"`

	// Step is the prompt input's step; 0 reads as 1. Min/Max are plain ints, not pointers: the
	// "no limits" case is Min and Max BOTH zero, so no field needs to tell "unset" from "0".
	Step int `bson:"step,omitempty" json:"step,omitempty"`
	Min  int `bson:"min,omitempty" json:"min,omitempty"`
	Max  int `bson:"max,omitempty" json:"max,omitempty"`

	Presets []ModifierPreset `bson:"presets,omitempty" json:"presets,omitempty"`
}

// ModifierPreset is one quick-pick button in the prompt, e.g. {-30, "Very hard"}. Label is
// GM-authored free text, so it is never run through i18n.
type ModifierPreset struct {
	Value int    `bson:"value" json:"value"`
	Label string `bson:"label,omitempty" json:"label,omitempty"`
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

// TemplateMember is one user's access to a template. Stored in SystemTemplate.Members.
type TemplateMember struct {
	UserID primitive.ObjectID `bson:"userId" json:"userId"`
	Role   string             `bson:"role" json:"role"`
}

// TemplatePermissions is what the requesting user may do with a template, computed per request
// from their role. The client gates its UI on these flags, never on the role name.
type TemplatePermissions struct {
	Edit   bool `json:"edit"`
	Share  bool `json:"share"`
	Delete bool `json:"delete"`
}

// TemplateMemberView is one member as an owner sees it in the access card.
type TemplateMemberView struct {
	UserID primitive.ObjectID `json:"userId"`
	Email  string             `json:"email"`
	Role   string             `json:"role"`
	IsMe   bool               `json:"isMe,omitempty"`
}

// SystemTemplate defines the structure of a custom game system built via the template creator.
type SystemTemplate struct {
	ID   primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name string             `bson:"name" json:"name"`
	// Description is the author's rich-text blurb shown in the lobby; sanitized HTML.
	Description string `bson:"description,omitempty" json:"description,omitempty"`
	// Language is the ISO 639-1 code the template is written in; "" means unspecified, which is
	// also what templates saved before PLAYRPG-261 read as.
	Language string           `bson:"language,omitempty" json:"language,omitempty"`
	Version  int              `bson:"version" json:"version"`
	Sections []SectionDef     `bson:"sections" json:"sections"`
	Settings TemplateSettings `bson:"settings,omitempty" json:"settings"`
	// IsPublic lets every logged-in user use (create a game from, clone) the template. Editing still needs a member role.
	IsPublic bool `bson:"isPublic" json:"isPublic"`
	// Members lists everyone with access and their role; always at least one owner. Not
	// serialised: only owners see the list, and they get it resolved to emails in MembersView.
	Members []TemplateMember `bson:"members" json:"-"`
	// UpdatedBy is the user behind the last save that changed the content. The creator names
	// them when a save is rejected as a version conflict.
	UpdatedBy primitive.ObjectID `bson:"updatedBy,omitempty" json:"-"`
	// MyRole is computed per request: the viewer's role, "" for a public template they are not
	// a member of.
	MyRole string `bson:"-" json:"myRole,omitempty"`
	// Permissions is computed per request from MyRole.
	Permissions TemplatePermissions `bson:"-" json:"permissions"`
	// MembersView is computed per request and filled ONLY for a viewer who may share: who else
	// has access is nobody else's business.
	MembersView []TemplateMemberView `bson:"-" json:"members,omitempty"`
	// OwnerEmails is computed per request and filled ONLY for a member who is not an owner.
	// Public templates never carry it, so no account can harvest authors' addresses.
	OwnerEmails []string `bson:"-" json:"ownerEmails,omitempty"`
	// OriginTemplateID points to the template this one was cloned from (zero/absent for originals).
	OriginTemplateID primitive.ObjectID `bson:"originTemplateId,omitempty" json:"originTemplateId,omitempty"`
	// BaseSystem is "" for a genuine custom template (sheet described by Sections/FieldDef),
	// or a hardcoded system key ("warhammer4e"/"coc7e"/...) for a named token-display variant
	// of that system. When set, Sections is unused — the character sheet comes from the Go plugin
	// and the template exists purely to carry Settings.TokenDisplay.
	BaseSystem string    `bson:"baseSystem,omitempty" json:"baseSystem,omitempty"`
	CreatedAt  time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt  time.Time `bson:"updatedAt" json:"updatedAt"`
}

// FieldDef describes one field in a custom character sheet.
type FieldDef struct {
	Key   string `bson:"key" json:"key"`
	Type  string `bson:"type" json:"type"` // "attr"|"attr_table"|"number"|"computed"|"progress"|"text_short"|"text_long"|"checkbox"|"select"|"skill_table"|"skill_tree"|"weapons_table"|"data_table"|"label"|"section"|"char_name"|"char_avatar"|"image"
	Label string `bson:"label" json:"label"`
	Abbr  string `bson:"abbr,omitempty" json:"abbr,omitempty"`

	// Label-only fields (type == "label"). A label is pure sheet decoration: it holds no
	// per-character value, so its Key never appears in Character.Stats. Label carries the
	// creator-facing name; Text is what renders on the sheet.
	Text      string `bson:"text,omitempty" json:"text,omitempty"`
	TextColor string `bson:"textColor,omitempty" json:"textColor,omitempty"` // hex; empty = default sheet text color
	TextSize  string `bson:"textSize,omitempty" json:"textSize,omitempty"`   // "small"|"normal"|"large"|"heading"; empty = "normal"

	// RichText turns a text_long field into a styled editor (PLAYRPG-256); its value in
	// Stats.Texts is then sanitized HTML instead of plain text. Ignored on every other type.
	// Off by default, so omitempty is safe: an absent key reads as "plain text".
	RichText bool `bson:"richText,omitempty" json:"richText,omitempty"`

	Min *int `bson:"min,omitempty" json:"min,omitempty"`
	Max *int `bson:"max,omitempty" json:"max,omitempty"`
	// Default is the value written into a freshly created character's stats for this field
	// ("attr" and "number" only). For "computed" it is never written anywhere: the sheet shows it
	// when the formula cannot be evaluated. Nil = no default; the character starts with the key absent,
	// exactly as before. A pointer, not an int, because 0 is a legal default and `omitempty`
	// on a plain int would erase it.
	Default *int `bson:"default,omitempty" json:"default,omitempty"`
	// Step is the arrow-key / spinner increment for "attr" and "number" inputs on the sheet.
	// 0 or absent means 1 — it is a plain int, not a pointer, because 0 is not a legal step,
	// so omitempty cannot erase a meaningful value the way it could for Default. Nothing in Go
	// reads it: the sheet renderer is the only consumer.
	Step            int           `bson:"step,omitempty" json:"step,omitempty"`
	ShowOnShortCard bool          `bson:"showOnShortCard,omitempty" json:"showOnShortCard,omitempty"`
	Rollable        bool          `bson:"rollable" json:"rollable"`
	HasAdvances     bool          `bson:"hasAdvances,omitempty" json:"hasAdvances,omitempty"`
	AdvancesLabel   string        `bson:"advancesLabel,omitempty" json:"advancesLabel,omitempty"`
	Options         []string      `bson:"options,omitempty" json:"options,omitempty"` // for type="select"
	Skills          []SkillOption `bson:"skills,omitempty" json:"skills,omitempty"`   // for type="skill_table"
	// AttrRows lists the attributes of an "attr_table". Table-level settings (HasAdvances,
	// AdvancesLabel, Step, Rollable, RollConfig) apply to every row; see expandAttrTable.
	AttrRows          []AttrRow `bson:"attrRows,omitempty" json:"attrRows,omitempty"`
	AssignAttrToSkill bool      `bson:"assignAttrToSkill,omitempty" json:"assignAttrToSkill,omitempty"`
	// BaseFromAttr replaces a skill's base value with its linked attribute's current value, so the
	// base is derived at read time and never stored. Meaningless without both AssignAttrToSkill (the
	// row needs an attribute to read) and HasAdvances (with no advances column the base IS the total,
	// and a wholly derived total is just the attribute under another name). The creator enforces both
	// as a precondition; the renderer and the roller re-check them, because a hand-edited template can
	// carry the flag without them.
	BaseFromAttr       bool           `bson:"baseFromAttr,omitempty" json:"baseFromAttr,omitempty"`
	RollConfig         *RollConfig    `bson:"rollConfig,omitempty" json:"rollConfig,omitempty"`
	Tree               *SkillTreeNode `bson:"tree,omitempty" json:"tree,omitempty"` // only for type="skill_tree"
	PlayerCanAddSkills bool           `bson:"playerCanAddSkills,omitempty" json:"playerCanAddSkills,omitempty"`

	// FEATURE-217 display flags for skill_table and skill_tree.
	//
	// HideFavorites is INVERTED on purpose, unlike every other flag here: absent means the
	// favourites star IS shown, so templates written before this feature keep it without a data
	// migration. A positive "showFavorites" cannot work — omitempty drops a false bool, so the
	// GM's "off" would come back as absent and read as "on". Do not rename it to the positive form.
	HideFavorites bool `bson:"hideFavorites,omitempty" json:"hideFavorites,omitempty"`
	// ShowDevelopment adds a per-skill checkbox the player ticks for skills used this session
	// (the Call of Cthulhu improvement mechanic). Stored per character in Stats.DevelopmentSkills.
	ShowDevelopment bool `bson:"showDevelopment,omitempty" json:"showDevelopment,omitempty"`
	// SortAlphabetically orders a table's rows, or a tree's siblings within each level, by label.
	// A weapons_table or data_table orders by SortColumn instead.
	SortAlphabetically bool `bson:"sortAlphabetically,omitempty" json:"sortAlphabetically,omitempty"`
	// SortColumn is the key of the short text column a sorted weapons_table or data_table orders
	// by. Empty, or no longer a text column, means the first text column. Rendering only.
	SortColumn string `bson:"sortColumn,omitempty" json:"sortColumn,omitempty"`
	// TwoColumns splits the field into two columns side by side. The unit of the split differs by
	// type: a table (skill, weapons or data table) splits by row, a tree by root branch (its
	// indent encodes hierarchy, so a branch may never be torn between columns). Rendering only —
	// nothing in Go reads it.
	TwoColumns bool `bson:"twoColumns,omitempty" json:"twoColumns,omitempty"`

	// weapons_table only: GM defines the columns; the player fills in weapon rows on the sheet.
	Columns       []WeaponColumn `bson:"columns,omitempty" json:"columns,omitempty"`
	DamageFormula []FormulaBlock `bson:"damageFormula,omitempty" json:"damageFormula,omitempty"`
	// PresetWeapons are GM-authored weapons attached to the template (weapons_table only).
	// An AlwaysOn preset is shown read-only on every character sheet and is never copied
	// into the character's stats — it is rendered and rolled straight from the template,
	// so a GM edit propagates to all players. A non-AlwaysOn preset is a catalog entry the
	// player can copy into an editable weapon row of their own.
	PresetWeapons []PresetWeapon `bson:"presetWeapons,omitempty" json:"presetWeapons,omitempty"`
	// PresetRows are GM-authored rows of a data_table field — the data_table counterpart of
	// PresetWeapons, with the same AlwaysOn semantics (rendered from the template, never copied
	// into stats) and the same catalog semantics for the rest. data_table reuses Columns.
	PresetRows []PresetRow `bson:"presetRows,omitempty" json:"presetRows,omitempty"`

	// Formula is the expression of a "computed" field. The front end evaluates it at render time
	// from the character's attributes and numbers and never stores the result — Go only has to
	// carry it through a template save.
	Formula []FormulaBlock `bson:"formula,omitempty" json:"formula,omitempty"`

	// Section holds the nested section when Type == "section" (FEATURE-211). A section field
	// carries no per-character value — its Key never appears in Character.Stats, exactly like
	// "label". The recursion runs SectionDef -> FieldDef -> *SectionDef, so this is a pointer,
	// not a value: a value would make the struct infinitely sized.
	Section *SectionDef `bson:"section,omitempty" json:"section,omitempty"`
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

// PresetRow is a GM-authored row of a data_table field. A separate type from PresetWeapon because
// a data row has no damage: sharing the type would carry a field that is always empty.
type PresetRow struct {
	ID       string            `bson:"id" json:"id"`
	Cells    map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
	AlwaysOn bool              `bson:"alwaysOn,omitempty" json:"alwaysOn,omitempty"`
}

// WeaponColumn defines one GM-authored column of a weapons_table or data_table field.
// Type is "text" | "number" | "select", plus "long_text" in a data_table only. For a select
// column the player picks from Options (manual list), unless OptionsFromSkills is true (weapons
// only) — then the choices are the character's skills and the picked skill drives the attack roll.
type WeaponColumn struct {
	Key               string   `bson:"key" json:"key"`
	Label             string   `bson:"label" json:"label"`
	Type              string   `bson:"type" json:"type"` // "text"|"number"|"select"|"long_text"
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

	// LinkedAttr is the fallback attribute for attr_linked / dice_skill_attr blocks, used when
	// the live source (SkillTreeNode.LinkedAttr, SkillOption.Attr, CustomSkillNodes[].LinkedAttr)
	// is empty. Looks legacy, is not: resolveRollConfig reads it on every roll.
	LinkedAttr string `bson:"linkedAttr,omitempty" json:"linkedAttr,omitempty"`
}

// CreateTemplateRequest is the request body for POST /templates.
type CreateTemplateRequest struct {
	Name        string       `json:"name" binding:"required"`
	Sections    []SectionDef `json:"sections"`
	Description *string      `json:"description"`
	Language    *string      `json:"language"`
	// BaseSystem is set only when creating a named token-display variant of a hardcoded
	// system (e.g. "warhammer4e"); empty for genuine custom templates.
	BaseSystem string `json:"baseSystem,omitempty"`
}

// UpdateTemplateRequest is the request body for PATCH /templates/:id. Version is the template
// version the client last saw; the save is refused with 409 when it is stale.
type UpdateTemplateRequest struct {
	Name        *string           `json:"name"`
	Sections    []SectionDef      `json:"sections"`
	Settings    *TemplateSettings `json:"settings"`
	Description *string           `json:"description"`
	Language    *string           `json:"language"`
	Version     *int              `json:"version"`
}

// SetTemplateVisibilityRequest is the request body for PATCH /templates/:id/visibility.
type SetTemplateVisibilityRequest struct {
	IsPublic *bool `json:"isPublic" binding:"required"`
}

// AddTemplateMemberRequest is the request body for POST /templates/:id/members.
type AddTemplateMemberRequest struct {
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role" binding:"required"`
}

// SetTemplateMemberRoleRequest is the request body for PATCH /templates/:id/members/:userId.
type SetTemplateMemberRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

// CloneTemplateRequest is the request body for POST /templates/:id/clone.
type CloneTemplateRequest struct {
	Name string `json:"name"` // full localized name (with "(copy)" suffix); optional
}

// Field types bound to the character document rather than to Stats (PLAYRPG-240). A char_name
// field edits Character.Name and a char_avatar field edits Character.Avatar, so neither ever
// has a key in Stats. An image field stores its URL in the custom system's Stats.Images.
const (
	FieldTypeCharName   = "char_name"
	FieldTypeCharAvatar = "char_avatar"
	FieldTypeImage      = "image"
)

// Template validation errors. The messages are stable codes, not prose: handlers return them
// verbatim and the frontend maps each one to a translated message.
var (
	ErrMissingCharName     = errors.New("template_missing_char_name")
	ErrDuplicateCharName   = errors.New("template_duplicate_char_name")
	ErrDuplicateCharAvatar = errors.New("template_duplicate_char_avatar")
)

// IsTemplateValidationError reports whether err is one of the template validation errors, so
// handlers can answer 400 instead of 500.
func IsTemplateValidationError(err error) bool {
	return errors.Is(err, ErrMissingCharName) ||
		errors.Is(err, ErrDuplicateCharName) ||
		errors.Is(err, ErrDuplicateCharAvatar) ||
		errors.Is(err, ErrInvalidTemplateLanguage) ||
		errors.Is(err, ErrTemplateDescriptionTooLong) ||
		errors.Is(err, ErrTemplateAboutOnVariant)
}

// CountFieldsOfType counts leaf fields of the given type at any depth. Nested sections
// (Type == "section") are descended into, never counted themselves.
func (t *SystemTemplate) CountFieldsOfType(typ string) int {
	n := 0
	var visit func(fields []FieldDef)
	visit = func(fields []FieldDef) {
		for _, f := range fields {
			if f.Type == "section" {
				if f.Section != nil {
					visit(f.Section.Fields)
				}
				continue
			}
			if f.Type == typ {
				n++
			}
		}
	}
	for _, s := range t.Sections {
		visit(s.Fields)
	}
	return n
}

// ValidateSingletonFields rejects a template with more than one char_name or char_avatar field.
// A missing char_name is allowed: the creator autosaves drafts, and a draft that has no name
// field yet is legitimate. ValidateForGame is the stricter check for templates entering a game.
func (t *SystemTemplate) ValidateSingletonFields() error {
	if t.CountFieldsOfType(FieldTypeCharName) > 1 {
		return ErrDuplicateCharName
	}
	if t.CountFieldsOfType(FieldTypeCharAvatar) > 1 {
		return ErrDuplicateCharAvatar
	}
	return nil
}

// ValidateForGame is the check for a custom template that is about to back a game: on top of
// the singleton rule, it requires exactly one char_name, because without it players have no
// way to edit their character's name.
func (t *SystemTemplate) ValidateForGame() error {
	if err := t.ValidateSingletonFields(); err != nil {
		return err
	}
	if t.CountFieldsOfType(FieldTypeCharName) == 0 {
		return ErrMissingCharName
	}
	return nil
}
