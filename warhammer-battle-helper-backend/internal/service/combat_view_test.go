package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type viewFixture struct {
	scene              *models.Scene
	chars              map[primitive.ObjectID]*models.Character
	combat             *models.Combat
	player, other      primitive.ObjectID
	heroE, wolfE, trap models.CombatEntry
}

func newViewFixture() viewFixture {
	player, other := primitive.NewObjectID(), primitive.NewObjectID()
	hero := &models.Character{ID: primitive.NewObjectID(), Name: "Hero", Avatar: "/user-files/hero.png", VisibleTo: []primitive.ObjectID{player}}
	wolf := models.SceneImage{ID: primitive.NewObjectID(), Layer: "tokens", FileURL: "/user-files/wolf.png", Killed: true}
	heroE := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryGameCharacter, SourceID: hero.ID, Initiative: 15}
	wolfE := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryImage, SourceID: wolf.ID, Name: "Wolf", Initiative: 9, Hidden: true}
	trap := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual, Name: "Trap", Initiative: 3}
	return viewFixture{
		scene:  &models.Scene{Images: []models.SceneImage{wolf}},
		chars:  map[primitive.ObjectID]*models.Character{hero.ID: hero},
		combat: &models.Combat{Version: 4, Round: 2, VisibleToPlayers: true, Entries: []models.CombatEntry{heroE, wolfE, trap}},
		player: player, other: other, heroE: heroE, wolfE: wolfE, trap: trap,
	}
}

func TestCombatViewGMSeesEverything(t *testing.T) {
	f := newViewFixture()
	v := BuildCombatView(f.combat, f.scene, f.chars, primitive.NewObjectID(), true)
	if v == nil || len(v.Entries) != 3 {
		t.Fatalf("%+v", v)
	}
	hero := v.Entries[0]
	if hero.Name != "Hero" || hero.Avatar != "/user-files/hero.png" || hero.Initiative == nil || *hero.Initiative != 15 || !hero.CanEndTurn {
		t.Fatalf("hero %+v", hero)
	}
	wolf := v.Entries[1]
	if !wolf.Hidden || !wolf.Killed || wolf.Avatar != "/user-files/wolf.png" {
		t.Fatalf("wolf %+v", wolf)
	}
}

func TestCombatViewPlayerMasking(t *testing.T) {
	f := newViewFixture()
	f.combat.ActiveID = f.heroE.ID
	v := BuildCombatView(f.combat, f.scene, f.chars, f.player, false)
	if len(v.Entries) != 2 {
		t.Fatalf("hidden entry must be dropped, got %+v", v.Entries)
	}
	for _, e := range v.Entries {
		if e.Initiative != nil {
			t.Fatalf("player must not get initiative values: %+v", e)
		}
	}
	if !v.Entries[0].CanEndTurn {
		t.Fatal("card holder can end the hero's turn")
	}
	f.combat.ActiveID = f.trap.ID
	if BuildCombatView(f.combat, f.scene, f.chars, f.player, false).Entries[1].CanEndTurn {
		t.Fatal("nobody but the GM ends a manual entry's turn")
	}
	if BuildCombatView(f.combat, f.scene, f.chars, f.player, false).Entries[0].CanEndTurn {
		t.Fatal("a player ends only the turn that is actually running")
	}
	f.combat.ActiveID = f.heroE.ID
	if BuildCombatView(f.combat, f.scene, f.chars, f.other, false).Entries[0].CanEndTurn {
		t.Fatal("a player without the card cannot end the hero's turn")
	}
}

