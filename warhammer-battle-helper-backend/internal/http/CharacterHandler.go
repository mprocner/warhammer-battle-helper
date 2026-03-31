package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/systems/registry"
	"battle-helper/internal/websocket"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CharacterHandler struct {
	CharacterRepo *repository.CharactersRepository
	GameRepo      *repository.GameRepository
	Hub           *websocket.Hub
}

// CreateCharacterRequest accepts the character name, system-specific stats as raw JSON,
// plus common flags. The frontend sends the full stats blob as an opaque JSON object.
type CreateCharacterRequest struct {
	Name       string          `json:"name" binding:"required"`
	Avatar     string          `json:"avatar"`
	IsNPC      bool            `json:"isNPC"`
	GameSystem string          `json:"gameSystem"` // inherited from game if empty
	Stats      json.RawMessage `json:"stats"`      // system-specific payload
}

type UpdateCharacterRequest struct {
	Name   string                  `json:"name"`
	Avatar string                  `json:"avatar"`
	Stats  json.RawMessage         `json:"stats"`
	States []models.CharacterState `json:"states"`
}

type CloneCharacterRequest struct {
	Count int `json:"count" binding:"required,min=1,max=20"`
}

type UpdateVisibilityRequest struct {
	VisibleTo []string `json:"visibleTo" binding:"required"`
}

// GetGameCharacters returns characters for a game.
// GM gets all characters; player gets only characters where their userId is in VisibleTo.
func (h *CharacterHandler) GetGameCharacters(c *gin.Context) {
	gameID := c.Param("id")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	isGM := game.GameMasterID == userObjID

	characters, err := h.CharacterRepo.GetByGameID(gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var result []models.Character
	for _, char := range characters {
		// Recompute derived stats (wounds bonuses, movement) before returning
		if sys, sysErr := registry.Get(char.GameSystem); sysErr == nil {
			if derived, derivedErr := sys.ComputeDerived(char.Stats); derivedErr == nil {
				char.Stats = derived
			}
		}

		if isGM {
			result = append(result, char)
		} else {
			for _, visID := range char.VisibleTo {
				if visID == userObjID {
					result = append(result, char)
					break
				}
			}
		}
	}

	if result == nil {
		result = []models.Character{}
	}

	c.JSON(http.StatusOK, result)
}

// CreateGameCharacter creates a new character scoped to the game.
func (h *CharacterHandler) CreateGameCharacter(c *gin.Context) {
	gameID := c.Param("id")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	var req CreateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gameObjID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	// Encode incoming JSON stats payload as BSON
	var statsRaw bson.Raw
	if len(req.Stats) > 0 {
		// Convert JSON bytes to a map, then marshal to BSON
		var statsMap interface{}
		if err := bsonUnmarshalJSON(req.Stats, &statsMap); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid stats: " + err.Error()})
			return
		}
		statsRaw, err = bson.Marshal(statsMap)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to encode stats"})
			return
		}
	}

	gameSystem := req.GameSystem
	if gameSystem == "" {
		gameSystem = game.GameSystem
	}

	// Run derived-stat computation (e.g. wounds/movement for Warhammer)
	if sys, sysErr := registry.Get(gameSystem); sysErr == nil {
		if derived, derivedErr := sys.ComputeDerived(statsRaw); derivedErr == nil {
			statsRaw = derived
		}
	}

	character := &models.Character{
		GameID:     gameObjID,
		GameSystem: gameSystem,
		CreatedBy:  userObjID,
		VisibleTo:  []primitive.ObjectID{userObjID},
		Name:       req.Name,
		Avatar:     req.Avatar,
		IsNPC:      req.IsNPC,
		Stats:      statsRaw,
	}

	if err := h.CharacterRepo.Create(character); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, character)
}

