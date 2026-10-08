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
