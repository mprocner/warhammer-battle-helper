package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/service"
	"errors"
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

// CreateTemplate creates a new system template owned by the caller.
func (h *TemplateHandler) CreateTemplate(c *gin.Context) {
	var req models.CreateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	t, err := h.TemplateService.Create(mustUserID(c), req)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, t)
}

// GetTemplate returns a single template the caller may use.
func (h *TemplateHandler) GetTemplate(c *gin.Context) {
	t, err := h.TemplateService.GetForUser(c.Param("id"), mustUserID(c))
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, t)
}

// UpdateTemplate saves name, sections and settings, guarded by the version the client last saw.
func (h *TemplateHandler) UpdateTemplate(c *gin.Context) {
	var req models.UpdateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.TemplateService.Update(c.Param("id"), mustUserID(c), req)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// SetTemplateVisibility switches isPublic; owner-only, kept out of the autosave body.
func (h *TemplateHandler) SetTemplateVisibility(c *gin.Context) {
	var req models.SetTemplateVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.TemplateService.SetVisibility(c.Param("id"), mustUserID(c), *req.IsPublic)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// CloneTemplate creates a private copy of a usable template for the caller.
func (h *TemplateHandler) CloneTemplate(c *gin.Context) {
	var req models.CloneTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clone, err := h.TemplateService.Clone(c.Param("id"), mustUserID(c), req.Name)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, clone)
}

// AddTemplateMember grants an account, named by email, a role. Every member endpoint answers
// with the full member list, so the client never merges a partial response into what it shows.
func (h *TemplateHandler) AddTemplateMember(c *gin.Context) {
	var req models.AddTemplateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	members, err := h.TemplateService.AddMember(c.Param("id"), mustUserID(c), req.Email, req.Role)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// SetTemplateMemberRole changes one member's role.
func (h *TemplateHandler) SetTemplateMemberRole(c *gin.Context) {
	targetID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req models.SetTemplateMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	members, err := h.TemplateService.SetMemberRole(c.Param("id"), mustUserID(c), targetID, req.Role)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// RemoveTemplateMember revokes one member's access.
func (h *TemplateHandler) RemoveTemplateMember(c *gin.Context) {
	targetID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	members, err := h.TemplateService.RemoveMember(c.Param("id"), mustUserID(c), targetID)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// LeaveTemplate removes the caller from a template's members; the client needs no own user id.
func (h *TemplateHandler) LeaveTemplate(c *gin.Context) {
	if err := h.TemplateService.Leave(c.Param("id"), mustUserID(c)); err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteTemplate deletes a template the caller may delete.
func (h *TemplateHandler) DeleteTemplate(c *gin.Context) {
	if err := h.TemplateService.Delete(c.Param("id"), mustUserID(c)); err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// writeTemplateError maps service errors onto status codes. The body's error string is the
// sentinel's stable message; the creator tells cases with the same status apart by it.
func writeTemplateError(c *gin.Context, err error) {
	var conflict *service.TemplateConflictError
	switch {
	case errors.As(err, &conflict):
		c.JSON(http.StatusConflict, gin.H{
			"error":     conflict.Error(),
			"version":   conflict.Version,
			"updatedBy": conflict.UpdatedBy,
			"updatedAt": conflict.UpdatedAt,
		})
		return
	case models.IsTemplateValidationError(err),
		errors.Is(err, service.ErrTemplateVersionRequired),
		errors.Is(err, service.ErrTemplateLastOwner),
		errors.Is(err, service.ErrTemplateInvalidRole),
		errors.Is(err, service.ErrTemplateNotShareable),
		errors.Is(err, service.ErrShareSelf):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrTemplateForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrTemplateNotFound),
		errors.Is(err, service.ErrTemplateMemberNotFound),
		errors.Is(err, service.ErrShareUserNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func mustUserID(c *gin.Context) primitive.ObjectID {
	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	id, _ := primitive.ObjectIDFromHex(claims["user_id"].(string))
	return id
}
