# FEATURE-121 — Tekst w trybie rysowania zostaje na mapie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tekst wpisany w polu narzędzia `text` (tryb rysowania) trafia na mapę także wtedy, gdy użytkownik kliknie gdzie indziej na mapie — dziś w tej jednej ścieżce przepada bez śladu.

**Architecture:** Reguła „kiedy zapisać, kiedy porzucić" wyprowadzona ze `SceneViewport.jsx` (924 linie) do dedykowanego hooka `useDrawingTextInput`. Hook trzyma pozycję i treść pola, a jego `placeAt` sam pilnuje, że klik w mapę przy otwartym polu commituje i zamyka zamiast otwierać nowe. `SceneViewport` tylko renderuje input i dokleja styl ścieżki (kolor, rozmiar). `DrawingLayer` bez zmian.

**Tech Stack:** React 19, `@testing-library/react` 16 (`renderHook`), `react-scripts` 5.0.1 (Jest 27).

Spec: `docs/superpowers/specs/2026-08-24-FEATURE-121-drawing-text-persist-design.md`

## Global Constraints

- Frontend: `warhammer-battle-helper-front/`. Backend nietykany — narzędzie `text` już istnieje w schemacie `drawingPath`.
- Bez nowych kluczy i18n. Bez nowych zależności npm.
- Nazwy plików i eksportów jak w istniejącym precedensie w tym katalogu: `useTokenRotate.js` eksportuje **nazwany** `export function useTokenRotate(...)`. Ten hook robi tak samo: `export function useDrawingTextInput(...)`.
- Komentarze w kodzie po angielsku — tak jak w `DrawingLayer.jsx` i `useTokenRotate.js`.
- „Puste pole" wszędzie znaczy `value.trim() === ''`.
- Testy odpalać z `CI=true`, inaczej `react-scripts test` wchodzi w tryb watch i wisi.
- Stan bazowy repo: `src/App.test.js` wywala się na ESM axiosa. To **nie** jest regresja tej zmiany — nie naprawiać, nie panikować.

## Setup (raz, przed Task 1)

Worktree nie ma `node_modules` — jest tylko w głównym checkoucie. `package.json` nie zmieniamy, więc symlink wystarczy:

```bash
ln -s /Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-front/node_modules \
      /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121/warhammer-battle-helper-front/node_modules
```

Sprawdzenie, że działa:

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121/warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern=useTokenRotate
```

Oczekiwane: `Tests: N passed`. Symlinka **nie** commitujemy (`node_modules` jest w `.gitignore`).

---

### Task 1: Hook `useDrawingTextInput`

Cała reguła FEATURE-121 w jednym pliku, z testami. Po tym tasku hook działa i jest przetestowany, ale nikt go jeszcze nie używa — `SceneViewport` dalej ma stary, zepsuty kod. To celowe: recenzent może ocenić samą regułę, zanim zobaczy integrację.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.js`
- Test: `warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.test.jsx`

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces:
  ```
  export function useDrawingTextInput({ onCommit }): {
    pos: [number, number] | null,
    value: string,
    setValue: (next: string) => void,
    placeAt: (coords: [number, number]) => void,
    commit: () => void,
    cancel: () => void,
  }
  ```
  `onCommit` jest wołane jako `onCommit({ coords, text })`, gdzie `coords` to pozycja, w której pole **zostało otwarte** (nie ta z kliknięcia zamykającego), a `text` jest już strimowany i niepusty.

Tabela zachowań, którą realizuje hook:

| Wejście | Pole zamknięte | Pole otwarte, puste | Pole otwarte, z tekstem |
|---|---|---|---|
| `placeAt(coords)` | otwórz w `coords` | zamknij | commit + zamknij |
| `commit()` | no-op | zamknij | commit + zamknij |
| `cancel()` | no-op | zamknij | zamknij, nic nie zapisuje |

**Uwaga do implementacji — dlaczego refy.** `pos` i `value` muszą być stanem, bo sterują renderowanym inputem. Ale `placeAt` i `commit` czytają je przez `useRef`. Gdyby czytały ze stanu przez domknięcie, dostałyby wartość z renderu, w którym callback powstał — a to jest dokładnie rodzaj buga, który tu naprawiamy. Refy są aktualizowane w tej samej funkcji co `setState`, nigdy osobno.

- [ ] **Step 1: Write the failing test**

Utwórz `warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.test.jsx`:

