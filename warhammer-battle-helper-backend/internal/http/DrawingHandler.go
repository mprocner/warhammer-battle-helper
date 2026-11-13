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

// PasteDrawingPaths creates several drawing paths at once and returns them
func (h *DrawingHandler) PasteDrawingPaths(c *gin.Context) {
	sceneID, err := primitive.ObjectIDFromHex(c.Param("sceneId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}
	var req models.PasteDrawingPathsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	paths, err := h.DrawingService.PasteDrawingPaths(c.Param("id"), sceneID, userID, req.Paths)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"paths": paths})
}

// DeleteDrawingPaths removes the listed drawing paths (owner or GM only)
func (h *DrawingHandler) DeleteDrawingPaths(c *gin.Context) {
	sceneID, err := primitive.ObjectIDFromHex(c.Param("sceneId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}
	var req models.DrawingPathIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.DrawingService.DeleteDrawingPaths(c.Param("id"), sceneID, userID, req.PathIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Drawing paths deleted"})
}

// MoveDrawingPaths shifts the listed drawing paths by one delta (owner or GM only)
func (h *DrawingHandler) MoveDrawingPaths(c *gin.Context) {
	sceneID, err := primitive.ObjectIDFromHex(c.Param("sceneId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}
	var req models.MoveDrawingPathsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.DrawingService.MoveDrawingPaths(c.Param("id"), sceneID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Drawing paths moved"})
}

// UpdateDrawingPath edits a text drawing path (owner or GM only)
func (h *DrawingHandler) UpdateDrawingPath(c *gin.Context) {
	sceneID, err := primitive.ObjectIDFromHex(c.Param("sceneId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}
	pathID, err := primitive.ObjectIDFromHex(c.Param("pathId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path ID"})
		return
	}

	var req models.UpdateDrawingPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.DrawingService.UpdateDrawingPath(c.Param("id"), sceneID, pathID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Drawing path updated"})
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
