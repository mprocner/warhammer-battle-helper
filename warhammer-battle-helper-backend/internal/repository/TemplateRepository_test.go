package repository

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestTemplateRepository_AddShare(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("adds the target to sharedWith with the owner in the filter", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}})

		ownerID := primitive.NewObjectID()
		targetID := primitive.NewObjectID()
		id := primitive.NewObjectID()

		if err := repo.AddShare(id.Hex(), ownerID, targetID); err != nil {
			t.Fatalf("AddShare() returned unexpected error: %v", err)
		}

		// The owner check IS the filter — there is no separate read before the write, so there
		// is no window in which ownership could change between the two.
		cmd := mt.GetStartedEvent().Command
		updates := cmd.Lookup("updates").Array()
		first := updates.Index(0).Value().Document()
		if first.Lookup("q").Document().Lookup("ownerId").ObjectID() != ownerID {
			t.Error("the update must be filtered by ownerId")
		}
		if _, err := first.Lookup("u").Document().LookupErr("$addToSet"); err != nil {
			t.Error("a repeated share must be a no-op, which means $addToSet, not $push")
		}
	})

	mt.Run("reports not found when nothing matched", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}, {Key: "nModified", Value: 0}})

		err := repo.AddShare(primitive.NewObjectID().Hex(), primitive.NewObjectID(), primitive.NewObjectID())
		if err == nil {
			t.Error("a template that is missing or owned by somebody else must be an error")
		}
	})
}

func TestTemplateRepository_RemoveShare(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("pulls the target out of sharedWith", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}})

		ownerID := primitive.NewObjectID()
		if err := repo.RemoveShare(primitive.NewObjectID().Hex(), ownerID, primitive.NewObjectID()); err != nil {
			t.Fatalf("RemoveShare() returned unexpected error: %v", err)
		}

		cmd := mt.GetStartedEvent().Command
		first := cmd.Lookup("updates").Array().Index(0).Value().Document()
		if first.Lookup("q").Document().Lookup("ownerId").ObjectID() != ownerID {
			t.Error("the update must be filtered by ownerId")
		}
		if _, err := first.Lookup("u").Document().LookupErr("$pull"); err != nil {
			t.Error("revoking access must use $pull")
		}
	})
}
