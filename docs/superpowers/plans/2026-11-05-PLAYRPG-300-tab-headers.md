# PLAYRPG-300 Unified Tab Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every right-panel tab (chat, scenes, handouts, files, music, notes, players, minigames, general) renders the same header through one `TabHeader` component.

**Architecture:** New `components/tabs/TabHeader.jsx` renders `.tab-header` > `h3.tab-header__title` + `.tab-header__actions` (children, then `TourButton`). Shared styles live in `style.css`; each tab's own `__header` / `__title` / header-button CSS is deleted. Tab-specific classes that tutorial tours or tests select on stay on the elements as anchors.

**Tech Stack:** React, plain CSS (BEM), `@mui/icons-material`, Jest + Testing Library (CRA).

Spec: `docs/superpowers/specs/PLAYRPG-300.md`

## Global Constraints

- Header style: Cinzel 14px 600, uppercase, `letter-spacing: 0.5px`, `#6b4423`; `padding-bottom: 10px`, `border-bottom: 1px dashed #c9975b`, `margin-bottom: 12px`, `flex-shrink: 0`.
- Header action button `.tab-header__btn`: `<AddIcon fontSize="small" />` + text, 11px, padding 6×12.
- Every per-tab override of `.tab-header` uses specificity ≥ 0,2,0 (`.x > .tab-header` or `.tab-header.x`) — stylesheet order is not guaranteed.
- Code comments in English. No hardcoded strings — reuse existing `t()` keys (no new i18n keys needed).
- Icons only from `@mui/icons-material`.
- Delete dead CSS/imports in the same change (no leftovers).
- Run tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<pattern>`. Bare `npx jest` does not work. Baseline fail: `App.test.js` (axios ESM) — not a regression.
- Commit on `main` (no worktree). Parallel sessions share the checkout — check the branch in the same command as every commit: `git branch --show-current && git add … && git commit …`. Don't stage `nginx.conf` / `package-lock.json` (unrelated local changes).

---

### Task 1: `TabHeader` component + shared CSS

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/TabHeader.jsx`
- Create: `warhammer-battle-helper-front/src/components/tabs/TabHeader.test.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (append a block at the end of the file)

**Interfaces:**
- Produces: default export `TabHeader({ title: string, tourId?: string, className?: string, children?: ReactNode })`. Classes `.tab-header`, `.tab-header__title`, `.tab-header__actions`, `.tab-header__btn`.

- [ ] **Step 1: Write the failing test** — `src/components/tabs/TabHeader.test.jsx`

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import TabHeader from './TabHeader';
import { TutorialProvider } from '../tutorial/TutorialContext';

const renderIn = (ui) => render(<TutorialProvider>{ui}</TutorialProvider>);

describe('TabHeader', () => {
  it('renders the title as a level-3 heading', () => {
    renderIn(<TabHeader title="Scenes" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Scenes' })).toHaveClass('tab-header__title');
  });

  it('puts children and the tour button into the actions slot, tour button last', () => {
    const { container } = renderIn(
      <TabHeader title="Scenes" tourId="scenes">
        <button className="tab-header__btn">Add</button>
      </TabHeader>
    );
    const actions = container.querySelector('.tab-header__actions');
    expect(actions.children).toHaveLength(2);
    expect(actions.firstElementChild).toHaveTextContent('Add');
    expect(actions.lastElementChild).toHaveClass('tour-button');
  });

  it('omits the actions slot when there is nothing to put in it', () => {
    const { container } = renderIn(<TabHeader title="General" />);
    expect(container.querySelector('.tab-header__actions')).toBeNull();
  });

  it('appends the extra class to the root', () => {
    const { container } = renderIn(<TabHeader title="Chat" className="log-window__header" />);
    expect(container.firstElementChild).toHaveClass('tab-header', 'log-window__header');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TabHeader`
Expected: FAIL — `Cannot find module './TabHeader'`.

- [ ] **Step 3: Implement** — `src/components/tabs/TabHeader.jsx`

