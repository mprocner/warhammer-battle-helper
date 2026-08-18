import { stripUserFromCharacters } from './stripUserFromCharacters';

describe('stripUserFromCharacters', () => {
  it('removes the id from every character that carries it', () => {
    const characters = [
      { id: 'c1', visibleTo: ['u1', 'u2'] },
      { id: 'c2', visibleTo: ['u2'] },
      { id: 'c3', visibleTo: ['u1'] },
    ];

    expect(stripUserFromCharacters(characters, 'u1')).toEqual([
      { id: 'c1', visibleTo: ['u2'] },
      { id: 'c2', visibleTo: ['u2'] },
      { id: 'c3', visibleTo: [] },
    ]);
  });

  it('keeps the original object for a character that never had the id', () => {
    const untouched = { id: 'c1', visibleTo: ['u2'] };
    const [result] = stripUserFromCharacters([untouched], 'u1');
    expect(result).toBe(untouched);
  });

  it('handles characters without a visibleTo array', () => {
    expect(stripUserFromCharacters([{ id: 'c1' }], 'u1')).toEqual([{ id: 'c1' }]);
  });

  it('treats a missing character list as empty', () => {
    expect(stripUserFromCharacters(undefined, 'u1')).toEqual([]);
    expect(stripUserFromCharacters(null, 'u1')).toEqual([]);
  });

  it('returns the list unchanged when no user id is given', () => {
    const list = [{ id: 'c1', visibleTo: ['u1'] }];
    expect(stripUserFromCharacters(list, undefined)).toBe(list);
  });
});
