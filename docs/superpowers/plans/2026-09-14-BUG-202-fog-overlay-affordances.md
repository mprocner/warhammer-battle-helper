# BUG-202 — Afordancje mgły wojny niezależne od suwaka krycia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Odciąć afordancje GM (pierścień pędzla, overlay wielokąta) od suwaka krycia mgły, dodać obrysy podglądu dla prostokąta/koła/linii i pokazać pierścień pędzla także dla narzędzia `line`.

**Architecture:** CSS `opacity` na płótnie mgły znika; zamiast niego jeden przebieg `destination-out` na końcu rysowania mgły wpala krycie w piksele. Afordancje rysowane po tym przebiegu mają pełną alfę niezależnie od suwaka. Cała zmiana mieści się w `FogLayer.jsx` plus dwa pliki testowe.

**Tech Stack:** React 18, Canvas 2D, Jest + React Testing Library (CRA), jsdom.

## Global Constraints

- Spec: `docs/superpowers/specs/BUG-202.md` — czytaj przed startem.
- Wszystkie polecenia testowe uruchamiaj z katalogu `warhammer-battle-helper-front/`.
  Komenda: `CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`.
  Gołe `npx jest` **nie działa** — konfiguracją zarządza CRA.
- Znany baseline fail w całym pakiecie: `App.test.js` (axios ESM). To nie jest regresja.
  Przy `--testPathPattern=FogLayer` w ogóle się nie pojawi.
- Gracz (`isGM === false`) musi dostać krycie `1.0` na każdej ścieżce kodu. To jedyne miejsce
  w pliku mogące przeciec informację o mapie — żadna zmiana nie może tego rozluźnić.
- Kolory i szerokości overlayu podane w planie są dosłowne. Nie zaokrąglaj, nie zmieniaj formatu
  literałów `rgba(...)` — testy porównują je jako stringi, a canvas normalizuje spacje po przecinku.
- Nie ruszaj rozjazdu `lineWidth` między liniami wielokąta (`2`) a snap indicatorem (`8 * scaleX`).
  Poza zakresem.
