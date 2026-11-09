# Lobby role filter + search (PLAYRPG-298, PLAYRPG-299) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Above the lobby game grid, add role chips ("Running / Playing / All") and a name search, each shown only when it is useful, with the state kept in the URL.

**Architecture:** Frontend only. Pure filter functions (`lobbyFilter.js`) → hook reading/writing `?role=&q=` via `useSearchParams` (`useLobbyFilter.js`) → presentational bar + no-results card (`LobbyFilterBar.jsx`) → wired into `GameLobby.jsx`. Search reuses `findMatch` from `components/lobby/systemOptions.js`.

**Tech Stack:** React 19, react-router-dom 6 (`useSearchParams`), MUI 7 (`Chip`, `TextField`), i18next, Jest + Testing Library (CRA).

Spec: `docs/superpowers/specs/PLAYRPG-298-299.md`.

## Global Constraints

- All paths below are relative to `warhammer-battle-helper-front/` unless they start with `docs/`.
- Run tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Bare `npx jest` does not work.
- Known baseline failure: `App.test.js` (axios ESM). Not a regression.
- Code comments in English. No hardcoded UI strings in JSX — always `t('key')`; every new key goes in both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`.
- Rendering tests start with `import '../../i18n';` (side effect). Components that pull in the system registry need the `jest.mock('axios', …)` block from `GameCard.test.jsx`.
- `SEARCH_THRESHOLD = 8`: search shows when `games.length > 8`.
- URL params: `role` ∈ `gm` | `player` (anything else = all), `q` = raw search text. Defaults are removed from the URL. Writes use `{ replace: true }`.
- A hidden control never filters: `role` ignored when chips hidden, `q` ignored when search hidden.
- Shared checkout with other sessions: check the branch in the same command as every commit (`[ "$(git branch --show-current)" = main ] && git commit …`).
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WizxuXemF1hTKMHJuCoQG1
  ```

## File Structure

| File | Responsibility |
|---|---|
| `src/components/lobby/gameLabels.js` (new) | `systemLabel(game, t)` — moved out of `GameCard.jsx`, shared by card and filter |
| `src/components/lobby/lobbyFilter.js` (new) | Pure: `gameRole`, `lobbyFilterVisibility`, `filterLobbyGames`, `SEARCH_THRESHOLD` |
| `src/components/lobby/lobbyFilter.test.js` (new) | Unit tests of the above |
| `src/hooks/useLobbyFilter.js` (new) | URL state + visibility + filtered list |
| `src/hooks/useLobbyFilter.test.jsx` (new) | Hook tests in a `MemoryRouter` |
| `src/components/lobby/LobbyFilterBar.jsx` (new) | `LobbyFilterBar` (chips + search) and `NoMatchingGames` (empty-result card) |
| `src/components/lobby/LobbyFilterBar.test.jsx` (new) | Render tests |
| `src/components/lobby/GameCard.jsx` (modify) | Import `systemLabel` instead of defining it |
| `src/components/GameLobby.jsx` (modify) | Use the hook, render bar, map `visibleGames`, no-results card |
| locales, changelog, KB, help | Docs in the last task |

---

### Task 1: Pure filter logic + shared system label

**Files:**
- Create: `src/components/lobby/gameLabels.js`
- Create: `src/components/lobby/lobbyFilter.js`
- Create: `src/components/lobby/lobbyFilter.test.js`
- Modify: `src/components/lobby/GameCard.jsx:20-23` (remove local `systemLabel`, add import)

**Interfaces:**
- Produces:
  - `systemLabel(game, t) => string` (from `gameLabels.js`)
  - `SEARCH_THRESHOLD: number` (8)
  - `gameRole(game, userEmail) => 'gm' | 'player'`
  - `lobbyFilterVisibility(games, userEmail) => { showRoles: boolean, showSearch: boolean }`
  - `filterLobbyGames(games, { role, query, userEmail, t }) => Game[]` — `role` is `'gm' | 'player' | null` (null = all), `query` is a string; both already "effective" (caller zeroes hidden ones).

