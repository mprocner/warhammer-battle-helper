// Mirror of the backend's parseDamageExpr (internal/systems/custom/damage_expr.go): the grammar of
// a player-filled ▢ in a damage formula. Only validity lives here — the roll is computed in Go —
// and damage_expr_cases.json pins both sides, so a grammar or cap change must touch both.
//
//   expr := [sign] term (sign term)*
//   term := [count] ('k' | 'd') faces | number

const MAX_DICE = 100;
const MAX_FACES = 1000;
const MAX_CONST = 9999;
// Input length (after whitespace stripping) and term count bound the breakdown string that lands in
// the game's embedded events.
const MAX_LEN = 32;
const MAX_TERMS = 10;
const TERM = /^(?:(\d*)[dk](\d+)|(\d+))$/;

function validTerm(term) {
  const m = TERM.exec(term);
  if (!m) return false;
  if (m[3] !== undefined) return Number(m[3]) <= MAX_CONST;
  const faces = Number(m[2]);
  if (faces < 1 || faces > MAX_FACES) return false;
  if (m[1] === '') return true;
  const count = Number(m[1]);
  return count >= 1 && count <= MAX_DICE;
}

export function isValidDamageExpr(input) {
  const s = String(input ?? '').replace(/\s+/g, '').toLowerCase();
  const body = /^[+-]/.test(s) ? s.slice(1) : s;
  if (body === '' || s.length > MAX_LEN) return false;
  const terms = body.split(/[+-]/);
  return terms.length <= MAX_TERMS && terms.every(validTerm);
}
