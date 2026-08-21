# FEATURE-100 — Przełączanie trybów mapy środkowym przyciskiem myszy — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kliknięcie środkowym przyciskiem myszy nad sceną przełącza tryb mapy na następny w kolejności paska narzędzi, z zawijaniem po ostatnim.

**Architecture:** Jedna tablica `SCENE_MODES` w nowym czystym module `sceneModes.js` jest źródłem prawdy zarówno dla przycisków paska (`DrawingToolbar` renderuje je przez `.map()`), jak i dla cyklu (`nextMode`). `SceneViewport` dostaje gałąź `e.button === 1` w istniejącym handlerze `onMouseDownCapture` i pokazuje pływającą etykietę z nazwą trybu przy kursorze przez portal do `document.body`.

**Tech Stack:** React 18, `@mui/icons-material`, `react-i18next`, `@testing-library/react`, `react-scripts test` (Jest).

**Spec:** `docs/superpowers/specs/2026-08-21-FEATURE-100-mode-cycle-design.md`

## Global Constraints

- Wszystkie ścieżki poniżej są względem `warhammer-battle-helper-front/`, chyba że napisano inaczej. Komendy uruchamiaj z tego katalogu.
- Ikony wyłącznie z `@mui/icons-material`. Nigdy inline SVG.
- Żadnych stringów w JSX — wyłącznie `t('klucz')`. Klucze angielskie.
- Zadanie **nie dodaje żadnych kluczy i18n**. Używane klucze już istnieją w `src/locales/en/translation.json` i `src/locales/pl/translation.json`: `scenes.panLayer`, `scenes.selectLayer`, `scenes.measureLayer`, `scenes.fogLayer`, `scenes.drawingLayer`.
- Kolejność trybów, jedna dla GM i gracza: `null`, `select`, `measure`, `fog`, `drawing`. `select` i `fog` tylko dla GM.
- Nieużywany kod, CSS i importy kasujemy w tej samej zmianie, nie zostawiamy z komentarzem.
- Znana, akceptowana porażka bazowa zestawu testów: `src/App.test.js` wywala się na błędzie ESM z `axios`. To nie jest regresja — nie naprawiaj i nie licz jako błąd.
- Komendy testowe zawsze z `CI=true` i `--watchAll=false`, inaczej Jest wejdzie w tryb obserwowania i zawiesi sesję.

---

### Task 1: Moduł `sceneModes.js` — źródło prawdy i logika cyklu

**Files:**
- Create: `src/components/scene/sceneModes.js`
- Test: `src/components/scene/sceneModes.test.js`

**Interfaces:**
- Consumes: nic (pierwsze zadanie)
- Produces:
  - `SCENE_MODES: Array<{ value: string|null, Icon: React.ComponentType, labelKey: string, gmOnly?: boolean }>`
  - `modesForRole(isGM: boolean) => SCENE_MODES[]`
  - `cycleNext(list: SCENE_MODES[], current: string|null) => string|null`
  - `nextMode(current: string|null, isGM: boolean) => string|null`
  - `modeLabelKey(value: string|null) => string`
  - `isModeCycleClick(e: {button:number, buttons:number}, activeElement: Element|null) => boolean`

- [ ] **Step 1: Write the failing test**

Utwórz `src/components/scene/sceneModes.test.js`:

