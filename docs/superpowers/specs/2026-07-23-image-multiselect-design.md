# Multi-select obrazów sceny (marquee + group move)

Data: 2026-07-23
Status: zaakceptowany, gotowy do planu implementacji

## Cel

GM zaznacza wiele obrazów sceny naraz przez przeciągnięcie prostokąta (marquee)
lewym klawiszem myszy, przesuwa je razem jednym dragiem, i wykonuje na całej
grupie akcje z osobnego menu kontekstowego. Rozszerzenie istniejącego
single-select (`selectedImageId` + keyboard delete + ring token-layer).

## Kontekst istniejący (stan przed zmianą)

- `DndContext.jsx:110` — `selectedImageId` (single). Służy do: ring token-layer
  (kontekst default/pan) + keyboard delete (`DndContext.jsx:131`).
- Click-select gated: GM only, `editingLayer === null || activeTool === 'pan'`.
- Obrazy w 3 warstwach render: `background`, `tokens`, `gm`
  (`SceneViewport.jsx:462-464`).
- Każdy `SceneImage` prowadzi własny drag przez lokalne mouse-listenery, zapisuje
  per-image `updateSceneImage` (`SceneImage.jsx:85-134`).
- Tryby (`editingLayer`): `null` (pan), `grid` (Images), `fog`, `drawing`,
  `measure`. Tab-row w `DrawingToolbar.jsx:100-142`.
- Tryb `grid` uzbraja jedną warstwę obrazów przez `imageEditLayer`
  (background/tokens/gm).
- Routes scene-image: `main.go:253-258` (POST/PUT/DELETE/duplicate/tokenOverlay).

## Decyzje projektowe

### 1. Nowy tryb Select
- `editingLayer === 'select'` — nowy tab w `DrawingToolbar` (tylko GM), ikona
  `HighlightAltIcon` (@mui/icons-material, glif marquee).
- Reuse `imageEditLayer` picker (background/tokens/gm) — ten sam co w trybie
  `grid`. Marquee grab **tylko z uzbrojonej warstwy**.
- Marquee **pomija `locked`** (spójne z single drag/delete; lock = "nie ruszaj").
- GM-only.

### 2. Stan zaznaczenia
- **Nowy** `selectedImageIds` (array) w `DndContext` — żyje tylko w Select mode.
- Istniejący `selectedImageId` (single ring, default/pan) — **nietknięty**.
- Czyszczenie przy wyjściu z Select mode (mirror `useEffect`
  `DndContext.jsx:125-127`).
- `Escape` czyści `selectedImageIds`.
- Cleanup przy WS-delete zaznaczonego obrazu (mirror `DndContext.jsx:114-120`,
  filtrowanie array do istniejących id).
- Selekcja to lokalny stan GM — nie broadcastowana (jak `selectedImageId`).

### 3. Marquee
- Nowy komponent `MarqueeOverlay` w `SceneViewport`.
- Left-drag na pustym (nie na obrazie) → prostokąt. Współrzędne screen→content
  przez `zoom` + `contentRef` rect.
- Release → AABB intersect (bez rotacji w v1) z obrazami uzbrojonej warstwy,
  nie-locked → `selectedImageIds`. "Nawet częściowo w środku" = przecięcie
  prostokątów.
- `Shift`+drag = dodaj do zaznaczenia; bez Shift = replace.
- Klik na pusto (bez ruchu, próg ~5px jak ping) = wyczyść.
- Klik / `Shift`-klik na obrazie = zaznacz jeden / toggle w grupie.

### 4. Group drag (architektura A)
- Hook `useGroupDrag` / kontroler w `SceneViewport` (podniesiona logika, nie
  per-image jak dziś).
- Mousedown na **zaznaczonym** obrazie w Select mode → start group drag.
  Kontroler liczy delta (screen→content / zoom), trzyma w stanie/context.
- Delta przez React context → każdy zaznaczony `SceneImage` offsetuje swój
  render (`pos + delta`). **Bez** kopiowania pozycji do per-image state.
  - Uzasadnienie: jedno źródło prawdy (`image.x/y`), jedna delta na N obrazów;
    unika N×setState/klatkę (jank przy ~20 obrazach).
- Snap: delta kwantyzowana do `CELL_SIZE` gdy uzbrojona warstwa = `tokens` i
  tryb snap (zachowuje układ względny grupy).
- Clamp: delta ograniczona tak, by **bounding box grupy** został w granicach
  siatki (nie per-image — to psułoby układ względny).
- Release → batch save (sekcja 5).

### 5. Batch endpoint (persist, wariant Y)
- `PATCH /games/:id/scenes/:sceneId/images/batch`, body `{ updates: [{id,x,y}] }`.
- Backend: routing w `main.go`, handler w `SceneHandler`, walidacja w service,
  repo bulk `$set` z arrayFilters (jeden zapis). Bez nowego modelu — tylko
  pozycje.
- Jeden broadcast scene-update → jeden refetch (vs N przy pętli).
- Tylko move jest batchowany (wysoka częstotliwość, musi być atomowy).

### 6. Menu kontekstowe multi (wariant B)
- Nowy komponent `SceneImageMultiContextMenu` (osobny;
  `SceneImageContextMenu` single zostaje bez zmian — maks. modularność).
- Prawy-klik na zaznaczonej grupie (Select mode) → to menu.
- Akcje na całej grupie:
  - **Delete all** (pomija locked)
  - **Lock all / Unlock all**
  - **Move to layer** (background / tokens / gm)
  - **Reset rotation all**
- BEZ: duplicate, resize-to-grid, z-index (nie pasują grupowo).
- Te akcje: loop przez istniejące PUT/DELETE (jednorazowe kliki, rzadkie — N
  broadcastów akceptowalne; batchujemy tylko move).

### 7. i18n
- Nowe klucze en + pl (angielskie klucze, oba pliki równolegle):
  - `scenes.selectLayer` (tab tooltip), `scenes.selectTool`
  - multi-menu: `scenes.deleteAll`, `scenes.lockAll`, `scenes.unlockAll`,
    `scenes.moveToLayer`, `scenes.resetRotationAll`

## Kompromisy / pułapki

- **Rotacja ignorowana** w intersekcji marquee (v1): obrócony obraz liczony wg
  AABB nieobróconego. Akceptowalne — uproszczenie, do rewizji jeśli zaboli.
- **Delete-all / lock-all / layer / rotation = N broadcastów** (loop). Rzadkie,
  jednorazowe kliki — OK. Batchujemy tylko drag.
- **Dwa stany selekcji** (`selectedImageId` single vs `selectedImageIds` multi) —
  rozdzielone kontekstem (default/pan vs select mode). Świadomy wybór dla
  izolacji i niskiego ryzyka wobec istniejącej logiki ring/delete.

## Poza zakresem (v1)

- Precyzyjna intersekcja z rotacją.
- Duplikacja grupy.
- Bring-to-front / send-to-back grupy.
- Batch delete/lock endpoint (loop wystarcza).
- Multi-select znaków (character tokens) — tylko obrazy sceny.
