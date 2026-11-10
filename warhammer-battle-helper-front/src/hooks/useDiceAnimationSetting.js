import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings } from '../api/settings';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The account-wide "3D dice and their sound" switch. A saved choice wins; with none saved the
 * dice are on, unless the system asks for reduced motion.
 *
 * `loaded` stays false until the saved choice has arrived: a roll in that window must not
 * start the animation, or a user who turned it off would still download the 3D chunk.
 * @returns {[boolean, (on: boolean) => void, boolean]} [enabled, setEnabled, loaded]
 */
export function useDiceAnimationSetting() {
  const [saved, setSaved] = useState(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then(s => { if (alive && typeof s?.diceAnimation === 'boolean') setSaved(s.diceAnimation); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const setEnabled = useCallback((on) => {
    setSaved(on);
    updateSettings({ diceAnimation: on }).catch(() => {});
  }, []);

  const enabled = saved ?? !prefersReducedMotion();
  return [enabled, setEnabled, loaded];
}