- Commity: konwencja repo, typ `fix:` albo `refactor:`, prefiks `BUG-202`, stopka
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Komentarze w kodzie ZAWSZE po angielsku** (CLAUDE.md, „Kluczowe konwencje"). Dotyczy też
  plików testowych. Nazwy `it()` / `describe()` to nie komentarze — zostają tak, jak podane
  w planie. Istniejących polskich komentarzy w `FogLayer.jsx` nie tłumaczymy hurtem; przepisujemy
  tylko te linie, które i tak dotykamy.

## File Structure

| Plik | Rola | Zmiana |
|---|---|---|
| `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx` | płótno mgły + afordancje GM | modyfikacja, cała logika |
| `warhammer-battle-helper-front/src/components/scene/FogLayer.test.js` | testy czystych eksportów (nie montuje komponentu — jsdom nie ma canvasu 2D) | modyfikacja + nowe `describe` |
| `warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx` | testy poziomu renderu z podstawionym, nagrywającym `getContext` | **nowy plik** |

Podział testów jest celowy: `FogLayer.test.js` zostaje szybki i wolny od DOM-u, a cała
maszyneria stubowania canvasu żyje w jednym nowym pliku i nie zanieczyszcza tamtego.

---

### Task 1: Przemianowanie `fogCssOpacity` → `fogShadeAlpha`

Czysty refaktor nazwy, bez zmiany zachowania. Wartość wciąż trafia do CSS `opacity` — to zmieni
się w Tasku 2. Osobny commit, żeby przemianowanie nie mieszało się w diffie ze zmianą logiki.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx:36-42`, `:420`
- Test: `warhammer-battle-helper-front/src/components/scene/FogLayer.test.js:1`, `:53-64`

**Interfaces:**
- Consumes: nic
- Produces: `fogShadeAlpha({ isGM, fogGmOpacity }) -> number` — eksport nazwany, zastępuje
  `fogCssOpacity`. Ta sama sygnatura i te same wartości zwracane.

- [ ] **Step 1: Zmień test na nową nazwę (test najpierw — ma nie skompilować się do zielonego)**

W `FogLayer.test.js` linia 1:

```js
import { canClosePolygon, fogVisibleFor, fogShadeAlpha } from './FogLayer';
```

I zamień cały blok `describe('fogCssOpacity', ...)` (linie 53-64) na:

```js
// The only line in the branch that could leak map information — a player must never
// receive see-through fog, regardless of what preference is passed in.
describe('fogShadeAlpha', () => {
  it('pins a player at full opacity regardless of the preference passed', () => {
    expect(fogShadeAlpha({ isGM: false, fogGmOpacity: 0.1 })).toBe(1.0);
    expect(fogShadeAlpha({ isGM: false, fogGmOpacity: 1.0 })).toBe(1.0);
  });

  it('passes the GM preference through unchanged', () => {
    expect(fogShadeAlpha({ isGM: true, fogGmOpacity: 0.1 })).toBe(0.1);
    expect(fogShadeAlpha({ isGM: true, fogGmOpacity: 0.7 })).toBe(0.7);
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: FAIL — `TypeError: (0 , _FogLayer.fogShadeAlpha) is not a function`

- [ ] **Step 3: Przemianuj eksport i jego użycie**

W `FogLayer.jsx` zastąp blok linii 36-42:

```js
/**
 * How see-through the fog canvas is. The only line in this file that could leak map
 * information: a player must always get full, opaque fog — the GM's own preview
 * preference (`fogGmOpacity`) never applies to them.
 */
export const fogShadeAlpha = ({ isGM, fogGmOpacity }) => (isGM ? fogGmOpacity : 1.0);
```

I w linii 420:

```js
  const cssOpacity = fogShadeAlpha({ isGM, fogGmOpacity });
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: PASS, wszystkie `describe` zielone.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.test.js
git commit -m "$(cat <<'EOF'
refactor: BUG-202 rename fogCssOpacity to fogShadeAlpha

The value is about to stop feeding CSS opacity and start being baked into the
canvas pixels, so the old name would lie about where it is used.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wpalenie krycia w piksele zamiast CSS `opacity` — właściwy bugfix

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx` — dodanie `shadeAlpha`
  w ciele komponentu, przebieg wygaszający w `render()` (przy linii 140), tablica zależności
  `render` (linia 212), usunięcie `opacity` z `style` płótna (linia 434)
- Test: `warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx` (**nowy**)

**Interfaces:**
- Consumes: `fogShadeAlpha({ isGM, fogGmOpacity })` z Taska 1
- Produces: płótno `FogLayer` bez atrybutu `opacity` w `style`; w `render()` istnieje przebieg
  `destination-out` + `fillRect` całego płótna, wykonywany wyłącznie gdy `shadeAlpha < 1`;
  po nim `globalCompositeOperation` jest zawsze `'source-over'`.

- [ ] **Step 1: Napisz nowy plik testowy z nagrywającym kontekstem**

Utwórz `warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import FogLayer from './FogLayer';

/**
 * jsdom has no 2D canvas — `getContext('2d')` returns null. We substitute an object that
 * pretends to be a context and snapshots its state on every painting call. That lets a test
 * check NOT just what was drawn, but in which composite mode and in which colour — which is
 * exactly what BUG-202 is about.
 */
const recordingContext = () => {
  const calls = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    setLineDash: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    rect: () => {},
  };
  const snap = (op) => calls.push({
    op,
    composite: ctx.globalCompositeOperation,
    fillStyle: ctx.fillStyle,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
  });
  ctx.fill = () => snap('fill');
  ctx.fillRect = () => snap('fillRect');
  ctx.stroke = () => snap('stroke');
  return { ctx, calls };
};

const CANVAS_W = 400;
const CANVAS_H = 300;

const baseProps = {
  scene: { fogEnabled: true, revealPaths: [] },
  isGM: true,
  editingLayer: 'fog',
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  brushSize: 30,
  onPathComplete: () => {},
};

let recording;

beforeEach(() => {
  recording = recordingContext();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recording.ctx);
  // getBoundingClientRect returns all zeros in jsdom — without a stub getSceneCoords divides
  // by zero and every coordinate comes out Infinity.
  jest.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: CANVAS_W, height: CANVAS_H,
    right: CANVAS_W, bottom: CANVAS_H, x: 0, y: 0, toJSON: () => {},
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// The LAST fade, not the first. `calls` accumulates across every render() the component
// runs — the mount effect, then each mouse move — so the first match is always the mount's
// fade, and "everything after it" would then include a later render's own fade. Taking the
// last one scopes the assertion to the most recent complete repaint.
const fadeIndex = (calls) => {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i].op === 'fillRect' && calls[i].composite === 'destination-out') return i;
  }
  return -1;
};

describe('BUG-202 — GM opacity is baked into the pixels, not applied to the whole canvas', () => {
  it('does not set CSS opacity on the canvas any more', () => {
    const { container } = render(<FogLayer {...baseProps} fogGmOpacity={0.5} />);
    expect(container.querySelector('canvas').style.opacity).toBe('');
  });

  it('fades the fog with a full-canvas destination-out pass matching the slider', () => {
    render(<FogLayer {...baseProps} fogGmOpacity={0.5} />);
    const fade = recording.calls[fadeIndex(recording.calls)];
    expect(fade).toBeDefined();
    expect(fade.fillStyle).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('skips the fade entirely at full opacity — a player must get untouched pixels', () => {
    render(<FogLayer {...baseProps} isGM={false} fogGmOpacity={0.2} />);
    expect(fadeIndex(recording.calls)).toBe(-1);
  });

  it('draws the brush ring at its literal colour after the fade, whatever the slider says', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="freehand" fogGmOpacity={0.2} />,
    );
    const canvas = container.querySelector('canvas');
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 80 });

    const idx = fadeIndex(recording.calls);
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = recording.calls.slice(idx + 1);

    expect(after.every((c) => c.composite === 'source-over')).toBe(true);
    expect(after.some((c) => c.op === 'stroke' && c.strokeStyle === 'rgba(255, 255, 255, 0.9)'))
      .toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: FAIL — pierwszy test na `style.opacity` dostaje `"0.5"` zamiast `""`, a testy szukające
przebiegu `destination-out` + `fillRect` dostają `fade` równe `undefined` / `fadeIndex` równe `-1`.

- [ ] **Step 3: Policz `shadeAlpha` w ciele komponentu**

W `FogLayer.jsx`, zaraz pod linią 69 (`const inFogMode = ...`), dodaj:

```js
  // The GM's preview opacity is now part of the canvas CONTENT, not its style, so it has to
  // join `render`'s dependency array — otherwise moving the slider repaints nothing.
  const shadeAlpha = fogShadeAlpha({ isGM, fogGmOpacity });
```

- [ ] **Step 4: Dodaj przebieg wygaszający i przenumeruj komentarze sekcji**

W `render()` zastąp linię 140 (`ctx.globalCompositeOperation = 'source-over';`) blokiem:

```js
    // --- 3. Bake the GM's preview opacity into the pixels ---
    // One destination-out pass multiplies the alpha of everything drawn so far by
    // shadeAlpha — exactly what CSS opacity did, only earlier in the pipeline. Revealed
    // holes stay holes (0 × anything = 0). It runs AFTER every path, not as alpha in the
    // fog fillStyle: cover mode repaints fog with source-over, and per-fill alpha would
    // stack there (0.5 over 0.5 = 0.75), making covered ground darker than base fog.
    if (shadeAlpha < 1) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - shadeAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Everything below is a GM affordance, drawn at full alpha on top of the faded fog.
    ctx.globalCompositeOperation = 'source-over';
```

Zmień też komentarz sekcji pierścienia (linia 142) z `--- 3.` na `--- 4. Draw brush cursor circle (freehand only, when GM is editing) ---`.

- [ ] **Step 5: Dopisz `shadeAlpha` do zależności `render`**

Linia 212 (koniec `useCallback`):

```js
  }, [inFogMode, scene, fogTool, brushSize, shadeAlpha]);
```

- [ ] **Step 6: Usuń CSS `opacity` z płótna**

W `FogLayer.jsx` usuń linię 420 (`const cssOpacity = fogShadeAlpha({ isGM, fogGmOpacity });`)
— `shadeAlpha` z kroku 3 ją zastępuje — oraz linię 434 (`opacity: cssOpacity,`) z obiektu `style`.
Nie zostawiaj `opacity: 1`; brak właściwości jest tym samym, a mniej myli.

- [ ] **Step 7: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: PASS, oba pliki `FogLayer.test.js` i `FogLayer.render.test.jsx` zielone.

- [ ] **Step 8: Sprawdź, czy ESLint nie zgłasza brakującej zależności**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer 2>&1 | grep -i "react-hooks/exhaustive-deps" || echo "brak ostrzezen"`
Expected: `brak ostrzezen`

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx
git commit -m "$(cat <<'EOF'
fix: BUG-202 bake the GM fog opacity into the pixels

The fog and the GM's own affordances — brush ring, polygon guides — share one
canvas, and CSS opacity multiplies the whole composited result. FEATURE-216
put a slider behind that value, so the cursor faded with the fog instead of
staying a constant.

A single destination-out pass after the reveal paths now scales the fog's alpha
instead, and the affordances are drawn after it at full alpha. Revealed holes
stay holes; a player takes the shadeAlpha === 1 path and gets untouched pixels.

The slider is now canvas CONTENT, so shadeAlpha joins render's dependency array —
without it the slider would do nothing until the next mouse move.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `usesBrushCursor` — pierścień pędzla także dla narzędzia `line`

Narzędzie `line` rysuje pociągnięcie o szerokości `brushSize`, ale dostaje krzyżyk i nie mówi nic
o swojej szerokości. Prostokąt i koło wypełniają obszar i `brushSize` ignorują, więc krzyżyk
jest tam poprawny. Warunek `fogTool === 'freehand'` siedzi dziś w trzech bramkach — idzie do
jednego predykatu.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx` — nowy eksport przy
  linii 42, trzy bramki (linie 143, 352, 436)
- Test: `warhammer-battle-helper-front/src/components/scene/FogLayer.test.js` (nowy `describe`),
  `warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx` (nowy `describe`)

**Interfaces:**
- Consumes: nic z poprzednich tasków
- Produces: `usesBrushCursor(fogTool) -> boolean` — eksport nazwany, `true` dla `'freehand'`
  i `'line'`, `false` dla wszystkiego innego.

- [ ] **Step 1: Napisz testy czystego predykatu**

Dopisz na końcu `FogLayer.test.js`:

```js
// The brush ring is the only signal of brushSize the user gets. It must appear for exactly
// those tools whose reach brushSize decides.
describe('usesBrushCursor', () => {
  it('pędzel i linia pokazują pierścień — obie rysują pociągnięciem o szerokości brushSize', () => {
    expect(usesBrushCursor('freehand')).toBe(true);
    expect(usesBrushCursor('line')).toBe(true);
  });

  it('prostokąt i koło wypełniają obszar, więc brushSize ich nie dotyczy', () => {
    expect(usesBrushCursor('rect')).toBe(false);
    expect(usesBrushCursor('circle')).toBe(false);
  });

  it('wielokąt ma własny overlay, a pan nie rysuje nic', () => {
    expect(usesBrushCursor('polygon')).toBe(false);
    expect(usesBrushCursor('pan')).toBe(false);
  });
});
```

I dopisz `usesBrushCursor` do importu w linii 1:

```js
import { canClosePolygon, fogVisibleFor, fogShadeAlpha, usesBrushCursor } from './FogLayer';
```

- [ ] **Step 2: Napisz test renderu na kursor CSS i na pierścień przy narzędziu `line`**

Dopisz na końcu `FogLayer.render.test.jsx`:

```jsx
describe('BUG-202 — the line tool shows the brush ring, because its width is brushSize', () => {
  it('hides the native cursor for the line tool, like for freehand', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="line" fogGmOpacity={0.5} />,
    );
    expect(container.querySelector('canvas').style.cursor).toBe('none');
  });

  it('keeps the crosshair for rect, which ignores brushSize', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="rect" fogGmOpacity={0.5} />,
    );
    expect(container.querySelector('canvas').style.cursor).toBe('crosshair');
  });

  it('draws the ring on an idle mouse move with the line tool selected', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="line" fogGmOpacity={0.5} />,
    );
    fireEvent.mouseMove(container.querySelector('canvas'), { clientX: 120, clientY: 90 });

    expect(recording.calls.some(
      (c) => c.op === 'stroke' && c.strokeStyle === 'rgba(255, 255, 255, 0.9)',
    )).toBe(true);
  });
});
```

- [ ] **Step 3: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: FAIL — `usesBrushCursor is not a function`, `cursor` dla `line` to `"crosshair"` zamiast
`"none"`, brak `stroke` w kolorze pierścienia.

- [ ] **Step 4: Dodaj predykat**

W `FogLayer.jsx`, pod eksportem `fogShadeAlpha` (po linii 42):

```js
/**
 * Tools whose reach is set by brushSize — only those show the brush ring instead of a
 * crosshair. Rectangle and circle fill an area, so brushSize does not apply to them.
 * The same condition gates three things at once (drawing the ring, repainting on mouse
 * move, hiding the native cursor), which is why it lives in one place.
 */
