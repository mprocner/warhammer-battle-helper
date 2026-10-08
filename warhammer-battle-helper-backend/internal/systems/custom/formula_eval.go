package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
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
