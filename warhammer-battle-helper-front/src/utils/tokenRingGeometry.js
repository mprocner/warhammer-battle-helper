// Shared ring geometry for BOTH token overlays (character TokenOverlay + ImageTokenOverlay), so
// the slot ring scales the same way around a token of any size. At the base 50px token this
// reproduces the old fixed values (ringRadius 42, rest 17, equator 80).

export const RING_MARGIN = 17; // slots sit ~17px beyond the token edge (25 + 17 = 42 at 50px)
export const REST_FACTOR = 0.68; // sun-at-rest radius as a fraction of half the long side
export const EQUATOR_GAP = 38; // gear/kill toggle sit this far beyond the ring (42 + 38 = 80)

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
