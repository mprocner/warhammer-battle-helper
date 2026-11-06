# Strona changeloga — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publiczna strona `/changelog` z wersją 1.0.0 opisującą całą aplikację, kropką „nowości” i czterema punktami wejścia.

**Architecture:** Struktura wersji w `src/changelog/releases.js`, teksty w nowym namespace i18n `changelog` (en/pl). Stan „widziane” w `localStorage`, czytany przez `useSyncExternalStore`, więc wszystkie kropki gasną naraz. Strona na wzór `Licenses.jsx` (MUI `Container` + `Paper`).

**Tech Stack:** React 19, react-router-dom 6, i18next 25, MUI 7 (`@mui/material`, `@mui/icons-material`), Jest + Testing Library (CRA).

Spec: `docs/superpowers/specs/2026-11-06-changelog-page-design.md`

## Global Constraints

- Wszystkie stringi w JSX przez `t('klucz')`; klucze angielskie; tekst en i pl dodawany równolegle.
- Ikony wyłącznie z `@mui/icons-material`.
- Komentarze w kodzie po angielsku.
- Wersje w formacie SemVer `MAJOR.MINOR.PATCH`, najnowsza pierwsza w `RELEASES`.
- Klucz wersji w i18n: `version` z `.` zamienionymi na `_` (`1.0.0` → `1_0_0`).
- Każdy dostęp do `localStorage` w `try/catch`.
- Testy: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Znany baseline fail: `App.test.js` (axios ESM).
- Commity na `main`; sprawdzaj gałąź w tym samym poleceniu co commit. Każdy commit kończy się trailerami `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` i `Claude-Session: https://claude.ai/code/session_01WizxuXemF1hTKMHJuCoQG1`. Nie stageuj `nginx.conf` ani `package-lock.json` (cudze zmiany w drzewie).

Ścieżki niżej względem `warhammer-battle-helper-front/`, chyba że zaznaczono inaczej.

---

### Task 1: Dane wersji i namespace `changelog`

**Files:**
- Create: `src/changelog/releases.js`
- Create: `src/locales/en/changelog.json`
- Create: `src/locales/pl/changelog.json`
- Modify: `src/i18n.js` (import + `resources`)
- Test: `src/changelog/releases.test.js`

**Interfaces:**
- Produces: `RELEASES: Array<{ version: string, date: string /* ISO yyyy-mm-dd */, sections: Array<{ id: string, items: string[] }> }>`, `LATEST_VERSION: string`, `releaseKey(version: string): string`. Namespace i18n `changelog` z kluczami `title`, `intro`, `latest`, `sections.<id>`, `releases.<releaseKey>.<sectionId>.<itemId>`.

- [ ] **Step 1: Napisz failing test**

`src/changelog/releases.test.js`:

```js
import en from '../locales/en/changelog.json';
import pl from '../locales/pl/changelog.json';
import { RELEASES, LATEST_VERSION, releaseKey } from './releases';

const SEMVER = /^\d+\.\d+\.\d+$/;
const parts = (version) => version.split('.').map(Number);
const isNewer = (a, b) => {
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
};

describe('RELEASES', () => {
  it('lists unique semver versions, newest first', () => {
    RELEASES.forEach(({ version }) => expect(version).toMatch(SEMVER));
    for (let i = 1; i < RELEASES.length; i += 1) {
      expect(isNewer(RELEASES[i - 1].version, RELEASES[i].version)).toBe(true);
    }
    expect(LATEST_VERSION).toBe(RELEASES[0].version);
  });

  it('dates every release with a valid ISO day', () => {
    RELEASES.forEach(({ date }) => {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(date).getTime())).toBe(false);
    });
  });

  it('has an en and pl text for every section and item', () => {
    RELEASES.forEach(({ version, sections }) => {
      sections.forEach(({ id, items }) => {
        [en, pl].forEach(locale => {
          expect(locale.sections[id]).toEqual(expect.any(String));
          items.forEach(item => {
            expect(locale.releases[releaseKey(version)]?.[id]?.[item]).toEqual(expect.any(String));
          });
        });
      });
    });
  });

  it('keeps en and pl release texts in step', () => {
    expect(Object.keys(pl.releases).sort()).toEqual(Object.keys(en.releases).sort());
    expect(Object.keys(pl.sections).sort()).toEqual(Object.keys(en.sections).sort());
  });

  it('turns dots into underscores for i18n keys', () => {
    expect(releaseKey('1.10.2')).toBe('1_10_2');
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=releases`
Expected: FAIL, `Cannot find module './releases'`.

- [ ] **Step 3: Utwórz `src/changelog/releases.js`**

