# PLAYRPG-265 Creator Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutorials for the character-sheet creator — one per tab (General, Sheet) and a per-field one opened from the property popup — on the same react-joyride engine as the game screen.

**Architecture:** The game tutorial engine is split into a shared core (`useTour` hook + `TourRunner` component) and thin layers: `GameTour` (game) and `CreatorTour` (creator). Creator tours live in the same registry (`tutorial/tours/`) and i18n space (`tutorial.*`); per-field text varies by a new `byFieldType` axis with a `default` fallback. A coverage test makes every property-panel group and General-tab card carry a tour step.

**Tech Stack:** React (CRA, Jest + Testing Library), react-joyride 3.x, i18next, MUI.

**Spec:** `docs/superpowers/specs/PLAYRPG-265.md`

## Global Constraints

- Work on branch `PLAYRPG-265`. Run `git branch --show-current` in the same command as every `git commit` and abort if it is not `PLAYRPG-265` (another session may share the checkout).
- Never stage `warhammer-battle-helper-front/nginx.conf` or `warhammer-battle-helper-front/package-lock.json`.
- Code comments in English for new/modified comments (existing Polish comments in `tutorial/` may stay where untouched).
- All UI strings via `t('key')`, keys in BOTH `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`. No MUI `<Tooltip>`.
- Game tutorial behaviour must not change: existing game tutorial tests keep their assertions (only imports/setup wiring may change where a task says so).
- Frontend tests: from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Known baseline fail: `App.test.js`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

## File Map

- `src/components/tutorial/engine/stepResolution.js` (+ test) — `byFieldType` axis, `bodyKeysFor`.
- `src/components/tutorial/engine/useTour.js` (renamed from `useGameTour.js`, + renamed test).
- `src/components/tutorial/engine/TourRunner.jsx` (new) — Joyride + events.
- `src/components/tutorial/engine/GameTour.jsx` — thin game layer; exports `seenKey`.
- `src/components/tutorial/tours/creatorGeneral.js`, `creatorSheet.js`, `creatorField.js` (new) + `tours/index.js` + `tours/index.test.js`.
- `src/components/tutorial/tourTranslations.test.js` — `byFieldType` coverage.
- `src/components/creator/CreatorTour.jsx` (new) — creator layer + `CreatorTourButton`, `CreatorFieldTourButton`.
- `src/components/creator/TemplateBuilder.jsx` — anchors, `PropsGroup` ids, provider, buttons, `disableEnforceFocus`, export `FIELD_TYPES`.
- `src/components/creator/FieldChrome.jsx`, `SectionChrome.jsx`, `PropertyPopup.jsx` — anchor classes, `headerButtons`.
- `src/components/creator/creatorTour.coverage.test.jsx`, `src/components/creator/CreatorTour.test.jsx` (new).
- Existing full-mount creator tests (`TemplateBuilder.charNameWarning|chromeWiring|sharing|deleteConfirm|sheetWidth.test.jsx`) — mark creator tours seen.
- `src/locales/{en,pl}/translation.json`, `src/style.css` (only if a new class needs styling — none planned).
- `CLAUDE.md`.

---

### Task 1: Variant axis `byFieldType` and fallback key chain

**Files:**
- Modify: `src/components/tutorial/engine/stepResolution.js`
- Test: `src/components/tutorial/engine/stepResolution.test.js`

**Interfaces:**
- Produces: `VARIANT_AXES.byFieldType(ctx) → ctx.fieldType`; `bodyKeysFor(step, tourId, ctx) → string[]` (most specific first). A step with `variantFallback: true` gets `${base}.default` appended as the last key. `bodyKeyFor` unchanged (returns `bodyKeysFor(...)[0]`).

- [ ] **Step 1: Write the failing tests** — append to `stepResolution.test.js` (and add `bodyKeysFor` to its import list):

```js
describe('field-type variants', () => {
  it('appends the field type for byFieldType', () => {
    expect(bodyKeyFor({ id: 'content', variants: ['byFieldType'] }, 'creatorField', { fieldType: 'select' }))
      .toBe('tutorial.creatorField.content.body.select');
  });

  // A group step says something general that a few field types sharpen: the variant is tried
  // first and the step's `default` text is the fallback i18next lands on when it is missing.
  it('chains the default key after the variant when the step declares a fallback', () => {
    const step = { id: 'content', variants: ['byFieldType'], variantFallback: true };
    expect(bodyKeysFor(step, 'creatorField', { fieldType: 'number' })).toEqual([
      'tutorial.creatorField.content.body.number',
      'tutorial.creatorField.content.body.default',
    ]);
  });

  it('returns a single key for a step without fallback', () => {
    expect(bodyKeysFor({ id: 'upload' }, 'files', {})).toEqual(['tutorial.files.upload.body']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=stepResolution`
Expected: FAIL — `bodyKeysFor is not a function` / `byFieldType` suffix missing.

- [ ] **Step 3: Implement** — in `stepResolution.js`:

Add to `VARIANT_AXES`:

```js
  // Which field type the creator's property panel is showing ('section' for a section).
  byFieldType: (ctx) => ctx.fieldType,
```

Replace `bodyKeyFor` with:

```js
// bodyKeysFor lists the keys a step's body may live under, most specific first; the renderer
// passes the list to t(), which takes the first that exists. A step with `variantFallback`
// ends the list with `<base>.default`, so a variant written for only some contexts (e.g. a few
// field types) falls back to general text instead of showing a raw key.
export const bodyKeysFor = (step, tourId, ctx) => {
  const base = `tutorial.${tourId}.${step.id}.body`;
  // An axis missing from VARIANT_AXES is a typo in the tour file — skip it rather than crash the
  // render (tours/index.test.js catches it at registry level).
  const suffixes = (step.variants || [])
    .filter(axis => Object.prototype.hasOwnProperty.call(VARIANT_AXES, axis))
    .map(axis => VARIANT_AXES[axis](ctx));
  const keys = [[base, ...suffixes].join('.')];
  if (step.variantFallback) keys.push(`${base}.default`);
  return keys;
};

export const bodyKeyFor = (step, tourId, ctx) => bodyKeysFor(step, tourId, ctx)[0];
```

(Delete the old Polish comment that sat above `bodyKeyFor` — its content is now in the English comment above.)

