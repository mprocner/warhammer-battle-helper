# Samouczki zakładek — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Osiem samouczków zakładek prawego panelu, uruchamianych przyciskiem `?` przy nagłówku zakładki, w PL i EN — oraz refaktor, po którym silnik samouczków przestaje znać nazwy konkretnych kroków.

**Architecture:** Treść przenosi się z jednej tablicy do rejestru `tours/<id>.js`. Silnik dostaje `stepResolution.js`, który wybiera pierwszy istniejący selektor z listy i buduje z tego klucz tłumaczenia — więc warunki („pusto czy pełno", „MG czy gracz") stoją na DOM i roli, nie na danych aplikacji. `TutorialContext` przenosi wyłącznie identyfikator samouczka do uruchomienia z przycisku w zakładce do `GameTour` w `GameSession`.

**Tech Stack:** React 19, `react-joyride@3.2.0` (już zainstalowany), `react-i18next`, Jest + React Testing Library (CRA), MUI Icons.

**Spec:** `docs/superpowers/specs/2026-09-10-tab-tutorials-design.md`
**Poprzednik:** FEATURE-134 na tej samej gałęzi — silnik samouczka ekranu gry, który tu refaktoryzujemy.

## Global Constraints

- Wszystkie prace we `warhammer-battle-helper-front/`. Ścieżki poniżej są względne do tego katalogu.
- Testy: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>`. Gołe `npx jest` **nie działa** — konfiguracją zarządza CRA.
- Znany baseline fail: `App.test.js` (axios ESM). To **nie** jest regresja, nie naprawiaj. Wszystko inne ma być zielone.
- Zero stringów wpisanych wprost w JSX. Każdy tekst przez `t('klucz')`, klucz **angielski**, tłumaczenie równolegle w `src/locales/en/translation.json` **i** `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`. Żadnych inline SVG.
- Nigdy MUI `<Tooltip>`. Podpowiedź na przycisku przez atrybut `title`.
- Test kompletności tłumaczeń **musi** czytać przez `i18n.getResource(lng, 'translation', key)`. `src/i18n.js` ma `fallbackLng: 'en'`, więc `t()` i `getFixedT()` na brakującym kluczu PL zwracają **angielski tekst** i luka jest niewidoczna.
- jsdom nie ma layoutu: `getBoundingClientRect` zwraca zera, `document.elementFromPoint` nie istnieje. Nic nowego nie może od nich zależeć.
- **W liście selektorów kotwicy pusty stan idzie PIERWSZY.** W `HandoutsTab.jsx:540` pusty stan zastępuje listę, ale w `NotesTab.jsx:288`, `FilesTab.jsx:689` i `ScenesTab.jsx:311` jest **zagnieżdżony w niej** — czyli lista istnieje zawsze i przy odwrotnej kolejności wariant pustego stanu nigdy by się nie odpalił.
- Nie zostawiaj martwego kodu: import, który przestał być używany, usuwasz w tym samym commicie.

---

### Task 1: `stepResolution` — wybór kotwicy i budowa klucza

Serce refaktoru. Dziś `bodyKeyFor` (`src/components/tutorial/tourSteps.js:34`) rozgałęzia się na `if (step.id === 'sceneControls')` i `if (step.id === 'drawingToolbar')` — silnik zna nazwy kroków. Ten moduł zastępuje to deklaracją w kroku.

**Files:**
- Create: `src/components/tutorial/engine/stepResolution.js`
- Create: `src/components/tutorial/engine/stepResolution.test.js`

**Interfaces:**
- Produces:
  - `resolveTarget(step, queryTarget): { selector: string, index: number } | null` — pierwszy istniejący selektor z `step.target` (string albo tablica); `null` gdy żaden nie istnieje.
  - `titleKeyFor(step, tourId): string`
  - `bodyKeyFor(step, tourId, ctx): string` gdzie `ctx = { targetIndex, role, controlScheme }`
  - `VARIANT_AXES` — mapa nazwa osi → funkcja `(ctx) => string`
  - Używają ich zadania 2 i 8.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/components/tutorial/engine/stepResolution.test.js`:

```js
import { resolveTarget, titleKeyFor, bodyKeyFor } from './stepResolution';

const present = (...selectors) => (sel) => (selectors.includes(sel) ? {} : null);

describe('resolveTarget', () => {
  it('accepts a plain string target', () => {
    const step = { id: 'a', target: '.one' };
    expect(resolveTarget(step, present('.one'))).toEqual({ selector: '.one', index: 0 });
  });

  it('takes the first selector that exists, not merely the first listed', () => {
    const step = { id: 'a', target: ['.empty', '.list'] };
    expect(resolveTarget(step, present('.list'))).toEqual({ selector: '.list', index: 1 });
  });

  it('prefers the earlier selector when both exist, so a nested empty state wins over its list', () => {
    const step = { id: 'a', target: ['.empty', '.list'] };
    expect(resolveTarget(step, present('.empty', '.list'))).toEqual({ selector: '.empty', index: 0 });
  });

  it('returns null when nothing is on screen', () => {
    const step = { id: 'a', target: ['.empty', '.list'] };
    expect(resolveTarget(step, present())).toBeNull();
  });
});

describe('key building', () => {
  const ctx = { targetIndex: 1, role: 'gm', controlScheme: 'classic' };

  it('derives the title from the tour and step id', () => {
    expect(titleKeyFor({ id: 'fileList' }, 'files')).toBe('tutorial.files.fileList.title');
  });

  it('leaves the body key plain when the step declares no variants', () => {
    expect(bodyKeyFor({ id: 'upload' }, 'files', ctx)).toBe('tutorial.files.upload.body');
  });

  it('appends the matched target index for byTarget', () => {
    expect(bodyKeyFor({ id: 'fileList', variants: ['byTarget'] }, 'files', ctx))
      .toBe('tutorial.files.fileList.body.1');
  });

  it('appends the role for byRole', () => {
    expect(bodyKeyFor({ id: 'list', variants: ['byRole'] }, 'notes', ctx))
      .toBe('tutorial.notes.list.body.gm');
  });

  it('appends the control scheme for byScheme', () => {
    expect(bodyKeyFor({ id: 'sceneControls', variants: ['byScheme'] }, 'gameScreen', ctx))
      .toBe('tutorial.gameScreen.sceneControls.body.classic');
  });

  it('treats any scheme that is not classic as modern', () => {
    const step = { id: 'sceneControls', variants: ['byScheme'] };
    expect(bodyKeyFor(step, 'gameScreen', { ...ctx, controlScheme: 'modern' }))
      .toBe('tutorial.gameScreen.sceneControls.body.modern');
    expect(bodyKeyFor(step, 'gameScreen', { ...ctx, controlScheme: undefined }))
      .toBe('tutorial.gameScreen.sceneControls.body.modern');
  });

  it('appends several axes in the order the step declared them', () => {
    const step = { id: 'list', variants: ['byTarget', 'byRole'] };
    expect(bodyKeyFor(step, 'handouts', ctx)).toBe('tutorial.handouts.list.body.1.gm');
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=stepResolution`
Expected: FAIL — `Cannot find module './stepResolution'`

- [ ] **Step 3: Napisz moduł**

Utwórz `src/components/tutorial/engine/stepResolution.js`:

```js
// Silnik nie zna nazw kroków. Krok deklaruje, po czym wariantuje, a tutaj
// zamieniamy tę deklarację na przyrostek klucza tłumaczenia.
export const VARIANT_AXES = {
  // Który selektor z listy kotwic trafił — tak odróżniamy pusty stan od pełnego,
  // pytając DOM zamiast danych aplikacji.
  byTarget: (ctx) => String(ctx.targetIndex),
  byRole: (ctx) => ctx.role,
  byScheme: (ctx) => (ctx.controlScheme === 'classic' ? 'classic' : 'modern'),
};

export const resolveTarget = (step, queryTarget) => {
  const targets = Array.isArray(step.target) ? step.target : [step.target];
  for (let index = 0; index < targets.length; index += 1) {
    if (queryTarget(targets[index])) return { selector: targets[index], index };
  }
  return null;
};

export const titleKeyFor = (step, tourId) => `tutorial.${tourId}.${step.id}.title`;

export const bodyKeyFor = (step, tourId, ctx) => {
  const base = `tutorial.${tourId}.${step.id}.body`;
  const suffixes = (step.variants || []).map(axis => VARIANT_AXES[axis](ctx));
  return [base, ...suffixes].join('.');
};
```

