# FEATURE-179 — Game-wide locked token slot template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A padlocked ring slot becomes a persistent game-wide rule, so every tokens-layer image — including ones added later, on any scene — starts with that slot.

**Architecture:** A new `Game.TokenSlotTemplate` (8 nullable entries, index = ring position) stores the config of each locked position. `ApplyImageTokenSlot` writes that rule and fans the config out over every scene's tokens-layer images. `AddImageToScene` and a layer promotion to `tokens` seed a fresh overlay from the template. Config stays duplicated on each token; the template is the seed, not the live source of truth.

**Tech Stack:** Go + Gin + MongoDB (backend), React + i18next (frontend, i18n strings only).

**Spec:** `docs/superpowers/specs/2026-09-03-FEATURE-179-token-slot-template-design.md`

## Global Constraints

- Ring positions are fixed at **8**. A template is length 0 or 8, never in between.
- A template entry stores **config only** — `ID`, `Level`, `Number` are per-token and are generated on seed.
- **No migration, no backward compat.** A game with no template decodes to nil and behaves exactly as today.
- **HP bars are out of scope.** `ImageTokenOverlay.HPBars` is never seeded, never templated.
- A seeded slot may carry `Hidden: true`. Every player-facing broadcast that can now carry an overlay **must** pass through `MaskImageTokenForPlayer`.
- Frontend strings go through `t('key')` and land in **both** `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- `GameService.gameRepo` is a concrete `*repository.GameRepository`, so service methods cannot be unit-tested without Mongo. Pure logic is extracted into `internal/service/token_slot_template.go` and tested there; service wiring is verified by `go build`, `go vet` and the manual pass in Task 6.
- Backend commands run from `warhammer-battle-helper-backend/`, frontend commands from `warhammer-battle-helper-front/`.

---

### Task 1: Template model and pure seed logic

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go:44-66` (the `Game` struct)
- Create: `warhammer-battle-helper-backend/internal/service/token_slot_template.go`
- Test: `warhammer-battle-helper-backend/internal/service/token_slot_template_test.go`

**Interfaces:**
- Consumes: `models.ImageTokenSlot`, `models.ImageTokenOverlay` (`internal/models/Game.go:323-364`), `MaskImageTokenForPlayer` (`internal/service/GameService.go:2448`).
- Produces:
  - `service.SeedOverlayFromTemplate(tpl []*models.ImageTokenSlot) *models.ImageTokenOverlay`
  - `service.SetTokenSlotTemplateEntry(tpl []*models.ImageTokenSlot, position int, slot *models.ImageTokenSlot) []*models.ImageTokenSlot`
  - `models.Game.TokenSlotTemplate []*models.ImageTokenSlot`

- [ ] **Step 1: Add the model field**

In `internal/models/Game.go`, inside `type Game struct` (after the `MapSettings` line, `:62`):

```go
	// TokenSlotTemplate is the game-wide locked-position rule for token ring slots: index = ring
	// position (0..7), nil = that position is not locked. Every tokens-layer image in every scene
	// seeds its slots from it. Entries carry config only — ID/Level/Number are per-token and are
	// generated on seed. Written by GameService.ApplyImageTokenSlot (the padlock).
	TokenSlotTemplate []*ImageTokenSlot `bson:"tokenSlotTemplate,omitempty" json:"tokenSlotTemplate,omitempty"`
```

- [ ] **Step 2: Write the failing tests**

