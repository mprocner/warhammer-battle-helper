import { canManipulateToken, isLoneSelection } from './tokenManipulation';

// Base: an unlocked token the user may edit, in the default tool, on the armed tokens layer,
// but not selected.
const base = {
  allowed: true,
  locked: false,
  editingLayer: 'select',
  imageEditLayer: 'tokens',
  selected: false,
};

describe('canManipulateToken', () => {
  it('shows handles for the lone selected token', () => {
    expect(canManipulateToken({ ...base, selected: true })).toBe(true);
  });

  it('hides handles when nothing is selected', () => {
    expect(canManipulateToken({ ...base })).toBe(false);
  });

  it('hides handles when another image layer is armed', () => {
    // Characters live on the tokens layer; with bg/gm armed they are backdrop for the marquee.
    expect(canManipulateToken({
      ...base, selected: true, imageEditLayer: 'background',
    })).toBe(false);
  });

  describe('gates that override everything', () => {
    it('hides handles without permission', () => {
      expect(canManipulateToken({ ...base, allowed: false, selected: true })).toBe(false);
    });

    it('hides handles on a locked token', () => {
      expect(canManipulateToken({ ...base, locked: true, selected: true })).toBe(false);
    });
  });

  describe('tool tabs that own the pointer', () => {
    it.each(['measure', 'fog', 'drawing'])('hides handles in %s mode', (layer) => {
      expect(canManipulateToken({ ...base, editingLayer: layer, selected: true })).toBe(false);
    });
  });

  describe('defaults', () => {
    it('denies everything when called with no arguments', () => {
      expect(canManipulateToken()).toBe(false);
    });
  });
});

describe('isLoneSelection', () => {
  it('is true for the only selected token', () => {
    expect(isLoneSelection(true, false)).toBe(true);
  });

  it('is false for a member of a multi-selection', () => {
    // The guarantee that a group shows no chrome: rotating a group would move each token's
    // centre, which is a different operation.
    expect(isLoneSelection(true, true)).toBe(false);
  });

  it('is false for an unselected token', () => {
    expect(isLoneSelection(false, false)).toBe(false);
  });

  it('coerces an absent selection flag to false', () => {
    // multiSelected arrives from an optional call (isTokenSelected?.(...)) and can be undefined.
    expect(isLoneSelection(undefined, false)).toBe(false);
  });
});