```js
// Release history shown on /changelog. Structure only — texts live in the `changelog`
// i18n namespace under releases.<releaseKey(version)>.<sectionId>.<itemId>.
// Newest release first. Area sections describe the first release; later releases use
// `added`, `changed` and `fixed`.
export const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-11-06',
    sections: [
      { id: 'scene', items: ['scenes', 'grid', 'tools', 'tokens', 'overlays', 'controls'] },
      { id: 'characters', items: ['sheet', 'manage', 'conditions', 'rolls', 'favourites'] },
      { id: 'creator', items: ['fields', 'dice', 'presets', 'token', 'sharing', 'preview'] },
      { id: 'dice', items: ['chat', 'visibility', 'myRolls'] },
      { id: 'materials', items: ['handouts', 'files', 'music', 'notes'] },
      { id: 'games', items: ['lobby', 'players', 'participant', 'online'] },
      { id: 'systems', items: ['builtIn', 'custom'] },
      { id: 'minigames', items: ['dice'] },
      { id: 'tutorials', items: ['tours'] },
      { id: 'accounts', items: ['register', 'profile', 'stats', 'language', 'legal'] },
    ],
  },
];

export const LATEST_VERSION = RELEASES[0].version;

// i18next treats dots as nesting separators, so a version cannot be a key as-is.
export const releaseKey = (version) => version.replaceAll('.', '_');
```

- [ ] **Step 4: Utwórz `src/locales/en/changelog.json`**

```json
{
  "title": "What's new",
  "intro": "PlayRPG release history. The newest version is at the top.",
  "latest": "Latest",
  "sections": {
    "scene": "Scene and map",
    "characters": "Characters",
    "creator": "System creator",
    "dice": "Dice and chat",
    "materials": "Handouts, files, music and notes",
    "games": "Games and players",
    "systems": "Game systems",
    "minigames": "Minigames",
    "tutorials": "Help",
    "accounts": "Account",
    "added": "New",
    "changed": "Changed",
    "fixed": "Fixed"
  },
  "releases": {
    "1_0_0": {
      "scene": {
        "scenes": "Several scenes per game; the GM moves the party from one to the next.",
        "grid": "A grid with your own cell size, distance units and snapping.",
        "tools": "Select, ruler and drawing for everyone, plus fog of war for the GM.",
        "tokens": "Character and image tokens: move, box-select, rotate, resize and duplicate.",
        "overlays": "Health, condition slots and bars right on the token, and tokens hidden from players.",
        "controls": "Ping the map, pan with the right mouse button and pick the control scheme that suits you."
      },
      "characters": {
        "sheet": "A character sheet for every system, in a popup or in its own browser tab.",
        "manage": "Create, edit, clone and delete characters; the GM decides which players see each one.",
        "conditions": "Conditions such as bleeding or stunned, and marking a character as dead.",
        "rolls": "Roll characteristics, skills and weapons straight from the sheet, with modifiers.",
        "favourites": "Favourite skills and weapons at hand in the character panel."
      },
      "creator": {
        "fields": "Build your own sheet from sections and 18 field types: attributes, tables, bars, formula fields, skill trees and more.",
        "dice": "Your own roll rules: dice under the chat, a numeric modifier or edge and setback dice, and success levels per step or named thresholds.",
        "presets": "Preset weapons and rows added to every new character.",
        "token": "Token look for your system: slots and bars shown on the map.",
        "sharing": "Describe a template, share it with other users, clone it and sync changes into a running game.",
        "preview": "Preview a template's sheet before you pick it for a game."
      },
      "dice": {
        "chat": "Chat with a roll log and the /roll (/r), /gmroll (/gmr) and /help commands.",
        "visibility": "Choose who sees a roll: everyone, the GM and you, the GM only, or one player.",
        "myRolls": "Show only your own rolls in the log."
      },
      "materials": {
        "handouts": "Handouts in folders, shared with everyone or with chosen players.",
        "files": "An image library with folders for the GM.",
        "music": "A music library and playlists played for the whole party, with looping and your own volume.",
        "notes": "Private and public notes with text formatting."
      },
      "games": {
        "lobby": "A game list; create a game for the system of your choice, filtered by language.",
        "players": "Invite players, remove them or leave a game.",
        "participant": "Your avatar and name in each game: from your account, from your character or your own.",
        "online": "See who is online."
      },
      "systems": {
        "builtIn": "Ready sheets for Warhammer Fantasy Roleplay 4e, Call of Cthulhu 7e, Call of Cthulhu: Dark Ages and SRD 5.2.",
        "custom": "Any other system you build in the system creator."
      },
      "minigames": {
        "dice": "Yahtzee and dice poker to play with the party between scenes."
      },
      "tutorials": {
        "tours": "Interactive tutorials: the question mark next to a tab header walks you through the screen."
      },
      "accounts": {
        "register": "An account with email verification and a reset for a forgotten password.",
        "profile": "A username and an avatar with built-in cropping.",
        "stats": "Your statistics: dice rolls and time spent online.",
        "language": "The interface in English and Polish.",
        "legal": "Cookie consent, privacy policy, terms of service and licenses."
      }
    }
  }
}
```

