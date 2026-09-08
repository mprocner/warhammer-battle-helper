# FEATURE-164 — Modyfikator rzutu w customowych kartach postaci — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać MG konfigurowalny modyfikator rzutu w karcie customowej — włącznik, cel modyfikatora osobny dla trybu tradycyjnego i puli kości, presety, limity — i ujednolicić jego działanie w jednym miejscu w kodzie.

**Architecture:** Rozstrzyganie „gdzie idzie modyfikator" trafia do jednej czystej funkcji w nowym pliku `internal/systems/custom/modifier.go`; oba rollery tylko o wynik pytają. Front dostaje warstwę czystych helperów (`modifierConfig.js`), trzy małe komponenty prezentacyjne (`ModifierPresetRow`, `RollModifierOverlay`, `ModifierPresetEditor`), jeden hook stanu (`useRollPrompt`) i jeden builder kreatora (`ModifierConfigBuilder`) — dzięki temu obie karty postaci (popup i panel na siatce) współdzielą całą logikę zamiast duplikować markup.

**Tech Stack:** Go 1.x + MongoDB (bson) po stronie backendu; React 18 + react-i18next + MUI icons po stronie frontu. Testy: `go test ./...`, CRA Jest (`CI=true npm test -- --watchAll=false`).

**Spec:** `docs/superpowers/specs/2026-09-08-FEATURE-164-custom-card-modifier-design.md`

## Global Constraints

- Wszystkie stringi UI przez `t('klucz')` z angielskimi kluczami; tłumaczenia dopisywane **równolegle** do `src/locales/en/translation.json` i `src/locales/pl/translation.json`. Nigdy polski/angielski string wprost w JSX.
- Ikony wyłącznie z `@mui/icons-material`.
- Tooltipy: nigdy MUI `<Tooltip>` — custom portal tooltip (`usePortalTooltip`).
- Paleta popupów kart postaci (jasne tło): tło `linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)`, border `#7a5c42`, tekst `#3a2f1f`, etykiety `#7a5c42`, tło inputów `#fff9f0`, border inputów `#c4a882` (focus `#7a5c42`), akcent `#c9975b`.
- Brak backward compat — stare dane można usunąć, migracji nie piszemy.
- CSS w `src/style.css`, konwencja BEM.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z katalogu `warhammer-battle-helper-front/`. Gołe `npx jest` nie działa. Znany baseline fail: `App.test.js` (axios ESM) — **nie jest regresją**.
- Testy backendu: `go test ./internal/systems/custom/...` z katalogu `warhammer-battle-helper-backend/`.
- Nazwy targetów modyfikatora są jednym słownikiem współdzielonym przez backend i front — dokładnie te stringi: `"roll"`, `"threshold"`, `"dice_count"`, `"success_threshold"`.

## Struktura plików

**Backend**

| plik | odpowiedzialność |
|---|---|
| `internal/models/SystemTemplate.go` (modyfikacja) | struktury `ModifierConfig`, `ModifierPreset`, pole `TemplateSettings.Modifier`; usunięcie `RollConfig.FormulaType` |
| `internal/systems/custom/modifier.go` (**nowy**) | jedyne miejsce decyzji „gdzie idzie modyfikator i ile go wolno" — czyste funkcje, zero rng |
| `internal/systems/custom/modifier_test.go` (**nowy**) | testy tabelkowe resolvera |
| `internal/systems/custom/roller.go` (modyfikacja) | zużycie decyzji w trybie tradycyjnym i puli; usunięcie trzech ścieżek legacy |
| `internal/systems/custom/plugin.go` (modyfikacja) | usunięcie dispatchu `FormulaType` |
| `internal/systems/interface.go` (modyfikacja) | pole `RollResult.ModifierTarget` — front musi wiedzieć, czy modyfikator jest już wliczony w breakdown |

**Frontend**

| plik | odpowiedzialność |
|---|---|
| `src/systems/custom/modifierConfig.js` (**nowy**) | czyste helpery: normalizacja konfiguracji z szablonu, clamp wartości, stałe targetów |
| `src/systems/custom/modifierConfig.test.js` (**nowy**) | testy helperów |
| `src/systems/custom/ModifierPresetRow.jsx` (**nowy**) | rząd chipów presetów, bezstanowy |
| `src/systems/custom/RollModifierOverlay.jsx` (**nowy**) | overlay: tytuł, presety, input, akcje; własny stan wartości |
| `src/systems/custom/useRollPrompt.js` (**nowy**) | hook: stan „o co pytamy", short-circuit gdy modyfikator wyłączony |
| `src/systems/custom/CharacterSheet.jsx` (modyfikacja) | zużycie hooka + overlaya zamiast własnego stanu i markupu |
| `src/systems/custom/CharacterDetails.jsx` (modyfikacja) | to samo |
| `src/systems/custom/rolls/CustomRoll.jsx`, `CustomWeaponRoll.jsx` (modyfikacja) | pokazanie modyfikatora w logu, gdy nie jest wliczony we breakdown |
| `src/components/creator/ModifierPresetEditor.jsx` (**nowy**) | edytor listy presetów (wartość + etykieta) |
| `src/components/creator/ModifierConfigBuilder.jsx` (**nowy**) | karta konfiguracji w zakładce General |
| `src/components/creator/TemplateBuilder.jsx` (modyfikacja) | zamontowanie karty |
| `src/style.css` (modyfikacja) | jasna paleta overlaya, chipy presetów, usunięcie martwej reguły |
| `src/components/buttons/ModifierInput.jsx` (**usunięcie**) | martwy kod, zero importerów |

---

### Task 1: Model danych + resolver modyfikatora

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:29-37` (dopisanie pola) oraz po `TemplateSettings` (nowe struktury)
- Create: `warhammer-battle-helper-backend/internal/systems/custom/modifier.go`
- Test: `warhammer-battle-helper-backend/internal/systems/custom/modifier_test.go`

**Interfaces:**
- Consumes: nic (pierwszy task)
- Produces: `models.ModifierConfig{Enabled bool, TraditionalTarget, PoolTarget string, Step, Min, Max int, Presets []ModifierPreset}`, `models.ModifierPreset{Value int, Label string}`, `models.TemplateSettings.Modifier *ModifierConfig`; w pakiecie `custom`: stałe `ModTargetNone/ModTargetRoll/ModTargetThreshold/ModTargetDiceCount/ModTargetSuccessThreshold` oraz `resolveModifier(cfg *models.ModifierConfig, rollMode string, requested int) (target string, value int)` i `clampModifier(cfg *models.ModifierConfig, v int) int`

- [ ] **Step 1: Write the failing test**

Utwórz `internal/systems/custom/modifier_test.go`:

```go
package custom

import (
	"battle-helper/internal/models"
	"testing"
)

func TestResolveModifier(t *testing.T) {
	enabled := func(trad, pool string) *models.ModifierConfig {
		return &models.ModifierConfig{Enabled: true, TraditionalTarget: trad, PoolTarget: pool}
	}

	tests := []struct {
		name       string
		cfg        *models.ModifierConfig
		rollMode   string
		requested  int
		wantTarget string
		wantValue  int
	}{
		{"nil config zeroes the modifier", nil, "traditional", 20, ModTargetNone, 0},
		{"disabled config zeroes the modifier", &models.ModifierConfig{Enabled: false, TraditionalTarget: ModTargetRoll}, "traditional", 20, ModTargetNone, 0},
		{"traditional defaults to roll", enabled("", ""), "traditional", 5, ModTargetRoll, 5},
		{"traditional honours threshold", enabled(ModTargetThreshold, ""), "traditional", -20, ModTargetThreshold, -20},
		{"traditional rejects a pool target", enabled(ModTargetDiceCount, ""), "traditional", 5, ModTargetRoll, 5},
		{"pool defaults to dice count", enabled("", ""), "dice_pool", 2, ModTargetDiceCount, 2},
		{"pool honours success threshold", enabled("", ModTargetSuccessThreshold), "dice_pool", 2, ModTargetSuccessThreshold, 2},
		{"pool rejects a traditional target", enabled("", ModTargetThreshold), "dice_pool", 2, ModTargetDiceCount, 2},
		{"empty roll mode is traditional", enabled(ModTargetThreshold, ""), "", 3, ModTargetThreshold, 3},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target, value := resolveModifier(tc.cfg, tc.rollMode, tc.requested)
			if target != tc.wantTarget || value != tc.wantValue {
				t.Errorf("resolveModifier() = (%q, %d), want (%q, %d)", target, value, tc.wantTarget, tc.wantValue)
			}
		})
	}
}

