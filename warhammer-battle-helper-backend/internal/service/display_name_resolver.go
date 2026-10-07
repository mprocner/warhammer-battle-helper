package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type userFinder interface {
	FindByID(id primitive.ObjectID) (*models.User, error)
}

// DisplayNameResolver picks the name shown next to a user's log entries in one game.
type DisplayNameResolver struct {
	users userFinder
}

func NewDisplayNameResolver(users userFinder) *DisplayNameResolver {
	return &DisplayNameResolver{users: users}
}

// DisplayName returns game signature → account signature → account email → participant email,
// or fallback when the user is not a participant of the game.
func (r *DisplayNameResolver) DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string {
	var participant *models.GameParticipant
	for i := range game.Participants {
		if game.Participants[i].UserID == userID {
			participant = &game.Participants[i]
			break
		}
	}
	if participant == nil {
		return fallback
	}
	user, err := r.users.FindByID(userID)
	if err != nil {
		return resolveDisplayName(participant, nil)
	}
	return resolveDisplayName(participant, user)
}
