# Image select + keyboard delete — design

## Goal

GM can click a scene image to select it, then press **Delete** or **Backspace** to remove it. Works on all image layers (`background`, `tokens`, `gm`) except **locked** images.

## Current state (why this is small)

- Backend `DeleteSceneImage` endpoint + WS broadcast already exist. Right-click context menu already deletes via `deleteSceneImage`.
- Selection already exists but only for `tokens`-layer images: `selectedImageTokenId` state in `DndContext.jsx`, GM click toggles HP/gear ring expansion. `background`/`gm` images are not selectable.
- Drawing paths already implement the exact target pattern: `selectedDrawingPathId` state + cleanup effect + `handleDeleteSelectedDrawing` in `DndContext.jsx`, and a `keydown` Delete/Backspace listener in `DrawingLayer.jsx:287`. This feature mirrors it.

## Decision — state model

Generalize the existing `selectedImageTokenId` into a single `selectedImageId` covering all layers. Rejected: a second parallel selection state (two "selected" images could disagree, more state, confusing). Token selection already *is* image selection — only renamed.

## Changes

### `DndContext.jsx`
- Rename `selectedImageTokenId` → `selectedImageId`, `setSelectedImageTokenId` → `setSelectedImageId`, `handleSelectImageToken` → `handleSelectImage`. Keep toggle semantics (click same image again = deselect) and the `setActiveTokenId(null)` side effect.
- Update the `SceneViewport` props: `selectedImageTokenId=` → `selectedImageId=`, `onSelectImageToken=` → `onSelectImage=`.
- New keyboard `useEffect` (mirrors `DrawingLayer.jsx:287`):
  - Listen `keydown` on `window`.
  - Act only when `selectedImageId` set and `e.key` is `Delete` or `Backspace`.
  - Guard: ignore when focus is in an editable field — `e.target` matches `INPUT`/`TEXTAREA`/`SELECT` or `isContentEditable`.
  - Look up the image in `currentScene.images`; if not found or `image.locked` → ignore.
  - Call `deleteSceneImage(gameId, currentSceneId, selectedImageId)`, then `setSelectedImageId(null)`. Wrap in try/catch + `console.error` like `handleDeleteSelectedDrawing`.
  - Deps include `selectedImageId`, `currentScene?.images`, `gameId`, `currentSceneId`.
- New cleanup `useEffect` (mirrors drawing cleanup at `DndContext.jsx:735`): if `selectedImageId` is set but no longer present in `currentScene.images` (e.g. deleted via WS by another client), `setSelectedImageId(null)`.

### `SceneViewport.jsx` → `SceneLayer.jsx` → `SceneImage.jsx`
- Thread the renamed props through: `selectedImageId` / `onSelectImage` (was `selectedImageTokenId` / `onSelectImageToken`).
- `SceneLayer.jsx`: `selected={selectedImageId === image.id}` (was token id).

### `SceneImage.jsx`
- Widen `handleClick`: currently early-returns unless `isToken`. Change so a GM click selects **any** image.
  - Keep the drag guard (`movedRef.current || isDragging` → skip).
  - Skip selection when a drawing/fog tool is active (`activeTool` is a draw/fog mode) so tool clicks aren't hijacked. Selection allowed in the default/non-drawing state.
  - Token images: selecting still expands the ring (unchanged behavior — ring keys off `selected && isToken`).
- Visual for non-token selected image: add a `scene-image--selected` class (or equivalent) when `selected && !isToken`.

### CSS (`SceneViewport.css` or `style.css`)
- `.scene-image--selected` → gold selection outline, e.g. `outline: 2px solid #c9975b; outline-offset: 2px;`. Follows the card gold accent (`#c9975b`).

### Backend
- None. `DeleteSceneImage` + WS broadcast already handle it, GM-gated in the service.

## i18n
- None expected (no new user-facing strings; keyboard action has no label).

## Trade-offs / notes

- **No confirmation** (user choice): Backspace can delete a configured HP/gear token instantly. Mitigated only by the input-focus guard and the fact deletes broadcast + are re-addable. Accepted.
- Locked images stay selectable (outline shows) but Delete is a no-op on them — keeps the guard logic in one place.

## Verification (manual — no backend change, no FE test harness)

1. GM selects a `background` image → outline appears; press Delete → removed; press Backspace on another → removed.
2. GM selects a `tokens` image → ring expands as before; Delete removes it.
3. `gm`-layer image → select + delete works.
4. Locked image → select shows outline, Delete/Backspace does nothing.
5. Focus a text input (e.g. z-index field, chat) with an image selected → Backspace edits text, does NOT delete image.
6. Two clients: client A deletes selected image → client B's stale selection clears (no crash), image gone via WS.
