# PLAYRPG-283 Template Sheet Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eye icon next to custom templates in the create-game picker and in "My templates" opens the template's character sheet in a draggable popup with a close (X) header.

**Architecture:** One shared `TemplateSheetPreview` component (lobby) mounts the real `.custom-sheet` wrapper + `CustomSheetBody` (read-only, `showAffordances`) inside `DraggablePopup` under a local `WindowManagerProvider`. Both dialogs hold a `previewing` state (template or `null`) next to their existing `describing` state. Data comes from the template list already loaded by `useTemplates` — no backend change.

**Tech Stack:** React, MUI (`@mui/material`, `@mui/icons-material`), i18next, Jest + Testing Library (CRA).

Spec: `docs/superpowers/specs/PLAYRPG-283.md`

## Global Constraints

- Only custom templates get the eye; hardcoded systems (warhammer4e, coc7e, coc7e_dark_ages, srd5) never do.
- Icons only from `@mui/icons-material`; tooltips only via `usePortalTooltip` (never MUI `<Tooltip>`).
- All strings through `t('key')`; new key `creator.previewSheet` — en "Preview character sheet", pl "Podgląd karty postaci".
- Code comments in English.
- Popup content is exactly the creator's clean preview: `<div className="custom-sheet" style={{ maxWidth }}>` + `<CustomSheetBody sections={...} showAffordances />`, no `onChange`/`onRoll`/`renderChrome`.
- Selected-template card in `CreateGameDialog` keeps its existing condition (`selectedOption?.description`) — no new card for templates without a description.
- Run tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Bare `npx jest` does not work. `App.test.js` axios ESM failure is the known baseline.
- Work on `main`; check the branch in the same command as each commit.

---

### Task 1: `TemplateSheetPreview` component + i18n key

**Files:**
- Create: `warhammer-battle-helper-front/src/components/lobby/TemplateSheetPreview.jsx`
- Create: `warhammer-battle-helper-front/src/components/lobby/TemplateSheetPreview.test.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (`creator` object)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (`creator` object)

**Interfaces:**
- Produces: `export default function TemplateSheetPreview({ template, onClose })` — renders nothing when `template` is falsy; otherwise a popup titled `template.name`. `template` is a full template object from `useTemplates` (`id`, `name`, `sections`, `settings`). `onClose()` called by the header X.
- Produces: i18n key `creator.previewSheet`.

- [ ] **Step 1: Write the failing test**

`TemplateSheetPreview.test.jsx`:

```jsx
/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateSheetPreview from './TemplateSheetPreview';

const template = {
  id: 't1',
  name: 'Moja Kampania',
  settings: { sheetWidth: 700 },
  sections: [{ id: 'sec1', title: 'Atrybuty', columns: 2, fields: [{ key: 'fld_str', type: 'number', label: 'Siła' }] }],
};

test('renders nothing without a template', () => {
  render(<TemplateSheetPreview template={null} onClose={() => {}} />);
  expect(document.querySelector('.character-sheet-popup')).toBeNull();
});

test('shows the sheet in the real custom-sheet wrapper, titled with the template name', () => {
  render(<TemplateSheetPreview template={template} onClose={() => {}} />);
  const popup = document.querySelector('.character-sheet-popup');
  expect(popup.querySelector('.modal-header__title')).toHaveTextContent('Moja Kampania');
  const sheet = popup.querySelector('.custom-sheet');
  expect(sheet).toHaveStyle({ maxWidth: '700px' });
  expect(screen.getByText('Atrybuty')).toBeInTheDocument();
  expect(screen.getByText('Siła')).toBeInTheDocument();
});

