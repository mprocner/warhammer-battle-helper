package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

func boolp(b bool) *bool        { return &b }
func floatp(f float64) *float64 { return &f }
func ovValue(n float64) *models.TokenOverlayValue {
	return &models.TokenOverlayValue{Number: floatp(n)}
}

// statsRaw builds a bson.Raw stats doc from a map.
func statsRaw(t *testing.T, m bson.M) bson.Raw {
	b, err := bson.Marshal(m)
	if err != nil {
		t.Fatalf("marshal stats: %v", err)
	}
	return b
}

// A blueprint with 8 positions. pos0 = field "Wounds" (visible), pos1 = icon "Fear" (visible),
// pos2 = field "Corruption" (HIDDEN by default), rest empty. One visible manual bar (field-bound
// "Wounds") and one default-hidden bar.
func sampleBlueprint() *models.TokenDisplayConfig {
	slots := [8]models.TokenSlot{
		{ID: "p0", Type: "field", Field: &models.FieldBinding{Key: "wounds.current"}},
		{ID: "p1", Type: "icon", ConditionKey: "fear", ConditionLabel: "Fear"},
		{ID: "p2", Type: "field", Field: &models.FieldBinding{Key: "corruption"}, DefaultHidden: true},
		{ID: "p3", Type: "empty"},
		{ID: "p4", Type: "empty"},
		{ID: "p5", Type: "empty"},
		{ID: "p6", Type: "empty"},
		{ID: "p7", Type: "empty"},
	}
	return &models.TokenDisplayConfig{
		Enabled: true,
		Slots:   slots,
		HPBars: []models.TokenHPBar{
			{ID: "bpWounds", Label: "Wounds", Field: &models.FieldBinding{Key: "wounds.current", MaxKey: "wounds.max"}},
			{ID: "bpSecret", Label: "Secret", Field: &models.FieldBinding{Key: "corruption"}, DefaultHidden: true},
		},
	}
}

// The core anti-leak scenario: position 0's blueprint field "Wounds" is overridden on THIS token to
// an icon "Enraged" (both visible). The card-less viewer must receive Enraged and must NOT receive
// the Wounds stat value at that position.
func TestMask_OverrideReplacesFieldWithIcon_NoLeak(t *testing.T) {
	blueprint := sampleBlueprint()
	stats := statsRaw(t, bson.M{
		"wounds":     bson.M{"current": 12, "max": 20},
		"corruption": 7,
		"secret":     "should-never-appear",
	})
	states := []models.CharacterState{{Name: "fear", Level: 1}, {Name: "enraged", Level: 2}}

	gear := &models.CharacterTokenGear{
		SlotOverrides: map[string]models.SlotOverride{
			"p0": {Slot: &models.TokenSlot{ID: "p0", Type: "icon", ConditionKey: "enraged", ConditionLabel: "Enraged"}},
		},
	}

	view := buildMaskedTokenView(blueprint, gear, stats, states)
	if view == nil {
		t.Fatal("expected a view")
	}

	// Position 0 now renders the icon override, not the Wounds field.
	p0 := view.Slots[0]
	if p0 == nil || p0.Slot.Type != "icon" || p0.Slot.ConditionKey != "enraged" {
		t.Fatalf("pos0 should be the Enraged icon override, got %+v", p0)
	}
	if p0.Value != nil {
		t.Fatalf("pos0 icon must carry no baked value (it uses States), got %v", p0.Value)
	}

	// The Wounds RING value must not appear at pos0. The Wounds BAR is still visible (separate
	// element), so 12 legitimately appears there — assert instead that no *stat path* leaked and that
	// the hidden corruption value (7) is nowhere.
	for i, s := range view.Slots {
		if s != nil && s.Value != nil {
			if f, ok := s.Value.(float64); ok && f == 7 {
				t.Fatalf("hidden corruption value leaked at slot %d", i)
			}
		}
	}

	// States filtered to visible icon conditions: fear (pos1) + enraged (pos0 override). No others.
	if len(view.States) != 2 {
		t.Fatalf("expected 2 visible states (fear, enraged), got %d: %+v", len(view.States), view.States)
	}

	// Bars: only the visible Wounds bar (current 12, max 20). The default-hidden "Secret" bar (bound
	// to corruption) must be absent — neither its definition nor the corruption value leaks.
	if len(view.Bars) != 1 {
		t.Fatalf("expected exactly 1 visible bar, got %d: %+v", len(view.Bars), view.Bars)
	}
	if view.Bars[0].ID != "bpWounds" || view.Bars[0].Current != 12 || view.Bars[0].Max != 20 {
		t.Fatalf("wounds bar wrong: %+v", view.Bars[0])
	}
}

// A blueprint-visible field slot hidden by a per-token override must vanish entirely.
func TestMask_PerTokenHidesVisibleSlot(t *testing.T) {
	blueprint := sampleBlueprint()
	stats := statsRaw(t, bson.M{"wounds": bson.M{"current": 5, "max": 10}, "corruption": 3})
	gear := &models.CharacterTokenGear{
		SlotOverrides: map[string]models.SlotOverride{
			"p0": {Hidden: boolp(true)}, // hide the Wounds ring slot on this token
		},
	}
	view := buildMaskedTokenView(blueprint, gear, stats, nil)
	if view.Slots[0] != nil {
		t.Fatalf("pos0 should be hidden (nil), got %+v", view.Slots[0])
	}
}

