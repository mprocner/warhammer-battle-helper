import {
  SCENE_MODES,
  modesForRole,
  cycleNext,
  nextMode,
  modeLabelKey,
  isModeCycleClick,
} from './sceneModes';

describe('modesForRole', () => {
  it('gives the GM every mode in toolbar order', () => {
    expect(modesForRole(true).map(m => m.value))
      .toEqual([null, 'select', 'measure', 'fog', 'drawing']);
  });

  it('hides GM-only modes from players', () => {
    expect(modesForRole(false).map(m => m.value))
      .toEqual([null, 'measure', 'drawing']);
  });

  it('derives the GM list from SCENE_MODES rather than a hardcoded copy', () => {
    expect(modesForRole(true)).toHaveLength(SCENE_MODES.length);
  });
});

describe('cycleNext', () => {
  // Fabricated list: proof the cycle does not know how many modes exist.
  // Adding an entry to SCENE_MODES must not require touching this logic.
  const fake = [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }];

  it('advances one position', () => {
    expect(cycleNext(fake, 'b')).toBe('c');
  });

  it('wraps past the last entry', () => {
    expect(cycleNext(fake, 'd')).toBe('a');
  });

  it('falls back to the first entry for an unknown current value', () => {
    expect(cycleNext(fake, 'zzz')).toBe('a');
  });
});

describe('nextMode', () => {
  it('walks the full GM cycle and wraps', () => {
    expect(nextMode(null, true)).toBe('select');
    expect(nextMode('select', true)).toBe('measure');
    expect(nextMode('measure', true)).toBe('fog');
    expect(nextMode('fog', true)).toBe('drawing');
    expect(nextMode('drawing', true)).toBe(null);
  });

  it('walks the full player cycle and wraps', () => {
    expect(nextMode(null, false)).toBe('measure');
    expect(nextMode('measure', false)).toBe('drawing');
    expect(nextMode('drawing', false)).toBe(null);
  });

  it('resets a player stranded in a GM-only mode', () => {
    expect(nextMode('fog', false)).toBe(null);
  });
});

describe('modeLabelKey', () => {
  it('maps a mode value to its i18n key', () => {
    expect(modeLabelKey(null)).toBe('scenes.panLayer');
    expect(modeLabelKey('fog')).toBe('scenes.fogLayer');
  });
});

describe('isModeCycleClick', () => {
  it('accepts a lone middle-button press', () => {
    expect(isModeCycleClick({ button: 1, buttons: 4 }, null)).toBe(true);
  });

  it('still accepts it when an extra side button is held', () => {
    // buttons = middle (4) | back (8). Side buttons mean no map operation is
    // in progress, so the shortcut must keep working.
    expect(isModeCycleClick({ button: 1, buttons: 12 }, null)).toBe(true);
  });

  it('rejects a middle press while the left button is held', () => {
    // Every in-progress map operation (token drag, drawing stroke, rotate)
    // holds the left button, so this is the whole "operation in flight" guard.
    expect(isModeCycleClick({ button: 1, buttons: 5 }, null)).toBe(false);
  });

  it('rejects a middle press while the right button is held', () => {
    expect(isModeCycleClick({ button: 1, buttons: 6 }, null)).toBe(false);
  });

  it('rejects the left button', () => {
    expect(isModeCycleClick({ button: 0, buttons: 1 }, null)).toBe(false);
  });

  it('rejects the right button', () => {
    expect(isModeCycleClick({ button: 2, buttons: 2 }, null)).toBe(false);
  });

  it('rejects it while a text field inside the scene or toolbar has focus', () => {
    expect(isModeCycleClick({ button: 1, buttons: 4 }, { tagName: 'INPUT', closest: () => ({}) })).toBe(false);
    expect(isModeCycleClick({ button: 1, buttons: 4 }, { tagName: 'TEXTAREA', closest: () => ({}) })).toBe(false);
  });

  // mousedown fires before focus moves, so a global "any input" check would
  // silently swallow the first middle-click after typing in an unrelated field
  // like chat — only text fields belonging to the map surface should block it.
  it('accepts it while a text field elsewhere on the page has focus (e.g. chat)', () => {
    expect(isModeCycleClick({ button: 1, buttons: 4 }, { tagName: 'INPUT', closest: () => null })).toBe(true);
    expect(isModeCycleClick({ button: 1, buttons: 4 }, { tagName: 'TEXTAREA', closest: () => null })).toBe(true);
  });
});