func TestCombatViewGameCharacterEntry(t *testing.T) {
	f := newViewFixture()
	npc := &models.Character{ID: primitive.NewObjectID(), Name: "Bandit", Avatar: "/user-files/bandit.png", Killed: true}
	f.chars[npc.ID] = npc
	listed := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryGameCharacter, SourceID: npc.ID, Initiative: 1}
	f.combat.Entries = append(f.combat.Entries, listed)
	v := BuildCombatView(f.combat, f.scene, f.chars, primitive.NewObjectID(), true)
	got := v.Entries[len(v.Entries)-1]
	if got.Name != "Bandit" || got.Avatar != "/user-files/bandit.png" || !got.Killed || got.SourceID != npc.ID.Hex() {
		t.Fatalf("list entry resolves name/avatar/killed from the character: %+v", got)
	}
}

func TestCombatViewHiddenTrackerIsNilForPlayers(t *testing.T) {
	f := newViewFixture()
	f.combat.VisibleToPlayers = false
	if BuildCombatView(f.combat, f.scene, f.chars, f.player, false) != nil {
		t.Fatal("hidden tracker must not reach players")
	}
	if BuildCombatView(f.combat, f.scene, f.chars, f.player, true) == nil {
		t.Fatal("GM still sees a hidden tracker")
	}
	if BuildCombatView(nil, f.scene, f.chars, f.player, true) != nil {
		t.Fatal("no combat = nil view")
	}
}

func TestCombatViewHiddenTurnShowsLastVisibleToPlayers(t *testing.T) {
	f := newViewFixture()
	f.combat.ActiveID = f.wolfE.ID
	f.combat.LastVisibleActiveID = f.heroE.ID
	if got := BuildCombatView(f.combat, f.scene, f.chars, f.player, false).ActiveID; got != f.heroE.ID.Hex() {
		t.Fatalf("player active = %q, want hero", got)
	}
	if got := BuildCombatView(f.combat, f.scene, f.chars, f.player, true).ActiveID; got != f.wolfE.ID.Hex() {
		t.Fatalf("GM active = %q, want wolf", got)
	}
	f.combat.LastVisibleActiveID = primitive.NilObjectID
	if got := BuildCombatView(f.combat, f.scene, f.chars, f.player, false).ActiveID; got != "" {
		t.Fatalf("no visible predecessor = nobody active, got %q", got)
	}
}

func TestPlayerSceneID(t *testing.T) {
	p := primitive.NewObjectID()
	first := models.Scene{ID: primitive.NewObjectID()}
	def := models.Scene{ID: primitive.NewObjectID(), IsDefault: true}
	assigned := models.Scene{ID: primitive.NewObjectID(), AssignedPlayers: []primitive.ObjectID{p}}
	if got := PlayerSceneID(&models.Game{Scenes: []models.Scene{first, def, assigned}}, p); got != assigned.ID {
		t.Fatal("assigned scene wins")
	}
	if got := PlayerSceneID(&models.Game{Scenes: []models.Scene{first, def}}, p); got != def.ID {
		t.Fatal("then the default scene")
	}
	if got := PlayerSceneID(&models.Game{Scenes: []models.Scene{first}}, p); got != first.ID {
		t.Fatal("then the first scene")
	}
	if !PlayerSceneID(&models.Game{}, p).IsZero() {
		t.Fatal("no scenes = zero")
	}
}

// After the hero hands the turn to a hidden entry, players still see the hero as active, but the
// hero's turn is over: its card holder must not get a stale "End turn".
func TestCombatViewNoEndTurnWhileHiddenEntryActs(t *testing.T) {
	f := newViewFixture()
	f.combat.ActiveID = f.wolfE.ID
	f.combat.LastVisibleActiveID = f.heroE.ID
	v := BuildCombatView(f.combat, f.scene, f.chars, f.player, false)
	if v.ActiveID != f.heroE.ID.Hex() {
		t.Fatalf("player active = %q, want hero", v.ActiveID)
	}
	if v.Entries[0].CanEndTurn {
		t.Fatal("the substituted active entry must not offer End turn")
	}
	if gm := BuildCombatView(f.combat, f.scene, f.chars, primitive.NewObjectID(), true); !gm.Entries[0].CanEndTurn {
		t.Fatal("the GM keeps End turn on every entry")
	}
}
