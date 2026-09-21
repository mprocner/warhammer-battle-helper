# FEATURE-212 Sheet Window Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a GM set the opening width of the character sheet window for a custom template, on a slider in the creator's General tab, with the preview rendering at that width.

**Architecture:** One integer on `TemplateSettings`, one pure module owning the bounds and the fallback, and three consumers that read it — the slider, the preview and the session sheet. The backend only stores the value. `DraggablePopup` already clamps the opening width to the viewport and enforces a 600px floor while resizing, so no ceiling setting is built.

**Tech Stack:** Go + MongoDB (model), React 18 + MUI (creator), jest via CRA, i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/FEATURE-212.md`. Read it before Task 1.
- Comments in code are **always English**, backend and frontend, no exceptions. Docs and commit bodies may stay Polish; these commits use English.
- Every user-facing string goes through `t('key')` with an **English key**; add the value to BOTH `src/locales/en/translation.json` and `src/locales/pl/translation.json` in the same commit. Never a bare string in JSX.
- Icons come from `@mui/icons-material` only.
- CSS is BEM, in `src/style.css`. Creator palette: accent `#c9975b`, dark brown `#7a5c42`, light golden brown `#c4a882`, warm white `#fff9f0`.
- Frontend tests: `CI=true npm test -- --watchAll=false` from `warhammer-battle-helper-front/`; one file with `--testPathPattern=<name>`. Bare `npx jest` does NOT work — CRA owns the config.
- `App.test.js` fails on an axios ESM error. That is the known baseline, not a regression. Branch baseline before Task 1: 746 passing across 83 suites.
- Backend tests: `go test ./...` from `warhammer-battle-helper-backend/`. `gofmt -l internal/` already flags `internal/models/SystemTemplate.go` and `internal/service/token_image_mask_test.go` on the base commit — ignore those two, leave no NEW file flagged.
- The width applies to **custom templates only**. `systems/coc7e` (900), `systems/dnd5e` (1100) and `warhammer4e` (the `DraggablePopup` default 1400) stay untouched, and so does the standalone page (`.sheet-standalone` is `width: 100vw`).
- No data migration: the change is additive and existing templates simply lack the key.

---

### Task 1: `sheetWidth.js` — the bounds and the fallback

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/sheetWidth.js`
- Test: `warhammer-battle-helper-front/src/utils/sheetWidth.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `SHEET_WIDTH_MIN` (600), `SHEET_WIDTH_MAX` (2400), `SHEET_WIDTH_STEP` (50), `SHEET_WIDTH_DEFAULT` (900), `clampSheetWidth(value) => number`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/utils/sheetWidth.test.js`:

```js
import {
  SHEET_WIDTH_MIN, SHEET_WIDTH_MAX, SHEET_WIDTH_STEP, SHEET_WIDTH_DEFAULT, clampSheetWidth,
} from './sheetWidth';

describe('sheet width bounds', () => {
  test('describe a usable range, with the default inside it', () => {
    // Not a restatement of the literals: these relationships are what every consumer assumes.
    // The floor also matches DraggablePopup's own `const minWidth = 600` resize limit — a
    // template that opened narrower than a player can drag it back to would be a width nobody
    // could undo. That cross-file agreement cannot be asserted from here; it is why 600.
    expect(SHEET_WIDTH_MIN).toBeLessThan(SHEET_WIDTH_MAX);
    expect(SHEET_WIDTH_DEFAULT).toBeGreaterThanOrEqual(SHEET_WIDTH_MIN);
    expect(SHEET_WIDTH_DEFAULT).toBeLessThanOrEqual(SHEET_WIDTH_MAX);
    expect((SHEET_WIDTH_MAX - SHEET_WIDTH_MIN) % SHEET_WIDTH_STEP).toBe(0);
  });
});

