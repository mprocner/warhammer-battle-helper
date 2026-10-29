# PLAYRPG-289 Success Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the GM pick, in the template creator's General tab, how a custom card's traditional roll reports its degree of success: a signed level from tens digits ("Levels per step") or GM-named, GM-coloured thresholds at fractions of the target ("Thresholds").

**Architecture:** A new `TemplateSettings.SuccessLevels` config. Go scores the roll (`systems/custom/successlevel.go`, called from `rollFromFormula`) and writes a snapshot into `RollResult` (`SuccessLevel` + `HasSuccessLevel`, or `TierLabel` + `TierColor`). `rollResultToMap` round-trips `RollResult` through JSON, so the new fields reach the event and WS payload with no service change. The front only renders what the event carries (`successLevelDisplay`), and the creator gets a controlled `SuccessLevelsBuilder` card.

**Tech Stack:** Go 1.24 + Gin + MongoDB (backend), React + i18next + Jest/RTL under CRA (frontend).

**Spec:** `docs/superpowers/specs/PLAYRPG-289.md`

## Global Constraints

- Code comments in English. Conversation and `docs/` stay in Polish.
- No hard-coded UI strings in JSX: always `t('key')`, with keys in both `locales/en/translation.json` and `locales/pl/translation.json`.
- UI copy never names Warhammer or Call of Cthulhu.
- Icons come only from `@mui/icons-material`.
- No backward compat and no migration: `nil` or `mode: ""` means off.
- Only the tens-digit method is implemented. The difference method is out of scope.
- Thresholds apply to `below_threshold` only. `above_threshold` uses the fixed Success / Failure rows.
- `Outcome` strings stay `regular_success` / `failure`.
- Frontend tests: from `warhammer-battle-helper-front/` run `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Never run bare `npx jest`. `App.test.js` (axios ESM) is a known baseline failure.
- Go tests: run `go test ./internal/...` from `warhammer-battle-helper-backend/`.
- Parallel sessions share the checkout. Every commit command starts with `git branch --show-current` in the same shell line, and the work stays on `main`.
- Commit message trailer:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WizxuVxzYQFbYkt1ydPu5H
  ```

## File Map

| File | Responsibility |
|---|---|
| `backend/internal/models/success_levels.go` (new) | Config types, constants, `Validate`, sentinel error |
| `backend/internal/models/success_levels_test.go` (new) | Validation tests |
| `backend/internal/models/SystemTemplate.go` | `TemplateSettings.SuccessLevels` field; `IsTemplateValidationError` |
| `backend/internal/service/TemplateService.go` | Call `Validate` in `Update` |
| `backend/internal/systems/interface.go` | `RollResult.HasSuccessLevel/TierLabel/TierColor` |
| `backend/internal/systems/custom/successlevel.go` (new) | `applySuccessLevels`, `pickTier`, `floorDiv` |
| `backend/internal/systems/custom/successlevel_test.go` (new) | Scoring tests and a `rollFromFormula` integration test |
| `backend/internal/systems/custom/roller.go` | Wire `applySuccessLevels` into `rollFromFormula` |
| `front/src/systems/custom/successLevels.js` (new) | Constants, defaults, `tensLevel`, tier helpers (creator side) |
| `front/src/systems/custom/successLevels.test.js` (new) | Helper tests |
| `front/src/systems/custom/rolls/successLevelDisplay.js` (new) | Log label and colour from the event data |
| `front/src/systems/custom/rolls/successLevelDisplay.test.js` (new) | Unit tests |
| `front/src/systems/custom/rolls/CustomRoll.jsx`, `CustomWeaponRoll.jsx` | Use `successLevelDisplay` |
| `front/src/systems/custom/rolls/CustomRoll.successLevels.test.jsx` (new) | Render tests (skill and weapon) |
| `front/src/components/ToastStack.jsx` | Border uses `tierColor` |
| `front/src/components/creator/SuccessLevelsBuilder.jsx` (new) | General-tab card body |
| `front/src/components/creator/SuccessLevelsBuilder.test.jsx` (new) | Builder tests |
| `front/src/components/creator/TemplateBuilder.jsx` | Mount the card after the modifier card |
| `front/src/style.css` | `.slb__*` styles |
| `front/src/components/tutorial/tours/creatorGeneral.js` | `successLevels` step |
| `front/src/locales/{en,pl}/translation.json` | All new keys |

(`backend/` = `warhammer-battle-helper-backend/`, `front/` = `warhammer-battle-helper-front/`.)

---

### Task 1: Backend model and validation

**Files:**
- Create: `warhammer-battle-helper-backend/internal/models/success_levels.go`
- Create: `warhammer-battle-helper-backend/internal/models/success_levels_test.go`
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`TemplateSettings`, ~line 48; `IsTemplateValidationError`, ~line 503)
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go` (`Update`, ~line 318)

**Interfaces:**
- Produces:
  - `models.SuccessLevelsConfig{Mode string; Step int; Success, Failure SuccessTier; Tiers []SuccessTier}` and `models.SuccessTier{ID string; Divisor int; Label, Color string}`.
  - Constants `models.SuccessLevelsOff = ""`, `models.SuccessLevelsTens = "tens"`, `models.SuccessLevelsTiers = "tiers"`, `models.DefaultSuccessLevelStep = 10`.
  - `func (c *SuccessLevelsConfig) Validate() error`, which is nil-safe.
  - `models.ErrInvalidSuccessLevels`.
  - The field `TemplateSettings.SuccessLevels *SuccessLevelsConfig`.

- [ ] **Step 1: Write the failing test**

`warhammer-battle-helper-backend/internal/models/success_levels_test.go`:

```go
package models

import (
	"errors"
	"strings"
	"testing"
)

func validTiersConfig() *SuccessLevelsConfig {
	return &SuccessLevelsConfig{
		Mode:    SuccessLevelsTiers,
		Success: SuccessTier{Label: "Success", Color: "#4a7c59"},
		Failure: SuccessTier{Label: "Failure", Color: "#c94444"},
		Tiers: []SuccessTier{
			{ID: "a", Divisor: 5, Label: "Extreme", Color: "#b8941f"},
			{ID: "b", Divisor: 2, Label: "Hard", Color: "#5a7a4a"},
		},
	}
}

func TestSuccessLevelsValidate(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(c *SuccessLevelsConfig)
		ok     bool
	}{
		{"valid tiers", func(c *SuccessLevelsConfig) {}, true},
		{"valid tens", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsTens; c.Step = 5 }, true},
		{"off keeps stored tiers", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsOff }, true},
		{"step zero reads as default", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsTens; c.Step = 0 }, true},
		// The creator autosaves on every keystroke, so a GM clearing a name to retype it must not get a 400.
		{"empty label allowed", func(c *SuccessLevelsConfig) { c.Tiers[0].Label = ""; c.Success.Label = "" }, true},
		{"empty colour allowed", func(c *SuccessLevelsConfig) { c.Failure.Color = "" }, true},
		{"unknown mode", func(c *SuccessLevelsConfig) { c.Mode = "difference" }, false},
		{"negative step", func(c *SuccessLevelsConfig) { c.Step = -1 }, false},
		{"step over max", func(c *SuccessLevelsConfig) { c.Step = 101 }, false},
		{"divisor one", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 1 }, false},
		{"divisor over max", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 101 }, false},
		{"duplicate divisor", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 5 }, false},
		{"bad colour", func(c *SuccessLevelsConfig) { c.Tiers[0].Color = "gold" }, false},
		{"bad fixed-row colour", func(c *SuccessLevelsConfig) { c.Success.Color = "#12345" }, false},
		{"label too long", func(c *SuccessLevelsConfig) { c.Tiers[0].Label = strings.Repeat("ś", 41) }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := validTiersConfig()
			tc.mutate(c)
			err := c.Validate()
			if tc.ok && err != nil {
				t.Fatalf("Validate() = %v, want nil", err)
			}
			if !tc.ok && !errors.Is(err, ErrInvalidSuccessLevels) {
				t.Fatalf("Validate() = %v, want ErrInvalidSuccessLevels", err)
			}
		})
	}
}

