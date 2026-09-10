# FEATURE-134 — Samouczek ekranu gry — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nowy MG i nowy gracz dostają przy pierwszym wejściu do gry prowadzony samouczek orientacyjny (spotlight tour) po ekranie gry, w PL i EN, wznawialny przyciskiem `?` przy nagłówku prawego panelu.

**Architecture:** Deklaratywna lista kroków (`tourSteps.js`) filtrowana po roli i po obecności kotwicy w DOM. Hook `useGameTour` trzyma stan (start/stop/indeks) i jest wolny od biblioteki — dzięki temu testuje się przez `renderHook` bez layoutu. Komponent `GameTour` tłumaczy callbacki `react-joyride` na wywołania hooka i renderuje własny dymek `TourTooltip`. Kotwicami są istniejące, unikalne klasy CSS — nie dodajemy atrybutów do markupu.

**Tech Stack:** React 19, `react-joyride@3.2.0`, `react-i18next`, Jest + React Testing Library (CRA), MUI Icons.

**Spec:** `docs/superpowers/specs/2026-09-09-FEATURE-134-game-tutorial-tour-design.md`

## Global Constraints

- Wszystkie prace we `warhammer-battle-helper-front/`. Ścieżki poniżej są względne do tego katalogu.
- Testy uruchamiasz: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>`. Gołe `npx jest` **nie działa** — konfiguracją zarządza CRA.
- Znany baseline fail: `App.test.js` (axios ESM). To **nie** jest regresja, nie naprawiaj.
- Zero stringów wpisanych wprost w JSX. Każdy tekst przez `t('klucz')`, klucz **angielski**, tłumaczenie równolegle w `src/locales/en/translation.json` **i** `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`. Żadnych inline SVG.
- Nigdy MUI `<Tooltip>`. Podpowiedź na przycisku przez atrybut `title` (tak robi istniejący `panel-toggle` w `src/components/DndContext.jsx:1044`).
- Wersja biblioteki dokładnie `react-joyride@3.2.0` (peer `react: 16.8 - 19`, projekt ma `react: ^19.1.0`).
- Po instalacji zależności kontener frontendu przebudować z `--renew-anon-volumes`, inaczej nie rozwiąże `react-joyride`.
- Paleta dymka jak karty postaci (jasne tło, ciemny tekst): tło `linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)`, ramka `#7a5c42`, tekst `#3a2f1f`, etykiety `#7a5c42`, akcent `#c9975b`.
- Nie zostawiaj martwego kodu: import, który przestał być używany, usuwasz w tym samym commicie.

---

### Task 1: Wspólna definicja zakładek prawego panelu

Legenda zakładek w samouczku musi wyliczać dokładnie te zakładki, które user widzi. Dziś lista jest zaszyta w `RightPanel` jako ciąg `push`-y. Wyciągamy ją do modułu, z którego skorzystają oba miejsca — inaczej samouczek i panel rozjadą się przy pierwszej zmianie.

**Files:**
- Create: `src/components/panels/tabDefinitions.jsx`
- Create: `src/components/panels/tabDefinitions.test.js`
- Modify: `src/components/panels/RightPanel.jsx:4-11` (importy ikon), `:119-146` (budowa `tabs`)

**Interfaces:**
- Produces: `TAB_DEFS: Array<{ id: string, Icon: React.ComponentType, gmOnly: boolean }>` oraz `tabsForRole(isGM: boolean): TAB_DEFS[]` — używa ich Task 5 (legenda zakładek w dymku).

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/components/panels/tabDefinitions.test.js`:

```js
import { TAB_DEFS, tabsForRole } from './tabDefinitions';

