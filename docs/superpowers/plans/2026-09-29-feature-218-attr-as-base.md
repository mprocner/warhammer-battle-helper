# FEATURE-218 — Atrybut jako wartość bazowa umiejętności — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeden przełącznik `baseFromAttr` w polu `skill_table`: kolumna bazy pokazuje wtedy aktualną wartość powiązanego atrybutu, jest nieedytowalna, a suma i każdy rzut liczą się z atrybutu + rozwinięć.

**Architecture:** Wartość bazowa jest **liczona przy odczycie, nigdy zapisywana** — `ComputeDerived` nie widzi szablonu, a zapisana wartość pochodna czerstwiałaby przy każdej zmianie atrybutu. Z tego wynika reszta: w Go istniejące `skillValue`/`skillHasValue` dostają flagę jako parametr (zamiast równoległej pary funkcji), flaga podróżuje w nazwanej strukturze `rollTarget` zamiast piątego slotu krotki, a na froncie jedna funkcja `resolveSkillValues` w `skillLayout.js` odpowiada, jakie liczby pokazuje wiersz i czy baza jest edytowalna. W kreatorze zależność między flagami staje się danymi: lista `requires`, z której wspólny `FlagSwitch` wyprowadza stan zablokowany, tooltip i kasowanie kaskadowe.

**Tech Stack:** Go 1.x + MongoDB (bson), React 18 + react-i18next, MUI, Jest + React Testing Library (przez CRA), `go test`.

## Global Constraints

- Spec: `docs/superpowers/specs/FEATURE-218.md`. Przy rozbieżności spec wygrywa.
- Gałąź: `feature-218-attr-as-base`, odbita od `feature-217-skill-display-flags`. Nie merge'ować niczego do `main` w ramach tego planu.
- Komentarze w kodzie **zawsze po angielsku**, bez wyjątków. Żaden komentarz nie odwołuje się do numeru zadania.
- Żadnych stringów wpisanych wprost w JSX — zawsze `t('klucz')`, klucze **angielskie**, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`. Tooltipy: nigdy MUI `<Tooltip>` — używamy `usePortalTooltip` z `src/components/common/PortalTooltip.jsx`.
- Kolory karty postaci: tekst `#3a2f1f`, tło inputu `#fff9f0`, ramka `#c4a882`, ramka focus / etykiety `#7a5c42`, akcent `#c9975b`, tło tabliczki read-only `#e8dcc4`.
- **`stats` nie zyskuje żadnego nowego pola.** Jeśli implementacja zaczyna pisać wartość pochodną do `stats.skills[...].base`, jest sprzeczna ze specem.
- **Dla wiersza pochodnego `stats.skills[key].current` jest nieaktualne** (nadal `base + advances`). Nic nie może mu wierzyć.
- `BaseFromAttr` ma sens tylko z `AssignAttrToSkill` **i** `HasAdvances`. Kreator tego pilnuje, ale renderer i roller sprawdzają ponownie — szablon edytowany ręcznie może nieść flagę bez warunków.
- Podstawiamy `Current` atrybutu (`attrLookup` zwraca `Current`), nigdy jego `Base`.
- Wiersz bez wybranego atrybutu przy włączonej fladze: baza `0`, nadal nieedytowalna.
- Frontend testy: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false` (`--testPathPattern=<nazwa>` dla jednego pliku). Gołe `npx jest` **nie działa** — konfiguracją zarządza CRA.
- **Znany baseline fail:** `App.test.js` (axios ESM). To nie regresja — nie naprawiać, nie liczyć jako porażkę.
- Backend testy: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/...`
- Wyjście testów musi być czyste — żadnego `console.error`, żadnych ostrzeżeń `act()`. Klik, który zmienia stan komponentu, robimy przez `fireEvent`, nie surowym `.click()`.
- jsdom nie liczy layoutu: `getBoundingClientRect` zwraca zera. Żaden test nie może zależeć od geometrii.

---

## Struktura plików

| Plik | Odpowiedzialność | Zadanie |
|---|---|---|
| `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` | `FieldDef.BaseFromAttr` | 1 |
| `warhammer-battle-helper-backend/internal/systems/custom/roller.go` | `skillValue`, `skillHasValue` + przeciągnięcie flagi przez cztery funkcje formuły | 1 |
| `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` | `rollTarget`, `resolveRollConfig`, `RollWithTemplate` | 2 |
| `warhammer-battle-helper-backend/internal/systems/custom/weapon.go` | `resolveWeaponSkill` przenosi flagę do rzutu na trafienie | 2 |
| `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`, `weapon_test.go`, `nested_sections_test.go` | testy + przepisane call-site'y | 1, 2 |
| `warhammer-battle-helper-front/src/systems/custom/skillLayout.js` | **`resolveSkillValues`** — jedno miejsce, które składa liczby wiersza | 3 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | render wiersza konsumuje `resolveSkillValues`, przestaje liczyć | 3 |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` | `SKILL_FLAG_META`, `FlagSwitch`, `clearDependentFlags` | 4, 5 |
| `warhammer-battle-helper-front/src/style.css` | `.custom-sheet__skill-val-input--derived` | 3 |
| `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` | 3 nowe klucze | 5 |

Nowych plików nie ma. Cała nowa logika ląduje w dwóch modułach, które już istnieją po to, żeby ją trzymać: `skillLayout.js` (czysta arytmetyka wiersza) i `roller.go` (składanie wartości do rzutu).

---

### Task 1: Go — flaga w modelu i jedna definicja wartości umiejętności

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (blok `FieldDef`, obok `AssignAttrToSkill`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:15`, `:22`, `:54`, `:58`, `:102`, `:180`, `:223`, `:305`, `:314`, `:369`, `:467`, `:484`, `:518`, `:532`
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`

**Interfaces:**
- Consumes: nic — pierwsze zadanie.
- Produces (używane w zadaniu 2):
  - `models.FieldDef.BaseFromAttr bool` (bson/json `baseFromAttr,omitempty`)
  - `skillValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) int`
  - `skillHasValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) bool`
  - `(p *Plugin) rollFromFormula(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, baseFromAttr bool, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error)`

- [ ] **Step 1: Napisz failujące testy**

Dopisz na końcu `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`:

```go
// ---------------------------------------------------------------------------
// FEATURE-218 — a skill whose base is its linked attribute
// ---------------------------------------------------------------------------

// baseFromAttrStats gives the character an attribute worth 40 (base 35 + advances 5, so Current is
// what distinguishes a correct read) and a skill with 5 advances and NO stored base. The derived
// total must be 45; anything that reads the stored base reads 0 and lands on 5.
func baseFromAttrStats() *Stats {
	return &Stats{
		Attributes: map[string]AttrValue{"agi": {Base: 35, Advances: 5, Current: 40}},
		Skills:     map[string]AttrValue{"skills.opt_stealth": {Base: 0, Advances: 5, Current: 5}},
	}
}