export const usesBrushCursor = (fogTool) => fogTool === 'freehand' || fogTool === 'line';
```

- [ ] **Step 5: Przestaw trzy bramki na predykat**

Bramka 1 — warunek rysowania pierścienia (obecna linia 143, po zmianach z Taska 2 przesunięta
w dół; szukaj `fogTool === 'freehand' && cursorPosRef.current`):

```js
    if (inFogMode && usesBrushCursor(fogTool) && cursorPosRef.current) {
```

Bramka 2 — przerysowanie na `mousemove` bez wciśniętego przycisku (obecna linia 352; szukaj
`} else if (fogTool === 'freehand') {` w `handleMouseMove`):

```js
    } else if (usesBrushCursor(fogTool)) {
      // Not drawing — redraw to update cursor circle position
      render(null);
    }
```

Bramka 3 — kursor CSS na płótnie (obecna linia 436):

```js
        cursor: inFogMode ? (usesBrushCursor(fogTool) ? 'none' : 'crosshair') : 'default',
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.test.js \
        warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx
git commit -m "$(cat <<'EOF'
fix: BUG-202 show the brush ring for the line tool

The line tool strokes with brushSize but showed a crosshair, so nothing told the
GM how wide the reveal would be before the drag started — the exact problem when
opening a 30px dungeon corridor.