func TestSuccessLevelsValidate_NilIsOff(t *testing.T) {
	var c *SuccessLevelsConfig
	if err := c.Validate(); err != nil {
		t.Fatalf("nil config: got %v, want nil", err)
	}
}

func TestSuccessLevelsError_IsValidationError(t *testing.T) {
	if !IsTemplateValidationError(ErrInvalidSuccessLevels) {
		t.Fatal("ErrInvalidSuccessLevels must map to 400")
	}
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -run SuccessLevels`
Expected: the build fails with `undefined: SuccessLevelsConfig`.

- [ ] **Step 3: Implement**

`warhammer-battle-helper-backend/internal/models/success_levels.go`:

```go
package models

import (
	"errors"
	"regexp"
	"unicode/utf8"
)

// Success level modes (PLAYRPG-289). Off is the zero value, so nil and Mode == "" read the same.
const (
	SuccessLevelsOff   = ""
	SuccessLevelsTens  = "tens"
	SuccessLevelsTiers = "tiers"

	DefaultSuccessLevelStep = 10
	MaxSuccessLevelStep     = 100
	MinTierDivisor          = 2
	MaxTierDivisor          = 100
	MaxTierLabelRunes       = 40
)

// ErrInvalidSuccessLevels is a single sentinel: the creator never sends a bad config (it holds
// invalid input as a local draft), so this only guards the API and needs no per-cause message.
var ErrInvalidSuccessLevels = errors.New("template_invalid_success_levels")

var tierColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// SuccessLevelsConfig configures how a traditional custom roll reports its degree of success.
// "tens" scores floor(target/step) - floor(roll/step); "tiers" names the hardest fraction of the
// target the roll reached. Tiers survive while Mode is off, so a GM toggling back finds them.
type SuccessLevelsConfig struct {
	Mode    string        `bson:"mode" json:"mode"`
	Step    int           `bson:"step,omitempty" json:"step,omitempty"` // tens only; 0 reads as DefaultSuccessLevelStep
	Success SuccessTier   `bson:"success" json:"success"`               // tiers: the fixed 1/1 row
	Failure SuccessTier   `bson:"failure" json:"failure"`               // tiers: the fixed row when nothing is reached
	Tiers   []SuccessTier `bson:"tiers,omitempty" json:"tiers,omitempty"`
}

// SuccessTier is one row of the thresholds table. Divisor is unused on the fixed Success/Failure
// rows. Label is GM-authored free text, never run through i18n; empty falls back to the plain
// outcome label in the log.
type SuccessTier struct {
	ID      string `bson:"id,omitempty" json:"id,omitempty"`
	Divisor int    `bson:"divisor,omitempty" json:"divisor,omitempty"`
	Label   string `bson:"label" json:"label"`
	Color   string `bson:"color" json:"color"`
}

// Validate checks the stored shape regardless of Mode, because an "off" config still carries
// the tiers it will restore. Labels may be empty: the creator autosaves mid-edit.
func (c *SuccessLevelsConfig) Validate() error {
	if c == nil {
		return nil
	}
	switch c.Mode {
	case SuccessLevelsOff, SuccessLevelsTens, SuccessLevelsTiers:
	default:
		return ErrInvalidSuccessLevels
	}
	if c.Step < 0 || c.Step > MaxSuccessLevelStep {
		return ErrInvalidSuccessLevels
	}
	if !validTier(c.Success) || !validTier(c.Failure) {
		return ErrInvalidSuccessLevels
	}
	seen := make(map[int]bool, len(c.Tiers))
	for _, tier := range c.Tiers {
		if tier.Divisor < MinTierDivisor || tier.Divisor > MaxTierDivisor || seen[tier.Divisor] {
			return ErrInvalidSuccessLevels
		}
		seen[tier.Divisor] = true
		if !validTier(tier) {
			return ErrInvalidSuccessLevels
		}
	}
	return nil
}

func validTier(t SuccessTier) bool {
	if utf8.RuneCountInString(t.Label) > MaxTierLabelRunes {
		return false
	}
	return t.Color == "" || tierColorPattern.MatchString(t.Color)
}
```

In `SystemTemplate.go`, add the field to `TemplateSettings` after `SheetWidth`:

```go
	// SuccessLevels configures how traditional rolls report their degree of success (PLAYRPG-289).
	// nil means off, which is how every pre-existing template starts — no migration needed.
	SuccessLevels *SuccessLevelsConfig `bson:"successLevels,omitempty" json:"successLevels,omitempty"`
```

Extend `IsTemplateValidationError` by changing its last line:

```go
		errors.Is(err, ErrTemplateAboutOnVariant) ||
		errors.Is(err, ErrInvalidSuccessLevels)
```

In `TemplateService.Update`, insert right after the `NormalizeTemplateAbout` check:

```go
	if req.Settings != nil {
		if err := req.Settings.SuccessLevels.Validate(); err != nil {
			return nil, err
		}
	}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ ./internal/service/`
Expected: `ok` for both packages.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-backend/internal/models/success_levels.go warhammer-battle-helper-backend/internal/models/success_levels_test.go warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/service/TemplateService.go && git commit -m "feat: PLAYRPG-289 success levels template config and validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuVxzYQFbYkt1ydPu5H"
```

---

### Task 2: Backend roll scoring

**Files:**
- Create: `warhammer-battle-helper-backend/internal/systems/custom/successlevel.go`
- Create: `warhammer-battle-helper-backend/internal/systems/custom/successlevel_test.go`
- Modify: `warhammer-battle-helper-backend/internal/systems/interface.go` (`RollResult`, after `SuccessLevel`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go` (the `return &gsys.RollResult{...}` at the end of `rollFromFormula`)

**Interfaces:**
- Consumes: `models.SuccessLevelsConfig`, `models.SuccessTier` and the mode constants from Task 1.
- Produces:
  - Event JSON fields `hasSuccessLevel` (bool, omitempty), `successLevel` (int, always present), `tierLabel` and `tierColor` (string, omitempty). Tasks 3–4 read these from `data`.
  - `func applySuccessLevels(cfg *models.SuccessLevelsConfig, successType string, roll, threshold int, res *gsys.RollResult)`

- [ ] **Step 1: Write the failing test**

`warhammer-battle-helper-backend/internal/systems/custom/successlevel_test.go`:

```go
package custom

import (
	"testing"

	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
)

func tiersCfg() *models.SuccessLevelsConfig {
	return &models.SuccessLevelsConfig{
		Mode:    models.SuccessLevelsTiers,
		Success: models.SuccessTier{Label: "Success", Color: "#000001"},
		Failure: models.SuccessTier{Label: "Failure", Color: "#000002"},
		// Deliberately unsorted: evaluation order comes from the divisor, not the slice.
		Tiers: []models.SuccessTier{
			{ID: "h", Divisor: 2, Label: "Hard", Color: "#000003"},
			{ID: "e", Divisor: 5, Label: "Extreme", Color: "#000004"},
		},
	}
}

func TestApplySuccessLevels_Tens(t *testing.T) {
	cases := []struct {
		name        string
		successType string
		step        int
		roll, tgt   int
		outcome     string
		want        int
	}{
		{"crossing a tens digit counts", "below_threshold", 0, 38, 45, "regular_success", 1},
		{"same tens digit success", "below_threshold", 0, 44, 45, "regular_success", 0},
		{"same tens digit failure", "below_threshold", 0, 47, 45, "failure", 0},
		{"failure counts down", "below_threshold", 0, 72, 45, "failure", -3},
		{"deep success", "below_threshold", 0, 12, 45, "regular_success", 3},
		{"custom step", "below_threshold", 5, 38, 45, "regular_success", 2},
		{"roll over flips the sign", "above_threshold", 0, 72, 45, "regular_success", 3},
		{"empty success type is roll over", "", 0, 38, 45, "failure", -1},
		// Go's / truncates toward zero: -5/10 would be 0 instead of -1.
		{"negative target floors", "below_threshold", 0, 3, -5, "failure", -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &models.SuccessLevelsConfig{Mode: models.SuccessLevelsTens, Step: tc.step}
			res := &gsys.RollResult{Outcome: tc.outcome}
			applySuccessLevels(cfg, tc.successType, tc.roll, tc.tgt, res)
			if !res.HasSuccessLevel || res.SuccessLevel != tc.want {
				t.Fatalf("got has=%v sl=%d, want has=true sl=%d", res.HasSuccessLevel, res.SuccessLevel, tc.want)
			}
			if res.TierLabel != "" || res.TierColor != "" {
				t.Fatalf("tens mode must not set a tier, got %q %q", res.TierLabel, res.TierColor)
			}
		})
	}
}

func TestApplySuccessLevels_Tiers(t *testing.T) {
	cases := []struct {
		name        string
		successType string
		roll, tgt   int
		outcome     string
		wantLabel   string
	}{
		{"hardest tier first", "below_threshold", 12, 60, "regular_success", "Extreme"},
		{"middle tier", "below_threshold", 30, 60, "regular_success", "Hard"},
		{"plain success", "below_threshold", 31, 60, "regular_success", "Success"},
		{"failure", "below_threshold", 61, 60, "failure", "Failure"},
		{"roll over ignores tiers", "above_threshold", 300, 60, "regular_success", "Success"},
		{"roll over failure", "above_threshold", 10, 60, "failure", "Failure"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := &gsys.RollResult{Outcome: tc.outcome}
			applySuccessLevels(tiersCfg(), tc.successType, tc.roll, tc.tgt, res)
			if res.TierLabel != tc.wantLabel {
				t.Fatalf("TierLabel = %q, want %q", res.TierLabel, tc.wantLabel)
			}
			if res.TierColor == "" {
				t.Fatal("TierColor must be copied with the label")
			}
			if res.HasSuccessLevel {
				t.Fatal("tiers mode must not set a success level")
			}
		})
	}
}

