# BUG-194 — Ikona rotacji do kolumny prawego równika — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uchwyt rotacji tokenu przestaje leżeć na slocie 0 pierścienia — przenosi się do kolumny akcji na prawym równiku (pod czaszkę i oko) i przestaje orbitować na obróconych tokenach-obrazkach.

**Architecture:** Jedna nowa stała `EQUATOR_STACK_STEP` w `utils/tokenRingGeometry.js` staje się jedynym źródłem pionowego rytmu kolumny równika (czaszka 0, oko 1×, rotacja 2×) i zastępuje zahardkodowane `26` w `TokenRingChrome`. `TokenRotateHandle` dostaje wymiary tokenu (liczy sobie `equatorX`) oraz kąt kontr-obrotu, i renderuje się w kotwicy `inset: 0` z `rotate(-counterRotate)` — ten sam trik co `.scene-image__upright`, dzięki czemu na obróconym obrazku uchwyt zostaje na godzinie 3 zamiast orbitować w sloty. Obaj hostowie (`MapCharacterToken`, `SceneImage`) podają tylko dane; matematyka kąta rotacji (`useTokenRotate`) jest nietknięta.

**Tech Stack:** React 18, CRA + Jest, `@mui/icons-material`, i18next, `utils/tokenRingGeometry.js`.

**Spec:** `docs/superpowers/specs/2026-09-11-BUG-194-rotate-handle-equator-design.md`

## Global Constraints

- Katalog roboczy dla wszystkich komend frontu: `warhammer-battle-helper-front/`.
- Komenda testowa: `CI=true npm test -- --watchAll=false` (pojedynczy plik: `--testPathPattern=<nazwa>`). Gołe `npx jest` **nie działa** — konfiguracją zarządza CRA.
- Znany baseline fail: `App.test.js` (axios ESM). To **nie** regresja, ignoruj.
- Brak nowych kluczy i18n. `scenes.rotateToken` istnieje w `locales/en/translation.json:1047` i `locales/pl/translation.json:1047`.
- Backend, `useTokenRotate.js` i `utils/angleSnap.js` — **bez zmian**. Ten fix nie dotyka matematyki kąta ani commitu na serwer.
- `.scene-image__rotate-handle` (`components/scene/SceneViewport.css:431-457`) — uchwyt obrazków **tła** — zostaje na górze bez żadnej zmiany. To świadoma niespójność, opisana w specu w sekcji „Świadoma niespójność".
- Skrót klawiszowy `R` jest **poza zakresem** (FEATURE-200). Nie dodawaj żadnego listenera `keydown`.
- Zasada z `CLAUDE.md`: nieużywany kod usuwamy w tej samej zmianie. Stara klasa `.token-rotate-handle` znika, nie zostaje „na wszelki wypadek".

## File Structure

**Modify:**
- `src/utils/tokenRingGeometry.js` — nowa eksportowana stała `EQUATOR_STACK_STEP`. Plik pozostaje tym, czym jest: jedynym źródłem geometrii pierścienia i równika, bez wiedzy o Reakcie.
- `src/utils/tokenRingGeometry.test.js` — dwa nowe testy pilnujące, że kolumna równika się nie skleja i że uchwyt rotacji nie wraca w pobliże pierścienia.
- `src/components/token-display/TokenRingChrome.jsx:185` — literał `26px` w transformacie oka zamieniony na stałą.
- `src/components/scene/TokenRotateHandle.jsx` — przepisany: nowe propsy, kotwica kontr-obrotu, nowa klasa CSS.
- `src/components/scene/MapCharacterToken.jsx:326` — przekazanie wymiarów, `counterRotate={0}`.
- `src/components/scene/SceneImage.jsx:547` — przekazanie wymiarów i `counterRotate={rotation}`.
- `src/style.css:10982-11002` — `.token-rotate-handle` usunięta, `.token-rotate-anchor` + `.token-rotate-toggle` dodane.

