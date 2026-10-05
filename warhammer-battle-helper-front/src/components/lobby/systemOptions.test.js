import {
  CUSTOM_PREFIX, buildSystemOptions, normalizeForSearch, findMatch, filterSystemOptions,
} from './systemOptions';

const systems = [
  { value: 'warhammer4e', label: 'Warhammer Fantasy Roleplay 4e' },
  { value: 'coc7e', label: 'Call of Cthulhu 7e' },
];

const templates = [
  { id: 'p2', name: 'zombie Apocalypse', isOwner: false, isPublic: true },
  { id: 'm-old', name: 'Old Mine', isOwner: true, updatedAt: '2026-09-01T10:00:00Z' },
  { id: 's1', name: 'Wiedźmin', isOwner: false, sharedWithMe: true, ownerEmail: 'alice@example.com' },
  { id: 'p1', name: 'Arkham Nights', isOwner: false, isPublic: true },
  { id: 'm-new', name: 'New Mine', isOwner: true, updatedAt: '2026-10-04T10:00:00.5Z' },
  { id: 's2', name: 'Bastion', isOwner: false, isPublic: true, sharedWithMe: true, ownerEmail: 'bob@example.com' },
  { id: 's3', name: 'Cień', isOwner: false, sharedWithMe: true },
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

  it('groups by sharedWithMe even when the owner email is missing', () => {
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