func TestSkillValue_BaseFromAttr(t *testing.T) {
	stats := baseFromAttrStats()

	if got := skillValue(stats, "skills.opt_stealth", "agi", true); got != 45 {
		t.Errorf("skillValue with baseFromAttr = %d, want 45 (attribute 40 + advances 5)", got)
	}
	// Flag off: the stored base wins, exactly as before this feature.
	if got := skillValue(stats, "skills.opt_stealth", "agi", false); got != 5 {
		t.Errorf("skillValue without baseFromAttr = %d, want 5", got)
	}
	// Flag on but no attribute linked: attrLookup reads 0, so only the advances remain.
	if got := skillValue(stats, "skills.opt_stealth", "", true); got != 5 {
		t.Errorf("skillValue with baseFromAttr and no attribute = %d, want 5", got)
	}
}

func TestSkillHasValue_BaseFromAttr(t *testing.T) {
	stats := &Stats{
		Attributes: map[string]AttrValue{"agi": {Current: 0}},
		Skills:     map[string]AttrValue{"skills.opt_stealth": {}},
	}

	// A blank skill whose attribute EXISTS has a value: 0 + 0 is a real 0, the same reasoning the
	// function already applies to a computed zero.
	if !skillHasValue(stats, "skills.opt_stealth", "agi", true) {
		t.Error("skillHasValue with baseFromAttr and an existing attribute = false, want true")
	}
	// No attribute linked, nothing stored: still nothing to test against.
	if skillHasValue(stats, "skills.opt_stealth", "", true) {
		t.Error("skillHasValue with baseFromAttr and no attribute = true, want false")
	}
	if skillHasValue(stats, "skills.opt_stealth", "agi", false) {
		t.Error("skillHasValue without baseFromAttr on a blank skill = true, want false")
	}
}

// The threshold fallback is the path a GM hits without writing any formula block at all: no
// explicit threshold, so the target comes from the skill — which must now be the derived total.
func TestRollFromFormula_ThresholdUsesDerivedBase(t *testing.T) {
	p := newTestPlugin(41) // d100 -> 42
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
	}
	template := &models.SystemTemplate{}

	res, err := p.rollFromFormula(baseFromAttrStats(), template, "skills.opt_stealth", "agi", true, cfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula: %v", err)
	}
	if res.Target != 45 {
		t.Errorf("target = %d, want 45 (attribute 40 + advances 5)", res.Target)
	}
	if res.Outcome != "regular_success" {
		t.Errorf("outcome = %q, want regular_success (42 below 45)", res.Outcome)
	}
}

// The "skill" formula block is the other reader: a GM who writes the total into the formula must
// get the same number the sheet shows.
func TestEvalFormula_SkillBlockUsesDerivedBase(t *testing.T) {
	p := newTestPlugin()
	res, _, _, valueStr, err := p.evalFormula(
		[]models.FormulaBlock{{Type: "skill"}}, baseFromAttrStats(), "skills.opt_stealth", "agi", true,
	)
	if err != nil {
		t.Fatalf("evalFormula: %v", err)
	}
	if res != 45 {
		t.Errorf("skill block = %d, want 45", res)
	}
	if valueStr != "45" {
		t.Errorf("valueStr = %q, want \"45\"", valueStr)
	}
}

// dice_skill_attr sizes a die by attribute + skill. With a derived base the attribute would
// otherwise be counted once and dropped from the skill half.
func TestEvalFormula_DiceSkillAttrUsesDerivedBase(t *testing.T) {
	p := newTestPlugin(0) // d(40+45) -> 1
	_, diceType, _, _, err := p.evalFormula(
		[]models.FormulaBlock{{Type: "dice_skill_attr"}}, baseFromAttrStats(), "skills.opt_stealth", "agi", true,
	)
	if err != nil {
		t.Fatalf("evalFormula: %v", err)
	}
	if diceType != 85 {
		t.Errorf("diceType = %d, want 85 (attribute 40 + derived skill 45)", diceType)
	}
}
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'BaseFromAttr|DerivedBase' 2>&1 | head -20`

Expected: kompilacja pada — `too many arguments in call to skillValue` (funkcja ma dziś dwa parametry) oraz `too many arguments in call to p.evalFormula` / `p.rollFromFormula`.

- [ ] **Step 3: Dodaj flagę do modelu**

W `warhammer-battle-helper-backend/internal/models/SystemTemplate.go`, w bloku `FieldDef` bezpośrednio pod `AssignAttrToSkill`:

```go
	AssignAttrToSkill  bool           `bson:"assignAttrToSkill,omitempty" json:"assignAttrToSkill,omitempty"`
	// BaseFromAttr replaces a skill's base value with its linked attribute's current value, so the
	// base is derived at read time and never stored. Meaningless without both AssignAttrToSkill (the
	// row needs an attribute to read) and HasAdvances (with no advances column the base IS the total,
	// and a wholly derived total is just the attribute under another name). The creator enforces both
	// as a precondition; the renderer and the roller re-check them, because a hand-edited template can
	// carry the flag without them.
	BaseFromAttr bool `bson:"baseFromAttr,omitempty" json:"baseFromAttr,omitempty"`
```

(Zachowaj istniejący tag `AssignAttrToSkill` dokładnie taki, jaki jest — powyżej pokazany tylko jako punkt zaczepienia.)

- [ ] **Step 4: Rozszerz `skillValue` i `skillHasValue`**

W `warhammer-battle-helper-backend/internal/systems/custom/roller.go` zamień obie funkcje (dziś linie 513-535) na:

```go
// skillValue returns the character's effective value for the given skill key: advances on top of a
// base that is either the character's own stored number or, when the field derives it
// (BaseFromAttr), the linked attribute's current value. Nothing persists the derived base —
// ComputeDerived cannot see the template — so every reader must compose it here.
//
// The front end composes the same number in resolveSkillValues (systems/custom/skillLayout.js).
// Change one and you must change the other, or the log and the sheet disagree about one skill.
func skillValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) int {
	v := stats.Skills[key]
	if baseFromAttr {
		base, _ := attrLookup(stats, linkedAttr)
		return base + v.Advances
	}
	return v.Base + v.Advances
}

