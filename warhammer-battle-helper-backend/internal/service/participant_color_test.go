package service

import (
	"strings"
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func gameWithColors(id primitive.ObjectID, participants ...models.GameParticipant) bson.D {
	ps := bson.A{}
	for _, p := range participants {
		ps = append(ps, bson.D{{Key: "userId", Value: p.UserID}, {Key: "color", Value: p.Color}})
	}
	return mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch,
		bson.D{{Key: "_id", Value: id}, {Key: "participants", Value: ps}})
}

func TestJoinWithColor(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	palette := models.ParticipantPalette
	gameID := primitive.NewObjectID()
	gm := models.GameParticipant{UserID: primitive.NewObjectID(), Color: palette[0]}
	joiner := models.GameParticipant{UserID: primitive.NewObjectID()}

	mt.Run("takes the next free colour", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll)}
		mt.AddMockResponses(gameWithColors(gameID, gm), wrote)
		color, err := svc.joinWithColor(gameID.Hex(), joiner)
		if err != nil || color != palette[1] {
			t.Fatalf("got (%q, %v), want %q", color, err, palette[1])
		}
	})

	mt.Run("a lost race re-reads the game and takes the colour after the winner's", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll)}
		winner := models.GameParticipant{UserID: primitive.NewObjectID(), Color: palette[1]}
		mt.AddMockResponses(
			gameWithColors(gameID, gm), matched0, // both saw palette[1] free; the other join pushed first
			gameWithColors(gameID, gm, winner), wrote,
		)
		color, err := svc.joinWithColor(gameID.Hex(), joiner)
		if err != nil || color != palette[2] {
			t.Fatalf("got (%q, %v), want %q", color, err, palette[2])
		}
		var lastUpdate bson.Raw
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "update" {
				lastUpdate = e.Command
			}
		}
		filter := lastUpdate.Lookup("updates").Array().Index(0).Value().Document().Lookup("q").String()
		if !strings.Contains(filter, palette[2]) {
			t.Errorf("retry must guard the new colour, filter %s", filter)
		}
	})

	mt.Run("already a participant pushes nothing", func(mt *mtest.T) {
		svc := &GameService{gameRepo: repository.NewGameRepository(mt.Coll)}
		mt.AddMockResponses(gameWithColors(gameID, gm, models.GameParticipant{UserID: joiner.UserID, Color: palette[1]}))
		color, err := svc.joinWithColor(gameID.Hex(), joiner)
		if err != nil || color != "" {
			t.Fatalf("got (%q, %v), want empty colour", color, err)
		}
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "update" {
				t.Fatal("must not push a participant who is already in the game")
			}
		}
	})
}

func TestUpdateParticipantRejectsBadColor(t *testing.T) {
	svc := &GameService{}
	err := svc.UpdateParticipant(primitive.NewObjectID().Hex(), primitive.NewObjectID(), "", "upload", "", "", "small", false, "red")
	if err != ErrInvalidParticipantColor {
		t.Fatalf("err = %v, want ErrInvalidParticipantColor", err)
	}
}
