# PLAYRPG-288 Damage Modifier Dice + Add-on-Create Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player-filled damage block (▢, `const_input`) accepts a number or dice (`2`, `-1`, `1K4`, `1K6+1`), and GM presets flagged `addOnCreate` are copied into a new character's rows instead of living read-only in the template.

**Architecture:** Go parses the player's text into existing formula blocks (`const`, `op`, `dice`) wrapped in parentheses, so the evaluator gains no new node type. JS validates the same grammar on the sheet; one shared JSON case file pins both parsers. `SeedDefaults` copies `addOnCreate` presets into `Stats.Weapons` / `Stats.Tables` with the preset's id; the sheet's read-only preset path is deleted. A one-shot migration converts stored numbers to text and copies existing always-on presets into existing characters.

**Tech Stack:** Go 1.24 + mongo-driver v1.17.4 (backend), React + Jest via CRA (frontend).

**Spec:** `docs/superpowers/specs/PLAYRPG-288.md`

## Global Constraints

- Code comments always in English; conversation and `docs/` in Polish.
- No JSX string literals — every UI string through `t('key')`, added to both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`; tooltips only via `usePortalTooltip` (`components/common/PortalTooltip.jsx`), never MUI `<Tooltip>`.
- Sheet colors: text `#3a2f1f`, labels `#7a5c42`, error `#c0392b`.
- CSS modifier rules must be declared **after** their base rule in `style.css` (a modifier before its base is silently dead).
- Delete dead code, CSS, i18n keys and props in the same change that kills them.
- Grammar caps (both languages, verbatim): dice count 1–100, faces 1–1000, constant 0–9999.
- Damage map type everywhere: `map[string]string` (Go) / string values (JS).
- Frontend tests: `CI=true npm test -- --watchAll=false --testPathPattern=<name>` from `warhammer-battle-helper-front/`. Baseline failure `App.test.js` (axios ESM) is not a regression.
- Backend tests: `go test ./...` from `warhammer-battle-helper-backend/` on the host (formula parity tests read the front-end JSON via a relative path).
- Work on `main`; check the branch in the same command as each commit: `git branch --show-current && git commit ...`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Go damage-expression parser + shared case file

**Files:**
- Create: `warhammer-battle-helper-backend/internal/systems/custom/damage_expr.go`
- Create: `warhammer-battle-helper-backend/internal/systems/custom/damage_expr_test.go`
- Create: `warhammer-battle-helper-front/src/systems/custom/formula/damage_expr_cases.json`

**Interfaces:**
- Produces: `func parseDamageExpr(s, idPrefix string) ([]models.FormulaBlock, error)`; `var ErrInvalidDamageExpr`; constants `maxDamageExprDice = 100`, `maxDamageExprFaces = 1000`, `maxDamageExprConst = 9999`; case file schema `[{ "input": string, "valid": bool, "value"?: int }]` (`value` only for dice-free valid inputs).

- [ ] **Step 1: Write the shared case file**

`warhammer-battle-helper-front/src/systems/custom/formula/damage_expr_cases.json`:

```json
[
  { "input": "0", "valid": true, "value": 0 },
  { "input": "2", "valid": true, "value": 2 },
  { "input": "-1", "valid": true, "value": -1 },
  { "input": "+3", "valid": true, "value": 3 },
  { "input": " 1 + 2 ", "valid": true, "value": 3 },
  { "input": "10-4", "valid": true, "value": 6 },
  { "input": "9999", "valid": true, "value": 9999 },
  { "input": "1K4", "valid": true },
  { "input": "k4", "valid": true },
  { "input": "K4", "valid": true },
  { "input": "1d4", "valid": true },
  { "input": "2D6+1", "valid": true },
  { "input": "1k6-1", "valid": true },
  { "input": "-1K4", "valid": true },
  { "input": "+1K4", "valid": true },
  { "input": "1K4+1K6", "valid": true },
  { "input": "100K6", "valid": true },
  { "input": "1K1000", "valid": true },
  { "input": "", "valid": false },
  { "input": "   ", "valid": false },
  { "input": "abc", "valid": false },
  { "input": "1K", "valid": false },
  { "input": "K", "valid": false },
  { "input": "K0", "valid": false },
  { "input": "0K6", "valid": false },
  { "input": "101K6", "valid": false },
  { "input": "1K1001", "valid": false },
  { "input": "10000", "valid": false },
  { "input": "1+", "valid": false },
  { "input": "+", "valid": false },
  { "input": "--1", "valid": false },
  { "input": "1++2", "valid": false },
  { "input": "1*2", "valid": false },
  { "input": "(1)", "valid": false },
  { "input": "1.5", "valid": false },
  { "input": "1K4K6", "valid": false },
  { "input": "1x4", "valid": false }
]
```

- [ ] **Step 2: Write the failing Go test**

`warhammer-battle-helper-backend/internal/systems/custom/damage_expr_test.go`:

```go
package custom

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
)

// damageExprCasesPath is the cross-language contract shared with the front end's damageExpr.test.js.
// Like formula_cases.json it needs the whole repo checked out, so run it on the host.
const damageExprCasesPath = "../../../../warhammer-battle-helper-front/src/systems/custom/formula/damage_expr_cases.json"

type damageExprCase struct {
	Input string `json:"input"`
	Valid bool   `json:"valid"`
	Value *int   `json:"value"`
}

func TestDamageExprCases(t *testing.T) {
	raw, err := os.ReadFile(damageExprCasesPath)
	if err != nil {
		t.Fatalf("read %s: %v", damageExprCasesPath, err)
	}
	var cases []damageExprCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode %s: %v", damageExprCasesPath, err)
	}
	for _, c := range cases {
		t.Run(c.Input, func(t *testing.T) {
			blocks, err := parseDamageExpr(c.Input, "x")
			if !c.Valid {
				if !errors.Is(err, ErrInvalidDamageExpr) {
					t.Fatalf("parseDamageExpr(%q) err = %v, want ErrInvalidDamageExpr", c.Input, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseDamageExpr(%q) error: %v", c.Input, err)
			}
			if _, err := parseFormula(blocks); err != nil {
				t.Fatalf("blocks of %q do not parse as a formula: %v", c.Input, err)
			}
			if c.Value == nil {
				return
			}
			// newTestPlugin() with no values panics on any roll — a dice-free case must not roll.
			got, _, _, _, err := newTestPlugin().evalFormula(blocks, &Stats{}, "", "", "", false)
			if err != nil {
				t.Fatalf("evalFormula(%q) error: %v", c.Input, err)
			}
			if got != *c.Value {
				t.Errorf("value of %q = %d, want %d", c.Input, got, *c.Value)
			}
		})
	}
}

func TestParseDamageExpr_BlockIDsAreUniqueAndPrefixed(t *testing.T) {
	blocks, err := parseDamageExpr("2K6+1", "b7")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, b := range blocks {
		if b.ID == "" || seen[b.ID] || b.ID[:3] != "b7." {
			t.Errorf("block id %q: want unique, prefixed with b7.", b.ID)
		}
		seen[b.ID] = true
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'DamageExpr' -v`
Expected: FAIL — `undefined: parseDamageExpr`.

- [ ] **Step 4: Implement the parser**

`warhammer-battle-helper-backend/internal/systems/custom/damage_expr.go`:

```go
package custom

import (
	"battle-helper/internal/models"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Caps keep a typo ("1K4000000") from becoming a request that rolls forever. The sheet's
// isValidDamageExpr (src/systems/custom/formula/damageExpr.js) enforces the same numbers, and
// damage_expr_cases.json pins both sides.
const (
	maxDamageExprDice  = maxDicePerTerm
	maxDamageExprFaces = 1000
	maxDamageExprConst = 9999
)

// ErrInvalidDamageExpr is returned for a player damage entry the grammar rejects.
var ErrInvalidDamageExpr = errors.New("invalid damage expression")

// damageTermRe matches one term: dice ("1k4", "k4") or a plain number. Input is lower-cased and
// stripped of whitespace before it gets here, so "1K4" and "1d4" both arrive as one of these.
var damageTermRe = regexp.MustCompile(`^(?:(\d*)[dk](\d+)|(\d+))$`)

// parseDamageExpr turns a player-entered damage modifier ("2", "-1", "1K4", "2d6+1") into
// formula blocks the existing parser already understands: const, op and dice. Grammar:
//
//	expr := [sign] term (sign term)*
//	term := [count] ('k' | 'd') faces | number
//
// A leading minus becomes "0 -" because the formula grammar has no unary minus. Block ids are
// idPrefix + "." + n, so expanded blocks never collide with the GM's own ids.
func parseDamageExpr(s, idPrefix string) ([]models.FormulaBlock, error) {
	s = strings.ToLower(strings.Join(strings.Fields(s), ""))
	if s == "" {
		return nil, ErrInvalidDamageExpr
	}
	n := 0
	id := func() string { n++; return fmt.Sprintf("%s.%d", idPrefix, n) }

	sign := ""
	if s[0] == '+' || s[0] == '-' {
		sign, s = s[:1], s[1:]
	}
	var out []models.FormulaBlock
	for first := true; ; first = false {
		term, rest, more := s, "", false
		if i := strings.IndexAny(s, "+-"); i >= 0 {
			term, rest, more = s[:i], s[i:], true
		}
		blocks, err := damageTerm(term, id)
		if err != nil {
			return nil, err
		}
		switch {
		case first && sign == "-":
			zero := 0.0
			out = append(out, models.FormulaBlock{ID: id(), Type: "const", Num: &zero}, models.FormulaBlock{ID: id(), Type: "op", Value: "-"})
		case !first:
			out = append(out, models.FormulaBlock{ID: id(), Type: "op", Value: sign})
		}
		out = append(out, blocks...)
		if !more {
			return out, nil
		}
		sign, s = rest[:1], rest[1:]
	}
}

func damageTerm(term string, id func() string) ([]models.FormulaBlock, error) {
	m := damageTermRe.FindStringSubmatch(term)
	if m == nil {
		return nil, ErrInvalidDamageExpr
	}
	if m[3] != "" {
		v, err := strconv.Atoi(m[3])
		if err != nil || v > maxDamageExprConst {
			return nil, ErrInvalidDamageExpr
		}
		f := float64(v)
		return []models.FormulaBlock{{ID: id(), Type: "const", Num: &f}}, nil
	}
	faces, err := strconv.Atoi(m[2])
	if err != nil || faces < 1 || faces > maxDamageExprFaces {
		return nil, ErrInvalidDamageExpr
	}
	die := models.FormulaBlock{ID: id(), Type: "dice", Value: "d" + strconv.Itoa(faces)}
	if m[1] == "" {
		return []models.FormulaBlock{die}, nil
	}
	count, err := strconv.Atoi(m[1])
	if err != nil || count < 1 || count > maxDamageExprDice {
		return nil, ErrInvalidDamageExpr
	}
	c := float64(count)
	return []models.FormulaBlock{{ID: id(), Type: "const", Num: &c}, {ID: id(), Type: "op", Value: "d"}, die}, nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'DamageExpr' -v`
Expected: PASS, every case listed.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/damage_expr.go warhammer-battle-helper-backend/internal/systems/custom/damage_expr_test.go warhammer-battle-helper-front/src/systems/custom/formula/damage_expr_cases.json
git branch --show-current && git commit -m "feat: PLAYRPG-288 parse player damage expressions into formula blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Go — string damage overrides, `addOnCreate` model, no preset fallback

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:335-376` (comments on `PresetWeapons`/`PresetRows`, `PresetWeapon`, `PresetRow`)
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go:310-340`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/character.go:38-58`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/weapon.go`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go:64-66` (comment only)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/weapon_test.go`

**Interfaces:**
- Consumes: `parseDamageExpr(s, idPrefix string)`, `ErrInvalidDamageExpr` (Task 1).
- Produces: `WeaponRow.Damage map[string]string`; `PresetWeapon.Damage map[string]string`; `PresetWeapon.AddOnCreate bool` / `PresetRow.AddOnCreate bool` (`bson/json: "addOnCreate,omitempty"`); `func applyDamageOverrides(blocks []models.FormulaBlock, overrides map[string]string) ([]models.FormulaBlock, error)`; `resolveWeaponRow` removed (callers use `findWeaponRow(stats, fieldKey, rowID)`).

- [ ] **Step 1: Update tests to the new types and behavior (failing)**

In `weapon_test.go`:
- Every `Damage: map[string]float64{...}` becomes `map[string]string` with quoted values, e.g. `Damage: map[string]string{"c1": "2", "d1": "6"}`.
- Delete `TestRollWeaponWithTemplate_AlwaysOnPresetRollsFromTemplate` (lines 157–187) — presets are no longer rolled from the template.
- Append:

```go
// weaponTemplateWithModifier: damage "1d4 + ▢", the ▢ filled per row by the player.
func weaponTemplateWithModifier(modifier string) (*models.SystemTemplate, []byte) {
	template, _ := weaponTemplate()
	template.Sections[0].Fields[0].DamageFormula = []models.FormulaBlock{
		{ID: "d1", Type: "dice", Value: "d4"},
		{Type: "op", Value: "+"},
		{ID: "m1", Type: "const_input"},
	}
	stats := Stats{
		Skills: map[string]AttrValue{"atk": {Base: 10}},
		Weapons: map[string][]WeaponRow{"weapons": {{
			ID:     "w1",
			Cells:  map[string]string{"name": "Knife", "skill": "atk"},
			Damage: map[string]string{"m1": modifier},
		}}},
	}
	raw, _ := bson.Marshal(stats)
	return template, raw
}

func TestRollWeaponWithTemplate_DiceModifierRolls(t *testing.T) {
	template, raw := weaponTemplateWithModifier("1K4")
	// attack d20 Intn 2 -> 3 (success); 1d4 Intn 2 -> 3; modifier 1K4 Intn 1 -> 2 => 5.
	res, err := newTestPlugin(2, 2, 1).RollWeaponWithTemplate(raw, template, "weapons", "w1", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.DamageRoll != 5 {
		t.Errorf("DamageRoll = %d, want 5 (3 + 2)", res.DamageRoll)
	}
	if !strings.Contains(res.DamageBreakdown, "(1d4)") {
		t.Errorf("DamageBreakdown = %q, want the modifier shown in parentheses", res.DamageBreakdown)
	}
}

func TestRollWeaponWithTemplate_NegativeModifier(t *testing.T) {
	template, raw := weaponTemplateWithModifier("-1")
	// attack Intn 2 -> success; 1d4 Intn 2 -> 3; -1 => 2.
	res, err := newTestPlugin(2, 2).RollWeaponWithTemplate(raw, template, "weapons", "w1", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.DamageRoll != 2 {
		t.Errorf("DamageRoll = %d, want 2", res.DamageRoll)
	}
}

func TestRollWeaponWithTemplate_InvalidModifierRollsNothing(t *testing.T) {
	template, raw := weaponTemplateWithModifier("abc")
	// No values: any roll panics, proving the attack is not rolled before the error.
	_, err := newTestPlugin().RollWeaponWithTemplate(raw, template, "weapons", "w1", 0)
	if !errors.Is(err, ErrInvalidDamageExpr) {
		t.Fatalf("err = %v, want ErrInvalidDamageExpr", err)
	}
}

func TestRollWeaponWithTemplate_PresetIsNotAFallbackRow(t *testing.T) {
	template, raw := weaponTemplate()
	template.Sections[0].Fields[0].PresetWeapons = []models.PresetWeapon{{
		ID: "preset_fists", Cells: map[string]string{"name": "Fists", "skill": "atk"}, AddOnCreate: true,
	}}
	if _, err := newTestPlugin().RollWeaponWithTemplate(raw, template, "weapons", "preset_fists", 0); err == nil {
		t.Fatal("rolling a preset id absent from stats must fail — presets live in rows since PLAYRPG-288")
	}
}
```

In `SystemTemplate_test.go` `TestFieldDef_DataTableRoundTripsThroughBSON`: replace `AlwaysOn: true` with `AddOnCreate: true`, `!out.PresetRows[0].AlwaysOn` with `!out.PresetRows[0].AddOnCreate`, and the message `want one always-on row` with `want one add-on-create row`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ ./internal/systems/custom/`
Expected: build FAIL — `cannot use map[string]string`, `unknown field AddOnCreate`.

- [ ] **Step 3: Change the models**

`internal/models/SystemTemplate.go` — replace the `PresetWeapons`/`PresetRows` comments and both structs:

```go
	// PresetWeapons are GM-authored weapons attached to the template (weapons_table only). Every
	// preset is a catalog entry the player can copy into a weapon row of their own; an AddOnCreate
	// preset is also copied into every new character's rows by SeedDefaults (PLAYRPG-288). Once
	// copied, the row is the player's: a later GM edit of the preset does not reach it.
	PresetWeapons []PresetWeapon `bson:"presetWeapons,omitempty" json:"presetWeapons,omitempty"`
	// PresetRows are GM-authored rows of a data_table field — the data_table counterpart of
	// PresetWeapons, with the same catalog and AddOnCreate semantics. data_table reuses Columns.
	PresetRows []PresetRow `bson:"presetRows,omitempty" json:"presetRows,omitempty"`
