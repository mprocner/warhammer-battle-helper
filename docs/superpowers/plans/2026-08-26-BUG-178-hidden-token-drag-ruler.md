# BUG-178 — Miarka ukrytego tokena nie wychodzi do graczy — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przeciąganie tokena ukrytego przed graczami (pojedynczo lub w grupie) nie rozgłasza miarki dystansu przez WS; MG nadal widzi swój lokalny odczyt.

**Architecture:** Drag-miarka wyprowadzona z `DndContext` do nowego hooka `useDragRuler`. Hook rozstrzyga prywatność dragu **raz**, na `onMeasureStart`, na podstawie listy tokenów `[{kind,id}]` przekazanej przez wywołującego, i trzyma decyzję w refie do końca dragu. Bramka tnie wyłącznie `sendMessage` — lokalny stan miarki ustawia się zawsze.

**Tech Stack:** React 18 (CRA / react-scripts), Jest + `@testing-library/react` (`renderHook`), WebSocket przez `sendMessage` z `GameSession`. Bez zmian w backendzie.

**Spec:** `docs/superpowers/specs/2026-08-26-BUG-178-hidden-token-drag-ruler-design.md`

## Global Constraints

- Ukrycie to dokładnie dwa pola: `placement.hidden` (token postaci, tablica `currentScene.characters`, klucz `characterId`) i `image.hidden` (obrazek-token, tablica `currentScene.images`, klucz `id`). Nic więcej.
- Fail closed: nierozpoznane id tokena liczy się jako ukryte. Brak miarki jest lepszy niż wyciek pozycji.
- Predykat i bramka istnieją w **jednym** miejscu — `src/hooks/useDragRuler.js`. Komponenty tokenów nie wiedzą nic o rozgłaszaniu.
- Ręczna miarka (narzędzie Measure, `hooks/useMapRuler.js`) jest nietykalna — nadal propaguje się do graczy.
- Komentarze i nazwy w kodzie po angielsku, zgodnie z resztą repo. Bez zmian w i18n i CSS.
- Katalog roboczy dla komend: `warhammer-battle-helper-front/`.
- Awaria `src/App.test.js` (`axios` ESM) jest bazowa — nie jest regresją i nie blokuje żadnego zadania.

---

### Task 1: Hook `useDragRuler` z bramką prywatności

**Files:**
- Create: `warhammer-battle-helper-front/src/hooks/useDragRuler.js`
- Test: `warhammer-battle-helper-front/src/hooks/useDragRuler.test.js`

**Interfaces:**
- Consumes: nic (pierwsze zadanie).
- Produces:
  - `export default function useDragRuler({ sendMessage, sceneId, userId, userName, images, characters })` → `{ dragRuler, onMeasureStart, onMeasureMove, onMeasureEnd }`
    - `dragRuler`: `{ from: {col,row}, to: {col,row} } | null`
    - `onMeasureStart(center, tokens)` — `center` to `{col,row}`, `tokens` to `[{ kind: 'char' | 'image', id: string }]`
    - `onMeasureMove(center)` — `{col,row}`
    - `onMeasureEnd()` — bez argumentów
  - `export function isPrivateDrag(tokens, { images, characters })` → `boolean`

- [ ] **Step 1: Write the failing test**

