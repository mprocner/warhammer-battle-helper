# FEATURE-119 — Prawy przycisk kończy wielokąt mgły — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W trybie mgły wojny prawy przycisk myszy kończy rysowanie wielokąta (>= 3 wierzchołki → zapis, mniej → porzucenie), a w pozostałych narzędziach mgły przerywa kształt rysowany w tej chwili.

**Architecture:** Zmiana wyłącznie frontowa, w jednym komponencie `FogLayer.jsx`. Canvas mgły dostaje `onContextMenu` — ten sam wzorzec, który FEATURE-120 wprowadziła w `DrawingLayer.jsx`. Po drodze: eksportowany czysty helper `canClosePolygon` (jedyna rzecz pokryta testem) i lokalna funkcja `finishPolygon(commit)`, do której schodzą trzy dzisiejsze kopie kodu kasującego refy wielokąta.

**Tech Stack:** React 18 (Create React App), Jest + `react-scripts test`. Bez nowych zależności.

Spec: `docs/superpowers/specs/2026-08-21-FEATURE-119-fog-polygon-right-click-design.md`

## Global Constraints

- Katalog roboczy dla wszystkich komend: `warhammer-battle-helper-front/`.
- Testy uruchamiane jednorazowo, nie w trybie watch: `CI=true npm test -- --testPathPattern=<wzorzec> --watchAll=false`.
- Znany, istniejący przed tą zmianą błąd zestawu: `App.test.js` wywala się na imporcie ESM w `axios`. To baseline, nie regresja — nie naprawiać, nie dotykać.
- Zero zmian w backendzie, modelu, i18n i w toolbarze. Wielokąt trafia na serwer istniejącym `onPathComplete`.
- Komentarze w kodzie po polsku, jak reszta `FogLayer.jsx`.
- Numery linii w tym planie odnoszą się do stanu `FogLayer.jsx` przed Zadaniem 1 (378 linii). Po każdym zadaniu się przesuwają — szukaj po treści kodu, nie po numerze.

## Pliki

| Plik | Rola |
|---|---|
| `src/components/scene/FogLayer.jsx` | Modyfikacja — helper, `finishPolygon`, `handleContextMenu`, guardy przycisków |
| `src/components/scene/FogLayer.test.js` | Nowy — test jednostkowy `canClosePolygon` |

---

### Task 1: Helper `canClosePolygon` + test

Próg „minimum 3 wierzchołki" siedzi dziś jako gołe `pts.length >= 3` w dwóch miejscach. Zadanie nadaje mu nazwę i pokrywa testem. Bez zmiany zachowania — czysty refactor plus nowy test.

**Files:**
- Modify: `src/components/scene/FogLayer.jsx` (linie 146, 253)
- Test: `src/components/scene/FogLayer.test.js` (nowy)

**Interfaces:**
- Consumes: nic
- Produces: `export const MIN_POLYGON_POINTS = 3;` oraz `export const canClosePolygon = (points) => boolean` — używane w Zadaniu 3

- [ ] **Step 1: Napisz test, który nie przechodzi**

Nowy plik `src/components/scene/FogLayer.test.js`:

