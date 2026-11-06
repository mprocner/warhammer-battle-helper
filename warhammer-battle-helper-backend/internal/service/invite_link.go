package service

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"

	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Invite links (PLAYRPG-303). A game has at most one link: the token is a bearer secret, so
// anyone holding it joins as a player without GM approval — publishing it is the GM's decision.
// Regenerating replaces the token (the old link dies), revoking removes it. No expiry, no use limit.

// ErrInviteLinkInvalid covers every way a link can fail: malformed, revoked, regenerated, or
// pointing at a deleted game. One error on purpose — telling these apart would let a stranger
// probe which tokens once existed.
var ErrInviteLinkInvalid = errors.New("invite link is invalid")

// errAlreadyInGame keeps the exact text the email-invite handler maps to 409.
var errAlreadyInGame = errors.New("user already in game")

// inviteTokenBytes is the token's entropy: 32 bytes = 256 bits, far past guessing range.
const inviteTokenBytes = 32

// newInviteToken returns a fresh unguessable token, URL-safe without padding so it can sit in a
// path segment pasted into chat apps.
func newInviteToken() (string, error) {
	b := make([]byte, inviteTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate invite token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// isWellFormedInviteToken rejects anything newInviteToken could not have produced before it reaches
// the database — in particular the empty string, which is what "no link" looks like.
func isWellFormedInviteToken(token string) bool {
	if len(token) != base64.RawURLEncoding.EncodedLen(inviteTokenBytes) {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(token)
	return err == nil
}

// needsToJoin reports whether opening a valid link must add userID to the game. The GM and existing
// participants just open it.
func needsToJoin(game *models.Game, userID primitive.ObjectID) bool {
	return !CanAccessGame(game, userID)
}

// playerParticipant builds the stored participant for a newly added player and the richer copy sent
// in the PARTICIPANT_JOINED broadcast (account avatar/signature are computed, never persisted).
func playerParticipant(user *models.User) (stored, broadcast models.GameParticipant) {
	stored = models.GameParticipant{
		UserID:   user.ID,
		Username: user.Email,
		Email:    user.Email,
		Role:     models.RolePlayer,
	}
	broadcast = stored
	broadcast.AccountAvatar = user.Avatar
	broadcast.AccountSignature = user.Signature
	return stored, broadcast
}

// addPlayer adds user to the game as a player and tells everyone in the game. Shared by the email
// invite and the invite link so both produce the same participant and the same broadcast.
// Returns errAlreadyInGame when the user is already a participant (the repository guards the push,
// so a double click or two tabs cannot add the same user twice).
func (s *GameService) addPlayer(gameID string, user *models.User) error {
	stored, broadcast := playerParticipant(user)
	added, err := s.gameRepo.AddParticipant(gameID, stored)
	if err != nil {
		return err
	}
	if !added {
		return errAlreadyInGame
	}
	s.hub.BroadcastToGame(gameID, websocket.EventParticipantJoined, map[string]interface{}{
		"participant": broadcast,
	})
	return nil
}

// GetInviteLink returns the game's current invite token, "" when there is none. GM only.
func (s *GameService) GetInviteLink(gameID string, gmID primitive.ObjectID) (string, error) {
	game, err := s.requireGM(gameID, gmID, "manage the invite link")
	if err != nil {
		return "", err
	}
	return game.InviteToken, nil
}

// RegenerateInviteLink creates the game's invite token, replacing any previous one. GM only.
func (s *GameService) RegenerateInviteLink(gameID string, gmID primitive.ObjectID) (string, error) {
	if _, err := s.requireGM(gameID, gmID, "manage the invite link"); err != nil {
		return "", err
	}
	token, err := newInviteToken()
	if err != nil {
		return "", err
	}
	if err := s.gameRepo.SetInviteToken(gameID, token); err != nil {
		return "", err
	}
	return token, nil
}

// RevokeInviteLink removes the game's invite token; the link stops working. GM only.
func (s *GameService) RevokeInviteLink(gameID string, gmID primitive.ObjectID) error {
	if _, err := s.requireGM(gameID, gmID, "manage the invite link"); err != nil {
		return err
	}
	return s.gameRepo.SetInviteToken(gameID, "")
}

// JoinByInviteLink adds userID to the game the token points at and returns that game's id.
// joined is false when the user was already in the game (GM included) — they just open it.
// Every failure to resolve the token is ErrInviteLinkInvalid, so nothing about the game leaks.
func (s *GameService) JoinByInviteLink(token string, userID primitive.ObjectID) (gameID string, joined bool, err error) {
	if !isWellFormedInviteToken(token) {
		return "", false, ErrInviteLinkInvalid
	}
	game, err := s.gameRepo.FindByInviteToken(token)
	if err != nil {
		return "", false, err
	}
	if game == nil {
		return "", false, ErrInviteLinkInvalid
	}
	gameID = game.ID.Hex()
	if !needsToJoin(game, userID) {
		return gameID, false, nil
	}

	user, err := s.userRepo.FindByID(userID)
	if err != nil || user == nil {
		return "", false, fmt.Errorf("user not found")
	}
	if err := s.addPlayer(gameID, user); err != nil {
		// Lost a race with another tab of the same user: they are in, which is all we wanted.
		if errors.Is(err, errAlreadyInGame) {
			return gameID, false, nil
		}
		return "", false, err
	}
	return gameID, true, nil
}
