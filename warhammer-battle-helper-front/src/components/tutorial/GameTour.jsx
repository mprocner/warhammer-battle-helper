import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Joyride, ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useGameTour } from './useGameTour';
import { titleKeyFor, bodyKeyFor } from './tourSteps';
import TourTooltip from './TourTooltip';
import TabsLegend from './TabsLegend';

// react-joyride 3.x trzyma wygląd i zachowanie w `options` (w 2.x były to osobne
// propsy `disableOverlayClose` / `disableScrolling` / `spotlightPadding` i gałąź
// `styles.options`). Nazwy poniżej to odpowiedniki 3.x, nie literówki.
const TOUR_OPTIONS = {
  zIndex: 20000,
  arrowColor: '#f4e8d8',
  overlayColor: 'rgba(15, 10, 5, 0.65)',
  spotlightPadding: 6,
  spotlightRadius: 6,
  skipBeacon: true,          // 2.x: disableBeacon na kroku
  skipScroll: true,          // 2.x: disableScrolling
  overlayClickAction: false, // 2.x: disableOverlayClose
};

// Złota obwódka wycięcia w kurtynie — 3.x rysuje ten kontur osobną ścieżką SVG
// (`fill: none`), więc podajemy atrybuty SVG, nie CSS-owy box-shadow.
const TOUR_STYLES = {
  spotlight: { stroke: '#c9975b', strokeWidth: 2 },
};

const GameTour = ({ role, controlScheme, panels, onReveal, startSignal, screenReady }) => {
  const { t, i18n } = useTranslation();
  const { steps, stepIndex, running, start, goTo, finish } = useGameTour({ role, panels, onReveal, screenReady });
  const lastSignal = useRef(startSignal);

  // Przycisk "?" podbija licznik — reagujemy tylko na zmianę, nie na pierwszy render.
  useEffect(() => {
    if (startSignal === lastSignal.current) return;
    lastSignal.current = startSignal;
    start();
  }, [startSignal, start]);

  const joyrideSteps = useMemo(
    () => steps.map(step => ({
      target: step.target,
      placement: step.placement,
      title: t(titleKeyFor(step)),
      content: step.id === 'tabsNav'
        ? <TabsLegend isGM={role === 'gm'} />
        : <p>{t(bodyKeyFor(step, { controlScheme, role }))}</p>,
    })),
    // i18n.language w zależnościach: zmiana języka w trakcie przebudowuje teksty.
    [steps, role, controlScheme, t, i18n.language]
  );

  // react-joyride buduje domyślne aria-label/title przycisków z własnego
  // defaultLocale (angielski, na sztywno) — bez tego propa "Pomiń" miałby
  // native tooltip/aria-label "Skip". Pola bez odpowiadającego klucza w
  // tutorial.* dostają najbliższy pasujący istniejący klucz zamiast nowego.
  const locale = useMemo(() => ({
    back: t('tutorial.back'),
    close: t('tutorial.skip'),
    last: t('tutorial.done'),
    next: t('tutorial.next'),
    nextWithProgress: t('tutorial.next'),
    open: t('tutorial.button'),
    skip: t('tutorial.skip'),
  }), [t, i18n.language]);

  const handleEvent = useCallback((data) => {
    const { status, type, action, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finish();
      return;
    }
    // Kotwica zniknęła w trakcie (np. po fetchGameState) — idziemy dalej,
    // zamiast zostawiać overlay wiszący na pustym miejscu. W trybie sterowanym
    // biblioteka sama nie przewinie kroku, więc musimy zrobić to tutaj.
    if (type === EVENTS.TARGET_NOT_FOUND) {
      goTo(index + 1);
      return;
    }
    if (type === EVENTS.STEP_AFTER) {
      // Escape produkuje STEP_AFTER z ACTIONS.CLOSE — ma kończyć tour tak samo
      // jak Skip (i zapisać flagę "seen"), nie przesuwać do przodu.
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

export default GameTour;
