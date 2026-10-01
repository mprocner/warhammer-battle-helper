import { genId } from './surrogateKeys';

// The prefixes the creator and the sheet actually mint with today. `skill_table` is in the list on
// purpose: makeDefaultField passes a field TYPE as the prefix, and those contain underscores, so a
// test that only tried single words would not prove the shape holds for the real inputs.
const PREFIXES = ['skill', 'node', 'tree', 'section', 'preset', 'skill_table', 'weapons_table'];

describe('genId', () => {
  // The one property the rest of the system leans on. A dot is the path separator in a skill key,
  // and isDirectChild (systems/custom/skillLayout.js) decides whether a row belongs to its field by
  // asking that nothing after the field's prefix contains one. A minted key with a dot in it would
  // silently stop belonging to its own field, and every other test in the repo uses hand-written
  // keys, so none of them would notice.
  it('never mints a key containing the path separator', () => {
    for (const prefix of PREFIXES) {
      for (let i = 0; i < 50; i++) {
        expect(genId(prefix)).not.toContain('.');
      }
    }
  });

  it('keeps the prefix intact so a key says what kind of thing it identifies', () => {
    for (const prefix of PREFIXES) {
      expect(genId(prefix)).toMatch(new RegExp(`^${prefix}_\\d+_\\d+$`));
    }
  });

  // Two things created in the same millisecond must still get different keys — the random tail is
  // what does that, and the timestamp alone would not. Mocked rather than raced, so the test states
  // the requirement instead of depending on how fast the machine is.
  it('separates two keys minted in the same millisecond', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const keys = new Set(Array.from({ length: 200 }, () => genId('skill')));
      expect(keys.size).toBe(200);
    } finally {
      now.mockRestore();
    }
  });
});
