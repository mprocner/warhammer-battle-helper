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
