# FEATURE-166 — Obrazki częściowo lub w całości poza sceną — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MG może odsunąć obrazek poza siatkę sceny do 10-komórkowej „poczekalni", przygotować tam obrazki i wsunąć je na planszę jednym przeciągnięciem; gracze nigdy nie otrzymują obrazka leżącego w całości poza sceną, a część wystająca jest przycięta na krawędzi.

**Architecture:** Obszar roboczy obrazków rośnie z `[0, grid]` na `[-M, grid+M]` w obu osiach (`M = 100 * CELL_SIZE = 5000px`). Widoczność dla gracza egzekwuje backend jednym predykatem `playerCanSeeSceneImage` = `!Hidden && SceneImageTouchesGrid` — używanym zarówno w filtrze snapshotu, jak i przy wyborze eventu WS na każdej ścieżce zmieniającej obrazek. Przycinanie robi CSS: nieobracany wrapper rozmiaru siatki z `overflow: hidden` u gracza.

**Tech Stack:** Go 1.24.4 + Gin + MongoDB (backend), React + CRA/Jest (frontend).

## Global Constraints

- Margines poczekalni: **100 komórek** z każdej strony, stała `OFFSCENE_MARGIN_CELLS` w `warhammer-battle-helper-front/src/constants/scene.js`. `CELL_SIZE` = 50, więc `M` = 5000px. (Poszerzone z 10 decyzją użytkownika 2026-08-28: przy 10 komórkach obrazek szerszy niż obszar roboczy nie miał żadnej dozwolonej pozycji i serwer go odrzucał.)
- Przecięcie z siatką jest **ścisłe**: styk samą krawędzią (zerowe pole wspólne) liczy się jako *poza* sceną. Ta sama konwencja co istniejące `rectsIntersect` w `tokenGeometry.js:139`.
- Rotacja obsługiwana przez **AABB obróconego prostokąta**, środek obrotu = środek obrazka (zgodnie z CSS `transform: rotate` w `SceneImage.jsx`). Nigdy nie SAT.
- Reguła granicy jest **addytywna** wobec `Hidden` — obrazek ukryty pozostaje ukryty niezależnie od pozycji.
- Tokeny postaci **nie** mogą wyjeżdżać poza siatkę. Zmiany dotyczą wyłącznie obrazków (`SceneImage`).
- Brak nowych stringów i18n — feature nie dodaje UI z tekstem.
- Komentarze w kodzie po angielsku (konwencja repo).
- Testy Go: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run <Nazwa> -v`
- Testy JS: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=<wzorzec> --watchAll=false`

## Struktura plików

**Backend**

| Plik | Odpowiedzialność |
|---|---|
| `internal/service/scene_image_bounds.go` *(nowy)* | Czysta geometria + predykat widoczności. Bez zależności od repo, huba, Mongo. |
| `internal/service/scene_image_bounds_test.go` *(nowy)* | Testy powyższego. |
| `internal/service/GameService.go` *(modyfikacja)* | Wpięcie predykatu w filtr snapshotu i cztery ścieżki broadcastu. |
| `internal/service/scene_image_visibility_test.go` *(nowy)* | Testy filtra snapshotu. |

Geometria trafia do osobnego pliku, bo `GameService.go` ma ponad 2400 linii — dokładanie tam czystych funkcji bez zależności tylko pogłębia problem.

**Frontend**

| Plik | Odpowiedzialność |
|---|---|
| `src/constants/scene.js` *(modyfikacja)* | Stała `OFFSCENE_MARGIN_CELLS`. |
| `src/utils/tokenGeometry.js` *(modyfikacja)* | `clampToWorkspace` + rozszerzony `clampGroupDelta`. |
| `src/utils/tokenGeometry.test.js` *(modyfikacja)* | Testy obu. |
| `src/components/scene/SceneImage.jsx` *(modyfikacja)* | Klamrowanie dragu i resize; wrapper przycinający. |
| `src/hooks/useGroupDrag.js` *(modyfikacja)* | Dwa bounding boxy zamiast jednego. |
| `src/components/scene/SceneViewport.jsx` *(modyfikacja)* | Kontener poczekalni + nakładka (tylko MG). |
| `src/components/scene/SceneViewport.css` *(modyfikacja)* | Style poczekalni i nakładki. |

---

### Task 1: Geometria granicy sceny (backend, czysta funkcja)

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/scene_image_bounds.go`
- Test: `warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go`

**Interfaces:**
- Consumes: `models.SceneImage` (`internal/models/Game.go:288`) — pola `X, Y, Width, Height float64`, `Rotation float64` (stopnie), `Hidden bool`.
- Produces:
  - `func SceneImageTouchesGrid(imgRect models.SceneImage, gridWidth, gridHeight int) bool`
  - `func PlayerCanSeeSceneImage(imgRect models.SceneImage, gridWidth, gridHeight int) bool`
  - `const CellSizePx = 50.0`

- [ ] **Step 1: Napisz test geometrii**

Utwórz `warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
)

// Grid used across these tests: 10x10 cells = 500x500 px.
const testGridW, testGridH = 10, 10

func mkImg(x, y, w, h, rot float64) models.SceneImage {
	return models.SceneImage{X: x, Y: y, Width: w, Height: h, Rotation: rot}
}