**Create:**
- `src/components/scene/TokenRotateHandle.test.jsx` — **drobne odstępstwo od specu**, świadome. Spec mówi „komponenty sceny nie mają testów renderujących i ten spec ich nie dorabia", ale `TokenRotateHandle` jest liściem bez canvasu, bez `getBoundingClientRect` i bez zdarzeń wskaźnika — smoke test jego transformaty kosztuje ~30 linii i przypina dokładnie to, co poszło źle w BUG-194 (pozycję). Jeśli nie chcesz, skreśl Task 3 w całości; Task 1 i tak pokrywa samą geometrię.

---

## Task 1: Stała rytmu kolumny równika

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/tokenRingGeometry.js`
- Modify: `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx:185`
- Test: `warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js`

**Interfaces:**
- Consumes: nic z wcześniejszych tasków.
- Produces: `export const EQUATOR_STACK_STEP = 26` z `utils/tokenRingGeometry.js`. Task 2 importuje ją w `TokenRotateHandle` i liczy offset `y` jako `EQUATOR_STACK_STEP * 2`.

- [ ] **Step 1: Write the failing tests**

Dopisz na końcu `warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js`:

```js
test('the equator column keeps its buttons apart at every stack position', () => {
  // Kolumna: czaszka y=0, oko y=1 krok, rotacja y=2 kroki. Wszystkie trzy to koła 22px,
  // więc dwa sąsiednie środki muszą dzielić więcej niż 22px, inaczej przyciski się dotykają.
  const BUTTON = 22;
  expect(EQUATOR_STACK_STEP).toBeGreaterThan(BUTTON);
});

test('the rotate handle clears the nearest ring slot on the smallest token', () => {
  // BUG-194: stara pozycja (górna szypułka) siedziała dokładnie na slocie 0. Nowa pozycja to
  // prawy równik, dwa kroki niżej. Najbliższym slotem pierścienia jest teraz ten na 4:30
  // (index 3), więc to jego trzeba przepuścić. Pudełka kolidują tylko gdy zachodzą na OBU
  // osiach, więc jedna czysta oś wystarcza — tu oś X.
  const { radius, equatorX } = tokenRingGeometry(TOKEN, TOKEN, true);
  const nearestSlot = slotOffset(3, radius);
  const handleX = equatorX;

  const HANDLE_HALF = 11; // uchwyt to koło 22px
  const SLOT_HALF = 11;   // slot ikonowy w stanie zaznaczonym to 22px
  expect(handleX - nearestSlot.x).toBeGreaterThan(HANDLE_HALF + SLOT_HALF);
});
```

Rozszerz też import na górze pliku o nową stałą:

```js
import {
  tokenRingGeometry, slotOffset,
  ACTIVE_PUSH, ACTIVE_HALF_HEIGHT, ACTIVE_HALF_WIDTH, HP_CLEAR, EQUATOR_STACK_STEP,
} from './tokenRingGeometry';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=tokenRingGeometry
```

Expected: FAIL — `expect(received).toBeGreaterThan(expected)` z `received: undefined`, bo `EQUATOR_STACK_STEP` jeszcze nie istnieje.

- [ ] **Step 3: Add the constant**

W `warhammer-battle-helper-front/src/utils/tokenRingGeometry.js`, bezpośrednio pod blokiem `EQUATOR_GAP`:

```js
// Pionowy rytm kolumny akcji na prawym równiku: czaszka (0), oko (1x), rotacja (2x). Jedno
// źródło, żeby kolumna nie rozjechała się przy dokładaniu kolejnej ikony — wszystkie trzy to
// koła 22px, więc krok musi zostać większy od 22.
export const EQUATOR_STACK_STEP = 26;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=tokenRingGeometry
```

Expected: PASS, 7 testów w pliku.

- [ ] **Step 5: Replace the hardcoded literal in TokenRingChrome**

W `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx` rozszerz istniejący import (linia 9):

```js
import { slotOffset, ACTIVE_PUSH, EQUATOR_STACK_STEP } from '../../utils/tokenRingGeometry';
```

i w transformacie przycisku widoczności (linia 185) zamień literał:

```jsx
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${equatorX}px), calc(-50% + ${EQUATOR_STACK_STEP}px))` }}
```

