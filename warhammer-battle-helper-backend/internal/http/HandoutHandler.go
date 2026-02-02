package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"battle-helper/internal/storage"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type HandoutHandler struct {
	GameService *service.GameService
	Storage     storage.Storage
}

// AllowedHandoutTypes contains the allowed MIME types for handout uploads
var AllowedHandoutTypes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/gif":       ".gif",
	"image/webp":      ".webp",
	"application/pdf": ".pdf",
	"text/plain":      ".txt",
}

// ValidateHandoutFile checks if the file is a valid handout type and within size limits
func ValidateHandoutFile(contentType string, size int64) (string, error) {
	// Check file size (5MB)
	if size > storage.MaxFileSize {
		return "", &ValidationError{"file too large: maximum size is 5MB"}
	}

	// Check content type
	ext, ok := AllowedHandoutTypes[contentType]
	if !ok {
		return "", &ValidationError{"invalid file type: only JPEG, PNG, GIF, WebP, PDF, and TXT are allowed"}
	}

	return ext, nil
}

type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

type UploadHandoutResponse struct {
	URL string `json:"url"`
}

// UploadHandoutFile handles POST /games/:id/handouts/upload - Upload handout file
func (h *HandoutHandler) UploadHandoutFile(c *gin.Context) {
	gameID := c.Param("id")

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Verify user is GM by checking if they can get visible handouts (this will check GM status)
	game, err := h.GameService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.GameMasterID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the game master can upload handout files"})
		return
	}

	// Parse multipart form with max 5MB
	if err := c.Request.ParseMultipartForm(storage.MaxFileSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form: " + err.Error()})
		return
	}

	// Get the file from the form
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	// Get content type
	contentType := header.Header.Get("Content-Type")

	// Validate file type and size
	ext, err := ValidateHandoutFile(contentType, header.Size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Generate unique filename
	filename := storage.GenerateFilename(ext)

	// Upload to storage
	url, err := h.Storage.Upload(file, filename, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, UploadHandoutResponse{URL: url})
}

// CreateHandout handles POST /games/:id/handouts - Create handout
func (h *HandoutHandler) CreateHandout(c *gin.Context) {
	gameID := c.Param("id")

	var req models.CreateHandoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	handout, err := h.GameService.CreateHandout(gameID, userID, req)
	if err != nil {
		if strings.Contains(err.Error(), "only the game master") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, handout)
}

// GetHandouts handles GET /games/:id/handouts - List visible handouts
func (h *HandoutHandler) GetHandouts(c *gin.Context) {
	gameID := c.Param("id")

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	handouts, err := h.GameService.GetVisibleHandouts(gameID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, handouts)
}

// UpdateHandout handles PUT /games/:id/handouts/:handoutId - Update handout
func (h *HandoutHandler) UpdateHandout(c *gin.Context) {
	gameID := c.Param("id")
	handoutIDStr := c.Param("handoutId")

	handoutID, err := primitive.ObjectIDFromHex(handoutIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid handout ID"})
		return
	}

	var req models.UpdateHandoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	err = h.GameService.UpdateHandout(gameID, handoutID, userID, req)
	if err != nil {
		if strings.Contains(err.Error(), "only the game master") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Handout updated successfully"})
}

// DeleteHandout handles DELETE /games/:id/handouts/:handoutId - Delete handout
func (h *HandoutHandler) DeleteHandout(c *gin.Context) {
	gameID := c.Param("id")
	handoutIDStr := c.Param("handoutId")

	handoutID, err := primitive.ObjectIDFromHex(handoutIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid handout ID"})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	fileURL, err := h.GameService.DeleteHandout(gameID, handoutID, userID)
	if err != nil {
		if strings.Contains(err.Error(), "only the game master") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Delete the file from storage
	if fileURL != "" {
		// Extract filename from URL
		filename := filepath.Base(fileURL)
		if err := h.Storage.Delete(filename); err != nil {
			// Log but don't fail - handout is already deleted
			// In production, you might want to queue this for retry
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Handout deleted successfully"})
}

// ReorderHandouts handles PUT /games/:id/handouts/reorder - Reorder handouts
func (h *HandoutHandler) ReorderHandouts(c *gin.Context) {
	gameID := c.Param("id")

	var req models.ReorderHandoutsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	err = h.GameService.ReorderHandouts(gameID, userID, req.HandoutIDs)
	if err != nil {
		if strings.Contains(err.Error(), "only the game master") {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Handouts reordered successfully"})
}

// GetHandoutFile handles GET /handouts/:filename - Get file (public)
func (h *HandoutHandler) GetHandoutFile(c *gin.Context) {
	filename := c.Param("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename is required"})
		return
	}

	// Get the file from storage
	reader, contentType, err := h.Storage.Get(filename)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}
	defer reader.Close()

	// Read the entire file
	data, err := io.ReadAll(reader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	// Set cache headers for better performance
	c.Header("Cache-Control", "public, max-age=86400") // Cache for 24 hours

	// Send with proper Content-Length
	c.Data(http.StatusOK, contentType, data)
}