```js
import {
  SCENE_MODES,
  modesForRole,
  cycleNext,
  nextMode,
  modeLabelKey,
  isModeCycleClick,
} from './sceneModes';

describe('modesForRole', () => {
  it('gives the GM every mode in toolbar order', () => {
    expect(modesForRole(true).map(m => m.value))
      .toEqual([null, 'select', 'measure', 'fog', 'drawing']);
  });

  it('hides GM-only modes from players', () => {
    expect(modesForRole(false).map(m => m.value))
      .toEqual([null, 'measure', 'drawing']);
  });

  it('derives the GM list from SCENE_MODES rather than a hardcoded copy', () => {
    expect(modesForRole(true)).toHaveLength(SCENE_MODES.length);
  });
});

describe('cycleNext', () => {
  // Fabricated list: proof the cycle does not know how many modes exist.
  // Adding an entry to SCENE_MODES must not require touching this logic.
  const fake = [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }];

  it('advances one position', () => {
    expect(cycleNext(fake, 'b')).toBe('c');
  });

  it('wraps past the last entry', () => {
    expect(cycleNext(fake, 'd')).toBe('a');
  });

  it('falls back to the first entry for an unknown current value', () => {
    expect(cycleNext(fake, 'zzz')).toBe('a');
  });
});

describe('nextMode', () => {
  it('walks the full GM cycle and wraps', () => {
    expect(nextMode(null, true)).toBe('select');
    expect(nextMode('select', true)).toBe('measure');
    expect(nextMode('measure', true)).toBe('fog');
    expect(nextMode('fog', true)).toBe('drawing');
    expect(nextMode('drawing', true)).toBe(null);
  });

  it('walks the full player cycle and wraps', () => {
    expect(nextMode(null, false)).toBe('measure');
    expect(nextMode('measure', false)).toBe('drawing');
    expect(nextMode('drawing', false)).toBe(null);
  });

  it('resets a player stranded in a GM-only mode', () => {
    expect(nextMode('fog', false)).toBe(null);
  });
});

describe('modeLabelKey', () => {
  it('maps a mode value to its i18n key', () => {
    expect(modeLabelKey(null)).toBe('scenes.panLayer');
    expect(modeLabelKey('fog')).toBe('scenes.fogLayer');
  });
});

describe('isModeCycleClick', () => {
  it('accepts a lone middle-button press', () => {
    expect(isModeCycleClick({ button: 1, buttons: 4 }, null)).toBe(true);
  });

  it('still accepts it when an extra side button is held', () => {
    // buttons = middle (4) | back (8). Side buttons mean no map operation is
    // in progress, so the shortcut must keep working.
    expect(isModeCycleClick({ button: 1, buttons: 12 }, null)).toBe(true);
  });

  it('rejects a middle press while the left button is held', () => {
    // Every in-progress map operation (token drag, drawing stroke, rotate)
    // holds the left button, so this is the whole "operation in flight" guard.
    expect(isModeCycleClick({ button: 1, buttons: 5 }, null)).toBe(false);
  });

  it('rejects a middle press while the right button is held', () => {
    expect(isModeCycleClick({ button: 1, buttons: 6 }, null)).toBe(false);
  });

  it('rejects the left button', () => {
    expect(isModeCycleClick({ button: 0, buttons: 1 }, null)).toBe(false);
  });

  it('rejects the right button', () => {
    expect(isModeCycleClick({ button: 2, buttons: 2 }, null)).toBe(false);
  });

  it('rejects it while a text field has focus', () => {
    expect(isModeCycleClick({ button: 1, buttons: 4 }, { tagName: 'INPUT' })).toBe(false);
    expect(isModeCycleClick({ button: 1, buttons: 4 }, { tagName: 'TEXTAREA' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern="sceneModes" --watchAll=false
```

Expected: FAIL — `Cannot find module './sceneModes' from 'src/components/scene/sceneModes.test.js'`

- [ ] **Step 3: Write minimal implementation**

Utwórz `src/components/scene/sceneModes.js`:

```js
import PanToolIcon from '@mui/icons-material/PanTool';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import StraightenIcon from '@mui/icons-material/Straighten';
import CloudIcon from '@mui/icons-material/Cloud';
import EditIcon from '@mui/icons-material/Edit';

// Single source of truth for scene modes (`editingLayer`). Both the toolbar
// buttons and the middle-click cycle read this list, so adding a mode here is
// the only change a new mode needs — the button appears and the cycle picks it
// up with no other edits.
export const SCENE_MODES = [
  { value: null,      Icon: PanToolIcon,      labelKey: 'scenes.panLayer'                   },
  { value: 'select',  Icon: HighlightAltIcon, labelKey: 'scenes.selectLayer',  gmOnly: true },
  { value: 'measure', Icon: StraightenIcon,   labelKey: 'scenes.measureLayer'               },
  { value: 'fog',     Icon: CloudIcon,        labelKey: 'scenes.fogLayer',     gmOnly: true },
  { value: 'drawing', Icon: EditIcon,         labelKey: 'scenes.drawingLayer'               },
];

export const modesForRole = (isGM) => SCENE_MODES.filter(m => isGM || !m.gmOnly);

// Split out of nextMode so it can be tested against a fabricated list — proof
// that the cycle does not depend on how many modes exist.
// findIndex returns -1 for a value missing from the list, and (-1 + 1) % len
// lands on 0, which resets to the first mode instead of getting stuck.
export const cycleNext = (list, current) => {
  const i = list.findIndex(m => m.value === current);
  return list[(i + 1) % list.length].value;
};

export const nextMode = (current, isGM) => cycleNext(modesForRole(isGM), current);

export const modeLabelKey = (value) =>
  SCENE_MODES.find(m => m.value === value)?.labelKey || 'scenes.panLayer';

// Guard for the middle-click shortcut. `buttons` is a bitmask of every button
// currently held: left 1, right 2, middle 4, back 8, forward 16. Masking with 3
// rejects a middle click made while left or right is down — i.e. mid token
// drag, mid drawing stroke, mid rotate — without any shared state between
// components, because every map operation holds the left button.
// Do not narrow this to `buttons !== 4`: that also rejects a user holding a
// gaming-mouse side button, which is harmless.
export const isModeCycleClick = (e, activeElement) => {
  if (e.button !== 1) return false;
  if (e.buttons & 3) return false;
  return !/^(INPUT|TEXTAREA)$/.test(activeElement?.tagName || '');
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern="sceneModes" --watchAll=false
```

Expected: PASS — 17 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/sceneModes.js \
        warhammer-battle-helper-front/src/components/scene/sceneModes.test.js
git commit -m "feat(front): FEATURE-100 add sceneModes single source of truth"
```

---

### Task 2: `DrawingToolbar` renderuje przyciski trybu z listy

**Files:**
- Modify: `src/components/scene/DrawingToolbar.jsx:1-26` (importy), `:86-142` (blok zakładek), `:76-78` (`handleToggle`)
- Modify: `src/components/scene/DrawingToolbar.css:25-28`, `:68-69`, `:76-115`
- Test: `src/components/scene/DrawingToolbar.smoke.test.jsx`

**Interfaces:**
- Consumes: `modesForRole` z Task 1
- Produces: pasek, w którym liczba i kolejność przycisków trybu wynika z `modesForRole(isGM)`. Semantyka kliknięcia: `onEditingLayerChange(editingLayer === value ? null : value)`.

- [ ] **Step 1: Write the failing test**

Zastąp cały blok `describe` w `src/components/scene/DrawingToolbar.smoke.test.jsx` (zostaw importy i `baseProps` bez zmian):

```jsx
describe('DrawingToolbar mode tabs', () => {
  it('no longer renders the Images (grid) tab', () => {
    render(<DrawingToolbar {...baseProps} />);
    expect(screen.queryByText('Image layers')).toBeNull();
  });

  // Counts come from modesForRole, never from a literal — so adding an entry to
  // SCENE_MODES cannot silently fail to reach the toolbar.
  it('renders one tab per mode available to a GM', () => {
    const { container } = render(<DrawingToolbar {...baseProps} />);
    expect(container.querySelectorAll('.drawing-toolbar__tab'))
      .toHaveLength(modesForRole(true).length);
  });

  it('renders one tab per mode available to a player', () => {
    const { container } = render(<DrawingToolbar {...baseProps} isGM={false} />);
    expect(container.querySelectorAll('.drawing-toolbar__tab'))
      .toHaveLength(modesForRole(false).length);
  });

  it('renders GM tab tooltips in toolbar order', () => {
    const { container } = render(<DrawingToolbar {...baseProps} />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tab .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).toEqual(['Pan', 'Select tokens', 'Measure distance', 'Fog of War', 'Drawing']);
  });

  it('hides GM-only modes from players', () => {
    const { container } = render(<DrawingToolbar {...baseProps} isGM={false} />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tab .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).not.toContain('Select tokens');
    expect(labels).not.toContain('Fog of War');
  });

  it('drops the legacy player toggle class', () => {
    const { container } = render(<DrawingToolbar {...baseProps} isGM={false} />);
    expect(container.querySelector('.drawing-toolbar__toggle')).toBeNull();
  });

  it('clicking the active tab returns to pan', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="fog"
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual([null]);
  });

  it('clicking an inactive tab selects it', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer={null}
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual(['fog']);
  });
});
```

Dopisz do importów na górze pliku:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { modesForRole } from './sceneModes';
```

