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
// (with optional advances) and skill_tree (base only, current == base). Rolls read current,
// falling back to base when current is not yet computed.
type Stats struct {
	Attributes       map[string]AttrValue       `bson:"attributes"                json:"attributes"`
	Skills           map[string]AttrValue       `bson:"skills"                    json:"skills"`
	Texts            map[string]string          `bson:"texts,omitempty"           json:"texts,omitempty"`
	Progress         map[string]ProgressValue   `bson:"progress,omitempty"        json:"progress,omitempty"`
	Numbers          map[string]int             `bson:"numbers,omitempty"         json:"numbers,omitempty"`
	CustomSkillNodes map[string]CustomSkillNode `bson:"customSkillNodes,omitempty" json:"customSkillNodes,omitempty"`
	FavoriteSkills   []string                   `bson:"favoriteSkills,omitempty"  json:"favoriteSkills,omitempty"`
	// Weapons holds the player-added rows of each weapons_table field, keyed by field key.
	Weapons map[string][]WeaponRow `bson:"weapons,omitempty" json:"weapons,omitempty"`
	// FavoriteWeapons holds the ids of GM preset weapons (PresetWeapon.ID) the player has
	// starred. Preset weapons live only in the template, so this per-player preference cannot
	// be stored on the weapon itself — unlike player-added rows, which carry WeaponRow.Favorite.
	FavoriteWeapons []string `bson:"favoriteWeapons,omitempty" json:"favoriteWeapons,omitempty"`
}

// WeaponRow is one player-added weapon in a weapons_table field.
// Cells maps a WeaponColumn key to the entered value; Damage maps a DamageFormula
// block id to the number the player filled in (dice count, faces, or constant).
type WeaponRow struct {
	ID       string             `bson:"id" json:"id"`
	Cells    map[string]string  `bson:"cells,omitempty" json:"cells,omitempty"`
	Damage   map[string]float64 `bson:"damage,omitempty" json:"damage,omitempty"`
	Favorite bool               `bson:"favorite,omitempty" json:"favorite,omitempty"`
}

// ProgressValue stores current/max for progress-type fields (e.g. HP).
type ProgressValue struct {
	Current int `bson:"current" json:"current"`
	Max     int `bson:"max" json:"max"`
}