- [ ] **Step 1: Write the failing test**

`src/components/lobby/lobbyFilter.test.js`:

```js
import { SEARCH_THRESHOLD, filterLobbyGames, gameRole, lobbyFilterVisibility } from './lobbyFilter';

const ME = 'me@x.pl';
// Mirrors i18next for the two built-in labels the tests use; unknown keys fall back.
const t = (key, opts) => ({ 'gameSystems.coc7e': 'Call of Cthulhu 7e' }[key] ?? opts?.defaultValue ?? key);

const game = (over) => ({ id: over.name, gameMasterEmail: 'gm@x.pl', gameSystem: 'warhammer4e', ...over });
const mine = (over) => game({ gameMasterEmail: ME, ...over });
const many = (n) => Array.from({ length: n }, (_, i) => mine({ name: `G${i}` }));

describe('gameRole', () => {
  it('is gm when the user runs the game', () => {
    expect(gameRole(mine({ name: 'A' }), ME)).toBe('gm');
  });
  it('is player otherwise', () => {
    expect(gameRole(game({ name: 'A' }), ME)).toBe('player');
  });
});

describe('lobbyFilterVisibility', () => {
  it('shows roles only when the user has games in both roles', () => {
    expect(lobbyFilterVisibility([mine({ name: 'A' }), mine({ name: 'B' })], ME).showRoles).toBe(false);
    expect(lobbyFilterVisibility([game({ name: 'A' })], ME).showRoles).toBe(false);
    expect(lobbyFilterVisibility([mine({ name: 'A' }), game({ name: 'B' })], ME).showRoles).toBe(true);
  });
  it('shows search only above the threshold', () => {
    expect(SEARCH_THRESHOLD).toBe(8);
    expect(lobbyFilterVisibility(many(8), ME).showSearch).toBe(false);
    expect(lobbyFilterVisibility(many(9), ME).showSearch).toBe(true);
  });
  it('shows nothing for an empty list', () => {
    expect(lobbyFilterVisibility([], ME)).toEqual({ showRoles: false, showSearch: false });
  });
});

describe('filterLobbyGames', () => {
  const games = [
    mine({ name: 'Zamek w Łodzi' }),
    game({ name: 'Mgła', gameSystem: 'coc7e' }),
    mine({ name: 'Krypta', gameSystem: 'custom', customSystemTemplate: { name: 'Mroczny Świat' } }),
  ];
  const names = (list) => list.map(g => g.name);
  const run = (role, query) => names(filterLobbyGames(games, { role, query, userEmail: ME, t }));

  it('returns everything with no role and an empty query', () => {
    expect(run(null, '')).toEqual(['Zamek w Łodzi', 'Mgła', 'Krypta']);
  });
  it('filters by role', () => {
    expect(run('gm', '')).toEqual(['Zamek w Łodzi', 'Krypta']);
    expect(run('player', '')).toEqual(['Mgła']);
  });
  it('matches the name ignoring case and Polish letters', () => {
    expect(run(null, 'lodzi')).toEqual(['Zamek w Łodzi']);
    expect(run(null, 'ZAMEK')).toEqual(['Zamek w Łodzi']);
  });
  it('matches the built-in system label', () => {
    expect(run(null, 'cthulhu')).toEqual(['Mgła']);
  });
  it('matches the template name of a custom game', () => {
    expect(run(null, 'swiat')).toEqual(['Krypta']);
  });
  it('treats a whitespace-only query as empty', () => {
    expect(run(null, '   ')).toHaveLength(3);
  });
  it('combines role and query', () => {
    expect(run('player', 'zamek')).toEqual([]);
    expect(run('gm', 'krypta')).toEqual(['Krypta']);
  });
  it('keeps the original order', () => {
    expect(run(null, 'a')).toEqual(['Zamek w Łodzi', 'Mgła', 'Krypta']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=lobbyFilter`
Expected: FAIL — `Cannot find module './lobbyFilter'`.

- [ ] **Step 3: Write the implementation**

`src/components/lobby/gameLabels.js`:

