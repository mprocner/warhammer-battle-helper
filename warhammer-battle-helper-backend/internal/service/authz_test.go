package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestIsGameMaster(t *testing.T) {
	gmID := primitive.NewObjectID()
	playerID := primitive.NewObjectID()
	game := &models.Game{GameMasterID: gmID}

	if !isGameMaster(game, gmID) {
		t.Error("the GM must be recognised as the GM")
	}
	if isGameMaster(game, playerID) {
		t.Error("a player must not be recognised as the GM")
	}
	// A nil game means the fetch failed; the caller returns that error, but the predicate must
	// not panic on the way there.
	if isGameMaster(nil, gmID) {
		t.Error("a nil game must never authorise anyone")
	}
}

func TestUpdateTouchesVisibility(t *testing.T) {
	hidden := true
	x := 3.0

	if !updateTouchesVisibility(models.UpdateSceneCharacterRequest{Hidden: &hidden}) {
		t.Error("a request carrying Hidden must be recognised as a visibility change")
	}
	if updateTouchesVisibility(models.UpdateSceneCharacterRequest{PositionX: &x}) {
		t.Error("a geometry-only request must not be recognised as a visibility change")
	}
	if updateTouchesVisibility(models.UpdateSceneCharacterRequest{}) {
		t.Error("an empty request must not be recognised as a visibility change")
	}
	// The value does not matter — asking to UNHIDE is exactly the interesting attack, so a false
	// Hidden must count just as much as a true one.
	unhide := false
	if !updateTouchesVisibility(models.UpdateSceneCharacterRequest{Hidden: &unhide}) {
		t.Error("Hidden=false must also count as a visibility change")
	}
}

func TestCanOnTemplate(t *testing.T) {
	owner, editor, viewer, stranger := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	members := []models.TemplateMember{
		{UserID: owner, Role: models.RoleOwner},
		{UserID: editor, Role: models.RoleEditor},
		{UserID: viewer, Role: models.RoleViewer},
	}
	private := &models.SystemTemplate{Members: members}
	public := &models.SystemTemplate{Members: members, IsPublic: true}

	cases := []struct {
		name   string
		tpl    *models.SystemTemplate
		user   primitive.ObjectID
		action models.TemplateAction
		want   bool
	}{
		{"owner deletes", private, owner, models.ActionDelete, true},
		{"editor edits", private, editor, models.ActionEdit, true},
		{"editor cannot share", private, editor, models.ActionShare, false},
		{"editor cannot delete", private, editor, models.ActionDelete, false},
		{"viewer uses", private, viewer, models.ActionUse, true},
		{"viewer cannot edit", private, viewer, models.ActionEdit, false},
		{"stranger cannot use private", private, stranger, models.ActionUse, false},
		{"stranger uses public", public, stranger, models.ActionUse, true},
		{"public grants nothing beyond use", public, stranger, models.ActionEdit, false},
		{"nil template authorises nobody", nil, owner, models.ActionUse, false},
	}
	for _, c := range cases {
		if got := CanOnTemplate(c.tpl, c.user, c.action); got != c.want {
			t.Errorf("%s: CanOnTemplate = %v, want %v", c.name, got, c.want)
		}
	}

	if got := PermissionsFor(private, editor); got != (models.TemplatePermissions{Edit: true}) {
		t.Errorf("PermissionsFor(editor) = %+v, want edit only", got)
	}
	if got := RoleOf(public, stranger); got != "" {
		t.Errorf("RoleOf(stranger) = %q, want empty", got)
	}
}