func TestApplySuccessLevels_NoOp(t *testing.T) {
	cases := []struct {
		name    string
		cfg     *models.SuccessLevelsConfig
		outcome string
	}{
		{"nil config", nil, "regular_success"},
		{"mode off", &models.SuccessLevelsConfig{Mode: models.SuccessLevelsOff, Tiers: tiersCfg().Tiers}, "regular_success"},
		// evalOutcome prints the number itself for raw rolls and rolls without a threshold.
		{"raw roll", tiersCfg(), "48"},
		{"pool-like outcome", &models.SuccessLevelsConfig{Mode: models.SuccessLevelsTens}, "3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := &gsys.RollResult{Outcome: tc.outcome}
			applySuccessLevels(tc.cfg, "below_threshold", 10, 50, res)
			if res.HasSuccessLevel || res.TierLabel != "" || res.TierColor != "" {
				t.Fatalf("expected no-op, got %+v", res)
			}
		})
	}
}

// End to end through rollFromFormula: the level is scored against the target AFTER a
// threshold-target modifier, and dice-pool rolls never get one.
func TestRollFromFormula_SuccessLevels(t *testing.T) {
	stats := sampleStats()
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
		Threshold:   "55",
	}
	tmpl := tmplWithModifier(ModTargetThreshold, "")
	tmpl.Settings.SuccessLevels = &models.SuccessLevelsConfig{Mode: models.SuccessLevelsTens}

	p := newTestPlugin(27) // d100 -> 28
	res, err := p.rollFromFormula(stats, tmpl, "atk", "str", false, cfg, -20)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	// Target 55-20 = 35: floor(35/10) - floor(28/10) = 3 - 2 = 1.
	if !res.HasSuccessLevel || res.SuccessLevel != 1 {
		t.Fatalf("got has=%v sl=%d, want +1 against the shifted target", res.HasSuccessLevel, res.SuccessLevel)
	}

	poolCfg := &models.RollConfig{
		Formula:              []models.FormulaBlock{diceBlock("d6")},
		RollMode:             "dice_pool",
		PoolSuccessThreshold: 4,
	}
	p = newTestPlugin(4) // d6 -> 5
	poolRes, err := p.rollFromFormula(stats, tmpl, "atk", "str", false, poolCfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula(pool) error: %v", err)
	}
	if poolRes.HasSuccessLevel || poolRes.TierLabel != "" {
		t.Fatalf("dice pool must not be scored, got %+v", poolRes)
	}
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'SuccessLevels'`
Expected: the build fails with `undefined: applySuccessLevels` / `res.HasSuccessLevel undefined`.

- [ ] **Step 3: Implement**

In `internal/systems/interface.go`, add the fields right after the `SuccessLevel` line:

```go
	// Custom-system degree of success (PLAYRPG-289), snapshotted at roll time so the log keeps
	// what the template said then. HasSuccessLevel exists because SuccessLevel has no omitempty:
	// a bare 0 cannot tell "level 0" from "not scored".
	HasSuccessLevel bool   `json:"hasSuccessLevel,omitempty"`
	TierLabel       string `json:"tierLabel,omitempty"`
	TierColor       string `json:"tierColor,omitempty"`
```

`internal/systems/custom/successlevel.go`:

```go
package custom

import (
	"sort"

	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
)

