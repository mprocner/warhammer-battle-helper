import { resolveTarget, titleKeyFor, bodyKeyFor, isRevealSatisfied } from './stepResolution';

const present = (...selectors) => (sel) => (selectors.includes(sel) ? {} : null);

describe('resolveTarget', () => {
  it('accepts a plain string target', () => {
    const step = { id: 'a', target: '.one' };
    expect(resolveTarget(step, present('.one'))).toEqual({ selector: '.one', index: 0 });
  });

  it('takes the first selector that exists, not merely the first listed', () => {
    const step = { id: 'a', target: ['.empty', '.list'] };
    expect(resolveTarget(step, present('.list'))).toEqual({ selector: '.list', index: 1 });
  });

  it('prefers the earlier selector when both exist, so a nested empty state wins over its list', () => {
    const step = { id: 'a', target: ['.empty', '.list'] };
    expect(resolveTarget(step, present('.empty', '.list'))).toEqual({ selector: '.empty', index: 0 });
  });

  it('returns null when nothing is on screen', () => {
    const step = { id: 'a', target: ['.empty', '.list'] };
    expect(resolveTarget(step, present())).toBeNull();
  });
});

describe('key building', () => {
  const ctx = { targetIndex: 1, role: 'gm', controlScheme: 'classic' };

  it('derives the title from the tour and step id', () => {
    expect(titleKeyFor({ id: 'fileList' }, 'files')).toBe('tutorial.files.fileList.title');
  });

  it('leaves the body key plain when the step declares no variants', () => {
    expect(bodyKeyFor({ id: 'upload' }, 'files', ctx)).toBe('tutorial.files.upload.body');
  });

  it('appends the matched target index for byTarget', () => {
    expect(bodyKeyFor({ id: 'fileList', variants: ['byTarget'] }, 'files', ctx))
      .toBe('tutorial.files.fileList.body.1');
  });

  it('appends the role for byRole', () => {
    expect(bodyKeyFor({ id: 'list', variants: ['byRole'] }, 'notes', ctx))
      .toBe('tutorial.notes.list.body.gm');
  });

  it('appends the control scheme for byScheme', () => {
    expect(bodyKeyFor({ id: 'sceneControls', variants: ['byScheme'] }, 'gameScreen', ctx))
      .toBe('tutorial.gameScreen.sceneControls.body.classic');
  });

  it('treats any scheme that is not classic as modern', () => {
    const step = { id: 'sceneControls', variants: ['byScheme'] };
    expect(bodyKeyFor(step, 'gameScreen', { ...ctx, controlScheme: 'modern' }))
      .toBe('tutorial.gameScreen.sceneControls.body.modern');
    expect(bodyKeyFor(step, 'gameScreen', { ...ctx, controlScheme: undefined }))
      .toBe('tutorial.gameScreen.sceneControls.body.modern');
  });

  it('appends several axes in the order the step declared them', () => {
    const step = { id: 'list', variants: ['byTarget', 'byRole'] };
    expect(bodyKeyFor(step, 'handouts', ctx)).toBe('tutorial.handouts.list.body.1.gm');
  });

  it('follows the step declaration order even when it differs from the axis table order', () => {
    const step = { id: 'list', variants: ['byRole', 'byTarget'] };
    expect(bodyKeyFor(step, 'handouts', ctx)).toBe('tutorial.handouts.list.body.gm.1');
  });

  it('skips an unknown axis instead of throwing, so a typo in a tour file cannot white-screen the game', () => {
    const step = { id: 'list', variants: ['byRoll'] }; // literówka: byRole -> byRoll
    expect(() => bodyKeyFor(step, 'handouts', ctx)).not.toThrow();
    expect(bodyKeyFor(step, 'handouts', ctx)).toBe('tutorial.handouts.list.body');
  });

  it('keeps the known axes around an unknown one instead of dropping the whole key', () => {
    const step = { id: 'list', variants: ['byRole', 'byNope', 'byTarget'] };
    expect(bodyKeyFor(step, 'handouts', ctx)).toBe('tutorial.handouts.list.body.gm.1');
  });
});

describe('isRevealSatisfied', () => {
  const ALL_VISIBLE = { leftHidden: false, rightHidden: false, topCollapsed: false };

  it('treats a step with no reveal requirement as always ready', () => {
    expect(isRevealSatisfied({ id: 'a' }, { leftHidden: true, rightHidden: true, topCollapsed: true }))
      .toBe(true);
  });

  it('blocks a step until the panel holding its anchor is open', () => {
    expect(isRevealSatisfied({ id: 'a', reveal: 'right' }, { ...ALL_VISIBLE, rightHidden: true })).toBe(false);
    expect(isRevealSatisfied({ id: 'a', reveal: 'right' }, ALL_VISIBLE)).toBe(true);
    expect(isRevealSatisfied({ id: 'a', reveal: 'left' }, { ...ALL_VISIBLE, leftHidden: true })).toBe(false);
    expect(isRevealSatisfied({ id: 'a', reveal: 'left' }, ALL_VISIBLE)).toBe(true);
    expect(isRevealSatisfied({ id: 'a', reveal: 'top' }, { ...ALL_VISIBLE, topCollapsed: true })).toBe(false);
    expect(isRevealSatisfied({ id: 'a', reveal: 'top' }, ALL_VISIBLE)).toBe(true);
  });
});
