package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CharacterHandler struct {
	CharacterRepo *repository.CharactersRepository
	GameRepo      *repository.GameRepository
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

// GetMyCharacters returns all characters owned by the authenticated user
func (h *CharacterHandler) GetMyCharacters(c *gin.Context) {
	token, exists := c.Get("jwt")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
		return
	}

	userID, ok := claims["user_id"].(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User ID not found in token"})
		return
	}

	characters, err := h.CharacterRepo.GetByOwnerID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for i := range characters {
		characters[i].ComputeDerivedFields()
	}

	c.JSON(http.StatusOK, characters)
}

// CreateCharacter creates a new character for the authenticated user
func (h *CharacterHandler) CreateCharacter(c *gin.Context) {
	token, exists := c.Get("jwt")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
		return
	}

	userID, ok := claims["user_id"].(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User ID not found in token"})
		return
	}

	var req CreateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ownerObjectID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	character := &models.Character{
		OwnerID:         ownerObjectID,
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

// UpdateCharacter updates an existing character owned by the authenticated user
func (h *CharacterHandler) UpdateCharacter(c *gin.Context) {
	token, exists := c.Get("jwt")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
		return
	}

	userID, ok := claims["user_id"].(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User ID not found in token"})
		return
	}

	characterID := c.Param("id")
	if characterID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Character ID is required"})
		return
	}

	// Verify the character belongs to the user (or user is GM of the specified game)
	existingCharacter, err := h.CharacterRepo.GetByID(characterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	if existingCharacter.OwnerID.Hex() != userID {
		// Check if user is GM of the specified game
		gameID := c.Query("gameId")
		isGM := false
		if gameID != "" && h.GameRepo != nil {
			game, err := h.GameRepo.GetByID(gameID)
			if err == nil {
				userObjID, _ := primitive.ObjectIDFromHex(userID)
				isGM = game.GameMasterID == userObjID
			}
		}
		if !isGM {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
			return
		}
	}

	var updatedCharacter models.Character
	if err := c.ShouldBindJSON(&updatedCharacter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Preserve ownership
	updatedCharacter.OwnerID = existingCharacter.OwnerID
	updatedCharacter.CreatedAt = existingCharacter.CreatedAt

	if err := h.CharacterRepo.Update(characterID, &updatedCharacter); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedCharacter.ComputeDerivedFields()
	c.JSON(http.StatusOK, updatedCharacter)
}

// CloneCharacter clones an existing character N times (GM only)
func (h *CharacterHandler) CloneCharacter(c *gin.Context) {
	token, exists := c.Get("jwt")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
		return
	}

	userID, ok := claims["user_id"].(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User ID not found in token"})
		return
	}

	characterID := c.Param("id")
	gameID := c.Query("gameId")

	if gameID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "gameId query parameter is required"})
		return
	}

	// Verify user is GM of the game
	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
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

	// Fetch the original character
	original, err := h.CharacterRepo.GetByID(characterID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	clones := make([]*models.Character, 0, req.Count)
	for i := 1; i <= req.Count; i++ {
		clone := *original
		clone.ID = primitive.NilObjectID
		clone.BasicInfo.Name = fmt.Sprintf("%s %d", original.BasicInfo.Name, i)
		clone.OwnerID = original.OwnerID

		if err := h.CharacterRepo.Create(&clone); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create clone"})
			return
		}
		clone.ComputeDerivedFields()
		clones = append(clones, &clone)
	}

	c.JSON(http.StatusCreated, clones)
}
