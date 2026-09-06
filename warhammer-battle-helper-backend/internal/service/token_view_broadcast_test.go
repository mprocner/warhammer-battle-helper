package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// oneVisibleSlotBlueprint: position 0 is a visible field bound to wounds.current; the rest are empty.
func oneVisibleSlotBlueprint() *models.TokenDisplayConfig {
	slots := [8]models.TokenSlot{
		{ID: "p0", Type: "field", Field: &models.FieldBinding{Key: "wounds.current"}},
		{ID: "p1", Type: "empty"},
		{ID: "p2", Type: "empty"},
		{ID: "p3", Type: "empty"},
		{ID: "p4", Type: "empty"},
		{ID: "p5", Type: "empty"},
		{ID: "p6", Type: "empty"},
		{ID: "p7", Type: "empty"},
	}
	return &models.TokenDisplayConfig{Enabled: true, Slots: slots}
}

func testCharacter(t *testing.T) *models.Character {
	t.Helper()
	return &models.Character{
		ID:     primitive.NewObjectID(),
		Name:   "Goblin",
		Avatar: "/goblin.png",
		Stats:  statsRaw(t, bson.M{"wounds": bson.M{"current": 5, "max": 9}}),
	}
}

// The character path fans out across scenes: one entry per placement, each masked against ITS OWN
// gear. Two placements of one card must not share a view.
func TestBuildTokenViewEntries_PerPlacementGear(t *testing.T) {
	ch := testCharacter(t)
	sceneA, sceneB := primitive.NewObjectID(), primitive.NewObjectID()
	placeA, placeB := primitive.NewObjectID(), primitive.NewObjectID()

	game := &models.Game{Scenes: []models.Scene{
		{ID: sceneA, Characters: []models.GameCharacter{
			{ID: placeA, CharacterID: ch.ID},
		}},
		{ID: sceneB, Characters: []models.GameCharacter{
			{ID: placeB, CharacterID: ch.ID, TokenGear: &models.CharacterTokenGear{
				SlotOverrides: map[string]models.SlotOverride{"p0": {Hidden: boolp(true)}},
			}},
		}},
	}}

	entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil)

	if len(entries) != 2 {
		t.Fatalf("want 2 entries (one per placement), got %d", len(entries))
	}
	if entries[0].SceneID != sceneA.Hex() || entries[0].PlacementID != placeA.Hex() {
		t.Errorf("first entry must address scene A / placement A")
	}
	if entries[0].TokenView.Slots[0] == nil {
		t.Error("placement A has no override: position 0 must be visible")
	}
	if entries[1].TokenView.Slots[0] != nil {
		t.Error("placement B hides position 0 on its own gear: it must not appear in that view")
	}
}

// A hidden placement is dropped entirely: sending it would reveal a token the card-less viewer must
// not know exists.
func TestBuildTokenViewEntries_HiddenPlacementDropped(t *testing.T) {
	ch := testCharacter(t)
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: primitive.NewObjectID(), CharacterID: ch.ID, Hidden: true},
		}},
	}}

	if entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil); len(entries) != 0 {
		t.Fatalf("a hidden placement must produce no entry, got %d", len(entries))
	}
}

// The gear path narrows to a single placement.
func TestBuildTokenViewEntries_OnlyPlacementNarrows(t *testing.T) {
	ch := testCharacter(t)
	wanted := primitive.NewObjectID()
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: wanted, CharacterID: ch.ID},
			{ID: primitive.NewObjectID(), CharacterID: ch.ID},
		}},
	}}

	entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), &wanted)

	if len(entries) != 1 || entries[0].PlacementID != wanted.Hex() {
		t.Fatalf("want exactly the requested placement, got %#v", entries)
	}
}

// Placements of OTHER characters are never touched.
func TestBuildTokenViewEntries_IgnoresOtherCharacters(t *testing.T) {
	ch := testCharacter(t)
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: primitive.NewObjectID(), CharacterID: primitive.NewObjectID()},
		}},
	}}

	if entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil); len(entries) != 0 {
		t.Fatalf("another character's placement must produce no entry, got %d", len(entries))
	}
}

// Name, avatar and killed ride along: a card-less client learns them only through the placement.
func TestBuildTokenViewEntries_CarriesCharacterDerivedPlacementFields(t *testing.T) {
	ch := testCharacter(t)
	ch.Killed = true
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: primitive.NewObjectID(), CharacterID: ch.ID},
		}},
	}}

	entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil)

	if len(entries) != 1 {
		t.Fatalf("want 1 entry, got %d", len(entries))
	}
	if entries[0].Name != "Goblin" || entries[0].Avatar != "/goblin.png" || !entries[0].Killed {
		t.Errorf("entry must carry name/avatar/killed, got %#v", entries[0])
	}
}

// Warhammer-style characters keep the avatar inside stats; the placement avatar must fall back to it.
func TestCharacterTokenAvatar_FallsBackToStats(t *testing.T) {
	ch := &models.Character{
		Stats: statsRaw(t, bson.M{"basicInfo": bson.M{"avatar": "/from-stats.png"}}),
	}
	if got := characterTokenAvatar(ch); got != "/from-stats.png" {
		t.Errorf("want the stats avatar, got %q", got)
	}

	ch.Avatar = "/top-level.png"
	if got := characterTokenAvatar(ch); got != "/top-level.png" {
		t.Errorf("the top-level avatar must win, got %q", got)
	}
}

// The exclusion list is the GM plus every card-holder — the two classes that get the RAW gear instead.
func TestTokenViewExclusions(t *testing.T) {
	gm := primitive.NewObjectID()
	holder := primitive.NewObjectID()
	game := &models.Game{GameMasterID: gm}
	ch := &models.Character{VisibleTo: []primitive.ObjectID{holder}}

	got := tokenViewExclusions(game, ch)

	if len(got) != 2 || got[0] != gm.Hex() || got[1] != holder.Hex() {
		t.Errorf("want [GM, card-holder], got %v", got)
	}
}
