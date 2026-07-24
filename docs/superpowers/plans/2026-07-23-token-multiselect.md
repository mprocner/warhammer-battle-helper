# Token Multi-Select (marquee + group move) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GM zaznacza wiele żetonów sceny (obrazy + postacie) prostokątem marquee w dedykowanym trybie Select, przesuwa je razem jednym dragiem, i wykonuje akcje grupowe z osobnego menu kontekstowego.

**Architecture:** Nowy `editingLayer === 'select'` (tryb w `DrawingToolbar`) z reuse'em `imageEditLayer` pickera. Selekcja i geometria w kanonicznej przestrzeni komórek (`tokenGeometry.js`). Group-drag prowadzi kontroler w `SceneViewport` (delta w komórkach przez props, jedno źródło prawdy = dane serwera + jedna delta). Ruch persystowany jednym batch endpointem (`PATCH /scenes/:sceneId/tokens/batch`, Mongo BulkWrite, jeden broadcast `SCENE_TOKENS_MOVED`). Pozostałe akcje grupowe = loop przez istniejące endpointy.

**Tech Stack:** Go + Gin + MongoDB (backend); React + i18next + MUI icons (frontend). Testy: jest (`react-scripts test`) dla czystej geometrii; backend weryfikowany e2e na lokalnym docker stacku.

## Global Constraints

- i18n: wszystkie stringi przez `t('klucz')` z **angielskimi kluczami**; tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`. Nigdy string w JSX.
- Ikony: wyłącznie `@mui/icons-material`.
- `CELL_SIZE = 50` (`src/constants/scene.js`). Obraz sceny = piksele (`x/y/width/height`); postać (placement) = komórki (`positionX/positionY`). Adaptery `imageToMapToken`/`characterToMapToken` mostkują do `CellRect {col,row,w,h}`.
- Selekcja multi to lokalny stan GM — nie broadcastowana.
- Marquee/group-drag: GM only, tylko `editingLayer === 'select'`, pomija obrazy `locked`.
- Postać identyfikujesz przez `charId` + `sceneId` (placement rozwiązywany serwerowo), nigdy `placementId`.
- Ukryte obrazy (`hidden`) nie mogą wyciekać pozycji graczom — batch broadcast dzieli GM (pełny) / gracze (bez ukrytych obrazów).
- Commit message co-author: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Praca na branchu `feature/token-multiselect` (już utworzony).

## File Structure

**Frontend — nowe:**
- `src/components/scene/MarqueeOverlay.jsx` — wizualny prostokąt zaznaczania.
- `src/components/scene/SceneTokenMultiContextMenu.jsx` — menu grupowe.
- `src/hooks/useGroupDrag.js` — kontroler group-dragu (delta w komórkach).

**Frontend — modyfikowane:**
- `src/utils/tokenGeometry.js` (+ `.test.js`) — czyste funkcje geometrii selekcji.
- `src/components/scene/DrawingToolbar.jsx` — tab Select + picker w trybie select.
- `src/components/DndContext.jsx` — stan `selectedTokens`, handlery, przekazanie propsów.
- `src/components/scene/SceneViewport.jsx` — marquee + group-drag wiring.
- `src/components/scene/SceneLayer.jsx`, `MapTokensLayer.jsx` — przekazanie propsów selekcji/delty.
- `src/components/scene/SceneImage.jsx`, `MapCharacterToken.jsx` — offset renderu + select-mode mousedown.
- `src/api/scenes.js` — `batchMoveTokens`.
- `src/websocket/events.js` + `src/components/GameSession.jsx` — event `SCENE_TOKENS_MOVED`.
- `src/locales/en|pl/translation.json` — klucze.

**Backend — modyfikowane:**
- `internal/models/Game.go` — request DTO batcha.
- `internal/repository/GameRepository.go` — `BatchMoveSceneTokens` (BulkWrite).
- `internal/service/GameService.go` — `BatchMoveSceneTokens` (+ masking broadcast).
- `internal/websocket/events.go` — `EventSceneTokensMoved`.
- `internal/http/SceneHandler.go` — handler.
- `cmd/warhammer-battle-helper/main.go` — route.

---

## Task 1: Czyste funkcje geometrii selekcji (frontend, TDD)

**Files:**
- Modify: `src/utils/tokenGeometry.js`
- Test: `src/utils/tokenGeometry.test.js`

**Interfaces:**
- Produces:
  - `rectsIntersect(a, b)` → `boolean` (a,b = `CellRect {col,row,w,h}`; przecięcie AABB, dotyk krawędzią = false)
  - `unionRect(rects)` → `CellRect` (bounding box listy; `[]` → `null`)
  - `selectTokensInRect(rect, candidates)` → `Array<{kind,id}>` (candidates: `Array<{kind,id,rect}>`)
  - `clampGroupDelta(delta, bbox, gridWidth, gridHeight)` → `{dCol,dRow}` (delta `{dCol,dRow}`, bbox `CellRect`; ogranicza by bbox został w `[0,gridWidth]×[0,gridHeight]`)

- [ ] **Step 1: Dopisz testy (na końcu pliku `tokenGeometry.test.js`)**

```javascript
import {
  rectsIntersect,
  unionRect,
  selectTokensInRect,
  clampGroupDelta,
} from './tokenGeometry';

describe('rectsIntersect', () => {
  const a = { col: 0, row: 0, w: 2, h: 2 };
  it('true for partial overlap', () => {
    expect(rectsIntersect(a, { col: 1, row: 1, w: 2, h: 2 })).toBe(true);
  });
  it('false when fully apart', () => {
    expect(rectsIntersect(a, { col: 5, row: 5, w: 1, h: 1 })).toBe(false);
  });
  it('false on edge touch only', () => {
    expect(rectsIntersect(a, { col: 2, row: 0, w: 1, h: 1 })).toBe(false);
  });
  it('true when one contains the other', () => {
    expect(rectsIntersect(a, { col: 0.5, row: 0.5, w: 0.5, h: 0.5 })).toBe(true);
  });
});

describe('unionRect', () => {
  it('returns null for empty', () => {
    expect(unionRect([])).toBeNull();
  });
  it('wraps two rects', () => {
    expect(unionRect([
      { col: 1, row: 1, w: 1, h: 1 },
      { col: 3, row: 2, w: 2, h: 2 },
    ])).toEqual({ col: 1, row: 1, w: 4, h: 3 });
  });
});

describe('selectTokensInRect', () => {
  const candidates = [
    { kind: 'image', id: 'a', rect: { col: 0, row: 0, w: 1, h: 1 } },
    { kind: 'char', id: 'b', rect: { col: 5, row: 5, w: 1, h: 1 } },
    { kind: 'image', id: 'c', rect: { col: 0.5, row: 0.5, w: 2, h: 2 } },
  ];
  it('returns only intersecting tokens', () => {
    expect(selectTokensInRect({ col: 0, row: 0, w: 1, h: 1 }, candidates)).toEqual([
      { kind: 'image', id: 'a' },
      { kind: 'image', id: 'c' },
    ]);
  });
  it('empty when nothing intersects', () => {
    expect(selectTokensInRect({ col: 20, row: 20, w: 1, h: 1 }, candidates)).toEqual([]);
  });
});

