package http

import (
	"errors"
	"net/http"

	"battle-helper/internal/combat"
	"battle-helper/internal/models"
	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CombatHandler struct {
	CombatService *service.CombatService
}

// combatParams reads :id, :sceneId and the caller. On failure it has already written the response.
func combatParams(c *gin.Context) (string, primitive.ObjectID, primitive.ObjectID, bool) {
	sceneID, err := primitive.ObjectIDFromHex(c.Param("sceneId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return "", sceneID, sceneID, false
	}
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return "", sceneID, userID, false
	}
	return c.Param("id"), sceneID, userID, true
}

func writeCombatError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrCombatInvalid), errors.Is(err, combat.ErrBadOrder):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrCombatForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, combat.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrCombatNotFound), errors.Is(err, service.ErrCombatSceneNotFound), errors.Is(err, combat.ErrEntryNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		// Anything else is a server fault (database, lookup); its text stays in the server.
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
	}
}

// respond writes 204 on success. Clients do not read write responses: the WS event triggers a refetch.
func respond(c *gin.Context, err error) {
	if err != nil {
		writeCombatError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *CombatHandler) ListCombatScenes(c *gin.Context) {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	ids, err := h.CombatService.ListCombatScenes(c.Param("id"), userID)
	if err != nil {
		writeCombatError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"sceneIds": ids})
}

func (h *CombatHandler) GetCombat(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	view, err := h.CombatService.Get(gameID, sceneID, userID)
	if err != nil {
		writeCombatError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"combat": view})
}

func (h *CombatHandler) StartCombat(c *gin.Context) {
	if gameID, sceneID, userID, ok := combatParams(c); ok {
		respond(c, h.CombatService.Start(gameID, sceneID, userID))
	}
}

func (h *CombatHandler) EndCombat(c *gin.Context) {
	if gameID, sceneID, userID, ok := combatParams(c); ok {
		respond(c, h.CombatService.End(gameID, sceneID, userID))
	}
}

func (h *CombatHandler) UpdateCombat(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.UpdateCombatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.Update(gameID, sceneID, userID, req))
}

func (h *CombatHandler) AddEntries(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.AddCombatEntriesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.AddEntries(gameID, sceneID, userID, req))
}

func (h *CombatHandler) UpdateEntry(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.UpdateCombatEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.UpdateEntry(gameID, sceneID, userID, c.Param("entryId"), req))
}

func (h *CombatHandler) RemoveEntry(c *gin.Context) {
	if gameID, sceneID, userID, ok := combatParams(c); ok {
		respond(c, h.CombatService.RemoveEntry(gameID, sceneID, userID, c.Param("entryId")))
	}
}

func (h *CombatHandler) Reorder(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.ReorderCombatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.Reorder(gameID, sceneID, userID, req))
}

func (h *CombatHandler) Activate(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.CombatEntryRefRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.Activate(gameID, sceneID, userID, req))
}

func (h *CombatHandler) Next(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.NextTurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.Next(gameID, sceneID, userID, req))
}

func (h *CombatHandler) EndTurn(c *gin.Context) {
	gameID, sceneID, userID, ok := combatParams(c)
	if !ok {
		return
	}
	var req models.CombatEntryRefRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respond(c, h.CombatService.EndTurn(gameID, sceneID, userID, req))
}

func (h *CombatHandler) EndRound(c *gin.Context) {
	if gameID, sceneID, userID, ok := combatParams(c); ok {
		respond(c, h.CombatService.EndRound(gameID, sceneID, userID))
	}
}
