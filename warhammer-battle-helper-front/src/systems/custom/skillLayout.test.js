import {
  skillGridTemplate,
  buildSkillRows,
  splitHalf,
  subtreeSize,
  splitBranchesWeighted,
  siblingItems,
  sortItems,
  resolveSkillValues,
} from './skillLayout';

describe('skillGridTemplate', () => {
  it('lays out the bare minimum: name plus one value', () => {
    expect(skillGridTemplate({})).toBe('1fr 72px');
  });

  it('puts the development column first and the actions column last', () => {
    expect(skillGridTemplate({
      showDevelopment: true, hasAdvances: true, showStar: true, showRoll: true, showActions: true,
    })).toBe('20px 1fr 56px 56px 48px 24px 28px 52px');
  });

  it('spends three columns on base/advances/total instead of one', () => {
    expect(skillGridTemplate({ hasAdvances: true })).toBe('1fr 56px 56px 48px');
  });
});

const field = (over = {}) => ({
  key: 'fld_skills',
  type: 'skill_table',
  skills: [
    { id: 'opt_stealth', label: 'Skradanie', attr: 'attr_ag' },
    { id: 'opt_lore', label: 'Wiedza' },
  ],
  ...over,
});

describe('buildSkillRows', () => {
  it('keys template rows by field and option id, never by label', () => {
    expect(buildSkillRows(field(), {}, new Set()).map(r => r.key))
      .toEqual(['fld_skills.opt_stealth', 'fld_skills.opt_lore']);
  });

  it('appends the player\'s own skills after the template ones', () => {
    const rows = buildSkillRows(field(), {
      'fld_skills.skill_1': { label: 'Tresura psów', linkedAttr: 'attr_fel' },
    }, new Set());
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza', 'Tresura psów']);
    expect(rows[2]).toMatchObject({ custom: true, attr: 'attr_fel', isNew: false });
  });

  it('ignores custom nodes belonging to another field', () => {
    const rows = buildSkillRows(field(), { 'fld_other.skill_1': { label: 'Obce' } }, new Set());
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza']);
  });

  it('sorts by label when the flag is on', () => {
    const rows = buildSkillRows(field({ sortAlphabetically: true }), {
      'fld_skills.skill_1': { label: 'Tresura psów' },
    }, new Set());
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Tresura psów', 'Wiedza']);
  });

  it('keeps a freshly added, still-unnamed row at the bottom even when sorting', () => {
    const rows = buildSkillRows(field({ sortAlphabetically: true }), {
      'fld_skills.skill_1': { label: '' },
    }, new Set(['fld_skills.skill_1']));
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza', '']);
    expect(rows[2].isNew).toBe(true);
  });

  it('orders a row being renamed by the label it had when the rename started', () => {
    const rows = buildSkillRows(
      field({ sortAlphabetically: true }),
      { 'fld_skills.skill_1': { label: 'Bijatyka' } },
      new Set(),
      { 'fld_skills.skill_1': 'Tresura psów' },
    );
    // Sorted as if it were still "Tresura psów", so the row does not move while being typed into.
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Bijatyka', 'Wiedza']);
  });

  it('still shows the live label on a row it is ordering by the frozen one', () => {
    const rows = buildSkillRows(
      field({ sortAlphabetically: true }),
      { 'fld_skills.skill_1': { label: 'Bijatyka' } },
      new Set(),
      { 'fld_skills.skill_1': 'Tresura psów' },
    );
    expect(rows.find(r => r.key === 'fld_skills.skill_1').label).toBe('Bijatyka');
  });

  it('drops back to the live label once the rename is no longer frozen', () => {
    const rows = buildSkillRows(
      field({ sortAlphabetically: true }),
      { 'fld_skills.skill_1': { label: 'Bijatyka' } },
      new Set(),
      {},
    );
    expect(rows.map(r => r.label)).toEqual(['Bijatyka', 'Skradanie', 'Wiedza']);
  });

  it('ignores a frozen label for a row that is not in this field', () => {
    const rows = buildSkillRows(
      field({ sortAlphabetically: true }),
      {},
      new Set(),
      { 'fld_other.skill_9': 'Cokolwiek' },
    );
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza']);
  });
});

describe('splitHalf', () => {
  it('gives the odd row to the left column', () => {
    expect(splitHalf([1, 2, 3])).toEqual([[1, 2], [3]]);
  });

  it('handles an empty list', () => {
    expect(splitHalf([])).toEqual([[], []]);
  });
});

const tree = {
  key: 'root',
  children: [
    { key: 'walka', label: 'Walka', children: [
      { key: 'biale', label: 'Białe', children: [{ key: 'miecz', label: 'Miecz' }] },
    ] },
    { key: 'wiedza', label: 'Wiedza' },
  ],
};

describe('subtreeSize', () => {
  it('counts the branch itself and every template descendant', () => {
    expect(subtreeSize(tree.children[0], 'fld_tree.walka', {})).toBe(3);
    expect(subtreeSize(tree.children[1], 'fld_tree.wiedza', {})).toBe(1);
  });

  it('counts the player\'s nodes at any depth exactly once', () => {
    const custom = {
      'fld_tree.walka.skill_1': { label: 'Bijatyka' },
      'fld_tree.walka.biale.skill_2': { label: 'Rapier' },
      'fld_tree.wiedza.skill_3': { label: 'Heraldyka' },
    };
    expect(subtreeSize(tree.children[0], 'fld_tree.walka', custom)).toBe(5);
    expect(subtreeSize(tree.children[1], 'fld_tree.wiedza', custom)).toBe(2);
  });
});

