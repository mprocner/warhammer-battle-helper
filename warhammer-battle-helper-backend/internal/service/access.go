package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CanAccessGame reports whether userID may touch this game at all.
// The GM is checked explicitly: older games do not carry him in Participants.
func CanAccessGame(game *models.Game, userID primitive.ObjectID) bool {
	if game == nil || userID.IsZero() {
		return false
	}
	if game.GameMasterID == userID {
		return true
	}
	for _, p := range game.Participants {
		if p.UserID == userID {
			return true
		}
	}
	return false
}

// CanEditCharacter reports whether userID may edit this character.
// CreatedBy deliberately does NOT grant edit rights on its own: it survives a player
// leaving the game, so honouring it would keep a departed player's write access alive.
func CanEditCharacter(ch *models.Character, userID primitive.ObjectID, isGM bool) bool {
	if ch == nil {
		return false
	}
	if isGM {
		return true
	}
	for _, visID := range ch.VisibleTo {
		if visID == userID {
			return true
		}
	}
	return false
}

// FilterVisibleToParticipants drops every ID that is neither the GM nor a current
// participant. Guards against a stale GM client re-adding a departed player.
func FilterVisibleToParticipants(game *models.Game, visibleTo []primitive.ObjectID) []primitive.ObjectID {
	out := make([]primitive.ObjectID, 0, len(visibleTo))
	for _, id := range visibleTo {
		if CanAccessGame(game, id) {
			out = append(out, id)
		}
	}
	return out
}
