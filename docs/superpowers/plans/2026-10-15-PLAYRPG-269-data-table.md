# PLAYRPG-269 Data Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `data_table` field type to custom systems (GM-defined columns incl. long text, player rows, GM preset rows, no rolls) built on a row-table core extracted from the weapons table.

**Architecture:** The weapons table's generic parts (header, GM rows, player rows with pencil edit mode, cells by column type, footer with catalog, grid template) move into `RowTable*` components plus `rowTableLayout.js`. Weapon-only parts (star, damage formula, roll) plug into the core as leading/trailing column slots. `long_text` columns live outside the grid in a per-row expandable details panel, owned by the core. Creator column/preset editors move out of `TemplateBuilder.jsx` into generic files parameterised by props.

**Tech Stack:** Go (models + custom system plugin, `go.mongodb.org/mongo-driver/bson`), React (CRA, Jest + Testing Library), i18next, `@mui/icons-material`.

**Spec:** `docs/superpowers/specs/PLAYRPG-269.md`

## Global Constraints

- Code comments always in English. Conversation/docs in Polish.
- All UI strings via `t('key')`, keys added to BOTH `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`.
- No MUI `<Tooltip>`; use the existing `showTooltip`/`hideTooltip` portal props.
- Sheet colours: dark text on cream (`#3a2f1f` text, `#7a5c42` labels, `#c4a882` input border, `#fff9f0` input bg).
- Creator shows exactly what the player sees: `TemplateBuilder` renders the real `CustomSheetBody`.
- Delete dead code / CSS / i18n keys in the same change that orphans them.
- Frontend tests: run from `warhammer-battle-helper-front/` with `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. `App.test.js` (axios ESM) is a known baseline failure.
- Backend tests: `cd warhammer-battle-helper-backend && go test ./internal/...`.
- Work on `main`, no worktree. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```
- No backward compat needed for stored data.

## File Map

Backend:
- Modify `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` — `FieldDef.PresetRows`, `PresetRow`, type comments.
- Modify `warhammer-battle-helper-backend/internal/systems/custom/character.go` — `Stats.Tables`, `TableRow`.
- Modify `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` — `decodeStats` initialises `Tables`.
- Test `internal/models/SystemTemplate_test.go`, create `internal/systems/custom/tables_test.go`.

Frontend sheet (`warhammer-battle-helper-front/src/systems/custom/`):
- Create `rowTableLayout.js` (+ `rowTableLayout.test.js`) — grid template, labels, option resolution, long-text split.
- Modify `weaponLayout.js` — drop `weaponGridTemplate`, `weaponRowLabel` delegates to `rowLabel`. Delete `weaponLayout.test.js` (its cases move to `rowTableLayout.test.js`).
- Create `fields/RowTableCell.jsx` — `StaticCell`, `CellInput`.
- Create `fields/RowTableDetails.jsx` — `RowExpander`, `RowDetails`, `rowHasDetails`.
- Create `fields/RowTablePlayerRow.jsx`, `fields/RowTablePresetRow.jsx`, `fields/RowTable.jsx`.
- Rewrite `fields/WeaponsTable.jsx` as a wrapper. Delete `fields/WeaponsTableRow.jsx`, `fields/WeaponsPresetRow.jsx`.
- Create `fields/DataTable.jsx`.
- Modify `CustomSheetBody.jsx`, `CharacterSheet.jsx`, `index.js`.
- Modify `src/style.css` — class rename `custom-sheet__weapon-*` → `custom-sheet__row-table-*` for shared parts, new details styles; `creator__weapon-(col|preset)*` → `creator__table-*`.

Frontend creator (`warhammer-battle-helper-front/src/components/creator/`):
- Create `OptionsEditor.jsx`, `TableColumnsEditor.jsx`, `TablePresetsEditor.jsx`.
- Modify `TemplateBuilder.jsx`, `EditablePlaceholder.jsx`.
- Rename test `WeaponColumnsEditor.test.jsx` → `TableColumnsEditor.test.jsx`; modify `TemplateBuilder.weaponColumns.test.jsx` import; create `TemplateBuilder.dataTable.test.jsx`.

---

### Task 1: Backend — data model for data_table

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:236` (Type comment), `:298-306` (after PresetWeapons), `:331-341` (WeaponColumn comment)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/character.go:38-43`, `:49-56`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:211-213`
- Test: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`, `warhammer-battle-helper-backend/internal/systems/custom/tables_test.go`

**Interfaces:**
- Produces: JSON `field.presetRows: [{id, cells, alwaysOn}]`, `field.columns[].type` may be `"long_text"`, `stats.tables: { [fieldKey]: [{id, cells}] }`.

- [ ] **Step 1: Write the failing tests**

Append to `internal/models/SystemTemplate_test.go`:

```go
// A data_table's preset rows and its long_text column live only in FieldDef. SystemTemplate is
// decoded into this typed struct, so a key missing from it is dropped on read and erased by the
// next PATCH — silently. This pins the round-trip.
func TestFieldDef_DataTableRoundTripsThroughBSON(t *testing.T) {
	in := FieldDef{
		Key:  "data_table_1",
		Type: "data_table",
		Columns: []WeaponColumn{
			{Key: "name", Label: "Nazwa", Type: "text"},
			{Key: "desc", Label: "Opis", Type: "long_text"},
		},
		PresetRows: []PresetRow{
			{ID: "preset_1", Cells: map[string]string{"name": "Lina", "desc": "10 m"}, AlwaysOn: true},
		},
	}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out FieldDef
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(out.PresetRows) != 1 || out.PresetRows[0].Cells["desc"] != "10 m" || !out.PresetRows[0].AlwaysOn {
		t.Errorf("PresetRows = %+v, want one always-on row with desc \"10 m\"", out.PresetRows)
	}
	if len(out.Columns) != 2 || out.Columns[1].Type != "long_text" {
		t.Errorf("Columns = %+v, want a long_text second column", out.Columns)
	}
}
```

Create `internal/systems/custom/tables_test.go`:

```go
package custom

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// ComputeDerived rewrites stats through the Stats struct, so a key the struct does not declare is
// dropped on the first save. Tables has no derived values — this only pins that it survives.
func TestComputeDerived_KeepsTables(t *testing.T) {
	p := New()
	in := Stats{Tables: map[string][]TableRow{
		"inv": {{ID: "r_1", Cells: map[string]string{"name": "Lina", "desc": "10 m"}}},
	}}
	raw, _ := bson.Marshal(in)

	out, err := p.ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)
	if !reflect.DeepEqual(got.Tables, in.Tables) {
		t.Errorf("Tables = %+v, want %+v", got.Tables, in.Tables)
	}
}

func TestDecodeStats_InitialisesTables(t *testing.T) {
	raw, _ := bson.Marshal(Stats{})
	s, err := decodeStats(raw)
	if err != nil {
		t.Fatalf("decodeStats() error: %v", err)
	}
	if s.Tables == nil {
		t.Error("Tables = nil, want an empty map")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ ./internal/systems/custom/`
Expected: compile errors `unknown field PresetRows`, `undefined: PresetRow`, `unknown field Tables`, `undefined: TableRow`.

- [ ] **Step 3: Implement**

In `internal/models/SystemTemplate.go`, extend the `Type` comment on `FieldDef` with `|"data_table"` (after `"weapons_table"`). Directly after the `PresetWeapons` field add:

```go
	// PresetRows are GM-authored rows of a data_table field — the data_table counterpart of
	// PresetWeapons, with the same AlwaysOn semantics (rendered from the template, never copied
	// into stats) and the same catalog semantics for the rest. data_table reuses Columns.
	PresetRows []PresetRow `bson:"presetRows,omitempty" json:"presetRows,omitempty"`
```

After the `PresetWeapon` type add:

```go
// PresetRow is a GM-authored row of a data_table field. A separate type from PresetWeapon because
// a data row has no damage: sharing the type would carry a field that is always empty.
type PresetRow struct {
	ID       string            `bson:"id" json:"id"`
	Cells    map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
	AlwaysOn bool              `bson:"alwaysOn,omitempty" json:"alwaysOn,omitempty"`
}
```

Change the `WeaponColumn` doc comment's first lines to:

```go
// WeaponColumn defines one GM-authored column of a weapons_table or data_table field.
// Type is "text" | "number" | "select", plus "long_text" in a data_table only. For a select
// column the player picks from Options (manual list), unless OptionsFromSkills is true (weapons
// only) — then the choices are the character's skills and the picked skill drives the attack roll.
```

and the `Type` tag comment to `// "text"|"number"|"select"|"long_text"`.

In `internal/systems/custom/character.go`, after `FavoriteWeapons` add:

```go
	// Tables holds the player-added rows of each data_table field, keyed by field key.
	Tables map[string][]TableRow `bson:"tables,omitempty" json:"tables,omitempty"`
```

and after the `WeaponRow` type:

```go
// TableRow is one player-added row in a data_table field. Cells maps a column key to the entered
// value; long_text columns are cells like any other.
type TableRow struct {
	ID    string            `bson:"id" json:"id"`
	Cells map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
}
```

In `internal/systems/custom/plugin.go` `decodeStats`, after the `Weapons` nil check add:

```go
	if s.Tables == nil {
		s.Tables = map[string][]TableRow{}
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/...`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go warhammer-battle-helper-backend/internal/systems/custom/character.go warhammer-battle-helper-backend/internal/systems/custom/plugin.go warhammer-battle-helper-backend/internal/systems/custom/tables_test.go
git commit -m "feat: PLAYRPG-269 data_table model — preset rows and stats.tables"
```

---

### Task 2: rowTableLayout.js — shared table geometry and labels

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/rowTableLayout.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/rowTableLayout.test.js`
- Delete: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.test.js` (cases ported below — `weaponGridTemplate` is removed in Task 4)

**Interfaces:**
- Produces (all named exports):
  - `LONG_TEXT = 'long_text'`
  - `gridColumns(columns) → Column[]` (non-long_text, in order)
  - `detailColumns(columns) → Column[]` (long_text only, in order)
  - `nameColumnKey(columns) → string|undefined` (first `text` column)
  - `rowGridTemplate(columns, { leading = [], trailing = [] }) → string` — tracks: `'22px'` expander if any long_text column, `...leading`, grid column tracks, `...trailing`, `'52px'` actions (always)
  - `rowLabel(columns, row, fallback) → string`
  - `columnOptions(column, skillOptions = []) → {key,label}[]`
  - `cellLabel(column, value, skillOptions = []) → string`

- [ ] **Step 1: Write the failing test**

Create `rowTableLayout.test.js`:

```js
import { rowGridTemplate, rowLabel, cellLabel, gridColumns, detailColumns } from './rowTableLayout';

// A GM's own column set.
const cols = (...types) => types.map((type, i) => ({ key: `c${i}`, label: `K${i}`, type }));