// applySuccessLevels scores a traditional roll's degree of success into res (PLAYRPG-289).
// It only acts on a real success/failure: evalOutcome writes the number itself as the outcome for
// raw rolls and rolls without a threshold, and dice-pool rolls never call it.
// threshold is the final target, after any threshold-target modifier.
func applySuccessLevels(cfg *models.SuccessLevelsConfig, successType string, roll, threshold int, res *gsys.RollResult) {
	if cfg == nil {
		return
	}
	success := res.Outcome == "regular_success"
	if !success && res.Outcome != "failure" {
		return
	}
	// Same default as evalOutcome: anything but "below_threshold" is roll-over.
	below := successType == "below_threshold"

	switch cfg.Mode {
	case models.SuccessLevelsTens:
		step := cfg.Step
		if step <= 0 {
			step = models.DefaultSuccessLevelStep
		}
		sl := floorDiv(threshold, step) - floorDiv(roll, step)
		if !below {
			sl = -sl
		}
		res.SuccessLevel = sl
		res.HasSuccessLevel = true
	case models.SuccessLevelsTiers:
		tier := pickTier(cfg, below, success, roll, threshold)
		res.TierLabel = tier.Label
		res.TierColor = tier.Color
	}
}

// pickTier returns the hardest tier the roll reached. Fractions of the target only mean
// "harder" for roll-under, so roll-over falls straight to the fixed Success/Failure rows.
func pickTier(cfg *models.SuccessLevelsConfig, below, success bool, roll, threshold int) models.SuccessTier {
	if !success {
		return cfg.Failure
	}
	if below {
		tiers := append([]models.SuccessTier(nil), cfg.Tiers...)
		sort.SliceStable(tiers, func(i, j int) bool { return tiers[i].Divisor > tiers[j].Divisor })
		for _, tier := range tiers {
			if tier.Divisor >= models.MinTierDivisor && roll <= floorDiv(threshold, tier.Divisor) {
				return tier
			}
		}
	}
	return cfg.Success
}

// floorDiv rounds toward negative infinity. Go's / truncates toward zero, which would score a
// negative target (a real value since FEATURE-162) one level too high.
func floorDiv(a, b int) int {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}
```

In `roller.go`, at the end of `rollFromFormula`, replace `return &gsys.RollResult{` ... `}, nil` with this, keeping the same fields:

```go
	res := &gsys.RollResult{
		DiceType:         diceType,
		RollType:         "skill",
		Roll:             finalRoll,
		Target:           threshold,
		Outcome:          outcome,
		SkillKey:         skillKey,
		SkillName:        skillLabel,
		Modifier:         appliedValue,
		ModifierTarget:   appliedTarget,
		FormulaBreakdown: breakdown,
	}
	applySuccessLevels(template.Settings.SuccessLevels, cfg.SuccessType, finalRoll, threshold, res)
	return res, nil
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/...`
Expected: every package `ok`, existing roller and weapon tests included.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-backend/internal/systems/interface.go warhammer-battle-helper-backend/internal/systems/custom/successlevel.go warhammer-battle-helper-backend/internal/systems/custom/successlevel_test.go warhammer-battle-helper-backend/internal/systems/custom/roller.go && git commit -m "feat: PLAYRPG-289 score custom rolls into success levels or tiers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuVxzYQFbYkt1ydPu5H"
```

---

### Task 3: Log, weapon log and toast display

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/rolls/successLevelDisplay.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/rolls/successLevelDisplay.test.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.successLevels.test.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomWeaponRoll.jsx`
- Modify: `warhammer-battle-helper-front/src/components/ToastStack.jsx:55`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json` (`customRoll` object)

**Interfaces:**
- Consumes: the event fields `hasSuccessLevel`, `successLevel`, `tierLabel` and `tierColor` from Task 2.
- Produces: `successLevelDisplay(data, outcomeLabel, t) → { label: string, color: string|null } | null` and the i18n key `customRoll.slAbbr`. Task 4 reuses `customRoll.slAbbr`.

- [ ] **Step 1: Add the i18n key**

In `locales/en/translation.json`, inside `"customRoll"`, add `"slAbbr": "SL"`. In `locales/pl/translation.json`, inside `"customRoll"`, add `"slAbbr": "PS"`.

- [ ] **Step 2: Write the failing tests**

`successLevelDisplay.test.js`:

```js
import { successLevelDisplay } from './successLevelDisplay';

const t = key => (key === 'customRoll.slAbbr' ? 'SL' : key);

describe('successLevelDisplay', () => {
  it('returns null when the roll carries no success data', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', successLevel: 0 }, 'Success!', t)).toBeNull();
  });

  it('formats a positive level', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', hasSuccessLevel: true, successLevel: 2 }, 'Success!', t))
      .toEqual({ label: 'Success! · +2 SL', color: null });
  });

  it('formats a negative level with a real minus sign', () => {
    expect(successLevelDisplay({ outcome: 'failure', hasSuccessLevel: true, successLevel: -3 }, 'Failure!', t).label)
      .toBe('Failure! · −3 SL');
  });

  // Level 0 is both "barely made it" and "barely missed"; the outcome picks the sign.
  it('signs zero from the outcome', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', hasSuccessLevel: true, successLevel: 0 }, 'S', t).label).toBe('S · +0 SL');
    expect(successLevelDisplay({ outcome: 'failure', hasSuccessLevel: true, successLevel: 0 }, 'F', t).label).toBe('F · −0 SL');
  });

  it('uses the tier label and colour', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', tierLabel: 'Extreme', tierColor: '#b8941f' }, 'Success!', t))
      .toEqual({ label: 'Extreme', color: '#b8941f' });
  });

  it('falls back to the outcome label for an unnamed tier', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', tierColor: '#b8941f' }, 'Success!', t))
      .toEqual({ label: 'Success!', color: '#b8941f' });
  });
});
```

`CustomRoll.successLevels.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import CustomRoll from './CustomRoll';
import CustomWeaponRoll from './CustomWeaponRoll';

const base = { characterName: 'Hero', skillName: 'Charm', roll: 12, target: 60, diceType: 100 };

describe('custom roll success levels', () => {
  it('shows the tier name in the tier colour', () => {
    const { container } = render(
      <CustomRoll data={{ ...base, outcome: 'regular_success', tierLabel: 'Extreme', tierColor: '#b8941f' }} />
    );
    expect(screen.getByText('Extreme')).toHaveStyle({ color: '#b8941f' });
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('.wax-seal-token')).toHaveStyle({ background: '#b8941f' });
  });

  it('appends the signed level to the outcome label', () => {
    render(<CustomRoll data={{ ...base, roll: 38, target: 45, outcome: 'failure', hasSuccessLevel: true, successLevel: 0 }} />);
    const abbr = i18n.t('customRoll.slAbbr');
    expect(screen.getByText(`${i18n.t('customRoll.failure')} · −0 ${abbr}`)).toBeInTheDocument();
  });

  it('leaves a roll without success data as it was', () => {
    render(<CustomRoll data={{ ...base, outcome: 'regular_success' }} />);
    expect(screen.getByText(i18n.t('customRoll.regular_success'))).toBeInTheDocument();
  });

  it('shows the tier on a weapon attack', () => {
    render(<CustomWeaponRoll data={{ ...base, weaponName: 'Axe', outcome: 'regular_success', tierLabel: 'Hard', tierColor: '#5a7a4a' }} />);
    expect(screen.getByText('Hard')).toHaveStyle({ color: '#5a7a4a' });
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='successLevelDisplay|CustomRoll.successLevels'`
Expected: FAIL with `Cannot find module './successLevelDisplay'`.

- [ ] **Step 4: Implement**

