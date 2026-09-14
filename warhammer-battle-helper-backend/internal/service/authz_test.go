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