describe('clampSheetWidth', () => {
  test('returns the default for a template that never set one', () => {
    expect(clampSheetWidth(undefined)).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth(null)).toBe(SHEET_WIDTH_DEFAULT);
  });

  test('treats 0 as unset, because omitempty drops it on the wire', () => {
    expect(clampSheetWidth(0)).toBe(SHEET_WIDTH_DEFAULT);
  });

  test('keeps a value inside the range untouched', () => {
    expect(clampSheetWidth(1300)).toBe(1300);
    expect(clampSheetWidth(SHEET_WIDTH_MIN)).toBe(SHEET_WIDTH_MIN);
    expect(clampSheetWidth(SHEET_WIDTH_MAX)).toBe(SHEET_WIDTH_MAX);
  });

  test('pulls an out-of-range value back to the nearest bound', () => {
    expect(clampSheetWidth(120)).toBe(SHEET_WIDTH_MIN);
    expect(clampSheetWidth(99999)).toBe(SHEET_WIDTH_MAX);
  });

  test('falls back to the default for anything that is not a finite number', () => {
    expect(clampSheetWidth('1200')).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth(NaN)).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth(Infinity)).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth({})).toBe(SHEET_WIDTH_DEFAULT);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `warhammer-battle-helper-front/`:

```bash
CI=true npm test -- --watchAll=false --testPathPattern=sheetWidth
```

Expected: FAIL — `Cannot find module './sheetWidth' from 'src/utils/sheetWidth.test.js'`.

- [ ] **Step 3: Write the implementation**

Create `warhammer-battle-helper-front/src/utils/sheetWidth.js`:

```js
/**
 * The character sheet window's opening width, authored by the GM per custom template.
 *
 * These four numbers are the single place the slider in the creator and the popup in the
 * session agree on. The floor matches DraggablePopup's own resize minimum: a template that
 * opened narrower than a player can drag it back to would be a width nobody could undo. The
 * ceiling only bounds the input — the real limit at open time is the viewport, which
 * DraggablePopup already applies with Math.min(initialWidth, window.innerWidth).
 */

export const SHEET_WIDTH_MIN = 600;
export const SHEET_WIDTH_MAX = 2400;
export const SHEET_WIDTH_STEP = 50;
export const SHEET_WIDTH_DEFAULT = 900;

// clampSheetWidth turns whatever is stored into a width worth using. The slider cannot produce
// a bad value, but a template written before this setting existed has none at all, and one
// hand-edited in the database can hold anything. 0 reads as "unset" rather than as a width,
// because the model stores the field with omitempty and 0 is not a legal width anyway.
export function clampSheetWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    return SHEET_WIDTH_DEFAULT;
  }
  return Math.min(SHEET_WIDTH_MAX, Math.max(SHEET_WIDTH_MIN, value));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=sheetWidth
```

Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/sheetWidth.js warhammer-battle-helper-front/src/utils/sheetWidth.test.js
git commit -m "feat: FEATURE-212 sheet window width bounds and fallback"
```

---

### Task 2: Store the width on the template

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (the `TemplateSettings` struct)
- Test: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.TemplateSettings.SheetWidth int`, serialized as `sheetWidth` in both bson and json.

- [ ] **Step 1: Write the failing test**

Add to `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`. Read the existing `TestFieldDef_LabelRoundTripsThroughBSON` in that file first and follow its style and imports; the test below must match whatever helper and package conventions it already uses.

```go
// TestTemplateSettings_SheetWidthRoundTrips guards the struct tags. A key missing from the
// struct is dropped on read and erased by the next PATCH, silently — and the PATCH path is
// JSON while storage is bson, so both encodings have to carry it.
func TestTemplateSettings_SheetWidthRoundTrips(t *testing.T) {
	in := TemplateSettings{SheetWidth: 1300}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}
	var fromBSON TemplateSettings
	if err := bson.Unmarshal(raw, &fromBSON); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if fromBSON.SheetWidth != 1300 {
		t.Fatalf("bson round trip lost the width: got %d", fromBSON.SheetWidth)
	}

	encoded, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var fromJSON TemplateSettings
	if err := json.Unmarshal(encoded, &fromJSON); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if fromJSON.SheetWidth != 1300 {
		t.Fatalf("json round trip lost the width: got %d", fromJSON.SheetWidth)
	}
}

// TestTemplateSettings_SheetWidthOmittedWhenZero documents why the field is a plain int: zero
// is not a legal width, so omitempty dropping it is exactly the wanted behaviour — unlike
// FieldDef.Default, whose 0 is a real value and which is therefore a *int.
func TestTemplateSettings_SheetWidthOmittedWhenZero(t *testing.T) {
	encoded, err := json.Marshal(TemplateSettings{})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	if strings.Contains(string(encoded), "sheetWidth") {
		t.Fatalf("expected sheetWidth to be omitted when zero, got %s", encoded)
	}
}
```

