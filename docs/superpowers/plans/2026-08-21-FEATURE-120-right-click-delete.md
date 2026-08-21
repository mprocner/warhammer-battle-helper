# FEATURE-120 — Prawy przycisk usuwa rysunek — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W trybie rysowania prawy przycisk myszy natychmiast usuwa rysunek pod kursorem, a najechanie kursorem na rysunek możliwy do usunięcia podświetla go.

**Architecture:** Cała zmiana mieści się w `DrawingLayer.jsx` plus przekazanie dwóch propsów z `SceneViewport.jsx`. Nowa czysta funkcja `findDeletablePathAt` odpowiada na jedno pytanie — „która ścieżka pod tym punktem jest moja do skasowania" — i obsługuje oba zachowania: kasowanie prawym klikiem i podświetlenie hover. Backend nietknięty; endpoint kasujący i jego kontrola uprawnień właściciel-lub-GM już istnieją.

**Tech Stack:** React 18 (hooks, Canvas 2D API), Jest + React Scripts, i18next.

Spec: `docs/superpowers/specs/2026-08-21-FEATURE-120-right-click-delete-design.md`

## Global Constraints

- Backend nie jest zmieniany. Zero zmian w `warhammer-battle-helper-backend/`.
- Zero nowych zależności npm.
- Filtr uprawnień po stronie klienta to wygoda UX, nie zabezpieczenie — serwer i tak waliduje (`DrawingService.go:175`).
- Każdy zmieniony klucz i18n idzie równolegle do `src/locales/en/translation.json` i `src/locales/pl/translation.json`. Żadnych stringów wprost w JSX.
- Wszystkie ścieżki poleceń są względem `warhammer-battle-helper-front/`.
- Testy uruchamiane jednorazowo, nie w trybie watch: `CI=true npm test -- --testPathPattern=<wzorzec> --watchAll=false`.
- `App.test.js` wywala się na błędzie ESM w axios — to znany stan bazowy repo, nie regresja. Nie naprawiać przy okazji; uruchamiać testy wzorcem, nie całą suitą.

## File Structure

| Plik | Odpowiedzialność | Status |
|---|---|---|
| `src/components/scene/DrawingLayer.jsx` | canvas rysowania: malowanie, gesty myszy, wybór ścieżki pod kursorem | modyfikowany |
| `src/components/scene/DrawingLayer.test.js` | testy jednostkowe czystej funkcji `findDeletablePathAt` | tworzony |
| `src/components/scene/SceneViewport.jsx` | przekazanie `userId` i `isGM` do `DrawingLayer` | modyfikowany (1 miejsce) |
| `src/locales/en/translation.json`, `src/locales/pl/translation.json` | tooltip kosza wspomina o prawym kliku | modyfikowane (1 klucz) |

`DrawingLayer.jsx` ma ~430 linii i jedną spójną odpowiedzialność (warstwa canvas rysowania), więc nie dzielimy go — dokładamy do niego jedną czystą funkcję i jeden handler.

---

### Task 1: Czysta funkcja wyboru ścieżki do skasowania

**Files:**
- Modify: `src/components/scene/DrawingLayer.jsx` (nowy nazwany eksport tuż pod `hitTestPath`, czyli po linii 79)
- Test: `src/components/scene/DrawingLayer.test.js` (nowy)

**Interfaces:**
- Consumes: istniejąca funkcja modułowa `hitTestPath(path, px, py, tolerance = 10)` z tego samego pliku.
- Produces: `findDeletablePathAt(paths, px, py, canDelete) -> string | null` — nazwany eksport z `DrawingLayer.jsx`. `paths` to tablica w kolejności malowania (ostatnia = na wierzchu), `canDelete` to predykat `(path) => boolean`. Zwraca `id` najwyżej położonej trafionej ścieżki spełniającej predykat, albo `null`. Zadania 2 i 3 wołają dokładnie tę sygnaturę.

- [ ] **Step 1: Napisz test, który nie przechodzi**

Utwórz `src/components/scene/DrawingLayer.test.js`:

