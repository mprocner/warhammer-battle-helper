# PLAYRPG-347 Theme Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the GM's per-game theme and each user's "always default theme" opt-out, and broadcast theme changes to the game.

**Architecture:** `Game.Appearance` mirrors `MapSettings` (embedded struct, GM-only PATCH, WS broadcast, client refetches). The backend knows only theme ids (whitelist in `models`), never colours. The opt-out is one more pointer field on `UserSettings` written through the existing partial `$set` helper.

**Tech Stack:** Go 1.24, Gin, mongo-go-driver, gorilla-style hub in `internal/websocket`.

## Global Constraints

- Theme ids (exact): `default`, `scifi`, `twenties`. Empty stored value = `default`.
- Endpoint: `PATCH /games/:id/appearance`, body `{"theme": "<id>"}`. Non-GM → 403, unknown id → 400, missing game → 404.
- WS event name: `GAME_APPEARANCE_UPDATED`, payload `{"gameId": "<id>"}`.
- User setting JSON/BSON key: `ignoreGameTheme` (`*bool`, nil = never chosen = false).
- Code comments in English. No migration (absent field = default).
- Spec: PLAYRPG-270 "Model danych i API"; subtask PLAYRPG-347.

---

### Task 1: Theme whitelist + Game.Appearance model

**Files:**
- Create: `warhammer-battle-helper-backend/internal/models/appearance.go`
- Create: `warhammer-battle-helper-backend/internal/models/appearance_test.go`
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go` (Game struct, after `MapSettings`)

**Interfaces:**
- Produces: `models.Appearance{Theme string}`, `models.UpdateAppearanceRequest{Theme *string}`, `models.GameThemes []string`, `models.IsValidGameTheme(id string) bool`, field `Game.Appearance`.

- [ ] **Step 1: Write the failing test** — `appearance_test.go`

```go
package models

import "testing"

func TestIsValidGameTheme(t *testing.T) {
	cases := []struct {
		id   string
		want bool
	}{
		{"default", true},
		{"scifi", true},
		{"twenties", true},
		{"", false},        // a PATCH must name a theme; "" is only the stored "never set"
		{"Scifi", false},   // ids are exact, not case-folded
		{"cyberpunk", false},
	}
	for _, c := range cases {
		if got := IsValidGameTheme(c.id); got != c.want {
			t.Errorf("IsValidGameTheme(%q) = %v, want %v", c.id, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Run, expect compile failure**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -run TestIsValidGameTheme`
Expected: FAIL, `undefined: IsValidGameTheme`

- [ ] **Step 3: Implement** — `appearance.go`

```go
package models

// GameThemes lists the theme ids the GM may pick. The backend stores and validates ids
// only; colours, fonts and ornaments live entirely in the frontend theme registry, so a
// new theme is one id here plus its CSS block there.
var GameThemes = []string{"default", "scifi", "twenties"}

// IsValidGameTheme reports whether id names a known theme. "" is not valid in a request:
// it is only the zero value of a game that never had a theme set (read as "default").
func IsValidGameTheme(id string) bool {
	for _, t := range GameThemes {
		if t == id {
			return true
		}
	}
	return false
}

// Appearance holds the per-game look chosen by the GM in GeneralTab. Like MapSettings it is
// shared session truth: every participant sees the same theme unless they opted out in
// their own UserSettings.IgnoreGameTheme.
type Appearance struct {
	Theme string `bson:"theme" json:"theme"` // "" = default
}

// UpdateAppearanceRequest is the PATCH /games/:id/appearance body.
type UpdateAppearanceRequest struct {
	Theme *string `json:"theme" binding:"required"`
}
```

In `Game.go`, after the `MapSettings` field line add:

```go
	Appearance              Appearance  `bson:"appearance" json:"appearance"`                 // per-game theme, configured by the GM in GeneralTab
```

- [ ] **Step 4: Run** `go test ./internal/models/ -run TestIsValidGameTheme` → PASS; `go build ./...` → OK.

- [ ] **Step 5: Commit** (folded into Task 3 commit — one feature commit for the subtask).

### Task 2: Repository + service + handler + route + WS event

**Files:**
- Modify: `internal/websocket/events.go` (after `EventGameMapSettingsUpdated`)
- Modify: `internal/repository/GameRepository.go` (after `UpdateMapSettings`)
- Modify: `internal/service/GameService.go` (after `UpdateMapSettings`)
- Modify: `internal/http/GameHandler.go` (after `UpdateMapSettings`)
- Modify: `cmd/warhammer-battle-helper/main.go:278` (route)

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `GameRepository.UpdateAppearance(gameID string, theme string) error`, `GameService.UpdateAppearance(gameID string, gmID primitive.ObjectID, req models.UpdateAppearanceRequest) error`, `service.ErrInvalidGameTheme`, `websocket.EventGameAppearanceUpdated = "GAME_APPEARANCE_UPDATED"`.

- [ ] **Step 1: Event constant**

```go
	// Appearance (per-game theme chosen by the GM)
	EventGameAppearanceUpdated = "GAME_APPEARANCE_UPDATED"
```

- [ ] **Step 2: Repository**

```go
// UpdateAppearance sets the game's theme id. Validation happens in the service.
func (r *GameRepository) UpdateAppearance(gameID string, theme string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": objectID}, bson.M{"$set": bson.M{
		"appearance.theme": theme,
		"updatedAt":        time.Now(),
	}})
	return err
}
```

- [ ] **Step 3: Service**

```go
// ErrInvalidGameTheme rejects a theme id that is not in models.GameThemes.
var ErrInvalidGameTheme = errors.New("unknown theme")

// UpdateAppearance sets the per-game theme. GM-only; every client refetches on the event.
func (s *GameService) UpdateAppearance(gameID string, gmID primitive.ObjectID, req models.UpdateAppearanceRequest) error {
	if _, err := s.requireGM(gameID, gmID, "update appearance"); err != nil {
		return err
	}
	if req.Theme == nil || !models.IsValidGameTheme(*req.Theme) {
		return ErrInvalidGameTheme
	}
	if err := s.gameRepo.UpdateAppearance(gameID, *req.Theme); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventGameAppearanceUpdated, map[string]interface{}{
		"gameId": gameID,
	})
	return nil
}
```

Authorisation runs before validation so a non-GM learns nothing about valid ids.

- [ ] **Step 4: Handler** — same error mapping as `UpdateMapSettings` plus 400 for the sentinel:

```go
// UpdateAppearance sets the per-game theme. GM-only.
func (h *GameHandler) UpdateAppearance(c *gin.Context) {
	gameID := c.Param("id")
	userID := mustUserID(c)

	var req models.UpdateAppearanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.GameService.UpdateAppearance(gameID, userID, req); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, service.ErrInvalidGameTheme):
			status = http.StatusBadRequest
		case err.Error() == "not authorized":
			status = http.StatusForbidden
		case err.Error() == "game not found":
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Appearance updated"})
}
```

(Check `errors` is imported in GameHandler.go; add if not.)

- [ ] **Step 5: Route** — in `main.go` after line 278:

```go
	game.PATCH("/appearance", gameHandler.UpdateAppearance)
