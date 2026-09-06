# FEATURE-183 — Live token-view broadcast to card-less players — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player who does not hold a character's card sees the token's slots, bars, states and kill-strike update the moment the GM changes them, instead of waiting for the next full game fetch.

**Architecture:** A card-less player renders a token from `GameCharacter.TokenView` — a fully-baked, server-masked DTO produced only during a full game GET. This plan adds a second delivery channel for that DTO: a new `SCENE_CHARACTER_TOKEN_VIEW_UPDATED` WebSocket event. The mask does not depend on `userID`, so it is computed **once** per placement and delivered to "everyone except the GM and the card-holders" through a new denylist broadcast primitive. Membership changes (a token appearing or disappearing) keep the existing full-refetch path untouched; only content changes take the new fast lane.

**Tech Stack:** Go 1.x + Gin + MongoDB (backend), React + Jest/RTL (frontend), custom WebSocket hub.

**Spec:** `docs/superpowers/specs/FEATURE-183.md`

## Global Constraints

- **The mask is computed once per placement, never per recipient.** `buildMaskedTokenView` takes no `userID`. A `for _, player := range players { buildMaskedTokenView(...) }` anywhere in this plan is a defect.
- **A placement with `Hidden = true` never produces an entry for card-less players.** The event itself would reveal a token they must not know exists.
- **Raw `TokenGear`, raw `Stats` and unfiltered `States` must never reach a card-less player.** Only the baked `CharacterTokenView` may.
- **Never widen an existing broadcast's audience.** `BroadcastToUsers` calls stay as they are; the new event is a second, separate message.
- Backend tests run with `go test ./...` from `warhammer-battle-helper-backend/`.
- Frontend tests run with `CI=true npm test -- --watchAll=false` from `warhammer-battle-helper-front/`. Single file: add `--testPathPattern=<name>`. **Known baseline failure: `App.test.js` (axios ESM). It is not a regression — do not try to fix it.**
- Comments in code are English (existing convention in every file this plan touches).

## File Structure

**Backend — created:**
- `internal/service/token_view_broadcast.go` — the entry builder, the exclusion list, and the two broadcast entry points. Sits next to `token_masking.go`, which it consumes.
- `internal/service/token_view_broadcast_test.go` — pure tests for the builder and the exclusion list.

**Backend — modified:**
- `internal/websocket/hub.go` — add `BroadcastExceptUsers` (denylist twin of `BroadcastToUsers`).
- `internal/websocket/hub_test.go` — cover it.
- `internal/websocket/events.go` — add `EventSceneCharacterTokenViewUpdated`.
- `internal/service/GameService.go` — add `templateService` dependency, `ResolveTokenBlueprint`, `characterTokenAvatar` (extracted from `enrichSceneCharacters`), and the masked broadcast inside `broadcastCharTokenGear`.
- `internal/service/GameService_blueprint_test.go` (created) — tests for `ResolveTokenBlueprint`.
- `internal/http/CharacterHandler.go` — `GameService` field; `broadcastCharacterUpdated` narrows its audience and fires the masked broadcast.
- `cmd/warhammer-battle-helper/main.go` — wire `templateService` into `NewGameService`, `gameService` into `CharacterHandler`.

**Frontend — created:**
- `src/utils/applyTokenViewPatch.js` — pure merge of event entries into game state.
- `src/utils/applyTokenViewPatch.test.js`

**Frontend — modified:**
- `src/websocket/events.js` — new constant.
- `src/components/GameSession.jsx` — new `case`, one line of logic.

`TokenOverlay.jsx` is deliberately untouched: it already renders `tokenView` verbatim.

---

### Task 1: Denylist broadcast primitive

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/websocket/hub.go` (append after `BroadcastToUsers`, which ends at line 263)
- Test: `warhammer-battle-helper-backend/internal/websocket/hub_test.go` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `func (h *Hub) BroadcastExceptUsers(gameID, messageType string, payload map[string]interface{}, excludeUserIDs []string)`

**Why a denylist:** the audience is "every player who does not hold this card". Expressing that with the existing allowlist `BroadcastToUsers` would mean enumerating the game's participants from the database on every `+`/`-` click. The hub already holds the connected clients in memory, so subtracting a short exclusion list from them is free.

- [ ] **Step 1: Write the failing test**

Append to `internal/websocket/hub_test.go`:

```go
func TestHub_BroadcastExceptUsers(t *testing.T) {
	h := NewHub()

	excluded := primitive.NewObjectID()
	included := primitive.NewObjectID()
	otherGame := primitive.NewObjectID()

	gmTab := &Client{ID: excluded, GameID: "g1", Send: make(chan []byte, 1)}
	playerTab := &Client{ID: included, GameID: "g1", Send: make(chan []byte, 1)}
	elsewhere := &Client{ID: otherGame, GameID: "g2", Send: make(chan []byte, 1)}

	h.Games["g1"] = map[*Client]bool{gmTab: true, playerTab: true}
	h.Games["g2"] = map[*Client]bool{elsewhere: true}

	h.BroadcastExceptUsers("g1", "SOME_EVENT", map[string]interface{}{"k": "v"}, []string{excluded.Hex()})

	if len(gmTab.Send) != 0 {
		t.Error("an excluded user must receive nothing")
	}
	if len(playerTab.Send) != 1 {
		t.Errorf("a non-excluded user in the game must receive the message, got %d", len(playerTab.Send))
	}
	if len(elsewhere.Send) != 0 {
		t.Error("a client in another game must receive nothing")
	}
}

