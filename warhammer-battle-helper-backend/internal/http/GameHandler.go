package http

import (
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/features"
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"battle-helper/internal/systems/registry"
	"battle-helper/internal/websocket"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	gorilla "github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type GameHandler struct {
	GameService    *service.GameService
	Hub            *websocket.Hub
	FeatureToggles features.FeatureToggles
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

	game, err := h.GameService.CreateGame(req.Name, req.GameSystem, userID, username)
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
// This route is public so JWT is optional — unauthenticated callers only see "all" events.
func (h *GameHandler) GetGame(c *gin.Context) {
	gameID := c.Param("id")

	// Extract requesting user ID from JWT if present (route is public, so JWT may be absent)
	var requestingUserID primitive.ObjectID
	hasUser := false
	if tokenRaw, exists := c.Get("jwt"); exists && tokenRaw != nil {
		if jwtToken, ok := tokenRaw.(*jwt.Token); ok {
			if claims, ok := jwtToken.Claims.(jwt.MapClaims); ok {
				if userIDStr, ok := claims["user_id"].(string); ok {
					if id, err := primitive.ObjectIDFromHex(userIDStr); err == nil {
						requestingUserID = id
						hasUser = true
					}
				}
			}
		}
	}

	game, err := h.GameService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Filter events based on visibility and requesting user
	filteredEvents := []models.GameEvent{}
	for _, e := range game.Events {
		switch e.Visibility {
		case "gm_only":
			if hasUser && requestingUserID == game.GameMasterID {
				filteredEvents = append(filteredEvents, e)
			}
		case "gm_and_roller":
			if hasUser && (requestingUserID == game.GameMasterID || requestingUserID == e.RollerUserID) {
				filteredEvents = append(filteredEvents, e)
			}
		default: // "all" or legacy events without visibility
			filteredEvents = append(filteredEvents, e)
		}
	}
	game.Events = filteredEvents

	// Filter private notes: only show notes that are public or created by the requesting user
	if hasUser {
		service.FilterNotesForUser(game, requestingUserID)
	} else {
		// No authenticated user — only show public notes
		publicNotes := make([]models.Note, 0)
		for _, n := range game.Notes {
			if !n.IsPrivate {
				publicNotes = append(publicNotes, n)
			}
		}
		game.Notes = publicNotes
	}

	c.JSON(http.StatusOK, game)
}

// JoinGame adds current user to a game
func (h *GameHandler) JoinGame(c *gin.Context) {
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

	game, err := h.GameService.JoinGame(gameID, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

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

	if err := h.GameService.DeleteGame(gameID, userID); err != nil {
		switch err.Error() {
		case "only the game master can delete the game":
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

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

	result, err := h.GameService.RollDice(gameID, req.Sides, userID, username, req.Visibility)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result, "sides": req.Sides})
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
		WeaponSkill string `json:"weaponSkill" binding:"required"`
		Damage      string `json:"damage"`
		Modifier    int    `json:"modifier"`
		DiceMod     int    `json:"diceMod"`
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

	result, err := h.GameService.RollWeapon(gameID, req.WeaponName, req.WeaponSkill, req.Damage, req.Modifier, req.DiceMod, req.CharacterID, userID, username, req.Visibility)
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
		Message string `json:"message" binding:"required"`
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

	err = h.GameService.AddLogMessage(gameID, req.Message, "info", userID, username)
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

	// Send initial game state
	game, err := h.GameService.GetGame(gameID)
	if err == nil {
		h.Hub.BroadcastToGame(gameID, "GAME_STATE", map[string]interface{}{
			"game": game,
		})
	}
}

func (h *GameHandler) GetFeatures(c *gin.Context) {
	email := ""
	if token, exists := c.Get("jwt"); exists {
		claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
		email, _ = claims["email"].(string)
	}
	fmt.Printf("[GetFeatures] email=%q, jwt_present=%v, auth_header=%q\n",
		email, c.GetString("jwt") != "" || email != "", c.GetHeader("Authorization") != "")
	allSystems := registry.ListSystems()
	allowed := h.FeatureToggles.AllowedSystemsFor(allSystems, email)
	fmt.Printf("[GetFeatures] allSystems=%v, allowed=%v\n", allSystems, allowed)
	c.JSON(http.StatusOK, gin.H{"allowedSystems": allowed})
}
