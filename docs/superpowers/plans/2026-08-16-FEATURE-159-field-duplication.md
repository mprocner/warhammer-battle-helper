# FEATURE-159 — Field Duplication in the Character Sheet Creator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Duplicate button to every field tile in the character sheet creator, inserting an identical copy right after the original with a fresh key and a "(copy)" label suffix.

**Architecture:** The insertion logic lives in a new pure function in `src/utils/templateFields.js` (repo convention: logic in `utils/` + a Jest unit test). `TemplateBuilder` keeps a thin wrapper that mints the new key via the existing `genId`, corrects the selected field index, and calls the existing debounced `triggerSave`. `FieldCard` gets a fourth action button that calls a new `onDuplicate` prop threaded through `SectionCanvas`.

**Tech Stack:** React 18 (CRA / react-scripts 5.0.1), Jest 27 + jsdom 16.7, `@mui/icons-material`, `@dnd-kit/sortable`, i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-16-FEATURE-159-field-duplication-design.md`
- Working directory for all paths below: `warhammer-battle-helper-front/`
- Deep clone uses `JSON.parse(JSON.stringify(field))` — **never** `structuredClone`: jsdom 16.7 / jest-environment-jsdom 27.5 shipped by react-scripts 5.0.1 do not expose it, and the data is JSON-serialized on every autosave anyway.
- Only the top-level `field.key` is regenerated. Nested ids (`columns[].key`, `skills[].id`, `skill_tree` node keys, `presetWeapons[].id`) stay verbatim — they are addressed as `<fieldKey>.<optionId>` and the field key is already new.
- `label` gets the copy suffix only when non-empty. `abbr` is copied unchanged.
- No hardcoded strings in JSX — every user-visible string goes through `t('key')`, with the English key added to `src/locales/en/translation.json` and the Polish one added in parallel to `src/locales/pl/translation.json`.
- Icons come from `@mui/icons-material` only.
- No new CSS — the button reuses `creator__canvas-field-action-btn`.
- Out of scope: duplicating whole sections, duplicating a field into a different section, duplicating templates.

---

### Task 1: Pure duplication helper + unit test

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/templateFields.js`
- Test: `warhammer-battle-helper-front/src/utils/templateFields.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `duplicateFieldInSections(sections, sectionIdx, fieldIdx, { newKey, copySuffix }) => sections[]` — named export plus default export, matching the style of `src/utils/appendUnique.js`. `sections` is the creator's `[{ id, title, columns, fields: [{ key, type, label, abbr, ... }] }]`. Returns a **new** array; on an out-of-range `sectionIdx` / `fieldIdx` it returns the original `sections` reference unchanged.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/utils/templateFields.test.js`:

```javascript
import { duplicateFieldInSections } from './templateFields';

const sections = () => [
  {
    id: 'section_1',
    title: 'Attributes',
    columns: 3,
    fields: [
      { key: 'attr_1', type: 'attr', label: 'Siła', abbr: 'S', min: 0, max: 100 },
      {
        key: 'weap_1',
        type: 'weapons_table',
        label: '',
        abbr: '',
        columns: [{ key: 'col_1', label: 'Obrażenia', type: 'text', options: [] }],
        presetWeapons: [{ id: 'preset_1', cells: {}, damage: {}, alwaysOn: false }],
      },
      { key: 'num_1', type: 'number', label: 'Ruch', abbr: 'Ru' },
    ],
  },
  { id: 'section_2', title: 'Skills', columns: 2, fields: [] },
];

const opts = { newKey: 'attr_new', copySuffix: '(kopia)' };

describe('duplicateFieldInSections', () => {
  it('inserts the copy right after the original', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields.map(f => f.key)).toEqual(['attr_1', 'attr_new', 'weap_1', 'num_1']);
  });

  it('gives the copy the new key and leaves the original key alone', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields[0].key).toBe('attr_1');
    expect(next[0].fields[1].key).toBe('attr_new');
  });

  it('copies every other property of the field', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields[1]).toMatchObject({ type: 'attr', abbr: 'S', min: 0, max: 100 });
  });

  it('appends the copy suffix to a non-empty label', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields[1].label).toBe('Siła (kopia)');
  });

  it('leaves an empty label empty', () => {
    const next = duplicateFieldInSections(sections(), 0, 1, { ...opts, newKey: 'weap_new' });
    expect(next[0].fields[2].label).toBe('');
  });

  it('keeps nested ids verbatim', () => {
    const next = duplicateFieldInSections(sections(), 0, 1, { ...opts, newKey: 'weap_new' });
    expect(next[0].fields[2].columns[0].key).toBe('col_1');
    expect(next[0].fields[2].presetWeapons[0].id).toBe('preset_1');
  });

  it('deep clones so mutating the copy never touches the original', () => {
    const next = duplicateFieldInSections(sections(), 0, 1, { ...opts, newKey: 'weap_new' });
    const original = next[0].fields[1];
    const copy = next[0].fields[2];
    expect(copy.columns).not.toBe(original.columns);
    copy.columns.push({ key: 'col_2', label: 'Zasięg', type: 'text', options: [] });
    expect(original.columns).toHaveLength(1);
  });

  it('leaves other sections untouched', () => {
    const input = sections();
    const next = duplicateFieldInSections(input, 0, 0, opts);
    expect(next[1]).toEqual(input[1]);
    expect(next[0].fields).toHaveLength(4);
  });

  it('returns the input untouched for an out-of-range index', () => {
    const input = sections();
    expect(duplicateFieldInSections(input, 5, 0, opts)).toBe(input);
    expect(duplicateFieldInSections(input, 0, 9, opts)).toBe(input);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=templateFields --watchAll=false`

