import { tensLevel, sortTiers, freeDivisor, isDivisorValid, defaultTiers } from './successLevels';

describe('successLevels helpers', () => {
  it('scores tens digits like the backend', () => {
    expect(tensLevel(38, 45, 10)).toBe(1);
    expect(tensLevel(72, 45, 10)).toBe(-3);
    expect(tensLevel(38, 45, 5)).toBe(2);
    expect(tensLevel(38, 45, 0)).toBe(1); // 0 reads as the default step
  });

  it('sorts the hardest threshold first', () => {
    expect(sortTiers([{ divisor: 2 }, { divisor: 5 }, { divisor: 3 }]).map(x => x.divisor)).toEqual([5, 3, 2]);
  });

  it('finds the smallest unused divisor', () => {
    expect(freeDivisor([{ divisor: 2 }, { divisor: 5 }])).toBe(3);
    expect(freeDivisor([])).toBe(2);
  });

  it('rejects out-of-range and duplicate divisors but not the row itself', () => {
    const tiers = [{ id: 'a', divisor: 5 }, { id: 'b', divisor: 2 }];
    expect(isDivisorValid(3, tiers, 'b')).toBe(true);
    expect(isDivisorValid(2, tiers, 'b')).toBe(true);
    expect(isDivisorValid(5, tiers, 'b')).toBe(false);
    expect(isDivisorValid(1, tiers, 'b')).toBe(false);
    expect(isDivisorValid(101, tiers, 'b')).toBe(false);
    expect(isDivisorValid(NaN, tiers, 'b')).toBe(false);
  });

  it('seeds a fifth and a half plus coloured fixed rows', () => {
    const d = defaultTiers(k => k);
    expect(d.tiers.map(x => x.divisor)).toEqual([5, 2]);
    expect(d.success.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(d.failure.label).toBe('creator.successLevels.default.failure');
  });
});
