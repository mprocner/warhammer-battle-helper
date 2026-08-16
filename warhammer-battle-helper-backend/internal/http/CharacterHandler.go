package http

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/systems"
	"battle-helper/internal/systems/custom"
	"battle-helper/internal/systems/registry"
	"battle-helper/internal/websocket"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CharacterHandler struct {
	CharacterRepo *repository.CharactersRepository
	GameRepo      *repository.GameRepository
	Hub           *websocket.Hub
}

// CreateCharacterRequest accepts the character name, system-specific stats as raw JSON,
// plus common flags. The frontend sends the full stats blob as an opaque JSON object.
type CreateCharacterRequest struct {
	Name       string          `json:"name" binding:"required"`
	Avatar     string          `json:"avatar"`
	IsNPC      bool            `json:"isNPC"`
	GameSystem string          `json:"gameSystem"` // inherited from game if empty
	Stats      json.RawMessage `json:"stats"`      // system-specific payload
}

type UpdateCharacterRequest struct {
	Name   string                  `json:"name"`
	Avatar string                  `json:"avatar"`
	Stats  json.RawMessage         `json:"stats"`
	States []models.CharacterState `json:"states"`
}

type CloneCharacterRequest struct {
	Count int `json:"count" binding:"required,min=1,max=20"`
}

type UpdateVisibilityRequest struct {
	VisibleTo []string `json:"visibleTo" binding:"required"`
}

// defaultStatsFor builds a blank stats document for the system, with the character's name
// written into whichever stats field that system treats as its display name (Warhammer keeps
// it in basicInfo.name; systems that store the name only on the Character get it untouched).
// Returns nil when the system cannot produce defaults — the character is then created with
// empty stats, which every plugin's decoder tolerates.
func defaultStatsFor(sys systems.GameSystem, name string) bson.Raw {
	raw, err := sys.DefaultStats()
	if err != nil {
		log.Printf("defaultStatsFor: DefaultStats failed: %v", err)
		return nil
	}
	named, err := sys.SetDisplayName(raw, name)
	if err != nil {
		log.Printf("defaultStatsFor: SetDisplayName failed: %v", err)
		return raw
	}
	return named
}

// GetGameCharacters returns characters for a game.
// GM gets all characters; player gets only characters where their userId is in VisibleTo.
func (h *CharacterHandler) GetGameCharacters(c *gin.Context) {
	gameID := c.Param("id")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	isGM := game.GameMasterID == userObjID

	characters, err := h.CharacterRepo.GetByGameID(gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var result []models.Character
	for _, char := range characters {
		// Recompute derived stats (wounds bonuses, movement) before returning
		if sys, sysErr := registry.Get(char.GameSystem); sysErr == nil {
			if derived, derivedErr := sys.ComputeDerived(char.Stats); derivedErr == nil {
				char.Stats = derived
			} else {
				log.Printf("GetGameCharacters: ComputeDerived failed for character %s (system %q): %v", char.ID.Hex(), char.GameSystem, derivedErr)
			}
		}

		if isGM {
			result = append(result, char)
		} else {
			for _, visID := range char.VisibleTo {
				if visID == userObjID {
					result = append(result, char)
					break
				}
			}
		}
	}

	if result == nil {
		result = []models.Character{}
	}

	c.JSON(http.StatusOK, result)
}

// CreateGameCharacter creates a new character scoped to the game.
func (h *CharacterHandler) CreateGameCharacter(c *gin.Context) {
	gameID := c.Param("id")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	var req CreateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gameObjID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	// Encode incoming JSON stats payload as BSON
	var statsRaw bson.Raw
	if len(req.Stats) > 0 {
		// Convert JSON bytes to a map, then marshal to BSON
		var statsMap interface{}
		if err := bsonUnmarshalJSON(req.Stats, &statsMap); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid stats: " + err.Error()})
			return
		}
		statsRaw, err = bson.Marshal(statsMap)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to encode stats"})
			return
		}
	}

	gameSystem := req.GameSystem
	if gameSystem == "" {
		gameSystem = game.GameSystem
	}

	if sys, sysErr := registry.Get(gameSystem); sysErr == nil {
		// A create without stats gets the system's own blank sheet. Owning the blank shape here
		// instead of in the client keeps each system's stat layout in one place: the client used
		// to post a Warhammer-shaped skeleton for every system, so custom characters were born
		// with `weapons` as an array where the custom plugin stores a map — every later roll then
		// died in decodeStats.
		if len(statsRaw) == 0 {
			statsRaw = defaultStatsFor(sys, req.Name)
			// FEATURE-158: a custom game's template can give attr/number fields a default value,
			// which the character starts with. Seeding here (and not in the client) keeps the whole
			// blank-sheet shape on the backend, and running before ComputeDerived below means the
			// seeded base already reaches the client with current computed.
			if customPlugin, ok := sys.(*custom.Plugin); ok && game.CustomSystemTemplate != nil {
				if seeded, seedErr := customPlugin.SeedDefaults(statsRaw, game.CustomSystemTemplate); seedErr == nil {
					statsRaw = seeded
				} else {
					log.Printf("CreateGameCharacter: SeedDefaults failed for game %s: %v", gameID, seedErr)
				}
			}
		}
		// Run derived-stat computation (e.g. wounds/movement for Warhammer)
		if derived, derivedErr := sys.ComputeDerived(statsRaw); derivedErr == nil {
			statsRaw = derived
		} else {
			log.Printf("CreateGameCharacter: ComputeDerived failed for system %q: %v", gameSystem, derivedErr)
		}
	}

	character := &models.Character{
		GameID:     gameObjID,
		GameSystem: gameSystem,
		CreatedBy:  userObjID,
		VisibleTo:  []primitive.ObjectID{userObjID},
		Name:       req.Name,
		Avatar:     req.Avatar,
		IsNPC:      req.IsNPC,
		Stats:      statsRaw,
	}

	if err := h.CharacterRepo.Create(character); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, character)
}