```jsx
import React from 'react';
import TourButton from '../tutorial/TourButton';

// Shared header of every right-panel tab: title on the left, tab actions + tour button on the right.
function TabHeader({ title, tourId, className, children }) {
  return (
    <div className={className ? `tab-header ${className}` : 'tab-header'}>
      <h3 className="tab-header__title">{title}</h3>
      {(children || tourId) && (
        <div className="tab-header__actions">
          {children}
          {tourId && <TourButton tourId={tourId} />}
        </div>
      )}
    </div>
  );
}

export default TabHeader;
```

Append to the end of `src/style.css`:

```css
/* ========== Right-panel tab header (TabHeader.jsx) ========== */
.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #c9975b;
  flex-shrink: 0;
}

.tab-header__title {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-size: 14px;
  font-weight: 600;
  color: #6b4423;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tab-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.tab-header__btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #f9f3e8 0%, #f4e8d8 100%);
  border: 2px solid #c9975b;
  border-radius: 4px;
  color: #6b4423;
  font-family: 'Cinzel', serif;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(107, 68, 35, 0.15);
}

.tab-header__btn:hover {
  border-color: #7a5c42;
  background: linear-gradient(135deg, #fff 0%, #f9f3e8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(107, 68, 35, 0.25);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TabHeader`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/tabs/TabHeader.jsx warhammer-battle-helper-front/src/components/tabs/TabHeader.test.jsx warhammer-battle-helper-front/src/style.css && \
git commit -m "feat: PLAYRPG-300 shared TabHeader component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migrate headers without actions — chat, music, players, minigames, general

**Files:**
- Modify: `src/components/LogWindow.jsx:124-128`, `src/components/LogWindow.css:388-402`, `src/components/panels/RightPanel.css:104-106`
- Modify: `src/components/tabs/MusicTab.jsx:583-586`, `src/components/tabs/MusicTab.css:31-48`
- Modify: `src/components/tabs/PlayersTab.jsx:81-84`, `src/components/tabs/PlayersTab.css:31-48`
- Modify: `src/components/tabs/minigame/MinigameList.jsx:14-17`, `src/style.css:6279-6297`
- Modify: `src/components/tabs/GeneralTab.jsx:172-174`, `src/components/tabs/GeneralTab.css:746-759`

(All paths relative to `warhammer-battle-helper-front/`.)

**Interfaces:**
- Consumes: `TabHeader` from Task 1 (`components/tabs/TabHeader.jsx`).

- [ ] **Step 1: Chat.** In `LogWindow.jsx` replace

```jsx
            <div className="log-window__header">
                <h3 className="log-window__title">{t('rightPanel.tabs.chat')}</h3>
                <TourButton tourId="chat" />
            </div>
```
with
```jsx
            <TabHeader title={t('rightPanel.tabs.chat')} tourId="chat" className="log-window__header" />
```
Swap `import TourButton from './tutorial/TourButton';` for `import TabHeader from './tabs/TabHeader';` (first confirm with `grep -n TourButton src/components/LogWindow.jsx` that there is no other use).

In `LogWindow.css` replace the `.log-window__header { … }` and `.log-window__title { … }` rules with:
```css
/* The log has no container padding, so its header brings its own.
   Doubled selector so it wins over .tab-header regardless of stylesheet order. */
.tab-header.log-window__header {
  margin-bottom: 0;
  padding: 6px 12px 10px;
}
```
In `RightPanel.css` delete the dead block:
```css
.right-panel__tab-content .log-window__header {
  border-radius: 0;
}
```

- [ ] **Step 2: Music.** In `MusicTab.jsx` replace
```jsx
      <div className="music-tab__header">
        <h3 className="music-tab__title">{t('rightPanel.tabs.music')}</h3>
        <TourButton tourId="music" />
      </div>
```
with
```jsx
      <TabHeader title={t('rightPanel.tabs.music')} tourId="music" />
```
Import `TabHeader from './TabHeader'`; remove the `TourButton` import if `grep -n TourButton` shows no other use. In `MusicTab.css` replace the `.music-tab__header` and `.music-tab__title` rules with:
```css
/* The container's gap already spaces the header. */
.music-tab > .tab-header {
  margin-bottom: 0;
}
```

