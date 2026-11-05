# PLAYRPG-294 Edge/Setback Dice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A custom template's roll modifier can be switched from a number to edge/setback dice — the player picks how many extra dice from a CoC-style column and the roll keeps the best (edge) or worst (setback) result.

**Architecture:** `ModifierConfig` gains `Kind` (`number` | `dice`) plus dice fields, so the two kinds are mutually exclusive by structure. The existing request `modifier` int carries the dice count when `Kind == "dice"`; `resolveModifier` (widened to take the whole `RollConfig`) stays the single decision point and returns a new target `edge_dice`. `rollFromFormula` then either re-evaluates the formula N+1 times (`formula` mode) or rerolls only the d100 tens digit (`tens` mode), picking by the field's `successType`. Frontend: a new `EdgeDiceOverlay` column, a `RollPrompt` switch shared by both cards, creator fields, and a log summary line.

**Tech Stack:** Go (custom system plugin, table tests with `seqRoller`), React 18 + Jest/RTL (CRA), i18next v25.

Spec: `docs/superpowers/specs/PLAYRPG-294.md`.

## Global Constraints

- Names: PL „kość przewagi / kość utrudnienia”, EN „edge die / setback die”. No CoC wording (bonus/penalty) in the custom UI.
- A template has **either** the numeric modifier **or** dice — never both (`Kind`).
- Maxima: separate `maxEdge` / `maxSetback`, `0` disables that side, creator range 0–5; server caps at 5 regardless of config (`maxEdgeDice`).
- Direction from `successType`: `below_threshold` → lower is better; anything else (`above_threshold`, empty) → higher is better.
- Dice do not apply to `raw`, `dice_pool`, or `tens` mode with a formula that is not exactly one `d100` block. The column still shows; the server drops the pick silently (no error), the log shows no dice line.
- Shared strings must match exactly between `internal/systems/custom/modifier.go` and `src/systems/custom/modifierConfig.js`: `edge_dice`, `number`, `dice`, `formula`, `tens`.
- Code comments in English. All UI strings via `t('key')`, en + pl together. Icons only from `@mui/icons-material`. Tooltips via `usePortalTooltip`, never MUI `<Tooltip>` or `title=`.
- No migration: `Kind == ""` reads as `number`.
- Delete `RollConfig.RollAdvType` (dead) in Go and its default in `TemplateBuilder.jsx`.
- Frontend tests: `CI=true npm test -- --watchAll=false --testPathPattern=<name>` from `warhammer-battle-helper-front/`. Baseline fail `App.test.js` (axios ESM) is not a regression.
- Backend tests: `go test ./internal/systems/custom/...` from `warhammer-battle-helper-backend/`.
- Parallel sessions share this checkout: run `git branch --show-current` in the same command as every commit; work on `main`.

---

### Task 1: Backend — config model and modifier resolution

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`ModifierConfig`, `RollConfig`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/modifier.go`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:16` (call site only)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/modifier_test.go`

**Interfaces:**
- Produces: `models.ModifierConfig{Kind, DiceMode, MaxEdge, MaxSetback}`; constants `ModTargetEdgeDice = "edge_dice"`, `ModKindNumber = "number"`, `ModKindDice = "dice"`, `DiceModeFormula = "formula"`, `DiceModeTens = "tens"`, `maxEdgeDice = 5`; `resolveModifier(cfg *models.ModifierConfig, roll *models.RollConfig, requested int) (target string, value int)`; `isSingleD100(blocks []models.FormulaBlock) bool`.

- [ ] **Step 1: Extend the model, delete `RollAdvType`**

In `SystemTemplate.go`, inside `type ModifierConfig struct`, add after `Enabled`:

```go
	// Kind: "number" (the numeric prompt; also when empty — every pre-existing template) | "dice"
	// (edge/setback dice, PLAYRPG-294). One kind per template is what makes the two mutually
	// exclusive without a validation rule.
	Kind string `bson:"kind,omitempty" json:"kind,omitempty"`
```

and after `Presets`:

```go
	// Dice kind only. DiceMode: "formula" (default — the whole formula rolls once per extra die)
	// | "tens" (a new d100 tens digit per extra die, units kept). MaxEdge/MaxSetback: how many
	// edge/setback dice the player may pick; 0 disables that side.
	DiceMode   string `bson:"diceMode,omitempty" json:"diceMode,omitempty"`
	MaxEdge    int    `bson:"maxEdge,omitempty" json:"maxEdge,omitempty"`
	MaxSetback int    `bson:"maxSetback,omitempty" json:"maxSetback,omitempty"`
```

In `type RollConfig struct`, delete the line:

```go
	RollAdvType string `bson:"rollAdvType" json:"rollAdvType"` // "standard"|"advantage"|"disadvantage"
```

Run: `cd warhammer-battle-helper-backend && grep -rn "RollAdvType" --include='*.go' .`
Expected: no output.

- [ ] **Step 2: Write the failing tests**

In `modifier_test.go`, change the call inside `TestResolveModifier`'s loop from
`resolveModifier(tc.cfg, tc.rollMode, tc.requested)` to:

```go
			target, value := resolveModifier(tc.cfg, &models.RollConfig{RollMode: tc.rollMode}, tc.requested)