- [ ] **Step 4: Uruchom test, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=stepResolution`
Expected: PASS, 11 testów

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/engine/stepResolution.js src/components/tutorial/engine/stepResolution.test.js
git commit -m "feat: step resolution for the tutorial engine"
```

---

### Task 2: Rejestr samouczków i przeniesienie silnika

Przenosimy istniejące pliki do `engine/`, tworzymy rejestr, a dotychczasowy samouczek ekranu gry staje się jego pierwszym wpisem. Klucze tłumaczeń migrują z `tutorial.steps.*` na `tutorial.gameScreen.*`.

**Files:**
- Create: `src/components/tutorial/tours/index.js`
- Create: `src/components/tutorial/tours/gameScreen.js`
- Create: `src/components/tutorial/tours/index.test.js`
- Move: `useGameTour.js`, `GameTour.jsx`, `TourTooltip.jsx`, `GameTour.css` oraz ich testy → `src/components/tutorial/engine/`
- Move: `TabsLegend.jsx` + test → `src/components/tutorial/tours/`
- Delete: `src/components/tutorial/tourSteps.js`, `src/components/tutorial/tourSteps.test.js`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (przemianowanie gałęzi)
- Modify: `src/components/tutorial/tourTranslations.test.js`
- Modify: `src/components/GameSession.jsx` (ścieżka importu `GameTour`)

**Interfaces:**
- Consumes: `resolveTarget`, `titleKeyFor`, `bodyKeyFor` z Task 1.
- Produces:
  - `tours/index.js`: `getTour(id): { id, steps } | null`, `TOUR_IDS: string[]`
  - `tours/gameScreen.js`: default export `{ id: 'gameScreen', steps }`, gdzie krok to `{ id, target, roles?, placement, reveal?, variants? }`
  - `useGameTour({ tourId, role, panels, onReveal, queryTarget?, screenReady?, autoStart?, persist? })` → `{ steps, stepIndex, running, start, goTo, finish }`; każdy element `steps` niesie dodatkowo `targetIndex: number` i `resolvedTarget: string`.
  - Używają ich zadania 3, 5, 6, 7, 8.

- [ ] **Step 1: Napisz test rejestru, który ma nie przejść**

Utwórz `src/components/tutorial/tours/index.test.js`:

```js
import { getTour, TOUR_IDS } from './index';

describe('tour registry', () => {
  it('serves the game screen tour', () => {
    const tour = getTour('gameScreen');
    expect(tour).not.toBeNull();
    expect(tour.id).toBe('gameScreen');
    expect(tour.steps.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown id instead of throwing', () => {
    expect(getTour('nope')).toBeNull();
  });

  it('gives every registered tour a non-empty step list and an id matching its key', () => {
    TOUR_IDS.forEach(id => {
      const tour = getTour(id);
      expect(tour.id).toBe(id);
      expect(Array.isArray(tour.steps)).toBe(true);
      expect(tour.steps.length).toBeGreaterThan(0);
    });
  });

  it('gives every step an id and a target', () => {
    TOUR_IDS.forEach(id => {
      getTour(id).steps.forEach(step => {
        expect(typeof step.id).toBe('string');
        expect(step.target).toBeDefined();
      });
    });
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tours`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Przenieś pliki silnika**

```bash
cd warhammer-battle-helper-front/src/components/tutorial
mkdir -p engine tours
git mv useGameTour.js useGameTour.test.js GameTour.jsx GameTour.smoke.test.jsx TourTooltip.jsx TourTooltip.test.jsx GameTour.css engine/
git mv TabsLegend.jsx TabsLegend.test.jsx tours/
```

Popraw ścieżki importów w przeniesionych plikach: w `engine/*` importy do `../../` stają się `../../../`, a `TourTooltip` importuje `./GameTour.css` bez zmian. `engine/GameTour.jsx` importuje `TabsLegend` jako `../tours/TabsLegend`. `tours/TabsLegend.jsx` importuje `tabsForRole` z `../../panels/tabDefinitions`.

- [ ] **Step 4: Utwórz definicję samouczka ekranu gry**

Utwórz `src/components/tutorial/tours/gameScreen.js`, przenosząc tablicę z kasowanego `tourSteps.js` i zamieniając rozgałęzienia na deklaracje `variants`:

```js
// Kotwice to istniejące, unikalne klasy CSS ekranu gry — nie dokładamy atrybutów
// data-* do markupu. Krok bez kotwicy wypada z samouczka, nie wysypuje ekranu.
const BOTH = ['gm', 'player'];

export default {
  id: 'gameScreen',
  steps: [
    { id: 'characterCard', target: '.sidebar-top-section', roles: BOTH, placement: 'right', reveal: 'left' },
    { id: 'characterList', target: '.sidebar-bottom-section', roles: BOTH, placement: 'right', reveal: 'left' },
    { id: 'sceneSelector', target: '.scene-selector', roles: ['gm'], placement: 'bottom', reveal: 'top' },
    { id: 'windowBar', target: '.window-bar', roles: BOTH, placement: 'bottom', reveal: 'top' },
    { id: 'sceneControls', target: '.scene-viewport', roles: BOTH, placement: 'center', variants: ['byScheme'] },
    { id: 'layerSelector', target: '.layer-selector', roles: ['gm'], placement: 'left' },
    { id: 'drawingToolbar', target: '.drawing-toolbar', roles: BOTH, placement: 'left', variants: ['byRole'] },
    { id: 'onlineUsers', target: '.right-panel__online-users', roles: BOTH, placement: 'bottom' },
    { id: 'tabsNav', target: '.right-panel__tabs-nav', roles: BOTH, placement: 'left', reveal: 'right' },
    { id: 'diceControls', target: '.dice-controls', roles: BOTH, placement: 'left', reveal: 'right' },
  ],
};
```

- [ ] **Step 5: Utwórz rejestr**

Utwórz `src/components/tutorial/tours/index.js`:

```js
import gameScreen from './gameScreen';

// Jedno miejsce, w którym silnik dowiaduje się o istnieniu samouczka.
// Dodanie kolejnego to jeden import i jeden wpis — zero zmian w engine/.
const TOURS = {
  gameScreen,
};

export const TOUR_IDS = Object.keys(TOURS);

export const getTour = (id) => TOURS[id] || null;
```

- [ ] **Step 6: Przepnij hook na rejestr**

W `src/components/tutorial/engine/useGameTour.js` zamień import z `./tourSteps` na:

```js
import { getTour } from '../tours';
import { resolveTarget } from './stepResolution';
```

Sygnatura przyjmuje `tourId`, `autoStart` i `persist`; zachowaj `role`, `panels`, `onReveal`, `queryTarget`, `screenReady` bez zmian w znaczeniu:

```js
export function useGameTour({
  tourId,
  role,
  panels = {},
  onReveal,
  queryTarget = defaultQueryTarget,
  screenReady = true,
  autoStart = true,
  persist = true,
}) {
```

Zastąp ciało `start()` wersją korzystającą z rejestru i `resolveTarget`. Krok trafia na listę tylko wtedy, gdy jego rola pasuje **i** któraś kotwica istnieje; zapamiętujemy, która:

```js
  const start = useCallback(() => {
    if (!tourId) return false;
    const tour = getTour(tourId);
    if (!tour) return false;

    const live = [];
    tour.steps.forEach(step => {
      if (step.roles && !step.roles.includes(role)) return;
      const hit = resolveTarget(step, queryTarget);
      if (!hit) return;
      live.push({ ...step, resolvedTarget: hit.selector, targetIndex: hit.index });
    });

    if (live.length === 0) return false;
    setSteps(live);
    goToIn(0, live);
    return true;
  }, [tourId, role, queryTarget, goToIn]);
```

Zapis stanu obwarowany `persist`, auto-start dodatkowo `autoStart`:

```js
  const finish = useCallback(() => {
    setStepIndex(null);
    setPending(null);
    if (persist && role) writeSeen(role);
  }, [persist, role]);
```

