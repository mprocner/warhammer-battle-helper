package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/systems/registry"
	"battle-helper/internal/websocket"
	"fmt"
	"log"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type GameService struct {
	gameRepo *repository.GameRepository
	userRepo *repository.UserRepository
	charRepo *repository.CharactersRepository
	hub      *websocket.Hub
}

func NewGameService(
	gameRepo *repository.GameRepository,
	userRepo *repository.UserRepository,
	charRepo *repository.CharactersRepository,
	hub *websocket.Hub,
) *GameService {
	return &GameService{
		gameRepo: gameRepo,
		userRepo: userRepo,
		charRepo: charRepo,
		hub:      hub,
	}
}

// CreateGame creates a new game session
func (s *GameService) CreateGame(name, gameSystem string, gameMasterID primitive.ObjectID, username string) (*models.Game, error) {
	game := &models.Game{
		Name:         name,
		GameSystem:   gameSystem,
		GameMasterID: gameMasterID,
		Status:       models.GameStatusActive,
		Participants: []models.GameParticipant{
			{
				UserID:   gameMasterID,
				Username: username,
				Role:     models.RoleGameMaster,
			},
		},
		Characters:     []models.GameCharacter{},
		Events:         []models.GameEvent{},
		Handouts:       []models.Handout{},
		HandoutFolders: []models.HandoutFolder{},
		Scenes:         []models.Scene{},
	}

	if err := s.gameRepo.Create(game); err != nil {
		return nil, fmt.Errorf("failed to create game: %w", err)
	}

	// Create default scene
	s.EnsureDefaultScene(game)

	// Add initial event
	event := models.GameEvent{
		Type:      models.EventTypeMessage,
		CreatedBy: gameMasterID,
		Username:  username,
		Data: map[string]interface{}{
			"message": fmt.Sprintf("Game '%s' created by %s", name, username),
			"type":    "info",
		},
	}
	s.gameRepo.AddEvent(game.ID.Hex(), event)

	return game, nil
}

// GetGame retrieves a game by ID
func (s *GameService) GetGame(gameID string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	// Ensure backward compatibility - create default scene if none exist
	s.EnsureDefaultScene(game)

	// Ensure GM is in participants (backward compat for older games)
	s.EnsureGMParticipant(game)

	// Populate Game Master email
	if !game.GameMasterID.IsZero() {
		gmUser, err := s.userRepo.FindByID(game.GameMasterID)
		if err == nil && gmUser != nil {
			game.GameMasterEmail = gmUser.Email
		}
	}

	// Enrich participants with account avatar and signature
	s.enrichParticipants(game)

	return game, nil
}

// EnsureGMParticipant adds the GM to the participants array if missing (backward compat for older games)
func (s *GameService) EnsureGMParticipant(game *models.Game) {
	if game.GameMasterID.IsZero() {
		return
	}
	for _, p := range game.Participants {
		if p.UserID == game.GameMasterID {
			return // GM already present
		}
	}
	gmUser, err := s.userRepo.FindByID(game.GameMasterID)
	if err != nil || gmUser == nil {
		return
	}
	gm := models.GameParticipant{
		UserID:   game.GameMasterID,
		Username: gmUser.Email,
		Email:    gmUser.Email,
		Role:     models.RoleGameMaster,
		JoinedAt: game.CreatedAt,
	}
	log.Printf("[DEBUG] EnsureGMParticipant: adding GM %s to participants for game %s", gmUser.Email, game.ID.Hex())
	if err := s.gameRepo.AddParticipant(game.ID.Hex(), gm); err != nil {
		log.Printf("[DEBUG] EnsureGMParticipant: failed to persist: %v", err)
	}
	game.Participants = append(game.Participants, gm)
}

// enrichParticipants populates AccountAvatar and AccountSignature for each participant
func (s *GameService) enrichParticipants(game *models.Game) {
	if len(game.Participants) == 0 {
		return
	}
	ids := make([]primitive.ObjectID, 0, len(game.Participants))
	for _, p := range game.Participants {
		ids = append(ids, p.UserID)
	}
	users, err := s.userRepo.FindByIDs(ids)
	if err != nil {
		return
	}
	userMap := make(map[primitive.ObjectID]*models.User, len(users))
	for i := range users {
		userMap[users[i].ID] = &users[i]
	}
	for i := range game.Participants {
		if u, ok := userMap[game.Participants[i].UserID]; ok {
			game.Participants[i].AccountAvatar = u.Avatar
			game.Participants[i].AccountSignature = u.Signature
		}
	}
}

