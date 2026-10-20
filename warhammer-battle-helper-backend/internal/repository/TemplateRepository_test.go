package repository

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestTemplateRepository_GetVersionsByIDs(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("maps each found id to its version", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		a, b := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch,
			bson.D{{Key: "_id", Value: a}, {Key: "version", Value: 4}},
		))

		got, err := repo.GetVersionsByIDs([]primitive.ObjectID{a, b})
		if err != nil {
			t.Fatalf("GetVersionsByIDs() returned unexpected error: %v", err)
		}
		if got[a] != 4 {
			t.Errorf("got[a] = %d, want 4", got[a])
		}
		if _, ok := got[b]; ok {
			t.Error("a deleted template must be absent from the map, not zero")
		}
	})

	mt.Run("empty input issues no query", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		got, err := repo.GetVersionsByIDs(nil)
		if err != nil || len(got) != 0 {
			t.Fatalf("GetVersionsByIDs(nil) = %v, %v; want empty map, nil", got, err)
		}
		if mt.GetStartedEvent() != nil {
			t.Error("no ids must mean no round trip")
		}
	})
}
