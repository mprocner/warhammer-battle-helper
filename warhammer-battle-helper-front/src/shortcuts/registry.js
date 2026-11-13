// The one list of keyboard shortcuts and mouse gestures in the game screen. Keyboard handlers match
// events through `matches(shortcut(id), e)` instead of comparing `e.key` themselves, the cheat
// sheet (ShortcutsDialog) renders this list, and shortcutsHelp.test.js fails when a keyboard entry
// is missing from the guide — so a shortcut added here is wired, shown and documented together.
//
// Entry: { id, kind: 'key'|'mouse', combos: [[...tokens]], context, gmOnly, labelKey }
//   combos   alternatives; any one of them triggers the shortcut (Delete OR Backspace).
//   tokens   modifiers ('Mod' = Ctrl, or Cmd on macOS; 'Shift'; 'Alt') then one key, written as
//            KeyboardEvent.key ('Delete', 'Escape', '?', 'C'), or a mouse gesture token.
//   mouse    entries are display-only: scene mouse handling has its own rules (see CLAUDE.md,
//            "Zdarzenia myszy na scenie") and stays where it is.

export const SHORTCUT_CONTEXTS = ['general', 'scene', 'drawing', 'fog'];

export const SHORTCUTS = [
  { id: 'general.openShortcuts', kind: 'key', combos: [['?']], context: 'general', labelKey: 'shortcuts.items.openShortcuts' },
  { id: 'scene.copy', kind: 'key', combos: [['Mod', 'C']], context: 'scene', gmOnly: true, labelKey: 'shortcuts.items.copyImages' },
  { id: 'scene.paste', kind: 'key', combos: [['Mod', 'V']], context: 'scene', gmOnly: true, labelKey: 'shortcuts.items.pasteImages' },
  { id: 'scene.deleteSelected', kind: 'key', combos: [['Delete'], ['Backspace']], context: 'scene', gmOnly: true, labelKey: 'shortcuts.items.deleteSelected' },
  { id: 'scene.clearSelection', kind: 'key', combos: [['Escape']], context: 'scene', labelKey: 'shortcuts.items.clearSelection' },
  { id: 'scene.cycleTool', kind: 'mouse', combos: [['MiddleClick']], context: 'scene', labelKey: 'shortcuts.items.cycleTool' },
  { id: 'scene.pan', kind: 'mouse', combos: [['RightDrag']], context: 'scene', labelKey: 'shortcuts.items.pan' },
  { id: 'scene.addToSelection', kind: 'mouse', combos: [['Shift', 'Drag']], context: 'scene', labelKey: 'shortcuts.items.addToSelection' },
  { id: 'scene.ping', kind: 'mouse', combos: [['HoldLeft']], context: 'scene', labelKey: 'shortcuts.items.ping' },
  { id: 'drawing.deleteSelected', kind: 'key', combos: [['Delete'], ['Backspace']], context: 'drawing', labelKey: 'shortcuts.items.deleteDrawing' },
  { id: 'drawing.copy', kind: 'key', combos: [['Mod', 'C']], context: 'drawing', labelKey: 'shortcuts.items.copyDrawings' },
  { id: 'drawing.paste', kind: 'key', combos: [['Mod', 'V']], context: 'drawing', labelKey: 'shortcuts.items.pasteDrawings' },
  { id: 'drawing.clearSelection', kind: 'key', combos: [['Escape']], context: 'drawing', labelKey: 'shortcuts.items.clearDrawingSelection' },
  { id: 'drawing.addToSelection', kind: 'mouse', combos: [['Shift', 'Click'], ['Shift', 'Drag']], context: 'drawing', labelKey: 'shortcuts.items.addDrawingToSelection' },
  { id: 'fog.cancelPolygon', kind: 'key', combos: [['Escape']], context: 'fog', gmOnly: true, labelKey: 'shortcuts.items.cancelFogPolygon' },
];

const BY_ID = Object.fromEntries(SHORTCUTS.map(s => [s.id, s]));

// Throws on an unknown id: a typo must fail loudly, not silently disable a shortcut.
export function shortcut(id) {
  const entry = BY_ID[id];
  if (!entry) throw new Error(`Unknown shortcut: ${id}`);
  return entry;
}

const MODIFIERS = new Set(['Mod', 'Shift', 'Alt']);
const isLetter = (k) => /^[a-z]$/i.test(k);

function comboMatches(combo, e) {
  const mods = combo.filter(t => MODIFIERS.has(t));
  const key = combo.find(t => !MODIFIERS.has(t));
  if ((e.ctrlKey || e.metaKey) !== mods.includes('Mod')) return false;
  if (!!e.altKey !== mods.includes('Alt')) return false;
  // Shift is only checked when it changes nothing about e.key itself: for letters and named keys.
  // A symbol such as '?' already arrives as e.key === '?', typed with Shift on most layouts.
  if ((isLetter(key) || key.length > 1) && !!e.shiftKey !== mods.includes('Shift')) return false;
  return isLetter(key) ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
}

export function matches(entry, e) {
  return entry.kind === 'key' && entry.combos.some(combo => comboMatches(combo, e));
}

const KEY_LABELS = { Escape: 'Esc' };
const MOUSE_TOKENS = new Set(['MiddleClick', 'RightDrag', 'Drag', 'Click', 'HoldLeft']);

// Human-readable combo, e.g. 'Ctrl + C' / '⌘ + C'. Mouse tokens go through i18n
// (shortcuts.keys.<token>); key names are language-neutral, as the guide writes them.
export function formatCombo(combo, { isMac, t }) {
  return combo.map(token => {
    if (token === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (token === 'Alt') return isMac ? '⌥' : 'Alt';
    if (MOUSE_TOKENS.has(token)) return t(`shortcuts.keys.${token}`);
    return KEY_LABELS[token] || token;
  }).join(' + ');
}

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');

// Typing in a field must never trigger a shortcut (Backspace in the chat deleting a drawing).
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type);
  return !!el.closest?.('[contenteditable]:not([contenteditable="false"])');
}

// A modal dialog owns the keyboard while it is open (the token config popup, a confirm).
export const isDialogOpen = () => !!document.querySelector('.MuiDialog-root');