// resolveDisplayName returns the best display name for a participant: game sig → account sig → email
func resolveDisplayName(participant *models.GameParticipant, user *models.User) string {
	if participant.Signature != "" {
		return participant.Signature
	}
	if user != nil && user.Signature != "" {
		return user.Signature
	}
	if user != nil {
		return user.Email
	}
	return participant.Email
}

// resolveDisplayNameForUser resolves display name for a user in a game context
func (s *GameService) resolveDisplayNameForUser(game *models.Game, userID primitive.ObjectID, fallbackEmail string) string {
	var participant *models.GameParticipant
	for i := range game.Participants {
		if game.Participants[i].UserID == userID {
			participant = &game.Participants[i]
			break
		}
	}
	if participant == nil {
		return fallbackEmail
	}
	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return resolveDisplayName(participant, nil)
	}
	return resolveDisplayName(participant, user)
}

// GetAllGames retrieves all active games
func (s *GameService) GetAllGames() ([]models.Game, error) {
	games, err := s.gameRepo.GetAll()
	if err != nil {
		return nil, err
	}

	// Populate Game Master email for each game
	for i := range games {
		if !games[i].GameMasterID.IsZero() {
			gmUser, err := s.userRepo.FindByID(games[i].GameMasterID)
			if err == nil && gmUser != nil {
				games[i].GameMasterEmail = gmUser.Email
			}
		}
	}

	return games, nil
}

// GetGamesForUser retrieves games visible to the given user (GM or active participant)
func (s *GameService) GetGamesForUser(userID primitive.ObjectID) ([]models.Game, error) {
	games, err := s.gameRepo.GetByUserID(userID)
	if err != nil {
		return nil, err
	}

	for i := range games {
		if !games[i].GameMasterID.IsZero() {
			gmUser, err := s.userRepo.FindByID(games[i].GameMasterID)
			if err == nil && gmUser != nil {
				games[i].GameMasterEmail = gmUser.Email
			}
		}
	}

	return games, nil
}

// InvitePlayer invites a user by email to a game (GM only)
func (s *GameService) InvitePlayer(gameID primitive.ObjectID, gmUserID primitive.ObjectID, email string) error {
	game, err := s.gameRepo.GetByID(gameID.Hex())
	if err != nil {
		return err
	}

	if game.GameMasterID != gmUserID {
		return fmt.Errorf("only the game master can invite players")
	}

	invitedUser, err := s.userRepo.FindByEmail(email)
	if err != nil {
		return fmt.Errorf("user not found")
	}

	// Check if user is already a participant
	for _, p := range game.Participants {
		if p.UserID == invitedUser.ID {
			return fmt.Errorf("user already in game")
		}
	}

	participant := models.GameParticipant{
		UserID:   invitedUser.ID,
		Username: invitedUser.Email,
		Email:    invitedUser.Email,
		Role:     models.RolePlayer,
	}
	if err := s.gameRepo.AddParticipant(gameID.Hex(), participant); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID.Hex(), "PARTICIPANT_JOINED", map[string]interface{}{
		"userId":   invitedUser.ID.Hex(),
		"username": invitedUser.Email,
		"role":     models.RolePlayer,
	})

	return nil
}

// JoinGame adds a user to a game
func (s *GameService) JoinGame(gameID string, userID primitive.ObjectID, username string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	// GM can join the game session but should not be added as a participant
	if game.GameMasterID == userID {
		return game, nil
	}

	// Check if user already exists in participants
	for _, p := range game.Participants {
		if p.UserID == userID {
			return nil, fmt.Errorf("user already in game")
		}
	}

	participant := models.GameParticipant{
		UserID:   userID,
		Username: username,
		Role:     models.RolePlayer,
	}
	if err := s.gameRepo.AddParticipant(gameID, participant); err != nil {
		return nil, err
	}

	// Add join event
	event := models.GameEvent{
		Type:      models.EventTypeJoin,
		CreatedBy: userID,
		Username:  username,
		Data: map[string]interface{}{
			"message": fmt.Sprintf("%s joined the game", username),
			"type":    "info",
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "PARTICIPANT_JOINED", map[string]interface{}{
		"userId":   userID.Hex(),
		"username": username,
		"role":     models.RolePlayer,
	})

	return s.gameRepo.GetByID(gameID)
}

// DeleteGame deletes a game entirely (GM only)
func (s *GameService) DeleteGame(gameID string, userID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can delete the game")
	}

	if err := s.gameRepo.Delete(gameID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "GAME_DELETED", map[string]interface{}{
		"gameId": gameID,
	})

	return nil
}