```js
// A custom game shows its template's name; hardcoded systems show their i18n display name.
export const systemLabel = (game, t) => game.gameSystem === 'custom' && game.customSystemTemplate
  ? game.customSystemTemplate.name
  : t(`gameSystems.${game.gameSystem}`, { defaultValue: game.gameSystem });
```

`src/components/lobby/lobbyFilter.js`:

```js
import { findMatch } from './systemOptions';
import { systemLabel } from './gameLabels';

// Below this many games the whole list fits on screen, so a search box is only clutter.
export const SEARCH_THRESHOLD = 8;

export const gameRole = (game, userEmail) => (game.gameMasterEmail === userEmail ? 'gm' : 'player');

// Each control appears only when it can narrow the list: role chips need games in both roles,
// search needs more games than fit at a glance. Counted on the whole list, so switching a chip
// never hides the search box (and the text typed into it).
export function lobbyFilterVisibility(games, userEmail) {
  const roles = new Set(games.map(g => gameRole(g, userEmail)));
  return {
    showRoles: roles.size === 2,
    showSearch: games.length > SEARCH_THRESHOLD,
  };
}

// `role` null means all games. Search looks at the game name and the system label the card shows.
export function filterLobbyGames(games, { role, query, userEmail, t }) {
  const hasQuery = query.trim() !== '';
  return games.filter(game => {
    if (role && gameRole(game, userEmail) !== role) return false;
    if (!hasQuery) return true;
    return Boolean(findMatch(game.name || '', query) || findMatch(systemLabel(game, t), query));
  });
}
```

In `src/components/lobby/GameCard.jsx`, delete lines 20-23 (the comment and the `systemLabel` const) and add after the `getAvatarUrl` import:

```js
import { systemLabel } from './gameLabels';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="lobbyFilter|GameCard"`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/gameLabels.js src/components/lobby/lobbyFilter.js src/components/lobby/lobbyFilter.test.js src/components/lobby/GameCard.jsx
[ "$(git branch --show-current)" = main ] && git commit -m "refactor: lobby filter logic and shared system label (PLAYRPG-298, PLAYRPG-299)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuXemF1hTKMHJuCoQG1"
```

---

### Task 2: `useLobbyFilter` hook (URL state)

**Files:**
- Create: `src/hooks/useLobbyFilter.js`
- Create: `src/hooks/useLobbyFilter.test.jsx`

**Interfaces:**
- Consumes: `lobbyFilterVisibility`, `filterLobbyGames` from `src/components/lobby/lobbyFilter.js`.
- Produces: `useLobbyFilter(games, userEmail) => { role, query, setRole, setQuery, clear, showRoles, showSearch, visibleGames, isFiltering }`
  - `role`: `'gm' | 'player' | null` — effective (null when chips hidden or param invalid)
  - `query`: string — raw URL value when search is shown (what the input displays), `''` otherwise
  - `setRole(role | null)`, `setQuery(string)`, `clear()` — write the URL with `replace: true`
  - `isFiltering`: true when an effective role or a non-blank query narrows the list
  - Must be used under a Router (lobby already is: `App.js` wraps everything in `<Router>`).

- [ ] **Step 1: Write the failing test**

`src/hooks/useLobbyFilter.test.jsx`:

```jsx
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import useLobbyFilter from './useLobbyFilter';

// One stable `t`, like the real hook returns; a fresh function per render would bust the memo.
const mockT = (k, o) => o?.defaultValue ?? k;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));

const ME = 'me@x.pl';
const mine = (name) => ({ id: name, name, gameMasterEmail: ME, gameSystem: 'warhammer4e' });
const theirs = (name) => ({ id: name, name, gameMasterEmail: 'gm@x.pl', gameSystem: 'warhammer4e' });
const many = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? theirs(`G${i}`) : mine(`G${i}`)));

// Renders the hook under a router at `url` and exposes the current location next to the result.
const setup = (games, url = '/games') => renderHook(
  () => ({ filter: useLobbyFilter(games, ME), location: useLocation() }),
  { wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> },
);