describe('rowGridTemplate', () => {
  it('gives the first text column the remainder and the rest their type\'s width', () => {
    expect(rowGridTemplate(cols('text', 'select', 'number')))
      .toBe('minmax(0, 2fr) minmax(0, 140px) 56px 52px');
  });

  // Only the FIRST text column is the name — rowLabel picks the first non-empty text column as the
  // row's name, and the width rule has to agree with it rather than invent its own.
  it('treats only the first text column as the name', () => {
    expect(rowGridTemplate(cols('text', 'text', 'text')))
      .toBe('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 52px');
  });

  it('finds the name column wherever the GM put it', () => {
    expect(rowGridTemplate(cols('number', 'select', 'text')))
      .toBe('56px minmax(0, 140px) minmax(0, 2fr) 52px');
  });

  // No text column: every track is capped and rigid, the row packs to the left. A table of only
  // narrow columns is a narrow table, not an attempt to fill the container.
  it('packs to the left when no column is text', () => {
    expect(rowGridTemplate(cols('select', 'number'))).toBe('minmax(0, 140px) 56px 52px');
  });

  it('produces a fully rigid template with only number columns', () => {
    expect(rowGridTemplate(cols('number', 'number'))).toBe('56px 56px 52px');
  });

  it('places leading slots before the columns and trailing slots before the actions', () => {
    expect(rowGridTemplate(cols('text'), { leading: ['22px'], trailing: ['minmax(0, 1fr)', '28px'] }))
      .toBe('22px minmax(0, 2fr) minmax(0, 1fr) 28px 52px');
  });

  it('survives a field with no columns at all', () => {
    expect(rowGridTemplate(undefined, { leading: ['22px'] })).toBe('22px 52px');
  });

  // long_text never gets a grid track — it renders in the row's details panel — but its presence
  // reserves the expander track at the very start, for every row, so columns never shift.
  it('keeps long_text out of the grid and reserves the expander first', () => {
    expect(rowGridTemplate(cols('text', 'long_text', 'number')))
      .toBe('22px minmax(0, 2fr) 56px 52px');
  });
});

describe('gridColumns / detailColumns', () => {
  it('split the columns by long_text, keeping order', () => {
    const c = cols('long_text', 'text', 'long_text');
    expect(gridColumns(c).map(x => x.key)).toEqual(['c1']);
    expect(detailColumns(c).map(x => x.key)).toEqual(['c0', 'c2']);
  });
});

describe('rowLabel', () => {
  const c = [
    { key: 'qty', type: 'number' },
    { key: 'desc', type: 'long_text' },
    { key: 'name', type: 'text' },
  ];

  it('prefers the first non-empty text column', () => {
    expect(rowLabel(c, { cells: { qty: '3', name: ' Lina ' } }, 'Row')).toBe('Lina');
  });

  // A description is a paragraph — it must never become the name in a catalog dropdown.
  it('falls back to any non-long_text cell, never to a description', () => {
    expect(rowLabel(c, { cells: { qty: '3', desc: 'Long story' } }, 'Row')).toBe('3');
  });

  it('uses the fallback when nothing else is filled', () => {
    expect(rowLabel(c, { cells: { desc: 'Long story' } }, 'Row')).toBe('Row');
  });
});