func TestHub_BroadcastExceptUsers_EmptyExclusionReachesEveryone(t *testing.T) {
	h := NewHub()

	a := &Client{ID: primitive.NewObjectID(), GameID: "g1", Send: make(chan []byte, 1)}
	b := &Client{ID: primitive.NewObjectID(), GameID: "g1", Send: make(chan []byte, 1)}
	h.Games["g1"] = map[*Client]bool{a: true, b: true}

	h.BroadcastExceptUsers("g1", "SOME_EVENT", map[string]interface{}{}, nil)

	if len(a.Send) != 1 || len(b.Send) != 1 {
		t.Error("an empty exclusion list must reach every client in the game")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/websocket/ -run TestHub_BroadcastExceptUsers -v`
Expected: FAIL — `h.BroadcastExceptUsers undefined (type *Hub has no field or method BroadcastExceptUsers)`

- [ ] **Step 3: Write minimal implementation**

Append to `internal/websocket/hub.go`, directly after `BroadcastToUsers`:

```go
// BroadcastExceptUsers sends to every client in the game EXCEPT the listed users — the denylist twin
// of BroadcastToUsers. Use it when the audience is naturally a complement ("everyone who does NOT
// hold this character's card") and enumerating that complement would cost a database read. The hub
// already holds the connected clients, so subtracting a short exclusion list from them is free.
func (h *Hub) BroadcastExceptUsers(gameID, messageType string, payload map[string]interface{}, excludeUserIDs []string) {
	message := Message{Type: messageType, GameID: gameID, Payload: payload}
	msg, err := json.Marshal(message)
	if err != nil {
		return
	}
	excluded := make(map[string]bool, len(excludeUserIDs))
	for _, id := range excludeUserIDs {
		excluded[id] = true
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.Games[gameID] {
		if excluded[client.ID.Hex()] {
			continue
		}
		select {
		case client.Send <- msg:
		default:
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/websocket/ -v`
Expected: PASS (all tests in the package)

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/websocket/hub.go warhammer-battle-helper-backend/internal/websocket/hub_test.go
git commit -m "feat: FEATURE-183 add BroadcastExceptUsers denylist primitive to the hub"
```

---

### Task 2: Blueprint resolution inside GameService

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:22-47` (struct + constructor)
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:126`
- Test: `warhammer-battle-helper-backend/internal/service/GameService_blueprint_test.go` (create)

**Interfaces:**
- Consumes: `TemplateService.FindTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error)` (already exists, `TemplateService.go:50`).
- Produces: `func (s *GameService) ResolveTokenBlueprint(game *models.Game) *models.TokenDisplayConfig`

**Why this task exists — read before implementing.** `buildMaskedTokenView` needs the blueprint. For a hardcoded system the blueprint is **not stored on the game**: `attachTokenConfig` (`internal/http/GameHandler.go:766`) resolves the GM's per-user singleton and hangs it on `game.CustomSystemTemplate` during the HTTP read. A broadcast never goes through that code path. Without this task, every masked broadcast would build against a `nil` blueprint and **silently send empty views, wiping the overlay on every card-less client** — a failure that looks like "the slot disappeared", not like an error.

**Deviation from spec §4:** the spec suggested turning `attachTokenConfig` into a thin wrapper over the new resolver. Do not. `attachTokenConfig` assigns the whole `*models.SystemTemplate` onto `game.CustomSystemTemplate` (the read path needs the full template, not just the blueprint), whereas the broadcast needs only `*models.TokenDisplayConfig`. Leave `attachTokenConfig` untouched and add this as a second, independent resolver — the goal was giving the broadcast path its own blueprint source, and that is met. There is no import cycle: `TemplateService` depends only on `repository` (`TemplateService.go:11`), and `templateService` is constructed at `main.go:105`, before `gameService` at `main.go:126`.

- [ ] **Step 1: Write the failing test**

Create `internal/service/GameService_blueprint_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
)

// A custom game embeds its own template, so the blueprint resolves with no TemplateService at all.
func TestResolveTokenBlueprint_CustomGameUsesEmbeddedTemplate(t *testing.T) {
	want := &models.TokenDisplayConfig{Enabled: true}
	game := &models.Game{
		GameSystem: "custom",
		CustomSystemTemplate: &models.SystemTemplate{
			Settings: models.TemplateSettings{TokenDisplay: want},
		},
	}

	s := &GameService{}
	if got := s.ResolveTokenBlueprint(game); got != want {
		t.Errorf("custom game must resolve to its embedded TokenDisplay, got %#v", got)
	}
}

// A hardcoded system needs the TemplateService. Without it the resolver must return nil rather than
// panic — a nil blueprint means "render bare token", which buildMaskedTokenView already handles.
func TestResolveTokenBlueprint_HardcodedWithoutTemplateServiceIsNil(t *testing.T) {
	game := &models.Game{GameSystem: "warhammer4e"}

	s := &GameService{}
	if got := s.ResolveTokenBlueprint(game); got != nil {
		t.Errorf("want nil without a TemplateService, got %#v", got)
	}
}

func TestResolveTokenBlueprint_NilGame(t *testing.T) {
	s := &GameService{}
	if got := s.ResolveTokenBlueprint(nil); got != nil {
		t.Errorf("want nil for a nil game, got %#v", got)
	}
}

// A custom game with no template at all must not panic.
func TestResolveTokenBlueprint_CustomGameWithoutTemplate(t *testing.T) {
	s := &GameService{}
	if got := s.ResolveTokenBlueprint(&models.Game{GameSystem: "custom"}); got != nil {
		t.Errorf("want nil for a custom game with no template, got %#v", got)
	}
}
```

**Type names used above, verified against the codebase:** `models.SystemTemplate.Settings` is of type `models.TemplateSettings` (`internal/models/SystemTemplate.go:138`, declared at line 29), and it carries `TokenDisplay *TokenDisplayConfig` (line 36).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestResolveTokenBlueprint -v`
Expected: FAIL — `s.ResolveTokenBlueprint undefined`

- [ ] **Step 3: Add the dependency and the resolver**

In `internal/service/GameService.go`, add the field to the struct (line 22-29):

```go
type GameService struct {
	gameRepo        *repository.GameRepository
	userRepo        *repository.UserRepository
	charRepo        *repository.CharactersRepository
	hub             *websocket.Hub
	statsRepo       *repository.RollStatsRepository
	sessionRepo     *repository.OnlineSessionRepository
	templateService *TemplateService
}
```

Extend the constructor (line 31-47):

```go
func NewGameService(
	gameRepo *repository.GameRepository,
	userRepo *repository.UserRepository,
	charRepo *repository.CharactersRepository,
	hub *websocket.Hub,
	statsRepo *repository.RollStatsRepository,
	sessionRepo *repository.OnlineSessionRepository,
	templateService *TemplateService,
) *GameService {
	return &GameService{
		gameRepo:        gameRepo,
		userRepo:        userRepo,
		charRepo:        charRepo,
		hub:             hub,
		statsRepo:       statsRepo,
		sessionRepo:     sessionRepo,
		templateService: templateService,
	}
}
```

Add the resolver (put it in `GameService.go`, next to `FilterSceneCharacterTokensForUser`):

```go
// ResolveTokenBlueprint returns the token-display blueprint a masked token view must be built
// against, without going through the HTTP read pipeline. A custom game embeds its own template; a
// hardcoded system resolves the GM's live per-user singleton — the same source attachTokenConfig
// (internal/http/GameHandler.go) uses on the read side. nil means "no blueprint": tokens render bare.
//
// The broadcast path needs its own resolver because attachTokenConfig lives in package http and only
// runs inside a request. Building a mask against a nil blueprint does not error — it produces an
// empty view, which would silently wipe the overlay on every card-less client.
func (s *GameService) ResolveTokenBlueprint(game *models.Game) *models.TokenDisplayConfig {
	if game == nil {
		return nil
	}
	if game.GameSystem != "" && game.GameSystem != "custom" {
		if s.templateService == nil {
			return nil
		}
		tmpl, err := s.templateService.FindTokenConfig(game.GameMasterID, game.GameSystem)
		if err != nil || tmpl == nil {
			return nil
		}
		return tmpl.Settings.TokenDisplay
	}
	if game.CustomSystemTemplate != nil {
		return game.CustomSystemTemplate.Settings.TokenDisplay
	}
	return nil
}
```

Update the single call site, `cmd/warhammer-battle-helper/main.go:126`:

```go
	gameService := service.NewGameService(gameRepo, userRepo, charRepo, hub, statsRepo, sessionRepo, templateService)
```

- [ ] **Step 4: Run tests and build**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/service/ -run TestResolveTokenBlueprint -v`
Expected: build succeeds, all four tests PASS

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/service/GameService_blueprint_test.go warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat: FEATURE-183 resolve the token blueprint inside GameService"
```

---

### Task 3: Pure entry builder and exclusion list

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/token_view_broadcast.go`
- Create: `warhammer-battle-helper-backend/internal/service/token_view_broadcast_test.go`
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:156-176` (extract the avatar fallback)

**Interfaces:**
- Consumes: `buildMaskedTokenView(blueprint *models.TokenDisplayConfig, gear *models.CharacterTokenGear, stats bson.Raw, states []models.CharacterState) *models.CharacterTokenView` (`token_masking.go:92`), `statByPath(root bson.M, path string) interface{}` (`token_masking.go:19`).
- Produces:
  - `type TokenViewEntry struct { SceneID, PlacementID, Name, Avatar string; Killed bool; TokenView *models.CharacterTokenView }`
  - `func buildTokenViewEntries(game *models.Game, ch *models.Character, blueprint *models.TokenDisplayConfig, onlyPlacement *primitive.ObjectID) []TokenViewEntry`
  - `func tokenViewExclusions(game *models.Game, ch *models.Character) []string`
  - `func characterTokenAvatar(ch *models.Character) string`

**Why the entry carries more than `tokenView`:** a card-less player never receives the `Character` document. `Name`, `Avatar` and `Killed` reach them **only** baked into the placement, by the enrichment loop in `enrichSceneCharacters` (`GameService.go:156-176`) — which runs only during a full GET. Without them in this payload, `PATCH .../killed` would stay invisible to card-less players even after this feature ships. The entry is exactly that loop plus the mask.

- [ ] **Step 1: Write the failing test**

Create `internal/service/token_view_broadcast_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// oneVisibleSlotBlueprint: position 0 is a visible field bound to wounds.current; the rest are empty.
func oneVisibleSlotBlueprint() *models.TokenDisplayConfig {
	slots := [8]models.TokenSlot{
		{ID: "p0", Type: "field", Field: &models.FieldBinding{Key: "wounds.current"}},
		{ID: "p1", Type: "empty"},
		{ID: "p2", Type: "empty"},
		{ID: "p3", Type: "empty"},
		{ID: "p4", Type: "empty"},
		{ID: "p5", Type: "empty"},
		{ID: "p6", Type: "empty"},
		{ID: "p7", Type: "empty"},
	}
	return &models.TokenDisplayConfig{Enabled: true, Slots: slots}
}

func testCharacter(t *testing.T) *models.Character {
	t.Helper()
	return &models.Character{
		ID:     primitive.NewObjectID(),
		Name:   "Goblin",
		Avatar: "/goblin.png",
		Stats:  statsRaw(t, bson.M{"wounds": bson.M{"current": 5, "max": 9}}),
	}
}

// The character path fans out across scenes: one entry per placement, each masked against ITS OWN
// gear. Two placements of one card must not share a view.
func TestBuildTokenViewEntries_PerPlacementGear(t *testing.T) {
	ch := testCharacter(t)
	sceneA, sceneB := primitive.NewObjectID(), primitive.NewObjectID()
	placeA, placeB := primitive.NewObjectID(), primitive.NewObjectID()

	game := &models.Game{Scenes: []models.Scene{
		{ID: sceneA, Characters: []models.GameCharacter{
			{ID: placeA, CharacterID: ch.ID},
		}},
		{ID: sceneB, Characters: []models.GameCharacter{
			{ID: placeB, CharacterID: ch.ID, TokenGear: &models.CharacterTokenGear{
				SlotOverrides: map[string]models.SlotOverride{"p0": {Hidden: boolp(true)}},
			}},
		}},
	}}

	entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil)

	if len(entries) != 2 {
		t.Fatalf("want 2 entries (one per placement), got %d", len(entries))
	}
	if entries[0].SceneID != sceneA.Hex() || entries[0].PlacementID != placeA.Hex() {
		t.Errorf("first entry must address scene A / placement A")
	}
	if entries[0].TokenView.Slots[0] == nil {
		t.Error("placement A has no override: position 0 must be visible")
	}
	if entries[1].TokenView.Slots[0] != nil {
		t.Error("placement B hides position 0 on its own gear: it must not appear in that view")
	}
}

// A hidden placement is dropped entirely: sending it would reveal a token the card-less viewer must
// not know exists.
func TestBuildTokenViewEntries_HiddenPlacementDropped(t *testing.T) {
	ch := testCharacter(t)
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: primitive.NewObjectID(), CharacterID: ch.ID, Hidden: true},
		}},
	}}

	if entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil); len(entries) != 0 {
		t.Fatalf("a hidden placement must produce no entry, got %d", len(entries))
	}
}

