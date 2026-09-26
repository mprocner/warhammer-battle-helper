# FEATURE-208 — Powiązana umiejętność w tabeli broni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At most one weapons_table column may supply skills, the GM can see that the column drives the attack roll's threshold, and a weapon row missing its skill blocks the roll instead of rolling without a threshold.

**Architecture:** Frontend only. Three exported pure functions carry all the new logic — `weaponSkillColumn` / `weaponRowIssue` in `CustomSheetBody.jsx`, `updateWeaponColumns` and `weaponThresholdHint` in `TemplateBuilder.jsx` — and the components only render what those return. No model change, no backend change: `resolveWeaponSkill` (`weapon.go:70`) already picks the first matching column and keeps working for templates saved with two.

**Tech Stack:** React 18, MUI, react-i18next, Jest + React Testing Library (Create React App runner).

**Spec:** `docs/superpowers/specs/FEATURE-208.md`
**Branch:** `feature-208-weapon-skill-column` (already checked out; the spec commits are on it)

## Global Constraints

- Every code comment is written **in English**, backend and frontend, no exceptions.
- No string literal goes into JSX — always `t('key')`, with English keys. Every new key is added to **both** `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons come from `@mui/icons-material` only.
- A "skill column" is a column satisfying **both** `type === 'select'` **and** `optionsFromSkills` — the same predicate as `weapon.go:73`. Never test the flag alone.
- Run frontend tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Bare `npx jest` does not work (CRA owns the config).
- `App.test.js` fails on an axios ESM import. That is the known baseline, not a regression.
- Delete dead code in the same change that orphans it — no "leave it just in case".

## File Structure

| File | Responsibility |
|---|---|
| `src/systems/custom/CustomSheetBody.jsx` (modify) | Owns the sheet's weapon rendering. Gains `weaponSkillColumn`, `weaponRowIssue`, `weaponIssueTitle`; `weaponDamageIncomplete` stops being exported and becomes an internal helper of `weaponRowIssue` |
| `src/systems/custom/CustomSheetBody.weaponRowIssue.test.jsx` (create) | Unit tests for the two pure predicates. No render, no i18n |
| `src/systems/custom/CharacterDetails.jsx` (modify) | Favourite-weapon buttons switch to the new predicate |
| `src/components/creator/TemplateBuilder.jsx` (modify) | Gains `updateWeaponColumns` and `weaponThresholdHint`; `WeaponColumnsEditor` enforces the invariant and shows the badge; `RollConfigEditor` renders the hint |
| `src/components/creator/TemplateBuilder.weaponColumns.test.jsx` (create) | Unit tests for the two creator pure functions |
| `src/locales/{en,pl}/translation.json` (modify) | Six new keys |
| `src/style.css` (modify) | Badge, hint and moved-notice classes |

---

### Task 1: Blokada rzutu z niekompletnego wiersza broni

Today a weapon row blocks the roll only when the player left a damage input empty. A row whose skill cell is empty rolls anyway — and rolls without a threshold, because `resolveWeaponSkill` returns `""`, `skillHasValue` is false and `evalOutcome` falls through to a bare number. This task replaces the boolean predicate with one that names the problem.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:65-87` (predicates), `:801` (preset row), `:883-888` (player row)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx:8` (import), `:230` (favourites), `:292` (tooltip)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:1351`, `warhammer-battle-helper-front/src/locales/pl/translation.json:1351`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponRowIssue.test.jsx` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `weaponSkillColumn(field) -> WeaponColumn | null` — used by Task 2 and Task 3.
  - `weaponRowIssue(field, row) -> 'skill' | 'damage' | null`
  - `weaponIssueTitle(issue, t) -> string | undefined`
  - `weaponDamageIncomplete` is **no longer exported**.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponRowIssue.test.jsx`:

```jsx
import { weaponSkillColumn, weaponRowIssue } from './CustomSheetBody';

const skillCol  = { key: 'c_skill', label: 'Skill', type: 'select', optionsFromSkills: true };
const textCol   = { key: 'c_name',  label: 'Name',  type: 'text' };
// A column whose type moved away from "select" but kept the flag: dead data the backend ignores.
const staleCol  = { key: 'c_old',   label: 'Old',   type: 'text', optionsFromSkills: true };
const playerDie = { id: 'b1', type: 'dice' };   // no faces -> the player fills them in

test('weaponSkillColumn needs both the select type and the flag', () => {
  expect(weaponSkillColumn({ columns: [textCol, skillCol] })).toBe(skillCol);
  expect(weaponSkillColumn({ columns: [textCol, staleCol] })).toBeNull();
  expect(weaponSkillColumn({})).toBeNull();
});

test('a complete row has no issue', () => {
  const field = { columns: [skillCol], damageFormula: [playerDie] };
  const row = { id: 'r1', cells: { c_skill: 'sk_1' }, damage: { b1: 6 } };
  expect(weaponRowIssue(field, row)).toBeNull();
});

test('an empty skill cell blocks the roll', () => {
  const field = { columns: [skillCol], damageFormula: [] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {} })).toBe('skill');
});

test('a field without a skill column stays rollable — it is a plain equipment list', () => {
  const field = { columns: [textCol], damageFormula: [] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {} })).toBeNull();
});

test('unfilled damage blocks the roll', () => {
  const field = { columns: [textCol], damageFormula: [playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: {} })).toBe('damage');
});

test('both missing at once reports the skill first', () => {
  const field = { columns: [skillCol], damageFormula: [playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: {} })).toBe('skill');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=weaponRowIssue
```

Expected: FAIL — `weaponSkillColumn is not a function` (the export does not exist yet).

- [ ] **Step 3: Add the predicates**

In `src/systems/custom/CustomSheetBody.jsx`, replace the `export function weaponDamageIncomplete(blocks, row) {` line at `:75` with a non-exported one and append the three new functions right after its closing brace:

```jsx
// weaponDamageIncomplete reports whether any player-filled damage block is still empty.
// Internal to weaponRowIssue since FEATURE-208: a row has one completeness verdict, and
// callers need to know *which* part is missing, not just that something is.
function weaponDamageIncomplete(blocks, row) {
```

```jsx
// weaponSkillColumn returns the column that supplies skills for this weapons_table, or null.
// A column qualifies only when it is BOTH a select AND flagged — the same predicate the
// backend rolls with (weapon.go:73). Testing the flag alone would let a column whose type
// was switched away from "select" shadow the live one, and the sheet would then disagree
// with the roll the server actually performs.
export function weaponSkillColumn(field) {
  return (field.columns || []).find(c => c.type === 'select' && c.optionsFromSkills) || null;
}

// weaponRowIssue names the reason a weapon row cannot be rolled, or null when it can.
// The skill wins over the damage when both are missing: columns render to the left of the
// damage blocks, so the tooltip points at the leftmost gap and moves right as the player
// fills them; and the damage formula resolves the same skill key (weapon.go:57), so an
// empty skill would silently contribute 0 to damage the player believes is complete.
export function weaponRowIssue(field, row) {
  const skillCol = weaponSkillColumn(field);
  if (skillCol && !(row.cells || {})[skillCol.key]) return 'skill';
  const blocks = field.damageFormula || [];
  if (blocks.length > 0 && weaponDamageIncomplete(blocks, row)) return 'damage';
  return null;
}

// weaponIssueTitle maps an issue to its tooltip. Written as literal t() calls rather than a
// built key ("customSheet.weaponIssue." + issue) so that grepping a key name still finds
// where it is used.
export function weaponIssueTitle(issue, t) {
  if (issue === 'skill')  return t('customSheet.weaponSkillMissing');
  if (issue === 'damage') return t('customSheet.weaponDamageIncomplete');
  return undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=weaponRowIssue
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Rewire the preset row**

In `src/systems/custom/CustomSheetBody.jsx` around `:800`, replace:

```jsx
                const incomplete = hasDamage && weaponDamageIncomplete(dmgBlocks, preset);
