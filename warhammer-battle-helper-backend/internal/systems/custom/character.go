package custom

// AttrValue stores base, advances, and computed current for an attribute field.
// current = base + advances, always recomputed by ComputeDerived.
type AttrValue struct {
	Base     int `bson:"base"     json:"base"`
	Advances int `bson:"advances" json:"advances"`
	Current  int `bson:"current"  json:"current"`
}

// CustomSkillNode holds metadata for a player-added skill inside a skill_tree field.
type CustomSkillNode struct {
	Label      string `bson:"label" json:"label"`
	LinkedAttr string `bson:"linkedAttr,omitempty" json:"linkedAttr,omitempty"`
}

// Stats holds character values for a custom-system character.
// Keys in Attributes and Skills match the field keys defined in the SystemTemplate.
// Skill keys for tree nodes use dot-path notation: "bron_biala.jednorecz.miecz".
// Skills reuse AttrValue so the same base/advances/current mechanic drives skill_table
// (with optional advances) and skill_tree (base only, current == base). Rolls sum base +
// advances directly (see skillValue) rather than trusting current — current is only the
// persisted convenience copy that ComputeDerived keeps in sync for display.
type Stats struct {
	Attributes       map[string]AttrValue       `bson:"attributes"                json:"attributes"`
	Skills           map[string]AttrValue       `bson:"skills"                    json:"skills"`
	Texts            map[string]string          `bson:"texts,omitempty"           json:"texts,omitempty"`
	Progress         map[string]ProgressValue   `bson:"progress,omitempty"        json:"progress,omitempty"`
	Numbers          map[string]int             `bson:"numbers,omitempty"         json:"numbers,omitempty"`
	CustomSkillNodes map[string]CustomSkillNode `bson:"customSkillNodes,omitempty" json:"customSkillNodes,omitempty"`
	FavoriteSkills   []string                   `bson:"favoriteSkills,omitempty"  json:"favoriteSkills,omitempty"`
	// DevelopmentSkills holds the keys of skills the player has marked as used this session, to be
	// improved between sessions (the Call of Cthulhu mechanic). Keys are the same ones used in
	// Skills: "${field.key}.${opt.id}" for a skill_table row, the dot-path for a tree node.
	// No Go code reads this — it exists in the struct because ComputeDerived round-trips stats
	// through Stats, so a key absent here would be dropped on the first save.
	DevelopmentSkills []string `bson:"developmentSkills,omitempty" json:"developmentSkills,omitempty"`
	// Weapons holds the player-added rows of each weapons_table field, keyed by field key.
	Weapons map[string][]WeaponRow `bson:"weapons,omitempty" json:"weapons,omitempty"`
	// FavoriteWeapons holds the ids of the weapon rows the player has starred. Every weapon is a
	// row in Weapons since PLAYRPG-288, so ids always resolve against Weapons.
	FavoriteWeapons []string `bson:"favoriteWeapons,omitempty" json:"favoriteWeapons,omitempty"`
	// Tables holds the player-added rows of each data_table field, keyed by field key.
	Tables map[string][]TableRow `bson:"tables,omitempty" json:"tables,omitempty"`
	// Images holds the URL of each image field (PLAYRPG-240), keyed by field key. Upload goes
	// through POST /avatars; only the returned URL is stored here.
	Images map[string]string `bson:"images,omitempty" json:"images,omitempty"`
}

// WeaponRow is one weapon in a weapons_table field — player-added, copied from the catalog, or
// seeded at creation from an AddOnCreate preset (then its ID is the preset's ID).
// Cells maps a WeaponColumn key to the entered value; Damage maps a DamageFormula block id to
// the text the player filled in: a die's faces ("6") or a ▢ expression ("1K4", "-1").
type WeaponRow struct {
	ID     string            `bson:"id" json:"id"`
	Cells  map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
	Damage map[string]string `bson:"damage,omitempty" json:"damage,omitempty"`
}

// TableRow is one player-added row in a data_table field. Cells maps a column key to the entered
// value; long_text columns are cells like any other.
type TableRow struct {
	ID    string            `bson:"id" json:"id"`
	Cells map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
}

// ProgressValue stores current/max for progress-type fields (e.g. HP).
type ProgressValue struct {
	Current int `bson:"current" json:"current"`
	Max     int `bson:"max" json:"max"`
}