```jsx
import { renderHook, act } from '@testing-library/react';
import { useDrawingTextInput } from './useDrawingTextInput';

// useTokenRotate.test.jsx uses a Harness component because that hook needs a real
// element and a bounding box. This one is pure state, so renderHook is enough.
describe('useDrawingTextInput', () => {
  const setup = () => {
    const onCommit = jest.fn();
    const view = renderHook(() => useDrawingTextInput({ onCommit }));
    return { onCommit, view };
  };

  const place = (view, coords) => act(() => view.result.current.placeAt(coords));
  const type = (view, text) => act(() => view.result.current.setValue(text));

  it('opens the field at the clicked coordinates', () => {
    const { view } = setup();
    place(view, [10, 20]);
    expect(view.result.current.pos).toEqual([10, 20]);
    expect(view.result.current.value).toBe('');
  });

  it('saves the typed text at its original coordinates and closes when the map is clicked elsewhere', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    place(view, [200, 300]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ coords: [10, 20], text: 'Ambush' });
    expect(view.result.current.pos).toBeNull();
  });

  it('closes an empty field without saving when the map is clicked elsewhere', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    place(view, [200, 300]);
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('discards the typed text on cancel', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    act(() => view.result.current.cancel());
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('trims the saved text and treats whitespace as empty', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, '  Ambush  ');
    act(() => view.result.current.commit());
    expect(onCommit).toHaveBeenCalledWith({ coords: [10, 20], text: 'Ambush' });

    onCommit.mockClear();
    place(view, [30, 40]);
    type(view, '   ');
    act(() => view.result.current.commit());
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('saves once when a late blur follows the map click', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    place(view, [200, 300]);
    act(() => view.result.current.commit());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121/warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern=useDrawingTextInput
```

Oczekiwane: FAIL, `Cannot find module './useDrawingTextInput' from 'src/components/scene/useDrawingTextInput.test.jsx'`.

- [ ] **Step 3: Write minimal implementation**

Utwórz `warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.js`:

```js
import { useCallback, useRef, useState } from 'react';

/**
 * Owns the in-progress text label of the drawing `text` tool: where it sits and what the
 * user has typed so far. The rule it enforces is FEATURE-121 — anything typed reaches the
 * map, and only Escape throws it away.
 *
 * Why this can't live on the input's onBlur alone: DrawingLayer.handleMouseDown calls
 * e.preventDefault(), which suppresses the focus change, so clicking the canvas never
 * blurs the input and onBlur never fires. placeAt therefore commits by itself.
 */
export function useDrawingTextInput({ onCommit }) {
  // State drives the rendered input; the refs mirror it so the callbacks below read the
  // live values instead of whatever the render that created them closed over.
  const [pos, setPos] = useState(null);
  const [value, setValueState] = useState('');
  const posRef = useRef(null);
  const valueRef = useRef('');

  const close = useCallback(() => {
    posRef.current = null;
    valueRef.current = '';
    setPos(null);
    setValueState('');
  }, []);

  const setValue = useCallback((next) => {
    valueRef.current = next;
    setValueState(next);
  }, []);

  const commit = useCallback(() => {
    const coords = posRef.current;
    const text = valueRef.current.trim();
    // Close first: a blur that arrives after the input is gone then finds pos === null and
    // cannot save the same label a second time.
    close();
    if (coords && text) onCommit?.({ coords, text });
  }, [close, onCommit]);

  const placeAt = useCallback((coords) => {
    // An open field wins over placing a new one. Clicking elsewhere on the map saves what
    // is there and closes; the next click opens a fresh field. Reopening here instead would
    // start a chain the user can only break by switching tools.
    if (posRef.current) {
      commit();
      return;
    }
    posRef.current = coords;
    valueRef.current = '';
    setPos(coords);
    setValueState('');
  }, [commit]);

  return { pos, value, setValue, placeAt, commit, cancel: close };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121/warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern=useDrawingTextInput
```

Oczekiwane: `Tests: 6 passed, 6 total`.

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121
git add warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.js
git add warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.test.jsx
git commit -m "feat(front): FEATURE-121 add useDrawingTextInput hook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Podpięcie hooka w `SceneViewport`

Wymiana zepsutej logiki na hooka z Taska 1. Po tym tasku bug jest naprawiony i widoczny w aplikacji.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx`

**Interfaces:**
- Consumes: `useDrawingTextInput({ onCommit })` z Taska 1 — pełna sygnatura w bloku Interfaces tamtego taska.
- Produces: nic dla dalszych tasków (ostatni task).

`DrawingLayer.jsx` **nie jest modyfikowany**. `e.preventDefault()` w jego `handleMouseDown` zostaje: po tej zmianie jest nieszkodliwy, bo `placeAt` commituje samodzielnie, a linijka niesie komentarz o macOS ctrl-click i kolejności `contextmenu`/`mousedown`, którego nie chcemy ruszać przy okazji.

Lokalna zmienna w `SceneViewport` nazywa się `textInput` (nie `text` — `text` myliłoby się z treścią etykiety).

- [ ] **Step 1: Add the import**

W `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx`, w bloku importów na górze pliku, po linii z `ModeSwitchLabel` dodaj:

```js
import { useDrawingTextInput } from './useDrawingTextInput';
```

- [ ] **Step 2: Delete the old state**

Znajdź (ok. linii 69-72):

```js
  const panStartRef = useRef(null);
  const [textInputPos, setTextInputPos] = useState(null);
  const [textInputValue, setTextInputValue] = useState('');
  const viewportRef = useRef(null);