describe('clampGroupDelta', () => {
  it('passes through when in bounds', () => {
    expect(clampGroupDelta({ dCol: 1, dRow: 1 }, { col: 2, row: 2, w: 1, h: 1 }, 10, 10))
      .toEqual({ dCol: 1, dRow: 1 });
  });
  it('clamps against left/top edge', () => {
    expect(clampGroupDelta({ dCol: -5, dRow: -5 }, { col: 2, row: 3, w: 1, h: 1 }, 10, 10))
      .toEqual({ dCol: -2, dRow: -3 });
  });
  it('clamps against right/bottom edge', () => {
    expect(clampGroupDelta({ dCol: 5, dRow: 5 }, { col: 8, row: 8, w: 2, h: 2 }, 10, 10))
      .toEqual({ dCol: 0, dRow: 0 });
  });
});
```

- [ ] **Step 2: Uruchom testy — potwierdź FAIL**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/utils/tokenGeometry.test.js`
Expected: FAIL — `rectsIntersect is not a function` (i pozostałe).

- [ ] **Step 3: Dopisz implementacje (na końcu `tokenGeometry.js`, przed ewentualnym default exportem — plik używa named exportów)**

```javascript
// AABB overlap in cell units. Edge-touch (shared boundary, zero area) counts as NO overlap,
// so a marquee that merely grazes a token's edge doesn't grab it.
export function rectsIntersect(a, b) {
  return (
    a.col < b.col + b.w &&
    a.col + a.w > b.col &&
    a.row < b.row + b.h &&
    a.row + a.h > b.row
  );
}

// Bounding box (CellRect) wrapping every rect. null for an empty list.
export function unionRect(rects) {
  if (!rects.length) return null;
  let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
  for (const r of rects) {
    minC = Math.min(minC, r.col);
    minR = Math.min(minR, r.row);
    maxC = Math.max(maxC, r.col + r.w);
    maxR = Math.max(maxR, r.row + r.h);
  }
  return { col: minC, row: minR, w: maxC - minC, h: maxR - minR };
}

// candidates: [{ kind, id, rect }]. Returns [{ kind, id }] whose rect intersects the marquee.
export function selectTokensInRect(rect, candidates) {
  return candidates
    .filter(c => rectsIntersect(rect, c.rect))
    .map(({ kind, id }) => ({ kind, id }));
}

// Clamp a cell-space drag delta so the group's bounding box stays fully inside the grid.
// Clamping the WHOLE group's bbox (not per-token) preserves the tokens' relative layout.
export function clampGroupDelta(delta, bbox, gridWidth, gridHeight) {
  let dCol = delta.dCol;
  let dRow = delta.dRow;
  dCol = Math.max(dCol, -bbox.col);
  dCol = Math.min(dCol, gridWidth - (bbox.col + bbox.w));
  dRow = Math.max(dRow, -bbox.row);
  dRow = Math.min(dRow, gridHeight - (bbox.row + bbox.h));
  return { dCol, dRow };
}
```

- [ ] **Step 4: Uruchom testy — potwierdź PASS**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/utils/tokenGeometry.test.js`
Expected: PASS (wszystkie describe'y zielone).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenGeometry.js warhammer-battle-helper-front/src/utils/tokenGeometry.test.js
git commit -m "feat(geometry): rect intersect, union, marquee select, group-delta clamp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — batch move endpoint

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go`
- Modify: `warhammer-battle-helper-backend/internal/repository/GameRepository.go`
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go`
- Modify: `warhammer-battle-helper-backend/internal/websocket/events.go`
- Modify: `warhammer-battle-helper-backend/internal/http/SceneHandler.go`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go`

**Interfaces:**
- Consumes: `models.Game.Scenes[].Images[]` (x/y px), `models.Game.Scenes[].Characters[]` (positionX/Y cells).
- Produces (HTTP): `PATCH /games/:id/scenes/:sceneId/tokens/batch`, body
  `{ "images":[{"id","x","y"}], "characters":[{"id","positionX","positionY"}] }`, 200 `{message}`.
- Produces (WS): `SCENE_TOKENS_MOVED` payload `{ sceneId, images:[{id,x,y}], characters:[{id,positionX,positionY}] }`.

- [ ] **Step 1: DTO w `models/Game.go` (dopisz koło innych request structów, np. po `UpdateSceneImageRequest`)**

```go
// Batch token move (multi-select group drag). Images carry pixel coords; characters cell coords.
type BatchImagePos struct {
	ID string  `json:"id" binding:"required"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

type BatchCharPos struct {
	ID        string  `json:"id" binding:"required"`
	PositionX float64 `json:"positionX"`
	PositionY float64 `json:"positionY"`
}

type BatchMoveTokensRequest struct {
	Images     []BatchImagePos `json:"images"`
	Characters []BatchCharPos  `json:"characters"`
}
```

- [ ] **Step 2: Repo `BatchMoveSceneTokens` w `GameRepository.go` (dopisz po `UpdateSceneImage`)**

```go
// BatchMoveSceneTokens moves many images (px) and character placements (cells) in one BulkWrite —
// a single round-trip so a group drag lands atomically. Each element is its own UpdateOne with
// arrayFilters (arrayFilters can't set different values across matched elements in one update).
func (r *GameRepository) BatchMoveSceneTokens(gameID string, sceneID primitive.ObjectID, req models.BatchMoveTokensRequest) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	models_ := make([]mongo.WriteModel, 0, len(req.Images)+len(req.Characters))
	now := time.Now()

	for _, img := range req.Images {
		imgID, err := primitive.ObjectIDFromHex(img.ID)
		if err != nil {
			continue
		}
		m := mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": objectID}).
			SetUpdate(bson.M{"$set": bson.M{
				"scenes.$[scene].images.$[img].x":         img.X,
				"scenes.$[scene].images.$[img].y":         img.Y,
				"scenes.$[scene].images.$[img].updatedAt": now,
				"updatedAt":                               now,
			}}).
			SetArrayFilters(options.ArrayFilters{Filters: []interface{}{
				bson.M{"scene._id": sceneID},
				bson.M{"img._id": imgID},
			}})
		models_ = append(models_, m)
	}

	for _, ch := range req.Characters {
		charID, err := primitive.ObjectIDFromHex(ch.ID)
		if err != nil {
			continue
		}
		m := mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": objectID}).
			SetUpdate(bson.M{"$set": bson.M{
				"scenes.$[scene].characters.$[char].positionX": ch.PositionX,
				"scenes.$[scene].characters.$[char].positionY": ch.PositionY,
				"scenes.$[scene].characters.$[char].updatedAt": now,
				"updatedAt": now,
			}}).
			SetArrayFilters(options.ArrayFilters{Filters: []interface{}{
				bson.M{"scene._id": sceneID},
				bson.M{"char.characterId": charID},
			}})
		models_ = append(models_, m)
	}

	if len(models_) == 0 {
		return nil
	}

	_, err = r.Collection.BulkWrite(ctx, models_, options.BulkWrite().SetOrdered(false))
	if err != nil {
		return fmt.Errorf("failed to batch move scene tokens: %w", err)
	}
	return nil
}
```

Uwaga: upewnij się, że import `"go.mongodb.org/mongo-driver/mongo"` jest w pliku (repo już używa `mongo.*` — sprawdź; jeśli nie, dodaj do bloku importów).

- [ ] **Step 3: WS event w `websocket/events.go` (koło `EventSceneImageUpdated`)**

```go
	EventSceneTokensMoved       = "SCENE_TOKENS_MOVED"
