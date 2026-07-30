# FEATURE-166 — tooltipy kości i wzór pod rzutem puli — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W trybie `dice_pool` systemu custom każdy żeton z wynikiem kości dostaje tooltip z rodzajem kości (`K6`/`D6`), a pod rzędem żetonów pojawia się linia wzoru (`K6+K10+K10`).

**Architecture:** Backend przestaje wysyłać płaską tablicę `PoolRolls []int` i wysyła zamiast niej `PoolFormula []PoolFormulaPart` — listę członów wzoru, gdzie człon kości niesie swoje własne wyniki i liczbę ścianek. Front ma jedno źródło prawdy: spłaszcza człony do żetonów i skleja z nich linię wzoru, podstawiając literę notacji z i18n.

**Tech Stack:** Go (backend, testy `go test`), React + i18next (front, testy `react-scripts test` / Jest).

**Spec:** `docs/superpowers/specs/2026-07-30-FEATURE-166-pool-dice-tooltips-design.md`

## Global Constraints

- Brak backward compat — pole `PoolRolls` znika bez okresu przejściowego, stare dane nie są wspierane (`CLAUDE.md`).
- Zero nowych kluczy i18n. Używamy istniejących `dice.label` (`K{{sides}}` / `D{{sides}}`) i `dice.dieNotation` (`K` / `D`), obecnych w `src/locales/pl/translation.json` i `src/locales/en/translation.json`.
- Żadnych stringów wpisanych wprost w JSX — zawsze `t('klucz')`.
- Tooltipy: nigdy MUI `<Tooltip>`. Wyłącznie `usePortalTooltip` z `src/components/common/PortalTooltip.jsx`.
- Zero zmian w CSS — `.custom-pool-die`, `.custom-pool-dice`, `.log-formula-breakdown`, `.portal-tooltip` już istnieją.
- Poza zakresem: `CustomWeaponRoll.jsx` (broń w trybie puli) i lokalizacja notacji w trybie tradycyjnym.

## Struktura plików

| plik | rola |
|---|---|
| `warhammer-battle-helper-backend/internal/systems/interface.go` | modyfikacja — nowy typ `PoolFormulaPart`, wymiana pola w `RollResult` |
| `warhammer-battle-helper-backend/internal/systems/custom/roller.go` | modyfikacja — `evalFormulaDicePool` buduje człony, `rollFromFormulaDicePool` je przekazuje |
| `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` | modyfikacja — testy przechodzą na `PoolFormula` + nowe przypadki |
| `warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.js` | **nowy** — dwie czyste funkcje: spłaszczanie żetonów i formatowanie wzoru |
| `warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.test.js` | **nowy** — testy jednostkowe obu funkcji |
| `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx` | modyfikacja — żetony z tooltipem + linia wzoru |

Logika renderu wzoru trafia do osobnego modułu, a nie do komponentu, bo jest czysta i to ona wymaga najwięcej przypadków testowych. Komponent zostaje cienkim mapowaniem propsów na JSX.

---

### Task 1: Backend — wzór puli jako struktura

