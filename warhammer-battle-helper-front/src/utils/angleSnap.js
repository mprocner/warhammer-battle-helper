export const SNAP_STEP = 45;
export const SNAP_THRESHOLD = 10;

/**
 * Magnetyczny snap kąta obrotu.
 * Jeśli `angle` jest w granicach `threshold` od najbliższej wielokrotności
 * `step`, zwraca tę wielokrotność; w przeciwnym razie zwraca `angle` bez zmian.
 */
export function snapAngle(angle, step = SNAP_STEP, threshold = SNAP_THRESHOLD) {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= threshold ? nearest : angle;
}
