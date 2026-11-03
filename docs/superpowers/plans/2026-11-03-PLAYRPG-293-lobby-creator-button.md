# PLAYRPG-293 Lobby Creator Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The system creator is reachable from the lobby header regardless of game count, and the empty lobby offers both actions plus the invite path.

**Architecture:** Frontend only. `GameLobby.jsx` gets a secondary header button wired to the existing `openManager`; the end-of-grid `CreatorTile` is deleted. The empty-state card gains a title, an explanation, and two CTAs reusing the header handlers. Spec: `docs/superpowers/specs/PLAYRPG-293.md`.

**Tech Stack:** React, MUI (`@mui/material`, `@mui/icons-material`), i18next, Jest + Testing Library (CRA).

## Global Constraints

- All UI strings via `t('key')`; English in `src/locales/en/translation.json`, Polish in `src/locales/pl/translation.json`, added in parallel.
- Icons only from `@mui/icons-material`.
- Code comments in English.
- Delete dead code/keys in the same change (`CreatorTile.jsx`, `creator.tileTitle`, `creator.tileDesc`, `game.noActiveGames`).
- Tests run from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Known baseline failure: `App.test.js` (axios ESM).
- Work on `main`; check the branch in the same command as every commit.

---

### Task 1: Creator button in the header, tile removed

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx`
- Delete: `warhammer-battle-helper-front/src/components/lobby/CreatorTile.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Create: `warhammer-battle-helper-front/src/components/GameLobby.test.jsx`

**Interfaces:**
- Consumes: `openManager` (existing callback in `GameLobby`), `useGames(token)` / `useTemplates(token)` return shapes (see `GameLobby.jsx:23-29`).
- Produces: i18n key `game.openCreator`; test file with `mount(games)` helper and dialog mocks reused in Task 2.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/GameLobby.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import GameLobby from './GameLobby';

let mockGames = [];

jest.mock('../analytics/gtag', () => ({ trackEvent: jest.fn() }));
jest.mock('../hooks/useGames', () => ({
  useGames: () => ({
    games: mockGames, error: '', loading: false, syncingGameId: null,
    setError: jest.fn(), fetchGames: jest.fn(), createGame: jest.fn(),
    deleteGame: jest.fn(), leaveGame: jest.fn(), syncTemplate: jest.fn(),
  }),
}));
jest.mock('../hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [], fetchTemplates: jest.fn(), createTemplate: jest.fn(), deleteTemplate: jest.fn(),
    cloneTemplate: jest.fn(), leaveTemplate: jest.fn(), replaceTemplate: jest.fn(),
  }),
}));
// Dialogs are replaced by open-state markers: the test checks which surface the lobby opens,
// not the dialogs themselves (they have their own tests).
jest.mock('./lobby/CreateGameDialog', () => function MockCreateGameDialog({ open }) {
  return open ? require('react').createElement('div', null, 'create-game-dialog') : null;
});
jest.mock('./lobby/TemplateManagerDialog', () => function MockTemplateManagerDialog({ open }) {
  return open ? require('react').createElement('div', null, 'template-manager-dialog') : null;
});
jest.mock('./creator/TemplateBuilder', () => function MockTemplateBuilder() { return null; });

const game = { id: 'g1', name: 'Kampania', gameSystem: 'warhammer4e', status: 'active', participants: [] };

const mount = (games) => {
  mockGames = games;
  return render(<GameLobby onJoinGame={() => {}} token="t" userEmail="gm@x.pl" />);
};

test('the header creator button opens the template manager', () => {
  mount([game]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('game.openCreator') }));
  expect(screen.getByText('template-manager-dialog')).toBeInTheDocument();
});

