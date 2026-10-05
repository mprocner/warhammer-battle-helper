package service

import (
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func templateDoc(id, owner primitive.ObjectID, name string, public bool, sharedWith ...primitive.ObjectID) bson.D {
	shared := bson.A{}
	for _, s := range sharedWith {
		shared = append(shared, s)
	}
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "ownerId", Value: owner},
		{Key: "name", Value: name},
		{Key: "isPublic", Value: public},
		{Key: "sharedWith", Value: shared},
	}
}

func TestListForUser_OwnerEmail(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("only rows shared with the viewer reveal their owner", func(mt *mtest.T) {
		// Both repositories read the same mocked collection; responses are consumed in call order.
		svc := NewTemplateService(repository.NewTemplateRepository(mt.Coll), repository.NewUserRepository(mt.Coll))
		viewer, alice, bob := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch,
				templateDoc(primitive.NewObjectID(), viewer, "Own", false),
				templateDoc(primitive.NewObjectID(), alice, "Public", true),
				templateDoc(primitive.NewObjectID(), alice, "Shared", false, viewer),
				templateDoc(primitive.NewObjectID(), alice, "SharedToo", false, viewer),
				templateDoc(primitive.NewObjectID(), bob, "PublicShared", true, viewer),
			),
			mtest.CreateCursorResponse(0, "db.users", mtest.FirstBatch,
				bson.D{{Key: "_id", Value: alice}, {Key: "email", Value: "alice@example.com"}},
				bson.D{{Key: "_id", Value: bob}, {Key: "email", Value: "bob@example.com"}},
			),
		)

		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatalf("ListForUser() returned unexpected error: %v", err)
		}
		byName := make(map[string]models.SystemTemplate, len(got))
		for _, tpl := range got {
			byName[tpl.Name] = tpl
		}

		cases := []struct {
			name         string
			sharedWithMe bool
			ownerEmail   string
		}{
			{"Own", false, ""},
			{"Public", false, ""},
			{"Shared", true, "alice@example.com"},
			{"SharedToo", true, "alice@example.com"},
			{"PublicShared", true, "bob@example.com"},
		}
		for _, c := range cases {
			tpl := byName[c.name]
			if tpl.SharedWithMe != c.sharedWithMe {
				t.Errorf("%s: SharedWithMe = %v, want %v", c.name, tpl.SharedWithMe, c.sharedWithMe)
			}
			if tpl.OwnerEmail != c.ownerEmail {
				t.Errorf("%s: OwnerEmail = %q, want %q", c.name, tpl.OwnerEmail, c.ownerEmail)
			}
		}

		// One find for the templates, ONE for all owners — never a query per row.
		finds := 0
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "find" {
				finds++
			}
		}
		if finds != 2 {
			t.Errorf("expected 2 find commands, got %d", finds)
		}
	})

	mt.Run("a failed owner lookup keeps the row in its group", func(mt *mtest.T) {
		svc := NewTemplateService(repository.NewTemplateRepository(mt.Coll), repository.NewUserRepository(mt.Coll))
		viewer, alice := primitive.NewObjectID(), primitive.NewObjectID()

		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch,
				templateDoc(primitive.NewObjectID(), alice, "Shared", false, viewer),
			),
			mtest.CreateCommandErrorResponse(mtest.CommandError{Code: 1, Message: "users unavailable"}),
		)

		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatalf("the owner email is decoration; its failure must not fail the list: %v", err)
		}
		if len(got) != 1 || !got[0].SharedWithMe {
			t.Fatal("the row must stay shared-with-me even without its owner's email")
		}
		if got[0].OwnerEmail != "" {
			t.Errorf("OwnerEmail = %q, want empty after a failed lookup", got[0].OwnerEmail)
		}
	})
}
