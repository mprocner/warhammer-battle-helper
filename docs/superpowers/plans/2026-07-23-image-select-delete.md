# Image Select + Keyboard Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GM clicks a scene image to select it, then presses Delete/Backspace to remove it — all layers except locked images.

**Architecture:** Generalize the existing tokens-only selection (`selectedImageTokenId`) into one `selectedImageId` covering every image layer. Widen the click handler so any image is selectable, add a keyboard listener + WS-driven cleanup in `DndContext.jsx`. Mirrors the existing drawing-path select/delete pattern. Backend already has the delete endpoint + WS broadcast.

**Tech Stack:** React (hooks), existing `api/scenes.js` (`deleteSceneImage`), CSS in `SceneViewport.css`.

## Global Constraints

- **GM-only.** Selection click already runs behind `isGM`; backend `DeleteSceneImage` is GM-gated in the service. No player path.
- **No confirmation dialog.** Delete/Backspace deletes immediately (user decision).
- **Input guard.** Keyboard delete must NOT fire when focus is in `INPUT`/`TEXTAREA`/`SELECT` or `isContentEditable`.
- **Locked images:** selectable (outline shows) but Delete/Backspace is a no-op on them.
- **Select gate:** a click selects only when `editingLayer === null || activeTool === 'pan'` (the exact condition `SceneImage.jsx:24` / `:454` already use for token drag/ring). No new tool-name list.
- **No backend changes.** `deleteSceneImage(gameId, sceneId, imageId)` + WS already exist.

---

### Task 1: Rename selection state to general image selection

Pure mechanical rename — `selectedImageTokenId` → `selectedImageId`, `onSelectImageToken` → `onSelectImage`, `handleSelectImageToken` → `handleSelectImage`. Behavior unchanged (token ring still expands). Must be done atomically across all 4 files or the app won't build.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx:110,227-230,980`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:36,617-618`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx:4,30-31`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx:14,295`

**Interfaces:**
- Produces: state `selectedImageId` (string|null) + `setSelectedImageId`; callback `handleSelectImage(imageId)` in `DndContext`. Props `selectedImageId` / `onSelectImage` threaded SceneViewport → SceneLayer → SceneImage.

- [ ] **Step 1: DndContext state rename**

`DndContext.jsx:110` — from:
```jsx
  const [selectedImageTokenId, setSelectedImageTokenId] = useState(null);
```
to:
```jsx
  const [selectedImageId, setSelectedImageId] = useState(null);
```

- [ ] **Step 2: DndContext handler rename**

`DndContext.jsx:227-230` — from:
```jsx
  const handleSelectImageToken = useCallback((imageId) => {
    setSelectedImageTokenId(prev => (prev === imageId ? null : imageId));
    setActiveTokenId(null);
  }, []);
```
to:
```jsx
  const handleSelectImage = useCallback((imageId) => {
    setSelectedImageId(prev => (prev === imageId ? null : imageId));
    setActiveTokenId(null);
  }, []);
```

- [ ] **Step 3: DndContext SceneViewport props**

`DndContext.jsx:980` — in the `<SceneViewport ... />` props, change:
```jsx
selectedImageTokenId={selectedImageTokenId} onSelectImageToken={handleSelectImageToken}
```
to:
```jsx
selectedImageId={selectedImageId} onSelectImage={handleSelectImage}
```

- [ ] **Step 4: SceneViewport signature + pass-through**

`SceneViewport.jsx:36` — change the destructured props:
```jsx
  selectedImageTokenId = null, onSelectImageToken, gameSystem = 'warhammer4e',
```
to:
```jsx
  selectedImageId = null, onSelectImage, gameSystem = 'warhammer4e',
```

`SceneViewport.jsx:617-618` — change the props passed to `<SceneLayer>`:
```jsx
                  selectedImageTokenId={selectedImageTokenId}
                  onSelectImageToken={onSelectImageToken}
```
to:
```jsx
                  selectedImageId={selectedImageId}
                  onSelectImage={onSelectImage}
```

- [ ] **Step 5: SceneLayer signature + child props**

