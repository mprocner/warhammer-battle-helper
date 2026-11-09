import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import GameLobby from './GameLobby';

let mockGames = [];

jest.mock('../analytics/gtag', () => ({ trackEvent: jest.fn() }));
jest.mock('../hooks/useGames', () => ({
  useGames: () => ({
    games: mockGames, error: '', loading: false, syncingGameId: null,
    setError: jest.fn(), fetchGames: jest.fn(), createGame: jest.fn(),
    deleteGame: jest.fn(), leaveGame: jest.fn(), syncTemplate: jest.fn(),
  }),
}));
jest.mock('../hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [], fetchTemplates: jest.fn(), createTemplate: jest.fn(), deleteTemplate: jest.fn(),
    cloneTemplate: jest.fn(), leaveTemplate: jest.fn(), replaceTemplate: jest.fn(),
  }),
}));
// Dialogs are replaced by open-state markers: the test checks which surface the lobby opens,
// not the dialogs themselves (they have their own tests).
jest.mock('./lobby/CreateGameDialog', () => function MockCreateGameDialog({ open }) {
  return open ? require('react').createElement('div', null, 'create-game-dialog') : null;
});
jest.mock('./lobby/TemplateManagerDialog', () => function MockTemplateManagerDialog({ open }) {
  return open ? require('react').createElement('div', null, 'template-manager-dialog') : null;
});
jest.mock('./creator/TemplateBuilder', () => function MockTemplateBuilder() { return null; });

const game = { id: 'g1', name: 'Kampania', gameSystem: 'warhammer4e', status: 'active', participants: [] };

const mount = (games, url = '/games') => {
  mockGames = games;
  return render(<MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GameLobby onJoinGame={() => {}} token="t" userEmail="gm@x.pl" /></MemoryRouter>);
};

test('the header creator button opens the template manager', () => {
  mount([game]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('game.openCreator') }));
  expect(screen.getByText('template-manager-dialog')).toBeInTheDocument();
});

test('the empty lobby explains the invite path and offers both actions', () => {
  mount([]);
  expect(screen.getByText(i18n.t('game.emptyLobbyTitle'))).toBeInTheDocument();
  expect(screen.getByText(i18n.t('game.emptyLobbyDesc'))).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: i18n.t('game.emptyLobbyCreate') }));
  expect(screen.getByText('create-game-dialog')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: i18n.t('game.emptyLobbyDesign') }));
  expect(screen.getByText('template-manager-dialog')).toBeInTheDocument();
});

test('a lobby with games shows no empty state', () => {
  mount([game]);
  expect(screen.queryByText(i18n.t('game.emptyLobbyTitle'))).not.toBeInTheDocument();
});

describe('lobby filter wiring', () => {
  const mk = (id, name, gm) => ({ ...game, id, name, gameMasterEmail: gm });

  test('?role=player shows only the games the user plays in', () => {
    mount([mk('a', 'RunByMe', 'gm@x.pl'), mk('b', 'PlayedByMe', 'other@x.pl')], '/games?role=player');
    expect(screen.getByText('PlayedByMe')).toBeInTheDocument();
    expect(screen.queryByText('RunByMe')).not.toBeInTheDocument();
  });

  test('a filter that leaves nothing shows the no-results card, and clearing restores the cards', () => {
    const games = Array.from({ length: 9 }, (_, i) => mk(`g${i}`, `Campaign${i}`, 'gm@x.pl'));
    mount(games, '/games?q=zzzz');
    expect(screen.getByText(i18n.t('game.noMatchingGamesQuery', { query: 'zzzz' }))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('game.emptyLobbyTitle'))).not.toBeInTheDocument();
    expect(screen.queryByText('Campaign0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('game.clearFilters') }));
    games.forEach(g => expect(screen.getByText(g.name)).toBeInTheDocument());
    expect(screen.queryByText(i18n.t('game.clearFilters'))).not.toBeInTheDocument();
  });
});
