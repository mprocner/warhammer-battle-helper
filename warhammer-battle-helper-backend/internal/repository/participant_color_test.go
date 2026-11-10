package repository

import (
	"strings"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestAddParticipantColorGuard(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	gameID := primitive.NewObjectID()
	p := models.GameParticipant{UserID: primitive.NewObjectID(), Color: "#4363d8"}

	mt.Run("unique colour is guarded in the filter", func(mt *mtest.T) {
		mt.AddMockResponses(okWrite)
		added, err := NewGameRepository(mt.Coll).AddParticipant(gameID.Hex(), p, true)
		if err != nil || !added {
			t.Fatalf("added=%v err=%v", added, err)
		}
		filter := relaxed(t, firstStatement(mt, "updates").Lookup("q").Document())
		mustContain(t, filter, `"participants.color":{"$ne":"#4363d8"}`, `"participants.userId":{"$ne":`+oid(p.UserID)+`}`)
	})

	mt.Run("shared colour is not guarded", func(mt *mtest.T) {
		mt.AddMockResponses(okWrite)
		if _, err := NewGameRepository(mt.Coll).AddParticipant(gameID.Hex(), p, false); err != nil {
			t.Fatal(err)
		}
		filter := relaxed(t, firstStatement(mt, "updates").Lookup("q").Document())
		if strings.Contains(filter, "participants.color") {
			t.Errorf("filter %s must not guard the colour when it may be shared", filter)
		}
	})

	mt.Run("lost colour race reports not added", func(mt *mtest.T) {
		mt.AddMockResponses(noneWrite)
		added, err := NewGameRepository(mt.Coll).AddParticipant(gameID.Hex(), p, true)
		if err != nil || added {
			t.Fatalf("added=%v err=%v, want false/nil", added, err)
		}
	})
}