(pierwsza linia zastępuje istniejący import z `@testing-library/react` — dochodzi `fireEvent`)

Zanim uruchomisz: sprawdź, że angielskie etykiety w teście zgadzają się z plikiem tłumaczeń, i popraw test, jeśli któraś się różni:

```bash
cd warhammer-battle-helper-front
grep -E '"(panLayer|selectLayer|measureLayer|fogLayer|drawingLayer)"' src/locales/en/translation.json
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern="DrawingToolbar" --watchAll=false
```

Expected: FAIL — testy liczące zakładki gracza wykazują 2 zamiast 3, test kolejności GM zwraca listę bez `Pan`, test `drops the legacy player toggle class` znajduje `.drawing-toolbar__toggle`.

- [ ] **Step 3: Write minimal implementation**

W `src/components/scene/DrawingToolbar.jsx`:

**3a.** Usuń cztery importy ikon, które przenoszą się do `sceneModes.js` — `EditIcon`, `CloudIcon`, `StraightenIcon`, `HighlightAltIcon`. **`PanToolIcon` zostaje**, bo używa go narzędzie `pan` w tablicy `TOOLS`.

**3b.** Dodaj import listy:

```jsx
import { modesForRole } from './sceneModes';
```

**3c.** Usuń funkcję `handleToggle` (linie 76-78) — po ujednoliceniu jest jedna ścieżka kliknięcia dla obu ról:

```jsx
  const handleToggle = () => {
    onEditingLayerChange(isActive ? null : 'drawing');
  };
```

**3d.** Zastąp cały blok `{isGM ? ( ... ) : ( ... )}` z zakładkami (linie 86-142 — od komentarza `{/* Toggle / Tabs */}` do wiersza `)}` zamykającego to wyrażenie, tuż przed komentarzem `{/* Measure-tool options */}`) przez:

```jsx
      {/* Mode tabs — rendered from sceneModes so the toolbar and the middle-click
          cycle can never disagree about which modes exist or in what order. */}
      <div className="drawing-toolbar__tabs">
        {modesForRole(isGM).map(({ value, Icon, labelKey }) => (
          <button
            key={value ?? 'pan'}
            className={`drawing-toolbar__tab ${editingLayer === value ? 'drawing-toolbar__tab--active' : ''}`}
            onClick={() => onEditingLayerChange(editingLayer === value ? null : value)}
          >
            <Icon style={{ fontSize: 22 }} />
            <span className="drawing-toolbar__tooltip">{t(labelKey)}</span>
          </button>
        ))}
      </div>
```

Zmienna `isActive` zostaje bez zmian — dalej steruje rozwiniętym panelem narzędzi.

W `src/components/scene/DrawingToolbar.css`:

**3e.** Usuń nieaktualny komentarz w linii 25:

```css
/* ── Przycisk toggle (okrągły ołówek) ── */
```

**3f.** W selektorze zaczynającym się w linii 27 usuń wiersz `.drawing-toolbar__toggle,`, zostawiając:

```css
.drawing-toolbar__tab,
.drawing-toolbar__tool,
.drawing-toolbar__action {
  position: relative;
  overflow: visible;
}
```

**3g.** W selektorze hovera (linie 68-71) usuń wiersz `.drawing-toolbar__toggle:hover .drawing-toolbar__tooltip,`, zostawiając:

```css
.drawing-toolbar__tab:hover .drawing-toolbar__tooltip,
.drawing-toolbar__tool:hover .drawing-toolbar__tooltip,
.drawing-toolbar__action:hover .drawing-toolbar__tooltip {
  visibility: visible;
  opacity: 1;
}
```

**3h.** Usuń w całości cztery bloki `.drawing-toolbar__toggle`, `.drawing-toolbar__toggle:hover`, `.drawing-toolbar__toggle--on`, `.drawing-toolbar__toggle--on:hover` (linie 76-115).