```

and append:

```go
func TestResolveModifier_EdgeDice(t *testing.T) {
	dice := func(mode string, maxEdge, maxSetback int) *models.ModifierConfig {
		return &models.ModifierConfig{Enabled: true, Kind: ModKindDice, DiceMode: mode, MaxEdge: maxEdge, MaxSetback: maxSetback}
	}
	d100 := []models.FormulaBlock{diceBlock("d100")}
	d20 := []models.FormulaBlock{diceBlock("d20")}
	below := func(f []models.FormulaBlock) *models.RollConfig {
		return &models.RollConfig{Formula: f, SuccessType: "below_threshold"}
	}

	tests := []struct {
		name       string
		cfg        *models.ModifierConfig
		roll       *models.RollConfig
		requested  int
		wantTarget string
		wantValue  int
	}{
		{"edge within max", dice(DiceModeFormula, 2, 2), below(d20), 1, ModTargetEdgeDice, 1},
		{"setback within max", dice(DiceModeFormula, 2, 2), below(d20), -2, ModTargetEdgeDice, -2},
		{"edge clamped to max", dice(DiceModeFormula, 1, 2), below(d20), 3, ModTargetEdgeDice, 1},
		{"setback clamped to max", dice(DiceModeFormula, 2, 1), below(d20), -3, ModTargetEdgeDice, -1},
		{"disabled side clamps to nothing", dice(DiceModeFormula, 0, 2), below(d20), 2, ModTargetNone, 0},
		{"zero request is no dice", dice(DiceModeFormula, 2, 2), below(d20), 0, ModTargetNone, 0},
		{"server cap beats a huge config", dice(DiceModeFormula, 99, 99), below(d20), 50, ModTargetEdgeDice, maxEdgeDice},
		{"negative max reads as zero", dice(DiceModeFormula, -3, 2), below(d20), 1, ModTargetNone, 0},
		{"raw field rolls plain", dice(DiceModeFormula, 2, 2), &models.RollConfig{Formula: d20, SuccessType: "raw"}, 1, ModTargetNone, 0},
		{"dice pool rolls plain", dice(DiceModeFormula, 2, 2), &models.RollConfig{Formula: d20, RollMode: "dice_pool"}, 1, ModTargetNone, 0},
		{"tens on d100", dice(DiceModeTens, 2, 2), below(d100), 1, ModTargetEdgeDice, 1},
		{"tens on d20 rolls plain", dice(DiceModeTens, 2, 2), below(d20), 1, ModTargetNone, 0},
		{"tens on d100+5 rolls plain", dice(DiceModeTens, 2, 2), below([]models.FormulaBlock{diceBlock("d100"), opBlock("+"), numBlock(5)}), 1, ModTargetNone, 0},
		// Kind decides the meaning of the number: a dice template never applies it as a numeric
		// modifier, and a number template never turns it into dice.
		{"number kind ignores dice fields", &models.ModifierConfig{Enabled: true, Kind: ModKindNumber, MaxEdge: 2}, below(d20), 1, ModTargetRoll, 1},
		{"empty kind is number", &models.ModifierConfig{Enabled: true, MaxEdge: 2}, below(d20), 1, ModTargetRoll, 1},
		{"disabled dice config zeroes", &models.ModifierConfig{Enabled: false, Kind: ModKindDice, MaxEdge: 2}, below(d20), 1, ModTargetNone, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target, value := resolveModifier(tc.cfg, tc.roll, tc.requested)
			if target != tc.wantTarget || value != tc.wantValue {
				t.Errorf("resolveModifier() = (%q, %d), want (%q, %d)", target, value, tc.wantTarget, tc.wantValue)
			}
		})
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run TestResolveModifier`
Expected: build failure — `cannot use &models.RollConfig{…} as string value`, `undefined: ModKindDice`.

- [ ] **Step 4: Implement**

In `modifier.go`, add to the existing target `const` block:

```go
	ModTargetEdgeDice         = "edge_dice"         // dice kind: |value| extra rolls, best (edge) or worst (setback) kept
```

Below that block add:

```go
// Modifier kinds and edge-dice modes. Shared with the frontend like the targets above.
const (
	ModKindNumber   = "number"
	ModKindDice     = "dice"
	DiceModeFormula = "formula"
	DiceModeTens    = "tens"
)

// maxEdgeDice caps edge/setback dice whatever the template says: formula mode evaluates the
// whole formula once per die, so the count is a cost a request must not pick freely.
const maxEdgeDice = 5
```

Replace `resolveModifier` with (doc comment: keep the existing paragraphs, replace the signature line and body):

```go
func resolveModifier(cfg *models.ModifierConfig, roll *models.RollConfig, requested int) (target string, value int) {
	if cfg == nil || !cfg.Enabled {
		return ModTargetNone, 0
	}
	if cfg.Kind == ModKindDice {
		return resolveEdgeDice(cfg, roll, requested)
	}
	value = clampModifier(cfg, requested)

	if roll.RollMode == "dice_pool" {
		if cfg.PoolTarget == ModTargetSuccessThreshold {
			return ModTargetSuccessThreshold, value
		}
		return ModTargetDiceCount, value
	}
	if cfg.TraditionalTarget == ModTargetThreshold {
		return ModTargetThreshold, value
	}
	return ModTargetRoll, value
}

// resolveEdgeDice decides whether edge/setback dice apply to this roll and how many. A field they
// cannot apply to rolls plainly instead of failing: the client shows the dice column for every
// roll (it cannot resolve a field's roll config), so the server is where an unusable pick drops.
func resolveEdgeDice(cfg *models.ModifierConfig, roll *models.RollConfig, requested int) (string, int) {
	if roll.RollMode == "dice_pool" || roll.SuccessType == "raw" {
		return ModTargetNone, 0
	}
	if cfg.DiceMode == DiceModeTens && !isSingleD100(roll.Formula) {
		return ModTargetNone, 0
	}
	v := clampEdgeDice(cfg, requested)
	if v == 0 {
		return ModTargetNone, 0
	}
	return ModTargetEdgeDice, v
}

// clampEdgeDice bounds the request to [-MaxSetback, MaxEdge], each side itself bounded to
// [0, maxEdgeDice] so a hand-edited negative or huge max cannot widen the range.
func clampEdgeDice(cfg *models.ModifierConfig, v int) int {
	hi := min(max(cfg.MaxEdge, 0), maxEdgeDice)
	lo := -min(max(cfg.MaxSetback, 0), maxEdgeDice)
	return min(max(v, lo), hi)
}

// isSingleD100 reports whether a formula is exactly one d100 — the only shape tens mode can
// reroll, since it replaces the tens digit of that one die.
func isSingleD100(blocks []models.FormulaBlock) bool {
	return len(blocks) == 1 && blocks[0].Type == "dice" && blocks[0].Value == "d100"
}
```

In `roller.go:16` change the call to:

```go
	modTarget, modValue := resolveModifier(template.Settings.Modifier, cfg, modifier)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/systems/custom/...`
Expected: `ok  battle-helper/internal/systems/custom`

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/systems/custom/modifier.go warhammer-battle-helper-backend/internal/systems/custom/modifier_test.go warhammer-battle-helper-backend/internal/systems/custom/roller.go && \
git commit -m "feat: PLAYRPG-294 edge/setback dice config and resolution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: branch printed is `main`.

---

### Task 2: Backend — rolling edge/setback dice

**Files:**
- Create: `warhammer-battle-helper-backend/internal/systems/custom/edgedice.go`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go` (`rollFromFormula`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/edgedice_test.go`

**Interfaces:**
- Consumes: Task 1 constants and `resolveModifier`.
- Produces: `RollResult.DiceMod` (signed applied dice count), `RollResult.AllRolls` (all candidates, kept one == `Roll`), `RollResult.ModifierTarget == "edge_dice"`, `RollResult.Modifier == 0` for dice rolls. These JSON fields (`diceMod`, `allRolls`, `modifierTarget`) are what Task 6 renders.

- [ ] **Step 1: Write the failing tests**

Create `edgedice_test.go`:

```go
package custom

import (
	"battle-helper/internal/models"
	"reflect"
	"strings"
	"testing"
)

func tmplWithDice(mode string, maxEdge, maxSetback int) *models.SystemTemplate {
	return &models.SystemTemplate{Settings: models.TemplateSettings{
		Modifier: &models.ModifierConfig{Enabled: true, Kind: ModKindDice, DiceMode: mode, MaxEdge: maxEdge, MaxSetback: maxSetback},
	}}
}

func d100Below(threshold string) *models.RollConfig {
	return &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold", Threshold: threshold}
}

func TestEdgeDice_Tens(t *testing.T) {
	tests := []struct {
		name     string
		vals     []int // seqRoller raw values: first Intn(100), then one Intn(10) per extra die
		cfg      *models.RollConfig
		diceMod  int
		wantRoll int
		wantAll  []int
	}{
		// main 47 (units 7), extra tens 2 -> 27; roll-under edge keeps the lower.
		{"edge keeps lower under threshold", []int{46, 2}, d100Below("55"), 1, 27, []int{47, 27}},
		// main 47, extra tens 8 -> 87; roll-under setback keeps the higher.
		{"setback keeps higher under threshold", []int{46, 8}, d100Below("55"), -1, 87, []int{47, 87}},
		// main 50 (units 0), extra tens 0 -> 00+0 = 100, the fumble face.
		{"00 and 0 read as 100", []int{49, 0}, d100Below("55"), -1, 100, []int{50, 100}},
		// roll-over flips the direction: edge keeps the higher.
		{"edge keeps higher over threshold", []int{46, 8},
			&models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "above_threshold", Threshold: "50"}, 1, 87, []int{47, 87}},
		{"two edge dice", []int{46, 5, 1}, d100Below("55"), 2, 17, []int{47, 57, 17}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := newTestPlugin(tc.vals...)
			res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeTens, 2, 2), "atk", "str", false, tc.cfg, tc.diceMod)
			if err != nil {
				t.Fatalf("rollFromFormula() error: %v", err)
			}
			if res.Roll != tc.wantRoll {
				t.Errorf("Roll = %d, want %d", res.Roll, tc.wantRoll)
			}
			if !reflect.DeepEqual(res.AllRolls, tc.wantAll) {
				t.Errorf("AllRolls = %v, want %v", res.AllRolls, tc.wantAll)
			}
			if res.DiceMod != tc.diceMod || res.Modifier != 0 || res.ModifierTarget != ModTargetEdgeDice {
				t.Errorf("DiceMod/Modifier/Target = %d/%d/%q, want %d/0/%q", res.DiceMod, res.Modifier, res.ModifierTarget, tc.diceMod, ModTargetEdgeDice)
			}
		})
	}
}

