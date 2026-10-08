# PLAYRPG-232 Computed Field + Formula Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every custom-template formula (rolls, weapon damage, and a new read-only `computed` sheet field) is evaluated with operator precedence and parentheses, and the GM can add a `computed` field whose value the sheet computes live from attribute and number fields.

**Architecture:** Formulas stay `[]FormulaBlock` built by the visual FormulaBuilder. A recursive-descent parser turns blocks into a tree — in Go (`formula.go`, used by rolls, damage and dice-pool mode via two tree walks) and in JS (`systems/custom/formula/formula.js`, used for validation in the creator and for evaluating `computed` fields at render time). Go is the reference semantics; a shared `formula_cases.json` is read by both test suites so the two parsers cannot drift. The computed value is never stored.

**Tech Stack:** Go 1.24 + Gin + MongoDB | React 19 + i18next + `@mui/icons-material` | Jest via CRA.

**Spec:** `docs/superpowers/specs/PLAYRPG-232.md`

## Global Constraints

- Main checkout, no worktree. Commit on the current branch (`main`).
- Code comments in English. Conversation and `docs/` in Polish.
- All UI strings via `t('…')`, added to both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`. No MUI `<Tooltip>`.
- Grammar (verbatim from spec):
  ```
  wyrażenie  := składnik ( ('+' | '-') składnik )*
  składnik   := czynnik  ( ('*' | '/') czynnik )*
  czynnik    := atom [ 'd' kość ]  |  kość
  atom       := wartość  |  '(' wyrażenie ')'
  wartość    := attr | number | const | skill | attr_linked | const_input
  kość       := dice | dice_attr | dice_skill_attr
  ```
- Integer division truncates toward zero (`-7 / 2 = -3`); `const` truncates toward zero (`-2.7 → -2`). JS uses `Math.trunc`, and normalises `-0` to `0`.
- Limit **100 dice** per `d` node → error `too_many_dice`. Count < 1 is raised to 1.
- Parser must consume every block; leftovers → `trailing_blocks`.
- Error reasons are identical strings in Go and JS: `empty`, `unknown_block`, `unexpected_block`, `unexpected_end`, `unclosed_paren`, `expected_die`, `dice_chain`, `trailing_blocks`, `division_by_zero`. Go-only: `too_many_dice`. JS-only (creator checks): `not_allowed`, `field_not_found`, `unsupported_block`.
- A `computed` formula allows only `const`, `attr`, `number`, `+ - * /`, parentheses.
- Delete dead code / CSS / i18n in the same task that makes it dead.
- Backend tests: from `warhammer-battle-helper-backend/`, `go test ./internal/systems/custom/ ./internal/models/ -run <Name> -v`.
- Frontend tests: from `warhammer-battle-helper-front/`, `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Never bare `npx jest`. `App.test.js` (axios ESM) is a known baseline failure. Tests importing `TemplateBuilder` must `jest.mock('axios', …)` (pattern: `TemplateBuilder.skillFlags.test.jsx`).
- Commit messages: `feat: PLAYRPG-232 …` / `refactor: PLAYRPG-232 …`, ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RLmigJ8Wv3r5y3SwRKDDbZ
  ```

## File Map

| File | Responsibility |
|---|---|
| `warhammer-battle-helper-front/src/systems/custom/formula/formula_cases.json` (new) | Cross-language contract: block list → value / error@index / valid |
| `warhammer-battle-helper-backend/internal/systems/custom/formula.go` (new) | Go parser: blocks → `formulaNode` tree, `FormulaError` |
| `warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go` (new) | Go tree walks: `formulaEnv`, `tradWalk` (value + breakdown), `poolWalk` (pool parts) |
| `warhammer-battle-helper-backend/internal/systems/custom/formula_test.go` (new) | Shared-case test + walk tests |
| `warhammer-battle-helper-backend/internal/systems/custom/roller.go` | `evalFormula` / `evalFormulaDicePool` become thin wrappers; old loops deleted |
| `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` | `FieldDef.Formula`, `computed` type |
| `warhammer-battle-helper-front/src/systems/custom/formula/formula.js` (new) | JS parser, arithmetic evaluator, creator validation, `computeFieldValue` |
| `warhammer-battle-helper-front/src/components/creator/FormulaBuilder.jsx` | Parens, `number` block, `arithmeticOnly` mode, error highlight |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` | `computed` type, panel, `numericFields` |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | Render `computed` read-only |

---

### Task 1: Shared cases + Go parser + traditional tree walk

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/formula/formula_cases.json`
- Create: `warhammer-battle-helper-backend/internal/systems/custom/formula.go`
- Create: `warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go`
- Create: `warhammer-battle-helper-backend/internal/systems/custom/formula_test.go`

**Interfaces:**
- Produces:
  - `func parseFormula(blocks []models.FormulaBlock) (*formulaNode, error)` — error is `*FormulaError{Index int, Reason string}`
  - `type formulaNode struct { kind nodeKind; block models.FormulaBlock; index int; op string; left, right, count *formulaNode }` with kinds `nodeValue`, `nodeParen` (inner in `left`), `nodeBinop`, `nodeDice` (`count` nil = one die)
  - `func (p *Plugin) formulaEnv(stats *Stats, skillKey, linkedAttr string, baseFromAttr bool) *formulaEnv`
  - `func (e *formulaEnv) label(n *formulaNode) string` — notation side of the breakdown
  - `type tradWalk struct { env *formulaEnv; diceType int }`, `func (w *tradWalk) eval(n *formulaNode) (walked, error)`, `type walked struct { val int; shown string; pool bool }`
  - `func applyOp(op string, a, b, index int) (int, error)`, `func containsDice(n *formulaNode) bool`, `const maxDicePerTerm = 100`

- [ ] **Step 1: Write the shared cases file**

`warhammer-battle-helper-front/src/systems/custom/formula/formula_cases.json`:

```json
[
  { "name": "precedence: multiplication before addition",
    "blocks": [{"type":"const","num":10},{"type":"op","value":"+"},{"type":"const","num":25},{"type":"op","value":"*"},{"type":"const","num":2}],
    "expect": {"value": 60} },
  { "name": "precedence: multiplication already first",
    "blocks": [{"type":"const","num":25},{"type":"op","value":"*"},{"type":"const","num":2},{"type":"op","value":"+"},{"type":"const","num":10}],
    "expect": {"value": 60} },
  { "name": "precedence without parentheses is not an average",
    "blocks": [{"type":"attr","key":"str","label":"STR"},{"type":"op","value":"+"},{"type":"attr","key":"dex","label":"DEX"},{"type":"op","value":"/"},{"type":"const","num":2}],
    "attributes": {"str": 40, "dex": 30},
    "expect": {"value": 55} },
  { "name": "parentheses make an average",
    "blocks": [{"type":"paren_open"},{"type":"attr","key":"str","label":"STR"},{"type":"op","value":"+"},{"type":"attr","key":"dex","label":"DEX"},{"type":"paren_close"},{"type":"op","value":"/"},{"type":"const","num":2}],
    "attributes": {"str": 40, "dex": 30},
    "expect": {"value": 35} },
  { "name": "subtraction is left-associative",
    "blocks": [{"type":"const","num":20},{"type":"op","value":"-"},{"type":"const","num":6},{"type":"op","value":"-"},{"type":"const","num":4}],
    "expect": {"value": 10} },
  { "name": "parentheses regroup subtraction",
    "blocks": [{"type":"const","num":20},{"type":"op","value":"-"},{"type":"paren_open"},{"type":"const","num":6},{"type":"op","value":"-"},{"type":"const","num":4},{"type":"paren_close"}],
    "expect": {"value": 18} },
  { "name": "nested parentheses",
    "blocks": [{"type":"paren_open"},{"type":"paren_open"},{"type":"const","num":1},{"type":"op","value":"+"},{"type":"const","num":2},{"type":"paren_close"},{"type":"op","value":"*"},{"type":"const","num":3},{"type":"paren_close"}],
    "expect": {"value": 9} },
  { "name": "division truncates toward zero",
    "blocks": [{"type":"paren_open"},{"type":"const","num":0},{"type":"op","value":"-"},{"type":"const","num":7},{"type":"paren_close"},{"type":"op","value":"/"},{"type":"const","num":2}],
    "expect": {"value": -3} },
  { "name": "a negative fraction truncates to plain zero",
    "blocks": [{"type":"paren_open"},{"type":"const","num":0},{"type":"op","value":"-"},{"type":"const","num":1},{"type":"paren_close"},{"type":"op","value":"/"},{"type":"const","num":2}],
    "expect": {"value": 0} },
  { "name": "constant truncates toward zero",
    "blocks": [{"type":"const","num":-2.7}],
    "expect": {"value": -2} },
  { "name": "number block reads the numbers map",
    "blocks": [{"type":"attr","key":"str","label":"STR"},{"type":"op","value":"+"},{"type":"number","key":"load","label":"Load"}],
    "attributes": {"str": 40}, "numbers": {"load": 12},
    "expect": {"value": 52} },
  { "name": "a key without a value reads as zero",
    "blocks": [{"type":"attr","key":"str","label":"STR"},{"type":"op","value":"+"},{"type":"attr","key":"dex","label":"DEX"}],
    "attributes": {"str": 40},
    "expect": {"value": 40} },
  { "name": "division by zero",
    "blocks": [{"type":"const","num":6},{"type":"op","value":"/"},{"type":"const","num":0}],
    "expect": {"error": "division_by_zero", "index": 1} },
  { "name": "empty formula",
    "blocks": [],
    "expect": {"error": "empty", "index": 0} },
  { "name": "unclosed parenthesis",
    "blocks": [{"type":"paren_open"},{"type":"const","num":1},{"type":"op","value":"+"},{"type":"const","num":2}],
    "expect": {"error": "unclosed_paren", "index": 0} },
  { "name": "empty parentheses",
    "blocks": [{"type":"paren_open"},{"type":"paren_close"}],
    "expect": {"error": "unexpected_block", "index": 1} },
  { "name": "two values without an operator",
    "blocks": [{"type":"const","num":2},{"type":"const","num":3}],
    "expect": {"error": "trailing_blocks", "index": 1} },
  { "name": "extra closing parenthesis",
    "blocks": [{"type":"paren_open"},{"type":"const","num":1},{"type":"paren_close"},{"type":"paren_close"}],
    "expect": {"error": "trailing_blocks", "index": 3} },
  { "name": "values inside parentheses without an operator",
    "blocks": [{"type":"paren_open"},{"type":"const","num":1},{"type":"const","num":2},{"type":"paren_close"}],
    "expect": {"error": "unexpected_block", "index": 2} },
  { "name": "leading minus",
    "blocks": [{"type":"op","value":"-"},{"type":"const","num":3}],
    "expect": {"error": "unexpected_block", "index": 0} },
  { "name": "trailing operator",
    "blocks": [{"type":"const","num":1},{"type":"op","value":"+"}],
    "expect": {"error": "unexpected_end", "index": 2} },
  { "name": "unknown block type",
    "blocks": [{"type":"const","num":1},{"type":"op","value":"+"},{"type":"foo"}],
    "expect": {"error": "unknown_block", "index": 2} },
  { "name": "unknown operator",
    "blocks": [{"type":"const","num":1},{"type":"op","value":"%"},{"type":"const","num":2}],
    "expect": {"error": "unknown_block", "index": 1} },
  { "name": "bare dice chain",
    "blocks": [{"type":"dice","value":"d6"},{"type":"op","value":"d"},{"type":"dice","value":"d10"}],
    "expect": {"error": "dice_chain", "index": 1} },
  { "name": "dice chain after a count",
    "blocks": [{"type":"const","num":3},{"type":"op","value":"d"},{"type":"dice","value":"d6"},{"type":"op","value":"d"},{"type":"dice","value":"d10"}],
    "expect": {"error": "dice_chain", "index": 3} },
  { "name": "a die as the count needs parentheses",
    "blocks": [{"type":"paren_open"},{"type":"dice","value":"d6"},{"type":"paren_close"},{"type":"op","value":"d"},{"type":"dice","value":"d10"}],
    "expect": {"valid": true} },
  { "name": "d binds tighter than multiplication",
    "blocks": [{"type":"const","num":2},{"type":"op","value":"*"},{"type":"const","num":3},{"type":"op","value":"d"},{"type":"dice","value":"d6"}],
    "expect": {"valid": true} },
  { "name": "d must be followed by a die",
    "blocks": [{"type":"const","num":3},{"type":"op","value":"d"},{"type":"const","num":5}],
    "expect": {"error": "expected_die", "index": 2} },
  { "name": "d at the end",
    "blocks": [{"type":"const","num":3},{"type":"op","value":"d"}],
    "expect": {"error": "unexpected_end", "index": 2} }
]
```

- [ ] **Step 2: Write the failing Go tests**

`warhammer-battle-helper-backend/internal/systems/custom/formula_test.go`:

```go
package custom