`successLevelDisplay.js`:

```js
// Turns the success data the backend snapshotted into the event (PLAYRPG-289, successlevel.go)
// into the log's result line. The log never consults the template: a GM editing tiers later
// must not rewrite history.
const MINUS = '−';

export function successLevelDisplay(data, outcomeLabel, t) {
  if (data.tierLabel || data.tierColor) {
    return { label: data.tierLabel || outcomeLabel, color: data.tierColor || null };
  }
  if (data.hasSuccessLevel) {
    const level = data.successLevel || 0;
    // Level 0 happens on both sides of the target; only the outcome says which.
    const negative = level < 0 || (level === 0 && data.outcome === 'failure');
    return {
      label: `${outcomeLabel} · ${negative ? MINUS : '+'}${Math.abs(level)} ${t('customRoll.slAbbr')}`,
      color: null,
    };
  }
  return null;
}
```

`CustomRoll.jsx`:
- Add the import `import { successLevelDisplay } from './successLevelDisplay';`.
- Move the `outcomeLabel` declaration above `resultColor`.
- Replace the `resultColor` line with:

```js
  const outcomeLabel = isRaw
    ? data.outcome
    : t(`customRoll.${data.outcome}`, { defaultValue: data.outcome });

  const successDisplay = isRaw ? null : successLevelDisplay(data, outcomeLabel, t);
  const resultColor = isRaw
    ? 'var(--log-brown-muted)'
    : (successDisplay?.color || getResultColor(isCritSuccess, isCritFailure, isSuccess));
```

  Delete the old `outcomeLabel` block further down.
- Add `overrideColor={successDisplay?.color || undefined}` to `<WaxSealToken ...>`.
- Change the result line `{outcomeLabel}` to `{successDisplay?.label || outcomeLabel}`.

`CustomWeaponRoll.jsx`: make the same four edits. Its `outcomeLabel` block is already above `resultColor`'s neighbours, so move `resultColor` below `outcomeLabel` and use the identical `successDisplay` / `resultColor` code shown above. Change the `{outcomeLabel}` inside the `{!isRaw && (` result block.

`ToastStack.jsx:55`:

```js
  // A tier carries its own GM colour (PLAYRPG-289); everything else keys off the outcome.
  const borderColor = data.tierColor || OUTCOME_BORDER[outcome] || 'var(--log-brown-muted)';
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='successLevelDisplay|CustomRoll|CustomWeaponRoll|ToastStack'`
Expected: PASS, existing `CustomRoll.*` and `CustomWeaponRoll.*` tests included.

- [ ] **Step 6: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/systems/custom/rolls/ warhammer-battle-helper-front/src/components/ToastStack.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && git commit -m "feat: PLAYRPG-289 show success levels and tiers in the roll log

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuVxzYQFbYkt1ydPu5H"
```

---

### Task 4: Creator card, i18n and tutorial step

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/successLevels.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/successLevels.test.js`
- Create: `warhammer-battle-helper-front/src/components/creator/SuccessLevelsBuilder.jsx`
- Create: `warhammer-battle-helper-front/src/components/creator/SuccessLevelsBuilder.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (import ~line 62; card after the `creator__settings-card--modifier` block, ~line 1973)
- Modify: `warhammer-battle-helper-front/src/style.css` (append after the `.mcb__*` block, ~line 12640)
- Modify: `warhammer-battle-helper-front/src/components/tutorial/tours/creatorGeneral.js`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `genId(prefix)` from `src/utils/surrogateKeys.js`, `customRoll.slAbbr` from Task 3, and the JSON shape of `models.SuccessLevelsConfig` from Task 1 (`mode`, `step`, `success`, `failure`, `tiers[{id, divisor, label, color}]`).
- Produces: `<SuccessLevelsBuilder value onChange />` and the card class `.creator__settings-card--success-levels`.

- [ ] **Step 1: Add the i18n keys**

`locales/en/translation.json`:
- Inside `creator.general`, add:
  - `"successLevelsTitle": "Success levels"`
  - `"successLevelsHint": "How the log reports how well a roll went"`
- Add a new object `creator.successLevels`:

```json
"successLevels": {
  "mode": { "off": "Off", "tens": "Levels per step", "tiers": "Thresholds" },
  "offHint": "Rolls show only success or failure.",
  "step": "Step",
  "tensHint": "One level for every step between the tens digits of the target and of the roll. A failure counts down.",
  "tensExample": "Target {{target}}, roll {{roll}} → {{level}} {{abbr}}",
  "tiersHint": "The hardest threshold is checked first. Thresholds apply to roll-under fields; a roll-over field shows only success or failure.",
  "divisor": "Fraction of the target",
  "divisorError": "Each fraction must be different, from 1/2 to 1/100.",
  "label": "Name",
  "labelPlaceholder": "Threshold name",
  "color": "Colour",
  "remove": "Remove threshold",
  "add": "Add threshold",
  "failureRow": "none",
  "default": { "extreme": "Extreme success", "hard": "Hard success", "success": "Success", "failure": "Failure" }
}
```

- Inside `tutorial.creatorGeneral`, add the `successLevels` object right after `modifier`:

```json
"successLevels": {
  "title": "Success levels",
  "body": "Choose how the log grades a roll: a signed number of levels per step, or named thresholds such as half or a fifth of the target, each in its own colour."
}
```

`locales/pl/translation.json`, same structure:
- `creator.general.successLevelsTitle`: `"Poziomy sukcesu"`
- `creator.general.successLevelsHint`: `"Jak log pokazuje, jak dobrze poszedł rzut"`
- `creator.successLevels`:

```json
"successLevels": {
  "mode": { "off": "Wyłączone", "tens": "Poziomy co krok", "tiers": "Progi" },
  "offHint": "Rzuty pokazują tylko sukces albo porażkę.",
  "step": "Krok",
  "tensHint": "Jeden poziom za każdy krok różnicy między cyframi dziesiątek progu i rzutu. Porażka liczy w dół.",
  "tensExample": "Próg {{target}}, rzut {{roll}} → {{level}} {{abbr}}",
  "tiersHint": "Najtrudniejszy próg sprawdzany jest pierwszy. Progi dotyczą pól z rzutem pod próg; rzut nad próg pokazuje tylko sukces albo porażkę.",
  "divisor": "Ułamek progu",
  "divisorError": "Każdy ułamek musi być inny, od 1/2 do 1/100.",
  "label": "Nazwa",
  "labelPlaceholder": "Nazwa progu",
  "color": "Kolor",
  "remove": "Usuń próg",
  "add": "Dodaj próg",
  "failureRow": "brak",
  "default": { "extreme": "Ekstremalny sukces", "hard": "Trudny sukces", "success": "Sukces", "failure": "Porażka" }
}
```

- `tutorial.creatorGeneral.successLevels`:

```json
"successLevels": {
  "title": "Poziomy sukcesu",
  "body": "Wybierz, jak log ocenia rzut: liczbą poziomów ze znakiem co krok albo nazwanymi progami, np. połową czy piątą częścią progu, każdy w swoim kolorze."
}
```

Run: `python3 .claude/skills/i18n-sync/compare_keys.py` (from the repo root)
Expected: exit 0.

- [ ] **Step 2: Write the failing tests**

`systems/custom/successLevels.test.js`:

```js
import { tensLevel, sortTiers, freeDivisor, isDivisorValid, defaultTiers } from './successLevels';