```

- [ ] **Step 4: Service `BatchMoveSceneTokens` w `GameService.go` (dopisz po `UpdateSceneImage`)**

```go
// BatchMoveSceneTokens persists a group drag (GM only) and broadcasts once. Hidden images must not
// leak their new position to players, so we split: GM gets the full set, players get every character
// (character moves are already whole-game, unknown ids no-op client-side) plus only NON-hidden images.
func (s *GameService) BatchMoveSceneTokens(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.BatchMoveTokensRequest) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can move scene tokens")
	}

	if err := s.gameRepo.BatchMoveSceneTokens(gameID, sceneID, req); err != nil {
		return err
	}

	// Hidden-image id set (from pre-move game) — used to withhold their positions from players.
	hidden := map[string]bool{}
	for si := range game.Scenes {
		if game.Scenes[si].ID != sceneID {
			continue
		}
		for _, img := range game.Scenes[si].Images {
			if img.Hidden {
				hidden[img.ID.Hex()] = true
			}
		}
	}

	gmID := game.GameMasterID.Hex()

	// GM: everything.
	s.hub.BroadcastToUsers(gameID, websocket.EventSceneTokensMoved, map[string]interface{}{
		"sceneId":    sceneID.Hex(),
		"images":     req.Images,
		"characters": req.Characters,
	}, []string{gmID})

	// Players: non-hidden images only + all characters.
	visibleImages := make([]models.BatchImagePos, 0, len(req.Images))
	for _, img := range req.Images {
		if !hidden[img.ID] {
			visibleImages = append(visibleImages, img)
		}
	}
	s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneTokensMoved, map[string]interface{}{
		"sceneId":    sceneID.Hex(),
		"images":     visibleImages,
		"characters": req.Characters,
	}, gmID)

	return nil
}
```

- [ ] **Step 5: Handler w `SceneHandler.go` (dopisz po `UpdateSceneImage`)**

```go
// BatchMoveSceneTokens moves multiple images + character placements at once (group drag, GM only).
func (h *SceneHandler) BatchMoveSceneTokens(c *gin.Context) {
	gameID := c.Param("id")
	sceneID, err := primitive.ObjectIDFromHex(c.Param("sceneId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene ID"})
		return
	}

	var req models.BatchMoveTokensRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.BatchMoveSceneTokens(gameID, sceneID, userID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Tokens moved"})
}
```

- [ ] **Step 6: Route w `main.go` (koło `game.PUT("/scenes/:sceneId/images/:imageId", ...)`)**

```go
	game.PATCH("/scenes/:sceneId/tokens/batch", sceneHandler.BatchMoveSceneTokens)
```

- [ ] **Step 7: Kompilacja backendu**

Run: `cd warhammer-battle-helper-backend && go build ./...`
Expected: brak błędów. (Jeśli `mongo`/`options` nie zaimportowane w GameRepository.go — dodaj do importów i powtórz.)

- [ ] **Step 8: Weryfikacja e2e na lokalnym stacku** (recipe: pamięć `local-e2e-verification-recipe`)

Zdobądź JWT GM-a, następnie:
```bash
curl -X PATCH "$API/games/$GID/scenes/$SID/tokens/batch" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"images":[{"id":"<imgId>","x":100,"y":100}],"characters":[]}'
```
Expected: `200 {"message":"Tokens moved"}`; po refetchu obraz ma x=100,y=100.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-backend
git commit -m "feat(scene): batch token move endpoint (BulkWrite + single broadcast)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend API + WS event batcha

**Files:**
- Modify: `src/api/scenes.js`
- Modify: `src/websocket/events.js`
- Modify: `src/components/GameSession.jsx`

**Interfaces:**
- Produces: `batchMoveTokens(gameId, sceneId, { images, characters })` → Promise
- Consumes: WS `SCENE_TOKENS_MOVED` payload z Task 2.

- [ ] **Step 1: `batchMoveTokens` w `scenes.js` (koło `updateSceneImage`)**

```javascript
export const batchMoveTokens = async (gameId, sceneId, payload) => {
  const response = await axiosInstance.patch(`/games/${gameId}/scenes/${sceneId}/tokens/batch`, payload);
  return response.data;
};
```

- [ ] **Step 2: Klucz eventu w `events.js` (koło `SCENE_IMAGE_UPDATED`)**

```javascript
  SCENE_TOKENS_MOVED:        'SCENE_TOKENS_MOVED',
```

- [ ] **Step 3: Handler w `GameSession.jsx` (dodaj `case` koło `SCENE_IMAGE_UPDATED`)**

```javascript
      case WS_EVENTS.SCENE_TOKENS_MOVED: {
        const { sceneId: stmSceneId, images: stmImages = [], characters: stmChars = [] } = message.payload;
        const imgMap = new Map(stmImages.map(i => [i.id, i]));
        const charMap = new Map(stmChars.map(c => [c.id, c]));
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === stmSceneId
                ? {
                    ...s,
                    images: (s.images || []).map(img =>
                      imgMap.has(img.id) ? { ...img, x: imgMap.get(img.id).x, y: imgMap.get(img.id).y } : img
                    ),
                    characters: (s.characters || []).map(c =>
                      charMap.has(c.characterId)
                        ? { ...c, positionX: charMap.get(c.characterId).positionX, positionY: charMap.get(c.characterId).positionY }
                        : c
                    ),
                  }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }
```

Uwaga: `characters` w payloadzie identyfikowane po `charId` = `c.characterId` na kliencie (spójne z `SCENE_CHARACTER_MOVED`).

- [ ] **Step 4: Weryfikacja lint**

Run: `cd warhammer-battle-helper-front && npx eslint src/api/scenes.js src/websocket/events.js src/components/GameSession.jsx`
Expected: brak błędów.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/api/scenes.js warhammer-battle-helper-front/src/websocket/events.js warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "feat(scene): frontend batch-move API + SCENE_TOKENS_MOVED handler

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Tryb Select w toolbarze

**Files:**
- Modify: `src/components/scene/DrawingToolbar.jsx`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `editingLayer`, `onEditingLayerChange`, `imageEditLayer`, `onImageEditLayerChange` (już przekazywane).
- Produces: `editingLayer === 'select'` osiągalny; picker warstw widoczny w `grid` **i** `select`.

- [ ] **Step 1: Import ikony (koło innych importów ikon w `DrawingToolbar.jsx`)**

```javascript
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
```

- [ ] **Step 2: Tab Select (dodaj po tabie Measure w bloku GM, po `</button>` measure, przed zamknięciem `<div className="drawing-toolbar__tabs">`)**

```javascript
          <button
            className={`drawing-toolbar__tab ${editingLayer === 'select' ? 'drawing-toolbar__tab--active' : ''}`}
            onClick={() => onEditingLayerChange(editingLayer === 'select' ? null : 'select')}
          >
            <HighlightAltIcon style={{ fontSize: 22 }} />
            <span className="drawing-toolbar__tooltip">{t('scenes.selectLayer')}</span>
          </button>