Backend musi się kompilować w całości, więc typ, funkcja licząca, jej wywołujący i testy zmieniają się w jednym zadaniu.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/interface.go:44-51`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:278-330` (`rollFromFormulaDicePool`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:332-460` (`evalFormulaDicePool`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`

**Interfaces:**
- Consumes: `evalDicePoolInts(count int, rollFn func() int) []int`, `diceNotationToSides(notation string) int`, `skillValue(stats *Stats, key string) int` — wszystkie już istnieją w `roller.go`.
- Produces: typ `gsys.PoolFormulaPart` z polami `Kind`, `Text`, `Sides`, `CountLabel`, `SidesLabel`, `Rolls` (JSON: `kind`, `text`, `sides`, `countLabel`, `sidesLabel`, `rolls`) oraz pole `RollResult.PoolFormula []PoolFormulaPart` (JSON `poolFormula`) — to jest kontrakt, który konsumuje front w Taskach 2 i 3.

- [ ] **Step 1: Dodaj pomocnik testowy spłaszczający człony**

W `roller_test.go`, tuż pod `sampleStats()` (ok. linii 47):

```go
// poolRolls flattens a pool formula back to the individual dice results, in roll order.
func poolRolls(parts []gsys.PoolFormulaPart) []int {
	var out []int
	for _, p := range parts {
		out = append(out, p.Rolls...)
	}
	return out
}
```

- [ ] **Step 2: Przepisz istniejące asercje na `PoolFormula`**

W `TestRollFromFormula_DicePool`, podtest `"gte counts every die at or above threshold"` (ok. linii 379) — zamień blok:

```go
		if !reflect.DeepEqual(res.PoolRolls, []int{4, 6, 2}) {
			t.Errorf("PoolRolls = %v, want [4 6 2]", res.PoolRolls)
		}
```

na:

```go
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2}) {
			t.Errorf("pool rolls = %v, want [4 6 2]", got)
		}
```

W `TestEvalFormulaDicePool_BlockTypes` (ok. linii 634) wszystkie pięć podtestów woła `evalFormulaDicePool` z czterema wartościami zwracanymi. Zamień całą funkcję na:

```go
func TestEvalFormulaDicePool_BlockTypes(t *testing.T) {
	stats := sampleStats() // str=8, atk=10

	t.Run("single dice_attr collects one roll", func(t *testing.T) {
		p := newTestPlugin(3) // d8 -> 4
		parts, diceType, err := p.evalFormulaDicePool([]models.FormulaBlock{{Type: "dice_attr", Key: "str"}}, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{4}) || diceType != 8 {
			t.Errorf("got rolls=%v dice=%d, want [4]/8", got, diceType)
		}
	})

	t.Run("dice_attr pool collects all rolls", func(t *testing.T) {
		p := newTestPlugin(3, 5) // 4, 6
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_attr", Key: "str"}}
		parts, _, _ := p.evalFormulaDicePool(blocks, stats, "", "")
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{4, 6}) {
			t.Errorf("rolls = %v, want [4 6]", got)
		}
	})

	t.Run("dice_skill_attr pool", func(t *testing.T) {
		p := newTestPlugin(7, 9) // sides 18 -> 8, 10
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_skill_attr"}}
		parts, _, _ := p.evalFormulaDicePool(blocks, stats, "atk", "str")
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{8, 10}) {
			t.Errorf("rolls = %v, want [8 10]", got)
		}
	})

	t.Run("non-dice blocks contribute no rolls", func(t *testing.T) {
		// attr/skill/const/attr_linked/op only affect die-count segments.
		p := newTestPlugin()
		blocks := []models.FormulaBlock{
			{Type: "attr", Key: "str", Label: "STR"},
			opBlock("+"),
			{Type: "skill"},
			{Type: "attr_linked"},
			numBlock(2),
		}
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "atk", "dex")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if got := poolRolls(parts); len(got) != 0 {
			t.Errorf("rolls = %v, want empty (no dice blocks)", got)
		}
	})

	t.Run("empty formula errors", func(t *testing.T) {
		p := newTestPlugin()
		if _, _, err := p.evalFormulaDicePool(nil, stats, "", ""); err == nil {
			t.Error("expected error for empty pool formula, got nil")
		}
	})
}
```

- [ ] **Step 3: Dopisz testy kształtu wzoru**

Do `TestEvalFormulaDicePool_BlockTypes`, przed zamykającą klamrą funkcji, dodaj trzy podtesty:

```go
	t.Run("count form keeps one term with every roll", func(t *testing.T) {
		p := newTestPlugin(3, 5, 1) // 4, 6, 2
		blocks := []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6")}
		parts, diceType, err := p.evalFormulaDicePool(blocks, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{{Kind: "dice", Sides: 6, CountLabel: "3", Rolls: []int{4, 6, 2}}}
		if !reflect.DeepEqual(parts, want) || diceType != 6 {
			t.Errorf("got parts=%+v dice=%d, want %+v/6", parts, diceType, want)
		}
	})

	t.Run("computed faces keep their source label", func(t *testing.T) {
		p := newTestPlugin(3) // d8 -> 4
		blocks := []models.FormulaBlock{{Type: "dice_attr", Key: "str", Label: "STR"}}
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{{Kind: "dice", Sides: 8, SidesLabel: "STR", Rolls: []int{4}}}
		if !reflect.DeepEqual(parts, want) {
			t.Errorf("parts = %+v, want %+v", parts, want)
		}
	})

	t.Run("die used as the count stays in the formula", func(t *testing.T) {
		// d6 -> 2 decides the count, then two d10 -> 7, 3.
		p := newTestPlugin(1, 6, 2)
		blocks := []models.FormulaBlock{diceBlock("d6"), opBlock("d"), diceBlock("d10")}
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{
			{Kind: "dice", Sides: 6, Rolls: []int{2}},
			{Kind: "dice", Sides: 10, Rolls: []int{7, 3}},
		}
		if !reflect.DeepEqual(parts, want) {
			t.Errorf("parts = %+v, want %+v", parts, want)
		}
	})
```

Oraz nowa funkcja testowa na końcu sekcji „Dice-pool mode" (za `TestRollFromFormula_DicePool`, ok. linii 407):

```go
func TestRollFromFormula_DicePoolFormulaParts(t *testing.T) {
	stats := sampleStats()
	cfg := &models.RollConfig{
		RollMode: "dice_pool",
		Formula: []models.FormulaBlock{
			diceBlock("d6"), opBlock("+"), diceBlock("d10"), opBlock("+"), diceBlock("d10"),
		},
		PoolSuccessThreshold: 5,
	}
	// d6 -> 4, d10 -> 7, d10 -> 2
	p := newTestPlugin(3, 6, 1)
	res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	want := []gsys.PoolFormulaPart{
		{Kind: "dice", Sides: 6, Rolls: []int{4}},
		{Kind: "text", Text: "+"},
		{Kind: "dice", Sides: 10, Rolls: []int{7}},
		{Kind: "text", Text: "+"},
		{Kind: "dice", Sides: 10, Rolls: []int{2}},
	}
	if !reflect.DeepEqual(res.PoolFormula, want) {
		t.Errorf("PoolFormula = %+v, want %+v", res.PoolFormula, want)
	}
	if res.FormulaBreakdown != "" {
		t.Errorf("FormulaBreakdown = %q, want empty (pool mode uses PoolFormula)", res.FormulaBreakdown)
	}
}
```

- [ ] **Step 4: Uruchom testy i potwierdź, że nie kompilują się**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/...`
Expected: FAIL — `undefined: gsys.PoolFormulaPart` oraz `res.PoolFormula undefined`.

- [ ] **Step 5: Dodaj typ i wymień pole w `RollResult`**

W `internal/systems/interface.go` zamień blok (linie 47-51):

```go
	// Dice-pool mode results (only present when rolled in dice_pool mode).
	PoolRolls            []int  `json:"poolRolls,omitempty"`
	PoolSuccesses        int    `json:"poolSuccesses,omitempty"`
	PoolSuccessCondition string `json:"poolSuccessCondition,omitempty"` // "gte" | "eq"
}
```

na:

```go
	// Dice-pool mode results (only present when rolled in dice_pool mode).
	PoolFormula          []PoolFormulaPart `json:"poolFormula,omitempty"`
	PoolSuccesses        int               `json:"poolSuccesses,omitempty"`
	PoolSuccessCondition string            `json:"poolSuccessCondition,omitempty"` // "gte" | "eq"
}