Utwórz `warhammer-battle-helper-front/src/hooks/useDragRuler.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import useDragRuler, { isPrivateDrag } from './useDragRuler';

const IMAGES = [
  { id: 'img-visible', hidden: false },
  { id: 'img-hidden', hidden: true },
];
const CHARACTERS = [
  { characterId: 'char-visible', hidden: false },
  { characterId: 'char-hidden', hidden: true },
];

function setup(sendMessage) {
  return renderHook(() => useDragRuler({
    sendMessage,
    sceneId: 'scene-1',
    userId: 'gm-1',
    userName: 'GM',
    images: IMAGES,
    characters: CHARACTERS,
  }));
}

describe('isPrivateDrag', () => {
  const scene = { images: IMAGES, characters: CHARACTERS };

  test('an empty or missing token list is not private', () => {
    expect(isPrivateDrag([], scene)).toBe(false);
    expect(isPrivateDrag(undefined, scene)).toBe(false);
  });

  test('a visible token is not private, a hidden one is', () => {
    expect(isPrivateDrag([{ kind: 'char', id: 'char-visible' }], scene)).toBe(false);
    expect(isPrivateDrag([{ kind: 'char', id: 'char-hidden' }], scene)).toBe(true);
    expect(isPrivateDrag([{ kind: 'image', id: 'img-visible' }], scene)).toBe(false);
    expect(isPrivateDrag([{ kind: 'image', id: 'img-hidden' }], scene)).toBe(true);
  });

  test('one hidden token makes the whole group private', () => {
    const group = [
      { kind: 'char', id: 'char-visible' },
      { kind: 'image', id: 'img-visible' },
      { kind: 'char', id: 'char-hidden' },
    ];
    expect(isPrivateDrag(group, scene)).toBe(true);
  });

  test('an id it cannot resolve counts as hidden (fail closed)', () => {
    expect(isPrivateDrag([{ kind: 'char', id: 'ghost' }], scene)).toBe(true);
    expect(isPrivateDrag([{ kind: 'image', id: 'ghost' }], scene)).toBe(true);
  });
});

describe('useDragRuler', () => {
  test('broadcasts the ruler while dragging a visible character token', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-visible' }]));

    expect(sendMessage).toHaveBeenCalledWith('MAP_RULER', {
      sceneId: 'scene-1',
      userId: 'gm-1',
      name: 'GM',
      from: { col: 1, row: 1 },
      to: { col: 1, row: 1 },
      active: true,
      aoe: false,
    });

    act(() => result.current.onMeasureEnd());

    expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({ active: false }));
  });

  test('keeps the ruler local when the dragged character token is hidden', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 2, row: 3 }, [{ kind: 'char', id: 'char-hidden' }]));

    expect(result.current.dragRuler).toEqual({ from: { col: 2, row: 3 }, to: { col: 2, row: 3 } });

    act(() => result.current.onMeasureMove({ col: 5, row: 3 }));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the dragged image token is hidden', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'image', id: 'img-hidden' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when a group holds one hidden token', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 4, row: 4 }, [
      { kind: 'image', id: 'img-visible' },
      { kind: 'char', id: 'char-hidden' },
    ]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local for a token id it cannot resolve', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'ghost' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a later visible drag broadcasts again after a private one', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-hidden' }]));
    act(() => result.current.onMeasureEnd());
    expect(sendMessage).not.toHaveBeenCalled();

    act(() => result.current.onMeasureStart({ col: 2, row: 2 }, [{ kind: 'char', id: 'char-visible' }]));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('throttles live updates to one send per 50 ms window', () => {
    const sendMessage = jest.fn();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);

    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'char', id: 'char-visible' }]));
    expect(sendMessage).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1020);
    act(() => result.current.onMeasureMove({ col: 1, row: 0 }));
    expect(sendMessage).toHaveBeenCalledTimes(1); // inside the window — dropped

    nowSpy.mockReturnValue(1060);
    act(() => result.current.onMeasureMove({ col: 2, row: 0 }));
    expect(sendMessage).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern="useDragRuler" --watchAll=false
```

Expected: FAIL — `Cannot find module './useDragRuler' from 'src/hooks/useDragRuler.test.js'`.

- [ ] **Step 3: Write minimal implementation**