`SceneLayer.jsx:4` — change `selectedImageTokenId, onSelectImageToken,` to `selectedImageId, onSelectImage,`.

`SceneLayer.jsx:30-31` — change:
```jsx
          selected={selectedImageTokenId === image.id}
          onSelectImageToken={onSelectImageToken}
```
to:
```jsx
          selected={selectedImageId === image.id}
          onSelectImage={onSelectImage}
```

- [ ] **Step 6: SceneImage prop + usage rename**

`SceneImage.jsx:14` — in the destructured props change `onSelectImageToken` to `onSelectImage`.

`SceneImage.jsx:290-296` — the current `handleClick` (still token-only for now):
```jsx
  const handleClick = useCallback((e) => {
    if (!isToken || !isGM || !onSelectImageToken) return;
    if (movedRef.current || isDragging) return;
    e.stopPropagation();
    onSelectImageToken(image.id);
  }, [isToken, isGM, onSelectImageToken, isDragging, image.id]);
```
becomes (rename only — logic widened in Task 2):
```jsx
  const handleClick = useCallback((e) => {
    if (!isToken || !isGM || !onSelectImage) return;
    if (movedRef.current || isDragging) return;
    e.stopPropagation();
    onSelectImage(image.id);
  }, [isToken, isGM, onSelectImage, isDragging, image.id]);
```

- [ ] **Step 7: Verify no stale references remain**

Run: `grep -rn "selectedImageTokenId\|onSelectImageToken\|handleSelectImageToken" warhammer-battle-helper-front/src/`
Expected: no output (all renamed).

- [ ] **Step 8: Build check**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: build succeeds, no undefined-variable errors.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/DndContext.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx warhammer-battle-helper-front/src/components/scene/SceneImage.jsx
git commit -m "refactor: rename selectedImageTokenId to selectedImageId"
```

---

### Task 2: Make any non-drawing-mode image selectable + selection outline

Widen `handleClick` so background/gm images (not just tokens) select on GM click, behind the draw-mode gate. Give selectable images a pointer cursor. Generalize the selection-outline CSS so non-token images show it too.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx:290-296,381`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.css:318-322`

**Interfaces:**
- Consumes: `onSelectImage` / `selected` from Task 1.
- Produces: any image with `selected` true renders the `.scene-image--selected` outline.

- [ ] **Step 1: Widen handleClick**

`SceneImage.jsx` `handleClick` (from Task 1) — replace with:
```jsx
  // GM click selects any image (not just tokens) so it can be deleted via keyboard.
  // Gated to non-drawing context (default or pan) — same condition as token drag/ring —
  // so tool clicks aren't hijacked. A real drag must not select afterwards.
  const handleClick = useCallback((e) => {
    if (!isGM || !onSelectImage) return;
    if (!(editingLayer === null || activeTool === 'pan')) return;
    if (movedRef.current || isDragging) return;
    e.stopPropagation();
    onSelectImage(image.id);
  }, [isGM, onSelectImage, editingLayer, activeTool, isDragging, image.id]);
```

- [ ] **Step 2: Pointer cursor for selectable images**

`SceneImage.jsx:381` — from:
```jsx
          cursor: canDragImage ? (isDragging ? 'grabbing' : 'grab') : (isToken && isGM ? 'pointer' : 'default'),
```
to:
```jsx
          cursor: canDragImage ? (isDragging ? 'grabbing' : 'grab') : (isGM && (editingLayer === null || activeTool === 'pan') ? 'pointer' : 'default'),
```

- [ ] **Step 3: Generalize selection-outline CSS**

`SceneViewport.css:318-322` — from:
```css
/* Selected token image gets a subtle ring so it reads as "active" while its overlay is expanded. */
.scene-image--token.scene-image--selected {
  outline: 2px solid rgba(201, 151, 91, 0.9);
  outline-offset: 1px;
}
```
to:
```css
/* Selected image (any layer) gets a subtle gold ring so it reads as "active". */
.scene-image--selected {
  outline: 2px solid rgba(201, 151, 91, 0.9);
  outline-offset: 1px;
}
```

- [ ] **Step 4: Build check**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verify (GM in a game)**

- Pan mode (no drawing tool): click a `background` image → gold outline appears; click it again → outline clears.
- Click a `tokens` image → HP/gear ring expands (unchanged); outline shows.
- Click a `gm`-layer image → outline appears.
- Switch to a drawing tool (e.g. freehand) → clicking an image draws, does NOT select.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImage.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.css
git commit -m "feat: select any scene image on GM click"
```