// LeaveGame removes a user from a game
func (s *GameService) LeaveGame(gameID string, userID primitive.ObjectID, username string) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	// GM is not stored as a participant, so skip RemoveParticipant
	if game.GameMasterID != userID {
		if err := s.gameRepo.RemoveParticipant(gameID, userID); err != nil {
			return err
		}
	}

	// Add leave event
	event := models.GameEvent{
		Type:      models.EventTypeLeave,
		CreatedBy: userID,
		Username:  username,
		Data: map[string]interface{}{
			"message": fmt.Sprintf("%s left the game", username),
			"type":    "info",
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "PARTICIPANT_LEFT", map[string]interface{}{
		"userId": userID.Hex(),
	})

	return nil
}

// AddCharacterToGrid adds a character to the battle grid
func (s *GameService) AddCharacterToGrid(gameID, characterID string, x, y int, isEnemy bool, placedBy primitive.ObjectID, username string) error {
	// Get character details
	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return fmt.Errorf("character not found: %w", err)
	}

	charObjectID, _ := primitive.ObjectIDFromHex(characterID)

	gameChar := models.GameCharacter{
		CharacterID: charObjectID,
		Name:        character.Name,
		Avatar:      character.Avatar,
		PositionX:   x,
		PositionY:   y,
		IsEnemy:     isEnemy,
		PlacedBy:    placedBy,
	}

	if err := s.gameRepo.AddCharacter(gameID, gameChar); err != nil {
		return err
	}

	// Add event
	event := models.GameEvent{
		Type:      models.EventTypeCharacterAdd,
		CreatedBy: placedBy,
		Username:  username,
		Data: map[string]interface{}{
			"characterId": characterID,
			"name":        character.Name,
			"x":           x,
			"y":           y,
			"isEnemy":     isEnemy,
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "CHARACTER_ADDED", map[string]interface{}{
		"character": gameChar,
	})

	return nil
}

// MoveCharacter updates a character's position on the grid
func (s *GameService) MoveCharacter(gameID string, characterID primitive.ObjectID, x, y int, movedBy primitive.ObjectID, username string) error {
	if err := s.gameRepo.UpdateCharacterPosition(gameID, characterID, x, y); err != nil {
		return err
	}

	// Add event
	event := models.GameEvent{
		Type:      models.EventTypeMove,
		CreatedBy: movedBy,
		Username:  username,
		Data: map[string]interface{}{
			"characterId": characterID.Hex(),
			"x":           x,
			"y":           y,
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "CHARACTER_MOVED", map[string]interface{}{
		"characterId": characterID.Hex(),
		"x":           x,
		"y":           y,
		"movedBy":     username,
	})

	return nil
}

// RemoveCharacter removes a character from the grid
func (s *GameService) RemoveCharacter(gameID string, characterID primitive.ObjectID, removedBy primitive.ObjectID, username string) error {
	if err := s.gameRepo.RemoveCharacter(gameID, characterID); err != nil {
		return err
	}

	// Add event
	event := models.GameEvent{
		Type:      models.EventTypeCharacterRemove,
		CreatedBy: removedBy,
		Username:  username,
		Data: map[string]interface{}{
			"characterId": characterID.Hex(),
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "CHARACTER_REMOVED", map[string]interface{}{
		"characterId": characterID.Hex(),
	})

	return nil
}

// AddLogMessage adds a message to the game log
func (s *GameService) AddLogMessage(gameID string, message string, messageType string, userID primitive.ObjectID, username string) error {
	event := models.GameEvent{
		Type:      models.EventTypeMessage,
		CreatedBy: userID,
		Username:  username,
		Data: map[string]interface{}{
			"message": message,
			"type":    messageType,
		},
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return err
	}

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "LOG_MESSAGE", map[string]interface{}{
		"message":  message,
		"type":     messageType,
		"username": username,
	})

	return nil
}

// RollDice rolls dice and logs the result (simple die roll, no character lookup)
func (s *GameService) RollDice(gameID string, sides int, userID primitive.ObjectID, username string) (int, error) {
	dice := Dice{Sizes: sides}
	result := dice.Roll()

	displayName := username
	if game, err := s.gameRepo.GetByID(gameID); err == nil {
		displayName = s.resolveDisplayNameForUser(game, userID, username)
	}

	eventData := map[string]interface{}{
		"rollType": "simple",
		"sides":    sides,
		"result":   result,
		"username": displayName,
	}

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  displayName,
		Data:      eventData,
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return 0, err
	}

	s.hub.BroadcastToGame(gameID, "DICE_ROLLED", eventData)
	return result, nil
}

