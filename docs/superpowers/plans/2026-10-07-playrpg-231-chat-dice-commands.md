# PLAYRPG-231 Chat Dice Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players roll dice from the chat input (`/r 2d6+1d4-1`, `/r 4d6kh3`, `/r 6d10>=7`, `/r d100-10 vs 45`, `/gmr d20`, `/help`), and the log shows every die plus the total.

**Architecture:** A pure Go domain package `internal/dice` (lexer → parser → validation → evaluation, randomness injected through `dice.Roller`) knows the expression grammar and nothing else. An application service `DiceRollService` orchestrates game lookup → parse → evaluate → persist event → broadcast → stats through small consumer-side interfaces (ports). The frontend knows only command *names* (`/r`, `/gmr`, `/help`) via a `src/chat/commands/` module and sends the raw expression to `POST /games/:id/rollExpression`. One system-agnostic renderer `ExpressionDiceRoll` serves the log and toasts.

**Tech Stack:** Go 1.24 + Gin + MongoDB | React 19 + i18next + `@mui/icons-material` | Jest via CRA.

**Spec:** `docs/superpowers/specs/PLAYRPG-231.md`

## Global Constraints

- Main checkout, no worktree. Commit on the current branch (`main`) unless the user asks for a named branch.
- Code comments in English. Conversation and `docs/` in Polish.
- All UI strings via `t('…')`, added to both `src/locales/en/translation.json` and `src/locales/pl/translation.json`. Dice notation literals (`2d6+3`) are not language and may stay in code.
- Icons only from `@mui/icons-material`. No MUI `<Tooltip>`.
- Limits (verbatim from spec): sides **2..1000**, dice per term **1..20**, dice total **≤ 50**, terms **≤ 10**, constant **0..1000**, `vs` target **0..10000**, expression **≤ 100 runes**.
- `vs` always means **success when total ≤ target**. No SL, no CoC difficulty levels.
- `kh`/`kl` tie-break: among equal values the **earlier** die is kept.
- Pool (`>=`) must be the only dice term, with `+` sign; constants adjust the success count; total clamps at 0; `vs` forbidden with a pool.
- Every rolled die (also dropped ones) is recorded as one `RollStat` with `RollType: "generic"`.
- The old `POST /games/:id/roll`, `DiceRollControls`, `SimpleDiceRoll`, `MultiDiceRoll` stay untouched.
- `internal/dice` imports only the standard library.
- Delete dead code / CSS / i18n in the same task that makes it dead.
- Backend tests: from `warhammer-battle-helper-backend/`, `go test ./internal/dice/ ./internal/service/ -run <Name> -v`.
- Frontend tests: from `warhammer-battle-helper-front/`, `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Never bare `npx jest`. `App.test.js` (axios ESM) is a known baseline failure. Any module importing `src/api/axios.js` must be `jest.mock`ed in tests.
- Commit messages: `feat: PLAYRPG-231 …` / `refactor: PLAYRPG-231 …`, ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RLmigJ8Wv3r5y3SwRKDDbZ
  ```

## File Map

Backend (`warhammer-battle-helper-backend/`)
- Create `internal/dice/errors.go` — `Error`, error codes.
- Create `internal/dice/limits.go` — `Limits`, `DefaultLimits()`.
- Create `internal/dice/expression.go` — AST (`Expression`, `Term`, `DiceSpec`, `Keep`, `Check`), `String()`, `IsPool()`.
- Create `internal/dice/lexer.go` — tokens.
- Create `internal/dice/parse.go` — `Parse` (syntax + `validate`).
- Create `internal/dice/parse_test.go`.
- Create `internal/dice/evaluate.go` — `Roller`, `Outcome`, `Evaluate`.
- Create `internal/dice/evaluate_test.go`.
- Create `internal/service/roll_publisher.go` + `roll_publisher_test.go` — visibility routing moved out of `GameService.broadcastRoll`.
- Create `internal/service/display_name_resolver.go` + `display_name_resolver_test.go` — moved out of `GameService.resolveDisplayNameForUser`.
- Modify `internal/service/GameService.go` — struct fields `publisher`, `names`; delete `broadcastRoll`, `resolveDisplayNameForUser`; callers switched.
- Create `internal/service/DiceRollService.go` + `DiceRollService_test.go`.
- Create `internal/http/DiceRollHandler.go`.
- Modify `cmd/warhammer-battle-helper/main.go` — wiring + route.

Frontend (`warhammer-battle-helper-front/src/`)
- Create `chat/commands/commandRegistry.js` + `.test.js`.
- Create `chat/commands/parseChatInput.js` + `.test.js`.
- Create `chat/commands/useChatHistory.js` + `.test.jsx`.
- Create `chat/commands/useChatCommands.js` + `.test.jsx`.
- Create `api/diceRolls.js` + `.test.js`.
- Modify `components/log/ChatInput.jsx`, `ChatInput.css`, `ChatInput.test.jsx`.
- Create `components/log/CommandHints.jsx`, `components/log/CommandHelp.jsx`.
- Modify `components/panels/RightPanel.jsx`.
- Create `components/log/ExpressionDiceRoll.jsx` + `.test.jsx`.
- Create `components/log/resolveRollComponent.js` + `.test.js`.
- Modify `components/LogWindow.jsx`, `components/ToastStack.jsx`, `components/LogWindow.css`.
- Modify `locales/en/translation.json`, `locales/pl/translation.json`.

---

### Task 1: Dice domain — grammar, parser, validation

**Files:**
- Create: `warhammer-battle-helper-backend/internal/dice/errors.go`
- Create: `warhammer-battle-helper-backend/internal/dice/limits.go`
- Create: `warhammer-battle-helper-backend/internal/dice/expression.go`
- Create: `warhammer-battle-helper-backend/internal/dice/lexer.go`
- Create: `warhammer-battle-helper-backend/internal/dice/parse.go`
- Test: `warhammer-battle-helper-backend/internal/dice/parse_test.go`

**Interfaces:**
- Produces:
  - `func Parse(input string, limits Limits) (Expression, error)` — every error is `*dice.Error`.
  - `func DefaultLimits() Limits`
  - `type Expression struct { Terms []Term; Check *Check }`, `func (e Expression) String() string`, `func (e Expression) IsPool() bool`
  - `type Term struct { Sign int; Constant int; Dice *DiceSpec; Position int }` — `Dice == nil` means a constant term.
  - `type DiceSpec struct { Count, Sides int; Keep *Keep; Threshold *int }`
  - `type Keep struct { Highest bool; Count int }`, `type Check struct { Target, Position int }`
  - `type Error struct { Code string; Position int; Params map[string]int }` and constants `CodeEmpty … CodeNumberOutOfRange`.

- [ ] **Step 1: Write the failing test**

`internal/dice/parse_test.go`:

```go
package dice

import (
	"errors"
	"strings"
	"testing"
)

func TestParse_ValidExpressions(t *testing.T) {
	cases := []struct {
		input     string
		canonical string
		pool      bool
	}{
		{"d10", "1d10", false},
		{"3d100", "3d100", false},
		{"d100 -1", "1d100-1", false},
		{"d100-1", "1d100-1", false},
		{"2d6 + 1d4 + 3", "2d6+1d4+3", false},
		{"4d6kh3", "4d6kh3", false},
		{"2D20KL1", "2d20kl1", false},
		{"6d10>=7", "6d10>=7", true},
		{"6d10>=7+1", "6d10>=7+1", true},
		{"d100-10 vs 45", "1d100-10 vs 45", false},
		{"  1d6  ", "1d6", false},
		{"d6+0", "1d6+0", false},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			expr, err := Parse(tc.input, DefaultLimits())
			if err != nil {
				t.Fatalf("Parse(%q) error: %v", tc.input, err)
			}
			if got := expr.String(); got != tc.canonical {
				t.Errorf("String() = %q, want %q", got, tc.canonical)
			}
			if got := expr.IsPool(); got != tc.pool {
				t.Errorf("IsPool() = %v, want %v", got, tc.pool)
			}
		})
	}
}

func TestParse_Errors(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		code     string
		position int
		params   map[string]int
	}{
		{"empty", "", CodeEmpty, -1, nil},
		{"blank", "   ", CodeEmpty, -1, nil},
		{"too long", strings.Repeat(" ", 99) + "d6", CodeTooLong, -1, map[string]int{"max": 100}},
		{"bare d", "d", CodeUnexpectedEnd, 1, nil},
		{"keep without count", "2d6kh", CodeUnexpectedEnd, 5, nil},
		{"vs without target", "d6 vs", CodeUnexpectedEnd, 5, nil},
		{"unknown character", "2x6", CodeUnexpectedToken, 1, nil},
		{"leading sign", "-2+d6", CodeUnexpectedToken, 0, nil},
		{"term after check", "d6 vs 10 + 2", CodeUnexpectedToken, 9, nil},
		{"missing operator", "2d6 3", CodeUnexpectedToken, 4, nil},
		{"broken keep", "2d6kx1", CodeUnexpectedToken, 3, nil},
		{"lone greater-than", "d6>4", CodeUnexpectedToken, 2, nil},
		{"constant only", "5", CodeNoDice, -1, nil},
		{"pool plus dice", "d6>=4+d6", CodePoolMixed, 0, nil},
		{"subtracted pool", "10-d6>=4", CodePoolMixed, 3, nil},
		{"pool with check", "d6>=4 vs 2", CodePoolWithCheck, 6, nil},
		{"keep too many", "3d6kh4", CodeKeepOutOfRange, 0, map[string]int{"max": 3}},
		{"keep zero", "3d6kh0", CodeKeepOutOfRange, 0, map[string]int{"max": 3}},
		{"threshold above sides", "d6>=7", CodeThresholdOutOfRange, 0, map[string]int{"max": 6}},
		{"one-sided die", "d1", CodeSidesOutOfRange, 0, map[string]int{"min": 2, "max": 1000}},
		{"huge die", "d1001", CodeSidesOutOfRange, 0, map[string]int{"min": 2, "max": 1000}},
		{"overflowing number", "d99999999999999999999", CodeSidesOutOfRange, 0, map[string]int{"min": 2, "max": 1000}},
		{"too many in term", "21d6", CodeCountOutOfRange, 0, map[string]int{"max": 20}},
		{"zero dice", "0d6", CodeCountOutOfRange, 0, map[string]int{"max": 20}},
		{"too many dice", "20d6+20d6+11d6", CodeTooManyDice, -1, map[string]int{"max": 50}},
		{"too many terms", "d2+1+1+1+1+1+1+1+1+1+1", CodeTooManyTerms, -1, map[string]int{"max": 10}},
		{"constant too big", "d6+1001", CodeNumberOutOfRange, 3, map[string]int{"max": 1000}},
		{"target too big", "d6 vs 10001", CodeNumberOutOfRange, 3, map[string]int{"max": 10000}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse(tc.input, DefaultLimits())
			var de *Error
			if !errors.As(err, &de) {
				t.Fatalf("Parse(%q) error = %v, want *dice.Error", tc.input, err)
			}
			if de.Code != tc.code || de.Position != tc.position {
				t.Errorf("got (%s, %d), want (%s, %d)", de.Code, de.Position, tc.code, tc.position)
			}
			for k, v := range tc.params {
				if de.Params[k] != v {
					t.Errorf("Params[%q] = %d, want %d", k, de.Params[k], v)
				}
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/dice/ -v`
Expected: FAIL — `undefined: Parse` (package does not compile).

- [ ] **Step 3: Write the implementation**

`internal/dice/errors.go`:

```go
// Package dice is the domain of dice expressions: grammar, validation and evaluation.
// It depends on nothing outside the standard library — persistence, transport and
// game rules live in the layers that call it.
package dice

import "fmt"

// Error codes returned by Parse. The frontend maps each one to the i18n key
// chat.commands.diceErrors.<code>, so renaming a code is a breaking change.
const (
	CodeEmpty               = "empty"
	CodeTooLong             = "too_long"
	CodeUnexpectedToken     = "unexpected_token"
	CodeUnexpectedEnd       = "unexpected_end"
	CodeNoDice              = "no_dice"
	CodePoolMixed           = "pool_mixed"
	CodePoolWithCheck       = "pool_with_check"
	CodeKeepOutOfRange      = "keep_out_of_range"
	CodeThresholdOutOfRange = "threshold_out_of_range"
	CodeSidesOutOfRange     = "sides_out_of_range"
	CodeCountOutOfRange     = "count_out_of_range"
	CodeTooManyDice         = "too_many_dice"
	CodeTooManyTerms        = "too_many_terms"
	CodeNumberOutOfRange    = "number_out_of_range"
)

// Error describes why an expression was rejected.
// Position is a rune offset into the input, or -1 when the problem is not tied to one spot.
type Error struct {
	Code     string
	Position int
	Params   map[string]int
}

func (e *Error) Error() string {
	return fmt.Sprintf("dice: %s at %d", e.Code, e.Position)
}

func newError(code string, position int, params map[string]int) *Error {
	return &Error{Code: code, Position: position, Params: params}
}
```

`internal/dice/limits.go`:

```go
package dice

// Limits bound an expression so a single chat line cannot make the server roll
// millions of dice. Kept as a value so tests can tighten or loosen them.
type Limits struct {
	MaxLength      int // runes
	MaxTerms       int
	MaxDicePerTerm int
	MaxDiceTotal   int
	MinSides       int
	MaxSides       int
	MaxConstant    int
	MaxCheckTarget int
}

// DefaultLimits mirrors the chat roll limits agreed in PLAYRPG-231.
// MaxDicePerTerm matches the cap of the older POST /roll endpoint.
func DefaultLimits() Limits {
	return Limits{
		MaxLength:      100,
		MaxTerms:       10,
		MaxDicePerTerm: 20,
		MaxDiceTotal:   50,
		MinSides:       2,
		MaxSides:       1000,
		MaxConstant:    1000,
		MaxCheckTarget: 10000,
	}
}
```

`internal/dice/expression.go`:

```go
package dice

import (
	"strconv"
	"strings"
)

// Expression is a parsed and validated dice expression, e.g. "2d6+1d4-1 vs 10".
type Expression struct {
	Terms []Term
	Check *Check // nil when there is no "vs"
}

// Term is one summand. Dice == nil means a constant term holding Constant.
type Term struct {
	Sign     int // +1 or -1
	Constant int
	Dice     *DiceSpec
	Position int // rune offset of the term in the input, used in error reports
}

// DiceSpec is "NdS" with at most one modifier: keep (kh/kl) or a success threshold (>=).
type DiceSpec struct {
	Count     int
	Sides     int
	Keep      *Keep
	Threshold *int // set = success pool, each die >= Threshold counts as one success
}

type Keep struct {
	Highest bool
	Count   int
}

// Check is the trailing "vs N": success when the total is at most Target.
type Check struct {
	Target   int
	Position int // rune offset of the "vs" keyword
}

// IsPool reports whether the expression counts successes instead of summing.
func (e Expression) IsPool() bool {
	for _, t := range e.Terms {
		if t.Dice != nil && t.Dice.Threshold != nil {
			return true
		}
	}
	return false
}

// String renders the canonical notation: explicit dice count, no spaces, lower case.
func (e Expression) String() string {
	var b strings.Builder
	for i, t := range e.Terms {
		if i > 0 {
			if t.Sign < 0 {
				b.WriteByte('-')
			} else {
				b.WriteByte('+')
			}
		}
		if t.Dice == nil {
			b.WriteString(strconv.Itoa(t.Constant))
			continue
		}
		d := t.Dice
		b.WriteString(strconv.Itoa(d.Count))
		b.WriteByte('d')
		b.WriteString(strconv.Itoa(d.Sides))
		if d.Keep != nil {
			if d.Keep.Highest {
				b.WriteString("kh")
			} else {
				b.WriteString("kl")
			}
			b.WriteString(strconv.Itoa(d.Keep.Count))
		}
		if d.Threshold != nil {
			b.WriteString(">=")
			b.WriteString(strconv.Itoa(*d.Threshold))
		}
	}
	if e.Check != nil {
		b.WriteString(" vs ")
		b.WriteString(strconv.Itoa(e.Check.Target))
	}
	return b.String()
}
```

`internal/dice/lexer.go`:

```go
package dice

import "unicode"

type tokenKind int

const (
	tokEOF tokenKind = iota
	tokNumber
	tokD
	tokPlus
	tokMinus
	tokKeepHigh
	tokKeepLow
	tokAtLeast
	tokVs
)

type token struct {
	kind  tokenKind
	value int // tokNumber only
	pos   int // rune offset into the input
}

// numberCap saturates absurdly long digit runs so they cannot overflow int.
// Anything this large fails a range check in validate anyway.
const numberCap = 1_000_000_000

// lex splits the input into tokens. Whitespace is insignificant everywhere,
// so "d100 -1" and "d100-1" produce the same tokens.
func lex(input string) ([]token, error) {
	runes := []rune(input)
	var toks []token
	for i := 0; i < len(runes); {
		r := unicode.ToLower(runes[i])
		switch {
		case unicode.IsSpace(r):
			i++
		case r >= '0' && r <= '9':
			start, n := i, 0
			for i < len(runes) && runes[i] >= '0' && runes[i] <= '9' {
				if n < numberCap {
					n = n*10 + int(runes[i]-'0')
				}
				i++
			}
			if n > numberCap {
				n = numberCap
			}
			toks = append(toks, token{kind: tokNumber, value: n, pos: start})
		case r == 'd':
			toks = append(toks, token{kind: tokD, pos: i})
			i++
		case r == '+':
			toks = append(toks, token{kind: tokPlus, pos: i})
			i++
		case r == '-':
			toks = append(toks, token{kind: tokMinus, pos: i})
			i++
		case r == 'k':
			switch lowerAt(runes, i+1) {
			case 'h':
				toks = append(toks, token{kind: tokKeepHigh, pos: i})
			case 'l':
				toks = append(toks, token{kind: tokKeepLow, pos: i})
			default:
				return nil, newError(CodeUnexpectedToken, i, nil)
			}
			i += 2
		case r == '>':
			if lowerAt(runes, i+1) != '=' {
				return nil, newError(CodeUnexpectedToken, i, nil)
			}
			toks = append(toks, token{kind: tokAtLeast, pos: i})
			i += 2
		case r == 'v':
			if lowerAt(runes, i+1) != 's' {
				return nil, newError(CodeUnexpectedToken, i, nil)
			}
			toks = append(toks, token{kind: tokVs, pos: i})
			i += 2
		default:
			return nil, newError(CodeUnexpectedToken, i, nil)
		}
	}
	return append(toks, token{kind: tokEOF, pos: len(runes)}), nil
}

func lowerAt(runes []rune, i int) rune {
	if i >= len(runes) {
		return 0
	}
	return unicode.ToLower(runes[i])
}
```

`internal/dice/parse.go`:

```go
package dice

import (
	"strings"
	"unicode/utf8"
)

// Parse turns user input into a validated Expression.
//
// Grammar:
//
//	expression := term ( ('+' | '-') term )* [ 'vs' integer ]
//	term       := diceTerm | integer
//	diceTerm   := [integer] 'd' integer [ keep | threshold ]
//	keep       := ('kh' | 'kl') integer
//	threshold  := '>=' integer
//
// Every returned error is a *Error.
func Parse(input string, limits Limits) (Expression, error) {
	if strings.TrimSpace(input) == "" {
		return Expression{}, newError(CodeEmpty, -1, nil)
	}
	if utf8.RuneCountInString(input) > limits.MaxLength {
		return Expression{}, newError(CodeTooLong, -1, map[string]int{"max": limits.MaxLength})
	}
	toks, err := lex(input)
	if err != nil {
		return Expression{}, err
	}
	p := &parser{toks: toks}
	expr, err := p.parseExpression()
	if err != nil {
		return Expression{}, err
	}
	if err := validate(expr, limits); err != nil {
		return Expression{}, err
	}
	return expr, nil
}

type parser struct {
	toks []token
	i    int
}

func (p *parser) peek() token { return p.toks[p.i] }

func (p *parser) next() token {
	t := p.toks[p.i]
	if t.kind != tokEOF {
		p.i++
	}
	return t
}

func unexpected(t token) *Error {
	if t.kind == tokEOF {
		return newError(CodeUnexpectedEnd, t.pos, nil)
	}
	return newError(CodeUnexpectedToken, t.pos, nil)
}

func (p *parser) expectNumber() (token, error) {
	t := p.next()
	if t.kind != tokNumber {
		return t, unexpected(t)
	}
	return t, nil
}

func (p *parser) parseExpression() (Expression, error) {
	var expr Expression
	first, err := p.parseTerm(1)
	if err != nil {
		return Expression{}, err
	}
	expr.Terms = append(expr.Terms, first)

	for k := p.peek().kind; k == tokPlus || k == tokMinus; k = p.peek().kind {
		p.next()
		sign := 1
		if k == tokMinus {
			sign = -1
		}
		term, err := p.parseTerm(sign)
		if err != nil {
			return Expression{}, err
		}
		expr.Terms = append(expr.Terms, term)
	}

	if p.peek().kind == tokVs {
		vs := p.next()
		target, err := p.expectNumber()
		if err != nil {
			return Expression{}, err
		}
		expr.Check = &Check{Target: target.value, Position: vs.pos}
	}

	if t := p.peek(); t.kind != tokEOF {
		return Expression{}, unexpected(t)
	}
	return expr, nil
}

// parseTerm reads a constant or a dice term. A sign is never part of a term —
// the caller consumed it — so "-2+d6" fails here on its first token.
func (p *parser) parseTerm(sign int) (Term, error) {
	start := p.peek()
	count := 1
	switch start.kind {
	case tokNumber:
		p.next()
		if p.peek().kind != tokD {
			return Term{Sign: sign, Constant: start.value, Position: start.pos}, nil
		}
		count = start.value
	case tokD:
	default:
		return Term{}, unexpected(start)
	}
	p.next() // the 'd'

	sides, err := p.expectNumber()
	if err != nil {
		return Term{}, err
	}
	spec := &DiceSpec{Count: count, Sides: sides.value}

	switch p.peek().kind {
	case tokKeepHigh, tokKeepLow:
		k := p.next()
		n, err := p.expectNumber()
		if err != nil {
			return Term{}, err
		}
		spec.Keep = &Keep{Highest: k.kind == tokKeepHigh, Count: n.value}
	case tokAtLeast:
		p.next()
		n, err := p.expectNumber()
		if err != nil {
			return Term{}, err
		}
		threshold := n.value
		spec.Threshold = &threshold
	}
	return Term{Sign: sign, Dice: spec, Position: start.pos}, nil
}

// validate enforces the rules the grammar alone cannot express.
// It returns error (not *Error) and only ever returns a literal nil on success —
// returning a nil *Error through an error interface would make it non-nil.
func validate(e Expression, l Limits) error {
	if len(e.Terms) > l.MaxTerms {
		return newError(CodeTooManyTerms, -1, map[string]int{"max": l.MaxTerms})
	}

	diceTerms, totalDice := 0, 0
	var pool *Term
	for i := range e.Terms {
		t := &e.Terms[i]
		if t.Dice == nil {
			if t.Constant > l.MaxConstant {
				return newError(CodeNumberOutOfRange, t.Position, map[string]int{"max": l.MaxConstant})
			}
			continue
		}
		d := t.Dice
		diceTerms++
		if d.Count < 1 || d.Count > l.MaxDicePerTerm {
			return newError(CodeCountOutOfRange, t.Position, map[string]int{"max": l.MaxDicePerTerm})
		}
		if d.Sides < l.MinSides || d.Sides > l.MaxSides {
			return newError(CodeSidesOutOfRange, t.Position, map[string]int{"min": l.MinSides, "max": l.MaxSides})
		}
		if d.Keep != nil && (d.Keep.Count < 1 || d.Keep.Count > d.Count) {
			return newError(CodeKeepOutOfRange, t.Position, map[string]int{"max": d.Count})
		}
		if d.Threshold != nil {
			if *d.Threshold < 1 || *d.Threshold > d.Sides {
				return newError(CodeThresholdOutOfRange, t.Position, map[string]int{"max": d.Sides})
			}
			pool = t
		}
		totalDice += d.Count
	}

	if diceTerms == 0 {
		return newError(CodeNoDice, -1, nil)
	}
	if totalDice > l.MaxDiceTotal {
		return newError(CodeTooManyDice, -1, map[string]int{"max": l.MaxDiceTotal})
	}
	if pool != nil {
		// Successes (a count) and pips (a sum) are different units — they cannot be added.
		if diceTerms > 1 || pool.Sign < 0 {
			return newError(CodePoolMixed, pool.Position, nil)
		}
		if e.Check != nil {
			return newError(CodePoolWithCheck, e.Check.Position, nil)
		}
	}
	if e.Check != nil && e.Check.Target > l.MaxCheckTarget {
		return newError(CodeNumberOutOfRange, e.Check.Position, map[string]int{"max": l.MaxCheckTarget})
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/dice/ -v`
Expected: PASS, all `TestParse_ValidExpressions/*` and `TestParse_Errors/*` subtests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/dice/
git commit -m "feat: PLAYRPG-231 dice expression parser and validation"
```

---

### Task 2: Dice domain — evaluation

**Files:**
- Create: `warhammer-battle-helper-backend/internal/dice/evaluate.go`
- Test: `warhammer-battle-helper-backend/internal/dice/evaluate_test.go`

**Interfaces:**
- Consumes: `Parse`, `Expression`, `DiceSpec`, `Keep` from Task 1.
- Produces:
  - `type Roller interface { Intn(n int) int }` — `systems.DefaultRoller()` satisfies it structurally.
  - `func Evaluate(expr Expression, rng Roller) Outcome`
  - `type Mode string`, `ModeSum = "sum"`, `ModePool = "pool"`
  - `type Outcome struct { Canonical string; Mode Mode; Terms []TermOutcome; Total int; Check *CheckOutcome }`
  - `type TermOutcome struct { Sign int; Spec *DiceSpec; Dice []Die; Subtotal int }` — `Spec == nil` = constant, `Subtotal` holds it.
  - `type Die struct { Value int; Kept bool; Success bool }`
  - `type CheckOutcome struct { Target int; Success bool }`

- [ ] **Step 1: Write the failing test**

`internal/dice/evaluate_test.go`:

```go
package dice

import "testing"

// seqRoller returns the given face values in order. Intn returns value-1 because
// Evaluate adds 1 to turn Intn's [0, n) into a die face [1, n].
type seqRoller struct {
	t      *testing.T
	values []int
	i      int
}

func (r *seqRoller) Intn(n int) int {
	r.t.Helper()
	if r.i >= len(r.values) {
		r.t.Fatalf("roller exhausted after %d values", len(r.values))
	}
	v := r.values[r.i]
	r.i++
	if v < 1 || v > n {
		r.t.Fatalf("value %d does not fit a d%d", v, n)
	}
	return v - 1
}

func mustEvaluate(t *testing.T, input string, values ...int) Outcome {
	t.Helper()
	expr, err := Parse(input, DefaultLimits())
	if err != nil {
		t.Fatalf("Parse(%q): %v", input, err)
	}
	return Evaluate(expr, &seqRoller{t: t, values: values})
}

func keptFlags(dice []Die) []bool {
	out := make([]bool, len(dice))
	for i, d := range dice {
		out[i] = d.Kept
	}
	return out
}