// UpdateGameCharacter replaces character data (owner or GM).
func (h *CharacterHandler) UpdateGameCharacter(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	isGM := game.GameMasterID == userObjID

	existingCharacter, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	if !isGM {
		canEdit := existingCharacter.CreatedBy == userObjID
		if !canEdit {
			for _, visID := range existingCharacter.VisibleTo {
				if visID == userObjID {
					canEdit = true
					break
				}
			}
		}
		if !canEdit {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
			return
		}
	}

	var req UpdateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var statsRaw bson.Raw
	if len(req.Stats) > 0 {
		var statsMap interface{}
		if err := bsonUnmarshalJSON(req.Stats, &statsMap); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid stats: " + err.Error()})
			return
		}
		statsRaw, err = bson.Marshal(statsMap)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to encode stats"})
			return
		}
	} else {
		// Keep existing stats if none provided
		statsRaw = existingCharacter.Stats
	}

	// Run derived-stat computation (e.g. wounds/movement for Warhammer)
	if sys, sysErr := registry.Get(existingCharacter.GameSystem); sysErr == nil {
		if derived, derivedErr := sys.ComputeDerived(statsRaw); derivedErr == nil {
			statsRaw = derived
		} else {
			log.Printf("UpdateGameCharacter: ComputeDerived failed for character %s (system %q): %v", charID, existingCharacter.GameSystem, derivedErr)
		}
	}

	states := req.States
	if states == nil {
		states = existingCharacter.States
	}

	updatedCharacter := models.Character{
		Name:   req.Name,
		Avatar: req.Avatar,
		Stats:  statsRaw,
		States: states,
	}

	// Preserve immutable fields
	updatedCharacter.ID = existingCharacter.ID
	updatedCharacter.GameID = existingCharacter.GameID
	updatedCharacter.GameSystem = existingCharacter.GameSystem
	updatedCharacter.CreatedBy = existingCharacter.CreatedBy
	updatedCharacter.VisibleTo = existingCharacter.VisibleTo
	updatedCharacter.CreatedAt = existingCharacter.CreatedAt

	if err := h.CharacterRepo.Update(charID, &updatedCharacter); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterUpdated, map[string]interface{}{
			"character": updatedCharacter,
		})
	}

	c.JSON(http.StatusOK, updatedCharacter)
}

// PatchStatFieldRequest edits a single stats leaf (FEATURE-102 HP bar / field steppers).
// Exactly one of Delta / Value is used: Delta for +/- steppers, Value for a typed input.
// MaxPath (optional) clamps the result between Min (default 0) and stats[MaxPath].
type PatchStatFieldRequest struct {
	Path    string   `json:"path" binding:"required"`
	Delta   *float64 `json:"delta"`
	Value   *float64 `json:"value"`
	MaxPath string   `json:"maxPath"`
	Min     *float64 `json:"min"`
}

