import { useAccountBooleanSetting } from './useAccountBooleanSetting';

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
  const [saved, setEnabled, loaded] = useAccountBooleanSetting('diceAnimation');
  const enabled = saved ?? !prefersReducedMotion();
  return [enabled, setEnabled, loaded];
}