// PoolFormulaPart is one term of a dice-pool formula: either a text fragment
// (operator, attribute label, constant) or a die term carrying the results it
// produced. Keeping the rolls inside the term is what lets the client label every
// result with the die that produced it — a flat roll list cannot say whether a 4
// came off a d6 or a d10.
type PoolFormulaPart struct {
	Kind       string `json:"kind"`                 // "text" | "dice"
	Text       string `json:"text,omitempty"`       // kind=text: "+", "STR", "3"
	Sides      int    `json:"sides,omitempty"`      // kind=dice: resolved face count
	CountLabel string `json:"countLabel,omitempty"` // kind=dice: multiplier shown before the die, e.g. "3"
	SidesLabel string `json:"sidesLabel,omitempty"` // kind=dice: source expression when faces are computed, e.g. "STR"
	Rolls      []int  `json:"rolls,omitempty"`      // kind=dice: one entry per die rolled
}
```

- [ ] **Step 6: Przepisz `evalFormulaDicePool`**

W `internal/systems/custom/roller.go` zamień całą funkcję `evalFormulaDicePool` (od komentarza `// evalFormulaDicePool evaluates the formula for dice-pool mode.` do jej zamykającej klamry) na:

```go
// evalFormulaDicePool evaluates the formula for dice-pool mode. It returns the
// formula as a list of parts — text fragments and die terms carrying their own
// rolls — plus the face count of the first die rolled (display only).
// Arithmetic ops still work as die-count modifiers.
func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string) (parts []gsys.PoolFormulaPart, diceType int, err error) {
	if len(blocks) == 0 {
		return nil, 0, fmt.Errorf("formula is empty")
	}

	type segment struct {
		op  string
		val int
	}

	var segments []segment
	pendingOp := "+"

	// takeCount consumes the preceding part as the multiplier of a "d" operation.
	// A text part (constant or attribute label) is absorbed into the die term's
	// CountLabel. A die part stays where it is — its own rolls must survive — and the
	// new term renders without a multiplier, so "d6d10" reads as "K6K10".
	takeCount := func() string {
		if len(parts) == 0 || parts[len(parts)-1].Kind != "text" {
			return ""
		}
		label := parts[len(parts)-1].Text
		parts = parts[:len(parts)-1]
		return label
	}

	// rollTerm appends one die term: `count` dice when it follows a "d" operator,
	// a single die otherwise. sidesLabel is empty for a literal die (d6) and holds
	// the source expression when the face count is computed (d(STR)).
	rollTerm := func(sides int, sidesLabel string) {
		if diceType == 0 {
			diceType = sides
		}
		roll := func() int { return p.rng.Intn(sides) + 1 }

		if pendingOp == "d" && len(segments) > 0 {
			count := segments[len(segments)-1].val
			prevOp := segments[len(segments)-1].op
			segments = segments[:len(segments)-1]
			countLabel := takeCount()
			rolls := evalDicePoolInts(count, roll)
			total := 0
			for _, r := range rolls {
				total += r
			}
			segments = append(segments, segment{op: prevOp, val: total})
			parts = append(parts, gsys.PoolFormulaPart{
				Kind: "dice", Sides: sides, SidesLabel: sidesLabel, CountLabel: countLabel, Rolls: rolls,
			})
		} else {
			rolled := roll()
			segments = append(segments, segment{op: pendingOp, val: rolled})
			parts = append(parts, gsys.PoolFormulaPart{
				Kind: "dice", Sides: sides, SidesLabel: sidesLabel, Rolls: []int{rolled},
			})
		}
		pendingOp = ""
	}

	// addText appends a non-die term and records its value as a possible die count.
	addText := func(text string, val int) {
		segments = append(segments, segment{op: pendingOp, val: val})
		parts = append(parts, gsys.PoolFormulaPart{Kind: "text", Text: text})
		pendingOp = ""
	}

	for _, b := range blocks {
		switch b.Type {
		case "op":
			if b.Value != "d" {
				parts = append(parts, gsys.PoolFormulaPart{Kind: "text", Text: b.Value})
			}
			pendingOp = b.Value
		case "dice":
			rollTerm(diceNotationToSides(b.Value), "")
		case "dice_attr":
			sides := stats.Attributes[b.Key].Current
			if sides < 1 {
				sides = 1
			}
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			rollTerm(sides, lbl)
		case "dice_skill_attr":
			av := stats.Attributes[linkedAttr].Current
			sv := skillValue(stats, skillKey)
			sides := av + sv
			if sides < 1 {
				sides = 1
			}
			lbl := strconv.Itoa(sv)
			if linkedAttr != "" {
				lbl = fmt.Sprintf("%d+%d", av, sv)
			}
			rollTerm(sides, lbl)
		case "attr":
			lbl := b.Label
			if lbl == "" {
				lbl = b.Key
			}
			addText(lbl, stats.Attributes[b.Key].Current)
		case "skill":
			addText("umiej.", skillValue(stats, skillKey))
		case "attr_linked":
			lbl := "0"
			if linkedAttr != "" {
				lbl = linkedAttr
			}
			addText(lbl, stats.Attributes[linkedAttr].Current)
		case "const":
			v := 0
			if b.Num != nil {
				v = int(*b.Num)
			}
			addText(strconv.Itoa(v), v)
		}
	}

	return parts, diceType, nil
}
```

