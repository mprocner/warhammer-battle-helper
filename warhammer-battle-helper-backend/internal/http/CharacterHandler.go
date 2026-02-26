package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CharacterHandler struct {
	CharacterRepo *repository.CharactersRepository
	GameRepo      *repository.GameRepository
	Hub           *websocket.Hub
}

type CreateCharacterRequest struct {
	BasicInfo       models.BasicInfo            `json:"basicInfo" binding:"required"`
	Characteristics models.CharacteristicsTable `json:"characteristics"`
	BasicSkills     map[string]int              `json:"basicSkills"`
	AdvancedSkills  map[string]int              `json:"advancedSkills"`
	Weapons         []models.Weapon             `json:"weapons"`
	Talents         []models.Talent             `json:"talents"`
	IsNPC           bool                        `json:"isNPC"`
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

	// Filter by visibility for non-GM users
	var result []models.Character
	for _, char := range characters {
		char.ComputeDerivedFields()
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

// CreateGameCharacter creates a new character scoped to the game
func (h *CharacterHandler) CreateGameCharacter(c *gin.Context) {
	gameID := c.Param("id")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
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

	character := &models.Character{
		GameID:          gameObjID,
		CreatedBy:       userObjID,
		VisibleTo:       []primitive.ObjectID{userObjID},
		BasicInfo:       req.BasicInfo,
		Characteristics: req.Characteristics,
		BasicSkills:     req.BasicSkills,
		AdvancedSkills:  req.AdvancedSkills,
		Weapons:         req.Weapons,
		Talents:         req.Talents,
		IsNPC:           req.IsNPC,
	}

	if err := h.CharacterRepo.Create(character); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	character.ComputeDerivedFields()
	c.JSON(http.StatusCreated, character)
}

// UpdateGameCharacter updates an existing character (owner or GM)
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

	var updatedCharacter models.Character
	if err := c.ShouldBindJSON(&updatedCharacter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Preserve immutable fields
	updatedCharacter.GameID = existingCharacter.GameID
	updatedCharacter.CreatedBy = existingCharacter.CreatedBy
	updatedCharacter.VisibleTo = existingCharacter.VisibleTo
	updatedCharacter.CreatedAt = existingCharacter.CreatedAt

	if err := h.CharacterRepo.Update(charID, &updatedCharacter); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedCharacter.ComputeDerivedFields()

	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, "CHARACTER_UPDATED", map[string]interface{}{
			"characterId": charID,
		})
	}

	c.JSON(http.StatusOK, updatedCharacter)
}

// DeleteGameCharacter deletes a character from the collection (owner or GM)
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

// CloneGameCharacter clones an existing character N times in the same game (GM only)
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

	clones := make([]*models.Character, 0, req.Count)
	for i := 1; i <= req.Count; i++ {
		clone := *original
		clone.ID = primitive.NilObjectID
		clone.BasicInfo.Name = fmt.Sprintf("%s %d", original.BasicInfo.Name, i)
		clone.CreatedBy = userObjID
		clone.VisibleTo = []primitive.ObjectID{userObjID}

		if err := h.CharacterRepo.Create(&clone); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create clone"})
			return
		}
		clone.ComputeDerivedFields()
		clones = append(clones, &clone)
	}

	c.JSON(http.StatusCreated, clones)
}

// UpdateCharacterVisibility updates the VisibleTo list for a character (GM only)
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
		h.Hub.BroadcastToGame(gameID, "CHARACTER_VISIBILITY_UPDATED", map[string]interface{}{
			"characterId": charID,
			"visibleTo":   req.VisibleTo,
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Visibility updated successfully"})
}