func equalBools(a, b []bool) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestEvaluate_SumOfMixedTerms(t *testing.T) {
	o := mustEvaluate(t, "2d6 + 1d4 - 1", 4, 2, 3)

	if o.Mode != ModeSum || o.Total != 8 || o.Canonical != "2d6+1d4-1" {
		t.Fatalf("got mode=%s total=%d canonical=%q", o.Mode, o.Total, o.Canonical)
	}
	if len(o.Terms) != 3 {
		t.Fatalf("want 3 terms, got %d", len(o.Terms))
	}
	if o.Terms[0].Subtotal != 6 || o.Terms[1].Subtotal != 3 || o.Terms[2].Subtotal != 1 {
		t.Errorf("subtotals = %d,%d,%d", o.Terms[0].Subtotal, o.Terms[1].Subtotal, o.Terms[2].Subtotal)
	}
	if o.Terms[2].Spec != nil || o.Terms[2].Sign != -1 {
		t.Errorf("third term should be the constant -1")
	}
	if o.Check != nil {
		t.Errorf("no vs in input, Check should be nil")
	}
}

func TestEvaluate_Keep(t *testing.T) {
	cases := []struct {
		name   string
		input  string
		values []int
		kept   []bool
		total  int
	}{
		{"keep highest", "4d6kh3", []int{3, 6, 1, 5}, []bool{true, true, false, true}, 14},
		{"keep lowest", "2d20kl1", []int{17, 4}, []bool{false, true}, 4},
		{"tie keeps earlier (low)", "3d6kl1", []int{2, 2, 5}, []bool{true, false, false}, 2},
		{"tie keeps earlier (high)", "3d6kh2", []int{5, 5, 5}, []bool{true, true, false}, 10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			o := mustEvaluate(t, tc.input, tc.values...)
			if got := keptFlags(o.Terms[0].Dice); !equalBools(got, tc.kept) {
				t.Errorf("kept = %v, want %v", got, tc.kept)
			}
			if o.Total != tc.total {
				t.Errorf("total = %d, want %d", o.Total, tc.total)
			}
		})
	}
}

func TestEvaluate_Pool(t *testing.T) {
	o := mustEvaluate(t, "5d10>=7+1", 7, 3, 10, 6, 8)

	if o.Mode != ModePool {
		t.Fatalf("mode = %s, want pool", o.Mode)
	}
	wantSuccess := []bool{true, false, true, false, true}
	for i, d := range o.Terms[0].Dice {
		if d.Success != wantSuccess[i] {
			t.Errorf("die %d success = %v, want %v", i, d.Success, wantSuccess[i])
		}
	}
	if o.Terms[0].Subtotal != 3 || o.Total != 4 {
		t.Errorf("subtotal=%d total=%d, want 3 and 4", o.Terms[0].Subtotal, o.Total)
	}
}

func TestEvaluate_PoolClampsAtZero(t *testing.T) {
	o := mustEvaluate(t, "2d10>=7-3", 1, 2)
	if o.Total != 0 {
		t.Errorf("total = %d, want 0", o.Total)
	}
}