- [ ] **Step 3: Players.** In `PlayersTab.jsx` replace
```jsx
      <div className="players-tab__header">
        <h3 className="players-tab__title">{t('players.title')}</h3>
        <TourButton tourId="players" />
      </div>
```
with
```jsx
      <TabHeader title={t('players.title')} tourId="players" />
```
Same import handling. In `PlayersTab.css` replace `.players-tab__header` / `.players-tab__title` with:
```css
/* The container's gap already spaces the header. */
.players-tab > .tab-header {
  margin-bottom: 0;
}
```

- [ ] **Step 4: Minigames.** In `minigame/MinigameList.jsx` replace
```jsx
      <div className="minigame-list__header">
        <h3 className="minigame-list__title">{t('minigames.title')}</h3>
        <TourButton tourId="minigames" />
      </div>
```
with
```jsx
      <TabHeader title={t('minigames.title')} tourId="minigames" />
```
Import `TabHeader from '../TabHeader'`; drop the `TourButton` import if unused. In `style.css` replace the `.minigame-list__header` / `.minigame-list__title` rules (around line 6279) with:
```css
/* The container's gap already spaces the header. */
.minigame-list > .tab-header {
    margin-bottom: 0;
}
```

- [ ] **Step 5: General.** In `GeneralTab.jsx` replace
```jsx
      <div className="general-tab__header">
        <h3 className="general-tab__title">{t('rightPanel.tabs.general')}</h3>
      </div>
```
with
```jsx
      <TabHeader title={t('rightPanel.tabs.general')} />
```
Import `TabHeader from './TabHeader'`. In `GeneralTab.css` replace `.general-tab__header` / `.general-tab__title` with:
```css
/* The container's gap already spaces the header. */
.general-tab > .tab-header {
  margin-bottom: 0;
}
```

- [ ] **Step 6: Verify no leftovers**

Run: `cd warhammer-battle-helper-front/src && grep -rnE "(log-window|music-tab|players-tab|general-tab|minigame-list)__(header|title)\b" . ; grep -rn "log-window__header" .`
Expected: first grep — no output. Second — only `LogWindow.jsx` (className prop) and `LogWindow.css` (`.tab-header.log-window__header`).

- [ ] **Step 7: Run affected tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="LogWindow|MusicTab|PlayersTab|GeneralTab|Minigame|TabHeader|tutorial|RightPanel"`
Expected: PASS (no suites matching a name are fine).

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/LogWindow.jsx warhammer-battle-helper-front/src/components/LogWindow.css warhammer-battle-helper-front/src/components/panels/RightPanel.css warhammer-battle-helper-front/src/components/tabs/MusicTab.jsx warhammer-battle-helper-front/src/components/tabs/MusicTab.css warhammer-battle-helper-front/src/components/tabs/PlayersTab.jsx warhammer-battle-helper-front/src/components/tabs/PlayersTab.css warhammer-battle-helper-front/src/components/tabs/minigame/MinigameList.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx warhammer-battle-helper-front/src/components/tabs/GeneralTab.css && \
git commit -m "feat: PLAYRPG-300 chat, music, players, minigames and general use TabHeader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migrate headers with actions — notes, scenes, files, handouts (+ tour anchors)

**Files:**
- Modify: `src/components/tabs/NotesTab.jsx:252-261`, `src/components/tabs/NotesTab.css:22-70`
- Modify: `src/components/tabs/ScenesTab.jsx:291-302`, `src/components/tabs/ScenesTab.css:34-58`, `src/components/tutorial/tours/scenes.js:7`
- Modify: `src/components/tabs/FilesTab.jsx:568-579`, `src/components/tabs/FilesTab.css:36-80`, `src/components/tutorial/tours/files.js:6`
- Modify: `src/components/tabs/handouts/HandoutTabHeader.jsx:21-38`, `src/components/tabs/HandoutsTab.css:39-78,135-151`

**Interfaces:**
- Consumes: `TabHeader`, `.tab-header__btn` from Task 1.
- Produces: tour anchors `.scenes-tab__create-btn`, `.files-tab__create-folder-btn` (new, no CSS); kept anchors `.notes-tab__add-btn`, `.handouts-tab__header-actions`, `.handouts-tab__add-btn`.

- [ ] **Step 1: Point tours at the new anchors (failing first).** In `tours/scenes.js` change the `create` step target to `'.scenes-tab__create-btn'` and add above `const scenes`:
```js
// .scenes-tab__btn is shared with the small buttons in scene settings — the header button has its own anchor.
```
In `tours/files.js` change the `createFolder` step target to `'.files-tab__create-folder-btn'`.

Run: `cd warhammer-battle-helper-front/src && grep -rn "scenes-tab__create-btn\|files-tab__create-folder-btn" components/tabs`
Expected: no output — the anchors don't exist yet (tour steps would find nothing).

- [ ] **Step 2: Notes.** In `NotesTab.jsx` replace
```jsx
      <div className="notes-tab__header">
        <h3 className="notes-tab__title">{t('notes.title')}</h3>
        <div className="notes-tab__actions">
          <button className="notes-tab__add-btn" onClick={handleCreate}>
            <AddIcon fontSize="small" />
            {t('notes.addNote')}
          </button>
          <TourButton tourId="notes" />
        </div>
      </div>