- [ ] **Step 5: Utwórz `src/locales/pl/changelog.json`**

```json
{
  "title": "Co nowego",
  "intro": "Historia wersji PlayRPG. Najnowsza wersja jest na górze.",
  "latest": "Najnowsza",
  "sections": {
    "scene": "Scena i mapa",
    "characters": "Postacie",
    "creator": "Kreator systemów",
    "dice": "Kości i czat",
    "materials": "Handouty, pliki, muzyka i notatki",
    "games": "Gry i gracze",
    "systems": "Systemy gry",
    "minigames": "Minigry",
    "tutorials": "Pomoc",
    "accounts": "Konto",
    "added": "Nowe",
    "changed": "Zmiany",
    "fixed": "Poprawki"
  },
  "releases": {
    "1_0_0": {
      "scene": {
        "scenes": "Wiele scen w grze; mistrz gry przenosi drużynę z jednej na drugą.",
        "grid": "Siatka z własnym rozmiarem pola, jednostkami odległości i przyciąganiem.",
        "tools": "Zaznaczanie, miarka i rysowanie dla wszystkich, a dla mistrza gry mgła wojny.",
        "tokens": "Tokeny postaci i obrazków: przesuwanie, zaznaczanie ramką, obrót, skalowanie i duplikowanie.",
        "overlays": "Zdrowie, sloty stanów i paski bezpośrednio na tokenie oraz tokeny ukryte przed graczami.",
        "controls": "Ping na mapie, przesuwanie mapy prawym przyciskiem i wybór schematu sterowania."
      },
      "characters": {
        "sheet": "Karta postaci dla każdego systemu, w okienku albo w osobnej karcie przeglądarki.",
        "manage": "Tworzenie, edycja, klonowanie i usuwanie postaci; mistrz gry decyduje, którzy gracze widzą postać.",
        "conditions": "Stany takie jak krwawienie czy ogłuszenie oraz oznaczenie postaci jako zabitej.",
        "rolls": "Rzuty na cechy, umiejętności i bronie prosto z karty, z modyfikatorami.",
        "favourites": "Ulubione umiejętności i bronie pod ręką w panelu postaci."
      },
      "creator": {
        "fields": "Własna karta z sekcji i 18 typów pól: atrybuty, tabele, paski, pola z formułą, drzewa umiejętności i więcej.",
        "dice": "Własne zasady rzutów: kości pod czatem, modyfikator liczbowy albo kości przewagi i utrudnienia oraz poziomy sukcesu co krok lub nazwane progi.",
        "presets": "Predefiniowane bronie i wiersze dodawane każdej nowej postaci.",
        "token": "Wygląd tokena dla twojego systemu: sloty i paski widoczne na mapie.",
        "sharing": "Opis szablonu, udostępnianie innym użytkownikom, klonowanie i synchronizacja zmian z trwającą grą.",
        "preview": "Podgląd karty szablonu, zanim wybierzesz go dla gry."
      },
      "dice": {
        "chat": "Czat z logiem rzutów i komendami /roll (/r), /gmroll (/gmr) oraz /help.",
        "visibility": "Wybór, kto widzi rzut: wszyscy, mistrz gry i ty, tylko mistrz gry albo jeden gracz.",
        "myRolls": "Widok tylko twoich rzutów w logu."
      },
      "materials": {
        "handouts": "Handouty w folderach, udostępniane wszystkim albo wybranym graczom.",
        "files": "Biblioteka obrazków z folderami dla mistrza gry.",
        "music": "Biblioteka muzyki i playlisty odtwarzane całej drużynie, z zapętleniem i własną głośnością.",
        "notes": "Prywatne i publiczne notatki z formatowaniem tekstu."
      },
      "games": {
        "lobby": "Lista gier; tworzenie gry w wybranym systemie, z filtrem języka.",
        "players": "Zapraszanie i wyrzucanie graczy oraz opuszczanie gry.",
        "participant": "Twój avatar i podpis w każdej grze: z konta, z postaci albo własny.",
        "online": "Podgląd, kto jest online."
      },
      "systems": {
        "builtIn": "Gotowe karty dla Warhammer Fantasy Roleplay 4e, Call of Cthulhu 7e, Call of Cthulhu: Dark Ages i SRD 5.2.",
        "custom": "Każdy inny system zbudowany w kreatorze systemów."
      },
      "minigames": {
        "dice": "Yahtzee i kościany poker dla drużyny między scenami."
      },
      "tutorials": {
        "tours": "Interaktywne samouczki: znak zapytania przy nagłówku zakładki oprowadza po ekranie."
      },
      "accounts": {
        "register": "Konto z weryfikacją e-mail i resetem zapomnianego hasła.",
        "profile": "Nazwa użytkownika i avatar z wbudowanym kadrowaniem.",
        "stats": "Twoje statystyki: rzuty kośćmi i czas online.",
        "language": "Interfejs po polsku i angielsku.",
        "legal": "Zgoda na cookies, polityka prywatności, regulamin i licencje."
      }
    }
  }
}
```