describe('successLevels helpers', () => {
  it('scores tens digits like the backend', () => {
    expect(tensLevel(38, 45, 10)).toBe(1);
    expect(tensLevel(72, 45, 10)).toBe(-3);
    expect(tensLevel(38, 45, 5)).toBe(2);
    expect(tensLevel(38, 45, 0)).toBe(1); // 0 reads as the default step
  });

  it('sorts the hardest threshold first', () => {
    expect(sortTiers([{ divisor: 2 }, { divisor: 5 }, { divisor: 3 }]).map(x => x.divisor)).toEqual([5, 3, 2]);
  });

  it('finds the smallest unused divisor', () => {
    expect(freeDivisor([{ divisor: 2 }, { divisor: 5 }])).toBe(3);
    expect(freeDivisor([])).toBe(2);
  });

  it('rejects out-of-range and duplicate divisors but not the row itself', () => {
    const tiers = [{ id: 'a', divisor: 5 }, { id: 'b', divisor: 2 }];
    expect(isDivisorValid(3, tiers, 'b')).toBe(true);
    expect(isDivisorValid(2, tiers, 'b')).toBe(true);
    expect(isDivisorValid(5, tiers, 'b')).toBe(false);
    expect(isDivisorValid(1, tiers, 'b')).toBe(false);
    expect(isDivisorValid(101, tiers, 'b')).toBe(false);
    expect(isDivisorValid(NaN, tiers, 'b')).toBe(false);
  });

  it('seeds a fifth and a half plus coloured fixed rows', () => {
    const d = defaultTiers(k => k);
    expect(d.tiers.map(x => x.divisor)).toEqual([5, 2]);
    expect(d.success.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(d.failure.label).toBe('creator.successLevels.default.failure');
  });
});
```

`components/creator/SuccessLevelsBuilder.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import SuccessLevelsBuilder from './SuccessLevelsBuilder';

const tiersValue = () => ({
  mode: 'tiers',
  success: { label: 'Mine', color: '#111111' },
  failure: { label: 'Nope', color: '#222222' },
  tiers: [
    { id: 'a', divisor: 5, label: 'Extreme', color: '#333333' },
    { id: 'b', divisor: 2, label: 'Hard', color: '#444444' },
  ],
});

describe('SuccessLevelsBuilder', () => {
  it('starts off when the template has no config', () => {
    render(<SuccessLevelsBuilder value={undefined} onChange={() => {}} />);
    expect(screen.getByTestId('slb-mode-off')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('slb-step')).toBeNull();
  });

  it('seeds default thresholds in the GM language on first entry', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-tiers'));
    const cfg = onChange.mock.calls[0][0];
    expect(cfg.mode).toBe('tiers');
    expect(cfg.tiers.map(x => x.divisor)).toEqual([5, 2]);
    expect(cfg.success.label).toBe(i18n.t('creator.successLevels.default.success'));
    expect(cfg.failure.label).toBe(i18n.t('creator.successLevels.default.failure'));
  });

  it('keeps the GM thresholds when switching off and back on', () => {
    const onChange = jest.fn();
    const { rerender } = render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-off'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: '', tiers: tiersValue().tiers }));

    rerender(<SuccessLevelsBuilder value={{ ...tiersValue(), mode: '' }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-tiers'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'tiers', success: { label: 'Mine', color: '#111111' },
    }));
  });

  it('commits a step and shows a live example', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={{ mode: 'tens', step: 10 }} onChange={onChange} />);
    expect(screen.getByTestId('slb-example')).toHaveTextContent('+1');
    fireEvent.change(screen.getByTestId('slb-step'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ step: 5 }));
  });

  it('holds a duplicate divisor as a flagged draft instead of saving it', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    const input = screen.getByTestId('slb-divisor-b');
    fireEvent.change(input, { target: { value: '5' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveClass('slb__divisor--invalid');
    expect(screen.getByText(i18n.t('creator.successLevels.divisorError'))).toBeInTheDocument();
  });

  it('commits a valid divisor', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('slb-divisor-b'), { target: { value: '3' } });
    const cfg = onChange.mock.calls[0][0];
    expect(cfg.tiers.find(x => x.id === 'b').divisor).toBe(3);
  });

  it('adds the smallest free divisor in sorted position', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-add'));
    expect(onChange.mock.calls[0][0].tiers.map(x => x.divisor)).toEqual([5, 3, 2]);
  });

  it('removes a threshold but never the fixed rows', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    expect(screen.queryByTestId('slb-remove-success')).toBeNull();
    fireEvent.click(screen.getByTestId('slb-remove-a'));
    expect(onChange.mock.calls[0][0].tiers.map(x => x.id)).toEqual(['b']);
  });

  it('edits a fixed row label', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('slb-label-failure'), { target: { value: 'Miss' } });
    expect(onChange.mock.calls[0][0].failure).toEqual({ label: 'Miss', color: '#222222' });
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='successLevels.test|SuccessLevelsBuilder'`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 4: Implement the helpers**

`systems/custom/successLevels.js`:

```js
import { genId } from '../../utils/surrogateKeys';

// Creator-side mirror of models/success_levels.go (PLAYRPG-289). The roll itself is scored in Go
// (successlevel.go); tensLevel exists only for the creator's live example.
export const SL_MODE_OFF = '';
export const SL_MODE_TENS = 'tens';
export const SL_MODE_TIERS = 'tiers';

export const DEFAULT_SL_STEP = 10;
export const MAX_SL_STEP = 100;
export const MIN_TIER_DIVISOR = 2;
export const MAX_TIER_DIVISOR = 100;
export const MAX_TIER_LABEL = 40;

// Hex because <input type="color"> takes nothing else; values match LogWindow.css --log-* tokens.
export const SL_COLORS = {
  extreme: '#b8941f', // --log-gold-medium
  hard: '#5a7a4a',    // --log-green-medium
  success: '#4a7c59', // --log-success
  failure: '#c94444', // --log-red-light
};

export function tensLevel(roll, target, step) {
  const s = step > 0 ? step : DEFAULT_SL_STEP;
  return Math.floor(target / s) - Math.floor(roll / s);
}

export function defaultTiers(t) {
  return {
    success: { label: t('creator.successLevels.default.success'), color: SL_COLORS.success },
    failure: { label: t('creator.successLevels.default.failure'), color: SL_COLORS.failure },
    tiers: [
      { id: genId('tier'), divisor: 5, label: t('creator.successLevels.default.extreme'), color: SL_COLORS.extreme },
      { id: genId('tier'), divisor: 2, label: t('creator.successLevels.default.hard'), color: SL_COLORS.hard },
    ],
  };
}

export const sortTiers = tiers => [...tiers].sort((a, b) => b.divisor - a.divisor);

export function freeDivisor(tiers) {
  const used = new Set(tiers.map(x => x.divisor));
  for (let d = MIN_TIER_DIVISOR; d <= MAX_TIER_DIVISOR; d++) {
    if (!used.has(d)) return d;
  }
  return null;
}