```js
  useEffect(() => {
    if (!autoStart || !role || !screenReady || autoStarted.current) return;
    if (persist && readSeen(role)) {
      autoStarted.current = true;
      return;
    }
    if (start()) autoStarted.current = true;
  }, [autoStart, persist, role, screenReady, start]);
```

Reszta pliku — brama `pending`/`isRevealSatisfied`, obsługa wyjątków `localStorage`, `goTo` — zostaje bez zmian. `isRevealSatisfied` importuj z nowej lokalizacji: przenieś tę funkcję i `REVEAL_SATISFIED` z kasowanego `tourSteps.js` do `engine/stepResolution.js` i wyeksportuj `isRevealSatisfied` (samo `REVEAL_SATISFIED` zostaw nieeksportowane).

- [ ] **Step 7: Przepnij `GameTour` na nowe klucze**

W `src/components/tutorial/engine/GameTour.jsx` zamień import kluczy:

```js
import { titleKeyFor, bodyKeyFor } from './stepResolution';
```

Komponent przyjmuje `tourId` i przekazuje go dalej; budowa kroków korzysta z zapamiętanego indeksu kotwicy:

```js
  const { steps, stepIndex, running, start, goTo, finish } = useGameTour({
    tourId, role, panels, onReveal, screenReady, autoStart, persist,
  });
```

```js
  const joyrideSteps = useMemo(
    () => steps.map(step => ({
      target: step.resolvedTarget,
      placement: step.placement,
      title: t(titleKeyFor(step, tourId)),
      content: step.id === 'tabsNav'
        ? <TabsLegend isGM={role === 'gm'} />
        : <p>{t(bodyKeyFor(step, tourId, { targetIndex: step.targetIndex, role, controlScheme }))}</p>,
    })),
    [steps, tourId, role, controlScheme, t, i18n.language]
  );
```

W `src/components/GameSession.jsx` popraw import na `./tutorial/engine/GameTour` i dodaj `tourId="gameScreen"` do renderowanego elementu.

- [ ] **Step 8: Przemianuj gałąź tłumaczeń**

W obu plikach `src/locales/{en,pl}/translation.json` przemianuj `tutorial.steps` na `tutorial.gameScreen`, a wewnątrz przenieś zagnieżdżone warianty na płaskie przyrostki:

- `tutorial.gameScreen.sceneControls.body.modern` / `.classic` — bez zmian w kształcie, teksty te same.
- `tutorial.gameScreen.drawingToolbar.body.gm` / `.player` — bez zmian w kształcie, teksty te same.
- pozostałe osiem kroków: `tutorial.gameScreen.<id>.title` i `.body`.

`tutorial.tabs.*`, `tutorial.tabsIntro`, `tutorial.button`, `tutorial.next/back/skip/done/progress` zostają tam, gdzie są — to nie są klucze kroków.

- [ ] **Step 9: Przepnij test tłumaczeń na rejestr**

W `src/components/tutorial/tourTranslations.test.js` zamień import `TOUR_STEPS/titleKeyFor/bodyKeyFor` z `./tourSteps` na iterację po rejestrze:

```js
import i18n from '../../i18n';
import { getTour, TOUR_IDS } from './tours';
import { titleKeyFor, bodyKeyFor } from './engine/stepResolution';
import { TAB_DEFS } from '../panels/tabDefinitions';

const LANGS = ['en', 'pl'];
const ROLES = ['gm', 'player'];
const SCHEMES = ['modern', 'classic'];
const TARGET_INDEXES = [0, 1];

// getResource czyta bundle jednego języka bez fallbackLng, więc brak tłumaczenia
// w pl nie zostanie przykryty angielskim tekstem.
const missing = (lng, key) => {
  const value = i18n.getResource(lng, 'translation', key);
  return value === undefined || String(value).trim() === '';
};

const keysFor = (tourId, step) => {
  const keys = [titleKeyFor(step, tourId)];
  ROLES.forEach(role => SCHEMES.forEach(controlScheme => TARGET_INDEXES.forEach(targetIndex => {
    keys.push(bodyKeyFor(step, tourId, { role, controlScheme, targetIndex }));
  })));
  return keys;
};

describe('tutorial translations', () => {
  it.each(LANGS)('has every key each registered tour can request in %s', (lng) => {
    const gaps = new Set();
    TOUR_IDS.forEach(tourId => {
      getTour(tourId).steps.forEach(step => {
        // byTarget wariantuje tylko tam, gdzie krok ma tyle kotwic ile wariantów
        const targetCount = Array.isArray(step.target) ? step.target.length : 1;
        keysFor(tourId, step).forEach(key => {
          const suffix = key.split('.body.')[1];
          const firstSuffix = suffix ? suffix.split('.')[0] : null;
          const usesTarget = (step.variants || [])[0] === 'byTarget';
          if (usesTarget && firstSuffix !== null && Number(firstSuffix) >= targetCount) return;
          if (missing(lng, key)) gaps.add(key);
        });
      });
    });
    expect([...gaps]).toEqual([]);
  });

  it.each(LANGS)('describes every right-panel tab in %s', (lng) => {
    const gaps = TAB_DEFS.map(def => `tutorial.tabs.${def.id}`).filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('has the tour chrome strings in %s', (lng) => {
    const gaps = ['button', 'next', 'back', 'skip', 'done', 'progress', 'tabsIntro']
      .map(name => `tutorial.${name}`).filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('renders the progress counter with both numbers in %s', (lng) => {
    const text = i18n.getFixedT(lng)('tutorial.progress', { current: 3, total: 10 });
    expect(text).toContain('3');
    expect(text).toContain('10');
  });
});
```

- [ ] **Step 10: Usuń stary plik kroków**

```bash
git rm src/components/tutorial/tourSteps.js src/components/tutorial/tourSteps.test.js
```

Testy, które sprawdzały kolejność kroków i filtr ról, przenieś do `tours/index.test.js` jako asercje o `getTour('gameScreen')`:

```js
  it('walks the game screen left to right, ending at the right panel', () => {
    expect(getTour('gameScreen').steps.map(s => s.id)).toEqual([
      'characterCard', 'characterList', 'sceneSelector', 'windowBar', 'sceneControls',
      'layerSelector', 'drawingToolbar', 'onlineUsers', 'tabsNav', 'diceControls',
    ]);
  });

  it('puts the layer step before the tool step, matching the on-screen stacking', () => {
    const ids = getTour('gameScreen').steps.map(s => s.id);
    expect(ids.indexOf('layerSelector')).toBeLessThan(ids.indexOf('drawingToolbar'));
  });

  it('marks the GM-only steps of the game screen tour', () => {
    const gmOnly = getTour('gameScreen').steps.filter(s => s.roles && !s.roles.includes('player'));
    expect(gmOnly.map(s => s.id)).toEqual(['sceneSelector', 'layerSelector']);
  });
```

Straż przed dryfem selektorów przenieś w tej samej formie, ale iterując po `TOUR_IDS` zamiast po jednej tablicy, i uwzględniając, że `target` bywa tablicą.

- [ ] **Step 11: Uruchom cały pakiet**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS wszędzie poza baseline `App.test.js`. Testy `useGameTour`, `GameTour.smoke`, `TourTooltip`, `TabsLegend`, `tourTranslations`, `tours`, `stepResolution` zielone.

Run: `CI=true npx eslint src/components/tutorial src/components/GameSession.jsx`
Expected: brak błędów

- [ ] **Step 12: Commit**

```bash
git add -A src/components/tutorial src/components/GameSession.jsx src/locales
git commit -m "refactor: tour registry replaces the single step list"
```

---

### Task 3: Kontekst i przycisk

**Files:**
- Create: `src/components/tutorial/TutorialContext.jsx`
- Create: `src/components/tutorial/TourButton.jsx`
- Create: `src/components/tutorial/TourButton.test.jsx`
- Create: `src/components/tutorial/TourButton.css`
- Modify: `src/components/GameSession.jsx`
- Modify: `src/components/tutorial/engine/GameTour.jsx`

**Interfaces:**
- Consumes: `getTour` z Task 2.
- Produces:
  - `TutorialProvider({ children })` oraz `useTutorial(): { activeTourId, startTour(id), clearTour() }`
  - `TourButton({ tourId })` — renderuje `null` dla nieznanego `tourId`
  - Używają ich zadania 5, 6, 7.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/components/tutorial/TourButton.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TourButton from './TourButton';