The `fogTool === 'freehand'` test guarded three separate things in three places:
drawing the ring, repainting on an idle mouse move so it follows the pointer, and
hiding the native cursor. All three now call one usesBrushCursor predicate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `capsuleArcs` — czysta matematyka obrysu grubej linii

Gruba linia z `lineCap: 'round'` to kapsuła (stadion), nie prostokąt. Canvas nie umie
„obrysować obrysu", więc kształt trzeba złożyć z dwóch łuków — `arc()` łączy je odcinkami sam.
Ta matematyka jest jedynym nietrywialnym rachunkiem w całej zmianie, więc wychodzi z `render()`
do czystej funkcji, którą da się sprawdzić liczbami.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx` — nowy eksport
  pod `usesBrushCursor`
- Test: `warhammer-battle-helper-front/src/components/scene/FogLayer.test.js` (nowy `describe`)

**Interfaces:**
- Consumes: nic
- Produces: `capsuleArcs([x1, y1], [x2, y2], radius) -> [{ x, y, radius, start, end }, { x, y, radius, start, end }]`
  — dwa opisy łuków w kolejności rysowania (najpierw czapka przy punkcie startowym).
  Konsumuje go Task 5.

- [ ] **Step 1: Napisz testy**

Dopisz na końcu `FogLayer.test.js`:

```js
// The outline of a thick line is a capsule: two semicircular caps joined by sides. Each cap
// is rotated by the line's angle and its arc runs from +90° to -90° relative to that angle —
// which is what makes the next arc() start on the correct side, so the side comes for free.
describe('capsuleArcs', () => {
  const HALF_PI = Math.PI / 2;

  it('linia pozioma — czapki obrócone o zero', () => {
    const [start, end] = capsuleArcs([0, 0], [10, 0], 5);
    expect(start).toEqual({ x: 0, y: 0, radius: 5, start: HALF_PI, end: -HALF_PI });
    expect(end).toEqual({ x: 10, y: 0, radius: 5, start: -HALF_PI, end: HALF_PI });
  });

  it('linia pod 45° — obie czapki obrócone o ten sam kąt', () => {
    const [start, end] = capsuleArcs([0, 0], [10, 10], 4);
    const angle = Math.PI / 4;
    expect(start.start).toBeCloseTo(angle + HALF_PI);
    expect(start.end).toBeCloseTo(angle - HALF_PI);
    expect(end.start).toBeCloseTo(angle - HALF_PI);
    expect(end.end).toBeCloseTo(angle + HALF_PI);
  });

  it('promień wędruje do obu czapek nietknięty', () => {
    const [start, end] = capsuleArcs([3, 7], [3, 20], 9);
    expect(start.radius).toBe(9);
    expect(end.radius).toBe(9);
  });

  it('zerowa długość degeneruje się do okręgu, bez osobnej gałęzi w kodzie', () => {
    // atan2(0, 0) === 0, so both caps land on the same point and compose into a full
    // circle. Happens on a click with no drag.
    const [start, end] = capsuleArcs([5, 5], [5, 5], 6);
    expect(start.x).toBe(5);
    expect(end.x).toBe(5);
    expect(start.start).toBe(HALF_PI);
    expect(end.end).toBe(HALF_PI);
  });
});
```

Dopisz `capsuleArcs` do importu w linii 1:

```js
import {
  canClosePolygon, fogVisibleFor, fogShadeAlpha, usesBrushCursor, capsuleArcs,
} from './FogLayer';
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: FAIL — `capsuleArcs is not a function`

