import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Joyride, ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useGameTour } from './useGameTour';
import { titleKeyFor, bodyKeyFor } from './stepResolution';
import TourTooltip from './TourTooltip';
import TabsLegend from '../tours/TabsLegend';
import { useTutorial } from '../TutorialContext';

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
  // startCount domyślnie 0: gdy GameTour renderuje się poza TutorialProvider
  // (patrz GameTour.smoke.test.jsx), kontekst wraca do wartości domyślnej,
  // która nie niesie startCount — bez tego combinedSignal niżej byłby NaN.
  const { activeTourId, startCount = 0, clearTour } = useTutorial();
  // Samouczek ekranu gry jest domyślny — dopóki nikt nie kliknął przycisku
  // zakładki, tourId to 'gameScreen', z auto-startem i zapisem "seen".
  // Samouczki zakładek nie robią ani jednego, ani drugiego.
  const tourId = activeTourId || 'gameScreen';
  const isDefaultTour = tourId === 'gameScreen';
  // onFinish: clearTour — bez tego activeTourId zostaje przypięty do ostatniego
  // samouczka zakładki na całe życie providera, więc tourId = activeTourId ||
  // 'gameScreen' przestaje kiedykolwiek spadać do domyślnego, a przycisk "?"
  // odtwarza już nieaktualny tour zakładki zamiast samouczka ekranu gry. Tour
  // kończy się TRZEMA drogami (Skip/Done → STATUS.FINISHED/SKIPPED, Escape →
  // ACTIONS.CLOSE, i TARGET_NOT_FOUND → goTo(index + 1) spychające hook poza
  // koniec listy kroków — patrz handleEvent niżej) — wszystkie trzy przechodzą
  // teraz przez finish() w hooku, więc jedno wpięcie tutaj wystarcza za trzy
  // osobne wywołania clearTour() w handleEvent.
  const { steps, stepIndex, running, start, goTo, finish } = useGameTour({
    tourId, role, panels, onReveal, screenReady, autoStart: isDefaultTour, persist: isDefaultTour, onFinish: clearTour,
  });
  // Dwa źródła startu — przycisk "?" przy nagłówku prawego panelu (startSignal)
  // i przycisk zakładki przez kontekst (startCount) — schodzą się w jeden sygnał,
  // żeby obie ścieżki startu przechodziły przez to samo porównanie "czy się zmieniło".
  const combinedSignal = startSignal + startCount;
  const lastSignal = useRef(combinedSignal);

  // Reagujemy tylko na zmianę sygnału, nie na pierwszy render.
  useEffect(() => {
    if (combinedSignal === lastSignal.current) return;
    lastSignal.current = combinedSignal;
    start();
  }, [combinedSignal, start]);

  const joyrideSteps = useMemo(
    () => steps.map(step => ({
      target: step.resolvedTarget,
      placement: step.placement,
      title: t(titleKeyFor(step, tourId)),
      content: step.id === 'tabsNav'
        ? <TabsLegend isGM={role === 'gm'} />
        : <p>{t(bodyKeyFor(step, tourId, { targetIndex: step.targetIndex, role, controlScheme }))}</p>,
    })),
    // i18n.language w zależnościach: zmiana języka w trakcie przebudowuje teksty.
    // eslint nie widzi i18n.language użytego w treści memo (tylko `t` jest wywoływane
    // bezpośrednio) i zgłasza ją jako zbędną — zostaje naumyślnie, bez niej `t`
    // nie gwarantuje ponownego przeliczenia po zmianie języka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, tourId, role, controlScheme, t, i18n.language]
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
    // i18n.language: bez niego eslint nie ma zastrzeżeń, ale ten memo ma ten
    // sam powód co joyrideSteps powyżej — trzymamy ją jawnie w zależnościach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t, i18n.language]);

  const handleEvent = useCallback((data) => {
    const { status, type, action, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finish();
      return;
    }
    // Kotwica zniknęła w trakcie (np. po fetchGameState albo przełączeniu
    // zakładki) — idziemy dalej, zamiast zostawiać overlay wiszący na pustym
    // miejscu. W trybie sterowanym biblioteka sama nie przewinie kroku, więc
    // musimy zrobić to tutaj. Gdy to był ostatni krok, goTo spycha hook poza
    // koniec listy, co samo w sobie wywołuje finish() (patrz useGameTour) —
    // jedna z trzech dróg zakończenia touru, więc też czyści activeTourId.
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