// The gear path narrows to a single placement.
func TestBuildTokenViewEntries_OnlyPlacementNarrows(t *testing.T) {
	ch := testCharacter(t)
	wanted := primitive.NewObjectID()
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: wanted, CharacterID: ch.ID},
			{ID: primitive.NewObjectID(), CharacterID: ch.ID},
		}},
	}}

	entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), &wanted)

	if len(entries) != 1 || entries[0].PlacementID != wanted.Hex() {
		t.Fatalf("want exactly the requested placement, got %#v", entries)
	}
}

// Placements of OTHER characters are never touched.
func TestBuildTokenViewEntries_IgnoresOtherCharacters(t *testing.T) {
	ch := testCharacter(t)
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: primitive.NewObjectID(), CharacterID: primitive.NewObjectID()},
		}},
	}}

	if entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil); len(entries) != 0 {
		t.Fatalf("another character's placement must produce no entry, got %d", len(entries))
	}
}

// Name, avatar and killed ride along: a card-less client learns them only through the placement.
func TestBuildTokenViewEntries_CarriesCharacterDerivedPlacementFields(t *testing.T) {
	ch := testCharacter(t)
	ch.Killed = true
	game := &models.Game{Scenes: []models.Scene{
		{ID: primitive.NewObjectID(), Characters: []models.GameCharacter{
			{ID: primitive.NewObjectID(), CharacterID: ch.ID},
		}},
	}}

	entries := buildTokenViewEntries(game, ch, oneVisibleSlotBlueprint(), nil)

	if len(entries) != 1 {
		t.Fatalf("want 1 entry, got %d", len(entries))
	}
	if entries[0].Name != "Goblin" || entries[0].Avatar != "/goblin.png" || !entries[0].Killed {
		t.Errorf("entry must carry name/avatar/killed, got %#v", entries[0])
	}
}