describe('cellLabel', () => {
  it('passes non-select values through', () => {
    expect(cellLabel({ type: 'text' }, 'abc')).toBe('abc');
  });

  it('resolves a select value to its option label', () => {
    expect(cellLabel({ type: 'select', options: ['A', 'B'] }, 'B')).toBe('B');
  });

  // Skill keys are surrogate ids — an unresolvable one must never reach the screen.
  it('returns empty for a skill key that no longer resolves', () => {
    const skills = [{ key: 'sk.1', label: 'Melee' }];
    expect(cellLabel({ type: 'select', optionsFromSkills: true }, 'sk.1', skills)).toBe('Melee');
    expect(cellLabel({ type: 'select', optionsFromSkills: true }, 'sk.gone', skills)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=rowTableLayout`
Expected: FAIL — `Cannot find module './rowTableLayout'`.

- [ ] **Step 3: Implement**

Create `rowTableLayout.js`:

```js
// Geometry and labels shared by every table whose columns the GM defines and whose rows the player
// adds: weapons_table and data_table. Weapon-only concerns (damage, the skill column's roll role,
// row completeness) stay in weaponLayout.js; this module knows nothing about rolls.

export const LONG_TEXT = 'long_text';

const EXPANDER_TRACK = '22px';
const ACTIONS_TRACK  = '52px';

// gridColumns are the columns that get a track in the row's grid. long_text is a paragraph — it
// cannot live in a fixed-width track — so it renders in the row's details panel instead.
export function gridColumns(columns) {
  return (columns || []).filter(c => c.type !== LONG_TEXT);
}

export function detailColumns(columns) {
  return (columns || []).filter(c => c.type === LONG_TEXT);
}

// The name column is the first text column: the one rowLabel names a row by and the one that gets
// the widest track.
export function nameColumnKey(columns) {
  return ((columns || []).find(c => c.type === 'text') || {}).key;
}

// rowGridTemplate builds ONE grid-template-columns string for a table. The header and every row of
// the field must be handed the same string; the columns are the GM's, so nothing else could keep
// them aligned (FEATURE-224).
//
// A column's track comes from its TYPE, never from its content. auto and max-content would make
// the width depend on the data, so a column would grow while the player types into it and shove
// its neighbours sideways under the cursor.
//
// minmax(0, …) on every flexible track: without the zero floor a track refuses to shrink below
// its content, which is the very behaviour this function exists to avoid.
//
// leading/trailing are the tracks of the caller's own slots (the weapons table's star before the
// columns, its damage and die after them). The expander track is not a slot: the core owns the
// details panel, so it reserves the expander itself whenever any column is long_text — on every
// row, filled or not, so the columns never shift between rows.
export function rowGridTemplate(columns, { leading = [], trailing = [] } = {}) {
  const nameKey = nameColumnKey(columns);

  const trackFor = (c) => {
    if (c.type === 'number') return '56px';
    if (c.type === 'select') return 'minmax(0, 140px)';
    return c.key === nameKey ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)';
  };

  return [
    detailColumns(columns).length > 0 && EXPANDER_TRACK,
    ...leading,
    ...gridColumns(columns).map(trackFor),
    ...trailing,
    ACTIONS_TRACK,
  ].filter(Boolean).join(' ');
}

// rowLabel picks a display name for a row: the first non-empty text column, then any non-empty
// grid cell, then the fallback. long_text is skipped — a paragraph is not a name, and this label
// lands in catalog dropdowns and roll logs.
export function rowLabel(columns, row, fallback) {
  const cells = row.cells || {};
  const filled = c => (cells[c.key] || '').trim();
  const cols = gridColumns(columns);
  const text = cols.find(c => c.type === 'text' && filled(c));
  if (text) return filled(text);
  const any = cols.find(filled);
  if (any) return filled(any);
  return fallback;
}

// columnOptions lists what a select column offers: the character's skills for a weapons skill
// column, the GM's manual list otherwise (a manual option's stored value IS its label).
export function columnOptions(column, skillOptions = []) {
  return column.optionsFromSkills
    ? skillOptions
    : (column.options || []).map(o => ({ key: o, label: o }));
}

// cellLabel resolves a cell to its display text. A select key that no longer resolves — a removed
// skill, a deleted custom node — returns '' rather than the raw surrogate key: those ids are
// internal and must never reach the screen, so callers' own `|| '—'` is what the player sees.
export function cellLabel(column, value, skillOptions = []) {
  if (column.type !== 'select') return value;
  return columnOptions(column, skillOptions).find(o => o.key === value)?.label || '';
}
```

Delete `weaponLayout.test.js` (`git rm`) — every case is ported above with the actions track appended (the weapons table always reserved it) and the `showStar/hasDamage/showRoll` flags expressed as slot tracks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=rowTableLayout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/rowTableLayout.js warhammer-battle-helper-front/src/systems/custom/rowTableLayout.test.js
git rm warhammer-battle-helper-front/src/systems/custom/weaponLayout.test.js
git commit -m "feat: PLAYRPG-269 row table layout helpers shared by GM-columned tables"
```

---

### Task 3: Rename shared weapons-table CSS classes

Pure rename, no behaviour change. Done before the component extraction so that Task 4 can prove DOM identity: the renamed snapshot must match the new components without `-u`.

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx`, `fields/WeaponsTableRow.jsx`, `fields/WeaponsPresetRow.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponsTable.test.jsx`, `CustomSheetBody.domShape.test.jsx`, `__snapshots__/CustomSheetBody.domShape.test.jsx.snap`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (creator classes)

**Interfaces:**
- Produces class names used by Tasks 4–7:
  - `custom-sheet__row-table` (was `weapon-table`), `custom-sheet__row-table-col-label`, `custom-sheet__row-table-row` (+ `--preset`, `--reading`), `custom-sheet__row-table-cell-static` (+ `--name`), `custom-sheet__row-table-cell-input`, `custom-sheet__row-table-cell-select`, `custom-sheet__row-table-actions`, `custom-sheet__row-table-edit`, `-save`, `-remove`, `-lock`, `custom-sheet__row-table-add-row`, `custom-sheet__row-table-add-btn`, `custom-sheet__row-table-preset-picker`
  - Unchanged (weapon-only): `custom-sheet__field--weapon-table`, `custom-sheet__weapon-damage`, `custom-sheet__weapon-dmg-*`
  - Creator: `creator__weapon-col*` / `creator__weapon-columns` → `creator__table-col*` / `creator__table-columns`; `creator__weapon-preset*` / `creator__weapon-presets*` → `creator__table-preset*` / `creator__table-presets*`. `creator__weapon-threshold-hint*` unchanged.

- [ ] **Step 1: Run the rename**

```bash
cd warhammer-battle-helper-front/src
perl -pi -e '
  s/custom-sheet__weapon-table\b/custom-sheet__row-table/g;
  s/custom-sheet__weapon-(col-label|row|cell-|actions|edit|save|remove|lock|add-row|add-btn|preset-picker)/custom-sheet__row-table-$1/g;
  s/creator__weapon-(col|preset)/creator__table-$1/g;
' style.css \
  systems/custom/fields/WeaponsTable.jsx systems/custom/fields/WeaponsTableRow.jsx systems/custom/fields/WeaponsPresetRow.jsx \
  systems/custom/CustomSheetBody.weaponsTable.test.jsx systems/custom/CustomSheetBody.domShape.test.jsx \
  systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap \
  components/creator/TemplateBuilder.jsx
```

- [ ] **Step 2: Verify nothing old is left and nothing weapon-only was renamed**

```bash
cd warhammer-battle-helper-front/src
grep -rnE 'custom-sheet__weapon-(table|col-label|row|cell|actions|edit|save|remove|lock|add|preset-picker)|creator__weapon-(col|preset)' . ; echo "exit=$?"
grep -c 'custom-sheet__weapon-dmg-input\|custom-sheet__weapon-damage\|creator__weapon-threshold-hint\|custom-sheet__field--weapon-table' style.css
```
Expected: first grep prints nothing and `exit=1`; second prints a non-zero count.

- [ ] **Step 3: Run the weapons and snapshot tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|TemplateBuilder|WeaponColumnsEditor'`
Expected: PASS (snapshot matches without update — the rename touched both sides).

- [ ] **Step 4: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git commit -m "refactor: PLAYRPG-269 rename shared weapons-table classes to row-table"
```

---

### Task 4: Extract the RowTable core; WeaponsTable becomes a wrapper

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/RowTableCell.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/RowTableDetails.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/RowTablePlayerRow.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/RowTablePresetRow.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/RowTable.jsx`
- Rewrite: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx`
- Delete: `fields/WeaponsTableRow.jsx`, `fields/WeaponsPresetRow.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.js`
- Test (must pass unchanged): `CustomSheetBody.weaponsTable.test.jsx`, `CustomSheetBody.domShape.test.jsx`, `CharacterDetails.favorites.test.jsx`, `weaponLayout.rowIssue.test.js`

**Interfaces:**
- Consumes: Task 2 exports; Task 3 class names.
- Produces:
  - `RowTableCell.jsx`: `StaticCell({ column, value, skillOptions, isName, showTooltip, hideTooltip })`, `CellInput({ column, value, skillOptions, onChange(value), classes: { input, select, textarea }, autoFocus, onKeyDown })`
  - `RowTableDetails.jsx`: `rowHasDetails(columns, row) → bool`, `RowExpander({ show, expanded, onToggle })`, `RowDetails({ columns, row, editing, onCell(colKey, value) })`
  - `RowTable.jsx` default export, props:
    `{ columns, presets, rows, skillOptions = [], leading = [], trailing = [], labels, onAdd, onAddFromPreset, onCell, onRemove, editingPath, setEditingPath, showTooltip, hideTooltip }`
    - slot: `{ key, track, header, render(row, { isPreset, editing }) }`
    - `labels`: `{ add, addFromList, edit, save, remove, locked, rowFallback }`
    - `onAdd() → newRowId`, `onAddFromPreset(preset)`, `onCell(rowId, colKey, value)`, `onRemove(rowId)` — all `null` when read-only
    - renders the table container + footer as a fragment (caller owns the field wrapper and title)

- [ ] **Step 1: Confirm the guard tests are green before touching code**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody.weaponsTable|CustomSheetBody.domShape|CharacterDetails.favorites|weaponLayout'`
Expected: PASS. These tests are the spec for this task; their assertions must not change.

- [ ] **Step 2: Create `fields/RowTableCell.jsx`**

```jsx
import React from 'react';
import { LONG_TEXT, columnOptions, cellLabel } from '../rowTableLayout';

// One cell of a GM-columned table, in its two forms. Before PLAYRPG-269 this switch on the column
// type was written out three times — the player's row, the GM's row and the creator's preset
// editor — and every fix had to find all three.

// StaticCell is a cell at rest: text, never an input. The tooltip appears only when the text is
// actually clipped; a tooltip repeating fully visible text is noise.
export function StaticCell({ column, value, skillOptions, isName, showTooltip, hideTooltip }) {
  const label = cellLabel(column, value, skillOptions) || '—';
  return (
    <span
      className={`custom-sheet__row-table-cell-static${isName ? ' custom-sheet__row-table-cell-static--name' : ''}`}
      onMouseEnter={e => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) showTooltip(label, el);
      }}
      onMouseLeave={hideTooltip}
    >
      {label}
    </span>
  );
}

// CellInput is the editing control for one column. `classes` is the caller's skin: the sheet's
// borderless in-row inputs and the creator's boxed preset fields share the behaviour, not the look.
// onKeyDown is not passed to the textarea — Enter there is a newline, not "done".
export function CellInput({ column, value, skillOptions = [], onChange, classes, autoFocus = false, onKeyDown }) {
  const handle = onChange ? e => onChange(e.target.value) : undefined;

  if (column.type === 'select') {
    return (
      <select className={classes.select} value={value} onChange={handle} autoFocus={autoFocus} onKeyDown={onKeyDown}>
        <option value="">—</option>
        {columnOptions(column, skillOptions).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    );
  }
  if (column.type === LONG_TEXT) {
    return <textarea className={classes.textarea} value={value} onChange={handle} autoFocus={autoFocus} rows={3} />;
  }
  return (
    <input
      type={column.type === 'number' ? 'number' : 'text'}
      className={classes.input}
      value={value}
      onChange={handle}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    />
  );
}
```

- [ ] **Step 3: Create `fields/RowTableDetails.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { CellInput } from './RowTableCell';

// A row's long_text cells. They cannot live in a fixed-width grid track, so they open in a panel
// under the row, across its full width.

export function rowHasDetails(columns, row) {
  const cells = row.cells || {};
  return columns.some(c => (cells[c.key] || '').trim());
}

// The expander keeps its track even when hidden (an empty span), so the columns of a row with no
// description line up with those of a row that has one.
export function RowExpander({ show, expanded, onToggle }) {
  const { t } = useTranslation();
  if (!show) return <span className="custom-sheet__row-table-expander" aria-hidden="true" />;
  const Icon = expanded ? ExpandMoreIcon : ChevronRightIcon;
  return (
    <button
      className="custom-sheet__row-table-expander"
      onClick={onToggle}
      title={t(expanded ? 'customSheet.collapseRow' : 'customSheet.expandRow')}
      aria-expanded={expanded}
    >
      <Icon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
    </button>
  );
}

// The panel is a child of the row element (grid-column: 1 / -1 in CSS), never a sibling: the
// zebra striping counts sibling parity, and a sibling panel would flip the tint of every row after
// an expanded one.
export function RowDetails({ columns, row, editing, onCell }) {
  const cells = row.cells || {};
  return (
    <div className="custom-sheet__row-table-details">
      {columns.map(c => (
        <div key={c.key} className="custom-sheet__row-table-detail">
          <span className="custom-sheet__row-table-detail-label">{c.label}</span>
          {editing ? (
            <CellInput
              column={c}
              value={cells[c.key] || ''}
              onChange={onCell ? v => onCell(c.key, v) : undefined}
              classes={{ textarea: 'custom-sheet__row-table-detail-input' }}
            />
          ) : (
            <div className="custom-sheet__row-table-detail-text">{cells[c.key] || '—'}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `fields/RowTablePresetRow.jsx`**

```jsx
import React from 'react';
import LockIcon from '@mui/icons-material/Lock';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { gridColumns, detailColumns, nameColumnKey } from '../rowTableLayout';
import { StaticCell } from './RowTableCell';
import { RowExpander, RowDetails, rowHasDetails } from './RowTableDetails';

// One GM-owned row: rendered straight from the template so a GM edit reaches every player, and
// never copied into the character's stats.
//
// Its cells are muted rather than tinted. The row's background belongs to the zebra striping, and
// with borderless inputs a static cell and an editable one are otherwise identical — a player
// would discover this row is read-only by clicking it and having nothing happen. Italics were not
// available: in a skill tree they already mean "this node is mine, not the GM's".
//
// Separate from RowTablePlayerRow rather than one component with a flag: a GM row has no edit
// mode to be in, no pencil and no delete.
function RowTablePresetRow({
  preset, columns, skillOptions, gridTemplate, leading, trailing, expanded, onToggleExpand, labels,
  showTooltip, hideTooltip,
}) {
  const details = detailColumns(columns);
  const nameKey = nameColumnKey(columns);
  const ctx = { isPreset: true, editing: false };

  return (
    <div className="custom-sheet__row-table-row custom-sheet__row-table-row--preset" style={{ gridTemplateColumns: gridTemplate }}>
      {details.length > 0 && (
        <RowExpander show={rowHasDetails(details, preset)} expanded={expanded} onToggle={onToggleExpand} />
      )}
      {leading.map(s => <React.Fragment key={s.key}>{s.render(preset, ctx)}</React.Fragment>)}

      {gridColumns(columns).map(c => (
        <StaticCell
          key={c.key}
          column={c}
          value={(preset.cells && preset.cells[c.key]) || ''}
          skillOptions={skillOptions}
          isName={c.key === nameKey}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
        />
      ))}

      {trailing.map(s => <React.Fragment key={s.key}>{s.render(preset, ctx)}</React.Fragment>)}

      <div className="custom-sheet__row-table-actions">
        <span className="custom-sheet__row-table-lock" title={labels.locked}>
          <LockIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </span>
      </div>

      {details.length > 0 && expanded && <RowDetails columns={details} row={preset} editing={false} />}
    </div>
  );
}

export default RowTablePresetRow;
```

- [ ] **Step 5: Create `fields/RowTablePlayerRow.jsx`**

```jsx
import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { gridColumns, detailColumns, nameColumnKey } from '../rowTableLayout';
import { StaticCell, CellInput } from './RowTableCell';
import { RowExpander, RowDetails, rowHasDetails } from './RowTableDetails';

const GRID_INPUT_CLASSES = {
  input:  'custom-sheet__row-table-cell-input',
  select: 'custom-sheet__row-table-cell-select',
};

// One player-owned row, in one of two modes.
//
// At rest it renders the same static cells a GM row does. A row is set up once and then rarely
// touched, so inputs that are always live spend most of the row's life offering nothing but a
// chance to change it by accident — and the cheapest stray click, delete, is the one that cannot
// be undone. The pencil guards all of it, delete and the long-text details included.
//
// Editing is a visibility gate, not a buffer: a keystroke still writes through onCell, and the
// tick only closes the mode. The save itself is debounced 800ms upstream in CharacterSheet's
// triggerAutoSave, so buffering here would buy nothing but an undo nobody asked for.
//
// Editing forces the details panel open — the textarea has to be visible to type into — without
// touching the remembered `expanded` state, so the tick returns the row to how it was.
function RowTablePlayerRow({
  row, columns, skillOptions, gridTemplate, leading, trailing, editing, expanded, onToggleExpand,
  onStartEdit, onFinishEdit, onCell, onRemove, labels, showTooltip, hideTooltip,
}) {
  const details = detailColumns(columns);
  const nameKey = nameColumnKey(columns);
  const ctx = { isPreset: false, editing };
  const cell = (colKey, value) => onCell && onCell(row.id, colKey, value);

  // Enter closes the edit the same way the tick does — there is no buffer to flush.
  const finishOnEnter = e => { if (e.key === 'Enter') onFinishEdit(); };

  return (
    <div
      className={`custom-sheet__row-table-row${editing ? '' : ' custom-sheet__row-table-row--reading'}`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {details.length > 0 && (
        <RowExpander show={!editing && rowHasDetails(details, row)} expanded={expanded} onToggle={onToggleExpand} />
      )}
      {leading.map(s => <React.Fragment key={s.key}>{s.render(row, ctx)}</React.Fragment>)}

      {gridColumns(columns).map((c, i) => {
        const val = (row.cells && row.cells[c.key]) || '';
        if (!editing) {
          return (
            <StaticCell
              key={c.key}
              column={c}
              value={val}
              skillOptions={skillOptions}
              isName={c.key === nameKey}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
          );
        }
        // autoFocus only on the first cell: the pencil opens the row straight into it.
        return (
          <CellInput
            key={c.key}
            column={c}
            value={val}
            skillOptions={skillOptions}
            onChange={onCell ? v => cell(c.key, v) : undefined}
            classes={GRID_INPUT_CLASSES}
            autoFocus={i === 0}
            onKeyDown={finishOnEnter}
          />
        );
      })}

      {trailing.map(s => <React.Fragment key={s.key}>{s.render(row, ctx)}</React.Fragment>)}

      <div className="custom-sheet__row-table-actions">
        {onCell && (editing ? (
          <>
            <button className="custom-sheet__row-table-save" onClick={() => onFinishEdit()} title={labels.save}>
              <CheckIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
            <button
              className="custom-sheet__row-table-remove"
              onClick={() => { onFinishEdit(); onRemove(row.id); }}
              title={labels.remove}
            >
              <CloseIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          </>
        ) : (
          <button className="custom-sheet__row-table-edit" onClick={() => onStartEdit(row.id)} title={labels.edit}>
            <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
        ))}
      </div>

      {details.length > 0 && (editing || expanded) && (
        <RowDetails columns={details} row={row} editing={editing} onCell={onCell ? cell : null} />
      )}
    </div>
  );
}

export default RowTablePlayerRow;
```

- [ ] **Step 6: Create `fields/RowTable.jsx`**

```jsx
import React, { useState } from 'react';
import { rowGridTemplate, rowLabel, gridColumns, detailColumns } from '../rowTableLayout';
import RowTablePresetRow from './RowTablePresetRow';
import RowTablePlayerRow from './RowTablePlayerRow';

// The core of every table whose columns the GM defines and whose rows the player adds: a header
// bar, the GM's always-on rows, the player's own rows, and a footer that adds either kind.
//
// What a particular table adds of its own — the weapons table's star, damage and die — comes in as
// slots: extra columns before (`leading`) or after (`trailing`) the GM's. The grid template is
// built here from the slots' tracks, so the header and every row get one string and cannot
// disagree about where a column starts.
//
// The footer is a sibling of the table container, not of the rows: the zebra striping counts
// sibling parity, so a footer inside would be counted as a row and flip the tint of everything
// after it. That is why this returns a fragment and the caller owns the field wrapper.
//
// editingPath/setEditingPath are the sheet-wide pair CustomSheetBody hands to every editable
// list: exactly one thing is edited at a time. Row ids ("w_…", "r_…") never contain a dot, and
// skill edit paths always do, so they cannot collide.
//
// Which rows are expanded is view state, like scroll position: local to this component, never
// saved, never broadcast.
function RowTable({
  columns, presets, rows, skillOptions = [], leading = [], trailing = [], labels,
  onAdd, onAddFromPreset, onCell, onRemove, editingPath, setEditingPath, showTooltip, hideTooltip,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = id => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const alwaysOnPresets = presets.filter(p => p.alwaysOn);
  const catalogPresets  = presets.filter(p => !p.alwaysOn);
  const gridTemplate = rowGridTemplate(columns, {
    leading:  leading.map(s => s.track),
    trailing: trailing.map(s => s.track),
  });
  const shared = { columns, skillOptions, gridTemplate, leading, trailing, labels, showTooltip, hideTooltip };

  return (
    <>
      <div className="custom-sheet__row-table">
        <div className="custom-sheet__field-header" style={{ gridTemplateColumns: gridTemplate }}>
          {detailColumns(columns).length > 0 && <span className="custom-sheet__row-table-col-label" />}
          {leading.map(s => <span key={s.key} className="custom-sheet__row-table-col-label">{s.header}</span>)}
          {gridColumns(columns).map(c => (
            <span key={c.key} className="custom-sheet__row-table-col-label">{c.label}</span>
          ))}
          {trailing.map(s => <span key={s.key} className="custom-sheet__row-table-col-label">{s.header}</span>)}
          <span className="custom-sheet__row-table-col-label" />
        </div>

        {alwaysOnPresets.map(preset => (
          <RowTablePresetRow
            key={preset.id}
            {...shared}
            preset={preset}
            expanded={expanded.has(preset.id)}
            onToggleExpand={() => toggle(preset.id)}
          />
        ))}

        {rows.map(row => (
          <RowTablePlayerRow
            key={row.id}
            {...shared}
            row={row}
            editing={editingPath === row.id}
            expanded={expanded.has(row.id)}
            onToggleExpand={() => toggle(row.id)}
            onStartEdit={setEditingPath}
            onFinishEdit={() => setEditingPath(null)}
            onCell={onCell}
            onRemove={onRemove}
          />
        ))}
      </div>

      {onAdd && (
        <div className="custom-sheet__row-table-add-row">
          {/* A new row has no values yet — opening it straight into edit mode saves the player a
              line of em-dashes and a hunt for the pencil. A catalogue pick arrives pre-filled and
              reads fine at rest, so it does not get the same treatment. */}
          <button className="custom-sheet__row-table-add-btn" onClick={() => setEditingPath(onAdd())}>
            + {labels.add}
          </button>
          {catalogPresets.length > 0 && (
            <select
              className="custom-sheet__row-table-preset-picker"
              value=""
              onChange={e => {
                const preset = catalogPresets.find(p => p.id === e.target.value);
                if (preset) onAddFromPreset(preset);
              }}
            >
              <option value="">+ {labels.addFromList}</option>
              {catalogPresets.map(p => (
                <option key={p.id} value={p.id}>{rowLabel(columns, p, labels.rowFallback)}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </>
  );
}

export default RowTable;
```

- [ ] **Step 7: Rewrite `fields/WeaponsTable.jsx`**

Replace the whole file with:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import {
  renderDamageFormula, weaponRowLabel, weaponRowIssue, weaponIssueTitle, weaponSkillColumn,
} from '../weaponLayout';
import { collectSkillOptions } from '../skillLayout';
import RowTable from './RowTable';

// The weapons_table field: the row-table core plus the three things only a weapon has — the
// favourites star before the GM's columns, and the damage formula and the die after them.
function WeaponsTable({
  field,
  sections,
  weapons,
  customSkillNodes,
  favoriteWeapons,
  onChange,
  onRoll,
  onToggleFavorite,
  readOnly,
  showStar,
  showRoll,
  rollAffordance,
  editingPath,
  setEditingPath,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  const dmgBlocks = field.damageFormula || [];
  const skillOptions = weaponSkillColumn(field)
    ? collectSkillOptions(sections, customSkillNodes)
    : [];

  // The star is the weapons table's own, not starAffordance's: favourites here are toggled
  // through onChange.weaponFavorite by row id, while the skill fields' helper calls
  // onToggleFavorite with a skill key. What it borrows is the rule that matters — render a dead
  // copy when there is no handler, so the creator reserves the same width the game fills.
  const renderStar = (row) => {
    const active = favoriteWeapons.includes(row.id);
    if (onToggleFavorite) {
      return (
        <button
          className={`custom-sheet__star-btn${active ? ' custom-sheet__star-btn--active' : ''}`}
          onClick={() => onChange && onChange.weaponFavorite(row.id)}
          disabled={readOnly}
          title={t('customSheet.favorite')}
        >
          <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </button>
      );
    }
    return (
      <span className="custom-sheet__star-btn custom-sheet__star-btn--static" aria-hidden="true">
        <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
      </span>
    );
  };

  // Damage is read-only on a GM row and on a player row at rest: its number inputs are part of the
  // weapon's definition, not of play.
  const renderDamage = (row, { isPreset, editing }) => (
    <div className="custom-sheet__weapon-damage">
      {renderDamageFormula(dmgBlocks, row, field.key, isPreset ? null : onChange, isPreset || !editing, t)}
    </div>
  );

  const renderRoll = (row) => {
    const issue = weaponRowIssue(field, row);
    return rollAffordance(
      () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) }),
      { disabled: !!issue, title: weaponIssueTitle(issue, t) },
    );
  };

  const leading = showStar ? [{ key: 'star', track: '22px', header: null, render: renderStar }] : [];
  const trailing = [
    dmgBlocks.length > 0 && { key: 'damage', track: 'minmax(0, 1fr)', header: t('customSheet.damage'), render: renderDamage },
    showRoll && { key: 'roll', track: '28px', header: null, render: renderRoll },
  ].filter(Boolean);

  return (
    <div className="custom-sheet__field custom-sheet__field--weapon-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      <RowTable
        columns={field.columns || []}
        presets={field.presetWeapons || []}
        rows={weapons[field.key] || []}
        skillOptions={skillOptions}
        leading={leading}
        trailing={trailing}
        labels={{
          add:         t('customSheet.addWeapon'),
          addFromList: t('customSheet.addWeaponFromList'),
          edit:        t('customSheet.editWeapon'),
          save:        t('customSheet.saveWeapon'),
          remove:      t('customSheet.removeWeapon'),
          locked:      t('customSheet.weaponPresetLocked'),
          rowFallback: field.label || t('customSheet.weapon'),
        }}
        onAdd={onChange ? () => onChange.weaponAdd(field.key) : null}
        onAddFromPreset={onChange ? preset => onChange.weaponAddFromPreset(field.key, preset) : null}
        onCell={onChange ? (rowId, colKey, val) => onChange.weaponCell(field.key, rowId, colKey, val) : null}
        onRemove={onChange ? rowId => onChange.weaponRemove(field.key, rowId) : null}
        editingPath={editingPath}
        setEditingPath={setEditingPath}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
      />
    </div>
  );
}

export default WeaponsTable;
```

Note: the old header rendered the star's header span as empty and the roll's as empty — `header: null` renders `<span class="…col-label"></span>`, same DOM.

- [ ] **Step 8: Update `weaponLayout.js`**

1. Delete the whole `weaponGridTemplate` function and the comment block above it.
2. Replace `weaponRowLabel` with:

```js
// weaponRowLabel is the name a weapon is logged and listed under: rowLabel over the weapon's
// columns, falling back to the field label and then to the generic "Weapon".
export function weaponRowLabel(field, row, t) {
  return rowLabel(field.columns, row, field.label || t('customSheet.weapon'));
}
```

and add at the top, after `import React from 'react';`:

```js
import { rowLabel } from './rowTableLayout';
```

3. In the file header comment, replace the sentence listing contents with: `// Weapons-table helpers: the completeness verdict for a row, the name a roll is logged under, which column asks for skills, and the damage formula's rendering. The table's geometry and generic labels live in rowTableLayout.js, shared with data_table.`

Behaviour note: `rowLabel`'s fallback skips `long_text`, which weapons never have, so `weaponRowLabel` returns the same values as before.

- [ ] **Step 9: Delete the old row components**

```bash
git rm warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTableRow.jsx warhammer-battle-helper-front/src/systems/custom/fields/WeaponsPresetRow.jsx
grep -rn "WeaponsTableRow\|WeaponsPresetRow\|weaponGridTemplate" warhammer-battle-helper-front/src ; echo "exit=$?"
```
Expected: matches only in comments of test files at most (e.g. `CustomSheetBody.weaponsTable.test.jsx` mentions `WeaponsTableRow` in a comment). Update those comments to say `RowTablePlayerRow` / `rowGridTemplate`; do not touch assertions.

- [ ] **Step 10: Run the guard tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|CharacterDetails|weaponLayout|rowTableLayout'`
Expected: PASS, including the domShape snapshot WITHOUT `-u`. A snapshot diff means the DOM changed — fix the component, never update the snapshot.

- [ ] **Step 11: Commit**

```bash
git add -A warhammer-battle-helper-front/src/systems/custom
git commit -m "refactor: PLAYRPG-269 extract RowTable core from the weapons table"
```

---

### Task 5: data_table on the sheet

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/DataTable.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (header comment `:22-23`, values `:51`, new case after `weapons_table`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx` (`:29-41`, `:69-81`, `:97-110`, weapons handlers `:294-342`, `onChange` object `:410-416`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/index.js:33-34`
- Modify: `warhammer-battle-helper-front/src/style.css` (overflow rule `:8155`, new details rules after `.custom-sheet__row-table-preset-picker:focus`)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (`customSheet`)
- Create: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.dataTable.test.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.dataTable.test.jsx`

**Interfaces:**
- Consumes: `RowTable` (Task 4).
- Produces: `onChange.tableAdd(fieldKey) → rowId`, `onChange.tableAddFromPreset(fieldKey, preset)`, `onChange.tableCell(fieldKey, rowId, colKey, value)`, `onChange.tableRemove(fieldKey, rowId)`; `values.tables`; saved `stats.tables`.

- [ ] **Step 1: Write the failing sheet test**

Create `CustomSheetBody.dataTable.test.jsx`:

```jsx
import React, { useState } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const dataSections = (field = {}) => ([{
  id: 'sec1',
  columns: 1,
  fields: [{
    key: 'inv',
    type: 'data_table',
    label: 'Ekwipunek',
    columns: [
      { key: 'name', label: 'Nazwa', type: 'text' },
      { key: 'qty',  label: 'Ilość', type: 'number' },
      { key: 'desc', label: 'Opis',  type: 'long_text' },
    ],
    presetRows: [],
    ...field,
  }],
}]);

const noop = () => {};
const handlers = { tableAdd: noop, tableAddFromPreset: noop, tableCell: noop, tableRemove: noop };
const withRow = (cells) => ({ tables: { inv: [{ id: 'r1', cells }] } });

describe('data_table — layout', () => {
  it('keeps long_text out of the header and has no star or die', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={handlers} />);
    const labels = Array.from(container.querySelectorAll('.custom-sheet__row-table-col-label')).map(el => el.textContent);
    expect(labels).toEqual(['', 'Nazwa', 'Ilość', '']);
    expect(container.querySelector('.custom-sheet__star-btn')).toBeNull();
    expect(container.querySelector('.custom-sheet__roll-btn')).toBeNull();
  });
});

describe('data_table — details panel', () => {
  it('toggles the description open and closed', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina', desc: '10 m\nkonopna' })} onChange={handlers} />);
    expect(container.querySelector('.custom-sheet__row-table-details')).toBeNull();

    fireEvent.click(screen.getByTitle('Show details'));
    expect(container.querySelector('.custom-sheet__row-table-detail-text').textContent).toBe('10 m\nkonopna');

    fireEvent.click(screen.getByTitle('Hide details'));
    expect(container.querySelector('.custom-sheet__row-table-details')).toBeNull();
  });

  // The panel must live inside the row element: as a sibling it would be counted by the zebra's
  // :nth-child parity and flip every row after it.
  it('renders the panel inside the row element', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina', desc: 'x' })} onChange={handlers} />);
    fireEvent.click(screen.getByTitle('Show details'));
    const panel = container.querySelector('.custom-sheet__row-table-details');
    expect(panel.parentElement.classList.contains('custom-sheet__row-table-row')).toBe(true);
  });

  it('hides the expander when the row has no description, but keeps its track', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={handlers} />);
    expect(screen.queryByTitle('Show details')).toBeNull();
    const row = container.querySelector('.custom-sheet__row-table-row');
    expect(row.firstElementChild.classList.contains('custom-sheet__row-table-expander')).toBe(true);
  });

  it('opens the panel as a textarea while editing, and restores the closed state after', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina', desc: 'x' })} onChange={handlers} />);
    fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
    expect(container.querySelector('textarea.custom-sheet__row-table-detail-input').value).toBe('x');

    fireEvent.click(container.querySelector('.custom-sheet__row-table-save'));
    expect(container.querySelector('.custom-sheet__row-table-details')).toBeNull();
  });

  it('writes the description through onChange.tableCell', () => {
    const tableCell = jest.fn();
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={{ ...handlers, tableCell }} />);
    fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
    fireEvent.change(container.querySelector('textarea.custom-sheet__row-table-detail-input'), { target: { value: 'nowy' } });
    expect(tableCell).toHaveBeenCalledWith('inv', 'r1', 'desc', 'nowy');
  });
});

describe('data_table — GM rows', () => {
  const preset = { id: 'p1', cells: { name: 'Plecak', desc: 'Skórzany' }, alwaysOn: true };

  it('shows an always-on row read-only with a lock, still expandable', () => {
    const { container } = render(<CustomSheetBody sections={dataSections({ presetRows: [preset] })} onChange={handlers} />);
    const row = container.querySelector('.custom-sheet__row-table-row--preset');
    expect(row.querySelector('.custom-sheet__row-table-lock')).not.toBeNull();
    expect(row.querySelector('.custom-sheet__row-table-edit')).toBeNull();
    fireEvent.click(screen.getByTitle('Show details'));
    expect(container.querySelector('.custom-sheet__row-table-detail-text').textContent).toBe('Skórzany');
  });

  it('offers catalog rows in the footer and copies the picked one', () => {
    const tableAddFromPreset = jest.fn();
    const catalog = { id: 'p2', cells: { name: 'Lina' }, alwaysOn: false };
    const { container } = render(
      <CustomSheetBody sections={dataSections({ presetRows: [catalog] })} onChange={{ ...handlers, tableAddFromPreset }} />
    );
    fireEvent.change(container.querySelector('.custom-sheet__row-table-preset-picker'), { target: { value: 'p2' } });
    expect(tableAddFromPreset).toHaveBeenCalledWith('inv', catalog);
  });
});

describe('data_table — a newly added row opens in edit mode', () => {
  function Harness() {
    const [tables, setTables] = useState({ inv: [] });
    const h = {
      ...handlers,
      tableAdd: (fieldKey) => {
        setTables(prev => ({ ...prev, [fieldKey]: [...(prev[fieldKey] || []), { id: 'r_new', cells: {} }] }));
        return 'r_new';
      },
    };
    return <CustomSheetBody sections={dataSections()} values={{ tables }} onChange={h} />;
  }

  it('renders inputs right after "+ Add row"', () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText('+ Add row'));
    expect(container.querySelector('.custom-sheet__row-table-cell-input')).not.toBeNull();
  });
});

describe('data_table — creator', () => {
  it('renders the GM row and no footer without handlers', () => {
    const preset = { id: 'p1', cells: { name: 'Plecak' }, alwaysOn: true };
    const { container } = render(<CustomSheetBody sections={dataSections({ presetRows: [preset] })} showAffordances />);
    expect(container.querySelector('.custom-sheet__row-table-row--preset')).not.toBeNull();
    expect(container.querySelector('.custom-sheet__row-table-add-row')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.dataTable`
Expected: FAIL — no `.custom-sheet__row-table` rendered (unknown field type).

- [ ] **Step 3: Add the i18n keys**

In `src/locales/en/translation.json`, inside `customSheet`, add:

```json
"row": "Row",
"addRow": "Add row",
"addRowFromList": "Add from list",
"editRow": "Edit row",
"saveRow": "Done",
"removeRow": "Remove row",
"rowPresetLocked": "GM row — always on the sheet, read-only",
"expandRow": "Show details",
"collapseRow": "Hide details"
```

In `src/locales/pl/translation.json`, inside `customSheet`:

```json
"row": "Wiersz",
"addRow": "Dodaj wiersz",
"addRowFromList": "Dodaj z listy",
"editRow": "Edytuj wiersz",
"saveRow": "Gotowe",
"removeRow": "Usuń wiersz",
"rowPresetLocked": "Wiersz MG — zawsze na karcie, tylko do odczytu",
"expandRow": "Pokaż szczegóły",
"collapseRow": "Ukryj szczegóły"
```

- [ ] **Step 4: Create `fields/DataTable.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import RowTable from './RowTable';

// The data_table field: the row-table core with no slots — GM columns, player rows, GM rows — for
// anything a character carries that is not rolled (equipment, contacts, notes by entry).
function DataTable({ field, rows, onChange, editingPath, setEditingPath, showTooltip, hideTooltip }) {
  const { t } = useTranslation();

  return (
    <div className="custom-sheet__field custom-sheet__field--data-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      <RowTable
        columns={field.columns || []}
        presets={field.presetRows || []}
        rows={rows}
        labels={{
          add:         t('customSheet.addRow'),
          addFromList: t('customSheet.addRowFromList'),
          edit:        t('customSheet.editRow'),
          save:        t('customSheet.saveRow'),
          remove:      t('customSheet.removeRow'),
          locked:      t('customSheet.rowPresetLocked'),
          rowFallback: field.label || t('customSheet.row'),
        }}
        onAdd={onChange ? () => onChange.tableAdd(field.key) : null}
        onAddFromPreset={onChange ? preset => onChange.tableAddFromPreset(field.key, preset) : null}
        onCell={onChange ? (rowId, colKey, val) => onChange.tableCell(field.key, rowId, colKey, val) : null}
        onRemove={onChange ? rowId => onChange.tableRemove(field.key, rowId) : null}
        editingPath={editingPath}
        setEditingPath={setEditingPath}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
      />
    </div>
  );
}

export default DataTable;
```

- [ ] **Step 5: Wire it into `CustomSheetBody.jsx`**

1. Import: `import DataTable from './fields/DataTable';` next to `WeaponsTable`.
2. Header comment: extend the `onChange` line with `tableAdd, tableAddFromPreset, tableCell, tableRemove`.
3. After `const weapons  = values.weapons    || {};` add `const tables   = values.tables     || {};`.
4. After the `case 'weapons_table': { … }` block add:

```jsx
      case 'data_table':
        return (
          <DataTable
            key={field.key}
            field={field}
            rows={tables[field.key] || []}
            onChange={onChange}
            editingPath={editingPath}
            setEditingPath={setEditingPath}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
        );
```

- [ ] **Step 6: Add the CSS**

In `src/style.css`, extend the overflow rule at the "A skill or weapons list has fixed minimum column widths" comment to also list `.custom-sheet__field--data-table,` (before `.custom-sheet__field--skill-tree`).

After the `.custom-sheet__row-table-preset-picker:focus` rule, add:

```css
/* data_table long_text columns: an expander at the start of the row and a details panel under it.
   The panel is the row's own last child spanning every track, never a sibling of the row — the
   zebra above counts sibling parity. */
.custom-sheet__row-table-expander {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: #7a5c42;
}

button.custom-sheet__row-table-expander {
    cursor: pointer;
}

button.custom-sheet__row-table-expander:hover {
    background: rgba(122, 92, 66, 0.15);
}

.custom-sheet__row-table-details {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 4px 6px 30px;
}

.custom-sheet__row-table-detail-label {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    color: #7a5c42;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.custom-sheet__row-table-detail-text {
    font-size: 0.9rem;
    color: #3a2f1f;
    white-space: pre-wrap;
    word-break: break-word;
}

.custom-sheet__row-table-row--preset .custom-sheet__row-table-detail-text {
    color: #6b5a45;
}

.custom-sheet__row-table-row .custom-sheet__row-table-detail-input {
    width: 100%;
    box-sizing: border-box;
    min-height: 60px;
    resize: vertical;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 4px;
    padding: 4px 6px;
    color: #3a2f1f;
    font-size: 0.9rem;
    font-family: inherit;
}

.custom-sheet__row-table-row .custom-sheet__row-table-detail-input:focus {
    outline: none;
    border-color: #7a5c42;
}
```

- [ ] **Step 7: Run the sheet test**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS (new file and all weapons/domShape tests).

- [ ] **Step 8: Write the failing CharacterSheet test**

Create `CharacterSheet.dataTable.test.jsx`:

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container, testing-library/no-unnecessary-act, import/first */
import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import '../../i18n';

jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = {
  name: 'Mój system',
  sections: [{ id: 's', fields: [{
    key: 'inv', type: 'data_table', label: 'Ekwipunek',
    columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
    presetRows: [{ id: 'p1', cells: { name: 'Lina' }, alwaysOn: false }],
  }] }],
};

const renderSheet = (stats = {}) => render(
  <CustomCharacterSheet
    character={{ id: 'c1', name: 'B', stats }}
    onClose={() => {}}
    onCharacterUpdate={() => {}}
    gameId="g1"
    token="t"
    game={{ customSystemTemplate: template }}
    isStandalone
  />
);

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
});
afterEach(() => jest.useRealTimers());

const lastBody = () => JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);

test('adding a row and typing saves it under stats.tables', async () => {
  const { container } = renderSheet();
  fireEvent.click(screen.getByText('+ Add row'));
  fireEvent.change(container.querySelector('.custom-sheet__row-table-cell-input'), { target: { value: 'Plecak' } });
  await act(async () => { jest.advanceTimersByTime(800); });

  const rows = lastBody().stats.tables.inv;
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toMatch(/^r_/);
  expect(rows[0].cells).toEqual({ name: 'Plecak' });
});

test('a catalog pick is copied as a snapshot of its cells', async () => {
  const { container } = renderSheet();
  fireEvent.change(container.querySelector('.custom-sheet__row-table-preset-picker'), { target: { value: 'p1' } });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(lastBody().stats.tables.inv[0].cells).toEqual({ name: 'Lina' });
});

test('removing a row drops it from stats.tables', async () => {
  const { container } = renderSheet({ tables: { inv: [{ id: 'r_1', cells: { name: 'X' } }] } });
  fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
  fireEvent.click(container.querySelector('.custom-sheet__row-table-remove'));
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(lastBody().stats.tables.inv).toEqual([]);
});
```

- [ ] **Step 9: Run to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CharacterSheet.dataTable`
Expected: FAIL — `onChange.tableAdd is not a function`.

- [ ] **Step 10: Implement storage in `CharacterSheet.jsx`**

1. In both `useState({...})` initialiser and the re-sync `setEdited({...})`, after the `weapons:` line add `tables: stats.tables || {},` / `tables: s.tables || {},` (aligned like neighbours).
2. In `saveCharacter`'s `stats` object, after `weapons:` add `tables: currentEdited.tables,`.
3. Replace the block from `// ---------- weapons_table handlers ----------` through `updateWeaponDamage` (up to, not including, `toggleWeaponFavorite`'s comment) with:

```js
  // ---------- row tables (weapons_table, data_table) ----------
  // Both store player rows as edited[storeKey][fieldKey] = [{ id, cells, … }]. The helpers below
  // own that shape; the per-table handlers only say which store and what a new row looks like.

  const genRowId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const withRows = (base, storeKey, fieldKey, rows) =>
    ({ ...base, [storeKey]: { ...base[storeKey], [fieldKey]: rows } });

  const commitEdited = (ne) => {
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const rowsOf = (storeKey, fieldKey) => edited[storeKey][fieldKey] || [];

  // Returns the new row's id so the table can open it straight into edit mode.
  const addRow = (storeKey, fieldKey, row) => {
    commitEdited(withRows(edited, storeKey, fieldKey, [...rowsOf(storeKey, fieldKey), row]));
    return row.id;
  };

  const mapRow = (storeKey, fieldKey, rowId, updater) =>
    commitEdited(withRows(edited, storeKey, fieldKey, rowsOf(storeKey, fieldKey).map(r => (r.id === rowId ? updater(r) : r))));

  const removeRow = (storeKey, fieldKey, rowId, extra = {}) =>
    commitEdited({ ...withRows(edited, storeKey, fieldKey, rowsOf(storeKey, fieldKey).filter(r => r.id !== rowId)), ...extra });

  const setCell = (colKey, value) => r => ({ ...r, cells: { ...r.cells, [colKey]: value } });

  // weapons_table. A catalog preset is copied (snapshot — later GM edits to the catalog do not
  // touch the copy; the player owns it and may edit/remove it).
  const addWeaponRow = (fieldKey) => addRow('weapons', fieldKey, { id: genRowId('w'), cells: {}, damage: {} });
  const addWeaponFromPreset = (fieldKey, preset) => addRow('weapons', fieldKey, {
    id: genRowId('w'),
    cells: { ...(preset.cells || {}) },
    damage: { ...(preset.damage || {}) },
  });
  // Drop the removed row from favorites too, so CharacterDetails doesn't keep a dangling id.
  const removeWeaponRow = (fieldKey, rowId) => removeRow('weapons', fieldKey, rowId, {
    favoriteWeapons: (edited.favoriteWeapons || []).filter(id => id !== rowId),
  });
  const updateWeaponCell = (fieldKey, rowId, colKey, value) => mapRow('weapons', fieldKey, rowId, setCell(colKey, value));
  const updateWeaponDamage = (fieldKey, rowId, blockId, value) =>
    mapRow('weapons', fieldKey, rowId, r => ({ ...r, damage: { ...r.damage, [blockId]: Number(value) || 0 } }));

  // data_table
  const addTableRow = (fieldKey) => addRow('tables', fieldKey, { id: genRowId('r'), cells: {} });
  const addTableRowFromPreset = (fieldKey, preset) =>
    addRow('tables', fieldKey, { id: genRowId('r'), cells: { ...(preset.cells || {}) } });
  const removeTableRow = (fieldKey, rowId) => removeRow('tables', fieldKey, rowId);
  const updateTableCell = (fieldKey, rowId, colKey, value) => mapRow('tables', fieldKey, rowId, setCell(colKey, value));
```

4. In the `onChange={{ … }}` object passed to `CustomSheetBody`, after `weaponFavorite` add:

```js
      tableAdd:           (fieldKey)                     => addTableRow(fieldKey),
      tableAddFromPreset: (fieldKey, preset)             => addTableRowFromPreset(fieldKey, preset),
      tableCell:          (fieldKey, rowId, colKey, val) => updateTableCell(fieldKey, rowId, colKey, val),
      tableRemove:        (fieldKey, rowId)              => removeTableRow(fieldKey, rowId),
```

5. In `index.js` stats normalisation, after `favoriteWeapons:` add `tables: s.tables || {},` (aligned).

- [ ] **Step 11: Run all custom-system tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='systems/custom'`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git commit -m "feat: PLAYRPG-269 data_table on the character sheet"
```

---

### Task 6: Creator — extract generic column and preset editors

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/OptionsEditor.jsx`
- Create: `warhammer-battle-helper-front/src/components/creator/TableColumnsEditor.jsx`
- Create: `warhammer-battle-helper-front/src/components/creator/TablePresetsEditor.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (remove `OptionsEditor` `:228-271`, `updateWeaponColumns`+`WeaponColumnsEditor` `:330-440`, `WeaponPresetsEditor` `:601-700`; update usages `:1018-1095`)
- Rename: `WeaponColumnsEditor.test.jsx` → `TableColumnsEditor.test.jsx`
- Modify: `TemplateBuilder.weaponColumns.test.jsx` (import only)
- Modify: `src/style.css` (add `.creator__table-preset-textarea`)
- Modify: `src/locales/{en,pl}/translation.json` (`creator`)

**Interfaces:**
- Consumes: `CellInput` (Task 4), `weaponSkillColumn` (`systems/custom/weaponLayout`).
- Produces:
  - `OptionsEditor({ label, options, onChange })` default export
  - `TableColumnsEditor({ columns, onChange, columnTypes, allowSkillColumn = false })` default export; named `updateTableColumns(cols, index, patch)`
  - `TablePresetsEditor({ columns, presets, onChange, skillOptions = [], icon, labels: { title, hint, noColumns, add }, renderPresetExtra = null })` default export; `renderPresetExtra(preset, patch) → node`, `patch(obj)` merges into that preset

- [ ] **Step 1: Move and adapt the column-editor test (failing)**

```bash
cd warhammer-battle-helper-front/src/components/creator
git mv WeaponColumnsEditor.test.jsx TableColumnsEditor.test.jsx
```

In `TableColumnsEditor.test.jsx`:
- Replace `import { WeaponColumnsEditor } from './TemplateBuilder';` with `import TableColumnsEditor from './TableColumnsEditor';`
- Delete the `jest.mock('axios', …)` block and its comment (the new module does not import TemplateBuilder).
- Replace every `<WeaponColumnsEditor` with `<TableColumnsEditor columnTypes={WEAPON_TYPES} allowSkillColumn` and `describe('WeaponColumnsEditor'` with `describe('TableColumnsEditor — weapons'`.
- Add after the imports: `const WEAPON_TYPES = ['text', 'number', 'select'];`
- Append:

```jsx
describe('TableColumnsEditor — data table', () => {
  const DATA_TYPES = ['text', 'number', 'select', 'long_text'];
  const selectCol = [{ key: 'a', label: 'Typ', type: 'select', options: [], optionsFromSkills: false }];

  test('offers long_text only when the caller lists it', () => {
    const { unmount } = render(<TableColumnsEditor columns={selectCol} onChange={() => {}} columnTypes={DATA_TYPES} />);
    expect(screen.getByRole('option', { name: 'Long text' })).toBeInTheDocument();
    unmount();
    render(<TableColumnsEditor columns={selectCol} onChange={() => {}} columnTypes={WEAPON_TYPES} allowSkillColumn />);
    expect(screen.queryByRole('option', { name: 'Long text' })).not.toBeInTheDocument();
  });

  test('has no "options from skills" switch without allowSkillColumn', () => {
    render(<TableColumnsEditor columns={selectCol} onChange={() => {}} columnTypes={DATA_TYPES} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Options from skills')).not.toBeInTheDocument();
  });
});
```

In `TemplateBuilder.weaponColumns.test.jsx` replace `import { updateWeaponColumns, weaponThresholdHint } from './TemplateBuilder';` with:

```js
import { weaponThresholdHint } from './TemplateBuilder';
import { updateTableColumns as updateWeaponColumns } from './TableColumnsEditor';
```

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='TableColumnsEditor|TemplateBuilder.weaponColumns'`
Expected: FAIL — `Cannot find module './TableColumnsEditor'`.

- [ ] **Step 2: Update creator i18n keys**

In `src/locales/en/translation.json` `creator`: rename keys (same values) `weaponColumns`→`tableColumns`, `weaponColumnLabel`→`tableColumnLabel`, `weaponColTypeText`→`tableColTypeText`, `weaponColTypeNumber`→`tableColTypeNumber`, `weaponColTypeSelect`→`tableColTypeSelect`, `weaponAddColumn`→`tableAddColumn`, `weaponPresetAlwaysOn`→`tablePresetAlwaysOn`; add `"tableColTypeLongText": "Long text"`. Same renames in `pl` plus `"tableColTypeLongText": "Tekst długi"`.

Verify no reader is left: `grep -rnE "creator\.(weaponColumns|weaponColumnLabel|weaponColType|weaponAddColumn|weaponPresetAlwaysOn)" warhammer-battle-helper-front/src` — after Step 6 it must print nothing.

- [ ] **Step 3: Create `OptionsEditor.jsx`**

Move `OptionsEditor` from `TemplateBuilder.jsx` verbatim (including its comment, updated to "for "select" fields and table select-columns"), as a module:

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

// Plain-string options editor for "select" fields and table select-columns. The stored value IS
// the label (no stable id needed — a select stores the chosen text verbatim).
function OptionsEditor({ label, options, onChange }) {
  /* body moved verbatim from TemplateBuilder.jsx:232-271 */
}

export default OptionsEditor;
```

(The body is the existing function body unchanged — copy lines `const { t } = …` through the final `);` of the JSX.) Check TemplateBuilder's import source of `Typography`: it is `@mui/material`.

- [ ] **Step 4: Create `TableColumnsEditor.jsx`**

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Switch, FormControlLabel } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { weaponSkillColumn } from '../../systems/custom/weaponLayout';
import OptionsEditor from './OptionsEditor';

const TYPE_LABEL_KEYS = {
  text:      'creator.tableColTypeText',
  number:    'creator.tableColTypeNumber',
  select:    'creator.tableColTypeSelect',
  long_text: 'creator.tableColTypeLongText',
};

// updateTableColumns patches one column while keeping the invariant that at most one column
// supplies skills. Two columns would not be an error the GM could see — the backend simply rolls
// with the first one in array order (weapon.go:73) — so the creator settles it at edit time
// instead. A column leaving the "select" type also drops the flag: keeping it would leave data
// only the creator honours, while the backend already ignores it.
export function updateTableColumns(cols, index, patch) {
  /* body moved verbatim from updateWeaponColumns (TemplateBuilder.jsx:336-348) */
}

// Editor for the GM-defined columns of a weapons_table or data_table. Each column has a stable
// key, a label, a type from `columnTypes`, and — for select columns — a manual options list or,
// with allowSkillColumn (weapons only), "options from the character's skills".
function TableColumnsEditor({ columns, onChange, columnTypes, allowSkillColumn = false }) {
  const { t } = useTranslation();
  const cols = columns || [];
  const [movedFrom, setMovedFrom] = useState(null);
  const skillCol = allowSkillColumn ? weaponSkillColumn({ columns: cols }) : null;

  // commit is the one place that decides whether an edit counts as a hand-over: the column that
  // used to hold the flag differs from the one that holds it now. update, add, remove and move all
  // go through it, so no edit made here can leave a stale notice behind. The popup switching to a
  // different field is not handled here: PropertyPanel is keyed by the edited path, so that switch
  // unmounts this editor and the notice goes with it.
  const commit = (next) => {
    if (allowSkillColumn) {
      const after = weaponSkillColumn({ columns: next });
      // Only an actual hand-over is announced. A column that merely loses the role (its type
      // changed) leaves the table with none, which the roll-config warning already reports.
      const handover = skillCol && after && skillCol.key !== after.key;
      setMovedFrom(handover ? skillCol.label : null);
    }
    onChange(next);
  };

  const update = (i, patch) => commit(updateTableColumns(cols, i, patch));
  const remove = (i) => commit(cols.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = () => commit([...cols, { key: `col_${Date.now()}`, label: '', type: 'text', options: [], optionsFromSkills: false }]);

  return (
    <div className="creator__table-columns">
      <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t('creator.tableColumns')}
      </Typography>
      {movedFrom && (
        <div className="creator__table-col-moved">
          {t('creator.weaponSkillColumnMoved', { column: movedFrom })}
        </div>
      )}
      {cols.map((col, i) => (
        <div key={col.key} className="creator__table-col">
          <div className="creator__table-col-head">
            <input
              className="creator__option-input"
              value={col.label}
              placeholder={t('creator.tableColumnLabel')}
              onChange={e => update(i, { label: e.target.value })}
            />
            <select className="creator__option-attr-select" value={col.type} onChange={e => update(i, { type: e.target.value })}>
              {columnTypes.map(type => <option key={type} value={type}>{t(TYPE_LABEL_KEYS[type])}</option>)}
            </select>
            {skillCol && skillCol.key === col.key && (
              <span className="creator__table-col-badge">{t('creator.weaponSkillColumnBadge')}</span>
            )}
            <button className="creator__option-del" onClick={() => move(i, -1)} disabled={i === 0} title={t('creator.sectionMoveUp')}><ArrowUpwardIcon style={{ fontSize: 13 }} /></button>
            <button className="creator__option-del" onClick={() => move(i, +1)} disabled={i === cols.length - 1} title={t('creator.sectionMoveDown')}><ArrowDownwardIcon style={{ fontSize: 13 }} /></button>
            <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}><DeleteIcon style={{ fontSize: 13 }} /></button>
          </div>
          {col.type === 'select' && (
            <div className="creator__table-col-select">
              {allowSkillColumn && (
                <FormControlLabel
                  control={<Switch size="small" checked={!!col.optionsFromSkills} onChange={e => update(i, { optionsFromSkills: e.target.checked })} />}
                  label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.weaponColFromSkills')}</Typography>}
                  sx={{ display: 'block' }}
                />
              )}
              {!(allowSkillColumn && col.optionsFromSkills) && (
                <OptionsEditor label={t('creator.selectOptions')} options={col.options || []} onChange={opts => update(i, { options: opts })} />
              )}
            </div>
          )}
        </div>
      ))}
      <button className="creator__tree-add-root" onClick={add}>
        <AddIcon style={{ fontSize: 14 }} /> {t('creator.tableAddColumn')}
      </button>
    </div>
  );
}

export default TableColumnsEditor;
```

- [ ] **Step 5: Create `TablePresetsEditor.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Switch, FormControlLabel } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { genId } from '../../utils/surrogateKeys';
import { CellInput } from '../../systems/custom/fields/RowTableCell';

const PRESET_INPUT_CLASSES = {
  input:    'creator__table-preset-input',
  select:   'creator__table-preset-select',
  textarea: 'creator__table-preset-textarea',
};

// GM editor for a table's preset rows. Each preset is a "row template": the GM fills the same
// cells a player would, plus an "always on the sheet" switch. Always-on rows are shown read-only on
// every sheet (a GM edit propagates); the rest form a catalog the player can copy into their own
// editable rows. Whatever else a table's preset carries (a weapon's damage) comes in through
// renderPresetExtra, which receives a patch function for that one preset.
function TablePresetsEditor({ columns, presets, onChange, skillOptions = [], icon, labels, renderPresetExtra = null }) {
  const { t } = useTranslation();
  const cols = columns || [];

  const update = (i, patch) => onChange(presets.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const updateCell = (i, colKey, val) => update(i, { cells: { ...(presets[i].cells || {}), [colKey]: val } });
  const remove = (i) => onChange(presets.filter((_, j) => j !== i));
  const add = () => onChange([...presets, { id: genId('preset'), cells: {}, alwaysOn: false }]);

  return (
    <div className="creator__table-presets-editor">
      <div className="creator__props-subhead">
        {icon}
        {labels.title}
      </div>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontStyle: 'italic' }}>
        {labels.hint}
      </Typography>

      {cols.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', fontStyle: 'italic', py: 2 }}>
          {labels.noColumns}
        </Typography>
      ) : (
        <div className="creator__table-presets">
          {presets.map((preset, i) => (
            <div key={preset.id} className="creator__table-preset">
              <div className="creator__table-preset-fields">
                {cols.map(c => (
                  <label key={c.key} className="creator__table-preset-field">
                    <span className="creator__table-preset-field-label">{c.label}</span>
                    <CellInput
                      column={c}
                      value={(preset.cells && preset.cells[c.key]) || ''}
                      skillOptions={skillOptions}
                      onChange={val => updateCell(i, c.key, val)}
                      classes={PRESET_INPUT_CLASSES}
                    />
                  </label>
                ))}
              </div>

              {renderPresetExtra && renderPresetExtra(preset, patch => update(i, patch))}

              <div className="creator__table-preset-actions">
                <FormControlLabel
                  control={<Switch size="small" checked={!!preset.alwaysOn} onChange={e => update(i, { alwaysOn: e.target.checked })} />}
                  label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.tablePresetAlwaysOn')}</Typography>}
                />
                <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}>
                  <DeleteIcon style={{ fontSize: 14 }} />
                </button>
              </div>
            </div>
          ))}
          <button className="creator__tree-add-root" onClick={add}>
            <AddIcon style={{ fontSize: 14 }} /> {labels.add}
          </button>
        </div>
      )}
    </div>
  );
}

export default TablePresetsEditor;
```

Note: a new weapon preset no longer starts with `damage: {}` — the damage patch already defaults `preset.damage || {}`, and the backend field is `omitempty`.

- [ ] **Step 6: Rewire `TemplateBuilder.jsx`**

1. Delete `OptionsEditor` (section header comment included), `updateWeaponColumns`, `WeaponColumnsEditor`, `WeaponPresetsEditor` (with their section header comments).
2. Add imports:

```js
import OptionsEditor from './OptionsEditor';
import TableColumnsEditor from './TableColumnsEditor';
import TablePresetsEditor from './TablePresetsEditor';
```

3. Add near `FIELD_TYPES`:

```js
const WEAPON_COLUMN_TYPES = ['text', 'number', 'select'];
```

4. In `PropertyPanel`, replace `<WeaponColumnsEditor columns={field.columns || []} onChange={cols => up({ columns: cols })} />` with:

```jsx
              <TableColumnsEditor
                columns={field.columns || []}
                onChange={cols => up({ columns: cols })}
                columnTypes={WEAPON_COLUMN_TYPES}
                allowSkillColumn
              />
```

and replace the `<WeaponPresetsEditor … />` element with:

```jsx
              <TablePresetsEditor
                columns={field.columns || []}
                presets={field.presetWeapons || []}
                onChange={presetWeapons => up({ presetWeapons })}
                skillOptions={weaponSkillColumn(field) ? collectSkillOptions(sections, {}) : []}
                icon={<GavelIcon fontSize="small" />}
                labels={{
                  title:     t('creator.weaponPresetsTitle'),
                  hint:      t('creator.weaponPresetsHint'),
                  noColumns: t('creator.weaponPresetsNoColumns'),
                  add:       t('creator.weaponPresetAdd'),
                }}
                renderPresetExtra={(field.damageFormula || []).length > 0 ? (preset, patch) => (
                  <div className="creator__table-preset-damage">
                    <span className="creator__table-preset-field-label">{t('customSheet.damage')}</span>
                    <div className="custom-sheet__weapon-damage">
                      {renderDamageFormula(field.damageFormula, preset, field.key, {
                        weaponDamage: (_fk, _rowId, blockId, val) =>
                          patch({ damage: { ...(preset.damage || {}), [blockId]: Number(val) || 0 } }),
                      }, false, t)}
                    </div>
                  </div>
                ) : null}
              />
```

- [ ] **Step 7: Add the creator textarea style**

In `src/style.css`, extend the `.creator__table-preset-input, .creator__table-preset-select {` rule's selector list with `.creator__table-preset-textarea` (and the same in its `:focus` rule), then add:

```css
.creator__table-preset-textarea {
    width: 100%;
    min-height: 56px;
    resize: vertical;
    font-family: inherit;
}
```

- [ ] **Step 8: Run creator tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='components/creator'`
Expected: PASS. Then `grep -rnE "WeaponColumnsEditor|WeaponPresetsEditor|updateWeaponColumns|creator\.(weaponColumns|weaponColumnLabel|weaponColType|weaponAddColumn|weaponPresetAlwaysOn)" warhammer-battle-helper-front/src` → only the aliased import in `TemplateBuilder.weaponColumns.test.jsx`.

- [ ] **Step 9: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git commit -m "refactor: PLAYRPG-269 generic table column and preset editors out of TemplateBuilder"
```

---

### Task 7: Creator — data_table field type

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`FIELD_TYPES` `:110-121`, `PALETTE_GROUPS` `:130`, `makeDefaultField` `:158`, PropertyPanel content group `:1018`)
- Modify: `warhammer-battle-helper-front/src/components/creator/EditablePlaceholder.jsx:46`
- Modify: `src/locales/{en,pl}/translation.json` (`creator`, `creator.fieldType`)
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.dataTable.test.jsx`

**Interfaces:**
- Consumes: `TableColumnsEditor`, `TablePresetsEditor` (Task 6); `DataTable` via `CustomSheetBody` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `TemplateBuilder.dataTable.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { makeDefaultField, PropertyPanel } from './TemplateBuilder';
import EditablePlaceholder from './EditablePlaceholder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const t = i18n.t.bind(i18n);

test('a new data table starts with no columns, no presets and no roll', () => {
  const f = makeDefaultField('data_table', t);
  expect(f).toMatchObject({ type: 'data_table', label: 'Data table', columns: [], presetRows: [], rollable: false });
  expect(f.key).toMatch(/^data_table_/);
});

const renderPanel = (field) => render(
  <PropertyPanel field={field} onChange={() => {}} onDelete={() => {}} numberFields={[]} numericFields={[]} sections={[]} />
);

test('the property panel offers long text columns and preset rows, and no roll settings', () => {
  const field = {
    ...makeDefaultField('data_table', t),
    columns: [{ key: 'c1', label: 'Nazwa', type: 'text', options: [], optionsFromSkills: false }],
  };
  renderPanel(field);
  expect(screen.getByRole('option', { name: 'Long text' })).toBeInTheDocument();
  expect(screen.getByText('Preset rows')).toBeInTheDocument();
  expect(screen.queryByText('Attack roll')).not.toBeInTheDocument();
  expect(screen.queryByText('Options from skills')).not.toBeInTheDocument();
});

test('a data table without columns shows the row placeholder in the creator', () => {
  const { container } = render(<EditablePlaceholder node={{ key: 'd', type: 'data_table', columns: [] }} />);
  expect(container.querySelector('.creator__ph--row')).not.toBeNull();
});
```

(`EditablePlaceholder` takes a single `node` prop and is a default export — verified.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder.dataTable`
Expected: FAIL — `label` undefined / no "Long text" option.

- [ ] **Step 3: Add i18n**

`en` `creator.fieldType`: `"dataTable": "Data table"`, `"dataTableDesc": "Player-built table with your own columns, e.g. equipment"`.
`pl` `creator.fieldType`: `"dataTable": "Tabela danych"`, `"dataTableDesc": "Tworzona przez gracza tabela z własnymi kolumnami, np. ekwipunek"`.

`en` `creator`: `"dataTablePresetsTitle": "Preset rows"`, `"dataTablePresetsHint": "Define rows the GM provides. \"Always on the sheet\" rows appear read-only on every character; the rest form a list players can add from."`, `"dataTablePresetsNoColumns": "Add at least one column above before defining preset rows."`, `"dataTablePresetAdd": "Add preset row"`.
`pl` `creator`: `"dataTablePresetsTitle": "Predefiniowane wiersze"`, `"dataTablePresetsHint": "Zdefiniuj wiersze udostępniane przez MG. Wiersze „zawsze na karcie” pojawiają się u każdej postaci tylko do odczytu; pozostałe tworzą listę, z której gracze mogą dodawać."`, `"dataTablePresetsNoColumns": "Dodaj najpierw co najmniej jedną kolumnę powyżej, aby zdefiniować wiersze."`, `"dataTablePresetAdd": "Dodaj wiersz"`.

- [ ] **Step 4: Wire the type in `TemplateBuilder.jsx`**

1. Import `import ViewListIcon from '@mui/icons-material/ViewList';`.
2. `FIELD_TYPES`, after the `weapons_table` entry:

```js
  { type: 'data_table',    labelKey: 'creator.fieldType.dataTable',     icon: <ViewListIcon fontSize="small" />,    desc: 'creator.fieldType.dataTableDesc' },
```

3. `PALETTE_GROUPS` tables group: `types: ['skill_table', 'weapons_table', 'data_table', 'skill_tree']`.
4. `makeDefaultField`, after the `weapons_table` line:

```js
  if (type === 'data_table') return { ...base, columns: [], presetRows: [] };
```

5. Next to `WEAPON_COLUMN_TYPES` add `const DATA_TABLE_COLUMN_TYPES = ['text', 'number', 'select', 'long_text'];`.
6. PropertyPanel content group condition: `['select', 'skill_table', 'weapons_table', 'data_table', 'skill_tree'].includes(field.type)`. Inside the group, after the `weapons_table` block, add:

```jsx
          {field.type === 'data_table' && (
            <>
              <TableColumnsEditor
                columns={field.columns || []}
                onChange={cols => up({ columns: cols })}
                columnTypes={DATA_TABLE_COLUMN_TYPES}
              />
              <Divider sx={{ my: 1.5 }} />
              <TablePresetsEditor
                columns={field.columns || []}
                presets={field.presetRows || []}
                onChange={presetRows => up({ presetRows })}
                icon={<ViewListIcon fontSize="small" />}
                labels={{
                  title:     t('creator.dataTablePresetsTitle'),
                  hint:      t('creator.dataTablePresetsHint'),
                  noColumns: t('creator.dataTablePresetsNoColumns'),
                  add:       t('creator.dataTablePresetAdd'),
                }}
              />
            </>
          )}
```

The Display and Roll groups already exclude `data_table` (their type lists don't include it) — leave them.

- [ ] **Step 5: `EditablePlaceholder.jsx`**

Change `if (node.type === 'weapons_table' && (node.columns || []).length === 0) {` to:

```js
  if ((node.type === 'weapons_table' || node.type === 'data_table') && (node.columns || []).length === 0) {
```

- [ ] **Step 6: Run creator tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='components/creator'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git commit -m "feat: PLAYRPG-269 data_table field type in the template creator"
```

---

### Task 8: Full verification and docs

**Files:**
- Modify: `docs/architecture.md` (custom-system field types list, if it enumerates them)

- [ ] **Step 1: Full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: all PASS except the known `App.test.js` axios ESM baseline failure.

- [ ] **Step 2: Lint**

Run: `cd warhammer-battle-helper-front && npx eslint src/systems/custom src/components/creator`
Expected: no errors (unused imports in `TemplateBuilder.jsx` after the moves — `ArrowUpwardIcon`, `ArrowDownwardIcon`, etc. — must be removed if ESLint flags them).

- [ ] **Step 3: i18n parity**

Use the `i18n-sync` skill to diff en/pl keys. Expected: no missing keys either side; no orphan `creator.weaponCol*` / `creator.weaponColumns` / `creator.weaponAddColumn` / `creator.weaponPresetAlwaysOn`.

- [ ] **Step 4: Backend suite**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Expected: PASS.

- [ ] **Step 5: Docs**

`grep -n "weapons_table" docs/architecture.md`. If the file lists custom field types, add `data_table` with one line: "tabela z kolumnami GM-a i wierszami gracza (np. ekwipunek), bez rzutów; wiersze w `stats.tables[fieldKey]`, wspólny rdzeń `RowTable` z `weapons_table`". If it does not list them, skip.

- [ ] **Step 6: Commit (if docs changed)**

```bash
git add docs/architecture.md
git commit -m "docs: PLAYRPG-269 data_table in the architecture overview"
```
