package http

import (
	"net/http"

	"battle-helper/internal/repository"
	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
)

// GameParticipantMiddleware rejects callers who are neither the GM nor a participant of
// the game in the :id path parameter. Must run after JWTAuthMiddleware.
//
// Without it a JWT alone opened every /games/:id endpoint, so a player who left (or was
// kicked) kept full access to scenes, notes, handouts, rolls and minigames.
func GameParticipantMiddleware(gameRepo *repository.GameRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := getUserIDFromContext(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		game, err := gameRepo.GetByID(c.Param("id"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Game not found"})
			return
		}

		if !service.CanAccessGame(game, userID) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "You are not a participant of this game"})
			return
		}

		c.Next()
	}
}