- [ ] **Step 3: Zaimplementuj funkcję**

W `FogLayer.jsx`, pod eksportem `usesBrushCursor`:

```js
/**
 * The outline of a thick round-capped line is a capsule. Canvas has no "stroke the outline
 * of a stroke", so we build the shape from two arcs: `arc()` draws a `lineTo` from the
 * current point to the start of the next arc, so the capsule's sides come for free and
 * `closePath()` shuts the last one. At zero length `atan2(0, 0)` is 0 and both caps collapse
 * into a circle — no special case needed.
 */
export const capsuleArcs = ([x1, y1], [x2, y2], radius) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const quarter = Math.PI / 2;
  return [
    { x: x1, y: y1, radius, start: angle + quarter, end: angle - quarter },
    { x: x2, y: y2, radius, start: angle - quarter, end: angle + quarter },
  ];
};
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.test.js
git commit -m "$(cat <<'EOF'
feat: BUG-202 add capsuleArcs, the outline geometry for a thick line

A round-capped stroke outlines as a capsule, and canvas has no "stroke the
outline of a stroke". Two arcs do it: arc() joins them with a lineTo, so the
sides come for free. Kept as a pure function so the only real maths in the
change can be checked with numbers instead of pixels.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Obrysy podglądu dla prostokąta, koła i linii

Przy niskim kryciu mgły sam podgląd reveal jest prawie niewidoczny — odsłaniasz coś, co i tak
ledwo widać. Obrys bywa wtedy jedyną informacją o zasięgu. Wielokąt ma go od zawsze; te trzy
narzędzia nie miały żadnego.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx` — stałe modułowe,
  helper rysujący, wywołanie w `render()`, podmiana literałów w overlayu wielokąta