```

- [ ] **Step 3: Picker warstw także w trybie select (zmień warunek renderu pickera)**

Znajdź: `{editingLayer === 'grid' && (` (linia ~164, blok `drawing-toolbar__controls` z `ToggleButtonGroup`).
Zamień warunek na:

```javascript
      {(editingLayer === 'grid' || editingLayer === 'select') && (
```

- [ ] **Step 4: Klucze i18n**

W `en/translation.json` w sekcji `"scenes"` dodaj:
```json
    "selectLayer": "Select tokens",
```
W `pl/translation.json` w sekcji `"scenes"`:
```json
    "selectLayer": "Zaznacz żetony",
```

- [ ] **Step 5: Weryfikacja manualna (app)**

Uruchom front (`npm start`), wejdź jako GM w scenę. Kliknij nowy tab (ikona marquee). Tab się podświetla, pojawia się picker warstw (background/tokens/gm). Lint: `npx eslint src/components/scene/DrawingToolbar.jsx`.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx warhammer-battle-helper-front/src/locales
git commit -m "feat(scene): Select mode toolbar tab + layer picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Stan selekcji `selectedTokens` w DndContext

**Files:**
- Modify: `src/components/DndContext.jsx`

**Interfaces:**
- Produces (do przekazania w dół w Task 6/7):
  - `selectedTokens: Array<{kind:'image'|'char', id}>`
  - `isTokenSelected(kind, id) → boolean`
  - `handleMarqueeSelect(picked, additive)` — `picked: Array<{kind,id}>`; `additive` (Shift) dodaje, inaczej replace
  - `toggleTokenSelected(kind, id, additive)` — klik/Shift-klik na żetonie
  - `clearSelectedTokens()`
  - `handleCommitGroupMove({ images, characters })` — woła `batchMoveTokens`

- [ ] **Step 1: Import + stan (koło `const [selectedImageId, setSelectedImageId] = useState(null);`, linia ~110)**

```javascript
  // Multi-select (Select mode): list of {kind:'image'|'char', id}. Local GM-only UI state.
  const [selectedTokens, setSelectedTokens] = useState([]);
```

Dodaj import batcha na górze pliku (koło importu `deleteSceneImage`):
```javascript
import { batchMoveTokens } from '../api/scenes';
```
(Jeśli import z `../api/scenes` już istnieje — dołącz `batchMoveTokens` do listy.)

- [ ] **Step 2: Handlery selekcji (dodaj koło `handleSelectImage`, ~linia 262)**

```javascript
  const isTokenSelected = useCallback(
    (kind, id) => selectedTokens.some(t => t.kind === kind && t.id === id),
    [selectedTokens]
  );

  const clearSelectedTokens = useCallback(() => setSelectedTokens([]), []);

  // Marquee result. additive (Shift) merges (dedup); otherwise replaces.
  const handleMarqueeSelect = useCallback((picked, additive) => {
    setSelectedTokens(prev => {
      if (!additive) return picked;
      const seen = new Set(prev.map(t => `${t.kind}:${t.id}`));
      return [...prev, ...picked.filter(t => !seen.has(`${t.kind}:${t.id}`))];
    });
  }, []);

  // Click / Shift-click on a token. additive toggles membership; plain click replaces with just it.
  const toggleTokenSelected = useCallback((kind, id, additive) => {
    setSelectedTokens(prev => {
      const key = `${kind}:${id}`;
      const has = prev.some(t => `${t.kind}:${t.id}` === key);
      if (additive) return has ? prev.filter(t => `${t.kind}:${t.id}` !== key) : [...prev, { kind, id }];
      return [{ kind, id }];
    });
  }, []);
```

- [ ] **Step 3: Sprzątanie selekcji — 3 efekty (dodaj koło istniejącego czyszczenia `selectedImageId`, ~linia 120-127)**

```javascript
  // Leaving Select mode drops the multi-selection.
  useEffect(() => {
    if (editingLayer !== 'select') setSelectedTokens([]);
  }, [editingLayer]);

  // Drop tokens that no longer exist (deleted by any user / scene switch).
  useEffect(() => {
    if (!selectedTokens.length) return;
    const imgIds = new Set((currentScene?.images || []).map(i => i.id));
    const charIds = new Set((currentScene?.characters || []).map(c => c.characterId));
    setSelectedTokens(prev => {
      const next = prev.filter(t => (t.kind === 'image' ? imgIds.has(t.id) : charIds.has(t.id)));
      return next.length === prev.length ? prev : next;
    });
  }, [currentScene?.images, currentScene?.characters, selectedTokens.length]);

  // Escape clears the multi-selection while in Select mode.
  useEffect(() => {
    if (editingLayer !== 'select') return;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedTokens([]); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingLayer]);
```

- [ ] **Step 4: Keyboard delete dla multi (rozszerz istniejący efekt delete, ~linia 131)**

Zamień warunek `if (!selectedImageId) return;` — dodaj OSOBNY efekt obsługujący `selectedTokens` (nie mieszaj z single). Dodaj po istniejącym efekcie delete:

```javascript
  // Delete / Backspace in Select mode removes all selected tokens (images deleted, characters
  // removed from grid). Skips locked images. Ignored while typing.
  useEffect(() => {
    if (editingLayer !== 'select' || !selectedTokens.length) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const images = currentScene?.images || [];
      selectedTokens.forEach(t => {
        if (t.kind === 'image') {
          const img = images.find(i => i.id === t.id);
          if (img && !img.locked) deleteSceneImage(gameId, currentSceneId, t.id).catch(err => console.error(err));
        } else {
          handleRemoveCharacter(t.id);
        }
      });
      setSelectedTokens([]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingLayer, selectedTokens, currentScene?.images, gameId, currentSceneId]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Commit group move (dodaj koło `handleCommitCharacterMove`)**

```javascript
  // Persist a group drag in one batch call. moves = { images:[{id,x,y}], characters:[{id,positionX,positionY}] }.
  const handleCommitGroupMove = useCallback(async (moves) => {
    const sid = sceneIdRef.current;
    if (!sid) return;
    try {
      await batchMoveTokens(gameId, sid, moves);
    } catch (err) {
      console.error('Failed to batch move tokens:', err);
      addLogMessage('Failed to move tokens', 'error');
    }
  }, [gameId, addLogMessage]);
```

- [ ] **Step 6: Lint**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/DndContext.jsx`
Expected: brak błędów.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "feat(scene): selectedTokens state + select/clear/delete/group-move handlers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Marquee — rysowanie i selekcja w SceneViewport

**Files:**
- Create: `src/components/scene/MarqueeOverlay.jsx`
- Modify: `src/components/scene/SceneViewport.jsx`
- Modify: `src/components/DndContext.jsx` (przekazanie propsów do `SceneViewport`)
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `selectedTokens`, `onMarqueeSelect(picked, additive)`, `imageEditLayer`, `editingLayer`.
- Produces (przez SceneViewport, dla Task 8): kandydaci selekcji budowani z `displayedScene`.

- [ ] **Step 1: Komponent `MarqueeOverlay.jsx`**

```javascript
import React from 'react';

// Visual marquee rectangle drawn in scene-content pixel space (already inside the zoom transform).
const MarqueeOverlay = ({ rect }) => {
  if (!rect) return null;
  return (
    <div
      className="marquee-overlay"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: 40,
        pointerEvents: 'none',
      }}
    />
  );
};

export default MarqueeOverlay;
```

- [ ] **Step 2: Styl w `style.css`**

```css
.marquee-overlay {
  border: 1px dashed #c9975b;
  background: rgba(201, 151, 91, 0.15);
}
```

- [ ] **Step 3: Props + import w `SceneViewport.jsx`**

Do listy propsów `SceneViewport` dodaj: `selectedTokens = [], onMarqueeSelect, onCommitGroupMove, isTokenSelected, onToggleTokenSelected`.
Import: `import MarqueeOverlay from './MarqueeOverlay';` oraz z geometrii:
```javascript
import { imageToMapToken, characterToMapToken, selectTokensInRect, unionRect, clampGroupDelta } from '../../utils/tokenGeometry';
```
(dołącz brakujące do istniejącego importu z `tokenGeometry`).

- [ ] **Step 4: Kandydaci selekcji (memo, w ciele `SceneViewport`, po wyliczeniu `tokenImages`/`backgroundImages`)**

```javascript
  // Marquee candidates: tokens on the armed image layer. On the 'tokens' layer, character
  // placements join the token-layer images. Locked images are never selectable.
  const marqueeCandidates = useMemo(() => {
    if (editingLayer !== 'select') return [];
    const imgs = (displayedScene?.images || []).filter(i => i.layer === imageEditLayer && !i.locked);
    const out = imgs.map(i => ({ kind: 'image', id: i.id, rect: cellRectFromToken(imageToMapToken(i)) }));
    if (imageEditLayer === 'tokens') {
      (placedCharacters || []).forEach(gc => {
        out.push({ kind: 'char', id: gc.character.id, rect: cellRectFromToken(characterToMapToken(gc)) });
      });
    }
    return out;
  }, [editingLayer, imageEditLayer, displayedScene?.images, placedCharacters]);
```

Dodaj helper obok (adaptery zwracają `{col,row,w,h}` — nadaj mu nazwę rect):
```javascript
  // adapters already return { col,row,w,h }; alias for readability
  const cellRectFromToken = (t) => ({ col: t.col, row: t.row, w: t.w, h: t.h });
```
(Jeśli `characterToMapToken(gc)` wymaga konkretnego kształtu `gc` — sprawdź jego sygnaturę; `placedCharacters` to ta sama lista, której używa `MapTokensLayer`.)

- [ ] **Step 5: Stan marquee + obsługa myszy (w `SceneViewport`)**

```javascript
  const [marquee, setMarquee] = useState(null); // { startCol,startRow, x,y,width,height } in content px + cells
  const marqueeStartRef = useRef(null);
```

W `handleContentMouseDown` — na początku, przed pingiem — dodaj gałąź trybu select:
```javascript
    if (editingLayer === 'select') {
      // Marquee starts only on empty content (not on a token — that path selects/drag-moves it).
      if (e.button !== 0) return;
      if (e.target.closest('.scene-image') || e.target.closest('.map-char-token')) return;
      const rect = contentRef.current.getBoundingClientRect();
      const col = (e.clientX - rect.left) / zoom / CELL_SIZE;
      const row = (e.clientY - rect.top) / zoom / CELL_SIZE;
      marqueeStartRef.current = { col, row, additive: e.shiftKey };
      setMarquee({ x: col * CELL_SIZE, y: row * CELL_SIZE, width: 0, height: 0 });
      return;
    }
```

Efekt śledzący ruch/koniec marquee:
```javascript
  useEffect(() => {
    if (!marquee) return;
    const onMove = (e) => {
      const s = marqueeStartRef.current;
      const rect = contentRef.current.getBoundingClientRect();
      const col = (e.clientX - rect.left) / zoom / CELL_SIZE;
      const row = (e.clientY - rect.top) / zoom / CELL_SIZE;
      const c0 = Math.min(s.col, col), r0 = Math.min(s.row, row);
      const w = Math.abs(col - s.col), h = Math.abs(row - s.row);
      setMarquee({ x: c0 * CELL_SIZE, y: r0 * CELL_SIZE, width: w * CELL_SIZE, height: h * CELL_SIZE, col: c0, row: r0, w, h });
    };
    const onUp = () => {
      setMarquee(cur => {
        if (cur && cur.w !== undefined) {
          const picked = selectTokensInRect({ col: cur.col, row: cur.row, w: cur.w, h: cur.h }, marqueeCandidates);
          onMarqueeSelect?.(picked, marqueeStartRef.current.additive);
        }
        return null;
      });
      marqueeStartRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [marquee, zoom, marqueeCandidates, onMarqueeSelect]);
```

- [ ] **Step 6: Render `<MarqueeOverlay>` (w `scene-viewport__content`, koło innych overlayów, np. po `MapRulerOverlay`)**

```javascript
                <MarqueeOverlay rect={marquee} />
```

- [ ] **Step 7: Przekaż propsy w `DndContext.jsx` do `<SceneViewport ... />`**

Dodaj do JSX `SceneViewport` (linia ~1015): `selectedTokens={selectedTokens} onMarqueeSelect={handleMarqueeSelect} onCommitGroupMove={handleCommitGroupMove} isTokenSelected={isTokenSelected} onToggleTokenSelected={toggleTokenSelected}`.

- [ ] **Step 8: Weryfikacja manualna**

Front + GM + tryb Select, warstwa tokens. Przeciągnij po pustym — rysuje się przerywany prostokąt; po puszczeniu znika. (Podświetlenie zaznaczonych dodamy w Task 7 — tu sprawdzasz tylko rysowanie + brak błędów w konsoli.) Lint zmienionych plików.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/MarqueeOverlay.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx warhammer-battle-helper-front/src/components/DndContext.jsx warhammer-battle-helper-front/src/style.css
git commit -m "feat(scene): marquee rectangle draw + intersection select in Select mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Podświetlenie zaznaczenia + klik/Shift-klik na żetonie

**Files:**
- Modify: `src/components/scene/SceneViewport.jsx` (przekaż `isTokenSelected`/`onToggleTokenSelected` w dół)
- Modify: `src/components/scene/SceneLayer.jsx`, `MapTokensLayer.jsx`
- Modify: `src/components/scene/SceneImage.jsx`, `MapCharacterToken.jsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `isTokenSelected(kind,id)`, `onToggleTokenSelected(kind,id,additive)`, `editingLayer`.
- Produces: klasa `--multi-selected` na zaznaczonych żetonach; klik w trybie select toggluje.

- [ ] **Step 1: Przekaż propsy przez layery**

W `SceneViewport.jsx` do obu `<SceneLayer>` (background, gm) i do `<MapTokensLayer>` dodaj: `editingLayer` (już jest), `isTokenSelected={isTokenSelected}`, `onToggleTokenSelected={onToggleTokenSelected}`.
W `SceneLayer.jsx` przyjmij te propsy i przekaż do każdego `<SceneImage>`: `multiSelected={isTokenSelected?.('image', image.id)}` `onToggleSelect={onToggleTokenSelected}`.
W `MapTokensLayer.jsx` analogicznie: dla `<SceneImage>` `multiSelected={isTokenSelected?.('image', item.data.id)}`, dla `<MapCharacterToken>` `multiSelected={isTokenSelected?.('char', item.data.character.id)}`, oba `onToggleSelect={onToggleTokenSelected}` + `editingLayer`.

- [ ] **Step 2: `SceneImage.jsx` — props + klasa + klik select**

Dodaj do sygnatury: `multiSelected = false, onToggleSelect`.
W `className` dodaj `${multiSelected ? 'scene-image--multi-selected' : ''}`.
Rozszerz `handleClick` — na początku, przed dotychczasową logiką ring:
```javascript
    if (editingLayer === 'select') {
      if (!isGM || !onToggleSelect || image.locked) return;
      e.stopPropagation();
      onToggleSelect('image', image.id, e.shiftKey);
      return;
    }
```

- [ ] **Step 3: `MapCharacterToken.jsx` — props + klasa + klik select**

Dodaj do sygnatury: `multiSelected = false, onToggleSelect, editingLayer`.
W głównym `className` dodaj `${multiSelected ? 'map-char-token--multi-selected' : ''}`.
W handlerze kliku/`onClick` (albo `onMouseDown` selekcji — znajdź `onSelect`) dodaj gałąź select-mode: gdy `editingLayer === 'select'`, `e.stopPropagation(); onToggleSelect?.('char', character.id, e.shiftKey); return;` zamiast normalnej selekcji tokenu. (Sprawdź istniejący handler selekcji w tym pliku i wepnij gałąź na jego początku.)

- [ ] **Step 4: Styl podświetlenia w `style.css`**

```css
.scene-image--multi-selected,
.map-char-token--multi-selected {
  outline: 2px solid #c9975b;
  outline-offset: 2px;
}
```

- [ ] **Step 5: Weryfikacja manualna**

Tryb Select + tokens: marquee zaznacza kilka → mają złotą obwódkę. Klik na pojedynczy żeton → zaznacza tylko jego. Shift-klik → dodaje/usuwa z grupy. Klik na pusto (Task 6 mousedown na pustym bez ruchu) — zaznaczenie znika po marquee zero-size? (upewnij się że zero-size marquee = replace pustą listą = clear). Lint.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene warhammer-battle-helper-front/src/style.css
git commit -m "feat(scene): multi-selected highlight + click/shift-click token select

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Group drag — kontroler + offset renderu

**Files:**
- Create: `src/hooks/useGroupDrag.js`
- Modify: `src/components/scene/SceneViewport.jsx`
- Modify: `src/components/scene/SceneLayer.jsx`, `MapTokensLayer.jsx`
- Modify: `src/components/scene/SceneImage.jsx`, `MapCharacterToken.jsx`

**Interfaces:**
- Consumes: `selectedTokens`, `onCommitGroupMove`, `displayedScene`, `tokenPlacementMode`, `zoom`, grid dims.
- Produces: `groupDragDelta: {dCol,dRow} | null` (props w dół); tokeny zaznaczone renderują się z offsetem; na koniec `onCommitGroupMove({images,characters})`.

- [ ] **Step 1: Hook `useGroupDrag.js`**

```javascript
import { useState, useRef, useCallback, useEffect } from 'react';
import { CELL_SIZE } from '../constants/scene';
import { imageToMapToken, characterToMapToken, unionRect, clampGroupDelta, rectPx } from '../utils/tokenGeometry';

// Group-drag controller. Holds the live delta (in cells) for the whole selection; individual tokens
// render themselves offset by this delta (single source of truth = server data + one delta).
// deltaRef mirrors the latest clamped delta so the mouseup handler reads it without re-subscribing.
export default function useGroupDrag({ selectedTokens, images, characters, gridWidth, gridHeight, snap, zoom, onCommit }) {
  const [delta, setDelta] = useState(null); // {dCol,dRow} while dragging, else null
  const startRef = useRef(null);            // { mouseX, mouseY, bbox }
  const deltaRef = useRef({ dCol: 0, dRow: 0 });

  const begin = useCallback((e) => {
    if (!selectedTokens.length) return;
    const imgById = new Map((images || []).map(i => [i.id, i]));
    const charById = new Map((characters || []).map(c => [c.character.id, c]));
    const rects = [];
    selectedTokens.forEach(t => {
      if (t.kind === 'image' && imgById.has(t.id)) rects.push(imageToMapToken(imgById.get(t.id)));
      if (t.kind === 'char' && charById.has(t.id)) rects.push(characterToMapToken(charById.get(t.id)));
    });
    const bbox = unionRect(rects);
    if (!bbox) return;
    startRef.current = { mouseX: e.clientX, mouseY: e.clientY, bbox };
    deltaRef.current = { dCol: 0, dRow: 0 };
    setDelta({ dCol: 0, dRow: 0 });
  }, [selectedTokens, images, characters]);

  const dragging = delta !== null;

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const s = startRef.current;
      let dCol = (e.clientX - s.mouseX) / zoom / CELL_SIZE;
      let dRow = (e.clientY - s.mouseY) / zoom / CELL_SIZE;
      if (snap) { dCol = Math.round(dCol); dRow = Math.round(dRow); }
      const clamped = clampGroupDelta({ dCol, dRow }, s.bbox, gridWidth, gridHeight);
      deltaRef.current = clamped;
      setDelta(clamped);
    };

    const onUp = () => {
      const d = deltaRef.current;
      if (d && (d.dCol !== 0 || d.dRow !== 0)) {
        const imgById = new Map((images || []).map(i => [i.id, i]));
        const charById = new Map((characters || []).map(c => [c.character.id, c]));
        const outImages = [], outChars = [];
        selectedTokens.forEach(t => {
          if (t.kind === 'image' && imgById.has(t.id)) {
            const tk = imageToMapToken(imgById.get(t.id));
            const px = rectPx({ col: tk.col + d.dCol, row: tk.row + d.dRow, w: tk.w, h: tk.h });
            outImages.push({ id: t.id, x: px.x, y: px.y });
          }
          if (t.kind === 'char' && charById.has(t.id)) {
            const tk = characterToMapToken(charById.get(t.id));
            outChars.push({ id: t.id, positionX: tk.col + d.dCol, positionY: tk.row + d.dRow });
          }
        });
        onCommit?.({ images: outImages, characters: outChars });
      }
      startRef.current = null;
      setDelta(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, zoom, snap, gridWidth, gridHeight, selectedTokens, images, characters, onCommit]);

  return { delta, begin };
}
```

- [ ] **Step 2: Wepnij hook w `SceneViewport.jsx`**

```javascript
  const groupDrag = useGroupDrag({
    selectedTokens,
    images: (displayedScene?.images || []),
    characters: placedCharacters,
    gridWidth: dGridWidth,
    gridHeight: dGridHeight,
    snap: tokenPlacementMode === 'snap',
    zoom,
    onCommit: onCommitGroupMove,
  });
```
Import: `import useGroupDrag from '../../hooks/useGroupDrag';`.

- [ ] **Step 3: Start group-dragu z żetonu**

Dodaj prop w dół (jak w Task 7): `onGroupDragStart={groupDrag.begin}` i `groupDragDelta={groupDrag.delta}` do `SceneLayer`/`MapTokensLayer`, dalej do tokenów.
W `SceneImage.jsx` w `handleMouseDown` — na początku, gdy `editingLayer === 'select'` i `multiSelected`:
```javascript
    if (editingLayer === 'select') {
      if (multiSelected && onGroupDragStart) { e.preventDefault(); e.stopPropagation(); onGroupDragStart(e); }
      return; // block the normal single-image drag in select mode
    }
```
Analogicznie w `MapCharacterToken.jsx` drag-start.

- [ ] **Step 4: Offset renderu na zaznaczonych żetonach**

W `SceneImage.jsx`: gdy `multiSelected && groupDragDelta`, przesuń render o delta (w px):
```javascript
  const dx = (multiSelected && groupDragDelta) ? groupDragDelta.dCol * CELL_SIZE : 0;
  const dy = (multiSelected && groupDragDelta) ? groupDragDelta.dRow * CELL_SIZE : 0;
```
i w `style` kontenera zmień `left: pos.x + dx, top: pos.y + dy`.
W `MapCharacterToken.jsx`: analogicznie do `px.left/top` dodaj `dx/dy` (delta w komórkach × CELL_SIZE lub bezpośrednio do col/row przed przeliczeniem).

- [ ] **Step 5: Weryfikacja manualna (kluczowa)**

Tryb Select + tokens: zaznacz 3 żetony (obraz + postać mieszane), przeciągnij jeden — wszystkie ruszają razem, płynnie. Puść — zapis (jeden PATCH w Network), pozycje trwałe po refetchu. Drugi klient (druga karta/przeglądarka) widzi ruch (WS `SCENE_TOKENS_MOVED`). Snap: w trybie snap lądują na komórkach; układ względny zachowany. Granice: nie da się wypchnąć grupy poza siatkę.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useGroupDrag.js warhammer-battle-helper-front/src/components/scene
git commit -m "feat(scene): group drag controller — one delta moves the whole selection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Menu kontekstowe multi (B1 — przecięcie akcji)

**Files:**
- Create: `src/components/scene/SceneTokenMultiContextMenu.jsx`
- Modify: `src/components/scene/SceneViewport.jsx` (przechwycenie prawego kliku w select mode)
- Modify: `src/components/DndContext.jsx` (handlery akcji grupowych)
- Modify: `src/locales/en|pl/translation.json`

**Interfaces:**
- Consumes: `selectedTokens`, akcje grupowe z DndContext.
- Produces: menu wg zawartości selekcji (same obrazy / same postacie / mieszane).

- [ ] **Step 1: Handlery akcji grupowych w `DndContext.jsx`**

```javascript
  // Group actions — loop existing per-token endpoints (infrequent one-shot clicks).
  const groupImages = useCallback(
    () => selectedTokens.filter(t => t.kind === 'image')
      .map(t => (currentScene?.images || []).find(i => i.id === t.id)).filter(Boolean),
    [selectedTokens, currentScene?.images]
  );

  const handleGroupDelete = useCallback(() => {
    const sid = sceneIdRef.current;
    selectedTokens.forEach(t => {
      if (t.kind === 'image') {
        const img = (currentScene?.images || []).find(i => i.id === t.id);
        if (img && !img.locked) deleteSceneImage(gameId, sid, t.id).catch(e => console.error(e));
      } else {
        handleRemoveCharacter(t.id);
      }
    });
    setSelectedTokens([]);
  }, [selectedTokens, currentScene?.images, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGroupSetLock = useCallback((locked) => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { locked }).catch(e => console.error(e)));
  }, [groupImages, gameId]);

  const handleGroupSetLayer = useCallback((layer) => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { layer }).catch(e => console.error(e)));
    setSelectedTokens([]);
  }, [groupImages, gameId]);

  const handleGroupResetRotation = useCallback(() => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { rotation: 0 }).catch(e => console.error(e)));
  }, [groupImages, gameId]);
```
Dodaj `updateSceneImage` do importu z `../api/scenes` jeśli nie ma.

- [ ] **Step 2: Komponent `SceneTokenMultiContextMenu.jsx`** (portal, wzór z `SceneImageContextMenu`)

```javascript
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// Group context menu. Action set = intersection valid for the whole selection:
//  images-only → full; chars-only → remove; mixed → remove only.
const SceneTokenMultiContextMenu = ({ x, y, selection, onDelete, onSetLock, onSetLayer, onResetRotation, onClose }) => {
  const { t } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h, true);
    document.addEventListener('contextmenu', h, true);
    return () => {
      document.removeEventListener('mousedown', h, true);
      document.removeEventListener('contextmenu', h, true);
    };
  }, [onClose]);

  const hasImages = selection.some(s => s.kind === 'image');
  const hasChars = selection.some(s => s.kind === 'char');
  const imagesOnly = hasImages && !hasChars;
  const layers = [
    { key: 'background', label: t('scenes.layerBackground') },
    { key: 'tokens', label: t('scenes.layerTokens') },
    { key: 'gm', label: t('scenes.layerGm') },
  ];

  return createPortal(
    <div ref={ref} className="scene-context-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 10000 }}>
      {imagesOnly && (
        <>
          <button className="scene-context-menu__item" onClick={() => { onSetLock(true); onClose(); }}>🔒 {t('scenes.lockAll')}</button>
          <button className="scene-context-menu__item" onClick={() => { onSetLock(false); onClose(); }}>🔓 {t('scenes.unlockAll')}</button>
          <div className="scene-context-menu__divider" />
          <div className="scene-context-menu__label">{t('scenes.moveToLayer')}</div>
          {layers.map(l => (
            <button key={l.key} className="scene-context-menu__item" onClick={() => { onSetLayer(l.key); onClose(); }}>{l.label}</button>
          ))}
          <div className="scene-context-menu__divider" />
          <button className="scene-context-menu__item" onClick={() => { onResetRotation(); onClose(); }}>{t('scenes.resetRotationAll')}</button>
          <div className="scene-context-menu__divider" />
        </>
      )}
      <button className="scene-context-menu__item scene-context-menu__item--danger" onClick={() => { onDelete(); onClose(); }}>
        {imagesOnly ? t('scenes.deleteAll') : t('scenes.removeFromScene')}
      </button>
    </div>,
    document.body
  );
};

export default SceneTokenMultiContextMenu;
```

- [ ] **Step 3: Przechwycenie prawego kliku w `SceneViewport.jsx`**

Dodaj stan `const [multiMenu, setMultiMenu] = useState(null);` i props `onGroupDelete, onGroupSetLock, onGroupSetLayer, onGroupResetRotation`.
Na `scene-viewport__content` dodaj `onContextMenu`:
```javascript
                onContextMenu={(e) => {
                  if (editingLayer === 'select' && selectedTokens.length) {
                    e.preventDefault();
                    setMultiMenu({ x: e.clientX, y: e.clientY });
                  }
                }}
```
Render (koło MarqueeOverlay):
```javascript
                {multiMenu && (
                  <SceneTokenMultiContextMenu
                    x={multiMenu.x} y={multiMenu.y} selection={selectedTokens}
                    onDelete={onGroupDelete} onSetLock={onGroupSetLock}
                    onSetLayer={onGroupSetLayer} onResetRotation={onGroupResetRotation}
                    onClose={() => setMultiMenu(null)}
                  />
                )}
```
Import komponentu. Przekaż nowe propsy z `DndContext` do `SceneViewport`.

- [ ] **Step 4: Klucze i18n (en + pl, sekcja `scenes`)**

en:
```json
    "lockAll": "Lock all",
    "unlockAll": "Unlock all",
    "moveToLayer": "Move to layer",
    "resetRotationAll": "Reset rotation (all)",
    "deleteAll": "Delete all",
    "removeFromScene": "Remove selected from scene",
```
pl:
```json
    "lockAll": "Zablokuj wszystkie",
    "unlockAll": "Odblokuj wszystkie",
    "moveToLayer": "Przenieś na warstwę",
    "resetRotationAll": "Resetuj obrót (wszystkie)",
    "deleteAll": "Usuń wszystkie",
    "removeFromScene": "Zdejmij zaznaczone ze sceny",
```

- [ ] **Step 5: Weryfikacja manualna**

Zaznacz same obrazy → prawy klik: pełne menu (lock/unlock/move-to-layer/reset-rotation/delete), akcje działają na całej grupie. Zaznacz same postacie → tylko „Zdejmij ze sceny". Mieszane (obraz+postać) → tylko „Zdejmij zaznaczone ze sceny", obrazy usunięte, postacie zdjęte z siatki. Lint.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneTokenMultiContextMenu.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx warhammer-battle-helper-front/src/components/DndContext.jsx warhammer-battle-helper-front/src/locales
git commit -m "feat(scene): group context menu (intersection of applicable actions)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: i18n sync + pełna weryfikacja e2e

**Files:**
- Modify: `src/locales/en|pl/translation.json` (weryfikacja spójności)

- [ ] **Step 1: Sprawdź parę kluczy en/pl**

Użyj skilla `i18n-sync` (diff kluczy). Upewnij się, że wszystkie nowe klucze (`selectLayer`, `lockAll`, `unlockAll`, `moveToLayer`, `resetRotationAll`, `deleteAll`, `removeFromScene`) są w OBU plikach.

- [ ] **Step 2: Testy jednostkowe geometrii nadal zielone**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/utils/tokenGeometry.test.js`
Expected: PASS.

- [ ] **Step 3: Lint całości zmian**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/scene src/components/DndContext.jsx src/hooks/useGroupDrag.js src/utils/tokenGeometry.js`
Expected: brak błędów.

- [ ] **Step 4: Backend build**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./...`
Expected: brak błędów.

- [ ] **Step 5: Pełny scenariusz e2e (dwóch klientów)**

GM + gracz w tej samej grze/scenie. GM: tryb Select, warstwa tokens. Marquee → zaznacza obrazy + postacie. Group-drag → przesuwa; gracz widzi ruch (poza ukrytymi obrazami — te pozostają u gracza na starych pozycjach / niewidoczne). Menu multi: delete-all, remove-from-scene, move-to-layer działają i propagują. Delete/Backspace usuwa grupę. Escape czyści. Wyjście z trybu Select czyści zaznaczenie.

- [ ] **Step 6: Commit (jeśli i18n-sync coś poprawił)**

```bash
git add warhammer-battle-helper-front/src/locales
git commit -m "chore(i18n): sync multi-select keys en/pl

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review — pokrycie spec

- Tryb Select + ikona kursora → Task 4. ✓
- Reuse `imageEditLayer` picker, zasięg wg warstwy, pomija locked → Task 4 (picker), Task 6 (`marqueeCandidates`). ✓
- Stan `selectedTokens`, czyszczenie/Escape/WS-cleanup → Task 5. ✓
- Marquee rysowanie + intersekcja w komórkach + Shift additive → Task 1 (logika), Task 6 (wiring). ✓
- Klik/Shift-klik na żetonie, podświetlenie → Task 7. ✓
- Group drag (A) delta w komórkach, jedno źródło prawdy, snap, clamp bbox → Task 1 (clamp), Task 8. ✓
- Batch endpoint (jeden, oba kinds, jeden broadcast, masking ukrytych obrazów) → Task 2; front API+WS → Task 3, Task 5 (commit). ✓
- Menu multi B1 (przecięcie akcji), osobny komponent → Task 9. ✓
- Postacie identyfikowane charId+sceneId, delete = zdjęcie z siatki → Task 2/5/9. ✓
- i18n en+pl → Task 4, 9, 10. ✓
- Kompromisy (rotacja ignorowana w intersekcji: AABB nieobróconego = adapter zwraca bounding wg x/y/w/h) → zachowane, marquee liczy AABB. ✓

**Bramka jakości:** przed każdym commitem `npx eslint <zmienione pliki>` musi przejść czysto (wyłapie nieużywane symbole, brakujące zależności hooków). Backend: `go build ./... && go vet ./...`.