Create `internal/service/token_slot_template_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
)

// No locked position means no rule, and a token under no rule must stay overlay-less — seeding an
// empty overlay would light up the ring chrome on every image the GM drops on the map.
func TestSeedOverlayFromTemplate_NilWhenNothingLocked(t *testing.T) {
	if got := SeedOverlayFromTemplate(nil); got != nil {
		t.Fatalf("nil template must seed no overlay, got %+v", got)
	}
	if got := SeedOverlayFromTemplate(make([]*models.ImageTokenSlot, 8)); got != nil {
		t.Fatalf("all-nil template must seed no overlay, got %+v", got)
	}
}

// One locked position seeds all eight slots: the rule at its index, empty everywhere else, so the
// ring angles (angle = index) stay stable.
func TestSeedOverlayFromTemplate_FillsEightSlots(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[2] = &models.ImageTokenSlot{Type: "number", NumberLabel: "Armour"}

	overlay := SeedOverlayFromTemplate(tpl)
	if overlay == nil {
		t.Fatal("a locked position must seed an overlay")
	}
	if !overlay.Enabled {
		t.Fatal("seeded overlay must be enabled")
	}
	if len(overlay.HPBars) != 0 {
		t.Fatalf("HP bars are out of scope and must not be seeded, got %+v", overlay.HPBars)
	}
	if len(overlay.Slots) != 8 {
		t.Fatalf("want 8 slots, got %d", len(overlay.Slots))
	}
	if s := overlay.Slots[2]; s.Type != "number" || s.NumberLabel != "Armour" || !s.Locked {
		t.Fatalf("locked position must carry the template config, got %+v", s)
	}
	if s := overlay.Slots[0]; s.Type != "empty" || s.Locked {
		t.Fatalf("unlocked position must be an empty unlocked slot, got %+v", s)
	}

	seen := map[string]bool{}
	for i, s := range overlay.Slots {
		if s.ID == "" {
			t.Fatalf("slot %d has no id", i)
		}
		if seen[s.ID] {
			t.Fatalf("slot %d reuses id %s", i, s.ID)
		}
		seen[s.ID] = true
	}
}

// The live value belongs to the token, never to the rule: a template entry that somehow carries one
// must not hand it to every new token.
func TestSeedOverlayFromTemplate_ZeroesLiveValues(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[1] = &models.ImageTokenSlot{ID: "template-id", Type: "icon", Icon: "shield", Level: 3, Number: 7}

	overlay := SeedOverlayFromTemplate(tpl)
	s := overlay.Slots[1]
	if s.Level != 0 || s.Number != 0 {
		t.Fatalf("live values must reset on seed, got level=%d number=%v", s.Level, s.Number)
	}
	if s.ID == "" || s.ID == "template-id" {
		t.Fatalf("seeded slot must get its own fresh id, got %q", s.ID)
	}
}

// Regression guard for the AddImageToScene leak: a seeded Hidden slot must still be blanked on its
// way to a player.
func TestSeedOverlayFromTemplate_HiddenSlotIsMaskedForPlayers(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[0] = &models.ImageTokenSlot{Type: "icon", Icon: "poison", ConditionKey: "poisoned", ConditionLabel: "Poisoned", Hidden: true}

	masked := MaskImageTokenForPlayer(SeedOverlayFromTemplate(tpl))
	s := masked.Slots[0]
	if s.Type != "empty" || s.Icon != "" || s.ConditionKey != "" || s.ConditionLabel != "" {
		t.Fatalf("hidden seeded slot must be blanked for players, got %+v", s)
	}
	if s.ID == "" {
		t.Fatal("masked slot must keep its id so ring positions do not shift")
	}
}

// Locking stores config only; unlocking clears the entry and leaves its neighbours alone.
func TestSetTokenSlotTemplateEntry(t *testing.T) {
	tpl := SetTokenSlotTemplateEntry(nil, 3, &models.ImageTokenSlot{
		ID: "token-slot-id", Type: "icon", Icon: "shield", Level: 2, Number: 5,
	})
	if len(tpl) != 8 {
		t.Fatalf("want a normalized 8-entry template, got %d", len(tpl))
	}
	e := tpl[3]
	if e == nil {
		t.Fatal("position 3 must be locked")
	}
	if e.ID != "" || e.Level != 0 || e.Number != 0 {
		t.Fatalf("template entry must carry config only, got %+v", e)
	}
	if !e.Locked || e.Icon != "shield" {
		t.Fatalf("template entry must keep the config and the locked flag, got %+v", e)
	}
	if tpl[0] != nil {
		t.Fatalf("other positions must stay unlocked, got %+v", tpl[0])
	}

	tpl = SetTokenSlotTemplateEntry(tpl, 3, nil)
	if tpl[3] != nil {
		t.Fatalf("unlocking must clear the entry, got %+v", tpl[3])
	}
	if len(tpl) != 8 {
		t.Fatalf("template must stay 8 entries after unlock, got %d", len(tpl))
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `go test ./internal/service/ -run TokenSlotTemplate -v` and `go test ./internal/service/ -run SeedOverlay -v`
Expected: FAIL — `undefined: SeedOverlayFromTemplate`, `undefined: SetTokenSlotTemplateEntry`.

- [ ] **Step 4: Write the implementation**

Create `internal/service/token_slot_template.go`:

```go
package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// token_slot_template.go holds the pure half of the game-wide padlock rule (FEATURE-179): what a
// locked ring position stores, and what a fresh tokens-layer image starts with because of it. The
// service wiring that persists and fans it out lives in GameService.