- [ ] **Step 7: Przepnij `rollFromFormulaDicePool` na człony**

W tej samej funkcji zamień pierwsze wywołanie:

```go
	allRolls, diceType, labelStr, err := p.evalFormulaDicePool(cfg.Formula, stats, skillKey, linkedAttr)
```

na:

```go
	parts, diceType, err := p.evalFormulaDicePool(cfg.Formula, stats, skillKey, linkedAttr)
```

pętlę liczącą sukcesy:

```go
	successes := 0
	for _, r := range allRolls {
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
```

na:

```go
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
```

oraz dwa pola w zwracanym `RollResult`:

```go
		PoolRolls:            allRolls,
```

i

```go
		FormulaBreakdown:     labelStr,
```

na jedno:

```go
		PoolFormula:          parts,
```

(`FormulaBreakdown` w trybie puli nie jest już ustawiany — linia wzoru powstaje po stronie frontu z `PoolFormula`.)

- [ ] **Step 8: Uruchom testy backendu**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/...`
Expected: PASS (`ok  	battle-helper/internal/systems/custom`)

- [ ] **Step 9: Uruchom cały pakiet systemów, żeby złapać inne konsumenty `PoolRolls`**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build bez błędów, wszystkie testy PASS.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/interface.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git commit -m "feat(custom): FEATURE-166 send dice-pool formula as structured parts"
```

