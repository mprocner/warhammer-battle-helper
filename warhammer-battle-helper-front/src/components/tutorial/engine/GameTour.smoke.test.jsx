import React, { useState, useCallback } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import GameTour from './GameTour';
import i18n from '../../../i18n';

// Sprawdzamy tylko, że integracja z react-joyride staje na nogi w jsdom:
// komponent montuje bibliotekę, pierwszy krok trafia do własnego dymka.
const PANELS = { leftHidden: false, rightHidden: false, topCollapsed: false };

const mountAnchors = () => {
  document.body.innerHTML = `
    <div class="sidebar-top-section" style="width:100px;height:100px"></div>
    <div class="sidebar-bottom-section" style="width:100px;height:100px"></div>
  `;
};

beforeEach(() => {
  localStorage.clear();
  mountAnchors();
});

afterEach(() => {
  document.body.innerHTML = '';
});

test('starts by itself and renders the first step in the custom tooltip', async () => {
  await act(async () => {
    render(
      <GameTour
        role="player"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={0}
      />
    );
  });

  expect(await screen.findByText('Selected character')).toBeInTheDocument();
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
});

test('Next advances the controlled step index', async () => {
  await act(async () => {
    render(
      <GameTour
        role="player"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={0}
      />
    );
  });
  await screen.findByText('1 / 2');

  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });

  expect(await screen.findByText('2 / 2')).toBeInTheDocument();
});

test('renders nothing when no anchor is on the page', async () => {
  document.body.innerHTML = '';
  await act(async () => {
    render(
      <GameTour
        role="player"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={0}
      />
    );
  });
  // react-joyride teleportuje swój element do document.body (portal), więc
  // `container` z RTL jest pusty niezależnie od tego, czy tour wystartował —
  // sprawdzamy realny efekt uboczny, nie pusty kontener.
  expect(document.querySelector('.tour-tooltip')).toBeNull();
});

// "Done" na ostatnim kroku to inna gałąź niż Skip: react-joyride sam nadaje
// jej status FINISHED (patrz komentarz przy STATUS.FINISHED w GameTour.jsx),
// zamiast STATUS.SKIPPED. Obie muszą jednak kończyć tour tak samo.
test('Done on the last step finishes the tour and persists the seen flag', async () => {
  await act(async () => {
    render(
      <GameTour
        role="player"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={0}
      />
    );
  });
  await screen.findByText('1 / 2');

  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });
  await screen.findByText('2 / 2');

  await act(async () => {
    fireEvent.click(screen.getByText('Got it'));
  });

  expect(localStorage.getItem('tutorialSeen:player')).not.toBeNull();
  expect(document.querySelector('.tour-tooltip')).toBeNull();
});

test('Skip ends the tour and persists the seen flag', async () => {
  await act(async () => {
    render(
      <GameTour
        role="player"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={0}
      />
    );
  });
  await screen.findByText('1 / 2');

  await act(async () => {
    fireEvent.click(screen.getByText('Skip'));
  });

  expect(localStorage.getItem('tutorialSeen:player')).not.toBeNull();
  expect(document.querySelector('.tour-tooltip')).toBeNull();
});

test('Escape ends the tour like Skip, instead of advancing to the next step', async () => {
  await act(async () => {
    render(
      <GameTour
        role="player"
        controlScheme="modern"
        panels={PANELS}
        onReveal={() => {}}
        startSignal={0}
      />
    );
  });
  await screen.findByText('1 / 2');

  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
  });

  // Gdyby Escape wciąż działał jak Next, zobaczylibyśmy "2 / 2" zamiast
  // zniknięcia touru i zapisanej flagi "seen".
  expect(localStorage.getItem('tutorialSeen:player')).not.toBeNull();
  expect(document.querySelector('.tour-tooltip')).toBeNull();
});

test('button title/aria-label follow the UI language instead of react-joyride english defaults', async () => {
  await i18n.changeLanguage('pl');
  try {
    await act(async () => {
      render(
        <GameTour
          role="player"
          controlScheme="modern"
          panels={PANELS}
          onReveal={() => {}}
          startSignal={0}
        />
      );
    });
    await screen.findByText('1 / 2');

    const skipButton = screen.getByText('Pomiń').closest('button');
    const nextButton = screen.getByText('Dalej').closest('button');

    expect(skipButton).toHaveAttribute('title', 'Pomiń');
    expect(skipButton).toHaveAttribute('aria-label', 'Pomiń');
    expect(nextButton).toHaveAttribute('title', 'Dalej');
    expect(nextButton).toHaveAttribute('aria-label', 'Dalej');

    ['Skip', 'Back', 'Next', 'Last', 'Close'].forEach(englishLabel => {
      expect(skipButton).not.toHaveAttribute('title', englishLabel);
      expect(skipButton).not.toHaveAttribute('aria-label', englishLabel);
      expect(nextButton).not.toHaveAttribute('title', englishLabel);
      expect(nextButton).not.toHaveAttribute('aria-label', englishLabel);
    });
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  }
});

// Reprodukuje jedyny mechanizm, na którym stoi cały samouczek: stepIndex
// celowo zostaje w tyle za wewnętrznym indeksem biblioteki, dopóki panel z
// kotwicą kolejnego kroku faktycznie się nie otworzy — dopiero wtedy
// GameTour przekazuje nowy stepIndex do Joyride. Wcześniejsze smoke testy
// startują z każdym panelem już otwartym, więc ta brama nigdy nie była
// napięta; onReveal był tam jałowym jest.fn(). Tu onReveal naprawdę zmienia
// stan rodzica, jak w GameSession (revealForTour).
const GatedTourHarness = ({ startSignal }) => {
  const [panels, setPanels] = useState({ leftHidden: false, rightHidden: true, topCollapsed: false });

  const revealForTour = useCallback((step) => {
    if (step.reveal === 'left') setPanels(p => ({ ...p, leftHidden: false }));
    if (step.reveal === 'right') setPanels(p => ({ ...p, rightHidden: false }));
    if (step.reveal === 'top') setPanels(p => ({ ...p, topCollapsed: false }));
  }, []);

  return (
    <GameTour
      role="player"
      controlScheme="modern"
      panels={panels}
      onReveal={revealForTour}
      startSignal={startSignal}
    />
  );
};

test('a gated step is only shown once the panel its anchor lives in actually opens', async () => {
  // Kotwica prawego panelu (tabsNav, reveal: 'right') zaczyna zwinięta —
  // tylko ten krok i characterCard (bez bramy blokującej na starcie, bo
  // leftHidden: false) mają w ogóle żywe kotwice na ekranie.
  document.body.innerHTML = `
    <div class="sidebar-top-section" style="width:100px;height:100px"></div>
    <div class="right-panel__tabs-nav" style="width:100px;height:100px"></div>
  `;

  await act(async () => {
    render(<GatedTourHarness startSignal={0} />);
  });

  // Krok 1: characterCard, bez wymogu odsłonięcia — startuje od razu.
  expect(await screen.findByText('Selected character')).toBeInTheDocument();
  expect(screen.getByText('1 / 2')).toBeInTheDocument();

  // Next celuje w tabsNav (reveal: 'right'). Ten krok żąda otwarcia prawego
  // panelu przez onReveal — dopiero gdy panels.rightHidden faktycznie
  // spadnie na false, useGameTour zwalnia zatrzymany stepIndex i biblioteka
  // dostaje nowy krok do wyrenderowania.
  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
  });

  expect(await screen.findByText('Right panel tabs')).toBeInTheDocument();
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
});