- [ ] **Step 6: Zarejestruj namespace w `src/i18n.js`**

Pod importami `armour` dodaj:

```js
import enChangelog from './locales/en/changelog.json';
import plChangelog from './locales/pl/changelog.json';
```

W `resources.en` po `armour: enArmour` dodaj `changelog: enChangelog`, w `resources.pl` po `armour: plArmour` dodaj `changelog: plChangelog` (pamiętaj o przecinku po `armour`).

- [ ] **Step 7: Uruchom test — ma przejść**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=releases`
Expected: PASS, 5 testów.

- [ ] **Step 8: Zweryfikuj treść 1.0.0 w kodzie**

Treść pochodzi z inwentaryzacji w PR #3 (`git show origin/claude/project-thread-iqxj0z:docs/knowledge-base/00-inwentaryzacja.md`), której nie zmergowano. Dla każdego punktu sprawdź na `main`, że funkcja istnieje i jest osiągalna dla użytkownika. Kandydaci do sprawdzenia w pierwszej kolejności:
- `minigames.dice`: grep `yahtzee`/`poker` w `src/components/tabs/minigame/` i trasy w `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go`. Inwentaryzacja zauważa, że `YahtzeeHandler.go` nie jest podłączony w `main.go`. Ustal, czy minigry działają inną drogą (WS); jeśli nie, usuń punkt i sekcję z `releases.js` i obu JSON-ów.
- `dice.myRolls`: grep `myRolls` w `src/components/LogWindow.jsx`.
- `creator.fields`: policz typy w `FIELD_TYPES` w `src/components/creator/TemplateBuilder.jsx`; popraw „18”, jeśli się różni.
- `systems.builtIn`: porównaj z `src/systems/registry.js`.

Każdą poprawkę nanieś w obu językach i ponownie uruchom test ze Step 7.

- [ ] **Step 9: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/changelog/releases.js warhammer-battle-helper-front/src/changelog/releases.test.js \
  warhammer-battle-helper-front/src/locales/en/changelog.json warhammer-battle-helper-front/src/locales/pl/changelog.json \
  warhammer-battle-helper-front/src/i18n.js && \
git commit -m "feat: changelog release data and i18n namespace"
```

---

### Task 2: Stan „widziane” i kropka

**Files:**
- Create: `src/changelog/seen.js`
- Create: `src/changelog/ChangelogDot.jsx`
- Modify: `src/style.css` (nowy blok na końcu pliku)
- Test: `src/changelog/seen.test.jsx`

**Interfaces:**
- Consumes: `LATEST_VERSION` z `src/changelog/releases.js`.
- Produces: `markLatestSeen(): void`, `useChangelogUnseen(): boolean` (z `seen.js`); `<ChangelogDot inline?: boolean />` (default export `ChangelogDot.jsx`) — renderuje `<span className="changelog-dot">` (z `changelog-dot--inline` gdy `inline`) albo `null`. Klucz `localStorage`: `changelog.lastSeenVersion`.

- [ ] **Step 1: Napisz failing test**

`src/changelog/seen.test.jsx`:

```jsx
import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { LATEST_VERSION } from './releases';
import { markLatestSeen, useChangelogUnseen } from './seen';
import ChangelogDot from './ChangelogDot';

const KEY = 'changelog.lastSeenVersion';

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('useChangelogUnseen', () => {
  it('is unseen when nothing was stored', () => {
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(true);
  });

  it('is unseen when an older version was stored', () => {
    localStorage.setItem(KEY, '0.0.1');
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(true);
  });

  it('is seen when the latest version was stored', () => {
    localStorage.setItem(KEY, LATEST_VERSION);
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(false);
  });

  it('flips to seen in mounted components when marked', () => {
    const { result } = renderHook(() => useChangelogUnseen());
    act(() => markLatestSeen());
    expect(result.current).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(LATEST_VERSION);
  });

  it('treats blocked storage as unseen without throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(true);
    expect(() => act(() => markLatestSeen())).not.toThrow();
    expect(result.current).toBe(true);
  });
});

describe('ChangelogDot', () => {
  it('shows until the latest version is seen', () => {
    const { container } = render(<ChangelogDot inline />);
    expect(container.querySelector('.changelog-dot.changelog-dot--inline')).toBeInTheDocument();
    act(() => markLatestSeen());
    expect(container.querySelector('.changelog-dot')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=changelog/seen`