```
with
```jsx
      <TabHeader title={t('notes.title')} tourId="notes">
        <button className="tab-header__btn notes-tab__add-btn" onClick={handleCreate}>
          <AddIcon fontSize="small" />
          {t('notes.addNote')}
        </button>
      </TabHeader>
```
Import `TabHeader from './TabHeader'`; drop `TourButton` import if unused. In `NotesTab.css` delete `.notes-tab__header`, `.notes-tab__title`, `.notes-tab__actions`, `.notes-tab__add-btn`, `.notes-tab__add-btn:hover` (the class stays in JSX only as the notes tour anchor).

- [ ] **Step 3: Scenes.** In `ScenesTab.jsx` replace
```jsx
      <div className="scenes-tab__header">
        <h3 className="scenes-tab__title">{t('scenes.title')}</h3>
        <div className="scenes-tab__actions">
          <button
            className="scenes-tab__btn"
            onClick={() => setIsCreateOpen(true)}
          >
            + {t('scenes.createScene')}
          </button>
          <TourButton tourId="scenes" />
        </div>
      </div>
```
with
```jsx
      <TabHeader title={t('scenes.title')} tourId="scenes">
        <button
          className="tab-header__btn scenes-tab__create-btn"
          onClick={() => setIsCreateOpen(true)}
        >
          <AddIcon fontSize="small" />
          {t('scenes.createScene')}
        </button>
      </TabHeader>
```
Add `import AddIcon from '@mui/icons-material/Add';` and `import TabHeader from './TabHeader';`; drop `TourButton` import if unused. In `ScenesTab.css` delete `.scenes-tab__header`, `.scenes-tab__title`, `.scenes-tab__actions`. **Keep** `.scenes-tab__btn` and its `:hover` — still used by the `--sm` buttons (`ScenesTab.jsx` ~441, ~502).

- [ ] **Step 4: Files.** In `FilesTab.jsx` replace
```jsx
        <div className="files-tab__header">
          <h3 className="files-tab__title">{t('files.title')}</h3>
          <div className="files-tab__actions">
            <button
              className="files-tab__btn"
              onClick={() => setIsCreateFolderOpen(true)}
            >
              + {t('files.createFolder')}
            </button>
            <TourButton tourId="files" />
          </div>
        </div>
```
with
```jsx
        <TabHeader title={t('files.title')} tourId="files">
          <button
            className="tab-header__btn files-tab__create-folder-btn"
            onClick={() => setIsCreateFolderOpen(true)}
          >
            <AddIcon fontSize="small" />
            {t('files.createFolder')}
          </button>
        </TabHeader>
```
Add `AddIcon` (if not already imported — `grep -n "icons-material/Add'" src/components/tabs/FilesTab.jsx`) and `TabHeader` imports; drop `TourButton` if unused. Also drop the `{/* Header */}` comment above it (the component name says it). In `FilesTab.css` delete `.files-tab__header`, `.files-tab__title`, `.files-tab__actions`, `.files-tab__btn`, `.files-tab__btn:hover` — first confirm `grep -rn "files-tab__btn\|files-tab__actions" src` shows only `FilesTab.css` and the old tour line.

- [ ] **Step 5: Handouts.** In `handouts/HandoutTabHeader.jsx` replace
```jsx
      <div className="handouts-tab__header">
        <h3 className="handouts-tab__title">{t('handouts.title')}</h3>
        <div className="handouts-tab__header-group">
          {isGM && (
            <div className="handouts-tab__header-actions">
              <button className="handouts-tab__add-btn" onClick={onOpenCreate}>
                + {t('handouts.addHandout')}
              </button>
              <button
                className="handouts-tab__add-btn"
                onClick={() => setIsCreatingFolder((v) => !v)}
              >
                + {t('handouts.folders.createFolder')}
              </button>
            </div>
          )}
          <TourButton tourId="handouts" />
        </div>
      </div>
