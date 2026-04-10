package http

import (
	"battle-helper/internal/repository"
	"battle-helper/internal/service"
	nethttp "net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type StatsHandler struct {
	StatsRepo      *repository.RollStatsRepository
	SessionService *service.OnlineSessionService
}

// GetGameStats returns the current user's roll stats for a specific game.
// GET /games/:id/roll-stats
func (h *StatsHandler) GetGameStats(c *gin.Context) {
	token := c.MustGet("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	gameID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "invalid game id"})
		return
	}

	dice, err := h.StatsRepo.GetForGame(c.Request.Context(), gameID, userID)
	if err != nil {
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": "failed to load stats"})
		return
	}

	if dice == nil {
		dice = []repository.DiceSummary{}
	}
	c.JSON(nethttp.StatusOK, gin.H{"dice": dice})
}

// GetUserStats returns the current user's lifetime roll stats across all games.
// GET /profile/roll-stats
func (h *StatsHandler) GetUserStats(c *gin.Context) {
	token := c.MustGet("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	dice, err := h.StatsRepo.GetForUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": "failed to load stats"})
		return
	}

	if dice == nil {
		dice = []repository.DiceSummary{}
	}
	c.JSON(nethttp.StatusOK, gin.H{"allTime": dice})
}

// GetUserOnlineStats returns the current user's lifetime online time stats.
// GET /profile/online-stats
func (h *StatsHandler) GetUserOnlineStats(c *gin.Context) {
	token := c.MustGet("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	stats, err := h.SessionService.GetUserStats(c.Request.Context(), userID)
	if err != nil {
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": "failed to load online stats"})
		return
	}

	c.JSON(nethttp.StatusOK, stats)
}

// GetOnlineStats returns the current user's online time stats for a specific game.
// GET /games/:id/online-stats
func (h *StatsHandler) GetOnlineStats(c *gin.Context) {
	token := c.MustGet("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)

	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	gameID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "invalid game id"})
		return
	}

	stats, err := h.SessionService.GetStats(c.Request.Context(), gameID, userID)
	if err != nil {
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": "failed to load online stats"})
		return
	}

	c.JSON(nethttp.StatusOK, stats)
}