func TestEdgeDice_Formula(t *testing.T) {
	d20Above := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, SuccessType: "above_threshold", Threshold: "10"}

	t.Run("edge keeps the higher whole formula over threshold", func(t *testing.T) {
		p := newTestPlugin(4, 14) // d20 -> 5, d20 -> 15
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, d20Above, 1)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 15 || !reflect.DeepEqual(res.AllRolls, []int{5, 15}) {
			t.Errorf("Roll/AllRolls = %d/%v, want 15/[5 15]", res.Roll, res.AllRolls)
		}
		if res.Outcome != "regular_success" {
			t.Errorf("Outcome = %q, want regular_success (15 >= 10)", res.Outcome)
		}
		// The breakdown describes the kept roll, not the discarded one.
		if !strings.HasSuffix(res.FormulaBreakdown, "= 15") {
			t.Errorf("FormulaBreakdown = %q, want it to end with the kept 15", res.FormulaBreakdown)
		}
	})

	t.Run("setback keeps the higher under threshold", func(t *testing.T) {
		p := newTestPlugin(9, 79) // d100 -> 10, d100 -> 80
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, d100Below("55"), -1)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 80 || res.Outcome != "failure" {
			t.Errorf("Roll/Outcome = %d/%q, want 80/failure", res.Roll, res.Outcome)
		}
	})

	t.Run("clamped request rolls only the allowed dice", func(t *testing.T) {
		// maxEdge 1: a +3 request rolls twice. seqRoller panics if a third roll is asked for.
		p := newTestPlugin(4, 14)
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 1, 0), "atk", "str", false, d20Above, 3)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.DiceMod != 1 || len(res.AllRolls) != 2 {
			t.Errorf("DiceMod/len(AllRolls) = %d/%d, want 1/2", res.DiceMod, len(res.AllRolls))
		}
	})

	t.Run("raw field ignores the pick", func(t *testing.T) {
		p := newTestPlugin(4) // exactly one roll
		raw := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, SuccessType: "raw"}
		res, err := p.rollFromFormula(sampleStats(), tmplWithDice(DiceModeFormula, 2, 2), "atk", "str", false, raw, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 5 || res.DiceMod != 0 || res.AllRolls != nil || res.ModifierTarget != ModTargetNone {
			t.Errorf("got Roll %d DiceMod %d AllRolls %v Target %q, want a plain 5", res.Roll, res.DiceMod, res.AllRolls, res.ModifierTarget)
		}
	})
}

// Weapons attack through rollFromFormula, so they get the dice; damage never does.
func TestRollWeaponWithTemplate_EdgeDiceOnAttackOnly(t *testing.T) {
	template, raw := weaponTemplate()
	template.Sections[0].Fields[0].RollConfig.SuccessType = "above_threshold"
	template.Sections[0].Fields[0].RollConfig.Threshold = "10"
	template.Settings.Modifier = &models.ModifierConfig{Enabled: true, Kind: ModKindDice, MaxEdge: 2}

	// attack d20 Intn 4 -> 5, d20 Intn 9 -> 10 (kept, success); damage 2d6: 3->4, 5->6, + STR 8 => 18.
	p := newTestPlugin(4, 9, 3, 5)
	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "w1", 1)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.Roll != 10 || !reflect.DeepEqual(res.AllRolls, []int{5, 10}) {
		t.Errorf("Roll/AllRolls = %d/%v, want 10/[5 10]", res.Roll, res.AllRolls)
	}
	if res.DamageRoll != 18 {
		t.Errorf("DamageRoll = %d, want 18 — dice do not touch damage", res.DamageRoll)
	}
}

