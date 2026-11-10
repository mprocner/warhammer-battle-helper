import { showsRollNotice } from './rollNotice';

describe('showsRollNotice', () => {
  const player = { isGM: false, userId: 'u1' };
  const gm = { isGM: true, userId: 'gm' };

  it.each([
    [undefined, true],
    ['all', true],
    ['gm_only', false],
    ['gm_and_roller', false],
    ['u1', true],
    ['u2', false],
  ])('player sees visibility %s: %s', (visibility, want) => {
    expect(showsRollNotice(visibility, player)).toBe(want);
  });

  it('shows every roll the server delivers to the GM', () => {
    expect(showsRollNotice('gm_only', gm)).toBe(true);
    expect(showsRollNotice('u2', gm)).toBe(true);
  });
});