Expected: FAIL, `Cannot find module './seen'`.

- [ ] **Step 3: Utwórz `src/changelog/seen.js`**

```js
import { useSyncExternalStore } from 'react';
import { LATEST_VERSION } from './releases';

const STORAGE_KEY = 'changelog.lastSeenVersion';
// Same-tab signal; the native `storage` event covers the other tabs.
const SEEN_EVENT = 'changelog-seen';

const readLastSeen = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const markLatestSeen = () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, LATEST_VERSION);
  } catch {
    // Blocked storage only means the dot keeps showing.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
};

const subscribe = (onChange) => {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

const isUnseen = () => readLastSeen() !== LATEST_VERSION;

export const useChangelogUnseen = () => useSyncExternalStore(subscribe, isUnseen);
```

- [ ] **Step 4: Utwórz `src/changelog/ChangelogDot.jsx`**

```jsx
import React from 'react';
import { useChangelogUnseen } from './seen';

// Marks a link to /changelog while the latest release is unseen. Absolutely positioned
// on its parent's corner by default; `inline` sits it next to text instead.
const ChangelogDot = ({ inline = false }) => {
  const unseen = useChangelogUnseen();
  if (!unseen) return null;
  return <span className={`changelog-dot${inline ? ' changelog-dot--inline' : ''}`} aria-hidden="true" />;
};

export default ChangelogDot;
```

- [ ] **Step 5: Dodaj CSS na końcu `src/style.css`**

```css
/* ========== Changelog "new release" dot (ChangelogDot.jsx) ========== */
/* Parent must be position: relative (MUI IconButton already is). */
.changelog-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #c9975b;
    box-shadow: 0 0 0 2px #7a5c42;
    pointer-events: none;
}

/* Doubled selector: the modifier must win over the base regardless of order. */
.changelog-dot.changelog-dot--inline {
    position: static;
    display: inline-block;
    margin-left: 6px;
    vertical-align: middle;
}
```

- [ ] **Step 6: Uruchom test — ma przejść**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=changelog/seen`
Expected: PASS, 6 testów.

- [ ] **Step 7: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/changelog/seen.js warhammer-battle-helper-front/src/changelog/ChangelogDot.jsx \
  warhammer-battle-helper-front/src/changelog/seen.test.jsx warhammer-battle-helper-front/src/style.css && \
git commit -m "feat: changelog seen state and unseen dot"
```

---

### Task 3: Strona `/changelog`

**Files:**
- Create: `src/components/Changelog.jsx`
- Modify: `src/App.js` (import + trasa po `/licenses`)
- Test: `src/components/Changelog.test.jsx`

**Interfaces:**
- Consumes: `RELEASES`, `releaseKey` (Task 1); `markLatestSeen` (Task 2); namespace `changelog`.
- Produces: default export `Changelog`, named export `SECTION_ICONS: Record<string, MuiIcon>`; trasa `/changelog`; kotwice `id="v<version>"`.

- [ ] **Step 1: Napisz failing test**

`src/components/Changelog.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { RELEASES, LATEST_VERSION } from '../changelog/releases';
import Changelog, { SECTION_ICONS } from './Changelog';

afterEach(() => localStorage.clear());

describe('Changelog', () => {
  it('renders every release with its sections and anchors', () => {
    const { container } = render(<Changelog />);
    expect(screen.getByRole('heading', { level: 1, name: i18n.t('changelog:title') })).toBeInTheDocument();
    RELEASES.forEach(({ version, sections }) => {
      expect(container.querySelector(`[id="v${version}"]`)).toBeInTheDocument();
      sections.forEach(({ id }) => {
        expect(screen.getAllByRole('heading', { level: 3, name: i18n.t(`changelog:sections.${id}`) }).length)
          .toBeGreaterThan(0);
      });
    });
    expect(screen.getByText(i18n.t('changelog:latest'))).toBeInTheDocument();
  });

  it('marks the latest release as seen on visit', () => {
    render(<Changelog />);
    expect(localStorage.getItem('changelog.lastSeenVersion')).toBe(LATEST_VERSION);
  });

  it('has an icon for every section any release uses', () => {
    RELEASES.forEach(({ sections }) => {
      sections.forEach(({ id }) => expect(SECTION_ICONS[id]).toBeDefined());
    });
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=components/Changelog`
Expected: FAIL, `Cannot find module './Changelog'`.

- [ ] **Step 3: Utwórz `src/components/Changelog.jsx`**

