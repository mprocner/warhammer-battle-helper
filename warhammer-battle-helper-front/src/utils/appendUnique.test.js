import { appendUnique } from './appendUnique';

describe('appendUnique', () => {
  it('appends an item that is not in the list yet', () => {
    expect(appendUnique([{ id: 'a' }], { id: 'b' })).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('returns the same list reference when the id is already present', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(appendUnique(list, { id: 'b' })).toBe(list);
  });

  it('keeps the copy already in the list instead of the incoming one', () => {
    const list = [{ id: 'a', title: 'stored' }];
    expect(appendUnique(list, { id: 'a', title: 'incoming' })).toEqual([
      { id: 'a', title: 'stored' },
    ]);
  });

  it('treats a missing list as empty', () => {
    expect(appendUnique(undefined, { id: 'a' })).toEqual([{ id: 'a' }]);
    expect(appendUnique(null, { id: 'a' })).toEqual([{ id: 'a' }]);
  });

  it('ignores a missing item', () => {
    const list = [{ id: 'a' }];
    expect(appendUnique(list, null)).toBe(list);
    expect(appendUnique(list, undefined)).toBe(list);
  });
});
