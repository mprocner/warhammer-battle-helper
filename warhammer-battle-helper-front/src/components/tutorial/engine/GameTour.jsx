import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTour } from './useTour';
import { bodyKeysFor } from './stepResolution';
import TourRunner from './TourRunner';
import TabsLegend from '../tours/TabsLegend';
import { useTutorial } from '../TutorialContext';

// The game's seen flag is per role: the GM and player tours differ.
export const seenKey = (role) => `tutorialSeen:${role}`;

const GameTour = ({ role, controlScheme, panels, onReveal, startSignal, screenReady }) => {
  const { t } = useTranslation();
  // startCount defaults to 0: when GameTour renders outside TutorialProvider
  // (see GameTour.smoke.test.jsx), the context falls back to its default value,
  // which carries no startCount - without this combinedSignal below would be NaN.
  const { activeTourId, startCount = 0, clearTour } = useTutorial();
  // The game-screen tutorial is the default - until someone clicks a tab button,
  // tourId is 'gameScreen', with auto-start and a saved "seen" flag.
  // Tab tutorials do neither.
  const tourId = activeTourId || 'gameScreen';
  const isDefaultTour = tourId === 'gameScreen';
  // onFinish: clearTour - without it activeTourId stays pinned to the last tab tutorial for the
  // whole life of the provider, so tourId = activeTourId || 'gameScreen' never falls back to the
  // default again, and the "?" button replays a stale tab tour instead of the game-screen
  // tutorial. A tour ends THREE ways (Skip/Done -> STATUS.FINISHED/SKIPPED, Escape ->
  // ACTIONS.CLOSE, and TARGET_NOT_FOUND -> goTo(index + 1) pushing the hook past the end of the
  // step list - see handleEvent in TourRunner) - all three now go through finish() in the hook,
  // so one hook-up here replaces three separate clearTour() calls in handleEvent.
  const { steps, stepIndex, running, start, goTo, finish } = useTour({
    tourId, role, panels, onReveal, screenReady,
    autoStart: isDefaultTour && !!role,
    storageKey: isDefaultTour && role ? seenKey(role) : null,
    onFinish: clearTour,
  });
  // Two start sources - the "?" button in the right panel header (startSignal) and a tab
  // button via context (startCount) - merge into one signal, so both start paths go through
  // the same "did it change" comparison.
  const combinedSignal = startSignal + startCount;
  const lastSignal = useRef(combinedSignal);

  // We react only to a signal change, not to the first render.
  useEffect(() => {
    if (combinedSignal === lastSignal.current) return;
    lastSignal.current = combinedSignal;
    start();
  }, [combinedSignal, start]);

  const contentFor = useCallback(
    (step) => (step.id === 'tabsNav'
      ? <TabsLegend isGM={role === 'gm'} />
      : <p>{t(bodyKeysFor(step, tourId, { targetIndex: step.targetIndex, role, controlScheme }))}</p>),
    [tourId, role, controlScheme, t]
  );

  return (
    <TourRunner
      tourId={tourId}
      steps={steps}
      stepIndex={stepIndex}
      running={running}
      goTo={goTo}
      finish={finish}
      contentFor={contentFor}
    />
  );
};

export default GameTour;
