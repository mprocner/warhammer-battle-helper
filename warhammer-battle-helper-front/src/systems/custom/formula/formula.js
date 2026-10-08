// Mirror of the Go parser in warhammer-battle-helper-backend/internal/systems/custom/formula.go.
// Go is the reference: rolls are evaluated only there. This side parses for the creator's
// validation and evaluates the arithmetic of "computed" fields at render time. Both sides must
// accept the same block lists and fail with the same reason at the same index — formula_cases.json
// pins that, so change one parser and the other side's test goes red.

import { walkFields } from '../../../utils/templateSections';

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

// formulaRefsOf lists the keys a computed formula may name. A key missing from it was removed
// from the template, and the field falls back to its default; a key present but unfilled on the
// character reads as 0.
export function formulaRefsOf(sections) {
  const attrKeys = [];
  const numberKeys = [];
  walkFields(sections, (f) => {
    if (f.type === 'attr') attrKeys.push(f.key);
    if (f.type === 'number') numberKeys.push(f.key);
  });
  return { attrKeys, numberKeys };
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
