# PLAYRPG-1 Initiative Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tracker inicjatywy per scena: MG układa kolejkę (postacie, obrazki-tokeny, wpisy ręczne), aktywuje uczestników, zamyka rundy; gracze widzą zamaskowaną kolejkę i kończą turę swojej postaci.

**Architecture:** `Scene.Combat` osadzone w dokumencie gry z `json:"-"`. Czysta logika kolejki w pakiecie `internal/combat`, maskowany widok per widz w `service/combat_view.go`, jedna ścieżka zapisu w `CombatService.mutate` (load → prune → zmiana → zapis warunkowy po `version`). Front: hook `useSceneCombat` + `CombatContext`, przycisk w pasku narzędzi, pasek kolejki nad mapą, okno „Walka” w Window Managerze.

**Tech Stack:** Go + Gin + mongo-driver, React 19 + dnd-kit + i18next + MUI icons, jest/RTL.

Spec: `docs/superpowers/specs/2026-11-09-PLAYRPG-1-initiative-tracker-design.md`.

## Global Constraints

- Komentarze w kodzie wyłącznie po angielsku.
- Każdy string UI przez `t('combat.*')`, klucze w `src/locales/en/translation.json` **i** `src/locales/pl/translation.json`.
- Ikony tylko z `@mui/icons-material`; ikona trackera: `SportsKabaddi`.
- Tooltipy: nigdy MUI `<Tooltip>`. W pasku narzędzi — istniejący `.drawing-toolbar__tooltip`; poza nim — `usePortalTooltip` z `components/common/PortalTooltip.jsx`.
- `localStorage` zawsze w `try/catch`.
- Bez pollingu: fetch przy montowaniu/zmianie sceny + WS.
- `Scene.Combat` ma tag `json:"-"` — nigdy nie zmieniać.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Baseline fail: `App.test.js`.
- Testy Go: `go test ./...` z `warhammer-battle-helper-backend/`.
- Katalog roboczy: Task 1–4 — `warhammer-battle-helper-backend/`; Task 5–9 — `warhammer-battle-helper-front/` (ścieżki `src/...` w komendach są względne do niego); Task 10 — root repo.
- Pracujemy na `main` (bez worktree). Przed każdym commitem `git branch --show-current` w tym samym poleceniu. Commit kończy się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Odstępstwa od specyfikacji (świadome, do dopisania w spec w Task 12)

1. **Zapis warunkowy po `Combat.Version`** zamiast samego `activeId == expected`. Każdy zapis sprawdza wersję, więc chroni też edycje MG przed nadpisaniem; `end-turn`/`next` dodatkowo sprawdzają `activeId` w czystej logice (409 w obu przypadkach).
2. **Sprzątanie leniwe:** wpisy, których token/obrazek/postać zniknęły, są odfiltrowywane przy każdym odczycie i zapisie (`combat.Prune`). Żadna ścieżka usuwania nie zna trackera. Klient refetchuje walkę na istniejących eventach usunięcia.
3. **Wskaźnik walki na pasku scen** pochodzi z `GET /games/:id/combats` (tylko MG) — nie z `GET /games/:id`, żeby nie zdradzić ukrytej walki.
4. **„Dodaj do walki” na pojedynczej postaci:** tokeny postaci nie mają własnego menu, więc prawy klik na **zaznaczonym** pojedynczym tokenie postaci otwiera istniejące menu grupowe (z nową pozycją). Okno „Walka” ma dodatkowo listę „Na tej scenie” z tokenami do dodania.
5. Postać „zabita” ma czerwony krzyżyk (`Close`) jak na tokenie — MUI nie ma czaszki.

## File Structure

Backend (`warhammer-battle-helper-backend/`):
- Create `internal/models/Combat.go` — typy `Combat`, `CombatEntry`, requesty.
- Modify `internal/models/Game.go` — pole `Combat` w `Scene`.
- Create `internal/models/combat_json_test.go` — test wycieku.
- Create `internal/combat/combat.go`, `internal/combat/combat_test.go` — czysta logika kolejki.
- Create `internal/service/combat_view.go`, `internal/service/combat_view_test.go` — widok per widz, `PlayerSceneID`, `combatKilledFunc`.
- Create `internal/service/CombatService.go`, `internal/service/CombatService_test.go` — operacje + autoryzacja.
- Modify `internal/repository/GameRepository.go` — `SaveSceneCombat`.
- Modify `internal/websocket/events.go` — `EventSceneCombatUpdated`.
- Create `internal/http/CombatHandler.go` — handler.
- Modify `cmd/warhammer-battle-helper/main.go` — wiring + routing.

Frontend (`warhammer-battle-helper-front/src/`):
- Create `api/combat.js`.
- Modify `websocket/events.js` — `SCENE_COMBAT_UPDATED`.
- Create `hooks/useSceneCombat.js` + test.
- Create `contexts/CombatContext.jsx`.
- Create `components/scene/combat/`: `combatSelectors.js` (+test), `CombatPortrait.jsx`, `CombatToolbarButton.jsx` (+test), `useStripPosition.js` (+test), `CombatStrip.jsx` (+test), `CombatWindow.jsx` (+test), `combat.css`.
- Modify `components/scene/DrawingToolbar.jsx` + `DrawingToolbar.css` — slot `trailing` + separator.
- Modify `components/DndContext.jsx`, `components/GameSession.jsx`, `components/scene/SceneViewport.jsx`, `components/scene/SceneTokenMultiContextMenu.jsx`, `components/scene/SceneImage.jsx`, `components/scene/SceneImageContextMenu.jsx`, `components/scene/MapCharacterToken.jsx`, `components/scene/SceneSelector.jsx`, `components/WindowBar.jsx`.
- Modify `locales/en/translation.json`, `locales/pl/translation.json`.
- Docs: `changelog/releases.js`, `locales/{en,pl}/changelog.json`, `help/{pl,en}/02-game-screen.md`, `components/tutorial/tours/gameScreen.js`, `docs/knowledge-base/06-scena.md`, `docs/knowledge-base/00-inwentaryzacja.md`.

---

### Task 1: Model walki i test wycieku

**Files:**
- Create: `warhammer-battle-helper-backend/internal/models/Combat.go`
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go` (struct `Scene`, ok. linia 403)
- Test: `warhammer-battle-helper-backend/internal/models/combat_json_test.go`

**Interfaces:**
- Produces: `models.Combat`, `models.CombatEntry`, stałe `CombatEntryCharacter|Image|Manual`, requesty `AddCombatEntriesRequest`, `CombatSourceRequest`, `UpdateCombatEntryRequest`, `UpdateCombatRequest`, `ReorderCombatRequest`, `CombatEntryRefRequest`, `NextTurnRequest`; pole `Scene.Combat *Combat`.

- [ ] **Step 1: Write the failing test**

`internal/models/combat_json_test.go`:
```go
package models

