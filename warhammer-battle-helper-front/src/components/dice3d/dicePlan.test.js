import { planThrows, toNotation, labelColorFor, MAX_ANIMATED_DICE } from './dicePlan';

describe('toNotation', () => {
  it('forces the values in the order of the size groups', () => {
    const dice = [
      { sides: 6, value: 3 },
      { sides: 100, value: 40 },
      { sides: 6, value: 5 },
      { sides: 10, value: 7 },
    ];
    expect(toNotation(dice)).toBe('2d6+1d100+1d10@3,5,40,7');
  });

  it('passes 00 + 0 through as zeros', () => {
    expect(toNotation([{ sides: 100, value: 0 }, { sides: 10, value: 0 }])).toBe('1d100+1d10@0,0');
  });
});

describe('planThrows', () => {
  it('replays the main roll before the damage roll', () => {
    const dice = [
      { sides: 6, value: 4, group: 'damage' },
      { sides: 100, value: 30 },
      { sides: 10, value: 2 },
    ];
    expect(planThrows(dice)).toEqual([
      { group: '', notation: '1d100+1d10@30,2', count: 2 },
      { group: 'damage', notation: '1d6@4', count: 1 },
    ]);
  });

  it('animates dropped dice too — they were thrown', () => {
    const dice = [{ sides: 20, value: 5, dropped: true }, { sides: 20, value: 17 }];
    expect(planThrows(dice)).toEqual([{ group: '', notation: '2d20@5,17', count: 2 }]);
  });

  it('skips a throw over the dice limit but keeps the others', () => {
    const many = Array.from({ length: MAX_ANIMATED_DICE + 1 }, () => ({ sides: 6, value: 1, group: 'damage' }));
    expect(planThrows([{ sides: 20, value: 9 }, ...many])).toEqual([{ group: '', notation: '1d20@9', count: 1 }]);
  });

  it('skips a throw with a die the library cannot draw', () => {
    expect(planThrows([{ sides: 7, value: 3 }])).toEqual([]);
  });

  it('returns nothing for a payload without dice', () => {
    expect(planThrows(undefined)).toEqual([]);
    expect(planThrows([])).toEqual([]);
  });
});

describe('labelColorFor', () => {
  it.each([
    ['#ffe119', '#1a1a1a'], // yellow
    ['#bfef45', '#1a1a1a'], // lime
    ['#ffffff', '#1a1a1a'],
    ['#4363d8', '#ffffff'], // blue
    ['#e6194b', '#ffffff'], // red
    ['#111111', '#ffffff'],
  ])('%s gets %s numbers', (bg, want) => {
    expect(labelColorFor(bg)).toBe(want);
  });

  it('falls back to light numbers on a malformed colour', () => {
    expect(labelColorFor('red')).toBe('#ffffff');
    expect(labelColorFor(undefined)).toBe('#ffffff');
  });
});