```

with:

```jsx
                const issue = weaponRowIssue(field, preset);
```

and the affordance below it (`:824-827`):

```jsx
                      {field.rollable && rollAffordance(
                        () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: preset.id, label: weaponRowLabel(field, preset, t) }),
                        { disabled: !!issue, title: weaponIssueTitle(issue, t) }
                      )}
```

- [ ] **Step 6: Rewire the player row**

Same file, `:883-888`, replace the IIFE body:

```jsx
                    {field.rollable && (() => {
                      const issue = weaponRowIssue(field, row);
                      return rollAffordance(
                        () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) }),
                        { disabled: !!issue, title: weaponIssueTitle(issue, t) }
                      );
                    })()}
```

- [ ] **Step 7: Rewire the favourite weapons**

In `src/systems/custom/CharacterDetails.jsx:8`:

```jsx
import { weaponRowLabel, weaponRowIssue, weaponIssueTitle } from './CustomSheetBody';
```

At `:227-232`, replace the pushed object's `incomplete` line. `dmgBlocks` (declared at `:222`) then has no reader left in that loop — delete that line too:

```jsx
        out.push({
          fieldKey: f.key,
          rowId: row.id,
          label: weaponRowLabel(f, row, t),
          issue: weaponRowIssue(f, row),
        });
```

At `:291-292`:

```jsx
              disabled={!gameId || !!w.issue}
              title={weaponIssueTitle(w.issue, t)}
```

- [ ] **Step 8: Add the i18n key**

In `src/locales/en/translation.json`, next to `"weaponDamageIncomplete"` (`:1351`):

```json
    "weaponSkillMissing": "Pick a skill before rolling",
```

In `src/locales/pl/translation.json` at the matching place (`:1351`):

```json
    "weaponSkillMissing": "Wybierz umiejętność przed rzutem",
```

- [ ] **Step 9: Run the touched suites**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|CharacterDetails'
```

Expected: PASS. If a suite fails on `weaponDamageIncomplete is not a function`, a call site was missed — grep for it: `grep -rn weaponDamageIncomplete src/`, which must now return only the two lines inside `CustomSheetBody.jsx`.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom warhammer-battle-helper-front/src/locales
git commit -m "feat: FEATURE-208 block a weapon roll whose skill cell is empty"
```

---

### Task 2: Jedna kolumna umiejętności + badge

`WeaponColumnsEditor` currently lets the GM flag any number of columns, and the backend silently rolls with the first. This task makes the flag behave like a radio and shows which column holds the role.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:311-372` (`WeaponColumnsEditor` + new exported helper)
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` (near `"weaponColFromSkills"`, `:1417`)
- Modify: `warhammer-battle-helper-front/src/style.css:9333` (after `.creator__weapon-col-head`)
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.weaponColumns.test.jsx` (create)

**Interfaces:**
- Consumes: `weaponSkillColumn(field)` from Task 1.
- Produces: `updateWeaponColumns(cols, index, patch) -> WeaponColumn[]` — exported from `TemplateBuilder.jsx`, used by Task 3's tests only indirectly.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.weaponColumns.test.jsx`:

```jsx
import { updateWeaponColumns } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const cols = () => ([
  { key: 'a', label: 'Melee',  type: 'select', options: [], optionsFromSkills: true },
  { key: 'b', label: 'Ranged', type: 'select', options: [], optionsFromSkills: false },
]);

test('flagging a second column clears the first', () => {
  const next = updateWeaponColumns(cols(), 1, { optionsFromSkills: true });
  expect(next[0].optionsFromSkills).toBe(false);
  expect(next[1].optionsFromSkills).toBe(true);
});

test('leaving the select type clears the flag instead of leaving dead data', () => {
  const next = updateWeaponColumns(cols(), 0, { type: 'text' });
  expect(next[0].optionsFromSkills).toBe(false);
});

test('an unrelated edit leaves the roles alone', () => {
  const next = updateWeaponColumns(cols(), 1, { label: 'Bows' });
  expect(next[0].optionsFromSkills).toBe(true);
  expect(next[1].label).toBe('Bows');
});

test('the input array is not mutated', () => {
  const before = cols();
  updateWeaponColumns(before, 1, { optionsFromSkills: true });
  expect(before[0].optionsFromSkills).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=weaponColumns
```

