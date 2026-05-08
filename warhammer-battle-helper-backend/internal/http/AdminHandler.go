package http

import (
	"battle-helper/internal/repository"
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AdminHandler struct {
	AdminRepo *repository.AdminRepository
}

func (h *AdminHandler) withTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

// GET /admin/users
func (h *AdminHandler) ListUsers(c *gin.Context) {
	ctx, cancel := h.withTimeout()
	defer cancel()

	users, err := h.AdminRepo.ListUsers(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.Header("X-Total-Count", fmt.Sprint(len(users)))
	c.JSON(http.StatusOK, users)
}

// GET /admin/users/:id
func (h *AdminHandler) GetUser(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	ctx, cancel := h.withTimeout()
	defer cancel()

	user, err := h.AdminRepo.GetUserDetail(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// PATCH /admin/users/:id
func (h *AdminHandler) UpdateUser(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	var req struct {
		Active *bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Active == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "active field required"})
		return
	}
	ctx, cancel := h.withTimeout()
	defer cancel()

	if err := h.AdminRepo.SetUserActive(ctx, id, *req.Active); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id.Hex(), "active": *req.Active})
}

// DELETE /admin/users/:id
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	ctx, cancel := h.withTimeout()
	defer cancel()

	if err := h.AdminRepo.DeleteUser(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id.Hex()})
}

// GET /admin/games
func (h *AdminHandler) ListGames(c *gin.Context) {
	ctx, cancel := h.withTimeout()
	defer cancel()

	games, err := h.AdminRepo.ListGames(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.Header("X-Total-Count", fmt.Sprint(len(games)))
	c.JSON(http.StatusOK, games)
}

// GET /admin/games/:id
func (h *AdminHandler) GetGame(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}
	ctx, cancel := h.withTimeout()
	defer cancel()

	game, err := h.AdminRepo.GetGameDetail(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}
	c.JSON(http.StatusOK, game)
}

// DELETE /admin/games/:id
func (h *AdminHandler) DeleteGame(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}
	ctx, cancel := h.withTimeout()
	defer cancel()

	if err := h.AdminRepo.DeleteGame(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id.Hex()})
}

// GET /admin/stats/storage
func (h *AdminHandler) StorageStats(c *gin.Context) {
	ctx, cancel := h.withTimeout()
	defer cancel()

	stats, err := h.AdminRepo.StorageStats(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GET /admin/stats/sessions
func (h *AdminHandler) SessionStats(c *gin.Context) {
	ctx, cancel := h.withTimeout()
	defer cancel()

	stats, err := h.AdminRepo.SessionStats(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, stats)
}