Expected: FAIL — `Cannot find module './templateFields' from 'src/utils/templateFields.test.js'`

- [ ] **Step 3: Write the implementation**

Create `warhammer-battle-helper-front/src/utils/templateFields.js`:

```javascript
/**
 * Duplicates one field of a creator template, inserting the copy directly after the
 * original inside the same section.
 *
 * The copy is a deep clone: the creator's editors rebuild arrays immutably today, but a
 * shallow spread would leave `columns` / `skills` / `presetWeapons` / `tree` shared with
 * the original, so the first imperative push added later would silently edit both fields.
 * The clone goes through JSON because the field is JSON-serialized on every autosave
 * anyway — a value JSON drops (Date, Map, undefined) cannot survive in this model.
 *
 * Only the top-level `key` is replaced. Nested ids stay verbatim: they are addressed as
 * `<fieldKey>.<optionId>` and the field key is already new, so the full address is unique.
 *
 * @param {Array} sections creator sections
 * @param {number} sectionIdx section holding the field to duplicate
 * @param {number} fieldIdx index of the field to duplicate
 * @param {{newKey: string, copySuffix: string}} options
 * @returns {Array} a new sections array, or the original one when the indexes miss
 */
export const duplicateFieldInSections = (sections, sectionIdx, fieldIdx, { newKey, copySuffix }) => {
  const section = sections?.[sectionIdx];
  const source = section?.fields?.[fieldIdx];
  if (!source) return sections;

  const copy = JSON.parse(JSON.stringify(source));
  copy.key = newKey;
  if (copy.label) copy.label = `${copy.label} ${copySuffix}`;

  const fields = [...section.fields];
  fields.splice(fieldIdx + 1, 0, copy);

  return sections.map((s, i) => (i === sectionIdx ? { ...s, fields } : s));
};

export default duplicateFieldInSections;
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=templateFields --watchAll=false`

Expected: PASS — 9 passed.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/templateFields.js warhammer-battle-helper-front/src/utils/templateFields.test.js
git commit -m "feat(creator): FEATURE-159 add duplicateFieldInSections helper"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:1235` (the `creator` block, next to `duplicateKeyWarn`)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json:1235`

**Interfaces:**
- Consumes: nothing.
- Produces: the `creator.fieldDuplicate` translation key, used by Task 3.

> **Correction applied after the final review (commit 2f4eba7):** `creator.copySuffix`
> already existed at line 1130 in both files and is consumed by
> `useTemplates.cloneTemplate` for naming cloned templates. Adding a second one inside the
> same `creator` object created a duplicate JSON key that silently shadowed it. Only
> `creator.fieldDuplicate` is new; the steps below are kept as written for the record.

- [ ] **Step 1: Add the English keys**

In `src/locales/en/translation.json`, inside the `creator` object, right after the `"duplicateKeyWarn"` line:

```json
    "duplicateKeyWarn": "Duplicate key — change key",
    "copySuffix": "(copy)",
    "fieldDuplicate": "Duplicate field",
```

- [ ] **Step 2: Add the Polish keys**

In `src/locales/pl/translation.json`, inside the `creator` object, at the matching spot:

```json
    "duplicateKeyWarn": "Duplikat klucza — zmień key",
    "copySuffix": "(kopia)",
    "fieldDuplicate": "Duplikuj pole",
```

- [ ] **Step 3: Verify both files still parse**

Run: `cd warhammer-battle-helper-front && node -e "['en','pl'].forEach(l => { const c = require('./src/locales/'+l+'/translation.json').creator; console.log(l, c.copySuffix, '|', c.fieldDuplicate); })"`

Expected output:

```
en (copy) | Duplicate field
pl (kopia) | Duplikuj pole
```

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(creator): FEATURE-159 add copySuffix and fieldDuplicate translations"
```

---

### Task 3: Wire the Duplicate button into the creator

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` — icon import (near line 26), `FieldCard` (lines 814-849), `SectionCanvas` (lines 853-935), `duplicateField` next to `moveField` (after line 1173), prop wiring (near line 1556)

**Interfaces:**
- Consumes: `duplicateFieldInSections` from Task 1, `creator.copySuffix` / `creator.fieldDuplicate` from Task 2, plus the file's existing `genId(prefix)` and `triggerSave(sections, name)`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the icon**

