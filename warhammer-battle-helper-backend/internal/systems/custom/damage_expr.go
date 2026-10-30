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
// damage_expr_cases.json pins both sides. The length and term caps bound the breakdown string
// that lands in the game's embedded events.
const (
	maxDamageExprLen   = 32
	maxDamageExprTerms = 10
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
// A leading minus on dice becomes "0 -" (on a lone constant it negates the number) because the formula grammar has no unary minus. Block ids are
// idPrefix + "." + n, so expanded blocks never collide with the GM's own ids.
func parseDamageExpr(s, idPrefix string) ([]models.FormulaBlock, error) {
	s = strings.ToLower(strings.Join(strings.Fields(s), ""))
	if s == "" || len(s) > maxDamageExprLen {
		return nil, ErrInvalidDamageExpr
	}
	n := 0
	id := func() string { n++; return fmt.Sprintf("%s.%d", idPrefix, n) }

	sign := ""
	if s[0] == '+' || s[0] == '-' {
		sign, s = s[:1], s[1:]
	}
	var out []models.FormulaBlock
	terms := 0
	for first := true; ; first = false {
		if !first && terms >= maxDamageExprTerms {
			return nil, ErrInvalidDamageExpr
		}
		terms++
		term, rest, more := s, "", false
		if i := strings.IndexAny(s, "+-"); i >= 0 {
			term, rest, more = s[:i], s[i:], true
		}
		blocks, err := damageTerm(term, id)
		if err != nil {
			return nil, err
		}
		switch {
		case first && sign == "-" && len(blocks) == 1 && blocks[0].Type == "const":
			// A lone constant is negated in place so the breakdown reads "(-1)", not "(0-1)".
			neg := -*blocks[0].Num
			blocks[0].Num = &neg
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
