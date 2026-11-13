# PLAYRPG-254 — Zaznaczanie wielu rysunków: plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Kroki z checkboxami.

**Cel:** narzędzie Zaznacz w trybie rysowania obsługuje wiele rysunków: Shift+klik, ramka,
usuwanie grupy, przesuwanie grupy, Ctrl/Cmd+C / V (także między scenami).

**Architektura:** backend dostaje trzy endpointy zbiorcze (delete / move / paste) i mnogie eventy
WS zamiast pojedynczych. Frontend: czysta geometria w `drawingSelection.js`, schowek w
`drawingClipboard.js` + `useDrawingClipboard.js`, zaznaczenie jako tablica id w `DndContext`,
jeden automat gestu (`pending → drag | marquee`) w `DrawingLayer`.

**Stack:** Go + Gin + mongo-driver (mtest), React 18, Jest (CRA).

Spec: opis PLAYRPG-254 w Jirze. Odstępstwo od specu: błąd uprawnień zwraca **400**, nie 403 —
wszystkie handlery rysunków mapują błąd serwisu na 400, nie wprowadzamy wyjątku.

## Global Constraints

- Komentarze w kodzie po angielsku; i18n: angielskie klucze, en + pl.
- Skróty tylko przez `src/shortcuts/registry.js` + `useKeyboardShortcut`; każdy skrót klawiszowy
  ma wiersz w `#keyboard-shortcuts` w `help/{pl,en}/02-game-screen.md`.
