package service

import (
	"testing"

	"battle-helper/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestFilterSceneImageTokensForUser_DropsOffSceneImages(t *testing.T) {
	gmID := primitive.NewObjectID()
	playerID := primitive.NewObjectID()

	insideID := primitive.NewObjectID()
	outsideID := primitive.NewObjectID()
	straddlingID := primitive.NewObjectID()
	hiddenInsideID := primitive.NewObjectID()

	newGame := func() *models.Game {
		return &models.Game{
			GameMasterID: gmID,
			Scenes: []models.Scene{{
				GridWidth:  10,
				GridHeight: 10,
				Images: []models.SceneImage{
					{ID: insideID, X: 100, Y: 100, Width: 50, Height: 50},
					{ID: outsideID, X: -300, Y: 100, Width: 50, Height: 50},
					{ID: straddlingID, X: -25, Y: 100, Width: 50, Height: 50},
					{ID: hiddenInsideID, X: 200, Y: 200, Width: 50, Height: 50, Hidden: true},
				},
			}},
		}
	}

	playerGame := newGame()
	FilterSceneImageTokensForUser(playerGame, playerID)

	got := map[primitive.ObjectID]bool{}
	for _, i := range playerGame.Scenes[0].Images {
		got[i.ID] = true
	}
	if !got[insideID] {
		t.Error("an image inside the grid must reach the player")
	}
	if !got[straddlingID] {
		t.Error("an image straddling the edge must reach the player — CSS clips the overhang")
	}
	if got[outsideID] {
		t.Error("an image fully outside the grid must not reach the player")
	}
	if got[hiddenInsideID] {
		t.Error("a hidden image must not reach the player regardless of position")
	}

	gmGame := newGame()
	FilterSceneImageTokensForUser(gmGame, gmID)
	if len(gmGame.Scenes[0].Images) != 4 {
		t.Fatalf("the GM must keep every image, got %d of 4", len(gmGame.Scenes[0].Images))
	}
}