- Test: `warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx` (nowy `describe`)

**Interfaces:**
- Consumes: `capsuleArcs([x1, y1], [x2, y2], radius)` z Taska 4; przebieg wygaszający z Taska 2
  (obrys musi lecieć PO nim, żeby nie blaknął razem z mgłą)
- Produces: nic dla dalszych tasków — to ostatni

- [ ] **Step 1: Napisz testy**

Dopisz na końcu `FogLayer.render.test.jsx`:

```jsx
const OVERLAY = 'rgba(255, 220, 100, 0.9)';

/** A drag: press at (x1,y1), move to (x2,y2). No mouseUp — the preview is what we are after. */
const drag = (canvas, [x1, y1], [x2, y2]) => {
  fireEvent.mouseDown(canvas, { button: 0, clientX: x1, clientY: y1 });
  fireEvent.mouseMove(canvas, { clientX: x2, clientY: y2 });
};

describe('BUG-202 — rect, circle and line get a preview outline like the polygon has', () => {
  it.each(['rect', 'circle', 'line'])('draws an outline while dragging with %s', (fogTool) => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool={fogTool} fogGmOpacity={0.5} />,
    );
    const canvas = container.querySelector('canvas');
    drag(canvas, [40, 40], [160, 120]);

    expect(recording.calls.some(
      (c) => c.op === 'stroke' && c.strokeStyle === OVERLAY && c.lineWidth === 2,
    )).toBe(true);
  });

  it('draws the outline after the fade, so the slider cannot dim it', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="rect" fogGmOpacity={0.2} />,
    );
    drag(container.querySelector('canvas'), [40, 40], [160, 120]);

    const idx = fadeIndex(recording.calls);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(recording.calls.slice(idx + 1).some(
      (c) => c.op === 'stroke' && c.strokeStyle === OVERLAY,
    )).toBe(true);
  });

  it('draws no outline before the drag starts', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="rect" fogGmOpacity={0.5} />,
    );
    fireEvent.mouseMove(container.querySelector('canvas'), { clientX: 40, clientY: 40 });

    expect(recording.calls.some((c) => c.op === 'stroke' && c.strokeStyle === OVERLAY))
      .toBe(false);
  });

  it('leaves freehand without an outline — its ring already shows the width', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="freehand" fogGmOpacity={0.5} />,
    );
    drag(container.querySelector('canvas'), [40, 40], [160, 120]);

    expect(recording.calls.some((c) => c.op === 'stroke' && c.strokeStyle === OVERLAY))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: FAIL — trzy pierwsze testy dostają `false` zamiast `true` (żaden `stroke` nie ma koloru
overlayu). Dwa ostatnie („no outline before the drag", „freehand") przechodzą już teraz — to
oczekiwane, pilnują, żeby implementacja nie poszła za szeroko.

- [ ] **Step 3: Dodaj stałe modułowe**

W `FogLayer.jsx`, pod `const MIN_POLYGON_POINTS = 3;` (linia 24):

```js
/** The GM overlay's working amber — shared by the polygon guides and the shape previews. */
const OVERLAY_COLOR = 'rgba(255, 220, 100, 0.9)';
const OVERLAY_WIDTH = 2;

