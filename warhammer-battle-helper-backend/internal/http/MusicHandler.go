package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/service"
	"battle-helper/internal/storage"
	"battle-helper/internal/websocket"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type MusicHandler struct {
	UserRepo    *repository.UserRepository
	Storage     storage.Storage
	GameService *service.GameService
}

// --- Request/Response types ---

type GetMusicResponse struct {
	Music     []models.MusicFile   `json:"music"`
	Folders   []models.MusicFolder `json:"folders"`
	Playlists []models.Playlist    `json:"playlists"`
}

type CreateMusicFolderRequest struct {
	Name     string  `json:"name" binding:"required"`
	ParentID *string `json:"parentId,omitempty"`
}

type RenameMusicFolderRequest struct {
	Name string `json:"name" binding:"required"`
}

type MoveMusicFileRequest struct {
	FolderID *string `json:"folderId"`
}

type UploadMusicResponse struct {
	Files  []models.MusicFile `json:"files"`
	Errors []string           `json:"errors,omitempty"`
}

type CreatePlaylistRequest struct {
	Name   string   `json:"name" binding:"required"`
	Tracks []string `json:"tracks"`
}

type UpdatePlaylistRequest struct {
	Name   string   `json:"name" binding:"required"`
	Tracks []string `json:"tracks"`
}

type ReorderPlaylistsRequest struct {
	PlaylistIDs []string `json:"playlistIds" binding:"required"`
}

type PlayTrackRequest struct {
	TrackURL   string  `json:"trackUrl" binding:"required"`
	TrackName  string  `json:"trackName"`
	Position   float64 `json:"position"`
	PlaylistId string  `json:"playlistId"`
	TrackIndex int     `json:"trackIndex"`
}

type PauseTrackRequest struct {
	Position float64 `json:"position"`
}

type SetVolumeRequest struct {
	Volume float64 `json:"volume"`
}

// --- User-level endpoints (music library) ---

// GetMusic handles GET /music - Get user's music files and playlists
func (h *MusicHandler) GetMusic(c *gin.Context) {
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.UserRepo.GetUserWithMusic(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get music"})
		return
	}

	c.JSON(http.StatusOK, GetMusicResponse{
		Music:     user.Music,
		Folders:   user.MusicFolders,
		Playlists: user.Playlists,
	})
}

// UploadMusic handles POST /music/upload - Upload multiple music files
func (h *MusicHandler) UploadMusic(c *gin.Context) {
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Parse multipart form with max 500MB (for multiple large music files)
	if err := c.Request.ParseMultipartForm(10 * storage.MaxMusicFileSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form: " + err.Error()})
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
		return
	}

	// Optional folderId form field
	var folderID *primitive.ObjectID
	if folderIDStr := c.Request.FormValue("folderId"); folderIDStr != "" {
		oid, err := primitive.ObjectIDFromHex(folderIDStr)
		if err == nil {
			folderID = &oid
		}
	}

	var uploadedFiles []models.MusicFile
	var errors []string

	for _, header := range files {
		contentType := header.Header.Get("Content-Type")

		// Validate music file type and size
		if header.Size > storage.MaxMusicFileSize {
			errors = append(errors, header.Filename+": file too large, maximum size is 50MB")
			continue
		}

		ext, ok := storage.AllowedMusicTypes[contentType]
		if !ok {
			errors = append(errors, header.Filename+": invalid file type, only MP3 and WAV are allowed")
			continue
		}

		file, err := header.Open()
		if err != nil {
			errors = append(errors, header.Filename+": failed to open file")
			continue
		}

		filename := storage.GenerateFilename(ext)

		url, err := h.Storage.Upload(file, filename, contentType)
		file.Close()
		if err != nil {
			errors = append(errors, header.Filename+": failed to upload")
			continue
		}

		musicFile := models.MusicFile{
			ID:        primitive.NewObjectID(),
			Name:      header.Filename,
			FileURL:   url,
			FolderID:  folderID,
			MimeType:  contentType,
			Size:      header.Size,
			CreatedAt: time.Now(),
		}

		uploadedFiles = append(uploadedFiles, musicFile)
	}

	if len(uploadedFiles) > 0 {
		if err := h.UserRepo.AddMusicFiles(userID, uploadedFiles); err != nil {
			log.Printf("ERROR: Failed to save music files to database for user %s: %v", userID.Hex(), err)
			for _, f := range uploadedFiles {
				filename := filepath.Base(f.FileURL)
				h.Storage.Delete(filename)
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save music files to database"})
			return
		}
	}

	if len(uploadedFiles) == 0 && len(errors) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "All files failed to upload", "errors": errors})
		return
	}

	c.JSON(http.StatusOK, UploadMusicResponse{
		Files:  uploadedFiles,
		Errors: errors,
	})
}

