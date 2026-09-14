package service

import (
	"fmt"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Authorization rules for game-scoped operations.
//
// The predicates below are pure: they take data and answer a question, so they are unit-testable.
// The requireX methods further down add the fetching. GameService holds concrete repository types
// rather than interfaces, so anything that touches a repo cannot be tested without a database —
// which is why every decision worth testing lives in a predicate instead.

// isGameMaster reports whether userID runs this game. A nil game (a failed fetch) authorises
// nobody: the caller returns the fetch error, and this must not panic on the way there.
func isGameMaster(game *models.Game, userID primitive.ObjectID) bool {
	return game != nil && game.GameMasterID == userID
}

// Character ownership is not decided here. CanEditCharacter in access.go owns that rule, and it
// deliberately ignores CreatedBy: CreatedBy survives a player leaving the game, so honouring it
// would keep a departed player's write access alive.

// updateTouchesVisibility reports whether a scene-token update asks to change the GM's eye toggle.
// Only that field is GM-only; the geometry fields belong to the token's owner too. A pointer field
// gives us the distinction for free: nil means "not part of this request".
func updateTouchesVisibility(req models.UpdateSceneCharacterRequest) bool {
	return req.Hidden != nil
}

// requireGM fetches the game and rejects anyone who is not its GM. It returns the game because
// most callers need it immediately after the check; discard it with `_` when you don't.
//
// `action` completes "only the game master can %s", so every message this produces is identical to
// the hand-written copy it replaces.
func (s *GameService) requireGM(gameID string, userID primitive.ObjectID, action string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	if !isGameMaster(game, userID) {
		return nil, fmt.Errorf("only the game master can %s", action)
	}
	return game, nil
}

// requireGMOrCharacterOwner allows the GM, or a player who holds the character. The character is
// only fetched when the caller is not the GM — the GM path must not fail because a character row
// is missing.
func (s *GameService) requireGMOrCharacterOwner(gameID string, characterID string, userID primitive.ObjectID, action string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	if isGameMaster(game, userID) {
		return game, nil
	}
	ch, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, err
	}
	// Ownership is CanEditCharacter's rule (access.go), not a new one: card access counts,
	// CreatedBy deliberately does not. isGM is false here because the GM already returned above.
	if !CanEditCharacter(ch, userID, false) {
		return nil, fmt.Errorf("only the game master or the character's owner can %s", action)
	}
	return game, nil
}