/**
 * Tools dragged from point to point, which get a preview outline. Keyed on fogTool, not
 * path.shape: the line tool is stored as `freehand`, so `shape` cannot tell it apart from
 * the brush.
 */
const OUTLINED_TOOLS = new Set(['rect', 'circle', 'line']);
```

- [ ] **Step 4: Dodaj helper rysujący obrys**

W `FogLayer.jsx`, pod `capsuleArcs`:

```js
/**
 * The outline of what will be saved once the button is released. At a low fog opacity the
 * reveal preview itself is nearly invisible — you are erasing something already faint — so
 * this is often the only signal of how far the stroke reaches.
 */
const strokeShapeOutline = (ctx, fogTool, points, brushSize) => {
  const [[x1, y1], [x2, y2]] = points;
  ctx.beginPath();
  if (fogTool === 'rect') {
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (fogTool === 'circle') {
    ctx.arc(x1, y1, Math.hypot(x2 - x1, y2 - y1), 0, Math.PI * 2);
  } else {
    capsuleArcs([x1, y1], [x2, y2], brushSize / 2).forEach(({ x, y, radius, start, end }) => {
      ctx.arc(x, y, radius, start, end);
    });
    ctx.closePath();
  }
  ctx.stroke();
};
```

- [ ] **Step 5: Zawołaj helper w `render()`**

W `render()`, zaraz po `ctx.globalCompositeOperation = 'source-over';` z Taska 2, a PRZED blokiem
pierścienia pędzla:

```js
    // --- 4. Preview outline of the shape being dragged ---
    if (inFogMode && OUTLINED_TOOLS.has(fogTool) && extraPath?.points?.length >= 2) {
      ctx.strokeStyle = OVERLAY_COLOR;
      ctx.lineWidth = OVERLAY_WIDTH;
      ctx.setLineDash([]);
      strokeShapeOutline(ctx, fogTool, extraPath.points, brushSize);
    }
```

Przenumeruj komentarze poniżej: pierścień pędzla staje się `--- 5. ---`, overlay wielokąta
`--- 6. ---`.

- [ ] **Step 6: Podmień literały w overlayu wielokąta na stałe**

W bloku overlayu wielokąta zastąp trzy wystąpienia:

```js
        ctx.strokeStyle = OVERLAY_COLOR;
        ctx.lineWidth = OVERLAY_WIDTH;
```

(linia ciągła: `rgba(255, 220, 100, 0.9)` + `lineWidth = 2`),

```js
          ctx.fillStyle = OVERLAY_COLOR;
```

(kropki wierzchołków: `rgba(255, 220, 100, 0.9)`).

**Nie ruszaj** linii przerywanej `rgba(255, 220, 100, 0.55)` ani snap indicatora
`rgba(255, 255, 100, 1.0)` — to inne wartości, mają własne znaczenie.

- [ ] **Step 7: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer`
Expected: PASS, wszystkie `describe` w obu plikach.

- [ ] **Step 8: Uruchom cały pakiet frontu i porównaj z baseline**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false 2>&1 | tail -20`
Expected: jedyny fail to `App.test.js` (axios ESM). Każdy inny fail to regresja — zatrzymaj się
i zgłoś.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.render.test.jsx
git commit -m "$(cat <<'EOF'
feat: BUG-202 outline the rect, circle and line previews

The polygon has drawn guide lines all along; the drag tools showed only the hole
they punch in the fog. At a low fog opacity that hole is nearly invisible — you
are erasing something already faint — so the outline is often the only thing
telling the GM where the stroke will land.

Keyed on fogTool rather than path.shape, because the line tool is stored as
`freehand` and shape cannot tell the two apart. The polygon's colour literals
move into the shared OVERLAY_COLOR / OVERLAY_WIDTH constants so a third copy
cannot drift.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Weryfikacja manualna (po Tasku 5)

Recepta uruchomienia: pamięć `worktree-browser-testing` / `local-e2e-verification-recipe`.

1. Jako GM wejdź na scenę z włączoną mgłą, wybierz warstwę mgły.
2. Przeciągnij suwak krycia od 0% do 100% — mgła ma płynnie blaknąć, **pierścień kursora ma nie
   drgnąć**. To jest sam BUG-202.
3. Przy suwaku na 0% pierścień i linie wielokąta mają być dalej wyraźne.
4. Narzędzie linii: przed wciśnięciem przycisku widać pierścień o średnicy `brushSize`;
   w trakcie ciągnięcia dochodzi żółty obrys kapsuły.
5. Prostokąt i koło: żółty obrys w trakcie ciągnięcia, krzyżyk zamiast pierścienia.
6. Tryb cover: zakryty obszar ma mieć **ten sam** odcień co mgła bazowa, nie ciemniejszy.
7. Drugie okno jako gracz: mgła pełna, nieprzezroczysta, niezależnie od suwaka GM.
   Żadnych afordancji GM.