func TestSceneImageTouchesGrid(t *testing.T) {
	cases := []struct {
		name string
		in   models.SceneImage
		want bool
	}{
		{"fully inside", mkImg(100, 100, 50, 50, 0), true},
		{"fully left of grid", mkImg(-200, 100, 50, 50, 0), false},
		{"fully right of grid", mkImg(600, 100, 50, 50, 0), false},
		{"fully above grid", mkImg(100, -200, 50, 50, 0), false},
		{"fully below grid", mkImg(100, 600, 50, 50, 0), false},
		{"straddles left edge", mkImg(-25, 100, 50, 50, 0), true},
		{"straddles bottom edge", mkImg(100, 475, 50, 50, 0), true},
		// Edge-touch is NOT an intersection: right edge lands exactly on x=0.
		{"touches left edge only", mkImg(-50, 100, 50, 50, 0), false},
		// Same convention on the far side: left edge lands exactly on x=500.
		{"touches right edge only", mkImg(500, 100, 50, 50, 0), false},
		// A 200x200 square rotated 45 degrees has an AABB of ~283px, so it reaches
		// ~41px further left than the raw rect. Raw rect misses the grid; AABB does not.
		{"rotated corner reaches in", mkImg(-220, 150, 200, 200, 45), true},
		// Same square, far enough out that even the AABB misses.
		{"rotated but still fully out", mkImg(-320, 150, 200, 200, 45), false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := SceneImageTouchesGrid(c.in, testGridW, testGridH); got != c.want {
				t.Fatalf("SceneImageTouchesGrid(%+v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestPlayerCanSeeSceneImage_HiddenAlwaysWins(t *testing.T) {
	inside := mkImg(100, 100, 50, 50, 0)
	if !PlayerCanSeeSceneImage(inside, testGridW, testGridH) {
		t.Fatal("a visible image inside the grid must be player-visible")
	}

	hidden := inside
	hidden.Hidden = true
	if PlayerCanSeeSceneImage(hidden, testGridW, testGridH) {
		t.Fatal("Hidden must win over position: an image inside the grid but hidden stays invisible")
	}

	outside := mkImg(-200, 100, 50, 50, 0)
	if PlayerCanSeeSceneImage(outside, testGridW, testGridH) {
		t.Fatal("an image fully outside the grid must not be player-visible")
	}
}
```

- [ ] **Step 2: Uruchom test — musi nie skompilować się**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestSceneImageTouchesGrid -v`
Expected: FAIL — `undefined: SceneImageTouchesGrid`

- [ ] **Step 3: Zaimplementuj geometrię**

Utwórz `warhammer-battle-helper-backend/internal/service/scene_image_bounds.go`:

```go
package service

import (
	"math"

	"battle-helper/internal/models"
)

// CellSizePx mirrors CELL_SIZE in the frontend's constants/scene.js. Scene images are stored in
// pixels, the grid in cells, so every bounds check goes through this factor.
const CellSizePx = 50.0

// SceneImageTouchesGrid reports whether any part of img can appear inside the scene grid.
//
// Rotation is handled via the axis-aligned bounding box of the rotated rect (CSS rotates around
// the element's center, so we do too). The AABB always contains the rotated shape, so an image
// whose corner is visible to the GM is never withheld from players. The reverse error — sending
// an image the player's clip renders down to zero pixels — is accepted: it costs a URL in the
// payload, not a visible spoiler. See docs/superpowers/specs/FEATURE-166.md.
//
// Edge contact does not count: an image whose right edge lands exactly on x=0 shows nothing.
func SceneImageTouchesGrid(imgRect models.SceneImage, gridWidth, gridHeight int) bool {
	halfW := imgRect.Width / 2
	halfH := imgRect.Height / 2
	cx := imgRect.X + halfW
	cy := imgRect.Y + halfH

	// Half-extents of the AABB of a rect rotated by theta around its own center.
	rad := imgRect.Rotation * math.Pi / 180
	cos := math.Abs(math.Cos(rad))
	sin := math.Abs(math.Sin(rad))
	extentX := halfW*cos + halfH*sin
	extentY := halfW*sin + halfH*cos

	gridRight := float64(gridWidth) * CellSizePx
	gridBottom := float64(gridHeight) * CellSizePx

	return cx-extentX < gridRight &&
		cx+extentX > 0 &&
		cy-extentY < gridBottom &&
		cy+extentY > 0
}

// PlayerCanSeeSceneImage is the single answer to "should a player hold this image at all".
// Both rules are additive: a hidden image stays hidden wherever it sits, and an image parked in
// the GM's off-scene margin never reaches a player even when it is not flagged hidden.
func PlayerCanSeeSceneImage(imgRect models.SceneImage, gridWidth, gridHeight int) bool {
	return !imgRect.Hidden && SceneImageTouchesGrid(imgRect, gridWidth, gridHeight)
}
```

- [ ] **Step 4: Uruchom oba testy — muszą przejść**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestSceneImageTouchesGrid|TestPlayerCanSeeSceneImage' -v`
Expected: PASS — wszystkie podprzypadki zielone.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/scene_image_bounds.go warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go
git commit -m "feat(back): FEATURE-166 add scene-image grid-intersection predicate

Rotation goes through the AABB of the rotated rect so an image whose corner the
GM sees is never withheld from players. Edge contact counts as outside."
```

---

### Task 2: Filtr snapshotu — obrazek poza sceną nie trafia do gracza

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:2341-2361` (`FilterSceneImageTokensForUser`)
- Test: `warhammer-battle-helper-backend/internal/service/scene_image_visibility_test.go` *(nowy)*

**Interfaces:**
- Consumes: `PlayerCanSeeSceneImage` z Task 1.
- Produces: nic nowego — zmienia zachowanie istniejącej `FilterSceneImageTokensForUser(game *models.Game, userID primitive.ObjectID)`.

- [ ] **Step 1: Napisz test filtra**

Utwórz `warhammer-battle-helper-backend/internal/service/scene_image_visibility_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestFilterSceneImageTokensForUser_DropsOffSceneImages(t *testing.T) {
	gmID := primitive.NewObjectID()
	playerID := primitive.NewObjectID()

	insideID := primitive.NewObjectID()
	outsideID := primitive.NewObjectID()
	straddlingID := primitive.NewObjectID()
	hiddenInsideID := primitive.NewObjectID()

	newGame := func() *models.Game {
		return &models.Game{
			GameMasterID: gmID,
			Scenes: []models.Scene{{
				GridWidth:  10,
				GridHeight: 10,
				Images: []models.SceneImage{
					{ID: insideID, X: 100, Y: 100, Width: 50, Height: 50},
					{ID: outsideID, X: -300, Y: 100, Width: 50, Height: 50},
					{ID: straddlingID, X: -25, Y: 100, Width: 50, Height: 50},
					{ID: hiddenInsideID, X: 200, Y: 200, Width: 50, Height: 50, Hidden: true},
				},
			}},
		}
	}

	playerGame := newGame()
	FilterSceneImageTokensForUser(playerGame, playerID)

	got := map[primitive.ObjectID]bool{}
	for _, i := range playerGame.Scenes[0].Images {
		got[i.ID] = true
	}
	if !got[insideID] {
		t.Error("an image inside the grid must reach the player")
	}
	if !got[straddlingID] {
		t.Error("an image straddling the edge must reach the player — CSS clips the overhang")
	}
	if got[outsideID] {
		t.Error("an image fully outside the grid must not reach the player")
	}
	if got[hiddenInsideID] {
		t.Error("a hidden image must not reach the player regardless of position")
	}

	gmGame := newGame()
	FilterSceneImageTokensForUser(gmGame, gmID)
	if len(gmGame.Scenes[0].Images) != 4 {
		t.Fatalf("the GM must keep every image, got %d of 4", len(gmGame.Scenes[0].Images))
	}
}
```

- [ ] **Step 2: Uruchom test — musi nie przejść**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestFilterSceneImageTokensForUser_DropsOffSceneImages -v`
Expected: FAIL — `an image fully outside the grid must not reach the player`

- [ ] **Step 3: Wpnij predykat w filtr**

W `warhammer-battle-helper-backend/internal/service/GameService.go`, w `FilterSceneImageTokensForUser`, zamień pętlę po scenach na wersję czytającą wymiary siatki:

```go
	for si := range game.Scenes {
		scene := &game.Scenes[si]
		kept := make([]models.SceneImage, 0, len(scene.Images))
		for _, img := range scene.Images {
			// Dropped entirely for players — never sent, so it can't be read from the payload
			// (mirrors how a character absent from VisibleTo never reaches the player). Covers
			// both a hidden image and one parked in the GM's off-scene margin.
			if !PlayerCanSeeSceneImage(img, scene.GridWidth, scene.GridHeight) {
				continue
			}
			if img.TokenOverlay != nil {
				img.TokenOverlay = MaskImageTokenForPlayer(img.TokenOverlay)
			}
			kept = append(kept, img)
		}
		scene.Images = kept
	}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestFilterSceneImageTokensForUser -v`
Expected: PASS

- [ ] **Step 5: Uruchom cały pakiet — brak regresji**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/`
Expected: `ok  	battle-helper/internal/service`

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/service/scene_image_visibility_test.go
git commit -m "feat(back): FEATURE-166 withhold off-scene images from the player snapshot

The snapshot filter now asks PlayerCanSeeSceneImage, so a hidden image and one
parked outside the grid are dropped by the same rule."
```

---

### Task 3: Przejścia granicy w `UpdateSceneImage`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1927-2029` (`UpdateSceneImage`)
- Test: `warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go` (dopisanie)

**Interfaces:**
- Consumes: `PlayerCanSeeSceneImage` z Task 1; `models.UpdateSceneImageRequest` (`Game.go:571`).
- Produces: `func applySceneImageUpdate(img models.SceneImage, req models.UpdateSceneImageRequest) models.SceneImage`

Dziś funkcja rozstrzyga widoczność dwoma osobnymi blokami: `if req.Hidden != nil` (`:1975`) i `if current.Hidden` (`:1996`). Oba zastępuje jedno porównanie predykatu przed/po — dzięki temu granica i `Hidden` nie rozjeżdżają się i znika istniejący błąd „odkrycie obrazka leżącego poza sceną wysyła go graczom".

**Zakres testów w tym zadaniu.** `UpdateSceneImage` wymaga repozytorium Mongo i huba WS, a pakiet `service` nie ma dla nich mocków (istniejące testy dotyczą wyłącznie czystych funkcji). Zamiast dokładać atrapy dla jednej funkcji, jednostkowo pokrywam **składniki** decyzji — `applySceneImageUpdate` tutaj i `PlayerCanSeeSceneImage` w Task 1 — a samą tabelkę czterech przejść weryfikuję end-to-end w Task 11 Step 3 (punkty 1, 2, 6). Świadomy kompromis, nie przeoczenie.

- [ ] **Step 1: Napisz test projekcji żądania**

Dopisz na końcu `warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go`:

```go
func TestApplySceneImageUpdate(t *testing.T) {
	base := models.SceneImage{X: 10, Y: 20, Width: 50, Height: 60, Rotation: 15, Hidden: false}

	newX := 999.0
	hidden := true
	got := applySceneImageUpdate(base, models.UpdateSceneImageRequest{X: &newX, Hidden: &hidden})

	if got.X != 999 {
		t.Errorf("X must follow the request, got %v", got.X)
	}
	if !got.Hidden {
		t.Error("Hidden must follow the request")
	}
	if got.Y != 20 || got.Width != 50 || got.Height != 60 || got.Rotation != 15 {
		t.Errorf("fields absent from the request must be preserved, got %+v", got)
	}
	if base.X != 10 || base.Hidden {
		t.Error("the source image must not be mutated")
	}
}
```

- [ ] **Step 2: Uruchom test — musi nie skompilować się**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestApplySceneImageUpdate -v`
Expected: FAIL — `undefined: applySceneImageUpdate`

- [ ] **Step 3: Dodaj projekcję żądania**

Dopisz na końcu `warhammer-battle-helper-backend/internal/service/scene_image_bounds.go`:

```go
// applySceneImageUpdate projects a partial update onto a copy of the image, so callers can ask
// what the image WILL look like before the write lands. Only the fields that move an image across
// the visibility boundary are projected — position, size, rotation and Hidden; the rest never
// change whether a player should hold the image.
func applySceneImageUpdate(imgRect models.SceneImage, req models.UpdateSceneImageRequest) models.SceneImage {
	out := imgRect
	if req.X != nil {
		out.X = *req.X
	}
	if req.Y != nil {
		out.Y = *req.Y
	}
	if req.Width != nil {
		out.Width = *req.Width
	}
	if req.Height != nil {
		out.Height = *req.Height
	}
	if req.Rotation != nil {
		out.Rotation = *req.Rotation
	}
	if req.Hidden != nil {
		out.Hidden = *req.Hidden
	}
	return out
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestApplySceneImageUpdate -v`
Expected: PASS

- [ ] **Step 5: Przepisz rozstrzyganie widoczności w `UpdateSceneImage`**

W `GameService.go`, w `UpdateSceneImage`, **usuń** cały blok `if req.Hidden != nil { … }` (`:1975-1994`) oraz blok `if current != nil && current.Hidden { … }` (`:1995-2002`), i wstaw w ich miejsce:

```go
	// Scene dimensions for the visibility predicate (the image lives in one scene only).
	gridW, gridH := 0, 0
	for si := range game.Scenes {
		if game.Scenes[si].ID == sceneID {
			gridW = game.Scenes[si].GridWidth
			gridH = game.Scenes[si].GridHeight
		}
	}

	// One predicate decides what players get: Hidden and the scene boundary are the same question
	// ("should a player hold this image at all"), so they are answered together. Comparing it
	// before and after the update yields the event — an image crossing INTO the scene is an ADD
	// for players, one crossing OUT is a DELETE. The GM always receives the plain update so its
	// own dimmed/off-scene styling stays in sync.
	if current != nil {
		visibleBefore := PlayerCanSeeSceneImage(*current, gridW, gridH)
		after := applySceneImageUpdate(*current, req)
		visibleAfter := PlayerCanSeeSceneImage(after, gridW, gridH)

		if visibleBefore != visibleAfter {
			s.hub.BroadcastToUsers(gameID, websocket.EventSceneImageUpdated, map[string]interface{}{
				"sceneId": sceneID.Hex(), "imageId": imageID.Hex(), "update": req,
			}, []string{gmID})

			if visibleAfter {
				shown := after
				shown.TokenOverlay = MaskImageTokenForPlayer(current.TokenOverlay)
				if req.TokenOverlay != nil {
					shown.TokenOverlay = MaskImageTokenForPlayer(req.TokenOverlay)
				}
				s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
					"sceneId": sceneID.Hex(), "image": shown,
				}, gmID)
			} else {
				s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageDeleted, map[string]interface{}{
					"sceneId": sceneID.Hex(), "imageId": imageID.Hex(),
				}, gmID)
			}
			return nil
		}

		// Still invisible to players on both sides — they don't have the image and must not start
		// receiving its position or appearance.
		if !visibleAfter {
			s.hub.BroadcastToUsers(gameID, websocket.EventSceneImageUpdated, map[string]interface{}{
				"sceneId": sceneID.Hex(), "imageId": imageID.Hex(), "update": req,
			}, []string{gmID})
			return nil
		}
	}
```

Blok `if req.TokenOverlay != nil { … }` (`:2007-2029`) i końcowy `BroadcastToGame` **zostają bez zmian** — obsługują teraz wyłącznie przypadek „widoczny przed i po".

- [ ] **Step 6: Zweryfikuj kompilację i cały pakiet**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/service/`
Expected: build bez błędów, `ok  	battle-helper/internal/service`

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/service/scene_image_bounds.go warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go
git commit -m "feat(back): FEATURE-166 emit add/delete when an image crosses the scene boundary

Hidden and the scene boundary are one question, so UpdateSceneImage now compares
PlayerCanSeeSceneImage before and after the update instead of branching on Hidden
twice. Fixes unhiding an off-scene image, which used to broadcast it to players."
```

---

### Task 4: Bramka widoczności na pozostałych ścieżkach broadcastu

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1812-1817` (`AddImageToScene`)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1910-1920` (`DuplicateSceneImage`)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:2048-2081` (`BatchMoveSceneTokens`)

**Interfaces:**
- Consumes: `PlayerCanSeeSceneImage` z Task 1.
- Produces: nic nowego.

Trzy ścieżki nadal rozsyłają obrazki graczom bez pytania o granicę. Bez tego MG dodający, duplikujący albo przeciągający grupowo obrazek do poczekalni wysyła go graczom.

- [ ] **Step 1: Bramka w `AddImageToScene`**

Zamień `BroadcastToGame` (`:1812-1815`) na rozdzielony broadcast:

```go
	gmID := game.GameMasterID.Hex()
	s.hub.BroadcastToUsers(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"image":   createdImage,
	}, []string{gmID})

	// A GM can drop a fresh image straight into the off-scene margin to stage it; players must
	// not receive it until it reaches the grid.
	for si := range game.Scenes {
		if game.Scenes[si].ID != sceneID {
			continue
		}
		if PlayerCanSeeSceneImage(*createdImage, game.Scenes[si].GridWidth, game.Scenes[si].GridHeight) {
			s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
				"sceneId": sceneID.Hex(),
				"image":   createdImage,
			}, gmID)
		}
	}
```

- [ ] **Step 2: Bramka w `DuplicateSceneImage`**

W pętli kopii owiń istniejący `BroadcastToGameExcept` (`:1917-1920`) warunkiem — GM-owy `BroadcastToUsers` tuż nad nim zostaje bez zmian:

```go
		// Copies cascade next to the original, so a duplicate can land in the off-scene margin.
		if PlayerCanSeeSceneImage(*created, scene.GridWidth, scene.GridHeight) {
			maskedImg := *created
			maskedImg.TokenOverlay = MaskImageTokenForPlayer(created.TokenOverlay)
			s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
				"sceneId": sceneID.Hex(),
				"image":   maskedImg,
			}, gmID)
		}
```

Jeśli w tym zakresie nie ma zmiennej `scene` trzymającej docelową scenę, wyznacz `gridW`/`gridH` raz przed pętlą tak samo jak w Task 3 Step 5 i użyj ich w warunku.

- [ ] **Step 3: Przejścia granicy w `BatchMoveSceneTokens`**

Zamień budowanie `hidden` (`:2048-2059`) i `visibleImages` (`:2070-2077`) na porównanie przed/po:

```go
	// Pre-move state, keyed by id: needed to tell which images cross the visibility boundary.
	gridW, gridH := 0, 0
	before := map[string]models.SceneImage{}
	for si := range game.Scenes {
		if game.Scenes[si].ID != sceneID {
			continue
		}
		gridW = game.Scenes[si].GridWidth
		gridH = game.Scenes[si].GridHeight
		for _, im := range game.Scenes[si].Images {
			before[im.ID.Hex()] = im
		}
	}

	gmID := game.GameMasterID.Hex()

	// GM: everything.
	s.hub.BroadcastToUsers(gameID, websocket.EventSceneTokensMoved, map[string]interface{}{
		"sceneId":    sceneID.Hex(),
		"images":     req.Images,
		"characters": req.Characters,
	}, []string{gmID})

	// Players: the same boundary rule as the single-image path, applied per moved image.
	// Still-visible → position rides along in the batch. Crossed in → ADD (they don't have it).
	// Crossed out → DELETE. Invisible on both sides → nothing.
	visibleImages := make([]models.BatchImagePos, 0, len(req.Images))
	for _, moved := range req.Images {
		prev, ok := before[moved.ID]
		if !ok {
			continue
		}
		next := prev
		next.X = moved.X
		next.Y = moved.Y

		visibleBefore := PlayerCanSeeSceneImage(prev, gridW, gridH)
		visibleAfter := PlayerCanSeeSceneImage(next, gridW, gridH)

		switch {
		case visibleBefore && visibleAfter:
			visibleImages = append(visibleImages, moved)
		case !visibleBefore && visibleAfter:
			shown := next
			shown.TokenOverlay = MaskImageTokenForPlayer(prev.TokenOverlay)
			s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
				"sceneId": sceneID.Hex(), "image": shown,
			}, gmID)
		case visibleBefore && !visibleAfter:
			s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageDeleted, map[string]interface{}{
				"sceneId": sceneID.Hex(), "imageId": moved.ID,
			}, gmID)
		}
	}

	s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneTokensMoved, map[string]interface{}{
		"sceneId":    sceneID.Hex(),
		"images":     visibleImages,
		"characters": req.Characters,
	}, gmID)

	return nil
```

Zaktualizuj komentarz nad `BatchMoveSceneTokens` (`:2044-2046`), bo mówi już nieprawdę:

```go
// BatchMoveSceneTokens persists a group drag (GM only) and broadcasts once. Players must not learn
// about images they cannot see, so images are split by PlayerCanSeeSceneImage before and after the
// move: still-visible ones ride along in the batch, images crossing the scene boundary (or the
// hidden flag) get their own ADD/DELETE, invisible ones are withheld. Characters always go whole-game
// (unknown ids no-op client-side).
```

- [ ] **Step 4: Zweryfikuj kompilację i cały pakiet**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/service/`
Expected: build bez błędów, `ok  	battle-helper/internal/service`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat(back): FEATURE-166 gate add/duplicate/batch-move on scene visibility

An image staged in the off-scene margin no longer reaches players when it is
created, duplicated, or group-dragged there."
```

---

### Task 5: Walidacja serwerowa obszaru roboczego

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/scene_image_bounds.go`
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go` (`UpdateSceneImage`, `BatchMoveSceneTokens`)
- Test: `warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go` (dopisanie)

**Interfaces:**
- Produces:
  - `const OffSceneMarginCells = 10`
  - `func SceneImageWithinWorkspace(imgRect models.SceneImage, gridWidth, gridHeight int) bool`

Obrona przed zepsutym klientem, nie przed MG — front klamruje pierwszy, backend tylko odrzuca to, co i tak nie powinno przyjść.

- [ ] **Step 1: Napisz test walidacji**

Dopisz do `scene_image_bounds_test.go`:

```go
func TestSceneImageWithinWorkspace(t *testing.T) {
	// Grid 10x10 = 500x500 px, margin 10 cells = 500 px → workspace is [-500, 1000] on both axes.
	cases := []struct {
		name string
		in   models.SceneImage
		want bool
	}{
		{"inside the grid", mkImg(100, 100, 50, 50, 0), true},
		{"deep in the left margin", mkImg(-400, 100, 50, 50, 0), true},
		{"flush against the left limit", mkImg(-500, 100, 50, 50, 0), true},
		{"past the left limit", mkImg(-501, 100, 50, 50, 0), false},
		{"flush against the right limit", mkImg(950, 100, 50, 50, 0), true},
		{"past the right limit", mkImg(951, 100, 50, 50, 0), false},
		{"past the top limit", mkImg(100, -501, 50, 50, 0), false},
		{"past the bottom limit", mkImg(100, 951, 50, 50, 0), false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := SceneImageWithinWorkspace(c.in, testGridW, testGridH); got != c.want {
				t.Fatalf("SceneImageWithinWorkspace(%+v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}
```

- [ ] **Step 2: Uruchom test — musi nie skompilować się**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestSceneImageWithinWorkspace -v`
Expected: FAIL — `undefined: SceneImageWithinWorkspace`

- [ ] **Step 3: Zaimplementuj walidację**

Dopisz do `scene_image_bounds.go`:

```go
// OffSceneMarginCells mirrors OFFSCENE_MARGIN_CELLS in the frontend's constants/scene.js. It sizes
// the staging area the GM can park images in, on every side of the grid.
const OffSceneMarginCells = 10

// SceneImageWithinWorkspace reports whether an image's raw rect fits the GM workspace — the grid
// plus the off-scene margin. Rotation is deliberately ignored: this is a guard against a broken
// client sending absurd coordinates, not a pixel-exact fence, and the frontend clamps the same raw
// rect it stores.
func SceneImageWithinWorkspace(imgRect models.SceneImage, gridWidth, gridHeight int) bool {
	margin := OffSceneMarginCells * CellSizePx
	maxX := float64(gridWidth)*CellSizePx + margin
	maxY := float64(gridHeight)*CellSizePx + margin

	return imgRect.X >= -margin &&
		imgRect.Y >= -margin &&
		imgRect.X+imgRect.Width <= maxX &&
		imgRect.Y+imgRect.Height <= maxY
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestSceneImageWithinWorkspace -v`
Expected: PASS

- [ ] **Step 5: Odrzucaj zapisy poza obszarem roboczym**

W `UpdateSceneImage`, tuż po istniejącej pętli sprawdzającej `img.Locked` (kończy się przed `if err := s.gameRepo.UpdateSceneImage(...)`), dodaj — korzystając z `current` i `gridW`/`gridH` wyznaczonych w Task 3:

```go
	// Reject a write that would put the image outside the GM workspace. The client clamps first;
	// this only catches a broken or hand-rolled request.
	if current != nil && !SceneImageWithinWorkspace(applySceneImageUpdate(*current, req), gridW, gridH) {
		return fmt.Errorf("image position is outside the scene workspace")
	}
```

Uwaga kolejnościowa: `current` i `gridW`/`gridH` są dziś wyliczane **po** zapisie do repo. Przenieś oba wyliczenia **przed** wywołanie `s.gameRepo.UpdateSceneImage(...)`, żeby walidacja mogła je odczytać. Broadcasty poniżej korzystają z tych samych zmiennych i działają bez zmian.

W `BatchMoveSceneTokens`, po wyliczeniu mapy `before` i przed `s.gameRepo.BatchMoveSceneTokens(...)`:

```go
	for _, moved := range req.Images {
		prev, ok := before[moved.ID]
		if !ok {
			continue
		}
		next := prev
		next.X = moved.X
		next.Y = moved.Y
		if !SceneImageWithinWorkspace(next, gridW, gridH) {
			return fmt.Errorf("image position is outside the scene workspace")
		}
	}
```

Ta sama uwaga kolejnościowa: mapa `before` musi powstać przed zapisem do repo.

- [ ] **Step 6: Zweryfikuj kompilację i cały pakiet**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/service/`
Expected: build bez błędów, `ok  	battle-helper/internal/service`

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/service/scene_image_bounds.go warhammer-battle-helper-backend/internal/service/scene_image_bounds_test.go
git commit -m "feat(back): FEATURE-166 reject image writes outside the GM workspace

Guards against a broken client; the frontend clamps the same raw rect first."
```

---

### Task 6: Frontend — stała i klamrowanie do obszaru roboczego

**Files:**
- Modify: `warhammer-battle-helper-front/src/constants/scene.js`
- Modify: `warhammer-battle-helper-front/src/utils/tokenGeometry.js`
- Test: `warhammer-battle-helper-front/src/utils/tokenGeometry.test.js`

**Interfaces:**
- Produces:
  - `export const OFFSCENE_MARGIN_CELLS = 100` (`constants/scene.js`)
  - `export function clampToWorkspace(x, y, width, height, gridWidth, gridHeight) → { x, y }` (`tokenGeometry.js`)

- [ ] **Step 1: Napisz test klamrowania**

Dopisz na końcu `warhammer-battle-helper-front/src/utils/tokenGeometry.test.js`:

```js
describe('clampToWorkspace', () => {
  // Grid 10x10 = 500x500 px, margin 10 cells = 500 px → workspace [-500, 1000] on both axes.
  const GRID = 10;

  it('leaves a position inside the grid untouched', () => {
    expect(clampToWorkspace(100, 200, 50, 50, GRID, GRID)).toEqual({ x: 100, y: 200 });
  });

  it('allows an image to sit fully in the off-scene margin', () => {
    expect(clampToWorkspace(-400, -300, 50, 50, GRID, GRID)).toEqual({ x: -400, y: -300 });
  });

  it('clamps at the far edge of the margin, not at the grid edge', () => {
    expect(clampToWorkspace(-9999, -9999, 50, 50, GRID, GRID)).toEqual({ x: -500, y: -500 });
  });

  it('clamps the bottom-right so the image stays fully within the workspace', () => {
    // maxX = 500 (grid) + 500 (margin) - 50 (width) = 950
    expect(clampToWorkspace(9999, 9999, 50, 50, GRID, GRID)).toEqual({ x: 950, y: 950 });
  });

  it('never lets the lower bound exceed the upper bound for an oversized image', () => {
    // A 3000px-wide image cannot satisfy both bounds; the lower bound wins so it stays draggable.
    const { x } = clampToWorkspace(-9999, 0, 3000, 50, GRID, GRID);
    expect(x).toBe(-500);
  });
});
```

Dodaj `clampToWorkspace` do listy importów na górze tego pliku.

- [ ] **Step 2: Uruchom test — musi nie przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=tokenGeometry --watchAll=false`
Expected: FAIL — `clampToWorkspace is not a function`

- [ ] **Step 3: Dodaj stałą**

W `warhammer-battle-helper-front/src/constants/scene.js`, pod `CELL_SIZE`:

```js
// Off-scene staging margin: how far beyond the grid, on every side, the GM may park images.
// Players never receive an image that sits entirely out here; the overhang of one that straddles
// the edge is clipped. Mirrored server-side as OffSceneMarginCells.
export const OFFSCENE_MARGIN_CELLS = 100;
```

- [ ] **Step 4: Zaimplementuj `clampToWorkspace`**

W `warhammer-battle-helper-front/src/utils/tokenGeometry.js` zmień pierwszą linię importu na:

```js
import { CELL_SIZE, OFFSCENE_MARGIN_CELLS } from '../constants/scene';
```

i dopisz na końcu pliku:

```js
// Clamp an image's pixel position to the GM workspace: the grid plus the off-scene margin on every
// side. Images — unlike character tokens, which stay inside the grid — may be staged out here and
// slid in mid-game. Operates on the raw (unrotated) rect, matching what SceneImage stores.
export function clampToWorkspace(x, y, width, height, gridWidth, gridHeight) {
  const margin = OFFSCENE_MARGIN_CELLS * CELL_SIZE;
  // Math.min guards an image wider than the workspace: without it maxX < minX and the clamp would
  // snap the image to the far corner instead of leaving it draggable.
  const maxX = Math.max(-margin, gridWidth * CELL_SIZE + margin - width);
  const maxY = Math.max(-margin, gridHeight * CELL_SIZE + margin - height);
  return {
    x: Math.max(-margin, Math.min(x, maxX)),
    y: Math.max(-margin, Math.min(y, maxY)),
  };
}
```

- [ ] **Step 5: Uruchom test — musi przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=tokenGeometry --watchAll=false`
Expected: PASS — wszystkie testy w `tokenGeometry.test.js`, także istniejące.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/constants/scene.js warhammer-battle-helper-front/src/utils/tokenGeometry.js warhammer-battle-helper-front/src/utils/tokenGeometry.test.js
git commit -m "feat(front): FEATURE-166 add clampToWorkspace and the off-scene margin constant"
```

---

### Task 7: Klamrowanie dragu i resize w `SceneImage`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx:136-180` (drag) i `:245-265` (resize)

**Interfaces:**
- Consumes: `clampToWorkspace` z Task 6; `gridWidth`, `gridHeight` z `useZoom()` (już w komponencie, `:25`).
- Produces: nic — zmiana wewnętrzna komponentu.

Drag klamruje dziś do `[0, grid]`; resize nie klamruje w ogóle. Po tym zadaniu obie ścieżki używają jednej funkcji.

- [ ] **Step 1: Podmień import**

W `SceneImage.jsx` zmień:

```js
import { CELL_SIZE } from '../../constants/scene';
```

na:

```js
import { CELL_SIZE } from '../../constants/scene';
import { clampToWorkspace } from '../../utils/tokenGeometry';
```

- [ ] **Step 2: Usuń wyliczanie `maxX`/`maxY` ze startu dragu**

W `handleMouseDown` usuń dwie linie z `dragStartRef.current` (`:138-139`):

```js
      maxX: Math.max(0, gridWidth * CELL_SIZE - size.width),
      maxY: Math.max(0, gridHeight * CELL_SIZE - size.height),
```

`dragStartRef.current` zostaje jako `{ mouseX, mouseY, startX, startY, z }`.

- [ ] **Step 3: Klamruj ruch i commit przez `clampToWorkspace`**

W efekcie dragu zamień `handleMouseMove` i `handleMouseUpFinal` na:

```js
    const handleMouseMove = (e) => {
      const { mouseX, mouseY, startX, startY, z } = dragStartRef.current;
      if (Math.abs(e.clientX - mouseX) + Math.abs(e.clientY - mouseY) > 3) movedRef.current = true;
      const { x, y } = clampToWorkspace(
        startX + (e.clientX - mouseX) / z,
        startY + (e.clientY - mouseY) / z,
        size.width, size.height, gridWidth, gridHeight,
      );
      setPos({ x, y });
      onTokenDragMeasureMove?.({ col: (snapCoord(x) + size.width / 2) / CELL_SIZE, row: (snapCoord(y) + size.height / 2) / CELL_SIZE });
    };

    const handleMouseUpFinal = (e) => {
      const { mouseX, mouseY, startX, startY, z } = dragStartRef.current;
      const clamped = clampToWorkspace(
        startX + (e.clientX - mouseX) / z,
        startY + (e.clientY - mouseY) / z,
        size.width, size.height, gridWidth, gridHeight,
      );
      const finalX = snapCoord(clamped.x);
      const finalY = snapCoord(clamped.y);
      setPos({ x: finalX, y: finalY });
      justFinishedDraggingRef.current = true;
      setIsDragging(false);
      onTokenDragMeasureEnd?.();
      savePosition(finalX, finalY, undefined, undefined);
    };
```

Dopisz `gridWidth, gridHeight` do tablicy zależności tego `useEffect` (dziś: `[isDragging, savePosition, snapCoord, size, onTokenDragMeasureMove, onTokenDragMeasureEnd]`).

- [ ] **Step 4: Klamruj commit resize**

W efekcie resize, w `handleMouseUp`, zamień wyliczenie `newX`/`newY`:

```js
    const handleMouseUp = (e) => {
      const raw = computeResize(e);
      const newW = snapDim(raw.newW);
      const newH = snapDim(raw.newH);
      // Resize used to skip clamping entirely, so an image could be stretched past the workspace.
      // Same clamp as the drag path, applied to the snapped size.
      const clamped = clampToWorkspace(raw.newX, raw.newY, newW, newH, gridWidth, gridHeight);
      const newX = snapCoord(clamped.x);
      const newY = snapCoord(clamped.y);
```

Reszta `handleMouseUp` bez zmian. Dopisz `gridWidth, gridHeight` do tablicy zależności tego `useEffect`.

- [ ] **Step 5: Zweryfikuj brak regresji w suicie frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20`
Expected: PASS poza znanym, wcześniej istniejącym błędem `App.test.js` (axios ESM) — to bazowy stan repo, nie regresja. Jeśli pojawi się jakikolwiek inny błąd, napraw go przed commitem.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImage.jsx
git commit -m "feat(front): FEATURE-166 let image drag and resize reach the off-scene margin

Both paths now share clampToWorkspace. Resize previously did not clamp at all."
```

---

### Task 8: Ruch grupowy — dwa bounding boxy

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/tokenGeometry.js:164-175` (`clampGroupDelta`)
- Modify: `warhammer-battle-helper-front/src/hooks/useGroupDrag.js:19-53`
- Test: `warhammer-battle-helper-front/src/utils/tokenGeometry.test.js`

**Interfaces:**
- Produces: `clampGroupDelta(delta, { charBbox, imageBbox }, gridWidth, gridHeight) → { dCol, dRow }` — **zmiana sygnatury**. Drugi argument to obiekt; każde z pól może być `null`.
- Consumes: `OFFSCENE_MARGIN_CELLS` z Task 6.

Selekcja bywa mieszana, a cała grupa porusza się jednym wektorem. Postacie muszą zostać w siatce, obrazki mogą wyjechać — więc delta podlega obu ograniczeniom naraz.

- [ ] **Step 1: Napisz test**

W `tokenGeometry.test.js` zastąp istniejący blok `describe('clampGroupDelta', ...)` (jeśli istnieje) i dopisz:

```js
describe('clampGroupDelta', () => {
  const GRID = 10;
  const MARGIN = 100; // OFFSCENE_MARGIN_CELLS

  it('keeps a character-only group inside the grid', () => {
    const charBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: -5 }, { charBbox, imageBbox: null }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });

  it('lets an image-only group travel into the margin', () => {
    const imageBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: -5 }, { charBbox: null, imageBbox }, GRID, GRID))
      .toEqual({ dCol: -5, dRow: -5 });
  });

  it('clamps an image-only group at the far edge of the margin', () => {
    const imageBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -999, dRow: 0 }, { charBbox: null, imageBbox }, GRID, GRID))
      .toEqual({ dCol: -MARGIN, dRow: 0 });
  });

  it('applies the tighter constraint to a mixed group', () => {
    // The image could go to -10, but the character pins the group at the grid edge.
    const charBbox = { col: 0, row: 0, w: 2, h: 2 };
    const imageBbox = { col: 4, row: 4, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: 0 }, { charBbox, imageBbox }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });

  it('clamps a mixed group on the far side too', () => {
    const charBbox = { col: 8, row: 0, w: 2, h: 2 };  // already flush against the right grid edge
    const imageBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: 5, dRow: 0 }, { charBbox, imageBbox }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });
});
```

- [ ] **Step 2: Uruchom test — musi nie przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=tokenGeometry --watchAll=false`
Expected: FAIL — stara sygnatura dostaje obiekt zamiast bboxa i zwraca `NaN`.