// tokenSlotTemplateSize is the fixed number of ring positions on a token overlay. The ring angle is
// derived from the index (-90 + i*45), so the slice length is part of the layout, not a capacity.
const tokenSlotTemplateSize = 8

// SetTokenSlotTemplateEntry returns the game template with one ring position locked to slot's
// config, or unlocked when slot is nil. The stored entry is config only: the id and the live
// Level/Number belong to each token and are generated when a token seeds from the template. The
// result is always normalized to tokenSlotTemplateSize entries.
func SetTokenSlotTemplateEntry(tpl []*models.ImageTokenSlot, position int, slot *models.ImageTokenSlot) []*models.ImageTokenSlot {
	out := make([]*models.ImageTokenSlot, tokenSlotTemplateSize)
	copy(out, tpl)
	if position < 0 || position >= tokenSlotTemplateSize {
		return out
	}
	if slot == nil {
		out[position] = nil
		return out
	}
	cfg := *slot
	cfg.ID = ""
	cfg.Level = 0
	cfg.Number = 0
	cfg.Locked = true
	out[position] = &cfg
	return out
}

// SeedOverlayFromTemplate returns the overlay a fresh tokens-layer image starts with: one slot per
// ring position, config copied from the game template, a fresh id and a zeroed live value. Returns
// nil when no position is locked — a token under no rule keeps no overlay at all. HP bars are never
// seeded: they have no padlock of their own.
func SeedOverlayFromTemplate(tpl []*models.ImageTokenSlot) *models.ImageTokenOverlay {
	locked := false
	for i := 0; i < len(tpl) && i < tokenSlotTemplateSize; i++ {
		if tpl[i] != nil {
			locked = true
			break
		}
	}
	if !locked {
		return nil
	}

	slots := make([]models.ImageTokenSlot, tokenSlotTemplateSize)
	for i := range slots {
		id := primitive.NewObjectID().Hex()
		if i < len(tpl) && tpl[i] != nil {
			s := *tpl[i]
			s.ID = id
			s.Level = 0
			s.Number = 0
			s.Locked = true
			slots[i] = s
			continue
		}
		slots[i] = models.ImageTokenSlot{ID: id, Type: "empty"}
	}
	return &models.ImageTokenOverlay{Enabled: true, Slots: slots}
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `go test ./internal/service/ -v -run 'TokenSlotTemplate|SeedOverlay'`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the whole backend suite**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: build clean, vet clean, all packages `ok` or `no test files`.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/Game.go \
        warhammer-battle-helper-backend/internal/service/token_slot_template.go \
        warhammer-battle-helper-backend/internal/service/token_slot_template_test.go
git commit -m "feat(back): FEATURE-179 game-wide token slot template model and seed"
```

---

### Task 2: Persist the rule and fan it out across the whole game

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/GameRepository.go` (new method, next to `UpdateMapSettings` at `:1792`)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:2348-2418` (`ApplyImageTokenSlot`)

**Interfaces:**
- Consumes: `SetTokenSlotTemplateEntry` (Task 1), `models.ApplyImageTokenSlotRequest` (`models/Game.go:630`), `s.broadcastImageTokenUpdated(gameID string, sceneID, imageID primitive.ObjectID, overlay *models.ImageTokenOverlay, gmID primitive.ObjectID, playerVisible bool)` (`GameService.go:2426`), `PlayerCanSeeSceneImage(img models.SceneImage, gridW, gridH int) bool`.
- Produces: `(*repository.GameRepository).UpdateGameTokenSlotTemplate(gameID string, tpl []*models.ImageTokenSlot) error`.

- [ ] **Step 1: Add the repository method**

In `internal/repository/GameRepository.go`, after `UpdateMapSettings` (ends `:1820`):

```go
// UpdateGameTokenSlotTemplate replaces the game-wide locked ring-position rule (FEATURE-179). The
// template is a whole-value field, not a partial patch: the caller builds the full 8-entry slice.
func (r *GameRepository) UpdateGameTokenSlotTemplate(gameID string, tpl []*models.ImageTokenSlot) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": objectID}, bson.M{"$set": bson.M{
		"tokenSlotTemplate": tpl,
		"updatedAt":         time.Now(),
	}})
	return err
}
```

- [ ] **Step 2: Rewrite the doc comment and body of `ApplyImageTokenSlot`**

In `internal/service/GameService.go`, replace the comment block at `:2348-2351` and the body from the scene lookup through the fan-out loop (`:2361-2418`) so the method reads:

```go
// ApplyImageTokenSlot locks or unlocks one ring position for the whole game (GM only). Locking
// stores the position's config as the game-wide rule (models.Game.TokenSlotTemplate) and copies it
// onto every tokens-layer image in every scene — keeping each image's own slot id, resetting the
// live Level/Number, and marking it Locked. Unlocking clears the rule and just drops the Locked
// flag everywhere (config and values are left intact). The rule is what makes a token added later
// come with the slot already on it: see SeedOverlayFromTemplate and its two call sites.
func (s *GameService) ApplyImageTokenSlot(gameID string, sceneID, userID primitive.ObjectID, req models.ApplyImageTokenSlotRequest) error {
	if req.Position < 0 || req.Position >= 8 {
		return fmt.Errorf("invalid slot position")
	}
	if req.Locked && req.Slot == nil {
		return fmt.Errorf("slot config is required when locking")
	}

	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can share token slots")
	}

	// The scene id still has to name a real scene — the padlock is always clicked from one, and a
	// bogus id means a broken client, not a game-wide edit worth committing.
	sceneExists := false
	for i := range game.Scenes {
		if game.Scenes[i].ID == sceneID {
			sceneExists = true
			break
		}
	}
	if !sceneExists {
		return fmt.Errorf("scene not found")
	}

	// Persist the rule first: it is what new tokens read, and it must hold even if a later
	// per-image write fails halfway through the fan-out.
	var entry *models.ImageTokenSlot
	if req.Locked {
		entry = req.Slot
	}
	if err := s.gameRepo.UpdateGameTokenSlotTemplate(gameID, SetTokenSlotTemplateEntry(game.TokenSlotTemplate, req.Position, entry)); err != nil {
		return err
	}

	for si := range game.Scenes {
		scene := &game.Scenes[si]
		for i := range scene.Images {
			img := &scene.Images[i]
			if img.Layer != "tokens" {
				continue
			}
			overlay := img.TokenOverlay
			if overlay == nil {
				if !req.Locked {
					continue // nothing to unlock on a token with no overlay
				}
				overlay = &models.ImageTokenOverlay{Enabled: true}
			}
			// Ensure 8 fixed ring positions so the index is always valid.
			for len(overlay.Slots) < 8 {
				overlay.Slots = append(overlay.Slots, models.ImageTokenSlot{ID: primitive.NewObjectID().Hex(), Type: "empty"})
			}
			cur := overlay.Slots[req.Position]
			if req.Locked {
				id := cur.ID
				if id == "" {
					id = primitive.NewObjectID().Hex()
				}
				ns := *req.Slot // config from the initiating token
				ns.ID = id      // keep this token's own slot id (value patches key on it)
				ns.Level = 0    // config is shared; the live value resets and stays per-token
				ns.Number = 0
				ns.Locked = true
				overlay.Slots[req.Position] = ns
			} else {
				overlay.Slots[req.Position].Locked = false
			}

			if err := s.gameRepo.UpdateSceneImage(gameID, scene.ID, img.ID, models.UpdateSceneImageRequest{TokenOverlay: overlay}); err != nil {
				return err
			}
			s.broadcastImageTokenUpdated(gameID, scene.ID, img.ID, overlay, game.GameMasterID, PlayerCanSeeSceneImage(*img, scene.GridWidth, scene.GridHeight))
		}
	}

	return nil
}
```

The two loop-carried changes versus the old code: the outer `for si := range game.Scenes` (was a single scene lookup), and `scene.ID` / `scene.GridWidth` / `scene.GridHeight` in place of the captured `sceneID` and the one scene's grid.

- [ ] **Step 3: Verify it compiles and nothing regressed**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: build clean, vet clean, all packages pass. (`ApplyImageTokenSlot` itself needs Mongo and has no unit test; it is exercised manually in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/repository/GameRepository.go \
        warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat(back): FEATURE-179 padlock stores a game-wide rule and fans out across scenes"
```