- [ ] **Step 4: Run tests** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/engine/stepResolution.js src/components/tutorial/engine/stepResolution.test.js
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "feat: PLAYRPG-265 field-type tutorial variants with a default fallback"
```

---

### Task 2: `useGameTour` → `useTour` (storageKey, optional role)

**Files:**
- Rename: `src/components/tutorial/engine/useGameTour.js` → `useTour.js`; `useGameTour.test.js` → `useTour.test.js`
- Modify: `src/components/tutorial/engine/GameTour.jsx` (import + options + `seenKey`)
- Modify comments that name `useGameTour`: `tours/index.test.js`, `tours/gameScreen.js`, `TourButton.integration.test.jsx`, `engine/GameTour.smoke.test.jsx` (text only)

**Interfaces:**
- Produces: `useTour({ tourId, role = null, panels = {}, onReveal = () => {}, queryTarget, screenReady = true, autoStart = true, storageKey = null, onFinish }) → { steps, stepIndex, running, start, goTo, finish }`. `storageKey` null = never read or write the seen flag. Auto-start latches per `storageKey || tourId`.
- `GameTour.jsx` exports `seenKey(role) → 'tutorialSeen:<role>'`.

- [ ] **Step 1: Rename files**

```bash
cd src/components/tutorial/engine
git mv useGameTour.js useTour.js
git mv useGameTour.test.js useTour.test.js
```

- [ ] **Step 2: Adapt the test to the new contract (it must fail before Step 3)**

In `useTour.test.js`:
- Import: `import { useTour } from './useTour';` and `import { seenKey } from './GameTour';`
- `describe('useGameTour'` → `describe('useTour'`.
- Replace `setup` with a version that wires the hook exactly like `GameTour` will (role gates auto-start, role names the seen flag):

```js
const setup = ({ tourId = 'gameScreen', role = 'gm', panels = OPEN, queryTarget = allTargets(), screenReady = true } = {}, options = {}) => {
  const onReveal = jest.fn();
  const view = renderHook(
    (props) => {
      const r = 'role' in props ? props.role : role;
      return useTour({
        tourId, onReveal, queryTarget, ...props,
        role: r, autoStart: !!r, storageKey: r ? seenKey(r) : null,
      });
    },
    { initialProps: { panels, screenReady }, ...options }
  );
  return { view, onReveal, queryTarget };
};
```

- Extend the existing `jest.mock('../tours', …)` so it also serves a tour whose step declares no
  roles (define the constants above the mock, next to `ARRAY_TARGET_TOUR`):

```js
const NO_ROLE_TOUR_ID = 'noRoleTest';
const NO_ROLE_TOUR = { id: NO_ROLE_TOUR_ID, steps: [{ id: 'open', target: '.anything' }] };
```

  and in the mock: `getTour: (id) => (id === ARRAY_TARGET_TOUR_ID ? ARRAY_TARGET_TOUR : id === NO_ROLE_TOUR_ID ? NO_ROLE_TOUR : actual.getTour(id)),`
- Append:

```js
describe('useTour without a game', () => {
  beforeEach(() => localStorage.clear());

  it('keeps no seen flag when storageKey is null', () => {
    const { result } = renderHook(() => useTour({ tourId: 'gameScreen', role: 'gm', queryTarget: () => ({}), storageKey: null }));
    act(() => result.current.finish());
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('uses the storage key it is given', () => {
    const { result } = renderHook(() => useTour({ tourId: 'gameScreen', role: 'gm', queryTarget: () => ({}), storageKey: 'tutorialSeen:x' }));
    act(() => result.current.finish());
    expect(localStorage.getItem('tutorialSeen:x')).toBe('1');
  });

  // Creator tours have no roles at all: a step without `roles` must pass for a null role.
  it('keeps steps without roles when there is no role', () => {
    const { result } = renderHook(() => useTour({ tourId: NO_ROLE_TOUR_ID, queryTarget: () => ({}), autoStart: false }));
    act(() => { result.current.start(); });
    expect(result.current.running).toBe(true);
    expect(result.current.steps.map(s => s.id)).toEqual(['open']);
  });
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern='engine/useTour'`
Expected: FAIL — `useTour` is not exported (file still exports `useGameTour`), `seenKey` not in GameTour.

- [ ] **Step 3: Implement `useTour.js`**

Rename the export and replace the storage helpers and options:

```js
const readSeen = (key) => {
  if (!key) return false;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false; // private window / blocked storage — show the tour, nothing breaks
  }
};

const writeSeen = (key) => {
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* a failed write only means the tour shows again next time */
  }
};

const noop = () => {};
const defaultQueryTarget = (selector) => document.querySelector(selector);

// useTour drives one tour: which steps are live (role match + anchor on screen), the current
// step, auto-start and the "seen" flag. It knows nothing about the game or the creator — those
// pass a storageKey (or null for a tour that is never remembered) and decide when auto-start is
// allowed (the game waits for a role).
export function useTour({
  tourId,
  role = null,
  panels = {},
  onReveal = noop,
  queryTarget = defaultQueryTarget,
  screenReady = true,
  autoStart = true,
  storageKey = null,
  onFinish,
}) {
```

- Remove the exported `seenKey` from this file.
- `autoStarted` becomes a set: `const autoStarted = useRef(new Set());`
- `finish`: replace `if (persist && role) writeSeen(role);` with `writeSeen(storageKey);` and its deps `[storageKey, onFinish]`.
- The step filter line stays as is (`if (step.roles && !step.roles.includes(role)) return;`).
- Replace the auto-start effect with:

```js
  // Auto-start waits for the screen-ready signal: before it, anchors that render late (the game's
  // DndContext placeholder) would be missing from the snapshot. The latch is per storageKey (or
  // tourId), so a component that switches between tours — the creator's two tabs — auto-starts
  // each one once. Manual start() ignores both the latch and screenReady.
  useEffect(() => {
    const latch = storageKey || tourId;
    if (!autoStart || !screenReady || !latch || autoStarted.current.has(latch)) return;
    if (readSeen(storageKey)) {
      autoStarted.current.add(latch);
      return;
    }
    if (start()) autoStarted.current.add(latch);
  }, [autoStart, screenReady, storageKey, tourId, start]);
```

Translate the remaining Polish comments in this file to English while touching it.

- [ ] **Step 4: Update `GameTour.jsx` (still the old body otherwise)**

```js
import { useTour } from './useTour';

// The game's seen flag is per role: the GM and player tours differ.
export const seenKey = (role) => `tutorialSeen:${role}`;
```

and the hook call:

```js
  const { steps, stepIndex, running, start, goTo, finish } = useTour({
    tourId, role, panels, onReveal, screenReady,
    autoStart: isDefaultTour && !!role,
    storageKey: isDefaultTour && role ? seenKey(role) : null,
    onFinish: clearTour,
  });
```

Update comments naming `useGameTour` in the files listed above to `useTour` (comment text only).

- [ ] **Step 5: Run the tutorial suite**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='components/tutorial'`
Expected: PASS (all existing assertions unchanged).

- [ ] **Step 6: Commit**

```bash
git add -A src/components/tutorial
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "refactor: PLAYRPG-265 useGameTour becomes the generic useTour"
```

---

### Task 3: Extract `TourRunner` from `GameTour`

**Files:**
- Create: `src/components/tutorial/engine/TourRunner.jsx`
- Modify: `src/components/tutorial/engine/GameTour.jsx`
- Test: existing `GameTour.smoke.test.jsx`, `TourButton.integration.test.jsx`, `TourButton.test.jsx` (unchanged)

**Interfaces:**
- Produces: `TourRunner({ tourId, steps, stepIndex, running, goTo, finish, contentFor })` — renders `null` when not running or no steps. `contentFor(step) → ReactNode`.

- [ ] **Step 1: Confirm the guard tests are green**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='components/tutorial'` → PASS.

- [ ] **Step 2: Create `TourRunner.jsx`**

Move from `GameTour.jsx` verbatim: `TOUR_OPTIONS`, `TOUR_STYLES` (with their comments, translated to English), the `locale` memo, the `handleEvent` callback (with its comments, translated) and the `<Joyride>` render. Shape:

```jsx
import React, { useCallback, useMemo } from 'react';
import { Joyride, ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { titleKeyFor } from './stepResolution';
import TourTooltip from './TourTooltip';

// <moved TOUR_OPTIONS + TOUR_STYLES>

// TourRunner renders one running tour with react-joyride: the project's tooltip, the shared look,
// translated button labels and the three ways a tour ends (Skip/Done, Escape, a vanished anchor).
// What a step SAYS is the caller's: contentFor(step) returns the body, so the game can put its
// tab legend there and the creator plain text.
const TourRunner = ({ tourId, steps, stepIndex, running, goTo, finish, contentFor }) => {
  const { t, i18n } = useTranslation();

  const joyrideSteps = useMemo(
    () => steps.map(step => ({
      target: step.resolvedTarget,
      placement: step.placement,
      title: t(titleKeyFor(step, tourId)),
      content: contentFor(step),
    })),
    // i18n.language: a language switch mid-tour must rebuild the texts; `t` alone does not
    // guarantee a recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, tourId, contentFor, t, i18n.language]
  );

  // <moved locale memo>
  // <moved handleEvent>

  if (!running || joyrideSteps.length === 0) return null;

  return (
    <Joyride
      run={running}
      stepIndex={stepIndex}
      steps={joyrideSteps}
      continuous
      locale={locale}
      options={TOUR_OPTIONS}
      styles={TOUR_STYLES}
      tooltipComponent={TourTooltip}
      onEvent={handleEvent}
    />
  );
};

export default TourRunner;
```

- [ ] **Step 3: Slim `GameTour.jsx`**

Keep: `seenKey`, `useTutorial`, `tourId`/`isDefaultTour`, the `useTour` call, the `combinedSignal` effect. Replace the rest with:

```jsx
  const contentFor = useCallback(
    (step) => (step.id === 'tabsNav'
      ? <TabsLegend isGM={role === 'gm'} />
      : <p>{t(bodyKeysFor(step, tourId, { targetIndex: step.targetIndex, role, controlScheme }))}</p>),
    [tourId, role, controlScheme, t]
  );

  return (
    <TourRunner
      tourId={tourId}
      steps={steps}
      stepIndex={stepIndex}
      running={running}
      goTo={goTo}
      finish={finish}
      contentFor={contentFor}
    />
  );
```

Imports: `useCallback, useEffect, useRef` from react, `useTranslation`, `useTour`, `bodyKeysFor` from `./stepResolution`, `TourRunner`, `TabsLegend`, `useTutorial`. Remove now-unused imports (`Joyride`, `ACTIONS`, …, `titleKeyFor`, `TourTooltip`, `useMemo`). Translate comments you keep to English.

- [ ] **Step 4: Run** `CI=true npm test -- --watchAll=false --testPathPattern='components/tutorial|GameSession'` → PASS; `npx eslint src/components/tutorial` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/tutorial
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "refactor: PLAYRPG-265 extract TourRunner from GameTour"
```

---

### Task 4: Creator anchors

Pure markup additions — no behaviour change. Each anchor is a class the tours of Task 5 target.

**Files:**
- Modify: `src/components/creator/TemplateBuilder.jsx`, `FieldChrome.jsx`, `SectionChrome.jsx`, `PropertyPopup.jsx`

**Interfaces:**
- Produces classes: `creator__name-input` (template-name `TextField` root), `creator__preview-toggle` (preview `IconButton`), `creator__status` (counter `Typography`), `creator__settings-card--visibility|--sheet-width|--dice|--modifier|--token`, `creator__chrome-outline--field` (FieldChrome outline), `creator__chrome-outline--section` (SectionChrome outline), `creator__section-title-input` (SectionPropertyPanel title `TextField` root), `creator__props-group--<id>` from `PropsGroup id`. `FIELD_TYPES` becomes a named export. `PropertyPopup` accepts `headerButtons` and passes it to `DraggablePopup`.

- [ ] **Step 1: TemplateBuilder top bar** — add `className="creator__name-input"` to the template-name `TextField`; `className="creator__preview-toggle"` to the preview `IconButton`; `className="creator__status"` to the `Typography` showing `{sectionCount} … {totalFieldCount}`.

- [ ] **Step 2: General tab cards** — the five `<div className="creator__settings-card">` in order become `creator__settings-card creator__settings-card--visibility`, `--sheet-width`, `--dice`, `--modifier`, `--token` (verify each by its title key: `visibilityTitle`, `sheetWidthTitle`, `diceTitle`, `modifierTitle`, `tokenDisplay.cardTitle`).

- [ ] **Step 3: `PropsGroup`** — signature `function PropsGroup({ id, title, children })`, root `className={`creator__props-group creator__props-group--${id}`}`. Add a one-line comment: the id is the tutorial anchor (`tours/creatorField.js`). Pass ids at every titled call site: `propsGroupDisplay`→`display`, `propsGroupBasics`→`basics`, `propsGroupValues`→`values`, `attrRows`→`attrRows`, `propsGroupFormula`→`formula`, `propsGroupContent`→`content`, `propsGroupRoll`→`roll`. The untitled delete wrapper (`<div className="creator__props-group">`) is not a `PropsGroup` — leave it.

- [ ] **Step 4: Section panel** — `className="creator__section-title-input"` on the title `TextField` in `SectionPropertyPanel`. (`.creator__layout-options` and `.creator__props-danger` already exist and are only used there.)

- [ ] **Step 5: Chrome outlines** — in `FieldChrome.jsx` the outline class becomes ``creator__chrome-outline creator__chrome-outline--field${selected ? ' creator__chrome-outline--selected' : ''}``; in `SectionChrome.jsx` the same with `--section`.

- [ ] **Step 6: `FIELD_TYPES` export** — `const FIELD_TYPES = [` → `export const FIELD_TYPES = [`.

- [ ] **Step 7: `PropertyPopup`** — `function PropertyPopup({ open, title, onClose, headerButtons, children })` and pass `headerButtons={headerButtons}` to `DraggablePopup`.

- [ ] **Step 8: Run creator tests** — `CI=true npm test -- --watchAll=false --testPathPattern='components/creator|CustomSheetBody'` → PASS (snapshots unaffected: chrome is creator-only and not in the session snapshot; if a snapshot fails, inspect — the only acceptable diff is the new outline modifier classes).

- [ ] **Step 9: Commit**

```bash
git add src/components/creator
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "feat: PLAYRPG-265 tutorial anchors in the creator"
```

---

### Task 5: Creator tours, texts and coverage tests

**Files:**
- Create: `src/components/tutorial/tours/creatorGeneral.js`, `creatorSheet.js`, `creatorField.js`
- Modify: `src/components/tutorial/tours/index.js`, `tours/index.test.js`, `tourTranslations.test.js`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (inside `"tutorial": { … }`)
- Create: `src/components/creator/creatorTour.coverage.test.jsx`

**Interfaces:**
- Consumes: Task 1 (`byFieldType`, `variantFallback`), Task 4 anchors, `FIELD_TYPES`.
- Produces: tour ids `creatorGeneral`, `creatorSheet`, `creatorField`; `CREATOR_TOUR_IDS` exported from `tours/index.js`.

- [ ] **Step 1: Tour files**

`tours/creatorGeneral.js`:

```js
// The creator's General tab, top bar first, then its settings cards in screen order. A variant of
// a built-in system shows only the token card; steps whose anchor is absent drop out by themselves.
const creatorGeneral = {
  id: 'creatorGeneral',
  steps: [
    { id: 'name', target: '.creator__name-input', placement: 'bottom' },
    { id: 'tabs', target: '.creator__tab-nav', placement: 'bottom' },
    { id: 'visibility', target: '.creator__settings-card--visibility', placement: 'auto' },
    { id: 'sheetWidth', target: '.creator__settings-card--sheet-width', placement: 'auto' },
    { id: 'dice', target: '.creator__settings-card--dice', placement: 'auto' },
    { id: 'modifier', target: '.creator__settings-card--modifier', placement: 'auto' },
    { id: 'token', target: '.creator__settings-card--token', placement: 'auto' },
    { id: 'help', target: '.creator__tour-btn', placement: 'bottom' },
  ],
};

export default creatorGeneral;
```

`tours/creatorSheet.js`:

```js
// The creator's Sheet tab. The canvas step varies by which anchor is live: the empty-canvas
// prompt (index 0) or the sheet itself (index 1). The section and field steps need a node on the
// canvas and drop out on an empty sheet. Outlines, not the hover-gated chrome pills, are the
// anchors: a pill is invisible until hovered.
const creatorSheet = {
  id: 'creatorSheet',
  steps: [
    { id: 'palette', target: '.creator__palette', placement: 'right' },
    { id: 'canvas', target: ['.creator__canvas-empty', '.creator__sheet-stack'], placement: 'auto', variants: ['byTarget'] },
    { id: 'section', target: '.creator__chrome-outline--section', placement: 'auto' },
    { id: 'field', target: '.creator__chrome-outline--field', placement: 'auto' },
    { id: 'properties', target: '.creator__chrome-outline--field', placement: 'auto' },
    { id: 'preview', target: '.creator__preview-toggle', placement: 'bottom' },
    { id: 'status', target: '.creator__status', placement: 'bottom' },
    { id: 'help', target: '.creator__tour-btn', placement: 'bottom' },
  ],
};

export default creatorSheet;
```

`tours/creatorField.js`:

```js
// The property popup of one field or section. The head step describes the edited type and has a
// text per type (no fallback). Each group step anchors on its PropsGroup id
// (creator__props-group--<id>) and has general text with optional per-type sharpening
// (variantFallback). Groups a type does not have drop out by themselves; the section panel has no
// groups and gets its own three steps instead.
const group = (id) => ({
  id, target: `.creator__props-group--${id}`, placement: 'auto', variants: ['byFieldType'], variantFallback: true,
});

const creatorField = {
  id: 'creatorField',
  steps: [
    { id: 'head', target: '.creator__props-head', placement: 'auto', variants: ['byFieldType'] },
    group('display'),
    group('basics'),
    group('values'),
    group('attrRows'),
    group('formula'),
    group('content'),
    group('roll'),
    { id: 'sectionTitle', target: '.creator__section-title-input', placement: 'auto' },
    { id: 'sectionColumns', target: '.creator__layout-options', placement: 'auto' },
    { id: 'sectionActions', target: '.creator__props-danger', placement: 'auto' },
  ],
};

export const CREATOR_FIELD_GROUP_IDS = ['display', 'basics', 'values', 'attrRows', 'formula', 'content', 'roll'];

export default creatorField;
```

`tours/index.js`: import the three, add them to `TOURS`, and export:

```js
// Tours of the character-sheet creator; everything else in TOURS belongs to the game screen.
export const CREATOR_TOUR_IDS = ['creatorGeneral', 'creatorSheet', 'creatorField'];
```

- [ ] **Step 2: Registry test** — in `tours/index.test.js`, the count test becomes:

```js
  it('registers exactly the game screen tour plus one per covered tab, plus the creator tours', () => {
    const gameTours = TOUR_IDS.filter(id => !CREATOR_TOUR_IDS.includes(id));
    expect(gameTours.length).toBe(TAB_DEFS.length - TABS_WITHOUT_TOUR.length + 1);
  });
```

(import `CREATOR_TOUR_IDS` from `./index`). Append:

```js
describe('creator tours', () => {
  it('registers the three creator tours', () => {
    CREATOR_TOUR_IDS.forEach(id => expect(getTour(id)).not.toBeNull());
  });
});
```

- [ ] **Step 3: Translation test** — in `tourTranslations.test.js`:
  - add the axios mock (copy the `jest.mock('axios', …)` block from `TemplateBuilder.weaponColumns.test.jsx`) and `import { FIELD_TYPES } from '../creator/TemplateBuilder';`
  - `const FIELD_TYPE_IDS = FIELD_TYPES.map(ft => ft.type);` (includes `section`)
  - in the main test, before the existing `keysFor(...)` loop, handle `byFieldType` steps and `continue` past the old loop for them:

```js
        if ((step.variants || []).includes('byFieldType')) {
          if (step.variantFallback) {
            const key = `tutorial.${tourId}.${step.id}.body.default`;
            if (missing(lng, key)) gaps.add(key);
          } else {
            FIELD_TYPE_IDS.forEach(fieldType => {
              const key = bodyKeyFor(step, tourId, { fieldType });
              if (missing(lng, key)) gaps.add(key);
            });
          }
          const title = titleKeyFor(step, tourId);
          if (missing(lng, title)) gaps.add(title);
          return;
        }
```

  (`getTour(tourId).steps.forEach(step => { … })` — `return` skips to the next step.)

Run: `CI=true npm test -- --watchAll=false --testPathPattern='tourTranslations|tours/index'`
Expected: FAIL — translation gaps for every creator key, and `tours/index.test.js › tour anchors`
fails on `creator__tour-btn` (the class does not exist anywhere in `src` yet).

- [ ] **Step 3b: Create `src/components/creator/CreatorTour.jsx`** with exactly the code in Task 6
  Step 1. It renders `creator__tour-btn`, which the anchor test needs; nothing mounts it until Task 6.

- [ ] **Step 4: i18n texts** — add inside `"tutorial"` in `src/locales/en/translation.json`:

```json
"creatorGeneral": {
  "name": { "title": "Template name", "body": "This is how the system appears in the list when someone creates a game. Every change saves automatically." },
  "tabs": { "title": "Two steps", "body": "General holds the settings of the whole system; Sheet is where you build the character sheet itself, field by field." },
  "visibility": { "title": "Who can use it", "body": "Anyone can create a game from a public template, but only you can edit it. A private template can also be shared with specific people by email." },
  "sheetWidth": { "title": "Sheet window width", "body": "How wide the character sheet opens for players. The Sheet tab shows the sheet at exactly this width." },
  "dice": { "title": "Dice under the chat", "body": "Choose which quick-roll dice buttons appear under the chat in games using this system." },
  "modifier": { "title": "Roll modifier", "body": "When on, every roll from this sheet first asks the player for a modifier, such as a bonus or a penalty from the situation." },
  "token": { "title": "Token display", "body": "Decide what a character's token shows on the map, e.g. a health bar or states read from fields on the sheet." },
  "help": { "title": "Help is always here", "body": "Click the question mark to replay the tutorial of the tab you are on. A field's properties window has its own question mark that explains that field." }
},
"creatorSheet": {
  "palette": { "title": "Components", "body": "Drag a field type from here onto the sheet. Types are grouped: layout, character, stats, text, choice and tables." },
  "canvas": { "title": "The sheet", "body": { "0": "The sheet is empty. Start with a section — the box that holds fields and decides how many columns they sit in.", "1": "This is the sheet exactly as players will see it: the same width and the same look. Click any part of it to edit it." } },
  "section": { "title": "Sections", "body": "A section groups fields under a heading and splits them into columns. Sections can be nested; drag one by its handle to move it." },
  "field": { "title": "Fields", "body": "Hover a field to see its toolbar: drag handle, move up and down, edit, duplicate and delete." },
  "properties": { "title": "Field properties", "body": "Click a field to open its properties: label, values, rolls and display options. The question mark in that window's title bar explains the field you are editing." },
  "preview": { "title": "Clean preview", "body": "Hide every editing tool to see the sheet exactly as a player will." },
  "status": { "title": "Saving", "body": "How many sections and fields the sheet has. Every change saves automatically — there is no save button." },
  "help": { "title": "Help is always here", "body": "Click the question mark to replay this tutorial. A field's properties window has its own question mark that explains that field." }
},
"creatorField": {
  "head": { "title": "What this is", "body": {
    "section": "A section holds fields under a heading and arranges them in columns.",
    "char_name": "The character's name, shown on the character list and next to the map token. One per sheet.",
    "char_avatar": "The character's portrait, used on the character list and as the map token. One per sheet.",
    "image": "An image the player uploads to the sheet, e.g. a coat of arms or a sketch.",
    "attr": "An attribute: a number the player can roll against, optionally split into a base value and advances.",
    "attr_table": "A table of attributes sharing one set of settings — handy for a whole set such as strength, agility and intelligence.",
    "number": "A plain number the player types in, e.g. money or experience. Formulas can read it.",
    "computed": "A value calculated from a formula over attributes and numbers. The player cannot type into it.",
    "progress": "A current/maximum pair shown as a bar, e.g. health or mana.",
    "text_short": "A single line of text, e.g. profession or origin.",
    "text_long": "A multi-line text area, e.g. a backstory or notes.",
    "checkbox": "A yes/no tick, e.g. a condition or an ability already used.",
    "select": "A choice from a list you define, e.g. race or class.",
    "skill_table": "A list of skills with values the player rolls against. Players can add their own if you allow it.",
    "weapons_table": "A table of weapons with your columns, an attack roll and a damage formula.",
    "data_table": "A table with your own columns for anything that is not rolled, e.g. equipment.",
    "skill_tree": "Skills arranged in a hierarchy, e.g. a skill and its specialisations.",
    "label": "Fixed text on the sheet — a heading, a hint or a rule reminder. It holds no value."
  } },
  "display": { "title": "Display", "body": {
    "default": "How the field looks on the sheet.",
    "skill_table": "The favourites star, a development mark for skills used this session, alphabetical order and a two-column layout.",
    "skill_tree": "The favourites star, a development mark for skills used this session, alphabetical order and a two-column layout split by branch.",
    "weapons_table": "Sort the rows by a short-text column you pick, and split the table into two columns.",
    "data_table": "Sort the rows by a short-text column you pick, and split the table into two columns."
  } },
  "basics": { "title": "Basics", "body": {
    "default": "The label players see, an optional abbreviation for compact views, and whether the field also appears on the short character card.",
    "label": "The text shown on the sheet, its colour and its size. The internal name only identifies the label here in the creator."
  } },
  "values": { "title": "Values", "body": {
    "default": "The field's starting value, limits and step.",
    "attr": "Minimum, maximum, starting value and step. Turn on advances to split the value into a base plus advances.",
    "number": "Minimum, maximum, starting value and the step of the arrow keys.",
    "skill_table": "Turn on advances to give every skill a base value plus advances; the base can come from the linked attribute."
  } },
  "attrRows": { "title": "Attributes", "body": {
    "default": "The attributes in this table: name, abbreviation, starting value and limits. Drag a row by its handle to reorder it."
  } },
  "formula": { "title": "Formula", "body": {
    "default": "Build the value from blocks: attributes, numbers, constants and operators. The sheet recalculates it as values change."
  } },
  "content": { "title": "Content", "body": {
    "default": "What the field contains.",
    "select": "The options the player chooses from.",
    "skill_table": "The skills on the list, optionally linked to an attribute, and whether players may add their own.",
    "skill_tree": "The tree of skills — add children to build specialisations — and whether players may add their own.",
    "weapons_table": "The columns (one may supply the attack skill), the damage formula and the preset weapons the GM provides.",
    "data_table": "The columns — including long text shown in an expandable row — and preset rows, always on the sheet or offered as a list."
  } },
  "roll": { "title": "Roll", "body": {
    "default": "Whether the field can be rolled and how: the dice, the success condition and the levels of success.",
    "weapons_table": "The attack roll: dice and success condition. The threshold comes from the skill picked in the skill column."
  } },
  "sectionTitle": { "title": "Heading", "body": "The heading shown above the section. Leave it empty for a section without one." },
  "sectionColumns": { "title": "Columns", "body": "How many columns the fields sit in. A field can span several rows of its column." },
  "sectionActions": { "title": "Order and removal", "body": "Move the section up or down among its neighbours, or delete it together with its fields." }
}
```

and the Polish counterpart in `src/locales/pl/translation.json`:

```json
"creatorGeneral": {
  "name": { "title": "Nazwa szablonu", "body": "Pod tą nazwą system pojawia się na liście przy tworzeniu gry. Każda zmiana zapisuje się sama." },
  "tabs": { "title": "Dwa kroki", "body": "Ogólne to ustawienia całego systemu, a w zakładce Karta budujesz samą kartę postaci, pole po polu." },
  "visibility": { "title": "Kto może z niego korzystać", "body": "Z szablonu publicznego każdy może stworzyć grę, ale edytować go możesz tylko Ty. Prywatny możesz też udostępnić konkretnym osobom po adresie e-mail." },
  "sheetWidth": { "title": "Szerokość okna karty", "body": "Jak szeroko karta postaci otwiera się graczom. Zakładka Karta pokazuje kartę dokładnie w tej szerokości." },
  "dice": { "title": "Kości pod czatem", "body": "Wybierz, które przyciski szybkiego rzutu pojawią się pod czatem w grach na tym systemie." },
  "modifier": { "title": "Modyfikator rzutu", "body": "Gdy włączone, każdy rzut z tej karty najpierw pyta gracza o modyfikator, np. premię albo karę wynikającą z sytuacji." },
  "token": { "title": "Wyświetlanie tokenów", "body": "Zdecyduj, co token postaci pokazuje na mapie, np. pasek zdrowia albo stany odczytywane z pól karty." },
  "help": { "title": "Pomoc jest zawsze pod ręką", "body": "Kliknij znak zapytania, aby ponownie obejrzeć samouczek bieżącej zakładki. Okno właściwości pola ma własny znak zapytania, który wyjaśnia to pole." }
},
"creatorSheet": {
  "palette": { "title": "Komponenty", "body": "Przeciągnij stąd typ pola na kartę. Typy są pogrupowane: układ, postać, statystyki, tekst, wybór i tabele." },
  "canvas": { "title": "Karta", "body": { "0": "Karta jest pusta. Zacznij od sekcji — ramki, która trzyma pola i decyduje, w ilu kolumnach stoją.", "1": "Tak dokładnie gracze zobaczą kartę: ta sama szerokość i ten sam wygląd. Kliknij dowolny jej element, aby go edytować." } },
  "section": { "title": "Sekcje", "body": "Sekcja grupuje pola pod nagłówkiem i dzieli je na kolumny. Sekcje można zagnieżdżać; przeciągnij sekcję za uchwyt, aby ją przenieść." },
  "field": { "title": "Pola", "body": "Najedź na pole, aby zobaczyć jego pasek: uchwyt do przeciągania, przesuwanie w górę i w dół, edycja, duplikowanie i usuwanie." },
  "properties": { "title": "Właściwości pola", "body": "Kliknij pole, aby otworzyć jego właściwości: etykietę, wartości, rzuty i opcje wyświetlania. Znak zapytania na pasku tytułu tego okna wyjaśnia edytowane pole." },
  "preview": { "title": "Czysty podgląd", "body": "Ukryj wszystkie narzędzia edycji, aby zobaczyć kartę dokładnie tak, jak zobaczy ją gracz." },
  "status": { "title": "Zapisywanie", "body": "Ile sekcji i pól ma karta. Każda zmiana zapisuje się sama — nie ma przycisku zapisu." },
  "help": { "title": "Pomoc jest zawsze pod ręką", "body": "Kliknij znak zapytania, aby ponownie obejrzeć ten samouczek. Okno właściwości pola ma własny znak zapytania, który wyjaśnia to pole." }
},
"creatorField": {
  "head": { "title": "Co to jest", "body": {
    "section": "Sekcja trzyma pola pod nagłówkiem i układa je w kolumny.",
    "char_name": "Imię postaci, widoczne na liście postaci i przy tokenie na mapie. Jedno na kartę.",
    "char_avatar": "Portret postaci, używany na liście postaci i jako token na mapie. Jeden na kartę.",
    "image": "Obrazek, który gracz wgrywa na kartę, np. herb albo szkic.",
    "attr": "Atrybut: liczba, na którą gracz może rzucać, opcjonalnie rozbita na wartość bazową i rozwinięcia.",
    "attr_table": "Tabela atrybutów ze wspólnymi ustawieniami — wygodna dla całego zestawu, np. siły, zręczności i inteligencji.",
    "number": "Zwykła liczba wpisywana przez gracza, np. pieniądze albo doświadczenie. Formuły mogą ją odczytać.",
    "computed": "Wartość liczona z formuły na podstawie atrybutów i liczb. Gracz nie może jej wpisać.",
    "progress": "Para aktualna/maksymalna pokazana jako pasek, np. zdrowie albo mana.",
    "text_short": "Jedna linia tekstu, np. profesja albo pochodzenie.",
    "text_long": "Wielowierszowe pole tekstowe, np. historia postaci albo notatki.",
    "checkbox": "Pole tak/nie, np. stan postaci albo już wykorzystana zdolność.",
    "select": "Wybór z listy, którą definiujesz, np. rasa albo klasa.",
    "skill_table": "Lista umiejętności z wartościami, na które gracz rzuca. Gracze mogą dodawać własne, jeśli na to pozwolisz.",
    "weapons_table": "Tabela broni z Twoimi kolumnami, rzutem na atak i formułą obrażeń.",
    "data_table": "Tabela z Twoimi kolumnami na wszystko, na co się nie rzuca, np. ekwipunek.",
    "skill_tree": "Umiejętności ułożone w hierarchię, np. umiejętność i jej specjalizacje.",
    "label": "Stały tekst na karcie — nagłówek, wskazówka albo przypomnienie zasady. Nie przechowuje wartości."
  } },
  "display": { "title": "Wyświetlanie", "body": {
    "default": "Jak pole wygląda na karcie.",
    "skill_table": "Gwiazdka ulubionych, znacznik rozwoju umiejętności użytych w sesji, kolejność alfabetyczna i układ w dwóch kolumnach.",
    "skill_tree": "Gwiazdka ulubionych, znacznik rozwoju umiejętności użytych w sesji, kolejność alfabetyczna i układ w dwóch kolumnach dzielony po gałęziach.",
    "weapons_table": "Sortowanie wierszy według wybranej kolumny tekstowej i podział tabeli na dwie kolumny.",
    "data_table": "Sortowanie wierszy według wybranej kolumny tekstowej i podział tabeli na dwie kolumny."
  } },
  "basics": { "title": "Podstawowe", "body": {
    "default": "Etykieta widoczna dla graczy, opcjonalny skrót do zwartych widoków i to, czy pole pojawia się także na skróconej karcie postaci.",
    "label": "Tekst widoczny na karcie, jego kolor i rozmiar. Nazwa wewnętrzna służy tylko do rozpoznania etykiety tutaj, w kreatorze."
  } },
  "values": { "title": "Wartości", "body": {
    "default": "Wartość początkowa pola, jego ograniczenia i krok.",
    "attr": "Minimum, maksimum, wartość początkowa i krok. Włącz rozwinięcia, aby rozbić wartość na bazę plus rozwinięcia.",
    "number": "Minimum, maksimum, wartość początkowa i krok strzałek.",
    "skill_table": "Włącz rozwinięcia, aby każda umiejętność miała wartość bazową plus rozwinięcia; baza może pochodzić z powiązanego atrybutu."
  } },
  "attrRows": { "title": "Atrybuty", "body": {
    "default": "Atrybuty w tej tabeli: nazwa, skrót, wartość początkowa i ograniczenia. Przeciągnij wiersz za uchwyt, aby zmienić kolejność."
  } },
  "formula": { "title": "Formuła", "body": {
    "default": "Złóż wartość z bloków: atrybutów, liczb, stałych i działań. Karta przelicza ją, gdy zmieniają się wartości."
  } },
  "content": { "title": "Treść", "body": {
    "default": "Co zawiera pole.",
    "select": "Opcje, spośród których gracz wybiera.",
    "skill_table": "Umiejętności na liście, opcjonalnie powiązane z atrybutem, oraz to, czy gracze mogą dodawać własne.",
    "skill_tree": "Drzewo umiejętności — dodawaj podrzędne, aby tworzyć specjalizacje — oraz to, czy gracze mogą dodawać własne.",
    "weapons_table": "Kolumny (jedna może wskazywać umiejętność ataku), formuła obrażeń i predefiniowane bronie od MG.",
    "data_table": "Kolumny — także długi tekst pokazywany w rozwijanym wierszu — oraz predefiniowane wiersze, zawsze na karcie albo jako lista do wyboru."
  } },
  "roll": { "title": "Rzut", "body": {
    "default": "Czy na pole można rzucać i jak: kości, warunek sukcesu i poziomy sukcesu.",
    "weapons_table": "Rzut na atak: kości i warunek sukcesu. Próg pochodzi z umiejętności wybranej w kolumnie umiejętności."
  } },
  "sectionTitle": { "title": "Nagłówek", "body": "Nagłówek nad sekcją. Zostaw pusty dla sekcji bez nagłówka." },
  "sectionColumns": { "title": "Kolumny", "body": "W ilu kolumnach stoją pola. Pole może zajmować kilka wierszy swojej kolumny." },
  "sectionActions": { "title": "Kolejność i usuwanie", "body": "Przesuń sekcję w górę lub w dół między sąsiednimi albo usuń ją razem z jej polami." }
}
```

- [ ] **Step 5: Coverage guard** — create `src/components/creator/creatorTour.coverage.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import i18n from '../../i18n';
import TemplateBuilder, { FIELD_TYPES, makeDefaultField, PropertyPanel } from './TemplateBuilder';
import { getTour } from '../tutorial/tours';

// TemplateBuilder pulls in api/axios and, through the system registry, axios itself — the ESM
// import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

// The CLAUDE.md rule "a creator change may need a tutorial change" made mechanical where it can
// be: a new property-panel group or General-tab card without a tutorial step fails here.
const t = i18n.t.bind(i18n);
const targetsOf = (tourId) => new Set(getTour(tourId).steps.flatMap(s => (Array.isArray(s.target) ? s.target : [s.target])));

beforeEach(() => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
});

test.each(FIELD_TYPES.filter(ft => ft.type !== 'section').map(ft => ft.type))(
  'every property-panel group of a %s field has a tutorial step',
  (type) => {
    const { container } = render(
      <PropertyPanel field={makeDefaultField(type, t)} onChange={() => {}} onDelete={() => {}}
        numberFields={[]} numericFields={[]} sections={[]} />
    );
    const targets = targetsOf('creatorField');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const groups = [...container.querySelectorAll('.creator__props-group')]
      // eslint-disable-next-line testing-library/no-node-access
      .filter(el => el.querySelector(':scope > .creator__props-group-title'));
    groups.forEach(el => {
      const modifier = [...el.classList].find(c => c.startsWith('creator__props-group--'));
      expect(modifier).toBeDefined();
      expect(targets.has(`.${modifier}`)).toBe(true);
    });
  },
);

test('every General-tab settings card has a tutorial step', () => {
  render(<TemplateBuilder template={{ id: 't', name: 'T', settings: {}, sections: [] }} token="x" onClose={() => {}} onTemplateUpdated={() => {}} />);
  const targets = targetsOf('creatorGeneral');
  const cards = [...document.querySelectorAll('.creator__settings-card')];
  expect(cards.length).toBeGreaterThan(0);
  cards.forEach(el => {
    const modifier = [...el.classList].find(c => c.startsWith('creator__settings-card--'));
    expect(modifier).toBeDefined();
    expect(targets.has(`.${modifier}`)).toBe(true);
  });
});
```

- [ ] **Step 6: Run** `CI=true npm test -- --watchAll=false --testPathPattern='components/tutorial|creatorTour.coverage'` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/tutorial src/components/creator src/locales
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "feat: PLAYRPG-265 creator tours, texts and coverage guard"
```

---

### Task 6: `CreatorTour` and creator wiring

**Files:**
- Create: `src/components/creator/CreatorTour.jsx`, `src/components/creator/CreatorTour.test.jsx`
- Modify: `src/components/creator/TemplateBuilder.jsx`
- Modify (test setup only): `TemplateBuilder.charNameWarning.test.jsx`, `TemplateBuilder.chromeWiring.test.jsx`, `TemplateBuilder.sharing.test.jsx`, `TemplateBuilder.deleteConfirm.test.jsx`, `TemplateBuilder.sheetWidth.test.jsx`

**Interfaces:**
- Consumes: `useTour`, `TourRunner`, `bodyKeysFor`, `useTutorial`/`TutorialProvider`.
- Produces: default `CreatorTour({ activeTab, fieldType, popupKey, onRunningChange })`; named `CreatorTourButton({ tourId })` (renders `IconButton` with class `creator__tour-btn`), `CreatorFieldTourButton()` (renders `button.modal-header__btn.creator__field-tour-btn`), `creatorSeenKey(activeTab)`, `CREATOR_TAB_TOURS`.

- [ ] **Step 1: `CreatorTour.jsx`** — already created in Task 5 Step 3b with this code; verify it matches:

```jsx
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useTour } from '../tutorial/engine/useTour';
import TourRunner from '../tutorial/engine/TourRunner';
import { bodyKeysFor } from '../tutorial/engine/stepResolution';
import { useTutorial } from '../tutorial/TutorialContext';

export const CREATOR_TAB_TOURS = { general: 'creatorGeneral', fields: 'creatorSheet' };
export const creatorSeenKey = (activeTab) => `tutorialSeen:creator:${activeTab === 'fields' ? 'sheet' : 'general'}`;

// The creator's layer over the shared tutorial engine. With nothing requested it runs the active
// tab's tour, auto-started the first time that tab is shown. TemplateBuilder keys it by tab, so a
// tab switch unmounts a running tour with its anchors; the mount effect then drops any tour id the
// context still holds, so the new tab never replays the old tab's tour.
//
// The field tour (creatorField) is only ever started by its "?" and is never remembered. It ends
// when the popup closes or switches to another node (popupKey changes), because its anchors are
// the popup's own groups.
function CreatorTour({ activeTab, fieldType, popupKey, onRunningChange }) {
  const { t } = useTranslation();
  const { activeTourId, startCount = 0, clearTour } = useTutorial();
  const tabTourId = CREATOR_TAB_TOURS[activeTab];
  const tourId = activeTourId || tabTourId;
  const isTabTour = tourId === tabTourId;

  const { steps, stepIndex, running, start, goTo, finish } = useTour({
    tourId,
    autoStart: !activeTourId,
    storageKey: isTabTour ? creatorSeenKey(activeTab) : null,
    onFinish: clearTour,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { clearTour(); }, []);

  // A "?" click raises startCount; react to the change, not to the first render.
  const lastSignal = useRef(startCount);
  useEffect(() => {
    if (startCount === lastSignal.current) return;
    lastSignal.current = startCount;
    start();
  }, [startCount, start]);

  const lastPopup = useRef(popupKey);
  useEffect(() => {
    if (popupKey === lastPopup.current) return;
    lastPopup.current = popupKey;
    if (running && tourId === 'creatorField') finish();
  }, [popupKey, running, tourId, finish]);

  useEffect(() => { if (onRunningChange) onRunningChange(running); }, [running, onRunningChange]);

  const contentFor = useCallback(
    (step) => <p>{t(bodyKeysFor(step, tourId, { targetIndex: step.targetIndex, fieldType }))}</p>,
    [t, tourId, fieldType]
  );

  return (
    <TourRunner tourId={tourId} steps={steps} stepIndex={stepIndex} running={running}
      goTo={goTo} finish={finish} contentFor={contentFor} />
  );
}

// The title-bar "?" of the creator: replays the tutorial of the tab on screen.
export function CreatorTourButton({ tourId }) {
  const { t } = useTranslation();
  const { startTour } = useTutorial();
  const label = t('tutorial.button');
  return (
    <IconButton size="small" className="creator__tour-btn" onClick={() => startTour(tourId)} title={label} aria-label={label}>
      <HelpOutlineIcon fontSize="small" />
    </IconButton>
  );
}

// The "?" in the property popup's title bar: explains the field or section being edited.
export function CreatorFieldTourButton() {
  const { t } = useTranslation();
  const { startTour } = useTutorial();
  const label = t('tutorial.button');
  return (
    <button type="button" className="modal-header__btn creator__field-tour-btn"
      onClick={(e) => { e.stopPropagation(); startTour('creatorField'); }} title={label} aria-label={label}>
      <HelpOutlineIcon style={{ fontSize: 16 }} />
    </button>
  );
}

export default CreatorTour;
```

- [ ] **Step 2: Write the failing tests** — `CreatorTour.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const template = {
  id: 't1', name: 'T', settings: { diceButtons: [] },
  sections: [{ id: 's1', title: 'Cechy', columns: 1, fields: [{ key: 'f1', type: 'text_short', label: 'Imię' }] }],
};
const mount = () => render(<TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />);

beforeEach(() => localStorage.clear());

test('opens the General tutorial by itself the first time', async () => {
  await act(async () => { mount(); });
  expect(await screen.findByText('Template name')).toBeInTheDocument();
});

test('does not auto-start a tab whose tutorial was seen', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  await act(async () => { mount(); });
  expect(screen.queryByText('Template name')).not.toBeInTheDocument();
});

test('finishing marks the General tutorial seen', async () => {
  await act(async () => { mount(); });
  await screen.findByText('Template name');
  await act(async () => { fireEvent.click(screen.getByText('Skip')); });
  expect(localStorage.getItem('tutorialSeen:creator:general')).toBe('1');
});

test('the Sheet tab starts its own tutorial on first visit, ending the General one', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  await act(async () => { mount(); });
  await act(async () => { fireEvent.click(screen.getByText('Sheet')); });
  expect(await screen.findByText('Components')).toBeInTheDocument();
});

test('the title-bar ? replays the tutorial of the tab on screen', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  await act(async () => { mount(); });
  await act(async () => { fireEvent.click(document.querySelector('.creator__tour-btn')); });
  expect(await screen.findByText('Template name')).toBeInTheDocument();
});

test('the popup ? explains the field being edited', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  const { baseElement } = await act(async () => mount());
  await act(async () => { fireEvent.click(screen.getByText('Sheet')); });
  // Same lookup as TemplateBuilder.chromeWiring.test.jsx: the field's own editable wrapper.
  const labelEl = [...baseElement.querySelectorAll('.custom-sheet__field-label')].find(el => el.textContent === 'Imię');
  await act(async () => { fireEvent.click(within(labelEl.closest('.custom-sheet__editable')).getByLabelText('Edit')); });
  await act(async () => { fireEvent.click(document.querySelector('.creator__field-tour-btn')); });
  expect(await screen.findByText('A single line of text, e.g. profession or origin.')).toBeInTheDocument();
});

test('the creator dialog lets the tutorial tooltip keep focus', async () => {
  await act(async () => { mount(); });
  await screen.findByText('Template name');
  // The tooltip is portalled to body, outside the MUI Dialog. With the Dialog's focus trap
  // enforced, focusing a tooltip button would be pulled back into the dialog.
  const next = screen.getByText('Next');
  act(() => next.focus());
  expect(document.activeElement).toBe(next);
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CreatorTour.test` → FAIL (nothing wired yet).

- [ ] **Step 3: Wire `TemplateBuilder.jsx`**

1. Imports: `TutorialProvider` from `../tutorial/TutorialContext`; `CreatorTour, { CreatorTourButton, CreatorFieldTourButton, CREATOR_TAB_TOURS }` from `./CreatorTour`.
2. State: `const [tourRunning, setTourRunning] = useState(false);`
3. Wrap the returned `<Dialog …>` in `<TutorialProvider>…</TutorialProvider>`.
4. Dialog: add `disableEnforceFocus={tourRunning}` with a comment: the joyride tooltip is portalled to body, outside the dialog; MUI's focus trap would pull focus back from its buttons.
5. Title bar, just before the preview `IconButton`: `<CreatorTourButton tourId={CREATOR_TAB_TOURS[activeTab]} />`.
6. Inside the provider (after `</Dialog>` content end is fine, e.g. right after `<ConfirmModal …/>`):

```jsx
        <CreatorTour
          key={activeTab}
          activeTab={activeTab}
          fieldType={editingPath ? (editingIsSection ? 'section' : editingNode?.type) : null}
          popupKey={editingPath ? editingPath.join('.') : null}
          onRunningChange={setTourRunning}
        />
```

7. `PropertyPopup`: `headerButtons={<CreatorFieldTourButton />}`.

- [ ] **Step 4: Existing full-mount creator tests** — in each of `TemplateBuilder.charNameWarning|chromeWiring|sharing|deleteConfirm|sheetWidth.test.jsx`, add near the top:

```js
// These tests are about the creator, not its tutorial: mark both tab tours seen so none auto-starts.
beforeEach(() => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
});
```

(If a file already has a `beforeEach`, add the two lines inside it.)

- [ ] **Step 5: Run** `CI=true npm test -- --watchAll=false --testPathPattern='components/creator|components/tutorial'` → PASS. Then the full suite `CI=true npm test -- --watchAll=false` → only `App.test.js` fails. `npx eslint src/components/creator src/components/tutorial --ignore-pattern '*.test.*'` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/creator src/components/tutorial
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "feat: PLAYRPG-265 creator tutorial — tab tours, field tour, title-bar help"
```

---

### Task 7: CLAUDE.md rule and spec sync

**Files:**
- Modify: `CLAUDE.md` (section "Konwencje UI")
- Modify: `docs/superpowers/specs/PLAYRPG-265.md` (values variants: `attr`, `number`, `skill_table` — not `progress`; section steps merged: `sectionTitle`, `sectionColumns`, `sectionActions`; `help` step also closes the Sheet tour)

- [ ] **Step 1: CLAUDE.md** — add as a new bullet at the end of "### Konwencje UI":

```markdown
- **Kreator ma tutorial** (`src/components/tutorial/tours/creator*.js` + klucze `tutorial.creator*`
  w en/pl). Przy każdej zmianie w kreatorze — nowy typ pola, nowa grupa w panelu właściwości, nowa
  karta w zakładce Ogólne, zmiana klasy będącej kotwicą kroku, zmiana znaczenia sekcji — sprawdź,
  czy tutorial nie potrzebuje nowego kroku, wariantu tekstu (`byFieldType`, z fallbackiem
  `default`) albo poprawionego selektora. Nowy typ pola wymaga tekstu
  `tutorial.creatorField.head.body.<typ>` (pilnuje `tourTranslations.test.js`); nowa grupa/karta bez
  kroku wywala `creatorTour.coverage.test.jsx`. Sens i aktualność tekstów — tylko Ty.
```

- [ ] **Step 2: Spec sync** — edit the three statements listed above in the spec.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/PLAYRPG-265.md
[ "$(git branch --show-current)" = PLAYRPG-265 ] && git commit -m "docs: PLAYRPG-265 CLAUDE.md rule for creator changes and the tutorial"
```