describe('tabDefinitions', () => {
  it('keeps the GM tab order the right panel has always rendered', () => {
    expect(tabsForRole(true).map(d => d.id)).toEqual([
      'chat', 'scenes', 'handouts', 'files', 'music', 'notes', 'players', 'minigames', 'general'
    ]);
  });

  it('hides GM-only tabs from players', () => {
    expect(tabsForRole(false).map(d => d.id)).toEqual(['chat', 'handouts', 'notes', 'general']);
  });

  it('gives every tab an icon component', () => {
    TAB_DEFS.forEach(def => expect(typeof def.Icon).not.toBe('undefined'));
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tabDefinitions`
Expected: FAIL — `Cannot find module './tabDefinitions'`

- [ ] **Step 3: Napisz moduł**

Utwórz `src/components/panels/tabDefinitions.jsx`:

```jsx
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

// Kolejność jest kolejnością renderowania w prawym panelu i w legendzie samouczka.
export const TAB_DEFS = [
  { id: 'chat', Icon: ChatBubbleOutlineIcon, gmOnly: false },
  { id: 'scenes', Icon: MapOutlinedIcon, gmOnly: true },
  { id: 'handouts', Icon: ArticleOutlinedIcon, gmOnly: false },
  { id: 'files', Icon: FolderOutlinedIcon, gmOnly: true },
  { id: 'music', Icon: LibraryMusicOutlinedIcon, gmOnly: true },
  { id: 'notes', Icon: StickyNote2OutlinedIcon, gmOnly: false },
  { id: 'players', Icon: PeopleOutlinedIcon, gmOnly: true },
  { id: 'minigames', Icon: CasinoOutlinedIcon, gmOnly: true },
  { id: 'general', Icon: SettingsOutlinedIcon, gmOnly: false },
];

export const tabsForRole = (isGM) => TAB_DEFS.filter(def => isGM || !def.gmOnly);
```

- [ ] **Step 4: Uruchom test, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tabDefinitions`
Expected: PASS, 3 testy

- [ ] **Step 5: Przepnij `RightPanel` na wspólną definicję**

W `src/components/panels/RightPanel.jsx` zamień cały blok `const tabs = useMemo(...)` (linie 119-146, od komentarza `// Build tabs array` do `}, [isGM, t]);` włącznie) na:

```jsx
  // Zakładki i ich kolejność żyją w tabDefinitions — dzieli je z legendą samouczka.
  const tabs = useMemo(
    () => tabsForRole(isGM).map(({ id, Icon }) => ({
      id,
      icon: <Icon />,
      label: t(`rightPanel.tabs.${id}`),
    })),
    [isGM, t]
  );
```

Dodaj import obok pozostałych importów lokalnych:

```jsx
import { tabsForRole } from './tabDefinitions';
```

- [ ] **Step 6: Usuń importy ikon, które przestały być potrzebne**

Run: `grep -n "ChatBubbleOutlineIcon\|MapOutlinedIcon\|ArticleOutlinedIcon\|FolderOutlinedIcon\|LibraryMusicOutlinedIcon\|StickyNote2OutlinedIcon\|PeopleOutlinedIcon\|CasinoOutlinedIcon\|SettingsOutlinedIcon" src/components/panels/RightPanel.jsx`

Każda z tych ikon, która występuje **tylko** w linii `import`, ma zniknąć z `RightPanel.jsx` — jej jedyne użycie przeniosło się do `tabDefinitions.jsx`. Ikonę, która ma jeszcze inne wystąpienie w pliku, zostaw.

- [ ] **Step 7: Sprawdź, że nic się nie wysypało**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=RightPanel`
Expected: PASS albo „no tests found" (`RightPanel` nie ma dziś własnych testów — wtedy wystarczy brak błędu ESLint w kolejnym kroku)

Run: `CI=true npx eslint src/components/panels/RightPanel.jsx src/components/panels/tabDefinitions.jsx`
Expected: brak wyjścia (zero błędów, zero `no-unused-vars`)

- [ ] **Step 8: Commit**

```bash
git add src/components/panels/tabDefinitions.jsx src/components/panels/tabDefinitions.test.js src/components/panels/RightPanel.jsx
git commit -m "refactor: FEATURE-134 extract right panel tab definitions"
```

---

### Task 2: Deklaratywna lista kroków samouczka

**Files:**
- Create: `src/components/tutorial/tourSteps.js`
- Create: `src/components/tutorial/tourSteps.test.js`

**Interfaces:**
- Produces:
  - `TOUR_STEPS: Array<{ id, target, roles: ('gm'|'player')[], placement, reveal?: 'left'|'right'|'top' }>`
  - `stepsForRole(role: 'gm'|'player'): TOUR_STEPS[]`
  - `titleKeyFor(step): string`
  - `bodyKeyFor(step, { controlScheme: 'modern'|'classic', role: 'gm'|'player' }): string`
  - `REVEAL_SATISFIED: Record<'left'|'right'|'top', (panels) => boolean>` gdzie `panels = { leftHidden, rightHidden, topCollapsed }`
  - `isRevealSatisfied(step, panels): boolean`

  Konsumują to Task 4 (hook) i Task 5/6 (dymek, osadzenie).

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/components/tutorial/tourSteps.test.js`:

```js
import {
  TOUR_STEPS,
  stepsForRole,
  titleKeyFor,
  bodyKeyFor,
  isRevealSatisfied,
} from './tourSteps';

const ALL_VISIBLE = { leftHidden: false, rightHidden: false, topCollapsed: false };

describe('tourSteps', () => {
  it('walks the screen left to right, ending at the right panel', () => {
    expect(TOUR_STEPS.map(s => s.id)).toEqual([
      'characterCard', 'characterList', 'sceneSelector', 'windowBar', 'sceneControls',
      'layerSelector', 'drawingToolbar', 'onlineUsers', 'tabsNav', 'diceControls',
    ]);
  });

  it('gives the GM ten steps and the player eight', () => {
    expect(stepsForRole('gm')).toHaveLength(10);
    expect(stepsForRole('player')).toHaveLength(8);
  });

  it('hides the GM-only scene picker and layer picker from players', () => {
    const playerIds = stepsForRole('player').map(s => s.id);
    expect(playerIds).not.toContain('sceneSelector');
    expect(playerIds).not.toContain('layerSelector');
  });

  it('puts the layer step before the tool step, matching the on-screen stacking', () => {
    const ids = stepsForRole('gm').map(s => s.id);
    expect(ids.indexOf('layerSelector')).toBeLessThan(ids.indexOf('drawingToolbar'));
  });

  it('picks the scene control text that matches the active control scheme', () => {
    const step = TOUR_STEPS.find(s => s.id === 'sceneControls');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'gm' }))
      .toBe('tutorial.steps.sceneControls.body.modern');
    expect(bodyKeyFor(step, { controlScheme: 'classic', role: 'gm' }))
      .toBe('tutorial.steps.sceneControls.body.classic');
  });

  it('gives the GM and the player different tool descriptions', () => {
    const step = TOUR_STEPS.find(s => s.id === 'drawingToolbar');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'gm' }))
      .toBe('tutorial.steps.drawingToolbar.body.gm');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'player' }))
      .toBe('tutorial.steps.drawingToolbar.body.player');
  });

  it('derives plain keys for every other step', () => {
    const step = TOUR_STEPS.find(s => s.id === 'characterCard');
    expect(titleKeyFor(step)).toBe('tutorial.steps.characterCard.title');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'gm' }))
      .toBe('tutorial.steps.characterCard.body');
  });

  it('treats a step with no reveal requirement as always ready', () => {
    const step = TOUR_STEPS.find(s => s.id === 'sceneControls');
    expect(step.reveal).toBeUndefined();
    expect(isRevealSatisfied(step, { leftHidden: true, rightHidden: true, topCollapsed: true })).toBe(true);
  });

  it('blocks a step until the panel holding its anchor is open', () => {
    const tabs = TOUR_STEPS.find(s => s.id === 'tabsNav');
    expect(isRevealSatisfied(tabs, { ...ALL_VISIBLE, rightHidden: true })).toBe(false);
    expect(isRevealSatisfied(tabs, ALL_VISIBLE)).toBe(true);

    const card = TOUR_STEPS.find(s => s.id === 'characterCard');
    expect(isRevealSatisfied(card, { ...ALL_VISIBLE, leftHidden: true })).toBe(false);

    const bar = TOUR_STEPS.find(s => s.id === 'windowBar');
    expect(isRevealSatisfied(bar, { ...ALL_VISIBLE, topCollapsed: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourSteps`
Expected: FAIL — `Cannot find module './tourSteps'`

- [ ] **Step 3: Napisz moduł**

Utwórz `src/components/tutorial/tourSteps.js`:

```js
// Kotwice to istniejące, unikalne klasy CSS ekranu gry — świadomie nie dokładamy
// atrybutów data-* do markupu. Gdy któraś klasa zostanie przemianowana, krok bez
// kotwicy po prostu wypadnie z samouczka (patrz useGameTour), a nie wysypie ekranu.
//   .sidebar-top-section        components/common/ResizableSplitPane.jsx:48
//   .sidebar-bottom-section     components/common/ResizableSplitPane.jsx:55
//   .scene-selector             components/scene/SceneSelector.jsx:113   (tylko MG)
//   .window-bar                 components/WindowBar.jsx:81
//   .scene-viewport             components/scene/SceneViewport.jsx:720
//   .layer-selector             components/scene/LayerSelector.jsx:24    (tylko MG)
//   .drawing-toolbar            components/scene/DrawingToolbar.jsx:80
//   .right-panel__online-users  components/online-users/OnlineUsersBar.jsx:29
//   .right-panel__tabs-nav      components/panels/RightPanel.jsx:239
//   .dice-controls              components/log/DiceRollControls.jsx:42

const BOTH = ['gm', 'player'];

export const TOUR_STEPS = [
  { id: 'characterCard', target: '.sidebar-top-section', roles: BOTH, placement: 'right', reveal: 'left' },
  { id: 'characterList', target: '.sidebar-bottom-section', roles: BOTH, placement: 'right', reveal: 'left' },
  { id: 'sceneSelector', target: '.scene-selector', roles: ['gm'], placement: 'bottom', reveal: 'top' },
  { id: 'windowBar', target: '.window-bar', roles: BOTH, placement: 'bottom', reveal: 'top' },
  { id: 'sceneControls', target: '.scene-viewport', roles: BOTH, placement: 'center' },
  { id: 'layerSelector', target: '.layer-selector', roles: ['gm'], placement: 'left' },
  { id: 'drawingToolbar', target: '.drawing-toolbar', roles: BOTH, placement: 'left' },
  { id: 'onlineUsers', target: '.right-panel__online-users', roles: BOTH, placement: 'bottom' },
  { id: 'tabsNav', target: '.right-panel__tabs-nav', roles: BOTH, placement: 'left', reveal: 'right' },
  { id: 'diceControls', target: '.dice-controls', roles: BOTH, placement: 'left', reveal: 'right' },
];

export const stepsForRole = (role) => TOUR_STEPS.filter(step => step.roles.includes(role));

export const titleKeyFor = (step) => `tutorial.steps.${step.id}.title`;

export const bodyKeyFor = (step, { controlScheme, role }) => {
  if (step.id === 'sceneControls') {
    return `tutorial.steps.sceneControls.body.${controlScheme === 'classic' ? 'classic' : 'modern'}`;
  }
  if (step.id === 'drawingToolbar') {
    return `tutorial.steps.drawingToolbar.body.${role}`;
  }
  return `tutorial.steps.${step.id}.body`;
};

export const REVEAL_SATISFIED = {
  left: (panels) => !panels.leftHidden,
  right: (panels) => !panels.rightHidden,
  top: (panels) => !panels.topCollapsed,
};

export const isRevealSatisfied = (step, panels) =>
  step.reveal ? REVEAL_SATISFIED[step.reveal](panels) : true;
```

- [ ] **Step 4: Uruchom test, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourSteps`
Expected: PASS, 9 testów

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/tourSteps.js src/components/tutorial/tourSteps.test.js
git commit -m "feat: FEATURE-134 declarative tutorial step list"
```

---

### Task 3: Tłumaczenia PL i EN

**Files:**
- Modify: `src/locales/en/translation.json`
- Modify: `src/locales/pl/translation.json`
- Create: `src/components/tutorial/tourTranslations.test.js`

**Interfaces:**
- Consumes: `TOUR_STEPS`, `titleKeyFor`, `bodyKeyFor` z Task 2; `TAB_DEFS` z Task 1.
- Produces: gałąź `tutorial.*` w obu plikach tłumaczeń.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/components/tutorial/tourTranslations.test.js`:

```js
import i18n from '../../i18n';
import { TOUR_STEPS, titleKeyFor, bodyKeyFor } from './tourSteps';
import { TAB_DEFS } from '../panels/tabDefinitions';

const LANGS = ['en', 'pl'];
const ROLES = ['gm', 'player'];
const SCHEMES = ['modern', 'classic'];

// t() zwraca sam klucz, gdy tłumaczenia brakuje — to jest nasz sygnał braku.
const missing = (lng, key) => {
  const value = i18n.getFixedT(lng)(key);
  return value === key || value.trim() === '';
};

describe('tutorial translations', () => {
  it.each(LANGS)('has a title and a body for every step in %s', (lng) => {
    const gaps = [];
    TOUR_STEPS.forEach(step => {
      if (missing(lng, titleKeyFor(step))) gaps.push(titleKeyFor(step));
      ROLES.forEach(role => SCHEMES.forEach(controlScheme => {
        const key = bodyKeyFor(step, { role, controlScheme });
        if (missing(lng, key)) gaps.push(key);
      }));
    });
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('describes every right-panel tab in %s', (lng) => {
    const gaps = TAB_DEFS
      .map(def => `tutorial.tabs.${def.id}`)
      .filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('has the tour chrome strings in %s', (lng) => {
    const gaps = ['button', 'next', 'back', 'skip', 'done', 'progress', 'tabsIntro']
      .map(name => `tutorial.${name}`)
      .filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('renders the progress counter with both numbers in %s', (lng) => {
    const text = i18n.getFixedT(lng)('tutorial.progress', { current: 3, total: 10 });
    expect(text).toContain('3');
    expect(text).toContain('10');
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: FAIL — lista brakujących kluczy `tutorial.*` w `gaps`

- [ ] **Step 3: Dodaj gałąź `tutorial` do `src/locales/en/translation.json`**

Wstaw jako nowy klucz najwyższego poziomu, obok `rightPanel`:

```json
  "tutorial": {
    "button": "Show the tutorial",
    "next": "Next",
    "back": "Back",
    "skip": "Skip",
    "done": "Got it",
    "progress": "{{current}} / {{total}}",
    "tabsIntro": "The right panel holds everything that is not the map. Pick a tab:",
    "tabs": {
      "chat": "dice rolls, results and messages from the whole table",
      "scenes": "settings of the current scene: grid, size, background",
      "handouts": "images and documents you hand to the players",
      "files": "your uploads — maps, tokens, portraits",
      "music": "background tracks played to everyone at once",
      "notes": "your private notes, nobody else sees them",
      "players": "who joined, which character they own, their permissions",
      "minigames": "dice minigames you can start for the table",
      "general": "game settings, language, control scheme, leaving the game"
    },
    "steps": {
      "characterCard": {
        "title": "Selected character",
        "body": "A short sheet of the character you clicked: key stats and quick rolls. Click the name to open the full sheet in its own window."
      },
      "characterList": {
        "title": "Character list",
        "body": "Every player character and NPC in this game. Drag one onto the map to place its token, or click it to load it into the card above."
      },
      "sceneSelector": {
        "title": "Scenes",
        "body": "Your maps. Switch between them, add a new one, and decide which scene each player is looking at — you can preview a scene before you show it to anyone."
      },
      "windowBar": {
        "title": "Open windows",
        "body": "Character sheets and handouts open as separate windows. Minimising one parks it here, so nothing gets lost behind the map."
      },
      "sceneControls": {
        "title": "The map",
        "body": {
          "modern": "Drag with the left mouse button to pan the map, scroll to zoom. Left-click a token to select it, drag it to move it. You can change this in the General tab.",
          "classic": "Drag with the right mouse button to pan the map, scroll to zoom. Left-click a token to select it, drag it to move it. You can change this in the General tab."
        }
      },
      "layerSelector": {
        "title": "Active layer",
        "body": "The map is stacked from layers: background, tokens, overlays. Pick the layer first — what you draw, move or delete applies only to the layer armed here."
      },
      "drawingToolbar": {
        "title": "Scene tools",
        "body": {
          "gm": "Pan, select, measure distance, paint fog of war and draw. Fog is what your players cannot see yet — you uncover it as they explore.",
          "player": "Pan the map, measure distance to a target and draw on the map so the rest of the table sees what you mean."
        }
      },
      "onlineUsers": {
        "title": "Who is here",
        "body": "Everyone in the game. A lit avatar means the person is connected right now. Click your own to change your colour and avatar size."
      },
      "tabsNav": {
        "title": "Right panel tabs",
        "body": "Everything that is not the map lives here — pick a tab to switch the panel."
      },
      "diceControls": {
        "title": "Dice and roll visibility",
        "body": "Roll dice without opening any sheet. The eye picks who sees the result — everyone, the GM only, or you alone — and the filter next to it hides other people's rolls from the log."
      }
    }
  },
```

- [ ] **Step 4: Dodaj tę samą gałąź do `src/locales/pl/translation.json`**

```json
  "tutorial": {
    "button": "Pokaż samouczek",
    "next": "Dalej",
    "back": "Wstecz",
    "skip": "Pomiń",
    "done": "Rozumiem",
    "progress": "{{current}} / {{total}}",
    "tabsIntro": "Prawy panel mieści wszystko, co nie jest mapą. Wybierz zakładkę:",
    "tabs": {
      "chat": "rzuty, wyniki i wiadomości od całego stołu",
      "scenes": "ustawienia bieżącej sceny: siatka, rozmiar, tło",
      "handouts": "obrazki i dokumenty, które przekazujesz graczom",
      "files": "Twoje pliki — mapy, tokeny, portrety",
      "music": "muzyka w tle, odtwarzana wszystkim naraz",
      "notes": "Twoje prywatne notatki, nikt inny ich nie widzi",
      "players": "kto dołączył, czyją gra postacią, jakie ma uprawnienia",
      "minigames": "minigry w kości, które możesz uruchomić stołowi",
      "general": "ustawienia gry, język, schemat sterowania, wyjście z gry"
    },
    "steps": {
      "characterCard": {
        "title": "Wybrana postać",
        "body": "Skrócona karta klikniętej postaci: najważniejsze cechy i szybkie rzuty. Kliknij nazwę, żeby otworzyć pełną kartę w osobnym oknie."
      },
      "characterList": {
        "title": "Lista postaci",
        "body": "Wszystkie postacie graczy i NPC w tej grze. Przeciągnij postać na mapę, żeby postawić jej token, albo kliknij ją, żeby wczytać ją do karty powyżej."
      },
      "sceneSelector": {
        "title": "Sceny",
        "body": "Twoje mapy. Przełączasz się między nimi, dodajesz nowe i decydujesz, którą scenę widzi każdy z graczy — scenę możesz podejrzeć, zanim komukolwiek ją pokażesz."
      },
      "windowBar": {
        "title": "Otwarte okna",
        "body": "Karty postaci i handouty otwierają się jako osobne okna. Zminimalizowane lądują tutaj, więc nic nie ginie za mapą."
      },
      "sceneControls": {
        "title": "Mapa",
        "body": {
          "modern": "Przeciąganie lewym przyciskiem przesuwa mapę, kółko przybliża. Lewy klik zaznacza token, przeciągnięcie go przesuwa. Sterowanie zmienisz w zakładce Ustawienia Ogólne.",
          "classic": "Przeciąganie prawym przyciskiem przesuwa mapę, kółko przybliża. Lewy klik zaznacza token, przeciągnięcie go przesuwa. Sterowanie zmienisz w zakładce Ustawienia Ogólne."
        }
      },
      "layerSelector": {
        "title": "Aktywna warstwa",
        "body": "Mapa składa się z warstw: tło, tokeny, nakładki. Najpierw wybierz warstwę — rysowanie, przesuwanie i kasowanie działa tylko na tej uzbrojonej tutaj."
      },
      "drawingToolbar": {
        "title": "Narzędzia sceny",
        "body": {
          "gm": "Przesuwanie, zaznaczanie, miarka, mgła wojny i rysowanie. Mgła to obszar, którego gracze jeszcze nie widzą — odsłaniasz go w miarę eksploracji.",
          "player": "Przesuwanie mapy, miarka do celu i rysowanie po mapie, żeby reszta stołu zobaczyła, o co Ci chodzi."
        }
      },
      "onlineUsers": {
        "title": "Kto jest przy stole",
        "body": "Wszyscy uczestnicy gry. Podświetlony awatar znaczy, że ktoś jest teraz połączony. Kliknij swój, żeby zmienić kolor i rozmiar awatara."
      },
      "tabsNav": {
        "title": "Zakładki prawego panelu",
        "body": "Wszystko, co nie jest mapą, siedzi tutaj — wybierz zakładkę, żeby przełączyć panel."
      },
      "diceControls": {
        "title": "Kości i widoczność rzutów",
        "body": "Rzucasz kośćmi bez otwierania karty. Oko decyduje, kto zobaczy wynik — wszyscy, sam MG albo tylko Ty — a filtr obok ukrywa w logu cudze rzuty."
      }
    }
  },
```

- [ ] **Step 5: Uruchom test, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=tourTranslations`
Expected: PASS, 8 testów (4 przypadki × 2 języki)

- [ ] **Step 6: Sprawdź, że oba pliki JSON są poprawne**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json')); JSON.parse(require('fs').readFileSync('src/locales/pl/translation.json')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add src/locales/en/translation.json src/locales/pl/translation.json src/components/tutorial/tourTranslations.test.js
git commit -m "feat: FEATURE-134 tutorial translations for PL and EN"
```

---

### Task 4: Hook `useGameTour`

Hook celowo nie importuje `react-joyride`. Trzyma stan i zasady, biblioteka tylko rysuje. Dzięki temu logika ma testy, mimo że `getBoundingClientRect` w jsdom zwraca zera i pozycjonowania przetestować się nie da.

Sedno: krok, którego kotwica siedzi w schowanym panelu, **nie** staje się bieżącym od razu. Najpierw leci `onReveal(step)` (to rodzic odsłania panel), a indeks przeskakuje dopiero wtedy, gdy `panels` przyjdą już odsłonięte. Zero `setTimeout` dobieranego pod czas animacji.

**Files:**
- Create: `src/components/tutorial/useGameTour.js`
- Create: `src/components/tutorial/useGameTour.test.js`

**Interfaces:**
- Consumes: `stepsForRole`, `isRevealSatisfied` z Task 2.
- Produces:
  - `seenKey(role: 'gm'|'player'): string`
  - `useGameTour({ role, panels, onReveal, queryTarget? })` zwracające
    `{ steps, stepIndex, running, start, goTo, finish }`,
    gdzie `stepIndex: number|null` (null = nie działa), `goTo(index: number)`,
    `finish()` zapisuje flagę w `localStorage`.
  - Konsumuje to Task 6.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/components/tutorial/useGameTour.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import { useGameTour, seenKey } from './useGameTour';

const OPEN = { leftHidden: false, rightHidden: false, topCollapsed: false };

// Domyślnie udajemy, że każda kotwica istnieje; pojedyncze testy zawężają listę.
const allTargets = () => jest.fn(() => ({}));

const setup = ({ role = 'gm', panels = OPEN, queryTarget = allTargets() } = {}) => {
  const onReveal = jest.fn();
  const view = renderHook(
    (props) => useGameTour({ role, onReveal, queryTarget, ...props }),
    { initialProps: { panels } }
  );
  return { view, onReveal, queryTarget };
};

describe('useGameTour', () => {
  beforeEach(() => localStorage.clear());

  it('auto-starts on the first visit and stores nothing yet', () => {
    const { view } = setup();
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
    expect(localStorage.getItem(seenKey('gm'))).toBeNull();
  });

  it('does not auto-start once the role has seen it', () => {
    localStorage.setItem(seenKey('gm'), '1');
    const { view } = setup();
    expect(view.result.current.running).toBe(false);
  });

  it('keeps the roles apart', () => {
    localStorage.setItem(seenKey('player'), '1');
    const { view } = setup({ role: 'gm' });
    expect(view.result.current.running).toBe(true);
  });

  it('starts from the button even when the flag is set', () => {
    localStorage.setItem(seenKey('gm'), '1');
    const { view } = setup();
    act(() => view.result.current.start());
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('drops steps whose anchor is not on screen', () => {
    const queryTarget = jest.fn(sel => (sel === '.layer-selector' || sel === '.drawing-toolbar' ? null : {}));
    const { view } = setup({ queryTarget });
    expect(view.result.current.steps.map(s => s.id)).not.toContain('layerSelector');
    expect(view.result.current.steps.map(s => s.id)).not.toContain('drawingToolbar');
    expect(view.result.current.steps).toHaveLength(8);
  });

  it('stays put when no anchor at all is on screen', () => {
    const { view } = setup({ queryTarget: jest.fn(() => null) });
    expect(view.result.current.running).toBe(false);
    expect(view.result.current.steps).toHaveLength(0);
  });

  it('asks the parent to reveal the panel a step needs', () => {
    const { onReveal } = setup();
    expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'characterCard' }));
  });

  it('holds the step back until the panel actually opened', () => {
    const { view } = setup({ panels: { ...OPEN, rightHidden: true } });
    act(() => view.result.current.goTo(8)); // tabsNav, wymaga prawego panelu
    expect(view.result.current.stepIndex).toBe(0);
    view.rerender({ panels: OPEN });
    expect(view.result.current.stepIndex).toBe(8);
  });

  it('moves forward and back through goTo', () => {
    const { view } = setup();
    act(() => view.result.current.goTo(1));
    expect(view.result.current.stepIndex).toBe(1);
    act(() => view.result.current.goTo(0));
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('finishing past the last step marks the tour seen', () => {
    const { view } = setup();
    act(() => view.result.current.goTo(view.result.current.steps.length));
    expect(view.result.current.running).toBe(false);
    expect(localStorage.getItem(seenKey('gm'))).toBe('1');
  });

  it('skipping marks the tour seen too', () => {
    const { view } = setup();
    act(() => view.result.current.finish());
    expect(view.result.current.running).toBe(false);
    expect(localStorage.getItem(seenKey('gm'))).toBe('1');
  });

  it('waits for the role before doing anything', () => {
    const { view } = setup({ role: null });
    expect(view.result.current.running).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź czerwony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=useGameTour`
Expected: FAIL — `Cannot find module './useGameTour'`

- [ ] **Step 3: Napisz hook**

Utwórz `src/components/tutorial/useGameTour.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { stepsForRole, isRevealSatisfied } from './tourSteps';

export const seenKey = (role) => `tutorialSeen:${role}`;

const readSeen = (role) => {
  try {
    return localStorage.getItem(seenKey(role)) !== null;
  } catch {
    return false; // prywatne okno / zablokowane storage — pokaż samouczek, nic nie psuje
  }
};

const writeSeen = (role) => {
  try {
    localStorage.setItem(seenKey(role), '1');
  } catch {
    /* brak zapisu to jedynie ponowny samouczek następnym razem */
  }
};

const defaultQueryTarget = (selector) => document.querySelector(selector);

export function useGameTour({ role, panels, onReveal, queryTarget = defaultQueryTarget }) {
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(null);
  const [pending, setPending] = useState(null);
  const autoStarted = useRef(false);

  const finish = useCallback(() => {
    setStepIndex(null);
    setPending(null);
    if (role) writeSeen(role);
  }, [role]);

  // goTo dostaje listę jawnie, bo start() woła je zanim setSteps zdąży się scommitować.
  const goToIn = useCallback((index, list) => {
    if (index < 0) return;
    if (index >= list.length) {
      finish();
      return;
    }
    onReveal(list[index]);
    setPending(index);
  }, [finish, onReveal]);

  const start = useCallback(() => {
    if (!role) return;
    const live = stepsForRole(role).filter(step => queryTarget(step.target));
    if (live.length === 0) return;
    setSteps(live);
    goToIn(0, live);
  }, [role, queryTarget, goToIn]);

  const goTo = useCallback((index) => goToIn(index, steps), [goToIn, steps]);

  // Krok staje się bieżący dopiero gdy panel z jego kotwicą jest naprawdę odsłonięty.
  // Warunek stoi na stanie paneli, nie na timerze — nie ma czego się ścigać.
  useEffect(() => {
    if (pending === null) return;
    const step = steps[pending];
    if (!step || !isRevealSatisfied(step, panels)) return;
    setStepIndex(pending);
    setPending(null);
  }, [pending, steps, panels]);

  useEffect(() => {
    if (!role || autoStarted.current) return;
    autoStarted.current = true;
    if (readSeen(role)) return;
    start();
  }, [role, start]);

  return {
    steps,
    stepIndex,
    running: stepIndex !== null,
    start,
    goTo,
    finish,
  };
}
```

- [ ] **Step 4: Uruchom test, potwierdź zielony**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=useGameTour`
Expected: PASS, 12 testów

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/useGameTour.js src/components/tutorial/useGameTour.test.js
git commit -m "feat: FEATURE-134 tutorial tour state hook"
```

---

### Task 5: Dymek `TourTooltip` i legenda zakładek

**Files:**
- Create: `src/components/tutorial/TourTooltip.jsx`
- Create: `src/components/tutorial/TabsLegend.jsx`
- Create: `src/components/tutorial/GameTour.css`
- Create: `src/components/tutorial/TourTooltip.test.jsx`
- Create: `src/components/tutorial/TabsLegend.test.jsx`

**Interfaces:**
- Consumes: `tabsForRole` z Task 1.
- Produces:
  - `TourTooltip` — komponent w kształcie, jakiego oczekuje `tooltipComponent` w `react-joyride`:
    props `{ index, size, step, backProps, primaryProps, skipProps, tooltipProps, isLastStep }`,
    gdzie `step = { title: ReactNode, content: ReactNode }`.
  - `TabsLegend({ isGM: boolean })` — treść kroku `tabsNav`.
  - Konsumuje je Task 6.

- [ ] **Step 1: Napisz testy, które mają nie przejść**

Utwórz `src/components/tutorial/TabsLegend.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import TabsLegend from './TabsLegend';

describe('TabsLegend', () => {
  it('lists all nine tabs for the GM', () => {
    const { container } = render(<TabsLegend isGM={true} />);
    expect(container.querySelectorAll('.tour-tabs-legend__item')).toHaveLength(9);
  });

  it('lists only the four a player can see', () => {
    const { container } = render(<TabsLegend isGM={false} />);
    expect(container.querySelectorAll('.tour-tabs-legend__item')).toHaveLength(4);
  });

  it('shows translated tab names, not raw keys', () => {
    render(<TabsLegend isGM={false} />);
    expect(screen.queryByText(/rightPanel\.tabs\./)).toBeNull();
    expect(screen.queryByText(/tutorial\.tabs\./)).toBeNull();
  });
});
```

Utwórz `src/components/tutorial/TourTooltip.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TourTooltip from './TourTooltip';

const props = (overrides = {}) => ({
  index: 0,
  size: 10,
  isLastStep: false,
  step: { title: 'Selected character', content: <p>Body text</p> },
  tooltipProps: {},
  backProps: { onClick: jest.fn() },
  primaryProps: { onClick: jest.fn() },
  skipProps: { onClick: jest.fn() },
  ...overrides,
});

describe('TourTooltip', () => {
  it('renders the title, the body and the progress counter', () => {
    render(<TourTooltip {...props()} />);
    expect(screen.getByText('Selected character')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
  });

  it('hides Back on the first step', () => {
    render(<TourTooltip {...props()} />);
    expect(screen.queryByText('Back')).toBeNull();
  });

  it('shows Back from the second step on', () => {
    render(<TourTooltip {...props({ index: 1 })} />);
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('labels the primary button Next mid-tour and Got it at the end', () => {
    const { rerender } = render(<TourTooltip {...props()} />);
    expect(screen.getByText('Next')).toBeInTheDocument();
    rerender(<TourTooltip {...props({ index: 9, isLastStep: true })} />);
    expect(screen.getByText('Got it')).toBeInTheDocument();
  });

  it('wires the buttons to the props Joyride handed it', () => {
    const p = props({ index: 1 });
    render(<TourTooltip {...p} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Skip'));
    expect(p.primaryProps.onClick).toHaveBeenCalledTimes(1);
    expect(p.backProps.onClick).toHaveBeenCalledTimes(1);
    expect(p.skipProps.onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Uruchom testy, potwierdź czerwone**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="TourTooltip|TabsLegend"`
Expected: FAIL — `Cannot find module './TabsLegend'` oraz `'./TourTooltip'`

- [ ] **Step 3: Napisz `TabsLegend`**

Utwórz `src/components/tutorial/TabsLegend.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { tabsForRole } from '../panels/tabDefinitions';

// Ikony i kolejność biorą się z tej samej definicji co realne zakładki panelu,
// więc legenda nie może pokazać zakładki, której user nie ma.
const TabsLegend = ({ isGM }) => {
  const { t } = useTranslation();

  return (
    <div className="tour-tabs-legend">
      <p className="tour-tabs-legend__intro">{t('tutorial.tabsIntro')}</p>
      <ul className="tour-tabs-legend__list">
        {tabsForRole(isGM).map(({ id, Icon }) => (
          <li key={id} className="tour-tabs-legend__item">
            <Icon className="tour-tabs-legend__icon" fontSize="small" />
            <span className="tour-tabs-legend__name">{t(`rightPanel.tabs.${id}`)}</span>
            <span className="tour-tabs-legend__desc">{t(`tutorial.tabs.${id}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TabsLegend;
```

- [ ] **Step 4: Napisz `TourTooltip`**

Utwórz `src/components/tutorial/TourTooltip.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

// Kształt propsów narzuca react-joyride (tooltipComponent). Renderujemy własny
// markup, żeby dymek trzymał paletę kart postaci zamiast domyślnych kolorów biblioteki.
const TourTooltip = ({
  index,
  size,
  step,
  isLastStep,
  tooltipProps,
  backProps,
  primaryProps,
  skipProps,
}) => {
  const { t } = useTranslation();

  return (
    <div className="tour-tooltip" {...tooltipProps}>
      {step.title && <h3 className="tour-tooltip__title">{step.title}</h3>}
      <div className="tour-tooltip__body">{step.content}</div>
      <div className="tour-tooltip__footer">
        <span className="tour-tooltip__progress">
          {t('tutorial.progress', { current: index + 1, total: size })}
        </span>
        <div className="tour-tooltip__actions">
          <button type="button" className="tour-tooltip__btn tour-tooltip__btn--ghost" {...skipProps}>
            {t('tutorial.skip')}
          </button>
          {index > 0 && (
            <button type="button" className="tour-tooltip__btn" {...backProps}>
              {t('tutorial.back')}
            </button>
          )}
          <button type="button" className="tour-tooltip__btn tour-tooltip__btn--primary" {...primaryProps}>
            {isLastStep ? t('tutorial.done') : t('tutorial.next')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TourTooltip;
```

- [ ] **Step 5: Napisz style**

Utwórz `src/components/tutorial/GameTour.css`:

```css
.tour-tooltip {
  max-width: 420px;
  padding: 18px 20px;
  background: linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%);
  border: 2px solid #7a5c42;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: #3a2f1f;
}

.tour-tooltip__title {
  margin: 0 0 8px;
  font-family: 'Cinzel', serif;
  font-size: 1.1rem;
  color: #7a5c42;
}

.tour-tooltip__body {
  font-size: 0.92rem;
  line-height: 1.5;
}

.tour-tooltip__body p {
  margin: 0;
}

.tour-tooltip__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #c4a882;
}

.tour-tooltip__progress {
  font-size: 0.8rem;
  color: #7a5c42;
}

.tour-tooltip__actions {
  display: flex;
  gap: 8px;
}

.tour-tooltip__btn {
  padding: 6px 14px;
  font-family: inherit;
  font-size: 0.85rem;
  color: #3a2f1f;
  background: #fff9f0;
  border: 1px solid #c4a882;
  border-radius: 4px;
  cursor: pointer;
}

.tour-tooltip__btn:hover {
  border-color: #7a5c42;
}

.tour-tooltip__btn--primary {
  color: #fff9f0;
  background: #c9975b;
  border-color: #7a5c42;
}

.tour-tooltip__btn--ghost {
  background: transparent;
  border-color: transparent;
  color: #7a5c42;
}

.tour-tabs-legend__intro {
  margin: 0 0 10px;
}

.tour-tabs-legend__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 40vh;
  overflow-y: auto;
}

.tour-tabs-legend__item {
  display: grid;
  grid-template-columns: 20px auto 1fr;
  align-items: baseline;
  gap: 8px;
  font-size: 0.86rem;
}

.tour-tabs-legend__icon {
  color: #c9975b;
  align-self: center;
}

.tour-tabs-legend__name {
  font-weight: 700;
  color: #7a5c42;
}

.tour-tabs-legend__desc {
  color: #3a2f1f;
}

.panel-header__help {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  color: #f4e8d8;
  background: transparent;
  border: 1px solid rgba(244, 232, 216, 0.5);
  border-radius: 4px;
  cursor: pointer;
}

.panel-header__help:hover {
  background: rgba(244, 232, 216, 0.18);
}
```

Import CSS trafia do `TourTooltip.jsx` — dodaj na górze pliku, pod importem `react-i18next`:

```jsx
import './GameTour.css';
```

- [ ] **Step 6: Uruchom testy, potwierdź zielone**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="TourTooltip|TabsLegend"`
Expected: PASS, 8 testów

- [ ] **Step 7: Commit**

```bash
git add src/components/tutorial/TourTooltip.jsx src/components/tutorial/TourTooltip.test.jsx src/components/tutorial/TabsLegend.jsx src/components/tutorial/TabsLegend.test.jsx src/components/tutorial/GameTour.css
git commit -m "feat: FEATURE-134 tutorial tooltip and tab legend"
```

---

### Task 6: `react-joyride`, komponent `GameTour` i wpięcie w ekran gry

**Files:**
- Modify: `package.json` (nowa zależność)
- Create: `src/components/tutorial/GameTour.jsx`
- Modify: `src/components/GameSession.jsx` — import, render obok `ToastStack` (`:1140`)
- Modify: `src/components/panels/RightPanel.jsx:233-235` — przycisk `?` w nagłówku, nowy prop `onStartTutorial`

**Interfaces:**
- Consumes: `useGameTour`, `seenKey` (Task 4), `titleKeyFor`, `bodyKeyFor` (Task 2), `TourTooltip`, `TabsLegend` (Task 5).
- Produces: `GameTour({ role, controlScheme, panels, onReveal, startSignal })` — `startSignal` to licznik: każde jego zwiększenie uruchamia samouczek od nowa (tak przycisk `?` steruje komponentem bez ref-a).

- [ ] **Step 1: Zainstaluj bibliotekę**

Run: `npm install --save-exact react-joyride@3.2.0`
Expected: `package.json` ma `"react-joyride": "3.2.0"`, instalacja bez błędu peer dependencies

Run: `grep '"react-joyride"' package.json`
Expected: `    "react-joyride": "3.2.0",`

- [ ] **Step 2: Napisz `GameTour`**

Utwórz `src/components/tutorial/GameTour.jsx`:

```jsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Joyride, { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useGameTour } from './useGameTour';
import { titleKeyFor, bodyKeyFor } from './tourSteps';
import TourTooltip from './TourTooltip';
import TabsLegend from './TabsLegend';

const JOYRIDE_STYLES = {
  options: {
    zIndex: 20000,
    arrowColor: '#f4e8d8',
    overlayColor: 'rgba(15, 10, 5, 0.65)',
    spotlightShadow: '0 0 18px rgba(201, 151, 91, 0.6)',
  },
};

const GameTour = ({ role, controlScheme, panels, onReveal, startSignal }) => {
  const { t, i18n } = useTranslation();
  const { steps, stepIndex, running, start, goTo, finish } = useGameTour({ role, panels, onReveal });
  const lastSignal = useRef(startSignal);

  // Przycisk "?" podbija licznik — reagujemy tylko na zmianę, nie na pierwszy render.
  useEffect(() => {
    if (startSignal === lastSignal.current) return;
    lastSignal.current = startSignal;
    start();
  }, [startSignal, start]);

  const joyrideSteps = useMemo(
    () => steps.map(step => ({
      target: step.target,
      placement: step.placement,
      disableBeacon: true,
      title: t(titleKeyFor(step)),
      content: step.id === 'tabsNav'
        ? <TabsLegend isGM={role === 'gm'} />
        : <p>{t(bodyKeyFor(step, { controlScheme, role }))}</p>,
    })),
    // i18n.language w zależnościach: zmiana języka w trakcie przebudowuje teksty.
    [steps, role, controlScheme, t, i18n.language]
  );

  const handleCallback = useCallback((data) => {
    const { status, type, action, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finish();
      return;
    }
    // Kotwica zniknęła w trakcie (np. po fetchGameState) — idziemy dalej,
    // zamiast zostawiać overlay wiszący na pustym miejscu.
    if (type === EVENTS.TARGET_NOT_FOUND) {
      goTo(index + 1);
      return;
    }
    if (type === EVENTS.STEP_AFTER) {
      goTo(action === ACTIONS.PREV ? index - 1 : index + 1);
    }
  }, [finish, goTo]);

  if (!running || joyrideSteps.length === 0) return null;

  return (
    <Joyride
      run={running}
      stepIndex={stepIndex}
      steps={joyrideSteps}
      continuous
      showSkipButton
      disableOverlayClose
      disableScrolling
      spotlightPadding={6}
      tooltipComponent={TourTooltip}
      styles={JOYRIDE_STYLES}
      callback={handleCallback}
    />
  );
};

export default GameTour;
```

- [ ] **Step 3: Wepnij `GameTour` w `GameSession`**

W `src/components/GameSession.jsx` dodaj import obok pozostałych importów komponentów:

```jsx
import GameTour from './tutorial/GameTour';
```

Nad `<ToastStack ... />` (dziś linia 1140) wstaw:

```jsx
      <GameTour
        role={gameState ? (isGM ? 'gm' : 'player') : null}
        controlScheme={controlScheme}
        panels={tourPanels}
        onReveal={revealForTour}
        startSignal={tutorialSignal}
      />
```

Obok pozostałych `useState` (przy linii 49) dodaj licznik startu:

```jsx
  const [tutorialSignal, setTutorialSignal] = useState(0);
```

Pod `isGMRef.current = isGM;` (dziś linia 878) dodaj obie wartości przekazywane do samouczka:

```jsx
  // Nowy obiekt przy każdej zmianie widoczności paneli — hook samouczka czeka
  // dokładnie na tę zmianę, zanim wpuści krok, którego kotwica siedzi w panelu.
  const tourPanels = useMemo(
    () => ({ leftHidden: leftPanelHidden, rightHidden: rightPanelHidden, topCollapsed: topBarsCollapsed }),
    [leftPanelHidden, rightPanelHidden, topBarsCollapsed]
  );

  const revealForTour = useCallback((step) => {
    if (step.reveal === 'left') setLeftPanelHidden(false);
    if (step.reveal === 'right') setRightPanelHidden(false);
    if (step.reveal === 'top') setTopBarsCollapsed(false);
  }, []);
```

Sprawdź, czy `useMemo` i `useCallback` są już w imporcie Reacta na górze pliku; jeśli któregoś brakuje, dopisz go.

- [ ] **Step 4: Dodaj przycisk `?` do prawego panelu**

W `src/components/panels/RightPanel.jsx` dopisz import ikony obok pozostałych importów MUI:

```jsx
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
```

Do listy propsów komponentu (obok `onTabChange`) dodaj `onStartTutorial,`.

Zamień nagłówek (linie 232-235) na:

```jsx
      <header className="panel-header">
        <h2 className="panel-header__title">{t('rightPanel.title')}</h2>
        <button
          type="button"
          className="panel-header__help"
          onClick={onStartTutorial}
          title={t('tutorial.button')}
          aria-label={t('tutorial.button')}
        >
          <HelpOutlineIcon fontSize="small" />
        </button>
      </header>
```

`.panel-header` ma już `display: flex; justify-content: space-between` (`src/style.css:188-195`), więc przycisk sam ląduje po prawej — nie ruszaj tam CSS.

W `src/components/GameSession.jsx` przekaż do `<RightPanel ... />` (dziś linia 1088) nowy prop:

```jsx
          onStartTutorial={() => setTutorialSignal(n => n + 1)}
```

- [ ] **Step 5: Uruchom cały pakiet testów**

Run: `CI=true npm test -- --watchAll=false`
Expected: PASS wszędzie poza znanym baseline `App.test.js` (axios ESM). Testy z zadań 1-5 zielone.

Run: `CI=true npx eslint src/components/tutorial src/components/GameSession.jsx src/components/panels/RightPanel.jsx`
Expected: brak wyjścia

- [ ] **Step 6: Przebuduj kontener frontendu**

Run: `docker compose up -d --build --renew-anon-volumes frontend`
Expected: kontener wstaje, w logach brak `Module not found: Error: Can't resolve 'react-joyride'`

Nazwę usługi sprawdź w `docker-compose.yml`, jeśli nie brzmi `frontend`.

- [ ] **Step 7: Weryfikacja ręczna**

Przejdź to ręcznie i zanotuj wynik każdego punktu:

1. Konto MG, wejście do gry **ze sceną**: samouczek startuje sam. Liczba kroków zależy od tego, co jest na ekranie — `.window-bar` nie istnieje, dopóki nie ma otwartego okna karty postaci (`WindowBar.jsx:73` zwraca `null` przy pustej liście), więc w świeżej grze krok `windowBar` wypada i MG dostaje **9 kroków**. Otwórz najpierw jakąś kartę postaci i wyczyść flagę, żeby zobaczyć pełne 10.
2. Schowaj lewy i prawy panel oraz zwiń górne belki **przed** startem (wyczyść flagę: `localStorage.removeItem('tutorialSeen:gm')`, odśwież): kroki 1-2 same wysuwają lewy panel, krok 4 rozwija belki, kroki 9-10 wysuwają prawy panel. Spotlight zawsze trafia w widoczny element.
3. Gra **bez sceny**: odpadają `layerSelector` i `drawingToolbar` (`.scene-tools` się nie renderuje), więc MG ma 8 kroków z otwartym oknem karty postaci albo 7 bez niego. Licznik kończy się na tej samej liczbie, na której się zaczął, i nic nie wisi na pustym miejscu. Krok `sceneControls` **zostaje**: `SceneViewport` bez sceny i tak renderuje `<div className="scene-viewport">` (`SceneViewport.jsx:611`), więc kotwica istnieje — spotlight obejmuje pusty obszar mapy, co jest zamierzone.
4. Konto gracza w tej samej grze: brak kroku o scenach i o warstwie, krok o narzędziach mówi o przesuwaniu, miarce i rysowaniu. Kroków 8 przy otwartym oknie karty postaci, 7 bez niego (patrz punkt 1).
5. Przełącz `controlScheme` na `classic` w zakładce Ustawienia Ogólne, uruchom samouczek przyciskiem `?`: krok o mapie mówi o prawym przycisku.
6. „Pomiń" w połowie, odświeżenie strony: samouczek **nie** startuje ponownie.
7. Przycisk `?` przy nagłówku „Ustawienia": uruchamia samouczek mimo ustawionej flagi.
8. Przełącz język na EN w trakcie samouczka: teksty zmieniają się bez restartu.
9. `localStorage`: po skończeniu jest `tutorialSeen:gm`, a `tutorialSeen:player` nie istnieje.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/tutorial/GameTour.jsx src/components/GameSession.jsx src/components/panels/RightPanel.jsx
git commit -m "feat: FEATURE-134 game screen tutorial tour for GM and player"
```

---

## Poza zakresem tego planu

- samouczki per zakładka
- samouczek zadaniowy „jak uruchomić pierwszą grę"
- trwały zapis stanu samouczka na modelu `User` (dziś `localStorage`)
- samouczki innych ekranów (lobby, kreator postaci)
