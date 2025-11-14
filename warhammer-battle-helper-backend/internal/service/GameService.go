package service

import (
	"battle-helper/internal/http/requests"
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"

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
func (s *GameService) CreateGame(name string, gameMasterID primitive.ObjectID, username string) (*models.Game, error) {
	game := &models.Game{
		Name:         name,
		GameMasterID: gameMasterID,
		Status:       models.GameStatusActive,
		Participants: []models.GameParticipant{
			{
				UserID:   gameMasterID,
				Username: username,
				Role:     models.RoleGameMaster,
				IsActive: true,
			},
		},
		Characters: []models.GameCharacter{},
		Events:     []models.GameEvent{},
	}

	if err := s.gameRepo.Create(game); err != nil {
		return nil, fmt.Errorf("failed to create game: %w", err)
	}

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
	return s.gameRepo.GetByID(gameID)
}

// GetAllGames retrieves all active games
func (s *GameService) GetAllGames() ([]models.Game, error) {
	return s.gameRepo.GetAll()
}

// JoinGame adds a user to a game
func (s *GameService) JoinGame(gameID string, userID primitive.ObjectID, username string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	// Check if user is already in the game
	for _, p := range game.Participants {
		if p.UserID == userID && p.IsActive {
			return nil, fmt.Errorf("user already in game")
		}
	}

	// Add participant
	participant := models.GameParticipant{
		UserID:   userID,
		Username: username,
		Role:     models.RolePlayer,
		IsActive: true,
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

// LeaveGame removes a user from a game
func (s *GameService) LeaveGame(gameID string, userID primitive.ObjectID, username string) error {
	if err := s.gameRepo.RemoveParticipant(gameID, userID); err != nil {
		return err
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
		Name:        character.BasicInfo.Name,
		Avatar:      character.BasicInfo.Avatar,
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
			"name":        character.BasicInfo.Name,
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

// Fight initiates combat between two characters in the game
func (s *GameService) Fight(gameID string, attackerID, defenderID string, attackerModifier, defenderModifier int, userID primitive.ObjectID, username string) (map[string]interface{}, error) {
	// Use the FightService to handle the combat logic
	fightService := NewFightService(s.charRepo)

	// Create fight request using the proper type
	fightRequest := requests.FightRequest{
		Attacker: requests.CharacterRequest{
			Id:       attackerID,
			Modifier: attackerModifier,
		},
		Defender: requests.CharacterRequest{
			Id:       defenderID,
			Modifier: defenderModifier,
		},
		ZoneId: gameID, // Use gameID as zoneId
	}

	// Execute fight
	result := fightService.Fight(fightRequest)

	// Add fight event
	event := models.GameEvent{
		Type:      models.EventTypeAttack,
		CreatedBy: userID,
		Username:  username,
		Data: map[string]interface{}{
			"attackerId": attackerID,
			"defenderId": defenderID,
			"messages":   result.Messages,
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast fight result to all clients
	s.hub.BroadcastToGame(gameID, "FIGHT_RESULT", map[string]interface{}{
		"username": username,
		"messages": result.Messages,
	})

	// Convert response to map for API response
	resultMap := map[string]interface{}{
		"messages": result.Messages,
	}

	return resultMap, nil
}

// RollDice rolls dice and logs the result
func (s *GameService) RollDice(gameID string, sides int, userID primitive.ObjectID, username string) (int, error) {
	// Use the Dice service for proper random rolls
	dice := Dice{Sizes: sides}
	result := dice.Roll()

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  username,
		Data: map[string]interface{}{
			"sides":  sides,
			"result": result,
		},
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return 0, err
	}

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "DICE_ROLLED", map[string]interface{}{
		"sides":    sides,
		"result":   result,
		"username": username,
	})

	return result, nil
}