// skillHasValue reports whether the character has any data for this skill. A skill whose base and
// advances are both zero is indistinguishable from one the character never touched, so it keeps the
// old fall-back-to-the-attribute behaviour; a skill whose parts are non-zero uses its own total,
// even when that total is zero or negative (base 30 with advances -30 is a real 0, not a blank).
// Current is deliberately not consulted: base + advances is the whole truth about a skill's value
// (see skillValue), so a Current that disagrees can only be stale.
//
// With BaseFromAttr the question becomes whether the attribute exists at all: an attribute present
// and reading 0 gives a real threshold of 0 + advances, the same way a computed zero does above.
func skillHasValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) bool {
	if baseFromAttr {
		_, ok := attrLookup(stats, linkedAttr)
		return ok
	}
	v := stats.Skills[key]
	return v.Base != 0 || v.Advances != 0
}
```

- [ ] **Step 5: Przeciągnij flagę przez cztery funkcje formuły**

W tym samym pliku dodaj parametr `baseFromAttr bool` bezpośrednio po `linkedAttr string` w sygnaturach:

```go
func (p *Plugin) rollFromFormula(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, baseFromAttr bool, cfg *models.RollConfig, modifier int) (*gsys.RollResult, error)
func (p *Plugin) evalFormula(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, baseFromAttr bool) (result, diceType int, labelStr, valueStr string, err error)
func (p *Plugin) rollFromFormulaDicePool(stats *Stats, template *models.SystemTemplate, skillKey, linkedAttr string, baseFromAttr bool, cfg *models.RollConfig, modTarget string, modValue int) (*gsys.RollResult, error)
func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, baseFromAttr bool, extraDice int) (parts []gsys.PoolFormulaPart, diceType int, err error)
```

…i przekaż go w każdym wywołaniu wewnętrznym: `rollFromFormula` → `rollFromFormulaDicePool` (linia 19) i → `evalFormula` (linia 22); `rollFromFormulaDicePool` → `evalFormulaDicePool` (linia 314).

Następnie dopisz `linkedAttr, baseFromAttr` do **każdego** wywołania `skillValue` / `skillHasValue` (linie 54, 58, 180, 223, 467, 484). Przykład linii 54-58 po zmianie:

```go
	attrValue, attrOK := attrLookup(stats, linkedAttr)
	sv := skillValue(stats, skillKey, linkedAttr, baseFromAttr)
	threshold := evalThreshold(cfg.Threshold)
	hasThreshold := threshold != 0
	if threshold == 0 {
		if skillHasValue(stats, skillKey, linkedAttr, baseFromAttr) {
```

- [ ] **Step 6: Napraw istniejące call-site'y w testach**

`go build` przejdzie, ale testy nie skompilują się, dopóki stare wywołania mają starą arność. Przejdź po nich i dopisz brakujące argumenty:

Run: `cd warhammer-battle-helper-backend && go vet ./internal/systems/custom/ 2>&1 | grep -E "skillValue|skillHasValue|evalFormula|rollFromFormula" | head -30`

Dla każdego trafienia w plikach `*_test.go` dopisz `linkedAttr` (użyj `""`, gdy test nie bada atrybutu) i `false` jako `baseFromAttr` — testy pisane przed tą funkcją opisują zachowanie z wyłączoną flagą, więc `false` zachowuje ich intencję. Nie zmieniaj żadnej asercji.

- [ ] **Step 7: Uruchom cały pakiet**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/...`

Expected: `ok battle-helper/internal/systems/custom`, wszystkie testy PASS (łącznie z pięcioma nowymi).

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git commit -m "feat: FEATURE-218 compose a skill's value from its attribute when the field says so"
```

---

### Task 2: Go — flaga dojeżdża do rzutu (`rollTarget` + broń)

Po zadaniu 1 `skillValue` umie użyć flagi, ale nikt jej jeszcze nie podaje: `RollWithTemplate` woła `rollFromFormula` z `false`. To zadanie doprowadza flagę z szablonu do rzutu — również dla rzutu na trafienie bronią, który idzie przez tę samą formułę z umiejętnością wybraną w kolumnie.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:122-141` (`RollWithTemplate`), `:188-241` (`resolveRollConfig`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/weapon.go:36`, `:69-89` (`resolveWeaponSkill`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`, `weapon_test.go`
- Modify (call-site'y): `warhammer-battle-helper-backend/internal/systems/custom/nested_sections_test.go:54`

**Interfaces:**
- Consumes z zadania 1: `models.FieldDef.BaseFromAttr`, `skillValue(stats, key, linkedAttr, baseFromAttr)`, `rollFromFormula(..., linkedAttr, baseFromAttr, cfg, modifier)`.
- Produces:
  - `type rollTarget struct { cfg *models.RollConfig; linkedAttr string; baseFromAttr bool; fieldType string }`
  - `resolveRollConfig(template *models.SystemTemplate, stats *Stats, skillKey string) (rollTarget, error)`
  - `resolveWeaponSkill(template *models.SystemTemplate, stats *Stats, field *models.FieldDef, row WeaponRow) (skillKey string, linkedAttr string, baseFromAttr bool)`

- [ ] **Step 1: Napisz failujące testy**

Dopisz na końcu `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`:

```go
// resolveRollConfig must carry the field's BaseFromAttr to the roller; a skill_table that derives
// its base is otherwise rolled on advances alone.
func TestResolveRollConfig_CarriesBaseFromAttr(t *testing.T) {
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_table", Key: "skills", Rollable: true, RollConfig: cfg,
				AssignAttrToSkill: true, HasAdvances: true, BaseFromAttr: true,
				Skills:            []models.SkillOption{{ID: "opt_stealth", Label: "Stealth", Attr: "agi"}},
			}},
		}},
	}

	target, err := resolveRollConfig(template, &Stats{}, "skills.opt_stealth")
	if err != nil {
		t.Fatalf("resolveRollConfig: %v", err)
	}
	if !target.baseFromAttr {
		t.Error("baseFromAttr = false, want true")
	}
	if target.linkedAttr != "agi" || target.fieldType != "skill_table" || target.cfg != cfg {
		t.Errorf("got attr=%q type=%q cfg=%v, want agi/skill_table/field cfg", target.linkedAttr, target.fieldType, target.cfg)
	}
}

// The flag is meaningless without its two preconditions, and a template can carry it without them
// (hand-edited document, or a creator bug). The roller must not derive a base in that case, or a
// field with no advances column would silently roll on the attribute instead of the stored value.
func TestResolveRollConfig_BaseFromAttrNeedsItsPreconditions(t *testing.T) {
	build := func(assign, advances bool) *models.SystemTemplate {
		return &models.SystemTemplate{
			Sections: []models.SectionDef{{
				Fields: []models.FieldDef{{
					Type: "skill_table", Key: "skills", Rollable: true,
					RollConfig:        &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}},
					AssignAttrToSkill: assign, HasAdvances: advances, BaseFromAttr: true,
					Skills:            []models.SkillOption{{ID: "opt_stealth", Attr: "agi"}},
				}},
			}},
		}
	}

	for _, tc := range []struct {
		name             string
		assign, advances bool
	}{
		{"no attribute assignment", false, true},
		{"no advances column", true, false},
	} {
		target, err := resolveRollConfig(build(tc.assign, tc.advances), &Stats{}, "skills.opt_stealth")
		if err != nil {
			t.Fatalf("%s: resolveRollConfig: %v", tc.name, err)
		}
		if target.baseFromAttr {
			t.Errorf("%s: baseFromAttr = true, want false", tc.name)
		}
	}
}

// End to end through the public entry point: the same character and template a GM would have.
func TestRollWithTemplate_DerivedBaseReachesTheThreshold(t *testing.T) {
	p := newTestPlugin(41) // d100 -> 42
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_table", Key: "skills", Rollable: true,
				RollConfig:        &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold"},
				AssignAttrToSkill: true, HasAdvances: true, BaseFromAttr: true,
				Skills:            []models.SkillOption{{ID: "opt_stealth", Label: "Stealth", Attr: "agi"}},
			}},
		}},
	}
	raw, err := bson.Marshal(baseFromAttrStats())
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	res, err := p.RollWithTemplate(raw, template, "skills.opt_stealth", 0)
	if err != nil {
		t.Fatalf("RollWithTemplate: %v", err)
	}
	if res.Target != 45 {
		t.Errorf("target = %d, want 45 (attribute 40 + advances 5)", res.Target)
	}
}
```

Dopisz na końcu `warhammer-battle-helper-backend/internal/systems/custom/weapon_test.go`:

```go
// A weapon's attack roll goes through the same formula with the skill picked in its skill column.
// If resolveWeaponSkill drops BaseFromAttr, that attack silently rolls on advances alone.
func TestRollWeapon_AttackUsesDerivedSkillBase(t *testing.T) {
	p := newTestPlugin(41) // d100 -> 42
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{
				{
					Type: "skill_table", Key: "skills", Rollable: true,
					RollConfig:        &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold"},
					AssignAttrToSkill: true, HasAdvances: true, BaseFromAttr: true,
					Skills:            []models.SkillOption{{ID: "opt_stealth", Label: "Stealth", Attr: "agi"}},
				},
				{
					Type: "weapons_table", Key: "weapons", Rollable: true,
					RollConfig: &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold"},
					Columns:    []models.WeaponColumn{{Key: "skill", Label: "Skill", Type: "select", OptionsFromSkills: true}},
				},
			},
		}},
	}
	stats := baseFromAttrStats()
	stats.Weapons = map[string][]WeaponRow{"weapons": {{ID: "row1", Cells: map[string]string{"skill": "skills.opt_stealth"}}}}
	raw, err := bson.Marshal(stats)
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "row1", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate: %v", err)
	}
	if res.Target != 45 {
		t.Errorf("attack target = %d, want 45 (attribute 40 + advances 5)", res.Target)
	}
}
```

Uwaga do wykonawcy: nazwa metody rzutu bronią w tym pakiecie może brzmieć inaczej niż `RollWeaponWithTemplate`. Sprawdź ją raz — `grep -n "func (p \*Plugin) RollWeapon" warhammer-battle-helper-backend/internal/systems/custom/weapon.go` — i użyj faktycznej sygnatury wraz z jej listą argumentów. Jeśli różni się od powyższej, dostosuj wywołanie, nie asercję.

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'CarriesBaseFromAttr|NeedsItsPreconditions|DerivedBaseReaches|AttackUsesDerived' 2>&1 | head -20`

Expected: kompilacja pada na `target.baseFromAttr` — `resolveRollConfig` zwraca dziś cztery wartości, nie strukturę.

- [ ] **Step 3: Wprowadź `rollTarget`**

W `warhammer-battle-helper-backend/internal/systems/custom/plugin.go`, nad `resolveRollConfig`:

```go
// rollTarget is what a skill key resolves to: the config to roll, the attribute the formula's
// linked-attribute blocks read, whether the skill's base is derived from that attribute, and the
// field type the log labels with. A struct rather than a four-value return because the callers that
// want one piece of it would otherwise spell three blanks (see resolveWeaponSkill).
type rollTarget struct {
	cfg          *models.RollConfig
	linkedAttr   string
	baseFromAttr bool
	fieldType    string
}
```

Zmień sygnaturę na `func resolveRollConfig(template *models.SystemTemplate, stats *Stats, skillKey string) (rollTarget, error)` i przepisz każdy `return` w jej ciele na postać strukturalną. Gałąź `skill_table` (dziś linie 220-241) kończy się tak:

```go
				// The flag only means anything with both preconditions; a hand-edited template can
				// carry it without them, and deriving a base for a field with no advances column
				// would replace the player's stored value with the attribute behind their back.
				derived := field.BaseFromAttr && field.AssignAttrToSkill && field.HasAdvances
				return rollTarget{cfg: field.RollConfig, linkedAttr: linkedAttr, baseFromAttr: derived, fieldType: "skill_table"}, nil
```

Pozostałe gałęzie (`skill_tree`, jej fallback dla węzłów gracza, i gałąź ogólna `field.Key == skillKey`) zwracają `baseFromAttr: false` — flaga istnieje tylko dla tabel. Błędna ścieżka na końcu funkcji: `return rollTarget{}, fmt.Errorf(...)`.

- [ ] **Step 4: Przepisz `RollWithTemplate`**

W `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:128-141`:

```go
	target, err := resolveRollConfig(template, stats, skillKey)
	if err != nil {
		return nil, err
	}

	// An attr field rolls against itself: its own key IS the linked attribute.
	if target.fieldType == "attr" {
		target.linkedAttr = skillKey
	}

	if len(target.cfg.Formula) == 0 {
		return nil, fmt.Errorf("custom: field %q has no roll formula", skillKey)
	}
	return p.rollFromFormula(stats, template, skillKey, target.linkedAttr, target.baseFromAttr, target.cfg, modifier)
```

- [ ] **Step 5: Przepisz ścieżkę broni**

W `warhammer-battle-helper-backend/internal/systems/custom/weapon.go` zmień `resolveWeaponSkill` (linia 69) tak, by zwracała trzy wartości, i przepisz jej wnętrze (dziś linie 78-89):

Sygnatura zmienia się na trzy wartości zwracane; ciało od linii 70 do miejsca, w którym ustalane
jest `skillKey`, zostaje **dosłownie bez zmian** — dotykasz wyłącznie fragmentu od `linkedAttr := ""`
do `return`:

```go
func resolveWeaponSkill(template *models.SystemTemplate, stats *Stats, field *models.FieldDef, row WeaponRow) (string, string, bool) {
	linkedAttr := ""
	if field.RollConfig != nil {
		linkedAttr = field.RollConfig.LinkedAttr
	}
	baseFromAttr := false
	if skillKey != "" {
		// The weapon rolls the chosen skill, so it inherits that skill's attribute AND whether that
		// skill derives its base from it — otherwise the attack would roll on advances alone.
		if target, err := resolveRollConfig(template, stats, skillKey); err == nil {
			if target.linkedAttr != "" {
				linkedAttr = target.linkedAttr
			}
			baseFromAttr = target.baseFromAttr
		}
	}
	return skillKey, linkedAttr, baseFromAttr
}
```

I w miejscu wywołania (dziś linia 36):

```go
	skillKey, linkedAttr, baseFromAttr := resolveWeaponSkill(template, stats, field, row)

	// Attack roll reuses the skill-roll formula evaluator; the "skill" block resolves to
	// skillValue(stats, skillKey, linkedAttr, baseFromAttr) — i.e. the weapon's chosen skill.
	atk, err := p.rollFromFormula(stats, template, skillKey, linkedAttr, baseFromAttr, field.RollConfig, modifier)
```

Jeśli `weapon.go` woła `rollFromFormula` jeszcze raz dla obrażeń, przekaż tam te same argumenty.

- [ ] **Step 6: Napraw pozostałe call-site'y `resolveRollConfig`**

Run: `cd warhammer-battle-helper-backend && go vet ./internal/systems/custom/ 2>&1 | grep resolveRollConfig`

Expected: trafienia w `roller_test.go` (linie ~1221, 1245, 1548, 1574) i `nested_sections_test.go:54`. Przepisz każde na odczyt ze struktury, np.:

```go
	target, err := resolveRollConfig(template, &Stats{}, "weapons.melee")
	if err != nil {
		t.Fatalf("resolveRollConfig() error: %v", err)
	}
	if target.cfg != cfg || target.linkedAttr != "str" || target.fieldType != "skill_tree" {
		t.Errorf("got cfg=%v attr=%q type=%q, want field cfg/str/skill_tree", target.cfg, target.linkedAttr, target.fieldType)
	}
```

Nie zmieniaj tego, co asercje sprawdzają — tylko sposób dostania się do wartości.

- [ ] **Step 7: Uruchom cały backend**

Run: `cd warhammer-battle-helper-backend && go test ./...`

Expected: wszystkie pakiety `ok` albo `no test files`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/plugin.go \
        warhammer-battle-helper-backend/internal/systems/custom/weapon.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go \
        warhammer-battle-helper-backend/internal/systems/custom/weapon_test.go \
        warhammer-battle-helper-backend/internal/systems/custom/nested_sections_test.go
git commit -m "feat: FEATURE-218 carry the derived-base flag from the template to every roll"
```

---

### Task 3: Front — `resolveSkillValues` i wiersz, który przestaje liczyć

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/skillLayout.js`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'skill_table'`, funkcja `renderRow`)
- Modify: `warhammer-battle-helper-front/src/style.css` (obok `.custom-sheet__skill-val-input--base`)
- Test: `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`

**Interfaces:**
- Consumes z zadania 1: znaczenie flagi `baseFromAttr` i zasada „`Current` atrybutu, nie `Base`".
- Produces (używane w zadaniu 4 i 5 tylko pojęciowo — kod ich nie importuje):
  - `resolveSkillValues(field, row, skills, attributes) → { base, advances, total, baseReadOnly }`
  - klasa CSS `custom-sheet__skill-val-input--derived`

- [ ] **Step 1: Napisz failujący test czystej funkcji**

Dopisz na końcu `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js` (i dodaj `resolveSkillValues` do importu z `./skillLayout`):

```js
describe('resolveSkillValues', () => {
  const derivedField = (over = {}) => ({
    key: 'fld_skills',
    type: 'skill_table',
    hasAdvances: true,
    assignAttrToSkill: true,
    baseFromAttr: true,
    ...over,
  });
  const row = (over = {}) => ({ key: 'fld_skills.opt_stealth', label: 'Skradanie', attr: 'attr_ag', ...over });
  // `current` is deliberately wrong (it is what the database really holds for a derived row:
  // base + advances = 0 + 5). Nothing may read it.
  const skills = { 'fld_skills.opt_stealth': { base: 0, advances: 5, current: 5 } };
  const attributes = { attr_ag: { base: 35, advances: 5, current: 40 } };

  it('takes the base from the attribute and sums the total over it', () => {
    expect(resolveSkillValues(derivedField(), row(), skills, attributes))
      .toEqual({ base: 40, advances: 5, total: 45, baseReadOnly: true });
  });

  it('ignores the stored current, which is stale for a derived row', () => {
    const { total } = resolveSkillValues(derivedField(), row(), skills, attributes);
    expect(total).not.toBe(5);
  });

  it('shows 0 and stays read-only when the row has no attribute', () => {
    expect(resolveSkillValues(derivedField(), row({ attr: '' }), skills, attributes))
      .toEqual({ base: 0, advances: 5, total: 5, baseReadOnly: true });
  });

  it('falls back to the stored base when the field does not derive it', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 5, current: 35 } };
    expect(resolveSkillValues(derivedField({ baseFromAttr: false }), row(), stored, attributes))
      .toEqual({ base: 30, advances: 5, total: 35, baseReadOnly: false });
  });

  it('refuses to derive without the advances column, however the template is flagged', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 0, current: 30 } };
    expect(resolveSkillValues(derivedField({ hasAdvances: false }), row(), stored, attributes))
      .toEqual({ base: 30, advances: 0, total: 30, baseReadOnly: false });
  });

  it('refuses to derive without attribute assignment', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 5, current: 35 } };
    expect(resolveSkillValues(derivedField({ assignAttrToSkill: false }), row(), stored, attributes))
      .toEqual({ base: 30, advances: 5, total: 35, baseReadOnly: false });
  });

  it('trusts a stored current for a non-derived row, as the sheet always has', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 5, current: 99 } };
    expect(resolveSkillValues(derivedField({ baseFromAttr: false }), row(), stored, attributes).total).toBe(99);
  });

  it('treats a skill with no stored entry as all zeros', () => {
    expect(resolveSkillValues(derivedField({ baseFromAttr: false }), row(), {}, {}))
      .toEqual({ base: 0, advances: 0, total: 0, baseReadOnly: false });
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`

Expected: FAIL — `resolveSkillValues is not a function`.

- [ ] **Step 3: Napisz `resolveSkillValues`**

Dopisz na końcu `warhammer-battle-helper-front/src/systems/custom/skillLayout.js`:

```js
// resolveSkillValues answers "what numbers does this row show, and is its base editable". It is the
// one place that knows a derived row's stored `current` is stale: with baseFromAttr the base comes
// from the attribute at read time and nothing ever writes it back, so `current` in stats still holds
// base + advances — 0 + advances — and believing it would show the advances alone as the total.
//
// Mirrors skillValue in internal/systems/custom/roller.go: change one and you must change the other,
// or the roll log and the sheet disagree about the same skill.
//
// baseReadOnly travels with the numbers rather than being recomputed by the caller, because it
// answers the same question as `base` — where the value came from — and a second copy of that
// condition could drift from this one.
export function resolveSkillValues(field, row, skills = {}, attributes = {}) {
  const sv = skills[row.key] || {};
  const advances = sv.advances ?? 0;
  // The flag is meaningless without both preconditions, and a hand-edited template can carry it
  // without them. The creator enforces them; this is the second line of defence.
  const derived = !!field.baseFromAttr && !!field.assignAttrToSkill && !!field.hasAdvances;

  if (derived) {
    const base = (row.attr && attributes[row.attr]?.current) || 0;
    return { base, advances, total: base + advances, baseReadOnly: true };
  }

  const base = sv.base ?? 0;
  return { base, advances, total: sv.current ?? base + advances, baseReadOnly: false };
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`

Expected: PASS, 35 testów.

- [ ] **Step 5: Napisz failujący test renderu**

Dopisz na końcu `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`:

```jsx
describe('CustomSheetBody skill_table — attribute as the base value', () => {
  const derivedSections = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [
      { key: 'attr_ag', type: 'attr', label: 'Zręczność', abbr: 'Zr' },
      {
        key: 'fld_skills',
        type: 'skill_table',
        label: 'Umiejętności',
        hasAdvances: true,
        assignAttrToSkill: true,
        baseFromAttr: true,
        skills: [
          { id: 'opt_stealth', label: 'Skradanie', attr: 'attr_ag' },
          { id: 'opt_lore', label: 'Alchemia' },
        ],
        ...over,
      },
    ],
  }]);

  // `current` on the skill is deliberately stale, exactly as the database holds it for a derived row.
  const values = {
    attributes: { attr_ag: { base: 35, advances: 5, current: 40 } },
    skills: { 'fld_skills.opt_stealth': { base: 0, advances: 5, current: 5 } },
  };

  const baseInputs = (container) =>
    [...container.querySelectorAll('.custom-sheet__skill-val-input--base')];

  it('shows the attribute in the base column and refuses edits there', () => {
    const { container } = render(
      <CustomSheetBody sections={derivedSections()} values={values} onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }} />
    );

    const [stealthBase] = baseInputs(container);
    expect(stealthBase.value).toBe('40');
    expect(stealthBase.readOnly).toBe(true);
    expect(stealthBase).toHaveClass('custom-sheet__skill-val-input--derived');
  });

  it('totals the attribute plus advances, not the stale stored current', () => {
    const { container } = render(
      <CustomSheetBody sections={derivedSections()} values={values} onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }} />
    );

    const totals = [...container.querySelectorAll('.custom-sheet__skill-val-total')].map(e => e.textContent);
    expect(totals[0]).toBe('45');
  });

  it('shows 0 for a row with no attribute, still read-only', () => {
    const { container } = render(
      <CustomSheetBody sections={derivedSections()} values={values} onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }} />
    );

    const loreBase = baseInputs(container)[1];
    expect(loreBase.value).toBe('0');
    expect(loreBase.readOnly).toBe(true);
  });

  it('leaves the base editable when the template flags derivation without an advances column', () => {
    const { container } = render(
      <CustomSheetBody
        sections={derivedSections({ hasAdvances: false })}
        values={values}
        onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }}
      />
    );

    const input = container.querySelector('.custom-sheet__skill-val-input');
    expect(input.readOnly).toBe(false);
    expect(input).not.toHaveClass('custom-sheet__skill-val-input--derived');
  });
});
```

- [ ] **Step 6: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTable`

Expected: FAIL — `expect(stealthBase.value).toBe('40')` dostaje `''` (wiersz pokazuje zapisaną bazę, czyli 0, a przy `hasAdvances` puste zero renderuje się jako pusty string).

- [ ] **Step 7: Przepnij render wiersza na `resolveSkillValues`**

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` dodaj `resolveSkillValues` do importu z `./skillLayout`. W `renderRow` (wewnątrz `case 'skill_table'`) zamień cztery linie liczące wartości:

```js
          const sv = skills[row.key] || {};
          const base = sv.base ?? 0;
          const adv = sv.advances ?? 0;
          const total = sv.current ?? (base + adv);
```

na:

```js
          const { base, advances: adv, total, baseReadOnly } = resolveSkillValues(field, row, skills, attrs);
```

Input bazy dostaje klasę i `readOnly`:

```jsx
              <input
                type="number"
                className={`custom-sheet__skill-val-input${hasAdv ? ' custom-sheet__skill-val-input--base' : ''}${baseReadOnly ? ' custom-sheet__skill-val-input--derived' : ''}`}
                value={baseReadOnly ? base : (hasAdv ? (base || '') : base)}
                onChange={onChange && !baseReadOnly ? e => onChange.skill(row.key, e.target.value) : undefined}
                readOnly={readOnly || baseReadOnly}
                min={0}
              />
```

Zwróć uwagę na `value`: wiersz **pochodny** pokazuje liczbę zawsze, także zero. Zwijanie zera do
pustego pola (`base || ''`) istnieje dlatego, że w polu edytowalnym puste znaczy „nie wpisano" —
tabliczka read-only nie ma tej dwuznaczności, a puste pole na niej wyglądałoby na błąd odczytu
atrybutu, nie na atrybut o wartości 0.

- [ ] **Step 8: Uruchom testy renderu**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTable`

Expected: PASS, cztery nowe testy. Test „shows 0 for a row with no attribute" przechodzi dzięki
gałęzi `baseReadOnly ? base : …` ze kroku 7 — bez niej dostałby `''` zamiast `'0'`.

- [ ] **Step 9: Dodaj styl tabliczki read-only**

W `warhammer-battle-helper-front/src/style.css`, bezpośrednio po regule `.custom-sheet__skill-val-input--base:focus`:

```css
/* A derived base is not editable, so it must not look editable: same engraved plate as the total
   column, which is the sheet's existing vocabulary for "computed, hands off". */
.custom-sheet__skill-val-input--derived {
    background: #e8dcc4;
    border: 1px solid #c9975b;
    box-shadow: inset 0 1px 2px rgba(122, 92, 66, 0.35);
    font-weight: 700;
    cursor: default;
}

.custom-sheet__skill-val-input--derived:focus {
    outline: none;
    border-color: #c9975b;
}
```

- [ ] **Step 10: Uruchom cały front**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`

Expected: wszystko PASS poza `App.test.js`. Jeśli padną snapshoty w `CustomSheetBody.domShape.test.jsx`, **zbadaj, zanim zregenerujesz**: żaden fixture w tym pliku nie ustawia `baseFromAttr`, więc markup powinien być bajtowo identyczny. Zmiana snapshotu oznaczałaby, że przepięcie na `resolveSkillValues` zmieniło coś dla wiersza niepochodnego. Zgłoś, co się różni.

- [ ] **Step 11: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/skillLayout.js \
        warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-218 derive a skill row's base from its attribute on the sheet"
```

---

### Task 4: Kreator — zależność jako dane (`FlagSwitch` + `clearDependentFlags`)

To zadanie nie dodaje jeszcze nowego przełącznika. Uogólnia to, co FEATURE-217 zbudowała doraźnie, żeby zadanie 5 było jedną linią w tabeli plus jedno wywołanie komponentu. Po tym zadaniu zachowanie kreatora jest **niezmienione** — cztery istniejące przełączniki jadą przez nowy komponent i dają ten sam wynik.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:458-463` (`SKILL_FLAG_LABELS` → `SKILL_FLAG_META`), `:967-993` (grupa „Wyświetlanie"), `PropertyPanel` (jedna instancja `usePortalTooltip`)
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx`

**Interfaces:**
- Consumes: `skillDisplayFlags(fieldType) → string[]` (istnieje, eksportowane).
- Produces (używane w zadaniu 5):
  - `SKILL_FLAG_META` — mapa `flag → { labelKey, hintKey?, inverted?, requires? }`
  - `clearDependentFlags(field, patch) → patch` — eksportowana, czysta
  - `<FlagSwitch field flag meta onChange showTooltip hideTooltip />`

- [ ] **Step 1: Napisz failujący test czystej funkcji**

Dopisz na końcu `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx` (i dodaj `clearDependentFlags` do importu z `./TemplateBuilder`):

```jsx
describe('clearDependentFlags', () => {
  const field = { type: 'skill_table', hasAdvances: true, assignAttrToSkill: true, baseFromAttr: true };

  it('leaves a patch alone while every requirement still holds', () => {
    expect(clearDependentFlags(field, { sortAlphabetically: true }))
      .toEqual({ sortAlphabetically: true });
  });

  it('switches off a dependent flag when one requirement goes away', () => {
    expect(clearDependentFlags(field, { hasAdvances: false }))
      .toEqual({ hasAdvances: false, baseFromAttr: false });
    expect(clearDependentFlags(field, { assignAttrToSkill: false }))
      .toEqual({ assignAttrToSkill: false, baseFromAttr: false });
  });

  it('clears in the SAME patch, so the panel never shows the flag on without its requirements', () => {
    const patch = clearDependentFlags(field, { hasAdvances: false });
    expect(Object.keys(patch).sort()).toEqual(['baseFromAttr', 'hasAdvances']);
  });

  it('says nothing about a dependent flag that is already off', () => {
    const off = { ...field, baseFromAttr: false };
    expect(clearDependentFlags(off, { hasAdvances: false })).toEqual({ hasAdvances: false });
  });

  it('ignores flags that declare no requirements', () => {
    expect(clearDependentFlags(field, { twoColumns: true })).toEqual({ twoColumns: true });
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillFlags`

Expected: FAIL — `(0 , _TemplateBuilder.clearDependentFlags) is not a function`.

- [ ] **Step 3: Przemianuj tabelę i dodaj `clearDependentFlags`**

W `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` zamień blok z linii 458:

```js
// Metadata for every flag the field property panel renders as a switch: its label, an optional
// hint line, whether the switch reads as the negation of the stored flag, and which other flags
// must be on for it to mean anything. Keeping `requires` here as data is what lets one component
// derive all three of a dependent flag's behaviours — disabled state, tooltip, cascade clearing —
// instead of spelling them per flag at the call site.
//
// `requires` is a flat list, so it expresses a conjunction only: "all of these must be on". A
// dependency like "A or B" would have to become a predicate, and a predicate cannot be read back
// to name what is missing, which is exactly what the tooltip does.
const SKILL_FLAG_META = {
  hideFavorites:      { labelKey: 'creator.skillShowFavorites', hintKey: 'creator.skillShowFavoritesHint', inverted: true },
  showDevelopment:    { labelKey: 'creator.skillShowDevelopment', hintKey: 'creator.skillShowDevelopmentHint' },
  sortAlphabetically: { labelKey: 'creator.skillSortAlphabetically' },
  twoColumns:         { labelKey: 'creator.skillTwoColumns' },
  baseFromAttr:       {
    labelKey: 'creator.skillAttrAsBase',
    hintKey:  'creator.skillAttrAsBaseHint',
    requires: ['hasAdvances', 'assignAttrToSkill'],
  },
};

Wpis `baseFromAttr` wchodzi tu, a nie w następnym zadaniu, bo `clearDependentFlags` czyta zależności
wyłącznie z tej tabeli — bez wpisu jego własne testy nie mają czego gasić. Sam wpis nic jeszcze nie
renderuje: `skillDisplayFlags` nie zwraca `baseFromAttr`, a jego call-site dochodzi w następnym
zadaniu. Dlatego to zadanie nadal nie zmienia zachowania kreatora.

// clearDependentFlags switches off any flag whose requirements the patch is about to break, IN THE
// SAME patch. Two successive writes would leave a render in between showing the flag on without its
// requirements — and the switch that turns it back on disabled.
export function clearDependentFlags(field, patch) {
  const next = { ...field, ...patch };
  let out = patch;
  for (const [flag, meta] of Object.entries(SKILL_FLAG_META)) {
    if (!meta.requires || !next[flag]) continue;
    if (meta.requires.some(req => !next[req])) out = { ...out, [flag]: false };
  }
  return out;
}
```

Zamień też jedyne pozostałe użycie starej nazwy w grupie „Wyświetlanie" (linia 969): `SKILL_FLAG_LABELS[flag]` → `SKILL_FLAG_META[flag]`.

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillFlags`

Expected: PASS, 8 testów (3 istniejące + 5 nowych).

- [ ] **Step 5: Wyciągnij `FlagSwitch`**

W tym samym pliku dodaj komponent nad `PropertyPanel`:

```jsx
// One switch row driven by SKILL_FLAG_META. Handles the inverted flag, the optional hint, and —
// for a flag with `requires` — the disabled state plus a tooltip naming what is still missing.
//
// The tooltip hangs off a wrapper span, not off the Switch: a disabled MUI Switch emits no pointer
// events, so onMouseEnter on it would never fire and the explanation would be unreachable exactly
// when it is needed. Shown only while disabled; an enabled switch has its label and hint already.
function FlagSwitch({ field, flag, meta, onChange, showTooltip, hideTooltip, t }) {
  const missing = (meta.requires || []).filter(req => !field[req]);
  const disabled = missing.length > 0;
  const checked = meta.inverted ? !field[flag] : !!field[flag];
  const write = (value) => onChange({ [flag]: meta.inverted ? !value : value });

  const row = (
    <FormControlLabel
      labelPlacement="start"
      control={<Switch size="small" checked={checked} disabled={disabled} onChange={e => write(e.target.checked)} />}
      label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t(meta.labelKey)}</Typography>}
      sx={switchRowSx}
    />
  );

  return (
    <div>
      {disabled ? (
        <span
          onMouseEnter={e => showTooltip(
            t('creator.skillFlagRequires', { flags: missing.map(req => t(SKILL_FLAG_REQUIRE_LABELS[req])).join(', ') }),
            e.currentTarget,
          )}
          onMouseLeave={hideTooltip}
          style={{ display: 'block' }}
        >
          {row}
        </span>
      ) : row}
      {meta.hintKey && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75, fontStyle: 'italic' }}>
          {t(meta.hintKey)}
        </Typography>
      )}
    </div>
  );
}
```

`switchRowSx` jest dziś zdefiniowane wewnątrz `PropertyPanel` (linia 708). Wynieś je nad `FlagSwitch` jako stałą modułową — jedna definicja dla obu komponentów:

```js
const switchRowSx = { ml: 0, mr: 0, width: 1, justifyContent: 'space-between' };
```

…i usuń lokalną deklarację z `PropertyPanel`.

Dodaj też mapę nazw warunków, używaną tylko przez tooltip (klucze i18n dochodzą w zadaniu 5):

```js
// Human-readable names of the flags a dependent switch can require, for the tooltip that says what
// is missing. Separate from SKILL_FLAG_META because a requirement may be a flag that is not itself
// rendered by FlagSwitch — hasAdvances lives in the "Values" group with its own label input.
const SKILL_FLAG_REQUIRE_LABELS = {
  hasAdvances:       'creator.fieldAdvances',
  assignAttrToSkill: 'creator.fieldAssignAttr',
};
```

- [ ] **Step 6: Przepnij grupę „Wyświetlanie" na `FlagSwitch`**

W `PropertyPanel` dodaj jedną instancję tooltipa (import `usePortalTooltip` z `'../common/PortalTooltip'`):

```js
  // One instance per panel, not per switch: the panel shows one field at a time, and a state plus a
  // portal per row would be four of each for nothing.
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
```

Zamień ciało grupy „Wyświetlanie" (dziś linie 968-992) na:

```jsx
          {skillDisplayFlags(field.type).map(flag => (
            <FlagSwitch
              key={flag}
              field={field}
              flag={flag}
              meta={SKILL_FLAG_META[flag]}
              onChange={patch => up(clearDependentFlags(field, patch))}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
              t={t}
            />
          ))}
```

…a `{tooltipNode}` wstaw na końcu JSX zwracanego przez `PropertyPanel`, obok zamknięcia `.creator__props-panel`.

`FlagSwitch` odwołuje się do klucza `creator.skillFlagRequires`, który dochodzi dopiero w zadaniu 5.
To nie jest luka: po tym zadaniu żadna flaga w `SKILL_FLAG_META` nie ma `requires`, więc gałąź
tooltipa jest nieosiągalna. Nie dodawaj klucza tutaj — należy do zadania, które wprowadza pierwszą
flagę zależną.

- [ ] **Step 7: Sprawdź, że zachowanie kreatora się nie zmieniło**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillFlags|weaponColumns|chromeWiring|dragDrop|sheetWidth'`

Expected: wszystko PASS. Żaden z tych testów nie wie o `FlagSwitch` — to jest dowód, że refaktor nie zmienił zachowania.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx
git commit -m "refactor: FEATURE-218 drive the creator's flag switches from one metadata table"
```

---

### Task 5: Kreator — przełącznik „ustaw atrybut jako wartość bazową"

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`SKILL_FLAG_META`, grupa „Zawartość" pod przełącznikiem przypisania atrybutu, `makeDefaultField` dla `skill_table`, przełączniki `hasAdvances` i `assignAttrToSkill`)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json`
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx`

**Interfaces:**
- Consumes z zadania 4: `SKILL_FLAG_META`, `clearDependentFlags`, `FlagSwitch`, `SKILL_FLAG_REQUIRE_LABELS`.
- Produces: nic dla dalszych zadań — to ostatnie.

- [ ] **Step 1: Napisz failujący test**

Dopisz w `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx`:

```jsx
describe('baseFromAttr metadata', () => {
  it('requires both the advances column and attribute assignment', () => {
    expect(SKILL_FLAG_META.baseFromAttr.requires).toEqual(['hasAdvances', 'assignAttrToSkill']);
  });

  it('is not one of the display-group flags — it belongs next to attribute assignment', () => {
    expect(skillDisplayFlags('skill_table')).not.toContain('baseFromAttr');
  });

  it('carries a label and a hint', () => {
    expect(SKILL_FLAG_META.baseFromAttr.labelKey).toBe('creator.skillAttrAsBase');
    expect(SKILL_FLAG_META.baseFromAttr.hintKey).toBe('creator.skillAttrAsBaseHint');
  });
});
```

Dodaj `SKILL_FLAG_META` i `skillDisplayFlags` do importu z `./TemplateBuilder` (eksportuj `SKILL_FLAG_META`, jeśli jeszcze nie jest eksportowane).

- [ ] **Step 2: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillFlags`

Expected: FAIL — `Cannot read properties of undefined (reading 'requires')`.

- [ ] **Step 3: Sprawdź wpis w tabeli**

Wpis `baseFromAttr` w `SKILL_FLAG_META` powstał już w poprzednim zadaniu (potrzebowało go
`clearDependentFlags`). Upewnij się, że ma dokładnie `labelKey: 'creator.skillAttrAsBase'`,
`hintKey: 'creator.skillAttrAsBaseHint'` i `requires: ['hasAdvances', 'assignAttrToSkill']` — i nie
dodawaj go po raz drugi.

`skillDisplayFlags` zostaje bez zmian — ten przełącznik nie należy do grupy „Wyświetlanie".

- [ ] **Step 4: Wyrenderuj przełącznik w grupie „Zawartość"**

W `PropertyPanel`, bezpośrednio po bloku przełącznika `assignAttrToSkill` (dziś linie 892-905), dodaj:

```jsx
          {field.type === 'skill_table' && (
            <FlagSwitch
              field={field}
              flag="baseFromAttr"
              meta={SKILL_FLAG_META.baseFromAttr}
              onChange={patch => up(clearDependentFlags(field, patch))}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
              t={t}
            />
          )}
```

- [ ] **Step 5: Podłącz kasowanie kaskadowe do obu warunków**

Przełączniki, które mogą zabrać warunek, muszą przepuścić swój patch przez `clearDependentFlags`. Zmień `assignAttrToSkill` (dziś linia 899):

```jsx
                  onChange={e => up(clearDependentFlags(field, { assignAttrToSkill: e.target.checked }))}
```

…i `hasAdvances` w grupie „Wartości" — **ten w gałęzi `skill_table`** (linia 862, nie ten z gałęzi `attr` z linii 840):

```jsx
                control={<Switch checked={!!field.hasAdvances} onChange={e => up(clearDependentFlags(field, { hasAdvances: e.target.checked }))} size="small" />}
```

- [ ] **Step 6: Dodaj flagę do domyślnego pola**

W `makeDefaultField` (linia 138) dopisz `baseFromAttr: false` do domyślnych wartości `skill_table`, tak jak stoją tam już `assignAttrToSkill` i `hasAdvances`:

```js
  if (type === 'skill_table') return { ...base, skills: [], rollable: true, assignAttrToSkill: false, hasAdvances: false, baseFromAttr: false, advancesLabel: 'Rozwinięcie' };
```

- [ ] **Step 7: Dodaj klucze i18n**

`warhammer-battle-helper-front/src/locales/en/translation.json`, blok `creator`:

```json
    "skillAttrAsBase": "Attribute as the base value",
    "skillAttrAsBaseHint": "The base column shows the linked attribute and cannot be edited; the total is the attribute plus advances.",
    "skillFlagRequires": "Needs: {{flags}}",
```

`warhammer-battle-helper-front/src/locales/pl/translation.json`, blok `creator`:

```json
    "skillAttrAsBase": "Atrybut jako wartość bazowa",
    "skillAttrAsBaseHint": "Kolumna bazy pokazuje powiązany atrybut i nie da się jej edytować; suma to atrybut plus rozwinięcia.",
    "skillFlagRequires": "Wymaga: {{flags}}",
```

- [ ] **Step 8: Uruchom testy i sprawdź komplet kluczy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillFlags`
Expected: PASS, 11 testów.

Run: `cd warhammer-battle-helper-front && node -e "const a=require('./src/locales/en/translation.json'),b=require('./src/locales/pl/translation.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?f(v,p+k+'.'):[p+k]);const A=new Set(f(a)),B=new Set(f(b));console.log('only en:',[...A].filter(k=>!B.has(k)));console.log('only pl:',[...B].filter(k=>!A.has(k)));"`
Expected: `only en: []` i `only pl: []`.

- [ ] **Step 9: Uruchom wszystko**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS poza `App.test.js`.

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: wszystkie pakiety `ok` albo `no test files`.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-218 creator switch for using an attribute as a skill's base"
```

---

## Weryfikacja ręczna (po zadaniu 5)

jsdom nie liczy layoutu ani nie maluje — te rzeczy trzeba zobaczyć w przeglądarce:

1. Przełącznik jest **widoczny i wyszarzony**, dopóki nie włączysz rozwinięć i przypisania atrybutu, a po najechaniu pokazuje tooltip z nazwami brakujących warunków (sprawdź osobno: brak jednego i brak obu — tooltip ma wymienić dokładnie te, których nie ma).
2. Wyłączenie któregokolwiek z dwóch warunków **gasi** nowy przełącznik od razu, bez pośredniego stanu „włączony, ale zablokowany".
3. Kolumna bazy wygląda na nieedytowalną (tabliczka jak w kolumnie sumy) i klik w nią nie stawia kursora.
4. Zmiana wartości atrybutu na karcie natychmiast podnosi bazę i sumę wszystkich umiejętności opartych na tym atrybucie — bez odświeżania strony.
5. Rzut na taką umiejętność ma w logu próg równy atrybut + rozwinięcia, a rzut bronią, której kolumna umiejętności wskazuje tę umiejętność — ten sam próg.
6. Wyłączenie flagi w szablonie przywraca wcześniej wpisaną bazę gracza (dane nie zniknęły).

Recepta na lokalne uruchomienie stacka i zdobycie JWT: pamięć „local-e2e-verification-recipe".