export function isDivisorValid(divisor, tiers, ownId) {
  return Number.isInteger(divisor)
    && divisor >= MIN_TIER_DIVISOR
    && divisor <= MAX_TIER_DIVISOR
    && !tiers.some(x => x.id !== ownId && x.divisor === divisor);
}
```

- [ ] **Step 5: Implement the component**

`components/creator/SuccessLevelsBuilder.jsx`:

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { genId } from '../../utils/surrogateKeys';
import {
  SL_MODE_OFF, SL_MODE_TENS, SL_MODE_TIERS, DEFAULT_SL_STEP, MAX_SL_STEP, MAX_TIER_LABEL,
  MIN_TIER_DIVISOR, MAX_TIER_DIVISOR, SL_COLORS,
  tensLevel, defaultTiers, sortTiers, freeDivisor, isDivisorValid,
} from '../../systems/custom/successLevels';

const MODES = [SL_MODE_OFF, SL_MODE_TENS, SL_MODE_TIERS];
const MODE_KEYS = { [SL_MODE_OFF]: 'off', [SL_MODE_TENS]: 'tens', [SL_MODE_TIERS]: 'tiers' };
const EXAMPLE = { target: 45, roll: 38 };
const EMPTY_ROW = { label: '', color: '' };

function SuccessLevelsBuilder({ value, onChange }) {
  const { t } = useTranslation();
  const cfg = { mode: SL_MODE_OFF, step: 0, success: EMPTY_ROW, failure: EMPTY_ROW, tiers: [], ...(value || {}) };
  const up = patch => onChange({ ...cfg, ...patch });

  // Numeric inputs edit a draft (same reason as ModifierConfigBuilder): the creator autosaves, so
  // an out-of-range or duplicate value must stay local until it is valid. Blur drops a bad draft.
  const [draft, setDraft] = useState(null); // { id: 'step' | tierId, raw: string } | null
  const draftOf = (id, stored) => (draft && draft.id === id ? draft.raw : String(stored));

  const setMode = mode => {
    setDraft(null);
    // The fixed rows get a colour only from seeding, so a missing colour means "never seeded" —
    // a GM who cleared every name keeps their empty table instead of getting the defaults back.
    if (mode === SL_MODE_TIERS && !cfg.success.color) {
      up({ mode, ...defaultTiers(t) });
      return;
    }
    up({ mode });
  };

  const handleStepChange = raw => {
    setDraft({ id: 'step', raw });
    const parsed = parseInt(raw, 10);
    if (parsed >= 1 && parsed <= MAX_SL_STEP) up({ step: parsed });
  };

  const updateTier = (id, patch) => up({ tiers: cfg.tiers.map(x => (x.id === id ? { ...x, ...patch } : x)) });

  const handleDivisorChange = (id, raw) => {
    setDraft({ id, raw });
    const parsed = parseInt(raw, 10);
    if (isDivisorValid(parsed, cfg.tiers, id)) updateTier(id, { divisor: parsed });
  };

  // Rows re-sort on blur, not per keystroke: moving the row being typed into would steal focus.
  const handleDivisorBlur = () => {
    setDraft(null);
    const sorted = sortTiers(cfg.tiers);
    if (sorted.some((x, i) => x.id !== cfg.tiers[i].id)) up({ tiers: sorted });
  };

  const addTier = () => {
    const divisor = freeDivisor(cfg.tiers);
    if (divisor === null) return;
    up({ tiers: sortTiers([...cfg.tiers, { id: genId('tier'), divisor, label: '', color: SL_COLORS.hard }]) });
  };

  const draftInvalid = draft && draft.id !== 'step'
    && !isDivisorValid(parseInt(draft.raw, 10), cfg.tiers, draft.id);

  const step = cfg.step || DEFAULT_SL_STEP;
  const exampleLevel = tensLevel(EXAMPLE.roll, EXAMPLE.target, step);

  const renderNameAndColor = (testKey, row, onRowChange) => (
    <>
      <input
        type="text"
        className="slb__label"
        data-testid={`slb-label-${testKey}`}
        value={row.label || ''}
        maxLength={MAX_TIER_LABEL}
        placeholder={t('creator.successLevels.labelPlaceholder')}
        aria-label={t('creator.successLevels.label')}
        onChange={e => onRowChange({ label: e.target.value })}
      />
      <input
        type="color"
        className="slb__color"
        data-testid={`slb-color-${testKey}`}
        value={row.color || SL_COLORS.success}
        aria-label={t('creator.successLevels.color')}
        onChange={e => onRowChange({ color: e.target.value })}
      />
    </>
  );

  return (
    <div className="slb__root">
      <div className="slb__modes" role="group">
        {MODES.map(mode => (
          <button
            key={MODE_KEYS[mode]}
            type="button"
            className={`slb__mode${cfg.mode === mode ? ' slb__mode--active' : ''}`}
            data-testid={`slb-mode-${MODE_KEYS[mode]}`}
            aria-pressed={cfg.mode === mode}
            onClick={() => setMode(mode)}
          >
            {t(`creator.successLevels.mode.${MODE_KEYS[mode]}`)}
          </button>
        ))}
      </div>

      {cfg.mode === SL_MODE_OFF && <div className="slb__hint">{t('creator.successLevels.offHint')}</div>}

      {cfg.mode === SL_MODE_TENS && (
        <>
          <div className="slb__field">
            <label className="slb__field-label" htmlFor="slb-step">{t('creator.successLevels.step')}</label>
            <input
              id="slb-step"
              data-testid="slb-step"
              className="slb__step"
              type="number"
              min={1}
              max={MAX_SL_STEP}
              value={draftOf('step', step)}
              onChange={e => handleStepChange(e.target.value)}
              onBlur={() => setDraft(null)}
            />
          </div>
          <div className="slb__hint">{t('creator.successLevels.tensHint')}</div>
          <div className="slb__example" data-testid="slb-example">
            {t('creator.successLevels.tensExample', {
              target: EXAMPLE.target,
              roll: EXAMPLE.roll,
              level: `${exampleLevel < 0 ? '−' : '+'}${Math.abs(exampleLevel)}`,
              abbr: t('customRoll.slAbbr'),
            })}
          </div>
        </>
      )}

      {cfg.mode === SL_MODE_TIERS && (
        <>
          <div className="slb__rows">
            {cfg.tiers.map(tier => (
              <div className="slb__row" key={tier.id}>
                <span className="slb__fraction">1/</span>
                <input
                  type="number"
                  className={`slb__divisor${draft && draft.id === tier.id && draftInvalid ? ' slb__divisor--invalid' : ''}`}
                  data-testid={`slb-divisor-${tier.id}`}
                  min={MIN_TIER_DIVISOR}
                  max={MAX_TIER_DIVISOR}
                  value={draftOf(tier.id, tier.divisor)}
                  aria-label={t('creator.successLevels.divisor')}
                  onChange={e => handleDivisorChange(tier.id, e.target.value)}
                  onBlur={handleDivisorBlur}
                />
                {renderNameAndColor(tier.id, tier, patch => updateTier(tier.id, patch))}
                <button
                  type="button"
                  className="slb__remove"
                  data-testid={`slb-remove-${tier.id}`}
                  title={t('creator.successLevels.remove')}
                  aria-label={t('creator.successLevels.remove')}
                  onClick={() => up({ tiers: cfg.tiers.filter(x => x.id !== tier.id) })}
                >
                  <DeleteOutlineIcon style={{ fontSize: 16 }} />
                </button>
              </div>
            ))}
            <div className="slb__row slb__row--fixed">
              <span className="slb__fraction slb__fraction--fixed">1/1</span>
              {renderNameAndColor('success', cfg.success, patch => up({ success: { ...cfg.success, ...patch } }))}
              <span className="slb__remove-spacer" />
            </div>
            <div className="slb__row slb__row--fixed">
              <span className="slb__fraction slb__fraction--fixed">{t('creator.successLevels.failureRow')}</span>
              {renderNameAndColor('failure', cfg.failure, patch => up({ failure: { ...cfg.failure, ...patch } }))}
              <span className="slb__remove-spacer" />
            </div>
          </div>
          {draftInvalid && <div className="slb__error">{t('creator.successLevels.divisorError')}</div>}
          <button
            type="button"
            className="slb__add"
            data-testid="slb-add"
            disabled={freeDivisor(cfg.tiers) === null}
            onClick={addTier}
          >
            <AddIcon style={{ fontSize: 15 }} /> {t('creator.successLevels.add')}
          </button>
          <div className="slb__hint">{t('creator.successLevels.tiersHint')}</div>
        </>
      )}
    </div>
  );
}

export default SuccessLevelsBuilder;
```