- Zaznaczyć można tylko rysunki, które użytkownik może usunąć (`isGM || path.userId === userId`).
- Brak backward compat — stare eventy i route usuwamy, nie zostawiamy aliasów.
- Docs (changelog 1.0.0, KB `06-scena.md` + `00-inwentaryzacja.md`, help pl/en) w tym samym commicie.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<x>` z
  `warhammer-battle-helper-front/`. Backend: `go test ./internal/service/...`.
- Limity: delete/move 1–200 id, paste 1–50 ścieżek, |dx|,|dy| ≤ 100000.

---

### Task 1: Backend — operacje zbiorcze i mnogie eventy

**Files:**
- Modify: `internal/models/Game.go` (requesty), `internal/websocket/events.go`,
  `internal/repository/DrawingRepository.go`, `internal/service/DrawingService.go`,
  `internal/http/DrawingHandler.go`, `cmd/warhammer-battle-helper/main.go`
- Create: `internal/service/drawing_batch.go`, `internal/service/drawing_batch_test.go`

**Interfaces (produces):**
- `POST /games/:id/scenes/:sceneId/drawing/paths` `{paths: AddDrawingPathRequest[]}` → 201 `{paths}`
- `POST .../drawing/paths/delete` `{pathIds}` → 200
- `POST .../drawing/paths/move` `{pathIds, dx, dy}` → 200
- WS: `DRAWING_PATHS_ADDED {sceneId, paths}`, `DRAWING_PATHS_REMOVED {sceneId, pathIds}`,
  `DRAWING_PATHS_UPDATED {sceneId, paths}`; `DRAWING_CLEARED` bez zmian.
- Usunięte: `DELETE .../drawing/path/:pathId`, eventy `DRAWING_PATH_ADDED/REMOVED/UPDATED`.

- [ ] Modele: `PasteDrawingPathsRequest{Paths []AddDrawingPathRequest binding:"required"}`,
  `DrawingPathIDsRequest{PathIDs []string binding:"required"}`,
  `MoveDrawingPathsRequest{PathIDs []string; DX, DY float64}`.
- [ ] `drawing_batch.go`: `translatePoints(points, dx, dy) [][2]float64` (nowa tablica),
  `buildDrawingPath(req, userID) (DrawingPath, error)` (wyciągnięte z `AddDrawingPath`),
  `parsePathIDs([]string) ([]ObjectID, error)` (1–200, hex, bez duplikatów),
  `selectOwnedPaths(game, sceneID, ids, userID) ([]DrawingPath, error)` (scena musi istnieć,
  brakujące id pomijane, cudza ścieżka nie-MG → błąd).
- [ ] Testy (failing first): tabela `translatePoints` (wejście niezmienione), `parsePathIDs`
  (0 / 201 / zły hex / duplikat), serwis przez mtest: delete autor/MG OK + `$pull` z `$in`,
  gracz z cudzym id → błąd i brak zapisu; move — `$set` points per ścieżka z przesuniętymi
  wartościami, cudza → brak zapisu, |d| > 100000 → błąd; paste — 2 ścieżki w jednym `$push $each`,
  autor = wklejający, nowe id, 51 → błąd, pusty tekst → błąd bez zapisu.
- [ ] Repo: `AddDrawingPaths(gameID, sceneID, []DrawingPath)` (`$push {$each}` + init null),
  zastępuje `AddDrawingPath`; `RemoveDrawingPaths(gameID, sceneID, ids)` (`$pull {_id: {$in}}`),
  zastępuje `RemoveDrawingPathByID`; `SetDrawingPathPoints(gameID, sceneID, []DrawingPath)` —
  `BulkWrite` z `UpdateOneModel` per ścieżka, `$set scenes.$[scene].drawingPaths.$[path].points`,
  arrayFilters `scene._id`, `path._id`.
- [ ] Serwis: `PasteDrawingPaths`, `DeleteDrawingPaths`, `MoveDrawingPaths`; `AddDrawingPath`,
  `UndoLastDrawingPath`, `UpdateDrawingPath` broadcastują mnogie eventy; `DeleteDrawingPath` usunięty.
- [ ] Handlery + routing; `go build ./... && go test ./internal/...` zielone.

### Task 2: Frontend — geometria zaznaczenia (`drawingSelection.js`)

**Files:** Create `components/scene/drawingSelection.js` + `.test.js`; Modify `drawingText.js`
(export `textBoxCorners`), `DrawingLayer.jsx` / `DrawingLayer.test.js` (import z nowego pliku).

**Produces:**
- `hitTestPath(path, px, py, tol=10)`, `findDeletablePathAt(paths, px, py, canDelete)`,
  `findEditableTextAt(paths, px, py, canEdit)` — przeniesione z `DrawingLayer`.
- `pathTouchesRect(path, rect, tol=10) → bool` (rect `{x, y, width, height}`, dowolny znak w/h).
- `selectPathsInRect(paths, rect, canSelect) → id[]`.
- `pathBounds(path) → {x, y, width, height} | null`, `groupBounds(paths)`.
- `clampDrawingDelta({dx, dy}, bbox, {width, height}) → {dx, dy}`.
- `translatePath(path, dx, dy)`, `toggleId(ids, id)`, `unionIds(a, b)`.

- [ ] Testy per kształt (przecina / w środku ramki / ramka wewnątrz kształtu = false / obok),
  tekst 0° i 90°, clamp przy każdej krawędzi, toggle/union.
- [ ] Implementacja: odcinek vs prostokąt (punkt w prostokącie albo przecięcie z krawędzią),
  okrąg `dmin ≤ r ≤ dmax`, tekst: wierzchołek w ramce / róg ramki w napisie / krawędzie się przecinają.

### Task 3: Frontend — schowek (`drawingClipboard.js` + `useDrawingClipboard.js`)

**Produces:** `buildDrawingClipboard(sceneId, ids, paths) → {sourceSceneId, box, paths} | null`
(kopie bez `id`/`userId`), `pasteDrawingRequests(clip, anchor, canvasSize) → request[]`
(środek pod kursorem, bez kursora +30/+30, potem `clampDrawingDelta`);
`useDrawingClipboard({enabled, canCopy, gameId, sceneId, paths, selectedIds, viewportRef,
clientToScenePx, canvasSize, onPasted})` — klawisze `drawing.copy` / `drawing.paste`, paczki po 50,
`pendingSelect` do czasu, aż scena zawiera wszystkie nowe id, wtedy `onPasted(ids)`.

- [ ] Testy czystych funkcji + hooka (wzorzec `useSceneClipboard.test.jsx`).

### Task 4: API, eventy WS, stan gry (`api/scenes.js`, `websocket/events.js`, `GameSession.jsx`)

- [ ] `pasteDrawingPaths`, `deleteDrawingPaths`, `moveDrawingPaths`; usunąć `deleteDrawingPath`.
- [ ] Eventy `DRAWING_PATHS_*`; handlery: dopisz (bez duplikatów id), filtruj `Set`, podmień po id.
- [ ] `handleMoveDrawingPaths(ids, dx, dy)` — optymistyczny `translatePath` + POST; usunąć
  `handleDeleteDrawingPath` / prop `onDeleteDrawingPath` (martwy w `DndContext`).

### Task 5: Zaznaczenie w `DndContext`, toolbar, rejestr skrótów

- [ ] `selectedDrawingPathIds: string[]`; czyszczenie zniknięć i przy zmianie narzędzia.
- [ ] `handleDeleteDrawings(ids)` dla toolbara/klawisza/prawego kliku/pustego napisu.
- [ ] `selectedTextPath` tylko gdy zaznaczenie = jeden napis; `editPath` czyści zaznaczenie.
- [ ] `handleMoveText` usunięty (zastąpiony przez move grupy).
- [ ] `DrawingToolbar`: `selectedCount`, tooltip z liczbą; smoke test.
- [ ] Rejestr: `drawing.copy`, `drawing.paste`, `drawing.clearSelection`, mouse
  `drawing.addToSelection` (`Shift+Click`, `Shift+Drag`), token `Click`; teksty en/pl.

### Task 6: Gest w `DrawingLayer`

- [ ] Props: `selectedPathIds`, `onSelectionChange(ids)`, `onMovePaths(ids, dx, dy)`,
  `onDeletePaths(ids)` (zamiast `selectedPathId`, `onDeletePath`, `onMoveText`).
- [ ] `gestureRef {kind: 'pending'|'drag'|'marquee', start, hitId, ids, additive, collapseTo, offset, rect}`.
- [ ] Przerwanie: `mousedown` prawym w trakcie gestu, `buttons & 2` w `mousemove`, `contextmenu`
  z `buttons & 1` (lewy trzymany) — bez usuwania; Escape — anuluje gest, inaczej odznacza.
- [ ] Podświetlenie wszystkich zaznaczonych, ramka na canvasie, kursor `move` nad rysunkiem.
- [ ] `SceneViewport`: nowe props, `useDrawingClipboard`, uchwyt obrotu tylko przy jednym napisie.

### Task 7: Dokumentacja i weryfikacja

- [ ] Changelog 1.0.0 `added` + `changelog.json` en/pl; KB `06-scena.md`, `00-inwentaryzacja.md`;
  help pl/en (sekcja „Zaznaczanie rysunków” `{#drawing-selection}`, wiersze skrótów); tutorial
  `gameScreen.js` krok `drawingToolbar` — sprawdzić tekst.
- [ ] Pełne testy frontu (baseline: `App.test.js`) i backendu; `go vet`.
- [ ] Commit na `main` (sprawdzić gałąź w tym samym poleceniu).