```jsx
import React, { useEffect } from 'react';
import { Container, Box, Paper, Typography, Chip, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import MapIcon from '@mui/icons-material/Map';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import CasinoIcon from '@mui/icons-material/Casino';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import GroupsIcon from '@mui/icons-material/Groups';
import CategoryIcon from '@mui/icons-material/Category';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import SchoolIcon from '@mui/icons-material/School';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import BugReportIcon from '@mui/icons-material/BugReport';
import { RELEASES, releaseKey } from '../changelog/releases';
import { markLatestSeen } from '../changelog/seen';

export const SECTION_ICONS = {
    scene: MapIcon,
    characters: PersonOutlineIcon,
    creator: DashboardCustomizeIcon,
    dice: CasinoIcon,
    materials: LibraryBooksIcon,
    games: GroupsIcon,
    systems: CategoryIcon,
    minigames: SportsEsportsIcon,
    tutorials: SchoolIcon,
    accounts: AccountCircleIcon,
    added: AutoAwesomeIcon,
    changed: BuildIcon,
    fixed: BugReportIcon,
};

// Release dates are calendar days; UTC keeps them from shifting a day west of Greenwich.
const formatDate = (iso, language) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));

const Changelog = () => {
    const { t, i18n } = useTranslation('changelog');

    useEffect(() => {
        markLatestSeen();
        // The SPA renders after the browser's own hash scroll, so /changelog#v1.0.0 needs a nudge.
        const anchor = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        anchor?.scrollIntoView?.();
    }, []);

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
                        {t('title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 4 }}>
                        {t('intro')}
                    </Typography>
                    {RELEASES.map(({ version, date, sections }, index) => (
                        <Box component="section" key={version} id={`v${version}`} sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                                <Typography variant="h5" component="h2">{version}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {formatDate(date, i18n.language)}
                                </Typography>
                                {index === 0 && <Chip label={t('latest')} color="secondary" size="small" />}
                            </Box>
                            <Divider sx={{ my: 2 }} />
                            {sections.map(({ id, items }) => {
                                const Icon = SECTION_ICONS[id];
                                return (
                                    <Box key={id} sx={{ mb: 2 }}>
                                        <Typography variant="h6" component="h3" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Icon fontSize="small" color="primary" />
                                            {t(`sections.${id}`)}
                                        </Typography>
                                        <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 3 }}>
                                            {items.map(item => (
                                                <Typography component="li" variant="body1" key={item}>
                                                    {t(`releases.${releaseKey(version)}.${id}.${item}`)}
                                                </Typography>
                                            ))}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    ))}
                </Paper>
            </Box>
        </Container>
    );
};

export default Changelog;
```

- [ ] **Step 4: Dodaj trasę w `src/App.js`**

Po `import Licenses from './components/Licenses';` dodaj:

```js
import Changelog from './components/Changelog';
```

Po `<Route path="/licenses" element={<Licenses />} />` dodaj:

```jsx
                        <Route path="/changelog" element={<Changelog />} />
```

- [ ] **Step 5: Uruchom test — ma przejść**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=components/Changelog`
Expected: PASS, 3 testy.

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/components/Changelog.jsx warhammer-battle-helper-front/src/components/Changelog.test.jsx \
  warhammer-battle-helper-front/src/App.js && \
git commit -m "feat: public /changelog page"
```

---

### Task 4: Punkty wejścia