Expected: FAIL — `updateWeaponColumns is not a function`.

- [ ] **Step 3: Add the exported helper**

In `src/components/creator/TemplateBuilder.jsx`, directly above `function WeaponColumnsEditor` (`:316`):

```jsx
// updateWeaponColumns patches one weapon column while keeping the invariant that at most one
// column supplies skills. Two columns would not be an error the GM could see — the backend
// simply rolls with the first one in array order (weapon.go:73) — so the creator settles it
// at edit time instead. A column leaving the "select" type also drops the flag: keeping it
// would leave data only the creator honours, while the backend already ignores it.
export function updateWeaponColumns(cols, index, patch) {
  const next = cols.map((c, j) => (j === index ? { ...c, ...patch } : c));
  const edited = next[index];
  if (edited.type !== 'select' && edited.optionsFromSkills) {
    next[index] = { ...edited, optionsFromSkills: false };
    return next;
  }
  if (edited.type === 'select' && edited.optionsFromSkills) {
    for (let j = 0; j < next.length; j += 1) {
      if (j !== index && next[j].optionsFromSkills) next[j] = { ...next[j], optionsFromSkills: false };
    }
  }
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=weaponColumns
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Use the helper in the editor and announce the move**

In `src/components/creator/TemplateBuilder.jsx`, inside `WeaponColumnsEditor` replace the `update` definition (`:319`) and add the notice state:

```jsx
  const [movedFrom, setMovedFrom] = useState(null);
  const update = (i, patch) => {
    const before = weaponSkillColumn({ columns: cols });
    const next   = updateWeaponColumns(cols, i, patch);
    const after  = weaponSkillColumn({ columns: next });
    // Only an actual hand-over is announced. A column that merely loses the role (its type
    // changed) leaves the table with none, which the roll-config warning already reports.
    setMovedFrom(before && after && before.key !== after.key ? before.label : null);
    onChange(next);
  };
```

Add the import at the top of the file — extend the existing named import from `CustomSheetBody` (`:35`):

```jsx
import { collectSkillOptions, renderDamageFormula, weaponSkillColumn } from '../../systems/custom/CustomSheetBody';
```

- [ ] **Step 6: Render the notice and the badge**

In `WeaponColumnsEditor`, right under the `{t('creator.weaponColumns')}` `<Typography>` (`:334`):

```jsx
      {movedFrom && (
        <div className="creator__weapon-col-moved">
          {t('creator.weaponSkillColumnMoved', { column: movedFrom })}
        </div>
      )}
```

And inside `creator__weapon-col-head`, after the type `<select>` (`:346`):

```jsx
            {col.type === 'select' && col.optionsFromSkills && (
              <span className="creator__weapon-col-badge">{t('creator.weaponSkillColumnBadge')}</span>
            )}
```

- [ ] **Step 7: Add the i18n keys**

`src/locales/en/translation.json`, next to `"weaponColFromSkills"` (`:1417`):

```json
    "weaponSkillColumnBadge": "attack skill",
    "weaponSkillColumnMoved": "Skill column moved from \"{{column}}\"",
```

`src/locales/pl/translation.json`, same place:

```json
    "weaponSkillColumnBadge": "umiejętność ataku",
    "weaponSkillColumnMoved": "Kolumna umiejętności przeniesiona z „{{column}}”",