test('the header X closes it', () => {
  const onClose = jest.fn();
  render(<TemplateSheetPreview template={template} onClose={onClose} />);
  fireEvent.click(document.querySelector('.modal-header__btn--close'));
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TemplateSheetPreview`
Expected: FAIL — `Cannot find module './TemplateSheetPreview'`.

- [ ] **Step 3: Write the component**

`TemplateSheetPreview.jsx`:

```jsx
import React from 'react';
import DraggablePopup from '../common/DraggablePopup';
import { WindowManagerProvider } from '../../contexts/WindowManagerContext';
import CustomSheetBody from '../../systems/custom/CustomSheetBody';
import { clampSheetWidth } from '../../utils/sheetWidth';

// Read-only look at a template's character sheet, opened from the system picker and "My
// templates". It mounts the same wrapper and body as the creator's clean preview, so what is
// shown here is what a player will get in the game.
//
// The local WindowManagerProvider is required: DraggablePopup calls useWindowManager
// unconditionally and the lobby has no provider (same reason as PropertyPopup).
// DraggablePopup sizes itself only on mount, so the key remounts it when another template is
// previewed — otherwise the popup would keep the previous template's width.
function TemplateSheetPreview({ template, onClose }) {
  if (!template) return null;
  const sheetWidth = clampSheetWidth(template.settings?.sheetWidth);
  return (
    <WindowManagerProvider>
      <DraggablePopup
        key={template.id}
        title={template.name}
        onClose={onClose}
        initialWidth={sheetWidth}
        initialPosition="center"
      >
        <div className="custom-sheet" style={{ maxWidth: sheetWidth }}>
          <CustomSheetBody sections={template.sections} showAffordances />
        </div>
      </DraggablePopup>
    </WindowManagerProvider>
  );
}

export default TemplateSheetPreview;
```

Note: no `windowId` — the popup is unmanaged (like `PropertyPopup`), so it never registers in a taskbar; minimise collapses it in place.

- [ ] **Step 4: Add the i18n key**

In `locales/en/translation.json`, inside the top-level `"creator"` object, directly after its `"about": { ... },` block, add:

```json
    "previewSheet": "Preview character sheet",
```

In `locales/pl/translation.json`, same position:

```json
    "previewSheet": "Podgląd karty postaci",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TemplateSheetPreview`
Expected: PASS (3 tests). If `toHaveStyle({ maxWidth: '700px' })` fails, check `clampSheetWidth` bounds in `src/utils/sheetWidth.js` and use a value inside them.

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/lobby/TemplateSheetPreview.jsx \
        warhammer-battle-helper-front/src/components/lobby/TemplateSheetPreview.test.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json && \
git commit -m "feat: PLAYRPG-283 read-only template sheet preview popup

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Expected: branch prints `main`.

---

### Task 2: Eye in the create-game picker + button on the selected-template card

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx`
- Test: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx`

**Interfaces:**
- Consumes: `TemplateSheetPreview({ template, onClose })` and `creator.previewSheet` from Task 1.

- [ ] **Step 1: Write the failing tests**

In `CreateGameDialog.test.jsx`, give the `m1` fixture sections (the preview renders them):

```jsx
  { id: 'm1', name: 'Moja Kampania', myRole: 'owner', updatedAt: '2026-10-01T10:00:00Z', language: 'pl', description: '<p>Opis <strong>kampanii</strong></p>',
    sections: [{ id: 'sec1', title: 'Atrybuty', columns: 2, fields: [{ key: 'fld_str', type: 'number', label: 'Siła' }] }] },
```

Append a new describe block at the end of the file (`openSystems` is the existing helper used by the description tests):

```jsx
describe('CreateGameDialog sheet preview', () => {
  it('only custom templates get the eye', async () => {
    await renderDialog();
    const list = openSystems();
    const builtIn = within(list).getByText(i18n.t('gameSystems.warhammer4e')).closest('li');
    expect(within(builtIn).queryByTestId('VisibilityOutlinedIcon')).not.toBeInTheDocument();
    const custom = within(list).getByText('Mroczne Ziemie').closest('li');
    expect(within(custom).getByTestId('VisibilityOutlinedIcon')).toBeInTheDocument();
  });

  it('the eye opens the sheet without selecting the template', async () => {
    await renderDialog();
    const row = within(openSystems()).getByText('Moja Kampania').closest('li');
    const eye = within(row).getByTestId('VisibilityOutlinedIcon').closest('button');
    fireEvent.mouseDown(eye);
    fireEvent.click(eye);
    const popup = document.querySelector('.character-sheet-popup');
    expect(popup).toHaveTextContent('Siła');
    expect(popup.querySelector('.modal-header__title')).toHaveTextContent('Moja Kampania');
    expect(screen.getByRole('combobox', { name: i18n.t('game.gameSystem'), hidden: true })).toHaveValue('');
  });

  it('the selected-template card offers the preview', async () => {
    await renderDialog();
    fireEvent.click(within(openSystems()).getByText('Moja Kampania'));
    const card = document.querySelector('.create-game__selected-about');
    fireEvent.click(within(card).getByRole('button', { name: i18n.t('creator.previewSheet') }));
    expect(document.querySelector('.character-sheet-popup')).toHaveTextContent('Siła');
  });

  it('closing the dialog closes the preview', async () => {
    const { rerender } = await renderDialog();
    const row = within(openSystems()).getByText('Moja Kampania').closest('li');
    fireEvent.click(within(row).getByTestId('VisibilityOutlinedIcon').closest('button'));
    expect(document.querySelector('.character-sheet-popup')).not.toBeNull();
    rerender(dialog({ open: false }));
    expect(document.querySelector('.character-sheet-popup')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CreateGameDialog`
Expected: the 4 new tests FAIL (no `VisibilityOutlinedIcon`, no preview button); existing tests still pass.

- [ ] **Step 3: Implement**

In `CreateGameDialog.jsx`:

Imports — add next to `InfoOutlinedIcon` and `TemplateDescriptionDialog`:

```jsx
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TemplateSheetPreview from './TemplateSheetPreview';
```

State — directly below the `describing` state:

```jsx
  // The template whose character sheet is open in the preview popup; null = closed.
  const [previewing, setPreviewing] = useState(null);
  // Picker options carry no sections, so the preview reads the full template from the list.
  const openPreview = (opt) => setPreviewing(templates.find(tpl => tpl.id === templateIdOf(opt.value)) ?? null);
```

Reset on open — in the `useEffect(() => { if (!open) return undefined; ... }, [open])` block add next to `setQuery('');`:

```jsx
    setPreviewing(null);
```

Row icon — in `renderOption`, directly BEFORE the `{opt.description && ( ... InfoOutlinedIcon ... )}` block:

```jsx
                  {isCustom(opt.value) && (
                    // mousedown would otherwise select the row before click ever fires.
                    <IconButton size="small" aria-label={t('creator.previewSheet')}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={e => { e.stopPropagation(); openPreview(opt); }}
                      sx={{ color: 'primary.main' }}>
                      <VisibilityOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
```

Selected card — replace the single "more" `<Button ...>{t('creator.about.more')}</Button>` with a row holding both buttons:

```jsx
            <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
              <Button size="small" onClick={() => setDescribing(selectedOption)} sx={{ fontFamily: BODY_FONT, textTransform: 'none', px: 0 }}>
                {t('creator.about.more')}
              </Button>
              <Button size="small" onClick={() => openPreview(selectedOption)}
                startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                sx={{ fontFamily: BODY_FONT, textTransform: 'none', px: 0 }}>
                {t('creator.previewSheet')}
              </Button>
            </Box>
```

Popup — after the `<TemplateDescriptionDialog ... />` element (still inside the fragment):

```jsx
    {open && <TemplateSheetPreview template={previewing} onClose={() => setPreviewing(null)} />}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CreateGameDialog`
Expected: all PASS, including the existing description tests (the "More" button keeps its accessible name).

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx \
        warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx && \
git commit -m "feat: PLAYRPG-283 sheet preview from the create-game system picker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Eye in "My templates"

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.jsx`
- Test: `warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.test.jsx`

**Interfaces:**
- Consumes: `TemplateSheetPreview({ template, onClose })` and `creator.previewSheet` from Task 1.

- [ ] **Step 1: Write the failing tests**

Append to `TemplateManagerDialog.test.jsx`:

```jsx
const withField = { sections: [{ id: 'sec1', title: 'Atrybuty', columns: 2, fields: [{ key: 'fld_str', type: 'number', label: 'Siła' }] }] };

test('every template gets the eye, which opens its sheet', () => {
  mount([tpl({ id: 'a', name: 'Mine', myRole: 'owner', ...withField }), tpl({ id: 'b', name: 'Public', isPublic: true })]);
  expect(icons('VisibilityOutlinedIcon')).toHaveLength(2);
  fireEvent.click(icons('VisibilityOutlinedIcon')[0].closest('button'));
  const popup = document.querySelector('.character-sheet-popup');
  expect(popup.querySelector('.modal-header__title')).toHaveTextContent('Mine');
  expect(popup).toHaveTextContent('Siła');
});

test('edit closes the preview so it does not cover the creator', () => {
  const edit = jest.fn();
  mount([tpl({ myRole: 'owner', permissions: { edit: true, share: true, delete: true }, ...withField })], { edit });
  fireEvent.click(icons('VisibilityOutlinedIcon')[0].closest('button'));
  fireEvent.click(icons('EditIcon')[0].closest('button'));
  expect(edit).toHaveBeenCalled();
  expect(document.querySelector('.character-sheet-popup')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TemplateManagerDialog`
Expected: the 2 new tests FAIL (no `VisibilityOutlinedIcon`).

- [ ] **Step 3: Implement**

In `TemplateManagerDialog.jsx`:

Imports — add:

```jsx
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TemplateSheetPreview from './TemplateSheetPreview';
```

Update the component comment's last sentence to cover the eye too — replace:

```
// always-visible icon instead. The ⓘ icon (shown only when a template has a description) opens a
// read-only view; it is not one of the row's actions.
```

with:

```
// always-visible icon instead. The ⓘ icon (shown only when a template has a description) opens a
// read-only view; it is not one of the row's actions. The eye opens a read-only preview of the
// character sheet and, unlike ⓘ, is shown for every template.
```

State — below `describing`:

```jsx
  const [previewing, setPreviewing] = useState(null);
```

Row actions — first child inside the `secondaryAction` `<Box sx={{ display: 'flex', gap: 0.5 }}>`:

```jsx
                      <IconButton size="small" onClick={() => setPreviewing(tpl)}
                        onMouseEnter={e => showTooltip(t('creator.previewSheet'), e.currentTarget)} onMouseLeave={hideTooltip}
                        sx={{ color: 'primary.main' }}>
                        <VisibilityOutlinedIcon fontSize="small" />
                      </IconButton>
```

Edit button — change its `onClick` so the popup (z-index 9999) does not cover the fullscreen creator:

```jsx
                        <IconButton size="small" onClick={() => { setPreviewing(null); onEditTemplate(tpl); }}
```

Popup — after `<TemplateDescriptionDialog ... />`:

```jsx
      {open && <TemplateSheetPreview template={previewing} onClose={() => setPreviewing(null)} />}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TemplateManagerDialog`
Expected: all PASS.

- [ ] **Step 5: Run the lobby + preview suites together and lint**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="lobby|TemplateSheetPreview"`
Expected: all PASS.

Run: `npx eslint src/components/lobby`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.jsx \
        warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.test.jsx && \
git commit -m "feat: PLAYRPG-283 sheet preview from My templates

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