```js
import { findDeletablePathAt } from './DrawingLayer';

// Pozioma linia od (0,y) do (100,y) — hitTestPath ma tolerancję 10, więc
// punkt (50, y) trafia, a (50, y + 500) na pewno nie.
const line = (id, userId, y) => ({
  id,
  userId,
  tool: 'line',
  points: [[0, y], [100, y]],
  brushSize: 3,
});

const mine = path => path.userId === 'me';
const asGM = () => true;

describe('findDeletablePathAt', () => {
  it('zwraca id własnej ścieżki pod kursorem', () => {
    const paths = [line('a', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('a');
  });

  it('nie zwraca cudzej ścieżki, gdy nie jesteś GM', () => {
    const paths = [line('a', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBeNull();
  });

  it('przeskakuje cudzą ścieżkę na wierzchu i sięga po własną pod spodem', () => {
    const paths = [line('own', 'me', 50), line('theirs', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('own');
  });

  it('pozwala GM-owi skasować cudzą ścieżkę', () => {
    const paths = [line('theirs', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, asGM)).toBe('theirs');
  });

  it('zwraca null, gdy pod kursorem nic nie ma', () => {
    const paths = [line('a', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 550, mine)).toBeNull();
  });

  it('przy dwóch własnych nachodzących zwraca tę dodaną później', () => {
    const paths = [line('older', 'me', 50), line('newer', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('newer');
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --testPathPattern=DrawingLayer --watchAll=false
```

Oczekiwane: FAIL — `findDeletablePathAt is not a function` (import zwraca `undefined`, bo eksportu jeszcze nie ma).

- [ ] **Step 3: Dopisz funkcję**

W `src/components/scene/DrawingLayer.jsx`, bezpośrednio pod zamknięciem `hitTestPath` (po linii 79, przed `const DrawingLayer = ({`):

```js
// Topmost path under (px, py) that the caller is allowed to delete.
// Paths the predicate rejects are skipped, not treated as blockers — a player
// right-clicking through the GM's line still reaches their own drawing beneath it.
export function findDeletablePathAt(paths, px, py, canDelete) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (!canDelete(path)) continue;
    if (hitTestPath(path, px, py)) return path.id;
  }
  return null;
}
```

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --testPathPattern=DrawingLayer --watchAll=false
```

Oczekiwane: PASS, 6 testów.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingLayer.test.js
git commit -m "feat(front): FEATURE-120 add findDeletablePathAt path picker

Topmost hit under the cursor that the caller may delete. Paths the predicate
rejects are skipped rather than blocking, so a player right-clicking through
someone else's line still reaches their own drawing underneath."
```

---

### Task 2: Prawy przycisk kasuje rysunek

**Files:**
- Modify: `src/components/scene/DrawingLayer.jsx` (lista propsów w linii 81-95; komentarz przy `if (e.button !== 0) return;` w linii 317; nowy handler; atrybut `onContextMenu` na `<canvas>` w linii 420-424)
- Modify: `src/components/scene/SceneViewport.jsx` (element `<DrawingLayer>` w linii 832-845)
- Modify: `src/locales/en/translation.json:844`, `src/locales/pl/translation.json:844`

**Interfaces:**
- Consumes: `findDeletablePathAt(paths, px, py, canDelete)` z zadania 1; istniejący prop `onDeletePath(pathId)`; istniejące refy `isDrawingRef`, `currentPathRef`, `shapeStartRef`; istniejące `getSceneCoords(e)` i `render(extraPath)`.
- Produces: `DrawingLayer` przyjmuje dwa nowe propsy — `userId` (hex string albo `null`) i `isGM` (boolean). Zadanie 3 używa wyprowadzonego z nich `canDelete`.

- [ ] **Step 1: Dodaj propsy `userId` i `isGM` do `DrawingLayer`**

W `src/components/scene/DrawingLayer.jsx` w liście propsów komponentu, po linii `onDeletePath,`:

```js
  onDeletePath,
  userId = null,
  isGM = false,
```

- [ ] **Step 2: Przekaż je z `SceneViewport`**

W `src/components/scene/SceneViewport.jsx`, w elemencie `<DrawingLayer>`, po linii `onDeletePath={onDeletePath}`:

```jsx
                    onDeletePath={onDeletePath}
                    userId={userId}
                    isGM={isGM}
```

