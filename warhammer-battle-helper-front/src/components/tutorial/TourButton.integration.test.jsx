import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '../../i18n';
import GameTour from './engine/GameTour';
import TourButton from './TourButton';
import { TutorialProvider } from './TutorialContext';

// Dowodzi, że TourButton (kontekst) i przycisk "?" przy panelu (startSignal
// prop) faktycznie sterują tym samym GameTour, oraz że po zakończeniu tour'u
// zakładki przycisk "?" wraca do samouczka ekranu gry, a nie odtwarza
// ostatnią zakładkę (patrz FEATURE-134 review: activeTourId nigdy nie był
// czyszczony — GameTour.jsx wywołuje teraz clearTour() na FINISHED/SKIPPED).
//
// Drugi tour wstrzykujemy przez rejestr tym samym mechanizmem co
// engine/useGameTour.test.js (jest.mock('../tours') + requireActual dla
// nieprzykrytych id) — żaden prawdziwy tour zakładki jeszcze nie istnieje.
const FIXTURE_TOUR_ID = 'fixtureTab';
const FIXTURE_TOUR = {
  id: FIXTURE_TOUR_ID,
  steps: [
    { id: 'fixtureStepOne', target: '.fixture-anchor-one', roles: ['gm', 'player'], placement: 'bottom' },
    { id: 'fixtureStepTwo', target: '.fixture-anchor-two', roles: ['gm', 'player'], placement: 'bottom' },
  ],
};
// Klucze tłumaczeń dla tego touru celowo nie istnieją — i18next bez
// dopasowania zwraca sam klucz, co daje tekst odróżnialny od prawdziwych
// treści 'gameScreen' bez dokładania nowych wpisów do locales/*.
const FIXTURE_TITLE_ONE = `tutorial.${FIXTURE_TOUR_ID}.fixtureStepOne.title`;

jest.mock('./tours', () => {
  const actual = jest.requireActual('./tours');
  return {
    ...actual,
    getTour: (id) => (id === FIXTURE_TOUR_ID ? FIXTURE_TOUR : actual.getTour(id)),
  };
});

const PANELS = { leftHidden: false, rightHidden: false, topCollapsed: false };

const mountAnchors = () => {
  document.body.innerHTML = `
    <div class="sidebar-top-section" style="width:100px;height:100px"></div>
    <div class="fixture-anchor-one" style="width:100px;height:100px"></div>
    <div class="fixture-anchor-two" style="width:100px;height:100px"></div>
  `;
};

// Harness łączy oba wejścia startu: TourButton (przez kontekst) i przycisk
// "?" prawego panelu (przez startSignal prop), tak jak robi to GameSession.
const Harness = () => {
  const [startSignal, setStartSignal] = useState(0);
  return (
    <TutorialProvider>
      <button type="button" onClick={() => setStartSignal(n => n + 1)}>
        right-panel-question-mark
      </button>
      <TourButton tourId={FIXTURE_TOUR_ID} />
      <GameTour
        role="gm"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={startSignal}
        screenReady
      />
    </TutorialProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  mountAnchors();
});

afterEach(() => {
  document.body.innerHTML = '';
});

test('clicking a TourButton switches GameTour away from the game-screen tour', async () => {
  await act(async () => {
    render(<Harness />);
  });
  // Auto-start ma tylko jedną żywą kotwicę (.sidebar-top-section) — tour ekranu
  // gry startuje sam, tak jak w GameTour.smoke.test.jsx.
  expect(await screen.findByText('Selected character')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show the tutorial' }));
  });

  expect(await screen.findByText(FIXTURE_TITLE_ONE)).toBeInTheDocument();
  expect(screen.queryByText('Selected character')).toBeNull();
});

test('clicking the same tab button twice restarts its tour instead of doing nothing', async () => {
  await act(async () => {
    render(<Harness />);
  });
  await screen.findByText('Selected character');

  const tourButton = screen.getByRole('button', { name: 'Show the tutorial' });

  await act(async () => {
    fireEvent.click(tourButton);
  });
  await screen.findByText(FIXTURE_TITLE_ONE);
  expect(screen.getByText('1 / 2')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });
  expect(await screen.findByText('2 / 2')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(tourButton);
  });

  // Restart, nie no-op: z powrotem na pierwszym kroku, nie utknięte na drugim.
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  expect(screen.queryByText('2 / 2')).toBeNull();
});

