import { successLevelDisplay } from './successLevelDisplay';

const t = key => (key === 'customRoll.slAbbr' ? 'SL' : key);

describe('successLevelDisplay', () => {
  it('returns null when the roll carries no success data', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', successLevel: 0 }, 'Success!', t)).toBeNull();
  });

  it('formats a positive level', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', hasSuccessLevel: true, successLevel: 2 }, 'Success!', t))
      .toEqual({ label: 'Success! · +2 SL', color: null });
  });

  it('formats a negative level with a real minus sign', () => {
    expect(successLevelDisplay({ outcome: 'failure', hasSuccessLevel: true, successLevel: -3 }, 'Failure!', t).label)
      .toBe('Failure! · −3 SL');
  });

  // Level 0 is both "barely made it" and "barely missed"; the outcome picks the sign.
  it('signs zero from the outcome', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', hasSuccessLevel: true, successLevel: 0 }, 'S', t).label).toBe('S · +0 SL');
    expect(successLevelDisplay({ outcome: 'failure', hasSuccessLevel: true, successLevel: 0 }, 'F', t).label).toBe('F · −0 SL');
  });

  it('uses the tier label and colour', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', tierLabel: 'Extreme', tierColor: '#b8941f' }, 'Success!', t))
      .toEqual({ label: 'Extreme', color: '#b8941f' });
  });

  it('falls back to the outcome label for an unnamed tier', () => {
    expect(successLevelDisplay({ outcome: 'regular_success', tierColor: '#b8941f' }, 'Success!', t))
      .toEqual({ label: 'Success!', color: '#b8941f' });
  });
});
