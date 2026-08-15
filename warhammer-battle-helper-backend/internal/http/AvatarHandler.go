package http

import (
	"battle-helper/internal/storage"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

type AvatarHandler struct {
	Storage storage.Storage
}

type UploadAvatarResponse struct {
	URL string `json:"url"`
}

// UploadAvatar handles POST /avatars - Upload avatar (protected)
// @Summary Upload avatar image
// @Description Uploads an avatar image file and returns the URL
// @Tags avatars
// @Accept multipart/form-data
// @Produce json
// @Param avatar formData file true "Avatar image file (JPEG, PNG, WebP, max 15MB)"
// @Success 200 {object} UploadAvatarResponse
// @Failure 400 {object} map[string]string "Invalid request"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 500 {object} map[string]string "Server error"
// @Security BearerAuth
// @Router /avatars [post]
func (h *AvatarHandler) UploadAvatar(c *gin.Context) {
	// Parse multipart form with max storage.MaxMultipartMemory
	if err := c.Request.ParseMultipartForm(storage.MaxMultipartMemory); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form: " + err.Error()})
		return
	}

	// Get the file from the form
	file, header, err := c.Request.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No avatar file provided"})
		return
	}
	defer file.Close()

	// Validate file type and size
	ext, err := storage.ValidateFile(file, header)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Reset file position after validation
	file.Seek(0, 0)

	// Generate unique filename
	filename := storage.GenerateFilename(ext)

	// Get content type
	contentType := header.Header.Get("Content-Type")

	// Upload to storage
	url, err := h.Storage.Upload(file, filename, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload avatar: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, UploadAvatarResponse{URL: url})
}

// GetAvatar handles GET /avatars/:filename - Fetch avatar (public)
// @Summary Get avatar image
// @Description Retrieves an avatar image by filename
// @Tags avatars
// @Produce image/jpeg,image/png,image/webp
// @Param filename path string true "Avatar filename"
// @Success 200 {file} binary "Avatar image"
// @Failure 404 {object} map[string]string "Avatar not found"
// @Failure 500 {object} map[string]string "Server error"
// @Router /avatars/{filename} [get]
func (h *AvatarHandler) GetAvatar(c *gin.Context) {
	filename := c.Param("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename is required"})
		return
	}

	// Get the file from storage
	reader, contentType, err := h.Storage.Get(filename)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Avatar not found"})
		return
	}
	defer reader.Close()

	// Read the entire file
	data, err := io.ReadAll(reader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read avatar"})
		return
	}

	// Set cache headers for better performance
	c.Header("Cache-Control", "public, max-age=86400") // Cache for 24 hours

	// Send with proper Content-Length (c.Data sets it automatically)
	c.Data(http.StatusOK, contentType, data)
}
