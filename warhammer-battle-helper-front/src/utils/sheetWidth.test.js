import {
  SHEET_WIDTH_MIN, SHEET_WIDTH_MAX, SHEET_WIDTH_STEP, SHEET_WIDTH_DEFAULT, clampSheetWidth,
} from './sheetWidth';

describe('sheet width bounds', () => {
  test('describe a usable range, with the default inside it', () => {
    // Not a restatement of the literals: these relationships are what every consumer assumes.
    // The floor also matches DraggablePopup's own `const minWidth = 600` resize limit — a
    // template that opened narrower than a player can drag it back to would be a width nobody
    // could undo. That cross-file agreement cannot be asserted from here; it is why 600.
    expect(SHEET_WIDTH_MIN).toBeLessThan(SHEET_WIDTH_MAX);
    expect(SHEET_WIDTH_DEFAULT).toBeGreaterThanOrEqual(SHEET_WIDTH_MIN);
    expect(SHEET_WIDTH_DEFAULT).toBeLessThanOrEqual(SHEET_WIDTH_MAX);
    expect((SHEET_WIDTH_MAX - SHEET_WIDTH_MIN) % SHEET_WIDTH_STEP).toBe(0);
  });
});

describe('clampSheetWidth', () => {
  test('returns the default for a template that never set one', () => {
    expect(clampSheetWidth(undefined)).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth(null)).toBe(SHEET_WIDTH_DEFAULT);
  });

  test('treats 0 as unset, because omitempty drops it on the wire', () => {
    expect(clampSheetWidth(0)).toBe(SHEET_WIDTH_DEFAULT);
  });

  test('keeps a value inside the range untouched', () => {
    expect(clampSheetWidth(1300)).toBe(1300);
    expect(clampSheetWidth(SHEET_WIDTH_MIN)).toBe(SHEET_WIDTH_MIN);
    expect(clampSheetWidth(SHEET_WIDTH_MAX)).toBe(SHEET_WIDTH_MAX);
  });

  test('pulls an out-of-range value back to the nearest bound', () => {
    expect(clampSheetWidth(120)).toBe(SHEET_WIDTH_MIN);
    expect(clampSheetWidth(99999)).toBe(SHEET_WIDTH_MAX);
  });

  test('falls back to the default for anything that is not a finite number', () => {
    expect(clampSheetWidth('1200')).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth(NaN)).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth(Infinity)).toBe(SHEET_WIDTH_DEFAULT);
    expect(clampSheetWidth({})).toBe(SHEET_WIDTH_DEFAULT);
  });
});