describe('splitBranchesWeighted', () => {
  const w = (b) => b.weight;

  it('cuts where the two halves come closest in weight', () => {
    const branches = [{ weight: 8 }, { weight: 1 }, { weight: 5 }, { weight: 4 }];
    expect(splitBranchesWeighted(branches, w))
      .toEqual([[{ weight: 8 }, { weight: 1 }], [{ weight: 5 }, { weight: 4 }]]);
  });

  it('leaves one heavy branch alone in its column', () => {
    const branches = [{ weight: 20 }, { weight: 1 }, { weight: 1 }];
    expect(splitBranchesWeighted(branches, w))
      .toEqual([[{ weight: 20 }], [{ weight: 1 }, { weight: 1 }]]);
  });

  it('never reorders branches', () => {
    const branches = [{ weight: 1 }, { weight: 9 }];
    const [left, right] = splitBranchesWeighted(branches, w);
    expect([...left, ...right]).toEqual(branches);
  });

  it('puts a single branch on the left', () => {
    expect(splitBranchesWeighted([{ weight: 3 }], w)).toEqual([[{ weight: 3 }], []]);
  });

  it('handles an empty list', () => {
    expect(splitBranchesWeighted([], w)).toEqual([[], []]);
  });
});

describe('siblingItems', () => {
  const custom = {
    'fld_tree.walka.skill_1': { label: 'Rapier' },
    'fld_tree.walka.biale.skill_2': { label: 'Za głęboko' },
    'fld_tree.inne.skill_3': { label: 'Obce' },
  };

  it('puts template children and the player\'s own direct children in one list', () => {
    const items = siblingItems('fld_tree.walka', tree.children[0].children, custom);
    expect(items.map(i => i.label)).toEqual(['Białe', 'Rapier']);
    expect(items[0].node.key).toBe('biale');
    expect(items[1].customKey).toBe('fld_tree.walka.skill_1');
  });

  it('takes direct children only — a deeper node belongs to its own level', () => {
    const items = siblingItems('fld_tree.walka', [], custom);
    expect(items.map(i => i.customKey)).toEqual(['fld_tree.walka.skill_1']);
  });

  it('never picks up another branch\'s nodes', () => {
    expect(siblingItems('fld_tree.wiedza', [], custom)).toEqual([]);
  });
});

describe('sortItems', () => {
  it('returns the very same array when sorting is off', () => {
    const items = [{ label: 'B' }, { label: 'A' }];
    expect(sortItems(items, false)).toBe(items);
  });

  it('sorts by label without mutating the input', () => {
    const items = [{ label: 'B' }, { label: 'A' }];
    expect(sortItems(items, true).map(i => i.label)).toEqual(['A', 'B']);
    expect(items.map(i => i.label)).toEqual(['B', 'A']);
  });

  it('treats a missing label as empty, so an unnamed node sorts first instead of throwing', () => {
    expect(sortItems([{ label: 'A' }, {}], true).map(i => i.label)).toEqual([undefined, 'A']);
  });
});

describe('resolveSkillValues', () => {
  const derivedField = (over = {}) => ({
    key: 'fld_skills',
    type: 'skill_table',
    hasAdvances: true,
    assignAttrToSkill: true,
    baseFromAttr: true,
    ...over,
  });
  const row = (over = {}) => ({ key: 'fld_skills.opt_stealth', label: 'Skradanie', attr: 'attr_ag', ...over });
  // `current` is deliberately wrong (it is what the database really holds for a derived row:
  // base + advances = 0 + 5). Nothing may read it.
  const skills = { 'fld_skills.opt_stealth': { base: 0, advances: 5, current: 5 } };
  const attributes = { attr_ag: { base: 35, advances: 5, current: 40 } };

  it('takes the base from the attribute and sums the total over it', () => {
    expect(resolveSkillValues(derivedField(), row(), skills, attributes))
      .toEqual({ base: 40, advances: 5, total: 45, baseReadOnly: true });
  });

  it('ignores the stored current, which is stale for a derived row', () => {
    const { total } = resolveSkillValues(derivedField(), row(), skills, attributes);
    expect(total).not.toBe(5);
  });

  it('shows 0 and stays read-only when the row has no attribute', () => {
    expect(resolveSkillValues(derivedField(), row({ attr: '' }), skills, attributes))
      .toEqual({ base: 0, advances: 5, total: 5, baseReadOnly: true });
  });

  it('falls back to the stored base when the field does not derive it', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 5, current: 35 } };
    expect(resolveSkillValues(derivedField({ baseFromAttr: false }), row(), stored, attributes))
      .toEqual({ base: 30, advances: 5, total: 35, baseReadOnly: false });
  });

  it('refuses to derive without the advances column, however the template is flagged', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 0, current: 30 } };
    expect(resolveSkillValues(derivedField({ hasAdvances: false }), row(), stored, attributes))
      .toEqual({ base: 30, advances: 0, total: 30, baseReadOnly: false });
  });

  it('refuses to derive without attribute assignment', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 5, current: 35 } };
    expect(resolveSkillValues(derivedField({ assignAttrToSkill: false }), row(), stored, attributes))
      .toEqual({ base: 30, advances: 5, total: 35, baseReadOnly: false });
  });

  it('trusts a stored current for a non-derived row, as the sheet always has', () => {
    const stored = { 'fld_skills.opt_stealth': { base: 30, advances: 5, current: 99 } };
    expect(resolveSkillValues(derivedField({ baseFromAttr: false }), row(), stored, attributes).total).toBe(99);
  });

  it('treats a skill with no stored entry as all zeros', () => {
    expect(resolveSkillValues(derivedField({ baseFromAttr: false }), row(), {}, {}))
      .toEqual({ base: 0, advances: 0, total: 0, baseReadOnly: false });
  });
});