Utwórz `warhammer-battle-helper-front/src/hooks/useDragRuler.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react';

// Throttle for outgoing MAP_RULER updates during a drag — keeps the WS chatty-but-cheap,
// same spirit as a cursor stream. Mirrors useMapRuler's SEND_THROTTLE_MS.
const SEND_THROTTLE_MS = 50;

// A token hidden from players must not leak its position through the broadcast drag ruler (BUG-178):
// the player never sees the token, but a ruler drawn from its cell to the drop cell tells them
// exactly where it was and where it went.
//
// `tokens` is [{ kind: 'char' | 'image', id }] — every token the drag moves. One entry for a single
// drag, the whole selection for a group drag, where one hidden token makes the whole group private.
//
// Fail closed: an id we cannot resolve counts as hidden — a missing ruler beats a leaked position.
// Anything that is not kind 'image' is looked up as a character placement, so a malformed kind also
// fails closed instead of silently broadcasting.
export function isPrivateDrag(tokens, { images = [], characters = [] } = {}) {
  if (!tokens || !tokens.length) return false;
  return tokens.some(t => {
    if (t.kind === 'image') {
      const image = images.find(i => i.id === t.id);
      return image ? !!image.hidden : true;
    }
    const placement = characters.find(c => c.characterId === t.id);
    return placement ? !!placement.hidden : true;
  });
}

// Live measuring ruler while dragging a token (grab point → current position). Shown locally to the
// dragger AND broadcast to other players over the same MAP_RULER channel as the manual ruler tool —
// unless the drag carries a token hidden from players, in which case the readout stays on this
// client. Ephemeral, never persisted: the hub relays MAP_RULER to the whole game like POINTER_PING.
export default function useDragRuler({ sendMessage, sceneId, userId, userName, images, characters }) {
  const [dragRuler, setDragRuler] = useState(null); // { from: {col,row}, to: {col,row} } | null
  const fromRef = useRef(null);
  const lastSendRef = useRef(0);
  // Decided once per drag, on start, and honoured until the drag ends — a scene update mid-drag
  // must not flip a private drag into a broadcasting one.
  const privateRef = useRef(false);
  // Mirrored so the handlers keep a stable identity: DndContext rebuilds these arrays on every
  // render, and an unstable onMeasureStart would churn every token's mousedown callback.
  // Same trick as sceneIdRef in DndContext.
  const sceneRef = useRef({ images, characters });
  useEffect(() => { sceneRef.current = { images, characters }; }, [images, characters]);

  const send = useCallback((from, to, active) => {
    if (!sendMessage) return;
    if (privateRef.current) return; // hidden token in this drag — nothing leaves the client
    if (active) {
      const now = Date.now();
      if (now - lastSendRef.current < SEND_THROTTLE_MS) return; // throttle live updates
      lastSendRef.current = now;
    }
    sendMessage('MAP_RULER', { sceneId, userId, name: userName, from, to, active, aoe: false });
  }, [sendMessage, sceneId, userId, userName]);

  const onMeasureStart = useCallback((center, tokens) => {
    privateRef.current = isPrivateDrag(tokens, sceneRef.current);
    fromRef.current = center;
    setDragRuler({ from: center, to: center });
    send(center, center, true);
  }, [send]);

  const onMeasureMove = useCallback((center) => {
    const from = fromRef.current;
    setDragRuler(from ? { from, to: center } : null);
    if (from) send(from, center, true);
  }, [send]);

  const onMeasureEnd = useCallback(() => {
    const from = fromRef.current;
    fromRef.current = null;
    setDragRuler(null);
    send(from, from, false);
    privateRef.current = false;
  }, [send]);

  return { dragRuler, onMeasureStart, onMeasureMove, onMeasureEnd };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern="useDragRuler" --watchAll=false
```

Expected: PASS — 11 testów (4 w `isPrivateDrag`, 7 w `useDragRuler`), 0 failed.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useDragRuler.js warhammer-battle-helper-front/src/hooks/useDragRuler.test.js
git commit -m "$(cat <<'EOF'
fix(front): BUG-178 add a drag-ruler hook that never broadcasts hidden tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Przepnij `DndContext` na hooka (refactor bez zmiany zachowania)

