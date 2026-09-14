import { nextSelection } from './tokenSelection';

const a = { kind: 'char', id: 'a' };
const b = { kind: 'char', id: 'b' };
const img = { kind: 'image', id: 'a' }; // same id as `a`, different kind — must not be confused

describe('nextSelection — plain click', () => {
  it('selects a token when nothing is selected', () => {
    expect(nextSelection([], a, false)).toEqual([a]);
  });

  it('clears the selection when clicking the only selected token', () => {
    // This is how a ring gets collapsed without hunting for empty grid.
    expect(nextSelection([a], a, false)).toEqual([]);
  });

  it('narrows a group down to the clicked member', () => {
    expect(nextSelection([a, b], a, false)).toEqual([a]);
  });

  it('replaces the group with a token from outside it', () => {
    expect(nextSelection([a, b], { kind: 'char', id: 'c' }, false))
      .toEqual([{ kind: 'char', id: 'c' }]);
  });

  it('does not confuse an image with a character sharing its id', () => {
    expect(nextSelection([a], img, false)).toEqual([img]);
  });
});

describe('nextSelection — shift click', () => {
  it('adds a token to the selection', () => {
    expect(nextSelection([a], b, true)).toEqual([a, b]);
  });

  it('removes a token already in the selection', () => {
    expect(nextSelection([a, b], a, true)).toEqual([b]);
  });

  it('removes the last token, leaving an empty selection', () => {
    expect(nextSelection([a], a, true)).toEqual([]);
  });

  it('never collapses the selection the way a plain click does', () => {
    expect(nextSelection([a, b], b, true)).toEqual([a]);
  });
});

describe('nextSelection — purity', () => {
  it('does not mutate the previous selection', () => {
    const prev = [a, b];
    nextSelection(prev, a, false);
    expect(prev).toEqual([a, b]);
  });
});
