import {
  CUSTOM_PREFIX, buildSystemOptions, normalizeForSearch, findMatch, filterSystemOptions, filterByLanguages,
} from './systemOptions';

const systems = [
  { value: 'warhammer4e', label: 'Warhammer Fantasy Roleplay 4e' },
  { value: 'coc7e', label: 'Call of Cthulhu 7e' },
];

const templates = [
  { id: 'p2', name: 'zombie Apocalypse', isPublic: true },
  { id: 'm-old', name: 'Old Mine', myRole: 'owner', updatedAt: '2026-09-01T10:00:00Z' },
  { id: 's1', name: 'Wiedźmin', myRole: 'viewer', ownerEmails: ['alice@example.com'] },
  { id: 'p1', name: 'Arkham Nights', isPublic: true },
  { id: 'm-new', name: 'New Mine', myRole: 'owner', updatedAt: '2026-10-04T10:00:00.5Z' },
  { id: 's2', name: 'Bastion', isPublic: true, myRole: 'editor', ownerEmails: ['bob@example.com', 'carol@example.com'] },
  { id: 's3', name: 'Cień', myRole: 'viewer' },
];

describe('buildSystemOptions', () => {
  const options = buildSystemOptions(systems, templates);
  const labelsOf = (group) => options.filter(o => o.group === group).map(o => o.label);

  it('keeps the groups contiguous and in order', () => {
    const groups = options.map(o => o.group).filter((g, i, all) => all[i - 1] !== g);
    expect(groups).toEqual(['systems', 'mine', 'shared', 'public']);
  });

  it('keeps systems in registry order and values bare', () => {
    expect(options.slice(0, 2).map(o => o.value)).toEqual(['warhammer4e', 'coc7e']);
  });

  it('puts the most recently edited own template first', () => {
    expect(labelsOf('mine')).toEqual(['New Mine', 'Old Mine']);
  });

  it('sorts shared and public alphabetically, ignoring case', () => {
    expect(labelsOf('shared')).toEqual(['Bastion', 'Cień', 'Wiedźmin']);
    expect(labelsOf('public')).toEqual(['Arkham Nights', 'zombie Apocalypse']);
  });

  it('files a public template shared with the viewer under shared', () => {
    expect(options.find(o => o.label === 'Bastion').group).toBe('shared');
  });

  it('groups by myRole even when the owner emails are missing', () => {
    const cien = options.find(o => o.label === 'Cień');
    expect(cien.group).toBe('shared');
    expect(cien.ownerEmail).toBeUndefined();
  });

  it('prefixes template values', () => {
    expect(options.find(o => o.label === 'Wiedźmin').value).toBe(`${CUSTOM_PREFIX}s1`);
  });
});

describe('normalizeForSearch', () => {
  it('folds case and Polish diacritics, including ł', () => {
    expect(normalizeForSearch('Łowca ŻÓŁW źdźbło')).toBe('lowca zolw zdzblo');
  });
});

describe('findMatch', () => {
  it('returns code-point bounds of the first match in the original text', () => {
    expect(findMatch('Wielki Łowca', 'lowca')).toEqual([7, 12]);
  });

  it('returns null for no match or an empty query', () => {
    expect(findMatch('Bastion', 'xyz')).toBeNull();
    expect(findMatch('Bastion', '   ')).toBeNull();
  });
});

describe('filterSystemOptions', () => {
  const options = buildSystemOptions(systems, templates);

  it('returns everything for an empty query', () => {
    expect(filterSystemOptions(options, '')).toBe(options);
  });

  it('matches a substring of the label, diacritic-insensitive', () => {
    expect(filterSystemOptions(options, 'WIEDZ').map(o => o.label)).toEqual(['Wiedźmin']);
  });

  it('matches the owner email only for shared templates', () => {
    expect(filterSystemOptions(options, 'alice@').map(o => o.label)).toEqual(['Wiedźmin']);
  });
});

describe('filterByLanguages', () => {
  const opts = buildSystemOptions(systems, [
    { id: 'a', name: 'A', myRole: 'owner', language: 'pl', description: '<p>x</p>' },
    { id: 'b', name: 'B', myRole: 'owner', language: 'en' },
    { id: 'c', name: 'C', myRole: 'owner' },
  ]);
  const labels = (list) => list.map(o => o.label);

  it('carries language and description onto template options', () => {
    const a = opts.find(o => o.label === 'A');
    expect(a.language).toBe('pl');
    expect(a.description).toBe('<p>x</p>');
    expect(opts.find(o => o.label === 'C').language).toBe('');
  });

  it('passes everything through with no language chosen', () => {
    expect(filterByLanguages(opts, [])).toBe(opts);
  });

  it('keeps built-in systems and templates in a chosen language, drops unspecified', () => {
    expect(labels(filterByLanguages(opts, ['pl']))).toEqual([
      'Warhammer Fantasy Roleplay 4e', 'Call of Cthulhu 7e', 'A',
    ]);
  });

  it('matches any of several chosen languages', () => {
    expect(labels(filterByLanguages(opts, ['pl', 'en'])).slice(2)).toEqual(['A', 'B']);
  });
});
