package models

import (
	"encoding/json"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsontype"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/x/bsonx/bsoncore"
)

// FlexOption is a skill option that is either a plain label string or a {label, attr} object.
// Plain strings are used by "select" field types; objects are used by "skill_table" when
// assignAttrToSkill is enabled. JSON and BSON marshaling preserve whichever form was stored.
type FlexOption struct {
	Label string
	Attr  string // empty when the option was stored as a plain string
}

func (f FlexOption) MarshalJSON() ([]byte, error) {
	if f.Attr == "" {
		return json.Marshal(f.Label)
	}
	return json.Marshal(struct {
		Label string `json:"label"`
		Attr  string `json:"attr,omitempty"`
	}{Label: f.Label, Attr: f.Attr})
}

func (f *FlexOption) UnmarshalJSON(data []byte) error {
	if len(data) > 0 && data[0] == '"' {
		return json.Unmarshal(data, &f.Label)
	}
	var obj struct {
		Label string `json:"label"`
		Attr  string `json:"attr,omitempty"`
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		return err
	}
	f.Label = obj.Label
	f.Attr = obj.Attr
	return nil
}

func (f FlexOption) MarshalBSONValue() (bsontype.Type, []byte, error) {
	if f.Attr == "" {
		return bson.TypeString, bsoncore.AppendString(nil, f.Label), nil
	}
	idx, doc := bsoncore.AppendDocumentStart(nil)
	doc = bsoncore.AppendStringElement(doc, "label", f.Label)
	doc = bsoncore.AppendStringElement(doc, "attr", f.Attr)
	doc, err := bsoncore.AppendDocumentEnd(doc, idx)
	if err != nil {
		return 0, nil, err
	}
	return bson.TypeEmbeddedDocument, doc, nil
}

func (f *FlexOption) UnmarshalBSONValue(t bsontype.Type, data []byte) error {
	switch t {
	case bson.TypeString:
		s, _, ok := bsoncore.ReadString(data)
		if !ok {
			return fmt.Errorf("invalid BSON string for FlexOption")
		}
		f.Label = s
	case bson.TypeEmbeddedDocument:
		doc := bsoncore.Document(data)
		if v, err := doc.LookupErr("label"); err == nil {
			f.Label, _ = v.StringValueOK()
		}
		if v, err := doc.LookupErr("attr"); err == nil {
			f.Attr, _ = v.StringValueOK()
		}
	default:
		return fmt.Errorf("unsupported BSON type for FlexOption: %v", t)
	}
	return nil
}

// SectionDef groups related fields under a titled section with a column layout.
type SectionDef struct {
	ID      string     `bson:"id" json:"id"`
	Title   string     `bson:"title" json:"title"`
	Columns int        `bson:"columns" json:"columns"` // 1, 2, or 3
	Fields  []FieldDef `bson:"fields" json:"fields"`
}

// SystemTemplate defines the structure of a custom game system built via the template creator.
type SystemTemplate struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	OwnerID   primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Name      string             `bson:"name" json:"name"`
	Version   int                `bson:"version" json:"version"`
	Sections  []SectionDef       `bson:"sections" json:"sections"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// FieldDef describes one field in a custom character sheet.
type FieldDef struct {
	Key                string         `bson:"key" json:"key"`
	Type               string         `bson:"type" json:"type"` // "attr"|"number"|"progress"|"text_short"|"text_long"|"checkbox"|"select"|"skill_table"|"skill_tree"
	Label              string         `bson:"label" json:"label"`
	Abbr               string         `bson:"abbr,omitempty" json:"abbr,omitempty"`
	Min                *int           `bson:"min,omitempty" json:"min,omitempty"`
	Max                *int           `bson:"max,omitempty" json:"max,omitempty"`
	ShowToPlayer       bool           `bson:"showToPlayer" json:"showToPlayer"`
	ShowOnShortCard    bool           `bson:"showOnShortCard,omitempty" json:"showOnShortCard,omitempty"`
	Rollable           bool           `bson:"rollable" json:"rollable"`
	HasAdvances        bool           `bson:"hasAdvances,omitempty" json:"hasAdvances,omitempty"`
	AdvancesLabel      string         `bson:"advancesLabel,omitempty" json:"advancesLabel,omitempty"`
	Options            []FlexOption   `bson:"options,omitempty" json:"options,omitempty"` // for type="select" and "skill_table"
	AssignAttrToSkill  bool           `bson:"assignAttrToSkill,omitempty" json:"assignAttrToSkill,omitempty"`
	RollConfig         *RollConfig    `bson:"rollConfig,omitempty" json:"rollConfig,omitempty"`
	Tree               *SkillTreeNode `bson:"tree,omitempty" json:"tree,omitempty"` // only for type="skill_tree"
	PlayerCanAddSkills bool           `bson:"playerCanAddSkills,omitempty" json:"playerCanAddSkills,omitempty"`
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

	SuccessType string `bson:"successType" json:"successType"` // "above_threshold"|"below_threshold"|"raw"
	// Threshold is a simple formula string evaluated at roll time, e.g. "skill*5".
	Threshold   string `bson:"threshold,omitempty" json:"threshold,omitempty"`
	CritSuccess bool   `bson:"critSuccess" json:"critSuccess"`
	CritFail    bool   `bson:"critFail" json:"critFail"`
	RollAdvType string `bson:"rollAdvType" json:"rollAdvType"` // "standard"|"advantage"|"disadvantage"

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
	Name     *string      `json:"name"`
	Sections []SectionDef `json:"sections"`
}
