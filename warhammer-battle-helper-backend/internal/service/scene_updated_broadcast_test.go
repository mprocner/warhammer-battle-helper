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

// SCENE_UPDATED goes to every client in the game. Any scene it carried would skip the per-viewer
// filters (FilterSceneImageTokensForUser / FilterSceneCharacterTokensForUser) that GET /games/:id
// applies, and the client swaps the whole scene for the payload — so hidden tokens came back for
// every player (PLAYRPG-351). The event must carry only the scene id; clients refetch.
func TestUpdateSceneBroadcastsOnlySceneID(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	gameID := primitive.NewObjectID()
	sceneID := primitive.NewObjectID()
	gmID := primitive.NewObjectID()

	mt.Run("a scene with a hidden token", func(mt *mtest.T) {
		hub := websocket.NewHub()
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll), hub: hub}
		scene := bson.D{
			{Key: "_id", Value: sceneID},
			{Key: "images", Value: bson.A{bson.D{
				{Key: "_id", Value: primitive.NewObjectID()}, {Key: "layer", Value: "tokens"}, {Key: "hidden", Value: true},
			}}},
		}
		game := mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: gameID}, {Key: "gameMasterId", Value: gmID}, {Key: "scenes", Value: bson.A{scene}},
		})
		// The scene read-back the old code did would consume this response; the fix must not need it.
		mt.AddMockResponses(game, wrote, game)

		name := "Battle"
		if err := svc.UpdateScene(gameID.Hex(), sceneID, gmID, models.UpdateSceneRequest{Name: &name}); err != nil {
			t.Fatalf("UpdateScene: %v", err)
		}

		var msg *websocket.Message
		select {
		case msg = <-hub.Broadcast:
		default:
			t.Fatal("no broadcast")
		}
		if msg.Type != websocket.EventSceneUpdated {
			t.Fatalf("type %q, want %q", msg.Type, websocket.EventSceneUpdated)
		}
		if len(msg.Payload) != 1 || msg.Payload["sceneId"] != sceneID.Hex() {
			t.Errorf("payload %v, want only sceneId %s", msg.Payload, sceneID.Hex())
		}
	})
}
