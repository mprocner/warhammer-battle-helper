import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import useGameRoute from './useGameRoute';

// Renders the hook under a real router and prints where we are, so each test reads like a
// walk through the browser history.
const Harness = () => {
  const { gameId, openGame, leaveGame } = useGameRoute();
  const location = useLocation();
  return (
    <div>
      <span data-testid="where">{location.pathname + location.search}</span>
      <span data-testid="game">{gameId ?? 'none'}</span>
      <button onClick={() => openGame('g1')}>open</button>
      <button onClick={leaveGame}>leave</button>
      <button onClick={() => { leaveGame(); leaveGame(); }}>leave twice</button>
    </div>
  );
};

const renderAt = (entries, index) => render(
  <MemoryRouter initialEntries={entries} initialIndex={index}>
    <Routes><Route path="*" element={<Harness />} /></Routes>
  </MemoryRouter>
);

const where = () => screen.getByTestId('where').textContent;

describe('useGameRoute', () => {
  it('reads the game id from /games/:gameId', () => {
    renderAt(['/games/abc']);
    expect(screen.getByTestId('game').textContent).toBe('abc');
  });

  it('has no game id on the lobby', () => {
    renderAt(['/games?role=gm']);
    expect(screen.getByTestId('game').textContent).toBe('none');
  });

  // The lobby filter lives in the lobby's query string; going back has to restore it.
  it('returns to the lobby with its filter after entering from the lobby', () => {
    renderAt(['/games?role=gm&q=smok']);
    fireEvent.click(screen.getByText('open'));
    expect(where()).toBe('/games/g1');

    fireEvent.click(screen.getByText('leave'));
    expect(where()).toBe('/games?role=gm&q=smok');
  });

  // A bookmarked link or a pasted URL has no lobby behind it: leaving must not walk out of the app.
  it('replaces the game with the bare lobby when the game was opened directly', () => {
    renderAt(['/help', '/games/abc'], 1);
    fireEvent.click(screen.getByText('leave'));
    expect(where()).toBe('/games');
  });

  it('does not mark a game opened from outside the lobby as coming from it', () => {
    renderAt(['/help', '/login'], 1);
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByText('leave'));
    expect(where()).toBe('/games');
  });

  // GAME_DELETED and the 404 of the refetch it triggers can both end the session in one tick.
  it('steps back only once when the session ends twice at the same time', () => {
    renderAt(['/help', '/games?q=smok'], 1);
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByText('leave twice'));
    expect(where()).toBe('/games?q=smok');
  });
});
