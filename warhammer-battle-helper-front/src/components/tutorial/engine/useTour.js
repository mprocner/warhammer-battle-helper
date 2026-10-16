import { useCallback, useEffect, useRef, useState } from 'react';
import { getTour } from '../tours';
import { resolveTarget, isRevealSatisfied } from './stepResolution';

const readSeen = (key) => {
  if (!key) return false;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false; // private window / blocked storage — show the tour, nothing breaks
  }
};

const writeSeen = (key) => {
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* a failed write only means the tour shows again next time */
  }
};

const noop = () => {};
const defaultQueryTarget = (selector) => document.querySelector(selector);

// useTour drives one tour: which steps are live (role match + anchor on screen), the current
// step, auto-start and the "seen" flag. It knows nothing about the game or the creator — those
// pass a storageKey (or null for a tour that is never remembered) and decide when auto-start is
// allowed (the game waits for a role).
export function useTour({
  tourId,
  role = null,
  panels = {},
  onReveal = noop,
  queryTarget = defaultQueryTarget,
  screenReady = true,
  autoStart = true,
  storageKey = null,
  onFinish,
}) {
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(null);
  const [pending, setPending] = useState(null);
  const autoStarted = useRef(new Set());

  // onFinish is the only place where the engine tells the outside world the tour ended —
  // called whichever way it got there (Skip/Done, Escape, or TARGET_NOT_FOUND pushing goTo
  // past the end of the step list — see TourRunner.jsx). One mechanism instead of three
  // separate calls at every place that ends a tour.
  const finish = useCallback(() => {
    setStepIndex(null);
    setPending(null);
    writeSeen(storageKey);
    if (onFinish) onFinish();
  }, [storageKey, onFinish]);

  // goTo takes the list explicitly because start() calls it before setSteps has committed.
  const goToIn = useCallback((index, list) => {
    if (index < 0) return;
    if (index >= list.length) {
      finish();
      return;
    }
    onReveal(list[index]);
    setPending(index);
  }, [finish, onReveal]);

  // Returns whether it actually started — the automatic call latches only on success, so one
  // failed start (no live anchor) cannot block the tour for good (see the auto-start effect below).
  const start = useCallback(() => {
    if (!tourId) return false;
    const tour = getTour(tourId);
    if (!tour) return false;

    // A step joins the list only when its role matches and one of its anchors actually exists —
    // we remember which one, because the text variant depends on it.
    const live = [];
    tour.steps.forEach(step => {
      if (step.roles && !step.roles.includes(role)) return;
      const hit = resolveTarget(step, queryTarget);
      if (!hit) return;
      live.push({ ...step, resolvedTarget: hit.selector, targetIndex: hit.index });
    });

    if (live.length === 0) return false;
    setSteps(live);
    goToIn(0, live);
    return true;
  }, [tourId, role, queryTarget, goToIn]);

  const goTo = useCallback((index) => goToIn(index, steps), [goToIn, steps]);

  // A step becomes current only once the panel holding its anchor is really revealed.
  // The condition rests on panel state, not on a timer — nothing to race against.
  useEffect(() => {
    if (pending === null) return;
    const step = steps[pending];
    if (!step || !isRevealSatisfied(step, panels)) return;
    setStepIndex(pending);
    setPending(null);
  }, [pending, steps, panels]);

  // Auto-start waits for the screen-ready signal: before it, anchors that render late (the game's
  // DndContext placeholder) would be missing from the snapshot. The latch is per storageKey (or
  // tourId), so a component that switches between tours — the creator's two tabs — auto-starts
  // each one once. Manual start() ignores both the latch and screenReady.
  useEffect(() => {
    const latch = storageKey || tourId;
    if (!autoStart || !screenReady || !latch || autoStarted.current.has(latch)) return;
    if (readSeen(storageKey)) {
      autoStarted.current.add(latch);
      return;
    }
    if (start()) autoStarted.current.add(latch);
  }, [autoStart, screenReady, storageKey, tourId, start]);

  return {
    steps,
    stepIndex,
    running: stepIndex !== null,
    start,
    goTo,
    finish,
  };
}
