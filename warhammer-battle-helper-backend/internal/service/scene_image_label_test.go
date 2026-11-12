package service

import (
	"strings"
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func strPtr(s string) *string { return &s }

func TestNormalizeSceneImageLabel(t *testing.T) {
	cases := []struct {
		name    string
		in      *string
		want    *string
		wantErr bool
	}{
		{"absent stays absent", nil, nil, false},
		{"surrounding whitespace is trimmed", strPtr("  Goblin  "), strPtr("Goblin"), false},
		{"blank clears the label", strPtr("   "), strPtr(""), false},
		// The limit counts characters, not bytes: 40 Polish letters are 80 bytes in UTF-8.
		{"40 multi-byte characters fit", strPtr(strings.Repeat("ż", 40)), strPtr(strings.Repeat("ż", 40)), false},
		{"41 characters are rejected", strPtr(strings.Repeat("a", 41)), nil, true},
		{"the limit applies after trimming", strPtr(" " + strings.Repeat("a", 40) + " "), strPtr(strings.Repeat("a", 40)), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := normalizeSceneImageLabel(c.in)
			if c.wantErr {
				if err == nil {
					t.Fatalf("want error, got %q", *got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if (got == nil) != (c.want == nil) || (got != nil && *got != *c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
		})
	}
}

// A player who receives the image as a fresh ADD (it crossed into the scene) gets it built from
// applySceneImageUpdate, so a label set in the same request must survive that projection.
func TestApplySceneImageUpdateCarriesLabel(t *testing.T) {
	out := applySceneImageUpdate(models.SceneImage{Label: "old"}, models.UpdateSceneImageRequest{Label: strPtr("Goblin")})
	if out.Label != "Goblin" {
		t.Fatalf("label %q, want %q", out.Label, "Goblin")
	}
}

func TestUpdateSceneImageLabel(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	gameID := primitive.NewObjectID()
	sceneID := primitive.NewObjectID()
	imageID := primitive.NewObjectID()
	gmID := primitive.NewObjectID()

	game := func() bson.D {
		return mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: gameID}, {Key: "gameMasterId", Value: gmID},
			{Key: "scenes", Value: bson.A{bson.D{
				{Key: "_id", Value: sceneID}, {Key: "gridWidth", Value: 10}, {Key: "gridHeight", Value: 10},
				{Key: "images", Value: bson.A{bson.D{
					{Key: "_id", Value: imageID}, {Key: "layer", Value: "tokens"},
					{Key: "x", Value: 0}, {Key: "y", Value: 0}, {Key: "width", Value: 50}, {Key: "height", Value: 50},
				}}},
			}}},
		})
	}

	mt.Run("stores the trimmed label", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
		mt.AddMockResponses(game(), wrote)

		if err := svc.UpdateSceneImage(gameID.Hex(), sceneID, imageID, gmID, models.UpdateSceneImageRequest{Label: strPtr("  Goblin ")}); err != nil {
			t.Fatalf("UpdateSceneImage: %v", err)
		}

		mt.GetStartedEvent() // the game read behind requireGM
		update := mt.GetStartedEvent().Command.Lookup("updates").Array().Index(0).Value().Document()
		got := update.Lookup("u", "$set", "scenes.$[scene].images.$[img].label").StringValue()
		if got != "Goblin" {
			t.Fatalf("stored label %q, want %q", got, "Goblin")
		}
	})

	mt.Run("rejects a label over the limit without writing", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
		mt.AddMockResponses(game())

		err := svc.UpdateSceneImage(gameID.Hex(), sceneID, imageID, gmID, models.UpdateSceneImageRequest{Label: strPtr(strings.Repeat("a", 41))})
		if err == nil {
			t.Fatal("want error for a 41-character label")
		}
		mt.GetStartedEvent() // the game read
		if ev := mt.GetStartedEvent(); ev != nil {
			t.Fatalf("unexpected %s after a rejected label", ev.CommandName)
		}
	})
}