func TestEvaluate_CheckIsInclusive(t *testing.T) {
	pass := mustEvaluate(t, "d100-10 vs 45", 55)
	if pass.Check == nil || !pass.Check.Success || pass.Check.Target != 45 || pass.Total != 45 {
		t.Errorf("55-10=45 vs 45 should succeed, got %+v total=%d", pass.Check, pass.Total)
	}
	fail := mustEvaluate(t, "d100-10 vs 45", 56)
	if fail.Check == nil || fail.Check.Success {
		t.Errorf("56-10=46 vs 45 should fail, got %+v", fail.Check)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/dice/ -run TestEvaluate -v`
Expected: FAIL — `undefined: Evaluate`.

- [ ] **Step 3: Write the implementation**

`internal/dice/evaluate.go`:

```go
package dice

import "sort"

// Roller is the domain's source of randomness. systems.DefaultRoller() satisfies it
// structurally, so this package does not import the systems package.
type Roller interface {
	Intn(n int) int
}

type Mode string

const (
	ModeSum  Mode = "sum"
	ModePool Mode = "pool"
)

// Outcome is the full, explainable result of one evaluated expression.
type Outcome struct {
	Canonical string
	Mode      Mode
	Terms     []TermOutcome
	Total     int // sum, or the success count in pool mode
	Check     *CheckOutcome
}

// TermOutcome mirrors one Term. Spec == nil means a constant; Subtotal then holds it.
type TermOutcome struct {
	Sign     int
	Spec     *DiceSpec
	Dice     []Die
	Subtotal int // kept-dice sum, success count, or the constant — always unsigned
}

type Die struct {
	Value   int
	Kept    bool // false = dropped by kh/kl
	Success bool // pool mode only
}

type CheckOutcome struct {
	Target  int
	Success bool
}

// Evaluate rolls a validated expression. It cannot fail: Parse already rejected
// everything Evaluate would not know how to handle.
func Evaluate(expr Expression, rng Roller) Outcome {
	out := Outcome{Canonical: expr.String(), Mode: ModeSum}
	if expr.IsPool() {
		out.Mode = ModePool
	}

	for _, t := range expr.Terms {
		to := TermOutcome{Sign: t.Sign}
		if t.Dice == nil {
			to.Subtotal = t.Constant
		} else {
			to.Spec = t.Dice
			to.Dice = rollDice(t.Dice, rng)
			to.Subtotal = subtotal(to.Dice, t.Dice)
		}
		out.Total += t.Sign * to.Subtotal
		out.Terms = append(out.Terms, to)
	}

	if out.Mode == ModePool && out.Total < 0 {
		out.Total = 0
	}
	if expr.Check != nil {
		out.Check = &CheckOutcome{Target: expr.Check.Target, Success: out.Total <= expr.Check.Target}
	}
	return out
}

func rollDice(spec *DiceSpec, rng Roller) []Die {
	dice := make([]Die, spec.Count)
	for i := range dice {
		dice[i] = Die{Value: rng.Intn(spec.Sides) + 1, Kept: true}
	}
	if spec.Keep != nil {
		applyKeep(dice, *spec.Keep)
	}
	if spec.Threshold != nil {
		for i := range dice {
			dice[i].Success = dice[i].Value >= *spec.Threshold
		}
	}
	return dice
}

// applyKeep marks all but the best k.Count dice as dropped. The stable sort keeps
// equal values in roll order, so on a tie the earlier die survives.
func applyKeep(dice []Die, k Keep) {
	order := make([]int, len(dice))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool {
		va, vb := dice[order[a]].Value, dice[order[b]].Value
		if k.Highest {
			return va > vb
		}
		return va < vb
	})
	for i := range dice {
		dice[i].Kept = false
	}
	for _, idx := range order[:k.Count] {
		dice[idx].Kept = true
	}
}

func subtotal(dice []Die, spec *DiceSpec) int {
	n := 0
	for _, d := range dice {
		switch {
		case spec.Threshold != nil:
			if d.Success {
				n++
			}
		case d.Kept:
			n += d.Value
		}
	}
	return n
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/dice/ -v`
Expected: PASS (all parse + evaluate tests).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/dice/evaluate.go warhammer-battle-helper-backend/internal/dice/evaluate_test.go
git commit -m "feat: PLAYRPG-231 dice expression evaluation"
```

---

### Task 3: Extract RollPublisher and DisplayNameResolver from GameService

Behaviour-preserving refactor. Characterization tests first, then move the code.

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/roll_publisher.go`
- Create: `warhammer-battle-helper-backend/internal/service/roll_publisher_test.go`
- Create: `warhammer-battle-helper-backend/internal/service/display_name_resolver.go`
- Create: `warhammer-battle-helper-backend/internal/service/display_name_resolver_test.go`
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go` (struct at :22-30, constructor at :32-50, `resolveDisplayNameForUser` at :259-276, `broadcastRoll` at :774-793, all callers)

**Interfaces:**
- Produces:
  - `func NewRollPublisher(hub hubBroadcaster) *RollPublisher`
  - `func (p *RollPublisher) Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID)`
  - `func NewDisplayNameResolver(users userFinder) *DisplayNameResolver`
  - `func (r *DisplayNameResolver) DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string`

- [ ] **Step 1: Write the failing tests**

`internal/service/roll_publisher_test.go`:

```go
package service

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubHub struct {
	toGame  int
	toUsers [][]string
}

func (h *stubHub) BroadcastToGame(gameID, messageType string, payload map[string]interface{}) {
	h.toGame++
}

func (h *stubHub) BroadcastToUsers(gameID, messageType string, payload map[string]interface{}, userIDs []string) {
	h.toUsers = append(h.toUsers, userIDs)
}

func TestRollPublisher_RoutesByVisibility(t *testing.T) {
	gm, roller, other := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

	cases := []struct {
		name       string
		visibility string
		roller     primitive.ObjectID
		wantGame   bool
		wantUsers  []string
	}{
		{"all", "all", roller, true, nil},
		{"empty means all", "", roller, true, nil},
		{"gm only", "gm_only", roller, false, []string{gm.Hex()}},
		{"gm and roller", "gm_and_roller", roller, false, []string{gm.Hex(), roller.Hex()}},
		{"gm and roller when gm rolls", "gm_and_roller", gm, false, []string{gm.Hex()}},
		{"targeted player", other.Hex(), roller, false, []string{roller.Hex(), other.Hex()}},
		{"targeted at self", roller.Hex(), roller, false, []string{roller.Hex()}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			hub := &stubHub{}
			NewRollPublisher(hub).Publish("g1", "DICE_ROLLED", nil, tc.visibility, tc.roller, gm)

			if tc.wantGame {
				if hub.toGame != 1 || len(hub.toUsers) != 0 {
					t.Fatalf("want one game-wide broadcast, got game=%d users=%v", hub.toGame, hub.toUsers)
				}
				return
			}
			if hub.toGame != 0 || len(hub.toUsers) != 1 || !reflect.DeepEqual(hub.toUsers[0], tc.wantUsers) {
				t.Fatalf("want users %v, got game=%d users=%v", tc.wantUsers, hub.toGame, hub.toUsers)
			}
		})
	}
}
```

`internal/service/display_name_resolver_test.go`:

```go
package service

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubUserFinder struct {
	user *models.User
	err  error
}

func (f stubUserFinder) FindByID(id primitive.ObjectID) (*models.User, error) {
	return f.user, f.err
}

func TestDisplayNameResolver(t *testing.T) {
	userID := primitive.NewObjectID()
	gameWith := func(p models.GameParticipant) *models.Game {
		p.UserID = userID
		return &models.Game{Participants: []models.GameParticipant{p}}
	}

	cases := []struct {
		name  string
		game  *models.Game
		users stubUserFinder
		want  string
	}{
		{"not a participant", &models.Game{}, stubUserFinder{}, "fallback@x"},
		{"game signature wins", gameWith(models.GameParticipant{Email: "p@x", Signature: "Gandalf"}),
			stubUserFinder{user: &models.User{Email: "u@x", Signature: "Acc"}}, "Gandalf"},
		{"account signature", gameWith(models.GameParticipant{Email: "p@x"}),
			stubUserFinder{user: &models.User{Email: "u@x", Signature: "Acc"}}, "Acc"},
		{"account email", gameWith(models.GameParticipant{Email: "p@x"}),
			stubUserFinder{user: &models.User{Email: "u@x"}}, "u@x"},
		{"user lookup fails", gameWith(models.GameParticipant{Email: "p@x"}),
			stubUserFinder{err: errors.New("down")}, "p@x"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NewDisplayNameResolver(tc.users).DisplayName(tc.game, userID, "fallback@x")
			if got != tc.want {
				t.Errorf("DisplayName = %q, want %q", got, tc.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestRollPublisher|TestDisplayNameResolver' -v`
Expected: FAIL — `undefined: NewRollPublisher`, `undefined: NewDisplayNameResolver`.

- [ ] **Step 3: Create the two adapters**

`internal/service/roll_publisher.go`:

```go
package service

import "go.mongodb.org/mongo-driver/bson/primitive"

// hubBroadcaster is the slice of websocket.Hub that roll routing needs.
type hubBroadcaster interface {
	BroadcastToGame(gameID, messageType string, payload map[string]interface{})
	BroadcastToUsers(gameID, messageType string, payload map[string]interface{}, userIDs []string)
}

// RollPublisher sends a roll or chat event to exactly the users its visibility allows.
type RollPublisher struct {
	hub hubBroadcaster
}

func NewRollPublisher(hub hubBroadcaster) *RollPublisher {
	return &RollPublisher{hub: hub}
}

// Publish routes by visibility: "all" | "gm_only" | "gm_and_roller" | a target user id.
func (p *RollPublisher) Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID) {
	switch visibility {
	case "gm_only":
		p.hub.BroadcastToUsers(gameID, eventType, payload, []string{gmID.Hex()})
	case "gm_and_roller":
		targets := []string{gmID.Hex()}
		if rollerID != gmID {
			targets = append(targets, rollerID.Hex())
		}
		p.hub.BroadcastToUsers(gameID, eventType, payload, targets)
	case "all", "":
		p.hub.BroadcastToGame(gameID, eventType, payload)
	default: // targeted to a specific user id — only the roller and that user receive it (GM excluded)
		targets := []string{rollerID.Hex()}
		if visibility != rollerID.Hex() {
			targets = append(targets, visibility)
		}
		p.hub.BroadcastToUsers(gameID, eventType, payload, targets)
	}
}
```

`internal/service/display_name_resolver.go`:

```go
package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type userFinder interface {
	FindByID(id primitive.ObjectID) (*models.User, error)
}

// DisplayNameResolver picks the name shown next to a user's log entries in one game.
type DisplayNameResolver struct {
	users userFinder
}

func NewDisplayNameResolver(users userFinder) *DisplayNameResolver {
	return &DisplayNameResolver{users: users}
}

// DisplayName returns game signature → account signature → account email → participant email,
// or fallback when the user is not a participant of the game.
func (r *DisplayNameResolver) DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string {
	var participant *models.GameParticipant
	for i := range game.Participants {
		if game.Participants[i].UserID == userID {
			participant = &game.Participants[i]
			break
		}
	}
	if participant == nil {
		return fallback
	}
	user, err := r.users.FindByID(userID)
	if err != nil {
		return resolveDisplayName(participant, nil)
	}
	return resolveDisplayName(participant, user)
}
```

- [ ] **Step 4: Switch GameService to the adapters and delete the old methods**

In `internal/service/GameService.go`:

1. Add two fields to `GameService` (after `templateService`):
   ```go
   	publisher       *RollPublisher
   	names           *DisplayNameResolver
   ```
2. In `NewGameService`, add to the returned literal:
   ```go
   		publisher:       NewRollPublisher(hub),
   		names:           NewDisplayNameResolver(userRepo),
   ```
3. Delete the whole `resolveDisplayNameForUser` method (comment + body, ~:258-276) and the whole `broadcastRoll` method (~:774-793). Keep the free function `resolveDisplayName` — the resolver uses it.
4. Switch every caller (same argument order, so a textual replace is safe):
   ```bash
   cd warhammer-battle-helper-backend
   sed -i '' 's/s\.resolveDisplayNameForUser(/s.names.DisplayName(/g; s/s\.broadcastRoll(/s.publisher.Publish(/g' internal/service/GameService.go
   grep -rn "resolveDisplayNameForUser\|broadcastRoll" internal/
   ```
   Expected: the grep prints nothing.

- [ ] **Step 5: Run the whole service suite**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/service/ -v 2>&1 | tail -20`
Expected: build OK; `PASS`, including the new `TestRollPublisher_RoutesByVisibility/*` and `TestDisplayNameResolver/*`; no other test changed.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/
git commit -m "refactor: PLAYRPG-231 extract roll publisher and display name resolver"
```

---

### Task 4: DiceRollService (application layer)

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/DiceRollService.go`
- Test: `warhammer-battle-helper-backend/internal/service/DiceRollService_test.go`

**Interfaces:**
- Consumes: `dice.Parse`, `dice.Evaluate`, `dice.DefaultLimits`, `dice.Outcome`, `dice.Error` (Tasks 1–2); `*RollPublisher`, `*DisplayNameResolver` satisfy the ports (Task 3); `models.EventTypeDiceRoll`, `websocket.EventDiceRolled`.
- Produces:
  - `type RollActor struct { UserID primitive.ObjectID; Email string }`
  - `func NewDiceRollService(games gameLookup, events eventAppender, publisher rollPublisher, names displayNameResolver, stats rollStatsRecorder, rng dice.Roller) *DiceRollService`
  - `func (s *DiceRollService) RollExpression(gameID, input string, actor RollActor, visibility string) (map[string]interface{}, error)` — on a bad expression the error is `*dice.Error`.
  - Payload keys: `rollType`("expression"), `expression`, `mode`, `terms`, `total`, `check`(only with vs), `username`, `visibility`, `rollerUserId`. Each term: `sign`, `subtotal`, and either `constant` or `count`, `sides`, `dice`([]{`value`,`kept`,`success`}), optional `keep`{`highest`,`count`}, optional `threshold`.

- [ ] **Step 1: Write the failing test**

`internal/service/DiceRollService_test.go`:

```go
package service

import (
	"errors"
	"testing"

	"battle-helper/internal/dice"
	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubGameLookup struct {
	game  *models.Game
	calls int
}

func (s *stubGameLookup) GetByID(id string) (*models.Game, error) {
	s.calls++
	if s.game == nil {
		return nil, errors.New("not found")
	}
	return s.game, nil
}

type stubEventLog struct{ events []models.GameEvent }

func (s *stubEventLog) AddEvent(gameID string, e models.GameEvent) error {
	s.events = append(s.events, e)
	return nil
}

type publishedRoll struct {
	eventType  string
	visibility string
	payload    map[string]interface{}
}

type stubPublisher struct{ published []publishedRoll }

func (s *stubPublisher) Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID) {
	s.published = append(s.published, publishedRoll{eventType, visibility, payload})
}

type stubNames struct{}

func (stubNames) DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string {
	return "Ania"
}

type stubStats struct{ recorded []*models.RollStat }

func (s *stubStats) Record(stat *models.RollStat) error {
	s.recorded = append(s.recorded, stat)
	return nil
}

// stubRoller returns face values in order (Intn yields value-1).
type stubRoller struct {
	values []int
	i      int
}

func (r *stubRoller) Intn(n int) int {
	v := r.values[r.i]
	r.i++
	return v - 1
}

type diceRollFixture struct {
	svc       *DiceRollService
	games     *stubGameLookup
	events    *stubEventLog
	publisher *stubPublisher
	stats     *stubStats
	gameID    string
	actor     RollActor
}

func newDiceRollFixture(values ...int) diceRollFixture {
	f := diceRollFixture{
		games:     &stubGameLookup{game: &models.Game{GameMasterID: primitive.NewObjectID()}},
		events:    &stubEventLog{},
		publisher: &stubPublisher{},
		stats:     &stubStats{},
		gameID:    primitive.NewObjectID().Hex(),
		actor:     RollActor{UserID: primitive.NewObjectID(), Email: "ania@x"},
	}
	f.svc = NewDiceRollService(f.games, f.events, f.publisher, stubNames{}, f.stats, &stubRoller{values: values})
	f.svc.runAsync = func(fn func()) { fn() } // make stats recording observable in the test
	return f
}

func TestRollExpression_InvalidExpressionTouchesNothing(t *testing.T) {
	f := newDiceRollFixture()

	_, err := f.svc.RollExpression(f.gameID, "2x6", f.actor, "")

	var de *dice.Error
	if !errors.As(err, &de) || de.Code != dice.CodeUnexpectedToken {
		t.Fatalf("want *dice.Error unexpected_token, got %v", err)
	}
	if f.games.calls != 0 || len(f.events.events) != 0 || len(f.publisher.published) != 0 || len(f.stats.recorded) != 0 {
		t.Errorf("a rejected expression must not read or write anything")
	}
}

func TestRollExpression_PayloadShape(t *testing.T) {
	f := newDiceRollFixture(4, 2, 3)

	payload, err := f.svc.RollExpression(f.gameID, "2d6 + 1d4 - 1", f.actor, "")
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]interface{}{
		"rollType":     "expression",
		"expression":   "2d6+1d4-1",
		"mode":         "sum",
		"total":        8,
		"username":     "Ania",
		"visibility":   "all",
		"rollerUserId": f.actor.UserID.Hex(),
	}
	for k, v := range want {
		if payload[k] != v {
			t.Errorf("payload[%q] = %v, want %v", k, payload[k], v)
		}
	}
	if _, has := payload["check"]; has {
		t.Errorf("payload must not carry check without vs")
	}

	terms := payload["terms"].([]map[string]interface{})
	if len(terms) != 3 {
		t.Fatalf("want 3 terms, got %d", len(terms))
	}
	first := terms[0]
	if first["count"] != 2 || first["sides"] != 6 || first["subtotal"] != 6 || first["sign"] != 1 {
		t.Errorf("first term = %v", first)
	}
	firstDice := first["dice"].([]map[string]interface{})
	if len(firstDice) != 2 || firstDice[0]["value"] != 4 || firstDice[0]["kept"] != true {
		t.Errorf("first term dice = %v", firstDice)
	}
	if terms[2]["constant"] != 1 || terms[2]["sign"] != -1 {
		t.Errorf("constant term = %v", terms[2])
	}

	if len(f.events.events) != 1 {
		t.Fatalf("want one stored event, got %d", len(f.events.events))
	}
	ev := f.events.events[0]
	if ev.Type != models.EventTypeDiceRoll || ev.Username != "Ania" || ev.Visibility != "all" || ev.RollerUserID != f.actor.UserID {
		t.Errorf("stored event = %+v", ev)
	}
	if len(f.publisher.published) != 1 || f.publisher.published[0].eventType != websocket.EventDiceRolled {
		t.Errorf("want one DICE_ROLLED broadcast, got %+v", f.publisher.published)
	}
}

func TestRollExpression_ForwardsVisibility(t *testing.T) {
	f := newDiceRollFixture(3)

	if _, err := f.svc.RollExpression(f.gameID, "d6", f.actor, "gm_only"); err != nil {
		t.Fatal(err)
	}
	if f.publisher.published[0].visibility != "gm_only" || f.events.events[0].Visibility != "gm_only" {
		t.Errorf("visibility not forwarded: %+v / %+v", f.publisher.published[0], f.events.events[0])
	}
}

func TestRollExpression_RecordsEveryRolledDie(t *testing.T) {
	f := newDiceRollFixture(1, 2, 3, 4)

	if _, err := f.svc.RollExpression(f.gameID, "4d6kh3+2", f.actor, ""); err != nil {
		t.Fatal(err)
	}
	if len(f.stats.recorded) != 4 {
		t.Fatalf("want 4 stats (dropped die included), got %d", len(f.stats.recorded))
	}
	for i, st := range f.stats.recorded {
		if st.DieType != 6 || st.Result != i+1 || st.RollType != "generic" || st.UserID != f.actor.UserID || st.GameID == nil {
			t.Errorf("stat %d = %+v", i, st)
		}
	}
}

func TestRollExpression_CheckInPayload(t *testing.T) {
	f := newDiceRollFixture(55)

	payload, err := f.svc.RollExpression(f.gameID, "d100-10 vs 45", f.actor, "")
	if err != nil {
		t.Fatal(err)
	}
	check, ok := payload["check"].(map[string]interface{})
	if !ok || check["target"] != 45 || check["success"] != true {
		t.Errorf("check = %v", payload["check"])
	}
}

func TestRollExpression_GameNotFound(t *testing.T) {
	f := newDiceRollFixture(3)
	f.games.game = nil

	_, err := f.svc.RollExpression(f.gameID, "d6", f.actor, "")

	var de *dice.Error
	if err == nil || errors.As(err, &de) {
		t.Fatalf("want a plain error, got %v", err)
	}
	if len(f.events.events) != 0 {
		t.Errorf("nothing may be stored for a missing game")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestRollExpression -v`
Expected: FAIL — `undefined: NewDiceRollService`, `undefined: RollActor`.

- [ ] **Step 3: Write the implementation**

`internal/service/DiceRollService.go`:

```go
package service

import (
	"fmt"
	"log"

	"battle-helper/internal/dice"
	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Ports of DiceRollService. Declared here, by the consumer, so the service depends on
// what it uses rather than on concrete repositories — and tests can pass stubs.
type gameLookup interface {
	GetByID(id string) (*models.Game, error)
}

type eventAppender interface {
	AddEvent(gameID string, event models.GameEvent) error
}

type rollPublisher interface {
	Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID)
}

type displayNameResolver interface {
	DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string
}

type rollStatsRecorder interface {
	Record(stat *models.RollStat) error
}

// RollActor is the user who rolls, as read from the JWT.
type RollActor struct {
	UserID primitive.ObjectID
	Email  string
}

// DiceRollService rolls free-form dice expressions typed in chat.
type DiceRollService struct {
	games     gameLookup
	events    eventAppender
	publisher rollPublisher
	names     displayNameResolver
	stats     rollStatsRecorder
	rng       dice.Roller
	limits    dice.Limits
	runAsync  func(func()) // stats are written off the request path; tests run them inline
}

func NewDiceRollService(games gameLookup, events eventAppender, publisher rollPublisher, names displayNameResolver, stats rollStatsRecorder, rng dice.Roller) *DiceRollService {
	return &DiceRollService{
		games:     games,
		events:    events,
		publisher: publisher,
		names:     names,
		stats:     stats,
		rng:       rng,
		limits:    dice.DefaultLimits(),
		runAsync:  func(fn func()) { go fn() },
	}
}

// RollExpression parses, rolls, stores and broadcasts one expression.
// The expression is parsed before the game is loaded: a malformed line costs no database read.
func (s *DiceRollService) RollExpression(gameID, input string, actor RollActor, visibility string) (map[string]interface{}, error) {
	expr, err := dice.Parse(input, s.limits)
	if err != nil {
		return nil, err
	}
	game, err := s.games.GetByID(gameID)
	if err != nil {
		return nil, fmt.Errorf("game not found: %w", err)
	}
	outcome := dice.Evaluate(expr, s.rng)

	if visibility == "" {
		visibility = "all"
	}
	displayName := s.names.DisplayName(game, actor.UserID, actor.Email)

	payload := outcomeToPayload(outcome)
	payload["username"] = displayName
	payload["visibility"] = visibility
	payload["rollerUserId"] = actor.UserID.Hex()

	event := models.GameEvent{
		Type:         models.EventTypeDiceRoll,
		CreatedBy:    actor.UserID,
		Username:     displayName,
		Visibility:   visibility,
		RollerUserID: actor.UserID,
		Data:         payload,
	}
	if err := s.events.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	s.publisher.Publish(gameID, websocket.EventDiceRolled, payload, visibility, actor.UserID, game.GameMasterID)
	s.recordStats(gameID, actor.UserID, outcome)
	return payload, nil
}

// outcomeToPayload maps the domain result to the event/HTTP shape. It lives here, not in
// the dice package, because the domain must not know about JSON or Mongo documents.
func outcomeToPayload(o dice.Outcome) map[string]interface{} {
	terms := make([]map[string]interface{}, 0, len(o.Terms))
	for _, t := range o.Terms {
		term := map[string]interface{}{"sign": t.Sign, "subtotal": t.Subtotal}
		if t.Spec == nil {
			term["constant"] = t.Subtotal
			terms = append(terms, term)
			continue
		}
		term["count"] = t.Spec.Count
		term["sides"] = t.Spec.Sides
		if t.Spec.Keep != nil {
			term["keep"] = map[string]interface{}{"highest": t.Spec.Keep.Highest, "count": t.Spec.Keep.Count}
		}
		if t.Spec.Threshold != nil {
			term["threshold"] = *t.Spec.Threshold
		}
		rolled := make([]map[string]interface{}, len(t.Dice))
		for i, d := range t.Dice {
			rolled[i] = map[string]interface{}{"value": d.Value, "kept": d.Kept, "success": d.Success}
		}
		term["dice"] = rolled
		terms = append(terms, term)
	}

	payload := map[string]interface{}{
		"rollType":   "expression",
		"expression": o.Canonical,
		"mode":       string(o.Mode),
		"terms":      terms,
		"total":      o.Total,
	}
	if o.Check != nil {
		payload["check"] = map[string]interface{}{"target": o.Check.Target, "success": o.Check.Success}
	}
	return payload
}

// recordStats stores one RollStat per physically rolled die, dropped ones included,
// under RollType "generic" — the same bucket as the dice buttons.
func (s *DiceRollService) recordStats(gameID string, userID primitive.ObjectID, o dice.Outcome) {
	gameObjID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return
	}
	var stats []*models.RollStat
	for _, t := range o.Terms {
		if t.Spec == nil {
			continue
		}
		for _, d := range t.Dice {
			stats = append(stats, &models.RollStat{
				UserID:   userID,
				GameID:   &gameObjID,
				DieType:  t.Spec.Sides,
				Result:   d.Value,
				RollType: "generic",
			})
		}
	}
	s.runAsync(func() {
		for _, st := range stats {
			if err := s.stats.Record(st); err != nil {
				log.Printf("roll stats record failed: %v", err)
			}
		}
	})
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestRollExpression -v`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/DiceRollService.go warhammer-battle-helper-backend/internal/service/DiceRollService_test.go
git commit -m "feat: PLAYRPG-231 dice roll application service"
```

---

### Task 5: HTTP handler and routing

**Files:**
- Create: `warhammer-battle-helper-backend/internal/http/DiceRollHandler.go`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go` (imports :3-22, services ~:126, handlers ~:220, routes ~:229)

**Interfaces:**
- Consumes: `service.NewDiceRollService`, `service.RollActor`, `service.NewRollPublisher`, `service.NewDisplayNameResolver` (Tasks 3–4), `systems.DefaultRoller()`.
- Produces: `POST /games/:id/rollExpression` — body `{expression, visibility}`; 200 → payload from Task 4; 400 invalid expression → `{"error":"invalid_expression","code":…,"position":…,"params":{…}}`.

- [ ] **Step 1: Write the handler**

`internal/http/DiceRollHandler.go`:

```go
package http

import (
	"errors"
	"net/http"

	"battle-helper/internal/dice"
	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DiceRollHandler struct {
	DiceRollService *service.DiceRollService
}

// RollExpression rolls a dice expression typed in chat, e.g. "2d6+3 vs 10".
func (h *DiceRollHandler) RollExpression(c *gin.Context) {
	gameID := c.Param("id")

	var req struct {
		Expression string `json:"expression" binding:"required"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, _ := c.Get("jwt")
	claims := token.(*jwt.Token).Claims.(jwt.MapClaims)
	userID, err := primitive.ObjectIDFromHex(claims["user_id"].(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	actor := service.RollActor{UserID: userID, Email: claims["email"].(string)}

	payload, err := h.DiceRollService.RollExpression(gameID, req.Expression, actor, req.Visibility)
	if err != nil {
		var diceErr *dice.Error
		if errors.As(err, &diceErr) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "invalid_expression",
				"code":     diceErr.Code,
				"position": diceErr.Position,
				"params":   diceErr.Params,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, payload)
}
```

- [ ] **Step 2: Wire it in `main.go`**

1. Add to the import block: `"battle-helper/internal/systems"`.
2. After `gameService := service.NewGameService(...)` (~:126) add:
   ```go
   	diceRollService := service.NewDiceRollService(
   		gameRepo,
   		gameRepo,
   		service.NewRollPublisher(hub),
   		service.NewDisplayNameResolver(userRepo),
   		statsRepo,
   		systems.DefaultRoller(),
   	)
   ```
3. Next to `minigameHandler := …` (~:220) add:
   ```go
   	diceRollHandler := http.DiceRollHandler{DiceRollService: diceRollService}
   ```
4. Right after `game.POST("/roll", gameHandler.RollDice)` add:
   ```go
   	game.POST("/rollExpression", diceRollHandler.RollExpression)
   ```

- [ ] **Step 3: Build and run the backend suite**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./internal/dice/ ./internal/service/ ./internal/http/ && go test ./... 2>&1 | tail -15`
Expected: build and vet clean; every package `ok`.

- [ ] **Step 4: Smoke-test the endpoint on the local stack**

Get a JWT and a game id using the recipe in memory note "Local e2e verification recipe" (clear `activationToken`, log in via `POST /login`). Then:

```bash
curl -s -X POST "http://localhost:8080/games/$GAME/rollExpression" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"expression":"4d6kh3+2"}' | jq .
curl -s -X POST "http://localhost:8080/games/$GAME/rollExpression" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"expression":"3d6kh4"}' | jq .
```

Expected: first → 200 with `rollType: "expression"`, four dice, one `kept: false`. Second → 400 `{"error":"invalid_expression","code":"keep_out_of_range","position":0,"params":{"max":3}}`.
If the stack is not running, note that in the task report instead of skipping silently.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/DiceRollHandler.go warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat: PLAYRPG-231 POST /games/:id/rollExpression endpoint"
```

---

### Task 6: Frontend command module (`src/chat/commands/`) and API adapter

**Files:**
- Create: `warhammer-battle-helper-front/src/chat/commands/commandRegistry.js` + `commandRegistry.test.js`
- Create: `warhammer-battle-helper-front/src/chat/commands/parseChatInput.js` + `parseChatInput.test.js`
- Create: `warhammer-battle-helper-front/src/chat/commands/useChatHistory.js` + `useChatHistory.test.jsx`
- Create: `warhammer-battle-helper-front/src/chat/commands/useChatCommands.js` + `useChatCommands.test.jsx`
- Create: `warhammer-battle-helper-front/src/api/diceRolls.js` + `diceRolls.test.js`

**Interfaces:**
- Consumes: backend contract from Task 5.
- Produces:
  - `COMMANDS: Array<{ name, aliases, action: 'roll'|'help', visibility?, usageKey, descriptionKey }>`, `EXAMPLES: Array<{ notation, key }>`, `findCommand(token) → command|null`, `matchCommands(prefix) → command[]`
  - `parseChatInput(text) → { kind:'message', text } | { kind:'command', command, name, args } | { kind:'unknownCommand', name }`
  - `useChatHistory(max = 50) → { push(text), prev() → string|null, next() → string|null, isShowing(text) → bool, reset() }`
  - **Submit result contract** (shared by everything below): `{ ok: true, effect?: 'help' } | { ok: false, error: { key, params? } }`
  - `useChatCommands({ sendMessage, rollExpression, rollVisibility }) → submit(text) → Promise<SubmitResult>`; `sendMessage(text)` and `rollExpression(expression, visibility)` must return `Promise<SubmitResult>`.
  - `postRollExpression({ gameId, token, expression, visibility }) → Promise<SubmitResult>`

- [ ] **Step 1: Write the failing tests**

`src/chat/commands/commandRegistry.test.js`:

```js
import { COMMANDS, findCommand, matchCommands } from './commandRegistry';

describe('findCommand', () => {
    it('finds a command by name or alias, case-insensitively', () => {
        expect(findCommand('roll').name).toBe('roll');
        expect(findCommand('R').name).toBe('roll');
        expect(findCommand('gmr').name).toBe('gmroll');
        expect(findCommand('GMROLL').name).toBe('gmroll');
        expect(findCommand('help').name).toBe('help');
    });

    it('returns null for an unknown or empty name', () => {
        expect(findCommand('xyz')).toBeNull();
        expect(findCommand('')).toBeNull();
    });

    it('gmroll forces gm_only visibility, roll does not', () => {
        expect(findCommand('gmroll').visibility).toBe('gm_only');
        expect(findCommand('roll').visibility).toBeUndefined();
    });
});

describe('matchCommands', () => {
    it('lists every command for an empty prefix', () => {
        expect(matchCommands('')).toHaveLength(COMMANDS.length);
    });

    it('matches by name or alias prefix', () => {
        expect(matchCommands('g').map(c => c.name)).toEqual(['gmroll']);
        expect(matchCommands('r').map(c => c.name)).toEqual(['roll']);
        expect(matchCommands('H').map(c => c.name)).toEqual(['help']);
    });

    it('returns nothing when no command matches', () => {
        expect(matchCommands('zz')).toEqual([]);
    });
});
```

`src/chat/commands/parseChatInput.test.js`:

```js
import { parseChatInput } from './parseChatInput';

describe('parseChatInput', () => {
    it('treats text without a leading slash as a message', () => {
        expect(parseChatInput('  hej  ')).toEqual({ kind: 'message', text: 'hej' });
    });

    it('splits a command into the command and its arguments', () => {
        const parsed = parseChatInput('/r 2d6 + 3');
        expect(parsed.kind).toBe('command');
        expect(parsed.command.name).toBe('roll');
        expect(parsed.name).toBe('r');
        expect(parsed.args).toBe('2d6 + 3');
    });

    it('resolves aliases and upper case', () => {
        expect(parseChatInput('/ROLL d10').command.name).toBe('roll');
        expect(parseChatInput('/gmr d20').command.name).toBe('gmroll');
    });

    it('returns empty args for a bare command', () => {
        expect(parseChatInput('/help').args).toBe('');
        expect(parseChatInput('/r').args).toBe('');
    });

    it('reports an unknown command by its typed name', () => {
        expect(parseChatInput('/xyz 1')).toEqual({ kind: 'unknownCommand', name: 'xyz' });
    });
});
```

`src/chat/commands/useChatHistory.test.jsx`:

```js
import { renderHook } from '@testing-library/react';
import useChatHistory from './useChatHistory';

// Pure ref-based state with no DOM dependency, so renderHook is enough.
describe('useChatHistory', () => {
    it('returns null when there is nothing to recall', () => {
        const { result } = renderHook(() => useChatHistory());
        expect(result.current.prev()).toBeNull();
        expect(result.current.next()).toBeNull();
    });

    it('walks back and forth through sent entries', () => {
        const { result } = renderHook(() => useChatHistory());
        const h = result.current;
        h.push('a');
        h.push('b');

        expect(h.prev()).toBe('b');
        expect(h.isShowing('b')).toBe(true);
        expect(h.prev()).toBe('a');
        expect(h.prev()).toBe('a'); // clamped at the oldest entry
        expect(h.next()).toBe('b');
        expect(h.next()).toBe(''); // past the newest entry: back to an empty field
        expect(h.isShowing('')).toBe(false);
    });

    it('skips a consecutive duplicate', () => {
        const { result } = renderHook(() => useChatHistory());
        const h = result.current;
        h.push('a');
        h.push('a');

        expect(h.prev()).toBe('a');
        expect(h.next()).toBe('');
    });

    it('drops the oldest entry past the cap', () => {
        const { result } = renderHook(() => useChatHistory(2));
        const h = result.current;
        h.push('a');
        h.push('b');
        h.push('c');

        expect(h.prev()).toBe('c');
        expect(h.prev()).toBe('b');
        expect(h.prev()).toBe('b');
    });

    it('reset stops browsing', () => {
        const { result } = renderHook(() => useChatHistory());
        const h = result.current;
        h.push('a');
        h.prev();
        h.reset();

        expect(h.isShowing('a')).toBe(false);
        expect(h.next()).toBeNull();
    });
});
```

`src/chat/commands/useChatCommands.test.jsx`:

```js
import { renderHook } from '@testing-library/react';
import useChatCommands from './useChatCommands';

const setup = (rollVisibility = 'all') => {
    const sendMessage = jest.fn().mockResolvedValue({ ok: true });
    const rollExpression = jest.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useChatCommands({ sendMessage, rollExpression, rollVisibility }));
    return { submit: result.current, sendMessage, rollExpression };
};

describe('useChatCommands', () => {
    it('sends plain text as a chat message', async () => {
        const { submit, sendMessage, rollExpression } = setup();
        await expect(submit('hej')).resolves.toEqual({ ok: true });
        expect(sendMessage).toHaveBeenCalledWith('hej');
        expect(rollExpression).not.toHaveBeenCalled();
    });

    it('rolls with the visibility chosen in the panel', async () => {
        const { submit, rollExpression } = setup('gm_and_roller');
        await submit('/r 2d6 + 3');
        expect(rollExpression).toHaveBeenCalledWith('2d6 + 3', 'gm_and_roller');
    });

    it('/gmr forces gm_only regardless of the panel', async () => {
        const { submit, rollExpression } = setup('all');
        await submit('/gmr d20');
        expect(rollExpression).toHaveBeenCalledWith('d20', 'gm_only');
    });

    it('/help opens help locally without any request', async () => {
        const { submit, sendMessage, rollExpression } = setup();
        await expect(submit('/help')).resolves.toEqual({ ok: true, effect: 'help' });
        expect(sendMessage).not.toHaveBeenCalled();
        expect(rollExpression).not.toHaveBeenCalled();
    });

    it('rejects a roll without an expression', async () => {
        const { submit, rollExpression } = setup();
        await expect(submit('/r')).resolves.toEqual({
            ok: false,
            error: { key: 'chat.commands.errors.missingExpression', params: { command: 'r' } },
        });
        expect(rollExpression).not.toHaveBeenCalled();
    });

    it('rejects an unknown command locally', async () => {
        const { submit, sendMessage } = setup();
        await expect(submit('/xyz')).resolves.toEqual({
            ok: false,
            error: { key: 'chat.commands.errors.unknown', params: { name: 'xyz' } },
        });
        expect(sendMessage).not.toHaveBeenCalled();
    });
});
```

`src/api/diceRolls.test.js`:

```js
import { postRollExpression } from './diceRolls';

// The real module imports axios, whose ESM build CRA's Jest cannot load.
jest.mock('./axios', () => ({
    getApiUrl: () => 'http://api',
    getApiHeaders: (headers = {}) => headers,
}));

const respond = (ok, body) => jest.fn().mockResolvedValue({ ok, json: async () => body });
const args = { gameId: 'g1', token: 'jwt', expression: '2d6', visibility: 'all' };

describe('postRollExpression', () => {
    afterEach(() => { delete global.fetch; });

    it('posts the expression and reports success', async () => {
        global.fetch = respond(true, {});
        await expect(postRollExpression(args)).resolves.toEqual({ ok: true });

        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('http://api/games/g1/rollExpression');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer jwt');
        expect(JSON.parse(init.body)).toEqual({ expression: '2d6', visibility: 'all' });
    });

    it('maps an invalid expression to its i18n key with a 1-based position', async () => {
        global.fetch = respond(false, { error: 'invalid_expression', code: 'unexpected_token', position: 2, params: null });
        await expect(postRollExpression(args)).resolves.toEqual({
            ok: false,
            error: { key: 'chat.commands.diceErrors.unexpected_token', params: { position: 3 } },
        });
    });

    it('keeps the limit params of a range error', async () => {
        global.fetch = respond(false, { error: 'invalid_expression', code: 'keep_out_of_range', position: 0, params: { max: 3 } });
        const result = await postRollExpression(args);
        expect(result.error.params).toEqual({ max: 3, position: 1 });
    });

    it('reports any other failure as a generic roll error', async () => {
        global.fetch = respond(false, { error: 'boom' });
        await expect(postRollExpression(args)).resolves.toEqual({ ok: false, error: { key: 'chat.commands.errors.rollFailed' } });

        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
        await expect(postRollExpression(args)).resolves.toEqual({ ok: false, error: { key: 'chat.commands.errors.rollFailed' } });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='chat/commands|api/diceRolls'`
Expected: FAIL — `Cannot find module './commandRegistry'` (and the other new modules).

- [ ] **Step 3: Write the implementation**

`src/chat/commands/commandRegistry.js`:

```js
// Chat commands are a UI concept. The backend never sees a command name — only a dice
// expression and a visibility — so adding a command here needs no backend change.
export const COMMANDS = [
    {
        name: 'roll',
        aliases: ['r'],
        action: 'roll',
        usageKey: 'chat.commands.roll.usage',
        descriptionKey: 'chat.commands.roll.description',
    },
    {
        name: 'gmroll',
        aliases: ['gmr'],
        action: 'roll',
        visibility: 'gm_only',
        usageKey: 'chat.commands.gmroll.usage',
        descriptionKey: 'chat.commands.gmroll.description',
    },
    {
        name: 'help',
        aliases: [],
        action: 'help',
        usageKey: 'chat.commands.help.usage',
        descriptionKey: 'chat.commands.help.description',
    },
];

// Dice notation is not language, so it stays a literal; only the explanation is translated.
export const EXAMPLES = [
    { notation: '/r d10', key: 'chat.commands.examples.single' },
    { notation: '/r 3d100', key: 'chat.commands.examples.many' },
    { notation: '/r d100 -1', key: 'chat.commands.examples.modifier' },
    { notation: '/r 2d6 + 1d4 + 3', key: 'chat.commands.examples.mixed' },
    { notation: '/r 4d6kh3', key: 'chat.commands.examples.keepHighest' },
    { notation: '/r 2d20kl1', key: 'chat.commands.examples.keepLowest' },
    { notation: '/r 6d10>=7', key: 'chat.commands.examples.pool' },
    { notation: '/r d100-10 vs 45', key: 'chat.commands.examples.check' },
    { notation: '/gmr d20', key: 'chat.commands.examples.secret' },
];

export function findCommand(token) {
    const name = token.toLowerCase();
    return COMMANDS.find(c => c.name === name || c.aliases.includes(name)) || null;
}

export function matchCommands(prefix) {
    const p = prefix.toLowerCase();
    return COMMANDS.filter(c => c.name.startsWith(p) || c.aliases.some(a => a.startsWith(p)));
}
```

`src/chat/commands/parseChatInput.js`:

```js
import { findCommand } from './commandRegistry';

const COMMAND_RE = /^\/(\S*)\s*([\s\S]*)$/;

// Splits chat input into a plain message or a command. It never looks inside the
// arguments — the dice grammar is the backend's job.
export function parseChatInput(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
        return { kind: 'message', text: trimmed };
    }
    const [, name, rest] = COMMAND_RE.exec(trimmed);
    const command = findCommand(name);
    if (!command) {
        return { kind: 'unknownCommand', name };
    }
    return { kind: 'command', command, name, args: rest.trim() };
}
```

`src/chat/commands/useChatHistory.js`:

```js
import { useCallback, useMemo, useRef } from 'react';

const MAX_HISTORY = 50;

// Terminal-style history of sent chat lines. Kept in refs: browsing changes the
// textarea through the caller's own state, so the hook itself never needs to re-render.
export default function useChatHistory(max = MAX_HISTORY) {
    const entries = useRef([]);
    const index = useRef(null); // null = not browsing

    const push = useCallback((text) => {
        const list = entries.current;
        if (list[list.length - 1] !== text) {
            list.push(text);
            if (list.length > max) list.shift();
        }
        index.current = null;
    }, [max]);

    const prev = useCallback(() => {
        const list = entries.current;
        if (list.length === 0) return null;
        index.current = index.current === null ? list.length - 1 : Math.max(0, index.current - 1);
        return list[index.current];
    }, []);

    const next = useCallback(() => {
        const list = entries.current;
        if (index.current === null) return null;
        if (index.current >= list.length - 1) {
            index.current = null;
            return '';
        }
        index.current += 1;
        return list[index.current];
    }, []);

    const isShowing = useCallback(
        (text) => index.current !== null && entries.current[index.current] === text,
        []
    );

    const reset = useCallback(() => { index.current = null; }, []);

    return useMemo(() => ({ push, prev, next, isShowing, reset }), [push, prev, next, isShowing, reset]);
}
```

`src/chat/commands/useChatCommands.js`:

```js
import { useCallback } from 'react';
import { parseChatInput } from './parseChatInput';

const fail = (key, params) => ({ ok: false, error: { key, params } });

// Turns one submitted chat line into an action. Every path resolves to the submit
// result contract: { ok: true, effect? } | { ok: false, error: { key, params } }.
export default function useChatCommands({ sendMessage, rollExpression, rollVisibility }) {
    return useCallback(async (text) => {
        const parsed = parseChatInput(text);

        if (parsed.kind === 'message') {
            return sendMessage(parsed.text);
        }
        if (parsed.kind === 'unknownCommand') {
            return fail('chat.commands.errors.unknown', { name: parsed.name });
        }

        const { command, name, args } = parsed;
        if (command.action === 'help') {
            return { ok: true, effect: 'help' };
        }
        if (!args) {
            return fail('chat.commands.errors.missingExpression', { command: name });
        }
        return rollExpression(args, command.visibility || rollVisibility);
    }, [sendMessage, rollExpression, rollVisibility]);
}
```

`src/api/diceRolls.js`:

```js
import { getApiUrl, getApiHeaders } from './axios';

const ROLL_FAILED = { ok: false, error: { key: 'chat.commands.errors.rollFailed' } };

// Rolls a chat dice expression. Resolves to the chat submit contract instead of throwing,
// so ChatInput can keep the typed text and show the reason under the field.
export async function postRollExpression({ gameId, token, expression, visibility }) {
    try {
        const response = await fetch(`${getApiUrl()}/games/${gameId}/rollExpression`, {
            method: 'POST',
            headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
            body: JSON.stringify({ expression, visibility }),
        });
        if (response.ok) return { ok: true };

        const body = await response.json().catch(() => ({}));
        if (body.error !== 'invalid_expression') return ROLL_FAILED;

        const params = { ...(body.params || {}) };
        // The backend counts from 0; people count characters from 1.
        if (body.position >= 0) params.position = body.position + 1;
        return { ok: false, error: { key: `chat.commands.diceErrors.${body.code}`, params } };
    } catch {
        return ROLL_FAILED;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='chat/commands|api/diceRolls'`
Expected: PASS, 5 suites.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/chat warhammer-battle-helper-front/src/api/diceRolls.js warhammer-battle-helper-front/src/api/diceRolls.test.js
git commit -m "feat: PLAYRPG-231 chat command registry, parser, history and roll API"
```

---

### Task 7: ChatInput — submit contract, error, hints, help, history + RightPanel wiring + i18n

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/log/ChatInput.jsx` (full rewrite below)
- Modify: `warhammer-battle-helper-front/src/components/log/ChatInput.css` (append)
- Modify: `warhammer-battle-helper-front/src/components/log/ChatInput.test.jsx` (full rewrite below)
- Create: `warhammer-battle-helper-front/src/components/log/CommandHints.jsx`
- Create: `warhammer-battle-helper-front/src/components/log/CommandHelp.jsx`
- Modify: `warhammer-battle-helper-front/src/components/panels/RightPanel.jsx` (`sendMessage` :72-88, new `rollExpression`, `<ChatInput>` :275)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json` (`chat` block, ~:1180)

**Interfaces:**
- Consumes: `COMMANDS`, `EXAMPLES`, `matchCommands`, `useChatHistory`, `useChatCommands`, `postRollExpression`, submit result contract (Task 6).
- Produces: `<ChatInput onSubmit={(text) => Promise<SubmitResult>} />` — replaces the old `onSend` prop.

- [ ] **Step 1: Add the i18n keys**

In `src/locales/en/translation.json`, replace the `"chat"` block (~:1180) with:

```json
  "chat": {
    "placeholder": "Send a message...",
    "send": "Send",
    "charCount": "{{current}}/{{max}}",
    "commands": {
      "hintsLabel": "Chat commands",
      "roll": {
        "usage": "/roll <expression> · /r",
        "description": "Roll dice. Who sees it follows the visibility list."
      },
      "gmroll": {
        "usage": "/gmroll <expression> · /gmr",
        "description": "Secret roll — only the GM sees the result."
      },
      "help": {
        "usage": "/help",
        "description": "Show commands and examples.",
        "title": "Chat commands",
        "examplesTitle": "Examples"
      },
      "examples": {
        "single": "one d10",
        "many": "three d100, summed",
        "modifier": "d100 minus 1",
        "mixed": "different dice plus a bonus",
        "keepHighest": "keep the 3 highest",
        "keepLowest": "keep the lowest",
        "pool": "count dice showing 7 or more",
        "check": "success when the result is 45 or less",
        "secret": "only the GM sees it"
      },
      "errors": {
        "unknown": "Unknown command: /{{name}}. Type /help for the list.",
        "missingExpression": "Add dice after /{{command}}, e.g. /{{command}} 2d6",
        "sendFailed": "Message not sent. Try again.",
        "rollFailed": "Roll failed. Try again."
      },
      "diceErrors": {
        "empty": "The expression is empty.",
        "too_long": "The expression is too long (max {{max}} characters).",
        "unexpected_token": "Unexpected character at position {{position}}.",
        "unexpected_end": "The expression ends too early.",
        "no_dice": "Add at least one die, e.g. d6.",
        "pool_mixed": "A success pool (>=) must be the only dice in the roll.",
        "pool_with_check": "\"vs\" cannot be used with a success pool.",
        "keep_out_of_range": "You can keep between 1 and {{max}} dice.",
        "threshold_out_of_range": "The threshold must be between 1 and {{max}}.",
        "sides_out_of_range": "A die needs {{min}}–{{max}} sides.",
        "count_out_of_range": "Roll 1–{{max}} dice at a time.",
        "too_many_dice": "Too many dice (max {{max}}).",
        "too_many_terms": "Too many parts (max {{max}}).",
        "number_out_of_range": "Number too large (max {{max}})."
      }
    }
  },
```

In `src/locales/pl/translation.json`, replace the `"chat"` block (~:1180) with:

```json
  "chat": {
    "placeholder": "Wyślij wiadomość...",
    "send": "Wyślij",
    "charCount": "{{current}}/{{max}}",
    "commands": {
      "hintsLabel": "Komendy czatu",
      "roll": {
        "usage": "/roll <wyrażenie> · /r",
        "description": "Rzut kośćmi. Kto go widzi, decyduje lista widoczności."
      },
      "gmroll": {
        "usage": "/gmroll <wyrażenie> · /gmr",
        "description": "Rzut tajny — wynik widzi tylko MG."
      },
      "help": {
        "usage": "/help",
        "description": "Pokaż komendy i przykłady.",
        "title": "Komendy czatu",
        "examplesTitle": "Przykłady"
      },
      "examples": {
        "single": "jedna k10",
        "many": "trzy k100, zsumowane",
        "modifier": "k100 minus 1",
        "mixed": "różne kości plus premia",
        "keepHighest": "zostaw 3 najwyższe",
        "keepLowest": "zostaw najniższą",
        "pool": "policz kości z wynikiem 7 lub więcej",
        "check": "sukces, gdy wynik to 45 lub mniej",
        "secret": "widzi tylko MG"
      },
      "errors": {
        "unknown": "Nieznana komenda: /{{name}}. Wpisz /help, aby zobaczyć listę.",
        "missingExpression": "Dodaj kości po /{{command}}, np. /{{command}} 2d6",
        "sendFailed": "Nie wysłano wiadomości. Spróbuj ponownie.",
        "rollFailed": "Rzut się nie udał. Spróbuj ponownie."
      },
      "diceErrors": {
        "empty": "Wyrażenie jest puste.",
        "too_long": "Wyrażenie jest za długie (maks. {{max}} znaków).",
        "unexpected_token": "Nieoczekiwany znak na pozycji {{position}}.",
        "unexpected_end": "Wyrażenie urywa się za wcześnie.",
        "no_dice": "Dodaj co najmniej jedną kość, np. d6.",
        "pool_mixed": "Pula sukcesów (>=) musi być jedynymi kośćmi w rzucie.",
        "pool_with_check": "Nie można użyć „vs” z pulą sukcesów.",
        "keep_out_of_range": "Możesz zostawić od 1 do {{max}} kości.",
        "threshold_out_of_range": "Próg musi wynosić od 1 do {{max}}.",
        "sides_out_of_range": "Kość musi mieć {{min}}–{{max}} ścian.",
        "count_out_of_range": "Rzucaj od 1 do {{max}} kości naraz.",
        "too_many_dice": "Za dużo kości (maks. {{max}}).",
        "too_many_terms": "Za dużo składników (maks. {{max}}).",
        "number_out_of_range": "Za duża liczba (maks. {{max}})."
      }
    }
  },
```

Verify both files still parse and have the same keys:

```bash
cd warhammer-battle-helper-front && node -e "
const en=require('./src/locales/en/translation.json').chat, pl=require('./src/locales/pl/translation.json').chat;
const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?keys(v).map(s=>k+'.'+s):[k]);
const a=keys(en).sort().join(), b=keys(pl).sort().join(); console.log(a===b?'chat keys in sync':'MISMATCH');"
```
Expected: `chat keys in sync`.

- [ ] **Step 2: Write the failing ChatInput tests**

Replace `src/components/log/ChatInput.test.jsx` with:

```jsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ChatInput from './ChatInput';

const field = () => document.querySelector('.chat-input__field');
const counter = () => document.querySelector('.chat-input__counter');
const sendButton = () => document.querySelector('.chat-input__send');
const errorLine = () => document.querySelector('.chat-input__error');
const hintItems = () => document.querySelectorAll('.chat-commands-popup--hints .chat-commands-popup__item');
const helpPanel = () => document.querySelector('.chat-commands-popup--help');

const ok = () => jest.fn().mockResolvedValue({ ok: true });
const type = (value) => fireEvent.change(field(), { target: { value } });
const key = (k, init = {}) => fireEvent.keyDown(field(), { key: k, ...init });

const send = async (value) => {
    type(value);
    key('Enter');
    await waitFor(() => expect(field().value).toBe(''));
};

describe('ChatInput', () => {
    it('submits the trimmed message on Enter and clears the field', async () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('  Atakuję gobliny  ');
        key('Enter');

        expect(onSubmit).toHaveBeenCalledWith('Atakuję gobliny');
        await waitFor(() => expect(field().value).toBe(''));
    });

    it('does not submit on Shift+Enter', () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('pierwsza linia');
        key('Enter', { shiftKey: true });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(field().value).toBe('pierwsza linia');
    });

    it('submits a multiline message as typed', async () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        await send('linia1\nlinia2');

        expect(onSubmit).toHaveBeenCalledWith('linia1\nlinia2');
    });

    it('ignores Enter while an IME composition is active', () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('tekst');
        key('Enter', { isComposing: true });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('caps input at 500 characters', () => {
        render(<ChatInput onSubmit={ok()} />);
        expect(field().maxLength).toBe(500);
    });

    it('shows the counter only near the limit', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('a'.repeat(10));
        expect(counter()).toBeNull();

        type('a'.repeat(460));
        expect(counter().textContent).toBe('460/500');
    });

    it('does not submit an empty or whitespace-only message', () => {
        const onSubmit = ok();
        render(<ChatInput onSubmit={onSubmit} />);

        type('   ');
        key('Enter');

        expect(onSubmit).not.toHaveBeenCalled();
        expect(sendButton().disabled).toBe(true);
    });

    it('ignores a second Enter while the first submit is pending', () => {
        const onSubmit = jest.fn(() => new Promise(() => {}));
        render(<ChatInput onSubmit={onSubmit} />);

        type('/r d6');
        key('Enter');
        key('Enter');

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('keeps the text and shows the error when the submit fails', async () => {
        const onSubmit = jest.fn().mockResolvedValue({
            ok: false,
            error: { key: 'chat.commands.errors.unknown', params: { name: 'xyz' } },
        });
        render(<ChatInput onSubmit={onSubmit} />);

        type('/xyz');
        key('Enter');

        await waitFor(() => expect(errorLine()).not.toBeNull());
        expect(errorLine().textContent).toContain('/xyz');
        expect(field().value).toBe('/xyz');

        type('/xy');
        expect(errorLine()).toBeNull();
    });

    it('suggests commands while a bare /name is typed and completes with Tab', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('/g');
        expect(hintItems()).toHaveLength(1);

        key('Tab');
        expect(field().value).toBe('/gmroll ');
        expect(hintItems()).toHaveLength(0); // a space ends the bare name
    });

    it('completes a command picked with the mouse', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('/');
        fireEvent.mouseDown(hintItems()[0]);

        expect(field().value).toBe('/roll ');
    });

    it('hides the hints on Escape until the text changes', () => {
        render(<ChatInput onSubmit={ok()} />);

        type('/');
        key('Escape');
        expect(hintItems()).toHaveLength(0);

        type('/r');
        expect(hintItems()).toHaveLength(1);
    });

    it('opens the help panel when the submit asks for it and closes it on Escape', async () => {
        const onSubmit = jest.fn().mockResolvedValue({ ok: true, effect: 'help' });
        render(<ChatInput onSubmit={onSubmit} />);

        await send('/help');
        expect(helpPanel()).not.toBeNull();

        key('Escape');
        expect(helpPanel()).toBeNull();
    });

    it('recalls sent lines with ArrowUp / ArrowDown on an empty field', async () => {
        render(<ChatInput onSubmit={ok()} />);
        await send('pierwsza');
        await send('/r 2d6');

        key('ArrowUp');
        expect(field().value).toBe('/r 2d6');
        key('ArrowUp');
        expect(field().value).toBe('pierwsza');
        key('ArrowDown');
        expect(field().value).toBe('/r 2d6');
        key('ArrowDown');
        expect(field().value).toBe('');
    });

    it('leaves ArrowUp alone while the user edits their own text', async () => {
        render(<ChatInput onSubmit={ok()} />);
        await send('stara');

        type('linia1\nlinia2');
        key('ArrowUp');

        expect(field().value).toBe('linia1\nlinia2');
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ChatInput`
Expected: FAIL — `onSubmit` is not called (component still uses `onSend`), hint/help/error selectors return null.

- [ ] **Step 4: Write the components**

`src/components/log/CommandHints.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

const CommandHints = ({ commands, onPick }) => {
    const { t } = useTranslation();

    return (
        <ul className="chat-commands-popup chat-commands-popup--hints" aria-label={t('chat.commands.hintsLabel')}>
            {commands.map(command => (
                <li
                    key={command.name}
                    className="chat-commands-popup__item"
                    // mousedown, not click: on click the textarea would already have lost focus
                    onMouseDown={(e) => { e.preventDefault(); onPick(command); }}
                >
                    <span className="chat-commands-popup__usage">{t(command.usageKey)}</span>
                    <span className="chat-commands-popup__description">{t(command.descriptionKey)}</span>
                </li>
            ))}
        </ul>
    );
};

export default CommandHints;
```

`src/components/log/CommandHelp.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import { COMMANDS, EXAMPLES } from '../../chat/commands/commandRegistry';

const CommandHelp = ({ onClose }) => {
    const { t } = useTranslation();

    return (
        <div className="chat-commands-popup chat-commands-popup--help" role="dialog" aria-label={t('chat.commands.help.title')}>
            <div className="chat-commands-popup__header">
                <span className="chat-commands-popup__title">{t('chat.commands.help.title')}</span>
                <button type="button" className="chat-commands-popup__close" onClick={onClose} aria-label={t('common.close')}>
                    <CloseIcon fontSize="inherit" />
                </button>
            </div>
            <ul className="chat-commands-popup__list">
                {COMMANDS.map(command => (
                    <li key={command.name} className="chat-commands-popup__item">
                        <span className="chat-commands-popup__usage">{t(command.usageKey)}</span>
                        <span className="chat-commands-popup__description">{t(command.descriptionKey)}</span>
                    </li>
                ))}
            </ul>
            <span className="chat-commands-popup__title">{t('chat.commands.help.examplesTitle')}</span>
            <ul className="chat-commands-popup__list">
                {EXAMPLES.map(example => (
                    <li key={example.notation} className="chat-commands-popup__item">
                        <code className="chat-commands-popup__usage">{example.notation}</code>
                        <span className="chat-commands-popup__description">{t(example.key)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CommandHelp;
```

Replace `src/components/log/ChatInput.jsx` with:

```jsx
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchCommands } from '../../chat/commands/commandRegistry';
import useChatHistory from '../../chat/commands/useChatHistory';
import CommandHints from './CommandHints';
import CommandHelp from './CommandHelp';
import './ChatInput.css';

const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 450;
const MAX_INPUT_HEIGHT = 120; // ~6 lines, then the textarea scrolls
// A bare "/name" with no space yet is still being typed — the only time hints help.
const BARE_COMMAND_RE = /^\/(\S*)$/;

const ChatInput = ({ onSubmit }) => {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [error, setError] = useState(null);
    const [hintsDismissed, setHintsDismissed] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const textareaRef = useRef(null);
    const sendingRef = useRef(false);
    const history = useChatHistory();

    // Runs after every value change (typing, send, history recall, completion), so the
    // height always measures the text actually rendered.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        // The reset is mandatory: scrollHeight never drops below the element's current height,
        // so without it the field grows but never shrinks back after the text is cleared.
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    }, [message]);

    const bareCommand = BARE_COMMAND_RE.exec(message);
    const hints = bareCommand && !hintsDismissed ? matchCommands(bareCommand[1]) : [];

    const handleChange = (e) => {
        setMessage(e.target.value);
        setError(null);
        setHintsDismissed(false);
        history.reset();
    };

    const completeCommand = useCallback((command) => {
        setMessage(`/${command.name} `);
        textareaRef.current?.focus();
    }, []);

    const handleSend = async () => {
        const trimmed = message.trim();
        if (!trimmed || sendingRef.current) return;
        sendingRef.current = true;
        try {
            const result = await onSubmit(trimmed);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            history.push(trimmed);
            setMessage('');
            setError(null);
            setIsHelpOpen(result.effect === 'help');
        } finally {
            sendingRef.current = false;
        }
    };

    const handleKeyDown = (e) => {
        // isComposing: an Enter that confirms an IME candidate must not send the message.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
            return;
        }
        if (e.key === 'Tab' && hints.length > 0) {
            e.preventDefault();
            completeCommand(hints[0]);
            return;
        }
        if (e.key === 'Escape') {
            if (isHelpOpen) {
                e.preventDefault();
                setIsHelpOpen(false);
            } else if (hints.length > 0) {
                e.preventDefault();
                setHintsDismissed(true);
            }
            return;
        }
        // History only takes over the arrows on an empty field or an unedited recalled line —
        // anywhere else they must keep moving the caret between lines of a multiline message.
        if (e.key === 'ArrowUp' && (message === '' || history.isShowing(message))) {
            const entry = history.prev();
            if (entry !== null) {
                e.preventDefault();
                setMessage(entry);
            }
            return;
        }
        if (e.key === 'ArrowDown' && history.isShowing(message)) {
            e.preventDefault();
            setMessage(history.next());
        }
    };

    const showCounter = message.length >= COUNTER_THRESHOLD;
    const isFull = message.length >= MAX_MESSAGE_LENGTH;

    return (
        <div className="chat-input">
            {isHelpOpen && <CommandHelp onClose={() => setIsHelpOpen(false)} />}
            {!isHelpOpen && hints.length > 0 && <CommandHints commands={hints} onPick={completeCommand} />}
            <div className="chat-input__field-wrap">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    className="chat-input__field"
                    value={message}
                    maxLength={MAX_MESSAGE_LENGTH}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.placeholder')}
                />
                {showCounter && (
                    <span className={`chat-input__counter${isFull ? ' chat-input__counter--full' : ''}`}>
                        {t('chat.charCount', { current: message.length, max: MAX_MESSAGE_LENGTH })}
                    </span>
                )}
            </div>
            <button
                className="chat-input__send"
                onClick={handleSend}
                disabled={!message.trim()}
            >
                {t('chat.send')}
            </button>
            {error && (
                <div className="chat-input__error" role="alert">
                    {t(error.key, error.params)}
                </div>
            )}
        </div>
    );
};

export default ChatInput;
```

Append to `src/components/log/ChatInput.css`:

```css
/* Anchor for the error line and the command popups. */
.chat-input {
  position: relative;
}

.chat-input__error {
  position: absolute;
  left: 16px;
  right: 64px;
  bottom: 0;
  font-size: 0.75rem;
  line-height: 16px;
  color: var(--log-red-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ================== CHAT COMMAND POPUPS (hints + /help) ================== */

.chat-commands-popup {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 100%;
  margin: 0 0 4px;
  padding: 6px 0;
  list-style: none;
  background: #fff9f0;
  border: 1px solid var(--log-brown-light);
  border-radius: 4px;
  box-shadow: 0 -2px 8px rgba(58, 47, 31, 0.15);
  color: var(--log-brown-text);
  font-family: var(--log-font-body);
  font-size: 0.85rem;
  z-index: 10;
}

.chat-commands-popup--help {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px 0;
}

.chat-commands-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 4px;
}

.chat-commands-popup__title {
  display: block;
  padding: 4px 12px;
  font-family: var(--log-font-display);
  font-weight: 600;
  color: var(--log-brown-medium);
}

.chat-commands-popup__header .chat-commands-popup__title {
  padding: 0;
}

.chat-commands-popup__close {
  border: none;
  background: transparent;
  color: var(--log-brown-medium);
  cursor: pointer;
  font-size: 1rem;
  display: flex;
}

.chat-commands-popup__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.chat-commands-popup__item {
  display: flex;
  flex-direction: column;
  padding: 4px 12px;
}

.chat-commands-popup--hints .chat-commands-popup__item {
  cursor: pointer;
}

.chat-commands-popup--hints .chat-commands-popup__item:hover {
  background: rgba(201, 151, 91, 0.12);
}

.chat-commands-popup__usage {
  font-family: monospace;
  color: var(--log-brown-dark);
}

.chat-commands-popup__description {
  font-size: 0.75rem;
  color: var(--log-brown-muted);
}
```

- [ ] **Step 5: Wire RightPanel**

In `src/components/panels/RightPanel.jsx`:

1. Add imports:
   ```js
   import useChatCommands from '../../chat/commands/useChatCommands';
   import { postRollExpression } from '../../api/diceRolls';
   ```
2. Replace the whole `sendMessage` callback (:72-88) with:
   ```js
     const sendMessage = useCallback(async (text) => {
       if (!gameId || !token) {
         addLogMessage(text, 'info');
         return { ok: true };
       }
       try {
         const response = await fetch(`${getApiUrl()}/games/${gameId}/message`, {
           method: 'POST',
           headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
           body: JSON.stringify({ message: text, visibility: rollVisibility })
         });
         if (!response.ok) throw new Error('Failed to send message');
         return { ok: true };
       } catch (error) {
         console.error('Error sending message:', error);
         return { ok: false, error: { key: 'chat.commands.errors.sendFailed' } };
       }
     }, [gameId, token, addLogMessage, rollVisibility]);

     const rollExpression = useCallback(async (expression, visibility) => {
       if (!gameId || !token) return { ok: false, error: { key: 'chat.commands.errors.rollFailed' } };
       return postRollExpression({ gameId, token, expression, visibility });
     }, [gameId, token]);

     const submitChat = useChatCommands({ sendMessage, rollExpression, rollVisibility });
   ```
3. Replace `<ChatInput onSend={sendMessage} />` with `<ChatInput onSubmit={submitChat} />`.
4. Check nothing else uses `onSend`:
   ```bash
   grep -rn "onSend" warhammer-battle-helper-front/src
   ```
   Expected: no output.

- [ ] **Step 6: Run the tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='ChatInput|chat/commands|DiceRollControls'`
Expected: PASS. No `act(...)` warnings from `ChatInput.test.jsx`.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/log/ChatInput.jsx warhammer-battle-helper-front/src/components/log/ChatInput.css warhammer-battle-helper-front/src/components/log/ChatInput.test.jsx warhammer-battle-helper-front/src/components/log/CommandHints.jsx warhammer-battle-helper-front/src/components/log/CommandHelp.jsx warhammer-battle-helper-front/src/components/panels/RightPanel.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-231 chat commands in the chat input"
```

---

### Task 8: Log renderer `ExpressionDiceRoll` + shared roll component lookup

**Files:**
- Create: `warhammer-battle-helper-front/src/components/log/ExpressionDiceRoll.jsx` + `ExpressionDiceRoll.test.jsx`
- Create: `warhammer-battle-helper-front/src/components/log/resolveRollComponent.js` + `resolveRollComponent.test.js`
- Modify: `warhammer-battle-helper-front/src/components/LogWindow.jsx:98`
- Modify: `warhammer-battle-helper-front/src/components/ToastStack.jsx:51`
- Modify: `warhammer-battle-helper-front/src/components/LogWindow.css` (append)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (`log` block, ~:523)

**Interfaces:**
- Consumes: payload shape from Task 4; `DiceResultToken`, `TruncatedLabel`.
- Produces: `resolveRollComponent(system, rollType) → Component|null` — used by both `LogWindow` and `ToastStack`. (Deviation from spec: the spec placed the shared map in `LogWindow` only, but `ToastStack` resolves roll components too, so the map lives in one shared function.)

- [ ] **Step 1: Add the i18n keys**

In the top-level `"log"` block (~:523) of `src/locales/en/translation.json`, after `"sum": "Sum",` add:
```json
    "successes": "Successes",
    "target": "Target",
```
In `src/locales/pl/translation.json`, after `"sum": "Suma",` add:
```json
    "successes": "Sukcesy",
    "target": "Próg",
```

- [ ] **Step 2: Write the failing tests**

`src/components/log/resolveRollComponent.test.js`:

```js
import { resolveRollComponent } from './resolveRollComponent';
import ExpressionDiceRoll from './ExpressionDiceRoll';

describe('resolveRollComponent', () => {
    it('serves the expression roll from the shared map without asking the system', () => {
        const system = { getRollComponent: jest.fn() };
        expect(resolveRollComponent(system, 'expression')).toBe(ExpressionDiceRoll);
        expect(system.getRollComponent).not.toHaveBeenCalled();
    });

    it('falls back to the system registry for system-specific rolls', () => {
        const SkillRoll = () => null;
        const system = { getRollComponent: jest.fn(() => SkillRoll) };
        expect(resolveRollComponent(system, 'skill')).toBe(SkillRoll);
        expect(system.getRollComponent).toHaveBeenCalledWith('skill');
    });
});
```

`src/components/log/ExpressionDiceRoll.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import ExpressionDiceRoll from './ExpressionDiceRoll';

const base = { rollType: 'expression', username: 'Ania', visibility: 'all' };
const die = (value, extra = {}) => ({ value, kept: true, success: false, ...extra });

const renderRoll = (data) => render(<ExpressionDiceRoll data={{ ...base, ...data }} timestamp="12:00" />).container;

describe('ExpressionDiceRoll', () => {
    it('shows the expression, every die, constants with their sign and the sum', () => {
        const c = renderRoll({
            expression: '2d6+1d4-1',
            mode: 'sum',
            total: 8,
            terms: [
                { sign: 1, count: 2, sides: 6, dice: [die(4), die(2)], subtotal: 6 },
                { sign: 1, count: 1, sides: 4, dice: [die(3)], subtotal: 3 },
                { sign: -1, constant: 1, subtotal: 1 },
            ],
        });

        expect(c.querySelector('.log-list-item__description').textContent).toBe('2d6+1d4-1');
        expect([...c.querySelectorAll('.expression-roll__die')].map(n => n.textContent)).toEqual(['4', '2', '3']);
        expect(c.querySelector('.expression-roll__constant').textContent).toBe('1');
        expect([...c.querySelectorAll('.expression-roll__sign')].map(n => n.textContent)).toEqual(['+', '−']);
        expect(c.querySelector('.expression-roll__total').textContent).toBe('8');
        expect(c.querySelector('.expression-roll__check')).toBeNull();
    });

    it('marks dice dropped by keep', () => {
        const c = renderRoll({
            expression: '4d6kh3',
            mode: 'sum',
            total: 14,
            terms: [{ sign: 1, count: 4, sides: 6, keep: { highest: true, count: 3 },
                dice: [die(3), die(6), die(1, { kept: false }), die(5)], subtotal: 14 }],
        });

        const dropped = c.querySelectorAll('.expression-roll__die--dropped');
        expect(dropped).toHaveLength(1);
        expect(dropped[0].textContent).toBe('1');
    });

    it('highlights pool successes and labels the total differently', () => {
        const sum = renderRoll({ expression: '1d6', mode: 'sum', total: 3,
            terms: [{ sign: 1, count: 1, sides: 6, dice: [die(3)], subtotal: 3 }] });
        const sumLabel = sum.querySelector('.expression-roll__total-label').textContent;

        const pool = renderRoll({ expression: '3d10>=7', mode: 'pool', total: 2,
            terms: [{ sign: 1, count: 3, sides: 10, threshold: 7,
                dice: [die(7, { success: true }), die(3), die(9, { success: true })], subtotal: 2 }] });

        expect(pool.querySelectorAll('.expression-roll__die--success')).toHaveLength(2);
        expect(pool.querySelector('.expression-roll__total-label').textContent).not.toBe(sumLabel);
    });

    it('shows the outcome of a vs check', () => {
        const terms = [{ sign: 1, count: 1, sides: 100, dice: [die(55)], subtotal: 55 }, { sign: -1, constant: 10, subtotal: 10 }];

        const pass = renderRoll({ expression: '1d100-10 vs 45', mode: 'sum', total: 45, terms, check: { target: 45, success: true } });
        expect(pass.querySelector('.expression-roll__check--success').textContent).toContain('45');

        const fail = renderRoll({ expression: '1d100-10 vs 44', mode: 'sum', total: 45, terms, check: { target: 44, success: false } });
        expect(fail.querySelector('.expression-roll__check--failure').textContent).toContain('44');
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='ExpressionDiceRoll|resolveRollComponent'`
Expected: FAIL — `Cannot find module './ExpressionDiceRoll'`.

- [ ] **Step 4: Write the implementation**

`src/components/log/ExpressionDiceRoll.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import DiceResultToken from './DiceResultToken';
import TruncatedLabel from './TruncatedLabel';
import '../LogWindow.css';

const dieClass = (die, isPool) => [
    'expression-roll__die',
    !die.kept && 'expression-roll__die--dropped',
    isPool && die.success && 'expression-roll__die--success',
].filter(Boolean).join(' ');

// Renders a chat dice expression the same way in every game system.
const ExpressionDiceRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { expression, mode, terms = [], total, check, username } = data;
    const isPool = mode === 'pool';

    return (
        <div className="log-list-item__content">
            <div className="log-list-item__header">
                <TruncatedLabel text={username || t('log.character')} />
                {timestamp && <span className="log-list-item__timestamp">{timestamp}</span>}
            </div>
            <div className="log-list-item__description">{expression}</div>
            <div className="expression-roll__terms">
                {terms.map((term, i) => (
                    <span key={i} className="expression-roll__term">
                        {i > 0 && <span className="expression-roll__sign">{term.sign < 0 ? '−' : '+'}</span>}
                        {term.dice
                            ? term.dice.map((die, j) => (
                                <span key={j} className={dieClass(die, isPool)}>
                                    <DiceResultToken result={die.value} sides={term.sides} colored={false} />
                                </span>
                            ))
                            : <span className="expression-roll__constant">{term.constant}</span>}
                    </span>
                ))}
            </div>
            <div className="log-list-item__result">
                <span className="expression-roll__total-label">{isPool ? t('log.successes') : t('log.sum')}</span>
                {': '}
                <strong className="expression-roll__total">{total}</strong>
            </div>
            {check && (
                <div className={`expression-roll__check expression-roll__check--${check.success ? 'success' : 'failure'}`}>
                    {check.success ? t('log.success') : t('log.failure')}
                    {' ('}{t('log.target')}: {check.target}{')'}
                </div>
            )}
        </div>
    );
};

export default ExpressionDiceRoll;
```

`src/components/log/resolveRollComponent.js`:

```js
import ExpressionDiceRoll from './ExpressionDiceRoll';

// Roll types every game system renders the same way. Checked before the system's own
// registry, so a system-agnostic roll needs no entry in each systems/*/index.js.
const SHARED_ROLL_COMPONENTS = {
    expression: ExpressionDiceRoll,
};

export function resolveRollComponent(system, rollType) {
    return SHARED_ROLL_COMPONENTS[rollType] || system.getRollComponent(rollType);
}
```

In `src/components/LogWindow.jsx`:
- add `import { resolveRollComponent } from './log/resolveRollComponent';`
- line ~98: `const RollComponent = system.getRollComponent(rollType);` → `const RollComponent = resolveRollComponent(system, rollType);`

In `src/components/ToastStack.jsx`:
- add `import { resolveRollComponent } from './log/resolveRollComponent';`
- line ~51: `const RollComponent = system.getRollComponent(rollType);` → `const RollComponent = resolveRollComponent(system, rollType);`

Append to `src/components/LogWindow.css`:

```css
/* ================== EXPRESSION ROLL (chat /r) ================== */

.expression-roll__terms {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 4px 0;
}

.expression-roll__term {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.expression-roll__sign,
.expression-roll__constant {
  font-weight: 600;
  color: var(--log-brown-medium);
}

.expression-roll__die--dropped {
  opacity: 0.35;
  text-decoration: line-through;
}

.expression-roll__die--success .wax-seal-token {
  box-shadow: 0 0 0 2px #c9975b;
}

.expression-roll__check {
  font-weight: 600;
}

.expression-roll__check--success {
  color: var(--log-success);
}

.expression-roll__check--failure {
  color: var(--log-red-medium);
}
```

- [ ] **Step 5: Run the tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='ExpressionDiceRoll|resolveRollComponent|log/'`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false 2>&1 | tail -15`
Expected: only `App.test.js` fails (known axios ESM baseline). Any other failure is a regression to fix before committing.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/log/ExpressionDiceRoll.jsx warhammer-battle-helper-front/src/components/log/ExpressionDiceRoll.test.jsx warhammer-battle-helper-front/src/components/log/resolveRollComponent.js warhammer-battle-helper-front/src/components/log/resolveRollComponent.test.js warhammer-battle-helper-front/src/components/LogWindow.jsx warhammer-battle-helper-front/src/components/ToastStack.jsx warhammer-battle-helper-front/src/components/LogWindow.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-231 render chat dice expressions in the log and toasts"
```

---

### Task 9: Browser verification

No code. Report what was seen; a step that could not be run is reported as not run.

- [ ] **Step 1: Start the stack** — use the `run` skill (or `docker compose up`). If the frontend container cannot resolve a module, it is the anonymous deps volume (memory note "Docker frontend deps volume") — no new npm dep is added here, so this should not happen.

- [ ] **Step 2: Two sessions** — GM in one browser, player in a private window, both in the same game.

- [ ] **Step 3: Check as the player**
  - `/` → hint list with `/roll`, `/gmroll`, `/help`; `/g` + Tab → `/gmroll `.
  - `/r 2d6 + 1d4 - 1` → log entry: expression, three dice, `−` and constant 1, sum. GM sees it too, and a toast appears.
  - `/r 4d6kh3` → one die dimmed and struck through.
  - `/r 6d10>=7` → successes ringed, label "Sukcesy".
  - `/r d100-10 vs 45` → "Sukces"/"Porażka (Próg: 45)".
  - `/gmr d20` → player does **not** see the entry; GM sees it with the lock icon.
  - `/r 3d6kh4` → red line under the field, text stays; typing clears the line.
  - `/xyz` → "Nieznana komenda"; `/help` → panel, Esc closes it.
  - ↑ on an empty field recalls the previous line; ↑ inside a two-line message moves the caret.
  - Old dice buttons still roll and render as before.
- [ ] **Step 4: Check the popup layout at the narrowest right-panel width** — hints and help must not overflow the panel horizontally.

- [ ] **Step 5: Report** — list each bullet as seen / not as expected / not run.
