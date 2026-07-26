import { snapAngle, SNAP_STEP, SNAP_THRESHOLD } from './angleSnap';

describe('snapAngle', () => {
  test('constants', () => {
    expect(SNAP_STEP).toBe(45);
    expect(SNAP_THRESHOLD).toBe(10);
  });

  test('snaps when within threshold of a 45 multiple', () => {
    expect(snapAngle(43)).toBe(45);
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(55)).toBe(45);   // |55-45|=10, inclusive
    expect(snapAngle(88)).toBe(90);
  });

  test('leaves angle free when outside threshold', () => {
    expect(snapAngle(30)).toBe(30);   // |30-45|=15, |30-0|=30
    expect(snapAngle(58)).toBe(58);   // |58-45|=13
  });

  test('works for negatives and >360', () => {
    expect(snapAngle(-43)).toBe(-45);
    expect(snapAngle(370)).toBe(360);
  });

  test('respects custom step/threshold', () => {
    expect(snapAngle(88, 90, 5)).toBe(90);
    expect(snapAngle(80, 90, 5)).toBe(80);
  });
});