// PatchKilledRequest toggles the dead-token strike-through.
type PatchKilledRequest struct {
	Killed bool `json:"killed"`
}

// PatchStateRequest bumps an icon-slot condition level up or down (FEATURE-102).
// Delta is typically +1 (left-click) or -1 (right-click); the state is removed at level <= 0.
type PatchStateRequest struct {
	ConditionKey string `json:"conditionKey" binding:"required"`
	Delta        int    `json:"delta"`
}

// authorizeCharacterEdit loads the game + character and enforces the same edit rule as
// UpdateGameCharacter (GM, owner, or in VisibleTo). Returns the character on success.
func (h *CharacterHandler) authorizeCharacterEdit(c *gin.Context) (*models.Character, bool) {
	gameID := c.Param("id")
	charID := c.Param("charId")
	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return nil, false
	}
	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return nil, false
	}
	ch, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return nil, false
	}
	if game.GameMasterID != userObjID {
		canEdit := ch.CreatedBy == userObjID
		for _, visID := range ch.VisibleTo {
			if visID == userObjID {
				canEdit = true
				break
			}
		}
		if !canEdit {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
			return nil, false
		}
	}
	return ch, true
}

// statNumberAtPath decodes a Character's Stats and reads a numeric leaf at a dot path.
func statNumberAtPath(stats bson.Raw, path string) (float64, bool) {
	var m bson.M
	if err := bson.Unmarshal(stats, &m); err != nil {
		return 0, false
	}
	parts := strings.Split(path, ".")
	var cur interface{} = m
	for _, p := range parts {
		asMap, ok := cur.(bson.M)
		if !ok {
			return 0, false
		}
		cur, ok = asMap[p]
		if !ok {
			return 0, false
		}
	}
	switch v := cur.(type) {
	case float64:
		return v, true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case int:
		return float64(v), true
	default:
		return 0, false
	}
}

// broadcastCharacterUpdated re-reads the character and emits EventCharacterUpdated so
// every client refetches (reuses the existing conditions-toggle sync path).
func (h *CharacterHandler) broadcastCharacterUpdated(gameID, charID string) *models.Character {
	updated, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		return nil
	}
	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterUpdated, map[string]interface{}{
			"character": updated,
		})
	}
	return updated
}

// PatchStatField applies a targeted +/- or absolute edit to one stats leaf, clamping
// against an optional max, then broadcasts (FEATURE-102). Skips ComputeDerived — the
// edited leaf (e.g. wounds.current) is independent of derived stats.
func (h *CharacterHandler) PatchStatField(c *gin.Context) {
	ch, ok := h.authorizeCharacterEdit(c)
	if !ok {
		return
	}
	var req PatchStatFieldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	charID := ch.ID.Hex()
	if req.Value != nil {
		if err := h.CharacterRepo.SetStatField(charID, req.Path, *req.Value); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else if req.Delta != nil {
		if err := h.CharacterRepo.IncStatField(charID, req.Path, *req.Delta); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "delta or value is required"})
		return
	}

	// Clamp: re-read and correct if out of [min, max]. Accepts a small race under
	// concurrent edits — fine for a tabletop HP counter (self-corrects on next read).
	fresh, err := h.CharacterRepo.GetByID(charID)
	if err == nil {
		if val, ok := statNumberAtPath(fresh.Stats, req.Path); ok {
			min := 0.0
			if req.Min != nil {
				min = *req.Min
			}
			clamped := val
			if clamped < min {
				clamped = min
			}
			if req.MaxPath != "" {
				if max, ok := statNumberAtPath(fresh.Stats, req.MaxPath); ok && clamped > max {
					clamped = max
				}
			}
			if clamped != val {
				_ = h.CharacterRepo.SetStatField(charID, req.Path, clamped)
			}
		}
	}

	updated := h.broadcastCharacterUpdated(c.Param("id"), charID)
	c.JSON(http.StatusOK, updated)
}

