package service

import (
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestValidateGridColor(t *testing.T) {
	cases := []struct {
		in string
		ok bool
	}{
		{"", true},           // reset to the default grid
		{"#ffffff", true},    // what <input type="color"> sends
		{"#A1b2C3", true},    // case does not matter
		{"#fff", false},      // the picker never sends shorthand; keep one shape
		{"ffffff", false},    // no hash
		{"#ffffff80", false}, // no alpha: a custom colour renders fully opaque
		{"red", false},
		{"url(x)", false}, // the value lands in an inline style
	}
	for _, c := range cases {
		if err := validateGridColor(c.in); (err == nil) != c.ok {
			t.Errorf("validateGridColor(%q) err=%v, want ok=%v", c.in, err, c.ok)
		}
	}
}

func TestUpdateSceneGridColor(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	gameID := primitive.NewObjectID()
	sceneID := primitive.NewObjectID()
	gmID := primitive.NewObjectID()

	game := func() bson.D {
		return mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: gameID}, {Key: "gameMasterId", Value: gmID},
			{Key: "scenes", Value: bson.A{bson.D{{Key: "_id", Value: sceneID}}}},
		})
	}

	mt.Run("stores the colour", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
		mt.AddMockResponses(game(), wrote)

		if err := svc.UpdateScene(gameID.Hex(), sceneID, gmID, models.UpdateSceneRequest{GridColor: strPtr("#ffffff")}); err != nil {
			t.Fatalf("UpdateScene: %v", err)
		}

		mt.GetStartedEvent() // the game read behind requireGM
		update := mt.GetStartedEvent().Command.Lookup("updates").Array().Index(0).Value().Document()
		if got := update.Lookup("u", "$set", "scenes.$.gridColor").StringValue(); got != "#ffffff" {
			t.Fatalf("stored gridColor %q, want #ffffff", got)
		}
	})

	mt.Run("rejects a malformed colour without writing", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
		mt.AddMockResponses(game())

		if err := svc.UpdateScene(gameID.Hex(), sceneID, gmID, models.UpdateSceneRequest{GridColor: strPtr("red")}); err == nil {
			t.Fatal("want error for a non-hex colour")
		}
		mt.GetStartedEvent() // the game read
		if ev := mt.GetStartedEvent(); ev != nil {
			t.Fatalf("unexpected %s after a rejected colour", ev.CommandName)
		}
	})
}