```

- [ ] **Step 6:** `go build ./... && go vet ./internal/...` → clean.

### Task 3: UserSettings.IgnoreGameTheme

**Files:**
- Modify: `internal/models/User.go` (`UserSettings`, `UpdateSettingsRequest`)
- Modify: `internal/repository/UserRepository.go:91-103` (`settingsUpdateFields`)
- Test: `internal/repository/settings_update_fields_test.go`

- [ ] **Step 1: Failing test** — add inside `TestSettingsUpdateFields`:

```go
	t.Run("ignoreGameTheme false is written, not dropped as a zero value", func(t *testing.T) {
		off := false
		fields := settingsUpdateFields(models.UpdateSettingsRequest{IgnoreGameTheme: &off})
		if len(fields) != 1 || fields["settings.ignoreGameTheme"] != false {
			t.Fatalf("expected settings.ignoreGameTheme=false only, got %v", fields)
		}
	})
```

- [ ] **Step 2:** `go test ./internal/repository/ -run TestSettingsUpdateFields` → FAIL (unknown field).

- [ ] **Step 3: Implement**

`UserSettings`:
```go
	// IgnoreGameTheme makes this user always see the default theme, whatever the GM picked
	// (readability / accessibility opt-out). nil = never chosen = follow the game.
	IgnoreGameTheme *bool `bson:"ignoreGameTheme,omitempty" json:"ignoreGameTheme,omitempty"`
```
`UpdateSettingsRequest`:
```go
	IgnoreGameTheme    *bool    `json:"ignoreGameTheme"`
```
`settingsUpdateFields`:
```go
	if req.IgnoreGameTheme != nil {
		fields["settings.ignoreGameTheme"] = *req.IgnoreGameTheme
	}
```

- [ ] **Step 4:** `go test ./...` → all PASS.

- [ ] **Step 5: Manual check on local docker stack** (recipe: memory `local-e2e-verification-recipe`): PATCH appearance as GM → 200, as player → 403, `{"theme":"x"}` → 400; GET game shows `appearance.theme`; PATCH `/settings {"ignoreGameTheme":true}` keeps `diceAnimation`.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend docs/superpowers/plans/2026-11-10-playrpg-347-theme-backend.md
git commit -m "feat(theme): per-game theme and player opt-out in the backend (PLAYRPG-347)"
```

Docs: backend only, nothing user-visible yet — changelog, `/help` and knowledge base land with PLAYRPG-348, which makes the feature visible.