// PatchState bumps an icon-slot condition's level and broadcasts (FEATURE-102).
// Removes the state when the resulting level is <= 0.
func (h *CharacterHandler) PatchState(c *gin.Context) {
	ch, ok := h.authorizeCharacterEdit(c)
	if !ok {
		return
	}
	var req PatchStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	states := make([]models.CharacterState, 0, len(ch.States))
	found := false
	for _, s := range ch.States {
		if s.Name == req.ConditionKey {
			found = true
			newLevel := s.Level + req.Delta
			if newLevel > 0 {
				states = append(states, models.CharacterState{Name: s.Name, Level: newLevel})
			}
			// level <= 0 → drop it
			continue
		}
		states = append(states, s)
	}
	if !found && req.Delta > 0 {
		states = append(states, models.CharacterState{Name: req.ConditionKey, Level: req.Delta})
	}
	charID := ch.ID.Hex()
	if err := h.CharacterRepo.SetStates(charID, states); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updated := h.broadcastCharacterUpdated(c.Param("id"), charID)
	c.JSON(http.StatusOK, updated)
}

// PatchKilled toggles the dead-token strike-through and broadcasts.
func (h *CharacterHandler) PatchKilled(c *gin.Context) {
	ch, ok := h.authorizeCharacterEdit(c)
	if !ok {
		return
	}
	var req PatchKilledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	charID := ch.ID.Hex()
	if err := h.CharacterRepo.SetKilled(charID, req.Killed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updated := h.broadcastCharacterUpdated(c.Param("id"), charID)
	c.JSON(http.StatusOK, updated)
}

// DeleteGameCharacter deletes a character (owner or GM).
func (h *CharacterHandler) DeleteGameCharacter(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	isGM := game.GameMasterID == userObjID

	existingCharacter, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	if !isGM && existingCharacter.CreatedBy != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this character"})
		return
	}

	if err := h.CharacterRepo.Delete(charID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Character deleted successfully"})
}

// CloneGameCharacter clones an existing character N times (GM only).
func (h *CharacterHandler) CloneGameCharacter(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.GameMasterID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the Game Master can clone characters"})
		return
	}

	var req CloneCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	original, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	sys, _ := registry.Get(original.GameSystem)

	// Use the stats-embedded display name if available (e.g. warhammer4e stores it in basicInfo.name).
	baseName := original.Name
	if n := sys.GetDisplayName(original.Stats); n != "" {
		baseName = n
	}

	clones := make([]*models.Character, 0, req.Count)
	for i := 1; i <= req.Count; i++ {
		clone := *original
		clone.ID = primitive.NilObjectID
		clone.Name = fmt.Sprintf("%s %d", baseName, i)
		clone.CreatedBy = userObjID
		clone.VisibleTo = []primitive.ObjectID{userObjID}

		// Keep any stats-embedded name in sync with the clone's top-level Name.
		if updated, err := sys.SetDisplayName(clone.Stats, clone.Name); err == nil {
			clone.Stats = updated
		}

		// Recompute derived stats for the clone
		if derived, derivedErr := sys.ComputeDerived(clone.Stats); derivedErr == nil {
			clone.Stats = derived
		} else {
			log.Printf("CloneGameCharacter: ComputeDerived failed for source %s (system %q): %v", original.ID.Hex(), original.GameSystem, derivedErr)
		}

		if err := h.CharacterRepo.Create(&clone); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create clone"})
			return
		}
		clones = append(clones, &clone)
	}

	c.JSON(http.StatusCreated, clones)
}

// UpdateCharacterVisibility updates VisibleTo (GM only).
func (h *CharacterHandler) UpdateCharacterVisibility(c *gin.Context) {
	gameID := c.Param("id")
	charID := c.Param("charId")

	userObjID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	game, err := h.GameRepo.GetByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.GameMasterID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the Game Master can manage character visibility"})
		return
	}

	var req UpdateVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	visibleTo := make([]primitive.ObjectID, 0, len(req.VisibleTo))
	for _, idStr := range req.VisibleTo {
		objID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID in visibleTo: " + idStr})
			return
		}
		visibleTo = append(visibleTo, objID)
	}

	if err := h.CharacterRepo.UpdateVisibility(charID, visibleTo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterVisibilityUpdated, map[string]interface{}{
			"characterId": charID,
			"visibleTo":   req.VisibleTo,
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Visibility updated successfully"})
}

// bsonUnmarshalJSON converts raw JSON bytes to an interface{} for BSON encoding.
func bsonUnmarshalJSON(data []byte, v interface{}) error {
	return bson.UnmarshalExtJSON(data, true, v)
}