`onMeasureStart` bez drugiego argumentu daje `isPrivateDrag(undefined, ...) === false`, czyli dokładnie dzisiejsze (jeszcze błędne) zachowanie. To zadanie jest świadomie no-opem funkcjonalnym — bug znika w Task 3.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx:19` (import), `:67-99` (usunięcie przeniesionego kodu + wywołanie hooka), `:991` (usunięcie aliasu)

**Interfaces:**
- Consumes: `useDragRuler` z Task 1 — `{ dragRuler, onMeasureStart, onMeasureMove, onMeasureEnd }`.
- Produces: nazwy propsów przekazywanych do `SceneViewport` bez zmian — `dragRuler`, `onTokenDragMeasureStart`, `onTokenDragMeasureMove`, `onTokenDragMeasureEnd`.

- [ ] **Step 1: Dodaj import hooka**

W `warhammer-battle-helper-front/src/components/DndContext.jsx`, pod istniejącą linią 20 (`import { useWindowManager } from '../contexts/WindowManagerContext';`) dodaj:

```js
import useDragRuler from '../hooks/useDragRuler';
```

- [ ] **Step 2: Zamień blok drag-miarki na wywołanie hooka**

Usuń cały ten fragment (obecne linie 67-99):

```js
  // Live measuring ruler while dragging a token (grab point → current position). Shown locally
  // AND broadcast to other players over the same MAP_RULER channel as the manual ruler tool.
  const [imageDragRuler, setImageDragRuler] = useState(null);
  const [aoeMeasure, setAoeMeasure] = useState(true); // AoE circle toggle for the manual ruler tool
  const dragRulerFromRef = useRef(null);
  const lastDragRulerSendRef = useRef(0);
  const sendDragRuler = useCallback((from, to, active) => {
    if (!sendMessage) return;
    if (active) {
      const now = Date.now();
      if (now - lastDragRulerSendRef.current < 50) return; // throttle live updates
      lastDragRulerSendRef.current = now;
    }
    sendMessage('MAP_RULER', { sceneId: currentSceneId, userId, name: userName, from, to, active, aoe: false });
  }, [sendMessage, currentSceneId, userId, userName]);

  // Image-token drags feed the ruler via callbacks; character drags derive it from activeId/overId.
  const handleTokenDragMeasureStart = useCallback((center) => {
    dragRulerFromRef.current = center;
    setImageDragRuler({ from: center, to: center });
    sendDragRuler(center, center, true);
  }, [sendDragRuler]);
  const handleTokenDragMeasureMove = useCallback((center) => {
    const from = dragRulerFromRef.current;
    setImageDragRuler(from ? { from, to: center } : null);
    if (from) sendDragRuler(from, center, true);
  }, [sendDragRuler]);
  const handleTokenDragMeasureEnd = useCallback(() => {
    const from = dragRulerFromRef.current;
    dragRulerFromRef.current = null;
    setImageDragRuler(null);
    sendDragRuler(from, from, false);
  }, [sendDragRuler]);
```

i wstaw w to miejsce:

```js
  const [aoeMeasure, setAoeMeasure] = useState(true); // AoE circle toggle for the manual ruler tool

  // Live drag ruler + its broadcast gate (a hidden token's ruler stays local) — hooks/useDragRuler.js.
  const {
    dragRuler,
    onMeasureStart: handleTokenDragMeasureStart,
    onMeasureMove: handleTokenDragMeasureMove,
    onMeasureEnd: handleTokenDragMeasureEnd,
  } = useDragRuler({
    sendMessage,
    sceneId: currentSceneId,
    userId,
    userName,
    images: currentScene?.images || [],
    characters: currentScene?.characters || [],
  });
```

Uwaga: `aoeMeasure` **zostaje** w `DndContext` — to przełącznik AoE ręcznej miarki, nie ma nic wspólnego z drag-miarką.

- [ ] **Step 3: Usuń alias `dragRuler`**

W tym samym pliku usuń linię (obecnie 991):

```js
  const dragRuler = imageDragRuler;
```

Komentarz nad nią (`// Other players' rulers on this scene (manual tool + broadcast drag rulers).`) i linia `sceneRulers` zostają nietknięte.

- [ ] **Step 4: Sprawdź, że nic nie zostało po starym kodzie**

```bash
cd warhammer-battle-helper-front && grep -n "imageDragRuler\|sendDragRuler\|dragRulerFromRef\|lastDragRulerSendRef" src/components/DndContext.jsx
```

Expected: brak wyjścia (exit code 1).

- [ ] **Step 5: Uruchom pakiet testów**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20
```

Expected: PASS wszędzie poza znaną bazową awarią `src/App.test.js` (`axios` ESM). Żaden inny plik nie może pęknąć.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "$(cat <<'EOF'
refactor(front): BUG-178 move the drag ruler out of DndContext into useDragRuler

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wywołujący przekazują tożsamość tokenów; usuń martwe propsy

Tu bug faktycznie znika.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx:119-122`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx:143-144`
- Modify: `warhammer-battle-helper-front/src/hooks/useGroupDrag.js:36`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx:4,33-35`

**Interfaces:**
- Consumes: `onMeasureStart(center, tokens)` z Task 1, przekazywane jako prop `onTokenDragMeasureStart` przez `DndContext` (Task 2) → `SceneViewport` → `MapTokensLayer` → `MapCharacterToken` / `SceneImage`, oraz jako `onMeasureStart` do `useGroupDrag`.
- Produces: nic dla kolejnych zadań (ostatnie).