`style.css`, appended after the `.mcb__*` block. Colours follow the CLAUDE.md sheet palette:

```css
.slb__root {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.slb__modes {
    display: flex;
    border: 1px solid #c4a882;
    border-radius: 3px;
    overflow: hidden;
    align-self: flex-start;
}

.slb__mode {
    padding: 5px 12px;
    background: #fff9f0;
    border: none;
    border-right: 1px solid #c4a882;
    color: #7a5c42;
    font-family: 'Crimson Text', serif;
    font-size: 0.85rem;
    cursor: pointer;
}

.slb__mode:last-child {
    border-right: none;
}

.slb__mode.slb__mode--active {
    background: #c9975b;
    color: #fff9f0;
}

.slb__hint,
.slb__example {
    font-size: 0.78rem;
    color: rgba(58, 47, 31, 0.6);
    line-height: 1.35;
}

.slb__example {
    color: #3a2f1f;
}

.slb__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.slb__field-label {
    font-size: 0.78rem;
    color: #7a5c42;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.slb__rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.slb__row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.slb__fraction {
    color: #7a5c42;
    font-size: 0.85rem;
    white-space: nowrap;
}

.slb__fraction.slb__fraction--fixed {
    min-width: 72px;
}

.slb__step,
.slb__divisor,
.slb__label {
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 3px;
    padding: 5px 8px;
    font-size: 0.85rem;
    color: #3a2f1f;
    font-family: 'Crimson Text', serif;
    outline: none;
}

.slb__step {
    width: 80px;
}

.slb__divisor {
    width: 56px;
}

.slb__label {
    flex: 1;
    min-width: 0;
}

.slb__step:focus,
.slb__divisor:focus,
.slb__label:focus {
    border-color: #7a5c42;
}

.slb__divisor.slb__divisor--invalid {
    border-color: #c94444;
}

.slb__color {
    width: 32px;
    height: 28px;
    padding: 0;
    border: 1px solid #c4a882;
    border-radius: 3px;
    background: none;
    cursor: pointer;
}

.slb__remove,
.slb__remove-spacer {
    width: 26px;
    flex-shrink: 0;
}

.slb__remove {
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #7a5c42;
    cursor: pointer;
}

.slb__remove:hover {
    color: #c94444;
}

.slb__error {
    font-size: 0.78rem;
    color: #c94444;
}

.slb__add {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px dashed #c4a882;
    border-radius: 3px;
    padding: 4px 10px;
    color: #7a5c42;
    font-family: 'Crimson Text', serif;
    font-size: 0.85rem;
    cursor: pointer;
}

.slb__add:hover:not(:disabled) {
    border-color: #c9975b;
    color: #3a2f1f;
}

.slb__add:disabled {
    opacity: 0.5;
    cursor: default;
}
```

(The modifier selectors double the class, as in `.slb__mode.slb__mode--active`. That keeps them alive even if the declaration order shifts; see the `css-modifier-cascade-order` memory.)

- [ ] **Step 6: Mount the card and add the tutorial step**

`TemplateBuilder.jsx`: add `import SuccessLevelsBuilder from './SuccessLevelsBuilder';` next to the `ModifierConfigBuilder` import. Directly after the closing `</div>` of the `creator__settings-card--modifier` block, insert:

```jsx
            {!isVariant && (
            <div className="creator__settings-card creator__settings-card--success-levels">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.general.successLevelsTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.successLevelsHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <SuccessLevelsBuilder
                  value={settings.successLevels}
                  onChange={successLevels => updateSettings({ successLevels })}
                />
              </div>
            </div>
            )}
```

`tutorial/tours/creatorGeneral.js`: after the `modifier` step, insert:

```js
    { id: 'successLevels', target: '.creator__settings-card--success-levels', placement: 'auto' },
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='successLevels|SuccessLevelsBuilder|creatorTour|tourTranslations|TemplateBuilder|CreatorTour'`
Expected: PASS. `creatorTour.coverage.test.jsx` finds the new card and its step.

- [ ] **Step 8: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/systems/custom/successLevels.js warhammer-battle-helper-front/src/systems/custom/successLevels.test.js warhammer-battle-helper-front/src/components/creator/SuccessLevelsBuilder.jsx warhammer-battle-helper-front/src/components/creator/SuccessLevelsBuilder.test.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/components/tutorial/tours/creatorGeneral.js warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && git commit -m "feat: PLAYRPG-289 success levels card in the creator General tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WizxuVxzYQFbYkt1ydPu5H"
```

---

### Task 5: Full verification

- [ ] **Step 1: Backend suite**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Expected: no vet output, and every package `ok`.

- [ ] **Step 2: Frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: everything passes except the known `App.test.js` axios ESM baseline.

- [ ] **Step 3: Lint**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/creator/SuccessLevelsBuilder.jsx src/systems/custom/successLevels.js src/systems/custom/rolls/ src/components/ToastStack.jsx`
Expected: no errors.

- [ ] **Step 4: i18n parity**

Run: `python3 .claude/skills/i18n-sync/compare_keys.py`
Expected: exit 0.

- [ ] **Step 5: Manual browser check (user)**

Hand off this checklist. The game embeds a copy of the template, so a game created before the change needs a sync from the lobby before it picks up the setting.
1. In a custom template's General tab, open the "Success levels" card. Switch to "Levels per step" and set step 10.
2. Sync the template into a game. Roll a `below_threshold` skill and check that the log shows `Sukces · +N PS` (or `Porażka · −N PS`).
3. Switch to "Thresholds" and check the defaults (1/5, 1/2, 1/1, Porażka). Rename one, recolour it, add a 1/3 threshold, type a duplicate divisor and check that it gets a red border and is not saved.
4. Sync again, roll, and check that the log, the wax seal and the toast border use the tier colour. Then roll an `above_threshold` field and check that only Sukces or Porażka appears.
5. Edit a tier name, sync, and check that the old log entries keep the old name.