// RollSkill rolls a skill/attribute check dispatched through the game system registry.
func (s *GameService) RollSkill(gameID string, skillKey string, modifier int, diceMod int, characterID string, userID primitive.ObjectID, username string) (map[string]interface{}, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, fmt.Errorf("game not found: %w", err)
	}

	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, fmt.Errorf("character not found: %w", err)
	}

	plugin, err := registry.Get(game.GameSystem)
	if err != nil {
		return nil, err
	}

	rollResult, err := plugin.RollSkill(character.Stats, skillKey, modifier, diceMod)
	if err != nil {
		return nil, err
	}

	displayName := s.resolveDisplayNameForUser(game, userID, username)

	rollResult.CharacterID = characterID
	rollResult.CharacterName = character.Name
	rollResult.Username = displayName

	broadcastData := map[string]interface{}{
		"rollType":      rollResult.RollType,
		"characterId":   characterID,
		"characterName": character.Name,
		"skillKey":      rollResult.SkillKey,
		"skillName":     rollResult.SkillName,
		"roll":          rollResult.Roll,
		"target":        rollResult.Target,
		"outcome":       rollResult.Outcome,
		"successLevel":  rollResult.SuccessLevel,
		"modifier":      modifier,
		"diceMod":       diceMod,
		"allRolls":      rollResult.AllRolls,
		"username":      displayName,
	}

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  displayName,
		Data:      broadcastData,
	}
	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	s.hub.BroadcastToGame(gameID, "SKILL_ROLLED", broadcastData)
	return broadcastData, nil
}

// RollWeapon rolls a weapon attack dispatched through the game system registry.
func (s *GameService) RollWeapon(gameID string, weaponName string, weaponSkill string, damage string, modifier int, diceMod int, characterID string, userID primitive.ObjectID, username string) (map[string]interface{}, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, fmt.Errorf("game not found: %w", err)
	}

	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, fmt.Errorf("character not found: %w", err)
	}

	plugin, err := registry.Get(game.GameSystem)
	if err != nil {
		return nil, err
	}

	rollResult, err := plugin.RollWeapon(character.Stats, weaponName, weaponSkill, damage, modifier, diceMod)
	if err != nil {
		return nil, err
	}

	displayName := s.resolveDisplayNameForUser(game, userID, username)

	rollResult.CharacterID = characterID
	rollResult.CharacterName = character.Name
	rollResult.Username = displayName

	broadcastData := map[string]interface{}{
		"rollType":        rollResult.RollType,
		"characterId":     characterID,
		"characterName":   character.Name,
		"weaponName":      rollResult.WeaponName,
		"damage":          rollResult.Damage,
		"damageRoll":      rollResult.DamageRoll,
		"damageBreakdown": rollResult.DamageBreakdown,
		"roll":            rollResult.Roll,
		"target":          rollResult.Target,
		"outcome":         rollResult.Outcome,
		"successLevel":    rollResult.SuccessLevel,
		"modifier":        modifier,
		"diceMod":         diceMod,
		"allRolls":        rollResult.AllRolls,
		"username":        displayName,
	}

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  displayName,
		Data:      broadcastData,
	}
	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	s.hub.BroadcastToGame(gameID, "WEAPON_ROLLED", broadcastData)
	return broadcastData, nil
}

