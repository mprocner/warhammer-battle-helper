# PLAYRPG-235 Attribute Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nowy typ pola `attr_table` — tabela atrybutów w stylu Warhammera, której wiersze są pełnoprawnymi atrybutami w całym systemie, z jedną formułą rzutu dla wszystkich wierszy.

**Architecture:** Każdy wiersz tabeli jest rozwijany do „wirtualnego pola `attr`” w jednym miejscu na stronę: `flattenFields` w Go i `walkValueFields` w JS. Konsumenci wartości atrybutów (roller, seed, formuły, tokeny, karta skrócona) przechodzą na ten helper i nie wiedzą o istnieniu tabeli. Rendering i kreator widzą tabelę jako jedno pole. Formuła używa istniejącego bloku `attr_linked` jako „obecnego atrybutu”.

**Tech Stack:** Go + mongo-driver bson (backend), React + i18next + MUI icons (frontend), Jest/RTL przez CRA.

**Spec:** `docs/superpowers/specs/2026-10-12-PLAYRPG-235-attribute-table-design.md`

## Global Constraints

- Komentarze w kodzie ZAWSZE po angielsku.
- Wszystkie stringi UI przez `t('klucz')`; klucze w `en` i `pl` równolegle.
- Ikony tylko z `@mui/icons-material`. Tooltipy tylko przez `usePortalTooltip` (nigdy MUI `<Tooltip>`).
- Paleta karty: tekst `#3a2f1f`, inputy tło `#fff9f0`, ramki `#c4a882` / focus `#7a5c42`, akcenty `#c9975b`.
- Kreator renderuje prawdziwy `CustomSheetBody`; afordanse bez handlerów renderowane statycznie przez `showAffordances`.
- Id wiersza = klucz w `stats.Attributes`, mintowany `genId('attr')`, bez prefiksu klucza tabeli, nigdy z kropką.
- Brak backward compat — bez migracji.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Znany baseline fail: `App.test.js`.
- Testy backendu: `go test ./internal/systems/custom/...` z `warhammer-battle-helper-backend/`.
- Praca na branchu `PLAYRPG-235-attribute-table`.

---

### Task 1: Backend — model `AttrRow` + rozwinięcie w `flattenFields`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (struktura `AttrRow`, pole `FieldDef.AttrRows`, komentarz `Type`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:143-165` (`flattenFields` + nowe `expandAttrTable`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/attr_table_test.go` (nowy)

**Interfaces:**
- Produces: `models.AttrRow{ID, Label, Abbr string; Default, Min, Max *int; ShowOnShortCard bool}` (json: `id,label,abbr,default,min,max,showOnShortCard`); `FieldDef.AttrRows []AttrRow` (json `attrRows`); `expandAttrTable(field models.FieldDef) []models.FieldDef`; `flattenFields` zwraca wiersze jako `Type "attr"`.

- [ ] **Step 1: Write the failing test**

Create `internal/systems/custom/attr_table_test.go`:

```go
package custom

import (
	"strings"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

// attrTableTemplate is one attr_table with two rows. The table carries the shared roll config;
// rows carry only their own identity and limits.
func attrTableTemplate(cfg *models.RollConfig) *models.SystemTemplate {
	return seedTemplate(models.FieldDef{
		Key:         "fld_table",
		Type:        "attr_table",
		Label:       "Cechy",
		HasAdvances: true,
		Rollable:    cfg != nil,
		RollConfig:  cfg,
		AttrRows: []models.AttrRow{
			{ID: "attr_ws", Label: "Walka wręcz", Abbr: "WW", Default: intPtr(31)},
			{ID: "attr_s", Label: "Siła", Abbr: "S"},
		},
	})
}

func TestFlattenFields_ExpandsAttrTableRows(t *testing.T) {
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}}
	tmpl := attrTableTemplate(cfg)
	got := flattenFields(tmpl.Sections[0].Fields)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2 (one virtual attr per row, no table entry)", len(got))
	}
	ws := got[0]
	if ws.Key != "attr_ws" || ws.Type != "attr" || ws.Label != "Walka wręcz" || ws.Abbr != "WW" {
		t.Errorf("row identity not copied: %+v", ws)
	}
	if ws.Default == nil || *ws.Default != 31 {
		t.Errorf("row default not copied: %v", ws.Default)
	}
	if !ws.HasAdvances || !ws.Rollable || ws.RollConfig != cfg {
		t.Errorf("table-level settings not inherited: %+v", ws)
	}
}

func TestSeedDefaults_AttrTableRowSeedsBase(t *testing.T) {
	s := seedBlank(t, attrTableTemplate(nil))
	if av, ok := s.Attributes["attr_ws"]; !ok || av.Base != 31 {
		t.Errorf("Attributes[attr_ws] = %+v (present=%v), want Base 31", av, ok)
	}
	if _, ok := s.Attributes["attr_s"]; ok {
		t.Error("a row without Default must not be seeded")
	}
}

func TestRollWithTemplate_AttrTableRowRollsAgainstItself(t *testing.T) {
	tmpl := attrTableTemplate(&models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
	})
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_ws": {Base: 31, Advances: 5, Current: 36}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin(19).RollWithTemplate(raw, tmpl, "attr_ws", 0) // d100 -> 20
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if res.Roll != 20 || res.Target != 36 || res.Outcome != "regular_success" {
		t.Errorf("got roll=%d target=%d outcome=%q, want 20/36/regular_success", res.Roll, res.Target, res.Outcome)
	}
	if res.SkillName != "Walka wręcz" {
		t.Errorf("SkillName = %q, want the row label", res.SkillName)
	}
}

func TestRollWithTemplate_AttrTablePoolOfAttributeDice(t *testing.T) {
	tmpl := attrTableTemplate(&models.RollConfig{
		RollMode:             "dice_pool",
		Formula:              []models.FormulaBlock{{Type: "attr_linked"}, opBlock("d"), diceBlock("d6")},
		PoolSuccessThreshold: 5,
	})
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_s": {Base: 3, Current: 3}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin(4, 0, 5).RollWithTemplate(raw, tmpl, "attr_s", 0) // 5, 1, 6
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if got := poolRolls(res.PoolFormula); len(got) != 3 {
		t.Fatalf("rolled %d dice, want 3 (= attribute value)", len(got))
	}
	if res.PoolSuccesses != 2 {
		t.Errorf("successes = %d, want 2", res.PoolSuccesses)
	}
}

// Keeps the strings import honest until Task 2 adds breakdown assertions to this file.
var _ = strings.HasPrefix
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'AttrTable' -v`
Expected: FAIL — compile error `unknown field AttrRows in struct literal` / `undefined: models.AttrRow`.

- [ ] **Step 3: Add the model**

In `internal/models/SystemTemplate.go`, directly below `SkillOption` (line ~18):

```go
// AttrRow is one attribute of an "attr_table" field (PLAYRPG-235). Its ID is the attribute's
// key in Stats.Attributes: globally unique (genId), never a slug of the label and never prefixed
// with the table's key, so the "attr" / "dice_attr" blocks and SkillOption.Attr address a row
// exactly the way they address a standalone "attr" field.
type AttrRow struct {
	ID              string `bson:"id" json:"id"`
	Label           string `bson:"label" json:"label"`
	Abbr            string `bson:"abbr,omitempty" json:"abbr,omitempty"`
	Default         *int   `bson:"default,omitempty" json:"default,omitempty"`
	Min             *int   `bson:"min,omitempty" json:"min,omitempty"`
	Max             *int   `bson:"max,omitempty" json:"max,omitempty"`
	ShowOnShortCard bool   `bson:"showOnShortCard,omitempty" json:"showOnShortCard,omitempty"`
}
```