---

### Task 3: Seed a new token on add, and stop the hidden-slot leak

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1790-1840` (`AddImageToScene`)

**Interfaces:**
- Consumes: `SeedOverlayFromTemplate` (Task 1), `MaskImageTokenForPlayer` (`GameService.go:2448`), `PlayerCanSeeSceneImage`.
- Produces: nothing new.

- [ ] **Step 1: Seed the overlay on the created image**

In `AddImageToScene`, right after the `image := models.SceneImage{...}` literal (`:1801-1810`) and before `s.gameRepo.AddSceneImage(...)`:

```go
	// A tokens-layer image starts under the game's locked-position rule, so a token added after the
	// GM set the padlock comes with the slot already on it (FEATURE-179).
	if req.Layer == "tokens" {
		image.TokenOverlay = SeedOverlayFromTemplate(game.TokenSlotTemplate)
	}
```

- [ ] **Step 2: Mask the player-facing broadcast**

Replace the comment at `:1826-1829` and the player broadcast below it:

```go
	// A GM can drop a fresh image straight into the off-scene margin to stage it; players must
	// not receive it until it reaches the grid. A created image can now carry a seeded overlay
	// (FEATURE-179), and a seeded slot may be Hidden, so the player copy goes through
	// MaskImageTokenForPlayer — the GM broadcast above keeps the full overlay.
	for si := range game.Scenes {
		if game.Scenes[si].ID != sceneID {
			continue
		}
		if PlayerCanSeeSceneImage(*createdImage, game.Scenes[si].GridWidth, game.Scenes[si].GridHeight) {
			shown := *createdImage
			shown.TokenOverlay = MaskImageTokenForPlayer(createdImage.TokenOverlay)
			s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
				"sceneId": sceneID.Hex(),
				"image":   shown,
			}, gmID)
		}
		break
	}