```

- [ ] **Step 8: Add the styles**

In `src/style.css`, after the `.creator__weapon-col-head` block (`:9333-9337`):

```css
.creator__weapon-col-badge {
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(201, 151, 91, 0.25);
    color: #7a5c42;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
}

.creator__weapon-col-moved {
    margin-bottom: 6px;
    color: #7a5c42;
    font-size: 0.75rem;
    font-style: italic;
}
```

- [ ] **Step 9: Verify in the creator suite**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder
```

Expected: PASS (`weaponColumns`, `sheetWidth`, `dragDrop`, `chromeWiring`).

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator warhammer-battle-helper-front/src/locales warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-208 keep the weapons table to a single skill column"
```

---

### Task 3: Widoczny próg rzutu na trafienie

The creator's attack-roll panel shows only "below/above threshold" and never says where the threshold comes from. A GM who forgets the skill column gets a roll that quietly loses its target, and a `skill` block in the formula that quietly adds 0.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:387-452` (`RollConfigEditor` + new exported helper), `:884-889` (call site)
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json`
- Modify: `warhammer-battle-helper-front/src/style.css`
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.weaponColumns.test.jsx` (extend)

**Interfaces:**
- Consumes: `weaponSkillColumn(field)` from Task 1; the file-level `jest.mock('axios')` set up by Task 2's test file.
- Produces: `weaponThresholdHint(skillColumnLabel, successType) -> { key: string, column?: string, warning: boolean } | null`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/creator/TemplateBuilder.weaponColumns.test.jsx`, and extend the import on its first line to `import { updateWeaponColumns, weaponThresholdHint } from './TemplateBuilder';`:

```jsx
test('with a skill column the hint names it', () => {
  expect(weaponThresholdHint('Melee', 'below_threshold'))
    .toEqual({ key: 'creator.weaponThresholdFromSkill', column: 'Melee', warning: false });
});

test('a raw roll has no threshold, so a present column needs no hint', () => {
  expect(weaponThresholdHint('Melee', 'raw')).toBeNull();
});

test('no skill column warns about the threshold and the formula', () => {
  expect(weaponThresholdHint(null, 'above_threshold'))
    .toEqual({ key: 'creator.weaponThresholdNoSkillColumn', warning: true });
});