In `FieldDef`, extend the `Type` comment with `|"attr_table"` and add after the `Skills` line:

```go
	// AttrRows lists the attributes of an "attr_table". Table-level settings (HasAdvances,
	// AdvancesLabel, Step, Rollable, RollConfig) apply to every row; see expandAttrTable.
	AttrRows []AttrRow `bson:"attrRows,omitempty" json:"attrRows,omitempty"`
```

- [ ] **Step 4: Expand the table in `flattenFields`**

In `internal/systems/custom/plugin.go`, replace the `flattenFields` doc comment's first paragraph and its body:

```go
// flattenFields returns every leaf VALUE field of the given list, descending into nested
// sections and expanding each attr_table into one virtual "attr" field per row (see
// expandAttrTable). Section wrappers and the table itself are dropped: neither holds a value
// of its own, so every caller -- seeding, roll resolution, label lookup -- wants the leaves.
//
// The returned FieldDefs are COPIES, detached from the template's backing arrays: never take
// the address of one and never mutate one expecting the template to change. A caller that
// needs to write through to the stored field uses the pointer-returning variant instead --
// see findWeaponFieldInFields in weapon.go.
func flattenFields(fields []models.FieldDef) []models.FieldDef {
	out := make([]models.FieldDef, 0, len(fields))
	for _, field := range fields {
		switch field.Type {
		case "section":
			if field.Section != nil {
				out = append(out, flattenFields(field.Section.Fields)...)
			}
			continue
		case "attr_table":
			out = append(out, expandAttrTable(field)...)
			continue
		}
		out = append(out, field)
	}
	return out
}

// expandAttrTable turns each row of an attr_table into the "attr" field it behaves as: the
// row supplies identity and limits, the table supplies advances, step and the shared roll
// config. Because the result IS an attr field, the roller resolves a row through the same
// `field.Key == skillKey` branch as a standalone attribute, and RollWithTemplate then sets
// linkedAttr to the row's own key -- which is what makes the "attr_linked" block mean
// "the attribute being rolled". The front end mirrors this in utils/templateSections.js
// (expandAttrTable); change one and you must change the other.
func expandAttrTable(field models.FieldDef) []models.FieldDef {
	out := make([]models.FieldDef, 0, len(field.AttrRows))
	for _, row := range field.AttrRows {
		out = append(out, models.FieldDef{
			Key:             row.ID,
			Type:            "attr",
			Label:           row.Label,
			Abbr:            row.Abbr,
			Default:         row.Default,
			Min:             row.Min,
			Max:             row.Max,
			ShowOnShortCard: row.ShowOnShortCard,
			Step:            field.Step,
			HasAdvances:     field.HasAdvances,
			AdvancesLabel:   field.AdvancesLabel,
			Rollable:        field.Rollable,
			RollConfig:      field.RollConfig,
		})
	}
	return out
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/systems/custom/... ./internal/models/...`
Expected: PASS (all, including the four new tests).

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/systems/custom/plugin.go warhammer-battle-helper-backend/internal/systems/custom/attr_table_test.go
git commit -m "feat: PLAYRPG-235 attr_table rows resolve as attributes in the roller"
```

---

### Task 2: Backend — `attr_linked` podpisany skrótem atrybutu w rozpisce

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go:15-60` (`formulaEnv` + `blockValue`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go` (`rollFromFormula`, `evalFormula`, `rollFromFormulaDicePool`, `evalFormulaDicePool`, new `attrLabel`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/weapon.go:60` (damage `evalFormula` call)
- Modify: test call sites in `roller_test.go`, `formula_test.go` (mechanical: add `""` argument)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/attr_table_test.go`

**Interfaces:**
- Consumes: `flattenFields` expansion from Task 1.
- Produces: `attrLabel(template *models.SystemTemplate, key string) string`; widened signatures:
  - `func (p *Plugin) formulaEnv(stats *Stats, skillKey, linkedAttr, linkedLabel string, baseFromAttr bool) *formulaEnv`
  - `func (p *Plugin) evalFormula(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr, linkedLabel string, baseFromAttr bool) (...)`
  - `func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr, linkedLabel string, baseFromAttr bool, extraDice int) (...)`

- [ ] **Step 1: Write the failing tests**

Append to `attr_table_test.go` (and delete the `var _ = strings.HasPrefix` line):

```go
func TestRollWithTemplate_AttrLinkedBreakdownShowsAbbr(t *testing.T) {
	tmpl := attrTableTemplate(&models.RollConfig{
		Formula:     []models.FormulaBlock{{Type: "attr_linked"}, opBlock("+"), diceBlock("d10")},
		SuccessType: "raw",
	})
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_ws": {Base: 36, Current: 36}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin(2).RollWithTemplate(raw, tmpl, "attr_ws", 0) // d10 -> 3
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if !strings.HasPrefix(res.FormulaBreakdown, "WW+d10 = ") {
		t.Errorf("breakdown = %q, want it to start with the row abbr, not its opaque key", res.FormulaBreakdown)
	}
}

// The same label defect hit skills with an assigned attribute before attr_table existed.
func TestRollWithTemplate_SkillAttrLinkedBreakdownShowsAbbr(t *testing.T) {
	tmpl := seedTemplate(
		models.FieldDef{Key: "attr_str", Type: "attr", Label: "Siła", Abbr: "S"},
		models.FieldDef{
			Key: "fld_sk", Type: "skill_table", Rollable: true, AssignAttrToSkill: true,
			Skills:     []models.SkillOption{{ID: "opt_a", Label: "Atletyka", Attr: "attr_str"}},
			RollConfig: &models.RollConfig{Formula: []models.FormulaBlock{{Type: "attr_linked"}}, SuccessType: "raw"},
		},
	)
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_str": {Base: 8, Current: 8}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin().RollWithTemplate(raw, tmpl, "fld_sk.opt_a", 0)
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if !strings.HasPrefix(res.FormulaBreakdown, "S = ") {
		t.Errorf("breakdown = %q, want it to start with \"S = \"", res.FormulaBreakdown)
	}
}