- [ ] **Step 3: Przepisz `clampGroupDelta`**

W `tokenGeometry.js` zastąp całą funkcję:

```js
// Clamp a cell-space drag delta so the whole selection stays in bounds. Clamping the group's
// bounding box (not each token) preserves the tokens' relative layout.
//
// The two kinds obey different limits: character tokens must stay inside the grid, images may
// travel into the off-scene margin. A mixed selection moves as one vector, so BOTH constraints
// apply and the tighter one wins on each axis. Either bbox may be null when the selection holds
// only one kind.
export function clampGroupDelta(delta, { charBbox, imageBbox }, gridWidth, gridHeight) {
  let { dCol, dRow } = delta;

  const applyBounds = (bbox, minCol, minRow, maxCol, maxRow) => {
    if (!bbox) return;
    dCol = Math.max(dCol, minCol - bbox.col);
    dCol = Math.min(dCol, maxCol - (bbox.col + bbox.w));
    dRow = Math.max(dRow, minRow - bbox.row);
    dRow = Math.min(dRow, maxRow - (bbox.row + bbox.h));
  };

  applyBounds(charBbox, 0, 0, gridWidth, gridHeight);
  applyBounds(
    imageBbox,
    -OFFSCENE_MARGIN_CELLS,
    -OFFSCENE_MARGIN_CELLS,
    gridWidth + OFFSCENE_MARGIN_CELLS,
    gridHeight + OFFSCENE_MARGIN_CELLS,
  );

  return { dCol, dRow };
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=tokenGeometry --watchAll=false`
Expected: PASS

