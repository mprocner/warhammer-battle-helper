package service

import (
	"errors"
	"testing"
	"time"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func member(id primitive.ObjectID, role string) models.TemplateMember {
	return models.TemplateMember{UserID: id, Role: role}
}

func templateDoc(id primitive.ObjectID, name string, public bool, members ...models.TemplateMember) bson.D {
	ms := bson.A{}
	for _, m := range members {
		ms = append(ms, bson.D{{Key: "userId", Value: m.UserID}, {Key: "role", Value: m.Role}})
	}
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "name", Value: name},
		{Key: "isPublic", Value: public},
		{Key: "version", Value: 1},
		{Key: "members", Value: ms},
	}
}

func found(docs ...bson.D) bson.D {
	return mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch, docs...)
}

func users(pairs ...interface{}) bson.D {
	var docs []bson.D
	for i := 0; i < len(pairs); i += 2 {
		docs = append(docs, bson.D{{Key: "_id", Value: pairs[i]}, {Key: "email", Value: pairs[i+1]}})
	}
	return mtest.CreateCursorResponse(0, "db.users", mtest.FirstBatch, docs...)
}

var (
	wrote    = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}}
	matched0 = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}, {Key: "nModified", Value: 0}}
)

func newSvc(mt *mtest.T) *TemplateService {
	// Both repositories read the same mocked collection; responses are consumed in call order.
	return NewTemplateService(repository.NewTemplateRepository(mt.Coll), repository.NewUserRepository(mt.Coll))
}

func TestListForUser_Decoration(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("owners see members, other members see owners, public strangers see neither", func(mt *mtest.T) {
		svc := newSvc(mt)
		viewer, alice := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			found(
				templateDoc(primitive.NewObjectID(), "Own", false, member(viewer, models.RoleOwner), member(alice, models.RoleViewer)),
				templateDoc(primitive.NewObjectID(), "Public", true, member(alice, models.RoleOwner)),
				templateDoc(primitive.NewObjectID(), "Edits", false, member(alice, models.RoleOwner), member(viewer, models.RoleEditor)),
			),
			users(viewer, "me@example.com", alice, "alice@example.com"),
		)

		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatal(err)
		}
		by := map[string]models.SystemTemplate{}
		for _, tpl := range got {
			by[tpl.Name] = tpl
		}

		own := by["Own"]
		if own.MyRole != models.RoleOwner || own.Permissions != (models.TemplatePermissions{Edit: true, Share: true, Delete: true}) {
			t.Errorf("Own: role %q perms %+v", own.MyRole, own.Permissions)
		}
		if len(own.MembersView) != 2 || own.OwnerEmails != nil {
			t.Errorf("Own: members %+v ownerEmails %v", own.MembersView, own.OwnerEmails)
		}
		for _, m := range own.MembersView {
			if m.IsMe != (m.UserID == viewer) {
				t.Errorf("Own: IsMe wrong on %+v", m)
			}
		}

		pub := by["Public"]
		if pub.MyRole != "" || pub.Permissions != (models.TemplatePermissions{}) || pub.MembersView != nil || pub.OwnerEmails != nil {
			t.Errorf("Public must reveal nothing: %+v", pub)
		}

		edits := by["Edits"]
		if edits.MyRole != models.RoleEditor || edits.Permissions != (models.TemplatePermissions{Edit: true}) {
			t.Errorf("Edits: role %q perms %+v", edits.MyRole, edits.Permissions)
		}
		if edits.MembersView != nil || len(edits.OwnerEmails) != 1 || edits.OwnerEmails[0] != "alice@example.com" {
			t.Errorf("Edits: members %+v ownerEmails %v", edits.MembersView, edits.OwnerEmails)
		}

		finds := 0
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "find" {
				finds++
			}
		}
		if finds != 2 {
			t.Errorf("expected 2 finds (templates + one batched user lookup), got %d", finds)
		}
	})

	mt.Run("a failed email lookup keeps roles and permissions", func(mt *mtest.T) {
		svc := newSvc(mt)
		viewer, alice := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			found(templateDoc(primitive.NewObjectID(), "Edits", false, member(alice, models.RoleOwner), member(viewer, models.RoleEditor))),
			mtest.CreateCommandErrorResponse(mtest.CommandError{Code: 1, Message: "users unavailable"}),
		)
		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatalf("emails are decoration; their failure must not fail the list: %v", err)
		}
		if got[0].MyRole != models.RoleEditor || !got[0].Permissions.Edit {
			t.Errorf("gating must survive a failed lookup: %+v", got[0])
		}
	})
}