Oba są już propsami `SceneViewport` (`SceneViewport.jsx:33` i `:43`) — nic nie trzeba dociągać wyżej z `DndContext`.

- [ ] **Step 3: Dodaj predykat uprawnień i handler prawego przycisku**

W `src/components/scene/DrawingLayer.jsx`, bezpośrednio pod `getSceneCoords` (czyli po zamknięciu tego `useCallback`, przed `handleMouseDown`):

```js
  // Client-side convenience only — the server re-checks owner-or-GM on DELETE.
  const canDelete = useCallback(
    (path) => isGM || path.userId === userId,
    [isGM, userId]
  );

  const handleContextMenu = useCallback((e) => {
    if (!isDrawingMode || activeTool === 'pan') return;
    e.preventDefault();

    // Right-click mid-stroke abandons the shape. Zeroing currentPathRef matters as much
    // as the isDrawingRef flag: the render effect reads that ref for the live preview,
    // so a leftover value would repaint the abandoned shape on the next re-render.
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      currentPathRef.current = null;
      shapeStartRef.current = null;
      render(null);
      return;
    }

    const [px, py] = getSceneCoords(e);
    const id = findDeletablePathAt(scene?.drawingPaths || [], px, py, canDelete);
    if (id) onDeletePath?.(id);
  }, [isDrawingMode, activeTool, getSceneCoords, render, scene?.drawingPaths, canDelete, onDeletePath]);
```

Uwaga: `findDeletablePathAt` jest zdefiniowana w tym samym pliku (zadanie 1), więc nie ma nowego importu.

- [ ] **Step 4: Podepnij handler do canvasu**

W tym samym pliku, w elemencie `<canvas>`, po `onMouseLeave={handleMouseLeave}`:

```jsx
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
```

- [ ] **Step 5: Popraw nieaktualny komentarz przy strażniku lewego przycisku**

W `handleMouseDown` zamień linię:

```js
    if (e.button !== 0) return; // right button → pan (handled by the viewport), never draw
```

na:

```js
    if (e.button !== 0) return; // only the left button draws; the right button deletes (see handleContextMenu)
```

Stary komentarz kłamie — prawy przycisk nie panuje widokiem od czasu zmiany w `SceneViewport.jsx:304`.

- [ ] **Step 6: Zaktualizuj tooltip kosza w obu językach**

`src/locales/en/translation.json:844`:

```json
    "drawingDelete": "Delete selected (or right-click a drawing)",
```

`src/locales/pl/translation.json:844`:

```json
    "drawingDelete": "Usuń zaznaczony (lub prawy klik na rysunku)",
```

- [ ] **Step 7: Uruchom testy**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --testPathPattern="DrawingLayer|DrawingToolbar" --watchAll=false
```

Oczekiwane: PASS. Testy z zadania 1 nadal zielone, smoke test toolbara nadal zielony.

- [ ] **Step 8: Sprawdź ręcznie w przeglądarce**

```bash
docker compose up -d
```

Otwórz grę, wejdź w tryb rysowania i przejdź listę:

1. Narysuj strzałkę, kliknij na nią prawym → znika, natywne menu przeglądarki się nie pokazuje.
2. Kliknij prawym w puste miejsce → nic się nie dzieje, menu przeglądarki się nie pokazuje.
3. Zacznij ciągnąć prostokąt, nie puszczając lewego przycisku kliknij prawym → kształt znika i nie zapisuje się po puszczeniu lewego.
4. Przełącz narzędzie na `pan`, kliknij prawym → normalne menu przeglądarki (warstwa nie łapie zdarzeń).
5. Jako gracz kliknij prawym na rysunek GM-a → nic się nie dzieje; jako GM na ten sam rysunek → znika.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(front): FEATURE-120 right-click deletes the drawing under the cursor

Works in every drawing tool, no tool switch needed. Right-clicking mid-stroke
abandons the in-progress shape instead of deleting anything. Players only reach
their own paths; the GM reaches all, and the server re-checks either way."
```

---

### Task 3: Podświetlenie ścieżki pod kursorem

