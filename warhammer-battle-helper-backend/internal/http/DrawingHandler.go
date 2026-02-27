package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DrawingHandler struct {
	DrawingService *service.DrawingService
}

// AddDrawingPath appends a drawing path to a scene
func (h *DrawingHandler) AddDrawingPath(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.AddDrawingPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.DrawingService.AddDrawingPath(gameID, sceneID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Drawing path added"})
}

// UndoLastDrawingPath removes the last drawing path belonging to the requesting user
func (h *DrawingHandler) UndoLastDrawingPath(c *gin.Context) {
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

	if err := h.DrawingService.UndoLastDrawingPath(gameID, sceneID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Last drawing path removed"})
}

// DeleteDrawingPath removes a specific drawing path by ID (owner or GM only)
func (h *DrawingHandler) DeleteDrawingPath(c *gin.Context) {
	gameID := c.Param("id")
	sceneIDStr := c.Param("sceneId")
	pathIDStr := c.Param("pathId")

	sceneID, err := primitive.ObjectIDFromHex(sceneIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	pathID, err := primitive.ObjectIDFromHex(pathIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path ID"})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.DrawingService.DeleteDrawingPath(gameID, sceneID, pathID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Drawing path deleted"})
}

// ClearDrawingPaths removes all drawing paths from a scene (GM only)
func (h *DrawingHandler) ClearDrawingPaths(c *gin.Context) {
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

	if err := h.DrawingService.ClearDrawingPaths(gameID, sceneID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Drawing paths cleared"})
}
