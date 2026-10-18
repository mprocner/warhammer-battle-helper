package http

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestCharacterInGame(t *testing.T) {
	game := &models.Game{ID: primitive.NewObjectID()}
	other := &models.Game{ID: primitive.NewObjectID()}

	cases := []struct {
		name string
		ch   *models.Character
		game *models.Game
		want bool
	}{
		{"own game", &models.Character{GameID: game.ID}, game, true},
		// The bypass: a URL naming another game must not reach this character.
		{"another game", &models.Character{GameID: other.ID}, game, false},
		{"no game id", &models.Character{}, game, false},
		{"nil character", nil, game, false},
		{"nil game", &models.Character{GameID: game.ID}, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := characterInGame(tc.ch, tc.game); got != tc.want {
				t.Fatalf("characterInGame = %v, want %v", got, tc.want)
			}
		})
	}
}