**3i.** Sprawdź, że po tym w repo nie został ani jeden `__toggle`:

```bash
cd warhammer-battle-helper-front
grep -rn "drawing-toolbar__toggle" src/ || echo "clean"
```

Oczekiwane: `clean`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern="DrawingToolbar|sceneModes" --watchAll=false
```

Expected: PASS — oba pliki testowe zielone.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingToolbar.css \
        warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx
git commit -m "refactor(front): FEATURE-100 render toolbar mode tabs from sceneModes"
```

---

### Task 3: Komponent `ModeSwitchLabel`

**Files:**
- Create: `src/components/scene/ModeSwitchLabel.jsx`
- Create: `src/components/scene/ModeSwitchLabel.css`

**Interfaces:**
- Consumes: nic z poprzednich zadań
- Produces: `<ModeSwitchLabel x={number} y={number} labelKey={string} onDone={() => void} />`. Renderuje się portalem do `document.body`, znika sam po animacji i woła wtedy `onDone`.

Bez testu renderującego: komponenty sceny nie mają w tym projekcie testów renderujących, a tu nie ma logiki do przetestowania — cała mechanika zaniku siedzi w CSS. Weryfikacja ręczna w Task 5.

- [ ] **Step 1: Write the component**

Utwórz `src/components/scene/ModeSwitchLabel.jsx`:

```jsx
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './ModeSwitchLabel.css';

// Floating mode name shown at the cursor after a middle-click mode switch.
// Portalled to document.body with position:fixed on purpose — it must keep a
// constant on-screen size, and anything rendered inside .scene-viewport__content
// sits under transform:scale(zoom), which would shrink the text at low zoom and
// blow it up at high zoom (that is why PointerPing is sized in map units).
// Removal is driven by onAnimationEnd, same pattern as PointerPing.
const ModeSwitchLabel = ({ x, y, labelKey, onDone }) => {
  const { t } = useTranslation();

  return createPortal(
    <div
      className="mode-switch-label"
      style={{ left: x, top: y }}
      onAnimationEnd={onDone}
    >
      {t(labelKey)}
    </div>,
    document.body
  );
};

export default ModeSwitchLabel;
```

- [ ] **Step 2: Write the stylesheet**

Utwórz `src/components/scene/ModeSwitchLabel.css`:

```css
/* Mode switch feedback — ephemeral label at the cursor. Fixed positioning: the
   coordinates are raw clientX/clientY, unaffected by scene pan and zoom. */
@keyframes mode-switch-label {
  0%   { opacity: 0; transform: translate(-50%, -60%)  scale(0.92); }
  12%  { opacity: 1; transform: translate(-50%, -125%) scale(1); }
  65%  { opacity: 1; transform: translate(-50%, -140%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -175%) scale(1); }
}

.mode-switch-label {
  position: fixed;
  z-index: 3000;
  pointer-events: none;
  padding: 5px 12px;
  border-radius: 4px;
  background: linear-gradient(135deg, #fff9f0 0%, #f4e8d8 100%);
  border: 1px solid #c9975b;
  color: #3a2f1f;
  font-family: 'Cinzel', serif;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(107, 68, 35, 0.35);
  animation: mode-switch-label 800ms ease-out forwards;
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd warhammer-battle-helper-front
npx react-scripts build 2>&1 | tail -20
```

Expected: `Compiled with warnings.` albo `Compiled successfully.` — liczy się brak błędów.

**Nie dodawaj tu `CI=true`.** Przy `CI=true` react-scripts traktuje ostrzeżenia ESLint jak błędy, a repozytorium ma zastane ostrzeżenie `react-hooks/exhaustive-deps` w `src/components/tabs/handouts/HandoutViewerModal.jsx` — plik niezwiązany z tym zadaniem. `CI=true` przy **testach** jest nadal wymagane; tam oznacza tylko tryb nieinteraktywny.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/ModeSwitchLabel.jsx \
        warhammer-battle-helper-front/src/components/scene/ModeSwitchLabel.css
