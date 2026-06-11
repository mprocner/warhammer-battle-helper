package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/systems"
	"battle-helper/internal/systems/custom"
	"battle-helper/internal/systems/registry"
	"battle-helper/internal/websocket"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type GameService struct {
	gameRepo  *repository.GameRepository
	userRepo  *repository.UserRepository
	charRepo  *repository.CharactersRepository
	hub       *websocket.Hub
	statsRepo *repository.RollStatsRepository
}

func NewGameService(
	gameRepo *repository.GameRepository,
	userRepo *repository.UserRepository,
	charRepo *repository.CharactersRepository,
	hub *websocket.Hub,
	statsRepo *repository.RollStatsRepository,
) *GameService {
	return &GameService{
		gameRepo:  gameRepo,
		userRepo:  userRepo,
		charRepo:  charRepo,
		hub:       hub,
		statsRepo: statsRepo,
	}
}

// CreateGame creates a new game session.
// For gameSystem="custom", template must be non-nil and is embedded in the game document.
func (s *GameService) CreateGame(name, gameSystem string, gameMasterID primitive.ObjectID, username string, template *models.SystemTemplate) (*models.Game, error) {
	game := &models.Game{
		Name:                 name,
		GameSystem:           gameSystem,
		GameMasterID:         gameMasterID,
		CustomSystemTemplate: template,
		TemplateSourceID:     templateSourceID(template),
		Status:               models.GameStatusActive,
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
		Notes:          []models.Note{},
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

	// Enrich scene tokens with current avatar and name from Character documents
	s.enrichSceneCharacters(game)

	// Compute current music playback position (lazy, no DB write)
	s.ComputeMusicPosition(game)

	return game, nil
}

// enrichSceneCharacters overwrites Name and Avatar on every GameCharacter in all scenes
// with the current values from the Character document, so tokens are always up to date.
func (s *GameService) enrichSceneCharacters(game *models.Game) {
	if len(game.Scenes) == 0 {
		return
	}

	// Collect all unique character IDs across scenes
	idSet := make(map[primitive.ObjectID]bool)
	for _, scene := range game.Scenes {
		for _, gc := range scene.Characters {
			idSet[gc.CharacterID] = true
		}
	}
	if len(idSet) == 0 {
		return
	}

	chars, err := s.charRepo.GetByGameID(game.ID.Hex())
	if err != nil {
		return
	}
	charMap := make(map[primitive.ObjectID]*models.Character, len(chars))
	for i := range chars {
		charMap[chars[i].ID] = &chars[i]
	}

	for si := range game.Scenes {
		for ci := range game.Scenes[si].Characters {
			gc := &game.Scenes[si].Characters[ci]
			if ch, ok := charMap[gc.CharacterID]; ok {
				gc.Name = ch.Name
				gc.Avatar = ch.Avatar
			}
		}
	}
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

// enrichParticipants populates AccountAvatar, AccountSignature and AvatarCharacterUrl for each participant
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

	// Check if any participant uses a character avatar
	needsCharacters := false
	for _, p := range game.Participants {
		if p.AvatarCharacterId != "" {
			needsCharacters = true
			break
		}
	}
	charAvatarMap := make(map[string]string)
	if needsCharacters {
		if chars, charErr := s.charRepo.GetByGameID(game.ID.Hex()); charErr == nil {
			for _, c := range chars {
				charAvatarMap[c.ID.Hex()] = c.Avatar
			}
		}
	}

	for i := range game.Participants {
		if u, ok := userMap[game.Participants[i].UserID]; ok {
			game.Participants[i].AccountAvatar = u.Avatar
			game.Participants[i].AccountSignature = u.Signature
		}
		if charID := game.Participants[i].AvatarCharacterId; charID != "" {
			game.Participants[i].AvatarCharacterUrl = charAvatarMap[charID]
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

	broadcastParticipant := models.GameParticipant{
		UserID:           invitedUser.ID,
		Username:         invitedUser.Email,
		Email:            invitedUser.Email,
		Role:             models.RolePlayer,
		AccountAvatar:    invitedUser.Avatar,
		AccountSignature: invitedUser.Signature,
	}
	s.hub.BroadcastToGame(gameID.Hex(), websocket.EventParticipantJoined, map[string]interface{}{
		"participant": broadcastParticipant,
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

	// Enrich participant with account-level avatar/signature for the broadcast
	broadcastParticipant := models.GameParticipant{
		UserID:   userID,
		Username: username,
		Role:     models.RolePlayer,
	}
	if joinedUser, userErr := s.userRepo.FindByID(userID); userErr == nil && joinedUser != nil {
		broadcastParticipant.AccountAvatar = joinedUser.Avatar
		broadcastParticipant.AccountSignature = joinedUser.Signature
	}

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, websocket.EventParticipantJoined, map[string]interface{}{
		"participant": broadcastParticipant,
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

	s.hub.BroadcastToGame(gameID, websocket.EventGameDeleted, map[string]interface{}{
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

	if err := s.gameRepo.RemovePlayerFromAllScenes(gameID, userID); err != nil {
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
	s.hub.BroadcastToGame(gameID, websocket.EventParticipantLeft, map[string]interface{}{
		"userId": userID.Hex(),
	})

	return nil
}

// KickPlayer removes a participant from the game (GM only)
func (s *GameService) KickPlayer(gameID string, gmUserID primitive.ObjectID, targetUserID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != gmUserID {
		return fmt.Errorf("only the game master can kick players")
	}

	if targetUserID == gmUserID {
		return fmt.Errorf("cannot kick the game master")
	}

	if err := s.gameRepo.RemoveParticipant(gameID, targetUserID); err != nil {
		return err
	}

	if err := s.gameRepo.RemovePlayerFromAllScenes(gameID, targetUserID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventParticipantLeft, map[string]interface{}{
		"userId": targetUserID.Hex(),
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
	s.hub.BroadcastToGame(gameID, websocket.EventCharacterAdded, map[string]interface{}{
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
	s.hub.BroadcastToGame(gameID, websocket.EventCharacterMoved, map[string]interface{}{
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
	s.hub.BroadcastToGame(gameID, websocket.EventCharacterRemoved, map[string]interface{}{
		"characterId": characterID.Hex(),
	})

	return nil
}

// AddLogMessage adds a message to the game log
func (s *GameService) AddLogMessage(gameID string, message string, messageType string, userID primitive.ObjectID, username string) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return fmt.Errorf("game not found: %w", err)
	}

	displayName := s.resolveDisplayNameForUser(game, userID, username)

	event := models.GameEvent{
		Type:      models.EventTypeMessage,
		CreatedBy: userID,
		Username:  displayName,
		Data: map[string]interface{}{
			"message": message,
			"type":    messageType,
		},
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return err
	}

	// Broadcast to all clients
	s.hub.BroadcastToGame(gameID, websocket.EventLogMessage, map[string]interface{}{
		"message":  message,
		"type":     messageType,
		"username": displayName,
		"userId":   userID.Hex(),
	})

	return nil
}

// loadRollContext fetches game, character and plugin — shared setup for all system rolls.
func (s *GameService) loadRollContext(gameID, characterID string) (*models.Game, *models.Character, systems.GameSystem, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("game not found: %w", err)
	}
	character, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("character not found: %w", err)
	}
	gameSystem := game.GameSystem
	if gameSystem == "" {
		gameSystem = character.GameSystem
	}
	plugin, err := registry.Get(gameSystem)
	if err != nil {
		return nil, nil, nil, err
	}
	return game, character, plugin, nil
}

// rollResultToMap serialises a RollResult to map via JSON so that all tagged fields
// are included automatically, then appends the cross-cutting visibility + rollerUserId fields.
func rollResultToMap(r *systems.RollResult, visibility, rollerUserID string) map[string]interface{} {
	b, _ := json.Marshal(r)
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	m["visibility"] = visibility
	m["rollerUserId"] = rollerUserID
	return m
}

// executeRoll handles the shared post-roll logic: resolves display name, enriches the result,
// serialises it, persists a GameEvent and broadcasts to the right audience.
func (s *GameService) executeRoll(gameID, eventType string, rollResult *systems.RollResult, userID primitive.ObjectID, username string, game *models.Game, character *models.Character, visibility string) (map[string]interface{}, error) {
	displayName := s.resolveDisplayNameForUser(game, userID, username)
	if visibility == "" {
		visibility = "all"
	}

	rollResult.CharacterID = character.ID.Hex()
	rollResult.CharacterName = character.Name
	rollResult.Username = displayName

	broadcastData := rollResultToMap(rollResult, visibility, userID.Hex())

	event := models.GameEvent{
		Type:         models.EventTypeDiceRoll,
		CreatedBy:    userID,
		Username:     displayName,
		Visibility:   visibility,
		RollerUserID: userID,
		Data:         broadcastData,
	}
	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	go func(uID primitive.ObjectID, gID string, r *systems.RollResult) {
		gameObjID, err := primitive.ObjectIDFromHex(gID)
		if err != nil {
			return
		}
		var charPtr *primitive.ObjectID
		if cid, e := primitive.ObjectIDFromHex(r.CharacterID); e == nil {
			charPtr = &cid
		}
		// When multiple dice were rolled (e.g. D&D advantage/disadvantage),
		// record each raw die result as a separate stat entry.
		rawResults := r.AllRolls
		if len(rawResults) == 0 {
			rawResults = []int{r.Roll}
		}
		for _, rawResult := range rawResults {
			if err := s.statsRepo.Record(&models.RollStat{
				UserID:      uID,
				GameID:      &gameObjID,
				DieType:     r.DiceType,
				Result:      rawResult,
				RollType:    r.RollType,
				CharacterID: charPtr,
				Outcome:     r.Outcome,
			}); err != nil {
				log.Printf("roll stats record failed: %v", err)
			}
		}
	}(userID, gameID, rollResult)

	s.broadcastRoll(gameID, eventType, broadcastData, visibility, userID, game.GameMasterID)
	return broadcastData, nil
}

// broadcastRoll sends a roll event to the appropriate set of clients based on visibility.
func (s *GameService) broadcastRoll(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID) {
	switch visibility {
	case "gm_only":
		s.hub.BroadcastToUsers(gameID, eventType, payload, []string{gmID.Hex()})
	case "gm_and_roller":
		targets := []string{gmID.Hex()}
		if rollerID != gmID {
			targets = append(targets, rollerID.Hex())
		}
		s.hub.BroadcastToUsers(gameID, eventType, payload, targets)
	default: // "all" or empty
		s.hub.BroadcastToGame(gameID, eventType, payload)
	}
}

// RollDice rolls one or more dice and logs the result (simple die roll, no character lookup)
func (s *GameService) RollDice(gameID string, sides int, count int, userID primitive.ObjectID, username string, visibility string) ([]int, int, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, 0, fmt.Errorf("game not found: %w", err)
	}

	dice := Dice{Sizes: sides}
	results := dice.RollMany(count)
	sum := 0
	for _, r := range results {
		sum += r
	}

	displayName := s.resolveDisplayNameForUser(game, userID, username)
	if visibility == "" {
		visibility = "all"
	}

	var eventData map[string]interface{}
	if count > 1 {
		eventData = map[string]interface{}{
			"rollType":     "multi",
			"sides":        sides,
			"count":        count,
			"results":      results,
			"sum":          sum,
			"username":     displayName,
			"visibility":   visibility,
			"rollerUserId": userID.Hex(),
		}
	} else {
		eventData = map[string]interface{}{
			"rollType":     "simple",
			"sides":        sides,
			"result":       results[0],
			"username":     displayName,
			"visibility":   visibility,
			"rollerUserId": userID.Hex(),
		}
	}

	event := models.GameEvent{
		Type:         models.EventTypeDiceRoll,
		CreatedBy:    userID,
		Username:     displayName,
		Visibility:   visibility,
		RollerUserID: userID,
		Data:         eventData,
	}

	if err := s.gameRepo.AddEvent(gameID, event); err != nil {
		return nil, 0, err
	}

	go func(uID primitive.ObjectID, gID string, dieType int, res []int) {
		gameObjID, err := primitive.ObjectIDFromHex(gID)
		if err != nil {
			return
		}
		for _, r := range res {
			if err := s.statsRepo.Record(&models.RollStat{
				UserID:   uID,
				GameID:   &gameObjID,
				DieType:  dieType,
				Result:   r,
				RollType: "generic",
			}); err != nil {
				log.Printf("roll stats record failed: %v", err)
			}
		}
	}(userID, gameID, sides, results)

	s.broadcastRoll(gameID, websocket.EventDiceRolled, eventData, visibility, userID, game.GameMasterID)
	return results, sum, nil
}

// RollSkill rolls a skill/attribute check dispatched through the game system registry.
// For custom systems, RollWithTemplate is used so the plugin can access field definitions.
func (s *GameService) RollSkill(gameID string, skillKey string, modifier int, diceMod int, target int, characterID string, userID primitive.ObjectID, username string, visibility string) (map[string]interface{}, error) {
	game, character, plugin, err := s.loadRollContext(gameID, characterID)
	if err != nil {
		return nil, err
	}

	var rollResult *systems.RollResult
	if game.GameSystem == "custom" {
		if game.CustomSystemTemplate == nil {
			return nil, fmt.Errorf("custom game has no system template configured")
		}
		customPlugin := plugin.(*custom.Plugin)
		rollResult, err = customPlugin.RollWithTemplate(character.Stats, game.CustomSystemTemplate, skillKey, modifier)
	} else {
		rollResult, err = plugin.RollSkill(character.Stats, skillKey, modifier, diceMod, target)
	}
	if err != nil {
		return nil, err
	}
	return s.executeRoll(gameID, websocket.EventSkillRolled, rollResult, userID, username, game, character, visibility)
}

// RollWeapon rolls a weapon attack dispatched through the game system registry.
func (s *GameService) RollWeapon(gameID string, weaponName string, weaponSkill string, damage string, modifier int, diceMod int, characterID string, userID primitive.ObjectID, username string, visibility string) (map[string]interface{}, error) {
	game, character, plugin, err := s.loadRollContext(gameID, characterID)
	if err != nil {
		return nil, err
	}
	rollResult, err := plugin.RollWeapon(character.Stats, weaponName, weaponSkill, damage, modifier, diceMod)
	if err != nil {
		return nil, err
	}
	return s.executeRoll(gameID, websocket.EventWeaponRolled, rollResult, userID, username, game, character, visibility)
}

// UpdateParticipant updates avatar, signature, avatarSize and showSignature for the requesting user in a game
func (s *GameService) UpdateParticipant(gameID string, userID primitive.ObjectID, avatar, avatarType, avatarCharacterId, signature, avatarSize string, showSignature bool) error {
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
	if err := s.gameRepo.UpdateParticipant(gameObjID, userID, avatar, avatarType, avatarCharacterId, signature, avatarSize, showSignature); err != nil {
		return err
	}
	s.hub.BroadcastToGame(gameID, websocket.EventParticipantUpdated, map[string]interface{}{
		"userId":            userID.Hex(),
		"avatar":            avatar,
		"avatarType":        avatarType,
		"avatarCharacterId": avatarCharacterId,
		"signature":         signature,
		"avatarSize":        avatarSize,
		"showSignature":     showSignature,
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
	s.hub.BroadcastToGame(gameID, websocket.EventHandoutCreated, map[string]interface{}{
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
	s.hub.BroadcastToGame(gameID, websocket.EventHandoutUpdated, map[string]interface{}{
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
	s.hub.BroadcastToGame(gameID, websocket.EventHandoutDeleted, map[string]interface{}{
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
	s.hub.BroadcastToGame(gameID, websocket.EventHandoutsReordered, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventHandoutFolderCreated, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventHandoutFolderUpdated, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventHandoutFolderDeleted, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventHandoutFoldersReordered, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventHandoutMoved, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneCreated, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneUpdated, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneDeleted, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventPlayerSceneChanged, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneCharacterAdded, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneCharacterMoved, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneCharacterRemoved, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
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
			if img.Locked && (req.X != nil || req.Y != nil || req.Width != nil || req.Height != nil || req.Rotation != nil) {
				return fmt.Errorf("image is locked")
			}
		}
	}

	if err := s.gameRepo.UpdateSceneImage(gameID, sceneID, imageID, req); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventSceneImageUpdated, map[string]interface{}{
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

	s.hub.BroadcastToGame(gameID, websocket.EventSceneImageDeleted, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"imageId": imageID.Hex(),
	})

	return nil
}

// PlayTrackPersistRequest holds the data for starting playback.
type PlayTrackPersistRequest struct {
	TrackURL   string
	TrackName  string
	TrackId    string // ObjectID hex of the MusicFile (empty for non-library tracks)
	PlaylistId string
	TrackIndex int
	Loop       bool
	Position   float64 // Offset in seconds (for resume from paused position)
}

// PlayTrackPersist validates GM, persists MusicState to DB and broadcasts MUSIC_PLAY.
func (s *GameService) PlayTrackPersist(gameID string, gmID primitive.ObjectID, req PlayTrackPersistRequest) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != gmID {
		return fmt.Errorf("only the game master can control music")
	}

	// Backdate startedAt so that ComputeMusicPosition returns req.Position immediately
	startedAt := time.Now().Add(-time.Duration(req.Position * float64(time.Second)))

	state := models.MusicState{
		IsPlaying:             true,
		TrackURL:              req.TrackURL,
		TrackName:             req.TrackName,
		PlaylistId:            req.PlaylistId,
		TrackIndex:            req.TrackIndex,
		Loop:                  req.Loop,
		Volume:                game.Music.Volume,
		CurrentTrackStartedAt: startedAt,
		Version:               game.Music.Version + 1,
	}
	if req.TrackId != "" {
		if oid, err := primitive.ObjectIDFromHex(req.TrackId); err == nil {
			state.TrackId = oid
		}
	}
	// Carry forward volume default of 1.0 for brand-new games
	if state.Volume == 0 {
		state.Volume = 1.0
	}

	if err := s.gameRepo.UpdateMusicState(gameID, state); err != nil {
		return fmt.Errorf("failed to persist music state: %w", err)
	}

	s.hub.BroadcastToGame(gameID, websocket.EventMusicPlay, map[string]interface{}{
		"trackUrl":   state.TrackURL,
		"trackName":  state.TrackName,
		"playlistId": state.PlaylistId,
		"trackIndex": state.TrackIndex,
		"loop":       state.Loop,
		"version":    state.Version,
		"position":   req.Position,
	})
	return nil
}

// PauseTrackPersist persists the paused state (with current position) and broadcasts MUSIC_PAUSE.
func (s *GameService) PauseTrackPersist(gameID string, gmID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != gmID {
		return fmt.Errorf("only the game master can control music")
	}
	if !game.Music.IsPlaying {
		return nil
	}

	// Compute and store current position so we know where to resume from
	elapsed := time.Since(game.Music.CurrentTrackStartedAt).Seconds()
	if elapsed < 0 {
		elapsed = 0
	}

	game.Music.IsPlaying = false
	game.Music.Position = elapsed
	game.Music.Version++

	if err := s.gameRepo.UpdateMusicState(gameID, game.Music); err != nil {
		return fmt.Errorf("failed to persist paused state: %w", err)
	}

	s.hub.BroadcastToGame(gameID, websocket.EventMusicPause, map[string]interface{}{
		"position": elapsed,
		"version":  game.Music.Version,
	})
	return nil
}

// StopTrackPersist clears music state and broadcasts MUSIC_STOP.
func (s *GameService) StopTrackPersist(gameID string, gmID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != gmID {
		return fmt.Errorf("only the game master can control music")
	}

	stopped := models.MusicState{
		IsPlaying: false,
		Volume:    game.Music.Volume,
		Version:   game.Music.Version + 1,
	}
	if err := s.gameRepo.UpdateMusicState(gameID, stopped); err != nil {
		return fmt.Errorf("failed to persist stopped state: %w", err)
	}

	s.hub.BroadcastToGame(gameID, websocket.EventMusicStop, map[string]interface{}{
		"version": stopped.Version,
	})
	return nil
}

// SetVolumePersist persists the volume change and broadcasts MUSIC_VOLUME.
func (s *GameService) SetVolumePersist(gameID string, gmID primitive.ObjectID, volume float64) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != gmID {
		return fmt.Errorf("only the game master can control music")
	}

	game.Music.Volume = volume
	if err := s.gameRepo.UpdateMusicState(gameID, game.Music); err != nil {
		return fmt.Errorf("failed to persist volume: %w", err)
	}

	s.hub.BroadcastToGame(gameID, websocket.EventMusicVolume, map[string]interface{}{
		"volume": volume,
	})
	return nil
}

// SetLoopPersist persists the loop flag change and broadcasts MUSIC_LOOP.
func (s *GameService) SetLoopPersist(gameID string, gmID primitive.ObjectID, loop bool) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != gmID {
		return fmt.Errorf("only the game master can control music")
	}

	game.Music.Loop = loop
	game.Music.Version++
	if err := s.gameRepo.UpdateMusicState(gameID, game.Music); err != nil {
		return fmt.Errorf("failed to persist loop state: %w", err)
	}

	s.hub.BroadcastToGame(gameID, websocket.EventMusicLoop, map[string]interface{}{
		"loop":    loop,
		"version": game.Music.Version,
	})
	return nil
}

// NextTrack advances to the next track in a playlist (or loops a single track).
// Any game participant can call this — optimistic lock (version) prevents duplicate advances.
func (s *GameService) NextTrack(gameID string, userID primitive.ObjectID, version int64) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	// Validate participant
	isParticipant := false
	for _, p := range game.Participants {
		if p.UserID == userID {
			isParticipant = true
			break
		}
	}
	if !isParticipant {
		return fmt.Errorf("user is not a participant in this game")
	}

	// Stale version — another client already advanced
	if game.Music.Version != version {
		return nil
	}

	now := time.Now()

	if game.Music.PlaylistId == "" {
		// Single track: loop or stop
		if !game.Music.Loop {
			stopped := models.MusicState{
				IsPlaying: false,
				Volume:    game.Music.Volume,
				Version:   game.Music.Version + 1,
			}
			ok, err := s.gameRepo.NextTrackIfVersion(gameID, version, stopped)
			if err != nil {
				return err
			}
			if ok {
				s.hub.BroadcastToGame(gameID, websocket.EventMusicStop, map[string]interface{}{
					"version": stopped.Version,
				})
			}
			return nil
		}
		// Loop: restart same track from beginning
		looped := models.MusicState{
			IsPlaying:             true,
			TrackURL:              game.Music.TrackURL,
			TrackName:             game.Music.TrackName,
			TrackId:               game.Music.TrackId,
			Loop:                  true,
			Volume:                game.Music.Volume,
			CurrentTrackStartedAt: now,
			Version:               game.Music.Version + 1,
		}
		ok, err := s.gameRepo.NextTrackIfVersion(gameID, version, looped)
		if err != nil {
			return err
		}
		if ok {
			s.hub.BroadcastToGame(gameID, websocket.EventMusicPlay, map[string]interface{}{
				"trackUrl":   looped.TrackURL,
				"trackName":  looped.TrackName,
				"playlistId": "",
				"trackIndex": 0,
				"loop":       true,
				"version":    looped.Version,
				"position":   0,
			})
		}
		return nil
	}

	// Playlist mode: load GM's playlist
	gmUser, err := s.userRepo.GetUserWithMusic(game.GameMasterID)
	if err != nil {
		return fmt.Errorf("failed to load GM music library: %w", err)
	}

	var playlist *models.Playlist
	for i := range gmUser.Playlists {
		if gmUser.Playlists[i].ID.Hex() == game.Music.PlaylistId {
			playlist = &gmUser.Playlists[i]
			break
		}
	}
	if playlist == nil || len(playlist.Tracks) == 0 {
		return fmt.Errorf("playlist not found or empty")
	}

	nextIndex := game.Music.TrackIndex + 1
	if nextIndex >= len(playlist.Tracks) {
		if !game.Music.Loop {
			stopped := models.MusicState{
				IsPlaying: false,
				Volume:    game.Music.Volume,
				Version:   game.Music.Version + 1,
			}
			ok, err := s.gameRepo.NextTrackIfVersion(gameID, version, stopped)
			if err != nil {
				return err
			}
			if ok {
				s.hub.BroadcastToGame(gameID, websocket.EventMusicStop, map[string]interface{}{
					"version": stopped.Version,
				})
			}
			return nil
		}
		nextIndex = 0
	}

	nextTrackID := playlist.Tracks[nextIndex]
	nextFiles, err := s.userRepo.GetMusicFilesByIDs(game.GameMasterID, []primitive.ObjectID{nextTrackID})
	if err != nil || len(nextFiles) == 0 {
		return fmt.Errorf("failed to load next track")
	}
	nextFile := nextFiles[0]

	newState := models.MusicState{
		IsPlaying:             true,
		TrackURL:              nextFile.FileURL,
		TrackName:             nextFile.Name,
		TrackId:               nextFile.ID,
		PlaylistId:            game.Music.PlaylistId,
		TrackIndex:            nextIndex,
		Loop:                  game.Music.Loop,
		Volume:                game.Music.Volume,
		CurrentTrackStartedAt: now,
		Version:               game.Music.Version + 1,
	}

	ok, err := s.gameRepo.NextTrackIfVersion(gameID, version, newState)
	if err != nil {
		return err
	}
	if ok {
		s.hub.BroadcastToGame(gameID, websocket.EventMusicPlay, map[string]interface{}{
			"trackUrl":   newState.TrackURL,
			"trackName":  newState.TrackName,
			"playlistId": newState.PlaylistId,
			"trackIndex": newState.TrackIndex,
			"loop":       newState.Loop,
			"version":    newState.Version,
			"position":   0,
		})
	}
	return nil
}

// ComputeMusicPosition computes the current playback position in-place for the game's music state.
// This is a lazy computation — no DB writes. Position is overwritten only if IsPlaying=true.
func (s *GameService) ComputeMusicPosition(game *models.Game) {
	ms := &game.Music
	if !ms.IsPlaying || ms.CurrentTrackStartedAt.IsZero() {
		return
	}

	elapsed := time.Since(ms.CurrentTrackStartedAt).Seconds()
	if elapsed < 0 {
		elapsed = 0
	}

	if ms.PlaylistId == "" {
		// Single track
		if ms.TrackId.IsZero() {
			ms.Position = elapsed
			return
		}
		files, err := s.userRepo.GetMusicFilesByIDs(game.GameMasterID, []primitive.ObjectID{ms.TrackId})
		if err != nil || len(files) == 0 || files[0].Duration == 0 {
			ms.Position = elapsed
			return
		}
		duration := files[0].Duration
		if elapsed < duration {
			ms.Position = elapsed
		} else if ms.Loop {
			ms.Position = math.Mod(elapsed, duration)
		} else {
			ms.IsPlaying = false
			ms.Position = 0
		}
		return
	}

	// Playlist mode
	gmUser, err := s.userRepo.GetUserWithMusic(game.GameMasterID)
	if err != nil {
		ms.Position = elapsed
		return
	}
	var playlist *models.Playlist
	for i := range gmUser.Playlists {
		if gmUser.Playlists[i].ID.Hex() == ms.PlaylistId {
			playlist = &gmUser.Playlists[i]
			break
		}
	}
	if playlist == nil || len(playlist.Tracks) == 0 {
		ms.Position = elapsed
		return
	}

	trackFiles, err := s.userRepo.GetMusicFilesByIDs(game.GameMasterID, playlist.Tracks)
	if err != nil {
		ms.Position = elapsed
		return
	}
	fileMap := make(map[primitive.ObjectID]float64, len(trackFiles))
	for _, f := range trackFiles {
		fileMap[f.ID] = f.Duration
	}

	remaining := elapsed
	idx := ms.TrackIndex
	startIdx := idx
	for {
		d := fileMap[playlist.Tracks[idx]]
		if d == 0 {
			// Unknown duration — best effort: set position to remaining elapsed
			ms.Position = remaining
			ms.TrackIndex = idx
			return
		}
		if remaining < d {
			ms.Position = remaining
			ms.TrackIndex = idx
			return
		}
		remaining -= d
		if idx == len(playlist.Tracks)-1 {
			if !ms.Loop {
				ms.IsPlaying = false
				ms.Position = 0
				return
			}
			idx = 0
		} else {
			idx++
		}
		// Guard: if we wrapped back to start without resolving, break
		if idx == startIdx {
			ms.Position = math.Mod(remaining, fileMap[playlist.Tracks[idx]])
			ms.TrackIndex = idx
			return
		}
	}
}

// GetScenes returns all scenes for a game
func (s *GameService) GetScenes(gameID string) ([]models.Scene, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	return game.Scenes, nil
}

// SyncTemplate re-fetches the source template and updates the game's embedded copy.
func (s *GameService) SyncTemplate(gameID string, gmID primitive.ObjectID, templateFetcher interface {
	Get(id string) (*models.SystemTemplate, error)
}) (*models.SystemTemplate, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, fmt.Errorf("game not found")
	}
	if game.GameMasterID != gmID {
		return nil, fmt.Errorf("not authorized")
	}
	if game.GameSystem != "custom" {
		return nil, fmt.Errorf("game does not use a custom system")
	}
	if game.TemplateSourceID.IsZero() {
		return nil, fmt.Errorf("no source template linked to this game")
	}
	tmpl, err := templateFetcher.Get(game.TemplateSourceID.Hex())
	if err != nil {
		return nil, fmt.Errorf("source template not found")
	}
	if err := s.gameRepo.SetCustomTemplate(gameID, tmpl); err != nil {
		return nil, err
	}
	return tmpl, nil
}

// templateSourceID extracts the ObjectID from a SystemTemplate (nil-safe).
func templateSourceID(t *models.SystemTemplate) primitive.ObjectID {
	if t == nil {
		return primitive.NilObjectID
	}
	return t.ID
}