Add after the `ViewColumnIcon` import (line 26):

```javascript
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
```

Add next to the other local imports (after line 48):

```javascript
import { duplicateFieldInSections } from '../../utils/templateFields';
```

- [ ] **Step 2: Add the button to `FieldCard`**

Change the signature on line 814 to take `onDuplicate`:

```javascript
function FieldCard({ id, field, isSelected, isDuplicateKey, onClick, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast }) {
```

Replace the actions block (lines 842-846) with:

```jsx
      <div className="creator__canvas-field-actions">
        <button className="creator__canvas-field-action-btn" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}><ArrowUpwardIcon style={{ fontSize: 11 }} /></button>
        <button className="creator__canvas-field-action-btn" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}><ArrowDownwardIcon style={{ fontSize: 11 }} /></button>
        <button className="creator__canvas-field-action-btn" onClick={e => { e.stopPropagation(); onDuplicate(); }} aria-label={t('creator.fieldDuplicate')}><ContentCopyIcon style={{ fontSize: 11 }} /></button>
        <button className="creator__canvas-field-action-btn creator__canvas-field-action-btn--danger" onClick={e => { e.stopPropagation(); onRemove(); }}><DeleteIcon style={{ fontSize: 11 }} /></button>
      </div>
```

`e.stopPropagation()` is required — the tile itself has an `onClick` that selects the field.

- [ ] **Step 3: Thread the prop through `SectionCanvas`**

Add `onDuplicateField` to the destructured props (line 857 block):

```javascript
  onAddField, onRemoveField, onMoveField, onDuplicateField,
```

Add the callback to the `<FieldCard>` render (after the `onRemove` line, ~line 929):

```jsx
                    onDuplicate={() => onDuplicateField(sectionIdx, fieldIdx)}
```

- [ ] **Step 4: Add `duplicateField` to `TemplateBuilder`**

Insert directly after `moveField` (after line 1173):

```javascript
  const duplicateField = (sectionIdx, fieldIdx) => {
    const source = sections[sectionIdx]?.fields?.[fieldIdx];
    if (!source) return;
    const next = duplicateFieldInSections(sections, sectionIdx, fieldIdx, {
      newKey: genId(source.type),
      copySuffix: t('creator.copySuffix'),
    });
    setSections(next);
    // The insert shifts every field behind the original by one, so the stored fieldIdx
    // would start pointing at the neighbour. Keep the panel on the same field.
    if (selected?.sectionIdx === sectionIdx && selected?.fieldIdx > fieldIdx) {
      setSelected({ sectionIdx, fieldIdx: selected.fieldIdx + 1 });
    }
    triggerSave(next, name);
  };
```

- [ ] **Step 5: Pass it to `SectionCanvas`**

Next to `onMoveField={moveField}` (line 1556):

```jsx
                      onDuplicateField={duplicateField}
```

- [ ] **Step 6: Verify the build and the full test suite**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -20`

Expected: all suites pass, no new failures.

Run: `cd warhammer-battle-helper-front && npx eslint src/components/creator/TemplateBuilder.jsx src/utils/templateFields.js`

Expected: no output (no errors).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx
git commit -m "feat(creator): FEATURE-159 add a Duplicate button to creator field tiles"
```

---

### Task 4: Manual verification in the running app

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing.

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d` from the repo root, then open the frontend and log in as a GM. (If a dependency was added since the last build the frontend container needs `docker compose up -d --renew-anon-volumes frontend`; this feature adds none.)

- [ ] **Step 2: Duplicate a simple field**

Open a custom system template → **Fields** tab. On an `attr` field with a label, click the copy icon.

Expected: a new tile appears immediately after the original; its big abbr is identical; its label reads `<label> (kopia)`; no `⚠ dup` badge appears on either tile.

- [ ] **Step 3: Confirm the copy is independent**

Click the copy, change its `min`/`max` in the right-hand panel, then click the original.

Expected: the original still has its old range.

- [ ] **Step 4: Confirm the selection correction**

Select the *third* field in a section, then duplicate the *first* field in that same section.

Expected: the right-hand properties panel still shows the third field (now sitting at index 3), not its neighbour.

- [ ] **Step 5: Confirm persistence**

Duplicate a `weapons_table` field with at least one column and one preset weapon, wait ~2 s (debounced save), close the creator, reopen the template.

Expected: the copy survived with its columns and presets intact.

- [ ] **Step 6: Confirm the close-race path**

Duplicate a field and close the creator immediately (under the 1200 ms debounce), then reopen.

Expected: the copy is still there — `handleClose` flushes the pending save.

---

## Notes for the implementer

- `triggerSave` recomputes `findDuplicateKeys` on every call, so a key collision would light the `⚠ dup` badge on the canvas instantly. Seeing that badge after a duplicate means `genId` was not used for the copy.
- The creator has no render tests (consistent with the rest of the components in this repo), which is why Task 4 is a manual checklist rather than a test file.
- `SortableContext` keys fields by `field.key`; the fresh key keeps drag-and-drop working with no further changes.
