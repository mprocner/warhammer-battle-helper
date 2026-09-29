import { skillDisplayFlags, clearDependentFlags, SKILL_FLAG_META } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

test('a table offers all four display flags', () => {
  expect(skillDisplayFlags('skill_table'))
    .toEqual(['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns']);
});

test('a tree offers them too — its two-column split works by branch', () => {
  expect(skillDisplayFlags('skill_tree'))
    .toEqual(['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns']);
});

test('any other field type gets no display group at all', () => {
  expect(skillDisplayFlags('attr')).toEqual([]);
  expect(skillDisplayFlags('weapons_table')).toEqual([]);
});

describe('clearDependentFlags', () => {
  const field = { type: 'skill_table', hasAdvances: true, assignAttrToSkill: true, baseFromAttr: true };

  it('leaves a patch alone while every requirement still holds', () => {
    expect(clearDependentFlags(field, { sortAlphabetically: true }))
      .toEqual({ sortAlphabetically: true });
  });

  it('switches off a dependent flag when one requirement goes away', () => {
    expect(clearDependentFlags(field, { hasAdvances: false }))
      .toEqual({ hasAdvances: false, baseFromAttr: false });
    expect(clearDependentFlags(field, { assignAttrToSkill: false }))
      .toEqual({ assignAttrToSkill: false, baseFromAttr: false });
  });

  it('clears in the SAME patch, so the panel never shows the flag on without its requirements', () => {
    const patch = clearDependentFlags(field, { hasAdvances: false });
    expect(Object.keys(patch).sort()).toEqual(['baseFromAttr', 'hasAdvances']);
  });

  it('says nothing about a dependent flag that is already off', () => {
    const off = { ...field, baseFromAttr: false };
    expect(clearDependentFlags(off, { hasAdvances: false })).toEqual({ hasAdvances: false });
  });

  it('ignores flags that declare no requirements', () => {
    expect(clearDependentFlags(field, { twoColumns: true })).toEqual({ twoColumns: true });
  });
});

describe('baseFromAttr metadata', () => {
  it('requires both the advances column and attribute assignment', () => {
    expect(SKILL_FLAG_META.baseFromAttr.requires).toEqual(['hasAdvances', 'assignAttrToSkill']);
  });

  it('is not one of the display-group flags — it belongs next to attribute assignment', () => {
    expect(skillDisplayFlags('skill_table')).not.toContain('baseFromAttr');
  });

  it('carries a label and a hint', () => {
    expect(SKILL_FLAG_META.baseFromAttr.labelKey).toBe('creator.skillAttrAsBase');
    expect(SKILL_FLAG_META.baseFromAttr.hintKey).toBe('creator.skillAttrAsBaseHint');
  });
});
