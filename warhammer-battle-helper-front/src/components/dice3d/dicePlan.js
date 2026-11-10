// Pure mapping from a roll payload's `dice` list (built by the backend, see
// internal/systems/dice.go) to what the 3D dice library can replay. No library or DOM here,
// so every decision about WHAT gets animated is testable in jsdom.

// Above this the library's synchronous pre-simulation freezes the page (PLAYRPG-342 spike:
// 10 dice ≈ 83 ms, 50 ≈ 422 ms on a desktop). Bigger rolls show only in the toast and log.
export const MAX_ANIMATED_DICE = 10;

// Faces the library has meshes for. A d100 arrives as a tens die (sides 100) plus a units d10.
const SUPPORTED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

// Groups replay one after another, main roll first; the backend tags damage dice "damage".
const groupOrder = (group) => (group ? 1 : 0);

/**
 * Splits a roll's dice into replayable throws. A throw that the library cannot show
 * (an unsupported die such as d7, or more than MAX_ANIMATED_DICE dice) is left out
 * rather than shown wrong — the log still has the result.
 * @returns {{ group: string, notation: string, count: number }[]}
 */
export function planThrows(dice) {
  if (!Array.isArray(dice) || dice.length === 0) return [];
  const groups = new Map();
  dice.forEach(d => {
    const key = d.group || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b))
    .filter(([, list]) => list.length <= MAX_ANIMATED_DICE && list.every(d => SUPPORTED_SIDES.has(d.sides)))
    .map(([group, list]) => ({ group, notation: toNotation(list), count: list.length }));
}

/**
 * Builds the library's forced-result notation, e.g. "2d6+1d100+1d10@3,5,40,7". The library
 * expects the values in the order of its groups, so dice of one size are gathered together.
 * Values pass through unchanged: the library itself reads 0 on a d100 as "00" and 0 or 10
 * on a d10 as "0".
 */
export function toNotation(dice) {
  const bySides = new Map();
  dice.forEach(d => {
    if (!bySides.has(d.sides)) bySides.set(d.sides, []);
    bySides.get(d.sides).push(d.value);
  });
  const terms = [...bySides.entries()].map(([sides, values]) => `${values.length}d${sides}`);
  const values = [...bySides.values()].flat();
  return `${terms.join('+')}@${values.join(',')}`;
}

const HEX = /^#([0-9a-f]{6})$/i;

// WCAG relative luminance of a #rrggbb colour.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

// The player picks any colour, so the numbers on the dice switch between dark and light.
// Flat colours reach equal black/white contrast at luminance 0.18, but the lit 3D material
// renders the die darker than its swatch, so the switch sits higher: the palette's red
// (0.18) keeps light numbers, as it did in the spike.
const DARK_LABEL_ABOVE = 0.25;

export function labelColorFor(hex) {
  if (!HEX.test(hex || '')) return '#ffffff';
  return luminance(hex) > DARK_LABEL_ABOVE ? '#1a1a1a' : '#ffffff';
}