import (
	"battle-helper/internal/models"
	"encoding/json"
	"errors"
	"os"
	"testing"
)

// formulaCasesPath is the cross-language contract shared with the front end's formula.test.js.
// Both parsers must agree on every case — value, or error reason AND block index.
const formulaCasesPath = "../../../../warhammer-battle-helper-front/src/systems/custom/formula/formula_cases.json"

type formulaCase struct {
	Name       string                `json:"name"`
	Blocks     []models.FormulaBlock `json:"blocks"`
	Attributes map[string]int        `json:"attributes"`
	Numbers    map[string]int        `json:"numbers"`
	Expect     struct {
		Value *int   `json:"value"`
		Valid bool   `json:"valid"`
		Error string `json:"error"`
		Index int    `json:"index"`
	} `json:"expect"`
}

func loadFormulaCases(t *testing.T) []formulaCase {
	t.Helper()
	raw, err := os.ReadFile(formulaCasesPath)
	if err != nil {
		t.Fatalf("read %s: %v", formulaCasesPath, err)
	}
	var cases []formulaCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode %s: %v", formulaCasesPath, err)
	}
	return cases
}

func caseStats(c formulaCase) *Stats {
	attrs := map[string]AttrValue{}
	for k, v := range c.Attributes {
		attrs[k] = AttrValue{Current: v}
	}
	return &Stats{Attributes: attrs, Numbers: c.Numbers}
}

func TestFormulaCases(t *testing.T) {
	for _, c := range loadFormulaCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			root, err := parseFormula(c.Blocks)
			// "valid" cases contain dice: only the parser is under test, nothing is rolled.
			if err == nil && !c.Expect.Valid {
				// newTestPlugin() with no values panics on any roll — an arithmetic case must not roll.
				env := newTestPlugin().formulaEnv(caseStats(c), "", "", false)
				var out walked
				out, err = (&tradWalk{env: env}).eval(root)
				if err == nil && c.Expect.Value != nil && out.val != *c.Expect.Value {
					t.Errorf("value = %d, want %d", out.val, *c.Expect.Value)
				}
			}
			if c.Expect.Error == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			var fe *FormulaError
			if !errors.As(err, &fe) {
				t.Fatalf("err = %v, want %s@%d", err, c.Expect.Error, c.Expect.Index)
			}
			if fe.Reason != c.Expect.Error || fe.Index != c.Expect.Index {
				t.Errorf("got %s@%d, want %s@%d", fe.Reason, fe.Index, c.Expect.Error, c.Expect.Index)
			}
		})
	}
}

func evalTrad(t *testing.T, p *Plugin, stats *Stats, blocks []models.FormulaBlock) (walked, string, int) {
	t.Helper()
	root, err := parseFormula(blocks)
	if err != nil {
		t.Fatalf("parseFormula: %v", err)
	}
	env := p.formulaEnv(stats, "", "", false)
	w := &tradWalk{env: env}
	out, err := w.eval(root)
	if err != nil {
		t.Fatalf("eval: %v", err)
	}
	return out, env.label(root), w.diceType
}

var (
	parenOpen  = models.FormulaBlock{Type: "paren_open"}
	parenClose = models.FormulaBlock{Type: "paren_close"}
	strBlock   = models.FormulaBlock{Type: "attr", Key: "str", Label: "STR"}
)

func strStats(v int) *Stats { return &Stats{Attributes: map[string]AttrValue{"str": {Current: v}}} }

func TestTradWalk_BreakdownKeepsTheGMsParentheses(t *testing.T) {
	p := newTestPlugin(3) // d6 -> 4
	blocks := []models.FormulaBlock{parenOpen, strBlock, opBlock("+"), numBlock(2), parenClose, opBlock("*"), diceBlock("d6")}
	out, label, diceType := evalTrad(t, p, strStats(40), blocks)
	if out.val != 168 || label != "(STR+2)*d6" || out.shown != "(40+2)*4" || diceType != 6 {
		t.Errorf("got %d %q %q dice=%d, want 168 \"(STR+2)*d6\" \"(40+2)*4\" 6", out.val, label, out.shown, diceType)
	}
}

func TestTradWalk_DBindsTighterThanMultiplication(t *testing.T) {
	p := newTestPlugin(3, 5, 1) // 4, 6, 2
	blocks := []models.FormulaBlock{numBlock(2), opBlock("*"), numBlock(3), opBlock("d"), diceBlock("d6")}
	out, label, _ := evalTrad(t, p, strStats(0), blocks)
	// The pool's sum is wrapped: "2*4+6+2" would read as 16, not 24.
	if out.val != 24 || label != "2*3d6" || out.shown != "2*(4+6+2)" {
		t.Errorf("got %d %q %q, want 24 \"2*3d6\" \"2*(4+6+2)\"", out.val, label, out.shown)
	}
}

func TestTradWalk_PoolWrappingFollowsTheOperator(t *testing.T) {
	t.Run("left of plus stays bare", func(t *testing.T) {
		p := newTestPlugin(3, 5) // 4, 6
		out, _, _ := evalTrad(t, p, strStats(0), []models.FormulaBlock{numBlock(2), opBlock("d"), diceBlock("d6"), opBlock("+"), numBlock(1)})
		if out.val != 11 || out.shown != "4+6+1" {
			t.Errorf("got %d %q, want 11 \"4+6+1\"", out.val, out.shown)
		}
	})
	t.Run("right of minus is wrapped", func(t *testing.T) {
		p := newTestPlugin(3, 5) // 4, 6
		out, _, _ := evalTrad(t, p, strStats(0), []models.FormulaBlock{numBlock(10), opBlock("-"), numBlock(2), opBlock("d"), diceBlock("d6")})
		if out.val != 0 || out.shown != "10-(4+6)" {
			t.Errorf("got %d %q, want 0 \"10-(4+6)\"", out.val, out.shown)
		}
	})
}

func TestTradWalk_CountIsAnExpression(t *testing.T) {
	p := newTestPlugin(0, 1, 2, 3) // 1, 2, 3, 4
	blocks := []models.FormulaBlock{parenOpen, strBlock, opBlock("/"), numBlock(10), parenClose, opBlock("d"), diceBlock("d6")}
	out, label, _ := evalTrad(t, p, strStats(40), blocks)
	if out.val != 10 || label != "(STR/10)d6" || out.shown != "1+2+3+4" {
		t.Errorf("got %d %q %q, want 10 \"(STR/10)d6\" \"1+2+3+4\"", out.val, label, out.shown)
	}
}

func TestTradWalk_CountBelowOneRollsOneDie(t *testing.T) {
	p := newTestPlugin(3) // exactly one roll, or seqRoller panics
	out, _, _ := evalTrad(t, p, strStats(0), []models.FormulaBlock{numBlock(0), opBlock("d"), diceBlock("d6")})
	if out.val != 4 {
		t.Errorf("val = %d, want 4", out.val)
	}
}