**Files:**
- Modify: `src/components/scene/DrawingLayer.jsx` (blok dokumentacyjny w liniach 4-19; `drawSelectionHighlight` w liniach 189-249; `render` w liniach 252-274; `handleMouseMove` w liniach 354-375; `handleMouseLeave`; nowy stan i efekt czyszczący)

**Interfaces:**
- Consumes: `findDeletablePathAt` z zadania 1, `canDelete` z zadania 2.
- Produces: nic dla dalszych zadań — to ostatnie zadanie.

- [ ] **Step 1: Uogólnij `drawSelectionHighlight` na `drawHighlight`**

W `src/components/scene/DrawingLayer.jsx` zamień nagłówek funkcji i dwie linie ustawiające styl:

```js
  // Draw a cyan dashed selection highlight over a path
  const drawSelectionHighlight = useCallback((ctx, path) => {
```

na:

```js
  // Cyan glow over a path. Selection is bright and dashed; hover is faint and solid.
  const drawHighlight = useCallback((ctx, path, { alpha = 0.7, dashed = true } = {}) => {
```

W ciele tej samej funkcji zamień:

```js
    ctx.setLineDash([8, 4]);
    ctx.globalAlpha = 0.7;
```

na:

```js
    ctx.setLineDash(dashed ? [8, 4] : []);
    ctx.globalAlpha = alpha;
```

oraz w gałęzi `case 'text':` zamień:

```js
        ctx.setLineDash([]);
```

na:

```js
        ctx.setLineDash(dashed ? [8, 4] : []);
```

- [ ] **Step 2: Dodaj stan hovera i efekt czyszczący**

Pod istniejącymi refami, na początku ciała komponentu (obok `const isDrawingRef = useRef(false);`):

```js
  const [hoveredPathId, setHoveredPathId] = useState(null);
```

`useState` trzeba dopisać do importu Reacta w pierwszej linii pliku:

```js
import React, { useState, useRef, useEffect, useCallback } from 'react';
```

Efekt czyszczący dopisz tuż pod deklaracją stanu — bez niego wyjście z trybu rysowania zostawia zawieszoną poświatę:

```js
  // Leaving drawing mode drops the hover — the canvas stops receiving mouse events,
  // so there would be no later event to clear it.
  useEffect(() => {
    if (!isDrawingMode) setHoveredPathId(null);
  }, [isDrawingMode]);
```

- [ ] **Step 3: Maluj hover w `render`**