- [ ] **Step 6: Run the whole suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: bez nowych porażek. Jedyny fail to `App.test.js` (axios ESM, baseline).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenRingGeometry.js \
        warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js \
        warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx
git commit -m "refactor: BUG-194 single source for the equator column stack step"
```

---

## Task 2: Uchwyt rotacji w kolumnie równika

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx` (cały plik)
- Modify: `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx:326`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx:547`
- Modify: `warhammer-battle-helper-front/src/style.css:10982-11002`

**Interfaces:**
- Consumes: `tokenRingGeometry(width, height, selected)` → `{ halfLong, ringRadius, radius, equatorX }` oraz `EQUATOR_STACK_STEP` (Task 1), oba z `../../utils/tokenRingGeometry`.
- Produces: `TokenRotateHandle({ onRotateStart, width, height, counterRotate })` — default export.
  - `onRotateStart: (MouseEvent) => void` — bez zmian, prosto do `handleRotateStart` z `useTokenRotate`.
  - `width: number`, `height: number` — rozmiar tokenu **w pikselach kanwy** (nie w komórkach). `MapCharacterToken` mnoży komórki przez `CELL_SIZE`, `SceneImage` ma piksele natywnie.
  - `counterRotate?: number` — stopnie, o które obrócony jest kontener hosta; kotwica zastosuje `rotate(-counterRotate)`. Domyślnie `0`.

- [ ] **Step 1: Rewrite the component**

Zastąp **całą** zawartość `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx`:

```jsx
import React from 'react';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import { useTranslation } from 'react-i18next';
import { tokenRingGeometry, EQUATOR_STACK_STEP } from '../../utils/tokenRingGeometry';

// Shared rotate chrome used by BOTH token kinds (character + image). It lives in the right-equator
// action column, two steps below the kill toggle (y = 0) and the eye (y = 1 step).
//
// It used to sit on a stem above the token's north edge, which collided with ring slot 0 at EVERY
// token size, not just small ones (BUG-194): the old box (top: -26px, height 18px) put its centre
// 17px above the token edge, and RING_MARGIN puts slot 0 at exactly the same 17px. halfLong
// cancels out of both, so the overlap was pixel-exact from a 1x1 token to a 3x3 one.
//
// The anchor is inset:0 with rotate(-counterRotate): its origin is the host container's centre, so
// the rotation exactly undoes the host's own — the same trick as .scene-image__upright. This
// matters only for image tokens, whose whole container rotates while the ring is counter-rotated;
// without it the handle orbits the ring and falls into each slot in turn. Character tokens rotate
// only their avatar and pass 0.
export default function TokenRotateHandle({ onRotateStart, width, height, counterRotate = 0 }) {
  const { t } = useTranslation();
  const { equatorX } = tokenRingGeometry(width, height, true);
  return (
    <div className="token-rotate-anchor" style={{ transform: `rotate(${-counterRotate}deg)` }}>
      <div
        className="token-rotate-toggle"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${equatorX}px), calc(-50% + ${EQUATOR_STACK_STEP * 2}px))`,
        }}
        onMouseDown={onRotateStart}
        title={t('scenes.rotateToken')}
      >
        <RotateRightIcon style={{ fontSize: 14 }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Swap the CSS**

W `warhammer-battle-helper-front/src/style.css` **usuń** blok z linii 10982-11002 — komentarz `/* Rotate chrome — sits above the token's north edge... */`, regułę `.token-rotate-handle { ... }` oraz `.token-rotate-handle:active { cursor: grabbing; }` — i wstaw w to miejsce:

```css
/* Rotate chrome — the right-equator action column, two steps below the kill toggle and the eye.
   Shared by character tokens and token-layer images. Styled after .token-gear so the whole column
   reads as one set of buttons; the old .token-rotate-handle wore the resize handles' look, which
   belonged to its old position above the token. The anchor cancels the host container's rotation
   (see the comment in TokenRotateHandle) and carries the z-index for the pair — it must stay
   pointer-events:none, or its invisible inset:0 box would cover the token and swallow drags. */