func TestUpdate_Authorisation(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	owner, editor, viewer, stranger := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	id := primitive.NewObjectID()
	doc := templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor), member(viewer, models.RoleViewer))
	v := 1

	mt.Run("viewer gets forbidden before any version check", func(mt *mtest.T) {
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), viewer, models.UpdateTemplateRequest{})
		if !errors.Is(err, ErrTemplateForbidden) {
			t.Errorf("err = %v, want ErrTemplateForbidden", err)
		}
	})

	mt.Run("stranger gets not found", func(mt *mtest.T) {
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), stranger, models.UpdateTemplateRequest{Version: &v})
		if !errors.Is(err, ErrTemplateNotFound) {
			t.Errorf("err = %v, want ErrTemplateNotFound", err)
		}
	})

	mt.Run("missing version is rejected", func(mt *mtest.T) {
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), editor, models.UpdateTemplateRequest{})
		if !errors.Is(err, ErrTemplateVersionRequired) {
			t.Errorf("err = %v, want ErrTemplateVersionRequired", err)
		}
	})

	mt.Run("stale version is a conflict naming who saved", func(mt *mtest.T) {
		saved := time.Date(2026, 10, 20, 14, 32, 0, 0, time.UTC)
		current := bson.D{
			{Key: "_id", Value: id},
			{Key: "name", Value: "T"},
			{Key: "isPublic", Value: false},
			{Key: "version", Value: 7},
			{Key: "members", Value: bson.A{
				bson.D{{Key: "userId", Value: owner}, {Key: "role", Value: models.RoleOwner}},
				bson.D{{Key: "userId", Value: editor}, {Key: "role", Value: models.RoleEditor}},
			}},
			{Key: "updatedBy", Value: owner},
			{Key: "updatedAt", Value: saved},
		}
		mt.AddMockResponses(found(doc), matched0, found(current), users(owner, "owner@example.com"))

		_, err := newSvc(mt).Update(id.Hex(), editor, models.UpdateTemplateRequest{Version: &v})
		var conflict *TemplateConflictError
		if !errors.As(err, &conflict) {
			t.Fatalf("err = %v, want *TemplateConflictError", err)
		}
		if conflict.Version != 7 || conflict.UpdatedBy != "owner@example.com" || !conflict.UpdatedAt.Equal(saved) {
			t.Errorf("conflict = %+v", conflict)
		}
	})
}

func TestMembers(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	owner, editor := primitive.NewObjectID(), primitive.NewObjectID()
	id := primitive.NewObjectID()

	mt.Run("a non-owner cannot probe addresses", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor))))
		_, err := newSvc(mt).AddMember(id.Hex(), editor, "nobody@example.com", models.RoleViewer)
		if !errors.Is(err, ErrTemplateForbidden) {
			t.Errorf("err = %v, want ErrTemplateForbidden", err)
		}
		if n := len(mt.GetAllStartedEvents()); n != 1 {
			t.Errorf("the address must not be resolved before authorisation: %d commands", n)
		}
	})

	mt.Run("an unknown role is rejected", func(mt *mtest.T) {
		_, err := newSvc(mt).AddMember(id.Hex(), owner, "x@example.com", "admin")
		if !errors.Is(err, ErrTemplateInvalidRole) {
			t.Errorf("err = %v, want ErrTemplateInvalidRole", err)
		}
	})

	mt.Run("demoting the last owner is refused", func(mt *mtest.T) {
		solo := templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor))
		mt.AddMockResponses(found(solo), matched0, found(solo))
		_, err := newSvc(mt).SetMemberRole(id.Hex(), owner, owner, models.RoleEditor)
		if !errors.Is(err, ErrTemplateLastOwner) {
			t.Errorf("err = %v, want ErrTemplateLastOwner", err)
		}
	})

	mt.Run("the last owner cannot leave; a viewer can", func(mt *mtest.T) {
		solo := templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleViewer))
		mt.AddMockResponses(found(solo), matched0, found(solo))
		if err := newSvc(mt).Leave(id.Hex(), owner); !errors.Is(err, ErrTemplateLastOwner) {
			t.Errorf("owner leave err = %v, want ErrTemplateLastOwner", err)
		}
		mt.AddMockResponses(found(solo), wrote)
		if err := newSvc(mt).Leave(id.Hex(), editor); err != nil {
			t.Errorf("viewer leave err = %v, want nil", err)
		}
	})

	mt.Run("an editor cannot delete", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor))))
		if err := newSvc(mt).Delete(id.Hex(), editor); !errors.Is(err, ErrTemplateForbidden) {
			t.Errorf("err = %v, want ErrTemplateForbidden", err)
		}
	})

	mt.Run("a stranger reading a private template gets not found", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner))))
		if _, err := newSvc(mt).GetForUser(id.Hex(), primitive.NewObjectID()); !errors.Is(err, ErrTemplateNotFound) {
			t.Errorf("err = %v, want ErrTemplateNotFound", err)
		}
	})
}

