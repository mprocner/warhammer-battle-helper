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

// ShareTemplate grants another user, named by email, the right to use and clone the caller's
// template. It answers with the full recipient list rather than the added entry, so the client
// never has to merge a partial response into state it is already showing.
func (h *TemplateHandler) ShareTemplate(c *gin.Context) {
	var req models.ShareTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := mustUserID(c)
	shares, err := h.TemplateService.AddShare(c.Param("id"), userID, req.Email)
	if err != nil {
		writeShareError(c, err)
		return
	}
	c.JSON(http.StatusOK, shares)
}

// UnshareTemplate revokes one user's access and answers with the remaining list.
func (h *TemplateHandler) UnshareTemplate(c *gin.Context) {
	targetID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	userID := mustUserID(c)
	shares, err := h.TemplateService.RemoveShare(c.Param("id"), userID, targetID)
	if err != nil {
		writeShareError(c, err)
		return
	}
	c.JSON(http.StatusOK, shares)
}

// writeShareError maps the service's sentinel messages onto status codes. Sharing is the only
// place where "this address matches no account" is a normal, user-facing outcome, so the client
// must be able to tell it apart from a missing template — hence a distinct message rather than a
// bare 404. A template that exists but belongs to somebody else also answers 404, not 403: the
// owner id sits inside the update filter, so the two cases are indistinguishable here, and
// leaking "this template exists" to a non-owner buys nothing.
func writeShareError(c *gin.Context, err error) {
	switch err.Error() {
	case "not authorized":
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
	case "cannot share with yourself":
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot share with yourself"})
	case "user not found":
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
	default:
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	}
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
