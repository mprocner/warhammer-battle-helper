// Shared ring geometry for BOTH token overlays (character TokenOverlay + ImageTokenOverlay), so
// the slot ring scales the same way around a token of any size. At the base 50px token this
// reproduces the old fixed values (ringRadius 42, rest 17, equator 80).

export const RING_MARGIN = 17; // slots sit ~17px beyond the token edge (25 + 17 = 42 at 50px)
export const REST_FACTOR = 0.68; // sun-at-rest radius as a fraction of half the long side

// An active (hovered / tapped / focused) number slot grows to fit a docked stepper and pushes
// outward along its own ring angle. Pushing raises the vertical distance to the 45-degree
// neighbour above the summed half-heights, which makes the chip's width irrelevant — boxes
// collide only when they overlap on both axes.
export const ACTIVE_PUSH = 16; // radial offset of the active chip
export const ACTIVE_HALF_HEIGHT = 14; // half of the 28px active chip
// Widest active chip: 22 input + 2 left padding + 14 right padding (the stepper column, which
// REPLACES the 2px right padding) + 2 borders = 40, so half is 20. Kept at 21 as 1px of slack,
// since the equator clearance below is derived from it.
export const ACTIVE_HALF_WIDTH = 21;

// Equator toggles (kill / eye / gear) sit this far beyond the ring: past the outer edge of an
// active equator slot (ACTIVE_PUSH + ACTIVE_HALF_WIDTH), plus half a 22px toggle, plus 4px margin.
// Derived rather than a literal 52 so that raising ACTIVE_PUSH moves the toggles with it.
export const EQUATOR_GAP = ACTIVE_PUSH + ACTIVE_HALF_WIDTH + 11 + 4;

// HP stacks sit this far beyond the ring. Two values, because a chip can only become active while
// the token is selected: HP_CLEAR clears an active, pushed-out 28px chip, REST_HP_CLEAR only has
// to clear a resting 17px one. Using the active value at rest would strand the bars ~18px away
// from a small token for no reason.
export const HP_CLEAR = ACTIVE_PUSH + ACTIVE_HALF_HEIGHT + 4;
export const REST_HP_CLEAR = 16;

// Slot position at angle -90° + i·45° (0 = top, clockwise).
export function slotOffset(i, radius) {
  const a = (-90 + i * 45) * (Math.PI / 180);
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

// Ring metrics derived from the token's pixel size (its longer side).
export function tokenRingGeometry(width, height, selected) {
  const halfLong = Math.max(Number(width) || 50, Number(height) || 50) / 2;
  const ringRadius = halfLong + RING_MARGIN;
  const radius = selected ? ringRadius : halfLong * REST_FACTOR;
  const equatorX = ringRadius + EQUATOR_GAP;
  return { halfLong, ringRadius, radius, equatorX };
}