Add `encoding/json` and `strings` to that file's imports if they are not already there.

- [ ] **Step 2: Run the test to verify it fails**

From `warhammer-battle-helper-backend/`:

```bash
go test ./internal/models/ -run SheetWidth -v
```

Expected: FAIL — `unknown field SheetWidth in struct literal of type TemplateSettings`.

- [ ] **Step 3: Write the implementation**

In `internal/models/SystemTemplate.go`, add to `TemplateSettings`, after the `Modifier` field:

```go
	// SheetWidth is the character sheet window's opening width in pixels, authored by the GM in
	// the creator's General tab (FEATURE-212). 0 or absent means the client's default — a plain
	// int, not a pointer, because 0 is not a legal width (the slider floor is 600), so omitempty
	// cannot erase a meaningful value the way it could for FieldDef.Default, whose 0 is real.
	// Nothing in Go reads it: the client is the only consumer.
	SheetWidth int `bson:"sheetWidth,omitempty" json:"sheetWidth,omitempty"`
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
go test ./internal/models/ -run SheetWidth -v
go test ./...
gofmt -l internal/
```

Expected: the two new tests PASS, the full suite stays green, and `gofmt -l` lists no file that was not already listed before this task.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/
git commit -m "feat: FEATURE-212 store the sheet window width on the template"
```

---

### Task 3: Extract `TemplatePreview` into its own file

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/TemplatePreview.jsx`
- Create: `warhammer-battle-helper-front/src/components/creator/TemplatePreview.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (delete the local `TemplatePreview`, import the new module)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TemplatePreview` as the default export of `components/creator/TemplatePreview.jsx`, props `{ sections, name }` — unchanged from today.

This task changes no behaviour. It exists because `TemplatePreview` currently sits inside a ~1700-line file and is not exported, so it cannot be rendered in a test without pulling the whole creator (MUI dialogs, dnd-kit) into the test. Task 4 adds a prop to it that the GM relies on visually, and that prop deserves a test.

- [ ] **Step 1: Move the component, unchanged**

Cut the whole `TemplatePreview` function out of `TemplateBuilder.jsx` — including the `// ── TemplatePreview ──` banner comment above it — and paste it into the new file:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import CustomSheetBody from '../../systems/custom/CustomSheetBody';

// The creator's Preview tab: the sheet as a player will see it, drawn by the very same
// CustomSheetBody the session uses, so the tab cannot drift from the real thing.
function TemplatePreview({ sections, name }) {
  const { t } = useTranslation();
  if (sections.length === 0) {
    return (
      <div className="creator__preview">
        <div className="creator__prev-empty">
          {t('creator.previewNoSections')}
        </div>
      </div>
    );
  }

  return (
    <div className="creator__preview">
      <div className="creator__prev-sheet">
        <div className="creator__prev-sheet-top" />
        <div className="creator__prev-sheet-header">
          <div className="creator__prev-system-name">{name || t('creator.previewDefaultName')}</div>
          <div className="creator__prev-system-label">{t('creator.previewSubtitle')}</div>
        </div>
        <div className="creator__prev-body">
          <CustomSheetBody sections={sections} />
        </div>
      </div>
    </div>
  );
}

export default TemplatePreview;
```

That body is the current one, copied out of `TemplateBuilder.jsx` — diff it against the file before deleting the original, and keep whatever the file actually says if the two disagree. In `TemplateBuilder.jsx`, add:

```js
import TemplatePreview from './TemplatePreview';
```

and remove the now-unused `CustomSheetBody` import **only if** nothing else in `TemplateBuilder.jsx` still uses it — grep first, because `collectSkillOptions` is imported from the same module and may share the import statement.

- [ ] **Step 2: Write the characterisation test**

Create `warhammer-battle-helper-front/src/components/creator/TemplatePreview.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import TemplatePreview from './TemplatePreview';

