package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TestKeepSceneCharacterForViewer covers the truth table behind FilterSceneCharacterTokensForUser's
// per-placement drop decision. The GM row is not covered here: FilterSceneCharacterTokensForUser
// returns before it ever reaches the per-placement loop for the GM, so there is no "GM" case for
// this pure function to decide — that early return is exercised at the FilterSceneCharacterTokensForUser
// level, not this unit's.
func TestKeepSceneCharacterForViewer(t *testing.T) {
	charID := primitive.NewObjectID()

	cases := []struct {
		name    string
		gc      models.GameCharacter
		hasCard map[primitive.ObjectID]bool
		want    bool
	}{
		{
			name:    "card-holder with a hidden placement is kept",
			gc:      models.GameCharacter{CharacterID: charID, Hidden: true},
			hasCard: map[primitive.ObjectID]bool{charID: true},
			want:    true,
		},
		{
			name:    "card-less viewer with a hidden placement is dropped",
			gc:      models.GameCharacter{CharacterID: charID, Hidden: true},
			hasCard: map[primitive.ObjectID]bool{},
			want:    false,
		},
		{
			name:    "card-less viewer with a not-hidden placement is kept",
			gc:      models.GameCharacter{CharacterID: charID, Hidden: false},
			hasCard: map[primitive.ObjectID]bool{},
			want:    true,
		},
		{
			name:    "card-holder with a not-hidden placement is kept",
			gc:      models.GameCharacter{CharacterID: charID, Hidden: false},
			hasCard: map[primitive.ObjectID]bool{charID: true},
			want:    true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := keepSceneCharacterForViewer(c.gc, c.hasCard); got != c.want {
				t.Fatalf("keepSceneCharacterForViewer(%+v, %+v) = %v, want %v", c.gc, c.hasCard, got, c.want)
			}
		})
	}
}

// TestFilterSceneCharacterTokensForUser_GMKeepsHidden verifies that the GM early return
// in FilterSceneCharacterTokensForUser keeps all hidden character-token placements visible
// to the game master, regardless of card visibility. This early return is the sole guarantee
// that GMs always see every token on their scene.
func TestFilterSceneCharacterTokensForUser_GMKeepsHidden(t *testing.T) {
	gmID := primitive.NewObjectID()
	charID := primitive.NewObjectID()

	game := &models.Game{
		GameMasterID: gmID,
		Scenes: []models.Scene{{
			Characters: []models.GameCharacter{
				{CharacterID: charID, Hidden: true},
			},
		}},
	}

	// Call with zero-value GameService; GM early return should not touch s.charRepo
	(&GameService{}).FilterSceneCharacterTokensForUser(game, gmID)

	if len(game.Scenes[0].Characters) != 1 {
		t.Fatalf("GM must keep hidden placement, got %d characters of 1", len(game.Scenes[0].Characters))
	}
	if game.Scenes[0].Characters[0].CharacterID != charID || game.Scenes[0].Characters[0].Hidden != true {
		t.Error("hidden placement must be preserved unchanged for the GM")
	}
}