**Files:**
- Modify: `src/components/Navigation.jsx` (import ikony i kropki, nowy `IconButton` przed privacy)
- Modify: `src/components/landing/LandingPage.jsx` (stopka po `landing__cta-band`)
- Modify: `src/components/GameLobby.jsx` (link wersji pod siatką gier)
- Modify: `src/components/GameLobby.test.jsx:36` (render w `MemoryRouter`)
- Modify: `src/components/tabs/GeneralTab.jsx` (wiersz wersji w sekcji info o grze)
- Modify: `src/components/panels/RightPanel.jsx` (kropka na ikonie zakładki `general`)
- Modify: `src/components/panels/RightPanel.css` (`position: relative` na `.right-panel__tab-icon`)
- Modify: `src/style.css` (stopka landing)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`
- Test: `src/components/landing/LandingPage.test.jsx`

**Interfaces:**
- Consumes: `LATEST_VERSION` (Task 1), `<ChangelogDot inline? />` (Task 2), trasa `/changelog` (Task 3).
- Produces: klucze `navigation.changelog`, `landing.footer.label`, `settings.version`, `settings.versionLink` (z `{{version}}`).

- [ ] **Step 1: Dodaj tłumaczenia**

`src/locales/en/translation.json`:
- w `navigation` po `"terms": "Terms of service"` dodaj `,"changelog": "What's new"`;
- w `settings` dodaj `"version": "Version"` i `"versionLink": "{{version}} — what's new"`;
- w `landing` dodaj `"footer": { "label": "Site links" }`.

`src/locales/pl/translation.json`:
- w `navigation` po `"terms": "Regulamin"` dodaj `,"changelog": "Co nowego"`;
- w `settings` dodaj `"version": "Wersja"` i `"versionLink": "{{version}} — co nowego"`;
- w `landing` dodaj `"footer": { "label": "Linki serwisu" }`.

Sprawdź poprawność JSON: `node -e "require('./src/locales/en/translation.json');require('./src/locales/pl/translation.json')"`.

- [ ] **Step 2: Napisz failing test stopki**

W `src/components/landing/LandingPage.test.jsx` w `describe('LandingPage', ...)` dodaj:

```jsx
  it('links the public pages from the footer', () => {
    renderPage(null);
    const footer = screen.getByRole('navigation', { name: i18n.t('landing.footer.label') });
    [
      ['navigation.changelog', '/changelog'],
      ['navigation.privacy', '/privacy'],
      ['navigation.terms', '/terms'],
      ['navigation.licenses', '/licenses'],
    ].forEach(([key, href]) => {
      expect(within(footer).getByRole('link', { name: i18n.t(key) })).toHaveAttribute('href', href);
    });
  });
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LandingPage`
Expected: FAIL, `Unable to find role="navigation"`.

- [ ] **Step 3: Stopka w `LandingPage.jsx`**

Dodaj `import { Link } from 'react-router-dom';` i stałą pod `FEATURES`:

```js
const FOOTER_LINKS = [
    { key: 'changelog', to: '/changelog' },
    { key: 'privacy', to: '/privacy' },
    { key: 'terms', to: '/terms' },
    { key: 'licenses', to: '/licenses' },
];
```

Po `</section>` zamykającym `landing__cta-band` (przed `<LandingLightbox`):

```jsx
            <footer className="landing__footer">
                <nav className="landing__footer-nav" aria-label={t('landing.footer.label')}>
                    {FOOTER_LINKS.map(({ key, to }) => (
                        <Link key={key} to={to} className="landing__footer-link">
                            {t(`navigation.${key}`)}
                        </Link>
                    ))}
                </nav>
            </footer>
```

W `src/style.css` po regule `.landing__cta-band-title` (przed `@media (max-width: 768px)` landing):

```css
.landing__footer {
    padding: 20px 16px;
    background: #3a2f1f;
}

.landing__footer-nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 24px;
}

.landing__footer-link {
    color: #e8dcc4;
    font-size: 1rem;
    text-decoration: none;
}

.landing__footer-link:hover,
.landing__footer-link:focus-visible {
    color: #c9975b;
    text-decoration: underline;
}
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LandingPage`
Expected: PASS (w tym istniejący test parzystości kluczy `landing` en/pl).

- [ ] **Step 4: Ikona w `Navigation.jsx`**

Do importu z `@mui/icons-material` dodaj `NewReleases as NewReleasesIcon`. Pod importami:

```js
import ChangelogDot from '../changelog/ChangelogDot';
```

Przed `IconButton` z `PolicyIcon` (po komentarzu o I2):

```jsx
                        <IconButton
                            color="inherit"
                            onClick={() => navigate('/changelog')}
                            title={t('navigation.changelog')}
                        >
                            <NewReleasesIcon />
                            <ChangelogDot />
                        </IconButton>
```

- [ ] **Step 5: Link wersji w `GameLobby.jsx`**

Rozszerz import MUI o `Link`: `import { Alert, Box, Button, Card, Container, Link, Typography } from '@mui/material';`. Dodaj:

```js
import { Link as RouterLink } from 'react-router-dom';
import { LATEST_VERSION } from '../changelog/releases';
import ChangelogDot from '../changelog/ChangelogDot';
```

Między `</Box>` zamykającym siatkę gier a `</Box>` przed `</Container>` (linie ~141–142):

```jsx
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
            <Link component={RouterLink} to="/changelog" title={t('navigation.changelog')} variant="body2" color="text.secondary">
              {`v${LATEST_VERSION}`}
              <ChangelogDot inline />
            </Link>
          </Box>
```

W `src/components/GameLobby.test.jsx` dodaj `import { MemoryRouter } from 'react-router-dom';` i zmień linię 36 na:

```jsx
  return render(<MemoryRouter><GameLobby onJoinGame={() => {}} token="t" userEmail="gm@x.pl" /></MemoryRouter>);
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=GameLobby`
Expected: PASS.

- [ ] **Step 6: Wiersz wersji w `GeneralTab.jsx`**

Dodaj importy:

```js
import { LATEST_VERSION } from '../../changelog/releases';
import ChangelogDot from '../../changelog/ChangelogDot';
```

Po wierszu `settings.players` (przed `</div>` zamykającym `general-tab__game-info`):

```jsx
          <div className="general-tab__info-row">
            <span className="general-tab__label">{t('settings.version')}:</span>
            {/* New tab: following the link must not drop the player out of the session. */}
            <a className="general-tab__value general-tab__link" href="/changelog" target="_blank" rel="noopener noreferrer">
              {t('settings.versionLink', { version: LATEST_VERSION })}
              <ChangelogDot inline />
            </a>
          </div>
