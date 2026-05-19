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
type Stats struct {
	Attributes       map[string]AttrValue       `bson:"attributes"              json:"attributes"`
	Skills           map[string]int             `bson:"skills"                  json:"skills"`
	Texts            map[string]string          `bson:"texts,omitempty"         json:"texts,omitempty"`
	Progress         map[string]ProgressValue   `bson:"progress,omitempty"      json:"progress,omitempty"`
	CustomSkillNodes map[string]CustomSkillNode `bson:"customSkillNodes,omitempty" json:"customSkillNodes,omitempty"`
}

// ProgressValue stores current/max for progress-type fields (e.g. HP).
type ProgressValue struct {
	Current int `bson:"current" json:"current"`
	Max     int `bson:"max" json:"max"`
}