test('no skill column on a raw roll warns about the formula only', () => {
  expect(weaponThresholdHint(null, 'raw'))
    .toEqual({ key: 'creator.weaponNoSkillColumnRaw', warning: true });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=weaponColumns
```

Expected: FAIL — `weaponThresholdHint is not a function`.

- [ ] **Step 3: Add the exported helper**

In `src/components/creator/TemplateBuilder.jsx`, directly above `function RollConfigEditor` (`:387`):

```jsx
// weaponThresholdHint decides what the creator prints under a weapons_table's success-condition
// select. successType governs the threshold only: a "raw" roll compares against nothing
// (roller.go:558), so claiming a threshold there would be a lie. A missing skill column still
// matters under "raw", because a "skill" block in the formula then resolves skillValue(stats, "")
// — a silent 0 rather than an error.
export function weaponThresholdHint(skillColumnLabel, successType) {
  if (skillColumnLabel) {
    if (successType === 'raw') return null;
    return { key: 'creator.weaponThresholdFromSkill', column: skillColumnLabel, warning: false };
  }
  return successType === 'raw'
    ? { key: 'creator.weaponNoSkillColumnRaw', warning: true }
    : { key: 'creator.weaponThresholdNoSkillColumn', warning: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false --testPathPattern=weaponColumns
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Render the hint**

Change `RollConfigEditor`'s signature (`:387`):

```jsx
function RollConfigEditor({ config, onChange, numberFields, fieldType, skillColumnLabel = null }) {
```

The traditional branch is today a single `<FormControl>`, so it first has to become a fragment. Wrap it as `<>…</>` and put the hint after the closing `</FormControl>` (`:429`), still inside that fragment:

```jsx
          {fieldType === 'weapons_table' && (() => {
            const hint = weaponThresholdHint(skillColumnLabel, config.successType || 'below_threshold');
            if (!hint) return null;
            return (
              <div className={`creator__weapon-threshold-hint${hint.warning ? ' creator__weapon-threshold-hint--warning' : ''}`}>
                {t(hint.key, { column: hint.column })}
              </div>
            );
          })()}
```

Note the whole block sits inside the traditional branch: a dice-pool weapon counts successes per die and never reads this threshold.

- [ ] **Step 6: Pass the column label from the property panel**

At the weapons_table call site (`:884-889`):

```jsx
              <RollConfigEditor
                config={field.rollConfig || defaultRollConfig()}
                onChange={cfg => up({ rollConfig: cfg })}
                numberFields={numberFields}
                fieldType={field.type}
                skillColumnLabel={weaponSkillColumn(field)?.label || null}
              />
```

An unnamed column yields `''`, which is falsy, so it reads as "no column" — correct, since the hint would otherwise point at a column the GM cannot identify.

- [ ] **Step 7: Add the i18n keys**

`src/locales/en/translation.json`, next to `"weaponAttackRoll"` (`:1424`):

```json
    "weaponThresholdFromSkill": "Threshold = the value of the skill picked in the \"{{column}}\" column",
    "weaponThresholdNoSkillColumn": "No skill column — the threshold falls back to the linked attribute, and a \"skill\" block in the formula adds 0",
    "weaponNoSkillColumnRaw": "No skill column — a \"skill\" block in the formula adds 0",
```

`src/locales/pl/translation.json`, same place:

```json
    "weaponThresholdFromSkill": "Próg = wartość umiejętności wybranej w kolumnie „{{column}}”",
    "weaponThresholdNoSkillColumn": "Brak kolumny z umiejętnościami — próg spadnie na powiązany atrybut, a blok „umiej.” w formule doda 0",
    "weaponNoSkillColumnRaw": "Brak kolumny z umiejętnościami — blok „umiej.” w formule doda 0",
```

- [ ] **Step 8: Add the styles**

In `src/style.css`, after the `.creator__weapon-col-moved` block from Task 2:

```css
.creator__weapon-threshold-hint {
    margin: -4px 0 10px;
    color: #7a5c42;
    font-size: 0.78rem;
    font-style: italic;
    line-height: 1.35;
}

.creator__weapon-threshold-hint--warning {
    padding: 4px 8px;
    border-left: 3px solid #c9975b;
    background: rgba(201, 151, 91, 0.15);
    font-style: normal;
}
```

- [ ] **Step 9: Run the whole frontend suite**

```bash
cd warhammer-battle-helper-front
CI=true npm test -- --watchAll=false
```

Expected: PASS everywhere except `App.test.js`, whose axios ESM failure is the known baseline.

- [ ] **Step 10: Check the i18n files did not drift**

```bash
cd "$(git rev-parse --show-toplevel)"
python3 .claude/skills/i18n-sync/compare_keys.py
```

Expected: no missing keys on either side. All six new keys must appear in both files.

- [ ] **Step 11: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: FEATURE-208 show the GM where a weapon attack's threshold comes from"
```

---

## Manual verification

The automated tests cover the pure functions; these three checks cover the wiring, in the creator and in a live session.

1. **Exclusivity.** Creator → a weapons_table field → add two `select` columns → flag the first ("attack skill" badge appears) → flag the second. The first loses both the flag and the badge, and the notice names it.
2. **Hint.** Same field's "Attack roll" group: with a flagged column and "below threshold", the hint names the column. Unflag it — the warning replaces the hint. Switch the condition to "raw" — the warning shortens to the formula sentence.
3. **Blocking.** In a session, add a weapon row and leave its skill cell on `—`: the die button is disabled and its tooltip says to pick a skill. Pick the skill; if a damage input is still empty the tooltip switches to the damage message, and once both are filled the roll goes through with the skill's value as the target.