```

W `src/components/tabs/GeneralTab.css` po `.general-tab__value`:

```css
.general-tab__link {
  text-decoration: none;
}

.general-tab__link:hover,
.general-tab__link:focus-visible {
  color: #c9975b;
  text-decoration: underline;
}
```

- [ ] **Step 7: Kropka na zakładce Ogólne w `RightPanel.jsx`**

Dodaj `import ChangelogDot from '../../changelog/ChangelogDot';`. Zmień span ikony (linia ~241):

```jsx
              <span className="right-panel__tab-icon">
                {tab.icon}
                {tab.id === 'general' && <ChangelogDot />}
              </span>
```

W `src/components/panels/RightPanel.css` w `.right-panel__tab-icon` dodaj `position: relative;`. W `style.css` kropka ma `top: 4px; right: 4px` — na ikonie zakładki to ma siedzieć w rogu ikony; jeśli w przeglądarce wychodzi poza nią, dodaj w `RightPanel.css`:

```css
.right-panel__tab-icon .changelog-dot {
  top: -2px;
  right: -4px;
}
```

- [ ] **Step 8: Uruchom testy dotkniętych obszarów**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="LandingPage|GameLobby|tabDefinitions|TabsLegend|tourTranslations|changelog|Changelog"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/components/Navigation.jsx \
  warhammer-battle-helper-front/src/components/landing/LandingPage.jsx warhammer-battle-helper-front/src/components/landing/LandingPage.test.jsx \
  warhammer-battle-helper-front/src/components/GameLobby.jsx warhammer-battle-helper-front/src/components/GameLobby.test.jsx \
  warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx warhammer-battle-helper-front/src/components/tabs/GeneralTab.css \
  warhammer-battle-helper-front/src/components/panels/RightPanel.jsx warhammer-battle-helper-front/src/components/panels/RightPanel.css \
  warhammer-battle-helper-front/src/style.css \
  warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && \
git commit -m "feat: link the changelog from navigation, landing, lobby and game"
```

---

### Task 5: Reguła utrzymania, pełna suita, przegląd w przeglądarce

**Files:**
- Modify: `CLAUDE.md` (repo root, sekcja „Kluczowe konwencje”)

- [ ] **Step 1: Dopisz regułę do `CLAUDE.md`**

Na końcu listy w sekcji `### Kluczowe konwencje`:

```markdown
- **Changelog**: zmiana widoczna dla użytkownika dopisuje punkt do nowej wersji na początku
  `RELEASES` (`warhammer-battle-helper-front/src/changelog/releases.js`, sekcje `added` /
  `changed` / `fixed`, SemVer: PATCH poprawki, MINOR funkcje) oraz teksty w
  `src/locales/{en,pl}/changelog.json` — w tym samym commicie. `releases.test.js` pilnuje
  kolejności wersji i kompletności tłumaczeń.
```

- [ ] **Step 2: Pełna suita frontendu**

Run (z `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false`
Expected: wszystko PASS poza znanym `App.test.js` (axios ESM). Każdy inny fail to regresja — napraw przed commitem.

- [ ] **Step 3: Przegląd w przeglądarce**

Na lokalnym stacku (`:3000`):
1. Jako gość: `/` — ikona „Co nowego” w Navigation z kropką; stopka z czterema linkami; zawijanie stopki przy szerokości telefonu.
2. Kliknij ikonę → `/changelog`: tytuł, 1.0.0 z datą i chipem „Najnowsza”, 10 sekcji z ikonami; kropka w Navigation zgasła. Przełącz język — teksty i format daty się zmieniają.
3. `localStorage.removeItem('changelog.lastSeenVersion')`, zaloguj się: `/games` — `v1.0.0` z kropką w prawym dolnym rogu.
4. Wejdź do gry: kropka na ikonie zakładki Ogólne (pozycja w rogu ikony, nie poza przyciskiem); w zakładce wiersz „Wersja: 1.0.0 — co nowego” z kropką. Kliknięcie otwiera nową kartę; po powrocie do karty gry obie kropki zgasły.
5. `/changelog#v1.0.0` z nowej karty przewija do wersji.

- [ ] **Step 4: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add CLAUDE.md && git commit -m "docs: changelog maintenance rule"
```