// A per-token override can REVEAL a blueprint-default-hidden slot, and its field value then appears.
func TestMask_PerTokenRevealsHiddenSlot(t *testing.T) {
	blueprint := sampleBlueprint()
	stats := statsRaw(t, bson.M{"corruption": 9})
	gear := &models.CharacterTokenGear{
		SlotOverrides: map[string]models.SlotOverride{
			"p2": {Hidden: boolp(false)}, // reveal the normally-hidden Corruption field slot
		},
	}
	view := buildMaskedTokenView(blueprint, gear, stats, nil)
	if view.Slots[2] == nil {
		t.Fatal("pos2 should be revealed")
	}
	// Field slot values keep their BSON numeric type (int32 here); JSON-encodes to 9 for the client.
	if toFloat(view.Slots[2].Value) != 9 {
		t.Fatalf("pos2 should show corruption 9, got %v", view.Slots[2].Value)
	}
}

// A hidden added bar leaks neither its definition nor value; a visible added manual bar bakes value.
func TestMask_AddedBars(t *testing.T) {
	blueprint := &models.TokenDisplayConfig{Enabled: true, Slots: [8]models.TokenSlot{
		{ID: "p0"}, {ID: "p1"}, {ID: "p2"}, {ID: "p3"}, {ID: "p4"}, {ID: "p5"}, {ID: "p6"}, {ID: "p7"},
	}}
	gear := &models.CharacterTokenGear{
		AddedBars: []models.TokenHPBar{
			{ID: "rage", Label: "Rage"},
			{ID: "ritual", Label: "Secret Ritual", DefaultHidden: true},
		},
		BarValues: map[string]models.HPBarValue{
			"rage":   {Current: 8, Max: 10},
			"ritual": {Current: 3, Max: 5},
		},
	}
	view := buildMaskedTokenView(blueprint, gear, nil, nil)
	if len(view.Bars) != 1 {
		t.Fatalf("expected only the visible Rage bar, got %d: %+v", len(view.Bars), view.Bars)
	}
	if view.Bars[0].ID != "rage" || view.Bars[0].Current != 8 || view.Bars[0].Max != 10 {
		t.Fatalf("rage bar wrong: %+v", view.Bars[0])
	}
}

// A numbers-hidden bar stays visible but ships NO raw numbers: current/max are zeroed and a baked
// pct carries the fill. Covers both the per-token override (blueprint bar) and an added bar's flag.
func TestMask_HideValuesBar(t *testing.T) {
	blueprint := sampleBlueprint() // bpWounds bar = field wounds.current / wounds.max, visible
	stats := statsRaw(t, bson.M{"wounds": bson.M{"current": 6, "max": 10}, "corruption": 1})
	gear := &models.CharacterTokenGear{
		BarHideValues: map[string]bool{"bpWounds": true},
		AddedBars: []models.TokenHPBar{
			{ID: "rage", Label: "Rage", DefaultHideValues: true},
		},
		BarValues: map[string]models.HPBarValue{"rage": {Current: 3, Max: 4}},
	}

	view := buildMaskedTokenView(blueprint, gear, stats, nil)

	byID := map[string]models.TokenViewBar{}
	for _, b := range view.Bars {
		byID[b.ID] = b
	}

	wounds, ok := byID["bpWounds"]
	if !ok {
		t.Fatal("wounds bar must still be present (visible, numbers hidden)")
	}
	if !wounds.HideValues || wounds.Current != 0 || wounds.Max != 0 {
		t.Fatalf("wounds numbers must be stripped, got %+v", wounds)
	}
	if wounds.Pct != 60 {
		t.Fatalf("wounds pct should be 60 (6/10), got %v", wounds.Pct)
	}

	rage, ok := byID["rage"]
	if !ok {
		t.Fatal("added rage bar must be present")
	}
	if !rage.HideValues || rage.Current != 0 || rage.Max != 0 || rage.Pct != 75 {
		t.Fatalf("rage bar wrong: %+v", rage)
	}
}

// A per-token manual value on a number slot is baked; disabled/absent blueprint → nil view.
func TestMask_ManualValueAndDisabledBlueprint(t *testing.T) {
	if buildMaskedTokenView(nil, nil, nil, nil) != nil {
		t.Fatal("nil blueprint must yield nil view")
	}
	if buildMaskedTokenView(&models.TokenDisplayConfig{Enabled: false}, nil, nil, nil) != nil {
		t.Fatal("disabled blueprint must yield nil view")
	}

	blueprint := &models.TokenDisplayConfig{Enabled: true, Slots: [8]models.TokenSlot{
		{ID: "p0", Type: "number", NumberLabel: "AP"}, {ID: "p1"}, {ID: "p2"}, {ID: "p3"},
		{ID: "p4"}, {ID: "p5"}, {ID: "p6"}, {ID: "p7"},
	}}
	gear := &models.CharacterTokenGear{
		SlotOverrides: map[string]models.SlotOverride{"p0": {Value: ovValue(4)}},
	}
	view := buildMaskedTokenView(blueprint, gear, nil, nil)
	if view.Slots[0] == nil {
		t.Fatal("pos0 number slot should render")
	}
	if f, ok := view.Slots[0].Value.(float64); !ok || f != 4 {
		t.Fatalf("pos0 should bake manual value 4, got %v", view.Slots[0].Value)
	}
}
