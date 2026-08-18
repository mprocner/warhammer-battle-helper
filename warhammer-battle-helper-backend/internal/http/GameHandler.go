package http

import (
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/features"
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"battle-helper/internal/storage"
	"battle-helper/internal/systems/registry"
	"battle-helper/internal/websocket"
	"fmt"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	gorilla "github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type GameHandler struct {
	GameService     *service.GameService
	TemplateService *service.TemplateService
	Hub             *websocket.Hub
	FeatureToggles  features.FeatureToggles
	UserFiles       storage.Storage // stores game lobby images under /user-files
}

var upgrader = gorilla.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// CreateGame creates a new game
func (h *GameHandler) CreateGame(c *gin.Context) {
	var req models.CreateGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := registry.Get(req.GameSystem); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported game system"})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	username := claims["email"].(string)

	if !h.FeatureToggles.IsSystemAllowed(req.GameSystem, username) {
		c.JSON(http.StatusForbidden, gin.H{"error": "game system not available for your account"})
		return
	}

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var template *models.SystemTemplate
	if req.GameSystem == "custom" {
		if req.CustomTemplateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "customTemplateId is required for custom game system"})
			return
		}
		t, err := h.TemplateService.Get(req.CustomTemplateID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		template = t
	} else if req.CustomTemplateID != "" {
		// FEATURE-102: the GM picked a named token-display variant of this hardcoded
		// system. Attach it so the game carries Settings.TokenDisplay; the character
		// sheet still comes from the Go plugin (req.GameSystem).
		t, err := h.TemplateService.Get(req.CustomTemplateID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		if t.BaseSystem != req.GameSystem {
			c.JSON(http.StatusBadRequest, gin.H{"error": "template does not match selected system"})
			return
		}
		if !t.IsPublic && t.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to use this template"})
			return
		}
		template = t
	}

	game, err := h.GameService.CreateGame(req.Name, req.GameSystem, userID, username, template)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, game)
}

// GetGames returns games visible to the authenticated user
func (h *GameHandler) GetGames(c *gin.Context) {
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	games, err := h.GameService.GetGamesForUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, games)
}