// DeleteMusic handles DELETE /music/:musicId - Delete a music file
func (h *MusicHandler) DeleteMusic(c *gin.Context) {
	musicIDStr := c.Param("musicId")

	musicID, err := primitive.ObjectIDFromHex(musicIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid music file ID"})
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

	deletedFile, err := h.UserRepo.DeleteMusicFile(userID, musicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Music file not found"})
		return
	}

	if deletedFile.FileURL != "" {
		filename := filepath.Base(deletedFile.FileURL)
		h.Storage.Delete(filename)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Music file deleted successfully"})
}

// GetMusicFile handles GET /music-files/:filename - Serve audio file with range support
func (h *MusicHandler) GetMusicFile(c *gin.Context) {
	filename := c.Param("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename is required"})
		return
	}

	filename = filepath.Base(filename)

	// Use c.File() for proper HTTP Range support needed for audio seeking
	filePath := filepath.Join("./music-files", filename)
	c.File(filePath)
}

// --- User-level endpoints (music folders) ---

// CreateMusicFolder handles POST /music/folders
func (h *MusicHandler) CreateMusicFolder(c *gin.Context) {
	var req CreateMusicFolderRequest
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

	folder := models.MusicFolder{Name: req.Name}
	if req.ParentID != nil && *req.ParentID != "" {
		oid, err := primitive.ObjectIDFromHex(*req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent folder ID"})
			return
		}
		folder.ParentID = &oid
	}

	created, err := h.UserRepo.AddMusicFolder(userID, folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	c.JSON(http.StatusCreated, created)
}

// RenameMusicFolder handles PUT /music/folders/:folderId
func (h *MusicHandler) RenameMusicFolder(c *gin.Context) {
	folderIDStr := c.Param("folderId")
	folderID, err := primitive.ObjectIDFromHex(folderIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
		return
	}

	var req RenameMusicFolderRequest
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

	if err := h.UserRepo.UpdateMusicFolder(userID, folderID, req.Name); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder renamed"})
}

// DeleteMusicFolder handles DELETE /music/folders/:folderId
func (h *MusicHandler) DeleteMusicFolder(c *gin.Context) {
	folderIDStr := c.Param("folderId")
	folderID, err := primitive.ObjectIDFromHex(folderIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
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

	deleteContents := c.Query("deleteContents") == "true"

	if deleteContents {
		if err := h.deleteMusicFolderRecursive(userID, folderID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder contents"})
			return
		}
	} else {
		if err := h.UserRepo.DeleteMusicFolder(userID, folderID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted"})
}

// deleteMusicFolderRecursive recursively deletes a music folder and all its contents
func (h *MusicHandler) deleteMusicFolderRecursive(userID, folderID primitive.ObjectID) error {
	// Delete all music files in this folder (and clean up storage)
	deletedFiles, err := h.UserRepo.DeleteMusicFilesInFolder(userID, folderID)
	if err != nil {
		return err
	}
	for _, f := range deletedFiles {
		if f.FileURL != "" {
			h.Storage.Delete(filepath.Base(f.FileURL))
		}
	}

	// Recurse into subfolders
	subfolders, err := h.UserRepo.GetMusicSubfolders(userID, folderID)
	if err != nil {
		return err
	}
	for _, sub := range subfolders {
		if err := h.deleteMusicFolderRecursive(userID, sub.ID); err != nil {
			return err
		}
	}

	// Delete the folder itself
	return h.UserRepo.DeleteMusicFolder(userID, folderID)
}

// MoveMusicFile handles PUT /music/:musicId/move
func (h *MusicHandler) MoveMusicFile(c *gin.Context) {
	musicIDStr := c.Param("musicId")
	musicID, err := primitive.ObjectIDFromHex(musicIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid music file ID"})
		return
	}

	var req MoveMusicFileRequest
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

	var folderID *primitive.ObjectID
	if req.FolderID != nil && *req.FolderID != "" {
		oid, err := primitive.ObjectIDFromHex(*req.FolderID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}
		folderID = &oid
	}

	if err := h.UserRepo.MoveMusicFile(userID, musicID, folderID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Music file not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Music file moved"})
}

// --- User-level endpoints (playlists) ---

// CreatePlaylist handles POST /playlists - Create a new playlist
func (h *MusicHandler) CreatePlaylist(c *gin.Context) {
	var req CreatePlaylistRequest
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

	tracks := make([]primitive.ObjectID, 0, len(req.Tracks))
	for _, t := range req.Tracks {
		oid, err := primitive.ObjectIDFromHex(t)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid track ID: " + t})
			return
		}
		tracks = append(tracks, oid)
	}

	playlist := models.Playlist{
		Name:   req.Name,
		Tracks: tracks,
	}

	created, err := h.UserRepo.AddPlaylist(userID, playlist)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create playlist"})
		return
	}

	c.JSON(http.StatusCreated, created)
}

// UpdatePlaylist handles PUT /playlists/:playlistId - Update a playlist
func (h *MusicHandler) UpdatePlaylist(c *gin.Context) {
	playlistIDStr := c.Param("playlistId")

	playlistID, err := primitive.ObjectIDFromHex(playlistIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid playlist ID"})
		return
	}

	var req UpdatePlaylistRequest
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

	tracks := make([]primitive.ObjectID, 0, len(req.Tracks))
	for _, t := range req.Tracks {
		oid, err := primitive.ObjectIDFromHex(t)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid track ID: " + t})
			return
		}
		tracks = append(tracks, oid)
	}

	if err := h.UserRepo.UpdatePlaylist(userID, playlistID, req.Name, tracks); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Playlist not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Playlist updated successfully"})
}

// DeletePlaylist handles DELETE /playlists/:playlistId - Delete a playlist
func (h *MusicHandler) DeletePlaylist(c *gin.Context) {
	playlistIDStr := c.Param("playlistId")

	playlistID, err := primitive.ObjectIDFromHex(playlistIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid playlist ID"})
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

	if err := h.UserRepo.DeletePlaylist(userID, playlistID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Playlist not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Playlist deleted successfully"})
}

// ReorderPlaylists handles PUT /playlists/reorder - Reorder playlists
func (h *MusicHandler) ReorderPlaylists(c *gin.Context) {
	var req ReorderPlaylistsRequest
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

	if err := h.UserRepo.ReorderPlaylists(userID, req.PlaylistIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reorder playlists"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Playlists reordered successfully"})
}

// RenameMusicFileRequest is the request body for renaming a music file
type RenameMusicFileRequest struct {
	Name string `json:"name" binding:"required"`
}

// RenameMusicFile handles PUT /music/:musicId/rename - Rename a music file
func (h *MusicHandler) RenameMusicFile(c *gin.Context) {
	musicIDStr := c.Param("musicId")
	musicID, err := primitive.ObjectIDFromHex(musicIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid music file ID"})
		return
	}

	var req RenameMusicFileRequest
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

	if err := h.UserRepo.RenameMusicFile(userID, musicID, req.Name); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Music file not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Music file renamed successfully"})
}

// --- Game-level endpoints (playback, GM-only) ---

// PlayTrack handles POST /games/:id/music/play - Broadcast MUSIC_PLAY
func (h *MusicHandler) PlayTrack(c *gin.Context) {
	gameID := c.Param("id")

	var req PlayTrackRequest
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

	payload := map[string]interface{}{
		"trackUrl":   req.TrackURL,
		"trackName":  req.TrackName,
		"position":   req.Position,
		"playlistId": req.PlaylistId,
		"trackIndex": req.TrackIndex,
	}

	if err := h.GameService.BroadcastMusicCommand(gameID, userID, websocket.EventMusicPlay, payload); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Playing track"})
}

// PauseTrack handles POST /games/:id/music/pause - Broadcast MUSIC_PAUSE
func (h *MusicHandler) PauseTrack(c *gin.Context) {
	gameID := c.Param("id")

	var req PauseTrackRequest
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

	payload := map[string]interface{}{
		"position": req.Position,
	}

	if err := h.GameService.BroadcastMusicCommand(gameID, userID, websocket.EventMusicPause, payload); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Track paused"})
}

// StopTrack handles POST /games/:id/music/stop - Broadcast MUSIC_STOP
func (h *MusicHandler) StopTrack(c *gin.Context) {
	gameID := c.Param("id")

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.BroadcastMusicCommand(gameID, userID, websocket.EventMusicStop, map[string]interface{}{}); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Track stopped"})
}

// SetVolume handles POST /games/:id/music/volume - Broadcast MUSIC_VOLUME
func (h *MusicHandler) SetVolume(c *gin.Context) {
	gameID := c.Param("id")

	var req SetVolumeRequest
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

	// Clamp volume to 0.0 - 1.0
	volume := req.Volume
	if volume < 0 {
		volume = 0
	}
	if volume > 1 {
		volume = 1
	}

	payload := map[string]interface{}{
		"volume": volume,
	}

	if err := h.GameService.BroadcastMusicCommand(gameID, userID, websocket.EventMusicVolume, payload); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Volume updated"})
}