```

Zamień na:

```js
  const panStartRef = useRef(null);
  const viewportRef = useRef(null);
```

- [ ] **Step 3: Replace the handlers with the hook**

Znajdź (ok. linii 550-570):

```js
  const isDrawingMode = editingLayer === 'drawing';

  const handleTextPlacement = useCallback((coords) => {
    setTextInputPos(coords);
    setTextInputValue('');
  }, []);

  const commitText = useCallback((value) => {
    if (value.trim() && textInputPos && onDrawingPathComplete) {
      onDrawingPathComplete({
        tool: 'text',
        points: [textInputPos],
        brushSize,
        color: drawingColor,
        fontSize: drawingFontSize,
        text: value.trim(),
      });
    }
    setTextInputPos(null);
    setTextInputValue('');
  }, [textInputPos, brushSize, drawingColor, drawingFontSize, onDrawingPathComplete]);
```

Zamień na:

```js
  const isDrawingMode = editingLayer === 'drawing';

  // The hook owns when a label is saved or dropped; the styling of the resulting path is
  // this component's business, so it stays here.
  const handleTextCommit = useCallback(({ coords, text }) => {
    onDrawingPathComplete?.({
      tool: 'text',
      points: [coords],
      brushSize,
      color: drawingColor,
      fontSize: drawingFontSize,
      text,
    });
  }, [brushSize, drawingColor, drawingFontSize, onDrawingPathComplete]);

  const textInput = useDrawingTextInput({ onCommit: handleTextCommit });
```

- [ ] **Step 4: Repoint the DrawingLayer prop**

Znajdź (ok. linii 840, w propsach `<DrawingLayer ... />`):

```jsx
                    onTextPlacement={handleTextPlacement}
```

Zamień na:

```jsx
                    onTextPlacement={textInput.placeAt}
```

- [ ] **Step 5: Rewire the rendered input**

Znajdź (ok. linii 870-884):

```jsx
                {textInputPos && (
                  <input
                    autoFocus
                    type="text"
                    value={textInputValue}
                    onChange={e => setTextInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitText(textInputValue);
                      if (e.key === 'Escape') { setTextInputPos(null); setTextInputValue(''); }
                    }}
                    onBlur={() => commitText(textInputValue)}
                    style={{
                      position: 'absolute',
                      left: textInputPos[0],
                      top: textInputPos[1],
```

Zamień na:

```jsx
                {textInput.pos && (
                  <input
                    autoFocus
                    type="text"
                    value={textInput.value}
                    onChange={e => textInput.setValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') textInput.commit();
                      if (e.key === 'Escape') textInput.cancel();
                    }}
                    onBlur={textInput.commit}
                    style={{
                      position: 'absolute',
                      left: textInput.pos[0],
                      top: textInput.pos[1],
```

Reszta bloku `style` (`zIndex`, `background`, `color`, `border`, `fontSize`, `fontFamily`, `padding`, `outline`, `minWidth`) oraz zamykające `/>` i `)}` zostają bez zmian.

- [ ] **Step 6: Verify nothing references the removed state**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121/warhammer-battle-helper-front
grep -n "textInputPos\|textInputValue\|handleTextPlacement\|commitText" src/components/scene/SceneViewport.jsx
```

Oczekiwane: brak wyników (grep kończy się kodem 1). Jakikolwiek trafiony wiersz znaczy, że któryś krok został pominięty.

- [ ] **Step 7: Run the frontend suite**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121/warhammer-battle-helper-front
CI=true npx react-scripts test
```

Oczekiwane: wszystko przechodzi **poza** `src/App.test.js`, który wywala się na ESM axiosa. To jest stan bazowy repo sprzed tej zmiany, nie regresja. Każda inna czerwona suite = regresja do naprawienia przed commitem.

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-121
git add warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx
git commit -m "fix(front): FEATURE-121 drawing text stays on the map on outside click

Clicking elsewhere on the map with a filled text field now saves the label
instead of dropping it. DrawingLayer.handleMouseDown calls preventDefault,
which suppresses the focus change, so the input's onBlur never fired on that
path and the typed text was silently discarded.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Weryfikacja ręczna (po Task 2)

Docker stack, tryb rysowania, narzędzie tekst:

1. Klik w mapę → wpisz `Ambush` → klik w mapę 200px dalej → **etykieta `Ambush` zostaje** w pierwszym miejscu, pole zamknięte, nowe pole **się nie otwiera**.
2. Klik w mapę → nic nie wpisuj → klik gdzie indziej → pole znika, mapa czysta.
3. Klik → wpisz `Trap` → **Escape** → nic nie zostaje na mapie.
4. Klik → wpisz `Trap` → **Enter** → etykieta zostaje.
5. Klik → wpisz `Trap` → klik w `DrawingToolbar` (np. zmiana koloru) → etykieta zostaje. To ścieżka przez `onBlur`, która działała już przed zmianą — pilnujemy, że nadal działa i że etykieta zapisuje się **raz**, nie dwa razy.
