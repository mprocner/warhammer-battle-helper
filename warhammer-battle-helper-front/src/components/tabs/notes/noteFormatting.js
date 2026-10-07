// Formatting constants and pure helpers for the note editor toolbar. No Tiptap import here,
// so toolbar components and their tests stay independent of the editor runtime.

// Keep in sync with noteFontSizeRe in
// warhammer-battle-helper-backend/internal/service/NoteService.go — the server strips any
// size outside this range, so a wider range here would silently lose formatting on save.
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 72;
export const FONT_SIZE_PRESETS = [12, 14, 16, 20, 24, 32];
// Base size of .note-editor__content .tiptap in NotesTab.css.
export const DEFAULT_FONT_SIZE = 13;

// Every text colour has contrast >= 4.5:1 on #fff9f0. The first entry is the editor's own
// text colour: picking it removes the colour mark instead of storing it.
export const DEFAULT_TEXT_COLOR = '#3a2f1f';
export const TEXT_COLORS = [
  { key: 'default', hex: DEFAULT_TEXT_COLOR },
  { key: 'red', hex: '#a8322d' },
  { key: 'orange', hex: '#b85c1e' },
  { key: 'gold', hex: '#9a6b2f' },
  { key: 'green', hex: '#2f6b3a' },
  { key: 'blue', hex: '#2d5a8a' },
  { key: 'purple', hex: '#6b3f8a' },
  { key: 'gray', hex: '#6e6458' },
];

export const HIGHLIGHT_COLORS = [
  { key: 'yellow', hex: '#fff3a3' },
  { key: 'green', hex: '#d4f0c4' },
  { key: 'blue', hex: '#cfe3f7' },
  { key: 'pink', hex: '#f7d4e0' },
  { key: 'orange', hex: '#fde0c2' },
  { key: 'lavender', hex: '#e3d9f2' },
];

export const clampFontSize = (n) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));

// Free text from the size field -> in-range px number, or null when it is not a number.
// Out-of-range values are clamped rather than rejected so the user sees what was applied.
export const parseFontSize = (input) => {
  const n = Number.parseFloat(String(input ?? '').trim());
  return Number.isFinite(n) ? clampFontSize(n) : null;
};

// Editor attribute ('18px') -> 18. Unset or non-px values (pasted '1.2em') -> null.
export const readFontSize = (cssValue) => {
  const match = /^(\d+)px$/.exec(cssValue ?? '');
  return match ? Number(match[1]) : null;
};

export const toCssFontSize = (n) => `${n}px`;

// A bare "example.com" gets https://; a value with an allowed scheme is kept as typed.
// Anything else (e.g. "javascript:…") becomes https://javascript:… — harmless, and the
// backend policy rejects unparseable URLs anyway. Internal whitespace is percent-encoded:
// the server drops the whole link when the URL contains a raw space.
export const normalizeHref = (input) => {
  const href = String(input ?? '').trim().replace(/\s+/g, '%20');
  if (!href) return '';
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
};