// UpdateParticipant updates avatar and signature for the requesting user in a game
func (s *GameService) UpdateParticipant(gameID string, userID primitive.ObjectID, avatar, signature string) error {
	if len(signature) > 50 {
		return fmt.Errorf("signature must be at most 50 characters")
	}
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return fmt.Errorf("game not found")
	}
	// Verify user is a participant
	found := false
	for _, p := range game.Participants {
		if p.UserID == userID {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("user is not a participant of this game")
	}
	gameObjID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID")
	}
	if err := s.gameRepo.UpdateParticipant(gameObjID, userID, avatar, signature); err != nil {
		return err
	}
	s.hub.BroadcastToGame(gameID, "PARTICIPANT_UPDATED", map[string]interface{}{
		"userId": userID.Hex(),
	})
	return nil
}

// CreateHandout creates a new handout in a game (GM only)
func (s *GameService) CreateHandout(gameID string, userID primitive.ObjectID, req models.CreateHandoutRequest) (*models.Handout, error) {
	// Verify user is the GM
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	if game.GameMasterID != userID {
		return nil, fmt.Errorf("only the game master can create handouts")
	}

	// Determine the order (append to end)
	order := len(game.Handouts)

	handout := models.Handout{
		Title:       req.Title,
		Description: req.Description,
		Type:        req.Type,
		Visibility:  req.Visibility,
		FileURL:     req.FileURL,
		Order:       order,
	}

	createdHandout, err := s.gameRepo.AddHandout(gameID, handout)
	if err != nil {
		return nil, err
	}

	// Broadcast to clients
	s.hub.BroadcastToGame(gameID, "HANDOUT_CREATED", map[string]interface{}{
		"handout": createdHandout,
	})

	return createdHandout, nil
}

// UpdateHandout updates an existing handout (GM only)
func (s *GameService) UpdateHandout(gameID string, handoutID primitive.ObjectID, userID primitive.ObjectID, req models.UpdateHandoutRequest) error {
	// Verify user is the GM
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can update handouts")
	}

	if err := s.gameRepo.UpdateHandout(gameID, handoutID, req); err != nil {
		return err
	}

	// Get updated handout
	updatedHandout, err := s.gameRepo.GetHandout(gameID, handoutID)
	if err != nil {
		return err
	}

	// Broadcast to clients
	s.hub.BroadcastToGame(gameID, "HANDOUT_UPDATED", map[string]interface{}{
		"handout": updatedHandout,
	})

	return nil
}

// DeleteHandout deletes a handout (GM only)
func (s *GameService) DeleteHandout(gameID string, handoutID primitive.ObjectID, userID primitive.ObjectID) (string, error) {
	// Verify user is the GM
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return "", err
	}

	if game.GameMasterID != userID {
		return "", fmt.Errorf("only the game master can delete handouts")
	}

	// Get the handout to return the file URL for cleanup
	handout, err := s.gameRepo.GetHandout(gameID, handoutID)
	if err != nil {
		return "", err
	}

	fileURL := handout.FileURL

	if err := s.gameRepo.DeleteHandout(gameID, handoutID); err != nil {
		return "", err
	}

	// Broadcast to clients
	s.hub.BroadcastToGame(gameID, "HANDOUT_DELETED", map[string]interface{}{
		"handoutId": handoutID.Hex(),
	})

	return fileURL, nil
}

// ReorderHandouts reorders handouts in a game (GM only)
func (s *GameService) ReorderHandouts(gameID string, userID primitive.ObjectID, handoutIDs []string) error {
	// Verify user is the GM
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can reorder handouts")
	}

	// Convert string IDs to ObjectIDs
	objectIDs := make([]primitive.ObjectID, len(handoutIDs))
	for i, id := range handoutIDs {
		objectID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			return fmt.Errorf("invalid handout ID: %s", id)
		}
		objectIDs[i] = objectID
	}

	if err := s.gameRepo.ReorderHandouts(gameID, objectIDs); err != nil {
		return err
	}

	// Get updated handouts
	updatedGame, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	// Broadcast to clients
	s.hub.BroadcastToGame(gameID, "HANDOUTS_REORDERED", map[string]interface{}{
		"handouts": updatedGame.Handouts,
	})

	return nil
}

