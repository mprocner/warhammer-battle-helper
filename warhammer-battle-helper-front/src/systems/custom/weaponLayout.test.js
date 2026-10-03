import { weaponGridTemplate } from './weaponLayout';

// A GM's own column set. Types are the three the creator offers: text, number, select.
const cols = (...types) => types.map((type, i) => ({ key: `c${i}`, label: `K${i}`, type }));

describe('weaponGridTemplate', () => {
  it('gives the first text column the remainder and the rest their type\'s width', () => {
    expect(weaponGridTemplate({ columns: cols('text', 'select', 'number') }, {}))
      .toBe('minmax(0, 2fr) minmax(0, 140px) 56px');
  });

  // Only the FIRST text column is the name — weaponRowLabel picks the first non-empty text column
  // as the weapon's name, and the width rule has to agree with it rather than invent its own.
  it('treats only the first text column as the name', () => {
    expect(weaponGridTemplate({ columns: cols('text', 'text', 'text') }, {}))
      .toBe('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)');
  });

  it('finds the name column wherever the GM put it', () => {
    expect(weaponGridTemplate({ columns: cols('number', 'select', 'text') }, {}))
      .toBe('56px minmax(0, 140px) minmax(0, 2fr)');
  });

  // When there is no text column, every track is capped and rigid. The row packs to the left with
  // empty space on the right. This is deliberate: a table of only narrow columns is a narrow table,
  // not an attempt to fill the container. The template describes what the GM chose, honestly.
  it('packs to the left when no column is text', () => {
    expect(weaponGridTemplate({ columns: cols('select', 'number') }, {}))
      .toBe('minmax(0, 140px) 56px');
  });

  // All number columns produce a fully rigid template. This is the clearest case of the behavior:
  // no flexible tracks at all, so the row is as narrow as the sum of its column widths.
  it('produces a fully rigid template with only number columns', () => {
    expect(weaponGridTemplate({ columns: cols('number', 'number') }, {}))
      .toBe('56px 56px');
  });

  it('reserves the star, the damage column, the die and the actions only when asked', () => {
    expect(weaponGridTemplate({ columns: cols('text') }, { showStar: true, hasDamage: true, showRoll: true, showActions: true }))
      .toBe('22px minmax(0, 2fr) minmax(0, 1fr) 28px 52px');
  });

  // Extra requirement B (task-8 review carryover): this test's title used to claim the die sits
  // "after the damage column", but the fixture below never sets hasDamage, so it actually exercises
  // name column → die → actions, with no damage track in play at all. Renamed rather than adding
  // hasDamage: true, because the damage-column-then-die-then-actions ordering is already covered by
  // 'reserves the star, the damage column, the die and the actions only when asked' above — adding
  // it here would just duplicate that assertion instead of adding new coverage.
  it('puts the die before the actions when there is no damage column', () => {
    expect(weaponGridTemplate({ columns: cols('text') }, { showRoll: true, showActions: true }))
      .toBe('minmax(0, 2fr) 28px 52px');
  });

  it('survives a field with no columns at all', () => {
    expect(weaponGridTemplate({}, { showStar: true, showActions: true })).toBe('22px 52px');
  });
});
