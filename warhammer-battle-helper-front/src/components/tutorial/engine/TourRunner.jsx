import React, { useCallback, useMemo } from 'react';
import { Joyride, ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { titleKeyFor } from './stepResolution';
import TourTooltip from './TourTooltip';
import { useSpotlightClip } from './spotlightClip';

// react-joyride 3.x keeps look and behaviour in `options` (2.x had separate
// `disableOverlayClose` / `disableScrolling` / `spotlightPadding` props and a
// `styles.options` branch). The names below are the 3.x equivalents, not typos.
const TOUR_OPTIONS = {
  zIndex: 20000,
  arrowColor: '#f4e8d8',
  overlayColor: 'rgba(15, 10, 5, 0.65)',
  spotlightPadding: 6,
  spotlightRadius: 6,
  skipBeacon: true,          // 2.x: disableBeacon on the step
  skipScroll: true,          // 2.x: disableScrolling
  overlayClickAction: false, // 2.x: disableOverlayClose
};

// Joyride's default tooltip distance (10) plus the spotlight padding, which Joyride stops adding
// once a step has a separate spotlightTarget.
const TOOLTIP_OFFSET = 10 + TOUR_OPTIONS.spotlightPadding;

// Golden outline of the cut-out in the overlay - 3.x draws this outline as a separate SVG path
// (`fill: none`), so we pass SVG attributes, not a CSS box-shadow.
const TOUR_STYLES = {
  spotlight: { stroke: '#c9975b', strokeWidth: 2 },
};

// TourRunner renders one running tour with react-joyride: the project's tooltip, the shared look,
// translated button labels and the three ways a tour ends (Skip/Done, Escape, a vanished anchor).
// What a step SAYS is the caller's: contentFor(step) returns the body, so the game can put its
// tab legend there and the creator plain text.
const TourRunner = ({ tourId, steps, stepIndex, running, goTo, finish, contentFor }) => {
  const { t, i18n } = useTranslation();
  const clipRef = useSpotlightClip(steps[stepIndex]?.resolvedTarget, running, TOUR_OPTIONS.spotlightPadding);

  const joyrideSteps = useMemo(
    () => steps.map(step => ({
      target: step.resolvedTarget,
      // The tooltip still points at the anchor; only the cut-out is clipped (see spotlightClip).
      spotlightTarget: () => clipRef.current,
      offset: TOOLTIP_OFFSET,
      placement: step.placement,
      title: t(titleKeyFor(step, tourId)),
      content: contentFor(step),
    })),
    // i18n.language: a language switch mid-tour must rebuild the texts; `t` alone does not
    // guarantee a recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, tourId, contentFor, t, i18n.language, clipRef]
  );

  // react-joyride builds the default aria-label/title of its buttons from its own hardcoded
  // English defaultLocale - without this prop "Skip" would keep a native tooltip/aria-label in
  // English. Fields without a matching key in tutorial.* get the closest existing key instead
  // of a new one.
  const locale = useMemo(() => ({
    back: t('tutorial.back'),
    close: t('tutorial.skip'),
    last: t('tutorial.done'),
    next: t('tutorial.next'),
    nextWithProgress: t('tutorial.next'),
    open: t('tutorial.button'),
    skip: t('tutorial.skip'),
    // i18n.language: eslint has no complaint without it, but this memo has the same reason as
    // joyrideSteps above - we keep it explicitly in the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t, i18n.language]);

  const handleEvent = useCallback((data) => {
    const { status, type, action, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finish();
      return;
    }
    // The anchor vanished mid-tour (e.g. after fetchGameState or a tab switch) - move on
    // instead of leaving the overlay hanging over an empty spot. In controlled mode the
    // library does not advance the step itself, so we must do it here. When it was the last
    // step, goTo pushes the hook past the end of the list, which itself calls finish() (see
    // useTour) - one of the three ways a tour ends.
    if (type === EVENTS.TARGET_NOT_FOUND) {
      goTo(index + 1);
      return;
    }
    if (type === EVENTS.STEP_AFTER) {
      // Escape produces STEP_AFTER with ACTIONS.CLOSE - it must end the tour the same way as
      // Skip (and save the "seen" flag), not advance.
      if (action === ACTIONS.CLOSE) {
        finish();
        return;
      }
      goTo(action === ACTIONS.PREV ? index - 1 : index + 1);
    }
  }, [finish, goTo]);

  if (!running || joyrideSteps.length === 0) return null;

  return (
    <Joyride
      run={running}
      stepIndex={stepIndex}
      steps={joyrideSteps}
      continuous
      locale={locale}
      options={TOUR_OPTIONS}
      styles={TOUR_STYLES}
      tooltipComponent={TourTooltip}
      onEvent={handleEvent}
    />
  );
};

export default TourRunner;