- [ ] **Step 5: Podziel bounding box w `useGroupDrag`**

W `warhammer-battle-helper-front/src/hooks/useGroupDrag.js`, w `begin`, zbieraj prostokąty osobno:

```js
    const imgRects = [];
    const charRects = [];
    selectedTokens.forEach(t => {
      if (t.kind === 'image' && imgById.has(t.id)) imgRects.push(imageToMapToken(imgById.get(t.id)));
      // Characters render on a whole cell (fightZones), while positionX/Y can be fractional in free
      // mode. Round to the rendered cell so the bounding box — and the ruler drawn from its center —
      // matches where the token actually sits, instead of drifting off it.
      if (t.kind === 'char' && charById.has(t.id)) {
        const tk = characterToMapToken(charById.get(t.id));
        charRects.push({ col: Math.round(tk.col), row: Math.round(tk.row), w: tk.w, h: tk.h });
      }
    });
    const charBbox = unionRect(charRects);
    const imageBbox = unionRect(imgRects);
    // Ruler and rendering still key off the whole selection's box.
    const bbox = unionRect([...charRects, ...imgRects]);
    if (!bbox) return;
    const center = centerOf(bbox);
    startRef.current = { mouseX: e.clientX, mouseY: e.clientY, bbox, charBbox, imageBbox, center };
```

