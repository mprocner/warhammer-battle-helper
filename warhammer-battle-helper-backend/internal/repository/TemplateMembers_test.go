package repository

import (
	"errors"
	"strings"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

var (
	okWrite   = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}}
	noneWrite = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}, {Key: "nModified", Value: 0}}
)

// firstStatement returns the first entry of an update/delete command's statement array.
func firstStatement(mt *mtest.T, arrayKey string) bson.Raw {
	return mt.GetStartedEvent().Command.Lookup(arrayKey).Array().Index(0).Value().Document()
}

// relaxed renders a document as relaxed extended JSON so a test can look for a fragment without
// depending on key order inside bson.M.
func relaxed(t *testing.T, doc bson.Raw) string {
	t.Helper()
	out, err := bson.MarshalExtJSON(doc, false, false)
	if err != nil {
		t.Fatalf("MarshalExtJSON: %v", err)
	}
	return string(out)
}

func oid(id primitive.ObjectID) string { return `{"$oid":"` + id.Hex() + `"}` }

func mustContain(t *testing.T, haystack string, fragments ...string) {
	t.Helper()
	for _, f := range fragments {
		if !strings.Contains(haystack, f) {
			t.Errorf("expected %s to contain %s", haystack, f)
		}
	}
}

func TestListVisibleToMember(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("matches membership or public", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch))
		user := primitive.NewObjectID()
		if _, err := repo.ListVisibleToMember(user); err != nil {
			t.Fatal(err)
		}
		filter := relaxed(t, mt.GetStartedEvent().Command.Lookup("filter").Document())
		mustContain(t, filter, `"members.userId":`+oid(user), `"isPublic":true`)
	})
}

func TestUpdateContent(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("filters by version and editor role, stamps updatedBy on a content change", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		editor := primitive.NewObjectID()
		name := "New"
		v := 3
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), editor, models.UpdateTemplateRequest{Name: &name, Version: &v}, true); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		q := st.Lookup("q").Document()
		if q.Lookup("version").AsInt64() != 3 {
			t.Error("the save must be filtered by the version the client saw")
		}
		mustContain(t, relaxed(t, q), `"userId":`+oid(editor), `"role":{"$in":["editor","owner"]}`)
		u := st.Lookup("u").Document()
		if u.Lookup("$inc", "version").AsInt64() != 1 {
			t.Error("a content change must bump version")
		}
		if u.Lookup("$set", "updatedBy").ObjectID() != editor {
			t.Error("a content change must record who saved it")
		}
	})

	mt.Run("no content change: no bump, no updatedBy, version still checked", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		v := 5
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), primitive.NewObjectID(), models.UpdateTemplateRequest{Version: &v}, false); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		if st.Lookup("q", "version").AsInt64() != 5 {
			t.Error("a stale client is stale even when it changes nothing")
		}
		u := st.Lookup("u").Document()
		if _, err := u.LookupErr("$inc"); err == nil {
			t.Error("no content change must not bump version")
		}
		if _, err := u.LookupErr("$set", "updatedBy"); err == nil {
			t.Error("no content change must not move updatedBy")
		}
	})

	mt.Run("nothing matched is ErrTemplateNoMatch", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(noneWrite)
		v := 1
		err := repo.UpdateContent(primitive.NewObjectID().Hex(), primitive.NewObjectID(), models.UpdateTemplateRequest{Version: &v}, false)
		if !errors.Is(err, ErrTemplateNoMatch) {
			t.Errorf("err = %v, want ErrTemplateNoMatch", err)
		}
	})

	mt.Run("writes description and language when present", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		v, desc, lang := 2, "<p>d</p>", "pl"
		req := models.UpdateTemplateRequest{Version: &v, Description: &desc, Language: &lang}
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), primitive.NewObjectID(), req, true); err != nil {
			t.Fatal(err)
		}
		set := firstStatement(mt, "updates").Lookup("u", "$set").Document()
		if set.Lookup("description").StringValue() != desc || set.Lookup("language").StringValue() != lang {
			t.Errorf("$set = %s", relaxed(t, set))
		}
	})
}

func TestMemberWrites(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	caller, target := primitive.NewObjectID(), primitive.NewObjectID()
	ownerGuard := `"role":{"$ne":"owner"}`
	shareRole := `"role":{"$in":["owner"]}`

	mt.Run("SetVisibility requires share", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.SetVisibility(primitive.NewObjectID().Hex(), caller, true); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), `"userId":`+oid(caller), shareRole)
		if !st.Lookup("u", "$set", "isPublic").Boolean() {
			t.Error("isPublic must be set")
		}
	})

	mt.Run("AddMember requires share and refuses an existing member", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		err := repo.AddMember(primitive.NewObjectID().Hex(), caller, models.TemplateMember{UserID: target, Role: models.RoleEditor})
		if err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), shareRole, `"members.userId":{"$ne":`+oid(target)+`}`)
		if _, err := st.Lookup("u").Document().LookupErr("$push", "members"); err != nil {
			t.Error("AddMember must $push into members")
		}
	})

	mt.Run("SetMemberRole below owner keeps an owner", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.SetMemberRole(primitive.NewObjectID().Hex(), caller, target, models.RoleViewer); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), shareRole, ownerGuard)
		if _, err := st.LookupErr("arrayFilters"); err != nil {
			t.Error("the role must be set through an arrayFilter on userId")
		}
	})

	mt.Run("SetMemberRole to owner needs no owner guard", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.SetMemberRole(primitive.NewObjectID().Hex(), caller, target, models.RoleOwner); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(relaxed(t, firstStatement(mt, "updates").Lookup("q").Document()), ownerGuard) {
			t.Error("promoting to owner can never leave the template ownerless")
		}
	})

	mt.Run("RemoveMember requires share and keeps an owner", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.RemoveMember(primitive.NewObjectID().Hex(), caller, target); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), shareRole, ownerGuard)
		if _, err := st.Lookup("u").Document().LookupErr("$pull", "members"); err != nil {
			t.Error("RemoveMember must $pull from members")
		}
	})

	mt.Run("Leave keeps an owner but needs no share", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.Leave(primitive.NewObjectID().Hex(), caller); err != nil {
			t.Fatal(err)
		}
		q := relaxed(t, firstStatement(mt, "updates").Lookup("q").Document())
		mustContain(t, q, ownerGuard)
		if strings.Contains(q, shareRole) {
			t.Error("leaving must not require the share permission")
		}
	})

	mt.Run("DeleteAsMember requires delete; nothing deleted is ErrTemplateNoMatch", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}})
		err := repo.DeleteAsMember(primitive.NewObjectID().Hex(), caller)
		if !errors.Is(err, ErrTemplateNoMatch) {
			t.Errorf("err = %v, want ErrTemplateNoMatch", err)
		}
		mustContain(t, relaxed(t, firstStatement(mt, "deletes").Lookup("q").Document()), `"userId":`+oid(caller), shareRole)
	})

	mt.Run("PullMemberEverywhere updates many", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.PullMemberEverywhere(target); err != nil {
			t.Fatal(err)
		}
		if !firstStatement(mt, "updates").Lookup("multi").Boolean() {
			t.Error("a deleted account must be pulled from every template")
		}
	})
}
