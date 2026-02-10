package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type SceneHandler struct {
	GameService *service.GameService
}

// helper to extract user ID from JWT
func getUserIDFromContext(c *gin.Context) (primitive.ObjectID, error) {
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	return primitive.ObjectIDFromHex(userIDStr)
}

// GetScenes returns all scenes for a game
func (h *SceneHandler) GetScenes(c *gin.Context) {
	gameID := c.Param("id")

	scenes, err := h.GameService.GetScenes(gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, scenes)
}

// CreateScene creates a new scene
func (h *SceneHandler) CreateScene(c *gin.Context) {
	gameID := c.Param("id")

	var req models.CreateSceneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	scene, err := h.GameService.CreateScene(gameID, userID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, scene)
}

// UpdateScene updates a scene
func (h *SceneHandler) UpdateScene(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.UpdateSceneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.UpdateScene(gameID, sceneID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scene updated"})
}

// DeleteScene deletes a scene
func (h *SceneHandler) DeleteScene(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.DeleteScene(gameID, sceneID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scene deleted"})
}

// AssignPlayerToScene assigns or removes a player from a scene
func (h *SceneHandler) AssignPlayerToScene(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req struct {
		PlayerID string `json:"playerId" binding:"required"`
		Assign   bool   `json:"assign"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	playerID, err := primitive.ObjectIDFromHex(req.PlayerID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid player ID"})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.AssignPlayerToScene(gameID, sceneID, playerID, userID, req.Assign); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Player assignment updated"})
}

// AddSceneCharacter adds a character to a scene
func (h *SceneHandler) AddSceneCharacter(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.AddCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.AddCharacterToScene(gameID, sceneID, req.CharacterID, req.PositionX, req.PositionY, req.IsEnemy, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character added to scene"})
}

// MoveSceneCharacter moves a character within a scene
func (h *SceneHandler) MoveSceneCharacter(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.MoveCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	characterID, err := primitive.ObjectIDFromHex(req.CharacterID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid character ID"})
		return
	}

	if err := h.GameService.MoveCharacterInScene(gameID, sceneID, characterID, req.PositionX, req.PositionY); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character moved"})
}

// RemoveSceneCharacter removes a character from a scene
func (h *SceneHandler) RemoveSceneCharacter(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")
	charIDStr := c.Param("charId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	characterID, err := primitive.ObjectIDFromHex(charIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid character ID"})
		return
	}

	if err := h.GameService.RemoveCharacterFromScene(gameID, sceneID, characterID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character removed from scene"})
}

// AddSceneImage adds an image to a scene
func (h *SceneHandler) AddSceneImage(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.AddSceneImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	image, err := h.GameService.AddImageToScene(gameID, sceneID, userID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, image)
}

// UpdateSceneImage updates an image within a scene
func (h *SceneHandler) UpdateSceneImage(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")
	imageIDStr := c.Param("imageId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	imageID, err := primitive.ObjectIDFromHex(imageIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid image ID"})
		return
	}

	var req models.UpdateSceneImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.UpdateSceneImage(gameID, sceneID, imageID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Image updated"})
}

// DeleteSceneImage deletes an image from a scene
func (h *SceneHandler) DeleteSceneImage(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")
	imageIDStr := c.Param("imageId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	imageID, err := primitive.ObjectIDFromHex(imageIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid image ID"})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.DeleteSceneImage(gameID, sceneID, imageID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Image deleted"})
}
