import { rowGridTemplate, rowLabel, cellLabel, gridColumns, detailColumns, sortColumnKey, sortByText } from './rowTableLayout';

// A GM's own column set.
const cols = (...types) => types.map((type, i) => ({ key: `c${i}`, label: `K${i}`, type }));

describe('rowGridTemplate', () => {
  it('gives the first text column the remainder and the rest their type\'s width', () => {
    expect(rowGridTemplate(cols('text', 'select', 'number')))
      .toBe('minmax(0, 2fr) minmax(0, 140px) 56px 52px');
  });

  // Only the FIRST text column is the name — rowLabel picks the first non-empty text column as the
  // row's name, and the width rule has to agree with it rather than invent its own.
  it('treats only the first text column as the name', () => {
    expect(rowGridTemplate(cols('text', 'text', 'text')))
      .toBe('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 52px');
  });

  it('finds the name column wherever the GM put it', () => {
    expect(rowGridTemplate(cols('number', 'select', 'text')))
      .toBe('56px minmax(0, 140px) minmax(0, 2fr) 52px');
  });

  // No text column: every track is capped and rigid, the row packs to the left. A table of only
  // narrow columns is a narrow table, not an attempt to fill the container.
  it('packs to the left when no column is text', () => {
    expect(rowGridTemplate(cols('select', 'number'))).toBe('minmax(0, 140px) 56px 52px');
  });

  it('produces a fully rigid template with only number columns', () => {
    expect(rowGridTemplate(cols('number', 'number'))).toBe('56px 56px 52px');
  });

  it('places leading slots before the columns and trailing slots before the actions', () => {
    expect(rowGridTemplate(cols('text'), { leading: ['22px'], trailing: ['minmax(0, 1fr)', '28px'] }))
      .toBe('22px minmax(0, 2fr) minmax(0, 1fr) 28px 52px');
  });

  it('survives a field with no columns at all', () => {
    expect(rowGridTemplate(undefined, { leading: ['22px'] })).toBe('22px 52px');
  });

  // long_text never gets a grid track — it renders in the row's details panel — but its presence
  // reserves the expander track at the very start, for every row, so columns never shift.
  it('keeps long_text out of the grid and reserves the expander first', () => {
    expect(rowGridTemplate(cols('text', 'long_text', 'number')))
      .toBe('22px minmax(0, 2fr) 56px 52px');
  });
});

describe('gridColumns / detailColumns', () => {
  it('split the columns by long_text, keeping order', () => {
    const c = cols('long_text', 'text', 'long_text');
    expect(gridColumns(c).map(x => x.key)).toEqual(['c1']);
    expect(detailColumns(c).map(x => x.key)).toEqual(['c0', 'c2']);
  });
});

describe('rowLabel', () => {
  const c = [
    { key: 'qty', type: 'number' },
    { key: 'desc', type: 'long_text' },
    { key: 'name', type: 'text' },
  ];

  it('prefers the first non-empty text column', () => {
    expect(rowLabel(c, { cells: { qty: '3', name: ' Lina ' } }, 'Row')).toBe('Lina');
  });

  // A description is a paragraph — it must never become the name in a catalog dropdown.
  it('falls back to any non-long_text cell, never to a description', () => {
    expect(rowLabel(c, { cells: { qty: '3', desc: 'Long story' } }, 'Row')).toBe('3');
  });

  it('uses the fallback when nothing else is filled', () => {
    expect(rowLabel(c, { cells: { desc: 'Long story' } }, 'Row')).toBe('Row');
  });
});

describe('cellLabel', () => {
  it('passes non-select values through', () => {
    expect(cellLabel({ type: 'text' }, 'abc')).toBe('abc');
  });

  it('resolves a select value to its option label', () => {
    expect(cellLabel({ type: 'select', options: ['A', 'B'] }, 'B')).toBe('B');
  });

  // Skill keys are surrogate ids — an unresolvable one must never reach the screen.
  it('returns empty for a skill key that no longer resolves', () => {
    const skills = [{ key: 'sk.1', label: 'Melee' }];
    expect(cellLabel({ type: 'select', optionsFromSkills: true }, 'sk.1', skills)).toBe('Melee');
    expect(cellLabel({ type: 'select', optionsFromSkills: true }, 'sk.gone', skills)).toBe('');
  });
});

describe('sortColumnKey', () => {
  const columns = [
    { key: 'qty',  type: 'number' },
    { key: 'name', type: 'text' },
    { key: 'kind', type: 'text' },
    { key: 'desc', type: 'long_text' },
  ];

  it('is null while sorting is off', () => {
    expect(sortColumnKey({ columns, sortColumn: 'kind' })).toBeNull();
  });

  it('uses the GM-picked text column', () => {
    expect(sortColumnKey({ columns, sortAlphabetically: true, sortColumn: 'kind' })).toBe('kind');
  });

  // A pick that is gone or no longer short text must not sort by a number or a paragraph — it
  // falls back to the name column, the same one rowLabel names the row by.
  it('falls back to the name column when the pick is missing or not short text', () => {
    expect(sortColumnKey({ columns, sortAlphabetically: true })).toBe('name');
    expect(sortColumnKey({ columns, sortAlphabetically: true, sortColumn: 'qty' })).toBe('name');
    expect(sortColumnKey({ columns, sortAlphabetically: true, sortColumn: 'gone' })).toBe('name');
  });

  it('is null when the table has no short text column at all', () => {
    expect(sortColumnKey({ columns: [{ key: 'qty', type: 'number' }], sortAlphabetically: true })).toBeNull();
  });
});

describe('sortByText', () => {
  const it3 = (...v) => v.map((text, i) => ({ id: i, text }));
  const ids = list => list.map(x => x.id);

  it('orders case-insensitively, digits numerically', () => {
    expect(ids(sortByText(it3('beta', 'Alfa', 'item 10', 'item 9'), x => x.text))).toEqual([1, 0, 3, 2]);
  });

  // An unnamed row has nothing to be ordered by; it goes last instead of first.
  it('puts empty values last and keeps equal ones in their original order', () => {
    expect(ids(sortByText(it3('', 'b', ' ', 'a', 'b'), x => x.text))).toEqual([3, 1, 4, 0, 2]);
  });
});
