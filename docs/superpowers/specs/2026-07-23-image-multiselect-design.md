# Multi-select żetonów sceny (marquee + group move)

Data: 2026-07-23
Status: zaakceptowany, gotowy do planu implementacji

## Cel

GM zaznacza wiele żetonów sceny naraz przez przeciągnięcie prostokąta (marquee)
lewym klawiszem myszy, przesuwa je razem jednym dragiem, i wykonuje na całej
grupie akcje z osobnego menu kontekstowego. Żetony = **obrazy sceny ORAZ żetony
postaci** (character tokens). Rozszerzenie istniejącego single-select
(`selectedImageId` + keyboard delete + ring token-layer).

## Kontekst istniejący (stan przed zmianą)

- `DndContext.jsx:110` — `selectedImageId` (single). Ring token-layer (default/pan)
  + keyboard delete (`DndContext.jsx:131`).
- Click-select gated: GM only, `editingLayer === null || activeTool === 'pan'`.
- Obrazy w 3 warstwach render: `background`, `tokens`, `gm`.
- **Geometria już zunifikowana**: `tokenGeometry.js` — kanoniczna przestrzeń
  KOMÓREK (`CellRect {col,row,w,h}`, floaty dla free mode). Adaptery
  `characterToMapToken` / `imageToMapToken` (px→cells przez `CELL_SIZE`).
  `MapTokensLayer` renderuje oba kinds w jednej z-order warstwie (stary osobny
  grid postaci już usunięty).
- Różnica px vs cells siedzi **tylko w schemacie zapisu**:
  - obraz = `scene.images`, `x/y/width/height` px (`SceneImage`, PUT `images/:id`)
  - postać = placement, `positionX/positionY` cells (`Game.go:119`,
    `handleMoveCharacter` → `PUT /scenes/:sid/characters/:charId`). Delete
    placementu = **zdejmij z siatki**, nie usuń encji.
  - Prereq zrobiony: martwe legacy no-scene ścieżki (`!sid`: `/characters/move`
    404, `POST /characters` tworzył encję, `DELETE /characters/:id` kasował
    encję) usunięte — persist postaci jest teraz czysto scene-scoped
    (identyfikacja: `charId` + `sceneId`, nigdy `placementId`).
- Każdy `SceneImage` / `MapCharacterToken` prowadzi własny drag (lokalne
  listenery), zapisuje per-żeton.
- Tryby (`editingLayer`): `null` (pan), `grid` (Images), `fog`, `drawing`,
  `measure`. Tab-row w `DrawingToolbar.jsx:100-142`. Tryb `grid` uzbraja jedną
  warstwę obrazów przez `imageEditLayer`.
- Routes scene-image: `main.go:253-258`.

## Decyzje projektowe

### 1. Nowy tryb Select
- `editingLayer === 'select'` — nowy tab w `DrawingToolbar` (tylko GM), ikona
  `HighlightAltIcon` (@mui/icons-material, glif marquee).
- Reuse `imageEditLayer` picker (background/tokens/gm).
- Zasięg marquee wg uzbrojonej warstwy:
  - `tokens` → **postacie + token-obrazy**
  - `background` → obrazy warstwy background
  - `gm` → obrazy warstwy gm
- Marquee **pomija `locked`** (obrazy; postacie nie mają locka). Lock = "nie ruszaj".
- GM-only.

### 2. Stan zaznaczenia (zunifikowany model)
- **Nowy** `selectedTokens` w `DndContext` — lista `[{kind:'image'|'char', id}]`.
  Żyje tylko w Select mode.
- Istniejący `selectedImageId` (single ring, default/pan) — **nietknięty**.
- Czyszczenie przy wyjściu z Select mode (mirror `DndContext.jsx:125-127`).
- `Escape` czyści `selectedTokens`.
- Cleanup przy WS-delete/usunięciu żetonu (filtrowanie listy do istniejących id;
  mirror `DndContext.jsx:114-120`).
- Selekcja to lokalny stan GM — nie broadcastowana.

### 3. Marquee (w przestrzeni komórek)
- Nowy komponent `MarqueeOverlay` w `SceneViewport`.
- Left-drag na pustym (nie na żetonie) → prostokąt. Screen→content coords przez
  `zoom` + `contentRef`, następnie na komórki (`/CELL_SIZE`).
- Release → intersekcja AABB w komórkach (reuse `characterToMapToken` /
  `imageToMapToken` → `CellRect`; **bez rotacji** w v1) z żetonami uzbrojonej
  warstwy, nie-locked → `selectedTokens`. "Nawet częściowo w środku" = przecięcie
  prostokątów.