// GetVisibleHandouts returns handouts visible to a specific user
func (s *GameService) GetVisibleHandouts(gameID string, userID primitive.ObjectID) ([]models.Handout, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	// Check if user is the GM
	isGM := game.GameMasterID == userID

	// Filter handouts based on visibility
	visibleHandouts := make([]models.Handout, 0)
	for _, handout := range game.Handouts {
		if isGM {
			// GM sees all handouts
			visibleHandouts = append(visibleHandouts, handout)
		} else {
			// Check visibility
			for _, v := range handout.Visibility {
				if v == "all" || v == userID.Hex() {
					visibleHandouts = append(visibleHandouts, handout)
					break
				}
			}
		}
	}

	return visibleHandouts, nil
}

// GetHandoutsData returns handouts and folders visible to a specific user
func (s *GameService) GetHandoutsData(gameID string, userID primitive.ObjectID) (*models.GetHandoutsResponse, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	isGM := game.GameMasterID == userID

	visibleHandouts := make([]models.Handout, 0)
	for _, handout := range game.Handouts {
		if isGM {
			visibleHandouts = append(visibleHandouts, handout)
		} else {
			for _, v := range handout.Visibility {
				if v == "all" || v == userID.Hex() {
					visibleHandouts = append(visibleHandouts, handout)
					break
				}
			}
		}
	}

	folders := game.HandoutFolders
	if folders == nil {
		folders = []models.HandoutFolder{}
	}

	return &models.GetHandoutsResponse{
		Handouts:       visibleHandouts,
		HandoutFolders: folders,
	}, nil
}

// CreateHandoutFolder creates a new handout folder (GM only)
func (s *GameService) CreateHandoutFolder(gameID string, userID primitive.ObjectID, req models.CreateHandoutFolderRequest) (*models.HandoutFolder, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	if game.GameMasterID != userID {
		return nil, fmt.Errorf("only the game master can create handout folders")
	}

	folder := models.HandoutFolder{
		Name:  req.Name,
		Order: len(game.HandoutFolders),
	}

	createdFolder, err := s.gameRepo.AddHandoutFolder(gameID, folder)
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastToGame(gameID, "HANDOUT_FOLDER_CREATED", map[string]interface{}{
		"folder": createdFolder,
	})

	return createdFolder, nil
}

// RenameHandoutFolder renames a handout folder (GM only)
func (s *GameService) RenameHandoutFolder(gameID string, folderID primitive.ObjectID, userID primitive.ObjectID, req models.RenameHandoutFolderRequest) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can rename handout folders")
	}

	if err := s.gameRepo.RenameHandoutFolder(gameID, folderID, req.Name); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "HANDOUT_FOLDER_UPDATED", map[string]interface{}{
		"folderId": folderID.Hex(),
		"name":     req.Name,
	})

	return nil
}

// DeleteHandoutFolder deletes a handout folder and ungroups its handouts (GM only)
func (s *GameService) DeleteHandoutFolder(gameID string, folderID primitive.ObjectID, userID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can delete handout folders")
	}

	if err := s.gameRepo.DeleteHandoutFolder(gameID, folderID); err != nil {
		return err
	}

	updatedGame, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "HANDOUT_FOLDER_DELETED", map[string]interface{}{
		"folderId": folderID.Hex(),
		"handouts": updatedGame.Handouts,
		"folders":  updatedGame.HandoutFolders,
	})

	return nil
}

// ReorderHandoutFolders reorders handout folders (GM only)
func (s *GameService) ReorderHandoutFolders(gameID string, userID primitive.ObjectID, folderIDs []string) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can reorder handout folders")
	}

	objectIDs := make([]primitive.ObjectID, len(folderIDs))
	for i, id := range folderIDs {
		oid, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			return fmt.Errorf("invalid folder ID: %s", id)
		}
		objectIDs[i] = oid
	}

	if err := s.gameRepo.ReorderHandoutFolders(gameID, objectIDs); err != nil {
		return err
	}

	updatedGame, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "HANDOUT_FOLDERS_REORDERED", map[string]interface{}{
		"folders": updatedGame.HandoutFolders,
	})

	return nil
}