const sections = [
  { id: 'sec_a', title: 'Cechy', columns: 2, fields: [
    { key: 'attr_str', type: 'attr', label: 'Siła' },
  ] },
];

describe('TemplatePreview', () => {
  test('renders the template name and its sections', () => {
    render(<TemplatePreview sections={sections} name="Mój system" />);
    expect(screen.getByText('Mój system')).toBeInTheDocument();
    expect(screen.getByText('Cechy')).toBeInTheDocument();
  });

  test('shows the empty-state message when there are no sections', () => {
    const { container } = render(<TemplatePreview sections={[]} name="Mój system" />);
    expect(container.querySelector('.creator__prev-empty')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=TemplatePreview
CI=true npm test -- --watchAll=false
```

Expected: the new file PASSES, and the full suite is 746 + 2 new tests, with only the `App.test.js` baseline failure. ESLint clean on both touched files — watch for an orphaned `CustomSheetBody` import in `TemplateBuilder.jsx`.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-212 extract TemplatePreview so it can be tested on its own"
```

---

### Task 4: The slider in the General tab, and the preview that follows it

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplatePreview.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplatePreview.test.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `SHEET_WIDTH_MIN`, `SHEET_WIDTH_MAX`, `SHEET_WIDTH_STEP`, `clampSheetWidth` from Task 1; `TemplatePreview` from Task 3.
- Produces: `TemplatePreview` gains a `width` prop (a number, already clamped by the caller).

- [ ] **Step 1: Write the failing test**

Add to `warhammer-battle-helper-front/src/components/creator/TemplatePreview.test.jsx`:

```jsx
  test('renders the sheet at the width the GM configured', () => {
    const { container } = render(<TemplatePreview sections={sections} name="Mój system" width={1300} />);
    expect(container.querySelector('.creator__prev-sheet')).toHaveStyle({ maxWidth: '1300px' });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=TemplatePreview
```

Expected: FAIL — the received style has no `max-width`, because the prop is not read yet.

- [ ] **Step 3: Read the prop in the preview**

In `TemplatePreview.jsx`, take `width` and apply it to the sheet wrapper:

```jsx
function TemplatePreview({ sections, name, width }) {
```

and on the `.creator__prev-sheet` element:

```jsx
      <div className="creator__prev-sheet" style={{ maxWidth: width }}>
```

`maxWidth`, not `width`: the preview must never grow past the tab it lives in, so a GM who picks 2400 on a laptop sees the sheet cut to the creator's own width — which is exactly what a player with that screen will see.

Note what this overrides. `.creator__prev-sheet` already carries `max-width: 860px` in `style.css`, so until now the preview has been drawn 860px wide while the real sheet opened at 900 — the tab has always been slightly narrower than the thing it previews. An inline style beats a stylesheet rule, so passing the width here replaces that cap rather than fighting it, and the preview becomes truthful for the first time. Leave the CSS rule alone: it stays as the width the preview falls back to if `width` is ever undefined.

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=TemplatePreview
```

Expected: PASS.

- [ ] **Step 5: Add the translations**

In `src/locales/en/translation.json`, inside `"creator"."general"`:

```json
      "sheetWidthTitle": "Character sheet window",
      "sheetWidthHint": "How wide the sheet opens for players",
      "sheetWidthValue": "{{width}} px",
      "sheetWidthNote": "The window never opens wider than the player's browser, and players can resize it.",
```

In `src/locales/pl/translation.json`, at the same place:

```json
      "sheetWidthTitle": "Okno karty postaci",
      "sheetWidthHint": "Jak szeroko karta otwiera się graczom",
      "sheetWidthValue": "{{width}} px",
      "sheetWidthNote": "Okno nigdy nie otworzy się szersze niż przeglądarka gracza, a gracz może je rozciągnąć.",
```

- [ ] **Step 6: Add the settings card**

In `TemplateBuilder.jsx`, add `Slider` to the existing `@mui/material` import, and add:

```js
import { SHEET_WIDTH_MIN, SHEET_WIDTH_MAX, SHEET_WIDTH_STEP, clampSheetWidth } from '../../utils/sheetWidth';
```

In the General tab, directly after the visibility card's closing `)}`, add a card guarded the same way — a variant's sheet comes from its Go plugin, so its width is not the GM's to set:

```jsx
            {!isVariant && (
            <div className="creator__settings-card">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.general.sheetWidthTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.sheetWidthHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, maxWidth: 420 }}>
                  <Slider
                    value={clampSheetWidth(settings.sheetWidth)}
                    min={SHEET_WIDTH_MIN}
                    max={SHEET_WIDTH_MAX}
                    step={SHEET_WIDTH_STEP}
                    onChange={(_, value) => updateSettings({ sheetWidth: value })}
                    sx={{ color: '#c9975b' }}
                  />
                  <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.95rem', color: '#3a2f1f', whiteSpace: 'nowrap', minWidth: 72, textAlign: 'right' }}>
                    {t('creator.general.sheetWidthValue', { width: clampSheetWidth(settings.sheetWidth) })}
                  </Typography>
                </Box>
                <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary', mt: 0.5 }}>
                  {t('creator.general.sheetWidthNote')}
                </Typography>
              </div>
            </div>
            )}
```

The slider writes through the existing `updateSettings`, so the debounce, the autosave and the flush-before-close all apply unchanged.

- [ ] **Step 7: Pass the width to the preview**

In the tab dispatch, replace:

```jsx
        ) : activeTab === 'preview' ? <TemplatePreview sections={sections} name={name} /> : <>