// UpdateGameCharacter replaces character data (owner or GM).
func (h *CharacterHandler) UpdateGameCharacter(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	isGM := game.GameMasterID == userObjID

	existingCharacter, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	if !isGM {
		canEdit := existingCharacter.CreatedBy == userObjID
		if !canEdit {
			for _, visID := range existingCharacter.VisibleTo {
				if visID == userObjID {
					canEdit = true
					break
				}
			}
		}
		if !canEdit {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
			return
		}
	}

	var req UpdateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var statsRaw bson.Raw
	if len(req.Stats) > 0 {
		var statsMap interface{}
		if err := bsonUnmarshalJSON(req.Stats, &statsMap); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid stats: " + err.Error()})
			return
		}
		statsRaw, err = bson.Marshal(statsMap)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to encode stats"})
			return
		}
	} else {
		// Keep existing stats if none provided
		statsRaw = existingCharacter.Stats
	}

	// Run derived-stat computation (e.g. wounds/movement for Warhammer)
	if sys, sysErr := registry.Get(existingCharacter.GameSystem); sysErr == nil {
		if derived, derivedErr := sys.ComputeDerived(statsRaw); derivedErr == nil {
			statsRaw = derived
		}
	}

	states := req.States
	if states == nil {
		states = existingCharacter.States
	}

	updatedCharacter := models.Character{
		Name:   req.Name,
		Avatar: req.Avatar,
		Stats:  statsRaw,
		States: states,
	}

	// Preserve immutable fields
	updatedCharacter.ID = existingCharacter.ID
	updatedCharacter.GameID = existingCharacter.GameID
	updatedCharacter.GameSystem = existingCharacter.GameSystem
	updatedCharacter.CreatedBy = existingCharacter.CreatedBy
	updatedCharacter.VisibleTo = existingCharacter.VisibleTo
	updatedCharacter.CreatedAt = existingCharacter.CreatedAt

	if err := h.CharacterRepo.Update(charID, &updatedCharacter); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterUpdated, map[string]interface{}{
			"character": updatedCharacter,
		})
	}

	c.JSON(http.StatusOK, updatedCharacter)
}

// DeleteGameCharacter deletes a character (owner or GM).
func (h *CharacterHandler) DeleteGameCharacter(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	isGM := game.GameMasterID == userObjID

	existingCharacter, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	if !isGM && existingCharacter.CreatedBy != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this character"})
		return
	}

	if err := h.CharacterRepo.Delete(charID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character deleted successfully"})
}

// CloneGameCharacter clones an existing character N times (GM only).
func (h *CharacterHandler) CloneGameCharacter(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.GameMasterID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the Game Master can clone characters"})
		return
	}

	var req CloneCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	original, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	sys, _ := registry.Get(original.GameSystem)

	// Use the stats-embedded display name if available (e.g. warhammer4e stores it in basicInfo.name).
	baseName := original.Name
	if n := sys.GetDisplayName(original.Stats); n != "" {
		baseName = n
	}

	clones := make([]*models.Character, 0, req.Count)
	for i := 1; i <= req.Count; i++ {
		clone := *original
		clone.ID = primitive.NilObjectID
		clone.Name = fmt.Sprintf("%s %d", baseName, i)
		clone.CreatedBy = userObjID
		clone.VisibleTo = []primitive.ObjectID{userObjID}

		// Keep any stats-embedded name in sync with the clone's top-level Name.
		if updated, err := sys.SetDisplayName(clone.Stats, clone.Name); err == nil {
			clone.Stats = updated
		}

		// Recompute derived stats for the clone
		if derived, derivedErr := sys.ComputeDerived(clone.Stats); derivedErr == nil {
			clone.Stats = derived
		}

		if err := h.CharacterRepo.Create(&clone); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create clone"})
			return
		}
		clones = append(clones, &clone)
	}

	c.JSON(http.StatusCreated, clones)
}

// UpdateCharacterVisibility updates VisibleTo (GM only).
func (h *CharacterHandler) UpdateCharacterVisibility(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.GameMasterID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the Game Master can manage character visibility"})
		return
	}

	var req UpdateVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	visibleTo := make([]primitive.ObjectID, 0, len(req.VisibleTo))
	for _, idStr := range req.VisibleTo {
		objID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID in visibleTo: " + idStr})
			return
		}
		visibleTo = append(visibleTo, objID)
	}

	if err := h.CharacterRepo.UpdateVisibility(charID, visibleTo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterVisibilityUpdated, map[string]interface{}{
			"characterId": charID,
			"visibleTo":   req.VisibleTo,
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Visibility updated successfully"})
}

// bsonUnmarshalJSON converts raw JSON bytes to an interface{} for BSON encoding.
func bsonUnmarshalJSON(data []byte, v interface{}) error {
	return bson.UnmarshalExtJSON(data, true, v)
}