W `onMove` zamień wywołanie klamrowania:

```js
      const clamped = clampGroupDelta({ dCol, dRow }, { charBbox: s.charBbox, imageBbox: s.imageBbox }, gridWidth, gridHeight);
```

- [ ] **Step 6: Zweryfikuj brak regresji w suicie frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20`
Expected: PASS poza znanym błędem `App.test.js` (axios ESM).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenGeometry.js warhammer-battle-helper-front/src/utils/tokenGeometry.test.js warhammer-battle-helper-front/src/hooks/useGroupDrag.js
git commit -m "feat(front): FEATURE-166 clamp a mixed group drag by both bounding boxes

Characters stay inside the grid, images may reach the margin; on each axis the
tighter constraint wins so the selection keeps its relative layout."
```

---

### Task 9: Przycinanie obrazka na krawędzi sceny u gracza

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` (JSX wrappera)
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.css`

**Interfaces:**
- Consumes: `isGM` (prop, już w komponencie); `gridWidth`, `gridHeight` z `useZoom()`.
- Produces: klasa CSS `.scene-image-clip`.

Wrapper jest **nieobracany** i ma rozmiar siatki, więc `overflow: hidden` tnie w przestrzeni sceny — poprawnie dla dowolnej rotacji obrazka wewnątrz. Wrapper zastępuje obrazek w tym samym miejscu drzewa, więc z-order przeplatanej warstwy `tokens` zostaje nienaruszony.

