package http

import (
	"battle-helper/internal/service"
	"net/http"

	"github.com/gin-gonic/gin"
)

type YahtzeeHandler struct {
	YahtzeeService *service.YahtzeeService
}

type startYahtzeeRequest struct {
	Players   []service.YahtzeePlayer `json:"players" binding:"required"`
	MaxRounds int                     `json:"maxRounds"`
}

type setHeldRequest struct {
	Held [5]bool `json:"held" binding:"required"`
}

type scoreCategoryRequest struct {
	Category string `json:"category" binding:"required"`
}

func (h *YahtzeeHandler) Start(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req startYahtzeeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.YahtzeeService.StartGame(gameID, userID, req.Players, req.MaxRounds); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Minigame started"})
}

func (h *YahtzeeHandler) End(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.YahtzeeService.EndGame(gameID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Minigame ended"})
}

func (h *YahtzeeHandler) GetState(c *gin.Context) {
	gameID := c.Param("id")

	state, err := h.YahtzeeService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active minigame"})
		return
	}

	c.JSON(http.StatusOK, state)
}

func (h *YahtzeeHandler) Roll(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.YahtzeeService.Roll(gameID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Rolled"})
}

func (h *YahtzeeHandler) SetHeld(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req setHeldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.YahtzeeService.SetHeld(gameID, userID, req.Held); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Held updated"})
}

func (h *YahtzeeHandler) Score(c *gin.Context) {
	gameID := c.Param("id")
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req scoreCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.YahtzeeService.Score(gameID, userID, req.Category); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scored"})
}
