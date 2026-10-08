package custom

import (
	"battle-helper/internal/models"
	"encoding/json"
	"errors"
	"os"
	"testing"
)

// This test needs the whole repo checked out: the backend dev container mounts only the
// backend, so run it on the host.
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
			if c.Expect.Value == nil && !c.Expect.Valid && c.Expect.Error == "" {
				t.Fatalf("case has no expectation")
			}
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