func TestPickIndex_TieKeepsFirst(t *testing.T) {
	if got := pickIndex([]int{30, 30}, 1, true); got != 0 {
		t.Errorf("pickIndex tie = %d, want 0", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'EdgeDice|PickIndex'`
Expected: build failure — `undefined: pickIndex`.

- [ ] **Step 3: Create `edgedice.go`**

```go
package custom

import "strconv"

// edgeRoll is one evaluated traditional roll plus, for edge/setback dice, every candidate.
type edgeRoll struct {
	result, diceType   int
	labelStr, valueStr string
	all                []int
}

// lowerIsBetter reads which way edge dice push from the field's own success rule, so the GM
// never configures a direction that could disagree with it. "raw" never gets here
// (resolveEdgeDice drops it); an empty successType is roll-over, as in evalOutcome.
func lowerIsBetter(successType string) bool {
	return successType == "below_threshold"
}

// pickIndex returns the index of the kept candidate: the better one for edge dice (diceMod > 0),
// the worse one for setback dice. Ties keep the earliest roll.
func pickIndex(rolls []int, diceMod int, lowerBetter bool) int {
	wantLow := (diceMod > 0) == lowerBetter
	kept := 0
	for i := 1; i < len(rolls); i++ {
		if (wantLow && rolls[i] < rolls[kept]) || (!wantLow && rolls[i] > rolls[kept]) {
			kept = i
		}
	}
	return kept
}

// rollEdgeTens is the d100 tens-die mechanic: one d100, then one new tens digit per extra die
// with the units kept. 00 with units 0 is 100, the same face a plain d100 reads as 100.
func (p *Plugin) rollEdgeTens(diceMod int, lowerBetter bool) edgeRoll {
	main := p.rng.Intn(100) + 1
	units := main % 10
	all := []int{main}
	for i := 0; i < absInt(diceMod); i++ {
		alt := p.rng.Intn(10)*10 + units
		if alt == 0 {
			alt = 100
		}
		all = append(all, alt)
	}
	kept := all[pickIndex(all, diceMod, lowerBetter)]
	return edgeRoll{result: kept, diceType: 100, labelStr: "d100", valueStr: strconv.Itoa(kept), all: all}
}

// rollEdgeFormula evaluates the whole formula once plus once per extra die and keeps one. The
// kept roll's own label and values become the breakdown, so the log never mixes two rolls.
func rollEdgeFormula(diceMod int, lowerBetter bool, eval func() (int, int, string, string, error)) (edgeRoll, error) {
	n := 1 + absInt(diceMod)
	cands := make([]edgeRoll, 0, n)
	all := make([]int, 0, n)
	for i := 0; i < n; i++ {
		r, dt, l, v, err := eval()
		if err != nil {
			return edgeRoll{}, err
		}
		cands = append(cands, edgeRoll{result: r, diceType: dt, labelStr: l, valueStr: v})
		all = append(all, r)
	}
	kept := cands[pickIndex(all, diceMod, lowerBetter)]
	kept.all = all
	return kept, nil
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
```

- [ ] **Step 4: Wire into `rollFromFormula`**

In `roller.go`, replace:

```go
	result, diceType, labelStr, valueStr, err := p.evalFormula(cfg.Formula, stats, skillKey, linkedAttr, linkedLabel, baseFromAttr)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval: %w", err)
	}

	// The modifier lands on exactly one side of the comparison: the roll or the target.
	rollMod, thresholdMod := 0, 0
	if modTarget == ModTargetThreshold {
		thresholdMod = modValue
	} else {
		rollMod = modValue
	}
```

with:

```go
	eval := func() (int, int, string, string, error) {
		return p.evalFormula(cfg.Formula, stats, skillKey, linkedAttr, linkedLabel, baseFromAttr)
	}
	var roll edgeRoll
	var err error
	switch {
	case modTarget == ModTargetEdgeDice && template.Settings.Modifier.DiceMode == DiceModeTens:
		roll = p.rollEdgeTens(modValue, lowerIsBetter(cfg.SuccessType))
	case modTarget == ModTargetEdgeDice:
		roll, err = rollEdgeFormula(modValue, lowerIsBetter(cfg.SuccessType), eval)
	default:
		roll.result, roll.diceType, roll.labelStr, roll.valueStr, err = eval()
	}
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval: %w", err)
	}
	result, diceType, labelStr, valueStr := roll.result, roll.diceType, roll.labelStr, roll.valueStr

	// A numeric modifier lands on exactly one side of the comparison: the roll or the target.
	// Edge dice already did their work above and add nothing here.
	rollMod, thresholdMod := 0, 0
	switch modTarget {
	case ModTargetThreshold:
		thresholdMod = modValue
	case ModTargetRoll:
		rollMod = modValue
	}
```

Then, just before `res := &gsys.RollResult{`, add:

```go
	// Edge dice report as a dice count, not a modifier: the log reads diceMod/allRolls for them,
	// and a non-zero Modifier would print a phantom "(+1)".
	diceMod := 0
	if appliedTarget == ModTargetEdgeDice {
		diceMod, appliedValue = appliedValue, 0
	}
```

and add two fields to the `gsys.RollResult{...}` literal, after `ModifierTarget: appliedTarget,`:

```go
		DiceMod:          diceMod,
		AllRolls:         roll.all,
```

- [ ] **Step 5: Run all custom tests**

Run: `cd warhammer-battle-helper-backend && go vet ./internal/systems/custom/ && go test ./internal/systems/custom/...`
Expected: `ok  battle-helper/internal/systems/custom` (existing modifier/weapon/pool tests unchanged and green).

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-backend/internal/systems/custom/edgedice.go warhammer-battle-helper-backend/internal/systems/custom/edgedice_test.go warhammer-battle-helper-backend/internal/systems/custom/roller.go && \
git commit -m "feat: PLAYRPG-294 roll edge/setback dice in formula and tens mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — config helpers

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/modifierConfig.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/modifierConfig.test.js`

**Interfaces:**
- Produces: `MOD_TARGET_EDGE_DICE`, `MOD_KIND_NUMBER`, `MOD_KIND_DICE`, `DICE_MODE_FORMULA`, `DICE_MODE_TENS`, `EDGE_DICE_CAP` (= 5); `clampEdgeDiceMax(value) → int in [0, 5]`; `edgeDiceButtons(cfg) → [{ diceMod: number, type: 'edge'|'neutral'|'setback' }]` top to bottom; `readModifierConfig(template)` now also returns `kind` (normalised to `'number'` | `'dice'`), `diceMode`, `maxEdge`, `maxSetback`.

- [ ] **Step 1: Write the failing tests**

Append to `modifierConfig.test.js` (merge the import with the existing one at the top of the file):

```js
import {
  readModifierConfig, edgeDiceButtons, clampEdgeDiceMax,
  MOD_KIND_NUMBER, MOD_KIND_DICE, DICE_MODE_FORMULA,
} from './modifierConfig';

describe('edge dice config', () => {
  it('reads an unset kind as number', () => {
    const cfg = readModifierConfig({ settings: { modifier: { enabled: true } } });
    expect(cfg.kind).toBe(MOD_KIND_NUMBER);
    expect(cfg.diceMode).toBe(DICE_MODE_FORMULA);
  });

  it('keeps the dice kind and its maxima', () => {
    const cfg = readModifierConfig({ settings: { modifier: { enabled: true, kind: 'dice', maxEdge: 2, maxSetback: 1 } } });
    expect(cfg.kind).toBe(MOD_KIND_DICE);
    expect(cfg.maxEdge).toBe(2);
    expect(cfg.maxSetback).toBe(1);
  });

  it.each([
    [{ maxEdge: 2, maxSetback: 2 }, [2, 1, 0, -1, -2]],
    [{ maxEdge: 0, maxSetback: 2 }, [0, -1, -2]],
    [{ maxEdge: 3, maxSetback: 0 }, [3, 2, 1, 0]],
    [{ maxEdge: 9, maxSetback: -4 }, [5, 4, 3, 2, 1, 0]],
  ])('lists the column for %j', (cfg, expected) => {
    expect(edgeDiceButtons(cfg).map(b => b.diceMod)).toEqual(expected);
  });

  it('types the buttons by sign', () => {
    expect(edgeDiceButtons({ maxEdge: 1, maxSetback: 1 }).map(b => b.type)).toEqual(['edge', 'neutral', 'setback']);
  });

  it.each([['3', 3], ['', 0], ['-2', 0], ['12', 5], [4, 4]])('clamps max %p to %p', (input, expected) => {
    expect(clampEdgeDiceMax(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=modifierConfig`
Expected: FAIL — `edgeDiceButtons is not a function`.

- [ ] **Step 3: Implement**

In `modifierConfig.js` after `MOD_TARGET_SUCCESS_THRESHOLD` add:

```js
export const MOD_TARGET_EDGE_DICE = 'edge_dice';

// Modifier kinds and edge-dice modes — the same strings as modifier.go.
export const MOD_KIND_NUMBER = 'number';
export const MOD_KIND_DICE = 'dice';
export const DICE_MODE_FORMULA = 'formula';
export const DICE_MODE_TENS = 'tens';

// Upper bound for either maximum in the creator. The server enforces the same cap (maxEdgeDice).
export const EDGE_DICE_CAP = 5;
```

Extend `DEFAULT_MODIFIER_CONFIG` with (defaults must be what Go omits — 0 and empty — or a saved 0 would read back as something else):

```js
  kind: MOD_KIND_NUMBER,
  diceMode: DICE_MODE_FORMULA,
  maxEdge: 0,
  maxSetback: 0,
```

In `readModifierConfig`'s returned object add after `...cfg,`:

```js
    kind: cfg.kind === MOD_KIND_DICE ? MOD_KIND_DICE : MOD_KIND_NUMBER,
    diceMode: cfg.diceMode === DICE_MODE_TENS ? DICE_MODE_TENS : DICE_MODE_FORMULA,
    maxEdge: clampEdgeDiceMax(cfg.maxEdge),
    maxSetback: clampEdgeDiceMax(cfg.maxSetback),
```

Append at the end of the file:

```js
// clampEdgeDiceMax bounds a maximum to [0, EDGE_DICE_CAP]; anything unparsable is 0 (side off).
export function clampEdgeDiceMax(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), EDGE_DICE_CAP);
}

// edgeDiceButtons lists the dice column top to bottom: +maxEdge … +1, 0, -1 … -maxSetback.
// The 0 button is always there — it is the plain roll.
export function edgeDiceButtons(cfg) {
  const hi = clampEdgeDiceMax(cfg?.maxEdge);
  const lo = clampEdgeDiceMax(cfg?.maxSetback);
  const out = [];
  for (let d = hi; d >= -lo; d -= 1) {
    out.push({ diceMod: d, type: d > 0 ? 'edge' : d < 0 ? 'setback' : 'neutral' });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=modifierConfig`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/systems/custom/modifierConfig.js warhammer-battle-helper-front/src/systems/custom/modifierConfig.test.js && \
git commit -m "feat: PLAYRPG-294 edge dice config helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — creator fields, i18n, tutorial text, dead `rollAdvType`

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/EdgeDiceConfigFields.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:473` (delete `rollAdvType: 'standard',`)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Test: `warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.test.jsx`

**Interfaces:**
- Consumes: Task 3 constants and `clampEdgeDiceMax`.
- Produces: config objects with `kind`, `diceMode`, `maxEdge`, `maxSetback` sent via the existing `onChange`. Test ids: `mcb-kind`, `mcb-dice-mode`, `mcb-max-edge`, `mcb-max-setback`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('ModifierConfigBuilder', …)` block:

```js
  it('switching to dice seeds two dice each way when both maxima are unset', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-kind'), { target: { value: 'dice' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dice', maxEdge: 2, maxSetback: 2 }));
  });

  it('switching to dice keeps maxima the GM already set', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, kind: 'number', maxEdge: 0, maxSetback: 3 }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-kind'), { target: { value: 'dice' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dice', maxEdge: 0, maxSetback: 3 }));
  });

  it('shows the dice fields instead of the number fields for the dice kind', () => {
    render(<ModifierConfigBuilder value={{ enabled: true, kind: 'dice', maxEdge: 2, maxSetback: 2 }} onChange={() => {}} />);

    expect(screen.getByTestId('mcb-dice-mode')).toBeInTheDocument();
    expect(screen.queryByTestId('mcb-traditional-target')).toBeNull();
    expect(screen.queryByTestId('mcb-step')).toBeNull();
  });

  it('clamps a maximum to the cap', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, kind: 'dice', maxEdge: 2, maxSetback: 2 }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-max-edge'), { target: { value: '9' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxEdge: 5 }));
  });

  // Switching back keeps the other kind's settings, as with success levels (PLAYRPG-289).
  it('switching back to number keeps the presets', () => {
    const onChange = jest.fn();
    const presets = [{ value: -20, label: 'Hard' }];
    render(<ModifierConfigBuilder value={{ enabled: true, kind: 'dice', presets }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-kind'), { target: { value: 'number' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'number', presets }));
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierConfigBuilder`
Expected: FAIL — `Unable to find an element by: [data-testid="mcb-kind"]`.

- [ ] **Step 3: Create `EdgeDiceConfigFields.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DICE_MODE_FORMULA,
  DICE_MODE_TENS,
  EDGE_DICE_CAP,
  clampEdgeDiceMax,
} from '../../systems/custom/modifierConfig';

const MODE_HINTS = {
  [DICE_MODE_FORMULA]: 'creator.modifier.hintDiceFormula',
  [DICE_MODE_TENS]: 'creator.modifier.hintDiceTens',
};

// The dice half of the modifier card: how extra dice roll and how many the player may pick.
// The maxima are single digits with no minus sign, so they clamp on every keystroke — unlike the
// numeric limits in ModifierConfigBuilder, there is no half-typed value to protect.
function EdgeDiceConfigFields({ cfg, up }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mcb__field">
        <label className="mcb__label" htmlFor="mcb-dice-mode">{t('creator.modifier.diceMode')}</label>
        <select
          id="mcb-dice-mode"
          data-testid="mcb-dice-mode"
          className="mcb__select"
          value={cfg.diceMode}
          onChange={e => up({ diceMode: e.target.value })}
        >
          <option value={DICE_MODE_FORMULA}>{t('creator.modifier.diceModeFormula')}</option>
          <option value={DICE_MODE_TENS}>{t('creator.modifier.diceModeTens')}</option>
        </select>
        <div className="mcb__hint">{t(MODE_HINTS[cfg.diceMode] || MODE_HINTS[DICE_MODE_FORMULA])}</div>
      </div>

      <div className="mcb__limits">
        <div className="mcb__limit">
          <label className="mcb__label" htmlFor="mcb-max-edge">{t('creator.modifier.maxEdge')}</label>
          <input id="mcb-max-edge" data-testid="mcb-max-edge" type="number" min={0} max={EDGE_DICE_CAP}
                 value={cfg.maxEdge}
                 onChange={e => up({ maxEdge: clampEdgeDiceMax(e.target.value) })} />
        </div>
        <div className="mcb__limit">
          <label className="mcb__label" htmlFor="mcb-max-setback">{t('creator.modifier.maxSetback')}</label>
          <input id="mcb-max-setback" data-testid="mcb-max-setback" type="number" min={0} max={EDGE_DICE_CAP}
                 value={cfg.maxSetback}
                 onChange={e => up({ maxSetback: clampEdgeDiceMax(e.target.value) })} />
        </div>
      </div>
      <div className="mcb__hint">{t('creator.modifier.diceHint')}</div>
    </>
  );
}

export default EdgeDiceConfigFields;
```

- [ ] **Step 4: Add the kind switch to `ModifierConfigBuilder.jsx`**

Imports — add `EdgeDiceConfigFields` and the two kind constants:

```js
import EdgeDiceConfigFields from './EdgeDiceConfigFields';
import {
  DEFAULT_MODIFIER_CONFIG,
  MOD_KIND_NUMBER,
  MOD_KIND_DICE,
  MOD_TARGET_ROLL,
  MOD_TARGET_THRESHOLD,
  MOD_TARGET_DICE_COUNT,
  MOD_TARGET_SUCCESS_THRESHOLD,
} from '../../systems/custom/modifierConfig';
```

After `handleLimitBlur`, add:

```js
  // Both maxima at 0 is a dice column with only the plain roll in it — useless, so the first
  // switch to dice seeds two each way. Maxima the GM already set are kept, as is everything of
  // the other kind: switching back restores it.
  const handleKindChange = kind => {
    setDraft(null);
    const seed = kind === MOD_KIND_DICE && !cfg.maxEdge && !cfg.maxSetback ? { maxEdge: 2, maxSetback: 2 } : {};
    up({ kind, ...seed });
  };
```

In the enabled branch, replace the opening `<>` and everything up to the closing `</>` with:

```jsx
        <>
          <div className="mcb__field">
            <label className="mcb__label" htmlFor="mcb-kind">{t('creator.modifier.kind')}</label>
            <select
              id="mcb-kind"
              data-testid="mcb-kind"
              className="mcb__select"
              value={cfg.kind === MOD_KIND_DICE ? MOD_KIND_DICE : MOD_KIND_NUMBER}
              onChange={e => handleKindChange(e.target.value)}
            >
              <option value={MOD_KIND_NUMBER}>{t('creator.modifier.kindNumber')}</option>
              <option value={MOD_KIND_DICE}>{t('creator.modifier.kindDice')}</option>
            </select>
          </div>

          {cfg.kind === MOD_KIND_DICE ? (
            <EdgeDiceConfigFields cfg={cfg} up={up} />
          ) : (
            <>
              {/* existing number fields, unchanged: traditional target, pool target, limits,
                  limits hint, presets — move the current JSX here verbatim */}
            </>
          )}
        </>
```

The comment above marks where the existing five blocks (`mcb__field` traditional, `mcb__field` pool, `mcb__limits`, `mcb__hint` limitsHint, `mcb__field` presets) move — paste them verbatim and delete the comment.

- [ ] **Step 5: Delete dead `rollAdvType`**

In `TemplateBuilder.jsx` delete the line `    rollAdvType: 'standard',` (around line 473).
Run: `cd warhammer-battle-helper-front && grep -rn "rollAdvType" src`
Expected: no output.

- [ ] **Step 6: i18n**

In `en/translation.json`, inside `creator.modifier` add:

```json
"kind": "Modifier type",
"kindNumber": "Number",
"kindDice": "Edge and setback dice",
"diceMode": "How extra dice roll",
"diceModeFormula": "Whole formula",
"diceModeTens": "Tens die (d100 only)",
"hintDiceFormula": "Each extra die rolls the field's whole formula once more. Edge keeps the best result, setback the worst.",
"hintDiceTens": "Each extra die rolls only a new tens digit; the units stay. Works on fields whose formula is a single d100 — other fields roll without extra dice.",
"maxEdge": "Max edge dice",
"maxSetback": "Max setback dice",
"diceHint": "Best and worst follow each field's success rule: rolling under the threshold, lower is better; rolling over it, higher is. Fields with a raw result and dice pools roll without extra dice."
```

In `pl/translation.json`, inside `creator.modifier` add:

```json
"kind": "Rodzaj modyfikatora",
"kindNumber": "Liczba",
"kindDice": "Kości przewagi i utrudnienia",
"diceMode": "Jak rzucają dodatkowe kości",
"diceModeFormula": "Cała formuła",
"diceModeTens": "Kość dziesiątek (tylko d100)",
"hintDiceFormula": "Każda dodatkowa kość rzuca całą formułę pola jeszcze raz. Przewaga zostawia najlepszy wynik, utrudnienie najgorszy.",
"hintDiceTens": "Każda dodatkowa kość rzuca tylko nową cyfrę dziesiątek, jedności zostają. Działa dla pól, których formuła to samo d100 — pozostałe pola rzucają bez dodatkowych kości.",
"maxEdge": "Maks. kości przewagi",
"maxSetback": "Maks. kości utrudnienia",
"diceHint": "Najlepszy i najgorszy wynik zależą od reguły sukcesu pola: przy rzucie poniżej progu lepszy jest niższy, przy rzucie powyżej — wyższy. Pola z surowym wynikiem i pule kości rzucają bez dodatkowych kości."
```

Change `creator.general.modifierHint`:
- en: `"Ask for a modifier or extra dice before each roll on this card"`
- pl: `"Pytaj o modyfikator albo dodatkowe kości przed każdym rzutem na tej karcie"`

Change `tutorial.creatorGeneral.modifier.body` (the tour step stays — dice are a kind inside the same card, not a new card):
- en: `"When on, every roll from this sheet first asks the player for a modifier: either a number, such as a bonus or a penalty from the situation, or edge and setback dice that roll again and keep the best or the worst result."`
- pl: `"Gdy włączone, każdy rzut z tej karty najpierw pyta gracza o modyfikator: liczbę, np. premię albo karę wynikającą z sytuacji, albo kości przewagi i utrudnienia, które rzucają ponownie i zostawiają najlepszy lub najgorszy wynik."`

- [ ] **Step 7: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='ModifierConfigBuilder|tour|Tour|TemplateBuilder'`
Expected: PASS (includes `tourTranslations.test.js`, `creatorTour.coverage.test.jsx`).

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/creator/EdgeDiceConfigFields.jsx warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.jsx warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.test.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && \
git commit -m "feat: PLAYRPG-294 edge dice settings in the template creator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — dice column on the cards

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/EdgeDiceOverlay.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/RollPrompt.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/useRollPrompt.js`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx` (~385, ~441)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx` (~66, ~277, ~343)
- Modify: `warhammer-battle-helper-front/src/style.css` (new `.edge-dice-*` block next to `.custom-roll-overlay`)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (`customRoll.edgeDice*`, `customRoll.setbackDice*`)
- Test: `warhammer-battle-helper-front/src/systems/custom/EdgeDiceOverlay.test.jsx`, `RollPrompt.test.jsx`, `useRollPrompt.test.js`

**Interfaces:**
- Consumes: Task 3 `readModifierConfig` (with `kind`), `edgeDiceButtons`, `formatModifier`, `MOD_KIND_DICE`.
- Produces: `useRollPrompt` returns additionally `pendingPos: {x, y} | null` and `trackClick(event)`; `RollPrompt({ pending, pos, config, onConfirm, onCancel })`; `EdgeDiceOverlay({ pos, config, onSelect, onCancel })`; `zeroAlignedTop(y, edgeCount)`; i18n `customRoll.edgeDice` / `customRoll.setbackDice` with `count` (Task 6 reuses them).

- [ ] **Step 1: i18n keys (needed by the overlay tests)**

i18next v25 plural suffixes. In `en/translation.json` inside `customRoll`:

```json
"edgeDice_one": "+{{count}} edge die",
"edgeDice_other": "+{{count}} edge dice",
"setbackDice_one": "−{{count}} setback die",
"setbackDice_other": "−{{count}} setback dice"
```

In `pl/translation.json` inside `customRoll`:

```json
"edgeDice_one": "+{{count}} kość przewagi",
"edgeDice_few": "+{{count}} kości przewagi",
"edgeDice_many": "+{{count}} kości przewagi",
"edgeDice_other": "+{{count}} kości przewagi",
"setbackDice_one": "−{{count}} kość utrudnienia",
"setbackDice_few": "−{{count}} kości utrudnienia",
"setbackDice_many": "−{{count}} kości utrudnienia",
"setbackDice_other": "−{{count}} kości utrudnienia"
```

- [ ] **Step 2: Write the failing tests**

`EdgeDiceOverlay.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import EdgeDiceOverlay, { zeroAlignedTop } from './EdgeDiceOverlay';

const labels = () => screen.getAllByRole('button').map(b => b.textContent);

describe('EdgeDiceOverlay', () => {
  it.each([
    [{ maxEdge: 2, maxSetback: 2 }, ['+2', '+1', '0', '-1', '-2']],
    [{ maxEdge: 0, maxSetback: 2 }, ['0', '-1', '-2']],
    [{ maxEdge: 3, maxSetback: 0 }, ['+3', '+2', '+1', '0']],
  ])('renders the column for %j', (config, expected) => {
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={config} onSelect={() => {}} onCancel={() => {}} />);
    expect(labels()).toEqual(expected);
  });

  it('reports the picked dice count', () => {
    const onSelect = jest.fn();
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 2, maxSetback: 2 }} onSelect={onSelect} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('-1'));
    expect(onSelect).toHaveBeenCalledWith(-1);
  });

  it('cancels on a backdrop click', () => {
    const onCancel = jest.fn();
    const { baseElement } = render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 1, maxSetback: 1 }} onSelect={() => {}} onCancel={onCancel} />);
    fireEvent.click(baseElement.querySelector('.edge-dice-overlay'));
    expect(onCancel).toHaveBeenCalled();
  });

  // The 0 button's centre lands on the click: 2 edge buttons of 36px + 2px gap above it, half a
  // button, and the popup's 4px padding + 2px border.
  it('aligns the zero button with the click', () => {
    expect(zeroAlignedTop(500, 2)).toBe(500 - 2 * 38 - 18 - 6);
    expect(zeroAlignedTop(500, 0)).toBe(500 - 18 - 6);
  });
});
```

`RollPrompt.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import RollPrompt from './RollPrompt';

const pending = { skillKey: 'fld_1', label: 'Perswazja' };

describe('RollPrompt', () => {
  it('renders nothing without a pending roll', () => {
    const { container } = render(<RollPrompt pending={null} pos={null} config={{ kind: 'number' }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the number prompt for the number kind', () => {
    render(<RollPrompt pending={pending} pos={null} config={{ kind: 'number', presets: [], step: 1 }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.getElementById('roll-modifier-input')).toBeInTheDocument();
  });

  it('shows the dice column for the dice kind', () => {
    render(<RollPrompt pending={pending} pos={{ x: 10, y: 10 }} config={{ kind: 'dice', maxEdge: 1, maxSetback: 1 }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.getElementById('roll-modifier-input')).toBeNull();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
```

Append to `useRollPrompt.test.js` inside the `describe` (existing tests stay untouched — `pending` is still exactly the request):

```js
  it('remembers where a mouse click happened', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));

    act(() => result.current.trackClick({ detail: 1, clientX: 40, clientY: 90 }));
    act(() => result.current.promptRoll(request));

    expect(result.current.pendingPos).toEqual({ x: 40, y: 90 });
  });

  // Keyboard activation (Enter/Space) has detail 0 and clientX/Y 0, so the button's centre stands in.
  it('uses the element centre for a keyboard activation', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));
    const target = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 30, height: 40 }) };

    act(() => result.current.trackClick({ detail: 0, clientX: 0, clientY: 0, target }));
    act(() => result.current.promptRoll(request));

    expect(result.current.pendingPos).toEqual({ x: 25, y: 40 });
  });

  it('clears the position when the roll is confirmed', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));

    act(() => result.current.trackClick({ detail: 1, clientX: 40, clientY: 90 }));
    act(() => result.current.promptRoll(request));
    act(() => result.current.confirmRoll(1));

    expect(result.current.pendingPos).toBeNull();
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='EdgeDiceOverlay|RollPrompt|useRollPrompt'`
Expected: FAIL — `Cannot find module './EdgeDiceOverlay'`, `trackClick is not a function`.

- [ ] **Step 4: Create `EdgeDiceOverlay.jsx`**

```jsx
import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePortalTooltip } from '../../components/common/PortalTooltip';
import { edgeDiceButtons, formatModifier } from './modifierConfig';

// Must match .edge-dice-btn height, .edge-dice-popup gap, and .edge-dice-popup padding + border
// in style.css.
const BUTTON_HEIGHT = 36;
const BUTTON_GAP = 2;
const POPUP_INSET = 6;
const VIEWPORT_MARGIN = 8;

// zeroAlignedTop places the column so the 0 button's centre sits on the click, which makes a
// plain roll a second click in the same spot. Every edge button sits above the 0, so the offset
// grows with maxEdge instead of CoC's fixed two.
export function zeroAlignedTop(y, edgeCount) {
  return y - edgeCount * (BUTTON_HEIGHT + BUTTON_GAP) - BUTTON_HEIGHT / 2 - POPUP_INSET;
}

// Edge/setback dice picker in the style of the CoC sheet's column (CoCDiceModOverlay), sized by
// the template's maxima. Portalled to body because it is positioned in viewport coordinates.
function EdgeDiceOverlay({ pos, config, onSelect, onCancel }) {
  const { t } = useTranslation();
  const popupRef = useRef(null);
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip({ placement: 'left' });
  const buttons = edgeDiceButtons(config);
  const edgeCount = buttons.filter(b => b.diceMod > 0).length;
  // No recorded click (e.g. a roll started programmatically) opens the column mid-screen.
  const at = pos || { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - rect.height - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(at.x - rect.width / 2, maxLeft));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(zeroAlignedTop(at.y, edgeCount), maxTop));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [at.x, at.y, edgeCount]);

  const describe = d => {
    if (d > 0) return t('customRoll.edgeDice', { count: d });
    if (d < 0) return t('customRoll.setbackDice', { count: -d });
    return t('combat.roll');
  };

  // Both layers stop propagation: a portal's events still bubble through the React tree, into
  // the card and whatever panel holds it.
  return createPortal(
    <div className="edge-dice-overlay" onClick={e => { e.stopPropagation(); onCancel(); }}>
      <div ref={popupRef} className="edge-dice-popup" onClick={e => e.stopPropagation()}>
        {buttons.map(({ diceMod, type }) => (
          <button
            key={diceMod}
            type="button"
            className={`edge-dice-btn edge-dice-btn--${type}`}
            aria-label={describe(diceMod)}
            onMouseEnter={e => showTooltip(describe(diceMod), e.currentTarget)}
            onMouseLeave={hideTooltip}
            onClick={() => { hideTooltip(); onSelect(diceMod); }}
          >
            {formatModifier(diceMod)}
          </button>
        ))}
      </div>
      {tooltipNode}
    </div>,
    document.body,
  );
}

export default EdgeDiceOverlay;
```

- [ ] **Step 5: Create `RollPrompt.jsx`**

```jsx
import React from 'react';
import RollModifierOverlay from './RollModifierOverlay';
import EdgeDiceOverlay from './EdgeDiceOverlay';
import { MOD_KIND_DICE } from './modifierConfig';

// RollPrompt picks the pre-roll prompt by the template's modifier kind. Both custom cards
// (CharacterSheet, CharacterDetails) render this one switch instead of each choosing.
function RollPrompt({ pending, pos, config, onConfirm, onCancel }) {
  if (!pending || !config) return null;
  if (config.kind === MOD_KIND_DICE) {
    return <EdgeDiceOverlay pos={pos} config={config} onSelect={onConfirm} onCancel={onCancel} />;
  }
  return <RollModifierOverlay label={pending.label} config={config} onConfirm={onConfirm} onCancel={onCancel} />;
}

export default RollPrompt;
```

- [ ] **Step 6: Extend `useRollPrompt.js`**

Replace the file body (keep the existing top comment, translating nothing else) with:

```js
import { useState, useCallback, useMemo, useRef } from 'react';
import { readModifierConfig } from './modifierConfig';

// (existing comment block stays here)
export function useRollPrompt(template, onRoll) {
  const [pending, setPending] = useState(null);
  const [pendingPos, setPendingPos] = useState(null);
  const lastClickRef = useRef(null);
  const modifierConfig = useMemo(() => readModifierConfig(template), [template]);

  // trackClick records where a roll was clicked so the dice column can open under the cursor.
  // It is attached as a React onClickCapture on the card root — not a document listener — and
  // only records, never stops the event. Keyboard activation has detail 0 and no meaningful
  // clientX/Y, so the clicked element's centre stands in.
  const trackClick = useCallback((e) => {
    if (e.detail > 0) {
      lastClickRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const r = e.target.getBoundingClientRect();
    lastClickRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  const promptRoll = useCallback((request) => {
    if (!modifierConfig) {
      onRoll(request, 0);
      return;
    }
    setPending(request);
    setPendingPos(lastClickRef.current);
  }, [modifierConfig, onRoll]);

  const cancelRoll = useCallback(() => {
    setPending(null);
    setPendingPos(null);
  }, []);

  const confirmRoll = useCallback((modifier) => {
    if (!pending) return;
    onRoll(pending, modifier);
    setPending(null);
    setPendingPos(null);
  }, [pending, onRoll]);

  return { modifierConfig, pending, pendingPos, promptRoll, cancelRoll, confirmRoll, trackClick };
}
```

- [ ] **Step 7: Wire both cards**

`CharacterSheet.jsx`:
- Import: replace `import RollModifierOverlay from './RollModifierOverlay';` with `import RollPrompt from './RollPrompt';`.
- Destructure: `const { modifierConfig, pending, pendingPos, promptRoll, cancelRoll, confirmRoll, trackClick } = useRollPrompt(template, dispatchRoll);`
- Root: `<div className="custom-sheet" style={{ maxWidth: sheetWidth }} onClickCapture={trackClick}>`
- Replace the `{pending && modifierConfig && ( <RollModifierOverlay … /> )}` block (and its Polish comment above it) with:

```jsx
      {/* Pre-roll prompt — renders only when the template enables a modifier. */}
      <RollPrompt pending={pending} pos={pendingPos} config={modifierConfig} onConfirm={confirmRoll} onCancel={cancelRoll} />
```

`CharacterDetails.jsx`:
- Same import swap and destructure change (line ~66).
- Root (line ~277): `<div className="character-details custom-character-details" onClickCapture={trackClick}>`
- Replace the `{pending && modifierConfig && ( <RollModifierOverlay … /> )}` block (~343) with the same `<RollPrompt … />` line.

Run: `cd warhammer-battle-helper-front && grep -n "RollModifierOverlay" src/systems/custom/CharacterSheet.jsx src/systems/custom/CharacterDetails.jsx`
Expected: no output.

- [ ] **Step 8: CSS**

In `style.css`, right after the `.custom-roll-overlay` rules, add (z-index stays below `.portal-tooltip`'s 10000 so the button tooltips show on top):

```css
/* Edge/setback dice column (PLAYRPG-294) — same look as the CoC dice column. */
.edge-dice-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 9000;
}

.edge-dice-popup {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: linear-gradient(135deg, #3a2920 0%, #2a2218 100%);
  border: 2px solid #7a5c42;
  border-radius: 5px;
  padding: 4px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.75),
    0 0 16px rgba(201, 151, 91, 0.35);
  animation: edgeDicePopIn 0.13s ease-out;
  z-index: 9001;
}

@keyframes edgeDicePopIn {
  from { transform: scale(0.8); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

.edge-dice-btn {
  min-width: 56px;
  height: 36px;
  padding: 0 12px;
  font-size: 1rem;
  font-weight: 700;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.13s;
  letter-spacing: 0.04em;
}

.edge-dice-btn--edge {
  background: linear-gradient(135deg, #4a7c59 0%, #3a6647 100%);
  border-color: #6db88a;
  color: #e8f5e9;
}

.edge-dice-btn--edge:hover {
  background: linear-gradient(135deg, #6db88a 0%, #5aa070 100%);
  border-color: #8fd9af;
  transform: translateX(3px);
  box-shadow: 0 3px 10px rgba(109, 184, 138, 0.45);
}

.edge-dice-btn--neutral {
  background: linear-gradient(135deg, #c9975b 0%, #a67c52 100%);
  border-color: #e8b87a;
  color: #fff9f0;
}

.edge-dice-btn--neutral:hover {
  background: linear-gradient(135deg, #e0ad6a 0%, #c9975b 100%);
  border-color: #f4d8a0;
  transform: translateX(3px);
  box-shadow: 0 3px 10px rgba(201, 151, 91, 0.45);
}

.edge-dice-btn--setback {
  background: linear-gradient(135deg, #8b2424 0%, #6b1818 100%);
  border-color: #c92a2a;
  color: #ffe5e5;
}

.edge-dice-btn--setback:hover {
  background: linear-gradient(135deg, #c92a2a 0%, #a82020 100%);
  border-color: #e53e3e;
  transform: translateX(3px);
  box-shadow: 0 3px 10px rgba(201, 42, 42, 0.45);
}

.edge-dice-btn:active {
  transform: translateX(1px);
}
```

- [ ] **Step 9: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='EdgeDiceOverlay|RollPrompt|useRollPrompt|modifierPrompt|CharacterDetails|CharacterSheet'`
Expected: PASS (existing `CharacterSheet.modifierPrompt.test.jsx` / `CharacterDetails.modifierPrompt.test.jsx` unchanged and green).

- [ ] **Step 10: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/systems/custom/EdgeDiceOverlay.jsx warhammer-battle-helper-front/src/systems/custom/EdgeDiceOverlay.test.jsx warhammer-battle-helper-front/src/systems/custom/RollPrompt.jsx warhammer-battle-helper-front/src/systems/custom/RollPrompt.test.jsx warhammer-battle-helper-front/src/systems/custom/useRollPrompt.js warhammer-battle-helper-front/src/systems/custom/useRollPrompt.test.js warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && \
git commit -m "feat: PLAYRPG-294 edge/setback dice column on custom cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — dice line in the roll log

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/rolls/EdgeDiceSummary.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx` (after the `FormulaBreakdown` line)
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomWeaponRoll.jsx:85` (after the `FormulaBreakdown` line)
- Modify: `warhammer-battle-helper-front/src/style.css` (append `.custom-edge-dice*` after `.edge-dice-btn:active`)
- Test: `warhammer-battle-helper-front/src/systems/custom/rolls/EdgeDiceSummary.test.jsx`

**Interfaces:**
- Consumes: event `data.diceMod`, `data.allRolls`, `data.roll` (Task 2); i18n `customRoll.edgeDice` / `customRoll.setbackDice` (Task 5).
- Produces: `EdgeDiceSummary({ diceMod, allRolls, roll })`.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../../i18n';
import EdgeDiceSummary from './EdgeDiceSummary';
import CustomRoll from './CustomRoll';

describe('EdgeDiceSummary', () => {
  it('renders nothing for a roll without dice', () => {
    const { container } = render(<EdgeDiceSummary diceMod={0} allRolls={undefined} roll={48} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every candidate and marks the kept one', () => {
    const { container } = render(<EdgeDiceSummary diceMod={1} allRolls={[47, 27]} roll={27} />);
    const rolls = [...container.querySelectorAll('.custom-edge-dice__roll')].map(n => n.textContent);
    expect(rolls).toEqual(['47', '27']);
    expect(container.querySelector('.custom-edge-dice__roll--kept').textContent).toBe('27');
  });

  it('marks only the first of tied candidates', () => {
    const { container } = render(<EdgeDiceSummary diceMod={-1} allRolls={[30, 30]} roll={30} />);
    expect(container.querySelectorAll('.custom-edge-dice__roll--kept')).toHaveLength(1);
  });

  it('names setback dice', () => {
    render(<EdgeDiceSummary diceMod={-2} allRolls={[10, 80, 40]} roll={80} />);
    expect(screen.getByText(/setback dice|kości utrudnienia/)).toBeInTheDocument();
  });

  it('shows up in a custom roll log entry', () => {
    const { container } = render(
      <CustomRoll data={{ characterName: 'Bohater', skillName: 'Perswazja', roll: 27, target: 55, outcome: 'regular_success', diceType: 100, diceMod: 1, allRolls: [47, 27], modifierTarget: 'edge_dice', formulaBreakdown: 'd100 = 27' }} />
    );
    expect(container.querySelector('.custom-edge-dice')).not.toBeNull();
    expect(container.querySelector('.log-modifier')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=EdgeDiceSummary`
Expected: FAIL — `Cannot find module './EdgeDiceSummary'`.

- [ ] **Step 3: Create `EdgeDiceSummary.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

// EdgeDiceSummary is the log line for a roll made with edge/setback dice: how many, and every
// candidate with the kept one marked. The kept candidate equals data.roll — a dice template has
// no numeric modifier to shift it (the two kinds are exclusive). Ties mark the first, matching
// the server's pickIndex.
function EdgeDiceSummary({ diceMod, allRolls, roll }) {
  const { t } = useTranslation();
  if (!diceMod || !Array.isArray(allRolls) || allRolls.length < 2) return null;

  const keptIndex = allRolls.indexOf(roll);
  const kind = diceMod > 0 ? 'edge' : 'setback';
  const label = diceMod > 0
    ? t('customRoll.edgeDice', { count: diceMod })
    : t('customRoll.setbackDice', { count: -diceMod });

  return (
    <div className="custom-edge-dice">
      <span className={`custom-edge-dice__label custom-edge-dice__label--${kind}`}>{label}</span>
      {allRolls.map((r, i) => (
        <span key={i} className={`custom-edge-dice__roll${i === keptIndex ? ' custom-edge-dice__roll--kept' : ''}`}>
          {r}
        </span>
      ))}
    </div>
  );
}

export default EdgeDiceSummary;
```

- [ ] **Step 4: Render it in both log entries**

`CustomRoll.jsx`: add `import EdgeDiceSummary from './EdgeDiceSummary';` and right after `{formulaText ? <FormulaBreakdown text={formulaText} /> : null}` add:

```jsx
        <EdgeDiceSummary diceMod={data.diceMod} allRolls={data.allRolls} roll={data.roll} />
```

`CustomWeaponRoll.jsx`: same import, and right after `{formulaText && <FormulaBreakdown text={formulaText} />}` add the same line.

- [ ] **Step 5: CSS**

Append after `.edge-dice-btn:active { … }`:

```css
.custom-edge-dice {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
  font-size: 13px;
  color: var(--log-brown-dark, #5a4a3a);
}

.custom-edge-dice__label--edge {
  color: #3a6647;
  font-weight: 600;
}

.custom-edge-dice__label--setback {
  color: #8b2424;
  font-weight: 600;
}

.custom-edge-dice__roll {
  font-size: 14px;
  opacity: 0.65;
}

.custom-edge-dice__roll--kept {
  font-weight: 700;
  text-decoration: underline;
  opacity: 1;
}
```

- [ ] **Step 6: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='EdgeDiceSummary|CustomRoll|CustomWeaponRoll'`
Expected: PASS.

- [ ] **Step 7: Full suites**

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: all `ok`.
Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` axios ESM failure.

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/systems/custom/rolls/EdgeDiceSummary.jsx warhammer-battle-helper-front/src/systems/custom/rolls/EdgeDiceSummary.test.jsx warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx warhammer-battle-helper-front/src/systems/custom/rolls/CustomWeaponRoll.jsx warhammer-battle-helper-front/src/style.css && \
git commit -m "feat: PLAYRPG-294 edge/setback dice in the roll log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