// InvitePlayer invites a user by email to a game (GM only)
func (h *GameHandler) InvitePlayer(c *gin.Context) {
	gameID := c.Param("id")

	var req models.InvitePlayerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	gmUserID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	gameObjectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	if err := h.GameService.InvitePlayer(gameObjectID, gmUserID, req.Email); err != nil {
		switch err.Error() {
		case "only the game master can invite players":
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case "user not found":
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case "user already in game":
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Player invited successfully"})
}

// GetGame returns a specific game, filtering events based on the requesting user's visibility.
func (h *GameHandler) GetGame(c *gin.Context) {
	gameID := c.Param("id")

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	requestingUserID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	game, err := h.GameService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	h.attachTokenConfig(game)

	// Filter events based on visibility and requesting user
	filteredEvents := []models.GameEvent{}
	for _, e := range game.Events {
		switch e.Visibility {
		case "gm_only":
			if requestingUserID == game.GameMasterID {
				filteredEvents = append(filteredEvents, e)
			}
		case "gm_and_roller":
			if requestingUserID == game.GameMasterID || requestingUserID == e.RollerUserID {
				filteredEvents = append(filteredEvents, e)
			}
		case "all", "": // "all" or legacy events without visibility
			filteredEvents = append(filteredEvents, e)
		default: // targeted to a specific user id — only the roller and that user see it
			if requestingUserID == e.RollerUserID || requestingUserID.Hex() == e.Visibility {
				filteredEvents = append(filteredEvents, e)
			}
		}
	}
	game.Events = filteredEvents

	// Filter private notes: only show notes that are public or created by the requesting user
	service.FilterNotesForUser(game, requestingUserID)

	// Mask hidden HP bars on image-tokens for anyone who is not the GM.
	service.FilterSceneImageTokensForUser(game, requestingUserID)
	h.GameService.FilterSceneCharacterTokensForUser(game, requestingUserID)

	c.JSON(http.StatusOK, game)
}

// DeleteGame deletes a game (GM only)
func (h *GameHandler) DeleteGame(c *gin.Context) {
	gameID := c.Param("id")

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	imageUrl, err := h.GameService.DeleteGame(gameID, userID)
	if err != nil {
		switch err.Error() {
		case "only the game master can delete the game":
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	// Best-effort cleanup of the game's lobby image file
	h.deleteImageFile(imageUrl)

	c.JSON(http.StatusOK, gin.H{"message": "Game deleted successfully"})
}

// LeaveGame removes current user from a game
func (h *GameHandler) LeaveGame(c *gin.Context) {
	gameID := c.Param("id")

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	username := claims["email"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	err = h.GameService.LeaveGame(gameID, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Left game successfully"})
}

// KickPlayer removes a participant from the game (GM only)
func (h *GameHandler) KickPlayer(c *gin.Context) {
	gameID := c.Param("id")
	targetUserIDStr := c.Param("userId")

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	gmUserIDStr := claims["user_id"].(string)

	gmUserID, err := primitive.ObjectIDFromHex(gmUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	targetUserID, err := primitive.ObjectIDFromHex(targetUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target user ID"})
		return
	}

	if err := h.GameService.KickPlayer(gameID, gmUserID, targetUserID); err != nil {
		switch err.Error() {
		case "only the game master can kick players":
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case "cannot kick the game master":
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Player removed successfully"})
}

// RollDice rolls dice in the game context and broadcasts to all players
func (h *GameHandler) RollDice(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Sides      int    `json:"sides" binding:"required"`
		Count      int    `json:"count"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	count := req.Count
	if count <= 0 {
		count = 1
	}
	if count > 20 {
		count = 20
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	username := claims["email"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	results, sum, err := h.GameService.RollDice(gameID, req.Sides, count, userID, username, req.Visibility)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"results": results, "sum": sum, "sides": req.Sides, "count": count})
}

// RollSkill rolls a skill check in the game context and broadcasts to all players
func (h *GameHandler) RollSkill(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Skill       string `json:"skill" binding:"required"`
		Modifier    int    `json:"modifier"`
		DiceMod     int    `json:"diceMod"`
		Target      int    `json:"target"`
		CharacterID string `json:"characterId" binding:"required"`
		Visibility  string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	username := claims["email"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	result, err := h.GameService.RollSkill(gameID, req.Skill, req.Modifier, req.DiceMod, req.Target, req.CharacterID, userID, username, req.Visibility)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// RollWeapon rolls a weapon attack in the game context and broadcasts to all players
func (h *GameHandler) RollWeapon(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		WeaponName  string `json:"weaponName"`
		WeaponSkill string `json:"weaponSkill"`
		Damage      string `json:"damage"`
		Modifier    int    `json:"modifier"`
		DiceMod     int    `json:"diceMod"`
		CharacterID string `json:"characterId" binding:"required"`
		Visibility  string `json:"visibility"`
		// Custom systems (weapons_table): the attack references a player-added weapon row
		// already stored in the character's stats, identified by field key + row id.
		FieldKey    string `json:"fieldKey"`
		WeaponRowID string `json:"weaponRowId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	username := claims["email"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	result, err := h.GameService.RollWeapon(gameID, req.WeaponName, req.WeaponSkill, req.Damage, req.Modifier, req.DiceMod, req.CharacterID, userID, username, req.Visibility, req.FieldKey, req.WeaponRowID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// SendMessage sends a chat message to all game participants
func (h *GameHandler) SendMessage(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Message    string `json:"message" binding:"required"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user from JWT
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	username := claims["email"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	err = h.GameService.AddLogMessage(gameID, req.Message, "info", userID, username, req.Visibility)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Message sent"})
}

// UpdateParticipant updates avatar and signature for the requesting user in a game
func (h *GameHandler) UpdateParticipant(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Avatar            string `json:"avatar"`
		AvatarType        string `json:"avatarType"`
		AvatarCharacterId string `json:"avatarCharacterId"`
		Signature         string `json:"signature"`
		AvatarSize        string `json:"avatarSize"`
		ShowSignature     bool   `json:"showSignature"`
	}
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

	if err := h.GameService.UpdateParticipant(gameID, userID, req.Avatar, req.AvatarType, req.AvatarCharacterId, req.Signature, req.AvatarSize, req.ShowSignature); err != nil {
		switch err.Error() {
		case "user is not a participant of this game":
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case "signature must be at most 50 characters":
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Participant updated successfully"})
}

// HandleWebSocket upgrades HTTP connection to WebSocket for real-time game updates
func (h *GameHandler) HandleWebSocket(c *gin.Context) {
	gameID := c.Param("id")

	// Get user from JWT (passed as query param for WebSocket)
	tokenString := c.Query("token")
	if tokenString == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No token provided"})
		return
	}

	// Verify JWT token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return helpers.PublicKey, nil
	})

	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	claims := token.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	// Check participation BEFORE upgrading, so a rejected client gets a plain HTTP response
	// instead of a broken handshake. A valid JWT alone used to be enough to keep streaming
	// GAME_STATE to a player who had already left.
	game, err := h.GameService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}
	if !service.CanAccessGame(game, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant of this game"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upgrade to WebSocket"})
		return
	}

	// Create new client
	client := &websocket.Client{
		ID:     userID,
		GameID: gameID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		Hub:    h.Hub,
	}

	// Register client with hub
	h.Hub.Register <- client

	// Start client goroutines
	go client.WritePump()
	go client.ReadPump()

	// Send initial game state only to the connecting client, with notes filtered for them.
	//
	// Re-fetch rather than reuse the `game` fetched above for the participation check: that
	// fetch happened before the client was registered with the hub, so any broadcast landing
	// in the gap between the fetch and h.Hub.Register above would have been missed by this
	// client entirely — absent from both the snapshot and the event stream. Fetching the
	// snapshot after registration (and after the client's pumps are running) closes that gap.
	snapshotGame, err := h.GameService.GetGame(gameID)
	if err != nil {
		return
	}
	h.attachTokenConfig(snapshotGame)
	service.FilterNotesForUser(snapshotGame, userID)
	service.FilterSceneImageTokensForUser(snapshotGame, userID)
	h.GameService.FilterSceneCharacterTokensForUser(snapshotGame, userID)
	h.Hub.BroadcastToUsers(gameID, "GAME_STATE", map[string]interface{}{
		"game": snapshotGame,
	}, []string{userID.Hex()})
}

// SyncTemplate re-fetches the source template and updates the game's embedded copy.
func (h *GameHandler) SyncTemplate(c *gin.Context) {
	userID := mustUserID(c)
	tmpl, err := h.GameService.SyncTemplate(c.Param("id"), userID, h.TemplateService)
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "not authorized" {
			status = http.StatusForbidden
		} else if err.Error() == "game not found" || err.Error() == "source template not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tmpl)
}

// deleteImageFile removes a lobby-image file from user-files storage (best effort).
// imageUrl is the stored URL path, e.g. "/user-files/<name>.jpg".
func (h *GameHandler) deleteImageFile(imageUrl string) {
	if imageUrl == "" || h.UserFiles == nil {
		return
	}
	if !strings.HasPrefix(imageUrl, "/user-files/") {
		return // never touch files outside the user-files storage
	}
	_ = h.UserFiles.Delete(path.Base(imageUrl))
}

// UploadGameImage handles POST /games/:id/image — sets the game's lobby image (GM only).
// Accepts multipart form field "image" (JPEG/PNG/WebP, max 15MB), stores the file
// in user-files storage and saves its URL on the game document.
func (h *GameHandler) UploadGameImage(c *gin.Context) {
	gameID := c.Param("id")
	userID := mustUserID(c)

	if err := c.Request.ParseMultipartForm(storage.MaxMultipartMemory); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form: " + err.Error()})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No image file provided"})
		return
	}
	defer file.Close()

	ext, err := storage.ValidateFile(file, header)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	file.Seek(0, 0)

	filename := storage.GenerateFilename(ext)
	url, err := h.UserFiles.Upload(file, filename, header.Header.Get("Content-Type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload image: " + err.Error()})
		return
	}

	oldUrl, err := h.GameService.SetGameImage(gameID, userID, url)
	if err != nil {
		// The game update failed — remove the freshly uploaded file so it doesn't leak.
		h.deleteImageFile(url)
		status := http.StatusInternalServerError
		if err.Error() == "not authorized" {
			status = http.StatusForbidden
		} else if err.Error() == "game not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	// Replaced an existing image — clean up the previous file.
	if oldUrl != url {
		h.deleteImageFile(oldUrl)
	}

	c.JSON(http.StatusOK, gin.H{"imageUrl": url})
}

// DeleteGameImage handles DELETE /games/:id/image — clears the game's lobby image (GM only).
func (h *GameHandler) DeleteGameImage(c *gin.Context) {
	gameID := c.Param("id")
	userID := mustUserID(c)

	oldUrl, err := h.GameService.SetGameImage(gameID, userID, "")
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "not authorized" {
			status = http.StatusForbidden
		} else if err.Error() == "game not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	h.deleteImageFile(oldUrl)

	c.JSON(http.StatusOK, gin.H{"message": "Game image removed"})
}

// UpdateMapSettings sets the per-game map rules (snap/free placement, distance metric). GM-only.
func (h *GameHandler) UpdateMapSettings(c *gin.Context) {
	gameID := c.Param("id")
	userID := mustUserID(c)

	var req models.UpdateMapSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.GameService.UpdateMapSettings(gameID, userID, req); err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "not authorized" {
			status = http.StatusForbidden
		} else if err.Error() == "game not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Map settings updated"})
}

func (h *GameHandler) GetFeatures(c *gin.Context) {
	email := ""
	if token, exists := c.Get("jwt"); exists {
		claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
		email, _ = claims["email"].(string)
	}
	fmt.Printf("[GetFeatures] email=%q, jwt_present=%v, auth_header=%v\n",
		email, c.GetString("jwt") != "" || email != "", c.GetHeader("Authorization") != "")
	allSystems := registry.ListSystems()
	allowed := h.FeatureToggles.AllowedSystemsFor(allSystems, email)
	fmt.Printf("[GetFeatures] allSystems=%v, allowed=%v\n", allSystems, allowed)
	c.JSON(http.StatusOK, gin.H{"allowedSystems": allowed})
}

// GetTokenFields returns the bindable character-sheet fields per hardcoded system
// (FEATURE-102), used by the Token Display config UI to populate field pickers.
// Static metadata — no per-user scoping needed.
func (h *GameHandler) GetTokenFields(c *gin.Context) {
	c.JSON(http.StatusOK, registry.TokenFieldsBySystem())
}

// attachTokenConfig resolves the GM's per-user token-display config for a hardcoded
// system and embeds it into the game payload (computed, never persisted). Custom
// games carry their own full template and are left untouched. This is the read side
// of the "live singleton" model — a game is a viewer of its GM's current config.
func (h *GameHandler) attachTokenConfig(game *models.Game) {
	if game == nil || game.GameSystem == "" || game.GameSystem == "custom" {
		return
	}
	if tmpl, err := h.TemplateService.FindTokenConfig(game.GameMasterID, game.GameSystem); err == nil && tmpl != nil {
		game.CustomSystemTemplate = tmpl
	}
}

// EnsureTokenConfig returns the caller's token-display config for a hardcoded system,
// creating an empty one on first use (singleton per user+system). The in-game
// "Configure tokens" button calls this before opening the editor.
func (h *GameHandler) EnsureTokenConfig(c *gin.Context) {
	system := c.Param("system")
	if _, err := registry.Get(system); err != nil || system == "custom" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported game system"})
		return
	}
	tmpl, err := h.TemplateService.GetOrCreateTokenConfig(mustUserID(c), system)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tmpl)
}

// PublishTokenConfig broadcasts the caller's token-config change to all their games
// of the given hardcoded system, so every connected client re-fetches and updates.
// Called on close of the in-game token editor.
func (h *GameHandler) PublishTokenConfig(c *gin.Context) {
	system := c.Param("system")
	if _, err := registry.Get(system); err != nil || system == "custom" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported game system"})
		return
	}
	if err := h.GameService.BroadcastTokenConfig(mustUserID(c), system); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
