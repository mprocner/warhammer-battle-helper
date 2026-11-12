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

func TestPasteSceneImages(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	gameID := primitive.NewObjectID()
	sourceID := primitive.NewObjectID()
	targetID := primitive.NewObjectID()
	imgA := primitive.NewObjectID()
	imgB := primitive.NewObjectID()
	gmID := primitive.NewObjectID()

	game := func() bson.D {
		img := func(id primitive.ObjectID, x float64, extra ...bson.E) bson.D {
			d := bson.D{
				{Key: "_id", Value: id}, {Key: "fileUrl", Value: "/f.png"}, {Key: "layer", Value: "tokens"},
				{Key: "x", Value: x}, {Key: "y", Value: 0.0}, {Key: "width", Value: 50.0}, {Key: "height", Value: 50.0},
			}
			return append(d, extra...)
		}
		return mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: gameID}, {Key: "gameMasterId", Value: gmID},
			{Key: "scenes", Value: bson.A{
				bson.D{{Key: "_id", Value: sourceID}, {Key: "gridWidth", Value: 10}, {Key: "gridHeight", Value: 10},
					{Key: "images", Value: bson.A{
						img(imgA, 0, bson.E{Key: "hidden", Value: true}, bson.E{Key: "locked", Value: true}, bson.E{Key: "label", Value: "Goblin"}),
						img(imgB, 100, bson.E{Key: "killed", Value: true}),
					}}},
				bson.D{{Key: "_id", Value: targetID}, {Key: "gridWidth", Value: 10}, {Key: "gridHeight", Value: 10}},
			}},
		})
	}

	// pushed returns the image document a recorded update command $pushes.
	pushed := func(mt *mtest.T) bson.Raw {
		ev := mt.GetStartedEvent()
		if ev == nil || ev.CommandName != "update" {
			t.Fatalf("want an update command, got %v", ev)
		}
		return ev.Command.Lookup("updates").Array().Index(0).Value().Document().Lookup("u", "$push", "scenes.$.images").Document()
	}

	mt.Run("copies each image into the target scene at its new position", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
		mt.AddMockResponses(game(), wrote, wrote)

		created, err := svc.PasteSceneImages(gameID.Hex(), targetID, gmID, models.PasteSceneImagesRequest{
			SourceSceneID: sourceID.Hex(),
			Items:         []models.PasteSceneImageItem{{ImageID: imgA.Hex(), X: 200, Y: 150}, {ImageID: imgB.Hex(), X: 300, Y: 150}},
		})
		if err != nil {
			t.Fatalf("PasteSceneImages: %v", err)
		}
		if len(created) != 2 || created[0].ID == imgA || created[0].ID.IsZero() {
			t.Fatalf("want two images with fresh ids, got %+v", created)
		}

		mt.GetStartedEvent() // the game read behind requireGM
		a := pushed(mt)
		if a.Lookup("x").Double() != 200 || a.Lookup("y").Double() != 150 {
			t.Errorf("first copy at (%v, %v), want (200, 150)", a.Lookup("x"), a.Lookup("y"))
		}
		// Hidden stays (a hidden token's copy must not reveal itself), the label rides along,
		// and the copy starts unlocked — same rules as duplicate.
		if !a.Lookup("hidden").Boolean() || a.Lookup("label").StringValue() != "Goblin" {
			t.Errorf("hidden/label not kept: %s", a)
		}
		if v, err := a.LookupErr("locked"); err == nil && v.Boolean() {
			t.Errorf("copy of a locked image must start unlocked")
		}
		b := pushed(mt)
		if v, err := b.LookupErr("killed"); err == nil && v.Boolean() {
			t.Errorf("copy of a killed token must start alive")
		}
	})

	mt.Run("clamps a copy into the target workspace", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
		mt.AddMockResponses(game(), wrote)

		created, err := svc.PasteSceneImages(gameID.Hex(), targetID, gmID, models.PasteSceneImagesRequest{
			SourceSceneID: sourceID.Hex(),
			Items:         []models.PasteSceneImageItem{{ImageID: imgB.Hex(), X: 1e9, Y: -1e9}},
		})
		if err != nil {
			t.Fatalf("PasteSceneImages: %v", err)
		}
		if !SceneImageWithinWorkspace(created[0], 10, 10) {
			t.Fatalf("copy at (%v, %v) is outside the workspace", created[0].X, created[0].Y)
		}
	})

	rejects := []struct {
		name string
		req  models.PasteSceneImagesRequest
		user primitive.ObjectID
	}{
		{"a player", models.PasteSceneImagesRequest{SourceSceneID: sourceID.Hex(), Items: []models.PasteSceneImageItem{{ImageID: imgA.Hex()}}}, primitive.NewObjectID()},
		{"an image that is not in the source scene", models.PasteSceneImagesRequest{SourceSceneID: sourceID.Hex(), Items: []models.PasteSceneImageItem{{ImageID: primitive.NewObjectID().Hex()}}}, gmID},
		{"a source scene from outside the game", models.PasteSceneImagesRequest{SourceSceneID: primitive.NewObjectID().Hex(), Items: []models.PasteSceneImageItem{{ImageID: imgA.Hex()}}}, gmID},
		{"nothing to paste", models.PasteSceneImagesRequest{SourceSceneID: sourceID.Hex()}, gmID},
		{"more than the cap", models.PasteSceneImagesRequest{SourceSceneID: sourceID.Hex(), Items: make([]models.PasteSceneImageItem, MaxPastedSceneImages+1)}, gmID},
	}
	for _, c := range rejects {
		mt.Run("rejects "+c.name+" without writing", func(mt *mtest.T) {
			svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: websocket.NewHub()}
			mt.AddMockResponses(game())
			if _, err := svc.PasteSceneImages(gameID.Hex(), targetID, c.user, c.req); err == nil {
				t.Fatal("want an error")
			}
			for ev := mt.GetStartedEvent(); ev != nil; ev = mt.GetStartedEvent() {
				if strings.EqualFold(ev.CommandName, "update") {
					t.Fatalf("unexpected write")
				}
			}
		})
	}
}