- [ ] **Step 1: Dodaj styl wrappera**

Dopisz do `warhammer-battle-helper-front/src/components/scene/SceneViewport.css`:

```css
/* Clip wrapper for a scene image — FEATURE-166.
   Spans exactly the grid and is never rotated, so overflow:hidden cuts in scene space no matter
   how the image inside is rotated. Players get the clip; the GM sees the whole image, including
   whatever sits in the off-scene staging margin. */
.scene-image-clip {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none; /* the image inside re-enables its own pointer events */
}

.scene-image-clip--gm {
  overflow: visible;
}
```

- [ ] **Step 2: Owiń obrazek wrapperem**

`SceneImage.jsx:410` zwraca fragment o strukturze:

```jsx
  return (
    <>
      <div ref={containerRef} data-scene-layer={image.layer} className={`scene-image …`} style={{ … }} …>
        {/* snap preview, <img>, gm badge, token overlay, lock badge, resize/rotate handles */}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <SceneImageContextMenu … />
      )}
    </>
  );
```

Owiń **wyłącznie** pierwszy `<div>` (ten z `ref={containerRef}`), zostawiając `{contextMenu && …}` rodzeństwem wrappera:

```jsx
  return (
    <>
      <div
        className={`scene-image-clip${isGM ? ' scene-image-clip--gm' : ''}`}
        style={{ width: gridWidth * CELL_SIZE, height: gridHeight * CELL_SIZE }}
      >
        <div ref={containerRef} data-scene-layer={image.layer} className={`scene-image …`} style={{ … }} …>
          {/* całe dotychczasowe wnętrze bez zmian */}
        </div>
      </div>

      {/* Context menu — stays outside the clip: it renders at viewport coordinates and must
          never be cut off by the wrapper. */}
      {contextMenu && (
        <SceneImageContextMenu … />
      )}
    </>
  );
```