import (
	"encoding/json"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// The raw Game goes to players (GET /games/:id, the WS GAME_STATE snapshot) and to the lobby list.
// A hidden ambush must never leave the server through any of them.
func TestSceneCombatNeverSerialized(t *testing.T) {
	g := Game{Scenes: []Scene{{
		ID:   primitive.NewObjectID(),
		Name: "Forest",
		Combat: &Combat{
			Version: 1, Round: 3, VisibleToPlayers: false,
			Entries: []CombatEntry{{ID: primitive.NewObjectID(), Kind: CombatEntryManual, Name: "Ambush", Initiative: 17, Hidden: true}},
		},
	}}}
	b, err := json.Marshal(g)
	if err != nil {
		t.Fatal(err)
	}
	out := strings.ToLower(string(b))
	for _, needle := range []string{"combat", "ambush", "initiative", "visibletoplayers"} {
		if strings.Contains(out, needle) {
			t.Errorf("serialized game leaks %q: %s", needle, out)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -run TestSceneCombatNeverSerialized`
Expected: FAIL — `undefined: Combat`.

- [ ] **Step 3: Write the model**

`internal/models/Combat.go`:
```go
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Combat entry kinds.
const (
	CombatEntryCharacter = "character" // SourceID = GameCharacter.ID (the scene placement)
	CombatEntryImage     = "image"     // SourceID = SceneImage.ID
	CombatEntryManual    = "manual"    // no token; Name + Initiative only
)

// Combat is one scene's initiative tracker. It is embedded in Scene with json:"-": the raw Game is
// serialized to players and to the lobby list, so the tracker leaves the server only through the
// per-viewer masked view (service.BuildCombatView).
type Combat struct {
	// Version grows by one on every write; a write only lands if the stored version is the one it
	// read (repository.SaveSceneCombat). Two clicks racing on the same state cannot both apply.
	Version int `bson:"version"`
	Round   int `bson:"round"`
	// ActiveID is the entry whose turn it is; zero = nobody.
	ActiveID primitive.ObjectID `bson:"activeId,omitempty"`
	// LastVisibleActiveID is the last non-hidden entry that was active. Players see it as active
	// while a hidden entry acts, so a hidden turn never shows up for them.
	LastVisibleActiveID primitive.ObjectID `bson:"lastVisibleActiveId,omitempty"`
	// VisibleToPlayers=false hides the whole tracker (GM preparation).
	VisibleToPlayers bool          `bson:"visibleToPlayers"`
	Entries          []CombatEntry `bson:"entries"` // display order
	StartedAt        time.Time     `bson:"startedAt"`
}

// CombatEntry is one participant. Character name/avatar/killed are resolved live from the
// character document; image entries keep their own Name because SceneImage has none.
type CombatEntry struct {
	ID         primitive.ObjectID `bson:"_id"`
	Kind       string             `bson:"kind"`
	SourceID   primitive.ObjectID `bson:"sourceId,omitempty"`
	Name       string             `bson:"name"`
	Initiative int                `bson:"initiative"`
	Acted      bool               `bson:"acted"`
	// Hidden hides this entry from players. Independent of the token's own Hidden flag.
	Hidden bool `bson:"hidden"`
}

type CombatSourceRequest struct {
	Kind       string `json:"kind" binding:"required,oneof=character image manual"`
	SourceID   string `json:"sourceId"`
	Name       string `json:"name"`
	Initiative int    `json:"initiative"`
	Hidden     bool   `json:"hidden"`
}

type AddCombatEntriesRequest struct {
	Entries []CombatSourceRequest `json:"entries" binding:"required,min=1,dive"`
}

type UpdateCombatEntryRequest struct {
	Name       *string `json:"name"`
	Initiative *int    `json:"initiative"`
	Acted      *bool   `json:"acted"`
	Hidden     *bool   `json:"hidden"`
}

type UpdateCombatRequest struct {
	VisibleToPlayers *bool `json:"visibleToPlayers"`
}

type ReorderCombatRequest struct {
	EntryIDs []string `json:"entryIds" binding:"required"`
}

type CombatEntryRefRequest struct {
	EntryID string `json:"entryId" binding:"required"`
}

// NextTurnRequest names the entry the caller believes is active ("" = nobody), so a double click
// cannot skip a participant.
type NextTurnRequest struct {
	AfterEntryID string `json:"afterEntryId"`
}
```

W `internal/models/Game.go`, w `type Scene struct`, po `SceneMusicLoop`, dodaj:
```go
	// Combat is this scene's initiative tracker (nil = no combat). json:"-" — see models.Combat.
	Combat *Combat `bson:"combat,omitempty" json:"-"`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/models/ -run TestSceneCombatNeverSerialized`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add internal/models/Combat.go internal/models/Game.go internal/models/combat_json_test.go && git commit -m "feat(combat): scene combat model hidden from game serialization (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Czysta logika kolejki (`internal/combat`)

**Files:**
- Create: `warhammer-battle-helper-backend/internal/combat/combat.go`
- Test: `warhammer-battle-helper-backend/internal/combat/combat_test.go`

**Interfaces:**
- Consumes: `models.Combat`, `models.CombatEntry`, `models.Scene`, `models.Character`.
- Produces:
  - `var ErrConflict, ErrEntryNotFound, ErrBadOrder error`
  - `func Find(c *models.Combat, id primitive.ObjectID) (*models.CombatEntry, bool)`
  - `func HasSource(c *models.Combat, kind string, sourceID primitive.ObjectID) bool`
  - `func Insert(c *models.Combat, e models.CombatEntry)`
  - `func Remove(c *models.Combat, id primitive.ObjectID) error`
  - `func SetInitiative(c *models.Combat, id primitive.ObjectID, v int) error`
  - `func Reorder(c *models.Combat, ids []primitive.ObjectID) error`
  - `func Activate(c *models.Combat, id primitive.ObjectID) error`
  - `func Next(c *models.Combat, expected primitive.ObjectID, killed func(models.CombatEntry) bool) error`
  - `func EndRound(c *models.Combat, killed func(models.CombatEntry) bool)`
  - `func Prune(c *models.Combat, scene *models.Scene, chars map[primitive.ObjectID]*models.Character)`
  - `func Clone(c *models.Combat) *models.Combat`

- [ ] **Step 1: Write the failing tests**

`internal/combat/combat_test.go`:
```go
package combat

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func entry(name string, ini int) models.CombatEntry {
	return models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual, Name: name, Initiative: ini}
}

func names(c *models.Combat) []string {
	out := make([]string, len(c.Entries))
	for i, e := range c.Entries {
		out[i] = e.Name
	}
	return out
}

func eq(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func noneKilled(models.CombatEntry) bool { return false }

func TestInsertSortsDescendingTiesAfter(t *testing.T) {
	c := &models.Combat{}
	Insert(c, entry("a", 10))
	Insert(c, entry("b", 15))
	Insert(c, entry("c", 10))
	Insert(c, entry("d", 3))
	eq(t, names(c), []string{"b", "a", "c", "d"})
}

func TestSetInitiativeMovesEntryAndKeepsActive(t *testing.T) {
	c := &models.Combat{}
	a, b := entry("a", 10), entry("b", 5)
	Insert(c, a)
	Insert(c, b)
	c.ActiveID = b.ID
	if err := SetInitiative(c, b.ID, 20); err != nil {
		t.Fatal(err)
	}
	eq(t, names(c), []string{"b", "a"})
	if c.ActiveID != b.ID {
		t.Fatal("active entry must stay active after its value changes")
	}
}

func TestReorderRequiresPermutation(t *testing.T) {
	c := &models.Combat{}
	a, b := entry("a", 10), entry("b", 5)
	Insert(c, a)
	Insert(c, b)
	if err := Reorder(c, []primitive.ObjectID{a.ID}); !errors.Is(err, ErrBadOrder) {
		t.Fatalf("short list: got %v", err)
	}
	if err := Reorder(c, []primitive.ObjectID{a.ID, a.ID}); !errors.Is(err, ErrBadOrder) {
		t.Fatalf("duplicate: got %v", err)
	}
	if err := Reorder(c, []primitive.ObjectID{b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	eq(t, names(c), []string{"b", "a"})
}

func TestActivateTracksLastVisible(t *testing.T) {
	c := &models.Combat{}
	v, h := entry("v", 10), entry("h", 5)
	h.Hidden = true
	Insert(c, v)
	Insert(c, h)
	_ = Activate(c, v.ID)
	_ = Activate(c, h.ID)
	if c.ActiveID != h.ID || c.LastVisibleActiveID != v.ID {
		t.Fatalf("active=%v lastVisible=%v", c.ActiveID, c.LastVisibleActiveID)
	}
}

func TestNextMarksActedAndSkipsKilled(t *testing.T) {
	c := &models.Combat{}
	a, b, k, d := entry("a", 20), entry("b", 15), entry("k", 10), entry("d", 5)
	for _, e := range []models.CombatEntry{a, b, k, d} {
		Insert(c, e)
	}
	killed := func(e models.CombatEntry) bool { return e.ID == k.ID }
	if err := Next(c, primitive.NilObjectID, killed); err != nil || c.ActiveID != a.ID {
		t.Fatalf("first next: err=%v active=%v", err, c.ActiveID)
	}
	_ = Next(c, a.ID, killed)
	_ = Next(c, b.ID, killed)
	if c.ActiveID != d.ID {
		t.Fatalf("killed entry must be skipped, active=%v", c.ActiveID)
	}
	_ = Next(c, d.ID, killed)
	if !c.ActiveID.IsZero() {
		t.Fatal("when everyone acted nobody is active")
	}
	if c.Round != 0 {
		t.Fatal("next never closes the round")
	}
}

// Two players ending the same turn: the second request names a turn that is already over.
func TestNextWithStaleExpectedIsConflict(t *testing.T) {
	c := &models.Combat{}
	a, b, d := entry("a", 20), entry("b", 15), entry("d", 5)
	Insert(c, a)
	Insert(c, b)
	Insert(c, d)
	_ = Activate(c, a.ID)
	if err := Next(c, a.ID, noneKilled); err != nil {
		t.Fatal(err)
	}
	if err := Next(c, a.ID, noneKilled); !errors.Is(err, ErrConflict) {
		t.Fatalf("got %v, want ErrConflict", err)
	}
	if c.ActiveID != b.ID {
		t.Fatal("a conflicting call must not move the turn")
	}
}

func TestEndRoundResetsAndActivatesFirstAlive(t *testing.T) {
	c := &models.Combat{Round: 1}
	k, a := entry("k", 20), entry("a", 10)
	Insert(c, k)
	Insert(c, a)
	c.Entries[0].Acted, c.Entries[1].Acted = true, true
	EndRound(c, func(e models.CombatEntry) bool { return e.ID == k.ID })
	if c.Round != 2 || c.Entries[0].Acted || c.Entries[1].Acted || c.ActiveID != a.ID {
		t.Fatalf("round=%d active=%v entries=%+v", c.Round, c.ActiveID, c.Entries)
	}
}

func TestRemoveClearsActive(t *testing.T) {
	c := &models.Combat{}
	a := entry("a", 1)
	Insert(c, a)
	_ = Activate(c, a.ID)
	if err := Remove(c, a.ID); err != nil {
		t.Fatal(err)
	}
	if !c.ActiveID.IsZero() || !c.LastVisibleActiveID.IsZero() || len(c.Entries) != 0 {
		t.Fatalf("%+v", c)
	}
	if err := Remove(c, a.ID); !errors.Is(err, ErrEntryNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestPruneDropsEntriesWithoutSource(t *testing.T) {
	liveChar := primitive.NewObjectID()
	goneChar := primitive.NewObjectID()
	placement := models.GameCharacter{ID: primitive.NewObjectID(), CharacterID: liveChar}
	orphanPlacement := models.GameCharacter{ID: primitive.NewObjectID(), CharacterID: goneChar}
	img := models.SceneImage{ID: primitive.NewObjectID(), Layer: "tokens"}
	scene := &models.Scene{Characters: []models.GameCharacter{placement, orphanPlacement}, Images: []models.SceneImage{img}}
	chars := map[primitive.ObjectID]*models.Character{liveChar: {ID: liveChar}}

	keepChar := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryCharacter, SourceID: placement.ID, Name: "keepChar"}
	keepImg := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryImage, SourceID: img.ID, Name: "keepImg"}
	keepManual := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual, Name: "keepManual"}
	removedPlacement := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryCharacter, SourceID: primitive.NewObjectID(), Name: "gonePlacement"}
	deletedCharacter := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryCharacter, SourceID: orphanPlacement.ID, Name: "goneCharacter"}
	deletedImage := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryImage, SourceID: primitive.NewObjectID(), Name: "goneImage"}

	c := &models.Combat{Entries: []models.CombatEntry{keepChar, removedPlacement, keepImg, deletedCharacter, keepManual, deletedImage}, ActiveID: deletedImage.ID, LastVisibleActiveID: deletedImage.ID}
	Prune(c, scene, chars)
	eq(t, names(c), []string{"keepChar", "keepImg", "keepManual"})
	if !c.ActiveID.IsZero() || !c.LastVisibleActiveID.IsZero() {
		t.Fatal("a pruned active entry leaves nobody active")
	}
}

func TestCloneIsDeep(t *testing.T) {
	c := &models.Combat{Entries: []models.CombatEntry{entry("a", 1)}}
	cp := Clone(c)
	cp.Entries[0].Name = "changed"
	if c.Entries[0].Name != "a" {
		t.Fatal("clone shares the entries array")
	}
	if Clone(nil) != nil {
		t.Fatal("clone of nil is nil")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/combat/`
Expected: FAIL — package has no non-test files / undefined symbols.

- [ ] **Step 3: Implement**

`internal/combat/combat.go`:
```go
// Package combat holds the pure turn-order rules of a scene's initiative tracker. No I/O: the
// service loads, calls these functions on a copy and saves the result.
package combat

import (
	"errors"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	// ErrConflict: the tracker changed since the caller looked at it (stale version or stale active entry).
	ErrConflict      = errors.New("combat changed meanwhile")
	ErrEntryNotFound = errors.New("combat entry not found")
	ErrBadOrder      = errors.New("order must list every entry exactly once")
)

func indexOf(c *models.Combat, id primitive.ObjectID) int {
	for i := range c.Entries {
		if c.Entries[i].ID == id {
			return i
		}
	}
	return -1
}

// Find returns a pointer into c.Entries.
func Find(c *models.Combat, id primitive.ObjectID) (*models.CombatEntry, bool) {
	if i := indexOf(c, id); i >= 0 {
		return &c.Entries[i], true
	}
	return nil, false
}

func HasSource(c *models.Combat, kind string, sourceID primitive.ObjectID) bool {
	for _, e := range c.Entries {
		if e.Kind == kind && e.SourceID == sourceID {
			return true
		}
	}
	return false
}

// Insert places e by initiative, descending; a tie goes after the entries already holding that value.
func Insert(c *models.Combat, e models.CombatEntry) {
	i := 0
	for i < len(c.Entries) && c.Entries[i].Initiative >= e.Initiative {
		i++
	}
	c.Entries = append(c.Entries, models.CombatEntry{})
	copy(c.Entries[i+1:], c.Entries[i:])
	c.Entries[i] = e
}

func Remove(c *models.Combat, id primitive.ObjectID) error {
	i := indexOf(c, id)
	if i < 0 {
		return ErrEntryNotFound
	}
	c.Entries = append(c.Entries[:i], c.Entries[i+1:]...)
	if c.ActiveID == id {
		c.ActiveID = primitive.NilObjectID
	}
	if c.LastVisibleActiveID == id {
		c.LastVisibleActiveID = primitive.NilObjectID
	}
	return nil
}

// SetInitiative changes the value and moves the entry to its sorted place. The active entry stays active.
func SetInitiative(c *models.Combat, id primitive.ObjectID, v int) error {
	i := indexOf(c, id)
	if i < 0 {
		return ErrEntryNotFound
	}
	e := c.Entries[i]
	c.Entries = append(c.Entries[:i], c.Entries[i+1:]...)
	e.Initiative = v
	Insert(c, e)
	return nil
}

// Reorder applies a manual order (ties, GM's call). ids must be a permutation of the entries.
func Reorder(c *models.Combat, ids []primitive.ObjectID) error {
	if len(ids) != len(c.Entries) {
		return ErrBadOrder
	}
	byID := make(map[primitive.ObjectID]models.CombatEntry, len(c.Entries))
	for _, e := range c.Entries {
		byID[e.ID] = e
	}
	next := make([]models.CombatEntry, 0, len(ids))
	for _, id := range ids {
		e, ok := byID[id]
		if !ok {
			return ErrBadOrder
		}
		delete(byID, id) // a duplicate id finds nothing the second time
		next = append(next, e)
	}
	c.Entries = next
	return nil
}

func Activate(c *models.Combat, id primitive.ObjectID) error {
	i := indexOf(c, id)
	if i < 0 {
		return ErrEntryNotFound
	}
	c.ActiveID = id
	if !c.Entries[i].Hidden {
		c.LastVisibleActiveID = id
	}
	return nil
}

// Next marks the active entry as acted and activates the first entry that has neither acted nor
// died. expected is who the caller believes is active (zero = nobody): a mismatch means someone
// already moved the turn, so the call returns ErrConflict and changes nothing. When everyone has
// acted nobody is active — closing the round is always the GM's explicit call.
func Next(c *models.Combat, expected primitive.ObjectID, killed func(models.CombatEntry) bool) error {
	if c.ActiveID != expected {
		return ErrConflict
	}
	if i := indexOf(c, c.ActiveID); i >= 0 {
		c.Entries[i].Acted = true
	}
	c.ActiveID = primitive.NilObjectID
	for _, e := range c.Entries {
		if !e.Acted && !killed(e) {
			return Activate(c, e.ID)
		}
	}
	return nil
}

// EndRound clears every Acted flag, advances the round and activates the first living entry.
func EndRound(c *models.Combat, killed func(models.CombatEntry) bool) {
	for i := range c.Entries {
		c.Entries[i].Acted = false
	}
	c.Round++
	c.ActiveID = primitive.NilObjectID
	c.LastVisibleActiveID = primitive.NilObjectID
	for _, e := range c.Entries {
		if !killed(e) {
			_ = Activate(c, e.ID)
			return
		}
	}
}

// Prune drops entries whose token is gone: a removed placement, a placement whose character was
// deleted, or a deleted image. No deletion path knows about combat — every read and write prunes
// instead, so a new way of deleting a token cannot leave a ghost in the tracker.
func Prune(c *models.Combat, scene *models.Scene, chars map[primitive.ObjectID]*models.Character) {
	placementChar := make(map[primitive.ObjectID]primitive.ObjectID, len(scene.Characters))
	for _, gc := range scene.Characters {
		placementChar[gc.ID] = gc.CharacterID
	}
	images := make(map[primitive.ObjectID]bool, len(scene.Images))
	for _, img := range scene.Images {
		images[img.ID] = true
	}
	kept := make([]models.CombatEntry, 0, len(c.Entries))
	for _, e := range c.Entries {
		alive := true
		switch e.Kind {
		case models.CombatEntryCharacter:
			charID, ok := placementChar[e.SourceID]
			alive = ok && chars[charID] != nil
		case models.CombatEntryImage:
			alive = images[e.SourceID]
		}
		if alive {
			kept = append(kept, e)
			continue
		}
		if c.ActiveID == e.ID {
			c.ActiveID = primitive.NilObjectID
		}
		if c.LastVisibleActiveID == e.ID {
			c.LastVisibleActiveID = primitive.NilObjectID
		}
	}
	c.Entries = kept
}

// Clone deep-copies c so the stored state is never mutated in place.
func Clone(c *models.Combat) *models.Combat {
	if c == nil {
		return nil
	}
	cp := *c
	cp.Entries = append([]models.CombatEntry(nil), c.Entries...)
	return &cp
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/combat/ -v`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add internal/combat && git commit -m "feat(combat): pure turn-order rules (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Widok maskowany per widz

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/combat_view.go`
- Test: `warhammer-battle-helper-backend/internal/service/combat_view_test.go`

**Interfaces:**
- Consumes: `combat.Clone`, `combat.Prune`, istniejące `characterTokenAvatar(ch)` (`service/token_view_broadcast.go`), `CanEditCharacter(ch, userID, isGM)` (`service/access.go`).
- Produces:
  - `type CombatEntryView struct` / `type CombatView struct` (JSON jak niżej)
  - `func BuildCombatView(c *models.Combat, scene *models.Scene, chars map[primitive.ObjectID]*models.Character, viewerID primitive.ObjectID, isGM bool) *CombatView`
  - `func PlayerSceneID(game *models.Game, userID primitive.ObjectID) primitive.ObjectID`
  - `func combatKilledFunc(scene *models.Scene, chars map[primitive.ObjectID]*models.Character) func(models.CombatEntry) bool`

- [ ] **Step 1: Write the failing tests**

`internal/service/combat_view_test.go`:
```go
package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type viewFixture struct {
	scene              *models.Scene
	chars              map[primitive.ObjectID]*models.Character
	combat             *models.Combat
	player, other      primitive.ObjectID
	heroE, wolfE, trap models.CombatEntry
}

func newViewFixture() viewFixture {
	player, other := primitive.NewObjectID(), primitive.NewObjectID()
	hero := &models.Character{ID: primitive.NewObjectID(), Name: "Hero", Avatar: "/user-files/hero.png", VisibleTo: []primitive.ObjectID{player}}
	placement := models.GameCharacter{ID: primitive.NewObjectID(), CharacterID: hero.ID}
	wolf := models.SceneImage{ID: primitive.NewObjectID(), Layer: "tokens", FileURL: "/user-files/wolf.png", Killed: true}
	heroE := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryCharacter, SourceID: placement.ID, Initiative: 15}
	wolfE := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryImage, SourceID: wolf.ID, Name: "Wolf", Initiative: 9, Hidden: true}
	trap := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual, Name: "Trap", Initiative: 3}
	return viewFixture{
		scene:  &models.Scene{Characters: []models.GameCharacter{placement}, Images: []models.SceneImage{wolf}},
		chars:  map[primitive.ObjectID]*models.Character{hero.ID: hero},
		combat: &models.Combat{Version: 4, Round: 2, VisibleToPlayers: true, Entries: []models.CombatEntry{heroE, wolfE, trap}},
		player: player, other: other, heroE: heroE, wolfE: wolfE, trap: trap,
	}
}

func TestCombatViewGMSeesEverything(t *testing.T) {
	f := newViewFixture()
	v := BuildCombatView(f.combat, f.scene, f.chars, primitive.NewObjectID(), true)
	if v == nil || len(v.Entries) != 3 {
		t.Fatalf("%+v", v)
	}
	hero := v.Entries[0]
	if hero.Name != "Hero" || hero.Avatar != "/user-files/hero.png" || hero.Initiative == nil || *hero.Initiative != 15 || !hero.CanEndTurn {
		t.Fatalf("hero %+v", hero)
	}
	wolf := v.Entries[1]
	if !wolf.Hidden || !wolf.Killed || wolf.Avatar != "/user-files/wolf.png" {
		t.Fatalf("wolf %+v", wolf)
	}
}

func TestCombatViewPlayerMasking(t *testing.T) {
	f := newViewFixture()
	v := BuildCombatView(f.combat, f.scene, f.chars, f.player, false)
	if len(v.Entries) != 2 {
		t.Fatalf("hidden entry must be dropped, got %+v", v.Entries)
	}
	for _, e := range v.Entries {
		if e.Initiative != nil {
			t.Fatalf("player must not get initiative values: %+v", e)
		}
	}
	if !v.Entries[0].CanEndTurn {
		t.Fatal("card holder can end the hero's turn")
	}
	if v.Entries[1].CanEndTurn {
		t.Fatal("nobody but the GM ends a manual entry's turn")
	}
	if BuildCombatView(f.combat, f.scene, f.chars, f.other, false).Entries[0].CanEndTurn {
		t.Fatal("a player without the card cannot end the hero's turn")
	}
}

func TestCombatViewHiddenTrackerIsNilForPlayers(t *testing.T) {
	f := newViewFixture()
	f.combat.VisibleToPlayers = false
	if BuildCombatView(f.combat, f.scene, f.chars, f.player, false) != nil {
		t.Fatal("hidden tracker must not reach players")
	}
	if BuildCombatView(f.combat, f.scene, f.chars, f.player, true) == nil {
		t.Fatal("GM still sees a hidden tracker")
	}
	if BuildCombatView(nil, f.scene, f.chars, f.player, true) != nil {
		t.Fatal("no combat = nil view")
	}
}

func TestCombatViewHiddenTurnShowsLastVisibleToPlayers(t *testing.T) {
	f := newViewFixture()
	f.combat.ActiveID = f.wolfE.ID
	f.combat.LastVisibleActiveID = f.heroE.ID
	if got := BuildCombatView(f.combat, f.scene, f.chars, f.player, false).ActiveID; got != f.heroE.ID.Hex() {
		t.Fatalf("player active = %q, want hero", got)
	}
	if got := BuildCombatView(f.combat, f.scene, f.chars, f.player, true).ActiveID; got != f.wolfE.ID.Hex() {
		t.Fatalf("GM active = %q, want wolf", got)
	}
	f.combat.LastVisibleActiveID = primitive.NilObjectID
	if got := BuildCombatView(f.combat, f.scene, f.chars, f.player, false).ActiveID; got != "" {
		t.Fatalf("no visible predecessor = nobody active, got %q", got)
	}
}

func TestPlayerSceneID(t *testing.T) {
	p := primitive.NewObjectID()
	first := models.Scene{ID: primitive.NewObjectID()}
	def := models.Scene{ID: primitive.NewObjectID(), IsDefault: true}
	assigned := models.Scene{ID: primitive.NewObjectID(), AssignedPlayers: []primitive.ObjectID{p}}
	if got := PlayerSceneID(&models.Game{Scenes: []models.Scene{first, def, assigned}}, p); got != assigned.ID {
		t.Fatal("assigned scene wins")
	}
	if got := PlayerSceneID(&models.Game{Scenes: []models.Scene{first, def}}, p); got != def.ID {
		t.Fatal("then the default scene")
	}
	if got := PlayerSceneID(&models.Game{Scenes: []models.Scene{first}}, p); got != first.ID {
		t.Fatal("then the first scene")
	}
	if !PlayerSceneID(&models.Game{}, p).IsZero() {
		t.Fatal("no scenes = zero")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/service/ -run 'CombatView|PlayerSceneID'`
Expected: FAIL — `undefined: BuildCombatView`.

- [ ] **Step 3: Implement**

`internal/service/combat_view.go`:
```go
package service

import (
	"battle-helper/internal/combat"
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CombatEntryView is one participant as a given viewer may see it.
type CombatEntryView struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	SourceID   string `json:"sourceId,omitempty"`
	Name       string `json:"name"`
	Avatar     string `json:"avatar,omitempty"`
	Initiative *int   `json:"initiative,omitempty"` // GM only
	Acted      bool   `json:"acted"`
	Hidden     bool   `json:"hidden,omitempty"` // GM only (players never receive hidden entries)
	Killed     bool   `json:"killed,omitempty"`
	CanEndTurn bool   `json:"canEndTurn,omitempty"`
}

type CombatView struct {
	Version          int               `json:"version"`
	Round            int               `json:"round"`
	ActiveID         string            `json:"activeId,omitempty"`
	VisibleToPlayers bool              `json:"visibleToPlayers"`
	Entries          []CombatEntryView `json:"entries"`
}

// PlayerSceneID mirrors the frontend's displayScene rule for a player: the assigned scene, else the
// default scene, else the first one. A player sees only this scene's combat.
func PlayerSceneID(game *models.Game, userID primitive.ObjectID) primitive.ObjectID {
	for _, s := range game.Scenes {
		for _, p := range s.AssignedPlayers {
			if p == userID {
				return s.ID
			}
		}
	}
	for _, s := range game.Scenes {
		if s.IsDefault {
			return s.ID
		}
	}
	if len(game.Scenes) > 0 {
		return game.Scenes[0].ID
	}
	return primitive.NilObjectID
}

// combatKilledFunc reports "dead" from the token's own state: Character.Killed for a character
// entry, SceneImage.Killed for an image. The tracker has no dead state of its own.
func combatKilledFunc(scene *models.Scene, chars map[primitive.ObjectID]*models.Character) func(models.CombatEntry) bool {
	placementChar := map[primitive.ObjectID]primitive.ObjectID{}
	for _, gc := range scene.Characters {
		placementChar[gc.ID] = gc.CharacterID
	}
	imageKilled := map[primitive.ObjectID]bool{}
	for _, img := range scene.Images {
		imageKilled[img.ID] = img.Killed
	}
	return func(e models.CombatEntry) bool {
		switch e.Kind {
		case models.CombatEntryCharacter:
			ch := chars[placementChar[e.SourceID]]
			return ch != nil && ch.Killed
		case models.CombatEntryImage:
			return imageKilled[e.SourceID]
		}
		return false
	}
}

// BuildCombatView is the only way combat data leaves the server. nil = the viewer sees no combat
// (none exists, or the whole tracker is hidden from a player). For players it drops hidden entries
// and initiative values, and while a hidden entry acts it reports the last visible active entry.
func BuildCombatView(c *models.Combat, scene *models.Scene, chars map[primitive.ObjectID]*models.Character, viewerID primitive.ObjectID, isGM bool) *CombatView {
	if c == nil {
		return nil
	}
	cp := combat.Clone(c)
	combat.Prune(cp, scene, chars)
	if !isGM && !cp.VisibleToPlayers {
		return nil
	}

	placements := map[primitive.ObjectID]models.GameCharacter{}
	for _, gc := range scene.Characters {
		placements[gc.ID] = gc
	}
	images := map[primitive.ObjectID]models.SceneImage{}
	for _, img := range scene.Images {
		images[img.ID] = img
	}

	view := &CombatView{Version: cp.Version, Round: cp.Round, VisibleToPlayers: cp.VisibleToPlayers, Entries: []CombatEntryView{}}
	for _, e := range cp.Entries {
		if !isGM && e.Hidden {
			continue
		}
		ev := CombatEntryView{ID: e.ID.Hex(), Kind: e.Kind, Name: e.Name, Acted: e.Acted, CanEndTurn: isGM}
		if !e.SourceID.IsZero() {
			ev.SourceID = e.SourceID.Hex()
		}
		switch e.Kind {
		case models.CombatEntryCharacter:
			ch := chars[placements[e.SourceID].CharacterID]
			ev.Name = ch.Name
			ev.Avatar = characterTokenAvatar(ch)
			ev.Killed = ch.Killed
			ev.CanEndTurn = CanEditCharacter(ch, viewerID, isGM)
		case models.CombatEntryImage:
			img := images[e.SourceID]
			ev.Avatar = img.FileURL
			ev.Killed = img.Killed
		}
		if isGM {
			v := e.Initiative
			ev.Initiative = &v
			ev.Hidden = e.Hidden
		}
		view.Entries = append(view.Entries, ev)
	}

	active := cp.ActiveID
	if !isGM {
		if e, ok := combat.Find(cp, active); ok && e.Hidden {
			active = cp.LastVisibleActiveID
			if last, ok := combat.Find(cp, active); !ok || last.Hidden {
				active = primitive.NilObjectID
			}
		}
	}
	if !active.IsZero() {
		view.ActiveID = active.Hex()
	}
	return view
}
```

Uwaga: po `Prune` każdy wpis postaci ma placement i niepusty `chars[...]`, więc `ch` nie jest nil.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/service/ -run 'CombatView|PlayerSceneID' -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add internal/service/combat_view.go internal/service/combat_view_test.go && git commit -m "feat(combat): per-viewer masked combat view (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Repozytorium, serwis, handler, routing, event WS

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/GameRepository.go` (dopisz na końcu pliku)
- Modify: `warhammer-battle-helper-backend/internal/websocket/events.go`
- Create: `warhammer-battle-helper-backend/internal/service/CombatService.go`
- Test: `warhammer-battle-helper-backend/internal/service/CombatService_test.go`
- Create: `warhammer-battle-helper-backend/internal/http/CombatHandler.go`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go` (serwisy ok. linia 150, handlery ok. 252, trasy po fog ok. 328)

**Interfaces:**
- Consumes: wszystko z Task 1–3; `repository.GameRepository.GetByID`, `repository.CharactersRepository.GetByGameID`, `websocket.Hub.BroadcastToGame/BroadcastToUsers`.
- Produces:
  - `func (r *GameRepository) SaveSceneCombat(gameID string, sceneID primitive.ObjectID, expectedVersion int, c *models.Combat) error` (`combat.ErrConflict` przy niedopasowaniu)
  - `websocket.EventSceneCombatUpdated = "SCENE_COMBAT_UPDATED"`, payload `{sceneId}`
  - `service.ErrCombatForbidden`, `service.ErrCombatNotFound`, `service.ErrCombatSceneNotFound`, `service.ErrCombatInvalid`
  - `CombatService` z metodami: `Get`, `ListCombatScenes`, `Start`, `End`, `Update`, `AddEntries`, `UpdateEntry`, `RemoveEntry`, `Reorder`, `Activate`, `Next`, `EndTurn`, `EndRound`
  - Trasy HTTP (wszystkie pod `/games/:id`):
    - `GET /combats` → `{"sceneIds": [...]}` (MG)
    - `GET /scenes/:sceneId/combat` → `{"combat": CombatView|null}`
    - `POST|DELETE|PATCH /scenes/:sceneId/combat`
    - `POST /scenes/:sceneId/combat/entries`, `PATCH|DELETE /scenes/:sceneId/combat/entries/:entryId`
    - `PUT /scenes/:sceneId/combat/order`, `POST .../activate`, `.../next`, `.../end-turn`, `.../end-round`
  - Kody: 403 brak uprawnień, 404 brak sceny/walki/wpisu, 409 konflikt, 400 zły request.

- [ ] **Step 1: Write the failing tests (autoryzacja i budowa wpisów — czyste funkcje serwisu)**

`internal/service/CombatService_test.go`:
```go
package service

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestAuthorizeEndTurn(t *testing.T) {
	player, stranger := primitive.NewObjectID(), primitive.NewObjectID()
	hero := &models.Character{ID: primitive.NewObjectID(), VisibleTo: []primitive.ObjectID{player}}
	placement := models.GameCharacter{ID: primitive.NewObjectID(), CharacterID: hero.ID}
	ctx := &combatCtx{
		scene: &models.Scene{Characters: []models.GameCharacter{placement}},
		chars: map[primitive.ObjectID]*models.Character{hero.ID: hero},
	}
	heroE := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryCharacter, SourceID: placement.ID}
	manual := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual}
	c := &models.Combat{Entries: []models.CombatEntry{heroE, manual}}

	ctx.userID, ctx.isGM = player, false
	if err := authorizeEndTurn(ctx, c, heroE.ID); err != nil {
		t.Fatalf("card holder: %v", err)
	}
	if err := authorizeEndTurn(ctx, c, manual.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("manual entry for a player: %v", err)
	}
	ctx.userID = stranger
	if err := authorizeEndTurn(ctx, c, heroE.ID); !errors.Is(err, ErrCombatForbidden) {
		t.Fatalf("stranger: %v", err)
	}
	ctx.isGM = true
	if err := authorizeEndTurn(ctx, c, manual.ID); err != nil {
		t.Fatalf("GM: %v", err)
	}
	if err := authorizeEndTurn(ctx, nil, manual.ID); !errors.Is(err, ErrCombatNotFound) {
		t.Fatalf("no combat: %v", err)
	}
}

func TestBuildEntryFromSource(t *testing.T) {
	placement := models.GameCharacter{ID: primitive.NewObjectID(), Hidden: true}
	img := models.SceneImage{ID: primitive.NewObjectID(), FileName: "dire-wolf.png", Layer: "tokens"}
	scene := &models.Scene{Characters: []models.GameCharacter{placement}, Images: []models.SceneImage{img}}

	e, err := buildEntry(scene, models.CombatSourceRequest{Kind: "character", SourceID: placement.ID.Hex(), Initiative: 12})
	if err != nil || e.SourceID != placement.ID || !e.Hidden || e.Initiative != 12 {
		t.Fatalf("character: %+v %v (a hidden token starts as a hidden entry)", e, err)
	}
	e, err = buildEntry(scene, models.CombatSourceRequest{Kind: "image", SourceID: img.ID.Hex()})
	if err != nil || e.Name != "dire-wolf" {
		t.Fatalf("image name defaults to the file name without extension: %+v %v", e, err)
	}
	if _, err = buildEntry(scene, models.CombatSourceRequest{Kind: "image", SourceID: primitive.NewObjectID().Hex()}); !errors.Is(err, ErrCombatInvalid) {
		t.Fatalf("image from another scene: %v", err)
	}
	if _, err = buildEntry(scene, models.CombatSourceRequest{Kind: "manual", Name: "   "}); !errors.Is(err, ErrCombatInvalid) {
		t.Fatalf("blank manual name: %v", err)
	}
	e, err = buildEntry(scene, models.CombatSourceRequest{Kind: "manual", Name: " Trap ", Initiative: 3})
	if err != nil || e.Name != "Trap" || !e.SourceID.IsZero() {
		t.Fatalf("manual: %+v %v", e, err)
	}
}

func TestCombatAudience(t *testing.T) {
	visible := &models.Combat{VisibleToPlayers: true}
	hidden := &models.Combat{}
	cases := []struct {
		before, after *models.Combat
		want          bool
	}{
		{nil, hidden, false},
		{hidden, hidden, false},
		{hidden, visible, true}, // reveal: players must learn there is combat now
		{visible, hidden, true}, // hide: players must drop it
		{visible, nil, true},    // end
	}
	for i, tc := range cases {
		if got := playersAffected(tc.before, tc.after); got != tc.want {
			t.Errorf("case %d: got %v want %v", i, got, tc.want)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/service/ -run 'AuthorizeEndTurn|BuildEntryFromSource|CombatAudience'`
Expected: FAIL — `undefined: combatCtx`.

- [ ] **Step 3: Repository + event**

Na końcu `internal/repository/GameRepository.go` (dodaj import `"battle-helper/internal/combat"`):
```go
// SaveSceneCombat writes a scene's combat only if the stored version is still expectedVersion
// (0 = no combat stored). c == nil removes the combat. A mismatch returns combat.ErrConflict: some
// other request wrote in between and this one, built on stale state, must not land.
func (r *GameRepository) SaveSceneCombat(gameID string, sceneID primitive.ObjectID, expectedVersion int, c *models.Combat) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}
	elem := bson.M{"_id": sceneID}
	if expectedVersion == 0 {
		elem["combat"] = nil // matches a missing or null field
	} else {
		elem["combat.version"] = expectedVersion
	}
	filter := bson.M{"_id": objectID, "scenes": bson.M{"$elemMatch": elem}}

	now := time.Now()
	update := bson.M{"$set": bson.M{"scenes.$.combat": c, "updatedAt": now}}
	if c == nil {
		update = bson.M{"$unset": bson.M{"scenes.$.combat": ""}, "$set": bson.M{"updatedAt": now}}
	}
	res, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to save combat: %w", err)
	}
	if res.MatchedCount == 0 {
		return combat.ErrConflict
	}
	return nil
}
```

W `internal/websocket/events.go`, po bloku eventów fog (`EventFogRevealedAll`), dodaj:
```go
	// Combat (initiative tracker). Payload {sceneId}; clients refetch their own masked view.
	EventSceneCombatUpdated = "SCENE_COMBAT_UPDATED"
```

- [ ] **Step 4: Service**

`internal/service/CombatService.go`:
```go
package service

import (
	"errors"
	"path/filepath"
	"strings"
	"time"

	"battle-helper/internal/combat"
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrCombatForbidden     = errors.New("not allowed to change this combat")
	ErrCombatNotFound      = errors.New("no combat on this scene")
	ErrCombatSceneNotFound = errors.New("scene not found")
	ErrCombatInvalid       = errors.New("invalid combat request")
)

const maxCombatNameLen = 60

type CombatService struct {
	gameRepo *repository.GameRepository
	charRepo *repository.CharactersRepository
	hub      *websocket.Hub
}

func NewCombatService(gameRepo *repository.GameRepository, charRepo *repository.CharactersRepository, hub *websocket.Hub) *CombatService {
	return &CombatService{gameRepo: gameRepo, charRepo: charRepo, hub: hub}
}

// combatCtx is everything one request needs, loaded once.
type combatCtx struct {
	game   *models.Game
	scene  *models.Scene
	chars  map[primitive.ObjectID]*models.Character
	userID primitive.ObjectID
	isGM   bool
}

func (s *CombatService) load(gameID string, sceneID, userID primitive.ObjectID) (*combatCtx, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	var scene *models.Scene
	for i := range game.Scenes {
		if game.Scenes[i].ID == sceneID {
			scene = &game.Scenes[i] // scene looked up inside THIS game: a foreign sceneId is a 404
		}
	}
	if scene == nil {
		return nil, ErrCombatSceneNotFound
	}
	list, err := s.charRepo.GetByGameID(gameID)
	if err != nil {
		return nil, err
	}
	chars := make(map[primitive.ObjectID]*models.Character, len(list))
	for i := range list {
		chars[list[i].ID] = &list[i]
	}
	return &combatCtx{game: game, scene: scene, chars: chars, userID: userID, isGM: game.GameMasterID == userID}, nil
}

// Get returns the viewer's masked view; nil = nothing to show.
func (s *CombatService) Get(gameID string, sceneID, userID primitive.ObjectID) (*CombatView, error) {
	ctx, err := s.load(gameID, sceneID, userID)
	if err != nil {
		return nil, err
	}
	if !ctx.isGM && PlayerSceneID(ctx.game, userID) != sceneID {
		return nil, ErrCombatForbidden
	}
	return BuildCombatView(ctx.scene.Combat, ctx.scene, ctx.chars, userID, ctx.isGM), nil
}

// ListCombatScenes lists scenes with a combat in progress (GM only — it reveals hidden combats).
func (s *CombatService) ListCombatScenes(gameID string, userID primitive.ObjectID) ([]string, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	if game.GameMasterID != userID {
		return nil, ErrCombatForbidden
	}
	ids := []string{}
	for _, sc := range game.Scenes {
		if sc.Combat != nil {
			ids = append(ids, sc.ID.Hex())
		}
	}
	return ids, nil
}

type allowFunc func(ctx *combatCtx, current *models.Combat) error
type changeFunc func(ctx *combatCtx, c *models.Combat) (*models.Combat, error)

func gmOnly(ctx *combatCtx, _ *models.Combat) error {
	if !ctx.isGM {
		return ErrCombatForbidden
	}
	return nil
}

func requireCombat(c *models.Combat) error {
	if c == nil {
		return ErrCombatNotFound
	}
	return nil
}

// mutate is the single write path: load, authorize, prune a copy, apply the change, save only if
// nobody wrote in between, broadcast. Every operation below is one allow + one change.
func (s *CombatService) mutate(gameID string, sceneID, userID primitive.ObjectID, allow allowFunc, change changeFunc) error {
	ctx, err := s.load(gameID, sceneID, userID)
	if err != nil {
		return err
	}
	before := ctx.scene.Combat
	if err := allow(ctx, before); err != nil {
		return err
	}
	expected := 0
	work := combat.Clone(before)
	if work != nil {
		expected = before.Version
		combat.Prune(work, ctx.scene, ctx.chars)
	}
	after, err := change(ctx, work)
	if err != nil {
		return err
	}
	if after != nil {
		after.Version = expected + 1
	}
	if err := s.gameRepo.SaveSceneCombat(gameID, sceneID, expected, after); err != nil {
		return err
	}
	s.broadcast(ctx.game, sceneID, before, after)
	return nil
}

// playersAffected: players learn about a change only if they could see the tracker before or after.
// Changes to a combat hidden throughout go to the GM alone, so even its existence stays secret.
func playersAffected(before, after *models.Combat) bool {
	return (before != nil && before.VisibleToPlayers) || (after != nil && after.VisibleToPlayers)
}

func (s *CombatService) broadcast(game *models.Game, sceneID primitive.ObjectID, before, after *models.Combat) {
	if s.hub == nil {
		return
	}
	payload := map[string]interface{}{"sceneId": sceneID.Hex()}
	if playersAffected(before, after) {
		s.hub.BroadcastToGame(game.ID.Hex(), websocket.EventSceneCombatUpdated, payload)
		return
	}
	s.hub.BroadcastToUsers(game.ID.Hex(), websocket.EventSceneCombatUpdated, payload, []string{game.GameMasterID.Hex()})
}

func newCombat() *models.Combat {
	return &models.Combat{Round: 1, Entries: []models.CombatEntry{}, StartedAt: time.Now()}
}

func parseID(hex string) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID, ErrCombatInvalid
	}
	return id, nil
}

func cleanName(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n == "" || len([]rune(n)) > maxCombatNameLen {
		return "", ErrCombatInvalid
	}
	return n, nil
}

// buildEntry turns a request into an entry, checking the source lives on this scene. A hidden token
// starts as a hidden entry; after that the two flags are independent.
func buildEntry(scene *models.Scene, req models.CombatSourceRequest) (models.CombatEntry, error) {
	e := models.CombatEntry{ID: primitive.NewObjectID(), Kind: req.Kind, Initiative: req.Initiative, Hidden: req.Hidden}
	switch req.Kind {
	case models.CombatEntryCharacter:
		id, err := parseID(req.SourceID)
		if err != nil {
			return e, err
		}
		for _, gc := range scene.Characters {
			if gc.ID == id {
				e.SourceID, e.Hidden = id, e.Hidden || gc.Hidden
				return e, nil
			}
		}
		return e, ErrCombatInvalid
	case models.CombatEntryImage:
		id, err := parseID(req.SourceID)
		if err != nil {
			return e, err
		}
		for _, img := range scene.Images {
			if img.ID == id {
				e.SourceID, e.Hidden = id, e.Hidden || img.Hidden
				e.Name = strings.TrimSuffix(img.FileName, filepath.Ext(img.FileName))
				if req.Name != "" {
					if e.Name, err = cleanName(req.Name); err != nil {
						return e, err
					}
				}
				return e, nil
			}
		}
		return e, ErrCombatInvalid
	case models.CombatEntryManual:
		name, err := cleanName(req.Name)
		e.Name = name
		return e, err
	}
	return e, ErrCombatInvalid
}

// authorizeEndTurn: the GM, or a player who may edit the entry's character (CanEditCharacter).
// Image and manual entries belong to the GM.
func authorizeEndTurn(ctx *combatCtx, c *models.Combat, entryID primitive.ObjectID) error {
	if err := requireCombat(c); err != nil {
		return err
	}
	e, ok := combat.Find(c, entryID)
	if !ok {
		return combat.ErrEntryNotFound
	}
	if ctx.isGM {
		return nil
	}
	if e.Kind != models.CombatEntryCharacter {
		return ErrCombatForbidden
	}
	for _, gc := range ctx.scene.Characters {
		if gc.ID == e.SourceID && CanEditCharacter(ctx.chars[gc.CharacterID], ctx.userID, false) {
			return nil
		}
	}
	return ErrCombatForbidden
}

func (s *CombatService) Start(gameID string, sceneID, userID primitive.ObjectID) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if c != nil {
			return c, nil // already running: starting again is a no-op
		}
		return newCombat(), nil
	})
}

func (s *CombatService) End(gameID string, sceneID, userID primitive.ObjectID) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		return nil, requireCombat(c)
	})
}

func (s *CombatService) Update(gameID string, sceneID, userID primitive.ObjectID, req models.UpdateCombatRequest) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		if req.VisibleToPlayers != nil {
			c.VisibleToPlayers = *req.VisibleToPlayers
		}
		return c, nil
	})
}

// AddEntries starts a (hidden) combat if there is none. A token already in combat is skipped.
func (s *CombatService) AddEntries(gameID string, sceneID, userID primitive.ObjectID, req models.AddCombatEntriesRequest) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		if c == nil {
			c = newCombat()
		}
		for _, r := range req.Entries {
			e, err := buildEntry(ctx.scene, r)
			if err != nil {
				return nil, err
			}
			if e.Kind != models.CombatEntryManual && combat.HasSource(c, e.Kind, e.SourceID) {
				continue
			}
			combat.Insert(c, e)
		}
		return c, nil
	})
}

func (s *CombatService) UpdateEntry(gameID string, sceneID, userID primitive.ObjectID, entryHex string, req models.UpdateCombatEntryRequest) error {
	entryID, err := parseID(entryHex)
	if err != nil {
		return err
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		e, ok := combat.Find(c, entryID)
		if !ok {
			return nil, combat.ErrEntryNotFound
		}
		if req.Name != nil {
			if e.Kind == models.CombatEntryCharacter {
				return nil, ErrCombatInvalid // a character's name comes from its sheet
			}
			name, err := cleanName(*req.Name)
			if err != nil {
				return nil, err
			}
			e.Name = name
		}
		if req.Acted != nil {
			e.Acted = *req.Acted
		}
		if req.Hidden != nil {
			e.Hidden = *req.Hidden
		}
		// Last: SetInitiative re-slices Entries, which would leave e pointing at a stale slot.
		if req.Initiative != nil {
			if err := combat.SetInitiative(c, entryID, *req.Initiative); err != nil {
				return nil, err
			}
		}
		return c, nil
	})
}

func (s *CombatService) RemoveEntry(gameID string, sceneID, userID primitive.ObjectID, entryHex string) error {
	entryID, err := parseID(entryHex)
	if err != nil {
		return err
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		return c, combat.Remove(c, entryID)
	})
}

func (s *CombatService) Reorder(gameID string, sceneID, userID primitive.ObjectID, req models.ReorderCombatRequest) error {
	ids := make([]primitive.ObjectID, 0, len(req.EntryIDs))
	for _, h := range req.EntryIDs {
		id, err := parseID(h)
		if err != nil {
			return err
		}
		ids = append(ids, id)
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		if err := combat.Reorder(c, ids); err != nil {
			// The stored list changed (an entry was added, removed or pruned) since the client drew it.
			return nil, combat.ErrConflict
		}
		return c, nil
	})
}

func (s *CombatService) Activate(gameID string, sceneID, userID primitive.ObjectID, req models.CombatEntryRefRequest) error {
	entryID, err := parseID(req.EntryID)
	if err != nil {
		return err
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		return c, combat.Activate(c, entryID)
	})
}

func (s *CombatService) Next(gameID string, sceneID, userID primitive.ObjectID, req models.NextTurnRequest) error {
	expected := primitive.NilObjectID
	if req.AfterEntryID != "" {
		id, err := parseID(req.AfterEntryID)
		if err != nil {
			return err
		}
		expected = id
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		return c, combat.Next(c, expected, combatKilledFunc(ctx.scene, ctx.chars))
	})
}

func (s *CombatService) EndTurn(gameID string, sceneID, userID primitive.ObjectID, req models.CombatEntryRefRequest) error {
	entryID, err := parseID(req.EntryID)
	if err != nil {
		return err
	}
	allow := func(ctx *combatCtx, c *models.Combat) error { return authorizeEndTurn(ctx, c, entryID) }
	return s.mutate(gameID, sceneID, userID, allow, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		return c, combat.Next(c, entryID, combatKilledFunc(ctx.scene, ctx.chars))
	})
}

func (s *CombatService) EndRound(gameID string, sceneID, userID primitive.ObjectID) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		combat.EndRound(c, combatKilledFunc(ctx.scene, ctx.chars))
		return c, nil
	})
}
```

- [ ] **Step 5: Run service tests**

Run: `go test ./internal/service/ -run 'AuthorizeEndTurn|BuildEntryFromSource|CombatAudience' -v && go build ./...`
Expected: PASS, build OK.

- [ ] **Step 6: Handler**

`internal/http/CombatHandler.go`:
```go
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
	case errors.Is(err, service.ErrCombatForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, combat.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrCombatNotFound), errors.Is(err, service.ErrCombatSceneNotFound), errors.Is(err, combat.ErrEntryNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
```

- [ ] **Step 7: Wiring w `main.go`**

Po `noteService := ...` (ok. linia 156):
```go
	combatService := service.NewCombatService(gameRepo, charRepo, hub)
```
Po `noteHandler := ...` (ok. linia 254):
```go
	combatHandler := http.CombatHandler{CombatService: combatService}
```
Po trasach fog (po `fogHandler.RevealAllFog`, ok. linia 328):
```go
	// Combat (initiative tracker), one per scene
	game.GET("/combats", combatHandler.ListCombatScenes)
	game.GET("/scenes/:sceneId/combat", combatHandler.GetCombat)
	game.POST("/scenes/:sceneId/combat", combatHandler.StartCombat)
	game.PATCH("/scenes/:sceneId/combat", combatHandler.UpdateCombat)
	game.DELETE("/scenes/:sceneId/combat", combatHandler.EndCombat)
	game.POST("/scenes/:sceneId/combat/entries", combatHandler.AddEntries)
	game.PATCH("/scenes/:sceneId/combat/entries/:entryId", combatHandler.UpdateEntry)
	game.DELETE("/scenes/:sceneId/combat/entries/:entryId", combatHandler.RemoveEntry)
	game.PUT("/scenes/:sceneId/combat/order", combatHandler.Reorder)
	game.POST("/scenes/:sceneId/combat/activate", combatHandler.Activate)
	game.POST("/scenes/:sceneId/combat/next", combatHandler.Next)
	game.POST("/scenes/:sceneId/combat/end-turn", combatHandler.EndTurn)
	game.POST("/scenes/:sceneId/combat/end-round", combatHandler.EndRound)
```

- [ ] **Step 8: Build + full backend tests**

Run: `go vet ./... && go test ./...`
Expected: wszystko PASS.

- [ ] **Step 9: Smoke na lokalnym stacku (curl)**

JWT MG według pamięci `local-e2e-verification-recipe` (konto aktywne, usunięty `activationToken`). Z `GAME`, `SCENE` i `TOKEN` ustawionymi:
```bash
API=http://localhost:8080; H="Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "$H" $API/games/$GAME/scenes/$SCENE/combat            # 204
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $API/games/$GAME/scenes/$SCENE/combat/entries \
  -d '{"entries":[{"kind":"manual","name":"Trap","initiative":3},{"kind":"manual","name":"Ogre","initiative":12}]}' -o /dev/null -w "%{http_code}\n"   # 204
curl -s -H "$H" $API/games/$GAME/scenes/$SCENE/combat                                                       # Ogre before Trap, round 1
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $API/games/$GAME/scenes/$SCENE/combat/next -d '{"afterEntryId":""}' -o /dev/null -w "%{http_code}\n"  # 204
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $API/games/$GAME/scenes/$SCENE/combat/next -d '{"afterEntryId":""}' -o /dev/null -w "%{http_code}\n"  # 409 (stale)
curl -s -H "$H" $API/games/$GAME | grep -c combat                                                           # 0
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "$H" $API/games/$GAME/scenes/$SCENE/combat           # 204
```
Expected: kody jak w komentarzach. Backend w kontenerze trzeba przebudować (`docker compose up -d --build backend`; jeśli build wisi na keychainie — patrz pamięć `docker-build-credential-hang`, uruchamia użytkownik).

- [ ] **Step 10: Commit**

```bash
git branch --show-current && git add internal/repository/GameRepository.go internal/websocket/events.go internal/service/CombatService.go internal/service/CombatService_test.go internal/http/CombatHandler.go cmd/warhammer-battle-helper/main.go && git commit -m "feat(combat): combat API with versioned writes and masked reads (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API klienta, event WS, hook, kontekst, selektory, tłumaczenia

**Files:**
- Create: `warhammer-battle-helper-front/src/api/combat.js`
- Modify: `warhammer-battle-helper-front/src/websocket/events.js`
- Create: `warhammer-battle-helper-front/src/hooks/useSceneCombat.js`
- Test: `warhammer-battle-helper-front/src/hooks/useSceneCombat.test.jsx`
- Create: `warhammer-battle-helper-front/src/contexts/CombatContext.jsx`
- Create: `warhammer-battle-helper-front/src/components/scene/combat/combatSelectors.js`
- Test: `warhammer-battle-helper-front/src/components/scene/combat/combatSelectors.test.js`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json`

**Interfaces:**
- Consumes: endpointy z Task 4; `axiosInstance` z `api/axios.js`.
- Produces:
  - `api/combat.js`: `getCombat(gameId, sceneId) → view|null`, `getCombatScenes(gameId) → string[]`, `startCombat`, `endCombat`, `setCombatVisibility(g,s,bool)`, `addCombatEntries(g,s,entries)`, `updateCombatEntry(g,s,entryId,patch)`, `removeCombatEntry(g,s,entryId)`, `reorderCombat(g,s,entryIds)`, `activateCombatEntry(g,s,entryId)`, `nextTurn(g,s,afterEntryId)`, `endTurn(g,s,entryId)`, `endRound(g,s)`.
  - `useSceneCombat(gameId, sceneId, isGM) → { combat, combatSceneIds, refresh, onCombatEvent(sceneId), onSourcesChanged() }`
  - `CombatContext`, `CombatProvider({ gameId, scene, isGM, combatState, children })`, `useCombat()` → `{ combat, combatSceneIds, gameId, sceneId, scene, isGM, run(fn), windowOpen, setWindowOpen, stripCollapsed, setStripCollapsed }`; bez providera zwraca `EMPTY_COMBAT` (combat null).
  - selektory: `activeEntry`, `allActed`, `toolbarState`, `isInCombat`, `entryForSource`, `activeSource`, `combatEntriesForSelection`, `combatEntriesInSelection`, `combatCandidates`.

- [ ] **Step 1: API + event**

`src/api/combat.js`:
```js
import axiosInstance from './axios';

const base = (gameId, sceneId) => `/games/${gameId}/scenes/${sceneId}/combat`;

// Writes return 204 and nothing else: the SCENE_COMBAT_UPDATED event makes every client, including
// the caller, refetch its own masked view.
export const getCombat = async (gameId, sceneId) => (await axiosInstance.get(base(gameId, sceneId))).data.combat || null;
export const getCombatScenes = async (gameId) => (await axiosInstance.get(`/games/${gameId}/combats`)).data.sceneIds || [];
export const startCombat = (gameId, sceneId) => axiosInstance.post(base(gameId, sceneId));
export const endCombat = (gameId, sceneId) => axiosInstance.delete(base(gameId, sceneId));
export const setCombatVisibility = (gameId, sceneId, visibleToPlayers) => axiosInstance.patch(base(gameId, sceneId), { visibleToPlayers });
export const addCombatEntries = (gameId, sceneId, entries) => axiosInstance.post(`${base(gameId, sceneId)}/entries`, { entries });
export const updateCombatEntry = (gameId, sceneId, entryId, patch) => axiosInstance.patch(`${base(gameId, sceneId)}/entries/${entryId}`, patch);
export const removeCombatEntry = (gameId, sceneId, entryId) => axiosInstance.delete(`${base(gameId, sceneId)}/entries/${entryId}`);
export const reorderCombat = (gameId, sceneId, entryIds) => axiosInstance.put(`${base(gameId, sceneId)}/order`, { entryIds });
export const activateCombatEntry = (gameId, sceneId, entryId) => axiosInstance.post(`${base(gameId, sceneId)}/activate`, { entryId });
export const nextTurn = (gameId, sceneId, afterEntryId) => axiosInstance.post(`${base(gameId, sceneId)}/next`, { afterEntryId: afterEntryId || '' });
export const endTurn = (gameId, sceneId, entryId) => axiosInstance.post(`${base(gameId, sceneId)}/end-turn`, { entryId });
export const endRound = (gameId, sceneId) => axiosInstance.post(`${base(gameId, sceneId)}/end-round`);
```

W `src/websocket/events.js`, po eventach fog, dodaj:
```js
  // Combat (initiative tracker) — payload { sceneId }; refetch the masked view
  SCENE_COMBAT_UPDATED: 'SCENE_COMBAT_UPDATED',
```

- [ ] **Step 2: Write failing selector tests**

`src/components/scene/combat/combatSelectors.test.js`:
```js
import {
  activeEntry, allActed, toolbarState, isInCombat, entryForSource, activeSource,
  combatEntriesForSelection, combatEntriesInSelection, combatCandidates,
} from './combatSelectors';

const combat = {
  round: 2, activeId: 'e2', visibleToPlayers: true,
  entries: [
    { id: 'e1', kind: 'character', sourceId: 'p1', name: 'Hero', acted: true },
    { id: 'e2', kind: 'image', sourceId: 'i1', name: 'Wolf', acted: false, canEndTurn: true },
    { id: 'e3', kind: 'manual', name: 'Trap', acted: false },
  ],
};
const scene = {
  characters: [{ id: 'p1', characterId: 'c1', name: 'Hero' }, { id: 'p2', characterId: 'c2', name: 'Mage', avatar: '/m.png' }],
  images: [{ id: 'i1', layer: 'tokens', fileName: 'wolf.png' }, { id: 'i2', layer: 'tokens', fileName: 'dire-bear.webp', fileUrl: '/b.webp' }, { id: 'i3', layer: 'background', fileName: 'map.jpg' }],
};

test('activeEntry and activeSource', () => {
  expect(activeEntry(combat).name).toBe('Wolf');
  expect(activeSource(combat)).toEqual({ kind: 'image', sourceId: 'i1' });
  expect(activeEntry(null)).toBeNull();
  expect(activeSource({ ...combat, activeId: 'e3' })).toBeNull();
});

test('allActed counts the dead as done', () => {
  expect(allActed(combat)).toBe(false);
  expect(allActed({ entries: [{ acted: true }, { acted: false, killed: true }] })).toBe(true);
  expect(allActed({ entries: [] })).toBe(false);
});

test('toolbarState', () => {
  expect(toolbarState({ combat: null, isGM: true })).toBe('idle');
  expect(toolbarState({ combat: null, isGM: false })).toBe('none');
  expect(toolbarState({ combat: { ...combat, visibleToPlayers: false }, isGM: true })).toBe('hidden');
  expect(toolbarState({ combat, isGM: true })).toBe('live');
  expect(toolbarState({ combat, isGM: false })).toBe('myTurn');
  expect(toolbarState({ combat: { ...combat, activeId: 'e1' }, isGM: false })).toBe('live');
});

test('isInCombat / entryForSource', () => {
  expect(isInCombat(combat, 'character', 'p1')).toBe(true);
  expect(isInCombat(combat, 'character', 'p2')).toBe(false);
  expect(entryForSource(combat, 'image', 'i1').id).toBe('e2');
  expect(isInCombat(null, 'image', 'i1')).toBe(false);
});

test('selection maps character ids to every placement of that character', () => {
  const sel = [{ kind: 'char', id: 'c2' }, { kind: 'image', id: 'i2' }];
  expect(combatEntriesForSelection(sel, scene)).toEqual([
    { kind: 'character', sourceId: 'p2' }, { kind: 'image', sourceId: 'i2' },
  ]);
  expect(combatEntriesInSelection(combat, [{ kind: 'char', id: 'c1' }, { kind: 'image', id: 'i2' }], scene).map(e => e.id)).toEqual(['e1']);
});

test('combatCandidates lists scene tokens not yet in combat', () => {
  expect(combatCandidates(scene, combat)).toEqual([
    { kind: 'character', sourceId: 'p2', name: 'Mage', avatar: '/m.png' },
    { kind: 'image', sourceId: 'i2', name: 'dire-bear', avatar: '/b.webp' },
  ]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=combatSelectors`
Expected: FAIL — cannot find module `./combatSelectors`.

- [ ] **Step 4: Implement selectors**

`src/components/scene/combat/combatSelectors.js`:
```js
// Pure reads over the masked combat view returned by GET .../combat.

export const activeEntry = (combat) =>
  (combat && combat.entries.find(e => e.id === combat.activeId)) || null;

// The scene token to highlight on the map; manual entries have none.
export const activeSource = (combat) => {
  const a = activeEntry(combat);
  return a && a.kind !== 'manual' ? { kind: a.kind, sourceId: a.sourceId } : null;
};

// Everyone has acted (the dead count as done) — the moment to close the round.
export const allActed = (combat) =>
  !!combat && combat.entries.length > 0 && combat.entries.every(e => e.acted || e.killed);

// The tracker button's look. 'none' = render nothing (a player with no visible combat).
export const toolbarState = ({ combat, isGM }) => {
  if (!combat) return isGM ? 'idle' : 'none';
  if (isGM && !combat.visibleToPlayers) return 'hidden';
  if (!isGM && activeEntry(combat)?.canEndTurn) return 'myTurn';
  return 'live';
};

export const entryForSource = (combat, kind, sourceId) =>
  (combat && combat.entries.find(e => e.kind === kind && e.sourceId === sourceId)) || null;

export const isInCombat = (combat, kind, sourceId) => !!entryForSource(combat, kind, sourceId);

// Map selection items ({kind:'char', id: characterId} | {kind:'image', id}) to add-requests. A
// character id stands for every placement of that character on the scene.
export const combatEntriesForSelection = (selection, scene) => {
  const out = [];
  selection.forEach(s => {
    if (s.kind === 'image') {
      out.push({ kind: 'image', sourceId: s.id });
      return;
    }
    (scene?.characters || [])
      .filter(c => c.characterId === s.id)
      .forEach(c => out.push({ kind: 'character', sourceId: c.id }));
  });
  return out;
};

// Existing entries for the selected tokens.
export const combatEntriesInSelection = (combat, selection, scene) =>
  combatEntriesForSelection(selection, scene)
    .map(s => entryForSource(combat, s.kind, s.sourceId))
    .filter(Boolean);

const stripExtension = (name = '') => name.replace(/\.[^.]+$/, '');

// Scene tokens that can still join: character placements and tokens-layer images.
export const combatCandidates = (scene, combat) => [
  ...(scene?.characters || [])
    .filter(c => !isInCombat(combat, 'character', c.id))
    .map(c => ({ kind: 'character', sourceId: c.id, name: c.name, avatar: c.avatar })),
  ...(scene?.images || [])
    .filter(i => i.layer === 'tokens' && !isInCombat(combat, 'image', i.id))
    .map(i => ({ kind: 'image', sourceId: i.id, name: stripExtension(i.fileName), avatar: i.fileUrl })),
];
```

- [ ] **Step 5: Run selector tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=combatSelectors`
Expected: PASS (6 tests).

- [ ] **Step 6: Write failing hook test**

`src/hooks/useSceneCombat.test.jsx`:
```jsx
import { renderHook, waitFor, act } from '@testing-library/react';
import useSceneCombat from './useSceneCombat';
import { getCombat, getCombatScenes } from '../api/combat';

jest.mock('../api/combat', () => ({ getCombat: jest.fn(), getCombatScenes: jest.fn() }));

beforeEach(() => {
  getCombat.mockReset().mockResolvedValue({ round: 1, entries: [] });
  getCombatScenes.mockReset().mockResolvedValue(['s1']);
});

test('fetches on mount and on scene change', async () => {
  const { result, rerender } = renderHook(({ sceneId }) => useSceneCombat('g1', sceneId, true), { initialProps: { sceneId: 's1' } });
  await waitFor(() => expect(result.current.combat).toEqual({ round: 1, entries: [] }));
  expect(result.current.combatSceneIds).toEqual(['s1']);
  rerender({ sceneId: 's2' });
  await waitFor(() => expect(getCombat).toHaveBeenLastCalledWith('g1', 's2'));
});

test('refetches only for an event about its own scene', async () => {
  const { result } = renderHook(() => useSceneCombat('g1', 's1', false));
  await waitFor(() => expect(getCombat).toHaveBeenCalledTimes(1));
  await act(async () => { result.current.onCombatEvent('other'); });
  expect(getCombat).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.onCombatEvent('s1'); });
  expect(getCombat).toHaveBeenCalledTimes(2);
  expect(getCombatScenes).not.toHaveBeenCalled(); // players never ask for the scene list
});

test('a source change refetches only while a combat is shown', async () => {
  getCombat.mockResolvedValue(null);
  const { result } = renderHook(() => useSceneCombat('g1', 's1', true));
  await waitFor(() => expect(getCombat).toHaveBeenCalledTimes(1));
  await act(async () => { result.current.onSourcesChanged(); });
  expect(getCombat).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 7: Implement hook**

`src/hooks/useSceneCombat.js`:
```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCombat, getCombatScenes } from '../api/combat';

// Combat state of the scene this user is looking at. Fetched on mount and scene change, then
// refetched on WS events (GameSession routes them here) — no polling.
export default function useSceneCombat(gameId, sceneId, isGM) {
  const [combat, setCombat] = useState(null);
  const [combatSceneIds, setCombatSceneIds] = useState([]);
  const sceneRef = useRef(sceneId);
  sceneRef.current = sceneId;
  const combatRef = useRef(combat);
  combatRef.current = combat;

  const refresh = useCallback(async () => {
    if (!gameId || !sceneId) {
      setCombat(null);
      return;
    }
    const requested = sceneId;
    try {
      const next = await getCombat(gameId, requested);
      // A late answer for a scene we already left must not overwrite the new scene's state.
      if (sceneRef.current === requested) setCombat(next);
    } catch {
      if (sceneRef.current === requested) setCombat(null);
    }
  }, [gameId, sceneId]);

  const refreshScenes = useCallback(async () => {
    if (!gameId || !isGM) {
      setCombatSceneIds([]);
      return;
    }
    try {
      setCombatSceneIds(await getCombatScenes(gameId));
    } catch {
      // keep the last known list
    }
  }, [gameId, isGM]);

  useEffect(() => {
    setCombat(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshScenes();
  }, [refreshScenes]);

  const onCombatEvent = useCallback((eventSceneId) => {
    if (eventSceneId === sceneRef.current) refresh();
    refreshScenes();
  }, [refresh, refreshScenes]);

  // A token, image or character changed or vanished. Entries are resolved and pruned server-side,
  // so only a refetch shows it — and only matters while a combat is on screen.
  const onSourcesChanged = useCallback(() => {
    if (combatRef.current) refresh();
  }, [refresh]);

  return { combat, combatSceneIds, refresh, onCombatEvent, onSourcesChanged };
}
```

- [ ] **Step 8: Run hook tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=useSceneCombat`
Expected: PASS (3 tests).

- [ ] **Step 9: Context**

`src/contexts/CombatContext.jsx`:
```jsx
import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

export const CombatContext = createContext(null);

const noop = () => {};

// Without a provider (isolated component tests, the template creator) nothing is in combat.
export const EMPTY_COMBAT = {
  combat: null, combatSceneIds: [], gameId: null, sceneId: null, scene: null, isGM: false,
  run: noop, windowOpen: false, setWindowOpen: noop, stripCollapsed: false, setStripCollapsed: noop,
};

export function useCombat() {
  return useContext(CombatContext) || EMPTY_COMBAT;
}

export function CombatProvider({ gameId, scene, isGM, combatState, children }) {
  const [windowOpen, setWindowOpen] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const { combat, combatSceneIds, refresh } = combatState;
  const sceneId = scene?.id || null;

  // Ending the combat (here or by another GM tab) closes the management window.
  useEffect(() => {
    if (!combat) setWindowOpen(false);
  }, [combat]);

  // Every write goes through run. Success needs nothing: the WS event refetches. A failure — a 409
  // from a stale click included — refetches so the screen shows what actually happened.
  const run = useCallback(async (fn) => {
    try {
      await fn();
    } catch (err) {
      if (err?.response?.status !== 409) console.error('Combat action failed', err);
      refresh();
    }
  }, [refresh]);

  const value = useMemo(() => ({
    combat, combatSceneIds, gameId, sceneId, scene, isGM, run,
    windowOpen, setWindowOpen, stripCollapsed, setStripCollapsed,
  }), [combat, combatSceneIds, gameId, sceneId, scene, isGM, run, windowOpen, stripCollapsed]);

  return <CombatContext.Provider value={value}>{children}</CombatContext.Provider>;
}
```

- [ ] **Step 10: Tłumaczenia**

W `src/locales/en/translation.json` dodaj nowy klucz najwyższego poziomu `"combat"` (obok `"scenes"`):
```json
  "combat": {
    "round": "Round {{round}}",
    "roundShort": "R{{round}}",
    "hiddenBadge": "hidden",
    "next": "Next turn",
    "endTurn": "End turn",
    "endRound": "End round",
    "manage": "Manage combat",
    "sceneIndicator": "Combat in progress",
    "toolbar": {
      "idle": "Start combat",
      "hidden": "Combat hidden from players",
      "live": "Show or collapse the turn order",
      "myTurn": "Your turn!"
    },
    "strip": {
      "move": "Drag to move, double-click to reset"
    },
    "menu": {
      "add": "Add to combat",
      "remove": "Remove from combat"
    },
    "window": {
      "title": "Combat · Round {{round}}",
      "empty": "No one in combat yet. Add tokens below or right-click a token on the map.",
      "drag": "Drag to reorder",
      "initiative": "Initiative",
      "acted": "Acted this round",
      "entryHide": "Hide from players",
      "entryShow": "Show to players",
      "remove": "Remove from combat",
      "rename": "Rename",
      "add": "Add",
      "addFromScene": "On this scene",
      "noCandidates": "Every token on this scene is already in combat.",
      "manualName": "Name",
      "addManual": "Add entry",
      "showToPlayers": "Show to players",
      "hideFromPlayers": "Hide from players",
      "endCombat": "End combat",
      "endCombatConfirm": "End combat? The turn order and round counter will be cleared."
    }
  },
```
W `src/locales/pl/translation.json` ten sam kształt:
```json
  "combat": {
    "round": "Runda {{round}}",
    "roundShort": "R{{round}}",
    "hiddenBadge": "ukryta",
    "next": "Następna tura",
    "endTurn": "Zakończ turę",
    "endRound": "Koniec rundy",
    "manage": "Zarządzaj walką",
    "sceneIndicator": "Trwa walka",
    "toolbar": {
      "idle": "Rozpocznij walkę",
      "hidden": "Walka ukryta przed graczami",
      "live": "Pokaż lub zwiń kolejkę",
      "myTurn": "Twoja tura!"
    },
    "strip": {
      "move": "Przeciągnij, aby przesunąć; dwuklik przywraca"
    },
    "menu": {
      "add": "Dodaj do walki",
      "remove": "Usuń z walki"
    },
    "window": {
      "title": "Walka · Runda {{round}}",
      "empty": "Nikogo jeszcze nie ma w walce. Dodaj tokeny poniżej albo kliknij token na mapie prawym przyciskiem.",
      "drag": "Przeciągnij, aby zmienić kolejność",
      "initiative": "Inicjatywa",
      "acted": "Działał w tej rundzie",
      "entryHide": "Ukryj przed graczami",
      "entryShow": "Pokaż graczom",
      "remove": "Usuń z walki",
      "rename": "Zmień nazwę",
      "add": "Dodaj",
      "addFromScene": "Na tej scenie",
      "noCandidates": "Wszystkie tokeny z tej sceny już są w walce.",
      "manualName": "Nazwa",
      "addManual": "Dodaj wpis",
      "showToPlayers": "Pokaż graczom",
      "hideFromPlayers": "Ukryj przed graczami",
      "endCombat": "Zakończ walkę",
      "endCombatConfirm": "Zakończyć walkę? Kolejka i licznik rund zostaną wyczyszczone."
    }
  },
```

- [ ] **Step 11: Commit**

```bash
git branch --show-current && git add src/api/combat.js src/websocket/events.js src/hooks/useSceneCombat.js src/hooks/useSceneCombat.test.jsx src/contexts/CombatContext.jsx src/components/scene/combat/combatSelectors.js src/components/scene/combat/combatSelectors.test.js src/locales/en/translation.json src/locales/pl/translation.json && git commit -m "feat(combat): client API, scene combat hook and context (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Przycisk w pasku narzędzi

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/combat/CombatToolbarButton.jsx`
- Create: `warhammer-battle-helper-front/src/components/scene/combat/combat.css`
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx` (sygnatura propsów + koniec `.drawing-toolbar__tabs`, ok. linia 79–91), `DrawingToolbar.css`
- Test: `warhammer-battle-helper-front/src/components/scene/combat/CombatToolbarButton.test.jsx`

**Interfaces:**
- Consumes: `useCombat`, `toolbarState`, `startCombat`.
- Produces: `<CombatToolbarButton />` (klasa korzenia `combat-toolbar-button` — kotwica samouczka); prop `trailing` w `DrawingToolbar`.

- [ ] **Step 1: Write failing test**

`src/components/scene/combat/CombatToolbarButton.test.jsx`:
```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import CombatToolbarButton from './CombatToolbarButton';
import { CombatContext, EMPTY_COMBAT } from '../../../contexts/CombatContext';
import { startCombat } from '../../../api/combat';

jest.mock('../../../api/combat', () => ({ startCombat: jest.fn(() => Promise.resolve()) }));

const live = { round: 2, activeId: 'e1', visibleToPlayers: true, entries: [{ id: 'e1', kind: 'character', name: 'Hero', acted: false, canEndTurn: true }] };

const renderWith = (value) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', run: (fn) => fn(), setWindowOpen: jest.fn(), setStripCollapsed: jest.fn(), ...value };
  render(<CombatContext.Provider value={ctx}><CombatToolbarButton /></CombatContext.Provider>);
  return ctx;
};

test('a player with no combat gets no button', () => {
  renderWith({ isGM: false, combat: null });
  expect(screen.queryByRole('button')).toBeNull();
});

test('GM without combat starts a hidden combat and opens the window', () => {
  const ctx = renderWith({ isGM: true, combat: null });
  fireEvent.click(screen.getByRole('button'));
  expect(startCombat).toHaveBeenCalledWith('g', 's');
  expect(ctx.setWindowOpen).toHaveBeenCalledWith(true);
});

test('hidden combat shows the hidden state to the GM', () => {
  renderWith({ isGM: true, combat: { ...live, visibleToPlayers: false } });
  expect(screen.getByRole('button')).toHaveClass('combat-toolbar-button--hidden');
});

test('live combat shows the round and collapses the strip on click', () => {
  const ctx = renderWith({ isGM: true, combat: live });
  expect(screen.getByText('R2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(ctx.setStripCollapsed).toHaveBeenCalled();
});

test("a player whose character acts sees 'my turn'", () => {
  renderWith({ isGM: false, combat: live });
  expect(screen.getByRole('button')).toHaveClass('combat-toolbar-button--myTurn');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CombatToolbarButton`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/components/scene/combat/CombatToolbarButton.jsx`:
```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useCombat } from '../../../contexts/CombatContext';
import { startCombat } from '../../../api/combat';
import { toolbarState } from './combatSelectors';
import './combat.css';

// The tracker's toggle in the scene tool bar. It is not a mode, so it never takes the filled
// "active mode" look of the tabs before it — its states use a glow and badges instead.
export default function CombatToolbarButton() {
  const { t } = useTranslation();
  const { combat, isGM, gameId, sceneId, run, setWindowOpen, setStripCollapsed } = useCombat();
  const state = toolbarState({ combat, isGM });
  if (state === 'none' || !sceneId) return null;

  const handleClick = () => {
    if (state === 'idle') {
      run(() => startCombat(gameId, sceneId));
      setWindowOpen(true);
      return;
    }
    setStripCollapsed(v => !v);
  };

  return (
    <button
      type="button"
      className={`drawing-toolbar__tab combat-toolbar-button combat-toolbar-button--${state}`}
      onClick={handleClick}
      aria-label={t(`combat.toolbar.${state}`)}
    >
      <SportsKabaddiIcon style={{ fontSize: 22 }} />
      {state === 'hidden' && (
        <span className="combat-toolbar-button__badge combat-toolbar-button__badge--icon">
          <VisibilityOffIcon style={{ fontSize: 11 }} />
        </span>
      )}
      {(state === 'live' || state === 'myTurn') && (
        <span className="combat-toolbar-button__badge">{t('combat.roundShort', { round: combat.round })}</span>
      )}
      <span className="drawing-toolbar__tooltip">{t(`combat.toolbar.${state}`)}</span>
    </button>
  );
}
```

`src/components/scene/combat/combat.css` (cały plik; Task 7 i 8 dopisują własne sekcje):
```css
/* ── Tracker button (scene tool bar) ─────────────────────────────── */
.combat-toolbar-button {
  position: relative;
}

.combat-toolbar-button--hidden {
  border-style: dashed;
}

.combat-toolbar-button--live {
  box-shadow: 0 0 0 3px #c9975b, 0 0 10px 2px rgba(232, 181, 106, 0.8);
}

.combat-toolbar-button--myTurn {
  box-shadow: 0 0 0 3px #4f8a3c, 0 0 12px 3px rgba(110, 180, 90, 0.9);
  animation: combat-turn-pulse 1.4s infinite;
}

@keyframes combat-turn-pulse {
  50% { box-shadow: 0 0 0 3px #4f8a3c, 0 0 2px 0 rgba(110, 180, 90, 0.4); }
}

.combat-toolbar-button__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  font-family: 'Cinzel', serif;
  font-size: 10px;
  line-height: 1.4;
  background: #3a2f1f;
  color: #f4e8d8;
  padding: 0 5px;
  border-radius: 8px;
  pointer-events: none;
}

.combat-toolbar-button__badge--icon {
  display: flex;
  padding: 2px;
  border-radius: 50%;
  background: #7a5c42;
}
```

W `DrawingToolbar.jsx`: dodaj `trailing` do destrukturyzacji propsów komponentu i na końcu `<div className="drawing-toolbar__tabs">` (po `{modesForRole(isGM).map(...)}`):
```jsx
        {/* Toggles that are not modes (the combat tracker) sit after a separator. */}
        {trailing && (
          <>
            <span className="drawing-toolbar__separator" aria-hidden="true" />
            {trailing}
          </>
        )}
```
W `DrawingToolbar.css` dopisz:
```css
.drawing-toolbar__separator {
  align-self: center;
  width: 2px;
  height: 32px;
  margin: 0 4px;
  border-radius: 1px;
  background: #b98a52;
  opacity: 0.6;
}
```

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='CombatToolbarButton|DrawingToolbar'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add src/components/scene/combat/CombatToolbarButton.jsx src/components/scene/combat/CombatToolbarButton.test.jsx src/components/scene/combat/combat.css src/components/scene/DrawingToolbar.jsx src/components/scene/DrawingToolbar.css && git commit -m "feat(combat): tracker toggle in the scene tool bar (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pasek kolejki nad mapą

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/combat/useStripPosition.js`
- Test: `warhammer-battle-helper-front/src/components/scene/combat/useStripPosition.test.js`
- Create: `warhammer-battle-helper-front/src/components/scene/combat/CombatPortrait.jsx`
- Create: `warhammer-battle-helper-front/src/components/scene/combat/CombatStrip.jsx`
- Test: `warhammer-battle-helper-front/src/components/scene/combat/CombatStrip.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/combat/combat.css`

**Interfaces:**
- Consumes: `useCombat`, `activeEntry`, `nextTurn`, `endTurn`, `usePortalTooltip`, `resolveFileUrl` (`utils/fileUrl.js`).
- Produces: `<CombatStrip boundsRef={ref} />`; `<CombatPortrait entry small? />`; `clampPosition(pos, bounds, size)`, `readStoredPosition(gameId)`, `default useStripPosition(gameId, boundsRef) → { position, onGripPointerDown, reset, stripRef }`.

- [ ] **Step 1: Write failing tests**

`src/components/scene/combat/useStripPosition.test.js`:
```js
import { clampPosition, readStoredPosition } from './useStripPosition';

test('clampPosition keeps the strip inside the map', () => {
  const bounds = { width: 500, height: 300 };
  const size = { width: 200, height: 50 };
  expect(clampPosition({ x: -20, y: 10 }, bounds, size)).toEqual({ x: 0, y: 10 });
  expect(clampPosition({ x: 450, y: 290 }, bounds, size)).toEqual({ x: 300, y: 250 });
  expect(clampPosition({ x: 10, y: 10 }, { width: 100, height: 20 }, size)).toEqual({ x: 0, y: 0 });
});

describe('readStoredPosition', () => {
  afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

  test('reads a stored position', () => {
    window.localStorage.setItem('combatStripPos:g1', JSON.stringify({ x: 5, y: 6 }));
    expect(readStoredPosition('g1')).toEqual({ x: 5, y: 6 });
  });

  test('ignores garbage', () => {
    window.localStorage.setItem('combatStripPos:g1', '{"x":"a"}');
    expect(readStoredPosition('g1')).toBeNull();
  });

  test('survives a throwing storage (private mode)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readStoredPosition('g1')).toBeNull();
  });
});
```

`src/components/scene/combat/CombatStrip.test.jsx`:
```jsx
import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import CombatStrip from './CombatStrip';
import { CombatContext, EMPTY_COMBAT } from '../../../contexts/CombatContext';
import { nextTurn, endTurn } from '../../../api/combat';

jest.mock('../../../api/combat', () => ({ nextTurn: jest.fn(() => Promise.resolve()), endTurn: jest.fn(() => Promise.resolve()) }));

const combat = {
  round: 3, activeId: 'e2', visibleToPlayers: true,
  entries: [
    { id: 'e1', kind: 'character', name: 'Hero', acted: true },
    { id: 'e2', kind: 'character', name: 'Mage', acted: false, canEndTurn: true },
    { id: 'e3', kind: 'manual', name: 'Trap', acted: false },
  ],
};

const renderWith = (value) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', run: (fn) => fn(), setWindowOpen: jest.fn(), ...value };
  render(<CombatContext.Provider value={ctx}><CombatStrip boundsRef={createRef()} /></CombatContext.Provider>);
  return ctx;
};

beforeEach(() => { nextTurn.mockClear(); endTurn.mockClear(); });

test('nothing without combat or when collapsed', () => {
  renderWith({ combat: null });
  expect(document.querySelector('.combat-strip')).toBeNull();
  renderWith({ combat, stripCollapsed: true });
  expect(document.querySelector('.combat-strip')).toBeNull();
});

test('GM sees the round, portraits and controls; next names the active entry', () => {
  const ctx = renderWith({ combat, isGM: true });
  expect(screen.getByText('Round 3')).toBeInTheDocument();
  expect(document.querySelectorAll('.combat-strip__item')).toHaveLength(3);
  expect(document.querySelector('.combat-strip__item--active')).not.toBeNull();
  expect(document.querySelector('.combat-strip__item--acted')).not.toBeNull();
  fireEvent.click(screen.getByLabelText('Next turn'));
  expect(nextTurn).toHaveBeenCalledWith('g', 's', 'e2');
  fireEvent.click(screen.getByLabelText('Manage combat'));
  expect(ctx.setWindowOpen).toHaveBeenCalledWith(true);
  expect(screen.queryByText('End turn')).toBeNull();
});

test('a player with access ends the active turn', () => {
  renderWith({ combat, isGM: false });
  expect(screen.queryByLabelText('Next turn')).toBeNull();
  fireEvent.click(screen.getByText('End turn'));
  expect(endTurn).toHaveBeenCalledWith('g', 's', 'e2');
});

test('a player without access has no end-turn button', () => {
  renderWith({ combat: { ...combat, entries: combat.entries.map(e => ({ ...e, canEndTurn: false })) }, isGM: false });
  expect(screen.queryByText('End turn')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='useStripPosition|CombatStrip'`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `useStripPosition`**

`src/components/scene/combat/useStripPosition.js`:
```js
import { useState, useRef, useCallback } from 'react';

const storageKey = (gameId) => `combatStripPos:${gameId}`;

// Keep the whole strip inside the map area (bounds/size: {width, height}).
export function clampPosition(pos, bounds, size) {
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, bounds.width - size.width)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, bounds.height - size.height)),
  };
}

// Per-viewer convenience only: null on any storage failure means "default position".
export function readStoredPosition(gameId) {
  try {
    const raw = window.localStorage.getItem(storageKey(gameId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

function storePosition(gameId, pos) {
  try {
    if (pos) window.localStorage.setItem(storageKey(gameId), JSON.stringify(pos));
    else window.localStorage.removeItem(storageKey(gameId));
  } catch {
    // storage unavailable: the position just won't survive a reload
  }
}

// Drag the strip by its grip. Position is in screen space relative to boundsRef (the map area), so
// zooming or panning the map never moves it. null = default (top centre, from CSS).
export default function useStripPosition(gameId, boundsRef) {
  const [position, setPosition] = useState(() => readStoredPosition(gameId));
  const stripRef = useRef(null);

  const onGripPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const strip = stripRef.current;
    const area = boundsRef.current;
    if (!strip || !area) return;
    e.preventDefault();
    const b = area.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const offset = { x: e.clientX - s.left, y: e.clientY - s.top };
    let last = null;
    const move = (ev) => {
      last = clampPosition({ x: ev.clientX - b.left - offset.x, y: ev.clientY - b.top - offset.y }, b, s);
      setPosition(last);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (last) storePosition(gameId, last);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }, [gameId, boundsRef]);

  const reset = useCallback(() => {
    setPosition(null);
    storePosition(gameId, null);
  }, [gameId]);

  return { position, onGripPointerDown, reset, stripRef };
}
```

- [ ] **Step 4: Implement portrait + strip**

`src/components/scene/combat/CombatPortrait.jsx`:
```jsx
import React from 'react';
import BoltIcon from '@mui/icons-material/Bolt';
import CloseIcon from '@mui/icons-material/Close';
import { resolveFileUrl } from '../../../utils/fileUrl';

// One participant's face: avatar or image, a bolt for a manual entry, the initial as fallback.
// A dead participant gets the same red cross as its token.
export default function CombatPortrait({ entry, small = false }) {
  const cls = `combat-portrait${small ? ' combat-portrait--small' : ''}`;
  let face;
  if (entry.kind === 'manual') {
    face = <span className={`${cls} combat-portrait--manual`}><BoltIcon style={{ fontSize: small ? 12 : 16 }} /></span>;
  } else if (entry.avatar) {
    face = <img className={cls} src={resolveFileUrl(entry.avatar)} alt="" draggable={false} />;
  } else {
    face = <span className={`${cls} combat-portrait--initial`}>{(entry.name || '?').charAt(0)}</span>;
  }
  return (
    <span className="combat-portrait__wrap">
      {face}
      {entry.killed && <CloseIcon className="combat-portrait__killed" />}
    </span>
  );
}
```

`src/components/scene/combat/CombatStrip.jsx`:
```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useCombat } from '../../../contexts/CombatContext';
import { usePortalTooltip } from '../../common/PortalTooltip';
import { nextTurn, endTurn } from '../../../api/combat';
import { activeEntry } from './combatSelectors';
import useStripPosition from './useStripPosition';
import CombatPortrait from './CombatPortrait';
import './combat.css';

function itemClass(entry, combat) {
  let cls = 'combat-strip__item';
  if (entry.id === combat.activeId) cls += ' combat-strip__item--active';
  if (entry.acted) cls += ' combat-strip__item--acted';
  if (entry.hidden) cls += ' combat-strip__item--hidden';
  return cls;
}

// The turn order over the map, for everyone on the scene. Names show in a tooltip; values never
// show here (players do not receive them, and the GM edits them in the window).
export default function CombatStrip({ boundsRef }) {
  const { t } = useTranslation();
  const { combat, isGM, gameId, sceneId, run, stripCollapsed, setWindowOpen } = useCombat();
  const { position, onGripPointerDown, reset, stripRef } = useStripPosition(gameId, boundsRef);
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  if (!combat || stripCollapsed) return null;

  const active = activeEntry(combat);
  const style = position ? { left: position.x, top: position.y, transform: 'none' } : undefined;

  return (
    <div ref={stripRef} className={`combat-strip${!combat.visibleToPlayers ? ' combat-strip--hidden' : ''}`} style={style}>
      <button
        type="button"
        className="combat-strip__grip"
        onPointerDown={onGripPointerDown}
        onDoubleClick={reset}
        aria-label={t('combat.strip.move')}
      >
        <DragIndicatorIcon style={{ fontSize: 16 }} />
      </button>
      <span className="combat-strip__round">{t('combat.round', { round: combat.round })}</span>
      {isGM && !combat.visibleToPlayers && <span className="combat-strip__hidden-badge">{t('combat.hiddenBadge')}</span>}
      <ol className="combat-strip__list">
        {combat.entries.map(entry => (
          <li
            key={entry.id}
            className={itemClass(entry, combat)}
            onMouseEnter={e => showTooltip(entry.name, e.currentTarget)}
            onMouseLeave={hideTooltip}
          >
            <CombatPortrait entry={entry} />
            {entry.hidden && <VisibilityOffIcon className="combat-strip__hidden-icon" />}
          </li>
        ))}
      </ol>
      {isGM && (
        <>
          <button
            type="button"
            className="combat-strip__btn combat-strip__btn--primary"
            onClick={() => run(() => nextTurn(gameId, sceneId, combat.activeId))}
            aria-label={t('combat.next')}
          >
            <ArrowForwardIcon style={{ fontSize: 16 }} />
          </button>
          <button type="button" className="combat-strip__btn" onClick={() => setWindowOpen(true)} aria-label={t('combat.manage')}>
            <SettingsIcon style={{ fontSize: 16 }} />
          </button>
        </>
      )}
      {!isGM && active?.canEndTurn && (
        <button
          type="button"
          className="combat-strip__btn combat-strip__btn--end-turn"
          onClick={() => run(() => endTurn(gameId, sceneId, active.id))}
        >
          <CheckIcon style={{ fontSize: 14 }} />
          {t('combat.endTurn')}
        </button>
      )}
      {tooltipNode}
    </div>
  );
}
```

Dopisz do `combat.css`:
```css
/* ── Turn order strip (over the map, screen space) ───────────────── */
.combat-strip {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(246, 236, 220, 0.97);
  border: 2px solid #7a5c42;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  color: #3a2f1f;
}

.combat-strip--hidden {
  border-style: dashed;
}

.combat-strip__grip {
  display: flex;
  border: none;
  background: none;
  color: #c4a882;
  cursor: grab;
  padding: 0;
  touch-action: none;
}

.combat-strip__round {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  color: #7a5c42;
  white-space: nowrap;
}

.combat-strip__hidden-badge {
  font-size: 10px;
  background: #3a2f1f;
  color: #f4e8d8;
  padding: 1px 6px;
  border-radius: 8px;
}

.combat-strip__list {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.combat-strip__item {
  position: relative;
  display: flex;
}

.combat-strip__item--active .combat-portrait {
  box-shadow: 0 0 0 3px #c9975b, 0 0 8px 2px #e8b56a;
}

.combat-strip__item--acted {
  opacity: 0.35;
  filter: grayscale(1);
}

.combat-strip__hidden-icon {
  position: absolute;
  right: -5px;
  bottom: -5px;
  font-size: 12px !important;
  background: #3a2f1f;
  color: #f4e8d8;
  border-radius: 50%;
  padding: 1px;
}

.combat-strip__btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: 'Cinzel', serif;
  font-size: 10px;
  border: 1px solid #7a5c42;
  background: #fff9f0;
  color: #7a5c42;
  padding: 4px 6px;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
}

.combat-strip__btn--primary {
  background: #7a5c42;
  color: #fff;
}

.combat-strip__btn--end-turn {
  background: #4f8a3c;
  border-color: #3d6d2e;
  color: #fff;
}

/* ── Portrait (strip + window) ───────────────────────────────────── */
.combat-portrait__wrap {
  position: relative;
  display: inline-flex;
}

.combat-portrait {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid #7a5c42;
  object-fit: cover;
  background: #fff9f0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #7a5c42;
  font-family: 'Cinzel', serif;
  box-sizing: border-box;
}

.combat-portrait--small {
  width: 22px;
  height: 22px;
  font-size: 11px;
}

.combat-portrait--manual {
  border-style: dashed;
}

.combat-portrait__killed {
  position: absolute;
  inset: 0;
  margin: auto;
  color: #b3261e;
  font-size: 26px !important;
  pointer-events: none;
}
```

- [ ] **Step 5: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='useStripPosition|CombatStrip'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current && git add src/components/scene/combat/useStripPosition.js src/components/scene/combat/useStripPosition.test.js src/components/scene/combat/CombatPortrait.jsx src/components/scene/combat/CombatStrip.jsx src/components/scene/combat/CombatStrip.test.jsx src/components/scene/combat/combat.css && git commit -m "feat(combat): draggable turn order strip over the map (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Okno „Walka” (zarządzanie MG)

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/combat/CombatWindow.jsx`
- Test: `warhammer-battle-helper-front/src/components/scene/combat/CombatWindow.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/combat/combat.css`
- Modify: `warhammer-battle-helper-front/src/components/WindowBar.jsx` (`KIND_ICONS`, linie 11–15)

**Interfaces:**
- Consumes: `useCombat`, `DraggablePopup` (`windowId`, `windowKind`, `title`, `onClose`, `initialWidth`), `SortableList` + `useSortableItem` + `DragGrip` (`components/common/sortable/`), `ConfirmModal`, `combatCandidates`, `allActed`, API z Task 5.
- Produces: `<CombatWindow />` — renderuje się sam, gdy `isGM && windowOpen && combat`.

- [ ] **Step 1: Write failing test**

`src/components/scene/combat/CombatWindow.test.jsx`:
```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import CombatWindow from './CombatWindow';
import { CombatContext, EMPTY_COMBAT } from '../../../contexts/CombatContext';
import { WindowManagerProvider } from '../../../contexts/WindowManagerContext';
import * as api from '../../../api/combat';

jest.mock('../../../api/combat', () => {
  const ok = () => jest.fn(() => Promise.resolve());
  return {
    activateCombatEntry: ok(), updateCombatEntry: ok(), removeCombatEntry: ok(), reorderCombat: ok(),
    nextTurn: ok(), endRound: ok(), endCombat: ok(), setCombatVisibility: ok(), addCombatEntries: ok(),
  };
});

const combat = {
  round: 2, activeId: 'e1', visibleToPlayers: false,
  entries: [
    { id: 'e1', kind: 'character', sourceId: 'p1', name: 'Hero', initiative: 15, acted: false },
    { id: 'e2', kind: 'manual', name: 'Trap', initiative: 3, acted: true, hidden: true },
  ],
};
const scene = { id: 's', characters: [{ id: 'p1', name: 'Hero' }, { id: 'p2', name: 'Mage' }], images: [] };

const renderWindow = (over = {}) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', scene, isGM: true, windowOpen: true, combat, run: (fn) => fn(), setWindowOpen: jest.fn(), ...over };
  render(
    <WindowManagerProvider>
      <CombatContext.Provider value={ctx}><CombatWindow /></CombatContext.Provider>
    </WindowManagerProvider>,
  );
  return ctx;
};

beforeEach(() => Object.values(api).forEach(fn => fn.mockClear()));

test('renders nothing for players or when closed', () => {
  renderWindow({ isGM: false });
  expect(screen.queryByText('Hero')).toBeNull();
});

test('row actions call the API', () => {
  renderWindow();
  fireEvent.click(screen.getByText('Trap'));
  expect(api.activateCombatEntry).toHaveBeenCalledWith('g', 's', 'e2');

  const value = screen.getAllByLabelText('Initiative')[0];
  fireEvent.change(value, { target: { value: '18' } });
  fireEvent.blur(value);
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e1', { initiative: 18 });

  fireEvent.click(screen.getAllByLabelText('Acted this round')[0]);
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e1', { acted: true });

  fireEvent.click(screen.getByLabelText('Show to players'));
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e2', { hidden: false });

  fireEvent.click(screen.getAllByLabelText('Remove from combat')[0]);
  expect(api.removeCombatEntry).toHaveBeenCalledWith('g', 's', 'e1');
});

test('footer actions', () => {
  renderWindow();
  fireEvent.click(screen.getByText('Next turn'));
  expect(api.nextTurn).toHaveBeenCalledWith('g', 's', 'e1');
  fireEvent.click(screen.getByText('End round'));
  expect(api.endRound).toHaveBeenCalledWith('g', 's');
  // "Show to players" exists twice: the hidden row's aria-label and the footer button's text.
  fireEvent.click(screen.getByText('Show to players', { selector: '.combat-window__footer button' }));
  expect(api.setCombatVisibility).toHaveBeenCalledWith('g', 's', true);
});

test('end combat asks first', () => {
  renderWindow();
  fireEvent.click(screen.getByText('End combat'));
  expect(api.endCombat).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByText('End combat').pop());
  expect(api.endCombat).toHaveBeenCalledWith('g', 's');
});

test('adding a scene token and a manual entry', () => {
  renderWindow();
  fireEvent.click(screen.getByText('Add'));
  fireEvent.click(screen.getByText('Mage'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'character', sourceId: 'p2' }]);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reinforcements' } });
  fireEvent.click(screen.getByText('Add entry'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'manual', name: 'Reinforcements', initiative: 0 }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CombatWindow`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/components/scene/combat/CombatWindow.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DraggablePopup from '../../common/DraggablePopup';
import ConfirmModal from '../../common/ConfirmModal';
import SortableList from '../../common/sortable/SortableList';
import useSortableItem from '../../common/sortable/useSortableItem';
import DragGrip from '../../common/sortable/DragGrip';
import { useCombat } from '../../../contexts/CombatContext';
import {
  activateCombatEntry, updateCombatEntry, removeCombatEntry, reorderCombat, nextTurn, endRound,
  endCombat, setCombatVisibility, addCombatEntries,
} from '../../../api/combat';
import { allActed, combatCandidates } from './combatSelectors';
import CombatPortrait from './CombatPortrait';
import './combat.css';

function CombatRow({ entry, isActive }) {
  const { t } = useTranslation();
  const { gameId, sceneId, run } = useCombat();
  const { rootProps, gripProps, isDragging } = useSortableItem(entry.id);
  const [value, setValue] = useState(String(entry.initiative ?? 0));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(entry.name);
  useEffect(() => setValue(String(entry.initiative ?? 0)), [entry.initiative]);
  useEffect(() => setName(entry.name), [entry.name]);

  const patch = (body) => run(() => updateCombatEntry(gameId, sceneId, entry.id, body));
  const commitValue = () => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n === entry.initiative) {
      setValue(String(entry.initiative ?? 0));
      return;
    }
    patch({ initiative: n });
  };
  const commitName = () => {
    setRenaming(false);
    const n = name.trim();
    if (!n || n === entry.name) {
      setName(entry.name);
      return;
    }
    patch({ name: n });
  };

  let cls = 'combat-row';
  if (isActive) cls += ' combat-row--active';
  if (entry.acted) cls += ' combat-row--acted';
  if (isDragging) cls += ' combat-row--dragging';

  return (
    <li {...rootProps} className={cls}>
      <DragGrip {...gripProps} label={t('combat.window.drag')} />
      <CombatPortrait entry={entry} small />
      {renaming ? (
        <input
          autoFocus
          className="combat-row__name-input"
          value={name}
          maxLength={60}
          onChange={e => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(entry.name); setRenaming(false); } }}
          aria-label={t('combat.window.rename')}
        />
      ) : (
        <button type="button" className="combat-row__name" onClick={() => run(() => activateCombatEntry(gameId, sceneId, entry.id))}>
          {entry.name}
        </button>
      )}
      {entry.kind !== 'character' && !renaming && (
        <button type="button" className="combat-row__icon" onClick={() => setRenaming(true)} aria-label={t('combat.window.rename')}>
          <EditIcon style={{ fontSize: 14 }} />
        </button>
      )}
      <input
        type="number"
        className="combat-row__value"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commitValue}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        aria-label={t('combat.window.initiative')}
      />
      <button type="button" className="combat-row__icon" aria-pressed={entry.acted} onClick={() => patch({ acted: !entry.acted })} aria-label={t('combat.window.acted')}>
        {entry.acted ? <CheckCircleIcon style={{ fontSize: 16 }} /> : <RadioButtonUncheckedIcon style={{ fontSize: 16 }} />}
      </button>
      <button
        type="button"
        className="combat-row__icon"
        onClick={() => patch({ hidden: !entry.hidden })}
        aria-label={t(entry.hidden ? 'combat.window.entryShow' : 'combat.window.entryHide')}
      >
        {entry.hidden ? <VisibilityOffIcon style={{ fontSize: 16 }} /> : <VisibilityIcon style={{ fontSize: 16 }} />}
      </button>
      <button type="button" className="combat-row__icon" onClick={() => run(() => removeCombatEntry(gameId, sceneId, entry.id))} aria-label={t('combat.window.remove')}>
        <CloseIcon style={{ fontSize: 16 }} />
      </button>
    </li>
  );
}

function CombatAddPanel() {
  const { t } = useTranslation();
  const { gameId, sceneId, scene, combat, run } = useCombat();
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState('0');
  const candidates = combatCandidates(scene, combat);

  const addManual = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    run(() => addCombatEntries(gameId, sceneId, [{ kind: 'manual', name: n, initiative: parseInt(initiative, 10) || 0 }]));
    setName('');
    setInitiative('0');
  };

  return (
    <div className="combat-window__add">
      <div className="combat-window__add-label">{t('combat.window.addFromScene')}</div>
      {candidates.length === 0 && <p className="combat-window__hint">{t('combat.window.noCandidates')}</p>}
      <ul className="combat-window__candidates">
        {candidates.map(c => (
          <li key={`${c.kind}:${c.sourceId}`}>
            <button type="button" className="combat-window__candidate" onClick={() => run(() => addCombatEntries(gameId, sceneId, [{ kind: c.kind, sourceId: c.sourceId }]))}>
              <CombatPortrait entry={c} small />
              {c.name}
            </button>
          </li>
        ))}
      </ul>
      <form className="combat-window__manual" onSubmit={addManual}>
        <input value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label={t('combat.window.manualName')} placeholder={t('combat.window.manualName')} />
        <input type="number" className="combat-row__value" value={initiative} onChange={e => setInitiative(e.target.value)} aria-label={t('combat.window.initiative')} />
        <button type="submit" className="combat-strip__btn">{t('combat.window.addManual')}</button>
      </form>
    </div>
  );
}

// GM's management window. Lives in the Window Manager, so it moves, minimises to the window bar and
// closes like a character sheet.
export default function CombatWindow() {
  const { t } = useTranslation();
  const { combat, isGM, windowOpen, setWindowOpen, gameId, sceneId, run } = useCombat();
  const [adding, setAdding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!isGM || !windowOpen || !combat) return null;

  const roundDone = allActed(combat);

  return (
    <DraggablePopup
      title={t('combat.window.title', { round: combat.round })}
      onClose={() => setWindowOpen(false)}
      windowId="combat"
      windowKind="combat"
      initialWidth={420}
      className="combat-window"
    >
      <div className="combat-window__body">
        {combat.entries.length === 0 && <p className="combat-window__hint">{t('combat.window.empty')}</p>}
        <SortableList items={combat.entries} onReorder={next => run(() => reorderCombat(gameId, sceneId, next.map(e => e.id)))}>
          <ol className="combat-window__list">
            {combat.entries.map(e => <CombatRow key={e.id} entry={e} isActive={e.id === combat.activeId} />)}
          </ol>
        </SortableList>
        {adding && <CombatAddPanel />}
        <div className="combat-window__footer">
          <button
            type="button"
            className={`combat-strip__btn${roundDone ? '' : ' combat-strip__btn--primary'}`}
            onClick={() => run(() => nextTurn(gameId, sceneId, combat.activeId))}
          >
            {t('combat.next')} <ArrowForwardIcon style={{ fontSize: 12 }} />
          </button>
          <button
            type="button"
            className={`combat-strip__btn${roundDone ? ' combat-strip__btn--primary' : ''}`}
            onClick={() => run(() => endRound(gameId, sceneId))}
          >
            {t('combat.endRound')}
          </button>
          <button type="button" className="combat-strip__btn" aria-pressed={adding} onClick={() => setAdding(v => !v)}>
            <AddIcon style={{ fontSize: 12 }} />{t('combat.window.add')}
          </button>
          <button type="button" className="combat-strip__btn" onClick={() => run(() => setCombatVisibility(gameId, sceneId, !combat.visibleToPlayers))}>
            {t(combat.visibleToPlayers ? 'combat.window.hideFromPlayers' : 'combat.window.showToPlayers')}
          </button>
          <button type="button" className="combat-strip__btn combat-strip__btn--danger" onClick={() => setConfirmEnd(true)}>
            {t('combat.window.endCombat')}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmEnd}
        message={t('combat.window.endCombatConfirm')}
        confirmLabel={t('combat.window.endCombat')}
        onConfirm={() => { setConfirmEnd(false); run(() => endCombat(gameId, sceneId)); }}
        onCancel={() => setConfirmEnd(false)}
      />
    </DraggablePopup>
  );
}
```

Dopisz do `combat.css`:
```css
/* ── Management window (Window Manager popup, light sheet palette) ─ */
.combat-window__body {
  padding: 8px;
  color: #3a2f1f;
  font-size: 14px;
}

.combat-window__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.combat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-top: 1px solid #eadcc4;
  background: #fff9f0;
}

.combat-row--active {
  background: #f1d9b0;
  font-weight: bold;
}

.combat-row--acted .combat-row__name {
  opacity: 0.5;
  text-decoration: line-through;
}

.combat-row--dragging {
  position: relative;
  z-index: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.combat-row__name {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combat-row__name-input {
  flex: 1;
  min-width: 0;
}

.combat-row__value {
  width: 44px;
  text-align: center;
  border: 1px solid #c4a882;
  background: #fff9f0;
  color: #3a2f1f;
}

.combat-row__value:focus,
.combat-row__name-input:focus {
  border-color: #7a5c42;
  outline: none;
}

.combat-row__icon {
  display: flex;
  border: none;
  background: none;
  color: #7a5c42;
  cursor: pointer;
  padding: 2px;
}

.combat-window__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 8px;
  margin-top: 6px;
  border-top: 1px solid #c4a882;
}

.combat-strip__btn--danger {
  color: #8a2b1f;
  border-color: #8a2b1f;
}

.combat-window__hint {
  margin: 6px 0;
  color: #7a5c42;
  font-style: italic;
}

.combat-window__add {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #c4a882;
}

.combat-window__add-label {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  color: #7a5c42;
}

.combat-window__candidates {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
  padding: 0;
  list-style: none;
}

.combat-window__candidate {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #c4a882;
  background: #fff9f0;
  color: #3a2f1f;
  border-radius: 12px;
  padding: 2px 8px 2px 2px;
  cursor: pointer;
}

.combat-window__manual {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.combat-window__manual input:first-child {
  flex: 1;
  border: 1px solid #c4a882;
  background: #fff9f0;
  color: #3a2f1f;
}
```

W `WindowBar.jsx`: dodaj import `import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';` i wpis `combat: SportsKabaddiIcon,` w `KIND_ICONS`.

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='CombatWindow|WindowBar'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add src/components/scene/combat/CombatWindow.jsx src/components/scene/combat/CombatWindow.test.jsx src/components/scene/combat/combat.css src/components/WindowBar.jsx && git commit -m "feat(combat): GM combat window with reorder, add and visibility (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Wpięcie w ekran gry (GameSession, DndContext, menu, tokeny, pasek scen)

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx`
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx` (blok `.fight-grid-wrapper` ok. linia 987, `.scene-tools` ok. linia 1006)
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneTokenMultiContextMenu.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx` (`onContextMenu` ok. linia 727, render menu ok. linia 899)
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` (className ok. linia 442, `SceneImageContextMenu` ok. linia 557)
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImageContextMenu.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx` (className ok. linia 278)
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneSelector.jsx` (zakładka ok. linia 121)
- Modify: `warhammer-battle-helper-front/src/components/scene/combat/combat.css`
- Test: `warhammer-battle-helper-front/src/components/scene/SceneTokenMultiContextMenu.combat.test.jsx`

**Interfaces:**
- Consumes: wszystko z Task 5–8.
- Produces: `SceneTokenMultiContextMenu` dostaje propsy `onAddToCombat?`, `onRemoveFromCombat?`; `SceneImageContextMenu` dostaje `combatAction?: { label, onSelect }`.

- [ ] **Step 1: Write failing menu test**

`src/components/scene/SceneTokenMultiContextMenu.combat.test.jsx`:
```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import SceneTokenMultiContextMenu from './SceneTokenMultiContextMenu';

const base = { x: 0, y: 0, selection: [{ kind: 'char', id: 'c1' }], onDelete: jest.fn(), onSetLock: jest.fn(), onSetLayer: jest.fn(), onResetRotation: jest.fn() };

test('add to combat acts on left mousedown and closes', () => {
  const onAddToCombat = jest.fn();
  const onClose = jest.fn();
  render(<SceneTokenMultiContextMenu {...base} onAddToCombat={onAddToCombat} onClose={onClose} />);
  fireEvent.mouseDown(screen.getByText('Add to combat'), { button: 0 });
  expect(onAddToCombat).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('remove from combat is offered instead when given', () => {
  render(<SceneTokenMultiContextMenu {...base} onRemoveFromCombat={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('Remove from combat')).toBeInTheDocument();
  expect(screen.queryByText('Add to combat')).toBeNull();
});

test('no combat items without handlers (players, creator)', () => {
  render(<SceneTokenMultiContextMenu {...base} onClose={jest.fn()} />);
  expect(screen.queryByText('Add to combat')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=SceneTokenMultiContextMenu.combat`
Expected: FAIL — text not found.

- [ ] **Step 3: Menus**

W `SceneTokenMultiContextMenu.jsx`: dodaj `SportsKabaddiIcon` import (`import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';`), propsy `onAddToCombat, onRemoveFromCombat` w sygnaturze i — przed przyciskiem `resetRotationAll` — :
```jsx
      {(onAddToCombat || onRemoveFromCombat) && (
        <>
          <button
            className="scene-context-menu__item"
            onMouseDown={act(() => (onRemoveFromCombat || onAddToCombat)())}
          >
            <SportsKabaddiIcon style={{ fontSize: 14, verticalAlign: 'middle' }} />{' '}
            {onRemoveFromCombat ? t('combat.menu.remove') : t('combat.menu.add')}
          </button>
          <div className="scene-context-menu__divider" />
        </>
      )}
```

W `SceneImageContextMenu.jsx`: prop `combatAction` w sygnaturze i — jako pierwsza pozycja po kontrolce z-index — :
```jsx
      {combatAction && (
        <>
          <button className="scene-context-menu__item" onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); combatAction.onSelect(); onClose(); } }}>
            <SportsKabaddiIcon style={{ fontSize: 14, verticalAlign: 'middle' }} /> {combatAction.label}
          </button>
          <div className="scene-context-menu__divider" />
        </>
      )}
```
(+ import `SportsKabaddiIcon`).

- [ ] **Step 4: SceneViewport — menu grupowe i pojedynczy token postaci**

Importy w `SceneViewport.jsx`:
```js
import { useCombat } from '../../contexts/CombatContext';
import { addCombatEntries, removeCombatEntry } from '../../api/combat';
import { combatEntriesForSelection, combatEntriesInSelection } from './combat/combatSelectors';
```
W ciele komponentu (obok innych hooków, przed `return`):
```js
  const combatCtx = useCombat();
  // GM-only, like the rest of the group menu. All selected tokens already in combat → offer removal.
  const combatMenuHandlers = useMemo(() => {
    if (!isGM || !displayedScene) return {};
    const sources = combatEntriesForSelection(selectedTokens, displayedScene);
    const existing = combatEntriesInSelection(combatCtx.combat, selectedTokens, displayedScene);
    if (sources.length > 0 && existing.length === sources.length) {
      return {
        onRemoveFromCombat: () => existing.forEach(e => combatCtx.run(() => removeCombatEntry(gameId, displayedScene.id, e.id))),
      };
    }
    return { onAddToCombat: () => combatCtx.run(() => addCombatEntries(gameId, displayedScene.id, sources)) };
  }, [isGM, displayedScene, selectedTokens, combatCtx, gameId]);
```

W `onContextMenu` zawartości (ok. linia 734) zmień warunek, żeby lone zaznaczony token postaci też otwierał menu grupowe (tokeny postaci nie mają własnego menu; obrazek nadal dostaje swoje):
```js
                  const loneChar = selectedTokens.length === 1 && selectedTokens[0].kind === 'char';
                  if (isGM && editingLayer === 'select' && (selectedTokens.length > 1 || loneChar)) {
```
i dopisz komentarz nad nim:
```js
                  // A lone selected CHARACTER token opens it too: character tokens have no menu of
                  // their own, and this is where "Add to combat" lives.
```
W renderze `SceneTokenMultiContextMenu` dodaj `{...combatMenuHandlers}`.

- [ ] **Step 5: SceneImage — pozycja w menu obrazka + poświata**

W `SceneImage.jsx` importy:
```js
import { useCombat } from '../../contexts/CombatContext';
import { addCombatEntries, removeCombatEntry } from '../../api/combat';
import { entryForSource, activeSource } from './combat/combatSelectors';
```
W ciele:
```js
  const combatCtx = useCombat();
  const combatEntry = entryForSource(combatCtx.combat, 'image', image.id);
  const combatActive = (() => { const a = activeSource(combatCtx.combat); return !!a && a.kind === 'image' && a.sourceId === image.id; })();
  const combatAction = isGM && image.layer === 'tokens' && combatCtx.sceneId === sceneId
    ? {
      label: t(combatEntry ? 'combat.menu.remove' : 'combat.menu.add'),
      onSelect: () => combatCtx.run(() => (combatEntry
        ? removeCombatEntry(gameId, sceneId, combatEntry.id)
        : addCombatEntries(gameId, sceneId, [{ kind: 'image', sourceId: image.id }]))),
    }
    : undefined;
```
(Jeśli `t` nie jest jeszcze dostępne w komponencie: `const { t } = useTranslation();` z `react-i18next`.)
Do className korzenia `scene-image` (linia 442) dopisz `${combatActive ? ' scene-image--combat-active' : ''}`, a do `<SceneImageContextMenu ...>` prop `combatAction={combatAction}`.

- [ ] **Step 6: MapCharacterToken — poświata**

W `MapCharacterToken.jsx`:
```js
import { useCombat } from '../../contexts/CombatContext';
import { activeSource } from './combat/combatSelectors';
```
W ciele:
```js
  const combatSrc = activeSource(useCombat().combat);
  const combatActive = !!combatSrc && combatSrc.kind === 'character' && combatSrc.sourceId === placementId;
```
Do className `map-char-token` (linia 278) dopisz `${combatActive ? ' map-char-token--combat-active' : ''}`.

- [ ] **Step 7: SceneSelector — ikona walki**

W `SceneSelector.jsx`:
```js
import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';
import { useCombat } from '../../contexts/CombatContext';
```
W ciele: `const { combatSceneIds } = useCombat();`. W przycisku zakładki, po ikonie muzyki:
```jsx
                {combatSceneIds.includes(scene.id) && (
                  <SportsKabaddiIcon className="scene-selector__combat-icon" aria-label={t('combat.sceneIndicator')} />
                )}
```

Dopisz do `combat.css`:
```css
/* ── Map highlight of the acting token, scene tab indicator ─────── */
.map-char-token--combat-active .map-char-token__avatar,
.scene-image.scene-image--combat-active {
  box-shadow: 0 0 0 3px #c9975b, 0 0 12px 4px rgba(232, 181, 106, 0.85);
  border-radius: 50%;
}

.scene-image.scene-image--combat-active {
  border-radius: 4px;
}

.scene-selector__combat-icon {
  font-size: 14px !important;
  margin-left: 4px;
  vertical-align: middle;
}
```
(Selektor obrazka podwojony — reguła z pamięci `css-modifier-cascade-order`.)

- [ ] **Step 8: DndContext — przycisk i pasek**

W `DndContext.jsx` importy:
```js
import CombatToolbarButton from './scene/combat/CombatToolbarButton';
import CombatStrip from './scene/combat/CombatStrip';
```
W komponencie: `const fightGridWrapperRef = useRef(null);` (dodaj `useRef` do importu React, jeśli brak).
`<div className="fight-grid-wrapper" style={{ position: 'relative' }}>` → dodaj `ref={fightGridWrapperRef}`; zaraz po `{sceneSelector}` wstaw:
```jsx
          {currentScene && <CombatStrip boundsRef={fightGridWrapperRef} />}
```
W `<DrawingToolbar ...>` dodaj prop `trailing={<CombatToolbarButton />}`.

- [ ] **Step 9: GameSession — hook, WS, provider, okno**

Importy:
```js
import useSceneCombat from '../hooks/useSceneCombat';
import { CombatProvider } from '../contexts/CombatContext';
import CombatWindow from './scene/combat/CombatWindow';
```
Przy innych `useRef` na górze (obok `isGMRef`, ok. linia 74):
```js
  // Latest combat handlers for the WS switch, which is memoised with a deliberately short deps list.
  const combatRef = useRef(null);
```
W `handleWebSocketMessage`, nowy `case` przed `default`:
```js
      case WS_EVENTS.SCENE_COMBAT_UPDATED:
        combatRef.current?.onCombatEvent(message.payload.sceneId);
        break;
```
W istniejących `case` dla `SCENE_CHARACTER_REMOVED`, `SCENE_CHARACTER_UPDATED`, `SCENE_IMAGE_DELETED`, `SCENE_IMAGE_UPDATED`, `SCENE_IMAGE_TOKEN_UPDATED`, `CHARACTER_UPDATED`, `CHARACTER_REMOVED`, `SCENE_DELETED` dopisz na początku ciała:
```js
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
```
(Dla `case` bez nawiasów klamrowych wstaw linię zaraz po etykiecie `case`. Nie zmieniaj reszty logiki.)

Po `displayScene` (ok. linia 925):
```js
  const combatState = useSceneCombat(gameId, displayScene?.id, isGM);
  combatRef.current = combatState;
```
Owiń `<DragAndDropContext ... />` (ok. linia 1054) i dodaj okno:
```jsx
          <CombatProvider gameId={gameId} scene={displayScene} isGM={isGM} combatState={combatState}>
            <DragAndDropContext
              ...bez zmian...
            />
            <CombatWindow />
          </CombatProvider>
```

- [ ] **Step 10: Testy całego frontu**

Run: `CI=true npm test -- --watchAll=false`
Expected: wszystko PASS poza znanym `App.test.js` (axios ESM).

- [ ] **Step 11: Weryfikacja w przeglądarce (lokalny stack)**

`docker compose up -d` (front przeładuje się sam). Jako MG w grze:
1. Przycisk 🤼 za separatorem w pasku narzędzi; klik → okno „Walka · Runda 1”, pasek z przerywaną ramką i „ukryta”.
2. „Dodaj” → kliknij postać i obrazek z listy; wpis ręczny „Pułapka/3”.
3. Prawy klik na zaznaczonym tokenie postaci → „Usuń z walki”; na obrazku z warstwy tokenów → pozycja w menu.
4. Zmień wartość → wiersz się przesuwa; przeciągnij wiersz → kolejność zostaje.
5. „Pokaż graczom”; w drugiej przeglądarce jako gracz: pasek bez wartości, bez ukrytych; tura postaci gracza → zielony puls i „Zakończ turę”.
6. Przeciągnij pasek, odśwież stronę → pozycja zostaje; dwuklik w uchwyt → wraca na środek.
7. Przełącz scenę (MG) → pasek innej sceny / brak; ikona 🤼 przy scenie z walką.
8. Usuń token ze sceny → znika z kolejki bez odświeżania.
9. „Zakończ walkę” → potwierdzenie → pasek znika u wszystkich.

- [ ] **Step 12: Commit**

```bash
git branch --show-current && git add src/components/GameSession.jsx src/components/DndContext.jsx src/components/scene/SceneTokenMultiContextMenu.jsx src/components/scene/SceneTokenMultiContextMenu.combat.test.jsx src/components/scene/SceneViewport.jsx src/components/scene/SceneImage.jsx src/components/scene/SceneImageContextMenu.jsx src/components/scene/MapCharacterToken.jsx src/components/scene/SceneSelector.jsx src/components/scene/combat/combat.css && git commit -m "feat(combat): wire the tracker into the game screen (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Dokumentacja, changelog, pomoc, samouczek

**Files:**
- Modify: `warhammer-battle-helper-front/src/changelog/releases.js`, `src/locales/en/changelog.json`, `src/locales/pl/changelog.json`
- Modify: `warhammer-battle-helper-front/src/help/pl/02-game-screen.md`, `src/help/en/02-game-screen.md`
- Modify: `warhammer-battle-helper-front/src/components/tutorial/tours/gameScreen.js` + klucze `tutorial.gameScreen.combatButton` w en/pl `translation.json`
- Modify: `docs/knowledge-base/06-scena.md`, `docs/knowledge-base/00-inwentaryzacja.md`
- Modify: `docs/superpowers/specs/2026-11-09-PLAYRPG-1-initiative-tracker-design.md` (sekcja „Odstępstwa w implementacji”)

- [ ] **Step 1: Changelog**

Sprawdź, czy 1.0.0 jest już wdrożone (pamięć `changelog-page`, zapytaj użytkownika, jeśli niejasne).
- Jeśli **nie** wdrożone: dopisz `'combat'` do `items` sekcji `scene` w `RELEASES[0]`.
- Jeśli wdrożone: dodaj na początku `RELEASES` wersję `{ version: '1.1.0', date: '<dzień wdrożenia>', sections: [{ id: 'added', items: ['combat'] }] }`.

Teksty (w odpowiednim miejscu `releases.<klucz>.<sekcja>`):
- en: `"combat": "Turn order tracker per scene: initiative, rounds, hidden participants and an end-turn button for players."`
- pl: `"combat": "Kolejka tur na scenie: inicjatywa, rundy, ukryci uczestnicy i przycisk „Zakończ turę” dla graczy."`

Run: `CI=true npm test -- --watchAll=false --testPathPattern=releases`
Expected: PASS.

- [ ] **Step 2: Przewodnik `/help`**

W `help/pl/02-game-screen.md`, po sekcji `## Narzędzia mapy {#map-tools}` (przed następnym `##`):
```markdown
## Kolejka tur {#turn-order}

**MG.** Przycisk z dwiema walczącymi postaciami w pasku narzędzi (za kreską) rozpoczyna walkę na
bieżącej scenie. Walka startuje ukryta: dodaj uczestników, wpisz inicjatywę i kliknij
**Pokaż graczom**. Uczestników dodasz z okna „Walka” (lista „Na tej scenie”, wpis ręczny) albo
prawym przyciskiem na tokenie: obrazek ma pozycję **Dodaj do walki** w swoim menu, a token postaci
najpierw zaznacz, potem kliknij prawym.

- Kolejność wynika z inicjatywy (malejąco); przeciągnij wiersz, żeby rozstrzygnąć remis.
- Kliknięcie uczestnika czyni go aktywnym — tura nie musi iść po kolei.
- **Następna tura** oznacza aktywnego jako „działał” i przechodzi do następnego, który jeszcze nie
  działał. **Koniec rundy** zeruje znaczniki i zwiększa licznik rund.
- Oko przy uczestniku ukrywa go przed graczami (zasadzka). Gracze nie widzą wartości inicjatywy.
- Każda scena ma własną walkę; przy nazwie sceny z trwającą walką widzisz ikonę.
- **Zakończ walkę** czyści kolejkę.

**Gracz.** Gdy trwa walka, nad mapą widzisz kolejkę. Gdy przychodzi tura twojej postaci, przycisk
walki pulsuje na zielono, a na pasku pojawia się **Zakończ turę**. Pasek możesz przeciągnąć za
uchwyt albo zwinąć przyciskiem walki.
```
W `help/en/02-game-screen.md` w tym samym miejscu:
```markdown
## Turn order {#turn-order}

**GM.** The button with two fighters in the tool bar (after the divider) starts combat on the
current scene. Combat starts hidden: add participants, enter initiative and click
**Show to players**. Add participants from the Combat window (the "On this scene" list, a manual
entry) or with a right click on a token: an image has **Add to combat** in its menu; select a
character token first, then right-click it.

- Order follows initiative (highest first); drag a row to break a tie.
- Click a participant to make them active — turns do not have to go in order.
- **Next turn** marks the active participant as done and moves to the next one who has not acted.
  **End round** clears the marks and advances the round counter.
- The eye next to a participant hides them from players (ambush). Players never see initiative values.
- Every scene has its own combat; a scene with combat in progress shows an icon next to its name.
- **End combat** clears the turn order.

**Player.** During combat the turn order shows above the map. When your character's turn comes,
the combat button pulses green and **End turn** appears on the bar. Drag the bar by its handle or
collapse it with the combat button.
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=helpPages`
Expected: PASS (ta sama kotwica, ta sama kolejność w pl i en).

- [ ] **Step 3: Samouczek**

W `gameScreen.js` dopisz kotwicę do komentarza (`.combat-toolbar-button  components/scene/combat/CombatToolbarButton.jsx (MG; u gracza tylko w walce)`) i krok zaraz po `drawingToolbar`:
```js
    { id: 'combatButton', target: '.combat-toolbar-button', roles: ['gm'], placement: 'left', help: 'game-screen#turn-order' },
```
W `translation.json` en, w `tutorial.gameScreen` (obok `drawingToolbar`):
```json
      "combatButton": {
        "title": "Turn order",
        "body": "Start combat on this scene. It stays hidden until you show it to the players; add tokens with a right click or from the Combat window."
      },
```
pl:
```json
      "combatButton": {
        "title": "Kolejka tur",
        "body": "Rozpocznij walkę na tej scenie. Zostaje ukryta, dopóki nie pokażesz jej graczom; tokeny dodasz prawym przyciskiem albo w oknie „Walka”."
      },
```
Run: `CI=true npm test -- --watchAll=false --testPathPattern='tours|tutorial'`
Expected: PASS.

- [ ] **Step 4: Baza wiedzy**

W `docs/knowledge-base/06-scena.md`, w „Jak to działa”, dopisz akapit:
```markdown
**Kolejka tur (PLAYRPG-1).** Każda scena może mieć walkę (`Scene.Combat`, `json:"-"`). Wpisy:
rozstawienie postaci (`GameCharacter.ID`), obrazek (`SceneImage.ID`) albo wpis ręczny. Tura to
flaga `Acted` + jedno `ActiveID`; MG może aktywować kogokolwiek. Odczyt wyłącznie przez
`GET /games/:id/scenes/:sceneId/combat` — `BuildCombatView` maskuje per widz (gracz: bez ukrytych,
bez wartości, ukryta tura → `LastVisibleActiveID`). Zapis wyłącznie przez `CombatService.mutate`.
```
W sekcji pułapek:
```markdown
- `Scene.Combat` ma `json:"-"`, bo surowy `Game` idzie do graczy i do lobby. Test
  `TestSceneCombatNeverSerialized` pilnuje, żeby nikt tego nie zdjął.
- Każdy zapis walki jest warunkowy po `Combat.Version` (409 przy wyścigu). `end-turn`/`next` niosą
  „kogo dotyczą”, więc podwójne kliknięcie nie przeskoczy uczestnika.
- Wpisy po usuniętych tokenach nie są czyszczone przy usuwaniu — `combat.Prune` odfiltrowuje je przy
  każdym odczycie i zapisie. Nowa ścieżka usuwania tokenu nie musi wiedzieć o walce, ale klient musi
  refetchować walkę na jej evencie (`onSourcesChanged` w `GameSession`).
- Zmiany walki ukrytej przed graczami idą eventem tylko do MG — sam event zdradzałby jej istnienie.
```
W `docs/knowledge-base/00-inwentaryzacja.md`, w tabeli sceny, dodaj wiersz:
```markdown
| Kolejka tur (tracker inicjatywy) per scena: wpisy z tokenów i ręczne, ukrywanie, rundy, „Zakończ turę” gracza | MG / G | `docs/superpowers/specs/2026-11-09-PLAYRPG-1-initiative-tracker-design.md` |
```

- [ ] **Step 5: Spec — odstępstwa**

Na końcu speca dopisz sekcję `## Odstępstwa w implementacji` z 5 punktami z nagłówka tego planu („Odstępstwa od specyfikacji”).

- [ ] **Step 6: Pełne testy**

Run: `cd warhammer-battle-helper-backend && go test ./... && cd ../warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: Go PASS; front PASS poza `App.test.js`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current && git add -A docs warhammer-battle-helper-front/src/changelog warhammer-battle-helper-front/src/locales warhammer-battle-helper-front/src/help warhammer-battle-helper-front/src/components/tutorial/tours/gameScreen.js && git commit -m "docs(combat): changelog, help, tutorial step and knowledge base (PLAYRPG-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Pokrycie kryteriów akceptacji

| AC | Task |
|---|---|
| 1 start ukryty + okno | 4 (`Start`), 6, 8 |
| 2 dodawanie z menu/zaznaczenia, bez duplikatów | 4 (`AddEntries`, `HasSource`), 9 |
| 3 wpis ręczny | 4 (`buildEntry`), 8 |
| 4 pokaż/ukryj | 4 (`Update`), 8 |
| 5–6 maskowanie | 3 |
| 7 403 dla obcej sceny | 4 (`Get` + `PlayerSceneID`) |
| 8 sortowanie / przeciąganie | 2, 8 |
| 9 aktywacja + poświata | 2, 8, 9 |
| 10 następna | 2 (`Next`) |
| 11 ręczne „działał” | 4 (`UpdateEntry`), 8 |
| 12 koniec rundy | 2 (`EndRound`) |
| 13 „Zakończ turę” tylko z dostępem | 3 (`CanEndTurn`), 4 (`authorizeEndTurn`), 7 |
| 14 wyścig → 409 | 2 (`Next` conflict), 4 (`SaveSceneCombat` version) |
| 15 per scena | 1, 4, 5 |
| 16 ikona na pasku scen | 4 (`ListCombatScenes`), 9 |
| 17 sprzątanie | 2 (`Prune`), 5 (`onSourcesChanged`), 9 |
| 18 zakończ walkę | 4 (`End`), 8 |
| 19 stany przycisku | 6 |
| 20 przeciąganie paska | 7 |
| 21 zwijanie lokalne | 6 |
| 22 okno w Window Managerze | 8 |
| 23 i18n/ikony/tooltipy | 5–9 |
| 24 test wycieku | 1 |
| 25 przynależność sceny/wpisu | 4 (`load`, `buildEntry`) |
| 26–27 testy | 1–9 |
| 28–30 dokumentacja | 10 |
