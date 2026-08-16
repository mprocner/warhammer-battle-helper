package models

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// A "label" field carries its content in Text/TextColor/TextSize. SystemTemplate is decoded
// into this typed struct, so any key missing from the struct is dropped on read and erased by
// the next PATCH — silently. This test pins the round-trip so that cannot happen unnoticed.
func TestFieldDef_LabelRoundTripsThroughBSON(t *testing.T) {
	in := FieldDef{
		Key:          "label_1",
		Type:         "label",
		Label:        "Ostrzeżenie o mgle",
		Text:         "Uwaga: mgła\nzmniejsza widoczność",
		TextColor:    "#8b2c2c",
		TextSize:     "heading",
		ShowToPlayer: true,
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