```

- [ ] **Step 3: Verify**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: build clean, vet clean, all packages pass. The masking behaviour itself is covered by `TestSeedOverlayFromTemplate_HiddenSlotIsMaskedForPlayers` from Task 1.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat(back): FEATURE-179 seed a new tokens-layer image from the game template"
```

---

### Task 4: Seed on a layer promotion to `tokens`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1961-2018` (`UpdateSceneImage`, before the repository write at `:2016`)

**Interfaces:**
- Consumes: `SeedOverlayFromTemplate` (Task 1), the existing `current *models.SceneImage` lookup (`:1988-2002`).
- Produces: nothing new.

- [ ] **Step 1: Inject the seeded overlay into the request**

In `UpdateSceneImage`, between the workspace guard (ends `:2014`) and `if err := s.gameRepo.UpdateSceneImage(...)` (`:2016`):

```go
	// An image can be added on any layer and promoted to tokens later; without this, a promoted
	// image would miss the game's locked-position rule and reproduce FEATURE-179 by another route.
	// Injecting into req rather than writing separately keeps every broadcast branch below correct:
	// applySceneImageUpdate sees the overlay, and the two player paths already mask req.TokenOverlay.
	if req.Layer != nil && *req.Layer == "tokens" && current != nil && current.TokenOverlay == nil {
		req.TokenOverlay = SeedOverlayFromTemplate(game.TokenSlotTemplate)
	}
```

- [ ] **Step 2: Verify**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: build clean, vet clean, all packages pass.

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat(back): FEATURE-179 seed an image promoted to the tokens layer"
```

---

### Task 5: Padlock copy says "in the game", not "on the scene"

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:1649-1652`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json:1649-1652`

**Interfaces:**
- Consumes: the four keys already rendered by `ImageTokenConfigPanel.jsx:255` (tooltip) and `:297` (confirm dialog).
- Produces: nothing new. No component changes anywhere in this feature.

- [ ] **Step 1: Update the English strings**

In `src/locales/en/translation.json`, under `imageToken`, replace the four values:

```json
    "shareAll": "Set for all tokens in the game",
    "unshareAll": "Unlock for all tokens in the game",
    "shareAllConfirm": "Set this slot for all tokens in the game, on every scene? Their live values reset, new tokens will get this slot too, and editing it will then change every token.",
    "unshareAllConfirm": "Unlock this slot for all tokens in the game? New tokens stop getting it and edits affect only this token again."