func TestTradWalk_TooManyDice(t *testing.T) {
	root, err := parseFormula([]models.FormulaBlock{numBlock(101), opBlock("d"), diceBlock("d6")})
	if err != nil {
		t.Fatalf("parseFormula: %v", err)
	}
	_, err = (&tradWalk{env: newTestPlugin().formulaEnv(strStats(0), "", "", false)}).eval(root)
	var fe *FormulaError
	if !errors.As(err, &fe) || fe.Reason != reasonTooManyDice || fe.Index != 2 {
		t.Errorf("err = %v, want too_many_dice@2", err)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `go test ./internal/systems/custom/ -run 'TestFormulaCases|TestTradWalk' -v`
Expected: build failure — `undefined: parseFormula`, `undefined: tradWalk`.

- [ ] **Step 4: Write the parser**

`warhammer-battle-helper-backend/internal/systems/custom/formula.go`:

```go
package custom

import (
	"battle-helper/internal/models"
	"fmt"
)

// Error reasons are shared verbatim with the front end's parser
// (src/systems/custom/formula/formula.js) and pinned by formula_cases.json: change a reason or
// the index a parser reports on one side and the other side's test goes red.
const (
	reasonEmpty           = "empty"
	reasonUnknownBlock    = "unknown_block"
	reasonUnexpectedBlock = "unexpected_block"
	reasonUnexpectedEnd   = "unexpected_end"
	reasonUnclosedParen   = "unclosed_paren"
	reasonExpectedDie     = "expected_die"
	reasonDiceChain       = "dice_chain"
	reasonTrailingBlocks  = "trailing_blocks"
	reasonDivisionByZero  = "division_by_zero"
	reasonTooManyDice     = "too_many_dice"
)

// FormulaError says why a formula failed and at which block, so the creator can point at it.
type FormulaError struct {
	Index  int
	Reason string
}

func (e *FormulaError) Error() string {
	return fmt.Sprintf("formula %s at block %d", e.Reason, e.Index)
}

type nodeKind int

const (
	nodeValue nodeKind = iota
	nodeParen
	nodeBinop
	nodeDice
)

// formulaNode is one node of a parsed formula. nodeParen exists only so the breakdown can show
// the parentheses the GM wrote; it has no effect on the value.
type formulaNode struct {
	kind  nodeKind
	block models.FormulaBlock // nodeValue: the value block; nodeDice: the die block
	index int                 // source position of the block (value, die) or of the operator (binop)
	op    string              // nodeBinop
	left  *formulaNode        // nodeBinop left operand; nodeParen inner expression
	right *formulaNode        // nodeBinop right operand
	count *formulaNode        // nodeDice: how many dice; nil means one
}

var (
	valueBlockTypes = map[string]bool{"const": true, "attr": true, "number": true, "skill": true, "attr_linked": true, "const_input": true}
	dieBlockTypes   = map[string]bool{"dice": true, "dice_attr": true, "dice_skill_attr": true}
	opValues        = map[string]bool{"+": true, "-": true, "*": true, "/": true, "d": true}
)

func knownBlock(b models.FormulaBlock) bool {
	switch b.Type {
	case "op":
		return opValues[b.Value]
	case "paren_open", "paren_close":
		return true
	}
	return valueBlockTypes[b.Type] || dieBlockTypes[b.Type]
}

// parseFormula turns the creator's block list into a tree, by recursive descent over:
//
//	expression := term   ( ('+' | '-') term )*
//	term       := factor ( ('*' | '/') factor )*
//	factor     := atom [ 'd' die ] | die
//	atom       := value | '(' expression ')'
//
// Each level binds tighter than the one above it, which is the whole of operator precedence.
// Every block must be consumed — a parser that stopped early and returned what it had would
// show the GM a number for a formula it silently half-ignored.
func parseFormula(blocks []models.FormulaBlock) (*formulaNode, error) {
	if len(blocks) == 0 {
		return nil, &FormulaError{Index: 0, Reason: reasonEmpty}
	}
	for i, b := range blocks {
		if !knownBlock(b) {
			return nil, &FormulaError{Index: i, Reason: reasonUnknownBlock}
		}
	}
	p := &formulaParser{blocks: blocks}
	root, err := p.expression()
	if err != nil {
		return nil, err
	}
	if p.pos < len(blocks) {
		return nil, &FormulaError{Index: p.pos, Reason: reasonTrailingBlocks}
	}
	return root, nil
}

type formulaParser struct {
	blocks []models.FormulaBlock
	pos    int
}

func (p *formulaParser) peek() *models.FormulaBlock {
	if p.pos < len(p.blocks) {
		return &p.blocks[p.pos]
	}
	return nil
}

func (p *formulaParser) isOp(values ...string) bool {
	b := p.peek()
	if b == nil || b.Type != "op" {
		return false
	}
	for _, v := range values {
		if b.Value == v {
			return true
		}
	}
	return false
}

func (p *formulaParser) fail(reason string) error {
	return &FormulaError{Index: p.pos, Reason: reason}
}

func (p *formulaParser) expression() (*formulaNode, error) {
	return p.binary(p.term, "+", "-")
}

func (p *formulaParser) term() (*formulaNode, error) {
	return p.binary(p.factor, "*", "/")
}

// binary folds `operand (op operand)*` to the left, so 20-6-4 is (20-6)-4.
func (p *formulaParser) binary(operand func() (*formulaNode, error), ops ...string) (*formulaNode, error) {
	left, err := operand()
	if err != nil {
		return nil, err
	}
	for p.isOp(ops...) {
		index := p.pos
		op := p.blocks[p.pos].Value
		p.pos++
		right, err := operand()
		if err != nil {
			return nil, err
		}
		left = &formulaNode{kind: nodeBinop, op: op, index: index, left: left, right: right}
	}
	return left, nil
}

func (p *formulaParser) factor() (*formulaNode, error) {
	b := p.peek()
	if b == nil {
		return nil, p.fail(reasonUnexpectedEnd)
	}
	if dieBlockTypes[b.Type] {
		return p.die(nil)
	}
	count, err := p.atom()
	if err != nil {
		return nil, err
	}
	if !p.isOp("d") {
		return count, nil
	}
	p.pos++
	next := p.peek()
	if next == nil {
		return nil, p.fail(reasonUnexpectedEnd)
	}
	if !dieBlockTypes[next.Type] {
		return nil, p.fail(reasonExpectedDie)
	}
	return p.die(count)
}

// die consumes one die block. A "d" right after a die is a chain (d6 d d10): the die count
// must then be written as an atom, (d6) d d10, so the grammar never has to guess.
func (p *formulaParser) die(count *formulaNode) (*formulaNode, error) {
	node := &formulaNode{kind: nodeDice, block: p.blocks[p.pos], index: p.pos, count: count}
	p.pos++
	if p.isOp("d") {
		return nil, p.fail(reasonDiceChain)
	}
	return node, nil
}

func (p *formulaParser) atom() (*formulaNode, error) {
	b := p.peek() // factor has already checked that a block exists
	if b.Type == "paren_open" {
		start := p.pos
		p.pos++
		inner, err := p.expression()
		if err != nil {
			return nil, err
		}
		closing := p.peek()
		if closing == nil {
			return nil, &FormulaError{Index: start, Reason: reasonUnclosedParen}
		}
		if closing.Type != "paren_close" {
			return nil, p.fail(reasonUnexpectedBlock)
		}
		p.pos++
		return &formulaNode{kind: nodeParen, left: inner}, nil
	}
	if valueBlockTypes[b.Type] {
		node := &formulaNode{kind: nodeValue, block: *b, index: p.pos}
		p.pos++
		return node, nil
	}
	return nil, p.fail(reasonUnexpectedBlock)
}
```

- [ ] **Step 5: Write the environment and the traditional walk**

`warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go`:

```go
package custom

import (
	"battle-helper/internal/models"
	"fmt"
	"strconv"
	"strings"
)

// maxDicePerTerm caps one "d" node. With parentheses a count can be any expression, and
// (STR * 100) d d6 would otherwise roll thousands of dice in one request.
const maxDicePerTerm = 100

// formulaEnv resolves blocks against one character for one roll.
type formulaEnv struct {
	stats        *Stats
	skillKey     string
	linkedAttr   string
	baseFromAttr bool
	roll         func(sides int) int
}

func (p *Plugin) formulaEnv(stats *Stats, skillKey, linkedAttr string, baseFromAttr bool) *formulaEnv {
	return &formulaEnv{
		stats: stats, skillKey: skillKey, linkedAttr: linkedAttr, baseFromAttr: baseFromAttr,
		roll: func(sides int) int { return p.rng.Intn(sides) + 1 },
	}
}

func blockLabel(b models.FormulaBlock) string {
	if b.Label != "" {
		return b.Label
	}
	return b.Key
}

// blockValue resolves a value block to its number and its breakdown label.
func (e *formulaEnv) blockValue(b models.FormulaBlock) (int, string) {
	switch b.Type {
	case "const":
		v := 0
		if b.Num != nil {
			v = int(*b.Num) // truncates toward zero; the front end mirrors it with Math.trunc
		}
		return v, strconv.Itoa(v)
	case "attr":
		return e.stats.Attributes[b.Key].Current, blockLabel(b)
	case "number":
		return e.stats.Numbers[b.Key], blockLabel(b)
	case "skill":
		return skillValue(e.stats, e.skillKey, e.linkedAttr, e.baseFromAttr), "umiej."
	case "attr_linked":
		label := e.linkedAttr
		if label == "" {
			label = "0"
		}
		return e.stats.Attributes[e.linkedAttr].Current, label
	}
	// const_input: applyDamageOverrides turns it into a const before any walk, so reaching
	// here means an unfilled player number — the same 0 the sheet's safety net assumes.
	return 0, "0"
}

// dieSides resolves a die block to its face count and, when the faces are computed, the
// source expression shown in the breakdown ("" for a literal die such as d6).
func (e *formulaEnv) dieSides(b models.FormulaBlock) (int, string) {
	switch b.Type {
	case "dice_attr":
		sides := e.stats.Attributes[b.Key].Current
		if sides < 1 {
			sides = 1
		}
		return sides, blockLabel(b)
	case "dice_skill_attr":
		av := e.stats.Attributes[e.linkedAttr].Current
		sv := skillValue(e.stats, e.skillKey, e.linkedAttr, e.baseFromAttr)
		sides := av + sv
		if sides < 1 {
			sides = 1
		}
		if e.linkedAttr == "" {
			return sides, strconv.Itoa(sv)
		}
		return sides, fmt.Sprintf("%d+%d", av, sv)
	}
	return diceNotationToSides(b.Value), ""
}

// label renders the notation side of the breakdown ("(STR+2)*d6"). It never rolls.
func (e *formulaEnv) label(n *formulaNode) string {
	switch n.kind {
	case nodeValue:
		_, l := e.blockValue(n.block)
		return l
	case nodeParen:
		return "(" + e.label(n.left) + ")"
	case nodeBinop:
		return e.label(n.left) + n.op + e.label(n.right)
	}
	die := n.block.Value
	if _, sidesLabel := e.dieSides(n.block); sidesLabel != "" {
		die = "d(" + sidesLabel + ")"
	}
	if n.count == nil {
		return die
	}
	return e.label(n.count) + die
}

func containsDice(n *formulaNode) bool {
	if n == nil {
		return false
	}
	return n.kind == nodeDice || containsDice(n.left) || containsDice(n.right)
}

func applyOp(op string, a, b, index int) (int, error) {
	switch op {
	case "+":
		return a + b, nil
	case "-":
		return a - b, nil
	case "*":
		return a * b, nil
	}
	if b == 0 {
		return 0, &FormulaError{Index: index, Reason: reasonDivisionByZero}
	}
	return a / b, nil // truncates toward zero; the front end mirrors it with Math.trunc
}

// diceCount clamps a computed count: below one rolls one die (a zero-dice roll reads as a bug),
// above the cap is an error rather than a silent cut.
func diceCount(count, index int) (int, error) {
	if count < 1 {
		count = 1
	}
	if count > maxDicePerTerm {
		return 0, &FormulaError{Index: index, Reason: reasonTooManyDice}
	}
	return count, nil
}

// walked is one subtree's result in traditional mode. shown is the resolved-values side of
// the breakdown ("(40+2)*4"); pool marks a multi-die sum, whose "4+6" would misread as an
// operand of *, / or a right-hand -.
type walked struct {
	val   int
	shown string
	pool  bool
}

// tradWalk evaluates a tree for traditional mode: one number plus its breakdown. diceType is
// the face count of the first die rolled, for display.
type tradWalk struct {
	env      *formulaEnv
	diceType int
}

func (w *tradWalk) eval(n *formulaNode) (walked, error) {
	switch n.kind {
	case nodeValue:
		v, _ := w.env.blockValue(n.block)
		return walked{val: v, shown: strconv.Itoa(v)}, nil
	case nodeParen:
		inner, err := w.eval(n.left)
		if err != nil {
			return walked{}, err
		}
		return walked{val: inner.val, shown: "(" + inner.shown + ")"}, nil
	case nodeBinop:
		l, err := w.eval(n.left)
		if err != nil {
			return walked{}, err
		}
		r, err := w.eval(n.right)
		if err != nil {
			return walked{}, err
		}
		v, err := applyOp(n.op, l.val, r.val, n.index)
		if err != nil {
			return walked{}, err
		}
		ls, rs := l.shown, r.shown
		if l.pool && (n.op == "*" || n.op == "/") {
			ls = "(" + ls + ")"
		}
		if r.pool && n.op != "+" {
			rs = "(" + rs + ")"
		}
		return walked{val: v, shown: ls + n.op + rs}, nil
	}

	count := 1
	if n.count != nil {
		// The count's own value is not shown: the breakdown reads "2d6 = 4+6", as before.
		c, err := w.eval(n.count)
		if err != nil {
			return walked{}, err
		}
		count = c.val
	}
	count, err := diceCount(count, n.index)
	if err != nil {
		return walked{}, err
	}
	sides, _ := w.env.dieSides(n.block)
	if w.diceType == 0 {
		w.diceType = sides
	}
	total := 0
	rolls := make([]string, count)
	for i := range rolls {
		r := w.env.roll(sides)
		total += r
		rolls[i] = strconv.Itoa(r)
	}
	return walked{val: total, shown: strings.Join(rolls, "+"), pool: count > 1}, nil
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./internal/systems/custom/ -run 'TestFormulaCases|TestTradWalk' -v`
Expected: PASS, every shared case listed by name. `go vet ./internal/systems/custom/` clean.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/formula/formula_cases.json \
  warhammer-battle-helper-backend/internal/systems/custom/formula.go \
  warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go \
  warhammer-battle-helper-backend/internal/systems/custom/formula_test.go
git commit -m "feat: PLAYRPG-232 formula parser with precedence and parentheses"
```

---

### Task 2: Traditional rolls and weapon damage go through the tree

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go` (`evalFormula`, lines ~99-274)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`, `weapon_test.go`

**Interfaces:**
- Consumes: `parseFormula`, `(*Plugin).formulaEnv`, `tradWalk`, `(*formulaEnv).label` from Task 1.
- Produces: `evalFormula` keeps its signature `(blocks, stats, skillKey, linkedAttr, baseFromAttr) (result, diceType int, labelStr, valueStr string, err error)` — `rollFromFormula` and `weapon.go:52` stay untouched.

- [ ] **Step 1: Write the failing test**

Append to `roller_test.go`:

```go
func TestEvalFormula_Precedence(t *testing.T) {
	// d6 -> 4: 10 + 4*5 = 30. The old left-to-right fold gave (10+4)*5 = 70.
	p := newTestPlugin(3)
	blocks := []models.FormulaBlock{numBlock(10), opBlock("+"), diceBlock("d6"), opBlock("*"), numBlock(5)}
	res, _, label, val, err := p.evalFormula(blocks, sampleStats(), "", "", false)
	if err != nil {
		t.Fatalf("evalFormula() error: %v", err)
	}
	if res != 30 || label != "10+d6*5" || val != "10+4*5" {
		t.Errorf("got %d %q %q, want 30 \"10+d6*5\" \"10+4*5\"", res, label, val)
	}
}

func TestEvalFormula_NumberBlock(t *testing.T) {
	stats := sampleStats()
	stats.Numbers = map[string]int{"load": 7}
	blocks := []models.FormulaBlock{{Type: "attr", Key: "str", Label: "STR"}, opBlock("+"), {Type: "number", Key: "load", Label: "Load"}}
	res, _, label, _, err := newTestPlugin().evalFormula(blocks, stats, "", "", false)
	if err != nil || res != 15 || label != "STR+Load" {
		t.Errorf("got %d %q err=%v, want 15 \"STR+Load\"", res, label, err)
	}
}

func TestEvalFormula_RejectsMalformedFormula(t *testing.T) {
	blocks := []models.FormulaBlock{numBlock(2), numBlock(3)}
	if _, _, _, _, err := newTestPlugin().evalFormula(blocks, sampleStats(), "", "", false); err == nil {
		t.Error("expected trailing_blocks error, got nil — the old loop silently added 2+3")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/systems/custom/ -run 'TestEvalFormula_(Precedence|NumberBlock|RejectsMalformedFormula)' -v`
Expected: FAIL — `got 70 …`, `got 8 …` (number block skipped), `expected trailing_blocks error`.

- [ ] **Step 3: Replace `evalFormula`**

In `roller.go`, replace the whole function from the comment `// evalFormula evaluates the formula blocks left-to-right and returns:` through its closing `}` (the `return res, diceType, strings.Join(labelParts, ""), …` line and the brace after it) with:

```go
// evalFormula parses the formula blocks and evaluates them with operator precedence and
// parentheses (see parseFormula). It returns:
//   - result: the computed integer value
//   - diceType: faces of the first die rolled (for display)
//   - labelStr: formula notation string, e.g. "(STR+2)*d6"
//   - valueStr: resolved values string, e.g. "(8+2)*4"
func (p *Plugin) evalFormula(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, baseFromAttr bool) (result, diceType int, labelStr, valueStr string, err error) {
	root, err := parseFormula(blocks)
	if err != nil {
		return 0, 0, "", "", err
	}
	env := p.formulaEnv(stats, skillKey, linkedAttr, baseFromAttr)
	w := &tradWalk{env: env}
	out, err := w.eval(root)
	if err != nil {
		return 0, 0, "", "", err
	}
	return out.val, w.diceType, env.label(root), out.shown, nil
}
```

Then delete `evalDicePool` (the `// evalDicePool rolls count dice using rollFn…` function) — `tradWalk` rolls its own dice. Keep `evalDicePoolInts` for now; Task 3 removes it.

- [ ] **Step 4: Run the whole package and fix fallout**

Run: `go test ./internal/systems/custom/ -v 2>&1 | grep -E '^(--- FAIL|FAIL|ok)'`

Expected fallout and the fix for each:
- `TestEvalDicePool` — tests the deleted helper. Delete the test function.
- Any test whose expected value assumed left-to-right folding: update the expected value to the precedence result and add a one-line comment `// precedence (PLAYRPG-232): <old> → <new>`. Do not change the formula.
- Any test with two values side by side and no operator (the old loop added them): insert `opBlock("+")` between them so the test keeps checking what it was written for.

Re-run until `ok`. Then run `go vet ./internal/systems/custom/` — `strings` / `strconv` imports in `roller.go` must still be used (they are, by `diceNotationToSides` and `evalThreshold`).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/roller.go \
  warhammer-battle-helper-backend/internal/systems/custom/roller_test.go \
  warhammer-battle-helper-backend/internal/systems/custom/weapon_test.go
git commit -m "refactor: PLAYRPG-232 traditional rolls evaluate the parsed formula tree"
```

---

### Task 3: Dice-pool mode goes through the tree

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/formula_eval.go` (add `poolWalk`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go` (`evalFormulaDicePool`, `evalDicePoolInts`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`

**Interfaces:**
- Consumes: Task 1 tree, `formulaEnv`, `tradWalk`, `diceCount`, `applyOp`, `containsDice`.
- Produces: `evalFormulaDicePool` keeps its signature `(blocks, stats, skillKey, linkedAttr, baseFromAttr, extraDice) (parts []gsys.PoolFormulaPart, diceType int, err error)`.

- [ ] **Step 1: Write the failing tests / update the obsolete ones**

In `roller_test.go`, inside `TestEvalFormulaDicePool_BlockTypes`:

Replace the `"non-dice blocks contribute no rolls"` subtest's `blocks` with a well-formed formula (the old one had values side by side, which the parser now rejects):

```go
		blocks := []models.FormulaBlock{
			{Type: "attr", Key: "str", Label: "STR"},
			opBlock("+"),
			{Type: "skill"},
			opBlock("+"),
			{Type: "attr_linked"},
			opBlock("+"),
			numBlock(2),
		}
```

Replace the `"die used as the count stays in the formula"` subtest with:

```go
	t.Run("die used as the count stays in the formula", func(t *testing.T) {
		// (d6) -> 2 decides the count, then two d10 -> 7, 3. The bare chain d6 d d10 is
		// rejected since PLAYRPG-232; the parentheses say what the GM meant.
		p := newTestPlugin(1, 6, 2)
		blocks := []models.FormulaBlock{
			{Type: "paren_open"}, diceBlock("d6"), {Type: "paren_close"}, opBlock("d"), diceBlock("d10"),
		}
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "", false, 0)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{
			{Kind: "text", Text: "("},
			{Kind: "dice", Sides: 6, Rolls: []int{2}},
			{Kind: "text", Text: ")"},
			{Kind: "dice", Sides: 10, Rolls: []int{7, 3}},
		}
		if !reflect.DeepEqual(parts, want) {
			t.Errorf("parts = %+v, want %+v", parts, want)
		}
	})

	t.Run("an expression count folds into the count label", func(t *testing.T) {
		p := newTestPlugin(0, 1, 2, 3) // four d10 -> 1, 2, 3, 4
		statsStr := &Stats{Attributes: map[string]AttrValue{"str": {Current: 40}}}
		blocks := []models.FormulaBlock{
			{Type: "paren_open"}, {Type: "attr", Key: "str", Label: "STR"}, opBlock("/"), numBlock(10), {Type: "paren_close"},
			opBlock("d"), diceBlock("d10"),
		}
		parts, _, err := p.evalFormulaDicePool(blocks, statsStr, "", "", false, 0)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{{Kind: "dice", Sides: 10, CountLabel: "(STR/10)", Rolls: []int{1, 2, 3, 4}}}
		if !reflect.DeepEqual(parts, want) {
			t.Errorf("parts = %+v, want %+v", parts, want)
		}
	})

	t.Run("too many dice is an error", func(t *testing.T) {
		blocks := []models.FormulaBlock{numBlock(101), opBlock("d"), diceBlock("d6")}
		if _, _, err := newTestPlugin().evalFormulaDicePool(blocks, stats, "", "", false, 0); err == nil {
			t.Error("expected too_many_dice error, got nil")
		}
	})
```

Delete `TestEvalDicePoolInts` (its helper goes away in Step 3).

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/systems/custom/ -run TestEvalFormulaDicePool_BlockTypes -v`
Expected: FAIL in the three changed/new subtests (old loop has no paren handling and no limit).

- [ ] **Step 3: Add `poolWalk` and replace `evalFormulaDicePool`**

Append to `formula_eval.go` (add `gsys "battle-helper/internal/systems"` to its imports):

```go
// poolWalk evaluates a tree for dice-pool mode: the result is the formula as parts, every die
// term carrying its own rolls. Arithmetic matters only where it decides a die count.
type poolWalk struct {
	env          *formulaEnv
	parts        []gsys.PoolFormulaPart
	diceType     int
	extraDice    int
	extraApplied bool
}

func (w *poolWalk) text(s string) {
	w.parts = append(w.parts, gsys.PoolFormulaPart{Kind: "text", Text: s})
}

func (w *poolWalk) eval(n *formulaNode) (int, error) {
	switch n.kind {
	case nodeValue:
		v, l := w.env.blockValue(n.block)
		w.text(l)
		return v, nil
	case nodeParen:
		w.text("(")
		v, err := w.eval(n.left)
		if err != nil {
			return 0, err
		}
		w.text(")")
		return v, nil
	case nodeBinop:
		l, err := w.eval(n.left)
		if err != nil {
			return 0, err
		}
		w.text(n.op)
		r, err := w.eval(n.right)
		if err != nil {
			return 0, err
		}
		return applyOp(n.op, l, r, n.index)
	}

	count, countLabel := 1, ""
	switch {
	case n.count == nil:
	case containsDice(n.count):
		// A die deciding the count keeps its own rolls on screen, so the count renders as
		// parts of its own ahead of this term instead of folding into a label.
		c, err := w.eval(n.count)
		if err != nil {
			return 0, err
		}
		count = c
	default:
		c, err := (&tradWalk{env: w.env}).eval(n.count)
		if err != nil {
			return 0, err
		}
		count, countLabel = c.val, w.env.label(n.count)
	}

	sides, sidesLabel := w.env.dieSides(n.block)
	if w.diceType == 0 {
		w.diceType = sides
	}
	// The pool-size modifier is absorbed by the first die term — the one that defines diceType.
	if !w.extraApplied {
		w.extraApplied = true
		count += w.extraDice
	}
	count, err := diceCount(count, n.index)
	if err != nil {
		return 0, err
	}
	rolls := make([]int, count)
	total := 0
	for i := range rolls {
		rolls[i] = w.env.roll(sides)
		total += rolls[i]
	}
	w.parts = append(w.parts, gsys.PoolFormulaPart{
		Kind: "dice", Sides: sides, SidesLabel: sidesLabel, CountLabel: countLabel, Rolls: rolls,
	})
	return total, nil
}
```

In `roller.go`, replace the whole `evalFormulaDicePool` function (from its doc comment `// evalFormulaDicePool evaluates the formula for dice-pool mode.` to its closing brace) with:

```go
// evalFormulaDicePool evaluates the formula for dice-pool mode. extraDice (the pool-size
// modifier) is absorbed by the FIRST die term only — the one that defines the displayed
// diceType — and the resulting count is floored at 1; later terms keep their configured
// counts. It returns the formula as a list of parts — text fragments and die terms carrying
// their own rolls — plus the face count of the first die rolled (display only).
func (p *Plugin) evalFormulaDicePool(blocks []models.FormulaBlock, stats *Stats, skillKey, linkedAttr string, baseFromAttr bool, extraDice int) (parts []gsys.PoolFormulaPart, diceType int, err error) {
	root, err := parseFormula(blocks)
	if err != nil {
		return nil, 0, err
	}
	w := &poolWalk{env: p.formulaEnv(stats, skillKey, linkedAttr, baseFromAttr), extraDice: extraDice}
	if _, err := w.eval(root); err != nil {
		return nil, 0, err
	}
	return w.parts, w.diceType, nil
}
```

Delete `evalDicePoolInts`.

- [ ] **Step 4: Run the whole package**

Run: `go test ./internal/systems/custom/ ./internal/service/ -v 2>&1 | grep -E '^(--- FAIL|FAIL|ok)'` and `go vet ./internal/systems/custom/`
Expected: `ok` for both packages. If a pool test written for left-to-right folding fails, apply the Task 2 Step 4 rules.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/
git commit -m "refactor: PLAYRPG-232 dice-pool mode evaluates the parsed formula tree"
```

---

### Task 4: `FieldDef.Formula` survives a template save

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:219-221` and the `Default` comment (~line 236)
- Test: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`

**Interfaces:**
- Produces: JSON/BSON key `formula` on a field: `[]FormulaBlock`.

- [ ] **Step 1: Write the failing test**

Append to `SystemTemplate_test.go` (add `encoding/json` to imports if absent):

```go
// A computed field's formula is evaluated only in the browser, but the template PATCH binds
// JSON into FieldDef: a key the struct does not declare is dropped on save, silently.
func TestFieldDef_ComputedFormulaRoundTrips(t *testing.T) {
	in := `{"key":"computed_1","type":"computed","label":"HP","default":5,
	        "formula":[{"id":"a","type":"attr","key":"tough","label":"T"},{"id":"b","type":"op","value":"*"},{"id":"c","type":"const","num":2}]}`
	var f FieldDef
	if err := json.Unmarshal([]byte(in), &f); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back FieldDef
	if err := json.Unmarshal(out, &back); err != nil {
		t.Fatalf("unmarshal back: %v", err)
	}
	if len(back.Formula) != 3 || back.Formula[0].Key != "tough" || back.Default == nil || *back.Default != 5 {
		t.Errorf("round trip lost data: %+v", back)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/models/ -run TestFieldDef_ComputedFormulaRoundTrips -v`
Expected: build failure `back.Formula undefined`.

- [ ] **Step 3: Add the field**

In `FieldDef`, update the `Type` comment to include `computed`:

```go
	Type  string `bson:"type" json:"type"` // "attr"|"number"|"computed"|"progress"|"text_short"|"text_long"|"checkbox"|"select"|"skill_table"|"skill_tree"|"weapons_table"|"label"|"section"
```

Change the first line of the `Default` comment to:

```go
	// Default is the value written into a freshly created character's stats for this field
	// ("attr" and "number" only). For "computed" it is never written anywhere: the sheet shows it
	// when the formula cannot be evaluated. Nil = no default; the character starts with the key absent,
```

(keep the rest of that comment as is). Directly above the `Section *SectionDef` field add:

```go
	// Formula is the expression of a "computed" field. The front end evaluates it at render time
	// from the character's attributes and numbers and never stores the result — Go only has to
	// carry it through a template save.
	Formula []FormulaBlock `bson:"formula,omitempty" json:"formula,omitempty"`
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/models/ ./internal/systems/custom/ -v 2>&1 | grep -E '^(--- FAIL|FAIL|ok)'`
Expected: `ok` both. (`TestSeedDefaults_OtherTypesIgnored` already proves a non-attr/number type seeds nothing.)

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/
git commit -m "feat: PLAYRPG-232 carry a computed field's formula through template saves"
```

---

### Task 5: JS parser, evaluator and creator validation

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/formula/formula.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/formula/formula.test.js`

**Interfaces:**
- Consumes: `formula_cases.json` from Task 1.
- Produces:
  - `parseFormula(blocks) → { ok: true, tree } | { ok: false, error: { reason, index } }`
  - `evaluateArithmetic(tree, { attributes, numbers }) → { ok: true, value } | { ok: false, error: { reason, index } }` — `attributes` is `{ key: { current } }`, `numbers` is `{ key: int }`
  - `validateFormula(blocks, { attrKeys = [], numberKeys = [], arithmeticOnly = false }) → { valid: true, tree } | { valid: false, errorKey, errorParams, index }` — `errorKey` is `creator.formula.error.<reason>`
  - `computeFieldValue(field, { attributes, numbers }, { attrKeys, numberKeys }) → number | null`

- [ ] **Step 1: Write the failing tests**

`formula.test.js`:

```js
import cases from './formula_cases.json';
import { parseFormula, evaluateArithmetic, validateFormula, computeFieldValue } from './formula';

const toAttributes = (attrs = {}) =>
  Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { current: v }]));

// The same file drives formula_test.go: the two parsers must agree on every value, and on
// every error's reason AND block index.
describe('formula_cases.json (shared with the Go parser)', () => {
  test.each(cases.map(c => [c.name, c]))('%s', (_name, c) => {
    const parsed = parseFormula(c.blocks);
    let outcome = parsed;
    if (parsed.ok && !c.expect.valid) {
      outcome = evaluateArithmetic(parsed.tree, { attributes: toAttributes(c.attributes), numbers: c.numbers || {} });
    }
    if (c.expect.error) {
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toEqual({ reason: c.expect.error, index: c.expect.index });
      return;
    }
    expect(outcome.ok).toBe(true);
    // toBe uses Object.is, so a -0 leaking out of Math.trunc fails here.
    if (c.expect.value !== undefined) expect(outcome.value).toBe(c.expect.value);
  });
});

const attr = (key) => ({ type: 'attr', key, label: key });
const num = (key) => ({ type: 'number', key, label: key });
const c = (n) => ({ type: 'const', num: n });
const op = (v) => ({ type: 'op', value: v });

describe('validateFormula', () => {
  it('names a missing field by its label', () => {
    const v = validateFormula([attr('gone')], { attrKeys: ['str'] });
    expect(v).toMatchObject({ valid: false, errorKey: 'creator.formula.error.field_not_found', errorParams: { label: 'gone' }, index: 0 });
  });

  it('checks number blocks against number fields, not attributes', () => {
    expect(validateFormula([num('load')], { attrKeys: ['load'] }).valid).toBe(false);
    expect(validateFormula([num('load')], { numberKeys: ['load'] }).valid).toBe(true);
  });

  it('rejects dice and roll-context blocks in arithmetic-only mode', () => {
    const v = validateFormula([c(2), op('+'), { type: 'dice', value: 'd6' }], { arithmeticOnly: true });
    expect(v).toMatchObject({ valid: false, errorKey: 'creator.formula.error.not_allowed', index: 2 });
    expect(validateFormula([{ type: 'skill' }], { arithmeticOnly: true }).valid).toBe(false);
  });

  it('allows dice outside arithmetic-only mode', () => {
    expect(validateFormula([c(2), op('d'), { type: 'dice', value: 'd6' }], {}).valid).toBe(true);
  });

  it('reports parse errors with their reason key and index', () => {
    expect(validateFormula([c(1), op('+')], {})).toMatchObject({ valid: false, errorKey: 'creator.formula.error.unexpected_end', index: 2 });
  });
});

describe('computeFieldValue', () => {
  const refs = { attrKeys: ['str', 'dex'], numberKeys: ['load'] };
  const values = { attributes: { str: { current: 40 } }, numbers: { load: 12 } };
  const field = (formula, dflt = null) => ({ type: 'computed', formula, default: dflt });

  it('computes from live values', () => {
    expect(computeFieldValue(field([attr('str'), op('+'), num('load')]), values, refs)).toBe(52);
  });

  it('reads a field the character has not filled yet as zero', () => {
    expect(computeFieldValue(field([attr('str'), op('+'), attr('dex')], 5), values, refs)).toBe(40);
  });

  it('falls back to the default when a field was removed from the template', () => {
    expect(computeFieldValue(field([attr('str'), op('+'), attr('bonus')], 5), values, refs)).toBe(5);
  });

  it('falls back to the default on division by zero', () => {
    expect(computeFieldValue(field([attr('str'), op('/'), attr('dex')], 5), values, refs)).toBe(5);
  });

  it('falls back to the default on an empty formula', () => {
    expect(computeFieldValue(field([], 5), values, refs)).toBe(5);
  });

  it('is null without a default', () => {
    expect(computeFieldValue(field([]), values, refs)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=systems/custom/formula`
Expected: FAIL — `Cannot find module './formula'`.

- [ ] **Step 3: Implement**

`formula.js`:

```js
// Mirror of the Go parser in warhammer-battle-helper-backend/internal/systems/custom/formula.go.
// Go is the reference: rolls are evaluated only there. This side parses for the creator's
// validation and evaluates the arithmetic of "computed" fields at render time. Both sides must
// accept the same block lists and fail with the same reason at the same index — formula_cases.json
// pins that, so change one parser and the other side's test goes red.

const VALUE_TYPES = new Set(['const', 'attr', 'number', 'skill', 'attr_linked', 'const_input']);
const DIE_TYPES = new Set(['dice', 'dice_attr', 'dice_skill_attr']);
const OPS = new Set(['+', '-', '*', '/', 'd']);

// The only blocks a computed field may use: it is evaluated outside any roll, so dice and the
// roll-context blocks (skill, linked attribute, player number) have nothing to resolve against.
const ARITHMETIC_TYPES = new Set(['const', 'attr', 'number', 'paren_open', 'paren_close']);
const ARITHMETIC_OPS = new Set(['+', '-', '*', '/']);

class FormulaError extends Error {
  constructor(reason, index) {
    super(reason);
    this.reason = reason;
    this.index = index;
  }
}

function knownBlock(b) {
  if (b?.type === 'op') return OPS.has(b.value);
  if (b?.type === 'paren_open' || b?.type === 'paren_close') return true;
  return VALUE_TYPES.has(b?.type) || DIE_TYPES.has(b?.type);
}

function asResult(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: { reason: e.reason, index: e.index } };
    throw e;
  }
}

// parseFormula builds a tree by recursive descent; see parseFormula in formula.go for the grammar.
export function parseFormula(blocks) {
  return asResult(() => {
    if (!blocks || blocks.length === 0) throw new FormulaError('empty', 0);
    blocks.forEach((b, i) => { if (!knownBlock(b)) throw new FormulaError('unknown_block', i); });

    let pos = 0;
    const peek = () => blocks[pos];
    const isOp = (...values) => peek()?.type === 'op' && values.includes(peek().value);

    // Folds `operand (op operand)*` to the left, so 20-6-4 is (20-6)-4.
    const binary = (operand, ops) => {
      let left = operand();
      while (isOp(...ops)) {
        const index = pos;
        const opValue = blocks[pos++].value;
        left = { kind: 'binop', op: opValue, index, left, right: operand() };
      }
      return left;
    };

    const die = (count) => {
      const node = { kind: 'dice', block: blocks[pos], index: pos, count };
      pos++;
      if (isOp('d')) throw new FormulaError('dice_chain', pos);
      return node;
    };

    const atom = () => {
      const b = peek();
      if (b.type === 'paren_open') {
        const start = pos++;
        const inner = expression();
        const closing = peek();
        if (!closing) throw new FormulaError('unclosed_paren', start);
        if (closing.type !== 'paren_close') throw new FormulaError('unexpected_block', pos);
        pos++;
        return { kind: 'paren', inner };
      }
      if (VALUE_TYPES.has(b.type)) return { kind: 'value', block: b, index: pos++ };
      throw new FormulaError('unexpected_block', pos);
    };

    const factor = () => {
      const b = peek();
      if (!b) throw new FormulaError('unexpected_end', pos);
      if (DIE_TYPES.has(b.type)) return die(null);
      const count = atom();
      if (!isOp('d')) return count;
      pos++;
      const next = peek();
      if (!next) throw new FormulaError('unexpected_end', pos);
      if (!DIE_TYPES.has(next.type)) throw new FormulaError('expected_die', pos);
      return die(count);
    };

    const term = () => binary(factor, ['*', '/']);
    const expression = () => binary(term, ['+', '-']);

    const tree = expression();
    if (pos < blocks.length) throw new FormulaError('trailing_blocks', pos);
    return { ok: true, tree };
  });
}

function applyOp(opValue, a, b, index) {
  if (opValue === '+') return a + b;
  if (opValue === '-') return a - b;
  if (opValue === '*') return a * b;
  if (b === 0) throw new FormulaError('division_by_zero', index);
  // Go's integer division truncates toward zero; Math.floor would turn -7/2 into -4. The `|| 0`
  // turns the -0 that Math.trunc(-0.5) yields into the 0 Go has.
  return Math.trunc(a / b) || 0;
}

// evaluateArithmetic computes a tree with no dice. A key with no value on the character reads
// as 0, exactly like Go's zero value for a missing map entry.
export function evaluateArithmetic(tree, { attributes = {}, numbers = {} } = {}) {
  const evalNode = (n) => {
    if (n.kind === 'paren') return evalNode(n.inner);
    if (n.kind === 'binop') return applyOp(n.op, evalNode(n.left), evalNode(n.right), n.index);
    if (n.kind === 'value') {
      const b = n.block;
      if (b.type === 'const') return Math.trunc(b.num ?? 0) || 0;
      if (b.type === 'attr') return attributes[b.key]?.current ?? 0;
      if (b.type === 'number') return numbers[b.key] ?? 0;
    }
    throw new FormulaError('unsupported_block', n.index);
  };
  return asResult(() => ({ ok: true, value: evalNode(tree) }));
}

const invalid = (reason, index, errorParams) =>
  ({ valid: false, errorKey: `creator.formula.error.${reason}`, errorParams, index });

// validateFormula is the creator's check: the formula parses, every field it names still
// exists in the template, and — for a computed field — it uses arithmetic blocks only.
export function validateFormula(blocks, { attrKeys = [], numberKeys = [], arithmeticOnly = false } = {}) {
  const parsed = parseFormula(blocks);
  if (!parsed.ok) return invalid(parsed.error.reason, parsed.error.index);

  const attrs = new Set(attrKeys);
  const nums = new Set(numberKeys);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (arithmeticOnly && !(b.type === 'op' ? ARITHMETIC_OPS.has(b.value) : ARITHMETIC_TYPES.has(b.type))) {
      return invalid('not_allowed', i);
    }
    const missing = ((b.type === 'attr' || b.type === 'dice_attr') && !attrs.has(b.key))
      || (b.type === 'number' && !nums.has(b.key));
    if (missing) return invalid('field_not_found', i, { label: b.label || b.key });
  }
  return { valid: true, tree: parsed.tree };
}

// computeFieldValue is what the sheet shows for a "computed" field: the formula's value, or the
// GM's default when the formula cannot be computed (invalid, a removed field, division by zero),
// or null — an empty field — when there is no default either.
export function computeFieldValue(field, values, refs) {
  const fallback = field.default ?? null;
  const v = validateFormula(field.formula, { ...refs, arithmeticOnly: true });
  if (!v.valid) return fallback;
  const r = evaluateArithmetic(v.tree, values);
  return r.ok ? r.value : fallback;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=systems/custom/formula`
Expected: PASS (all shared cases + validate + compute suites).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/formula/
git commit -m "feat: PLAYRPG-232 JS formula parser mirroring Go, pinned by shared cases"
```

---

### Task 6: FormulaBuilder — parentheses, number blocks, arithmetic-only mode, error highlight

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/FormulaBuilder.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (next to `.fb__block--attr`, ~line 10327)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (`creator.formula`)
- Create: `warhammer-battle-helper-front/src/components/creator/FormulaBuilder.test.jsx`

**Interfaces:**
- Consumes: `validateFormula` from `../../systems/custom/formula/formula` (Task 5).
- Produces: `FormulaBuilder` props `{ formula, onChange, numberFields, numericFields = [], fieldType, hideOperators = [], damageMode = false, arithmeticOnly = false }`. `numberFields` stays the list of `attr` fields (name kept: SkillTree/SkillOptions editors share it); `numericFields` is the list of `number` fields.

- [ ] **Step 1: Write the failing test**

`FormulaBuilder.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import FormulaBuilder from './FormulaBuilder';

const attrs = [{ key: 'str', label: 'Strength', abbr: 'STR' }];
const nums = [{ key: 'load', label: 'Load' }];

const setup = (props = {}) => {
  const onChange = jest.fn();
  const utils = render(
    <FormulaBuilder formula={[]} onChange={onChange} numberFields={attrs} numericFields={nums} {...props} />
  );
  return { onChange, ...utils };
};

test('parenthesis buttons add paren blocks', () => {
  const { getByText, onChange } = setup();
  fireEvent.click(getByText('('));
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ type: 'paren_open' });
  fireEvent.click(getByText(')'));
  expect(onChange.mock.calls[1][0][0]).toMatchObject({ type: 'paren_close' });
});

test('a number-field chip adds a number block', () => {
  const { getByText, onChange } = setup();
  fireEvent.click(getByText('Load'));
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ type: 'number', key: 'load', label: 'Load' });
});

test('arithmetic-only mode offers no dice, no pool operator and no skill tokens', () => {
  const { queryByText } = setup({ arithmeticOnly: true });
  expect(queryByText(i18n.t('creator.formula.sectionDice'))).toBeNull();
  expect(queryByText('d')).toBeNull();
  expect(queryByText(i18n.t('creator.formula.skillValueBtn'))).toBeNull();
  expect(queryByText(i18n.t('creator.formula.trackComputed'))).not.toBeNull();
});

test('the block the parser stopped at is highlighted', () => {
  const formula = [{ id: 'a', type: 'paren_open' }, { id: 'b', type: 'paren_close' }];
  const { container } = setup({ formula });
  const blocks = container.querySelectorAll('.fb__block');
  expect(blocks[0]).not.toHaveClass('fb__block--error');
  expect(blocks[1]).toHaveClass('fb__block--error');
  // The preview line is "⚠ <message>" in one element, so match by containment, not getByText.
  expect(container.querySelector('.fb__track-preview').textContent)
    .toContain(i18n.t('creator.formula.error.unexpected_block'));
});

test('a valid formula shows its notation with parentheses', () => {
  const formula = [
    { id: 'a', type: 'paren_open' }, { id: 'b', type: 'attr', key: 'str', label: 'STR' },
    { id: 'c', type: 'op', value: '+' }, { id: 'd', type: 'const', num: 2 }, { id: 'e', type: 'paren_close' },
  ];
  const { container } = setup({ formula });
  expect(container.querySelector('.fb__track-preview em').textContent).toBe('(STR + 2)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=FormulaBuilder`
Expected: FAIL — no `(` button, no `Load` chip, `trackComputed` key missing.

- [ ] **Step 3: Implement FormulaBuilder changes**

In `FormulaBuilder.jsx`:

1. Add the import and delete the old validator. Remove `const BLOCK_IS_VALUE = …` and the whole `export function validateFormula(blocks, numberFields) { … }`. Add under the `react-i18next` import:

```js
import { validateFormula } from '../../systems/custom/formula/formula';
```

2. In `formulaToString`, add these branches before the final `else { parts.push('?'); }`:

```js
    else if (b.type === 'number')        { parts.push(b.label || b.key); }
    else if (b.type === 'paren_open')    { parts.push('('); }
    else if (b.type === 'paren_close')   { parts.push(')'); }
```

3. Add to `BLOCK_CLASS`:

```js
  number:         'fb__block--number',
  paren_open:     'fb__block--paren',
  paren_close:    'fb__block--paren',
```

4. Change the component signature and validation:

```js
function FormulaBuilder({ formula, onChange, numberFields, numericFields = [], fieldType, hideOperators = [], damageMode = false, arithmeticOnly = false }) {
```

```js
  const validation = validateFormula(blocks, {
    attrKeys: numberFields.map(f => f.key),
    numberKeys: numericFields.map(f => f.key),
    arithmeticOnly,
  });
```

Add next to `addAttr`:

```js
  const addNumber = f => add({ type: 'number', key: f.key, label: f.label || f.key });
```

5. In `blockLabel`, add before `return '?';`:

```js
    if (b.type === 'number')          return b.label || b.key;
    if (b.type === 'paren_open')      return '(';
    if (b.type === 'paren_close')     return ')';
```

6. Track label: replace `{t('creator.formula.track')}` with
`{t(arithmeticOnly ? 'creator.formula.trackComputed' : 'creator.formula.track')}`.

7. Highlight: replace the `blocks.map(b => (` line and the opening `<div key={b.id} …>` with:

```jsx
          ) : blocks.map((b, i) => (
            <div key={b.id} className={`fb__block ${BLOCK_CLASS[b.type] || ''}${!validation.valid && validation.index === i ? ' fb__block--error' : ''}`}>
```

8. Wrap the whole `{/* ── Dice ── */}` `<div className="fb__section">…</div>` in `{!arithmeticOnly && ( … )}`.

9. Operator row: replace the pool separator + pool button with parentheses, and keep the pool button only outside arithmetic-only mode:

```jsx
            <span className="fb__op-separator" />
            <button className="fb__op-btn fb__op-btn--paren" onClick={() => add({ type: 'paren_open' })}>(</button>
            <button className="fb__op-btn fb__op-btn--paren" onClick={() => add({ type: 'paren_close' })}>)</button>
            {!arithmeticOnly && (
              <>
                <span className="fb__op-separator" />
                <button className="fb__op-btn fb__op-btn--pool" onClick={() => addOp('d')} title={t('creator.formula.opDicePool')}>
                  d
                </button>
              </>
            )}
```

10. After the attributes chips block (`{numberFields.length > 0 && ( … )}`), add:

```jsx
          {numericFields.length > 0 && (
            <>
              <div className="fb__subsection-label">{t('creator.formula.subsectionNumbers')}</div>
              <div className="fb__attr-chips">
                {numericFields.map(f => (
                  <button key={f.key} className="fb__attr-chip fb__attr-chip--number" onClick={() => addNumber(f)}>
                    {f.label || f.key}
                  </button>
                ))}
              </div>
            </>
          )}
```

11. Skill tokens: change `{fieldType !== 'attr' && (` (the skill-tokens subsection, not the dice one) to `{fieldType !== 'attr' && !arithmeticOnly && (`.

- [ ] **Step 4: CSS**

In `style.css`, after the `.fb__block--attr { … }` rule add:

```css
.fb__block--number {
    background: rgba(201, 151, 91, 0.12);
    border-color: rgba(201, 151, 91, 0.45);
    color: #7a5c42;
}

.fb__block--paren {
    background: transparent;
    border-color: #c4a882;
    color: #3a2f1f;
    font-weight: 700;
}

.fb__block.fb__block--error {
    border-color: #8b2c2c;
    box-shadow: 0 0 0 1px #8b2c2c;
}

.fb__attr-chip.fb__attr-chip--number {
    border-color: rgba(201, 151, 91, 0.6);
    color: #7a5c42;
}
```

(The doubled selectors on `--error` and `--number` chip are deliberate: they must beat any `.fb__block--*` / `.fb__attr-chip` rule regardless of order in the file.)

- [ ] **Step 5: i18n**

In `creator.formula` of **en**: delete `errorEmpty`, `errorStartsWithOp`, `errorEndsWithOp`, `errorTwoOps`, `errorNoOp`, `errorAttrNotFound`; add:

```json
"trackComputed": "Formula",
"subsectionNumbers": "Number fields",
"error": {
  "empty": "Formula is empty",
  "unknown_block": "Unknown block — remove it",
  "unexpected_block": "This block cannot stand here",
  "unexpected_end": "Formula ends too early — add a value",
  "unclosed_paren": "This parenthesis is never closed",
  "expected_die": "\"d\" must be followed by a die",
  "dice_chain": "Dice cannot be chained — put the die count in parentheses: (d6) d d10",
  "trailing_blocks": "Missing operator before this block",
  "not_allowed": "This block cannot be used in a computed field",
  "field_not_found": "Field \"{{label}}\" does not exist in the template"
}
```

In **pl** the same keys:

```json
"trackComputed": "Formuła",
"subsectionNumbers": "Pola liczbowe",
"error": {
  "empty": "Formuła jest pusta",
  "unknown_block": "Nieznany blok — usuń go",
  "unexpected_block": "Ten blok nie może stać w tym miejscu",
  "unexpected_end": "Formuła kończy się za wcześnie — dodaj wartość",
  "unclosed_paren": "Ten nawias nie został zamknięty",
  "expected_die": "Po „d” musi stać kość",
  "dice_chain": "Kości nie można łączyć w łańcuch — liczbę kości ujmij w nawias: (k6) d k10",
  "trailing_blocks": "Brak operatora przed tym blokiem",
  "not_allowed": "Tego bloku nie można użyć w polu obliczanym",
  "field_not_found": "Pole „{{label}}” nie istnieje w szablonie"
}
```

Then confirm the deleted keys have no readers: `grep -rn "formula.error[A-Z]" warhammer-battle-helper-front/src --include='*.js*'` → no output.

- [ ] **Step 6: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='FormulaBuilder|TemplateBuilder|systems/custom/formula'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/FormulaBuilder.jsx \
  warhammer-battle-helper-front/src/components/creator/FormulaBuilder.test.jsx \
  warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/
git commit -m "feat: PLAYRPG-232 parentheses, number blocks and error highlight in FormulaBuilder"
```

---

### Task 7: `computed` field type in the creator

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (imports ~line 19, `FIELD_TYPES` :93, `PALETTE_GROUPS` :111, `makeDefaultField` :124, `RollConfigEditor` :501, `PropertyPanel` :773, damage FormulaBuilder :1022, RollConfigEditor calls :1088/:1098, memo :1706, PropertyPanel render :2159)
- Modify: locales en/pl (`creator.fieldType`, `creator`)
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.computedField.test.jsx`

**Interfaces:**
- Consumes: `FormulaBuilder` props from Task 6.
- Produces: exported `makeDefaultField(type)` and `collectFormulaFields(sections) → { numberFields, numericFields, totalFieldCount, sectionCount }`.

- [ ] **Step 1: Write the failing test**

`TemplateBuilder.computedField.test.jsx`:

```jsx
import { makeDefaultField, collectFormulaFields } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

test('a new computed field starts with an empty formula and no default', () => {
  const f = makeDefaultField('computed');
  expect(f).toMatchObject({ type: 'computed', formula: [], default: null, label: '' });
  expect(f.key).toMatch(/^computed_/);
});

test('formula sources split attributes from number fields, at any depth', () => {
  const sections = [{
    id: 's', title: '', columns: 3, fields: [
      { key: 'a1', type: 'attr' },
      { key: 'n1', type: 'number' },
      { key: 'c1', type: 'computed' },
      { key: 'sub', type: 'section', section: { id: 'sub', title: '', columns: 2, fields: [{ key: 'n2', type: 'number' }] } },
    ],
  }];
  const { numberFields, numericFields } = collectFormulaFields(sections);
  expect(numberFields.map(f => f.key)).toEqual(['a1']);
  expect(numericFields.map(f => f.key)).toEqual(['n1', 'n2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder.computedField`
Expected: FAIL — `makeDefaultField is not a function` (not exported).

- [ ] **Step 3: Implement**

1. Import the icon after `NumbersIcon`:

```js
import FunctionsIcon from '@mui/icons-material/Functions';
```

2. `FIELD_TYPES`, after the `number` entry:

```js
  { type: 'computed',    labelKey: 'creator.fieldType.computed',    icon: <FunctionsIcon fontSize="small" />,  desc: 'creator.fieldType.computedDesc' },
```

3. `PALETTE_GROUPS` stats group: `types: ['attr', 'number', 'computed', 'progress']`.

4. `makeDefaultField`: change `function makeDefaultField(type) {` to `export function makeDefaultField(type) {` and add after the `number` line:

```js
  if (type === 'computed') return { ...base, formula: [], default: null };
```

5. Replace the memo at ~1706 with a call to an exported pure helper. Above `function TemplateBuilder` (next to the other exported helpers, e.g. after `shareErrorKey`), add:

```js
// Formula sources for the builders (attr fields and number fields, at any nesting depth) and the
// header chip's counts. walkFields visits leaves only, so sections need their own recursion: the
// chip counts every container at every depth, not just the root list, or a root section holding
// three subsections would read "1 section" next to "9 fields".
export function collectFormulaFields(sections) {
  const attrs = [];
  const numbers = [];
  let n = 0;
  walkFields(sections, (f) => {
    if (f.type === 'attr') attrs.push(f);
    if (f.type === 'number') numbers.push(f);
    n += 1;
  });
  const countContainers = (list) => (list || []).reduce((acc, node) => {
    const kids = childrenOf(node);
    return kids ? acc + 1 + countContainers(kids) : acc;
  }, 0);
  return { numberFields: attrs, numericFields: numbers, totalFieldCount: n, sectionCount: countContainers(sections) };
}
```

and in the component replace the memo (its comment block and body) with:

```js
  const { numberFields, numericFields, totalFieldCount, sectionCount } = useMemo(() => collectFormulaFields(sections), [sections]);
```

6. Thread `numericFields` through:
- `RollConfigEditor({ config, onChange, numberFields, numericFields, fieldType, skillColumnLabel = null })` and pass `numericFields={numericFields}` to its `<FormulaBuilder>`.
- `PropertyPanel({ field, onChange, onDelete, numberFields, numericFields, sections })`.
- Both `<RollConfigEditor … />` calls inside `PropertyPanel` and the damage `<FormulaBuilder … damageMode />`: add `numericFields={numericFields}`.
- `<PropertyPanel … numberFields={numberFields}` at ~2159: add `numericFields={numericFields}`.

7. In `PropertyPanel`, directly after the closing `)}` of the `['attr', 'number', 'skill_table'].includes(field.type) && (<PropsGroup …values…>)` block, add:

```jsx
      {field.type === 'computed' && (
        <PropsGroup title={t('creator.propsGroupFormula')}>
          {/* Truncated for the same reason as the attr/number default above: a decimal 400s the PATCH. */}
          <TextField
            size="small"
            fullWidth
            label={t('creator.fieldDefault')}
            helperText={t('creator.computedDefaultHint')}
            type="number"
            value={field.default ?? ''}
            onChange={e => up({ default: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })}
            InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }}
            sx={{ mb: 1.5 }}
          />
          <FormulaBuilder
            formula={field.formula || []}
            onChange={formula => up({ formula })}
            numberFields={numberFields}
            numericFields={numericFields}
            fieldType={field.type}
            arithmeticOnly
          />
        </PropsGroup>
      )}
```

8. i18n — en: `creator.fieldType.computed: "Computed"`, `creator.fieldType.computedDesc: "Value computed from a formula; the player cannot edit it"`, `creator.propsGroupFormula: "Formula"`, `creator.computedDefaultHint: "Shown when the formula cannot be computed"`. pl: `"Obliczane"`, `"Wartość liczona z formuły; gracz jej nie edytuje"`, `"Formuła"`, `"Pokazywana, gdy formuły nie da się policzyć"`.

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='TemplateBuilder|FormulaBuilder'`
Expected: PASS (new test + every existing TemplateBuilder suite).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/ warhammer-battle-helper-front/src/locales/
git commit -m "feat: PLAYRPG-232 computed field type in the template creator"
```

---

### Task 8: Render `computed` on the sheet

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (imports, memo near `attrByKey` ~line 122, `renderField` switch after `case 'number':` ~line 219)
- Modify: `warhammer-battle-helper-front/src/style.css` (after `.custom-sheet__number-input` ~line 8078)
- Create: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.computed.test.jsx`

**Interfaces:**
- Consumes: `computeFieldValue(field, { attributes, numbers }, { attrKeys, numberKeys })` from Task 5.

- [ ] **Step 1: Write the failing test**

`CustomSheetBody.computed.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const op = (v) => ({ type: 'op', value: v });
const attr = (key) => ({ type: 'attr', key, label: key });

const sectionsWith = (computed) => [{
  id: 's', title: '', columns: 3, fields: [
    { key: 'str', type: 'attr', label: 'STR' },
    { key: 'load', type: 'number', label: 'Load' },
    { key: 'hp', type: 'computed', label: 'HP', ...computed },
  ],
}];

const valueOf = (container) => container.querySelector('.custom-sheet__computed-value');

test('shows the formula value from the live character values, read-only', () => {
  const sections = sectionsWith({ formula: [attr('str'), op('*'), { type: 'const', num: 2 }, op('+'), { type: 'number', key: 'load' }], default: null });
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ attributes: { str: { current: 25 } }, numbers: { load: 10 } }} onChange={{}} />
  );
  expect(valueOf(container).textContent).toBe('60');
  expect(valueOf(container).tagName).toBe('OUTPUT');
  expect(container.querySelector('.custom-sheet__field--computed input')).toBeNull();
});

test('shows the default when the formula names a removed field', () => {
  const sections = sectionsWith({ formula: [attr('str'), op('+'), attr('bonus')], default: 5 });
  const { container } = render(<CustomSheetBody sections={sections} values={{ attributes: { str: { current: 40 } } }} />);
  expect(valueOf(container).textContent).toBe('5');
});

test('is empty when the formula fails and there is no default', () => {
  const sections = sectionsWith({ formula: [], default: null });
  const { container } = render(<CustomSheetBody sections={sections} />);
  expect(valueOf(container).textContent).toBe('');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.computed`
Expected: FAIL — `.custom-sheet__computed-value` is null (no `computed` case).

- [ ] **Step 3: Implement**

Add the import:

```js
import { computeFieldValue } from './formula/formula';
```

Below the `attrByKey` memo add:

```js
  // Keys a computed formula may name. A key missing from here was removed from the template, and
  // the field falls back to its default; a key present here but unfilled on the character reads as 0.
  const formulaRefs = useMemo(() => {
    const attrKeys = [];
    const numberKeys = [];
    walkFields(sections, (f) => {
      if (f.type === 'attr') attrKeys.push(f.key);
      if (f.type === 'number') numberKeys.push(f.key);
    });
    return { attrKeys, numberKeys };
  }, [sections]);
```

In `renderField`, after the `case 'number':` block add:

```jsx
      // Computed at render from the values the sheet is showing — the player's unsaved edits
      // included — so it follows every keystroke. Nothing is stored: there is no onChange.
      case 'computed': {
        const value = computeFieldValue(field, { attributes: attrs, numbers }, formulaRefs);
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--computed">
            {renderFieldLabel(field.label)}
            <output className="custom-sheet__computed-value">{value ?? ''}</output>
          </div>
        );
      }
```

In `style.css`, after the `.custom-sheet__number-input { … }` rule:

```css
/* Same box as a number input, so a computed value lines up with its neighbours; the dashed
   border and missing focus ring are what say "not editable". */
.custom-sheet__computed-value {
    display: block;
    box-sizing: border-box;
    min-height: 2em;
    background: #fff9f0;
    border: 1px dashed #c4a882;
    color: #3a2f1f;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.95rem;
    width: 100%;
    text-align: center;
    font-weight: 600;
}
```

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|CharacterSheet|TemplateBuilder'`
Expected: PASS. If a snapshot in `systems/custom/__snapshots__` changes, it must be only because of this task — inspect the diff before `-u`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/ warhammer-battle-helper-front/src/style.css
git commit -m "feat: PLAYRPG-232 render computed fields on the character sheet"
```

---

### Task 9: Full verification

**Files:** none new (fix-ups only).

- [ ] **Step 1: Backend suite**

Run (from `warhammer-battle-helper-backend/`): `go vet ./... && go test ./...`
Expected: all `ok`.

- [ ] **Step 2: Frontend suite**

Run (from `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` axios ESM failure.

- [ ] **Step 3: i18n parity**

Use the `i18n-sync` skill to confirm en/pl keys match and no `t('…')` key added in this plan is missing.

- [ ] **Step 4: Lint**

Run (from `warhammer-battle-helper-front/`): `npx eslint src/components/creator/FormulaBuilder.jsx src/components/creator/TemplateBuilder.jsx src/systems/custom/CustomSheetBody.jsx src/systems/custom/formula/`
Expected: no errors (in particular no `no-unused-vars` for the removed validator).

- [ ] **Step 5: Browser check (manual, user)**

Not covered by any test — list for the user:
1. Creator: add a Computed field, build `(STR + DEX) / 2`, set default 5; preview shows 0 for an empty character.
2. Sheet: type STR — the computed value follows each keystroke; it cannot be focused or edited.
3. Creator: remove the DEX field — the computed field's builder shows `field_not_found` with DEX highlighted; the sheet shows 5.
4. Roll a skill whose formula is `10 + d6 * 5` — breakdown reads `10+d6*5 = 10+4*5 = 30`.
5. Dice pool `(d6) d d10` rolls; an old `d6 d d10` template shows the `dice_chain` error in the creator.

- [ ] **Step 6: Commit any fix-ups**

```bash
git status --short   # only files touched by this plan
git commit -am "fix: PLAYRPG-232 verification fix-ups"   # only if Step 1-4 required changes
```