// MoveHandout moves a handout to a folder (GM only)
func (s *GameService) MoveHandout(gameID string, handoutID primitive.ObjectID, userID primitive.ObjectID, req models.MoveHandoutRequest) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can move handouts")
	}

	var folderObjectID *primitive.ObjectID
	if req.FolderID != nil {
		oid, err := primitive.ObjectIDFromHex(*req.FolderID)
		if err != nil {
			return fmt.Errorf("invalid folder ID: %w", err)
		}
		folderObjectID = &oid
	}

	if err := s.gameRepo.MoveHandoutToFolder(gameID, handoutID, folderObjectID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "HANDOUT_MOVED", map[string]interface{}{
		"handoutId": handoutID.Hex(),
		"folderId":  req.FolderID,
	})

	return nil
}

// --- Scene Service Methods ---

// EnsureDefaultScene creates a default scene for games without scenes (backward compatibility)
func (s *GameService) EnsureDefaultScene(game *models.Game) {
	if len(game.Scenes) == 0 {
		scene := models.Scene{
			Name:            "Default",
			GridVisible:     true,
			GridWidth:       20,
			GridHeight:      20,
			Characters:      game.Characters,
			Images:          []models.SceneImage{},
			AssignedPlayers: []primitive.ObjectID{},
			IsDefault:       true,
		}
		createdScene, err := s.gameRepo.AddScene(game.ID.Hex(), scene)
		if err == nil {
			game.Scenes = []models.Scene{*createdScene}
		}
	}
}

// CreateScene creates a new scene in a game (GM only)
func (s *GameService) CreateScene(gameID string, userID primitive.ObjectID, req models.CreateSceneRequest) (*models.Scene, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	if game.GameMasterID != userID {
		return nil, fmt.Errorf("only the game master can create scenes")
	}

	gridWidth := req.GridWidth
	if gridWidth <= 0 {
		gridWidth = 20
	}
	gridHeight := req.GridHeight
	if gridHeight <= 0 {
		gridHeight = 20
	}

	scene := models.Scene{
		Name:            req.Name,
		GridVisible:     true,
		GridWidth:       gridWidth,
		GridHeight:      gridHeight,
		Characters:      []models.GameCharacter{},
		Images:          []models.SceneImage{},
		AssignedPlayers: []primitive.ObjectID{},
		IsDefault:       false,
	}

	createdScene, err := s.gameRepo.AddScene(gameID, scene)
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_CREATED", map[string]interface{}{
		"scene": createdScene,
	})

	return createdScene, nil
}

// UpdateScene updates a scene's properties (GM only)
func (s *GameService) UpdateScene(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.UpdateSceneRequest) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can update scenes")
	}

	if err := s.gameRepo.UpdateScene(gameID, sceneID, req); err != nil {
		return err
	}

	updatedScene, err := s.gameRepo.GetScene(gameID, sceneID)
	if err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_UPDATED", map[string]interface{}{
		"scene": updatedScene,
	})

	return nil
}

// DeleteScene deletes a scene (GM only)
func (s *GameService) DeleteScene(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can delete scenes")
	}

	if err := s.gameRepo.DeleteScene(gameID, sceneID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_DELETED", map[string]interface{}{
		"sceneId": sceneID.Hex(),
	})

	return nil
}

// AssignPlayerToScene assigns or removes a player from a scene (GM only)
func (s *GameService) AssignPlayerToScene(gameID string, sceneID primitive.ObjectID, playerID primitive.ObjectID, userID primitive.ObjectID, assign bool) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can assign players to scenes")
	}

	if assign {
		// Remove player from all other scenes first
		for _, scene := range game.Scenes {
			for _, pid := range scene.AssignedPlayers {
				if pid == playerID {
					s.gameRepo.RemovePlayerFromScene(gameID, scene.ID, playerID)
				}
			}
		}
		if err := s.gameRepo.AssignPlayerToScene(gameID, sceneID, playerID); err != nil {
			return err
		}
	} else {
		if err := s.gameRepo.RemovePlayerFromScene(gameID, sceneID, playerID); err != nil {
			return err
		}
	}

	s.hub.BroadcastToGame(gameID, "PLAYER_SCENE_CHANGED", map[string]interface{}{
		"playerId": playerID.Hex(),
		"sceneId":  sceneID.Hex(),
		"assigned": assign,
	})

	return nil
}

