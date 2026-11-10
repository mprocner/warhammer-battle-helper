package service

import (
	"errors"
	"fmt"
	"testing"

	"battle-helper/internal/combat"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestAuthorizeEndTurn(t *testing.T) {
	player, stranger := primitive.NewObjectID(), primitive.NewObjectID()
	hero := &models.Character{ID: primitive.NewObjectID(), VisibleTo: []primitive.ObjectID{player}}
	placement := models.GameCharacter{ID: primitive.NewObjectID(), CharacterID: hero.ID}
	other := models.Scene{ID: primitive.NewObjectID()}
	scene := models.Scene{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{placement}, AssignedPlayers: []primitive.ObjectID{player, stranger}}
	game := &models.Game{Scenes: []models.Scene{other, scene}}
	ctx := &combatCtx{
		game:  game,
		scene: &game.Scenes[1],
		chars: map[primitive.ObjectID]*models.Character{hero.ID: hero},
	}
	heroE := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryCharacter, SourceID: placement.ID}
	manual := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual}
	c := &models.Combat{VisibleToPlayers: true, Entries: []models.CombatEntry{heroE, manual}}

	ctx.userID, ctx.isGM = player, false
	if err := authorizeEndTurn(ctx, c, heroE.ID); err != nil {
		t.Fatalf("card holder: %v", err)
	}
	// A player must not tell a hidden combat from no combat: both are forbidden, never 404.
	if err := authorizeEndTurn(ctx, nil, heroE.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("no combat for a player: %v", err)
	}
	c.VisibleToPlayers = false
	if err := authorizeEndTurn(ctx, c, heroE.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("hidden tracker: %v", err)
	}
	c.VisibleToPlayers = true
	c.Entries[0].Hidden = true
	if err := authorizeEndTurn(ctx, c, heroE.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("hidden entry: %v", err)
	}
	c.Entries[0].Hidden = false
	ctx.scene = &game.Scenes[0]
	ctx.scene.Characters = []models.GameCharacter{placement}
	if err := authorizeEndTurn(ctx, c, heroE.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("combat on a scene the player is not on: %v", err)
	}
	ctx.scene = &game.Scenes[1]
	if err := authorizeEndTurn(ctx, c, manual.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("manual entry for a player: %v", err)
	}
	ctx.userID = stranger
	if err := authorizeEndTurn(ctx, c, heroE.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("stranger: %v", err)
	}
	ctx.isGM = true
	if err := authorizeEndTurn(ctx, c, manual.ID); err != nil {
		t.Fatalf("GM: %v", err)
	}
	if err := authorizeEndTurn(ctx, nil, manual.ID); !errors.Is(err, ErrCombatNotFound) {
		t.Fatalf("no combat: %v", err)
	}
}

func TestBuildEntryFromSource(t *testing.T) {
	placement := models.GameCharacter{ID: primitive.NewObjectID(), Hidden: true}
	img := models.SceneImage{ID: primitive.NewObjectID(), FileName: "dire-wolf.png", Layer: "tokens"}
	scene := &models.Scene{Characters: []models.GameCharacter{placement}, Images: []models.SceneImage{img}}

	e, err := buildEntry(scene, models.CombatSourceRequest{Kind: "character", SourceID: placement.ID.Hex(), Initiative: 12})
	if err != nil || e.SourceID != placement.ID || !e.Hidden || e.Initiative != 12 {
		t.Fatalf("character: %+v %v (a hidden token starts as a hidden entry)", e, err)
	}
	e, err = buildEntry(scene, models.CombatSourceRequest{Kind: "image", SourceID: img.ID.Hex()})
	if err != nil || e.Name != "dire-wolf" {
		t.Fatalf("image name defaults to the file name without extension: %+v %v", e, err)
	}
	if _, err = buildEntry(scene, models.CombatSourceRequest{Kind: "image", SourceID: primitive.NewObjectID().Hex()}); !errors.Is(err, ErrCombatInvalid) {
		t.Fatalf("image from another scene: %v", err)
	}
	bg := models.SceneImage{ID: primitive.NewObjectID(), FileName: "map.jpg", Layer: "background"}
	scene.Images = append(scene.Images, bg)
	if _, err = buildEntry(scene, models.CombatSourceRequest{Kind: "image", SourceID: bg.ID.Hex()}); !errors.Is(err, ErrCombatInvalid) {
		t.Fatalf("image outside the tokens layer: %v", err)
	}
	if _, err = buildEntry(scene, models.CombatSourceRequest{Kind: "manual", Name: "   "}); !errors.Is(err, ErrCombatInvalid) {
		t.Fatalf("blank manual name: %v", err)
	}
	e, err = buildEntry(scene, models.CombatSourceRequest{Kind: "manual", Name: " Trap ", Initiative: 3})
	if err != nil || e.Name != "Trap" || !e.SourceID.IsZero() {
		t.Fatalf("manual: %+v %v", e, err)
	}
}

func TestCombatAudience(t *testing.T) {
	visible := &models.Combat{VisibleToPlayers: true}
	hidden := &models.Combat{}
	cases := []struct {
		before, after *models.Combat
		want          bool
	}{
		{nil, hidden, false},
		{hidden, hidden, false},
		{hidden, visible, true}, // reveal: players must learn there is combat now
		{visible, hidden, true}, // hide: players must drop it
		{visible, nil, true},    // end
	}
	for i, tc := range cases {
		if got := playersAffected(tc.before, tc.after); got != tc.want {
			t.Errorf("case %d: got %v want %v", i, got, tc.want)
		}
	}
}

func TestRetrySaveConflict(t *testing.T) {
	saveConflict := &saveError{err: combat.ErrConflict}
	boom := errors.New("boom")
	cases := []struct {
		name     string
		results  []error
		want     error
		attempts int
	}{
		{"success", []error{nil}, nil, 1},
		{"save conflict then success", []error{saveConflict, nil}, nil, 2},
		{"save conflict every time gives up", []error{saveConflict, saveConflict, saveConflict, nil}, combat.ErrConflict, combatSaveAttempts},
		{"stale turn from the change is not retried", []error{combat.ErrConflict, nil}, combat.ErrConflict, 1},
		{"other save error is not retried", []error{&saveError{err: fmt.Errorf("db: %w", boom)}, nil}, boom, 1},
		{"forbidden is not retried", []error{ErrCombatForbidden, nil}, ErrCombatForbidden, 1},
	}
	for _, tc := range cases {
		calls := 0
		err := retrySaveConflict(func() error {
			calls++
			return tc.results[calls-1]
		})
		if calls != tc.attempts {
			t.Errorf("%s: %d attempts, want %d", tc.name, calls, tc.attempts)
		}
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v, want %v", tc.name, err, tc.want)
		}
		var se *saveError
		if errors.As(err, &se) {
			t.Errorf("%s: the save wrapper must not leak out: %v", tc.name, err)
		}
	}
}
