export const SNAP_STEP = 45;
export const SNAP_THRESHOLD = 10;

/**
 * Magnetic rotation-angle snap.
 * If `angle` is within `threshold` of the nearest multiple of `step`,
 * returns that multiple; otherwise returns `angle` unchanged.
 */
export function snapAngle(angle, step = SNAP_STEP, threshold = SNAP_THRESHOLD) {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= threshold ? nearest : angle;
}
