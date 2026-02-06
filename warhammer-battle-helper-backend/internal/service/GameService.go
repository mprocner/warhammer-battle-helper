package service

import (
	"battle-helper/internal/data"
	"battle-helper/internal/http/requests"
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"encoding/json"
	"fmt"
	"strings"

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
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	// Populate Game Master email
	if !game.GameMasterID.IsZero() {
		gmUser, err := s.userRepo.FindByID(game.GameMasterID)
		if err == nil && gmUser != nil {
			game.GameMasterEmail = gmUser.Email
		}
	}

	return game, nil
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
			"result":     result.Result,
		},
	}
	s.gameRepo.AddEvent(gameID, event)

	// Broadcast fight result to all clients
	s.hub.BroadcastToGame(gameID, "FIGHT_RESULT", map[string]interface{}{
		"username": username,
		"result":   result.Result,
	})

	// Convert response to map for API response
	resultMap := map[string]interface{}{
		"result": result.Result,
	}

	return resultMap, nil
}

// RollDice rolls dice and logs the result
func (s *GameService) RollDice(gameID string, sides int, userID primitive.ObjectID, username string, characterID string, attributeName string, attributeModifier int) (int, string, int, error) {
	// Use the Dice service for proper random rolls
	dice := Dice{Sizes: sides}
	result := dice.Roll()

	eventData := map[string]interface{}{
		"sides":    sides,
		"result":   result,
		"username": username,
	}

	var characterName string
	var attributeValue int

	// Add characteristic test data if provided
	if characterID != "" && attributeName != "" {
		// Fetch character from database to get actual characteristic value
		character, err := s.charRepo.GetByID(characterID)
		if err != nil {
			return 0, "", 0, fmt.Errorf("character not found: %w", err)
		}

		characterName = character.BasicInfo.Name

		// Get the characteristic value based on attribute name
		baseValue := 0
		switch attributeName {
		case "WS":
			baseValue = character.Characteristics.Current.WS
		case "BS":
			baseValue = character.Characteristics.Current.BS
		case "S":
			baseValue = character.Characteristics.Current.S
		case "T":
			baseValue = character.Characteristics.Current.T
		case "I":
			baseValue = character.Characteristics.Current.I
		case "Ag":
			baseValue = character.Characteristics.Current.Ag
		case "Dex":
			baseValue = character.Characteristics.Current.Dex
		case "Int":
			baseValue = character.Characteristics.Current.Int
		case "WP":
			baseValue = character.Characteristics.Current.WP
		case "Fel":
			baseValue = character.Characteristics.Current.Fel
		default:
			return 0, "", 0, fmt.Errorf("unknown attribute: %s", attributeName)
		}

		if baseValue == 0 {
			return 0, "", 0, fmt.Errorf("characteristic %s not found or is zero", attributeName)
		}

		// Apply modifier on backend (server-authoritative)
		attributeValue = baseValue + attributeModifier

		eventData["characterId"] = characterID
		eventData["characterName"] = characterName
		eventData["attribute"] = attributeName
		eventData["attributeValue"] = attributeValue
		eventData["attributeModifier"] = attributeModifier
		eventData["baseValue"] = baseValue
	}

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  username,
		Data:      eventData,
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return 0, "", 0, err
	}

	// Prepare broadcast data
	broadcastData := map[string]interface{}{
		"sides":    sides,
		"result":   result,
		"username": username,
	}

	// Add characteristic test data to broadcast if provided
	if characterID != "" && attributeName != "" {
		broadcastData["characterId"] = characterID
		broadcastData["characterName"] = characterName
		broadcastData["attribute"] = attributeName
		broadcastData["attributeValue"] = attributeValue
		broadcastData["attributeModifier"] = attributeModifier
	}

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, "DICE_ROLLED", broadcastData)

	return result, characterName, attributeValue, nil
}

// Skill represents a skill from skills.json
type Skill struct {
	Key             string   `json:"key"`
	Characteristic  string   `json:"characteristic"`
	Type            string   `json:"type"`
	Grouped         bool     `json:"grouped"`
	Specialisations []string `json:"specialisations"`
}

// loadSkills loads skills data from embedded JSON
func loadSkills() ([]Skill, error) {
	var skills []Skill
	if err := json.Unmarshal(data.SkillsJSON, &skills); err != nil {
		return nil, fmt.Errorf("failed to parse skills.json: %w", err)
	}

	return skills, nil
}