func TestClampModifier(t *testing.T) {
	tests := []struct {
		name string
		cfg  *models.ModifierConfig
		in   int
		want int
	}{
		{"both limits zero means no limit", &models.ModifierConfig{}, 999, 999},
		{"both limits zero passes negatives", &models.ModifierConfig{}, -999, -999},
		{"clamps above max", &models.ModifierConfig{Min: -60, Max: 60}, 90, 60},
		{"clamps below min", &models.ModifierConfig{Min: -60, Max: 60}, -90, -60},
		{"inside the range is untouched", &models.ModifierConfig{Min: -60, Max: 60}, 10, 10},
		// Zakaz dodatnich modyfikatorów wyraża się przez PARĘ granic, bo reguła "bez granic"
		// patrzy na oba pola razem: {0, 0} to "bez granic", a {-60, 0} to realny sufit na zerze.
		{"a nonzero min lets max cap at zero", &models.ModifierConfig{Min: -60, Max: 0}, 30, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampModifier(tc.cfg, tc.in); got != tc.want {
				t.Errorf("clampModifier(%d) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

// A disabled modifier must be zeroed server-side, not merely hidden in the UI — otherwise a
// hand-crafted request smuggles a modifier into a card whose template forbids one.
func TestResolveModifier_DisabledIgnoresClamp(t *testing.T) {
	cfg := &models.ModifierConfig{Enabled: false, Min: -10, Max: 10}
	if _, value := resolveModifier(cfg, "traditional", 5); value != 0 {
		t.Errorf("value = %d, want 0", value)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'TestResolveModifier|TestClampModifier' -v`
Expected: FAIL — `undefined: resolveModifier`, `undefined: models.ModifierConfig`, `undefined: ModTargetNone`.

- [ ] **Step 3: Dopisz struktury do modelu**

W `internal/models/SystemTemplate.go`, w `TemplateSettings` (po polu `TokenDisplay`, przed zamykającym `}` struktury):

```go
	// Modifier configures the roll-modifier prompt of a custom card (FEATURE-164). nil means
	// disabled, which is how every pre-existing template starts — no migration needed.
	Modifier *ModifierConfig `bson:"modifier,omitempty" json:"modifier,omitempty"`
```

Bezpośrednio po zamknięciu `type TemplateSettings struct { … }`:

```go
// ModifierConfig is the template-wide setup of the roll-modifier prompt shown before a roll on
// a custom card. It holds two independent targets because RollMode ("traditional" | "dice_pool")
// is per field while this config is per template: the mechanic picks its own target, so a card
// mixing both modes never applies a rule that makes no sense for one of them.
type ModifierConfig struct {
	Enabled bool `bson:"enabled" json:"enabled"`

	// TraditionalTarget: "roll" (added to the result, default) | "threshold" (added to the
	// success threshold — the roll-under convention, e.g. WFRP/CoC).
	TraditionalTarget string `bson:"traditionalTarget,omitempty" json:"traditionalTarget,omitempty"`
	// PoolTarget: "dice_count" (adds/removes dice, default) | "success_threshold".
	PoolTarget string `bson:"poolTarget,omitempty" json:"poolTarget,omitempty"`

	// Step is the prompt input's step; 0 reads as 1. Min/Max are plain ints, not pointers: the
	// "no limits" case is Min and Max BOTH zero, so no field needs to tell "unset" from "0".
	Step int `bson:"step,omitempty" json:"step,omitempty"`
	Min  int `bson:"min,omitempty" json:"min,omitempty"`
	Max  int `bson:"max,omitempty" json:"max,omitempty"`

	Presets []ModifierPreset `bson:"presets,omitempty" json:"presets,omitempty"`
}

// ModifierPreset is one quick-pick button in the prompt, e.g. {-30, "Very hard"}. Label is
// GM-authored free text, so it is never run through i18n.
type ModifierPreset struct {
	Value int    `bson:"value" json:"value"`
	Label string `bson:"label,omitempty" json:"label,omitempty"`
}
```

- [ ] **Step 4: Napisz resolver**

Utwórz `internal/systems/custom/modifier.go`:

```go
package custom

import "battle-helper/internal/models"

// Where a roll modifier lands. Two targets per roll mode — see models.ModifierConfig for why
// the config cannot hold just one. These exact strings are shared with the frontend
// (src/systems/custom/modifierConfig.js), so they must not be renamed on one side only.
const (
	ModTargetNone             = ""                  // disabled: nothing is applied
	ModTargetRoll             = "roll"              // traditional: finalRoll = result + modifier
	ModTargetThreshold        = "threshold"         // traditional: threshold += modifier
	ModTargetDiceCount        = "dice_count"        // pool: the first die term rolls `modifier` more dice
	ModTargetSuccessThreshold = "success_threshold" // pool: success threshold += modifier
)

// resolveModifier is the single place that decides where a requested modifier goes and how big
// it may be. Every roller asks it instead of keeping its own rule — the four rollers each
// applying the modifier differently is exactly what FEATURE-164 set out to fix.
//
// A nil or disabled config returns (ModTargetNone, 0): the server does not trust a modifier the
// template does not allow, so a hand-crafted request cannot smuggle one past the UI.
//
// An unrecognised target falls back to that mode's default rather than erroring — a target
// string is GM data, and a typo in it must not make every roll on the card fail.
func resolveModifier(cfg *models.ModifierConfig, rollMode string, requested int) (target string, value int) {
	if cfg == nil || !cfg.Enabled {
		return ModTargetNone, 0
	}
	value = clampModifier(cfg, requested)

	if rollMode == "dice_pool" {
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

// clampModifier applies the config's Min/Max. Both zero means "no limit", so a template that
// never configured limits keeps accepting whatever the GM types.
//
// The rule reads both fields together, which is what makes a cap at exactly zero expressible:
// {Min: -60, Max: 0} forbids positive modifiers, while {0, 0} is the unconfigured case. The only
// setting this cannot express is "clamp everything to zero" — and that is what Enabled: false
// already does. Hence plain ints: no field has to tell "unset" apart from "zero".
func clampModifier(cfg *models.ModifierConfig, v int) int {
	if cfg.Min == 0 && cfg.Max == 0 {
		return v
	}
	if v < cfg.Min {
		return cfg.Min
	}
	if v > cfg.Max {
		return cfg.Max
	}
	return v
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'TestResolveModifier|TestClampModifier' -v`
Expected: PASS — wszystkie podtesty zielone.

- [ ] **Step 6: Cały pakiet nadal zielony**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/... `
Expected: PASS (nic jeszcze nie zużywa resolvera, więc zachowanie rzutów bez zmian).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go \
        warhammer-battle-helper-backend/internal/systems/custom/modifier.go \
        warhammer-battle-helper-backend/internal/systems/custom/modifier_test.go
git commit -m "feat(back): FEATURE-164 modifier config model and target resolver"
```

---

### Task 2: Tryb tradycyjny — modyfikator do wyniku albo do progu

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/interface.go:21` (nowe pole obok `Modifier`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:15-79` (`rollFromFormula`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (nowy test + aktualizacja `TestRollFromFormula_ModifierInBreakdown:587`) oraz `internal/systems/custom/weapon_test.go` (dziedziczenie targetu przez atak broni)

**Interfaces:**
- Consumes: `resolveModifier`, `ModTargetRoll`, `ModTargetThreshold`, `ModTargetNone` z Taska 1; `models.TemplateSettings.Modifier`
- Produces: `gsys.RollResult.ModifierTarget string` (JSON `modifierTarget`) — front rozpoznaje po nim, czy modyfikator jest już wliczony w `FormulaBreakdown`; `rollFromFormula` zachowuje dotychczasową sygnaturę `(stats, template, skillKey, linkedAttr, cfg, modifier)`, więc `weapon.go:40` dziedziczy zachowanie bez zmian

- [ ] **Step 1: Write the failing test**

Dopisz do `internal/systems/custom/roller_test.go` (po `TestRollFromFormula_ModifierInBreakdown`):

```go
// tmplWithModifier buduje szablon z włączonym modyfikatorem o zadanych targetach.
func tmplWithModifier(trad, pool string) *models.SystemTemplate {
	return &models.SystemTemplate{
		Settings: models.TemplateSettings{
			Modifier: &models.ModifierConfig{Enabled: true, TraditionalTarget: trad, PoolTarget: pool},
		},
	}
}

func TestRollFromFormula_ModifierTargets(t *testing.T) {
	stats := sampleStats()
	// Próg jawny 55, formuła d100 — klasyczny roll-under.
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
		Threshold:   "55",
	}

	t.Run("target roll shifts the result and leaves the threshold alone", func(t *testing.T) {
		p := newTestPlugin(47) // d100 -> 48
		res, err := p.rollFromFormula(stats, tmplWithModifier(ModTargetRoll, ""), "atk", "str", cfg, -20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 28 {
			t.Errorf("Roll = %d, want 28 (48-20)", res.Roll)
		}
		if res.Target != 55 {
			t.Errorf("Target = %d, want 55 (untouched)", res.Target)
		}
		if res.ModifierTarget != ModTargetRoll {
			t.Errorf("ModifierTarget = %q, want %q", res.ModifierTarget, ModTargetRoll)
		}
		if res.Outcome != "regular_success" { // 28 <= 55
			t.Errorf("Outcome = %q, want regular_success", res.Outcome)
		}
	})

	// Sedno opcji "threshold": rzut zostaje surowy, rusza się cel. Bez modyfikatora 48 <= 55
	// to sukces; z -20 próg spada do 35 i ten sam rzut jest porażką.
	t.Run("target threshold shifts the target and leaves the roll raw", func(t *testing.T) {
		p := newTestPlugin(47) // d100 -> 48
		res, err := p.rollFromFormula(stats, tmplWithModifier(ModTargetThreshold, ""), "atk", "str", cfg, -20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 48 {
			t.Errorf("Roll = %d, want 48 (raw)", res.Roll)
		}
		if res.Target != 35 {
			t.Errorf("Target = %d, want 35 (55-20)", res.Target)
		}
		// Trzy segmenty, nie dwa: rollFromFormula skraca breakdown do "label = wynik" tylko gdy
		// labelStr == valueStr. Dla d100 label to "d100", a value "48" — różne, więc leci pełna
		// forma "label = value = wynik". Zachowanie sprzed tego taska, nie jego skutek.
		if res.FormulaBreakdown != "d100 = 48 = 48" {
			t.Errorf("FormulaBreakdown = %q, want %q — modyfikator nie należy do strony rzutu", res.FormulaBreakdown, "d100 = 48 = 48")
		}
		if res.Outcome != "failure" {
			t.Errorf("Outcome = %q, want failure", res.Outcome)
		}
		if res.Modifier != -20 {
			t.Errorf("Modifier = %d, want -20 — surowa wartość zawsze idzie do loga", res.Modifier)
		}
	})

	t.Run("no config zeroes a modifier the request tried to smuggle in", func(t *testing.T) {
		p := newTestPlugin(47) // d100 -> 48
		res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, -20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 48 || res.Target != 55 || res.Modifier != 0 {
			t.Errorf("got roll=%d target=%d modifier=%d, want 48/55/0", res.Roll, res.Target, res.Modifier)
		}
		if res.ModifierTarget != ModTargetNone {
			t.Errorf("ModifierTarget = %q, want empty", res.ModifierTarget)
		}
	})

	// Próg "raw" nie ma celu do przesunięcia — modyfikator progu nie może wyczarować targetu.
	t.Run("threshold target does nothing when no threshold could be determined", func(t *testing.T) {
		rawCfg := &models.RollConfig{
			Formula:     []models.FormulaBlock{diceBlock("d100")},
			SuccessType: "raw",
		}
		emptyStats := &Stats{Attributes: map[string]AttrValue{}, Skills: map[string]AttrValue{}}
		p := newTestPlugin(47)
		res, err := p.rollFromFormula(emptyStats, tmplWithModifier(ModTargetThreshold, ""), "unknown", "", rawCfg, 20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0 — brak progu zostaje brakiem progu", res.Target)
		}
		if res.Outcome != "48" {
			t.Errorf("Outcome = %q, want raw \"48\"", res.Outcome)
		}
	})
}
```

Dodatkowo zaktualizuj istniejący `TestRollFromFormula_ModifierInBreakdown` (`roller_test.go:587`) — po zmianie domyślnie wyłączonego modyfikatora empty template zeruje wartość, więc test musi podać włączoną konfigurację. Zamień w nim jedną linię:

```go
	res, err := p.rollFromFormula(stats, tmplWithModifier(ModTargetRoll, ""), "atk", "str", cfg, 3)
```

Dopisz też do `internal/systems/custom/weapon_test.go` test dziedziczenia — atak broni idzie przez `rollFromFormula` (`weapon.go:40`), więc target dostaje za darmo, a obrażenia (`weapon.go:52`, przez `evalFormula`) modyfikatora nie widzą i **nie mają** go widzieć:

```go
// Atak broni korzysta z tego samego evaluatora co rzut umiejętności, więc target modyfikatora
// dziedziczy z szablonu bez własnej gałęzi kodu. Obrażenia liczy evalFormula, do którego
// modyfikator nie trafia — trafienie może być łatwiejsze, ale nie mocniejsze.
//
// Fixture buduje istniejący w tym pliku helper weaponTemplate() (atak d20, obrażenia 2d6+STR
// przy STR 8), a nie własny szablon — jego kształt jest jedyną prawdą o tym, jak wygląda
// weapons_table. SuccessType i Threshold trzeba nadpisać, bo obrażenia liczą się tylko przy sukcesie.
func TestRollWeaponWithTemplate_ModifierTargetsAttackOnly(t *testing.T) {
	template, raw := weaponTemplate()
	template.Sections[0].Fields[0].RollConfig.SuccessType = "above_threshold"
	template.Sections[0].Fields[0].RollConfig.Threshold = "10"
	template.Settings.Modifier = &models.ModifierConfig{Enabled: true, TraditionalTarget: ModTargetRoll}

	// rng order: attack d20 first, then the two damage dice.
	// attack Intn=9 -> roll 10, +modifier 5 => 15; damage 2d6: Intn 3->4, Intn 5->6 => 10; + STR 8 => 18.
	p := newTestPlugin(9, 3, 5)

	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "w1", 5)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.Roll != 15 {
		t.Errorf("Roll = %d, want 15 (d20 10 + modifier 5)", res.Roll)
	}
	if res.ModifierTarget != ModTargetRoll {
		t.Errorf("ModifierTarget = %q, want %q", res.ModifierTarget, ModTargetRoll)
	}
	// 18 = 2d6 (4+6) + STR 8. Gdyby modyfikator dotykał obrażeń, byłoby 23.
	if res.DamageRoll != 18 {
		t.Errorf("DamageRoll = %d, want 18 — the modifier does not touch damage", res.DamageRoll)
	}
}
```

Helper `weaponTemplate()` zwraca `(template, raw)`. Nie buduj fixture'a od zera — kształt `weapons_table` żyje w tym helperze.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run TestRollFromFormula_Modifier -v`
Expected: FAIL — `res.ModifierTarget undefined (type *systems.RollResult has no field or method ModifierTarget)`.

- [ ] **Step 3: Dopisz pole do RollResult**

W `internal/systems/interface.go`, bezpośrednio po `Modifier int \`json:"modifier"\`` (linia 21):

```go
	// ModifierTarget tells the client where the modifier was applied ("roll" | "threshold" |
	// "dice_count" | "success_threshold"; empty when no modifier was applied). The log needs it
	// because only "roll" bakes the modifier into FormulaBreakdown — for every other target the
	// client has to print it separately or the player never sees it.
	ModifierTarget string `json:"modifierTarget,omitempty"`
```

- [ ] **Step 4: Przepisz rollFromFormula**

Zamień ciało `internal/systems/custom/roller.go:15-79` na:

```go
func (p *Plugin) rollFromFormula(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error) {
	modTarget, modValue := resolveModifier(template.Settings.Modifier, cfg.RollMode, modifier)

	if cfg.RollMode == "dice_pool" {
		return p.rollFromFormulaDicePool(stats, template, skillKey, linkedAttr, cfg, modTarget, modValue)
	}

	result, diceType, labelStr, valueStr, err := p.evalFormula(cfg.Formula, stats, skillKey, linkedAttr)
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

	finalRoll := result + rollMod

	if rollMod != 0 {
		sign := "+"
		if rollMod < 0 {
			sign = ""
		}
		labelStr += fmt.Sprintf("%s%d", sign, rollMod)
		valueStr += fmt.Sprintf("%s%d", sign, rollMod)
	}

	var breakdown string
	if labelStr == valueStr {
		breakdown = fmt.Sprintf("%s = %d", labelStr, finalRoll)
	} else {
		breakdown = fmt.Sprintf("%s = %s = %d", labelStr, valueStr, finalRoll)
	}

	attrValue, attrOK := attrLookup(stats, linkedAttr)
	sv := skillValue(stats, skillKey)
	threshold := evalThreshold(cfg.Threshold)
	hasThreshold := threshold != 0
	if threshold == 0 {
		if skillHasValue(stats, skillKey) {
			threshold = sv
			hasThreshold = true
		} else {
			threshold = attrValue
			hasThreshold = attrOK
		}
	}
	// Only a threshold that actually exists can be shifted. Adding the modifier to a
	// "no data" threshold would invent a target out of nothing (see evalOutcome).
	if hasThreshold {
		threshold += thresholdMod
	}
	outcome := evalOutcome(cfg, finalRoll, threshold, hasThreshold)
	skillLabel := resolveSkillLabel(template, stats, skillKey)

	return &gsys.RollResult{
		DiceType:         diceType,
		RollType:         "skill",
		Roll:             finalRoll,
		Target:           threshold,
		Outcome:          outcome,
		SkillKey:         skillKey,
		SkillName:        skillLabel,
		Modifier:         modValue,
		ModifierTarget:   modTarget,
		FormulaBreakdown: breakdown,
	}, nil
}
```

Uwaga: usunięte zostały przy tym trzy `fmt.Println`/`fmt.Printf` debugowe z tej funkcji (`[ROLL] …`) — nie mają wartości diagnostycznej w kodzie, który dopiero co dostał testy na wszystkie ścieżki.

- [ ] **Step 5: Tymczasowo dopasuj sygnaturę puli, żeby pakiet się kompilował**

W `internal/systems/custom/roller.go`, w deklaracji `rollFromFormulaDicePool` (obecnie linia 282) zmień sygnaturę i dodaj przekazanie wartości — pełna logika puli przychodzi w Tasku 3:

```go
func (p *Plugin) rollFromFormulaDicePool(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modTarget string, modValue int) (*gsys.RollResult, error) {
```

oraz w zwracanym `&gsys.RollResult{…}` tej funkcji zamień `Modifier: modifier,` na:

```go
		Modifier:             modValue,
		ModifierTarget:       modTarget,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -v -run 'TestRollFromFormula|TestRollWeaponWithTemplate'`
Expected: PASS — nowy `TestRollFromFormula_ModifierTargets` zielony, `TestRollWeaponWithTemplate_ModifierTargetsAttackOnly` zielony, `TestRollFromFormula_ModifierInBreakdown` zielony po aktualizacji, `TestRollFromFormula_DicePool` zielony (modyfikator 0).

- [ ] **Step 7: Cały pakiet + build**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/interface.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go \
        warhammer-battle-helper-backend/internal/systems/custom/weapon_test.go
git commit -m "feat(back): FEATURE-164 apply the modifier to the roll or the threshold"
```

---

### Task 3: Pula kości — modyfikator do liczby kości albo do progu sukcesu

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:282-333` (`rollFromFormulaDicePool`) i `:335-459` (`evalFormulaDicePool`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (nowy test + aktualizacja wywołań `evalFormulaDicePool` w `TestEvalFormulaDicePool_BlockTypes:992`)

**Interfaces:**
- Consumes: `ModTargetDiceCount`, `ModTargetSuccessThreshold` z Taska 1; `modTarget`/`modValue` przekazane z `rollFromFormula` (Task 2)
- Produces: `evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, extraDice int) (parts []gsys.PoolFormulaPart, diceType int, err error)` — nowy, piąty parametr

- [ ] **Step 1: Write the failing test**

Dopisz do `internal/systems/custom/roller_test.go` (po `TestRollFromFormula_DicePoolFormulaParts`):

```go
func TestRollFromFormula_DicePoolModifierTargets(t *testing.T) {
	stats := sampleStats()
	// Pula: 3 kości K6, sukces przy 4+.
	cfg := &models.RollConfig{
		RollMode:             "dice_pool",
		Formula:              []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6")},
		PoolSuccessThreshold: 4,
		PoolSuccessCondition: "gte",
	}

	t.Run("dice_count rolls extra dice", func(t *testing.T) {
		// 3 + 2 = 5 kości: 4, 6, 2, 5, 1 -> sukcesy 4, 6, 5 = 3.
		p := newTestPlugin(3, 5, 1, 4, 0)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetDiceCount), "atk", "str", cfg, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2, 5, 1}) {
			t.Errorf("pool rolls = %v, want [4 6 2 5 1]", got)
		}
		if res.PoolSuccesses != 3 {
			t.Errorf("PoolSuccesses = %d, want 3", res.PoolSuccesses)
		}
		if res.Target != 4 {
			t.Errorf("Target = %d, want 4 (threshold untouched)", res.Target)
		}
		if res.ModifierTarget != ModTargetDiceCount {
			t.Errorf("ModifierTarget = %q, want %q", res.ModifierTarget, ModTargetDiceCount)
		}
	})

	t.Run("dice_count removes dice and never drops below one", func(t *testing.T) {
		// 3 - 9 = -6 kości -> clamp do 1: tylko jeden rzut jest w ogóle wykonany.
		p := newTestPlugin(5)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetDiceCount), "atk", "str", cfg, -9)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{6}) {
			t.Errorf("pool rolls = %v, want [6] — pula nigdy nie schodzi poniżej jednej kości", got)
		}
	})

	t.Run("success_threshold shifts the threshold and leaves the dice count alone", func(t *testing.T) {
		// 3 kości: 4, 6, 2. Próg 4+2 = 6 -> tylko 6 się liczy.
		p := newTestPlugin(3, 5, 1)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetSuccessThreshold), "atk", "str", cfg, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2}) {
			t.Errorf("pool rolls = %v, want [4 6 2] — liczba kości bez zmian", got)
		}
		if res.Target != 6 {
			t.Errorf("Target = %d, want 6 (4+2)", res.Target)
		}
		if res.PoolSuccesses != 1 {
			t.Errorf("PoolSuccesses = %d, want 1", res.PoolSuccesses)
		}
	})

	t.Run("disabled config leaves the pool exactly as configured", func(t *testing.T) {
		p := newTestPlugin(3, 5, 1)
		res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2}) {
			t.Errorf("pool rolls = %v, want [4 6 2]", got)
		}
		if res.Target != 4 || res.Modifier != 0 {
			t.Errorf("got target=%d modifier=%d, want 4/0", res.Target, res.Modifier)
		}
	})

	// Modyfikator liczby kości wchodzi do pierwszego członu kostkowego — tego, który wyznacza
	// wyświetlany DiceType. Udokumentowane ograniczenie z D3 spec.
	t.Run("dice_count touches only the first die term", func(t *testing.T) {
		multiCfg := &models.RollConfig{
			RollMode:             "dice_pool",
			Formula:              []models.FormulaBlock{numBlock(2), opBlock("d"), diceBlock("d6"), opBlock("+"), numBlock(2), opBlock("d"), diceBlock("d10")},
			PoolSuccessThreshold: 5,
			PoolSuccessCondition: "gte",
		}
		// pierwszy człon: 2+1 = 3 kości K6 (3, 4, 5); drugi: 2 kości K10 (7, 8).
		p := newTestPlugin(2, 3, 4, 6, 7)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetDiceCount), "atk", "str", multiCfg, 1)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		var counts []int
		for _, part := range res.PoolFormula {
			if part.Kind == "dice" {
				counts = append(counts, len(part.Rolls))
			}
		}
		if !reflect.DeepEqual(counts, []int{3, 2}) {
			t.Errorf("dice per term = %v, want [3 2]", counts)
		}
	})
}
```

Zaktualizuj też istniejące wywołania `evalFormulaDicePool` w teście `TestEvalFormulaDicePool_BlockTypes` (`roller_test.go:992` i dalej w tej funkcji) — każdemu dopisz piąty argument `0`:

```go
	parts, diceType, err := p.evalFormulaDicePool(blocks, stats, "atk", "str", 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run TestRollFromFormula_DicePoolModifierTargets -v`
Expected: FAIL — modyfikator jest ignorowany, więc `pool rolls = [4 6 2], want [4 6 2 5 1]`, a `seqRoller` panikuje albo zostawia nieużyte wartości.

- [ ] **Step 3: Wpuść modyfikator do rollFromFormulaDicePool**

Zamień ciało `rollFromFormulaDicePool` (`roller.go:282`) na:

```go
// rollFromFormulaDicePool handles dice-pool mode: rolls dice individually and counts successes.
// modTarget/modValue come pre-resolved from rollFromFormula, so this function never re-decides
// what the modifier means.
func (p *Plugin) rollFromFormulaDicePool(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, cfg *models.RollConfig, modTarget string, modValue int) (*gsys.RollResult, error) {
	extraDice, thresholdMod := 0, 0
	switch modTarget {
	case ModTargetDiceCount:
		extraDice = modValue
	case ModTargetSuccessThreshold:
		thresholdMod = modValue
	}

	parts, diceType, err := p.evalFormulaDicePool(cfg.Formula, stats, skillKey, linkedAttr, extraDice)
	if err != nil {
		return nil, fmt.Errorf("custom: formula eval (pool): %w", err)
	}

	threshold := cfg.PoolSuccessThreshold + thresholdMod
	condition := cfg.PoolSuccessCondition
	if condition == "" {
		condition = "gte"
	}

	successes := 0
	for _, part := range parts {
		for _, r := range part.Rolls {
			if condition == "eq" {
				if r == threshold {
					successes++
				}
			} else {
				if r >= threshold {
					successes++
				}
			}
		}
	}

	outcome := "failure"
	if successes > 0 {
		outcome = "regular_success"
	}

	skillLabel := resolveSkillLabel(template, stats, skillKey)

	return &gsys.RollResult{
		DiceType:             diceType,
		RollType:             "skill",
		Roll:                 successes,
		Target:               threshold,
		Outcome:              outcome,
		SkillKey:             skillKey,
		SkillName:            skillLabel,
		Modifier:             modValue,
		ModifierTarget:       modTarget,
		PoolFormula:          parts,
		PoolSuccesses:        successes,
		PoolSuccessCondition: condition,
	}, nil
}
```

- [ ] **Step 4: Wpuść extraDice do evalFormulaDicePool**

W `evalFormulaDicePool` (`roller.go:335`) zmień sygnaturę i ujednolić `rollTerm`. Nowa sygnatura:

```go
func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, extraDice int) (parts []gsys.PoolFormulaPart, diceType int, err error) {
```

Zaraz po deklaracji `pendingOp := "+"` dopisz:

```go
	// extraDice (the pool-size modifier) is absorbed by the first die term — the one that
	// already defines the displayed diceType. Later terms keep their configured counts.
	extraApplied := false
```

Zamień całą domknięcie `rollTerm` na wersję bez rozgałęzienia na „jedna kość" i „count kości" — obie gałęzie robiły to samo z inną liczbą kości, a różnica utrudniała wstrzyknięcie modyfikatora:

```go
	// rollTerm appends one die term: `count` dice when it follows a "d" operator, a single die
	// otherwise, plus the pool-size modifier on the first term. sidesLabel is empty for a
	// literal die (d6) and holds the source expression when the face count is computed (d(STR)).
	rollTerm := func(sides int, sidesLabel string) {
		if diceType == 0 {
			diceType = sides
		}
		roll := func() int { return p.rng.Intn(sides) + 1 }

		count := 1
		countLabel := ""
		termOp := pendingOp
		if pendingOp == "d" && len(segments) > 0 {
			count = segments[len(segments)-1].val
			termOp = segments[len(segments)-1].op
			segments = segments[:len(segments)-1]
			countLabel = takeCount()
		}
		if !extraApplied {
			extraApplied = true
			count += extraDice
		}
		// A pool of zero dice can never succeed and reads as a bug rather than as a very hard
		// roll, so the modifier can shrink a pool but never erase it.
		if count < 1 {
			count = 1
		}

		rolls := evalDicePoolInts(count, roll)
		total := 0
		for _, r := range rolls {
			total += r
		}
		segments = append(segments, segment{op: termOp, val: total})
		parts = append(parts, gsys.PoolFormulaPart{
			Kind: "dice", Sides: sides, SidesLabel: sidesLabel, CountLabel: countLabel, Rolls: rolls,
		})
		pendingOp = ""
	}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -v -run 'TestRollFromFormula|TestEvalFormulaDicePool'`
Expected: PASS — nowy test puli zielony, a `TestRollFromFormula_DicePool`, `TestRollFromFormula_DicePoolFormulaParts` i `TestEvalFormulaDicePool_BlockTypes` bez zmian w oczekiwaniach (ujednolicenie `rollTerm` jest zachowaniowo neutralne dla `extraDice == 0`).

- [ ] **Step 6: Cały pakiet + build**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/roller.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git commit -m "feat(back): FEATURE-164 modifier as pool size or pool success threshold"
```

---

### Task 4: Usunięcie martwych ścieżek `formulaType`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:137-149` (dispatch)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go` — usunięcie `rollAttrPlusSkill` (`:477`), `rollFixedD100` (`:512`), `rollFixedD20` (`:541`), `attrModifier` (`:607`)
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:276-277` — usunięcie pola `FormulaType`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` — usunięcie `TestAttrModifier` (`:77`), `TestRollAttrPlusSkill` (`:695`), `TestRollFixedD100` (`:744`), `TestRollFixedD20` (`:783`); przepisanie fixture'ów w `TestRollWithTemplate` (`:826`), `TestResolveRollConfig_SkillTree` (`:1098`), `TestResolveRollConfig_SkillTableAssignsAttr` (`:1123`), `TestRollWithTemplate_AttrFieldUsesKeyAsLinkedAttr` (`:1199`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx:28` — fixture bez `formulaType`

**Interfaces:**
- Consumes: nic nowego
- Produces: `RollWithTemplate` zwraca błąd `custom: field %q has no roll formula`, gdy pole nie ma bloków formuły; `models.RollConfig` bez pola `FormulaType` (pole `LinkedAttr` **zostaje** — patrz niżej)

**Uwaga, która ratuje przed regresją:** `RollConfig.LinkedAttr` wygląda na legacy, ale `resolveRollConfig` czyta je w żywej ścieżce jako fallback (`plugin.go:191, 198, 209, 221`). Usunięcie pola sprawiłoby, że `attr_linked`/`dice_skill_attr` w starszych szablonach liczyłyby się z atrybutu 0. **Nie ruszamy go.**

- [ ] **Step 1: Write the failing test**

Zamień w `roller_test.go` całą funkcję `TestRollWithTemplate` (`:826-867`) na wersję opartą o formułę, i dopisz test braku formuły:

```go
func TestRollWithTemplate(t *testing.T) {
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			ID: "sec1",
			Fields: []models.FieldDef{{
				Key:      "atk",
				Type:     "skill_table",
				Label:    "Atak",
				Rollable: true,
				Skills:   []models.SkillOption{{ID: "sword", Label: "Miecz"}},
				RollConfig: &models.RollConfig{
					Formula:     []models.FormulaBlock{diceBlock("d20")},
					SuccessType: "above_threshold",
					Threshold:   "10",
				},
			}},
		}},
	}
	raw, err := bson.Marshal(Stats{
		Attributes: map[string]AttrValue{"agility": {Current: 12}},
		Skills:     map[string]AttrValue{"atk.sword": {Base: 5}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	t.Run("dispatches to the formula path", func(t *testing.T) {
		p := newTestPlugin(14) // d20 -> 15
		res, err := p.RollWithTemplate(raw, template, "atk.sword", 0)
		if err != nil {
			t.Fatalf("RollWithTemplate() error: %v", err)
		}
		if res.Roll != 15 || res.Target != 10 || res.Outcome != "regular_success" {
			t.Errorf("got roll=%d target=%d outcome=%q, want 15/10/regular_success", res.Roll, res.Target, res.Outcome)
		}
		if res.SkillName != "Miecz" {
			t.Errorf("SkillName = %q, want Miecz", res.SkillName)
		}
	})

	t.Run("unknown skill key errors", func(t *testing.T) {
		p := newTestPlugin()
		if _, err := p.RollWithTemplate(raw, template, "nope", 0); err == nil {
			t.Error("expected an error for an unknown skill key")
		}
	})
}

// Po usunięciu ścieżek legacy pole bez formuły nie ma czym rzucić — musi to powiedzieć wprost,
// tak jak RollWeaponWithTemplate robi od zawsze (weapon.go:32).
func TestRollWithTemplate_NoFormulaErrors(t *testing.T) {
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			ID: "sec1",
			Fields: []models.FieldDef{{
				Key:        "atk",
				Type:       "attr",
				Rollable:   true,
				RollConfig: &models.RollConfig{SuccessType: "above_threshold"},
			}},
		}},
	}
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"atk": {Current: 10}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	p := newTestPlugin()
	_, err = p.RollWithTemplate(raw, template, "atk", 0)
	if err == nil {
		t.Fatal("expected an error for a field with no formula")
	}
	// Sprawdzamy TEKST, nie samo err != nil. evalFormula i evalFormulaDicePool też zwracają błąd
	// na pustej liście bloków ("formula is empty"), więc asercja na samym err przeszłaby również
	// po usunięciu guardu z plugin.go — pilnowałaby kontraktu, nie tego, co go wymusza.
	if !strings.Contains(err.Error(), "has no roll formula") {
		t.Errorf("error = %q, want it to mention \"has no roll formula\"", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run TestRollWithTemplate -v`
Expected: FAIL — `TestRollWithTemplate_NoFormulaErrors` przechodzi przez `switch` i dostaje `unknown formulaType ""`, więc `err != nil`… natomiast po usunięciu dispatchu ma to być jawny błąd braku formuły. Jeśli test przechodzi już teraz, potwierdź to i idź dalej — Step 3 zmienia treść błędu i usuwa martwy kod, a test pilnuje, że kontrakt „bez formuły = błąd" przetrwał.

- [ ] **Step 3: Usuń dispatch legacy**

W `internal/systems/custom/plugin.go` zamień fragment od `if len(rollCfg.Formula) > 0 {` do zamykającego `}` po `switch` (linie 137-149) na:

```go
	if len(rollCfg.Formula) == 0 {
		return nil, fmt.Errorf("custom: field %q has no roll formula", skillKey)
	}
	return p.rollFromFormula(stats, template, skillKey, linkedAttr, rollCfg, modifier)
```

- [ ] **Step 4: Usuń martwe funkcje rollera**

Usuń z `internal/systems/custom/roller.go` cztery funkcje razem z ich komentarzami: `rollAttrPlusSkill`, `rollFixedD100`, `rollFixedD20` oraz `attrModifier` (używane wyłącznie przez `rollFixedD20`). Zostaje nagłówek sekcji `// ── Legacy formula types ───` — usuń i jego, bo nie ma już czego opisywać.

Ten sam nagłówek `// Legacy formula types` stoi też w `roller_test.go` nad trzema usuwanymi testami — po ich usunięciu zostaje pusty, wprost nad następnym nagłówkiem sekcji. Usuń oba.

- [ ] **Step 5: Usuń pole FormulaType z modelu**

W `internal/models/SystemTemplate.go` usuń z `RollConfig` dwie linie:

```go
	// Deprecated: superseded by Formula. Kept for backward compat with existing roller logic.
	FormulaType string `bson:"formulaType,omitempty" json:"formulaType,omitempty"`
```

Zostaw `LinkedAttr` wraz z komentarzem — dopisz nad nim wyjaśnienie, żeby następny czytający nie powtórzył tej pomyłki:

```go
	// LinkedAttr is the fallback attribute for attr_linked / dice_skill_attr blocks, used when
	// the live source (SkillTreeNode.LinkedAttr, SkillOption.Attr, CustomSkillNodes[].LinkedAttr)
	// is empty. Looks legacy, is not: resolveRollConfig reads it on every roll.
	LinkedAttr string `bson:"linkedAttr,omitempty" json:"linkedAttr,omitempty"`
```

- [ ] **Step 6: Usuń i przepisz testy**

Usuń z `roller_test.go` **pięć** funkcji: `TestAttrModifier`, `TestRollAttrPlusSkill`, `TestRollFixedD100`, `TestRollFixedD20` oraz `TestRollWithTemplate_UnknownFormulaType` (leży zaraz po `TestRollWithTemplate_AttrFieldUsesKeyAsLinkedAttr`) — po usunięciu pola `FormulaType` nie ma już „nieznanego typu formuły", którego mógłby pilnować; jego rolę przejmuje `TestRollWithTemplate_NoFormulaErrors` ze Stepa 1.

W dwóch fixture'ach `resolveRollConfig` zamień samą konfigurację (te testy nie wykonują rzutu, więc żadna liczba się nie zmienia):

- `TestResolveRollConfig_SkillTree` (`:1098`): `cfg := &models.RollConfig{FormulaType: "fixed_d100", SuccessType: "below_threshold"}` → `cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold"}`
- `TestResolveRollConfig_SkillTableAssignsAttr` (`:1123`): `cfg := &models.RollConfig{FormulaType: "fixed_d20_plus_mod", LinkedAttr: "dex"}` → `cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, LinkedAttr: "dex"}`

`TestRollWithTemplate_AttrFieldUsesKeyAsLinkedAttr` (`:1199`) rzut wykonuje, więc idzie w całości — stara arytmetyka `fixed_d20` (`(attr-10)/2 = 2`, wynik 12) nie ma następcy. Zamień całą funkcję na:

```go
func TestRollWithTemplate_AttrFieldUsesKeyAsLinkedAttr(t *testing.T) {
	// For an "attr" field the linked attribute is the skillKey itself — the attr_linked block
	// must therefore resolve to the field's own value.
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d20"), opBlock("+"), {Type: "attr_linked"}},
		SuccessType: "above_threshold",
	}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Key: "str", Type: "attr", Label: "Strength", Rollable: true, RollConfig: cfg,
			}},
		}},
	}
	stats := Stats{Attributes: map[string]AttrValue{"str": {Current: 14}}}
	raw, _ := bson.Marshal(stats)

	p := newTestPlugin(9) // d20 -> 10
	res, err := p.RollWithTemplate(raw, template, "str", 0)
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if res.Roll != 24 { // d20 10 + attr_linked (str = 14)
		t.Errorf("Roll = %d, want 24", res.Roll)
	}
	// Threshold falls back to the attribute (the skill key "str" has no skill entry), so a
	// roll of 24 against 14 is a success.
	if res.Target != 14 || res.Outcome != "regular_success" {
		t.Errorf("got target=%d outcome=%q, want 14/regular_success", res.Target, res.Outcome)
	}
}
```

We froncie usuń `formulaType` z fixture'a `CustomSheetBody.skillTree.test.jsx:28`:

```js
      rollConfig: { formula: [{ id: 'b1', type: 'dice', value: 'd100' }], successType: 'below_threshold' },
```

- [ ] **Step 7: Run the full suites**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...`
Expected: PASS.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS.

Run: `cd warhammer-battle-helper-backend && grep -rn "FormulaType\|rollFixedD\|rollAttrPlusSkill\|attrModifier" internal/ | grep -v _test`
Expected: brak wyników (pusty output).

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/ warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx
git commit -m "refactor(back): FEATURE-164 drop the dead formulaType roll paths"
```

---
### Task 5: Czyste helpery konfiguracji na froncie

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/modifierConfig.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/modifierConfig.test.js`

**Interfaces:**
- Consumes: kształt JSON `template.settings.modifier` z Taska 1
- Produces: `MOD_TARGET_ROLL`, `MOD_TARGET_THRESHOLD`, `MOD_TARGET_DICE_COUNT`, `MOD_TARGET_SUCCESS_THRESHOLD`, `DEFAULT_MODIFIER_CONFIG`, `readModifierConfig(template) → cfg|null`, `clampModifier(value, cfg) → number`, `formatModifier(value) → string`

- [ ] **Step 1: Write the failing test**

Utwórz `src/systems/custom/modifierConfig.test.js`:

```js
import {
  readModifierConfig,
  clampModifier,
  formatModifier,
  MOD_TARGET_ROLL,
  MOD_TARGET_THRESHOLD,
  MOD_TARGET_DICE_COUNT,
} from './modifierConfig';

describe('readModifierConfig', () => {
  it('returns null when the template has no settings at all', () => {
    expect(readModifierConfig(undefined)).toBeNull();
    expect(readModifierConfig({})).toBeNull();
    expect(readModifierConfig({ settings: {} })).toBeNull();
  });

  it('returns null when the modifier is disabled', () => {
    expect(readModifierConfig({ settings: { modifier: { enabled: false } } })).toBeNull();
  });

  it('fills in defaults for an enabled config', () => {
    const cfg = readModifierConfig({ settings: { modifier: { enabled: true } } });
    expect(cfg).toMatchObject({
      enabled: true,
      traditionalTarget: MOD_TARGET_ROLL,
      poolTarget: MOD_TARGET_DICE_COUNT,
      step: 1,
      presets: [],
    });
  });

  it('keeps GM-configured values', () => {
    const cfg = readModifierConfig({
      settings: { modifier: { enabled: true, traditionalTarget: MOD_TARGET_THRESHOLD, step: 10, min: -60, max: 60, presets: [{ value: -20, label: 'Trudny' }] } },
    });
    expect(cfg.traditionalTarget).toBe(MOD_TARGET_THRESHOLD);
    expect(cfg.step).toBe(10);
    expect(cfg.presets).toHaveLength(1);
  });

  it('repairs a step of zero — an input with step 0 refuses to increment', () => {
    expect(readModifierConfig({ settings: { modifier: { enabled: true, step: 0 } } }).step).toBe(1);
  });
});

describe('clampModifier', () => {
  const cfg = { min: -60, max: 60 };

  it('passes values inside the range', () => {
    expect(clampModifier(20, cfg)).toBe(20);
  });

  it('clamps both ends', () => {
    expect(clampModifier(999, cfg)).toBe(60);
    expect(clampModifier(-999, cfg)).toBe(-60);
  });

  it('treats a zero range as no limit', () => {
    expect(clampModifier(999, { min: 0, max: 0 })).toBe(999);
  });

  it('parses the string an input element gives back', () => {
    expect(clampModifier('-20', cfg)).toBe(-20);
  });

  it('reads unparseable input as zero, never as NaN', () => {
    expect(clampModifier('', cfg)).toBe(0);
    expect(clampModifier('-', cfg)).toBe(0);
  });
});

describe('formatModifier', () => {
  it('signs positives and leaves the rest alone', () => {
    expect(formatModifier(20)).toBe('+20');
    expect(formatModifier(-20)).toBe('-20');
    expect(formatModifier(0)).toBe('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=modifierConfig`
Expected: FAIL — `Cannot find module './modifierConfig'`.

- [ ] **Step 3: Write the implementation**

Utwórz `src/systems/custom/modifierConfig.js`:

```js
// Nazwy targetów modyfikatora. MUSZĄ być identyczne ze stałymi w
// warhammer-battle-helper-backend/internal/systems/custom/modifier.go — backend rozstrzyga
// rzut po tym samym stringu, który tu wybiera MG w kreatorze.
export const MOD_TARGET_ROLL = 'roll';
export const MOD_TARGET_THRESHOLD = 'threshold';
export const MOD_TARGET_DICE_COUNT = 'dice_count';
export const MOD_TARGET_SUCCESS_THRESHOLD = 'success_threshold';

export const DEFAULT_MODIFIER_CONFIG = {
  enabled: false,
  traditionalTarget: MOD_TARGET_ROLL,
  poolTarget: MOD_TARGET_DICE_COUNT,
  step: 1,
  min: 0,
  max: 0,
  presets: [],
};

// readModifierConfig zwraca znormalizowaną konfigurację modyfikatora albo null, gdy karta go
// nie używa. null zamiast obiektu z enabled:false po to, żeby wywołujący sprawdzał jedną rzecz:
// "brak konfiguracji" i "wyłączony" znaczą dla UI dokładnie to samo.
export function readModifierConfig(template) {
  const cfg = template?.settings?.modifier;
  if (!cfg || !cfg.enabled) return null;
  return {
    ...DEFAULT_MODIFIER_CONFIG,
    ...cfg,
    // Input z step === 0 nie reaguje na strzałki, a 0 to dokładnie to, co przychodzi z Go dla
    // nieustawionego pola (omitempty) — naprawiamy tu, nie w każdym miejscu użycia.
    step: cfg.step > 0 ? cfg.step : 1,
    presets: Array.isArray(cfg.presets) ? cfg.presets : [],
  };
}

// clampModifier trzyma wartość w granicach z konfiguracji. min === 0 && max === 0 znaczy
// "bez granic" — ta sama umowa co clampModifier w Go, żeby UI i serwer nie rozjechały się
// w tym, co jest wartością dopuszczalną.
export function clampModifier(value, cfg) {
  const parsed = parseInt(value, 10);
  const v = Number.isNaN(parsed) ? 0 : parsed;
  if (!cfg || (!cfg.min && !cfg.max)) return v;
  if (v < cfg.min) return cfg.min;
  if (v > cfg.max) return cfg.max;
  return v;
}

// formatModifier daje podpisaną etykietę do chipów presetów: plus dostaje znak, zero i minus
// zostają takie, jakie są.
export function formatModifier(value) {
  return value > 0 ? `+${value}` : String(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=modifierConfig`
Expected: PASS — 11 testów zielonych.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/modifierConfig.js \
        warhammer-battle-helper-front/src/systems/custom/modifierConfig.test.js
git commit -m "feat(front): FEATURE-164 modifier config helpers for custom cards"
```

---

### Task 6: Rząd chipów presetów

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/ModifierPresetRow.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/ModifierPresetRow.test.jsx`

**Interfaces:**
- Consumes: `formatModifier` z Taska 5
- Produces: `<ModifierPresetRow presets={[{value, label}]} onPick={(value) => …} />` — zwraca `null` dla pustej listy

- [ ] **Step 1: Write the failing test**

Utwórz `src/systems/custom/ModifierPresetRow.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModifierPresetRow from './ModifierPresetRow';

describe('ModifierPresetRow', () => {
  it('renders nothing when there are no presets', () => {
    const { container } = render(<ModifierPresetRow presets={[]} onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when presets are missing entirely', () => {
    const { container } = render(<ModifierPresetRow onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('signs a positive value and shows the GM label next to it', () => {
    render(<ModifierPresetRow presets={[{ value: 20, label: 'Łatwy' }]} onPick={() => {}} />);
    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByText('Łatwy')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveClass('custom-roll-overlay__preset--plus');
  });

  it('hands the picked value up', () => {
    const onPick = jest.fn();
    render(<ModifierPresetRow presets={[{ value: -30, label: 'Bardzo trudny' }]} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledWith(-30);
    expect(screen.getByRole('button')).toHaveClass('custom-roll-overlay__preset--minus');
  });

  // Zero nie jest ani ulgą, ani utrudnieniem — nie dostaje żadnego wariantu. Bez tego przypadku
  // implementacja przypinająca --plus wszystkiemu przeszłaby dwa testy powyżej.
  it('renders a preset with no label and gives zero no tone class', () => {
    render(<ModifierPresetRow presets={[{ value: 0 }]} onPick={() => {}} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    const chip = screen.getByRole('button');
    expect(chip).not.toHaveClass('custom-roll-overlay__preset--plus');
    expect(chip).not.toHaveClass('custom-roll-overlay__preset--minus');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierPresetRow`
Expected: FAIL — `Cannot find module './ModifierPresetRow'`.

- [ ] **Step 3: Write the implementation**

Utwórz `src/systems/custom/ModifierPresetRow.jsx`:

```jsx
import React from 'react';
import { formatModifier } from './modifierConfig';

// Rząd chipów szybkiego wyboru modyfikatora. Bezstanowy — klik oddaje wartość w górę, a overlay
// decyduje, co z nią zrobić. Etykiety pisze MG w kreatorze, więc nie idą przez i18n.
//
// Klucz to indeks: lista nie ma id (backendowy models.ModifierPreset trzyma tylko value+label)
// i nigdy nie jest tu przestawiana — reorder byłby zmianą po stronie kreatora, nie tu.
function ModifierPresetRow({ presets, onPick }) {
  if (!presets || presets.length === 0) return null;

  return (
    <div className="custom-roll-overlay__presets">
      {presets.map((preset, idx) => {
        const tone = preset.value > 0 ? ' custom-roll-overlay__preset--plus'
          : preset.value < 0 ? ' custom-roll-overlay__preset--minus' : '';
        return (
          <button
            key={idx}
            type="button"
            className={`custom-roll-overlay__preset${tone}`}
            onClick={() => onPick(preset.value)}
          >
            <span className="custom-roll-overlay__preset-value">{formatModifier(preset.value)}</span>
            {preset.label && <span className="custom-roll-overlay__preset-label">{preset.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default ModifierPresetRow;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierPresetRow`
Expected: PASS — 5 testów zielonych. Trzy z nich przypinają wariant klasy (`--plus`, `--minus`, brak
przy zerze), bo to na tych klasach Task 7 opiera kolorystykę chipów — bez nich odwrócony operator
porównania przechodzi cały zestaw.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/ModifierPresetRow.jsx \
        warhammer-battle-helper-front/src/systems/custom/ModifierPresetRow.test.jsx
git commit -m "feat(front): FEATURE-164 modifier preset chip row"
```

---

### Task 7: Overlay modyfikatora + jasna paleta

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/RollModifierOverlay.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/RollModifierOverlay.test.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css:7481-7582` (blok `.custom-roll-overlay*`)

**Interfaces:**
- Consumes: `ModifierPresetRow` (Task 6), `clampModifier` (Task 5)
- Produces: `<RollModifierOverlay label={string} config={cfg} onConfirm={(modifier:number) => …} onCancel={() => …} />`

- [ ] **Step 1: Write the failing test**

Utwórz `src/systems/custom/RollModifierOverlay.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import RollModifierOverlay from './RollModifierOverlay';

const cfg = (patch = {}) => ({
  enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count',
  step: 1, min: 0, max: 0, presets: [], ...patch,
});

describe('RollModifierOverlay', () => {
  it('confirms the typed modifier', () => {
    const onConfirm = jest.fn();
    render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-20' } });
    fireEvent.click(screen.getByRole('button', { name: /roll|rzut/i }));
    expect(onConfirm).toHaveBeenCalledWith(-20);
  });

  it('confirms on Enter and cancels on Escape', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={onConfirm} onCancel={onCancel} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(7);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  // Kliknięcie chipa jest całą decyzją — osobne "wybierz, potem zatwierdź" to dwa kliknięcia
  // na jedno postanowienie MG.
  it('a preset chip confirms straight away', () => {
    const onConfirm = jest.fn();
    render(
      <RollModifierOverlay
        label="Perswazja"
        config={cfg({ presets: [{ value: -30, label: 'Bardzo trudny' }] })}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByText('-30'));
    expect(onConfirm).toHaveBeenCalledWith(-30);
  });

  it('clamps a typed value to the configured range before confirming', () => {
    const onConfirm = jest.fn();
    render(<RollModifierOverlay label="Perswazja" config={cfg({ min: -60, max: 60 })} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '999' } });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(60);
  });

  it('cancels when the backdrop is clicked', () => {
    const onCancel = jest.fn();
    const { container } = render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(container.querySelector('.custom-roll-overlay__backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the label of what is being rolled', () => {
    render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Perswazja')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=RollModifierOverlay`
Expected: FAIL — `Cannot find module './RollModifierOverlay'`.

- [ ] **Step 3: Write the implementation**

Utwórz `src/systems/custom/RollModifierOverlay.jsx`:

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import ModifierPresetRow from './ModifierPresetRow';
import { clampModifier } from './modifierConfig';

// Pytanie o modyfikator przed rzutem. Jedna kopia dla obu kart customowych — pełnego popupu
// (CharacterSheet) i panelu postaci na siatce (CharacterDetails), które wcześniej trzymały ten
// sam markup osobno.
//
// Wartość żyje w stanie jako surowy string z inputu, nie jako number: typowanie "-20" przechodzi
// przez stan "-", którego Number() nie umie, a użytkownik nie może stracić minusa w połowie
// wpisywania. Na liczbę i w granice konfiguracji zamienia ją clampModifier dopiero przy
// zatwierdzeniu.
function RollModifierOverlay({ label, config, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('0');

  const confirm = (value) => onConfirm(clampModifier(value, config));
  const hasLimits = Boolean(config.min || config.max);

  return (
    <div className="custom-roll-overlay">
      <div className="custom-roll-overlay__backdrop" onClick={onCancel} />
      <div className="custom-roll-overlay__card">
        <div className="custom-roll-overlay__title">
          {t('combat.rollFor')}: <strong>{label}</strong>
        </div>

        <ModifierPresetRow presets={config.presets} onPick={confirm} />

        <div className="custom-roll-overlay__row">
          <label className="custom-roll-overlay__label" htmlFor="roll-modifier-input">
            {t('combat.modifier')}
          </label>
          <input
            id="roll-modifier-input"
            type="number"
            className="custom-roll-overlay__input"
            value={draft}
            step={config.step}
            min={hasLimits ? config.min : undefined}
            max={hasLimits ? config.max : undefined}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') confirm(draft);
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>

        <div className="custom-roll-overlay__actions">
          <button type="button" className="custom-roll-overlay__btn--cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="custom-roll-overlay__btn--roll" onClick={() => confirm(draft)}>
            <CasinoIcon style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }} />
            {t('combat.roll')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RollModifierOverlay;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=RollModifierOverlay`
Expected: PASS — 6 testów zielonych.

- [ ] **Step 5: Przepisz CSS na jasną paletę**

W `src/style.css` zamień cały blok od `.custom-roll-overlay {` (linia 7481) do końca `.custom-roll-overlay__btn--roll:hover { … }` (linia ~7582, bezpośrednio przed komentarzem `/* --- CharacterSheet full popup --- */`) na:

```css
.custom-roll-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.custom-roll-overlay__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
}

/* Karta pytania o modyfikator należy do rodziny kart postaci, więc trzyma ich jasną paletę
   (kremowe tło, ciemny brąz), nie ciemny motyw sesji gry. */
.custom-roll-overlay__card {
    position: relative;
    z-index: 1;
    background: linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%);
    border: 2px solid #7a5c42;
    border-radius: 8px;
    padding: 20px 24px;
    min-width: 260px;
    max-width: 340px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.custom-roll-overlay__title {
    font-size: 0.95rem;
    color: #3a2f1f;
    font-family: 'Cinzel', serif;
}

.custom-roll-overlay__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.custom-roll-overlay__preset {
    display: flex;
    align-items: baseline;
    gap: 5px;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    color: #3a2f1f;
    font-size: 0.8rem;
    transition: border-color 0.15s, background 0.15s;
}

.custom-roll-overlay__preset:hover {
    border-color: #7a5c42;
    background: #fffdf8;
}

.custom-roll-overlay__preset-value {
    font-weight: 700;
    color: #7a5c42;
}

.custom-roll-overlay__preset--plus .custom-roll-overlay__preset-value {
    color: #4e6b3c;
}

.custom-roll-overlay__preset--minus .custom-roll-overlay__preset-value {
    color: #8c3a2b;
}

.custom-roll-overlay__preset-label {
    color: rgba(58, 47, 31, 0.75);
}

.custom-roll-overlay__row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.custom-roll-overlay__label {
    font-size: 0.85rem;
    color: #7a5c42;
    white-space: nowrap;
}

.custom-roll-overlay__input {
    width: 70px;
    background: #fff9f0;
    border: 1px solid #c4a882;
    color: #3a2f1f;
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 1rem;
    text-align: center;
}

.custom-roll-overlay__input:focus {
    outline: none;
    border-color: #7a5c42;
}

.custom-roll-overlay__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.custom-roll-overlay__btn--cancel {
    background: none;
    border: 1px solid #c4a882;
    color: #7a5c42;
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: border-color 0.15s, color 0.15s;
}

.custom-roll-overlay__btn--cancel:hover {
    border-color: #7a5c42;
    color: #3a2f1f;
}

.custom-roll-overlay__btn--roll {
    background: linear-gradient(135deg, #c9975b, #a87540);
    border: none;
    color: #fff9f0;
    border-radius: 4px;
    padding: 6px 16px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    transition: filter 0.15s;
}

.custom-roll-overlay__btn--roll:hover {
    filter: brightness(1.08);
}
```

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/RollModifierOverlay.jsx \
        warhammer-battle-helper-front/src/systems/custom/RollModifierOverlay.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat(front): FEATURE-164 roll modifier overlay on the light card palette"
```

---

### Task 8: Hook `useRollPrompt`

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/useRollPrompt.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/useRollPrompt.test.js`

**Interfaces:**
- Consumes: `readModifierConfig` (Task 5)
- Produces: `useRollPrompt(template, onRoll) → { modifierConfig, pending, promptRoll(request), cancelRoll(), confirmRoll(modifier) }`, gdzie `request` to `{ skillKey, label }` albo `{ weaponFieldKey, weaponRowId, label }`, a `onRoll(request, modifier)` wykonuje właściwy fetch

- [ ] **Step 1: Write the failing test**

Utwórz `src/systems/custom/useRollPrompt.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import { useRollPrompt } from './useRollPrompt';

const enabledTemplate = { settings: { modifier: { enabled: true } } };
const request = { skillKey: 'fld_1', label: 'Perswazja' };

describe('useRollPrompt', () => {
  it('rolls immediately with no modifier when the template has none configured', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt({}, onRoll));

    act(() => result.current.promptRoll(request));

    expect(onRoll).toHaveBeenCalledWith(request, 0);
    expect(result.current.pending).toBeNull();
    expect(result.current.modifierConfig).toBeNull();
  });

  it('holds the request until it is confirmed when the modifier is enabled', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.promptRoll(request));
    expect(onRoll).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(request);

    act(() => result.current.confirmRoll(-20));
    expect(onRoll).toHaveBeenCalledWith(request, -20);
    expect(result.current.pending).toBeNull();
  });

  it('drops the request on cancel without rolling', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.promptRoll(request));
    act(() => result.current.cancelRoll());

    expect(onRoll).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('ignores a confirm with nothing pending', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.confirmRoll(10));

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('carries a weapon request through unchanged', () => {
    const onRoll = jest.fn();
    const weapon = { weaponFieldKey: 'fld_w', weaponRowId: 'row_1', label: 'Miecz' };
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.promptRoll(weapon));
    act(() => result.current.confirmRoll(5));

    expect(onRoll).toHaveBeenCalledWith(weapon, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=useRollPrompt`
Expected: FAIL — `Cannot find module './useRollPrompt'`.

- [ ] **Step 3: Write the implementation**

Utwórz `src/systems/custom/useRollPrompt.js`:

```js
import { useState, useCallback, useMemo } from 'react';
import { readModifierConfig } from './modifierConfig';

// useRollPrompt trzyma jedyny stan, jakiego potrzebuje pytanie o modyfikator: co rzucamy.
// Gdy szablon nie ma włączonego modyfikatora, promptRoll wykonuje rzut od razu — dzięki temu
// żaden komponent karty nie musi powtarzać tego sprawdzenia ani pamiętać o zerowaniu wartości
// po rzucie (to właśnie było zduplikowane w CharacterSheet i CharacterDetails).
//
// onRoll(request, modifier) dostaje request nietknięty, więc hook nie wie nic o tym, czy rzut
// idzie na umiejętność, czy na broń — dyspozycją zajmuje się wołający.
export function useRollPrompt(template, onRoll) {
  const [pending, setPending] = useState(null);
  const modifierConfig = useMemo(() => readModifierConfig(template), [template]);

  const promptRoll = useCallback((request) => {
    if (!modifierConfig) {
      onRoll(request, 0);
      return;
    }
    setPending(request);
  }, [modifierConfig, onRoll]);

  const cancelRoll = useCallback(() => setPending(null), []);

  const confirmRoll = useCallback((modifier) => {
    if (!pending) return;
    onRoll(pending, modifier);
    setPending(null);
  }, [pending, onRoll]);

  return { modifierConfig, pending, promptRoll, cancelRoll, confirmRoll };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=useRollPrompt`
Expected: PASS — 5 testów zielonych.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/useRollPrompt.js \
        warhammer-battle-helper-front/src/systems/custom/useRollPrompt.test.js
git commit -m "feat(front): FEATURE-164 useRollPrompt hook for the modifier prompt"
```

---

### Task 9: Podłączenie obu kart postaci + usunięcie martwego `ModifierInput`

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx:41` (stany), `:281-317` (handlery), `:350` (`onRoll`), `:359-390` (overlay)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx:26-27` (stany), `:34-70` (handlery), `:135, :252, :273` (triggery), `:284-315` (overlay)
- Delete: `warhammer-battle-helper-front/src/components/buttons/ModifierInput.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css:1996` (usunięcie `.modifier-input`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.modifierPrompt.test.jsx` (**nowy**) oraz `CharacterSheet.modifierPrompt.test.jsx` (**nowy**) — obie karty dostają ten sam zestaw dwóch przypadków. Bez tego drugiego popup, czyli ważniejsza powierzchnia, nie ma żadnej siatki na swoje podłączenie: literówka przywracająca `onRoll={setRollModal}` przechodzi cały zestaw. Harness jak w `CharacterSheet.standalone.test.jsx` — prop `isStandalone` omija `DraggablePopup`, który poza `WindowManagerProvider` rzuca. Trigger to `button.custom-sheet__roll-btn` (`CustomSheetBody.jsx:461`), bez dostępnej nazwy, więc `container.querySelector`.

**Interfaces:**
- Consumes: `useRollPrompt` (Task 8), `RollModifierOverlay` (Task 7)
- Produces: brak nowego API — obie karty tracą stany `rollModal`/`modifier` i wołają `promptRoll(request)`

- [ ] **Step 1: Write the failing test**

Utwórz `src/systems/custom/CharacterDetails.modifierPrompt.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie axios (ESM-only), którego CRA-owy jest nie transformuje — bez mocka
// test wywala się na imporcie, zanim cokolwiek się wyrenderuje (wzorzec:
// CharacterDetails.favorites.test.jsx).
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterDetails from './CharacterDetails';

const template = (modifier) => ({
  sections: [{
    id: 'sec1',
    fields: [{ key: 'fld_str', type: 'attr', label: 'Siła', rollable: true }],
  }],
  ...(modifier ? { settings: { modifier } } : {}),
});

function renderDetails(modifier) {
  return render(
    <CustomCharacterDetails
      character={{ id: 'c1', name: 'Bohater', stats: { attributes: { fld_str: { current: 30 } } } }}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="tok"
      game={{ customSystemTemplate: template(modifier) }}
    />
  );
}

describe('CustomCharacterDetails roll modifier prompt', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });
  afterEach(() => { jest.resetAllMocks(); });

  it('rolls straight away with modifier 0 when the template has no modifier configured', async () => {
    renderDetails(null);
    fireEvent.click(screen.getByTitle(/roll|rzut/i));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.modifier).toBe(0);
    expect(document.querySelector('.custom-roll-overlay')).toBeNull();
  });

  it('opens the prompt and sends the confirmed modifier when it is enabled', async () => {
    renderDetails({ enabled: true, traditionalTarget: 'roll' });
    fireEvent.click(screen.getByTitle(/roll|rzut/i));

    expect(document.querySelector('.custom-roll-overlay')).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-20' } });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).modifier).toBe(-20);
    expect(document.querySelector('.custom-roll-overlay')).toBeNull();
  });
});
```

Ten test wymaga, żeby przycisk rzutu miał dostępną nazwę. Dziś jej nie ma — `CharacterDetails.jsx:133-139` to `<button>` z samą `<CasinoIcon />` w środku, więc `getByTitle` nic nie znajdzie. Etykietę dopisuje Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CharacterDetails.modifierPrompt`
Expected: FAIL — overlay pokazuje się także bez konfiguracji (dziś jest bezwarunkowy), więc pierwszy test nie znajduje wywołania `fetch`.

- [ ] **Step 3: Przepisz CharacterDetails.jsx**

Usuń dwie linie stanu (`:26-27`):

```jsx
  const [rollModal,  setRollModal]  = useState(null); // { skillKey, label }
  const [modifier,   setModifier]   = useState(0);
```

W `handleRoll` i `handleRollWeapon` usuń dwie ostatnie linie każdej z nich (`setRollModal(null); setModifier(0);`) — czyszczeniem stanu zajmuje się teraz hook.

Zamień blok `confirmRoll` (`:65-70`) na dyspozytora i hook — wstaw zaraz po `handleRollWeapon`:

```jsx
  // Hook woła to z requestem, który wcześniej dostał od przycisku, i z zatwierdzonym
  // modyfikatorem; rozdział na rzut umiejętności i broni zostaje tutaj, bo tylko ta warstwa
  // wie, który endpoint jest który.
  const dispatchRoll = useCallback((request, mod) => {
    if (request.weaponFieldKey) {
      handleRollWeapon(request.weaponFieldKey, request.weaponRowId, mod);
    } else {
      handleRoll(request.skillKey, mod);
    }
  }, [handleRoll, handleRollWeapon]);

  const { modifierConfig, pending, promptRoll, cancelRoll, confirmRoll } = useRollPrompt(template, dispatchRoll);
```

`handleRoll` i `handleRollWeapon` muszą być owinięte w `useCallback` (zależności: `gameId`, `character`, `token`, `rollVisibility`, `addLogMessage`, `t`), bo `dispatchRoll` je zależnościuje.

Zamień trzy triggery:

- `:133-139` (przycisk rzutu atrybutu) — podmiana handlera **i** dodanie etykiety, której ten przycisk nigdy nie miał (ikona bez tekstu jest nieczytelna dla czytnika ekranu i nie da się jej wskazać w teście):

```jsx
          <button
            className="custom-character-details__roll-btn"
            onClick={() => promptRoll({ skillKey: field.key, label: field.label })}
            disabled={!gameId}
            title={t('combat.roll')}
            aria-label={t('combat.roll')}
          >
            <CasinoIcon style={{ fontSize: 14 }} />
          </button>
```
- `:252` → `onClick={() => promptRoll({ skillKey: s.skillKey, label: s.label })}`
- `:273` → `onClick={() => promptRoll({ weaponFieldKey: w.fieldKey, weaponRowId: w.rowId, label: w.label })}`

Zamień cały blok overlaya (`:284-315`, od komentarza `{/* Modifier overlay */}` do zamknięcia `)}`) na:

```jsx
      {/* Pytanie o modyfikator — renderuje się tylko wtedy, gdy szablon go włącza. */}
      {pending && modifierConfig && (
        <RollModifierOverlay
          label={pending.label}
          config={modifierConfig}
          onConfirm={confirmRoll}
          onCancel={cancelRoll}
        />
      )}
```

Dopisz importy na górze pliku:

```jsx
import RollModifierOverlay from './RollModifierOverlay';
import { useRollPrompt } from './useRollPrompt';
```

`CasinoIcon` **zostaje** w tym pliku — przyciski rzutu (`:133`, ulubione bronie `:273`) nadal go renderują. Zniknął tylko z overlaya.

- [ ] **Step 4: Przepisz CharacterSheet.jsx tak samo**

Usuń linie stanu `:40-41` (`rollModal`, `modifier`), usuń końcówki `setRollModal(null); setModifier(0);` z `handleRoll` (`:292-293`) i `handleRollWeapon` (`:307-308`), zamień `confirmRoll` (`:311-317`) na ten sam `dispatchRoll` + `useRollPrompt` co w Stepie 3, zamień `onRoll={setRollModal}` (`:350`) na `onRoll={promptRoll}`, a blok overlaya (`:359-390`) na ten sam warunkowy `<RollModifierOverlay …/>`. Dopisz te same dwa importy i **usuń** import `CasinoIcon` (`CharacterSheet.jsx:3`) — jego jedyne użycie w tym pliku było w przycisku overlaya (`:383`), więc po podmianie ESLint zgłosi `no-unused-vars`.

- [ ] **Step 5: Usuń martwy ModifierInput**

```bash
rm warhammer-battle-helper-front/src/components/buttons/ModifierInput.jsx
```

W `src/style.css` usuń linię 1996:

```css
.modifier-input { width:40px; padding:0; }
```

**Nie ruszaj** `.modifier-input-container` (`style.css:536`) — używa jej `systems/warhammer4e/CharacterDetails.jsx:453`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CharacterDetails|CharacterSheet|useRollPrompt|RollModifierOverlay'`
Expected: PASS — nowy test promptu zielony, istniejące testy custom karty (`CharacterDetails.favorites`, `CharacterDetails.shortCard`, `CharacterSheet.standalone`, `CharacterSheet.remoteUpdate`) bez zmian.

Run: `cd warhammer-battle-helper-front && grep -rn "ModifierInput\|modifier-input\b" src/`
Expected: brak wyników poza `.modifier-input-container` w `style.css:536` i jej użyciem w `warhammer4e/CharacterDetails.jsx`.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/ warhammer-battle-helper-front/src/style.css
git rm warhammer-battle-helper-front/src/components/buttons/ModifierInput.jsx
git commit -m "feat(front): FEATURE-164 wire both custom cards to the shared modifier prompt"
```

---

### Task 10: Log pokazuje modyfikator, który nie siedzi we breakdownie

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx:88`
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomWeaponRoll.jsx:73`
- Test: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.modifier.test.jsx` (**nowy**) oraz `CustomWeaponRoll.modifier.test.jsx` (**nowy**) — zmiana dotyczy obu komponentów logu, więc oba dostają dyskryminującą parę przypadków: ten sam modyfikator i ta sama formuła, różny `modifierTarget`. Bez drugiego pliku odwrócenie guardu w `CustomWeaponRoll.jsx` przechodzi cały zestaw.

**Interfaces:**
- Consumes: `RollResult.ModifierTarget` (JSON `modifierTarget`) z Taska 2; `MOD_TARGET_ROLL` z Taska 5
- Produces: brak nowego API

**Dlaczego to osobny task:** tylko target `roll` wkleja modyfikator do `formulaBreakdown`. Dzisiejszy warunek `!hasFormula && modifierText` ukrywa modyfikator zawsze, gdy jest formuła — a przy targecie `threshold` czy `success_threshold` gracz nie zobaczyłby go nigdzie.

- [ ] **Step 1: Write the failing test**

Utwórz `src/systems/custom/rolls/CustomRoll.modifier.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../../i18n';
import CustomRoll from './CustomRoll';

const base = {
  characterName: 'Bohater',
  skillName: 'Perswazja',
  roll: 48,
  target: 35,
  outcome: 'failure',
  diceType: 100,
};

describe('CustomRoll modifier visibility', () => {
  // Target "roll" jest już wliczony w breakdown ("d100-20 = 48-20 = 28") — powtórzenie go
  // obok byłoby tą samą liczbą dwa razy.
  it('does not repeat a modifier already baked into the breakdown', () => {
    const { container } = render(
      <CustomRoll data={{ ...base, roll: 28, target: 55, modifier: -20, modifierTarget: 'roll', formulaBreakdown: 'd100-20 = 48-20 = 28' }} />
    );
    expect(container.querySelector('.log-modifier')).toBeNull();
  });

  // Target "threshold" nie rusza breakdownu, więc bez tego modyfikator przepadałby z widoku.
  it('shows a threshold modifier next to the roll', () => {
    render(
      <CustomRoll data={{ ...base, modifier: -20, modifierTarget: 'threshold', formulaBreakdown: 'd100 = 48' }} />
    );
    expect(screen.getByText('(-20)')).toBeInTheDocument();
  });

  it('shows a pool dice-count modifier', () => {
    render(
      <CustomRoll data={{
        ...base, roll: 3, target: 4, outcome: 'regular_success',
        modifier: 2, modifierTarget: 'dice_count',
        poolFormula: [{ kind: 'dice', sides: 6, rolls: [4, 6, 2, 5, 1] }],
        poolSuccesses: 3, poolSuccessCondition: 'gte',
      }} />
    );
    expect(screen.getByText('(+2)')).toBeInTheDocument();
  });

  it('shows nothing when there was no modifier', () => {
    const { container } = render(
      <CustomRoll data={{ ...base, modifier: 0, modifierTarget: '', formulaBreakdown: 'd100 = 48' }} />
    );
    expect(container.querySelector('.log-modifier')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomRoll.modifier`
Expected: FAIL — `Unable to find an element with the text: (-20)`, bo formuła jest obecna i warunek `!hasFormula` ucina modyfikator.

- [ ] **Step 3: Zmień warunek w CustomRoll.jsx**

Dopisz import na górze pliku:

```jsx
import { MOD_TARGET_ROLL } from '../modifierConfig';
```

Zaraz po `const hasFormula = Boolean(formulaText);` dopisz:

```jsx
  // Tylko target "roll" wkleja modyfikator do breakdownu (roller.go: rollFromFormula). Przy
  // każdym innym trzeba go wypisać osobno, inaczej gracz nie widzi go nigdzie — a przy braku
  // modyfikatora modifierText jest i tak puste.
  const showsModifierSeparately = !hasFormula || data.modifierTarget !== MOD_TARGET_ROLL;
```

Zamień linię `:88`:

```jsx
          {showsModifierSeparately && modifierText && <span className="log-modifier">{modifierText}</span>}
```

- [ ] **Step 4: Ta sama zmiana w CustomWeaponRoll.jsx**

Dopisz ten sam import, a po `const formulaText = formatPoolFormula(data.poolFormula, t) || data.formulaBreakdown;` dopisz:

```jsx
  // Patrz CustomRoll.jsx — tylko target "roll" siedzi już w breakdownie.
  const showsModifierSeparately = !formulaText || data.modifierTarget !== MOD_TARGET_ROLL;
```

Zamień linię `:73`:

```jsx
          {showsModifierSeparately && modifierText && <span className="log-modifier">{modifierText}</span>}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomRoll|CustomWeaponRoll'`
Expected: PASS — nowy test zielony, istniejące smoke testy obu komponentów logu nadal zielone.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/rolls/
git commit -m "feat(front): FEATURE-164 show a modifier the breakdown does not carry"
```

---

### Task 11: Edytor presetów w kreatorze

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/ModifierPresetEditor.jsx`
- Test: `warhammer-battle-helper-front/src/components/creator/ModifierPresetEditor.test.jsx`

**Interfaces:**
- Consumes: klucze i18n `creator.modifier.*` (dodane w Tasku 13 — do czasu ich dopisania `t()` zwraca sam klucz, co testom nie przeszkadza, bo pytają o role, nie o teksty)
- Produces: `<ModifierPresetEditor presets={[{value, label}]} onChange={(nextPresets) => …} />`

- [ ] **Step 1: Write the failing test**

Utwórz `src/components/creator/ModifierPresetEditor.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ModifierPresetEditor from './ModifierPresetEditor';

describe('ModifierPresetEditor', () => {
  it('adds a preset with a zero value', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('mpe-add'));
    expect(onChange).toHaveBeenCalledWith([{ value: 0, label: '' }]);
  });

  it('edits a value and keeps the label', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-value-0'), { target: { value: '-30' } });
    expect(onChange).toHaveBeenCalledWith([{ value: -30, label: 'Trudny' }]);
  });

  it('edits a label and keeps the value', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-label-0'), { target: { value: 'Bardzo trudny' } });
    expect(onChange).toHaveBeenCalledWith([{ value: -20, label: 'Bardzo trudny' }]);
  });

  // jsdom nie odtwarza buforowania <input type="number"> (przeglądarka pokazuje "-", a do handlera
  // trafia ""), więc testujemy maszynę stanów, nie widoczny minus.
  it('does not push a value while the field holds an unparseable draft', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-value-0'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the unparseable draft in the field instead of snapping it back', () => {
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={() => {}} />);
    const input = screen.getByTestId('mpe-value-0');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('commits an unparseable draft as zero on blur', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-value-0'), { target: { value: '' } });
    fireEvent.blur(screen.getByTestId('mpe-value-0'));
    expect(onChange).toHaveBeenCalledWith([{ value: 0, label: 'Trudny' }]);
  });

  it('removes the right row', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: 10, label: 'A' }, { value: 20, label: 'B' }]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('mpe-remove-0'));
    expect(onChange).toHaveBeenCalledWith([{ value: 20, label: 'B' }]);
  });

  it('renders an empty hint with no presets', () => {
    render(<ModifierPresetEditor presets={[]} onChange={() => {}} />);
    expect(screen.getByTestId('mpe-empty')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierPresetEditor`
Expected: FAIL — `Cannot find module './ModifierPresetEditor'`.

- [ ] **Step 3: Write the implementation**

Utwórz `src/components/creator/ModifierPresetEditor.jsx`:

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

// Edytor listy presetów modyfikatora (wartość + etykieta MG). Klucz to indeks: preset nie ma id
// w modelu (models.ModifierPreset trzyma value i label), a lista nie jest tu przestawiana —
// wiersze przychodzą i odchodzą tylko z końca albo pojedynczo.
function ModifierPresetEditor({ presets, onChange }) {
  const { t } = useTranslation();
  const list = presets || [];
  // Draft dotyczy wiersza aktualnie edytowanego — fokus ma zawsze najwyżej jedno pole, więc
  // jeden obiekt wystarcza. Klucz to indeks, dlatego add/remove muszą go czyścić.
  const [draft, setDraft] = useState(null); // { idx, raw } | null

  const update = (idx, patch) => onChange(list.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const remove = (idx) => { setDraft(null); onChange(list.filter((_, i) => i !== idx)); };
  const add = () => { setDraft(null); onChange([...list, { value: 0, label: '' }]); };

  // Liczba w polu żyje jako surowy string, dopóki wiersz jest edytowany. Bez tego `parseInt || 0`
  // przy każdym znaku kasuje minus, zanim MG zdąży dopisać cyfry — a ujemne presety (kary) są
  // głównym powodem istnienia tego edytora. Ta sama zasada co draft w RollModifierOverlay.jsx:
  // string podczas pisania, liczba przy zatwierdzeniu.
  //
  // Uwaga o <input type="number">: przeglądarka sanityzuje niedokończone "-" do pustego stringa w
  // handlerze, trzymając "-" we własnym buforze. Dlatego przy niepustym drafcie NIE wypychamy
  // wartości i nie nadpisujemy pola — inaczej React skasowałby ten bufor.
  const valueOf = (idx, preset) => (draft && draft.idx === idx ? draft.raw : String(preset.value));

  const handleValueChange = (idx, raw) => {
    setDraft({ idx, raw });
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) update(idx, { value: parsed });
  };

  // Wyjście z pola domyka wartość: to, co się nie parsuje (pusty string, sam minus), staje się 0.
  const handleValueBlur = (idx) => {
    if (draft && draft.idx === idx && Number.isNaN(parseInt(draft.raw, 10))) {
      update(idx, { value: 0 });
    }
    setDraft(null);
  };

  return (
    <div className="mpe__root">
      {list.length === 0 ? (
        <div className="mpe__empty" data-testid="mpe-empty">{t('creator.modifier.presetsEmpty')}</div>
      ) : (
        <div className="mpe__rows">
          {list.map((preset, idx) => (
            <div className="mpe__row" key={idx}>
              <input
                type="number"
                className="mpe__value"
                data-testid={`mpe-value-${idx}`}
                value={valueOf(idx, preset)}
                onChange={e => handleValueChange(idx, e.target.value)}
                onBlur={() => handleValueBlur(idx)}
                aria-label={t('creator.modifier.presetValue')}
              />
              <input
                type="text"
                className="mpe__label"
                data-testid={`mpe-label-${idx}`}
                value={preset.label || ''}
                onChange={e => update(idx, { label: e.target.value })}
                placeholder={t('creator.modifier.presetLabelPlaceholder')}
                aria-label={t('creator.modifier.presetLabel')}
              />
              <button
                type="button"
                className="mpe__remove"
                data-testid={`mpe-remove-${idx}`}
                onClick={() => remove(idx)}
                title={t('creator.modifier.presetRemove')}
                aria-label={t('creator.modifier.presetRemove')}
              >
                <DeleteOutlineIcon style={{ fontSize: 16 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="mpe__add" data-testid="mpe-add" onClick={add}>
        <AddIcon style={{ fontSize: 15 }} /> {t('creator.modifier.presetAdd')}
      </button>
    </div>
  );
}

export default ModifierPresetEditor;
```

- [ ] **Step 4: Dopisz CSS**

Na koniec `src/style.css`:

```css
/* --- ModifierPresetEditor (kreator, zakładka General) --- */

.mpe__root {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mpe__empty {
    font-size: 0.8rem;
    color: rgba(58, 47, 31, 0.55);
    font-style: italic;
}

.mpe__rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mpe__row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mpe__value {
    width: 68px;
    text-align: center;
}

.mpe__label {
    flex: 1;
    min-width: 0;
}

.mpe__remove {
    background: none;
    border: 1px solid #c4a882;
    border-radius: 4px;
    color: #8c3a2b;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 3px;
}

.mpe__remove:hover {
    border-color: #8c3a2b;
}

.mpe__add {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px dashed #c4a882;
    border-radius: 4px;
    color: #7a5c42;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 4px 10px;
}

.mpe__add:hover {
    border-style: solid;
    border-color: #7a5c42;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierPresetEditor`
Expected: PASS — 6 testów zielonych.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/ModifierPresetEditor.jsx \
        warhammer-battle-helper-front/src/components/creator/ModifierPresetEditor.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat(front): FEATURE-164 modifier preset editor for the creator"
```

---

### Task 12: Karta konfiguracji modyfikatora

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.jsx`
- Test: `warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.test.jsx`

**Interfaces:**
- Consumes: `ModifierPresetEditor` (Task 11), stałe targetów i `DEFAULT_MODIFIER_CONFIG` z `systems/custom/modifierConfig` (Task 5)
- Produces: `<ModifierConfigBuilder value={cfg|undefined} onChange={(nextCfg) => …} />` — `onChange` dostaje **pełny** obiekt konfiguracji, gotowy do wsadzenia w `settings.modifier`

- [ ] **Step 1: Write the failing test**

Utwórz `src/components/creator/ModifierConfigBuilder.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ModifierConfigBuilder from './ModifierConfigBuilder';

describe('ModifierConfigBuilder', () => {
  it('starts disabled when the template has no config and enables with defaults', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={undefined} onChange={onChange} />);

    expect(screen.getByTestId('mcb-enable')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('mcb-enable'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', step: 1,
    }));
  });

  // Konfiguracja wyłączona nie pokazuje pól — wybór targetu bez włącznika to ustawienie,
  // które nic nie robi.
  it('hides the targets while disabled', () => {
    render(<ModifierConfigBuilder value={{ enabled: false }} onChange={() => {}} />);
    expect(screen.queryByTestId('mcb-traditional-target')).toBeNull();
  });

  it('switches the traditional target', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count' }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-traditional-target'), { target: { value: 'threshold' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ traditionalTarget: 'threshold' }));
  });

  it('switches the pool target', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count' }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-pool-target'), { target: { value: 'success_threshold' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ poolTarget: 'success_threshold' }));
  });

  it('shows a hint that names the chosen target', () => {
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'threshold', poolTarget: 'dice_count' }} onChange={() => {}} />);
    expect(screen.getByTestId('mcb-traditional-hint').textContent).toContain('creator.modifier.hintThreshold');
  });

  it('passes step and limits through as numbers', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', step: 1 }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-step'), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ step: 10 }));

    fireEvent.change(screen.getByTestId('mcb-min'), { target: { value: '-60' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min: -60 }));
  });

  it('forwards presets from the editor', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', presets: [] }} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('mpe-add'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presets: [{ value: 0, label: '' }] }));
  });
});
```

Uwaga: test podpowiedzi celowo sprawdza sam klucz i18n (`creator.modifier.hintThreshold`) — klucze dopisujemy w Tasku 13, a `i18next` bez tłumaczenia zwraca klucz. Po Tasku 13 zamień to oczekiwanie na fragment realnego tekstu z `en/translation.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierConfigBuilder`
Expected: FAIL — `Cannot find module './ModifierConfigBuilder'`.

- [ ] **Step 3: Write the implementation**

Utwórz `src/components/creator/ModifierConfigBuilder.jsx`:

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModifierPresetEditor from './ModifierPresetEditor';
import {
  DEFAULT_MODIFIER_CONFIG,
  MOD_TARGET_ROLL,
  MOD_TARGET_THRESHOLD,
  MOD_TARGET_DICE_COUNT,
  MOD_TARGET_SUCCESS_THRESHOLD,
} from '../../systems/custom/modifierConfig';

// Podpowiedzi mówią wprost, co się stanie z liczbami — zamiast normalizować znak modyfikatora
// tak, żeby "+" zawsze znaczyło "łatwiej". Normalizacja jest niewykonalna spójnie: przy targecie
// "threshold" plus ułatwia rzut roll-under i utrudnia roll-over, a successType jest ustawiany per
// pole, nie tutaj (patrz D4 w spec).
const TRADITIONAL_HINTS = {
  [MOD_TARGET_ROLL]: 'creator.modifier.hintRoll',
  [MOD_TARGET_THRESHOLD]: 'creator.modifier.hintThreshold',
};
const POOL_HINTS = {
  [MOD_TARGET_DICE_COUNT]: 'creator.modifier.hintDiceCount',
  [MOD_TARGET_SUCCESS_THRESHOLD]: 'creator.modifier.hintSuccessThreshold',
};

function ModifierConfigBuilder({ value, onChange }) {
  const { t } = useTranslation();
  // Pusta konfiguracja czytana jest jako domyślna, wyłączona — kreator nie musi jej zawczasu
  // tworzyć w settings, a onChange zawsze oddaje pełny obiekt.
  const cfg = { ...DEFAULT_MODIFIER_CONFIG, ...(value || {}) };
  const up = patch => onChange({ ...cfg, ...patch });

  // Wszystkie trzy pola liczbowe chodzą po jednym drafcie. Parsowanie przy każdym znaku psuje
  // edycję na dwa sposoby: `|| 0` kasuje minus, zanim MG dopisze cyfry (min/max bywają ujemne),
  // a `|| 1` przy `step` podstawia wartość, gdy tylko wyczyścisz pole, żeby je przepisać. Draft
  // kluczowany NAZWĄ pola, nie indeksem — pola są trzy, stałe i nie zmieniają pozycji.
  const [draft, setDraft] = useState(null); // { field: 'step'|'min'|'max', raw: string } | null

  // step wraca do 1, nie do 0: input ze step === 0 nie reaguje na strzałki, i to samo 1 podstawia
  // readModifierConfig po stronie karty.
  const LIMIT_FALLBACK = { step: 1, min: 0, max: 0 };

  const limitValue = field => (draft && draft.field === field ? draft.raw : String(cfg[field]));

  const handleLimitChange = (field, raw) => {
    setDraft({ field, raw });
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) up({ [field]: parsed });
  };

  const handleLimitBlur = field => {
    if (draft && draft.field === field && Number.isNaN(parseInt(draft.raw, 10))) {
      up({ [field]: LIMIT_FALLBACK[field] });
    }
    setDraft(null);
  };

  return (
    <div className="mcb__root">
      <label className="mcb__enable">
        <input
          type="checkbox"
          data-testid="mcb-enable"
          checked={cfg.enabled}
          onChange={e => { setDraft(null); up({ enabled: e.target.checked }); }}
        />
        <span>{t('creator.modifier.enable')}</span>
      </label>

      {!cfg.enabled ? (
        <div className="mcb__disabled-hint">{t('creator.modifier.disabledHint')}</div>
      ) : (
        <>
          <div className="mcb__field">
            <label className="mcb__label" htmlFor="mcb-traditional-target">
              {t('creator.modifier.traditionalTarget')}
            </label>
            <select
              id="mcb-traditional-target"
              data-testid="mcb-traditional-target"
              className="mcb__select"
              value={cfg.traditionalTarget}
              onChange={e => up({ traditionalTarget: e.target.value })}
            >
              <option value={MOD_TARGET_ROLL}>{t('creator.modifier.targetRoll')}</option>
              <option value={MOD_TARGET_THRESHOLD}>{t('creator.modifier.targetThreshold')}</option>
            </select>
            <div className="mcb__hint" data-testid="mcb-traditional-hint">
              {t(TRADITIONAL_HINTS[cfg.traditionalTarget] || TRADITIONAL_HINTS[MOD_TARGET_ROLL])}
            </div>
          </div>

          <div className="mcb__field">
            <label className="mcb__label" htmlFor="mcb-pool-target">
              {t('creator.modifier.poolTarget')}
            </label>
            <select
              id="mcb-pool-target"
              data-testid="mcb-pool-target"
              className="mcb__select"
              value={cfg.poolTarget}
              onChange={e => up({ poolTarget: e.target.value })}
            >
              <option value={MOD_TARGET_DICE_COUNT}>{t('creator.modifier.targetDiceCount')}</option>
              <option value={MOD_TARGET_SUCCESS_THRESHOLD}>{t('creator.modifier.targetSuccessThreshold')}</option>
            </select>
            <div className="mcb__hint" data-testid="mcb-pool-hint">
              {t(POOL_HINTS[cfg.poolTarget] || POOL_HINTS[MOD_TARGET_DICE_COUNT])}
            </div>
          </div>

          <div className="mcb__limits">
            <div className="mcb__limit">
              <label className="mcb__label" htmlFor="mcb-step">{t('creator.modifier.step')}</label>
              <input id="mcb-step" data-testid="mcb-step" type="number" min={1}
                     value={limitValue('step')}
                     onChange={e => handleLimitChange('step', e.target.value)}
                     onBlur={() => handleLimitBlur('step')} />
            </div>
            <div className="mcb__limit">
              <label className="mcb__label" htmlFor="mcb-min">{t('creator.modifier.min')}</label>
              <input id="mcb-min" data-testid="mcb-min" type="number" value={limitValue('min')}
                     onChange={e => handleLimitChange('min', e.target.value)}
                     onBlur={() => handleLimitBlur('min')} />
            </div>
            <div className="mcb__limit">
              <label className="mcb__label" htmlFor="mcb-max">{t('creator.modifier.max')}</label>
              <input id="mcb-max" data-testid="mcb-max" type="number" value={limitValue('max')}
                     onChange={e => handleLimitChange('max', e.target.value)}
                     onBlur={() => handleLimitBlur('max')} />
            </div>
          </div>
          <div className="mcb__hint">{t('creator.modifier.limitsHint')}</div>

          <div className="mcb__field">
            <span className="mcb__label">{t('creator.modifier.presetsTitle')}</span>
            <ModifierPresetEditor presets={cfg.presets} onChange={presets => up({ presets })} />
          </div>
        </>
      )}
    </div>
  );
}

export default ModifierConfigBuilder;
```

- [ ] **Step 4: Dopisz CSS**

Na koniec `src/style.css`:

```css
/* --- ModifierConfigBuilder (kreator, zakładka General) --- */

.mcb__root {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mcb__enable {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: #3a2f1f;
    font-size: 0.85rem;
}

.mcb__disabled-hint,
.mcb__hint {
    font-size: 0.78rem;
    color: rgba(58, 47, 31, 0.6);
    line-height: 1.35;
}

.mcb__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mcb__label {
    font-size: 0.78rem;
    color: #7a5c42;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.mcb__select {
    padding: 5px 8px;
}

.mcb__limits {
    display: flex;
    gap: 8px;
}

.mcb__limit {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
}

.mcb__limit input {
    width: 100%;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ModifierConfigBuilder`
Expected: PASS — 7 testów zielonych.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.jsx \
        warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat(front): FEATURE-164 modifier config card for the creator"
```

---

### Task 13: Montaż w zakładce General + i18n

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:49-50` (import), `:1568-1579` (nowa karta po karcie kostek)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Modify: `warhammer-battle-helper-front/src/components/creator/ModifierConfigBuilder.test.jsx` (oczekiwanie podpowiedzi na realny tekst)

**Interfaces:**
- Consumes: `ModifierConfigBuilder` (Task 12), istniejące `updateSettings(patch)` (`TemplateBuilder.jsx:1307`) i `settings` (`:1139`)
- Produces: `settings.modifier` w zapisie szablonu (`PATCH /templates/:id` — `:1178` wysyła `settings: settingsRef.current`, więc żadna zmiana w zapisie nie jest potrzebna)

- [ ] **Step 1: Dopisz klucze i18n (en)**

W `src/locales/en/translation.json`, w obiekcie `creator.general`, dopisz dwa klucze:

```json
      "modifierTitle": "Roll modifier",
      "modifierHint": "Ask for a modifier before each roll on this card",
```

W obiekcie `creator`, dopisz nowy podobiekt `modifier`:

```json
    "modifier": {
      "enable": "Ask for a modifier before rolling",
      "disabledHint": "Off: clicking a roll rolls straight away, with no modifier.",
      "traditionalTarget": "Traditional rolls — where the modifier goes",
      "targetRoll": "To the roll result",
      "targetThreshold": "To the success threshold",
      "hintRoll": "A +20 modifier turns a roll of 48 into 68. The threshold stays where it is.",
      "hintThreshold": "A +20 modifier turns a threshold of 55 into 75; the roll stays raw. With «roll under» that makes the roll easier, with «roll over» harder.",
      "poolTarget": "Dice pools — where the modifier goes",
      "targetDiceCount": "To the number of dice",
      "targetSuccessThreshold": "To the success threshold",
      "hintDiceCount": "A +2 modifier rolls 2 more dice, a -2 modifier rolls 2 fewer. The pool never drops below one die.",
      "hintSuccessThreshold": "A +2 modifier turns a success threshold of 7 into 9. The number of dice stays the same.",
      "step": "Step",
      "min": "Min",
      "max": "Max",
      "limitsHint": "Min and max both at 0 means no limits.",
      "presetsTitle": "Quick picks",
      "presetsEmpty": "No quick picks — the prompt shows just the number field.",
      "presetAdd": "Add quick pick",
      "presetValue": "Value",
      "presetLabel": "Label",
      "presetLabelPlaceholder": "e.g. Very hard",
      "presetRemove": "Remove quick pick"
    },
```

- [ ] **Step 2: Dopisz klucze i18n (pl)**

W `src/locales/pl/translation.json`, w `creator.general`:

```json
      "modifierTitle": "Modyfikator rzutu",
      "modifierHint": "Pytaj o modyfikator przed każdym rzutem na tej karcie",
```

W `creator`:

```json
    "modifier": {
      "enable": "Pytaj o modyfikator przed rzutem",
      "disabledHint": "Wyłączone: klik w rzut wykonuje go od razu, bez modyfikatora.",
      "traditionalTarget": "Rzuty tradycyjne — gdzie idzie modyfikator",
      "targetRoll": "Do wyniku rzutu",
      "targetThreshold": "Do progu sukcesu",
      "hintRoll": "Modyfikator +20 zmienia rzut 48 na 68. Próg zostaje na swoim miejscu.",
      "hintThreshold": "Modyfikator +20 zmienia próg 55 na 75, a rzut zostaje surowy. Przy «poniżej progu» to ułatwia rzut, przy «powyżej progu» utrudnia.",
      "poolTarget": "Pula kości — gdzie idzie modyfikator",
      "targetDiceCount": "Do liczby kości",
      "targetSuccessThreshold": "Do progu sukcesu",
      "hintDiceCount": "Modyfikator +2 dorzuca 2 kości, -2 zabiera 2. Pula nigdy nie schodzi poniżej jednej kości.",
      "hintSuccessThreshold": "Modyfikator +2 zmienia próg sukcesu 7 na 9. Liczba kości zostaje ta sama.",
      "step": "Krok",
      "min": "Min",
      "max": "Maks",
      "limitsHint": "Min i maks równe 0 znaczą brak ograniczeń.",
      "presetsTitle": "Szybki wybór",
      "presetsEmpty": "Brak szybkiego wyboru — w okienku zostaje samo pole liczbowe.",
      "presetAdd": "Dodaj szybki wybór",
      "presetValue": "Wartość",
      "presetLabel": "Etykieta",
      "presetLabelPlaceholder": "np. Bardzo trudny",
      "presetRemove": "Usuń szybki wybór"
    },
```

- [ ] **Step 3: Zamontuj kartę w zakładce General**

W `src/components/creator/TemplateBuilder.jsx` dopisz import po linii 50:

```jsx
import ModifierConfigBuilder from './ModifierConfigBuilder';
```

Bezpośrednio po karcie kostek (blok `creator__settings-card` z `DiceConfigBuilder`, kończący się na linii ~1579) wstaw:

```jsx
            <div className="creator__settings-card">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.general.modifierTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.modifierHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <ModifierConfigBuilder
                  value={settings.modifier}
                  onChange={modifier => updateSettings({ modifier })}
                />
              </div>
            </div>
```

- [ ] **Step 4: Dociągnij test podpowiedzi do realnego tekstu**

W `ModifierConfigBuilder.test.jsx` zamień oczekiwanie w teście „shows a hint that names the chosen target":

```jsx
    expect(screen.getByTestId('mcb-traditional-hint').textContent).toContain('threshold of 55 into 75');
```

- [ ] **Step 5: Sprawdź spójność kluczy en/pl**

Run: `cd warhammer-battle-helper-front && node -e "
const en = require('./src/locales/en/translation.json');
const pl = require('./src/locales/pl/translation.json');
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' && v !== null ? flat(v, p + k + '.') : [p + k]);
const a = new Set(flat(en)), b = new Set(flat(pl));
const missingPl = [...a].filter(k => !b.has(k));
const missingEn = [...b].filter(k => !a.has(k));
console.log('brak w pl:', missingPl.filter(k => k.includes('modifier')));
console.log('brak w en:', missingEn.filter(k => k.includes('modifier')));
"`
Expected: `brak w pl: []` i `brak w en: []`.

- [ ] **Step 6: Run the full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS z jednym znanym wyjątkiem — `App.test.js` (axios ESM). Każdy inny fail jest regresją.

- [ ] **Step 7: Run the full backend suite**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./internal/... && go test ./internal/...`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/ \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(front): FEATURE-164 mount the modifier card in the creator and add i18n"
```

---

## Weryfikacja końcowa (ręczna, w przeglądarce)

Uruchomienie brancha pod `:3000` — patrz `docs/superpowers/` notatki o testowaniu w worktree (CORS whitelist + montowanie katalogu w kontenerze).

1. Kreator → zakładka General → nowa karta „Modyfikator rzutu": domyślnie wyłączony, pola targetów ukryte.
2. Karta z modyfikatorem **wyłączonym**: klik w rzut umiejętności wykonuje rzut od razu, log pokazuje wynik bez `(+N)`.
3. Włącz modyfikator, target tradycyjny `Do wyniku rzutu`, presety `-30 Bardzo trudny`, `-10 Trudny`, `+10 Łatwy`: klik w rzut otwiera jasne okienko z trzema chipami; klik chipa rzuca natychmiast; breakdown w logu ma modyfikator w środku (`d100-30 = 48-30 = 18`).
4. Przełącz target na `Do progu sukcesu`: ten sam rzut ma surowy breakdown (`d100 = 48`), zmieniony `vs`, a modyfikator widać osobno obok wyniku.
5. Pole w trybie `dice_pool`, target `Do liczby kości`, modyfikator +2: w logu jest o dwie kości więcej.
6. Ten sam rzut z targetem `Do progu sukcesu`: liczba kości bez zmian, zmienia się `vs` i kolorowanie kości.
7. Ustaw `min -60`, `max 60`, wpisz `999` → rzut leci z `60`.
8. Rzut broni (`weapons_table`) dziedziczy target — obrażenia zostają bez modyfikatora.
