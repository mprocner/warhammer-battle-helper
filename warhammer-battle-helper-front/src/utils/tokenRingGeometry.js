// Shared ring geometry for BOTH token overlays (character TokenOverlay + ImageTokenOverlay), so
// the slot ring scales the same way around a token of any size. At the base 50px token this
// reproduces the old fixed values (ringRadius 42, rest 17, equator 80).

export const RING_MARGIN = 17; // slots sit ~17px beyond the token edge (25 + 17 = 42 at 50px)
export const REST_FACTOR = 0.68; // sun-at-rest radius as a fraction of half the long side
// Equator toggles (kill / eye / gear) sit this far beyond the ring. 52 rather than a tighter
// value because an ACTIVE equator slot pushes ACTIVE_PUSH outward and is ACTIVE_HALF_WIDTH wide,
// so its outer edge reaches ringRadius + 37 — the toggles must start beyond that.
export const EQUATOR_GAP = 52;

// An active (hovered / tapped / focused) number slot grows to fit a docked stepper and pushes
// outward along its own ring angle. Pushing raises the vertical distance to the 45-degree
// neighbour above the summed half-heights, which makes the chip's width irrelevant — boxes
// collide only when they overlap on both axes.
export const ACTIVE_PUSH = 16;        // radial offset of the active chip
export const ACTIVE_HALF_HEIGHT = 14; // half of the 28px active chip
export const ACTIVE_HALF_WIDTH = 21;  // half of the widest active chip (22 input + 6 chrome + 14 stepper)
// HP stacks sit this far beyond the ring, i.e. clear of an active top slot with 4px to spare.
export const HP_CLEAR = ACTIVE_PUSH + ACTIVE_HALF_HEIGHT + 4;

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