Wrapper nie dostaje żadnych handlerów ani `z-index`. `zIndex: image.zIndex || 0` zostaje na wewnętrznym `.scene-image` i nadal działa: wrapper ma `z-index: auto` i nie tworzy kontekstu stackingu (`overflow: hidden` też go nie tworzy), więc kolejność obrazków w warstwie pozostaje bez zmian.

- [ ] **Step 3: Zweryfikuj brak regresji w suicie frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20`
Expected: PASS poza znanym błędem `App.test.js` (axios ESM).

- [ ] **Step 4: Weryfikacja wizualna**

Uruchom aplikację i sprawdź jako **gracz** (nie MG):
1. Obrazek w całości w scenie — wygląda jak przed zmianą, nic nie ucięte.
2. MG przesuwa obrazek tak, by połowa wystawała za lewą krawędź — gracz widzi tylko połowę w scenie, cięcie dokładnie na krawędzi siatki.
3. Obrazek obrócony o 45° wystający rogiem — cięcie idzie po krawędzi sceny, nie po obróconej ramce obrazka.
4. Pierścienie HP tokenów postaci stojących przy krawędzi siatki **nie są ucięte**.

Jako **MG**: obrazek wystający poza scenę widoczny w całości.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImage.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.css
git commit -m "feat(front): FEATURE-166 clip a player's view of an image at the scene edge

An unrotated grid-sized wrapper cuts in scene space, so the clip is correct for
any image rotation and leaves character token rings untouched."
```

---

### Task 10: Poczekalnia MG — obszar i nakładka

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:686-710` (sizer/transform/content)
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.css`

**Interfaces:**
- Consumes: `OFFSCENE_MARGIN_CELLS`, `CELL_SIZE` z `constants/scene`; `isGM`, `canvasSize` (już w komponencie).
- Produces: klasa CSS `.scene-offscene-veil`.

`scene-viewport__content` zachowuje rozmiar i pozycję, więc współrzędne obrazków, `handleFit` (`:110-125`) i cała ścieżka gracza pozostają nietknięte. Poczekalnia to obszar dookoła niego, renderowany wyłącznie dla MG.

- [ ] **Step 1: Dodaj styl nakładki**