---

### Task 3: Keyboard Delete/Backspace to remove the selected image

Add the keyboard listener and the WS-cleanup effect in `DndContext.jsx`, mirroring the drawing-path pattern (`DndContext.jsx:734-740`, `DrawingLayer.jsx:287`).

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx:11` (import), plus a new block near the selection state (`~line 111`).

**Interfaces:**
- Consumes: `selectedImageId` / `setSelectedImageId` (Task 1), `currentScene?.images`, `gameId`, `currentSceneId`.
- Produces: side effects only (API call + selection clear).

- [ ] **Step 1: Import deleteSceneImage**

`DndContext.jsx:11` — from:
```jsx
import { undoLastDrawingPath, clearDrawingPaths, undoLastFogPath, clearFogPaths, revealAllFog, deleteDrawingPath } from '../api/scenes';
```
to:
```jsx
import { undoLastDrawingPath, clearDrawingPaths, undoLastFogPath, clearFogPaths, revealAllFog, deleteDrawingPath, deleteSceneImage } from '../api/scenes';
```

- [ ] **Step 2: Add cleanup + keyboard effects**

Insert directly AFTER the `selectedImageId` state (the line `const [selectedImageId, setSelectedImageId] = useState(null);`, ~line 110 from Task 1):
```jsx

  // Clear selection when the selected image is removed by any user (WS delete).
  // Mirrors the drawing-path cleanup below.
  useEffect(() => {
    if (!selectedImageId) return;
    const images = currentScene?.images || [];
    if (!images.find(i => i.id === selectedImageId)) {
      setSelectedImageId(null);
    }
  }, [currentScene?.images, selectedImageId]);

  // Delete / Backspace removes the selected image (GM). Locked images are skipped.
  // Ignored while typing in a field. Mirrors DrawingLayer's keyboard delete.
  useEffect(() => {
    if (!selectedImageId) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const img = (currentScene?.images || []).find(i => i.id === selectedImageId);
      if (!img || img.locked) return;
      deleteSceneImage(gameId, currentSceneId, selectedImageId)
        .then(() => setSelectedImageId(null))
        .catch(err => console.error('Failed to delete scene image:', err));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageId, currentScene?.images, gameId, currentSceneId]);
```

- [ ] **Step 3: Build check**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verify (GM in a game)**

1. Select a `background` image → press `Delete` → image removed. Select another → press `Backspace` → removed.
2. Select a `tokens` image → `Delete` removes it.
3. Select a `gm`-layer image → `Delete` removes it.
4. Lock an image, select it → `Delete`/`Backspace` do nothing (image stays).
5. With an image selected, focus a text field (e.g. the z-index input in the context menu, or chat) and press `Backspace` → text edits, image is NOT deleted.
6. Two browsers (two GMs / GM+GM): A deletes the selected image → B's view loses the image via WS and any stale selection there clears without error.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "feat: delete selected scene image with Delete/Backspace"
```

---

## Self-Review

- **Spec coverage:** rename → Task 1; select all layers + outline + gate → Task 2; keyboard Delete/Backspace + input guard + locked no-op + WS cleanup → Task 3; backend none (confirmed). All spec sections mapped.
- **Placeholders:** none — every step has concrete code/commands.
- **Type consistency:** `selectedImageId`/`setSelectedImageId`/`handleSelectImage`/`onSelectImage` used identically across all tasks; `deleteSceneImage(gameId, sceneId, imageId)` matches `SceneImage.jsx` usage.
- **Note:** no FE test harness in this repo — verification is manual + `npm run build`, consistent with the spec.
