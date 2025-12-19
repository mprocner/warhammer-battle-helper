package http

import (
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"battle-helper/internal/websocket"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	gorilla "github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type GameHandler struct {
	GameService *service.GameService
	Hub         *websocket.Hub
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

	game, err := h.GameService.CreateGame(req.Name, userID, username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, game)
}

// GetGames returns all active games
func (h *GameHandler) GetGames(c *gin.Context) {
	games, err := h.GameService.GetAllGames()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, games)
}

// GetGame returns a specific game
func (h *GameHandler) GetGame(c *gin.Context) {
	gameID := c.Param("id")

	game, err := h.GameService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
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

// AddCharacter adds a character to the game grid
func (h *GameHandler) AddCharacter(c *gin.Context) {
	gameID := c.Param("id")

	var req models.AddCharacterRequest
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

	err = h.GameService.AddCharacterToGrid(gameID, req.CharacterID, req.PositionX, req.PositionY, req.IsEnemy, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character added successfully"})
}

// MoveCharacter updates a character's position
func (h *GameHandler) MoveCharacter(c *gin.Context) {
	gameID := c.Param("id")

	var req models.MoveCharacterRequest
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

	characterID, err := primitive.ObjectIDFromHex(req.CharacterID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid character ID"})
		return
	}

	err = h.GameService.MoveCharacter(gameID, characterID, req.PositionX, req.PositionY, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character moved successfully"})
}

// RemoveCharacter removes a character from the game grid
func (h *GameHandler) RemoveCharacter(c *gin.Context) {
	gameID := c.Param("id")
	characterID := c.Param("characterId")

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

	charObjID, err := primitive.ObjectIDFromHex(characterID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid character ID"})
		return
	}

	err = h.GameService.RemoveCharacter(gameID, charObjID, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character removed successfully"})
}

// Fight initiates combat between two characters
func (h *GameHandler) Fight(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Attacker struct {
			ID       string `json:"id" binding:"required"`
			Modifier int    `json:"modifier"`
		} `json:"attacker" binding:"required"`
		Defender struct {
			ID       string `json:"id" binding:"required"`
			Modifier int    `json:"modifier"`
		} `json:"defender" binding:"required"`
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

	result, err := h.GameService.Fight(gameID, req.Attacker.ID, req.Defender.ID, req.Attacker.Modifier, req.Defender.Modifier, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// RollDice rolls dice in the game context and broadcasts to all players
func (h *GameHandler) RollDice(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Sides             int    `json:"sides" binding:"required"`
		CharacterId       string `json:"characterId"`
		Attribute         string `json:"attribute"`
		AttributeModifier int    `json:"attributeModifier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	fmt.Printf("Request = %v", req)

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

	result, err := h.GameService.RollDice(gameID, req.Sides, userID, username, req.CharacterId, req.Attribute, req.AttributeModifier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"result": result,
		"sides":  req.Sides,
	})
}

// RollSkill rolls a skill check in the game context and broadcasts to all players
func (h *GameHandler) RollSkill(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Skill       string `json:"skill" binding:"required"`
		Modifier    int    `json:"modifier"`
		CharacterID string `json:"characterId" binding:"required"`
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

	result, err := h.GameService.RollSkill(gameID, req.Skill, req.Modifier, req.CharacterID, userID, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
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
