package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type TemplateHandler struct {
	TemplateService *service.TemplateService
}

// ListTemplates returns all templates owned by the authenticated user.
func (h *TemplateHandler) ListTemplates(c *gin.Context) {
	userID := mustUserID(c)
	templates, err := h.TemplateService.ListForUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, templates)
}

// CreateTemplate creates a new system template.
func (h *TemplateHandler) CreateTemplate(c *gin.Context) {
	var req models.CreateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := mustUserID(c)
	t, err := h.TemplateService.Create(userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, t)
}

// GetTemplate returns a single template by ID.
func (h *TemplateHandler) GetTemplate(c *gin.Context) {
	t, err := h.TemplateService.Get(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return
	}
	c.JSON(http.StatusOK, t)
}

// UpdateTemplate updates name and/or fields of a template and returns the updated document.
func (h *TemplateHandler) UpdateTemplate(c *gin.Context) {
	var req models.UpdateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := mustUserID(c)
	updated, err := h.TemplateService.Update(c.Param("id"), userID, req)
	if err != nil {
		if err.Error() == "not authorized" {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// CloneTemplate creates a private copy of a visible template for the authenticated user.
func (h *TemplateHandler) CloneTemplate(c *gin.Context) {
	var req models.CloneTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := mustUserID(c)
	clone, err := h.TemplateService.Clone(c.Param("id"), userID, req.Name)
	if err != nil {
		if err.Error() == "not authorized" {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, clone)
}

// DeleteTemplate deletes a template owned by the authenticated user.
func (h *TemplateHandler) DeleteTemplate(c *gin.Context) {
	userID := mustUserID(c)
	if err := h.TemplateService.Delete(c.Param("id"), userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func mustUserID(c *gin.Context) primitive.ObjectID {
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	id, _ := primitive.ObjectIDFromHex(claims["user_id"].(string))
	return id
}