```

```go
// PresetWeapon is a GM-authored weapon template attached to a weapons_table field.
// Cells and Damage mirror WeaponRow exactly (column key → value, damage block id → entered text),
// so a preset is just a "row template": copying it to a player row is a plain value copy.
type PresetWeapon struct {
	ID          string            `bson:"id" json:"id"`
	Cells       map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
	Damage      map[string]string `bson:"damage,omitempty" json:"damage,omitempty"`
	AddOnCreate bool              `bson:"addOnCreate,omitempty" json:"addOnCreate,omitempty"`
}

// PresetRow is a GM-authored row of a data_table field. A separate type from PresetWeapon because
// a data row has no damage: sharing the type would carry a field that is always empty.
type PresetRow struct {
	ID          string            `bson:"id" json:"id"`
	Cells       map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
	AddOnCreate bool              `bson:"addOnCreate,omitempty" json:"addOnCreate,omitempty"`
}
```

`internal/systems/custom/character.go` — replace the `FavoriteWeapons` comment and `WeaponRow`:

```go
	// FavoriteWeapons holds the ids of the weapon rows the player has starred. Every weapon is a
	// row in Weapons since PLAYRPG-288, so ids always resolve against Weapons.
	FavoriteWeapons []string `bson:"favoriteWeapons,omitempty" json:"favoriteWeapons,omitempty"`
```

```go
// WeaponRow is one weapon in a weapons_table field — player-added, copied from the catalog, or
// seeded at creation from an AddOnCreate preset (then its ID is the preset's ID).
// Cells maps a WeaponColumn key to the entered value; Damage maps a DamageFormula block id to
// the text the player filled in: a die's faces ("6") or a ▢ expression ("1K4", "-1").
type WeaponRow struct {
	ID     string            `bson:"id" json:"id"`
	Cells  map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
	Damage map[string]string `bson:"damage,omitempty" json:"damage,omitempty"`
}
```

(`Favorite bool` is removed: nothing read it — the front end stars weapons through `favoriteWeapons`.)

- [ ] **Step 4: Rewrite `applyDamageOverrides` and drop the preset fallback**

In `weapon.go`, add `"strconv"` to imports. Replace the damage block in `RollWeaponWithTemplate`:

```go
	// Parse errors are deterministic, so reject a broken damage formula — or a player entry the
	// grammar rejects — before the attack is rolled instead of rolling and then discarding it.
	damageBlocks, err := applyDamageOverrides(field.DamageFormula, row.Damage)
	if err != nil {
		return nil, fmt.Errorf("custom: damage: %w", err)
	}
	if len(damageBlocks) > 0 {
		if _, err := parseFormula(damageBlocks); err != nil {
			return nil, fmt.Errorf("custom: damage formula: %w", err)
		}
	}
```

and `row, ok := resolveWeaponRow(stats, field, fieldKey, rowID)` with `row, ok := findWeaponRow(stats, fieldKey, rowID)`. Update the function's doc comment: drop nothing else, but the line "(already persisted in the character's stats via autosave)" stays true.

Replace `applyDamageOverrides` entirely:

```go
// applyDamageOverrides clones the GM-authored damage blocks and substitutes what the player
// entered per weapon row (keyed by block id): a die's faces, an overridden constant, and the ▢
// (const_input) expression. A ▢ expands into its parsed blocks wrapped in parentheses, so the
// breakdown shows it as one group and evalFormula needs no awareness of it. Attribute/skill blocks
// are left untouched — they resolve from stats at roll time.
func applyDamageOverrides(blocks []models.FormulaBlock, overrides map[string]string) ([]models.FormulaBlock, error) {
	out := make([]models.FormulaBlock, 0, len(blocks))
	for _, b := range blocks {
		ov := strings.TrimSpace(overrides[b.ID])
		switch b.Type {
		case "const":
			if ov != "" {
				v, err := strconv.ParseFloat(ov, 64)
				if err != nil {
					return nil, fmt.Errorf("%w: %q", ErrInvalidDamageExpr, ov)
				}
				b.Num = &v
			}
		case "dice":
			if ov != "" {
				sides, err := strconv.Atoi(ov)
				if err != nil || sides < 1 {
					return nil, fmt.Errorf("%w: %q", ErrInvalidDamageExpr, ov)
				}
				b.Value = fmt.Sprintf("d%d", sides)
			}
		case "const_input":
			// Unfilled falls back to 0 (the sheet blocks rolling with an empty ▢, so this is only
			// a safety net).
			if ov == "" {
				zero := 0.0
				out = append(out, models.FormulaBlock{ID: b.ID, Type: "const", Num: &zero})
				continue
			}
			expr, err := parseDamageExpr(ov, b.ID)
			if err != nil {
				return nil, err
			}
			out = append(out, models.FormulaBlock{ID: b.ID + ".open", Type: "paren_open"})
			out = append(out, expr...)
			out = append(out, models.FormulaBlock{ID: b.ID + ".close", Type: "paren_close"})
			continue
		}
		out = append(out, b)
	}
	return out, nil
}
```

Delete `resolveWeaponRow` (and its comment). In `formula_eval.go:64-65` the comment stays accurate (a const_input never reaches `blockValue`); leave it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/models/ ./internal/systems/custom/`
Expected: PASS. If `go build` reports another reader of `Favorite`, `AlwaysOn` or a `float64` damage map, fix it the same way (expected: none — grep confirmed only these files).

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal
git branch --show-current && git commit -m "feat: PLAYRPG-288 damage overrides accept dice expressions; presets become addOnCreate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Go — `SeedDefaults` copies `addOnCreate` presets

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:63-117`
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (next to the other `TestSeedDefaults_*`, after line ~1500)

**Interfaces:**
- Consumes: `PresetWeapon.AddOnCreate`, `PresetRow.AddOnCreate`, `WeaponRow`, `TableRow` (Task 2).
- Produces: a new character in a custom game starts with one row per `addOnCreate` preset, `row.ID == preset.ID`.

- [ ] **Step 1: Write the failing tests**

```go
func TestSeedDefaults_AddOnCreatePresetsBecomeRows(t *testing.T) {
	s := seedBlank(t, seedTemplate(
		models.FieldDef{Key: "weapons", Type: "weapons_table", PresetWeapons: []models.PresetWeapon{
			{ID: "preset_fists", Cells: map[string]string{"name": "Fists"}, Damage: map[string]string{"d1": "3"}, AddOnCreate: true},
			{ID: "preset_sword", Cells: map[string]string{"name": "Sword"}},
		}},
		models.FieldDef{Key: "gear", Type: "data_table", PresetRows: []models.PresetRow{
			{ID: "preset_rope", Cells: map[string]string{"name": "Rope"}, AddOnCreate: true},
		}},
	))

	w := s.Weapons["weapons"]
	if len(w) != 1 || w[0].ID != "preset_fists" || w[0].Cells["name"] != "Fists" || w[0].Damage["d1"] != "3" {
		t.Errorf("Weapons = %+v, want only the add-on-create preset, id kept", w)
	}
	r := s.Tables["gear"]
	if len(r) != 1 || r[0].ID != "preset_rope" || r[0].Cells["name"] != "Rope" {
		t.Errorf("Tables = %+v, want the add-on-create row, id kept", r)
	}
}

func TestSeedDefaults_SeededRowDoesNotShareMapsWithTemplate(t *testing.T) {
	tmpl := seedTemplate(models.FieldDef{Key: "weapons", Type: "weapons_table", PresetWeapons: []models.PresetWeapon{
		{ID: "p1", Cells: map[string]string{"name": "Fists"}, AddOnCreate: true},
	}})
	s := seedBlank(t, tmpl)
	s.Weapons["weapons"][0].Cells["name"] = "changed"
	if got := tmpl.Sections[0].Fields[0].PresetWeapons[0].Cells["name"]; got != "Fists" {
		t.Errorf("preset cell = %q, want Fists — the seeded row must be a copy", got)
	}
}
```

(`seedBlank` and `seedTemplate` already exist in `roller_test.go`; check `seedTemplate` accepts variadic fields — `TestSeedDefaults_OtherTypesIgnored` passes several. `seedBlank` decodes stats, so the second test mutates a decoded copy; it still proves the template is intact after seeding.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'SeedDefaults' -v`
Expected: FAIL — `Weapons = map[]`.

- [ ] **Step 3: Implement**