// RollSkill rolls a skill check and broadcasts the result
func (s *GameService) RollSkill(gameID string, skillKey string, modifier int, characterID string, userID primitive.ObjectID, username string) (map[string]interface{}, error) {
	// Load skills data
	skills, err := loadSkills()
	if err != nil {
		return nil, err
	}

	// Get character from database
	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, fmt.Errorf("character not found: %w", err)
	}

	// Handle compound skill keys (e.g., "MELEE_BASIC", "STEALTH_RURAL")
	var parentKey string
	if strings.Contains(skillKey, "_") {
		parts := strings.SplitN(skillKey, "_", 2)
		parentKey = parts[0]
	} else {
		parentKey = skillKey
	}

	// Find the skill definition
	var skill *Skill
	for i := range skills {
		if skills[i].Key == parentKey {
			skill = &skills[i]
			break
		}
	}

	if skill == nil {
		return nil, fmt.Errorf("skill not found: %s", parentKey)
	}

	// Get skill advances from character
	advances := 0
	if skill.Type == "basic" || skill.Grouped {
		if val, ok := character.BasicSkills[skillKey]; ok {
			advances = val
		}
	} else {
		if val, ok := character.AdvancedSkills[skillKey]; ok {
			advances = val
		}
	}

	// Get characteristic value based on skill's characteristic
	var characteristicValue int
	switch skill.Characteristic {
	case "WEAPON_SKILL":
		characteristicValue = character.Characteristics.Current.WS
	case "BALLISTIC_SKILL":
		characteristicValue = character.Characteristics.Current.BS
	case "STRENGTH":
		characteristicValue = character.Characteristics.Current.S
	case "TOUGHNESS":
		characteristicValue = character.Characteristics.Current.T
	case "INITIATIVE":
		characteristicValue = character.Characteristics.Current.I
	case "AGILITY":
		characteristicValue = character.Characteristics.Current.Ag
	case "DEXTERITY":
		characteristicValue = character.Characteristics.Current.Dex
	case "INTELLIGENCE":
		characteristicValue = character.Characteristics.Current.Int
	case "WILLPOWER":
		characteristicValue = character.Characteristics.Current.WP
	case "FELLOWSHIP":
		characteristicValue = character.Characteristics.Current.Fel
	default:
		return nil, fmt.Errorf("unknown characteristic: %s", skill.Characteristic)
	}

	if characteristicValue == 0 {
		return nil, fmt.Errorf("characteristic %s not found or is zero", skill.Characteristic)
	}

	// Calculate skill value (characteristic + advances)
	skillValue := characteristicValue + advances

	// Calculate target value (skill value + modifier)
	targetValue := skillValue + modifier

	// Roll d100
	dice := Dice{Sizes: 100}
	rollValue := dice.Roll()

	// Calculate success and SL
	success := rollValue <= targetValue
	SL := (targetValue / 10) - (rollValue / 10)

	// Prepare response
	response := map[string]interface{}{
		"success":     success,
		"SL":          SL,
		"rollValue":   rollValue,
		"targetValue": targetValue,
		"skillValue":  skillValue,
		"modifier":    modifier,
	}

	// Add event
	eventData := map[string]interface{}{
		"characterId":   characterID,
		"characterName": character.BasicInfo.Name,
		"skillKey":      skillKey,
		"success":       success,
		"SL":            SL,
		"rollValue":     rollValue,
		"targetValue":   targetValue,
		"skillValue":    skillValue,
		"modifier":      modifier,
	}

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  username,
		Data:      eventData,
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	// Broadcast to all clients
	broadcastData := map[string]interface{}{
		"type":          "SKILL_ROLLED",
		"characterId":   characterID,
		"characterName": character.BasicInfo.Name,
		"skillKey":      skillKey,
		"success":       success,
		"SL":            SL,
		"rollValue":     rollValue,
		"targetValue":   targetValue,
		"skillValue":    skillValue,
		"modifier":      modifier,
		"username":      username,
	}

	s.hub.BroadcastToGame(gameID, "SKILL_ROLLED", broadcastData)

	return response, nil
}