// AddCharacterToScene adds a character to a scene
func (s *GameService) AddCharacterToScene(gameID string, sceneID primitive.ObjectID, characterID string, x, y int, isEnemy bool, placedBy primitive.ObjectID) error {
	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return fmt.Errorf("character not found: %w", err)
	}

	charObjectID, _ := primitive.ObjectIDFromHex(characterID)

	gameChar := models.GameCharacter{
		CharacterID: charObjectID,
		Name:        character.Name,
		Avatar:      character.Avatar,
		PositionX:   x,
		PositionY:   y,
		IsEnemy:     isEnemy,
		PlacedBy:    placedBy,
	}

	if err := s.gameRepo.AddSceneCharacter(gameID, sceneID, gameChar); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_CHARACTER_ADDED", map[string]interface{}{
		"sceneId":   sceneID.Hex(),
		"character": gameChar,
	})

	return nil
}

// MoveCharacterInScene updates a character's position within a scene
func (s *GameService) MoveCharacterInScene(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID, x, y int) error {
	if err := s.gameRepo.UpdateSceneCharacterPosition(gameID, sceneID, characterID, x, y); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_CHARACTER_MOVED", map[string]interface{}{
		"sceneId":     sceneID.Hex(),
		"characterId": characterID.Hex(),
		"x":           x,
		"y":           y,
	})

	return nil
}

// RemoveCharacterFromScene removes a character from a scene
func (s *GameService) RemoveCharacterFromScene(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID) error {
	if err := s.gameRepo.RemoveSceneCharacter(gameID, sceneID, characterID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_CHARACTER_REMOVED", map[string]interface{}{
		"sceneId":     sceneID.Hex(),
		"characterId": characterID.Hex(),
	})

	return nil
}

// AddImageToScene adds an image to a scene (GM only)
func (s *GameService) AddImageToScene(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.AddSceneImageRequest) (*models.SceneImage, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	if game.GameMasterID != userID {
		return nil, fmt.Errorf("only the game master can add images to scenes")
	}

	image := models.SceneImage{
		FileURL:  req.FileURL,
		FileName: req.FileName,
		Layer:    req.Layer,
		X:        req.X,
		Y:        req.Y,
		Width:    req.Width,
		Height:   req.Height,
		ZIndex:   0,
	}

	createdImage, err := s.gameRepo.AddSceneImage(gameID, sceneID, image)
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_IMAGE_ADDED", map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"image":   createdImage,
	})

	return createdImage, nil
}

// UpdateSceneImage updates an image within a scene (GM only)
func (s *GameService) UpdateSceneImage(gameID string, sceneID primitive.ObjectID, imageID primitive.ObjectID, userID primitive.ObjectID, req models.UpdateSceneImageRequest) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can update scene images")
	}

	// If the image is locked, only the locked field itself may be changed (to unlock)
	for _, scene := range game.Scenes {
		if scene.ID != sceneID {
			continue
		}
		for _, img := range scene.Images {
			if img.ID != imageID {
				continue
			}
			if img.Locked && (req.X != nil || req.Y != nil || req.Width != nil || req.Height != nil || req.ZIndex != nil || req.Layer != nil) {
				return fmt.Errorf("image is locked")
			}
		}
	}

	if err := s.gameRepo.UpdateSceneImage(gameID, sceneID, imageID, req); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_IMAGE_UPDATED", map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"imageId": imageID.Hex(),
		"update":  req,
	})

	return nil
}

// DeleteSceneImage deletes an image from a scene (GM only)
func (s *GameService) DeleteSceneImage(gameID string, sceneID primitive.ObjectID, imageID primitive.ObjectID, userID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can delete scene images")
	}

	if err := s.gameRepo.DeleteSceneImage(gameID, sceneID, imageID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, "SCENE_IMAGE_DELETED", map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"imageId": imageID.Hex(),
	})

	return nil
}

// BroadcastMusicCommand validates GM and broadcasts a music command to all game clients
func (s *GameService) BroadcastMusicCommand(gameID string, userID primitive.ObjectID, msgType string, payload map[string]interface{}) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can control music")
	}

	s.hub.BroadcastToGame(gameID, msgType, payload)
	return nil
}

// GetScenes returns all scenes for a game
func (s *GameService) GetScenes(gameID string) ([]models.Scene, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	return game.Scenes, nil
}
