package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CharacterHandler struct {
	CharacterRepo *repository.CharactersRepository
}

type CreateCharacterRequest struct {
	BasicInfo       models.BasicInfo          `json:"basicInfo" binding:"required"`
	Characteristics models.CharacteristicList `json:"characteristics" binding:"required"`
	Skills          map[string]int            `json:"skills"`
	Weapons         []models.Weapon           `json:"weapons"`
	Avatar          string                    `json:"avatar"`
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
		Skills:          req.Skills,
		Weapons:         req.Weapons,
		Avatar:          req.Avatar,
	}

	if err := h.CharacterRepo.Create(character); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, character)
}