test('the lobby grid has no creator tile', () => {
  mount([game]);
  // Resolved before the key is deleted, the tile's description; after, the bare key — absent either way once the tile is gone.
  expect(screen.queryByText(i18n.t('creator.tileDesc'))).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=GameLobby.test`
Expected: FAIL — first test cannot find a button named `game.openCreator`; second fails because the tile's text is rendered.

- [ ] **Step 3: Implement**

In `GameLobby.jsx`:

Add the icon import below `AddIcon` and remove the `CreatorTile` import:

```jsx
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
```

Replace the header `Box` (the one with `justifyContent: 'space-between'`) with:

```jsx
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Typography variant="h3" sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: 'text.primary', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
              {t('game.gameRooms')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              <Button variant="outlined" startIcon={<TuneIcon />} onClick={openManager}
                sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', fontWeight: 600, px: 3, py: 1.5 }}>
                {t('game.openCreator')}
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={loading}
                sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', fontWeight: 600, px: 3, py: 1.5 }}>
                {t('game.createNewGame')}
              </Button>
            </Box>
          </Box>
```

Delete the tile from the grid (the comment and the element):

```jsx
            {/* Creator tile — always last */}
            <CreatorTile onClick={openManager} />
```

Delete the file: `git rm warhammer-battle-helper-front/src/components/lobby/CreatorTile.jsx`.

Locales — in both files remove `"tileTitle"` and `"tileDesc"` from the `creator` section, and add after `"createNewGame"` in the `game` section:

en:
```json
    "openCreator": "System Creator",
```
pl:
```json
    "openCreator": "Kreator systemów",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=GameLobby.test`
Expected: PASS (2 tests). Also `grep -rn "CreatorTile\|tileTitle\|tileDesc" warhammer-battle-helper-front/src` returns nothing.

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/components/GameLobby.jsx warhammer-battle-helper-front/src/components/GameLobby.test.jsx \
  warhammer-battle-helper-front/src/components/lobby/CreatorTile.jsx \
  warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && \
git commit -m "feat: PLAYRPG-293 creator button in the lobby header replaces the end-of-grid tile"
```

---

### Task 2: Actionable empty state

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.test.jsx`

**Interfaces:**
- Consumes: `mount(games)` helper and dialog markers from Task 1's test file; `openManager`, `setCreateOpen` in `GameLobby`.
- Produces: i18n keys `game.emptyLobbyTitle`, `game.emptyLobbyDesc`, `game.emptyLobbyCreate`, `game.emptyLobbyDesign`.

- [ ] **Step 1: Write the failing tests**

Append to `GameLobby.test.jsx`:

```jsx
test('the empty lobby explains the invite path and offers both actions', () => {
  mount([]);
  expect(screen.getByText(i18n.t('game.emptyLobbyTitle'))).toBeInTheDocument();
  expect(screen.getByText(i18n.t('game.emptyLobbyDesc'))).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: i18n.t('game.emptyLobbyCreate') }));
  expect(screen.getByText('create-game-dialog')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: i18n.t('game.emptyLobbyDesign') }));
  expect(screen.getByText('template-manager-dialog')).toBeInTheDocument();
});

test('a lobby with games shows no empty state', () => {
  mount([game]);
  expect(screen.queryByText(i18n.t('game.emptyLobbyTitle'))).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=GameLobby.test`
Expected: the empty-lobby test FAILS (missing keys render as the raw key and no CTA buttons exist); the other three pass.

- [ ] **Step 3: Implement**

In `GameLobby.jsx` replace the empty-state `Card` block with:

```jsx
            {games.length === 0 && (
              <Card sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 6, px: 3, background: 'rgba(244, 232, 216, 0.6)', border: '2px solid', borderColor: 'primary.main' }}>
                <Typography variant="h5" sx={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: 'primary.dark' }}>
                  {t('game.emptyLobbyTitle')}
                </Typography>
                <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', color: 'text.secondary', fontStyle: 'italic', mt: 1 }}>
                  {t('game.emptyLobbyDesc')}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', mt: 3 }}>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={loading}
                    sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600 }}>
                    {t('game.emptyLobbyCreate')}
                  </Button>
                  <Button variant="outlined" startIcon={<TuneIcon />} onClick={openManager}
                    sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600 }}>
                    {t('game.emptyLobbyDesign')}
                  </Button>
                </Box>
              </Card>
            )}
```

Locales — in both files replace `"noActiveGames"` in the `game` section with:

en:
```json
    "emptyLobbyTitle": "You have no games yet",
    "emptyLobbyDesc": "Create your own, or ask a Game Master to invite your e-mail address.",
    "emptyLobbyCreate": "Create a game",
    "emptyLobbyDesign": "Design a system",
```
pl:
```json
    "emptyLobbyTitle": "Nie masz jeszcze żadnej gry",
    "emptyLobbyDesc": "Utwórz własną albo poproś Mistrza Gry o zaproszenie na Twój e-mail.",
    "emptyLobbyCreate": "Utwórz grę",
    "emptyLobbyDesign": "Zaprojektuj system",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=GameLobby.test`
Expected: PASS (4 tests). `grep -rn "noActiveGames" warhammer-battle-helper-front/src` returns nothing.

Then the full suite: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: only the baseline `App.test.js` failure.

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/components/GameLobby.jsx warhammer-battle-helper-front/src/components/GameLobby.test.jsx \
  warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && \
git commit -m "feat: PLAYRPG-293 empty lobby offers create/design and explains invites"
```
