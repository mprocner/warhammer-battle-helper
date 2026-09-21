/**
 * The character sheet window's opening width, authored by the GM per custom template.
 *
 * These four numbers are the single place the slider in the creator and the popup in the
 * session agree on. The floor matches DraggablePopup's own resize minimum: a template that
 * opened narrower than a player can drag it back to would be a width nobody could undo. The
 * ceiling only bounds the input — the real limit at open time is the viewport, which
 * DraggablePopup already applies with Math.min(initialWidth, window.innerWidth).
 */

export const SHEET_WIDTH_MIN = 600;
export const SHEET_WIDTH_MAX = 2400;
export const SHEET_WIDTH_STEP = 50;
export const SHEET_WIDTH_DEFAULT = 900;

// clampSheetWidth turns whatever is stored into a width worth using. The slider cannot produce
// a bad value, but a template written before this setting existed has none at all, and one
// hand-edited in the database can hold anything. 0 reads as "unset" rather than as a width,
// because the model stores the field with omitempty and 0 is not a legal width anyway.
export function clampSheetWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    return SHEET_WIDTH_DEFAULT;
  }
  return Math.min(SHEET_WIDTH_MAX, Math.max(SHEET_WIDTH_MIN, value));
}