import { TutorialProvider, useTutorial } from './TutorialContext';

const Probe = () => {
  const { activeTourId } = useTutorial();
  return <span data-testid="active">{activeTourId || 'none'}</span>;
};

const renderIn = (ui) => render(<TutorialProvider>{ui}<Probe /></TutorialProvider>);

describe('TourButton', () => {
  it('renders a button for a registered tour', () => {
    renderIn(<TourButton tourId="gameScreen" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders nothing for an unknown tour instead of breaking the panel', () => {
    const { container } = render(
      <TutorialProvider><TourButton tourId="nope" /></TutorialProvider>
    );
    expect(container.querySelector('.tour-button')).toBeNull();
  });

  it('publishes the tour id when clicked', () => {
    renderIn(<TourButton tourId="gameScreen" />);
    expect(screen.getByTestId('active')).toHaveTextContent('none');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('active')).toHaveTextContent('gameScreen');
  });

  it('labels itself with the translated hint, not a raw key', () => {
    renderIn(<TourButton tourId="gameScreen" />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('title')).not.toContain('tutorial.');
    expect(button.getAttribute('title')).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe(button.getAttribute('title'));
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TourButton`
Expected: FAIL — `Cannot find module './TourButton'`

- [ ] **Step 3: Napisz kontekst**

Utwórz `src/components/tutorial/TutorialContext.jsx`:

```jsx
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Kanał niesie WYŁĄCZNIE identyfikator samouczka do uruchomienia. Treść kroków
// płynie rejestrem — inaczej kontekst stałby się drugim źródłem prawdy.
const TutorialContext = createContext({ activeTourId: null, startTour: () => {}, clearTour: () => {} });

export const TutorialProvider = ({ children }) => {
  const [activeTourId, setActiveTourId] = useState(null);
  // Licznik rośnie przy każdym starcie, także tego samego samouczka — dzięki temu
  // ponowne kliknięcie tego samego przycisku uruchamia go od nowa.
  const [startCount, setStartCount] = useState(0);

  const startTour = useCallback((id) => {
    setActiveTourId(id);
    setStartCount(n => n + 1);
  }, []);

  const clearTour = useCallback(() => setActiveTourId(null), []);

  const value = useMemo(
    () => ({ activeTourId, startCount, startTour, clearTour }),
    [activeTourId, startCount, startTour, clearTour]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
};

export const useTutorial = () => useContext(TutorialContext);
```

- [ ] **Step 4: Napisz przycisk**

Utwórz `src/components/tutorial/TourButton.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { getTour } from './tours';
import { useTutorial } from './TutorialContext';
import './TourButton.css';

// Jedyny element, jaki zakładki wstawiają u siebie. Nieznane tourId nie wywala
// panelu — przycisk po prostu się nie renderuje.
const TourButton = ({ tourId }) => {
  const { t } = useTranslation();
  const { startTour } = useTutorial();

  if (!getTour(tourId)) return null;

  const label = t('tutorial.button');

  return (
    <button
      type="button"
      className="tour-button"
      onClick={() => startTour(tourId)}
      title={label}
      aria-label={label}
    >
      <HelpOutlineIcon fontSize="small" />
    </button>
  );
};

export default TourButton;
```

Utwórz `src/components/tutorial/TourButton.css`:

```css
.tour-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 2px;
  color: #7a5c42;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}

.tour-button:hover {
  color: #3a2f1f;
  border-color: #c4a882;
  background: rgba(201, 151, 91, 0.15);
}
```

- [ ] **Step 5: Zamontuj provider i połącz z `GameTour`**

W `src/components/GameSession.jsx` owiń zawartość `WindowManagerProvider` dodatkowym `TutorialProvider` (import z `./tutorial/TutorialContext`), tak by obejmował zarówno `RightPanel`, jak i `GameTour`.

W `src/components/tutorial/engine/GameTour.jsx` czytaj aktywny samouczek z kontekstu zamiast przyjmować `tourId` propem. Samouczek ekranu gry pozostaje domyślny — dopóki nikt nie kliknął przycisku zakładki, `tourId` to `'gameScreen'`, z auto-startem i zapisem:

```jsx
  const { activeTourId, startCount } = useTutorial();
  const tourId = activeTourId || 'gameScreen';
  const isDefaultTour = tourId === 'gameScreen';
```

`autoStart` i `persist` przekazuj jako `isDefaultTour`. Istniejący licznik `startSignal` (przycisk `?` przy nagłówku prawego panelu) zsumuj ze `startCount` z kontekstu, żeby oba źródła startu przechodziły tą samą ścieżką:

```jsx
  const combinedSignal = startSignal + startCount;
```

i użyj `combinedSignal` tam, gdzie dziś stoi `startSignal`.

- [ ] **Step 6: Uruchom testy**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="TourButton|tutorial"`
Expected: PASS, w tym 4 nowe testy `TourButton`

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`

- [ ] **Step 7: Commit**

```bash
git add src/components/tutorial/TutorialContext.jsx src/components/tutorial/TourButton.jsx src/components/tutorial/TourButton.test.jsx src/components/tutorial/TourButton.css src/components/tutorial/engine/GameTour.jsx src/components/GameSession.jsx
git commit -m "feat: tutorial context and the per-tab tour button"
```

---

### Task 4: Nagłówki w zakładkach `chat` i `general`

Dwie zakładki nie mają nagłówka: `LogWindow.jsx:120` zaczyna od razu od listy wiadomości, `GeneralTab.jsx:171` od pierwszej sekcji. Dokładamy je w tym samym wzorcu co pozostałe siedem, żeby przycisk samouczka miał gdzie usiąść i żeby panel wyglądał spójnie.

Przy okazji: `LogWindow.jsx:124` ma zaszyty angielski string `"The chronicle awaits..."` — łamie regułę projektu o `t()`. Naprawiamy, skoro i tak dotykamy tego pliku.

**Files:**
- Modify: `src/components/LogWindow.jsx:120-125`
- Modify: `src/components/LogWindow.css`
- Modify: `src/components/tabs/GeneralTab.jsx:171`
- Modify: `src/components/tabs/GeneralTab.css`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Produces: `.log-window__header` / `.log-window__title` oraz `.general-tab__header` / `.general-tab__title` — kotwice i miejsca na przycisk dla zadań 5 i 7.

- [ ] **Step 1: Dodaj nagłówek do `LogWindow`**

W `src/components/LogWindow.jsx` zamień otwarcie zwracanego drzewa (linia 120-121) na:

```jsx
        <div className="log-window">
            <div className="log-window__header">
                <h3 className="log-window__title">{t('rightPanel.tabs.chat')}</h3>
            </div>
            <div className="log-window__messages">
```

Jeśli plik nie ma jeszcze `useTranslation`, dodaj `import { useTranslation } from 'react-i18next';` oraz `const { t } = useTranslation();` na początku komponentu.

- [ ] **Step 2: Przetłumacz pusty stan loga**

W tym samym pliku zamień linię 124:

```jsx
                        <span className="log-window__empty-text">{t('log.emptyChronicle')}</span>
```

Dodaj klucz w obu językach:

`src/locales/en/translation.json`, w istniejącej gałęzi `log`:
```json
    "emptyChronicle": "The chronicle awaits...",
```

`src/locales/pl/translation.json`, w istniejącej gałęzi `log`:
```json
    "emptyChronicle": "Kronika czeka na pierwszy wpis...",
```

- [ ] **Step 3: Dodaj style nagłówka czatu**

W `src/components/LogWindow.css` dopisz. Padding celowo mniejszy niż w pozostałych zakładkach — log jest jedynym widokiem, gdzie liczy się każda linia pionu:

```css
.log-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid #6b4423;
}

.log-window__title {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: 0.95rem;
  color: #e8d5b7;
}
```

- [ ] **Step 4: Dodaj nagłówek do `GeneralTab`**

W `src/components/tabs/GeneralTab.jsx` zaraz po otwarciu `<div className="general-tab">` (linia 171) wstaw:

```jsx
      <div className="general-tab__header">
        <h3 className="general-tab__title">{t('rightPanel.tabs.general')}</h3>
      </div>
```

`general` **nie** dostaje przycisku samouczka — nagłówek jest wyłącznie dla spójności.

- [ ] **Step 5: Dodaj style nagłówka ustawień**

W `src/components/tabs/GeneralTab.css` dopisz:

```css
.general-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.general-tab__title {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: 1rem;
  color: #c9975b;
}
```

- [ ] **Step 6: Sprawdź**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json')); JSON.parse(require('fs').readFileSync('src/locales/pl/translation.json')); console.log('ok')"`
Expected: `ok`

Run: `CI=true npx eslint src/components/LogWindow.jsx src/components/tabs/GeneralTab.jsx`
Expected: brak błędów

- [ ] **Step 7: Commit**

```bash
git add src/components/LogWindow.jsx src/components/LogWindow.css src/components/tabs/GeneralTab.jsx src/components/tabs/GeneralTab.css src/locales
git commit -m "feat: headers for the chat and general tabs"
```

---

### Task 5: Samouczki `chat`, `notes`, `files`

Trzy pierwsze samouczki zakładek wraz z przyciskami i tłumaczeniami. Kroki o treści mają wariant dla pustego stanu.

**Files:**
- Create: `src/components/tutorial/tours/chat.js`, `notes.js`, `files.js`
- Modify: `src/components/tutorial/tours/index.js`
- Modify: `src/components/LogWindow.jsx` (przycisk w nagłówku)
- Modify: `src/components/tabs/NotesTab.jsx:251` (przycisk w nagłówku)
- Modify: `src/components/tabs/FilesTab.jsx:567` (przycisk w nagłówku)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `TourButton` z Task 3; rejestr z Task 2.
- Produces: wpisy `chat`, `notes`, `files` w `TOURS`.

- [ ] **Step 1: Napisz definicje samouczków**

Kotwice zweryfikowane w kodzie. **Pusty stan pierwszy** — w `NotesTab` i `FilesTab` pusty stan jest zagnieżdżony w kontenerze listy, więc lista istnieje zawsze.

Utwórz `src/components/tutorial/tours/chat.js`:

```js
// .log-window__list / .log-window__empty  — LogWindow.jsx:123,127
// .dice-controls__visibility-row          — log/DiceRollControls.jsx:43
// .dice-controls__my-rolls-toggle         — log/DiceRollControls.jsx:97
export default {
  id: 'chat',
  steps: [
    { id: 'log', target: ['.log-window__empty', '.log-window__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'dice', target: '.dice-controls__visibility-row', placement: 'left', variants: ['byRole'] },
    { id: 'myRolls', target: '.dice-controls__my-rolls-toggle', placement: 'left' },
  ],
};
```

Utwórz `src/components/tutorial/tours/notes.js`:

```js
// .notes-tab__empty jest ZAGNIEŻDŻONY w .notes-tab__list (NotesTab.jsx:288,298),
// więc lista istnieje zawsze — pusty stan musi być pierwszy w liście kotwic.
// .notes-tab__filter-row renderuje się dopiero przy notes.length > 0 (NotesTab.jsx:260).
export default {
  id: 'notes',
  steps: [
    { id: 'list', target: ['.notes-tab__empty', '.notes-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'add', target: '.notes-tab__add-btn', placement: 'left' },
    { id: 'filter', target: '.notes-tab__filter-row', placement: 'left' },
  ],
};
```

Utwórz `src/components/tutorial/tours/files.js`:

```js
// .files-tab__empty jest ZAGNIEŻDŻONY w .files-tab__list (FilesTab.jsx:643,689).
export default {
  id: 'files',
  steps: [
    { id: 'list', target: ['.files-tab__empty', '.files-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'createFolder', target: '.files-tab__actions', placement: 'left' },
    { id: 'breadcrumb', target: '.files-tab__breadcrumb', placement: 'left' },
  ],
};
```

- [ ] **Step 2: Zarejestruj je**

W `src/components/tutorial/tours/index.js` dodaj importy i wpisy:

```js
import gameScreen from './gameScreen';
import chat from './chat';
import notes from './notes';
import files from './files';

const TOURS = {
  gameScreen,
  chat,
  notes,
  files,
};
```

- [ ] **Step 3: Uruchom test tłumaczeń, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: FAIL — lista brakujących kluczy `tutorial.chat.*`, `tutorial.notes.*`, `tutorial.files.*`

- [ ] **Step 4: Dodaj tłumaczenia angielskie**

W `src/locales/en/translation.json`, wewnątrz gałęzi `tutorial`, obok `gameScreen`:

```json
    "chat": {
      "log": {
        "title": "The chronicle",
        "body": {
          "0": "Every roll and message from the table lands here, newest at the bottom. It is empty until someone rolls or writes.",
          "1": "Every roll and message from the table, newest at the bottom. Hidden rolls show only to the people allowed to see them."
        }
      },
      "dice": {
        "title": "Rolling dice",
        "body": {
          "gm": "Roll without opening any sheet. The eye decides who sees the result — everyone, you alone, or one chosen player.",
          "player": "Roll without opening your sheet. The eye decides who sees the result — everyone, or just you and the GM."
        }
      },
      "myRolls": {
        "title": "Only my rolls",
        "body": "Hides everyone else's entries from the log, so you can find your own result in a busy fight."
      }
    },
    "notes": {
      "list": {
        "title": "Your notes",
        "body": {
          "0": "Your private notes will appear here. Nobody else in the game can read them.",
          "1": "Your private notes. Drag them to reorder, click one to edit it — nobody else in the game can read them."
        }
      },
      "add": {
        "title": "New note",
        "body": "Adds an empty note at the top of the list. Useful mid-session for a name you want to remember."
      },
      "filter": {
        "title": "Search",
        "body": "Filters the list as you type. While a filter is active, dragging to reorder is switched off."
      }
    },
    "files": {
      "list": {
        "title": "Your files",
        "body": {
          "0": "Maps, tokens and portraits you upload will appear here. Drag a file onto the scene to place it.",
          "1": "Maps, tokens and portraits. Drag one onto the scene to place it, or use the context menu to rename and delete."
        }
      },
      "createFolder": {
        "title": "Organising files",
        "body": "Create folders to keep a long campaign tidy. Drag files between them."
      },
      "breadcrumb": {
        "title": "Where you are",
        "body": "The path of the folder you opened. Click any part of it to jump back up."
      }
    },
```

- [ ] **Step 5: Dodaj tłumaczenia polskie**

W `src/locales/pl/translation.json`, w tym samym miejscu:

```json
    "chat": {
      "log": {
        "title": "Kronika",
        "body": {
          "0": "Każdy rzut i każda wiadomość od stołu trafiają tutaj, najnowsze na dole. Pusto, dopóki ktoś nie rzuci albo nie napisze.",
          "1": "Każdy rzut i każda wiadomość od stołu, najnowsze na dole. Ukryte rzuty widzą tylko ci, którym je pokazano."
        }
      },
      "dice": {
        "title": "Rzuty kośćmi",
        "body": {
          "gm": "Rzucasz bez otwierania karty. Oko decyduje, kto zobaczy wynik — wszyscy, tylko Ty, albo wybrany gracz.",
          "player": "Rzucasz bez otwierania karty. Oko decyduje, kto zobaczy wynik — wszyscy, albo tylko Ty i MG."
        }
      },
      "myRolls": {
        "title": "Tylko moje rzuty",
        "body": "Ukrywa w logu cudze wpisy, żebyś w gęstej walce znalazł swój wynik."
      }
    },
    "notes": {
      "list": {
        "title": "Twoje notatki",
        "body": {
          "0": "Tu pojawią się Twoje prywatne notatki. Nikt inny w tej grze ich nie przeczyta.",
          "1": "Twoje prywatne notatki. Przeciągnij, żeby zmienić kolejność, kliknij, żeby edytować — nikt inny ich nie przeczyta."
        }
      },
      "add": {
        "title": "Nowa notatka",
        "body": "Dodaje pustą notatkę na górze listy. Przydaje się w trakcie sesji na imię, które chcesz zapamiętać."
      },
      "filter": {
        "title": "Szukaj",
        "body": "Filtruje listę w trakcie pisania. Przy włączonym filtrze przeciąganie do zmiany kolejności jest wyłączone."
      }
    },
    "files": {
      "list": {
        "title": "Twoje pliki",
        "body": {
          "0": "Tu pojawią się mapy, tokeny i portrety, które wgrasz. Przeciągnięcie pliku na scenę stawia go na mapie.",
          "1": "Mapy, tokeny i portrety. Przeciągnij plik na scenę, żeby go postawić, a przez menu kontekstowe zmienisz mu nazwę albo go skasujesz."
        }
      },
      "createFolder": {
        "title": "Porządek w plikach",
        "body": "Foldery utrzymują długą kampanię w ryzach. Pliki przeciągasz między nimi."
      },
      "breadcrumb": {
        "title": "Gdzie jesteś",
        "body": "Ścieżka otwartego folderu. Kliknięcie dowolnego członu cofa Cię wyżej."
      }
    },
```

- [ ] **Step 6: Uruchom test tłumaczeń, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: PASS

- [ ] **Step 7: Wstaw przyciski**

`src/components/LogWindow.jsx` — do nagłówka z Task 4:

```jsx
            <div className="log-window__header">
                <h3 className="log-window__title">{t('rightPanel.tabs.chat')}</h3>
                <TourButton tourId="chat" />
            </div>
```

`src/components/tabs/NotesTab.jsx:251` — nagłówek ma już tytuł i przycisk dodawania; przycisk samouczka idzie na koniec:

```jsx
      <div className="notes-tab__header">
        <h3 className="notes-tab__title">{t('notes.title')}</h3>
        <button className="notes-tab__add-btn" onClick={handleCreate}>
          <AddIcon fontSize="small" />
          {t('notes.addNote')}
        </button>
        <TourButton tourId="notes" />
      </div>
```

`src/components/tabs/FilesTab.jsx:567` — przycisk trafia do `.files-tab__actions`, obok przycisku tworzenia folderu:

```jsx
          <div className="files-tab__actions">
            <button
              className="files-tab__btn"
              onClick={() => setIsCreateFolderOpen(true)}
            >
              + {t('files.createFolder')}
            </button>
            <TourButton tourId="files" />
          </div>
```

W każdym z trzech plików dodaj import — ścieżka zależy od położenia pliku: `../tutorial/TourButton` dla `LogWindow.jsx`, `../tutorial/TourButton` dla plików w `tabs/`.

- [ ] **Step 8: Sprawdź całość**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`

Run: `CI=true npx eslint src/components/tutorial src/components/LogWindow.jsx src/components/tabs/NotesTab.jsx src/components/tabs/FilesTab.jsx`
Expected: brak błędów

- [ ] **Step 9: Commit**

```bash
git add src/components/tutorial/tours src/components/LogWindow.jsx src/components/tabs/NotesTab.jsx src/components/tabs/FilesTab.jsx src/locales
git commit -m "feat: chat, notes and files tab tutorials"
```

---

### Task 6: Samouczki `scenes` i `handouts`

`handouts` to jedyna zakładka, w której ten sam element opisuje się inaczej MG i graczowi, a przycisk tworzenia w ogóle nie istnieje dla gracza.

**Files:**
- Create: `src/components/tutorial/tours/scenes.js`, `handouts.js`
- Modify: `src/components/tutorial/tours/index.js`
- Modify: `src/components/tabs/ScenesTab.jsx:290`
- Modify: `src/components/tabs/handouts/HandoutTabHeader.jsx:20`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `TourButton` z Task 3; rejestr z Task 2.
- Produces: wpisy `scenes`, `handouts` w `TOURS`.

- [ ] **Step 1: Napisz definicje**

Utwórz `src/components/tutorial/tours/scenes.js`:

```js
// .scenes-tab__empty jest ZAGNIEŻDŻONY w .scenes-tab__list (ScenesTab.jsx:309,311).
// .scenes-tab__settings-title pojawia się dopiero po wybraniu sceny (ScenesTab.jsx:347).
export default {
  id: 'scenes',
  steps: [
    { id: 'list', target: ['.scenes-tab__empty', '.scenes-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'create', target: '.scenes-tab__btn', placement: 'left' },
    { id: 'settings', target: '.scenes-tab__settings-title', placement: 'left' },
  ],
};
```

Utwórz `src/components/tutorial/tours/handouts.js`:

```js
// .handouts-tab__empty ZASTĘPUJE .handouts-tab__list (HandoutsTab.jsx:540) — inaczej niż
// w notes/files/scenes, gdzie pusty stan siedzi w środku listy. Kolejność "pusty pierwszy"
// obsługuje oba układy.
// .handouts-tab__header-actions renderuje się tylko dla MG (HandoutTabHeader.jsx:23),
// więc krok o tworzeniu wypada graczowi sam, bez deklaracji roles.
export default {
  id: 'handouts',
  steps: [
    { id: 'list', target: ['.handouts-tab__empty', '.handouts-tab__list'], placement: 'left', variants: ['byTarget', 'byRole'] },
    { id: 'create', target: '.handouts-tab__header-actions', placement: 'left' },
  ],
};
```

- [ ] **Step 2: Zarejestruj**

W `src/components/tutorial/tours/index.js` dodaj `import scenes from './scenes';`, `import handouts from './handouts';` oraz oba wpisy do `TOURS`.

- [ ] **Step 3: Uruchom test tłumaczeń, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: FAIL — brakujące klucze `tutorial.scenes.*` i `tutorial.handouts.*`

- [ ] **Step 4: Dodaj tłumaczenia angielskie**

W `src/locales/en/translation.json`, w gałęzi `tutorial`:

```json
    "scenes": {
      "list": {
        "title": "Your scenes",
        "body": {
          "0": "The maps of this campaign will appear here. Create one to give the table something to stand on.",
          "1": "The maps of this campaign. Click one to work on it — your players keep seeing whichever scene you assigned them."
        }
      },
      "create": {
        "title": "New scene",
        "body": "Adds an empty scene. You set its background and grid afterwards, then decide who gets to see it."
      },
      "settings": {
        "title": "Scene settings",
        "body": "Grid size, dimensions and background of the selected scene. Changing the grid changes what a measured distance means."
      }
    },
    "handouts": {
      "list": {
        "title": "Handouts",
        "body": {
          "0": {
            "gm": "Letters, portraits and maps you hand to the players will appear here. Nothing is shared until you say so.",
            "player": "Anything the GM hands to the table appears here — letters, portraits, maps. Empty for now."
          },
          "1": {
            "gm": "Letters, portraits and maps for the players. Each one is shared only with the people you pick.",
            "player": "What the GM has shared with you. Click one to open it in its own window."
          }
        }
      },
      "create": {
        "title": "New handout",
        "body": "Creates a handout from an uploaded file or written text, and lets you choose who receives it."
      }
    },
```

- [ ] **Step 5: Dodaj tłumaczenia polskie**

W `src/locales/pl/translation.json`:

```json
    "scenes": {
      "list": {
        "title": "Twoje sceny",
        "body": {
          "0": "Tu pojawią się mapy tej kampanii. Utwórz pierwszą, żeby stół miał na czym stanąć.",
          "1": "Mapy tej kampanii. Kliknij scenę, żeby nad nią pracować — gracze nadal widzą tę, którą im przypisałeś."
        }
      },
      "create": {
        "title": "Nowa scena",
        "body": "Dodaje pustą scenę. Tło i siatkę ustawiasz potem, a na końcu decydujesz, kto ją zobaczy."
      },
      "settings": {
        "title": "Ustawienia sceny",
        "body": "Siatka, wymiary i tło wybranej sceny. Zmiana siatki zmienia to, co oznacza zmierzony dystans."
      }
    },
    "handouts": {
      "list": {
        "title": "Handouty",
        "body": {
          "0": {
            "gm": "Tu pojawią się listy, portrety i mapy, które przekazujesz graczom. Nic nie jest udostępnione, dopóki nie zdecydujesz.",
            "player": "Tu pojawia się wszystko, co MG przekaże stołowi — listy, portrety, mapy. Na razie pusto."
          },
          "1": {
            "gm": "Listy, portrety i mapy dla graczy. Każdy handout trafia tylko do osób, które wskażesz.",
            "player": "To, co udostępnił Ci MG. Kliknij, żeby otworzyć w osobnym oknie."
          }
        }
      },
      "create": {
        "title": "Nowy handout",
        "body": "Tworzy handout z wgranego pliku albo z napisanego tekstu i pozwala wybrać, kto go dostanie."
      }
    },
```

- [ ] **Step 6: Uruchom test tłumaczeń, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: PASS

- [ ] **Step 7: Wstaw przyciski**

`src/components/tabs/ScenesTab.jsx:290`:

```jsx
      <div className="scenes-tab__header">
        <h3 className="scenes-tab__title">{t('scenes.title')}</h3>
        <button
          className="scenes-tab__btn"
          onClick={() => setIsCreateOpen(true)}
        >
          + {t('scenes.createScene')}
        </button>
        <TourButton tourId="scenes" />
      </div>
```

`src/components/tabs/handouts/HandoutTabHeader.jsx:20` — przycisk idzie zaraz po tytule, **poza** `.handouts-tab__header-actions`, bo ta sekcja jest MG-only, a samouczek ma być dostępny obu rolom:

```jsx
      <div className="handouts-tab__header">
        <h3 className="handouts-tab__title">{t('handouts.title')}</h3>
        <TourButton tourId="handouts" />
```

Import w `HandoutTabHeader.jsx` to `../../tutorial/TourButton` (plik leży o poziom głębiej), a w `ScenesTab.jsx` — `../tutorial/TourButton`.

- [ ] **Step 8: Sprawdź**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`

Run: `CI=true npx eslint src/components/tutorial src/components/tabs/ScenesTab.jsx src/components/tabs/handouts/HandoutTabHeader.jsx`
Expected: brak błędów

- [ ] **Step 9: Commit**

```bash
git add src/components/tutorial/tours src/components/tabs/ScenesTab.jsx src/components/tabs/handouts/HandoutTabHeader.jsx src/locales
git commit -m "feat: scenes and handouts tab tutorials"
```

---

### Task 7: Samouczki `music`, `players`, `minigames`

Trzy zakładki wyłącznie dla MG.

**Files:**
- Create: `src/components/tutorial/tours/music.js`, `players.js`, `minigames.js`
- Modify: `src/components/tutorial/tours/index.js`
- Modify: `src/components/tabs/MusicTab.jsx:582`
- Modify: `src/components/tabs/PlayersTab.jsx:80`
- Modify: `src/components/tabs/minigame/MinigameList.jsx:13`
- Modify: `src/style.css` (nowa klasa `.minigame-list__header`)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `TourButton` z Task 3; rejestr z Task 2.
- Produces: wpisy `music`, `players`, `minigames` w `TOURS`.

- [ ] **Step 1: Napisz definicje**

Utwórz `src/components/tutorial/tours/music.js`:

```js
// UWAGA na unikalność: `.music-tab__section` występuje TRZY razy (MusicTab.jsx:647, 671, 830),
// więc jako kotwica trafiłby w sekcję głośności, nie w bibliotekę. `.music-tab__add-btn` też
// nie jest unikalny (dwa wystąpienia w samej bibliotece). Bierzemy nagłówek sekcji:
// `.music-tab__section-header--clickable` ma dwa wystąpienia (:672 biblioteka, :831 playlisty),
// a querySelector zwraca pierwsze w kolejności dokumentu — czyli zawsze bibliotekę. Renderuje
// się bezwarunkowo, więc krok nie wypada w pustej bibliotece.
// .music-tab__now-playing renderuje się dopiero, gdy coś już grało (MusicTab.jsx:594),
// więc w świeżej grze ten krok wypada — nie ma czego objaśniać.
// .music-tab__create-btn występuje raz, w nagłówku playlist (MusicTab.jsx:837).
// .music-tab__volume-control występuje raz, przy głośności MG (MusicTab.jsx:649).
export default {
  id: 'music',
  steps: [
    { id: 'library', target: '.music-tab__section-header--clickable', placement: 'left' },
    { id: 'nowPlaying', target: '.music-tab__now-playing', placement: 'left' },
    { id: 'playlists', target: '.music-tab__create-btn', placement: 'left' },
    { id: 'volume', target: '.music-tab__volume-control', placement: 'left' },
  ],
};
```

Utwórz `src/components/tutorial/tours/players.js`:

```js
// .players-tab__list renderuje się tylko przy niepustej liście (PlayersTab.jsx:123),
// a .players-tab__empty gdy nikt jeszcze nie dołączył.
export default {
  id: 'players',
  steps: [
    { id: 'invite', target: '.players-tab__invite', placement: 'left' },
    { id: 'list', target: ['.players-tab__empty', '.players-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'kick', target: '.players-tab__kick-btn', placement: 'left' },
  ],
};
```

Utwórz `src/components/tutorial/tours/minigames.js`:

```js
// Przycisk samouczka i te kotwice żyją w widoku listy; ekran konfiguracji rozgrywki
// (MinigameSetup.jsx) ma własny tytuł i celowo nie ma samouczka.
export default {
  id: 'minigames',
  steps: [
    { id: 'list', target: '.minigame-list', placement: 'left' },
    { id: 'start', target: '.minigame-list__item', placement: 'left' },
  ],
};
```

- [ ] **Step 2: Zarejestruj**

W `src/components/tutorial/tours/index.js` dodaj trzy importy i trzy wpisy do `TOURS`. Po tym kroku rejestr ma dziewięć samouczków: `gameScreen`, `chat`, `notes`, `files`, `scenes`, `handouts`, `music`, `players`, `minigames`.

- [ ] **Step 3: Uruchom test tłumaczeń, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: FAIL — brakujące klucze `tutorial.music.*`, `tutorial.players.*`, `tutorial.minigames.*`

- [ ] **Step 4: Dodaj tłumaczenia angielskie**

W `src/locales/en/translation.json`, w gałęzi `tutorial`:

```json
    "music": {
      "library": {
        "title": "Your tracks",
        "body": "Everything you uploaded. Click a track to play it to the whole table at once."
      },
      "nowPlaying": {
        "title": "Playback",
        "body": "What is playing now, with skip, pause and stop. Everyone hears the same thing at the same moment."
      },
      "playlists": {
        "title": "Playlists",
        "body": "Group tracks into a set — tavern, battle, travel — and start the whole set with one click."
      },
      "volume": {
        "title": "Two volumes",
        "body": "This slider is yours alone. Each player also has their own, so nobody is stuck with your level."
      }
    },
    "players": {
      "invite": {
        "title": "Inviting players",
        "body": "Send an invitation by email. The person joins this game as soon as they accept it."
      },
      "list": {
        "title": "Who is in the game",
        "body": {
          "0": "Everyone who joined will appear here, with the character they own.",
          "1": "Everyone in the game and the character they own. A lit avatar means they are connected right now."
        }
      },
      "kick": {
        "title": "Removing a player",
        "body": "Takes the person out of this game. Their character stays, so you can hand it to somebody else."
      }
    },
    "minigames": {
      "list": {
        "title": "Dice minigames",
        "body": "Small games for the table — handy while the party argues about which door to open."
      },
      "start": {
        "title": "Starting a game",
        "body": "Pick a game, choose who plays, and the board opens for everyone you invited. Clicking a running game reopens its board."
      }
    },
```

- [ ] **Step 5: Dodaj tłumaczenia polskie**

W `src/locales/pl/translation.json`:

```json
    "music": {
      "library": {
        "title": "Twoje utwory",
        "body": "Wszystko, co wgrałeś. Kliknięcie utworu puszcza go całemu stołowi naraz."
      },
      "nowPlaying": {
        "title": "Odtwarzanie",
        "body": "Co gra w tej chwili, z przewijaniem, pauzą i zatrzymaniem. Wszyscy słyszą to samo w tym samym momencie."
      },
      "playlists": {
        "title": "Playlisty",
        "body": "Grupuj utwory w zestawy — karczma, walka, podróż — i uruchamiaj cały zestaw jednym kliknięciem."
      },
      "volume": {
        "title": "Dwie głośności",
        "body": "Ten suwak jest tylko Twój. Każdy gracz ma własny, więc nikt nie jest skazany na Twój poziom."
      }
    },
    "players": {
      "invite": {
        "title": "Zapraszanie graczy",
        "body": "Wyślij zaproszenie mailem. Osoba dołącza do tej gry, gdy tylko je przyjmie."
      },
      "list": {
        "title": "Kto jest w grze",
        "body": {
          "0": "Tu pojawią się wszyscy, którzy dołączą, razem z postacią, którą grają.",
          "1": "Wszyscy w tej grze i postacie, którymi grają. Podświetlony awatar znaczy, że ktoś jest teraz połączony."
        }
      },
      "kick": {
        "title": "Usuwanie gracza",
        "body": "Wyrzuca osobę z tej gry. Postać zostaje, więc możesz ją przekazać komuś innemu."
      }
    },
    "minigames": {
      "list": {
        "title": "Minigry w kości",
        "body": "Małe gry dla stołu — przydają się, gdy drużyna kłóci się, które drzwi otworzyć."
      },
      "start": {
        "title": "Uruchomienie gry",
        "body": "Wybierz grę, wskaż uczestników, a plansza otworzy się każdemu z zaproszonych. Kliknięcie trwającej gry otwiera jej planszę ponownie."
      }
    },
```

- [ ] **Step 6: Uruchom test tłumaczeń, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: PASS

- [ ] **Step 7: Wstaw przyciski**

`src/components/tabs/MusicTab.jsx:582`:

```jsx
      <div className="music-tab__header">
        <h3 className="music-tab__title">{t('rightPanel.tabs.music')}</h3>
        <TourButton tourId="music" />
      </div>
```

`src/components/tabs/PlayersTab.jsx:80`:

```jsx
      <div className="players-tab__header">
        <h3 className="players-tab__title">{t('players.title')}</h3>
        <TourButton tourId="players" />
      </div>
```

`src/components/tabs/minigame/MinigameList.jsx:13` — tytuł nie stoi dziś w kontenerze nagłówka, więc opakuj go, żeby przycisk usiadł obok:

```jsx
      <div className="minigame-list__header">
        <h3 className="minigame-list__title">{t('minigames.title')}</h3>
        <TourButton tourId="minigames" />
      </div>
```

Katalog `tabs/minigame/` nie ma własnego pliku CSS — `.minigame-list__title` jest stylowany w `src/style.css`. Tam dopisz:

```css
.minigame-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
```

Importy: `../tutorial/TourButton` w `MusicTab.jsx` i `PlayersTab.jsx`, `../../tutorial/TourButton` w `MinigameList.jsx`.

- [ ] **Step 8: Sprawdź**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`

Run: `CI=true npx eslint src/components/tutorial src/components/tabs/MusicTab.jsx src/components/tabs/PlayersTab.jsx src/components/tabs/minigame/MinigameList.jsx`
Expected: brak błędów

- [ ] **Step 9: Commit**

```bash
git add src/components/tutorial/tours src/components/tabs/MusicTab.jsx src/components/tabs/PlayersTab.jsx src/components/tabs/minigame src/style.css src/locales
git commit -m "feat: music, players and minigames tab tutorials"
```

---

### Task 8: Wzmianka w samouczku ogólnym i straż nad rejestrem

Domknięcie: krok o zakładkach w samouczku ekranu gry ma powiedzieć, że każda zakładka ma własny samouczek. Plus testy pilnujące, żeby rejestr i zakładki nie rozjechały się w przyszłości.

**Files:**
- Modify: `src/components/tutorial/tours/TabsLegend.jsx`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`
- Modify: `src/components/tutorial/tours/index.test.js`
- Modify: `src/components/tutorial/tours/TabsLegend.test.jsx`

**Interfaces:**
- Consumes: `TOUR_IDS`, `getTour` z Task 2; `TAB_DEFS`, `tabsForRole` z FEATURE-134.

- [ ] **Step 1: Napisz testy, które mają nie przejść**

Do `src/components/tutorial/tours/index.test.js` dopisz:

```js
import { TAB_DEFS } from '../../panels/tabDefinitions';

// Zakładka `general` celowo nie ma samouczka — to lista ustawień, gdzie każde pole
// ma już własną etykietę i opis.
const TABS_WITHOUT_TOUR = ['general'];

describe('registry covers the right panel', () => {
  it('has a tour for every tab that is meant to have one', () => {
    const expected = TAB_DEFS.map(d => d.id).filter(id => !TABS_WITHOUT_TOUR.includes(id));
    expected.forEach(id => expect(getTour(id)).not.toBeNull());
  });

  it('registers no tour for the tabs deliberately left out', () => {
    TABS_WITHOUT_TOUR.forEach(id => expect(getTour(id)).toBeNull());
  });

  it('registers exactly the game screen tour plus one per covered tab', () => {
    expect(TOUR_IDS.length).toBe(TAB_DEFS.length - TABS_WITHOUT_TOUR.length + 1);
  });
});
```

Do `src/components/tutorial/tours/TabsLegend.test.jsx` dopisz:

```jsx
  it('tells the reader that each tab has its own tutorial', () => {
    render(<TabsLegend isGM={true} />);
    expect(document.body.querySelector('.tour-tabs-legend__outro')).not.toBeNull();
  });
```

- [ ] **Step 2: Uruchom testy, potwierdź czerwone**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="tours|TabsLegend"`
Expected: FAIL — brak `.tour-tabs-legend__outro`; asercje rejestru zależą od kompletu zadań 5-7 i przechodzą, jeśli tamte są gotowe

- [ ] **Step 3: Dopisz zdanie do legendy**

W `src/components/tutorial/tours/TabsLegend.jsx`, pod listą:

```jsx
      <p className="tour-tabs-legend__outro">{t('tutorial.tabsOutro')}</p>
```

- [ ] **Step 4: Dodaj klucz w obu językach**

`src/locales/en/translation.json`, w gałęzi `tutorial` obok `tabsIntro`:
```json
    "tabsOutro": "Each tab has its own short tutorial — look for the question mark next to its heading.",
```

`src/locales/pl/translation.json`:
```json
    "tabsOutro": "Każda zakładka ma własny krótki samouczek — szukaj znaku zapytania przy jej nagłówku.",
```

- [ ] **Step 5: Dodaj styl**

W `src/components/tutorial/engine/GameTour.css`, obok pozostałych reguł legendy:

```css
.tour-tabs-legend__outro {
  margin: 10px 0 0;
  font-size: 0.82rem;
  color: #7a5c42;
}
```

- [ ] **Step 6: Uruchom cały pakiet**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`. Straż przed dryfem selektorów obejmuje teraz wszystkie dziewięć samouczków.

Run: `CI=true npx eslint src/components/tutorial`
Expected: brak błędów

- [ ] **Step 7: Commit**

```bash
git add src/components/tutorial src/locales
git commit -m "feat: point the game screen tour at the per-tab tutorials"
```

---

## Weryfikacja ręczna (dla człowieka, po zadaniu 8)

Dopisz do `VISUAL-CHECK.md`:

1. Przycisk `?` przy nagłówku każdej z ośmiu zakładek; w `general` nagłówek jest, przycisku nie ma.
2. Wysokość nowego nagłówka w czacie — czy nie zjada zbyt wiele miejsca na log.
3. Puste i pełne `files`, `notes`, `handouts`, `scenes`: tekst kroku o liście mówi „tu pojawi się…" przy pustej i „to są…" przy pełnej.
4. Konto gracza w `chat`, `handouts`, `notes` — inne teksty niż u MG, brak kroku o tworzeniu handoutu.
5. `minigames`: przycisk w widoku listy, brak w konfiguracji rozgrywki.
6. Uruchomienie samouczka zakładki w trakcie trwającego samouczka ogólnego — ogólny ustępuje, nic się nie zawiesza.
7. `music` w świeżej grze: krok o odtwarzaniu wypada, dopóki nic nie grało.
8. Po samouczku zakładki `localStorage` **nie** dostaje nowego klucza — zapisywany jest wyłącznie samouczek ogólny.

## Poza zakresem tego planu

- samouczek zakładki `general`
- samouczek zadaniowy „jak uruchomić pierwszą grę"
- trwały zapis stanu samouczków na modelu `User`
- samouczki innych ekranów (lobby, kreator postaci)
