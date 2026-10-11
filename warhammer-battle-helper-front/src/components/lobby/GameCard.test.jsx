import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import GameCard from './GameCard';

// The system registry pulls in axios (ESM, which CRA's jest cannot parse); the card never calls it.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const baseGame = {
  id: 'g1', name: 'Krypta', gameSystem: 'custom', status: 'active',
  customSystemTemplate: { name: 'Tmpl' }, participants: [],
};

const renderCard = (props = {}) => render(
  <GameCard game={baseGame} isGM loading={false} syncing={false}
    onJoin={jest.fn()} onDelete={jest.fn()} onLeave={jest.fn()} onSync={jest.fn()}
    showTooltip={jest.fn()} hideTooltip={jest.fn()} {...props} />
);

describe('GameCard template update bar', () => {
  it('shows the bar to the GM when a newer template exists', () => {
    renderCard({ game: { ...baseGame, templateUpdateAvailable: true } });
    expect(screen.getByText('New template version')).toBeInTheDocument();
  });

  it('hides the bar without the flag', () => {
    renderCard();
    expect(screen.queryByText('New template version')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument();
  });

  it('hides the bar from a player even with the flag', () => {
    renderCard({ isGM: false, game: { ...baseGame, templateUpdateAvailable: true } });
    expect(screen.queryByText('New template version')).not.toBeInTheDocument();
  });

  it('passes the whole game to onSync', () => {
    const onSync = jest.fn();
    const game = { ...baseGame, templateUpdateAvailable: true };
    renderCard({ game, onSync });
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSync).toHaveBeenCalledWith(game);
  });

  it('disables the button while syncing', () => {
    renderCard({ syncing: true, game: { ...baseGame, templateUpdateAvailable: true } });
    expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
  });
});