```

with:

```jsx
        ) : activeTab === 'preview' ? <TemplatePreview sections={sections} name={name} width={clampSheetWidth(settings.sheetWidth)} /> : <>
```

- [ ] **Step 8: Verify and commit**

```bash
CI=true npm test -- --watchAll=false
```

Expected: 746 + 3 new tests, only the `App.test.js` baseline failure, output pristine. ESLint clean on every touched file. Check by eye that both locale files still parse as JSON (`node -e "require('./src/locales/pl/translation.json')"`).

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: FEATURE-212 GM sets the sheet window width in the creator"
```

---

### Task 5: The session sheet opens at the configured width

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx` (the `DraggablePopup` at the end of the component)

**Interfaces:**
- Consumes: `clampSheetWidth` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Read the width from the template**

Add the import:

```js
import { clampSheetWidth } from '../../utils/sheetWidth';
```

and replace the hardcoded prop:

```jsx
      initialWidth={900}
```

with:

```jsx
      initialWidth={clampSheetWidth(template?.settings?.sheetWidth)}
```

`template` can be null — the component already renders a "no template" branch for that case — so the optional chaining is required, and `clampSheetWidth` turns the resulting `undefined` into the default.

Do not touch `systems/coc7e/CharacterSheet.jsx`, `systems/dnd5e/CharacterSheet.jsx` or `warhammer4e`: their sheets come from their plugins and their widths are the developer's call, not the GM's.

- [ ] **Step 2: Verify nothing regressed**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=custom
CI=true npm test -- --watchAll=false
```

Expected: the `systems/custom` suites stay green — `CharacterSheet.standalone.test.jsx` is the one that exercises this component's two render paths — and the full suite shows only the `App.test.js` baseline failure. ESLint clean.

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx
git commit -m "feat: FEATURE-212 open the custom sheet at the template's configured width"
```

---

## Verification checklist

Before calling the feature done:

- [ ] `CI=true npm test -- --watchAll=false` — green except `App.test.js` (axios ESM, known baseline)
- [ ] `go test ./...` — green, and `gofmt -l internal/` flags no new file
- [ ] In the creator: the "Character sheet window" card appears for a custom template and is ABSENT for a named variant of a built-in system
- [ ] Moving the slider changes the width of the sheet drawn in the Preview tab
- [ ] The value survives closing and reopening the creator (autosave)
- [ ] A game using that template opens the character sheet at the configured width. A game embeds a COPY of the template (`GameService.go:59`), refreshed only by `SyncTemplate` (`GameService.go:2966`) — so test a game created AFTER the change, or run "Sync template" in an older one first. Reopening a sheet in a pre-existing game shows the OLD width and is not a bug.
- [ ] A template that never had the setting still opens at 900
- [ ] Shrinking the browser below the configured width still opens the sheet inside the viewport