```
with
```jsx
      <TabHeader title={t('handouts.title')} tourId="handouts">
        {isGM && (
          <div className="handouts-tab__header-actions">
            <button className="tab-header__btn handouts-tab__add-btn" onClick={onOpenCreate}>
              <AddIcon fontSize="small" />
              {t('handouts.addHandout')}
            </button>
            <button
              className="tab-header__btn handouts-tab__add-btn"
              onClick={() => setIsCreatingFolder((v) => !v)}
            >
              <AddIcon fontSize="small" />
              {t('handouts.folders.createFolder')}
            </button>
          </div>
        )}
      </TabHeader>
```
Order matters: `HandoutsTab.wsRace.test.jsx` clicks the first `.handouts-tab__add-btn` expecting the create modal. Imports: replace `import TourButton from '../../tutorial/TourButton';` with `import AddIcon from '@mui/icons-material/Add';` + `import TabHeader from '../TabHeader';`.

In `HandoutsTab.css` delete `.handouts-tab__header`, `.handouts-tab__title`, `.handouts-tab__add-btn`, `.handouts-tab__add-btn:hover`, `.handouts-tab__header-group`, `.handouts-tab__add-btn--folder` (dead — no JSX uses it). Replace the `/* Header actions (folder + add buttons) */ .handouts-tab__header-actions { … }` block with:
```css
/* GM header buttons (add handout + folder) side by side, wrapping in a narrow panel */
.handouts-tab__header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 6: Verify anchors and leftovers**

Run:
```bash
cd warhammer-battle-helper-front/src && \
grep -rn "scenes-tab__create-btn\|files-tab__create-folder-btn\|notes-tab__add-btn\|handouts-tab__header-actions" components ; \
echo ---; grep -rnE "(notes-tab|scenes-tab|files-tab|handouts-tab)__(header|title|actions|header-group)\b|files-tab__btn|add-btn--folder" components
```
Expected: first grep — each anchor appears in its tab JSX and its tour file (`handouts-tab__header-actions` also in `HandoutsTab.css`). After `---`: no output.

- [ ] **Step 7: Run affected tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="Handout|NotesTab|ScenesTab|FilesTab|TabHeader|tutorial|tour"`
Expected: PASS, including `HandoutsTab.wsRace` and `HandoutsTab.reopen`.

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/tabs/NotesTab.jsx warhammer-battle-helper-front/src/components/tabs/NotesTab.css warhammer-battle-helper-front/src/components/tabs/ScenesTab.jsx warhammer-battle-helper-front/src/components/tabs/ScenesTab.css warhammer-battle-helper-front/src/components/tabs/FilesTab.jsx warhammer-battle-helper-front/src/components/tabs/FilesTab.css warhammer-battle-helper-front/src/components/tabs/handouts/HandoutTabHeader.jsx warhammer-battle-helper-front/src/components/tabs/HandoutsTab.css warhammer-battle-helper-front/src/components/tutorial/tours/scenes.js warhammer-battle-helper-front/src/components/tutorial/tours/files.js && \
git commit -m "feat: PLAYRPG-300 notes, scenes, files and handouts use TabHeader with icon buttons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification

- [ ] **Step 1: Full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: all pass except baseline `App.test.js` (axios ESM).

- [ ] **Step 2: Lint the touched files**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/tabs src/components/LogWindow.jsx src/components/tutorial/tours`
Expected: no errors (unused `TourButton` imports would show here).

- [ ] **Step 3: Browser check (user)** — log in as GM at `http://localhost:3000`, open a game, switch through all 9 tabs: header text, dashed line and spacing look the same; handouts buttons wrap rather than overflow on a narrow panel; tutorial steps for scenes "create", files "createFolder", notes "add", handouts "create" highlight the right element.