.token-rotate-anchor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}
.token-rotate-toggle {
  position: absolute;
  width: 22px; height: 22px; padding: 0; border-radius: 50%;
  border: 1px solid #c9975b; background: rgba(20, 12, 4, 0.75); color: #f0d8b0;
  display: flex; align-items: center; justify-content: center;
  cursor: grab; pointer-events: auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.token-rotate-toggle:hover { background: #7a5c42; color: #fff; }
.token-rotate-toggle:active { cursor: grabbing; }
```

- [ ] **Step 3: Verify the old class is gone everywhere**

```bash
cd warhammer-battle-helper-front
grep -rn "token-rotate-handle" src/
```

Expected: **zero wyników**. Jeśli coś wyjdzie, usuń to zanim pójdziesz dalej.

- [ ] **Step 4: Wire MapCharacterToken**

W `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx` zamień wywołanie (linia 326):

```jsx
          <TokenRotateHandle
            onRotateStart={handleRotateStart}
            width={size.w * CELL_SIZE}
            height={size.h * CELL_SIZE}
            counterRotate={0}
          />
```

Te same wyrażenia wymiarów lecą już do `TokenOverlay` w liniach 318-319 — token postaci trzyma rozmiar w komórkach, więc mnożenie przez `CELL_SIZE` jest konieczne. `counterRotate={0}`, bo obraca się tu wyłącznie `.map-char-token__avatar` (linia 298), nie kontener.

- [ ] **Step 5: Wire SceneImage**

W `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` zamień wywołanie (linia 547):

```jsx
              <TokenRotateHandle
                onRotateStart={handleRotateStart}
                width={size.width}
                height={size.height}
                counterRotate={rotation}
              />
```

`size` (linia 29) jest już w pikselach — bez mnożenia. `rotation` (linia 32) to kąt kontenera `.scene-image` (linia 456), więc uchwyt musi go odkręcić. Uchwyt zostaje **rodzeństwem** `.scene-image__upright`, nie wchodzi do środka — własna kotwica załatwia kontr-obrót, a wciskanie go do overlaya stanów sklejałoby dwie niezależne rzeczy.

- [ ] **Step 6: Lint and run the suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: bez nowych porażek (baseline `App.test.js` nadal czerwony).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx \
        warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneImage.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "fix: BUG-194 move the token rotate handle to the equator action column"
```

---

## Task 3: Smoke test uchwytu (odstępstwo od specu — do skreślenia w całości, jeśli niechciane)

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.test.jsx`

**Interfaces:**
- Consumes: `TokenRotateHandle` z Taska 2 oraz `EQUATOR_STACK_STEP` z Taska 1.
- Produces: nic.

- [ ] **Step 1: Write the test**

Utwórz `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import TokenRotateHandle from './TokenRotateHandle';
import { tokenRingGeometry, EQUATOR_STACK_STEP } from '../../utils/tokenRingGeometry';

// Mock zamiast `import '../../i18n'` — ten komponent używa `t` wyłącznie na atrybucie `title`,
// więc realne tłumaczenia niczego tu nie weryfikują. To ta sama decyzja co w bliźniaczym
// TokenRingChrome.test.jsx:6.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

// jsdom nie liczy layoutu, ale transformaty inline zostają zwykłymi stringami w style.transform —
// czytamy je wprost, bez stubowania czegokolwiek. Pokrywa dokładnie to, co zepsuło BUG-194:
// pozycję uchwytu względem pierścienia i jego zachowanie na obróconym kontenerze.
// Helper skopiowany z TokenRingChrome.test.jsx:22-24 — zwraca [x, y] z translate(calc(...)).
const readTranslate = (el) => [...el.style.transform.matchAll(/calc\(-50% \+ (-?[\d.eE+-]+)px\)/g)]
  .map((m) => parseFloat(m[1]));

const renderHandle = (props) => render(
  <TokenRotateHandle onRotateStart={() => {}} {...props} />
).container;

test('the handle rides the equator, scaling its x with the token size', () => {
  const small = renderHandle({ width: 50, height: 50 });
  const large = renderHandle({ width: 150, height: 150 });

  const [smallX] = readTranslate(small.querySelector('.token-rotate-toggle'));
  const [largeX] = readTranslate(large.querySelector('.token-rotate-toggle'));

  expect(smallX).toBe(tokenRingGeometry(50, 50, true).equatorX);
  expect(largeX).toBe(tokenRingGeometry(150, 150, true).equatorX);
  expect(largeX).toBeGreaterThan(smallX);
});

test('the handle sits two stack steps below the kill toggle, at any token size', () => {
  const small = renderHandle({ width: 50, height: 50 });
  const large = renderHandle({ width: 150, height: 150 });

  const [, smallY] = readTranslate(small.querySelector('.token-rotate-toggle'));
  const [, largeY] = readTranslate(large.querySelector('.token-rotate-toggle'));

  // halfLong nie wchodzi do offsetu Y — pozycja w kolumnie jest ta sama dla każdego rozmiaru.
  expect(smallY).toBe(EQUATOR_STACK_STEP * 2);
  expect(largeY).toBe(smallY);
});

test('the anchor undoes the host container rotation', () => {
  const container = renderHandle({ width: 50, height: 50, counterRotate: 90 });
  expect(container.querySelector('.token-rotate-anchor').style.transform).toBe('rotate(-90deg)');
});

test('a host that does not rotate its container gets no counter-rotation', () => {
  const container = renderHandle({ width: 50, height: 50 });
  expect(container.querySelector('.token-rotate-anchor').style.transform).toBe('rotate(0deg)');
});
```

- [ ] **Step 2: Run it**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=TokenRotateHandle
```

Expected: PASS, 4 testy. (Jeśli którykolwiek padnie na `style.transform` — sprawdź, czy Task 2 Step 1 został wgrany w całości; to jedyne źródło tych transformat.)

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.test.jsx
git commit -m "test: BUG-194 pin the rotate handle position and counter-rotation"
```

---

## Task 4: Weryfikacja ręczna w przeglądarce

**Files:** żadne — to bramka, nie zmiana.

Uruchom aplikację (patrz `docs/architecture.md` / docker-compose) i przejdź listę. Każdy punkt to osobny scenariusz ze specu; żaden nie jest pokryty testem automatycznym, bo wszystkie zależą od realnego layoutu.

- [ ] **1.** Token postaci 1x1 z pełnym pierścieniem 8 slotów, zaznaczony — ikona rotacji nie dotyka żadnego slotu ani czaszki/oka.
- [ ] **2.** Ten sam token przeskalowany do 3x3 — ikona nadal w kolumnie, odstępy zachowane, nie odjechała od tokenu proporcjonalnie.
- [ ] **3.** Token-obrazek obrócony o 90°, potem 180° — ikona **zostaje** na godzinie 3 pod okiem, nie orbituje. To był drugi, ukryty wariant buga.
- [ ] **4.** Token bez żadnej konfiguracji overlaya (brak `tokenDisplay` i `tokenView`) — ikona widoczna i chwytna, mimo że nie ma nad nią czaszki ani oka.
- [ ] **5.** Gracz (nie-GM) na swoim tokenie — ikona na tej samej wysokości co u GM-a (pozycja stała, nie upakowana).
- [ ] **6.** Slot równikowy na godzinie 3 najechany myszą (rozepchnięty chip ze stepperem) — chip nie sięga ikony rotacji.
- [ ] **7.** Przeciągnięcie za ikonę faktycznie obraca token i commituje kąt (sprawdź u drugiego klienta przez WS).
- [ ] **8.** Kliknięcie ikony bez ruchu myszą **nie** zaznacza/odznacza tokenu — guard `consumeJustFinished` w `useTokenRotate` działa jak wcześniej.
- [ ] **9.** Obrazek na warstwie **tła** (uzbrojona warstwa obrazków) — uchwyt rotacji nadal na górze, wyjeżdża na hover. Bez zmian, zgodnie ze specem.
- [ ] **10.** Przeciągnięcie myszą po pustym obszarze tuż obok tokenu nadal startuje marquee — kotwica `inset: 0` nie przechwytuje zdarzeń (`pointer-events: none`).