---

### Task 2: Front — moduł `poolFormula`

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.test.js`

**Interfaces:**
- Consumes: kształt `poolFormula` z Taska 1 — tablica obiektów `{ kind, text, sides, countLabel, sidesLabel, rolls }`.
- Produces: `flattenPoolDice(poolFormula) -> [{ value, sides }]` oraz `formatPoolFormula(poolFormula, t) -> string`. Obie konsumuje `CustomRoll.jsx` w Tasku 3.

- [ ] **Step 1: Napisz testy**

Utwórz `warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.test.js`:

```js
import { flattenPoolDice, formatPoolFormula } from './poolFormula';

// Stand-in for i18next's t, using the Polish notation (K).
const t = (key, opts) => (key === 'dice.dieNotation' ? 'K' : `K${opts.sides}`);

describe('flattenPoolDice', () => {
  test('returns one entry per die, carrying that die\'s face count', () => {
    const formula = [
      { kind: 'dice', sides: 6, rolls: [4] },
      { kind: 'text', text: '+' },
      { kind: 'dice', sides: 10, rolls: [7, 2] },
    ];
    expect(flattenPoolDice(formula)).toEqual([
      { value: 4, sides: 6 },
      { value: 7, sides: 10 },
      { value: 2, sides: 10 },
    ]);
  });

  test('expands a count term into one entry per roll', () => {
    const formula = [{ kind: 'dice', sides: 6, countLabel: '3', rolls: [4, 6, 2] }];
    expect(flattenPoolDice(formula)).toEqual([
      { value: 4, sides: 6 },
      { value: 6, sides: 6 },
      { value: 2, sides: 6 },
    ]);
  });

  test('returns an empty list for a missing formula', () => {
    expect(flattenPoolDice(undefined)).toEqual([]);
  });
});