func TestAboutFields(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	owner := primitive.NewObjectID()
	id := primitive.NewObjectID()
	v := 1
	str := func(s string) *string { return &s }

	mt.Run("update with an unknown language is rejected before writing", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner))))
		_, err := newSvc(mt).Update(id.Hex(), owner, models.UpdateTemplateRequest{Version: &v, Language: str("xx")})
		if !errors.Is(err, models.ErrInvalidTemplateLanguage) {
			t.Errorf("err = %v, want ErrInvalidTemplateLanguage", err)
		}
	})

	mt.Run("update with invalid success levels is rejected before writing", func(mt *mtest.T) {
		// Only the load response is queued: a write attempt would fail with a different error.
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner))))
		req := models.UpdateTemplateRequest{
			Version:  &v,
			Settings: &models.TemplateSettings{SuccessLevels: &models.SuccessLevelsConfig{Mode: "bogus"}},
		}
		_, err := newSvc(mt).Update(id.Hex(), owner, req)
		if !models.IsTemplateValidationError(err) {
			t.Errorf("err = %v, want a template validation error", err)
		}
		for _, ev := range mt.GetAllStartedEvents() {
			if ev.CommandName == "update" || ev.CommandName == "findAndModify" {
				t.Errorf("unexpected write command %q", ev.CommandName)
			}
		}
	})

	mt.Run("update on a variant with a language is rejected", func(mt *mtest.T) {
		doc := append(templateDoc(id, "T", false, member(owner, models.RoleOwner)), bson.E{Key: "baseSystem", Value: "warhammer4e"})
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), owner, models.UpdateTemplateRequest{Version: &v, Language: str("pl")})
		if !errors.Is(err, models.ErrTemplateAboutOnVariant) {
			t.Errorf("err = %v, want ErrTemplateAboutOnVariant", err)
		}
	})

	mt.Run("create stores the sanitized description and the language", func(mt *mtest.T) {
		mt.AddMockResponses(wrote, users(owner, "me@example.com"))
		created, err := newSvc(mt).Create(owner, models.CreateTemplateRequest{
			Name: "T", Description: str(`<p>a</p><script>x</script>`), Language: str("pl")})
		if err != nil {
			t.Fatal(err)
		}
		if created.Language != "pl" || created.Description != "<p>a</p>" {
			t.Errorf("created = %q / %q", created.Language, created.Description)
		}
	})

	mt.Run("clone copies description and language", func(mt *mtest.T) {
		src := append(templateDoc(id, "T", true, member(primitive.NewObjectID(), models.RoleOwner)),
			bson.E{Key: "description", Value: "<p>d</p>"}, bson.E{Key: "language", Value: "en"})
		mt.AddMockResponses(found(src), wrote, users(owner, "me@example.com"))
		clone, err := newSvc(mt).Clone(id.Hex(), owner, "")
		if err != nil {
			t.Fatal(err)
		}
		if clone.Description != "<p>d</p>" || clone.Language != "en" {
			t.Errorf("clone = %q / %q", clone.Description, clone.Language)
		}
	})
}