```

- [ ] **Step 2: Update the Polish strings**

In `src/locales/pl/translation.json`, under `imageToken`:

```json
    "shareAll": "Ustaw dla wszystkich tokenów w grze",
    "unshareAll": "Odblokuj dla wszystkich tokenów w grze",
    "shareAllConfirm": "Ustawić ten slot dla wszystkich tokenów w grze, na każdej scenie? Wartości zostaną zresetowane, nowe tokeny też dostaną ten slot, a jego edycja będzie zmieniać wszystkie tokeny.",
    "unshareAllConfirm": "Odblokować ten slot dla wszystkich tokenów w grze? Nowe tokeny przestaną go dostawać, a zmiany będą znów dotyczyć tylko tego tokena."
```

The confirm wording has to name the reach: the fan-out resets `Level`/`Number` on every scene, so editing a locked slot on scene 2 clears the armour values of the goblins on scene 1 — a scene the GM is not looking at.

- [ ] **Step 3: Verify both files still parse and both keys exist**

Run from `warhammer-battle-helper-front/`:

```bash
node -e "['en','pl'].forEach(l=>{const j=require('./src/locales/'+l+'/translation.json');['shareAll','unshareAll','shareAllConfirm','unshareAllConfirm'].forEach(k=>{if(!j.imageToken[k])throw new Error(l+' missing '+k);if(/scen/i.test(j.imageToken[k])&&!/every scene|każdej scenie/.test(j.imageToken[k]))throw new Error(l+'.'+k+' still scoped to the scene');});console.log(l,'ok')})"
```

Expected: `en ok` / `pl ok`.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(front): FEATURE-179 padlock copy covers the whole game"
```

---

### Task 6: Manual end-to-end pass

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: a pass/fail report. Nothing is committed here.

- [ ] **Step 1: Bring up the local stack and log in as a GM**

Follow the local e2e recipe (docker stack, JWT obtained by clearing `activationToken` on a not-yet-active user). Create or open a game with at least two scenes.

- [ ] **Step 2: Reproduce the original bug path and confirm it is fixed**

1. Scene 1: add an image on the `tokens` layer, open its config panel, set a ring slot to a condition icon.
2. Click the padlock, confirm. Every existing token on scene 1 picks the slot up.
3. Add a **new** image to scene 1 on the `tokens` layer.

Expected: the new token already shows the locked slot, with its value at 0.

- [ ] **Step 3: Confirm the rule crosses scenes**

Switch to scene 2 and add an image on the `tokens` layer.

Expected: it also comes with the locked slot. Tokens that were already on scene 2 have it too (the fan-out from Step 2 reached them).

- [ ] **Step 4: Confirm the layer promotion path**

On scene 2, add an image on the `background` layer, then change its layer to `tokens` from the image context menu.

Expected: it gains the locked slot on promotion.

- [ ] **Step 5: Confirm hidden slots do not leak**

Mark the locked slot `Hidden`, re-apply the padlock, then join the game as a player in a second browser profile and have the GM add a new token inside the grid.

Expected: the player sees the token with an empty ring — no icon, no label — while the GM sees the slot.

- [ ] **Step 6: Confirm unlocking**

Click the padlock again to unlock the position, then add another token.

Expected: existing tokens keep their slot and its values; the newly added token has no overlay slot for that position.

- [ ] **Step 7: Report**

Report each step as pass or fail with what was actually observed. Do not claim the feature works on the strength of the build alone.

---

## Notes for the implementer

- `ImageTokenConfigPanel.jsx:118-127` already re-calls `applyImageTokenSlot(..., locked: true)` after editing a locked slot, so "edit a locked slot updates the rule" needs no frontend work — it flows through `ApplyImageTokenSlot` and Task 2's template write.
- `DuplicateSceneImage` copies the whole overlay including live values. That is the intended "set a value, then duplicate" flow and must stay as it is.
- Character tokens (`GameCharacter.TokenGear`) are a separate mechanism and are untouched by this feature.
