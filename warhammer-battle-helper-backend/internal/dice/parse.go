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
