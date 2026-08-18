package service

import (
	"testing"

	"battle-helper/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestCanAccessGame(t *testing.T) {
	gm := primitive.NewObjectID()
	player := primitive.NewObjectID()
	stranger := primitive.NewObjectID()

	game := &models.Game{
		GameMasterID: gm,
		Participants: []models.GameParticipant{{UserID: player}},
	}

	if !CanAccessGame(game, gm) {
		t.Error("GM must pass even when absent from participants")
	}
	if !CanAccessGame(game, player) {
		t.Error("participant must pass")
	}
	if CanAccessGame(game, stranger) {
		t.Error("stranger must not pass")
	}
	if CanAccessGame(nil, player) {
		t.Error("nil game must not pass")
	}
	if CanAccessGame(game, primitive.NilObjectID) {
		t.Error("zero user id must not pass")
	}
}

func TestCanEditCharacter(t *testing.T) {
	owner := primitive.NewObjectID()
	holder := primitive.NewObjectID()

	// Card created by the owner, but the GM revoked their visibility and handed it to the holder.
	ch := &models.Character{
		CreatedBy: owner,
		VisibleTo: []primitive.ObjectID{holder},
	}

	if !CanEditCharacter(ch, holder, false) {
		t.Error("user in visibleTo must be able to edit")
	}
	if CanEditCharacter(ch, owner, false) {
		t.Error("createdBy alone must NOT grant edit rights")
	}
	if !CanEditCharacter(ch, owner, true) {
		t.Error("GM must be able to edit anything")
	}

	orphan := &models.Character{CreatedBy: owner, VisibleTo: nil}
	if CanEditCharacter(orphan, owner, false) {
		t.Error("orphaned character must not be editable by a non-GM")
	}
	if CanEditCharacter(nil, owner, false) {
		t.Error("nil character must not be editable")
	}
	if CanEditCharacter(nil, owner, true) {
		t.Error("nil character must not be editable even by a GM")
	}
}

func TestFilterVisibleToParticipants(t *testing.T) {
	gm := primitive.NewObjectID()
	player := primitive.NewObjectID()
	departed := primitive.NewObjectID()

	game := &models.Game{
		GameMasterID: gm,
		Participants: []models.GameParticipant{{UserID: player}},
	}

	got := FilterVisibleToParticipants(game, []primitive.ObjectID{player, departed, gm})

	if len(got) != 2 {
		t.Fatalf("got %d ids, want 2 (%v)", len(got), got)
	}
	if got[0] != player || got[1] != gm {
		t.Errorf("got %v, want [player gm] with departed dropped", got)
	}

	empty := FilterVisibleToParticipants(game, nil)
	if empty == nil {
		t.Error("must return an empty slice, never nil (it is marshalled to JSON)")
	}
}
