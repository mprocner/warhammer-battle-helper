package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/storage"
	"battle-helper/internal/websocket"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type FileHandler struct {
	UserRepo *repository.UserRepository
	Storage  storage.Storage
	GameRepo *repository.GameRepository
	Hub      *websocket.Hub
}

// Request/Response types

type CreateFolderRequest struct {
	Name     string `json:"name" binding:"required"`
	ParentID string `json:"parentId,omitempty"`
}

type RenameFolderRequest struct {
	Name string `json:"name" binding:"required"`
}

type GetFilesResponse struct {
	Files   []models.UserFile   `json:"files"`
	Folders []models.UserFolder `json:"folders"`
}

type UploadFilesResponse struct {
	Files  []models.UserFile `json:"files"`
	Errors []string          `json:"errors,omitempty"`
}

// AllowedFileImageTypes contains the allowed MIME types for user file uploads (images only)
var AllowedFileImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// ValidateImageFile checks if the file is a valid image and within size limits
func ValidateImageFile(contentType string, size int64) (string, error) {
	if size > storage.MaxFileSize {
		return "", &ValidationError{"file too large: maximum size is 5MB"}
	}

	ext, ok := AllowedFileImageTypes[contentType]
	if !ok {
		return "", &ValidationError{"invalid file type: only JPEG, PNG, GIF, and WebP images are allowed"}
	}

	return ext, nil
}

// GetFiles handles GET /files - Get all files and folders for current user
func (h *FileHandler) GetFiles(c *gin.Context) {
	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.UserRepo.GetUserWithFiles(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get files"})
		return
	}

	c.JSON(http.StatusOK, GetFilesResponse{
		Files:   user.Files,
		Folders: user.Folders,
	})
}

// UploadFiles handles POST /files/upload - Upload multiple image files
func (h *FileHandler) UploadFiles(c *gin.Context) {
	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Parse multipart form with max 50MB (for multiple files)
	if err := c.Request.ParseMultipartForm(10 * storage.MaxFileSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form: " + err.Error()})
		return
	}

	// Get optional folder ID
	var folderID *primitive.ObjectID
	folderIDStr := c.Request.FormValue("folderId")
	if folderIDStr != "" {
		fid, err := primitive.ObjectIDFromHex(folderIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}
		folderID = &fid
	}

	// Get files from form
	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
		return
	}

	var uploadedFiles []models.UserFile
	var errors []string

	for _, header := range files {
		// Get content type
		contentType := header.Header.Get("Content-Type")

		// Validate file type and size
		ext, err := ValidateImageFile(contentType, header.Size)
		if err != nil {
			errors = append(errors, header.Filename+": "+err.Error())
			continue
		}

		// Open the file
		file, err := header.Open()
		if err != nil {
			errors = append(errors, header.Filename+": failed to open file")
			continue
		}

		// Generate unique filename
		filename := storage.GenerateFilename(ext)

		// Upload to storage
		url, err := h.Storage.Upload(file, filename, contentType)
		file.Close()
		if err != nil {
			errors = append(errors, header.Filename+": failed to upload")
			continue
		}

		// Create file record
		userFile := models.UserFile{
			ID:        primitive.NewObjectID(),
			Name:      header.Filename,
			FileURL:   url,
			FolderID:  folderID,
			MimeType:  contentType,
			Size:      header.Size,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		uploadedFiles = append(uploadedFiles, userFile)
	}

	// Save files to database
	if len(uploadedFiles) > 0 {
		if err := h.UserRepo.AddFiles(userID, uploadedFiles); err != nil {
			log.Printf("ERROR: Failed to save files to database for user %s: %v", userID.Hex(), err)
			// Try to clean up uploaded files
			for _, f := range uploadedFiles {
				filename := filepath.Base(f.FileURL)
				h.Storage.Delete(filename)
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save files to database"})
			return
		}
	}

	if len(uploadedFiles) == 0 && len(errors) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "All files failed to upload", "errors": errors})
		return
	}

	c.JSON(http.StatusOK, UploadFilesResponse{
		Files:  uploadedFiles,
		Errors: errors,
	})
}