- [ ] **Step 1: Token postaci przekazuje swój deskryptor**

W `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx` zamień:

```js
    // Snap mode: the ruler measures cell-to-cell (start cell → landing cell), stepping discretely.
    onTokenDragMeasureStart?.(snap
      ? { col: Math.round(pos.col) + size.w / 2, row: Math.round(pos.row) + size.h / 2 }
      : { col: pos.col + size.w / 2, row: pos.row + size.h / 2 });
  }, [canDrag, pos, size, zoom, gridWidth, gridHeight, snap, editingLayer, imageEditLayer, onTokenDragMeasureStart, multiSelected, onGroupDragStart]);
```

na:

```js
    // Snap mode: the ruler measures cell-to-cell (start cell → landing cell), stepping discretely.
    // The token descriptor lets the ruler hook decide whether this drag may be broadcast: a
    // placement hidden from players must not leak its position through the ruler (BUG-178).
    onTokenDragMeasureStart?.(snap
      ? { col: Math.round(pos.col) + size.w / 2, row: Math.round(pos.row) + size.h / 2 }
      : { col: pos.col + size.w / 2, row: pos.row + size.h / 2 },
      [{ kind: 'char', id: character.id }]);
  }, [canDrag, pos, size, zoom, gridWidth, gridHeight, snap, editingLayer, imageEditLayer, onTokenDragMeasureStart, multiSelected, onGroupDragStart, character.id]);
```

`character.id` to `sc.characterId` również dla widza bez karty — stub w `utils/placedCharacters.js:15` ustawia `id: sc.characterId`, więc lookup w `characters` zawsze trafia.

- [ ] **Step 2: Obrazek-token przekazuje swój deskryptor**

W `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` zamień:

```js
    onTokenDragMeasureStart?.({ col: (snapCoord(pos.x) + size.width / 2) / CELL_SIZE, row: (snapCoord(pos.y) + size.height / 2) / CELL_SIZE });
  }, [editingLayer, multiSelected, onGroupDragStart, canDragImage, image.locked, pos, zoom, size, gridWidth, gridHeight, snapCoord, onTokenDragMeasureStart]);
```

na:

```js
    // The descriptor gates the broadcast: an image token hidden from players keeps its ruler local.
    onTokenDragMeasureStart?.({ col: (snapCoord(pos.x) + size.width / 2) / CELL_SIZE, row: (snapCoord(pos.y) + size.height / 2) / CELL_SIZE },
      [{ kind: 'image', id: image.id }]);
  }, [editingLayer, multiSelected, onGroupDragStart, canDragImage, image.locked, image.id, pos, zoom, size, gridWidth, gridHeight, snapCoord, onTokenDragMeasureStart]);
```

- [ ] **Step 3: Grupa przekazuje całe zaznaczenie**

W `warhammer-battle-helper-front/src/hooks/useGroupDrag.js` zamień:

```js
    // Ruler measures the group's travel: from its bounding-box center to where the drag takes it.
    onMeasureStart?.({ col: center.col, row: center.row });
```

na:

```js
    // Ruler measures the group's travel: from its bounding-box center to where the drag takes it.
    // The whole selection goes along, so one hidden token in it keeps the ruler off the wire.
    onMeasureStart?.({ col: center.col, row: center.row }, selectedTokens);
```

Tablica zależności `begin` już zawiera `selectedTokens` — nie zmieniaj jej.

- [ ] **Step 4: Usuń martwe propsy z `SceneLayer`**

W `warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx` zamień linię 4:

```js
const SceneLayer = ({ images, layerName, isGM, gameId, sceneId, editingLayer, imageEditLayer, gameSystem, selectedImageId, onSelectImage, tokenPlacementMode = 'snap', onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd, isTokenSelected, onToggleTokenSelected, multiSelectActive, groupDragDelta, onGroupDragStart }) => {
```

na:

