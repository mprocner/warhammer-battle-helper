package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type FogHandler struct {
	FogService *service.FogService
}

// ToggleFog enables or disables fog of war for a scene
func (h *FogHandler) ToggleFog(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.ToggleFogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.FogService.ToggleFog(gameID, sceneID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Fog toggled"})
}

// AddFogPath appends a brush stroke reveal path to a scene
func (h *FogHandler) AddFogPath(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.AddFogPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.FogService.AddFogPath(gameID, sceneID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Fog path added"})
}

// ClearFogPaths removes all reveal paths from a scene
func (h *FogHandler) ClearFogPaths(c *gin.Context) {
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

	if err := h.FogService.ClearFogPaths(gameID, sceneID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Fog cleared"})
}

// RevealAllFog replaces all paths with a single full-canvas reveal rect
func (h *FogHandler) RevealAllFog(c *gin.Context) {
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

	if err := h.FogService.RevealAllFog(gameID, sceneID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Fog fully revealed"})
}

// UndoLastFogPath removes the last reveal path from a scene
func (h *FogHandler) UndoLastFogPath(c *gin.Context) {
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

	if err := h.FogService.UndoLastFogPath(gameID, sceneID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Last fog path removed"})
}