test('after the tab tour ends, the right-panel "?" button starts the game-screen tour again, not the stale tab tour', async () => {
  await act(async () => {
    render(<Harness />);
  });
  await screen.findByText('Selected character');

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show the tutorial' }));
  });
  await screen.findByText(FIXTURE_TITLE_ONE);

  await act(async () => {
    fireEvent.click(screen.getByText('Skip'));
  });
  expect(screen.queryByText(FIXTURE_TITLE_ONE)).toBeNull();

  await act(async () => {
    fireEvent.click(screen.getByText('right-panel-question-mark'));
  });

  // Sygnał "?" musi wznowić domyślny tour ekranu gry, nie ostatnio uruchomiony
  // tour zakładki (regresja na brak clearTour() — patrz Fix 1 w GameTour.jsx).
  expect(await screen.findByText('Selected character')).toBeInTheDocument();
  expect(screen.queryByText(FIXTURE_TITLE_ONE)).toBeNull();
});

test('after the tab tour ends via Escape, the right-panel "?" button starts the game-screen tour again, not the stale tab tour', async () => {
  await act(async () => {
    render(<Harness />);
  });
  await screen.findByText('Selected character');

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show the tutorial' }));
  });
  await screen.findByText(FIXTURE_TITLE_ONE);

  // handleEvent kończy tour przez STEP_AFTER/ACTIONS.CLOSE — druga, osobna
  // gałąź od Skip (STATUS.SKIPPED) — patrz GameTour.smoke.test.jsx dla tej
  // samej techniki wywołania Escape.
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
  });
  expect(screen.queryByText(FIXTURE_TITLE_ONE)).toBeNull();

  await act(async () => {
    fireEvent.click(screen.getByText('right-panel-question-mark'));
  });

  // Ta sama regresja co wyżej, tylko dotarta drugą drogą: Escape ma swoją
  // własną gałąź w handleEvent (ACTIONS.CLOSE), niezależną od Skip.
  expect(await screen.findByText('Selected character')).toBeInTheDocument();
  expect(screen.queryByText(FIXTURE_TITLE_ONE)).toBeNull();
});

test('after a tab tour ends by switching tabs (TARGET_NOT_FOUND runs it off its own end), the right-panel "?" button starts the game-screen tour again, not the stale tab tour', async () => {
  await act(async () => {
    render(<Harness />);
  });
  await screen.findByText('Selected character');

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show the tutorial' }));
  });
  await screen.findByText(FIXTURE_TITLE_ONE);

  // Kotwica drugiego kroku znika — tak jak przy przełączeniu zakładki w
  // trakcie touru. react-joyride nie znajdzie celu następnego kroku.
  document.querySelector('.fixture-anchor-two').remove();

  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });

  // react-joyride odpytuje DOM do targetWaitTimeout (domyślnie 1000ms w tej
  // wersji biblioteki), zanim podda się i wyemituje TARGET_NOT_FOUND — czekamy
  // realnie dłużej niż ten limit, zamiast zgadywać krótszy czas.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 1300));
  });
  expect(screen.queryByText(FIXTURE_TITLE_ONE)).toBeNull();

  await act(async () => {
    fireEvent.click(screen.getByText('right-panel-question-mark'));
  });

  // GameTour.jsx łapie STATUS.FINISHED/SKIPPED i Escape (ACTIONS.CLOSE), ale
  // TARGET_NOT_FOUND → goTo(index + 1) → koniec listy kroków kończy tour
  // wewnątrz useGameTour (finish()), które o kontekście nic nie wie — to
  // trzecia, pominięta ścieżka wyjścia (patrz Fix 1).
  expect(await screen.findByText('Selected character')).toBeInTheDocument();
  expect(screen.queryByText(FIXTURE_TITLE_ONE)).toBeNull();
}, 10000);
