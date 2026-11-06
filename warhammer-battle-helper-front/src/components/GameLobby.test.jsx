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

const mount = (games) => {
  mockGames = games;
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GameLobby onJoinGame={() => {}} token="t" userEmail="gm@x.pl" /></MemoryRouter>);
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