// Warhammer-style characters keep the avatar inside stats; the placement avatar must fall back to it.
func TestCharacterTokenAvatar_FallsBackToStats(t *testing.T) {
	ch := &models.Character{
		Stats: statsRaw(t, bson.M{"basicInfo": bson.M{"avatar": "/from-stats.png"}}),
	}
	if got := characterTokenAvatar(ch); got != "/from-stats.png" {
		t.Errorf("want the stats avatar, got %q", got)
	}

	ch.Avatar = "/top-level.png"
	if got := characterTokenAvatar(ch); got != "/top-level.png" {
		t.Errorf("the top-level avatar must win, got %q", got)
	}
}

// The exclusion list is the GM plus every card-holder — the two classes that get the RAW gear instead.
func TestTokenViewExclusions(t *testing.T) {
	gm := primitive.NewObjectID()
	holder := primitive.NewObjectID()
	game := &models.Game{GameMasterID: gm}
	ch := &models.Character{VisibleTo: []primitive.ObjectID{holder}}

	got := tokenViewExclusions(game, ch)

	if len(got) != 2 || got[0] != gm.Hex() || got[1] != holder.Hex() {
		t.Errorf("want [GM, card-holder], got %v", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestBuildTokenViewEntries|TestCharacterTokenAvatar|TestTokenViewExclusions' -v`
Expected: FAIL — `undefined: buildTokenViewEntries`, `undefined: characterTokenAvatar`, `undefined: tokenViewExclusions`

- [ ] **Step 3: Write the implementation**

Create `internal/service/token_view_broadcast.go`:

```go
package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// token_view_broadcast.go delivers the masked CharacterTokenView LIVE to players who do not hold a
// character's card. Without it those players render a token built during their last full game GET
// and never see the GM's value changes (FEATURE-183).
//
// The whole design rests on one property of token_masking.go: buildMaskedTokenView takes no userID.
// Card-less players are ONE class receiving byte-identical payloads, so the mask is computed once
// per placement and the only per-user work is addressing — expressed by negation, see
// tokenViewExclusions.

// TokenViewEntry is one placement's payload entry. Beyond the mask it carries the three
// character-derived fields a card-less client can only learn through the placement, because it never
// receives the Character document. Mirrors the enrichment loop in enrichSceneCharacters.
type TokenViewEntry struct {
	SceneID     string                     `json:"sceneId"`
	PlacementID string                     `json:"placementId"`
	Name        string                     `json:"name"`
	Avatar      string                     `json:"avatar"`
	Killed      bool                       `json:"killed"`
	TokenView   *models.CharacterTokenView `json:"tokenView"`
}

// characterTokenAvatar is the avatar a token placement shows. Some systems (e.g. warhammer4e) keep
// it in stats.basicInfo.avatar rather than the top-level field; a card-less player only ever sees
// the placement avatar, so the fallback has to be resolved server-side or their token shows a
// placeholder. Shared by enrichSceneCharacters (read path) and the token-view broadcast.
func characterTokenAvatar(ch *models.Character) string {
	if ch == nil {
		return ""
	}
	if ch.Avatar != "" || len(ch.Stats) == 0 {
		return ch.Avatar
	}
	var statsDoc bson.M
	if bson.Unmarshal(ch.Stats, &statsDoc) != nil {
		return ""
	}
	if a, ok := statByPath(statsDoc, "basicInfo.avatar").(string); ok {
		return a
	}
	return ""
}

// buildTokenViewEntries builds the card-less payload for one character's placements. Pure: no repo,
// no hub, no clock. onlyPlacement != nil narrows to a single placement (the gear path); nil covers
// every placement of the character in every scene (the character path — PatchState only knows a
// charId, so its change radiates to all of them, each masked against its OWN gear).
//
// A placement flagged Hidden is skipped entirely: the event's mere existence would reveal a token
// the card-less viewer must not know about — the rule keepSceneCharacterForViewer enforces on read.
func buildTokenViewEntries(game *models.Game, ch *models.Character, blueprint *models.TokenDisplayConfig, onlyPlacement *primitive.ObjectID) []TokenViewEntry {
	if game == nil || ch == nil {
		return nil
	}
	avatar := characterTokenAvatar(ch)
	var out []TokenViewEntry
	for si := range game.Scenes {
		for _, gc := range game.Scenes[si].Characters {
			if gc.CharacterID != ch.ID {
				continue
			}
			if onlyPlacement != nil && gc.ID != *onlyPlacement {
				continue
			}
			if gc.Hidden {
				continue
			}
			out = append(out, TokenViewEntry{
				SceneID:     game.Scenes[si].ID.Hex(),
				PlacementID: gc.ID.Hex(),
				Name:        ch.Name,
				Avatar:      avatar,
				Killed:      ch.Killed,
				TokenView:   buildMaskedTokenView(blueprint, gc.TokenGear, ch.Stats, ch.States),
			})
		}
	}
	return out
}

// tokenViewExclusions lists the users who must NOT receive the masked view: the GM and every holder
// of this character's card. Both already get the raw TokenGear through their own broadcast; sending
// them a second, weaker copy would only invite the client to pick the wrong one. Everyone else in
// the game is card-less for this character and is exactly the masked event's audience.
func tokenViewExclusions(game *models.Game, ch *models.Character) []string {
	out := []string{game.GameMasterID.Hex()}
	for _, v := range ch.VisibleTo {
		out = append(out, v.Hex())
	}
	return out
}
```

Now replace the inline avatar fallback in `internal/service/GameService.go` (inside `enrichSceneCharacters`, the block currently at lines 156-176) so the rule lives in one place:

```go
	for si := range game.Scenes {
		for ci := range game.Scenes[si].Characters {
			gc := &game.Scenes[si].Characters[ci]
			if ch, ok := charMap[gc.CharacterID]; ok {
				gc.Name = ch.Name
				gc.Avatar = characterTokenAvatar(ch)
				gc.Killed = ch.Killed // computed-only; lets a card-less token show the dead strike
			}
		}
```

- [ ] **Step 4: Run the whole service package**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -v`
Expected: PASS — the new tests plus every existing test in the package (`token_masking_test.go`, `scene_character_visibility_test.go`, `token_image_mask_test.go`, …). The avatar extraction is behaviour-preserving, so nothing existing may break.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/token_view_broadcast.go warhammer-battle-helper-backend/internal/service/token_view_broadcast_test.go warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat: FEATURE-183 build masked token-view entries per placement"
```

---

### Task 4: Broadcast the masked view on gear changes

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/websocket/events.go:57` (add the constant)
- Modify: `warhammer-battle-helper-backend/internal/service/token_view_broadcast.go` (append the broadcast methods)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1588-1623` (`broadcastCharTokenGear`)

**Interfaces:**
- Consumes: `buildTokenViewEntries`, `tokenViewExclusions`, `(*GameService).ResolveTokenBlueprint`, `(*Hub).BroadcastExceptUsers`.
- Produces:
  - `websocket.EventSceneCharacterTokenViewUpdated = "SCENE_CHARACTER_TOKEN_VIEW_UPDATED"`
  - `func (s *GameService) broadcastTokenViewsFrom(game *models.Game, ch *models.Character, onlyPlacement *primitive.ObjectID)`
  - `func (s *GameService) BroadcastTokenViewsForCharacter(gameID string, charID primitive.ObjectID)`

**Why the 9 gear endpoints need no edits:** they all funnel through `broadcastCharTokenGear`, which already loads the game and finds the character. Hooking the masked broadcast in there costs zero extra database reads and cannot be forgotten on a tenth endpoint.

- [ ] **Step 1: Add the event constant**

In `internal/websocket/events.go`, in the "Scene characters" block (after line 57):

```go
	EventSceneCharacterTokenUpdated     = "SCENE_CHARACTER_TOKEN_UPDATED"
	EventSceneCharacterTokenViewUpdated = "SCENE_CHARACTER_TOKEN_VIEW_UPDATED"
```

- [ ] **Step 2: Append the broadcast methods**

At the end of `internal/service/token_view_broadcast.go` (add `"battle-helper/internal/websocket"` to its imports):

```go
// broadcastTokenViewsFrom sends the masked token view to every player who does not hold this
// character's card, using a game and character the caller has already loaded. The mask is computed
// ONCE (it does not depend on userID) and addressed by negation, so a +/- click costs no extra
// database read beyond what the caller already did.
//
// An empty entry list means every matching placement is hidden from card-less viewers — send nothing.
func (s *GameService) broadcastTokenViewsFrom(game *models.Game, ch *models.Character, onlyPlacement *primitive.ObjectID) {
	if game == nil || ch == nil {
		return
	}
	entries := buildTokenViewEntries(game, ch, s.ResolveTokenBlueprint(game), onlyPlacement)
	if len(entries) == 0 {
		return
	}
	s.hub.BroadcastExceptUsers(game.ID.Hex(), websocket.EventSceneCharacterTokenViewUpdated, map[string]interface{}{
		"views": entries,
	}, tokenViewExclusions(game, ch))
}

// BroadcastTokenViewsForCharacter is the character path: a change on the CARD (condition level,
// killed, a stat leaf) radiates to every placement of that character, in every scene. Called from
// CharacterHandler, which knows only a charId.
func (s *GameService) BroadcastTokenViewsForCharacter(gameID string, charID primitive.ObjectID) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return
	}
	ch, err := s.charRepo.GetByID(charID.Hex())
	if err != nil || ch == nil {
		return
	}
	s.broadcastTokenViewsFrom(game, ch, nil)
}
```

- [ ] **Step 3: Hook it into the gear path**

Replace `broadcastCharTokenGear` in `internal/service/GameService.go` (currently lines 1588-1623) with:

```go
// broadcastCharTokenGear re-reads the fresh placement gear and sends it to the GM + card-holders
// (character's VisibleTo) only — raw gear may carry hidden values, so it must not reach a card-less
// player. Those players get the masked projection instead, in a second message (FEATURE-183).
func (s *GameService) broadcastCharTokenGear(gameID string, sceneID, placementID primitive.ObjectID) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return
	}
	var gear *models.CharacterTokenGear
	var charID primitive.ObjectID
	for si := range game.Scenes {
		if game.Scenes[si].ID != sceneID {
			continue
		}
		for _, gc := range game.Scenes[si].Characters {
			if gc.ID == placementID {
				gear = gc.TokenGear
				charID = gc.CharacterID
			}
		}
	}
	var character *models.Character
	recipients := []string{game.GameMasterID.Hex()}
	if chars, err := s.charRepo.GetByGameID(gameID); err == nil {
		for i := range chars {
			if chars[i].ID == charID {
				character = &chars[i]
				for _, v := range character.VisibleTo {
					recipients = append(recipients, v.Hex())
				}
			}
		}
	}
	s.hub.BroadcastToUsers(gameID, websocket.EventSceneCharacterTokenUpdated, map[string]interface{}{
		"sceneId":     sceneID.Hex(),
		"placementId": placementID.Hex(),
		"tokenGear":   gear,
	}, recipients)

	// Everyone else in the game is card-less for this character: they get the baked, leak-free view
	// of this one placement instead of the raw gear above.
	s.broadcastTokenViewsFrom(game, character, &placementID)
}
```

- [ ] **Step 4: Build and run the full backend suite**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build succeeds, all packages PASS

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/websocket/events.go warhammer-battle-helper-backend/internal/service/token_view_broadcast.go warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat: FEATURE-183 broadcast the masked token view on gear changes"
```

---

### Task 5: Character-path broadcast and the CHARACTER_UPDATED leak

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/CharacterHandler.go:22-26` (handler struct), `:401-414` (`broadcastCharacterUpdated`)
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:213`

**Interfaces:**
- Consumes: `(*service.GameService).BroadcastTokenViewsForCharacter(gameID string, charID primitive.ObjectID)` from Task 4.
- Produces: nothing new — `broadcastCharacterUpdated` keeps its signature and return type.

**Two changes in one function, both about the same audience mistake.**

1. `broadcastCharacterUpdated` currently uses `BroadcastToGame` and ships the **full** character — raw `Stats`, every `State` — to every player in the game. `GET /games/:id/characters` filters by `VisibleTo` (`CharacterHandler.go:111`); the WebSocket does not filter at all. Narrowing the audience is safe precisely because a card-less player never had that character in `prev.characters`, so the front-end's `.map()` on this event was already a no-op for them (`GameSession.jsx:298`).
2. The same three callers — `PatchStatField` (line 469), `PatchState` (line 507), `PatchKilled` (line 527) — are exactly the endpoints that leave a card-less player's token stale. Firing the masked broadcast from inside this one function covers all three and cannot be forgotten on a fourth.

- [ ] **Step 1: Add the dependency**

`internal/http/CharacterHandler.go`, struct at line 22:

```go
type CharacterHandler struct {
	CharacterRepo *repository.CharactersRepository
	GameRepo      *repository.GameRepository
	Hub           *websocket.Hub
	// GameService supplies the masked token-view broadcast: a card-less player never receives the
	// Character document, so a card change only reaches their token through that projection.
	GameService *service.GameService
}
```

`cmd/warhammer-battle-helper/main.go:213`:

```go
	characterHandler := http.CharacterHandler{CharacterRepo: charRepo, GameRepo: gameRepo, Hub: hub, GameService: gameService}
```

- [ ] **Step 2: Rewrite the broadcast**

Replace `broadcastCharacterUpdated` (`internal/http/CharacterHandler.go:401-414`):

```go
// broadcastCharacterUpdated re-reads the character and emits EventCharacterUpdated so every viewer
// WHO HOLDS THE CARD refreshes, then refreshes the card-less viewers' tokens.
//
// Two audiences, two payloads. The event carries raw Stats and every State, so it goes only to the
// GM and the card-holders — GET /games/:id/characters filters the same way, and a card-less client
// could never use it anyway (the character is absent from its list, so its .map() is a no-op).
// Card-less players instead get the baked, leak-free token view, which is the only channel through
// which a card change (condition level, killed, a stat leaf) reaches their token before the next
// full game fetch.
func (h *CharacterHandler) broadcastCharacterUpdated(gameID, charID string) *models.Character {
	updated, err := h.CharacterRepo.GetByID(charID)
	if err != nil {
		return nil
	}
	if h.Hub != nil {
		recipients := []string{}
		if game, gErr := h.GameRepo.GetByID(gameID); gErr == nil {
			recipients = append(recipients, game.GameMasterID.Hex())
		}
		for _, v := range updated.VisibleTo {
			recipients = append(recipients, v.Hex())
		}
		h.Hub.BroadcastToUsers(gameID, websocket.EventCharacterUpdated, map[string]interface{}{
			"character": updated,
		}, recipients)
	}
	if h.GameService != nil {
		h.GameService.BroadcastTokenViewsForCharacter(gameID, updated.ID)
	}
	return updated
}
```

- [ ] **Step 3: Build and run the full backend suite**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build succeeds, all packages PASS

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/CharacterHandler.go warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "fix: FEATURE-183 refresh card-less tokens on card changes and stop leaking raw stats over WS"
```

---

### Task 6: Front-end merge function

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/applyTokenViewPatch.js`
- Create: `warhammer-battle-helper-front/src/utils/applyTokenViewPatch.test.js`

**Interfaces:**
- Consumes: the `views` array shape produced by `TokenViewEntry` in Task 3 — `{ sceneId, placementId, name, avatar, killed, tokenView }`.
- Produces: `applyTokenViewPatch(gameState, views) → gameState` (named export).

**Why a separate module:** scene components have no render tests (jsdom has no layout, `getBoundingClientRect` returns zeros), so logic that needs coverage has to live outside them. `src/utils/placedCharacters.js` + `placedCharacters.test.js` is the established pattern; `stripUserFromCharacters` is the established import shape in `GameSession.jsx`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/applyTokenViewPatch.test.js`:

```js
import { applyTokenViewPatch } from './applyTokenViewPatch';

const state = () => ({
  id: 'g1',
  scenes: [
    {
      id: 's1',
      characters: [
        { id: 'p1', characterId: 'c1', name: 'Goblin', avatar: '/a.png', killed: false, positionX: 3, tokenView: { slots: [] } },
        { id: 'p2', characterId: 'c2', name: 'Orc', avatar: '/b.png', killed: false, positionX: 7 },
      ],
    },
    {
      id: 's2',
      characters: [
        { id: 'p3', characterId: 'c1', name: 'Goblin', avatar: '/a.png', killed: false, positionX: 1 },
      ],
    },
  ],
});

const view = (over = {}) => ({
  sceneId: 's1',
  placementId: 'p1',
  name: 'Goblin',
  avatar: '/a.png',
  killed: false,
  tokenView: { slots: [{ slot: { id: 'p0', type: 'field' }, value: 5 }] },
  ...over,
});

describe('applyTokenViewPatch', () => {
  it('replaces the tokenView of the addressed placement', () => {
    const next = applyTokenViewPatch(state(), [view()]);
    expect(next.scenes[0].characters[0].tokenView.slots[0].value).toBe(5);
  });

  it('leaves every other placement untouched', () => {
    const next = applyTokenViewPatch(state(), [view()]);
    expect(next.scenes[0].characters[1]).toEqual(state().scenes[0].characters[1]);
    expect(next.scenes[1].characters[0]).toEqual(state().scenes[1].characters[0]);
  });

  it('keeps placement fields the event does not carry', () => {
    const next = applyTokenViewPatch(state(), [view()]);
    expect(next.scenes[0].characters[0].positionX).toBe(3);
    expect(next.scenes[0].characters[0].characterId).toBe('c1');
  });

  it('patches placements across several scenes in one event', () => {
    const next = applyTokenViewPatch(state(), [
      view({ killed: true }),
      view({ sceneId: 's2', placementId: 'p3', killed: true }),
    ]);
    expect(next.scenes[0].characters[0].killed).toBe(true);
    expect(next.scenes[1].characters[0].killed).toBe(true);
  });

  it('carries name, avatar and killed', () => {
    const next = applyTokenViewPatch(state(), [view({ name: 'Goblin Boss', avatar: '/boss.png', killed: true })]);
    const patched = next.scenes[0].characters[0];
    expect(patched.name).toBe('Goblin Boss');
    expect(patched.avatar).toBe('/boss.png');
    expect(patched.killed).toBe(true);
  });

  it('ignores an unknown placementId', () => {
    const before = state();
    const next = applyTokenViewPatch(before, [view({ placementId: 'nope' })]);
    expect(next.scenes).toEqual(before.scenes);
  });

  it('returns the same state for an empty or missing views list', () => {
    const before = state();
    expect(applyTokenViewPatch(before, [])).toBe(before);
    expect(applyTokenViewPatch(before)).toBe(before);
  });

  it('tolerates a null state', () => {
    expect(applyTokenViewPatch(null, [view()])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=applyTokenViewPatch`
Expected: FAIL — `Cannot find module './applyTokenViewPatch'`

- [ ] **Step 3: Write the implementation**

Create `src/utils/applyTokenViewPatch.js`:

```js
// Merges SCENE_CHARACTER_TOKEN_VIEW_UPDATED entries into game state.
//
// A player who does not hold a character's card renders that token from `tokenView` — a projection
// the server bakes and masks. It used to be produced only by a full game GET, so the GM's live value
// changes stayed invisible to those players until the next refetch (FEATURE-183).
//
// Merging in place is safe here precisely because this event cannot change WHICH tokens the viewer
// may see: that rule lives server-side in FilterSceneCharacterTokensForUser, and every change that
// touches it (hiding a token, granting a card) still goes through a full refetch instead.
export function applyTokenViewPatch(gameState, views = []) {
  if (!gameState || !views || views.length === 0) return gameState;

  const byPlacement = new Map(views.map(v => [v.placementId, v]));

  return {
    ...gameState,
    scenes: (gameState.scenes || []).map(scene => {
      let touched = false;
      const characters = (scene.characters || []).map(c => {
        const v = byPlacement.get(c.id);
        if (!v) return c;
        touched = true;
        return { ...c, name: v.name, avatar: v.avatar, killed: v.killed, tokenView: v.tokenView };
      });
      return touched ? { ...scene, characters } : scene;
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=applyTokenViewPatch`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/applyTokenViewPatch.js warhammer-battle-helper-front/src/utils/applyTokenViewPatch.test.js
git commit -m "feat: FEATURE-183 add applyTokenViewPatch merge helper"
```

---

### Task 7: Wire the event into GameSession

**Files:**
- Modify: `warhammer-battle-helper-front/src/websocket/events.js:52`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx` (import near line 27-29; new `case` after the `SCENE_CHARACTER_TOKEN_UPDATED` case, which ends at line 571)

**Interfaces:**
- Consumes: `applyTokenViewPatch` from Task 6; `WS_EVENTS.SCENE_CHARACTER_TOKEN_VIEW_UPDATED`.
- Produces: nothing.

**`TokenOverlay.jsx` is not touched.** Its `if (tokenView)` branch (line 82) already renders the projection verbatim — "no blueprint lookup, no visibility recomputation" per `models/Game.go`. The renderer is a pure function of that object, so a second delivery channel is invisible to it.

- [ ] **Step 1: Add the event constant**

`src/websocket/events.js`, in the "Scene characters" block after line 52:

```js
  SCENE_CHARACTER_TOKEN_UPDATED: 'SCENE_CHARACTER_TOKEN_UPDATED',
  SCENE_CHARACTER_TOKEN_VIEW_UPDATED: 'SCENE_CHARACTER_TOKEN_VIEW_UPDATED',
```

- [ ] **Step 2: Import the helper**

`src/components/GameSession.jsx`, next to the other `utils` imports (lines 27-29):

```js
import { applyTokenViewPatch } from '../utils/applyTokenViewPatch';
```

- [ ] **Step 3: Add the case**

In the WebSocket `switch`, immediately after the `SCENE_CHARACTER_TOKEN_UPDATED` case (which closes at line 571):

```jsx
      case WS_EVENTS.SCENE_CHARACTER_TOKEN_VIEW_UPDATED: {
        // A card-less viewer's live token refresh. The server sends the already-masked projection
        // (never raw gear), computed once for the whole card-less class. Merged in place, with no
        // refetch: nothing in this event can change WHICH tokens this viewer may see — every change
        // that could still goes through SCENE_CHARACTER_UPDATED / CHARACTER_VISIBILITY_UPDATED and
        // their full fetchGameState().
        setGameState(prev => applyTokenViewPatch(prev, message.payload.views));
        break;
      }
```

**Do NOT add `setCharacterUpdateTrigger` here**, even though every sibling case in this switch has it.
That trigger feeds a `useEffect` in `DndContext.jsx:844` which calls `fetchGameCharacters()` — and
that function fetches `GET /games/:id`, the **whole game document** (`DndContext.jsx:751`). Adding it
would make every card-less client do a full game fetch on every GM `+`/`-` click, which is exactly
the cost this event exists to remove. It would also be pointless: the map token renders from
`currentScene.characters`, i.e. the state `setGameState` just replaced, and this event's audience
never holds the character document the refetch returns.

- [ ] **Step 4: Run the front-end suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS, **except** the known baseline failure `App.test.js` (axios ESM). Any other failure is a regression from this task.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/websocket/events.js warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "feat: FEATURE-183 apply live masked token views in GameSession"
```

---

## Manual verification

Automated tests cover the units; the end-to-end path needs two browser sessions. Use the local Docker stack (see the `local-e2e-verification-recipe` note for getting a JWT).

1. GM and a player join one game. The player does **not** hold the goblin's card.
2. GM places the goblin token, visible, with a visible icon slot bound to a condition.
3. GM bumps the condition level. **The player's token must update immediately, with no page action.**
4. GM bumps a manual number slot and a manual HP bar. Same — immediate.
5. GM marks the goblin killed. The player's token gets the red strike immediately.
6. GM hides the token. It disappears for the player (existing refetch path).
7. GM re-shows it. It reappears, with the current values.
8. GM grants the player the goblin's card. The player switches to the full card + raw gear; the token keeps working.
9. In the player's browser devtools, watch the WebSocket frames during step 3: `CHARACTER_UPDATED` must **not** arrive, and `SCENE_CHARACTER_TOKEN_VIEW_UPDATED` must carry only baked display values — no raw stats subtree.

## Out of scope (recorded, not fixed)

- **Duplicate placements of one card in a scene.** `AddCharacterToScene` (`GameService.go:1491`) does a bare `$push` with no uniqueness check, while every mutation addresses placements by `characterId` — a duplicate would be unaddressable. Held together only by the front-end sidebar pool.
- **`UpdateCharacter` (rename / avatar change) does not fire the masked broadcast.** It does not route through `broadcastCharacterUpdated`, so a rename still waits for the next full fetch on card-less clients. The payload already carries `name`/`avatar`, so wiring it later is a one-line change.
- **`lobby-scenes-leak`** — `GET /games` ships full game documents to the lobby. Same family, different endpoint.