```js
import { canClosePolygon } from './FogLayer';

// Wielokąt potrzebuje trzech wierzchołków, żeby w ogóle być figurą — przy mniejszej
// liczbie prawy przycisk porzuca rysunek zamiast go zapisywać.
const points = (n) => Array.from({ length: n }, (_, i) => [i * 10, i * 10]);

describe('canClosePolygon', () => {
  it('pusta lista nie domyka się', () => {
    expect(canClosePolygon(points(0))).toBe(false);
  });

  it('jeden wierzchołek nie domyka się', () => {
    expect(canClosePolygon(points(1))).toBe(false);
  });

  it('dwa wierzchołki nie domykają się — to odcinek, nie figura', () => {
    expect(canClosePolygon(points(2))).toBe(false);
  });

  it('trzy wierzchołki domykają się', () => {
    expect(canClosePolygon(points(3))).toBe(true);
  });

  it('cztery wierzchołki domykają się', () => {
    expect(canClosePolygon(points(4))).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

```bash
CI=true npm test -- --testPathPattern=FogLayer --watchAll=false
```

Oczekiwane: FAIL — `canClosePolygon is not a function` (import zwraca `undefined`, bo eksportu jeszcze nie ma).

- [ ] **Step 3: Dodaj eksporty w `FogLayer.jsx`**

Nad deklaracją komponentu (`const FogLayer = ({`), pod blokiem komentarza `/** FogLayer — ... */`:

```js
/**
 * Minimalna liczba wierzchołków, przy której wielokąt jest figurą, a nie odcinkiem.
 * Poniżej tego progu nie ma czego zapisać — zamknięcie zamienia się w porzucenie.
 */
export const MIN_POLYGON_POINTS = 3;

export const canClosePolygon = (points) => points.length >= MIN_POLYGON_POINTS;
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

```bash
CI=true npm test -- --testPathPattern=FogLayer --watchAll=false
```

Oczekiwane: PASS, 5 testów.

- [ ] **Step 5: Podstaw helper w dwóch istniejących miejscach**

W `render`, we wskaźniku snapu (linia 146) — było:

```js
        const isSnapping = pts.length >= 3 && snapDist < 15;
```

ma być:

```js
        const isSnapping = canClosePolygon(pts) && snapDist < 15;
```

W `handleMouseDown`, w gałęzi snapu (linia 253) — było:

```js
      if (pts.length >= 3 && snapDist < 15) {
```

ma być:

```js
      if (canClosePolygon(pts) && snapDist < 15) {
```

- [ ] **Step 6: Potwierdź, że nic się nie posypało**

```bash
CI=true npm test -- --testPathPattern="FogLayer|DrawingLayer" --watchAll=false
```

Oczekiwane: PASS w obu plikach.

- [ ] **Step 7: Commit**

```bash
git add src/components/scene/FogLayer.jsx src/components/scene/FogLayer.test.js
git commit -m "refactor(front): FEATURE-119 name the polygon close threshold"
```

---

### Task 2: Wydziel `finishPolygon(commit)`

Trzy miejsca kasują dziś te same cztery rzeczy (punkty, flaga aktywności, kursor, przerysowanie): gałąź snapu w `handleMouseDown`, handler Escape i — po Zadaniu 3 — `handleContextMenu`. Zadanie sprowadza je do jednej funkcji, zanim dojdzie trzeci konsument. Bez zmiany zachowania.

**Files:**
- Modify: `src/components/scene/FogLayer.jsx` (linie 195–210 — efekt Escape; 244–265 — gałąź snapu)

**Interfaces:**
- Consumes: `canClosePolygon` z Zadania 1
- Produces: `finishPolygon(commit: boolean): void` — lokalny `useCallback` w komponencie, konsumowany przez Zadanie 3

- [ ] **Step 1: Dodaj `finishPolygon` nad efektem Escape**

Wstaw bezpośrednio pod `useEffect`, który przerysowuje canvas przy zmianie zapisanych ścieżek (`// Re-render whenever saved paths or editing mode change`), a nad komentarzem `// Escape key — cancel active polygon`:

```js
  /**
   * Kończy aktywny wielokąt — zapisem albo porzuceniem.
   * Kopia punktów musi powstać PRZED wyzerowaniem refa: `render` czyta te refy przy
   * przerysowaniu, więc zostawiona zawartość odmalowałaby porzuconą figurę.
   */
  const finishPolygon = useCallback((commit) => {
    const pts = polygonPointsRef.current;
    const completed = commit ? [...pts] : null;

    polygonPointsRef.current = [];
    polygonActiveRef.current = false;
    polygonCursorRef.current = null;
    render(null);

    if (completed && onPathComplete) {
      onPathComplete({ points: completed, brushSize, shape: 'polygon', cover: fogCoverMode });
    }
  }, [render, onPathComplete, brushSize, fogCoverMode]);
```

- [ ] **Step 2: Podstaw `finishPolygon` w handlerze Escape**

Efekt Escape — było:

```js
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && polygonActiveRef.current) {
        polygonPointsRef.current = [];
        polygonActiveRef.current = false;
        polygonCursorRef.current = null;
        render(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditingFog, fogTool, render]);
```

ma być:

```js
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && polygonActiveRef.current) {
        finishPolygon(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditingFog, fogTool, finishPolygon]);
```

Uwaga na tablicę zależności: `render` wypada, wchodzi `finishPolygon`. Zostawienie `render` da ostrzeżenie o nieużywanej zależności i utrudni czytanie.

- [ ] **Step 3: Podstaw `finishPolygon` w gałęzi snapu**

W `handleMouseDown` — było:

```js
      if (canClosePolygon(pts) && snapDist < 15) {
        // Zamknij wielokąt
        const completed = [...pts];
        polygonPointsRef.current = [];
        polygonActiveRef.current = false;
        polygonCursorRef.current = null;
        render(null);
        if (onPathComplete) {
          onPathComplete({ points: completed, brushSize, shape: 'polygon', cover: fogCoverMode });
        }
        return;
      }
```

ma być:

```js
      if (canClosePolygon(pts) && snapDist < 15) {
        finishPolygon(true);
        return;
      }
```

Do tablicy zależności `handleMouseDown` dopisz `finishPolygon`.

- [ ] **Step 4: Efekt „zmiana narzędzia" zostaw bez zmian**

`useEffect`, który anuluje wielokąt przy przełączeniu narzędzia (`// Cancel polygon when switching away from polygon tool`), kasuje te same refy, ale **nie** przechodzi na `finishPolygon` — odpala się dokładnie wtedy, gdy `fogTool` przestał być `'polygon'`, a `finishPolygon` przez `fogCoverMode`/`brushSize` zmienia tożsamość częściej niż `render`. Podmiana wciągnęłaby ten efekt w niepotrzebne przebiegi. Zostaw kod jak jest, ale dopisz nad nim komentarz, żeby duplikat nie wyglądał na przeoczenie:

```js
  // Reset lokalny, nie finishPolygon: ten efekt ma odpalać się wyłącznie przy zmianie
  // narzędzia, a finishPolygon zależy od brushSize i fogCoverMode — wciągnięcie go do
  // tablicy zależności dokładałoby przebiegi bez powodu.
```

- [ ] **Step 5: Uruchom testy**

```bash
CI=true npm test -- --testPathPattern="FogLayer|DrawingLayer" --watchAll=false
```

Oczekiwane: PASS.

- [ ] **Step 6: Weryfikacja ręczna — nic się nie zepsuło**

Jako GM, tryb mgły, narzędzie wielokąt:
1. Postaw 4 punkty, kliknij lewym w pierwszy → figura odsłonięta.
2. Postaw 2 punkty, wciśnij Escape → linie pomocnicze znikają, nic nie zapisane.

- [ ] **Step 7: Commit**

```bash
git add src/components/scene/FogLayer.jsx
git commit -m "refactor(front): FEATURE-119 extract finishPolygon from the three reset copies"
```

---

### Task 3: Prawy przycisk kończy wielokąt i przerywa kształt

Właściwy feature. Razem z nim guardy na macOS ctrl+klik — bez nich prawy przycisk działa na macOS nieprzewidywalnie, więc to jedna całość, nie osobne zadanie.

**Files:**
- Modify: `src/components/scene/FogLayer.jsx` (`handleMouseDown` — linia 232; `handleMouseUp` — linia 320; nowy `handleContextMenu`; JSX canvasu — linia ~370)

**Interfaces:**
- Consumes: `canClosePolygon` (Zadanie 1), `finishPolygon` (Zadanie 2)
- Produces: nic dla dalszych zadań — to ostatnie zadanie

- [ ] **Step 1: Dodaj `handleContextMenu`**

Wstaw bezpośrednio pod `handleMouseUp`, a nad `handleMouseLeave`:

```js
  /**
   * Prawy przycisk = „skończ to, co robisz".
   * Wielokąt: zamknij (>= 3 wierzchołki) albo porzuć. Pozostałe narzędzia: porzuć kształt
   * ciągnięty w tej chwili. Ten sam gest co w warstwie rysowania (DrawingLayer).
   */
  const handleContextMenu = useCallback((e) => {
    // Narzędzie `pan` i tryb bez edycji mgły przepuszczają natywne menu przeglądarki.
    if (!isEditingFog) return;
    e.preventDefault();
    e.stopPropagation();

    if (fogTool === 'polygon' && polygonActiveRef.current) {
      finishPolygon(canClosePolygon(polygonPointsRef.current));
      return;
    }

    // Porzucenie kształtu w trakcie. Wyzerowanie currentPathRef liczy się tak samo jak
    // flaga isDrawingRef: render czyta ten ref przy podglądzie, więc zostawiona zawartość
    // odmalowałaby porzucony kształt przy najbliższym przerysowaniu.
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      currentPathRef.current = null;
      rectStartRef.current = null;
      render(null);
    }
  }, [isEditingFog, fogTool, finishPolygon, render]);
```

- [ ] **Step 2: Podepnij handler do canvasu**

W JSX, w liście handlerów `<canvas>` — było:

```jsx
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
```

ma być:

```jsx
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
```

- [ ] **Step 3: Guard ctrl+klik w `handleMouseDown`**

Było:

```js
    if (e.button !== 0) return; // right button never edits fog
```

ma być:

```js
    // Rysuje wyłącznie goły lewy przycisk. Ctrl+lewy jest odrzucany, bo na macOS to
    // systemowa emulacja prawego przycisku: przeglądarka wysyła wtedy OBA zdarzenia —
    // `contextmenu` i to `mousedown` z button 0 — w kolejności, której spec nie ustala.
    // Bez tego warunku jedno kliknięcie dokłada wierzchołek I zamyka wielokąt.
    if (e.button !== 0 || e.ctrlKey) return;
```

- [ ] **Step 4: Guard przycisku w `handleMouseUp`**

Było:

```js
  const handleMouseUp = useCallback((e) => {
    if (!isDrawingRef.current || !isEditingFog) return;
```

ma być:

```js
  const handleMouseUp = useCallback((e) => {
    // Lustro guardu z handleMouseDown. Bez `e.button !== 0` zwolnienie prawego przycisku
    // w trakcie ciągnięcia prostokąta zapisuje kształt, który miał zostać porzucony — na
    // przeglądarkach, gdzie `mouseup` wyprzedza `contextmenu` (kolejność jest niezdefiniowana).
    // Bezpieczne dla relaya handleMouseLeave → handleMouseUp: wg specyfikacji `button` ma
    // znaczenie tylko przy wciśnięciu/zwolnieniu, a poza nimi wynosi 0.
    if (!isDrawingRef.current || !isEditingFog || e.button !== 0) return;
```

- [ ] **Step 5: Uruchom testy**

```bash
CI=true npm test -- --testPathPattern="FogLayer|DrawingLayer" --watchAll=false
```

Oczekiwane: PASS. Testy nie pokrywają zdarzeń myszy — to zabezpieczenie przed zepsuciem helpera, właściwa weryfikacja jest ręczna w kroku 6.

- [ ] **Step 6: Weryfikacja ręczna**

Jako GM, tryb mgły. Każdy punkt musi wyjść tak, jak opisany:

1. Wielokąt, 3+ punkty, prawy przycisk → figura zamknięta i odsłonięta, menu przeglądarki się **nie** pokazuje.
2. Wielokąt, 1 punkt, prawy przycisk → linie pomocnicze znikają, nic nie zapisane.
2b. Wielokąt, dokładnie 2 punkty, kursor odsunięty tak, że podgląd rysuje wypełniony trójkąt,
   prawy przycisk → wszystko znika, nic nie zapisane. Podgląd wypełnia każdy wielokąt od 3 punktów
   licząc kursor, ale zapis liczy wyłącznie punkty postawione — ta rozbieżność jest widoczna
   tylko przy 2 punktach.
3. Wielokąt, 4 punkty, klik lewym w pierwszy punkt → nadal działa (regresja Zadania 2).
4. Prostokąt: wciśnij lewy, ciągnij, wciśnij prawy → kształt porzucony, nic nie zapisane.
5. Freehand: w trakcie ciągnięcia prawy przycisk → ślad porzucony.
6. Narzędzie `pan`, prawy przycisk → natywne menu przeglądarki działa jak dotąd.
7. macOS: ctrl+lewy przy aktywnym wielokącie → zachowuje się jak prawy przycisk (kończy), nie dokłada wierzchołka.
7b. macOS: ctrl+lewy przytrzymany ~1 s bez ruchu → u pozostałych graczy NIE pojawia się pointer
   ping. `SceneViewport` uzbraja ping w fazie przechwytywania na `mousedown` z `button === 0`, a
   ctrl+lewy właśnie taki jest — `stopPropagation` w FogLayer tego nie zatrzyma.

- [ ] **Step 7: Commit**

```bash
git add src/components/scene/FogLayer.jsx
git commit -m "feat(front): FEATURE-119 right-click finishes a fog polygon"
```

---

## Pokrycie specu

| Wymaganie ze specu | Zadanie |
|---|---|
| Prawy przy >= 3 wierzchołkach zamyka i zapisuje | 3, krok 1 |
| Prawy przy 1–2 wierzchołkach porzuca | 3, krok 1 |
| Prawy przerywa kształt w pozostałych narzędziach mgły | 3, krok 1 |
| Menu przeglądarki zablokowane w trybie edycji mgły | 3, krok 1 (`preventDefault`) |
| Narzędzie `pan` bez zmian | 3, krok 1 (`if (!isEditingFog) return`) |
| Helper `canClosePolygon` + test jednostkowy | 1 |
| `finishPolygon` zamiast trzech kopii resetu | 2 |
| Guardy macOS ctrl+klik | 3, kroki 3–4 |
