package http

import (
	"battle-helper/internal/service"
	"net/http"

	"github.com/gin-gonic/gin"
)

type MinigameHandler struct {
	YahtzeeService   *service.YahtzeeService
	DicePokerService *service.DicePokerService
}

type minigamePlayerInput struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	IsNPC    bool   `json:"isNpc"`
}

type startMinigameRequest struct {
	GameType  string                `json:"gameType" binding:"required"`
	Players   []minigamePlayerInput `json:"players" binding:"required"`
	MaxRounds int                   `json:"maxRounds"`
}

type setHeldMinigameRequest struct {
	Held [5]bool `json:"held" binding:"required"`
}

type scoreCategoryMinigameRequest struct {
	Category string `json:"category" binding:"required"`
}

func (h *MinigameHandler) Start(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req startMinigameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch req.GameType {
	case "yahtzee":
		yahtzeePlayers := make([]service.YahtzeePlayer, len(req.Players))
		for i, p := range req.Players {
			yahtzeePlayers[i] = service.YahtzeePlayer{UserID: p.UserID, Username: p.Username, IsNPC: p.IsNPC}
		}
		if err := h.YahtzeeService.StartGame(gameID, userID, yahtzeePlayers, req.MaxRounds); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	case "dicepoker":
		dicePokerPlayers := make([]service.MinigamePlayer, len(req.Players))
		for i, p := range req.Players {
			dicePokerPlayers[i] = service.MinigamePlayer{UserID: p.UserID, Username: p.Username, IsNPC: p.IsNPC}
		}
		if err := h.DicePokerService.StartGame(gameID, userID, dicePokerPlayers, req.MaxRounds); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown game type: " + req.GameType})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Minigame started"})
}

func (h *MinigameHandler) End(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if h.YahtzeeService.HasGame(gameID) {
		if err := h.YahtzeeService.EndGame(gameID, userID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else if h.DicePokerService.HasGame(gameID) {
		if err := h.DicePokerService.EndGame(gameID, userID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Minigame ended"})
}

func (h *MinigameHandler) GetState(c *gin.Context) {
	gameID := c.Param("id")

	if h.YahtzeeService.HasGame(gameID) {
		state, err := h.YahtzeeService.GetGame(gameID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
			return
		}
		c.JSON(http.StatusOK, state)
		return
	}

	if h.DicePokerService.HasGame(gameID) {
		userIDHex := ""
		if uid, err := getUserIDFromContext(c); err == nil {
			userIDHex = uid.Hex()
		}
		state, err := h.DicePokerService.GetGame(gameID, userIDHex)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
			return
		}
		c.JSON(http.StatusOK, state)
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
}

func (h *MinigameHandler) Roll(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if h.YahtzeeService.HasGame(gameID) {
		if err := h.YahtzeeService.Roll(gameID, userID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Rolled"})
		return
	}

	if h.DicePokerService.HasGame(gameID) {
		result, err := h.DicePokerService.Roll(gameID, userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
}

func (h *MinigameHandler) SetHeld(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req setHeldMinigameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.YahtzeeService.HasGame(gameID) {
		if err := h.YahtzeeService.SetHeld(gameID, userID, req.Held); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else if h.DicePokerService.HasGame(gameID) {
		if err := h.DicePokerService.SetHeld(gameID, userID, req.Held); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Held updated"})
}

func (h *MinigameHandler) Score(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req scoreCategoryMinigameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !h.YahtzeeService.HasGame(gameID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Score categories only apply to Yahtzee"})
		return
	}

	if err := h.YahtzeeService.Score(gameID, userID, req.Category); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scored"})
}

func (h *MinigameHandler) Confirm(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if !h.DicePokerService.HasGame(gameID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Confirm only applies to Dice Poker"})
		return
	}

	if err := h.DicePokerService.Confirm(gameID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Hand confirmed"})
}

func (h *MinigameHandler) NextRound(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if !h.DicePokerService.HasGame(gameID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "NextRound only applies to Dice Poker"})
		return
	}

	if err := h.DicePokerService.NextRound(gameID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Next round started"})
}