// RollWeapon rolls a weapon attack and broadcasts the result with damage info
func (s *GameService) RollWeapon(gameID string, weaponName string, weaponSkill string, damage string, modifier int, characterID string, userID primitive.ObjectID, username string) (map[string]interface{}, error) {
	// Load skills data to find weapon skill characteristic
	skills, err := loadSkills()
	if err != nil {
		return nil, err
	}

	// Get character from database
	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, fmt.Errorf("character not found: %w", err)
	}

	// Handle compound skill keys (e.g., "MELEE_BASIC", "RANGED_BOW")
	var parentKey string
	if strings.Contains(weaponSkill, "_") {
		parts := strings.SplitN(weaponSkill, "_", 2)
		parentKey = parts[0]
	} else {
		parentKey = weaponSkill
	}

	// Find the skill definition
	var skill *Skill
	for i := range skills {
		if skills[i].Key == parentKey {
			skill = &skills[i]
			break
		}
	}

	if skill == nil {
		return nil, fmt.Errorf("skill not found: %s", parentKey)
	}

	// Get skill advances from character
	advances := 0
	if val, ok := character.BasicSkills[weaponSkill]; ok {
		advances = val
	}

	// Get characteristic value based on skill's characteristic
	var characteristicValue int
	switch skill.Characteristic {
	case "WEAPON_SKILL":
		characteristicValue = character.Characteristics.Current.WS
	case "BALLISTIC_SKILL":
		characteristicValue = character.Characteristics.Current.BS
	default:
		return nil, fmt.Errorf("unknown characteristic: %s", skill.Characteristic)
	}

	if characteristicValue == 0 {
		return nil, fmt.Errorf("characteristic %s not found or is zero", skill.Characteristic)
	}

	// Calculate skill value (characteristic + advances)
	skillValue := characteristicValue + advances

	// Calculate target value (skill value + modifier)
	targetValue := skillValue + modifier

	// Roll d100
	dice := Dice{Sizes: 100}
	rollValue := dice.Roll()

	// Calculate success and SL
	success := rollValue <= targetValue
	SL := (targetValue / 10) - (rollValue / 10)

	// Calculate damage based on damage formula
	damageFormula := damage
	damageValue := 0

	// Parse damage formula (e.g., "SB+4", "BB+3", "8")
	if strings.Contains(damage, "SB") {
		// Strength Bonus based damage
		sb := character.Characteristics.Current.S / 10
		bonus := 0
		if strings.Contains(damage, "+") {
			parts := strings.Split(damage, "+")
			if len(parts) == 2 {
				fmt.Sscanf(parts[1], "%d", &bonus)
			}
		} else if strings.Contains(damage, "-") {
			parts := strings.Split(damage, "-")
			if len(parts) == 2 {
				fmt.Sscanf(parts[1], "%d", &bonus)
				bonus = -bonus
			}
		}
		damageValue = sb + bonus
	} else if strings.Contains(damage, "BB") {
		// Ballistic Bonus based damage (rare, but possible)
		bb := character.Characteristics.Current.BS / 10
		bonus := 0
		if strings.Contains(damage, "+") {
			parts := strings.Split(damage, "+")
			if len(parts) == 2 {
				fmt.Sscanf(parts[1], "%d", &bonus)
			}
		} else if strings.Contains(damage, "-") {
			parts := strings.Split(damage, "-")
			if len(parts) == 2 {
				fmt.Sscanf(parts[1], "%d", &bonus)
				bonus = -bonus
			}
		}
		damageValue = bb + bonus
	} else {
		// Fixed damage value
		fmt.Sscanf(damage, "%d", &damageValue)
	}

	// Add SL to damage on successful hit
	if success && SL > 0 {
		damageValue += SL
	}

	// Prepare response
	response := map[string]interface{}{
		"success":       success,
		"SL":            SL,
		"rollValue":     rollValue,
		"targetValue":   targetValue,
		"skillValue":    skillValue,
		"modifier":      modifier,
		"damageFormula": damageFormula,
		"damageValue":   damageValue,
		"weaponName":    weaponName,
	}

	// Add event
	eventData := map[string]interface{}{
		"characterId":   characterID,
		"characterName": character.BasicInfo.Name,
		"weaponName":    weaponName,
		"weaponSkill":   weaponSkill,
		"success":       success,
		"SL":            SL,
		"rollValue":     rollValue,
		"targetValue":   targetValue,
		"skillValue":    skillValue,
		"modifier":      modifier,
		"damageFormula": damageFormula,
		"damageValue":   damageValue,
	}

	event := models.GameEvent{
		Type:      models.EventTypeDiceRoll,
		CreatedBy: userID,
		Username:  username,
		Data:      eventData,
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	// Broadcast to all clients
	broadcastData := map[string]interface{}{
		"type":          "WEAPON_ROLLED",
		"characterId":   characterID,
		"characterName": character.BasicInfo.Name,
		"weaponName":    weaponName,
		"weaponSkill":   weaponSkill,
		"success":       success,
		"SL":            SL,
		"rollValue":     rollValue,
		"targetValue":   targetValue,
		"skillValue":    skillValue,
		"modifier":      modifier,
		"damageFormula": damageFormula,
		"damageValue":   damageValue,
		"username":      username,
	}

	s.hub.BroadcastToGame(gameID, "WEAPON_ROLLED", broadcastData)

	return response, nil
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
