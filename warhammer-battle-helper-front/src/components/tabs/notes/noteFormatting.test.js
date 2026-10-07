import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  DEFAULT_TEXT_COLOR,
  parseFontSize,
  readFontSize,
  toCssFontSize,
  normalizeHref,
} from './noteFormatting';

describe('font size helpers', () => {
  it('uses the same range as noteFontSizeRe in NoteService.go', () => {
    expect([FONT_SIZE_MIN, FONT_SIZE_MAX]).toEqual([8, 72]);
  });

  it.each([
    ['18', 18],
    ['18px', 18],
    [' 20 ', 20],
    ['18.6', 19],
    ['5', 8],
    ['100', 72],
    ['abc', null],
    ['', null],
    [null, null],
  ])('parseFontSize(%p) -> %p', (input, expected) => {
    expect(parseFontSize(input)).toBe(expected);
  });

  it.each([
    ['18px', 18],
    ['1.2em', null],
    [undefined, null],
    [null, null],
  ])('readFontSize(%p) -> %p', (input, expected) => {
    expect(readFontSize(input)).toBe(expected);
  });

  it('formats a px value', () => {
    expect(toCssFontSize(24)).toBe('24px');
  });
});

describe('palettes', () => {
  // The backend keeps a colour only when it matches noteColorRe.
  const backendColorRe = /^#[0-9a-fA-F]{6}$/;

  it.each([...TEXT_COLORS, ...HIGHLIGHT_COLORS])('$key is a #rrggbb colour', ({ hex }) => {
    expect(hex).toMatch(backendColorRe);
  });

  it('starts the text palette with the editor default colour', () => {
    expect(TEXT_COLORS).toHaveLength(8);
    expect(TEXT_COLORS[0]).toEqual({ key: 'default', hex: DEFAULT_TEXT_COLOR });
    expect(HIGHLIGHT_COLORS).toHaveLength(6);
  });
});

describe('normalizeHref', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  example.com/a  ', 'https://example.com/a'],
    ['https://example.com', 'https://example.com'],
    ['HTTP://example.com', 'HTTP://example.com'],
    ['mailto:gm@example.com', 'mailto:gm@example.com'],
    ['e.com/a b', 'https://e.com/a%20b'],
    ['https://e.com/a  b', 'https://e.com/a%20b'],
    ['', ''],
    ['   ', ''],
  ])('%p -> %p', (input, expected) => {
    expect(normalizeHref(input)).toBe(expected);
  });
});