```js
// No drag-measure callbacks here: SceneViewport renders this layer only for `background` and `gm`,
// and neither measures on a single image drag. The tokens layer goes through MapTokensLayer.
const SceneLayer = ({ images, layerName, isGM, gameId, sceneId, editingLayer, imageEditLayer, gameSystem, selectedImageId, onSelectImage, tokenPlacementMode = 'snap', isTokenSelected, onToggleTokenSelected, multiSelectActive, groupDragDelta, onGroupDragStart }) => {
```

i usuń trzy linie 33-35:

```js
          onTokenDragMeasureStart={onTokenDragMeasureStart}
          onTokenDragMeasureMove={onTokenDragMeasureMove}
          onTokenDragMeasureEnd={onTokenDragMeasureEnd}
```

- [ ] **Step 5: Sprawdź, że każde wywołanie start przekazuje deskryptory**

```bash
cd warhammer-battle-helper-front && grep -rn "onTokenDragMeasureStart?.\|onMeasureStart?." src/
```

Expected: dokładnie trzy wywołania — `MapCharacterToken.jsx` (`[{ kind: 'char', ...`), `SceneImage.jsx` (`[{ kind: 'image', ...`), `useGroupDrag.js` (`selectedTokens`). Żadne bez drugiego argumentu.

```bash
cd warhammer-battle-helper-front && grep -rn "onTokenDragMeasure" src/components/scene/SceneLayer.jsx
```

Expected: brak wyjścia (exit code 1).

- [ ] **Step 6: Uruchom pakiet testów**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20
```

Expected: PASS wszędzie poza bazową awarią `src/App.test.js`. Zwróć uwagę na `src/utils/tokenManipulation.test.js` i `src/components/scene/sceneModes.test.js` — muszą przejść.

- [ ] **Step 7: Weryfikacja ręczna w przeglądarce**

Podnieś stack: `docker compose up -d --build` (backend :8080, front :3000). Potrzebne dwa konta — MG i gracz. Rejestracja przez `POST /register {email, password}` (hasło min. 8 znaków), potem zdejmij bramkę aktywacji w mongo (kontener `warhammer-battle-helper-mongo-1`, baza `battle_helper`, `root`/`example`, `authSource=admin`):

```
users.updateOne({email}, {$set: {activationToken: ''}})
```

Samo `active: true` nie wystarcza — `Login` odrzuca na `user.ActivationToken != ""`. Potem `POST /login` po token. MG w jednym oknie przeglądarki, gracz w drugim (osobny profil lub okno prywatne — token siedzi w localStorage). Jeśli pracujesz w worktree, pamiętaj o whitelistcie CORS i mountowaniu kontenera.

Scena musi mieć co najmniej: jeden widoczny token postaci, jeden ukryty token postaci (ikonka oka u MG), dwa widoczne obrazki-tokeny i jeden ukryty obrazek-token. Gracz musi być dołączony do gry i patrzeć na tę samą scenę.

| Krok (jako MG) | Oczekiwanie u gracza | Oczekiwanie u MG |
|---|---|---|
| przeciągnij widoczny token postaci | widzi linię + odczyt | widzi linię + odczyt |
| przeciągnij ukryty token postaci | **nic** | widzi linię + odczyt |
| przeciągnij ukryty obrazek-token | **nic** | widzi linię + odczyt |
| zaznacz widoczny + ukryty (tryb Select), przeciągnij grupę | **nic** | widzi linię + odczyt |
| zaznacz dwa widoczne, przeciągnij grupę | widzi linię + odczyt | widzi linię + odczyt |
| zmierz ręcznie narzędziem Measure | widzi linię + odczyt + okrąg AoE | to samo |

Dodatkowo: po prywatnym dragu ukrytego tokena natychmiast przeciągnij widoczny — u gracza miarka **musi** znów się pojawić (ref prywatności czyszczony na `onMeasureEnd`).

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx warhammer-battle-helper-front/src/components/scene/SceneImage.jsx warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx warhammer-battle-helper-front/src/hooks/useGroupDrag.js
git commit -m "$(cat <<'EOF'
fix(front): BUG-178 stop the drag ruler from leaking hidden token positions

Every drag now hands the ruler hook the tokens it moves, so a hidden placement
or image token keeps its measurement on the GM's client. One hidden token in a
group selection makes the whole group's ruler private.

Also drops SceneLayer's drag-measure props: SceneViewport renders that layer
only for background/gm, which never measure a single image drag.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```