describe('useLobbyFilter', () => {
  it('reads role and query from the URL', () => {
    const { result } = setup(many(10), '/games?role=gm&q=G1');
    expect(result.current.filter.role).toBe('gm');
    expect(result.current.filter.query).toBe('G1');
    expect(result.current.filter.visibleGames.map(g => g.name)).toEqual([]); // G1 is not mine
    expect(result.current.filter.isFiltering).toBe(true);
  });

  it('treats an unknown role as all', () => {
    const { result } = setup(many(10), '/games?role=boss');
    expect(result.current.filter.role).toBeNull();
    expect(result.current.filter.visibleGames).toHaveLength(10);
    expect(result.current.filter.isFiltering).toBe(false);
  });

  it('ignores role when the chips are hidden', () => {
    const { result } = setup([mine('A'), mine('B')], '/games?role=player');
    expect(result.current.filter.showRoles).toBe(false);
    expect(result.current.filter.role).toBeNull();
    expect(result.current.filter.visibleGames).toHaveLength(2);
  });

  it('ignores the query when the search box is hidden', () => {
    const { result } = setup([mine('A'), theirs('B')], '/games?q=zzz');
    expect(result.current.filter.showSearch).toBe(false);
    expect(result.current.filter.query).toBe('');
    expect(result.current.filter.visibleGames).toHaveLength(2);
  });

  it('writes role and query to the URL and drops defaults', () => {
    const { result } = setup(many(10));
    act(() => result.current.filter.setRole('player'));
    expect(result.current.location.search).toBe('?role=player');
    act(() => result.current.filter.setQuery('G'));
    expect(result.current.location.search).toBe('?role=player&q=G');
    act(() => result.current.filter.setRole(null));
    expect(result.current.location.search).toBe('?q=G');
    act(() => result.current.filter.setQuery(''));
    expect(result.current.location.search).toBe('');
  });

  it('clear removes both params', () => {
    const { result } = setup(many(10), '/games?role=gm&q=x');
    act(() => result.current.filter.clear());
    expect(result.current.location.search).toBe('');
  });

  it('keeps unrelated params', () => {
    const { result } = setup(many(10), '/games?other=1');
    act(() => result.current.filter.setRole('gm'));
    expect(result.current.location.search).toBe('?other=1&role=gm');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=useLobbyFilter`
Expected: FAIL — `Cannot find module './useLobbyFilter'`.

- [ ] **Step 3: Write the implementation**

`src/hooks/useLobbyFilter.js`:

```js
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { filterLobbyGames, lobbyFilterVisibility } from '../components/lobby/lobbyFilter';

const ROLES = ['gm', 'player'];

// Lobby filter state lives in the URL (?role=gm&q=...), not in component state: entering a game
// unmounts the lobby under the same /games path, and the URL is what survives the round trip
// and a reload. A param whose control is hidden is ignored, so nothing filters invisibly.
export default function useLobbyFilter(games, userEmail) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { showRoles, showSearch } = useMemo(() => lobbyFilterVisibility(games, userEmail), [games, userEmail]);

  const urlRole = params.get('role');
  const role = showRoles && ROLES.includes(urlRole) ? urlRole : null;
  const query = showSearch ? (params.get('q') || '') : '';

  // Replace, not push: each keystroke must not become a history entry.
  const update = useCallback((changes) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    }, { replace: true });
  }, [setParams]);

  const setRole = useCallback((value) => update({ role: value }), [update]);
  const setQuery = useCallback((value) => update({ q: value }), [update]);
  const clear = useCallback(() => update({ role: null, q: null }), [update]);

  const visibleGames = useMemo(
    () => filterLobbyGames(games, { role, query, userEmail, t }),
    [games, role, query, userEmail, t],
  );

  return {
    role, query, setRole, setQuery, clear, showRoles, showSearch, visibleGames,
    isFiltering: role !== null || query.trim() !== '',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=useLobbyFilter`
Expected: PASS (7 tests).

If `'keeps unrelated params'` fails on param order, the `URLSearchParams` copy is broken — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLobbyFilter.js src/hooks/useLobbyFilter.test.jsx
[ "$(git branch --show-current)" = main ] && git commit -m "feat: lobby filter state in the URL (PLAYRPG-298, PLAYRPG-299)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuXemF1hTKMHJuCoQG1"
```

---

### Task 3: `LobbyFilterBar` + `NoMatchingGames` + translations

**Files:**
- Create: `src/components/lobby/LobbyFilterBar.jsx`
- Create: `src/components/lobby/LobbyFilterBar.test.jsx`
- Modify: `src/locales/en/translation.json` (`game` object, after `"emptyLobbyDesign"`)
- Modify: `src/locales/pl/translation.json` (same place)

**Interfaces:**
- Consumes: the hook result shape from Task 2 (passed in as props, the component does not call the hook).
- Produces:
  - `LobbyFilterBar({ role, query, showRoles, showSearch, onRoleChange, onQueryChange })` — default export; renders `null` when `!showRoles && !showSearch`.
  - `NoMatchingGames({ query, onClear })` — named export; card spanning the whole grid row.

- [ ] **Step 1: Add translations**

In `src/locales/en/translation.json`, inside `"game"`, after `"emptyLobbyDesign": "Design a system",` add:

```json
    "filterAll": "All",
    "filterRunning": "Running",
    "filterPlaying": "Playing",
    "filterRolesLabel": "Show games",
    "searchGames": "Search games",
    "clearSearch": "Clear search",
    "noMatchingGamesQuery": "No games match “{{query}}”",
    "noMatchingGamesRole": "No games in this view",
    "clearFilters": "Clear filters",
```

In `src/locales/pl/translation.json`, same place:

```json
    "filterAll": "Wszystkie",
    "filterRunning": "Prowadzę",
    "filterPlaying": "Gram",
    "filterRolesLabel": "Pokaż gry",
    "searchGames": "Szukaj gier",
    "clearSearch": "Wyczyść wyszukiwanie",
    "noMatchingGamesQuery": "Brak gier pasujących do „{{query}}”",
    "noMatchingGamesRole": "Brak gier w tym widoku",
    "clearFilters": "Wyczyść filtry",
```

- [ ] **Step 2: Write the failing test**

`src/components/lobby/LobbyFilterBar.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import LobbyFilterBar, { NoMatchingGames } from './LobbyFilterBar';

const renderBar = (props = {}) => {
  const handlers = { onRoleChange: jest.fn(), onQueryChange: jest.fn() };
  const utils = render(
    <LobbyFilterBar role={null} query="" showRoles showSearch {...handlers} {...props} />,
  );
  return { ...utils, ...handlers };
};

describe('LobbyFilterBar', () => {
  it('renders nothing when neither control is useful', () => {
    const { container } = renderBar({ showRoles: false, showSearch: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('hides the chips when roles are not shown', () => {
    renderBar({ showRoles: false });
    expect(screen.queryByRole('button', { name: 'Running' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search games' })).toBeInTheDocument();
  });

  it('hides the search box when search is not shown', () => {
    renderBar({ showSearch: false });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Running' })).toBeInTheDocument();
  });

  it('marks the selected chip and reports clicks', () => {
    const { onRoleChange } = renderBar({ role: 'gm' });
    expect(screen.getByRole('button', { name: 'Running' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }));
    expect(onRoleChange).toHaveBeenCalledWith('player');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onRoleChange).toHaveBeenCalledWith(null);
  });

  it('reports typing and clears the query', () => {
    const { onQueryChange } = renderBar({ query: 'za' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'zam' } });
    expect(onQueryChange).toHaveBeenCalledWith('zam');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('shows no clear button for an empty query', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });
});

describe('NoMatchingGames', () => {
  it('names the query and clears filters', () => {
    const onClear = jest.fn();
    render(<NoMatchingGames query="zamek" onClear={onClear} />);
    expect(screen.getByText('No games match “zamek”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('uses the role message without a query', () => {
    render(<NoMatchingGames query="  " onClear={jest.fn()} />);
    expect(screen.getByText('No games in this view')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LobbyFilterBar`
Expected: FAIL — `Cannot find module './LobbyFilterBar'`.

- [ ] **Step 4: Write the implementation**

`src/components/lobby/LobbyFilterBar.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, Chip, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import { BODY_FONT, DISPLAY_FONT } from './lobbyStyles';

// null stands for "all games"; the order is the order of the chips.
const ROLE_CHIPS = [
  { value: null, labelKey: 'game.filterAll' },
  { value: 'gm', labelKey: 'game.filterRunning' },
  { value: 'player', labelKey: 'game.filterPlaying' },
];

// The row above the lobby grid. Each control is shown only when it can narrow the list
// (see lobbyFilterVisibility); with neither, the row is not rendered at all.
function LobbyFilterBar({ role, query, showRoles, showSearch, onRoleChange, onQueryChange }) {
  const { t } = useTranslation();
  if (!showRoles && !showSearch) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
      {showRoles ? (
        <Box role="group" aria-label={t('game.filterRolesLabel')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {ROLE_CHIPS.map(chip => {
            const selected = role === chip.value;
            return (
              <Chip key={chip.labelKey} label={t(chip.labelKey)} clickable
                color="primary" variant={selected ? 'filled' : 'outlined'}
                aria-pressed={selected}
                onClick={() => onRoleChange(chip.value)}
                sx={{ fontFamily: BODY_FONT, fontSize: '1rem', fontWeight: 600 }} />
            );
          })}
        </Box>
      ) : <Box />}
      {showSearch && (
        <TextField size="small" value={query} onChange={e => onQueryChange(e.target.value)}
          placeholder={t('game.searchGames')}
          sx={{ minWidth: 240, flex: { xs: '1 1 100%', sm: '0 1 320px' } }}
          slotProps={{
            htmlInput: { 'aria-label': t('game.searchGames') },
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label={t('game.clearSearch')} onClick={() => onQueryChange('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }} />
      )}
    </Box>
  );
}

// Shown in place of the grid content when the user has games but the filter leaves none.
export function NoMatchingGames({ query, onClear }) {
  const { t } = useTranslation();
  const trimmed = query.trim();
  return (
    <Card sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 5, px: 3, background: 'rgba(244, 232, 216, 0.6)', border: '2px solid', borderColor: 'primary.main' }}>
      <Typography variant="h6" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, color: 'primary.dark' }}>
        {trimmed ? t('game.noMatchingGamesQuery', { query: trimmed }) : t('game.noMatchingGamesRole')}
      </Typography>
      <Button variant="outlined" startIcon={<FilterAltOffIcon />} onClick={onClear}
        sx={{ fontFamily: BODY_FONT, fontWeight: 600, mt: 2 }}>
        {t('game.clearFilters')}
      </Button>
    </Card>
  );
}

export default LobbyFilterBar;
```

Notes for the implementer:
- `<Box />` placeholder keeps the search box on the right when chips are hidden (`space-between`).
- i18next escapes interpolation by default; `{{query}}` with user text is safe in a text node. Do not add `interpolation: { escapeValue: false }` locally — check `src/i18n.js` if the rendered text shows `&amp;`-style entities and adapt the test, not the escaping.
- If MUI 7 in this repo does not accept `slotProps.htmlInput` / `slotProps.input` (check how `CreateGameDialog.jsx` passes input props and copy that style), use `inputProps` / `InputProps` instead. The test's `getByRole('textbox', { name: 'Search games' })` is the check.

- [ ] **Step 5: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LobbyFilterBar`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/lobby/LobbyFilterBar.jsx src/components/lobby/LobbyFilterBar.test.jsx src/locales/en/translation.json src/locales/pl/translation.json
[ "$(git branch --show-current)" = main ] && git commit -m "feat: lobby filter bar and no-results card (PLAYRPG-298, PLAYRPG-299)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuXemF1hTKMHJuCoQG1"
```

---

### Task 4: Wire into `GameLobby` + docs (changelog, knowledge base, help)

User-visible change, so docs go in the same commit as the wiring (project rule).

**Files:**
- Modify: `src/components/GameLobby.jsx`
- Modify: `src/changelog/releases.js:15` (games section of 1.0.0)
- Modify: `src/locales/en/changelog.json`, `src/locales/pl/changelog.json` (`releases.1_0_0.games`)
- Modify: `docs/knowledge-base/03-gry-i-uczestnicy.md` (lobby paragraph, lines 5-10)
- Modify: `docs/knowledge-base/00-inwentaryzacja.md` (section 2 table)
- Modify: `src/help/pl/01-getting-started.md`, `src/help/en/01-getting-started.md` (`#the-game-list`)

**Interfaces:**
- Consumes: `useLobbyFilter(games, userEmail)` (Task 2), `LobbyFilterBar`, `NoMatchingGames` (Task 3).

**Changelog version decision:** 1.0.0 is not deployed yet (launch PR #5 pending; commits `8cf517f`, `5006aa3` added to 1.0.0). Add the item to 1.0.0's `games` area section. If 1.0.0 has shipped by the time this runs (check `git log origin/main` and ask the user), add a new `1.1.0` release at the top with `{ id: 'added', items: ['lobbyFilter'] }` instead.

- [ ] **Step 1: Wire the hook and the bar into `GameLobby.jsx`**

Add imports after `import GameCard from './lobby/GameCard';`:

```js
import LobbyFilterBar, { NoMatchingGames } from './lobby/LobbyFilterBar';
import useLobbyFilter from '../hooks/useLobbyFilter';
```

After the `useTemplates` destructuring add:

```js
  const filter = useLobbyFilter(games, userEmail);
```

Between the `{error && …}` alert and the grid `<Box sx={{ display: 'grid', …`, add:

```jsx
          <LobbyFilterBar
            role={filter.role}
            query={filter.query}
            showRoles={filter.showRoles}
            showSearch={filter.showSearch}
            onRoleChange={filter.setRole}
            onQueryChange={filter.setQuery}
          />
```

Inside the grid, after the `{games.length === 0 && (…)}` block, add:

```jsx
            {games.length > 0 && filter.visibleGames.length === 0 && (
              <NoMatchingGames query={filter.query} onClear={filter.clear} />
            )}
```

and change `{games.map(game => (` to `{filter.visibleGames.map(game => (`.

- [ ] **Step 2: Changelog**

`src/changelog/releases.js` line 15:

```js
      { id: 'games', items: ['lobby', 'lobbyFilter', 'players', 'inviteLink', 'participant', 'online'] },
```

`src/locales/en/changelog.json`, in `releases.1_0_0.games` after `"lobby"`:

```json
        "lobbyFilter": "With many games, search the list by game or system name; if you both run and play games, show only one kind with a click.",
```

`src/locales/pl/changelog.json`, same place:

```json
        "lobbyFilter": "Przy wielu grach wyszukiwarka po nazwie gry lub systemu, a gdy i prowadzisz, i grasz — jednym kliknięciem pokażesz tylko jedne z nich.",
```

- [ ] **Step 3: Knowledge base**

`docs/knowledge-base/03-gry-i-uczestnicy.md` — after the first paragraph (ends with „Gdy wyszukiwanie nic nie znajduje tylko przez filtr, dialog mówi o tym wprost.”), add a new paragraph:

```markdown
**Filtr i wyszukiwarka w lobby** (PLAYRPG-298/299). Nad siatką gier pasek `LobbyFilterBar.jsx`:
chipy „Wszystkie / Prowadzę / Gram” pojawiają się tylko u kogoś, kto ma gry w obu rolach (rola
= `gameMasterEmail === userEmail`), wyszukiwarka dopiero powyżej 8 gier (`SEARCH_THRESHOLD`,
liczone łącznie, nie po filtrze). Szukanie obejmuje nazwę gry i etykietę systemu z karty
(`systemLabel`), przez `findMatch` z `systemOptions.js` (bez wielkości liter i polskich znaków).
Wszystko we froncie (`lobbyFilter.js`), backend bez zmian. Stan siedzi w URL (`?role=gm&q=…`,
`useLobbyFilter`, `replace: true`), bo gra otwiera się dziś pod tym samym `/games` i lobby się
odmontowuje — URL przeżywa wejście do gry i F5. **Pułapka:** parametr ukrytej kontrolki jest
ignorowany (stare `?role=player` u kogoś, kto przestał grać, nie chowa gier). Fraza nie trafia
do GA, bo `gtag.js` obcina query string.
```

`docs/knowledge-base/00-inwentaryzacja.md`, section 2, after the row `| Lista gier (`/games`), …`:

```markdown
| Filtr ról (Prowadzę / Gram) i wyszukiwarka na liście gier | K | PLAYRPG-298, PLAYRPG-299 |
```

- [ ] **Step 4: Help pages (same anchor, no new headings)**

`src/help/pl/01-getting-started.md` — append at the end of the `## Lista gier {#the-game-list}` section (after „…albo zaprojektować własny system.”), as a new paragraph:

```markdown
Gdy prowadzisz jedne gry, a w innych grasz, nad listą pojawiają się przyciski **Wszystkie**,
**Prowadzę** i **Gram**. Przy więcej niż ośmiu grach dochodzi wyszukiwarka: wpisz fragment nazwy
gry albo systemu, wielkość liter i polskie znaki nie mają znaczenia. Wybór zostaje w adresie
strony, więc po wyjściu z gry i po odświeżeniu lista jest dalej zawężona. **Wyczyść filtry**
pokazuje znowu wszystko.
```

`src/help/en/01-getting-started.md` — append at the end of `## The game list {#the-game-list}` (after „…design your own system right away.”):

```markdown
If you run some games and play in others, **All**, **Running** and **Playing** buttons appear
above the list. With more than eight games you also get a search box: type part of a game or
system name, letter case and accents do not matter. Your choice stays in the page address, so
the list is still narrowed after you leave a game or reload. **Clear filters** shows everything
again.
```

- [ ] **Step 5: Run the affected tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="lobbyFilter|useLobbyFilter|LobbyFilterBar|GameCard|releases|helpPages|tourTranslations"`
Expected: PASS. `releases.test.js` checks the new changelog key exists in en and pl; `helpPages.test.js` checks anchors are unchanged.

- [ ] **Step 6: Run the full frontend suite**

Run: `CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` axios ESM failure.

- [ ] **Step 7: Lint**

Run: `npx eslint src/components/GameLobby.jsx src/components/lobby/LobbyFilterBar.jsx src/components/lobby/lobbyFilter.js src/components/lobby/gameLabels.js src/components/lobby/GameCard.jsx src/hooks/useLobbyFilter.js`
Expected: no errors (especially no `no-unused-vars` in `GameCard.jsx`).

- [ ] **Step 8: Commit**

```bash
git add src/components/GameLobby.jsx src/changelog/releases.js src/locales/en/changelog.json src/locales/pl/changelog.json src/help/pl/01-getting-started.md src/help/en/01-getting-started.md ../docs/knowledge-base/03-gry-i-uczestnicy.md ../docs/knowledge-base/00-inwentaryzacja.md
[ "$(git branch --show-current)" = main ] && git commit -m "feat: role filter and search on the game list (PLAYRPG-298, PLAYRPG-299)

Role chips (All / Running / Playing) show only for users with games in
both roles; search by game or system name shows above 8 games. State
lives in the URL so it survives entering a game and reloading; a param
whose control is hidden is ignored.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuXemF1hTKMHJuCoQG1"
```

- [ ] **Step 9: Browser check (manual)**

On the local docker stack (`http://localhost:3000/games`) with an account that runs ≥ 1 game and plays ≥ 1, total > 8 games:
- chips and search visible; chip click sets `?role=` in the address bar, no new history entries while typing;
- enter a game and go back to the list — filter still applied; F5 — still applied;
- query that matches nothing → no-results card, „Wyczyść filtry” restores the full list;
- narrow window (~375px): row wraps, search full width, no horizontal scroll.