func TestAttrLabel(t *testing.T) {
	tmpl := seedTemplate(
		models.FieldDef{Key: "attr_str", Type: "attr", Label: "Siła", Abbr: "S"},
		models.FieldDef{Key: "attr_int", Type: "attr", Label: "Inteligencja"},
		models.FieldDef{Key: "fld_t", Type: "attr_table", AttrRows: []models.AttrRow{{ID: "attr_ws", Label: "Walka", Abbr: "WW"}}},
	)
	cases := map[string]string{"attr_str": "S", "attr_int": "Inteligencja", "attr_ws": "WW", "attr_gone": "attr_gone", "": ""}
	for key, want := range cases {
		if got := attrLabel(tmpl, key); got != want {
			t.Errorf("attrLabel(%q) = %q, want %q", key, got, want)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/systems/custom/ -run 'AttrLinkedBreakdown|TestAttrLabel' -v`
Expected: FAIL — `undefined: attrLabel`.

- [ ] **Step 3: Add `attrLabel` to `roller.go`** (below `attrLookup`)

```go
// attrLabel names an attribute for the roll breakdown: its abbreviation, else its label, else
// the raw key (an attribute removed from the template still shows *something*). Keys are opaque
// ids (genId), so printing the key itself -- what the breakdown did before -- reads as noise.
func attrLabel(template *models.SystemTemplate, key string) string {
	if key == "" || template == nil {
		return key
	}
	for _, section := range template.Sections {
		for _, field := range flattenFields(section.Fields) {
			if field.Type != "attr" || field.Key != key {
				continue
			}
			if field.Abbr != "" {
				return field.Abbr
			}
			if field.Label != "" {
				return field.Label
			}
			return key
		}
	}
	return key
}
```

- [ ] **Step 4: Widen the env and evaluators**

`formula_eval.go`:

```go
type formulaEnv struct {
	stats        *Stats
	skillKey     string
	linkedAttr   string
	linkedLabel  string // breakdown label for attr_linked; "" falls back to the key
	baseFromAttr bool
	roll         func(sides int) int
}

func (p *Plugin) formulaEnv(stats *Stats, skillKey, linkedAttr, linkedLabel string, baseFromAttr bool) *formulaEnv {
	return &formulaEnv{
		stats: stats, skillKey: skillKey, linkedAttr: linkedAttr, linkedLabel: linkedLabel, baseFromAttr: baseFromAttr,
		roll: func(sides int) int { return p.rng.Intn(sides) + 1 },
	}
}
```

and in `blockValue`:

```go
	case "attr_linked":
		label := e.linkedLabel
		if label == "" {
			label = e.linkedAttr
		}
		if label == "" {
			label = "0"
		}
		return e.stats.Attributes[e.linkedAttr].Current, label
```

`roller.go`:
- `evalFormula(blocks, stats, skillKey, linkedAttr, linkedLabel string, baseFromAttr bool)` → `env := p.formulaEnv(stats, skillKey, linkedAttr, linkedLabel, baseFromAttr)`.
- `evalFormulaDicePool(blocks, stats, skillKey, linkedAttr, linkedLabel string, baseFromAttr bool, extraDice int)` → `p.formulaEnv(stats, skillKey, linkedAttr, linkedLabel, baseFromAttr)`.
- `rollFromFormulaDicePool` gains `linkedLabel string` right after `linkedAttr` and passes it on.
- In `rollFromFormula`, first line after `resolveModifier`:

```go
	linkedLabel := attrLabel(template, linkedAttr)
```

  and pass `linkedLabel` to `rollFromFormulaDicePool(...)` and `p.evalFormula(...)`.

`weapon.go:60`:

```go
		dmg, _, dLabel, dValue, derr := p.evalFormula(damageBlocks, stats, skillKey, linkedAttr, attrLabel(template, linkedAttr), baseFromAttr)
```

- [ ] **Step 5: Fix test call sites the compiler reports**

Run: `go vet ./internal/systems/custom/`
For every `not enough arguments` error in `roller_test.go` / `formula_test.go`, insert `""` as the new `linkedLabel` argument directly after the `linkedAttr` argument. Example: `p.evalFormula(blocks, stats, "", "dex", false)` → `p.evalFormula(blocks, stats, "", "dex", "", false)`; `formulaEnv(caseStats(c), "", "", false)` → `formulaEnv(caseStats(c), "", "", "", false)`. Existing test `attr_linked reads the linked attribute` keeps expecting label `"dex"` — the key fallback.

- [ ] **Step 6: Run tests**

Run: `go test ./internal/systems/custom/... && go build ./...`
Expected: PASS, build OK.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/
git commit -m "fix: PLAYRPG-235 label attr_linked with the attribute abbr in roll breakdowns"
```

---

### Task 3: Frontend — `expandAttrTable` / `walkValueFields` + re-mint wierszy przy duplikacji

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/templateSections.js`
- Test: `warhammer-battle-helper-front/src/utils/templateSections.test.js`

**Interfaces:**
- Produces: `ATTR_TABLE_TYPE = 'attr_table'`; `expandAttrTable(field) → Array<attrField>`; `walkValueFields(sections, fn)`; `collectAttrFields(sections) → Array<attrField>`. Virtual attr shape: `{ key, type:'attr', label, abbr, default, min, max, showOnShortCard, step, hasAdvances, advancesLabel, rollable, rollConfig }`.

- [ ] **Step 1: Write the failing tests**

Append to `templateSections.test.js` (import the new names in the existing import from `./templateSections`):

```js
describe('attr_table expansion (PLAYRPG-235)', () => {
  const table = {
    key: 'fld_t', type: 'attr_table', label: 'Cechy', hasAdvances: true, advancesLabel: 'Rozw.',
    step: 5, rollable: true, rollConfig: { formula: [] },
    attrRows: [
      { id: 'attr_ws', label: 'Walka wręcz', abbr: 'WW', default: 31, min: 0, max: 100, showOnShortCard: true },
      { id: 'attr_s', label: 'Siła' },
    ],
  };
  const sections = [{ id: 's1', fields: [
    { key: 'attr_lone', type: 'attr', label: 'Szczęście' },
    { key: 'sec_n', type: 'section', section: { id: 'sec_n', fields: [table] } },
    { key: 'num_1', type: 'number', label: 'Waga' },
  ] }];

  test('expandAttrTable gives one attr per row with table-level settings inherited', () => {
    const [ws, s] = expandAttrTable(table);
    expect(ws).toEqual({
      key: 'attr_ws', type: 'attr', label: 'Walka wręcz', abbr: 'WW', default: 31, min: 0, max: 100,
      showOnShortCard: true, step: 5, hasAdvances: true, advancesLabel: 'Rozw.', rollable: true,
      rollConfig: table.rollConfig,
    });
    expect(s).toMatchObject({ key: 'attr_s', abbr: '', default: null, min: null, max: null, showOnShortCard: false });
  });

  test('walkValueFields visits rows in place of the table, in sheet order', () => {
    const keys = [];
    walkValueFields(sections, f => keys.push(f.key));
    expect(keys).toEqual(['attr_lone', 'attr_ws', 'attr_s', 'num_1']);
  });

  test('collectAttrFields returns standalone attrs and table rows only', () => {
    expect(collectAttrFields(sections).map(f => f.key)).toEqual(['attr_lone', 'attr_ws', 'attr_s']);
  });

  test('walkFields still sees the table as one field', () => {
    const types = [];
    walkFields(sections, f => types.push(f.type));
    expect(types).toEqual(['attr', 'attr_table', 'number']);
  });

  test('duplicating a table re-mints every row id — rows are global attribute keys', () => {
    const next = duplicateNodeAtPath([{ id: 's1', fields: [table] }], [0, 0], { mint, copySuffix: '(kopia)' });
    const copy = next[0].fields[1];
    expect(copy.attrRows.map(r => r.id)).toEqual(['attr_mint2', 'attr_mint3']);
    expect(copy.attrRows.map(r => r.label)).toEqual(['Walka wręcz', 'Siła']);
    expect(next[0].fields[0].attrRows[0].id).toBe('attr_ws');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=templateSections`
Expected: FAIL — `expandAttrTable is not a function`.

- [ ] **Step 3: Implement**

In `templateSections.js`, after `SINGLETON_FIELD_TYPES`:

```js
// An attr_table (PLAYRPG-235) is ONE field on the sheet but a list of attributes everywhere a
// value is read. Each row's id is its key in stats.attributes — global, like a standalone attr
// field's key — so a duplicated table must re-mint them (see remintKeys).
export const ATTR_TABLE_TYPE = 'attr_table';

// expandAttrTable turns each row into the attr field it behaves as: the row supplies identity
// and limits, the table supplies advances, step and the shared roll config. Mirrors
// expandAttrTable in the backend's systems/custom/plugin.go — change one, change the other.
export function expandAttrTable(field) {
  return (field.attrRows || []).map(row => ({
    key: row.id,
    type: 'attr',
    label: row.label,
    abbr: row.abbr || '',
    default: row.default ?? null,
    min: row.min ?? null,
    max: row.max ?? null,
    showOnShortCard: !!row.showOnShortCard,
    step: field.step,
    hasAdvances: !!field.hasAdvances,
    advancesLabel: field.advancesLabel,
    rollable: !!field.rollable,
    rollConfig: field.rollConfig ?? null,
  }));
}
```

At the end of the file, after `walkFields`:

```js
// walkValueFields is walkFields for readers of VALUES: an attr_table is replaced by its rows,
// each as a virtual attr field. Formula chips, the skill→attribute picker, token bindings and
// the short card use this; anything that renders or edits the template's own structure keeps
// walkFields, which sees the table as the single field it is.
export function walkValueFields(sections, fn) {
  walkFields(sections, (f) => {
    if (f.type === ATTR_TABLE_TYPE) expandAttrTable(f).forEach(fn);
    else fn(f);
  });
}

// collectAttrFields lists every attribute of the template: standalone attr fields and table rows.
export function collectAttrFields(sections) {
  const out = [];
  walkValueFields(sections, (f) => { if (f.type === 'attr') out.push(f); });
  return out;
}
```

In `remintKeys`, replace the leaf branch and update case 3 in its comment (“…re-mint its key; an attr_table also re-mints its row ids, which are global attribute keys rather than `<fieldKey>.<innerId>` addresses”):

```js
  // Leaf field: re-mint key only — except an attr_table, whose row ids are global keys.
  const key = mint(node.type);
  if (node.type === ATTR_TABLE_TYPE) {
    return { ...node, key, attrRows: (node.attrRows || []).map(row => ({ ...row, id: mint('attr') })) };
  }
  return { ...node, key };
```

Update `walkFields`’ comment: drop “the attribute list” from the list of its uses (that is now `collectAttrFields`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=templateSections`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/templateSections.js warhammer-battle-helper-front/src/utils/templateSections.test.js
git commit -m "feat: PLAYRPG-235 expand attr_table rows for value readers"
```

---

### Task 4: Frontend — konsumenci wartości atrybutów przechodzą na `walkValueFields`

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/formula/formula.js:160-168` (`formulaRefsOf`)
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:1413-1427` (`collectFormulaFields`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:153-157` (`attrByKey`)
- Modify: `warhammer-battle-helper-front/src/components/creator/TokenDisplayBuilder.jsx:86` (`fields` memo)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx:180-188` (`shortCardSections`)
- Test: `warhammer-battle-helper-front/src/systems/custom/formula/formula.attrTable.test.js` (new), `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.shortCard.test.jsx`

**Interfaces:**
- Consumes: `walkValueFields`, `collectAttrFields` from Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/systems/custom/formula/formula.attrTable.test.js`:

```js
import { formulaRefsOf } from './formula';
import { collectFormulaFields } from '../../../components/creator/TemplateBuilder';

const sections = [{ id: 's1', fields: [
  { key: 'attr_lone', type: 'attr', label: 'Szczęście' },
  { key: 'fld_t', type: 'attr_table', attrRows: [{ id: 'attr_ws', label: 'Walka', abbr: 'WW' }] },
  { key: 'num_1', type: 'number', label: 'Waga' },
] }];

test('formulaRefsOf counts table rows as attributes', () => {
  expect(formulaRefsOf(sections).attrKeys).toEqual(['attr_lone', 'attr_ws']);
});

test('collectFormulaFields offers table rows as attribute chips but counts the table as one field', () => {
  const { numberFields, numericFields, totalFieldCount } = collectFormulaFields(sections);
  expect(numberFields.map(f => f.key)).toEqual(['attr_lone', 'attr_ws']);
  expect(numericFields.map(f => f.key)).toEqual(['num_1']);
  expect(totalFieldCount).toBe(3);
});
```

In `CharacterDetails.shortCard.test.jsx`, inside the existing `describe('CustomCharacterDetails short card', …)`, add (uses the file's own `renderCard` helper):

```jsx
  it('shows one tile per attr_table row the GM flagged (PLAYRPG-235)', () => {
    const { container } = renderCard([{ id: 's1', fields: [{
      key: 'fld_t', type: 'attr_table', label: 'Cechy',
      attrRows: [
        { id: 'attr_ws', label: 'WALKA', showOnShortCard: true },
        { id: 'attr_s', label: 'SILA' },
      ],
    }] }], { attributes: { attr_ws: { base: 31, advances: 5, current: 36 } } });

    const labels = [...container.querySelectorAll('.custom-character-details__tile-label')];
    expect(labels.map(el => el.textContent)).toEqual(['WALKA']);
    expect(container.querySelector('.custom-character-details__tile-num').textContent).toBe('36');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='formula.attrTable|CharacterDetails.shortCard'`
Expected: FAIL — `attrKeys` lacks `attr_ws`; short card misses the row.

- [ ] **Step 3: Rewire the five readers**

`formula.js` — import `walkValueFields` instead of / alongside `walkFields` and in `formulaRefsOf` replace `walkFields(sections, ...)` with `walkValueFields(sections, ...)`. Drop the `walkFields` import if it becomes unused.

`TemplateBuilder.jsx` `collectFormulaFields`:

```js
export function collectFormulaFields(sections) {
  const attrs = [];
  const numbers = [];
  // Values (attribute chips, number chips) come from walkValueFields, so attr_table rows are
  // offered like any attribute; the field COUNT stays structural — a table is one field.
  walkValueFields(sections, (f) => {
    if (f.type === 'attr') attrs.push(f);
    if (f.type === 'number') numbers.push(f);
  });
  let n = 0;
  walkFields(sections, () => { n += 1; });
  const countContainers = (list) => (list || []).reduce((acc, node) => {
    const kids = childrenOf(node);
    return kids ? acc + 1 + countContainers(kids) : acc;
  }, 0);
  return { numberFields: attrs, numericFields: numbers, totalFieldCount: n, sectionCount: countContainers(sections) };
}
```

Add `walkValueFields` to the `../../utils/templateSections` import (line ~57).

`CustomSheetBody.jsx` `attrByKey`: `walkValueFields(sections, (f) => { if (f.type === 'attr') out[f.key] = f; });` — import `walkValueFields`.

`TokenDisplayBuilder.jsx`: in the custom-system branch of `fields`, replace `walkFields(sections, (f) => {` with `walkValueFields(sections, (f) => {`; fix the import.

`CharacterDetails.jsx` `shortCardSections`: replace `walkFields([s], f => {` with `walkValueFields([s], f => {`; import `walkValueFields` (keep `walkFields` — favourites still use it). Update the comment above it with one line: `// walkValueFields: an attr_table contributes one tile per row the GM flagged.`

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='formula|CharacterDetails|TokenDisplay|CustomSheetBody|TemplateBuilder|templateSections'`
Expected: PASS.

- [ ] **Step 5: Grep for stragglers**

Run: `grep -rn "=== 'attr'" warhammer-battle-helper-front/src --include='*.js' --include='*.jsx' | grep -v test`
Expected: every remaining hit is either inside a `walkValueFields` callback, in `FormulaBuilder`/`weaponLayout` (block types, not field types), in `fieldRowSpan.js`, `CustomSheetBody` `renderField` `case`, or `TemplateBuilder` property-panel conditions. Any other `walkFields` + `type === 'attr'` reader is a missed consumer — switch it.

- [ ] **Step 6: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git commit -m "feat: PLAYRPG-235 attribute readers see attr_table rows"
```

---

### Task 5: Frontend — blok „obecny atrybut” w `FormulaBuilder`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/FormulaBuilder.jsx` (gates at lines ~113-117, ~186, ~279)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (`creator.formula`)
- Test: `warhammer-battle-helper-front/src/components/creator/FormulaBuilder.test.jsx`

**Interfaces:**
- Produces: i18n keys `creator.formula.subsectionAttrTokens`, `creator.formula.currentAttrBtn`, `creator.formula.currentAttrTitle`, `creator.formula.currentAttrAbbr`.

- [ ] **Step 1: Write the failing tests**

Append to `FormulaBuilder.test.jsx`:

```js
describe.each(['attr', 'attr_table'])('attribute roll formula (%s)', (fieldType) => {
  test('offers the current-attribute block and adds attr_linked', () => {
    const { getByText, onChange } = setup({ fieldType });
    fireEvent.click(getByText(i18n.t('creator.formula.currentAttrBtn')));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ type: 'attr_linked' });
  });

  test('hides the skill-only blocks', () => {
    const { queryByText } = setup({ fieldType });
    expect(queryByText(i18n.t('creator.formula.skillValueBtn'))).toBeNull();
    expect(queryByText(i18n.t('creator.formula.linkedAttrBtn'))).toBeNull();
    expect(queryByText(i18n.t('creator.formula.diceAttrSkillBtn'))).toBeNull();
  });
});

test('a skill field keeps the linked-attribute wording', () => {
  const { getByText, queryByText } = setup({ fieldType: 'skill_table' });
  expect(getByText(i18n.t('creator.formula.linkedAttrBtn'))).toBeTruthy();
  expect(queryByText(i18n.t('creator.formula.currentAttrBtn'))).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=FormulaBuilder`
Expected: FAIL — current-attribute button not found.

- [ ] **Step 3: Add i18n keys**

`en/translation.json`, inside `creator.formula` (next to `linkedAttrAbbr`):

```json
      "subsectionAttrTokens": "Attribute tokens",
      "currentAttrBtn": "Current attribute",
      "currentAttrTitle": "Value of the attribute being rolled",
      "currentAttrAbbr": "attr",
```

`pl/translation.json`, same place:

```json
      "subsectionAttrTokens": "Tokeny atrybutu",
      "currentAttrBtn": "Obecny atrybut",
      "currentAttrTitle": "Wartość rzucanego atrybutu",
      "currentAttrAbbr": "atr.",
```

- [ ] **Step 4: Implement**

In `FormulaBuilder`, right after `const blocks = formula || [];`:

```js
  // An attribute rolls against itself, so for it attr_linked means "the attribute being
  // rolled" (RollWithTemplate sets linkedAttr to the rolled key). The skill blocks — skill value,
  // attr+skill die — have no meaning there.
  const attrRoll = fieldType === 'attr' || fieldType === 'attr_table';
```

In `blockLabel`: `if (b.type === 'attr_linked') return t(attrRoll ? 'creator.formula.currentAttrAbbr' : 'creator.formula.linkedAttrAbbr');`

Dice row: change `{fieldType !== 'attr' && (` before the `dice_skill_attr` button to `{!attrRoll && (`.

Skill tokens section: change `{fieldType !== 'attr' && !arithmeticOnly && (` to `{!attrRoll && !arithmeticOnly && (` and add directly before it:

```jsx
          {attrRoll && !arithmeticOnly && (
            <>
              <div className="fb__subsection-label">{t('creator.formula.subsectionAttrTokens')}</div>
              <div className="fb__attr-chips">
                <button
                  className="fb__attr-chip fb__attr-chip--attr-linked"
                  onClick={() => add({ type: 'attr_linked' })}
                  title={t('creator.formula.currentAttrTitle')}
                >
                  {t('creator.formula.currentAttrBtn')}
                </button>
              </div>
            </>
          )}
```

- [ ] **Step 5: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=FormulaBuilder`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/FormulaBuilder.jsx warhammer-battle-helper-front/src/components/creator/FormulaBuilder.test.jsx warhammer-battle-helper-front/src/locales
git commit -m "feat: PLAYRPG-235 current-attribute block in attribute roll formulas"
```

---

### Task 6: Frontend — podział na pasma (czysta funkcja)

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/attrTableBands.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/attrTableBands.test.js`

**Interfaces:**
- Produces: `ATTR_TABLE_LABEL_COL_PX = 64`, `ATTR_TABLE_MIN_COL_PX = 48`, `attrsPerBand(width) → number`, `splitBands(rows, perBand) → Array<Array<row>>`.

- [ ] **Step 1: Write the failing test**

```js
import { attrsPerBand, splitBands, ATTR_TABLE_LABEL_COL_PX, ATTR_TABLE_MIN_COL_PX } from './attrTableBands';

describe('attrsPerBand', () => {
  test('unknown width (no ResizeObserver, first render) means one band', () => {
    expect(attrsPerBand(null)).toBe(Infinity);
    expect(attrsPerBand(0)).toBe(Infinity);
  });
  test('fits as many minimum-width columns as the space beside the label column allows', () => {
    expect(attrsPerBand(ATTR_TABLE_LABEL_COL_PX + 5 * ATTR_TABLE_MIN_COL_PX)).toBe(5);
    expect(attrsPerBand(ATTR_TABLE_LABEL_COL_PX + 5 * ATTR_TABLE_MIN_COL_PX - 1)).toBe(4);
  });
  test('never fewer than one column, however narrow', () => {
    expect(attrsPerBand(10)).toBe(1);
  });
});

describe('splitBands', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'];
  test('chunks in order, last band takes the remainder', () => {
    expect(splitBands(rows, 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
  test('Infinity keeps one band', () => {
    expect(splitBands(rows, Infinity)).toEqual([rows]);
  });
  test('no rows gives no bands', () => {
    expect(splitBands([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=attrTableBands`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// Band layout of an attr_table (PLAYRPG-235). Attributes are columns; when they do not fit the
// width, the table breaks into bands, and every band repeats the row-label column (Base /
// Advances / Total). CSS auto-fill can wrap the columns but cannot repeat that label column,
// so the split is computed here from the measured width.
//
// This is the table's INTERNAL layout. It does not contradict fieldRowSpan.js ("the sheet does
// no layout measurement"): that rule is about quantising field heights in the section grid, and
// an attr_table opts out of it with a content-height span of null.
export const ATTR_TABLE_LABEL_COL_PX = 64;
export const ATTR_TABLE_MIN_COL_PX = 48;

export function attrsPerBand(width) {
  if (!width) return Infinity;
  return Math.max(1, Math.floor((width - ATTR_TABLE_LABEL_COL_PX) / ATTR_TABLE_MIN_COL_PX));
}

export function splitBands(rows, perBand) {
  if (!Number.isFinite(perBand)) return rows.length ? [rows] : [];
  const out = [];
  for (let i = 0; i < rows.length; i += perBand) out.push(rows.slice(i, i + perBand));
  return out;
}
```

- [ ] **Step 4: Run tests** — same command, Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/attrTableBands.js warhammer-battle-helper-front/src/systems/custom/attrTableBands.test.js
git commit -m "feat: PLAYRPG-235 band split for the attribute table"
```

---

### Task 7: Frontend — komponent `AttrTable` na karcie

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/AttrTable.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`renderField` new `case 'attr_table'`)
- Modify: `warhammer-battle-helper-front/src/style.css` (new block after the skill-table block, ~line 8780)
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` (`customSheet`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.attrTable.test.jsx`, `warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.test.js`

**Interfaces:**
- Consumes: `attrsPerBand`, `splitBands`, `ATTR_TABLE_LABEL_COL_PX` (Task 6); `onChange.attr(key, val)`, `onChange.advances(key, val)`; `rollAffordance` and `usePortalTooltip` from `CustomSheetBody`.
- Produces: `<AttrTable field attrs onChange readOnly showRoll renderRoll showTooltip hideTooltip />`; i18n `customSheet.attrTableEmpty`.

- [ ] **Step 1: Write the failing tests**

Create `CustomSheetBody.attrTable.test.jsx`:

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container -- table cells are asserted by BEM class */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const tableSections = (over = {}) => ([{
  id: 'sec1', columns: 1,
  fields: [{
    key: 'fld_t', type: 'attr_table', label: 'Cechy', advancesLabel: 'Rozw.',
    attrRows: [
      { id: 'attr_ws', label: 'Walka wręcz', abbr: 'WW', min: 0, max: 100 },
      { id: 'attr_s', label: 'Siła' },
    ],
    ...over,
  }],
}]);

const values = { attributes: { attr_ws: { base: 31, advances: 5, current: 36 }, attr_s: { base: 20, advances: 0, current: 20 } } };

test('headers show the abbr, falling back to the label', () => {
  const { container } = render(<CustomSheetBody sections={tableSections()} values={values} />);
  const heads = [...container.querySelectorAll('.custom-sheet__attr-table-head')].map(el => el.textContent);
  expect(heads).toEqual(['WW', 'Siła']);
});

test('without advances: one editable value row, no total', () => {
  const onChange = { attr: jest.fn(), advances: jest.fn() };
  const { container } = render(<CustomSheetBody sections={tableSections()} values={values} onChange={onChange} />);
  const inputs = container.querySelectorAll('.custom-sheet__attr-table-input');
  expect(inputs).toHaveLength(2);
  expect(container.querySelector('.custom-sheet__attr-table-total')).toBeNull();
  fireEvent.change(inputs[0], { target: { value: '40' } });
  expect(onChange.attr).toHaveBeenCalledWith('attr_ws', '40');
  expect(inputs[0]).toHaveAttribute('max', '100');
});

test('with advances: base and advances inputs per attribute plus a read-only total', () => {
  const onChange = { attr: jest.fn(), advances: jest.fn() };
  const { container, getByText } = render(
    <CustomSheetBody sections={tableSections({ hasAdvances: true })} values={values} onChange={onChange} />
  );
  expect(container.querySelectorAll('.custom-sheet__attr-table-input')).toHaveLength(4);
  const totals = [...container.querySelectorAll('.custom-sheet__attr-table-total')].map(el => el.textContent);
  expect(totals).toEqual(['36', '20']);
  expect(getByText('Rozw.')).toBeTruthy();
  fireEvent.change(container.querySelectorAll('.custom-sheet__attr-table-input--adv')[0], { target: { value: '7' } });
  expect(onChange.advances).toHaveBeenCalledWith('attr_ws', '7');
});

test('a rollable table rolls the clicked row by its id', () => {
  const onRoll = jest.fn();
  const { container } = render(
    <CustomSheetBody sections={tableSections({ rollable: true })} values={values} onRoll={onRoll} />
  );
  const dice = container.querySelectorAll('.custom-sheet__attr-table .custom-sheet__roll-btn');
  expect(dice).toHaveLength(2);
  fireEvent.click(dice[1]);
  expect(onRoll).toHaveBeenCalledWith({ skillKey: 'attr_s', label: 'Siła' });
});

test('the creator shows static dice without handlers', () => {
  const { container } = render(
    <CustomSheetBody sections={tableSections({ rollable: true })} values={values} showAffordances />
  );
  expect(container.querySelectorAll('.custom-sheet__attr-table .custom-sheet__roll-btn--static')).toHaveLength(2);
});

test('no rows renders the empty hint instead of an empty grid', () => {
  const { container } = render(<CustomSheetBody sections={tableSections({ attrRows: [] })} values={values} />);
  expect(container.querySelector('.custom-sheet__attr-table-band')).toBeNull();
  expect(container.querySelector('.custom-sheet__attr-table-empty')).not.toBeNull();
});
```

In `fieldRowSpan.test.js` add:

```js
test('attr_table follows its content height', () => {
  expect(fieldRowSpan({ type: 'attr_table', hasAdvances: true })).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody.attrTable|fieldRowSpan'`
Expected: `CustomSheetBody.attrTable` FAILS (no table rendered); `fieldRowSpan` already passes (unknown types return null) — keep the test as a pin.

- [ ] **Step 3: i18n**

`customSheet` in `en`: `"attrTableEmpty": "No attributes defined"`; `pl`: `"attrTableEmpty": "Brak zdefiniowanych atrybutów"`. (Row labels reuse existing `customSheet.baseShort`, `customSheet.total`, `customSheet.value`.)

- [ ] **Step 4: Create `fields/AttrTable.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { attrsPerBand, splitBands, ATTR_TABLE_LABEL_COL_PX } from '../attrTableBands';

// The attr_table field (PLAYRPG-235): attributes as columns, Warhammer style, with the rows
// Base / Advances / Total (or a single Value row without advances) and a die row when rollable.
// Each row of the template's attrRows is a full attribute stored in attrs[row.id], so editing
// goes through the same onChange.attr / onChange.advances an attr field uses.
//
// The width is measured to split the columns into bands, each repeating the row-label column
// (see attrTableBands.js). Without ResizeObserver (jsdom) the table stays one band.
function AttrTable({ field, attrs, onChange, readOnly, showRoll, renderRoll, showTooltip, hideTooltip }) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = field.attrRows || [];
  const hasAdv = !!field.hasAdvances;
  const step = field.step || 1;
  const bands = splitBands(rows, attrsPerBand(width));

  const input = (row, kind) => {
    const v = attrs[row.id] || {};
    const isAdv = kind === 'advances';
    // Mirrors the attr field: with advances an empty part shows blank instead of 0; a solo value
    // shows the stored base as-is so a real 0 stays visible.
    const value = hasAdv ? ((isAdv ? v.advances : v.base) || '') : (v.base ?? '');
    return (
      <input
        key={`${row.id}-${kind}`}
        type="number"
        className={`custom-sheet__attr-table-input${isAdv ? ' custom-sheet__attr-table-input--adv' : ''}`}
        value={value}
        onChange={onChange ? e => onChange[isAdv ? 'advances' : 'attr'](row.id, e.target.value) : undefined}
        readOnly={readOnly}
        min={isAdv ? undefined : (row.min ?? undefined)}
        max={isAdv ? undefined : (row.max ?? undefined)}
        step={step}
        aria-label={row.label}
      />
    );
  };

  const rowLabel = (text) => <span className="custom-sheet__attr-table-rowlabel">{text}</span>;

  if (rows.length === 0) {
    return <div className="custom-sheet__attr-table custom-sheet__attr-table-empty">{t('customSheet.attrTableEmpty')}</div>;
  }

  return (
    <div className="custom-sheet__attr-table" ref={wrapRef}>
      {bands.map((band, i) => (
        <div
          key={i}
          className="custom-sheet__attr-table-band"
          style={{ gridTemplateColumns: `${ATTR_TABLE_LABEL_COL_PX}px repeat(${band.length}, minmax(0, 1fr))` }}
        >
          <span className="custom-sheet__attr-table-corner" />
          {band.map(row => (
            <span
              key={row.id}
              className="custom-sheet__attr-table-head"
              onMouseEnter={e => showTooltip(row.label, e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              {row.abbr || row.label}
            </span>
          ))}

          {hasAdv ? (
            <>
              {rowLabel(t('customSheet.baseShort'))}
              {band.map(row => input(row, 'base'))}
              {rowLabel(field.advancesLabel || t('customSheet.advancesShort'))}
              {band.map(row => input(row, 'advances'))}
              {rowLabel(t('customSheet.total'))}
              {band.map(row => {
                const v = attrs[row.id] || {};
                return (
                  <output key={row.id} className="custom-sheet__attr-table-total">
                    {v.current ?? ((v.base ?? 0) + (v.advances ?? 0))}
                  </output>
                );
              })}
            </>
          ) : (
            <>
              {rowLabel(t('customSheet.value'))}
              {band.map(row => input(row, 'base'))}
            </>
          )}

          {showRoll && (
            <>
              <span />
              {band.map(row => (
                <span key={row.id} className="custom-sheet__attr-table-roll">{renderRoll(row)}</span>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default AttrTable;
```

- [ ] **Step 5: Render it from `CustomSheetBody`**

Import `AttrTable from './fields/AttrTable'`. In `renderField`, after the `case 'attr'` block:

```jsx
      case 'attr_table': {
        // Same affordance policy as the skill fields: reserve the die row when a live handler
        // exists OR the creator asked for static affordances.
        const showRoll = !!field.rollable && (!!onRoll || showAffordances);
        return (
          <div key={field.key} className="custom-sheet__attr-table-field">
            {renderFieldLabel(field.label)}
            <AttrTable
              field={field}
              attrs={attrs}
              onChange={onChange}
              readOnly={readOnly}
              showRoll={showRoll}
              renderRoll={(row) => rollAffordance(() => onRoll({ skillKey: row.id, label: row.label }))}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
          </div>
        );
      }
```

- [ ] **Step 6: CSS** — add after the skill-table block in `style.css`:

```css
/* Attribute table (PLAYRPG-235): attributes as columns, split into bands by AttrTable.jsx.
   Each band is its own grid whose columns come from JS (label column + one per attribute). */
.custom-sheet__attr-table-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
}

.custom-sheet__attr-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
}

.custom-sheet__attr-table-band {
    display: grid;
    align-items: center;
    column-gap: 4px;
    row-gap: 3px;
}

/* Header strip: the corner cell and the abbreviations share the skill-table gradient. */
.custom-sheet__attr-table-corner,
.custom-sheet__attr-table-head {
    align-self: stretch;
    background: linear-gradient(135deg, #c9975b 0%, #a67c52 100%);
    padding: 5px 2px;
}

.custom-sheet__attr-table-corner {
    border-radius: 4px 0 0 0;
}

.custom-sheet__attr-table-head {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    color: #fff9f0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: default;
}

.custom-sheet__attr-table-head:last-child {
    border-radius: 0 4px 0 0;
}

.custom-sheet__attr-table-rowlabel {
    font-size: 0.72rem;
    font-weight: 700;
    color: #7a5c42;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.custom-sheet__attr-table-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 3px 2px;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 3px;
    color: #3a2f1f;
    font-size: 0.9rem;
    text-align: center;
}

.custom-sheet__attr-table-input:focus {
    outline: none;
    border-color: #7a5c42;
}

.custom-sheet__attr-table-total {
    text-align: center;
    font-weight: 700;
    font-size: 1rem;
    color: #3a2f1f;
}

.custom-sheet__attr-table-roll {
    display: flex;
    justify-content: center;
}

.custom-sheet__attr-table-empty {
    font-size: 0.85rem;
    font-style: italic;
    color: #7a5c42;
}
```

Note `.custom-sheet__attr-table-head:last-child` will not match when a die row follows; acceptable cosmetic — if it bothers in the browser check, drop the per-corner radius rather than add selectors.

- [ ] **Step 7: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|fieldRowSpan'`
Expected: PASS (new file + existing domShape/smoke tests unchanged).

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales
git commit -m "feat: PLAYRPG-235 render the attribute table on the sheet"
```

---

### Task 8: Frontend — kreator (typ pola, edytor wierszy, właściwości)

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/AttrRowsEditor.jsx`
- Test: `warhammer-battle-helper-front/src/components/creator/AttrRowsEditor.test.jsx`, `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.attrTable.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`FIELD_TYPES`, `PALETTE_GROUPS`, `makeDefaultField`, `PropertyPanel` groups)
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` (`creator`, `creator.fieldType`)

**Interfaces:**
- Consumes: `genId` from `utils/surrogateKeys`.
- Produces: `<AttrRowsEditor rows onChange />` (default export); `makeDefaultField('attr_table', t)` → `{ key, type:'attr_table', label, abbr:'', rollable:false, attrRows:[], step:1, hasAdvances:false, advancesLabel }`.

- [ ] **Step 1: i18n keys**

`en` `creator.fieldType`: `"attrTable": "Attribute table"`, `"attrTableDesc": "Attributes in a table — one roll formula for all"`.
`pl`: `"attrTable": "Tabela atrybutów"`, `"attrTableDesc": "Atrybuty w tabeli — jedna formuła rzutu dla wszystkich"`.

`en` `creator`: `"attrRows": "Attributes"`, `"attrRowsAdd": "Add attribute"`, `"attrRowsColName": "Name"`, `"attrRowsColAbbr": "Abbr."`, `"attrRowsColDefault": "Default"`, `"attrRowsColMin": "Min"`, `"attrRowsColMax": "Max"`, `"attrRowsColShortCard": "Card"`, `"attrRowsDelete": "Remove attribute"`, `"attrRowsEmpty": "No attributes yet"`.
`pl` `creator`: `"attrRows": "Atrybuty"`, `"attrRowsAdd": "Dodaj atrybut"`, `"attrRowsColName": "Nazwa"`, `"attrRowsColAbbr": "Skrót"`, `"attrRowsColDefault": "Domyślna"`, `"attrRowsColMin": "Min"`, `"attrRowsColMax": "Max"`, `"attrRowsColShortCard": "Karta"`, `"attrRowsDelete": "Usuń atrybut"`, `"attrRowsEmpty": "Brak atrybutów"`.

- [ ] **Step 2: Write the failing tests**

`AttrRowsEditor.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import i18n from '../../i18n';
import AttrRowsEditor from './AttrRowsEditor';

const rows = [{ id: 'attr_ws', label: 'Walka wręcz', abbr: 'WW', default: 31, min: 0, max: 100 }];

const setup = (list = rows) => {
  const onChange = jest.fn();
  render(<AttrRowsEditor rows={list} onChange={onChange} />);
  return onChange;
};

test('adds a row with a fresh attr id', () => {
  const onChange = setup();
  fireEvent.click(screen.getByText(i18n.t('creator.attrRowsAdd')));
  const next = onChange.mock.calls[0][0];
  expect(next).toHaveLength(2);
  expect(next[1].id).toMatch(/^attr_/);
  expect(next[1].id).not.toContain('.');
});

test('removes a row', () => {
  const onChange = setup();
  fireEvent.click(screen.getByLabelText(i18n.t('creator.attrRowsDelete')));
  expect(onChange).toHaveBeenCalledWith([]);
});

test('edits text fields', () => {
  const onChange = setup();
  fireEvent.change(screen.getByDisplayValue('WW'), { target: { value: 'WS' } });
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: 'attr_ws', abbr: 'WS' });
});

test('truncates numbers and clears to null', () => {
  const onChange = setup();
  fireEvent.change(screen.getByDisplayValue('31'), { target: { value: '2.7' } });
  expect(onChange.mock.calls[0][0][0].default).toBe(2);
  fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '' } });
  expect(onChange.mock.calls[1][0][0].max).toBeNull();
});

test('toggles the short-card flag', () => {
  const onChange = setup();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onChange.mock.calls[0][0][0].showOnShortCard).toBe(true);
});

test('shows the empty hint with no rows', () => {
  setup([]);
  expect(screen.getByText(i18n.t('creator.attrRowsEmpty'))).toBeTruthy();
});
```

`TemplateBuilder.attrTable.test.jsx`:

```jsx
import '../../i18n';
import i18n from '../../i18n';
import { makeDefaultField } from './TemplateBuilder';

test('a new attr_table starts empty, not rollable, without advances', () => {
  const f = makeDefaultField('attr_table', i18n.t.bind(i18n));
  expect(f).toMatchObject({ type: 'attr_table', attrRows: [], step: 1, hasAdvances: false, rollable: false });
  expect(f.label).toBe(i18n.t('creator.fieldType.attrTable'));
});
```

(If ESLint flags the duplicate import, keep only `import i18n from '../../i18n';`.)

- [ ] **Step 3: Run to verify failure**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='AttrRowsEditor|TemplateBuilder.attrTable'`
Expected: FAIL — module `./AttrRowsEditor` not found; `attrRows` undefined.

- [ ] **Step 4: Create `AttrRowsEditor.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { genId } from '../../utils/surrogateKeys';

// GM-side editor of an attr_table's rows (PLAYRPG-235). Each row is a full attribute: its id is
// minted once and becomes the key in stats.attributes, so it is never derived from the label.
// Numbers are truncated for the same reason as the attr field's own inputs: a decimal 400s the
// template PATCH, and saveTemplate swallows that error silently.
const toInt = (raw) => (raw === '' ? null : Math.trunc(Number(raw)));

function AttrRowsEditor({ rows, onChange }) {
  const { t } = useTranslation();
  const list = rows || [];
  const update = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...list, { id: genId('attr'), label: '', abbr: '' }]);

  return (
    <div className="creator__attr-rows">
      {list.length === 0 ? (
        <div className="creator__attr-rows-empty">{t('creator.attrRowsEmpty')}</div>
      ) : (
        <div className="creator__attr-rows-grid">
          <span className="creator__attr-rows-head">{t('creator.attrRowsColName')}</span>
          <span className="creator__attr-rows-head">{t('creator.attrRowsColAbbr')}</span>
          <span className="creator__attr-rows-head">{t('creator.attrRowsColDefault')}</span>
          <span className="creator__attr-rows-head">{t('creator.attrRowsColMin')}</span>
          <span className="creator__attr-rows-head">{t('creator.attrRowsColMax')}</span>
          <span className="creator__attr-rows-head">{t('creator.attrRowsColShortCard')}</span>
          <span />
          {list.map((row, i) => (
            <React.Fragment key={row.id}>
              <input className="creator__option-input" value={row.label} onChange={e => update(i, { label: e.target.value })} />
              <input className="creator__option-input" value={row.abbr || ''} onChange={e => update(i, { abbr: e.target.value })} />
              <input className="creator__option-input" type="number" step={1} value={row.default ?? ''} onChange={e => update(i, { default: toInt(e.target.value) })} />
              <input className="creator__option-input" type="number" step={1} value={row.min ?? ''} onChange={e => update(i, { min: toInt(e.target.value) })} />
              <input className="creator__option-input" type="number" step={1} value={row.max ?? ''} onChange={e => update(i, { max: toInt(e.target.value) })} />
              <input type="checkbox" checked={!!row.showOnShortCard} onChange={e => update(i, { showOnShortCard: e.target.checked })} />
              <button className="creator__option-del" aria-label={t('creator.attrRowsDelete')} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                <DeleteIcon style={{ fontSize: 13 }} />
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
      <button className="creator__option-add-btn creator__attr-rows-add" onClick={add}>
        <AddIcon style={{ fontSize: 13 }} /> {t('creator.attrRowsAdd')}
      </button>
    </div>
  );
}

export default AttrRowsEditor;
```

CSS (in `style.css` next to `.creator__options-editor` rules):

```css
/* attr_table row editor: name and abbr get the room, the four numbers stay narrow. */
.creator__attr-rows-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) repeat(3, 52px) 32px 24px;
    gap: 4px;
    align-items: center;
}

.creator__attr-rows-head {
    font-size: 0.7rem;
    color: #7a5c42;
    text-transform: uppercase;
}

.creator__attr-rows-empty {
    font-size: 0.8rem;
    font-style: italic;
    color: #7a5c42;
    margin-bottom: 6px;
}

.creator__attr-rows-add {
    margin-top: 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
```

- [ ] **Step 5: Wire it into `TemplateBuilder.jsx`**

1. Import `GridOnIcon from '@mui/icons-material/GridOn'` and `AttrRowsEditor from './AttrRowsEditor'`.
2. `FIELD_TYPES`, after `attr`:
   `{ type: 'attr_table',  labelKey: 'creator.fieldType.attrTable',   icon: <GridOnIcon fontSize="small" />,     desc: 'creator.fieldType.attrTableDesc' },`
3. `PALETTE_GROUPS` stats group: `types: ['attr', 'attr_table', 'number', 'computed', 'progress']`.
4. `makeDefaultField`, after the `attr` line:
   `if (type === 'attr_table') return { ...base, attrRows: [], step: 1, hasAdvances: false, advancesLabel: t('creator.fieldAdvancesDefault') };`
5. `PropertyPanel` — “Values” group:
   - outer condition `['attr', 'number', 'skill_table'].includes(field.type)` → `['attr', 'attr_table', 'number', 'skill_table'].includes(field.type)`;
   - leave the Min/Max duo as `attr || number`;
   - the Default+Step duo: change its outer condition to `(field.type === 'attr' || field.type === 'number' || field.type === 'attr_table')` and wrap only the Default `TextField` in `{field.type !== 'attr_table' && ( … )}` (per-row defaults live in the row editor);
   - advances block `field.type === 'attr' && (` → `(field.type === 'attr' || field.type === 'attr_table') && (`.
6. New group right after the Values group:

```jsx
      {field.type === 'attr_table' && (
        <PropsGroup title={t('creator.attrRows')}>
          <AttrRowsEditor rows={field.attrRows} onChange={attrRows => up({ attrRows })} />
        </PropsGroup>
      )}
```

7. Roll group: `['attr', 'skill_table', 'skill_tree', 'weapons_table']` → add `'attr_table'`; inner `(field.type === 'attr' || field.type === 'skill_table' || field.type === 'skill_tree')` → add `|| field.type === 'attr_table'`.

Do NOT add `attr_table` to the abbr condition (line ~867) or to `SHORT_CARD_TYPES` — the table has no abbreviation of its own and short-card visibility is per row.

- [ ] **Step 6: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='AttrRowsEditor|TemplateBuilder|PropertyPopup'`
Expected: PASS.

- [ ] **Step 7: i18n sync check**

Invoke skill `i18n-sync` (or run its key-diff script) — Expected: no keys missing between `en` and `pl`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: PLAYRPG-235 attribute table in the template creator"
```

---

### Task 9: Weryfikacja całości

**Files:** none modified unless a check fails.

- [ ] **Step 1: Backend**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./... && go test ./...`
Expected: all PASS.

- [ ] **Step 2: Frontend full suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: only the known baseline failure `App.test.js` (axios ESM).

- [ ] **Step 3: Lint/build**

Run: `cd warhammer-battle-helper-front && CI=true npm run build`
Expected: build succeeds with no ESLint errors (CI=true turns warnings into errors).

- [ ] **Step 4: Unchanged-reader audit**

Run: `grep -rn "attributes\[\|walkFields(" warhammer-battle-helper-front/src --include='*.js' --include='*.jsx' | grep -v test`
For each `walkFields` hit, confirm it is structural (rendering, creator tree, favourites, weapons) or already switched. Any reader that collects attribute fields with `walkFields` is a missed consumer — fix it, add a test, commit.

- [ ] **Step 5: Browser check (manual, user)**

The UI is not clicked by any test. Record pending check in memory (`playrpg-235-pending-browser-check.md`, pattern of the other `pending-browser-check` notes): create table with 10 attributes in a narrow section → bands wrap with row labels repeated; advances on/off; die rolls a row and the log breakdown shows `WW…`, not `attr_…`; pool formula `obecny atrybut d k6`; a skill linked to a table row rolls with it; short card shows only flagged rows; duplicating the table gives independent attributes.
