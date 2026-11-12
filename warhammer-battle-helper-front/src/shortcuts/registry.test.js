import { SHORTCUTS, shortcut, matches, formatCombo, isTypingTarget } from './registry';

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('shortcut registry', () => {
  test('ids are unique and every entry has a label', () => {
    const ids = SHORTCUTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    SHORTCUTS.forEach(s => expect(s.labelKey).toMatch(/^shortcuts\.items\./));
  });

  test('an unknown id throws, so a typo cannot silently disable a shortcut', () => {
    expect(() => shortcut('nope')).toThrow();
  });
});

describe('matches', () => {
  const del = { kind: 'key', combos: [['Delete'], ['Backspace']] };
  const copy = { kind: 'key', combos: [['Mod', 'C']] };
  const help = { kind: 'key', combos: [['?']] };

  test('any of the alternative combos matches', () => {
    expect(matches(del, key('Delete'))).toBe(true);
    expect(matches(del, key('Backspace'))).toBe(true);
    expect(matches(del, key('Enter'))).toBe(false);
  });

  test('Mod is Ctrl on Windows/Linux and Cmd on macOS', () => {
    expect(matches(copy, key('c', { ctrlKey: true }))).toBe(true);
    expect(matches(copy, key('c', { metaKey: true }))).toBe(true);
    expect(matches(copy, key('c'))).toBe(false);
  });

  test('letters ignore case but not extra modifiers', () => {
    expect(matches(copy, key('C', { ctrlKey: true }))).toBe(true);
    expect(matches(copy, key('c', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matches(copy, key('c', { ctrlKey: true, altKey: true }))).toBe(false);
  });

  test('a combo without Mod does not fire with Ctrl held (Ctrl+Backspace edits text)', () => {
    expect(matches(del, key('Backspace', { ctrlKey: true }))).toBe(false);
  });

  test('a symbol typed with Shift matches without listing Shift ("?" is Shift+/ on most layouts)', () => {
    expect(matches(help, key('?', { shiftKey: true }))).toBe(true);
  });

  test('a mouse entry never matches a key event', () => {
    expect(matches({ kind: 'mouse', combos: [['MiddleClick']] }, key('MiddleClick'))).toBe(false);
  });
});

describe('formatCombo', () => {
  const t = (k) => ({ 'shortcuts.keys.MiddleClick': 'Middle click' }[k] || k);

  test('Mod reads Ctrl off macOS and ⌘ on macOS', () => {
    expect(formatCombo(['Mod', 'C'], { isMac: false, t })).toBe('Ctrl + C');
    expect(formatCombo(['Mod', 'C'], { isMac: true, t })).toBe('⌘ + C');
  });

  test('named keys get their short labels', () => {
    expect(formatCombo(['Escape'], { isMac: false, t })).toBe('Esc');
  });

  test('mouse gestures are translated', () => {
    expect(formatCombo(['MiddleClick'], { isMac: false, t })).toBe('Middle click');
  });
});

describe('isTypingTarget', () => {
  test('text fields and editors swallow shortcuts', () => {
    ['input', 'textarea', 'select'].forEach(tag => {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    });
    // jsdom does not implement the contentEditable property; TipTap renders the attribute anyway,
    // and the target is usually a paragraph inside the editable root.
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const paragraph = document.createElement('p');
    editor.appendChild(paragraph);
    expect(isTypingTarget(paragraph)).toBe(true);
  });

  test('a checkbox or a button does not', () => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
