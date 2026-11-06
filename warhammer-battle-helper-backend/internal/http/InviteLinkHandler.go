package http

import (
	"errors"
	"net/http"
	"strings"

	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
)

// Invite links (PLAYRPG-303). The GM-side routes live under /games/:id (participant middleware);
// the join route cannot — the caller is by definition not a participant yet.

// JoinInviteRequest carries the token in the body, not the URL, so it never lands in access logs.
type JoinInviteRequest struct {
	Token string `json:"token" binding:"required"`
}

// inviteLinkErrorStatus maps an invite-link service error to its HTTP status.
func inviteLinkErrorStatus(err error) int {
	switch {
	case errors.Is(err, service.ErrInviteLinkInvalid):
		return http.StatusNotFound
	case strings.HasPrefix(err.Error(), "only the game master"):
		return http.StatusForbidden
	case err.Error() == "game not found":
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func writeInviteLinkError(c *gin.Context, err error) {
	c.JSON(inviteLinkErrorStatus(err), gin.H{"error": err.Error()})
}

// GetInviteLink returns the game's invite token ("" when there is no link). GM only.
func (h *GameHandler) GetInviteLink(c *gin.Context) {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	token, err := h.GameService.GetInviteLink(c.Param("id"), userID)
	if err != nil {
		writeInviteLinkError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

// RegenerateInviteLink creates a new invite token, killing the previous link. GM only.
func (h *GameHandler) RegenerateInviteLink(c *gin.Context) {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	token, err := h.GameService.RegenerateInviteLink(c.Param("id"), userID)
	if err != nil {
		writeInviteLinkError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

// RevokeInviteLink removes the invite link. GM only.
func (h *GameHandler) RevokeInviteLink(c *gin.Context) {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	if err := h.GameService.RevokeInviteLink(c.Param("id"), userID); err != nil {
		writeInviteLinkError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": ""})
}

// JoinByInviteLink adds the caller to the game behind the token and returns its id. joined=false
// means the caller was already in the game. The response carries nothing else about the game.
func (h *GameHandler) JoinByInviteLink(c *gin.Context) {
	var req JoinInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	gameID, joined, err := h.GameService.JoinByInviteLink(req.Token, userID)
	if err != nil {
		writeInviteLinkError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"gameId": gameID, "joined": joined})
}