- `Shift`+drag = dodaj do zaznaczenia; bez Shift = replace.
- Klik na pusto (bez ruchu, próg ~5px) = wyczyść.
- Klik / `Shift`-klik na żetonie = zaznacz jeden / toggle w grupie.

### 4. Group drag (architektura A, w komórkach)
- Hook `useGroupDrag` / kontroler w `SceneViewport` (podniesiona logika, nie
  per-żeton).
- Mousedown na **zaznaczonym** żetonie w Select mode → start group drag.
  Kontroler liczy **delta w komórkach** (screen→content/zoom/CELL_SIZE), trzyma
  w context.
- Delta przez React context → każdy zaznaczony żeton offsetuje render o delta:
  - obraz: `left = (col+dCol)*CELL_SIZE` (adapter)
  - postać: `col + dCol`
  - **Bez** kopiowania pozycji do per-żeton state (jedno źródło prawdy = dane
    serwera + jedna delta; unika N×setState/klatkę → jank przy ~20 żetonach).
- Snap: delta kwantyzowana do całych komórek gdy tryb snap (to samo dla obu
  kinds — `snapToGrid`).
- Clamp: delta ograniczona tak, by **bounding box całej grupy** został w
  granicach siatki (nie per-żeton — to psułoby układ względny).
- Release → batch save (sekcja 5).

### 5. Batch endpoint (jeden, dla obu kinds)
- `PATCH /games/:id/scenes/:sceneId/tokens/batch`
  body: `{ images:[{id,x,y}], characters:[{id,positionX,positionY}] }`
- Backend: routing w `main.go`, handler w `SceneHandler`, walidacja w service,
  repo aktualizuje osadzone `scene.images` (px) i placementy postaci (cells)
  w jednej operacji. Bez nowych modeli.
- **Jeden broadcast** scene-update → jeden refetch. Płynny group-move mieszanej
  grupy. Konwersja cell→px dla obrazów po stronie frontu (`rectPx`) przed wysłaniem.
- Batchujemy tylko move (wysoka częstotliwość, atomowość).

### 6. Menu kontekstowe multi (B1 — przecięcie akcji)
- Nowy komponent `SceneTokenMultiContextMenu` (osobny;
  `SceneImageContextMenu` single zostaje bez zmian — maks. modularność).
- Prawy-klik na zaznaczonej grupie (Select mode) → to menu. Akcje wg zawartości
  selekcji:
  - **Same obrazy** → pełne: Delete all (pomija locked), Lock/Unlock all,
    Move to layer (bg/tokens/gm), Reset rotation all.
  - **Same postacie** → Remove from scene (zdejmij z siatki wszystkie).
  - **Mieszane** → tylko wspólny mianownik: **Remove selected from scene**
    (obrazy → delete, postacie → zdejmij z siatki).
- BEZ: duplicate, resize-to-grid, z-index (nie pasują grupowo).
- Akcje inne niż move: loop przez istniejące PUT/DELETE/remove (jednorazowe,
  rzadkie — N broadcastów OK).

### 7. i18n
- Nowe klucze en + pl (angielskie klucze, oba pliki równolegle):
  - `scenes.selectLayer` (tab tooltip), `scenes.selectTool`
  - multi-menu: `scenes.deleteAll`, `scenes.lockAll`, `scenes.unlockAll`,
    `scenes.moveToLayer`, `scenes.resetRotationAll`, `scenes.removeFromScene`

## Kompromisy / pułapki

- **Rotacja ignorowana** w intersekcji marquee (v1): obrócony obraz wg AABB
  nieobróconego. Uproszczenie.
- **Schemat zapisu NIE ujednolicany** (obraz px, postać cells) — celowo, adapter
  już mostkuje na warstwie geometrii. Migracja px→cells to duży ryzykowny ruch
  bez zysku dla tego featu.
- **Akcje menu inne niż move = N broadcastów** (loop). Rzadkie, OK. Batchujemy
  tylko drag.
- **Dwa stany selekcji** (`selectedImageId` single vs `selectedTokens` multi) —
  rozdzielone kontekstem (default/pan vs select mode). Świadomy wybór dla izolacji
  wobec istniejącej logiki ring/delete.

## Poza zakresem (v1)

- Precyzyjna intersekcja z rotacją.
- Duplikacja grupy.
- Bring-to-front / send-to-back grupy.
- Ujednolicenie schematu zapisu obrazów (px→cells).
- Multi-select z modyfikatorami inne niż Shift (np. Ctrl osobno).
