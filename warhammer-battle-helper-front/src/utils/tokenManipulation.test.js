import { canManipulateToken } from './tokenManipulation';

// Base: an unlocked token the user may edit, with nothing selected and no tool active.
const base = {
  allowed: true,
  locked: false,
  editingLayer: null,
  activeTool: null,
  imageEditLayer: 'background',
  activeSelected: false,
  groupSelected: false,
  multiSelectActive: false,
};

describe('canManipulateToken', () => {
  describe('pan context (editingLayer null)', () => {
    it('shows handles for the active token', () => {
      expect(canManipulateToken({ ...base, activeSelected: true })).toBe(true);
    });

    it('hides handles when no token is active', () => {
      expect(canManipulateToken({ ...base })).toBe(false);
    });

    it('ignores the group selection in pan context', () => {
      expect(canManipulateToken({ ...base, groupSelected: true })).toBe(false);
    });
  });

  describe("pan tool inside another tab (activeTool 'pan')", () => {
    it('behaves like the pan tab', () => {
      expect(canManipulateToken({
        ...base, editingLayer: 'drawing', activeTool: 'pan', activeSelected: true,
      })).toBe(true);
    });

    it('hides handles for a non-pan tool in that tab', () => {
      expect(canManipulateToken({
        ...base, editingLayer: 'drawing', activeTool: 'freehand', activeSelected: true,
      })).toBe(false);
    });
  });

  describe('select context', () => {
    const select = { ...base, editingLayer: 'select', imageEditLayer: 'tokens' };

    it('shows handles for a single group-selected token', () => {
      expect(canManipulateToken({ ...select, groupSelected: true })).toBe(true);
    });

    it('hides handles when more than one token is selected', () => {
      expect(canManipulateToken({
        ...select, groupSelected: true, multiSelectActive: true,
      })).toBe(false);
    });

    it('hides handles for a token outside the selection', () => {
      expect(canManipulateToken({ ...select })).toBe(false);
    });

    it('hides handles when another layer is armed', () => {
      expect(canManipulateToken({
        ...select, imageEditLayer: 'background', groupSelected: true,
      })).toBe(false);
    });

    it('ignores the active token in select context', () => {
      expect(canManipulateToken({ ...select, activeSelected: true })).toBe(false);
    });
  });

  describe('gates that override every context', () => {
    it('hides handles without permission', () => {
      expect(canManipulateToken({ ...base, allowed: false, activeSelected: true })).toBe(false);
    });

    it('hides handles on a locked token', () => {
      expect(canManipulateToken({ ...base, locked: true, activeSelected: true })).toBe(false);
    });
  });

  describe('tool tabs that own the pointer', () => {
    it.each(['measure', 'fog', 'drawing'])('hides handles in %s mode', (layer) => {
      expect(canManipulateToken({
        ...base, editingLayer: layer, activeSelected: true, groupSelected: true,
      })).toBe(false);
    });
  });
});