describe('formatPoolFormula', () => {
  test('joins literal dice and operators', () => {
    const formula = [
      { kind: 'dice', sides: 6, rolls: [4] },
      { kind: 'text', text: '+' },
      { kind: 'dice', sides: 10, rolls: [7] },
      { kind: 'text', text: '+' },
      { kind: 'dice', sides: 10, rolls: [2] },
    ];
    expect(formatPoolFormula(formula, t)).toBe('K6+K10+K10');
  });

  test('keeps the multiplier in front of the die', () => {
    const formula = [{ kind: 'dice', sides: 6, countLabel: '3', rolls: [4, 6, 2] }];
    expect(formatPoolFormula(formula, t)).toBe('3K6');
  });

  test('shows the source expression when the face count is computed', () => {
    const formula = [
      { kind: 'dice', sides: 8, sidesLabel: 'STR', rolls: [4] },
      { kind: 'text', text: '+' },
      { kind: 'text', text: '2' },
    ];
    expect(formatPoolFormula(formula, t)).toBe('K(STR)+2');
  });

  test('returns an empty string for a missing formula', () => {
    expect(formatPoolFormula(undefined, t)).toBe('');
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że padają**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --testPathPattern=poolFormula`
Expected: FAIL — `Cannot find module './poolFormula'`.

- [ ] **Step 3: Napisz moduł**

Utwórz `warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.js`:

```js
// Rendering helpers for a custom-system dice-pool result. The backend sends the
// formula as parts — text fragments and die terms carrying their own rolls — so the
// dice row and the formula line can never disagree on how many faces a die had.

// flattenPoolDice returns one entry per rolled die, in roll order, each tagged with
// the face count of the die that produced it.
export function flattenPoolDice(poolFormula) {
  if (!poolFormula) return [];
  return poolFormula.flatMap(part =>
    (part.rolls || []).map(value => ({ value, sides: part.sides }))
  );
}

// formatPoolFormula renders the formula line, e.g. "K6+K10+K10", "3K6", "K(STR)+2".
// The die letter comes from i18n, so the line reads K in Polish and D in English.
export function formatPoolFormula(poolFormula, t) {
  if (!poolFormula) return '';
  return poolFormula
    .map(part => {
      if (part.kind !== 'dice') return part.text || '';
      const count = part.countLabel || '';
      return part.sidesLabel
        ? `${count}${t('dice.dieNotation')}(${part.sidesLabel})`
        : `${count}${t('dice.label', { sides: part.sides })}`;
    })
    .join('');
}
```

- [ ] **Step 4: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --testPathPattern=poolFormula`
Expected: PASS — 7 testów w `poolFormula.test.js`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.js \
        warhammer-battle-helper-front/src/systems/custom/rolls/poolFormula.test.js
git commit -m "feat(custom): FEATURE-166 add dice-pool formula rendering helpers"
```

---

### Task 3: Front — tooltipy i linia wzoru w `CustomRoll`

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx`

**Interfaces:**
- Consumes: `flattenPoolDice`, `formatPoolFormula` (Task 2); `usePortalTooltip` z `src/components/common/PortalTooltip.jsx` — zwraca `{ showTooltip, hideTooltip, tooltipNode }`, `showTooltip(text, element)`.
- Produces: nic — końcowy konsument.

- [ ] **Step 1: Dodaj importy i wywołania hooków**

W `CustomRoll.jsx` dopisz do importów:

```js
import { usePortalTooltip } from '../../../components/common/PortalTooltip';
import { flattenPoolDice, formatPoolFormula } from './poolFormula';
```

W ciele komponentu, pod `const { t } = useTranslation();`:

```js
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

  const poolDice = flattenPoolDice(data.poolFormula);
  const poolFormulaText = formatPoolFormula(data.poolFormula, t);
```

Domyślne `placement: 'above'` jest tu właściwe: żetony leżą w poziomym rzędzie, więc tooltip po lewej zasłaniałby sąsiedni żeton.

- [ ] **Step 2: Zamień warunek ukrywania etykiety kości i modyfikatora**

Tryb puli nie dostaje już `formulaBreakdown`, więc trzy warunki w linii opisu muszą pytać o wzór w obu trybach. Pod `const modifierText = ...` dodaj:

```js
  const hasFormula = Boolean(data.formulaBreakdown) || poolFormulaText !== '';
```

i zamień w JSX trzy wystąpienia `!data.formulaBreakdown` na `!hasFormula`:

```jsx
          {!hasFormula && diceLabel && <span>{diceLabel}</span>}
          {!hasFormula && diceLabel && ' → '}
          <strong className="log-roll-value" style={{ color: resultColor }}>{data.roll}</strong>
          {!isRaw && data.target > 0 && ` ${t('log.vs')} ${data.target}`}
          {!hasFormula && modifierText && <span className="log-modifier">{modifierText}</span>}
```

- [ ] **Step 3: Przepisz gałąź puli**

Zamień blok od `{data.poolRolls && data.poolRolls.length > 0 ? (` do zamykającego `) : null}` na:

```jsx
        {poolDice.length > 0 ? (
          <>
            <div className="custom-pool-dice">
              {poolDice.map(({ value, sides }, i) => {
                const dieSucceeded = data.poolSuccessCondition === 'eq'
                  ? value === data.target
                  : value >= data.target;
                return (
                  <span
                    key={i}
                    className={`custom-pool-die${dieSucceeded ? ' custom-pool-die--success' : ''}`}
                    onMouseEnter={e => showTooltip(t('dice.label', { sides }), e.currentTarget)}
                    onMouseLeave={hideTooltip}
                  >
                    {value}
                  </span>
                );
              })}
              <span className="custom-pool-success-count">
                {t('customRoll.poolSuccesses', { count: data.poolSuccesses })}
              </span>
            </div>
            <div className="log-formula-breakdown">{poolFormulaText}</div>
          </>
        ) : data.formulaBreakdown ? (
          <div className="log-formula-breakdown">{data.formulaBreakdown}</div>
        ) : null}
```

Wewnętrzna zmienna nazywa się `dieSucceeded`, a nie `isSuccess`, bo `isSuccess` istnieje już wyżej w komponencie (wynik całego rzutu) — przesłonięcie utrudniałoby czytanie.

- [ ] **Step 4: Wyrenderuj tooltip**

Tuż przed zamykającym `</>` w `return`, za `</div>` zamykającym `log-list-item__content`:

```jsx
      {tooltipNode}
```

- [ ] **Step 5: Sprawdź, że `poolRolls` nigdzie nie zostało**

Run: `cd warhammer-battle-helper-front && grep -rn "poolRolls" src/`
Expected: brak wyników.

- [ ] **Step 6: Uruchom testy frontu**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS, bez nowych błędów.

- [ ] **Step 7: Sprawdzenie ręczne w aplikacji**

Odpal stack lokalnie, wejdź do gry na systemie custom z umiejętnością o `rollMode: "dice_pool"` i wzorze mieszającym kości (`d6+d10+d10`). Wykonaj rzut i sprawdź w logu:

1. Pod rzędem żetonów widnieje linia wzoru `K6+K10+K10` (polski UI) / `D6+D10+D10` (angielski).
2. Najechanie na pierwszy żeton pokazuje tooltip `K6`, na drugi i trzeci `K10`.
3. Żetony spełniające próg nadal mają złote tło (`custom-pool-die--success`).
4. Tryb tradycyjny (`rollMode` inny niż `dice_pool`) pokazuje wzór jak dotąd, nad wynikiem, w niezmienionym formacie `d6+STR+2 = 3+8+2 = 13`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx
git commit -m "feat(custom): FEATURE-166 label pool dice with their die type and show the formula"
```