// DeleteFile handles DELETE /files/:fileId - Delete a file
func (h *FileHandler) DeleteFile(c *gin.Context) {
	fileIDStr := c.Param("fileId")

	fileID, err := primitive.ObjectIDFromHex(fileIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
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

	// Delete from database and get file info
	deletedFile, err := h.UserRepo.DeleteFile(userID, fileID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Delete from storage
	if deletedFile.FileURL != "" {
		filename := filepath.Base(deletedFile.FileURL)
		h.Storage.Delete(filename) // Ignore error - file already removed from DB

		// Remove this file from all scenes in GM's games and broadcast events
		affected, err := h.GameRepo.RemoveSceneImagesByGMAndFileURL(userID, deletedFile.FileURL)
		if err != nil {
			log.Printf("WARN: Failed to remove scene images for file %s: %v", deletedFile.FileURL, err)
		}
		for _, img := range affected {
			h.Hub.BroadcastToGame(img.GameID, "SCENE_IMAGE_DELETED", map[string]interface{}{
				"sceneId": img.SceneID,
				"imageId": img.ImageID,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "File deleted successfully"})
}

// CreateFolder handles POST /folders - Create a new folder
func (h *FileHandler) CreateFolder(c *gin.Context) {
	var req CreateFolderRequest
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

	// Parse parent ID if provided
	var parentID *primitive.ObjectID
	if req.ParentID != "" {
		pid, err := primitive.ObjectIDFromHex(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent folder ID"})
			return
		}
		parentID = &pid
	}

	folder := models.UserFolder{
		Name:     req.Name,
		ParentID: parentID,
	}

	createdFolder, err := h.UserRepo.AddFolder(userID, folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	c.JSON(http.StatusCreated, createdFolder)
}

// RenameFolder handles PUT /folders/:folderId - Rename a folder
func (h *FileHandler) RenameFolder(c *gin.Context) {
	folderIDStr := c.Param("folderId")

	folderID, err := primitive.ObjectIDFromHex(folderIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
		return
	}

	var req RenameFolderRequest
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

	if err := h.UserRepo.UpdateFolder(userID, folderID, req.Name); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder renamed successfully"})
}

// DeleteFolder handles DELETE /folders/:folderId - Delete a folder
func (h *FileHandler) DeleteFolder(c *gin.Context) {
	folderIDStr := c.Param("folderId")

	folderID, err := primitive.ObjectIDFromHex(folderIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
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

	// Check if deleteContents query param is set
	deleteContents := c.Query("deleteContents") == "true"

	if deleteContents {
		// Delete all files in this folder and subfolders recursively
		if err := h.deleteFolderRecursive(userID, folderID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder contents"})
			return
		}
	} else {
		// Just check if folder has contents
		user, err := h.UserRepo.GetUserWithFiles(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check folder contents"})
			return
		}

		// Check for files in this folder
		for _, f := range user.Files {
			if f.FolderID != nil && *f.FolderID == folderID {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Folder is not empty. Use deleteContents=true to delete all contents."})
				return
			}
		}

		// Check for subfolders
		for _, f := range user.Folders {
			if f.ParentID != nil && *f.ParentID == folderID {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Folder has subfolders. Use deleteContents=true to delete all contents."})
				return
			}
		}
	}

	// Delete the folder itself
	if err := h.UserRepo.DeleteFolder(userID, folderID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted successfully"})
}

// deleteFolderRecursive deletes a folder and all its contents recursively
func (h *FileHandler) deleteFolderRecursive(userID, folderID primitive.ObjectID) error {
	// Get subfolders
	subfolders, err := h.UserRepo.GetSubfolders(userID, folderID)
	if err != nil {
		return err
	}

	// Recursively delete subfolders
	for _, subfolder := range subfolders {
		if err := h.deleteFolderRecursive(userID, subfolder.ID); err != nil {
			return err
		}
		if err := h.UserRepo.DeleteFolder(userID, subfolder.ID); err != nil {
			return err
		}
	}

	// Delete files in this folder
	deletedFiles, err := h.UserRepo.DeleteFilesInFolder(userID, folderID)
	if err != nil {
		return err
	}

	// Delete files from storage
	for _, f := range deletedFiles {
		if f.FileURL != "" {
			filename := filepath.Base(f.FileURL)
			h.Storage.Delete(filename) // Ignore errors
		}
	}

	return nil
}

// MoveFileRequest is the request body for moving a file
type MoveFileRequest struct {
	FolderID *string `json:"folderId"` // null = move to root
}

// MoveFile handles PUT /files/:fileId/move - Move file to another folder
func (h *FileHandler) MoveFile(c *gin.Context) {
	fileIDStr := c.Param("fileId")

	fileID, err := primitive.ObjectIDFromHex(fileIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
		return
	}

	var req MoveFileRequest
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

	// Parse folder ID if provided
	var folderID *primitive.ObjectID
	if req.FolderID != nil && *req.FolderID != "" {
		fid, err := primitive.ObjectIDFromHex(*req.FolderID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}
		folderID = &fid
	}

	if err := h.UserRepo.MoveFile(userID, fileID, folderID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "File moved successfully"})
}

// GetFileUsage handles GET /files/:fileId/usage - Get games where a file is used
func (h *FileHandler) GetFileUsage(c *gin.Context) {
	fileIDStr := c.Param("fileId")

	fileID, err := primitive.ObjectIDFromHex(fileIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
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

	// Get user's files to find the file URL
	user, err := h.UserRepo.GetUserWithFiles(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user files"})
		return
	}

	var fileURL string
	for _, f := range user.Files {
		if f.ID == fileID {
			fileURL = f.FileURL
			break
		}
	}

	if fileURL == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	games, err := h.GameRepo.GetGameNamesByGMAndFileURL(userID, fileURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check file usage"})
		return
	}

	if games == nil {
		games = []string{}
	}

	c.JSON(http.StatusOK, gin.H{"games": games})
}

// GetFile handles GET /user-files/:filename - Serve file (public)
func (h *FileHandler) GetFile(c *gin.Context) {
	filename := c.Param("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename is required"})
		return
	}

	// Sanitize filename to prevent path traversal
	filename = filepath.Base(filename)

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

	// Send with proper Content-Type
	c.Data(http.StatusOK, contentType, data)
}
