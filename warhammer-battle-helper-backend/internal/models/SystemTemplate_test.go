package models

import (
	"encoding/json"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// A "label" field carries its content in Text/TextColor/TextSize. SystemTemplate is decoded
// into this typed struct, so any key missing from the struct is dropped on read and erased by
// the next PATCH — silently. This test pins the round-trip so that cannot happen unnoticed.
func TestFieldDef_LabelRoundTripsThroughBSON(t *testing.T) {
	in := FieldDef{
		Key:       "label_1",
		Type:      "label",
		Label:     "Ostrzeżenie o mgle",
		Text:      "Uwaga: mgła\nzmniejsza widoczność",
		TextColor: "#8b2c2c",
		TextSize:  "heading",
	}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var out FieldDef
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if out.Text != in.Text {
		t.Errorf("Text = %q, want %q", out.Text, in.Text)
	}
	if out.TextColor != in.TextColor {
		t.Errorf("TextColor = %q, want %q", out.TextColor, in.TextColor)
	}
	if out.TextSize != in.TextSize {
		t.Errorf("TextSize = %q, want %q", out.TextSize, in.TextSize)
	}
	if out.Type != "label" {
		t.Errorf("Type = %q, want \"label\"", out.Type)
	}
}

// An empty style means "use the sheet default", and omitempty must keep those keys out of the
// stored document instead of writing empty strings into every non-label field.
func TestFieldDef_EmptyLabelStyleIsOmitted(t *testing.T) {
	raw, err := bson.Marshal(FieldDef{Key: "attr_1", Type: "attr"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{"text", "textColor", "textSize"} {
		if _, ok := doc[key]; ok {
			t.Errorf("key %q must be omitted when empty", key)
		}
	}
}

// A nested section (FEATURE-211) is a FieldDef whose Section pointer carries a whole
// SectionDef, which carries FieldDefs again — so one wrong or missing struct tag anywhere on
// that cycle would drop every subsection on read and let the next PATCH erase it from Mongo,
// flattening every GM's template with no error. Two levels are marshalled here, not one,
// because a single level cannot tell a working recursion from a tag that happens to survive
// exactly one hop. Both codecs matter: Mongo stores bson, the template PATCH arrives as JSON.
func TestFieldDef_NestedSectionRoundTripsThroughBSONAndJSON(t *testing.T) {
	deepest := FieldDef{Key: "txt_arrows", Type: "text_short", Label: "Strzały"}
	in := FieldDef{
		Key:   "sec_weapons",
		Type:  "section",
		Label: "",
		Section: &SectionDef{
			ID:      "sec_weapons",
			Title:   "Broń",
			Columns: 2,
			Fields: []FieldDef{
				{Key: "num_gold", Type: "number", Label: "Złoto"},
				{
					Key:  "sec_ammo",
					Type: "section",
					Section: &SectionDef{
						ID:      "sec_ammo",
						Title:   "Amunicja",
						Columns: 1,
						Fields:  []FieldDef{deepest},
					},
				},
			},
		},
	}

	// leaf walks the two-level nesting back down to the deepest field, failing loudly at
	// whichever hop the codec dropped instead of panicking on a nil pointer.
	leaf := func(t *testing.T, codec string, out FieldDef) {
		t.Helper()
		if out.Section == nil {
			t.Fatalf("%s: Section is nil at level 1", codec)
		}
		if out.Section.ID != "sec_weapons" || out.Section.Title != "Broń" || out.Section.Columns != 2 {
			t.Errorf("%s: level 1 SectionDef = %+v", codec, *out.Section)
		}
		if len(out.Section.Fields) != 2 {
			t.Fatalf("%s: level 1 has %d fields, want 2", codec, len(out.Section.Fields))
		}
		inner := out.Section.Fields[1]
		if inner.Section == nil {
			t.Fatalf("%s: Section is nil at level 2", codec)
		}
		if len(inner.Section.Fields) != 1 {
			t.Fatalf("%s: level 2 has %d fields, want 1", codec, len(inner.Section.Fields))
		}
		got := inner.Section.Fields[0]
		if got.Key != deepest.Key || got.Type != deepest.Type || got.Label != deepest.Label {
			t.Errorf("%s: deepest leaf = %+v, want %+v", codec, got, deepest)
		}
	}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("bson marshal: %v", err)
	}
	var fromBSON FieldDef
	if err := bson.Unmarshal(raw, &fromBSON); err != nil {
		t.Fatalf("bson unmarshal: %v", err)
	}
	leaf(t, "bson", fromBSON)

	encoded, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("json marshal: %v", err)
	}
	var fromJSON FieldDef
	if err := json.Unmarshal(encoded, &fromJSON); err != nil {
		t.Fatalf("json unmarshal: %v", err)
	}
	leaf(t, "json", fromJSON)
}

// A plain field carries no Section, and omitempty must keep the key out of the stored
// document rather than writing a null into every leaf of every template.
func TestFieldDef_NilSectionIsOmitted(t *testing.T) {
	raw, err := bson.Marshal(FieldDef{Key: "attr_1", Type: "attr"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := doc["section"]; ok {
		t.Error("key \"section\" must be omitted when nil")
	}
}