Zamień końcówkę `render` (blok „Draw selection highlight on top" i tablicę zależności):

```js
    // Draw selection highlight on top
    if (selectedPathId) {
      const sel = savedPaths.find(p => p.id === selectedPathId);
      if (sel) drawSelectionHighlight(ctx, sel);
    }
  }, [scene?.drawingPaths, drawPath, drawSelectionHighlight, selectedPathId]);
```

na:

```js
    // Hover first, selection over it — selection is the durable state, hover is transient.
    if (hoveredPathId) {
      const hov = savedPaths.find(p => p.id === hoveredPathId);
      if (hov) drawHighlight(ctx, hov, { alpha: 0.35, dashed: false });
    }

    if (selectedPathId) {
      const sel = savedPaths.find(p => p.id === selectedPathId);
      if (sel) drawHighlight(ctx, sel);
    }
  }, [scene?.drawingPaths, drawPath, drawHighlight, selectedPathId, hoveredPathId]);
```

- [ ] **Step 4: Licz hover w `handleMouseMove`**

Zamień początek `handleMouseMove`:

```js
  const handleMouseMove = useCallback((e) => {
    if (!isDrawingRef.current || !isDrawingMode) return;
    e.preventDefault();
```

na:

```js
  const handleMouseMove = useCallback((e) => {
    // Hover runs only between strokes — one gesture at a time. Returning `prev`
    // unchanged makes React bail out, so the canvas repaints on enter/leave only,
    // not on every mouse event.
    if (isDrawingMode && !isDrawingRef.current) {
      const [hx, hy] = getSceneCoords(e);
      const hoverId = findDeletablePathAt(scene?.drawingPaths || [], hx, hy, canDelete);
      setHoveredPathId(prev => (prev === hoverId ? prev : hoverId));
    }

    if (!isDrawingRef.current || !isDrawingMode) return;
    e.preventDefault();
```

i dopisz brakujące zależności do tablicy tego `useCallback` — po zmianie ma wyglądać tak:

```js
  }, [isDrawingMode, activeTool, getSceneCoords, render, brushSize, color, fontSize, scene?.drawingPaths, canDelete]);
```

- [ ] **Step 5: Czyść hover przy zjeździe kursora z canvasu**

Zamień `handleMouseLeave`:

```js
  const handleMouseLeave = useCallback((e) => {
    if (isDrawingRef.current) {
      handleMouseUp(e);
    }
  }, [handleMouseUp]);
```

na:

```js
  const handleMouseLeave = useCallback((e) => {
    setHoveredPathId(null);
    if (isDrawingRef.current) {
      handleMouseUp(e);
    }
  }, [handleMouseUp]);
```

- [ ] **Step 6: Zaktualizuj blok dokumentacyjny komponentu**

W nagłówkowym komentarzu pliku, w liście „Tool encoding", pod linią `*  - select: no drawing — click to select/deselect paths`, dopisz:

```js
 *
 * Right button (every tool): deletes the topmost path under the cursor that the user may
 * delete, or abandons the in-progress shape when pressed mid-stroke.
 * Hover: the same path the right button would delete gets a faint cyan glow.
```

- [ ] **Step 7: Uruchom testy**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --testPathPattern="DrawingLayer|DrawingToolbar" --watchAll=false
```

Oczekiwane: PASS. Zadanie 3 nie dokłada testów — malowanie na `<canvas>` w jsdom jest atrapą, a jedyna testowalna logika (`findDeletablePathAt`) ma pokrycie z zadania 1.

- [ ] **Step 8: Sprawdź ręcznie w przeglądarce**

1. Najedź na własny rysunek → blada, ciągła poświata cyan; zjedź → gaśnie.
2. Zaznacz ścieżkę narzędziem `select` i najedź na nią → jaskrawa przerywana kreska nadal dominuje.
3. Jako gracz najedź na rysunek GM-a → brak poświaty (i prawy klik go nie kasuje — te same ścieżki).
4. Zacznij ciągnąć prostokąt i przesuwaj kursor nad istniejącymi rysunkami → nic się nie podświetla.
5. Anuluj kształt prawym klikiem w trakcie ciągnięcia, potem porusz myszą → porzucony prostokąt nie wraca (to regresja, którą łapie ten krok).
6. Wyjdź z trybu rysowania z kursorem nad rysunkiem → poświata gaśnie.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx
git commit -m "feat(front): FEATURE-120 highlight the path the right button would delete

Faint solid cyan on hover, distinct from the bright dashed selection glow.
Only deletable paths light up, so the highlight doubles as the affordance for
right-click delete. State updates bail out when the hit result is unchanged."
```

---

## Podsumowanie pokrycia specu

| Wymaganie ze specu | Zadanie |
|---|---|
| Natychmiastowe kasowanie prawym klikiem | 2 |
| Działa we wszystkich narzędziach; `pan` bez zmian | 2 (krok 3, warunek `activeTool === 'pan'`) |
| Cudza ścieżka pomijana, szukamy głębiej | 1 (funkcja) + 2 (predykat) |
| GM kasuje wszystko | 1 (test) + 2 (predykat) |
| Prawy klik w trakcie rysowania anuluje kształt | 2 (krok 3) |
| Brak `stopPropagation` | 2 (krok 3 — świadomie nie ma go w kodzie) |
| Poprawka nieaktualnego komentarza | 2 (krok 5) |
| Blok dokumentacyjny komponentu | 3 (krok 6) |
| Hover, alpha 0.35, linia ciągła | 3 |
| Kolejność malowania: hover pod zaznaczeniem | 3 (krok 3) |
| Hover tylko dla ścieżek kasowalnych | 3 (krok 4, ten sam `canDelete`) |
| Hover wyłączony w trakcie rysowania | 3 (krok 4) |
| i18n `scenes.drawingDelete` w en i pl | 2 (krok 6) |
| Sześć przypadków testowych | 1 |
| Zero zmian w backendzie | — |
