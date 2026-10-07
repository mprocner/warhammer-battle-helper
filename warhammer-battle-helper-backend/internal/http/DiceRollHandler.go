package http

import (
	"errors"
	"net/http"

	"battle-helper/internal/dice"
	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DiceRollHandler struct {
	DiceRollService *service.DiceRollService
}

// RollExpression rolls a dice expression typed in chat, e.g. "2d6+3 vs 10".
func (h *DiceRollHandler) RollExpression(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Expression string `json:"expression" binding:"required"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userID, err := primitive.ObjectIDFromHex(claims["user_id"].(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	actor := service.RollActor{UserID: userID, Email: claims["email"].(string)}

	payload, err := h.DiceRollService.RollExpression(gameID, req.Expression, actor, req.Visibility)
	if err != nil {
		var diceErr *dice.Error
		if errors.As(err, &diceErr) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "invalid_expression",
				"code":     diceErr.Code,
				"position": diceErr.Position,
				"params":   diceErr.Params,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, payload)
}