In `plugin.go` `SeedDefaults`, extend the doc comment with: `AddOnCreate presets of weapons_table and data_table fields are copied into Weapons / Tables as rows that keep the preset's ID (PLAYRPG-288) — the id is what makes migrate-weapon-presets idempotent.` Then add two cases to the `switch field.Type`:

```go
			case "weapons_table":
				for _, p := range field.PresetWeapons {
					if p.AddOnCreate {
						s.Weapons[field.Key] = append(s.Weapons[field.Key], WeaponRow{ID: p.ID, Cells: copyStrings(p.Cells), Damage: copyStrings(p.Damage)})
					}
				}
			case "data_table":
				for _, p := range field.PresetRows {
					if p.AddOnCreate {
						s.Tables[field.Key] = append(s.Tables[field.Key], TableRow{ID: p.ID, Cells: copyStrings(p.Cells)})
					}
				}
```

Before the loop, next to the existing nil-map guards:

```go
	if s.Weapons == nil {
		s.Weapons = map[string][]WeaponRow{}
	}
	if s.Tables == nil {
		s.Tables = map[string][]TableRow{}
	}
```

At the bottom of `plugin.go`:

```go
// copyStrings returns an independent copy, so a seeded row never aliases its template preset.
func copyStrings(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
```

(If `flattenFields` does not descend into `weapons_table`/`data_table` — it returns leaf fields including tables — no change needed; the nested-sections test pattern in `nested_sections_test.go` confirms it walks sections.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/plugin.go warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git branch --show-current && git commit -m "feat: PLAYRPG-288 seed addOnCreate presets as rows of a new character

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Migration `cmd/migrate-weapon-presets` + DEPLOY.md

**Files:**
- Create: `warhammer-battle-helper-backend/cmd/migrate-weapon-presets/main.go`
- Create: `warhammer-battle-helper-backend/cmd/migrate-weapon-presets/main_test.go`
- Modify: `DEPLOY.md` (new section after PLAYRPG-279)

**Interfaces:**
- Consumes: nothing from the Go packages at runtime — documents are handled as `bson.M` because the new typed structs cannot decode a stored `double` into `string`.
- Produces (pure, tested): `func migrateSections(sections primitive.A) (presets []legacyPreset, changed bool)`; `func migrateStats(stats bson.M, presets []legacyPreset) bool`; `type legacyPreset struct { FieldKey, Kind string; Row bson.M }` (`Kind` is `"weapons"` or `"tables"`).

- [ ] **Step 1: Write the failing tests**

`main_test.go`:

```go
package main

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func legacySections() primitive.A {
	weapons := bson.M{
		"key": "weapons", "type": "weapons_table",
		"presetWeapons": primitive.A{
			bson.M{"id": "preset_fists", "cells": bson.M{"name": "Fists"}, "damage": bson.M{"d1": 3.0}, "alwaysOn": true},
			bson.M{"id": "preset_sword", "damage": bson.M{"d1": 8.0}},
		},
	}
	gear := bson.M{"key": "gear", "type": "data_table",
		"presetRows": primitive.A{bson.M{"id": "preset_rope", "cells": bson.M{"name": "Rope"}, "alwaysOn": true}}}
	nested := bson.M{"key": "s1", "type": "section", "section": bson.M{"fields": primitive.A{gear}}}
	return primitive.A{bson.M{"id": "sec", "fields": primitive.A{weapons, nested}}}
}

func TestMigrateSections(t *testing.T) {
	secs := legacySections()
	presets, changed := migrateSections(secs)
	if !changed {
		t.Fatal("changed = false, want true")
	}
	if len(presets) != 2 || presets[0].Row["id"] != "preset_fists" || presets[0].Kind != "weapons" ||
		presets[1].Row["id"] != "preset_rope" || presets[1].Kind != "tables" || presets[1].FieldKey != "gear" {
		t.Fatalf("presets = %+v, want fists (weapons) then rope (tables, nested)", presets)
	}
	fists := secs[0].(bson.M)["fields"].(primitive.A)[0].(bson.M)["presetWeapons"].(primitive.A)[0].(bson.M)
	if fists["damage"].(bson.M)["d1"] != "3" || fists["addOnCreate"] != true || fists["alwaysOn"] != nil {
		t.Errorf("fists = %+v, want damage \"3\", addOnCreate, no alwaysOn", fists)
	}
	sword := secs[0].(bson.M)["fields"].(primitive.A)[0].(bson.M)["presetWeapons"].(primitive.A)[1].(bson.M)
	if sword["damage"].(bson.M)["d1"] != "8" || sword["addOnCreate"] != nil {
		t.Errorf("sword = %+v, want damage \"8\" and no flag", sword)
	}

	if presets, changed := migrateSections(secs); changed || len(presets) != 0 {
		t.Errorf("second run: changed=%v presets=%d, want a no-op", changed, len(presets))
	}
}

func TestMigrateStats(t *testing.T) {
	presets, _ := migrateSections(legacySections())
	stats := bson.M{"weapons": bson.M{"weapons": primitive.A{
		bson.M{"id": "w1", "damage": bson.M{"d1": 6.0, "m1": 2.5}, "favorite": true},
	}}}

	if !migrateStats(stats, presets) {
		t.Fatal("migrateStats = false, want true")
	}
	rows := stats["weapons"].(bson.M)["weapons"].(primitive.A)
	if len(rows) != 2 || rows[1].(bson.M)["id"] != "preset_fists" {
		t.Fatalf("weapons = %+v, want w1 then the copied preset", rows)
	}
	w1 := rows[0].(bson.M)
	if w1["damage"].(bson.M)["d1"] != "6" || w1["damage"].(bson.M)["m1"] != "2.5" || w1["favorite"] != nil {
		t.Errorf("w1 = %+v, want text damage and no favorite", w1)
	}
	if rows[1].(bson.M)["addOnCreate"] != nil || rows[1].(bson.M)["alwaysOn"] != nil {
		t.Errorf("copied row %+v must not carry the preset flag", rows[1])
	}
	gear := stats["tables"].(bson.M)["gear"].(primitive.A)
	if len(gear) != 1 || gear[0].(bson.M)["id"] != "preset_rope" {
		t.Errorf("tables.gear = %+v, want the rope row", gear)
	}

	// A re-run (e.g. after a crash before the template rename) must not duplicate rows.
	if migrateStats(stats, presets) {
		t.Error("second run changed stats, want a no-op")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./cmd/migrate-weapon-presets/`
Expected: FAIL — `undefined: migrateSections`.

- [ ] **Step 3: Implement**

`main.go`:

```go
// migrate-weapon-presets moves stored damage values to text and always-on presets into rows
// (PLAYRPG-288).
//
//	system_templates.sections, games.customSystemTemplate.sections:
//	    presetWeapons[].damage numbers -> text, alwaysOn -> addOnCreate (also presetRows)
//	characters (custom games): stats.weapons.*[].damage numbers -> text, drop .favorite;
//	    every alwaysOn preset of the game's template copied in as a row with the preset's id
//
// Per game, characters are migrated before the game's template is renamed, so a crash leaves the
// alwaysOn flags in place and a re-run finishes the job; copies are deduplicated by row id. A
// second run reports zeros. Run it right after deploying: until then characters and games with
// entered weapon damage fail to load ("cannot decode double into a string type").
//
// Usage:
//
//	MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-weapon-presets/
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsonrw"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// legacyPreset is an always-on preset found in a template, waiting to be copied into characters.
type legacyPreset struct {
	FieldKey string
	Kind     string // "weapons" | "tables" — the stats map it lands in
	Row      bson.M
}

// textDamage rewrites numeric values of a damage map as text; reports whether anything changed.
func textDamage(v interface{}) bool {
	dmg, ok := v.(bson.M)
	if !ok {
		return false
	}
	changed := false
	for k, val := range dmg {
		switch n := val.(type) {
		case float64:
			dmg[k] = strconv.FormatFloat(n, 'f', -1, 64)
			changed = true
		case int32:
			dmg[k] = strconv.Itoa(int(n))
			changed = true
		case int64:
			dmg[k] = strconv.FormatInt(n, 10)
			changed = true
		}
	}
	return changed
}

// migrateSections walks a template's sections (descending into nested sections), converts preset
// damage to text and renames alwaysOn to addOnCreate. It returns the presets that were alwaysOn.
func migrateSections(sections primitive.A) ([]legacyPreset, bool) {
	var presets []legacyPreset
	changed := false
	var walkFields func(fields primitive.A)
	walkFields = func(fields primitive.A) {
		for _, f := range fields {
			field, ok := f.(bson.M)
			if !ok {
				continue
			}
			key, _ := field["key"].(string)
			for listKey, kind := range map[string]string{"presetWeapons": "weapons", "presetRows": "tables"} {
				list, _ := field[listKey].(primitive.A)
				for _, p := range list {
					preset, ok := p.(bson.M)
					if !ok {
						continue
					}
					if textDamage(preset["damage"]) {
						changed = true
					}
					if on, has := preset["alwaysOn"]; has {
						delete(preset, "alwaysOn")
						changed = true
						if on == true {
							preset["addOnCreate"] = true
							presets = append(presets, legacyPreset{FieldKey: key, Kind: kind, Row: presetRow(preset)})
						}
					}
				}
			}
			if sec, ok := field["section"].(bson.M); ok {
				if inner, ok := sec["fields"].(primitive.A); ok {
					walkFields(inner)
				}
			}
		}
	}
	for _, s := range sections {
		if sec, ok := s.(bson.M); ok {
			if fields, ok := sec["fields"].(primitive.A); ok {
				walkFields(fields)
			}
		}
	}
	return presets, changed
}

// presetRow is the row a preset becomes in a character: id, cells, damage — never the flag.
func presetRow(preset bson.M) bson.M {
	row := bson.M{"id": preset["id"]}
	for _, k := range []string{"cells", "damage"} {
		if v, ok := preset[k]; ok {
			row[k] = v
		}
	}
	return row
}

// migrateStats converts a character's weapon damage to text, drops the dead row.favorite, and
// appends every preset whose id the character does not have yet. Reports whether it changed.
func migrateStats(stats bson.M, presets []legacyPreset) bool {
	changed := false
	if weapons, ok := stats["weapons"].(bson.M); ok {
		for _, rows := range weapons {
			list, _ := rows.(primitive.A)
			for _, r := range list {
				row, ok := r.(bson.M)
				if !ok {
					continue
				}
				if textDamage(row["damage"]) {
					changed = true
				}
				if _, has := row["favorite"]; has {
					delete(row, "favorite")
					changed = true
				}
			}
		}
	}
	for _, p := range presets {
		byField, ok := stats[p.Kind].(bson.M)
		if !ok {
			byField = bson.M{}
			stats[p.Kind] = byField
		}
		list, _ := byField[p.FieldKey].(primitive.A)
		if hasRow(list, p.Row["id"]) {
			continue
		}
		byField[p.FieldKey] = append(list, copyM(p.Row))
		changed = true
	}
	return changed
}

func hasRow(list primitive.A, id interface{}) bool {
	for _, r := range list {
		if row, ok := r.(bson.M); ok && row["id"] == id {
			return true
		}
	}
	return false
}

// copyM deep-copies one level of nested maps, so characters never share a preset's maps.
func copyM(m bson.M) bson.M {
	out := bson.M{}
	for k, v := range m {
		if inner, ok := v.(bson.M); ok {
			out[k] = copyM(inner)
		} else {
			out[k] = v
		}
	}
	return out
}

// decodeM decodes a raw document with every nested document as bson.M (the driver's default is
// primitive.D for nested documents inside interface{} values).
func decodeM(raw bson.Raw) (bson.M, error) {
	dec, err := bson.NewDecoder(bsonrw.NewBSONDocumentReader(raw))
	if err != nil {
		return nil, err
	}
	dec.DefaultDocumentM()
	var out bson.M
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

func migrateTemplates(ctx context.Context, col *mongo.Collection) int {
	cursor, err := col.Find(ctx, bson.M{})
	if err != nil {
		log.Fatalf("system_templates find: %v", err)
	}
	defer cursor.Close(ctx)
	n := 0
	for cursor.Next(ctx) {
		doc, err := decodeM(cursor.Current)
		if err != nil {
			log.Fatalf("system_templates decode: %v", err)
		}
		sections, _ := doc["sections"].(primitive.A)
		if _, changed := migrateSections(sections); !changed {
			continue
		}
		if _, err := col.UpdateOne(ctx, bson.M{"_id": doc["_id"]}, bson.M{"$set": bson.M{"sections": sections}}); err != nil {
			log.Fatalf("system_templates %v: %v", doc["_id"], err)
		}
		n++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("system_templates cursor: %v", err)
	}
	return n
}

func migrateGames(ctx context.Context, games, characters *mongo.Collection) (int, int) {
	cursor, err := games.Find(ctx, bson.M{"customSystemTemplate": bson.M{"$exists": true}})
	if err != nil {
		log.Fatalf("games find: %v", err)
	}
	defer cursor.Close(ctx)
	nGames, nChars := 0, 0
	for cursor.Next(ctx) {
		doc, err := decodeM(cursor.Current)
		if err != nil {
			log.Fatalf("games decode: %v", err)
		}
		tmpl, _ := doc["customSystemTemplate"].(bson.M)
		sections, _ := tmpl["sections"].(primitive.A)
		presets, changed := migrateSections(sections)
		nChars += migrateCharacters(ctx, characters, doc["_id"], presets)
		if !changed {
			continue
		}
		if _, err := games.UpdateOne(ctx, bson.M{"_id": doc["_id"]}, bson.M{"$set": bson.M{"customSystemTemplate.sections": sections}}); err != nil {
			log.Fatalf("games %v: %v", doc["_id"], err)
		}
		nGames++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("games cursor: %v", err)
	}
	return nGames, nChars
}

// migrateCharacters runs before the game's template is written back, so the alwaysOn flags that
// produced presets survive a crash here and a re-run copies what is still missing.
func migrateCharacters(ctx context.Context, col *mongo.Collection, gameID interface{}, presets []legacyPreset) int {
	cursor, err := col.Find(ctx, bson.M{"gameId": gameID, "gameSystem": "custom"})
	if err != nil {
		log.Fatalf("characters find: %v", err)
	}
	defer cursor.Close(ctx)
	n := 0
	for cursor.Next(ctx) {
		doc, err := decodeM(cursor.Current)
		if err != nil {
			log.Fatalf("characters decode: %v", err)
		}
		stats, _ := doc["stats"].(bson.M)
		if stats == nil || !migrateStats(stats, presets) {
			continue
		}
		if _, err := col.UpdateOne(ctx, bson.M{"_id": doc["_id"]}, bson.M{"$set": bson.M{"stats": stats}}); err != nil {
			log.Fatalf("characters %v: %v", doc["_id"], err)
		}
		n++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("characters cursor: %v", err)
	}
	return n
}

func main() {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27018"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		log.Fatal("MONGO_DB env variable is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database(dbName)
	fmt.Printf("system_templates migrated: %d\n", migrateTemplates(ctx, db.Collection("system_templates")))
	nGames, nChars := migrateGames(ctx, db.Collection("games"), db.Collection("characters"))
	fmt.Printf("games migrated: %d\ncharacters migrated: %d\n", nGames, nChars)
}
```

Check before running: `grep -n '"custom"' internal/systems/registry/registry.go` confirms the custom system key is `"custom"`; if a character's `gameSystem` is stored differently, adjust the filter.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go vet ./cmd/migrate-weapon-presets/ && go test ./cmd/migrate-weapon-presets/ -v`
Expected: PASS.

- [ ] **Step 5: Add the DEPLOY.md section**

After the PLAYRPG-279 section (before its trailing `---`), append:

```markdown
### PLAYRPG-288 — damage text values and add-on-create presets

Weapon damage values move from numbers to text, and "always on the sheet" presets become rows of
each character. Until the migration runs, characters and games with entered weapon damage fail
to load. Same procedure as above:

1. Stop `autopull.service` if enabled.
2. Deploy: `cd /opt/warhammer-battle-helper && bash scripts/deploy.sh`
3. Immediately run:

```bash
cd /opt/warhammer-battle-helper
docker run --rm --network warhammer-battle-helper_default \
  -v "$PWD/warhammer-battle-helper-backend":/src -w /src \
  -e MONGO_URI='mongodb://<user>:<password>@mongo:27017/?authSource=admin' \
  -e MONGO_DB=<db-name> \
  golang:1.24-alpine go run ./cmd/migrate-weapon-presets/
```

It prints three counts; a second run prints zeros, and it is safe to re-run if it fails midway.
Browser tabs left open on the old frontend save damage as numbers and get a 400, so ask active
players and creators to reload.

Then open a game that had an "always on" weapon and check that it is now an editable row.
```

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/cmd/migrate-weapon-presets DEPLOY.md
git branch --show-current && git commit -m "feat: PLAYRPG-288 migration for text damage and add-on-create preset rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: JS damage-expression validator

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/formula/damageExpr.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/formula/damageExpr.test.js`

**Interfaces:**
- Consumes: `damage_expr_cases.json` (Task 1).
- Produces: `export function isValidDamageExpr(input: string): boolean`.

- [ ] **Step 1: Write the failing test**

```js
import { isValidDamageExpr } from './damageExpr';
import cases from './damage_expr_cases.json';

// Cross-language contract with the backend's parseDamageExpr (damage_expr_test.go): the sheet
// must reject exactly what the roll would reject.
describe('isValidDamageExpr agrees with damage_expr_cases.json', () => {
  test.each(cases.map(c => [JSON.stringify(c.input), c]))('%s', (_name, c) => {
    expect(isValidDamageExpr(c.input)).toBe(c.valid);
  });
});

test('null and undefined are invalid', () => {
  expect(isValidDamageExpr(null)).toBe(false);
  expect(isValidDamageExpr(undefined)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=damageExpr`
Expected: FAIL — `Cannot find module './damageExpr'`.

- [ ] **Step 3: Implement**

```js
// Mirror of the backend's parseDamageExpr (internal/systems/custom/damage_expr.go): the grammar of
// a player-filled ▢ in a damage formula. Only validity lives here — the roll is computed in Go —
// and damage_expr_cases.json pins both sides, so a grammar or cap change must touch both.
//
//   expr := [sign] term (sign term)*
//   term := [count] ('k' | 'd') faces | number

const MAX_DICE = 100;
const MAX_FACES = 1000;
const MAX_CONST = 9999;
const TERM = /^(?:(\d*)[dk](\d+)|(\d+))$/;

function validTerm(term) {
  const m = TERM.exec(term);
  if (!m) return false;
  if (m[3] !== undefined) return Number(m[3]) <= MAX_CONST;
  const faces = Number(m[2]);
  if (faces < 1 || faces > MAX_FACES) return false;
  if (m[1] === '') return true;
  const count = Number(m[1]);
  return count >= 1 && count <= MAX_DICE;
}

export function isValidDamageExpr(input) {
  const s = String(input ?? '').replace(/\s+/g, '').toLowerCase();
  const body = /^[+-]/.test(s) ? s.slice(1) : s;
  if (body === '') return false;
  return body.split(/[+-]/).every(validTerm);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=damageExpr`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/formula/damageExpr.js warhammer-battle-helper-front/src/systems/custom/formula/damageExpr.test.js
git branch --show-current && git commit -m "feat: PLAYRPG-288 sheet-side damage expression validator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sheet ▢ as a text input with validation and tooltip

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.js:40-160`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx:63-70`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx:339-340`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:961-971`
- Modify: `warhammer-battle-helper-front/src/style.css` (after `.custom-sheet__weapon-dmg-input--missing::placeholder`, ~line 9287)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Test: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.rowIssue.test.js`, `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponsTable.test.jsx`

**Interfaces:**
- Consumes: `isValidDamageExpr` (Task 5).
- Produces: `weaponRowIssue(field, row)` may return `'damageInvalid'`; `renderDamageFormula(blocks, row, fieldKey, onChange, readOnly, t, tooltip = null)` where `tooltip = { show(text, el), hide() }`; damage values are stored as strings.

- [ ] **Step 1: Write failing tests**

Append to `weaponLayout.rowIssue.test.js`:

```js
const playerExpr = { id: 'm1', type: 'const_input' };

test('a dice expression in the player field is rollable', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: '1K4' } })).toBeNull();
});

test('an empty player field blocks the roll as incomplete', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: '  ' } })).toBe('damage');
});

test('an invalid player field blocks the roll as invalid', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: 'abc' } })).toBe('damageInvalid');
});

test('incomplete wins over invalid', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr, playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: 'abc' } })).toBe('damage');
});
```

and change the existing complete-row fixture to string damage: `damage: { b1: '6' }`.

In `CustomSheetBody.weaponsTable.test.jsx`, change every numeric `damage: { ...: N }` fixture to strings, then add a test (adapt the render helper already in that file — it renders `CustomSheetBody` with a weapons_table field and an `onChange` object):

```js
test('the player field is a text input that accepts dice', () => {
  // field: damageFormula [{ id: 'd1', type: 'dice', value: 'd4' }, { type: 'op', value: '+' }, { id: 'm1', type: 'const_input' }]
  // row:   { id: 'w1', cells: { name: 'Knife' }, damage: { m1: '1K4' } }, opened in edit mode
  const input = screen.getByDisplayValue('1K4');
  expect(input).toHaveAttribute('type', 'text');
  expect(input).not.toHaveClass('custom-sheet__weapon-dmg-input--missing');
});

test('an invalid player field is marked and explains itself on hover', () => {
  // same field; row damage { m1: '1K' }, opened in edit mode
  const input = screen.getByDisplayValue('1K');
  expect(input).toHaveClass('custom-sheet__weapon-dmg-input--missing');
  fireEvent.mouseEnter(input);
  expect(screen.getByText(i18n.t('customSheet.damageExprInvalid'))).toBeInTheDocument();
});
```

Write both tests with the file's existing helpers for building the field/row and entering edit mode (click the row's edit button, as the existing edit-mode tests do). If the file imports i18n as a side effect only, switch to `import i18n from '../../i18n';` because this test uses `i18n.t`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='weaponLayout|weaponsTable'`
Expected: FAIL — `'damage'` vs `'damageInvalid'`, input type `number`.

- [ ] **Step 3: Implement in `weaponLayout.js`**

Add `import { isValidDamageExpr } from './formula/damageExpr';`. Replace `weaponDamageIncomplete` (and its comment) with:

```js
// weaponDamageIssue reports what is wrong with a row's player-filled damage blocks: 'damage' when
// any is empty, 'damageInvalid' when all are filled but one is unusable, null when the row can
// roll. Empty wins: it is the gap the player most likely still means to fill. A die's faces must
// be a positive integer; a ▢ (const_input) takes a number or dice in the damageExpr grammar.
// GM-fixed blocks and backend-resolved tokens are always complete.
function weaponDamageIssue(blocks, row) {
  const dmg = row.damage || {};
  let invalid = false;
  for (const b of (blocks || [])) {
    if (b.type !== 'const_input' && !isPlayerDie(b)) continue;
    const v = dmg[b.id];
    if (v == null || String(v).trim() === '') return 'damage';
    if (b.type === 'const_input' ? !isValidDamageExpr(v) : !(Number.isInteger(Number(v)) && Number(v) > 0)) {
      invalid = true;
    }
  }
  return invalid ? 'damageInvalid' : null;
}
```

In `weaponRowIssue` replace the damage line with:

```js
  return weaponDamageIssue(field.damageFormula || [], row);
```

(and update the comment above `weaponRowIssue` — "an empty skill would silently contribute 0" stays; mention the two damage verdicts). In `weaponIssueTitle` add before the final return:

```js
  if (issue === 'damageInvalid') return t('customSheet.weaponDamageInvalid');
```

Change `renderDamageFormula`'s signature and comment, and the `const_input` case:

```js
// renderDamageFormula renders a weapon's damage skeleton inline. Player-filled blocks (a die's
// faces, the ▢ expression) become inputs bound to row.damage[block.id]; GM constants and dice,
// attribute and skill tokens are static — the backend resolves tokens from stats at roll time.
// tooltip ({ show, hide } from usePortalTooltip) adds the ▢ examples on hover while editing.
export function renderDamageFormula(blocks, row, fieldKey, onChange, readOnly, t, tooltip = null) {
```

```js
      case 'const_input': {
        // Player-filled number or dice per weapon; empty or invalid blocks the roll.
        const cv = dmg[b.id] ?? '';
        const invalid = cv !== '' && !isValidDamageExpr(cv);
        const hint = (
          <>
            {invalid && <span className="custom-sheet__weapon-dmg-hint-error">{t('customSheet.damageExprInvalid')}</span>}
            {t('customSheet.damageExprHint')}
          </>
        );
        const hover = tooltip && !readOnly;
        return (
          <input
            key={b.id}
            type="text"
            className={`custom-sheet__weapon-dmg-input custom-sheet__weapon-dmg-input--expr${cv === '' || invalid ? ' custom-sheet__weapon-dmg-input--missing' : ''}`}
            value={cv}
            placeholder="?"
            onChange={onChange ? e => onDmg(b.id, e.target.value) : undefined}
            onMouseEnter={hover ? e => tooltip.show(hint, e.currentTarget) : undefined}
            onMouseLeave={hover ? tooltip.hide : undefined}
            readOnly={readOnly}
          />
        );
      }
```

- [ ] **Step 4: Callers store strings and pass the tooltip**

`CharacterSheet.jsx:339-340`:

```js
  const updateWeaponDamage = (fieldKey, rowId, blockId, value) =>
    mapRow('weapons', fieldKey, rowId, r => ({ ...r, damage: { ...r.damage, [blockId]: value } }));
```

`TemplateBuilder.jsx:965-968` (preset damage in the creator; `showTooltip`/`hideTooltip` are in scope in `PropertyPanel`):

```jsx
                      {renderDamageFormula(field.damageFormula, preset, field.key, {
                        weaponDamage: (_fk, _rowId, blockId, val) =>
                          patch({ damage: { ...(preset.damage || {}), [blockId]: val } }),
                      }, false, t, { show: showTooltip, hide: hideTooltip })}
```

`WeaponsTable.jsx:66-70` (the `isPreset` branch dies in Task 7; pass the tooltip now):

```jsx
  const renderDamage = (row, { isPreset, editing }) => (
    <div className="custom-sheet__weapon-damage">
      {renderDamageFormula(dmgBlocks, row, field.key, isPreset ? null : onChange, isPreset || !editing, t, { show: showTooltip, hide: hideTooltip })}
    </div>
  );
```

- [ ] **Step 5: CSS and i18n**

`style.css`, directly after the `.custom-sheet__weapon-dmg-input--missing::placeholder` rule (after the base `.custom-sheet__weapon-dmg-input` rules, so the width wins):

```css
/* The ▢ takes an expression ("1K6+1"), wider than the faces of a die. */
.custom-sheet__weapon-dmg-input.custom-sheet__weapon-dmg-input--expr {
    width: 64px;
}

/* First line of the ▢ tooltip when the entry is invalid. */
.custom-sheet__weapon-dmg-hint-error {
    display: block;
    font-weight: 700;
    color: #c0392b;
}
```

Locales — under `customSheet` next to `weaponDamageIncomplete`:

en:
```json
    "weaponDamageInvalid": "Fix the damage values before rolling",
    "damageExprHint": "Number or dice, e.g. 2, -1, 1d4, 1d6+1",
    "damageExprInvalid": "Invalid expression",
```
pl:
```json
    "weaponDamageInvalid": "Popraw wartości obrażeń przed rzutem",
    "damageExprHint": "Liczba lub kość, np. 2, -1, 1K4, 1K6+1",
    "damageExprInvalid": "Niepoprawne wyrażenie",
```

Under `creator.formula`, replace `constInputTitle`:
- en: `"Number or dice the player enters per weapon on the character sheet, e.g. 2, -1, 1d4, 1d6+1"`
- pl: `"Liczba lub kość, którą gracz wpisuje per broń na karcie postaci, np. 2, -1, 1K4, 1K6+1"`

Under `creator`, replace `damageFormulaHint`:
- en: keep the existing sentence and append `" The player field (▢) also takes dice, e.g. 1d4."`
- pl: keep the existing sentence and append `" Pole gracza (▢) przyjmuje też kość, np. 1K4."`

(Read the current en text of `damageFormulaHint` first and append to it verbatim.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='weaponLayout|weaponsTable|CharacterSheet|TemplateBuilder|FormulaBuilder'`
Expected: PASS. Any remaining failure from a numeric damage fixture: convert the fixture to strings.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src
git branch --show-current && git commit -m "feat: PLAYRPG-288 player damage field takes dice, with validation and examples tooltip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Remove the read-only preset path; `addOnCreate` in creator and previews

**Files:**
- Delete: `warhammer-battle-helper-front/src/systems/custom/fields/RowTablePresetRow.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/addOnCreate.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/addOnCreate.test.js`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/RowTable.jsx` (header comment, `alwaysOnPresets`/`catalogPresets`, `unsorted`, `sortText`, `renderItem`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/RowTablePlayerRow.jsx:37`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx` (`renderDamage`, `locked` label)
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/DataTable.jsx` (`locked` label, comment)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx:249-275`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx:350-353` (comment)
- Modify: `warhammer-battle-helper-front/src/components/creator/TablePresetsEditor.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:2108-2120,2171`
- Modify: `warhammer-battle-helper-front/src/components/lobby/TemplateSheetPreview.jsx:28`
- Modify: `warhammer-battle-helper-front/src/style.css` (~9290–9330, 9369, 9416–9420, 9438–9443, 9550–9552)
- Modify: both locale files
- Test: `TablePresetsEditor.test.jsx`, `CustomSheetBody.dataTable.test.jsx`, `CharacterSheet.dataTable.test.jsx`, `CustomSheetBody.weaponsTable.test.jsx`, `TemplateBuilder.reorderHint.test.jsx`, `__snapshots__/CustomSheetBody.domShape.test.jsx.snap`

**Interfaces:**
- Consumes: `PresetWeapon.addOnCreate` / `PresetRow.addOnCreate` JSON (Task 2).
- Produces: `export function addOnCreateValues(sections): { weapons: {[fieldKey]: Row[]}, tables: {[fieldKey]: Row[]} }`; `RowTable` no longer renders presets (they only feed the catalog picker).

- [ ] **Step 1: Write the failing helper test**

`addOnCreate.test.js`:

```js
import { addOnCreateValues } from './addOnCreate';

test('add-on-create presets become rows keyed by field, ids kept, nested sections included', () => {
  const sections = [{
    id: 's', fields: [
      { key: 'weapons', type: 'weapons_table', presetWeapons: [
        { id: 'p_fists', cells: { name: 'Fists' }, damage: { d1: '3' }, addOnCreate: true },
        { id: 'p_sword', cells: { name: 'Sword' } },
      ] },
      { key: 'sub', type: 'section', section: { id: 'sub', fields: [
        { key: 'gear', type: 'data_table', presetRows: [{ id: 'p_rope', cells: { name: 'Rope' }, addOnCreate: true }] },
      ] } },
    ],
  }];
  expect(addOnCreateValues(sections)).toEqual({
    weapons: { weapons: [{ id: 'p_fists', cells: { name: 'Fists' }, damage: { d1: '3' } }] },
    tables:  { gear: [{ id: 'p_rope', cells: { name: 'Rope' } }] },
  });
});

test('no presets, no rows', () => {
  expect(addOnCreateValues([])).toEqual({ weapons: {}, tables: {} });
});
```

Update the other tests to the new behavior (they currently assert the read-only path):
- `TablePresetsEditor.test.jsx`: `alwaysOn` → `addOnCreate`; label lookups via `i18n.t('creator.tablePresetAddOnCreate')`.
- `CustomSheetBody.dataTable.test.jsx`, `CustomSheetBody.weaponsTable.test.jsx`, `CharacterSheet.dataTable.test.jsx`: delete tests asserting a preset renders read-only/locked on the sheet; replace with one test per table asserting an `addOnCreate` preset is **not** rendered as a row but **is** offered in the "add from list" `<select>`.
- `TemplateBuilder.reorderHint.test.jsx`: rename `alwaysOn` fixtures to `addOnCreate`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='addOnCreate|TablePresetsEditor|dataTable|weaponsTable|reorderHint'`
Expected: FAIL — missing module, `alwaysOn` switch still rendered, presets still rendered as rows.

- [ ] **Step 3: Implement the helper**

`addOnCreate.js`:

```js
import { walkFields } from '../../utils/templateSections';

// addOnCreateValues builds the rows a brand-new character gets from the template's addOnCreate
// presets — the front-end view of the backend's SeedDefaults (plugin.go), same ids. The creator and
// the lobby preview pass it as `values` so they show the sheet a new player actually starts with.
export function addOnCreateValues(sections) {
  const weapons = {};
  const tables = {};
  walkFields(sections, (f) => {
    if (f.type === 'weapons_table') {
      const rows = (f.presetWeapons || []).filter(p => p.addOnCreate)
        .map(p => ({ id: p.id, cells: { ...(p.cells || {}) }, damage: { ...(p.damage || {}) } }));
      if (rows.length) weapons[f.key] = rows;
    }
    if (f.type === 'data_table') {
      const rows = (f.presetRows || []).filter(p => p.addOnCreate)
        .map(p => ({ id: p.id, cells: { ...(p.cells || {}) } }));
      if (rows.length) tables[f.key] = rows;
    }
  });
  return { weapons, tables };
}
```

(Confirm `walkFields` descends into nested sections — `CharacterDetails.jsx` relies on it for nested weapons tables.)

- [ ] **Step 4: Strip the preset path from the sheet**

`RowTable.jsx`:
- Remove `import RowTablePresetRow from './RowTablePresetRow';`.
- Replace `const alwaysOnPresets = ...; const catalogPresets = ...;` with nothing and use `presets` directly for the picker (`catalogPresets.length` → `presets.length`, `catalogPresets.find`/`.map` → `presets.find`/`.map`).
- `const unsorted = rows.map(row => ({ row }));` stays a list of `{ row }` items, so `isEditing`/`pinned`/`sortByText` keep working; simplify `sortText` to `return (item.row.cells || {})[sortKey];` after the edit check.
- `renderItem = ({ row }) => (<RowTablePlayerRow ... />)` — drop the preset branch.
- Header comment: "a header bar, the player's rows, and a footer that adds a row or copies one from the GM's catalog"; the twoColumns paragraph: "splits the rows into two halves"; the sortKey paragraph: "orders rows by that column".

`RowTablePlayerRow.jsx:37`: `const ctx = { editing };`

`WeaponsTable.jsx`:

```jsx
  // Damage is read-only on a row at rest: its inputs are part of the weapon's definition, not of play.
  const renderDamage = (row, { editing }) => (
    <div className="custom-sheet__weapon-damage">
      {renderDamageFormula(dmgBlocks, row, field.key, onChange, !editing, t, { show: showTooltip, hide: hideTooltip })}
    </div>
  );
```

Remove the `locked:` label line from `WeaponsTable.jsx` and `DataTable.jsx`; `DataTable.jsx` comment: "GM columns and player rows (some seeded from the GM's presets)". Check `RowTablePlayerRow.jsx` for a `labels.locked` reader (expected: none — only the preset row used it).

Delete `fields/RowTablePresetRow.jsx`.

`CharacterDetails.jsx:249-275`: comment becomes "Favourite weapons are a flat list of weapon row ids (stats.weapons). We resolve each id to its owning weapons_table field so a roll can carry the {fieldKey, rowId} the backend expects."; delete `(f.presetWeapons || []).forEach(collect);`.

`CharacterSheet.jsx:350-353` comment: "Weapon favorites are tracked by row id in favoriteWeapons, so CharacterDetails can resolve and roll them."

- [ ] **Step 5: Creator switch and previews**

`TablePresetsEditor.jsx`: rename the `SortablePreset` prop `alwaysOn` → `addOnCreate` (both the parameter and `{addOnCreate}` in the JSX); the switch:

```jsx
                addOnCreate={(
                  <FormControlLabel
                    control={<Switch size="small" checked={!!preset.addOnCreate} onChange={e => update(i, { addOnCreate: e.target.checked })} />}
                    label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.tablePresetAddOnCreate')}</Typography>}
                  />
                )}
```

`add` creates `{ id: genId('preset'), cells: {} }` (no flag — false is the absent value). Comments: the component comment becomes "plus an 'add when a character is created' switch. Every preset is in the catalog players copy from; a flagged one is also copied into each new character (a later GM edit does not reach existing characters)."; the `SortablePreset` comment: "next to the 'add on create' switch"; the sortedOnSheet comment: "catalog presets are not sorted on the sheet".

`TemplateBuilder.jsx` — import `addOnCreateValues` from `'../../systems/custom/addOnCreate'`; next to the other memos in the component that renders line 2108 add:

```js
  // What a new character starts with: the creator shows the GM's addOnCreate presets as rows.
  const previewValues = useMemo(() => addOnCreateValues(sections), [sections]);
```

and pass `values={previewValues}` to the main `<CustomSheetBody sections={sections} ...>` (line ~2108). For the two drag-ghost renders (`<CustomSheetBody sections={draggedGhostSections} />`, lines ~2120 and ~2171) pass `values={addOnCreateValues(draggedGhostSections)}` so the ghost has the dragged table's real height.

`TemplateSheetPreview.jsx:28`: `<CustomSheetBody sections={template.sections} values={addOnCreateValues(template.sections)} showAffordances />` plus the import.

- [ ] **Step 6: CSS cleanup**

In `style.css`:
- In the comment block before `.custom-sheet__row-table-row--preset .custom-sheet__weapon-dmg-input` (~9289–9306): rewrite to explain only the `--reading` case (a player's row at rest keeps a `readonly` input that must not look like "fill me in").
- Remove the `.custom-sheet__row-table-row--preset ...` selector from the three grouped rules (~9309, ~9316, ~9327), keeping the `--reading` selector; adjust the `:focus` rule's comment to say "this selector" instead of "both selectors".
- Remove `.custom-sheet__row-table-lock,` from the shared actions geometry list (~9369) and delete the `.custom-sheet__row-table-lock { ... }` rule with its comment (~9413–9420).
- Delete `.custom-sheet__row-table-row--preset .custom-sheet__row-table-cell-static` with its comment (~9438–9443) and `.custom-sheet__row-table-row--preset .custom-sheet__row-table-detail-text` (~9550–9552).
- Verify: `grep -n "row-table-row--preset\|row-table-lock" warhammer-battle-helper-front/src` returns nothing.

- [ ] **Step 7: i18n**

Both locales:
- Delete `customSheet.weaponPresetLocked`, `customSheet.rowPresetLocked`, `creator.tablePresetAlwaysOn`.
- Add `creator.tablePresetAddOnCreate`: en `"Add when a character is created"`, pl `"Dodaj przy tworzeniu postaci"`.
- `creator.weaponPresetsHint`: en `"Define weapons the GM provides. Players add them from a list; weapons marked \"add when a character is created\" are already on every new character's sheet, as the player's own editable rows."`; pl `"Zdefiniuj bronie udostępniane przez MG. Gracze dodają je z listy; bronie oznaczone „dodaj przy tworzeniu postaci” są od razu na karcie każdej nowej postaci jako jej własne, edytowalne wiersze."`
- `creator.dataTablePresetsHint`: same text with rows: en `"Define rows the GM provides. Players add them from a list; rows marked \"add when a character is created\" are already on every new character's sheet, as the player's own editable rows."`; pl `"Zdefiniuj wiersze udostępniane przez MG. Gracze dodają je z listy; wiersze oznaczone „dodaj przy tworzeniu postaci” są od razu na karcie każdej nowej postaci jako jej własne, edytowalne wiersze."`
- Tutorial `tutorial.creatorField.*.data_table` (line ~1202): en `"The columns — including long text shown in an expandable row — and preset rows, added to every new character or offered as a list. Drag the grip to reorder columns and presets."`; pl `"Kolumny — także długi tekst pokazywany w rozwijanym wierszu — oraz predefiniowane wiersze, dodawane każdej nowej postaci albo jako lista do wyboru. Kolumny i predefiniowane pozycje ułożysz, przeciągając uchwyt."`
- Verify: `grep -rn "weaponPresetLocked\|rowPresetLocked\|tablePresetAlwaysOn\|alwaysOn" warhammer-battle-helper-front/src` returns nothing.

- [ ] **Step 8: Run the full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS except the known `App.test.js` baseline. If `CustomSheetBody.domShape.test.jsx` fails on its snapshot, read the diff: the only acceptable change is the disappearance of `--preset` rows / lock icons; then update with `CI=true npm test -- --watchAll=false --testPathPattern=domShape -u`. `tourTranslations.test.js` and `creatorTour.coverage.test.jsx` must pass unchanged.

- [ ] **Step 9: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git branch --show-current && git commit -m "feat: PLAYRPG-288 presets are added on character creation, no read-only rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end check on the local stack

**Files:** none (verification); spec touch-up if something differs.

- [ ] **Step 1: Full test runs**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS (front: `App.test.js` baseline only).

- [ ] **Step 2: Migration against local data**

With the local docker stack up (Mongo on `localhost:27018`), seed one legacy shape first if none exists — in `mongosh`, set on some custom game's template a preset `{"id":"preset_x","cells":{"name":"Fists"},"damage":{"d1":3},"alwaysOn":true}` — then run twice:

```bash
cd warhammer-battle-helper-backend
MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-weapon-presets/
MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-weapon-presets/
```

Expected: first run non-zero counts, second run `0` / `0` / `0`.

- [ ] **Step 3: Roll through the API**

Get a JWT per the local recipe (memory: clear `activationToken` on the user). In a custom game whose weapons_table damage formula is `d4 + ▢`, set a weapon row's damage `{"m1": "1K4"}` via the sheet, then:

```bash
curl -s -X POST localhost:8080/games/<gameId>/rollWeapon -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"characterId":"<id>","fieldKey":"<weaponsFieldKey>","weaponRowId":"<rowId>"}' | jq '.damageBreakdown'
```

Expected on a hit: a breakdown containing `(1d4)`. With `{"m1":"abc"}`: HTTP 400, error containing `invalid damage expression`.

- [ ] **Step 4: Report**

Report what was run and the outputs. UI not clicked in a browser unless the user does it; list for them: ▢ tooltip, red border on `1K`, roll button reason, creator switch label, creator preview shows add-on-create rows, new character gets the rows and can edit the ▢.
