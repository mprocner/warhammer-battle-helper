package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NoteHandler struct {
	NoteService *service.NoteService
}

// CreateNote handles POST /games/:id/notes
func (h *NoteHandler) CreateNote(c *gin.Context) {
	gameID := c.Param("id")

	var req models.CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	note, err := h.NoteService.CreateNote(gameID, userID, req)
	if err != nil {
		if strings.Contains(err.Error(), "not a participant") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, note)
}

// GetNotes handles GET /games/:id/notes
func (h *NoteHandler) GetNotes(c *gin.Context) {
	gameID := c.Param("id")

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	notes, err := h.NoteService.GetNotes(gameID, userID)
	if err != nil {
		if strings.Contains(err.Error(), "not a participant") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, notes)
}

// UpdateNote handles PUT /games/:id/notes/:noteId
func (h *NoteHandler) UpdateNote(c *gin.Context) {
	gameID := c.Param("id")
	noteIDStr := c.Param("noteId")

	noteID, err := primitive.ObjectIDFromHex(noteIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid note ID"})
		return
	}

	var req models.UpdateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	note, err := h.NoteService.UpdateNote(gameID, noteID, userID, req)
	if err != nil {
		if strings.Contains(err.Error(), "permission denied") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, note)
}

// ReorderNotes handles PUT /games/:id/notes/reorder
func (h *NoteHandler) ReorderNotes(c *gin.Context) {
	gameID := c.Param("id")

	var req models.ReorderNotesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.NoteService.ReorderNotes(gameID, userID, req.NoteIDs); err != nil {
		if strings.Contains(err.Error(), "not a participant") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note order saved"})
}

// DeleteNote handles DELETE /games/:id/notes/:noteId
func (h *NoteHandler) DeleteNote(c *gin.Context) {
	gameID := c.Param("id")
	noteIDStr := c.Param("noteId")

	noteID, err := primitive.ObjectIDFromHex(noteIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid note ID"})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	err = h.NoteService.DeleteNote(gameID, noteID, userID)
	if err != nil {
		if strings.Contains(err.Error(), "permission denied") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note deleted"})
}