git commit -m "feat(front): FEATURE-100 add ModeSwitchLabel cursor feedback"
```

---

### Task 4: Środkowy klik w `SceneViewport` + przekazanie propsa

**Files:**
- Modify: `src/components/scene/SceneViewport.jsx` — importy (linie 1-20), lista propsów (linie 32-45), refy przy `handleViewportMouseDown` (linie 263-292), render (okolice linii 663-680)
- Modify: `src/components/DndContext.jsx:1115` — dodanie propsa do `<SceneViewport>`

**Interfaces:**
- Consumes: `nextMode`, `modeLabelKey`, `isModeCycleClick` z Task 1; `<ModeSwitchLabel>` z Task 3
- Produces: nic dla dalszych zadań

- [ ] **Step 1: Add imports and state**

W `src/components/scene/SceneViewport.jsx` dopisz do importów:

```jsx
import ModeSwitchLabel from './ModeSwitchLabel';
import { nextMode, modeLabelKey, isModeCycleClick } from './sceneModes';
```

Do listy propsów komponentu (obok istniejącego `editingLayer`) dodaj `onEditingLayerChange`:

```jsx
  scene, isGM, gameId, editingLayer, onEditingLayerChange, imageEditLayer = 'background', gridWidth, gridHeight, children,
```

Obok istniejącego `const [isMeasuring, setIsMeasuring] = useState(false);` dodaj stan etykiety:

```jsx
  // Mode-switch feedback. seq forces a remount so two clicks in a row restart
  // the animation instead of continuing the first one.
  const [switchLabel, setSwitchLabel] = useState(null);
  const labelSeqRef = useRef(0);
```

- [ ] **Step 2: Add refs for the new props**

Obok istniejących `editingLayerRef` / `activeToolRef` (linie 263-266) dopisz dwa refy, żeby `handleViewportMouseDown` mógł zostać przy `useCallback([], ...)` — tak jak reszta tego handlera:

```jsx
  const isGMRef = useRef(isGM);
  useEffect(() => { isGMRef.current = isGM; }, [isGM]);
  const onEditingLayerChangeRef = useRef(onEditingLayerChange);
  useEffect(() => { onEditingLayerChangeRef.current = onEditingLayerChange; }, [onEditingLayerChange]);
