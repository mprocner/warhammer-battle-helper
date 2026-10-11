package service

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestMarkTemplateUpdates(t *testing.T) {
	gm := primitive.NewObjectID()
	other := primitive.NewObjectID()
	newer, same, gone := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

	game := func(owner, src primitive.ObjectID, embedded int) models.Game {
		return models.Game{
			GameSystem:           "custom",
			GameMasterID:         owner,
			TemplateSourceID:     src,
			CustomSystemTemplate: &models.SystemTemplate{Version: embedded},
		}
	}
	versions := map[primitive.ObjectID]int{newer: 5, same: 3}

	t.Run("flags only the GM's games with a newer source", func(t *testing.T) {
		games := []models.Game{
			game(gm, newer, 3),    // newer source
			game(gm, same, 3),     // up to date
			game(gm, gone, 3),     // source deleted
			game(other, newer, 3), // viewer is a player here
			{GameMasterID: gm},    // hardcoded system, no template
			// Legacy FEATURE-102 game: hardcoded system carrying a token-display variant whose
			// settings moved on. Token display is resolved live, so there is nothing to sync.
			{GameSystem: "warhammer4e", GameMasterID: gm, TemplateSourceID: newer,
				CustomSystemTemplate: &models.SystemTemplate{Version: 3}},
		}
		var asked []primitive.ObjectID
		markTemplateUpdates(games, gm, func(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
			asked = ids
			return versions, nil
		})

		want := []bool{true, false, false, false, false, false}
		for i, w := range want {
			if games[i].TemplateUpdateAvailable != w {
				t.Errorf("games[%d].TemplateUpdateAvailable = %v, want %v", i, games[i].TemplateUpdateAvailable, w)
			}
		}
		if len(asked) != 3 {
			t.Errorf("lookup asked for %d ids, want 3 (only the GM's custom templated games)", len(asked))
		}
	})

	t.Run("lookup failure leaves every flag false", func(t *testing.T) {
		games := []models.Game{game(gm, newer, 3)}
		markTemplateUpdates(games, gm, func([]primitive.ObjectID) (map[primitive.ObjectID]int, error) {
			return nil, errors.New("mongo down")
		})
		if games[0].TemplateUpdateAvailable {
			t.Error("a failed lookup must not flag anything")
		}
	})

	t.Run("no templated GM games skips the lookup", func(t *testing.T) {
		games := []models.Game{game(other, newer, 3)}
		markTemplateUpdates(games, gm, func([]primitive.ObjectID) (map[primitive.ObjectID]int, error) {
			t.Fatal("lookup must not be called when there is nothing to check")
			return nil, nil
		})
	})
}
