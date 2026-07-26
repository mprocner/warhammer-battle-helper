# FEATURE-143 Rotation Angle Snap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Podczas obrotu obrazka sceny kąt magnetycznie łapie do wielokrotności 45°, gdy kursor jest w ±10° od takiego kąta; poza strefą obrót płynny.

**Architecture:** Czysty helper `snapAngle` w osobnym module `utils/angleSnap.js` (testowalny jednostkowo), zaimportowany w `SceneImage.jsx` i wpięty w istniejące handlery `onMove`/`onUp` obrotu. Brak zmian backendu/WS — `rotation` to nadal dowolny `number`.

**Tech Stack:** React, Jest (react-scripts test).

## Global Constraints

- Frontend katalog: `warhammer-battle-helper-front/`
- Testy: `CI=true npx react-scripts test <ścieżka> --watchAll=false`
- Brak zmian backendu, WS, zapisu API
- Snap krok = 45°, próg = 10°

---

### Task 1: Helper `snapAngle` + testy jednostkowe

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/angleSnap.js`
- Test: `warhammer-battle-helper-front/src/utils/angleSnap.test.js`

**Interfaces:**
- Consumes: nic
- Produces: `export const SNAP_STEP = 45`, `export const SNAP_THRESHOLD = 10`, `export function snapAngle(angle, step = SNAP_STEP, threshold = SNAP_THRESHOLD): number`

- [ ] **Step 1: Write the failing test**

`warhammer-battle-helper-front/src/utils/angleSnap.test.js`:

```js
import { snapAngle, SNAP_STEP, SNAP_THRESHOLD } from './angleSnap';

describe('snapAngle', () => {
  test('constants', () => {
    expect(SNAP_STEP).toBe(45);
    expect(SNAP_THRESHOLD).toBe(10);
  });

  test('snaps when within threshold of a 45 multiple', () => {
    expect(snapAngle(43)).toBe(45);
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(55)).toBe(45);   // |55-45|=10, inclusive
    expect(snapAngle(88)).toBe(90);
  });

  test('leaves angle free when outside threshold', () => {
    expect(snapAngle(30)).toBe(30);   // |30-45|=15, |30-0|=30
    expect(snapAngle(58)).toBe(58);   // |58-45|=13
  });

  test('works for negatives and >360', () => {
    expect(snapAngle(-43)).toBe(-45);
    expect(snapAngle(370)).toBe(360);
  });

  test('respects custom step/threshold', () => {
    expect(snapAngle(88, 90, 5)).toBe(90);
    expect(snapAngle(80, 90, 5)).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/utils/angleSnap.test.js --watchAll=false`
Expected: FAIL — `Cannot find module './angleSnap'`

- [ ] **Step 3: Write minimal implementation**

`warhammer-battle-helper-front/src/utils/angleSnap.js`:

```js
export const SNAP_STEP = 45;
export const SNAP_THRESHOLD = 10;

/**
 * Magnetyczny snap kąta obrotu.
 * Jeśli `angle` jest w granicach `threshold` od najbliższej wielokrotności
 * `step`, zwraca tę wielokrotność; w przeciwnym razie zwraca `angle` bez zmian.
 */
export function snapAngle(angle, step = SNAP_STEP, threshold = SNAP_THRESHOLD) {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= threshold ? nearest : angle;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/utils/angleSnap.test.js --watchAll=false`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/angleSnap.js warhammer-battle-helper-front/src/utils/angleSnap.test.js
git commit -m "feat(scene): snapAngle helper for 45deg rotation snap (FEATURE-143)"
```

---

### Task 2: Wpięcie `snapAngle` w obrót obrazka

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` (import u góry; `useEffect` obrotu ~265-290)

**Interfaces:**
- Consumes: `snapAngle` z Task 1
- Produces: nic (zmiana wewnętrzna komponentu)

- [ ] **Step 1: Add import**

Na górze `SceneImage.jsx`, obok innych importów utils, dodaj:

```js
import { snapAngle } from '../../utils/angleSnap';
```

- [ ] **Step 2: Snap w `onMove` (live)**

W `useEffect` obrotu, zamień `onMove`:

```js
    const onMove = (e) => {
      const { centerX, centerY, startAngle, startRotation } = rotateStartRef.current;
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      const raw = startRotation + (currentAngle - startAngle);
      setRotation(snapAngle(raw));
    };
```

- [ ] **Step 3: Snap w `onUp` (zapis)**

Zamień `onUp`:

```js
    const onUp = (e) => {
      const { centerX, centerY, startAngle, startRotation } = rotateStartRef.current;
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      const finalRotation = snapAngle(startRotation + (currentAngle - startAngle));
      setRotation(finalRotation);
      justFinishedRotatingRef.current = true;
      setIsRotating(false);
      saveRotation(finalRotation);
    };
```

- [ ] **Step 4: Verify build / lint**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/utils/angleSnap.test.js --watchAll=false`
Expected: PASS (regresja helpera). Manualnie: obrót obrazka sceny — blisko 0/45/90 skacze na żywo, poza strefą płynnie.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImage.jsx
git commit -m "feat(scene): magnetic 45deg snap on image rotation (FEATURE-143)"
```

---

## Self-Review

- **Spec coverage:** helper osobny + testy (Task 1), live snap + zapis (Task 2), próg 10/krok 45 (stałe), negatywne/>360 (testy). ✓
- **Placeholder scan:** brak. ✓
- **Type consistency:** `snapAngle` sygnatura identyczna w obu taskach. ✓