```

- [ ] **Step 3: Add the middle-click branch**

W `handleViewportMouseDown` wstaw nowy blok **jako pierwszy w ciele funkcji**, przed `if (schemeRef.current !== 'modern') return;`. Kolejność jest istotna: ta wcześniejsza instrukcja odcina schemat „Klasyczne", a skrót ma działać w obu schematach.

```jsx
  const handleViewportMouseDown = useCallback((e) => {
    // Middle click cycles scene modes. Must run before the control-scheme check
    // below — the shortcut works in both 'modern' and 'classic'.
    if (isModeCycleClick(e, document.activeElement)) {
      e.preventDefault(); // kills the native autoscroll on Chrome/Firefox (Windows/Linux)
      const target = nextMode(editingLayerRef.current, isGMRef.current);
      onEditingLayerChangeRef.current?.(target);
      setSwitchLabel({
        x: e.clientX,
        y: e.clientY,
        labelKey: modeLabelKey(target),
        seq: ++labelSeqRef.current,
      });
      return;
    }

    // Left button — modern-scheme pan on the grid layer only (existing behaviour).
    // Right button no longer pans; it opens the native context menu on scene images.
    if (schemeRef.current !== 'modern') return;
```

Reszta funkcji zostaje bez zmian.

- [ ] **Step 4: Render the label**

Bezpośrednio po zamykającym `</div>` elementu `.scene-viewport` (ten, który ma `onMouseDownCapture={handleViewportMouseDown}`, otwarcie w okolicy linii 662) dopisz:

```jsx
        {switchLabel && (
          <ModeSwitchLabel
            key={switchLabel.seq}
            x={switchLabel.x}
            y={switchLabel.y}
            labelKey={switchLabel.labelKey}
            onDone={() => setSwitchLabel(null)}
          />
        )}
```

Miejsce w drzewie JSX nie wpływa na pozycję na ekranie — komponent i tak renderuje się portalem do `document.body`.

- [ ] **Step 5: Pass the prop down from DndContext**

W `src/components/DndContext.jsx`, w wywołaniu `<SceneViewport ... />` (linia 1115) dopisz `onEditingLayerChange={onEditingLayerChange}` zaraz za `editingLayer={editingLayer}`. Props `onEditingLayerChange` jest już przyjmowany przez `DragAndDropContext` (linia 38) — brakuje tylko przekazania go niżej.

Sprawdź, że trafił na miejsce:

```bash
cd warhammer-battle-helper-front
grep -o "editingLayer={editingLayer} onEditingLayerChange={onEditingLayerChange}" src/components/DndContext.jsx
```

Oczekiwane: jedno trafienie.

- [ ] **Step 6: Verify the build compiles**

```bash
cd warhammer-battle-helper-front
npx react-scripts build 2>&1 | tail -20
```

Expected: `Compiled with warnings.` albo `Compiled successfully.` — liczy się brak błędów. Nie dodawaj `CI=true` (patrz uwaga w Task 3).

- [ ] **Step 7: Run the scene test files**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --testPathPattern="scene" --watchAll=false
```

Expected: PASS — `sceneModes`, `DrawingToolbar.smoke`, `LayerSelector.smoke`, `useTokenRotate` zielone.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx \
        warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "feat(front): FEATURE-100 cycle scene modes on middle click"
```

---

### Task 5: Weryfikacja pełnego zestawu testów i sprawdzenie ręczne

**Files:** brak zmian w kodzie, chyba że coś wyjdzie

- [ ] **Step 1: Run the whole frontend suite**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false 2>&1 | tail -30
```

Expected: wszystko zielone **poza** `src/App.test.js`, który wywala się na błędzie ESM z `axios`. To znana porażka bazowa, nie regresja tego zadania. Każda **inna** porażka jest regresją i trzeba ją naprawić przed dalszym krokiem.

- [ ] **Step 2: Manual check — GM**

Odpal aplikację, wejdź do gry jako GM, otwórz scenę. Przejdź pełny cykl środkowym przyciskiem i potwierdź każdy punkt:

1. Pięć kliknięć wraca do punktu wyjścia, kolejność: Przesuń → Zaznacz żetony → Pomiar odległości → Mgła Wojny → Rysowanie → Przesuń
2. Podświetlona zakładka na pasku zgadza się z etykietą, która wyskoczyła przy kursorze
3. Etykieta znika sama po chwili i nie łapie kliknięć
4. Dwa szybkie kliknięcia pod rząd: animacja startuje od nowa, napis nie zostaje w połowie zaniku
5. Etykieta ma ten sam rozmiar przy zoomie 25% i 200%
6. Środkowy klik nad żetonem przełącza tryb i **nie** zaznacza ani nie przesuwa żetonu
7. Zacznij przeciągać żeton lewym przyciskiem, w trakcie kliknij środkowym: tryb się **nie** zmienia, żeton dojeżdża normalnie
8. W trybie rysowania zacznij kreskę i w trakcie kliknij środkowym: tryb się **nie** zmienia, kreska kończy się normalnie
9. Przełącz sterowanie na „Klasyczne" w ustawieniach: skrót działa tak samo

- [ ] **Step 3: Manual check — player**

Dołącz jako gracz (druga przeglądarka albo tryb incognito):

1. Pasek pokazuje trzy przyciski w kolejności: Przesuń, Pomiar odległości, Rysowanie
2. Trzy kliknięcia środkowym wracają do punktu wyjścia
3. Gracz nigdy nie trafia do trybu `select` ani `fog`

- [ ] **Step 4: Commit any fixes**

Jeśli kroki 1-3 nic nie wykazały, nie ma czego commitować — zadanie kończy się tutaj.

---

## Poza zakresem tego planu

- Cykl po narzędziach wewnątrz trybu rysowania i mgły
- Cykl wstecz (Shift+środkowy klik)
- `LayerSelector` (`imageEditLayer`) — bez zmian
- Zapamiętywanie ostatniego trybu między sesjami
- Sprawdzenie blokady natywnego autoscroll na Windows/Linux — nie da się tego zweryfikować na macOS, osobny punkt w specyfikacji
- Naprawa `.map-ruler-badge`, który skaluje się z zoomem zamiast trzymać stały rozmiar tekstu — istniejący błąd, osobny ticket