Dopisz do `SceneViewport.css`:

```css
/* Off-scene staging area — FEATURE-166, GM only.
   A single ring-shaped veil over the image layers: the outer rectangle covers the whole staging
   area, the inner one punches a hole over the grid, and evenodd keeps only the ring. Deliberately
   light — resize handles and selection outlines sit underneath and must stay readable. */
.scene-offscene-veil {
  position: absolute;
  pointer-events: none;
  backdrop-filter: grayscale(1);
  background: rgba(0, 0, 0, 0.35);
}
```

- [ ] **Step 2: Rozszerz obszar MG i wstaw nakładkę**

W `SceneViewport.jsx` dodaj `OFFSCENE_MARGIN_CELLS` do importu z `../../constants/scene` (`:17`), a nad `return` wylicz:

```js
  // GM staging area: the grid plus the off-scene margin on every side. Players never render it,
  // and `content` keeps its own size/offset, so coordinates and handleFit are unaffected.
  const offsceneMargin = OFFSCENE_MARGIN_CELLS * CELL_SIZE;
  const veilW = canvasSize.width + offsceneMargin * 2;
  const veilH = canvasSize.height + offsceneMargin * 2;
  // Two rings in one polygon: the outer one traces the whole staging area, the inner one traces the
  // grid in the opposite direction. evenodd keeps only what lies between them.
  const veilClip = [
    `0px 0px`, `${veilW}px 0px`, `${veilW}px ${veilH}px`, `0px ${veilH}px`,
    `${offsceneMargin}px ${offsceneMargin}px`,
    `${offsceneMargin}px ${offsceneMargin + canvasSize.height}px`,
    `${offsceneMargin + canvasSize.width}px ${offsceneMargin + canvasSize.height}px`,
    `${offsceneMargin + canvasSize.width}px ${offsceneMargin}px`,
  ].join(', ');
```

W `scene-viewport__transform`, **przed** `scene-viewport__content`, wstaw tło poczekalni, a **po** warstwach obrazków (bezpośrednio za blokiem `<SceneLayer layerName="gm" …/>`) wstaw nakładkę:

```jsx
                {isGM && (
                  <div
                    className="scene-offscene-veil"
                    style={{
                      // Positioned relative to `content`, so it extends symmetrically past it.
                      left: -offsceneMargin,
                      top: -offsceneMargin,
                      width: veilW,
                      height: veilH,
                      zIndex: 11, // above every image layer (background 1, tokens 5, gm 10)
                      clipPath: `polygon(evenodd, ${veilClip})`,
                    }}
                  />
                )}
```

Aby `scene-viewport__sizer` w trybie `classic` zmieścił poczekalnię (inaczej scroll jej nie dosięgnie), rozszerz jego wymiary dla MG:

```jsx
            style={controlScheme === 'classic'
              ? {
                  width: (canvasSize.width + FRAME_SIZE * 2 + (isGM ? offsceneMargin * 2 : 0)) * zoom,
                  height: (canvasSize.height + FRAME_SIZE * 2 + (isGM ? offsceneMargin * 2 : 0)) * zoom,
                }
              : { transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }
            }
```

W trybie `modern` panowanie jest nieograniczone, więc nie wymaga zmian.

- [ ] **Step 3: Zweryfikuj brak regresji w suicie frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20`
Expected: PASS poza znanym błędem `App.test.js` (axios ESM).

- [ ] **Step 4: Weryfikacja wizualna**

Jako **MG**:
1. Wokół siatki widać wyszarzoną poczekalnię; sama siatka nie jest przyciemniona ani odbarwiona.
2. Obrazek przeciągnięty do poczekalni jest widoczny, ale wyszarzony; jego część wjeżdżająca na scenę odzyskuje pełny kolor dokładnie na krawędzi.
3. Uchwyty resize i obramowanie selekcji obrazka w poczekalni pozostają czytelne. Jeśli nie — podnieś uchwyty nad nakładkę (`zIndex` > 11 na `TokenResizeHandles`) zamiast rozjaśniać mgłę.
4. „Dopasuj do ekranu" nadal kadruje samą scenę, nie poczekalnię.
5. W trybie `classic` scroll dosięga poczekalni ze wszystkich czterech stron.

Jako **gracz**: brak poczekalni, brak nakładki, kadr i zachowanie jak przed feature.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.css
git commit -m "feat(front): FEATURE-166 render the GM off-scene staging area

One evenodd-clipped veil greys the ring around the grid. Content keeps its own
size, so coordinates, fit-to-screen and the player's view are unchanged."
```

---

### Task 11: Weryfikacja end-to-end i domknięcie

**Files:** brak zmian w kodzie poza ewentualnymi poprawkami znalezionych usterek.

- [ ] **Step 1: Pełny backend**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./... && go test ./...`
Expected: build i vet czyste, wszystkie pakiety `ok`.

- [ ] **Step 2: Pełny frontend**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -30`
Expected: PASS poza znanym błędem `App.test.js` (axios ESM) — stan bazowy repo.

- [ ] **Step 3: Scenariusz dwóch przeglądarek**

Zaloguj się jako MG i jako gracz do tej samej gry (JWT dla lokalnego stacku — patrz notatka „Local e2e verification recipe"). Sprawdź po kolei:

1. MG odsuwa obrazek w całości do poczekalni → **gracz przestaje go widzieć natychmiast** (bez odświeżania). W zakładce sieciowej gracza obrazek znika z payloadu po odświeżeniu.
2. MG wsuwa obrazek z powrotem do sceny → gracz widzi go natychmiast.
3. MG zatrzymuje obrazek na krawędzi → gracz widzi tylko część w scenie, przyciętą na krawędzi.
4. MG dodaje **nowy** obrazek prosto do poczekalni → gracz nie dostaje go wcale.
5. MG duplikuje obrazek tak, że kopia ląduje w poczekalni → gracz nie dostaje kopii.
6. MG ukrywa (ikona oka) obrazek leżący w scenie → gracz przestaje go widzieć; MG odkrywa go, będąc w poczekalni → gracz **nadal** go nie widzi.
7. Ruch grupowy mieszany (obrazek + token postaci) → grupa zatrzymuje się na krawędzi siatki, obrazek nie wyjeżdża sam.
8. Ruch grupowy samych obrazków → cała grupa wjeżdża do poczekalni; obrazki przekraczające krawędź pojawiają się i znikają u gracza pojedynczo.
9. Odświeżenie strony gracza w każdym z powyższych stanów → widok zgodny z tym, co było przed odświeżeniem.

- [ ] **Step 4: Zaktualizuj status specyfikacji**

W `docs/superpowers/specs/FEATURE-166.md` zmień nagłówek `**Status:** spec zatwierdzony` na `**Status:** zaimplementowane, <data>`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/FEATURE-166.md
git commit -m "docs(spec): FEATURE-166 mark as implemented"
```

---

## Kolejność i zależności

Zadania 1-5 (backend) i 6-8 (frontend geometria) są rozłączne — mogą iść równolegle. Zadanie 7 zależy od 6; zadanie 8 zależy od 6. Zadania 2-5 zależą od 1. Zadania 9 i 10 (widok) są niezależne od backendu, ale weryfikacja wizualna w 10 ma sens dopiero po 7. Zadanie 11 zamyka całość.

Po każdym zadaniu backend musi się budować i przechodzić testy, a front nie może mieć nowych błędów poza znanym `App.test.js`.
