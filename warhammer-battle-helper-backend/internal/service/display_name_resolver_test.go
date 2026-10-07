package service

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubUserFinder struct {
	user *models.User
	err  error
}

func (f stubUserFinder) FindByID(id primitive.ObjectID) (*models.User, error) {
	return f.user, f.err
}

func TestDisplayNameResolver(t *testing.T) {
	userID := primitive.NewObjectID()
	gameWith := func(p models.GameParticipant) *models.Game {
		p.UserID = userID
		return &models.Game{Participants: []models.GameParticipant{p}}
	}

	cases := []struct {
		name  string
		game  *models.Game
		users stubUserFinder
		want  string
	}{
		{"not a participant", &models.Game{}, stubUserFinder{}, "fallback@x"},
		{"game signature wins", gameWith(models.GameParticipant{Email: "p@x", Signature: "Gandalf"}),
			stubUserFinder{user: &models.User{Email: "u@x", Signature: "Acc"}}, "Gandalf"},
		{"account signature", gameWith(models.GameParticipant{Email: "p@x"}),
			stubUserFinder{user: &models.User{Email: "u@x", Signature: "Acc"}}, "Acc"},
		{"account email", gameWith(models.GameParticipant{Email: "p@x"}),
			stubUserFinder{user: &models.User{Email: "u@x"}}, "u@x"},
		{"user lookup fails", gameWith(models.GameParticipant{Email: "p@x"}),
			stubUserFinder{err: errors.New("down")}, "p@x"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NewDisplayNameResolver(tc.users).DisplayName(tc.game, userID, "fallback@x")
			if got != tc.want {
				t.Errorf("DisplayName = %q, want %q", got, tc.want)
			}
		})
	}
}
