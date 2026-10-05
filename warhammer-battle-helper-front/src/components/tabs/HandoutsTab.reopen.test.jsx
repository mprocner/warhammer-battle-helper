import React from 'react';
import { render, act } from '@testing-library/react';
import '../../i18n';
import HandoutsTab from './HandoutsTab';
import { WindowManagerProvider } from '../../contexts/WindowManagerContext';
import { getHandouts } from '../../api/handouts';

jest.mock('../../api/axios', () => ({ getApiUrl: () => 'http://api.test' }));

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../../api/handouts', () => ({
  getHandouts: jest.fn(),
  createHandout: jest.fn(),
  updateHandout: jest.fn(),
  deleteHandout: jest.fn(),
  reorderHandouts: jest.fn(),
  createHandoutFolder: jest.fn(),
  renameHandoutFolder: jest.fn(),
  deleteHandoutFolder: jest.fn(),
  moveHandout: jest.fn(),
  reorderHandoutFolders: jest.fn(),
  uploadHandoutFile: jest.fn(),
}));

// Minimal JWT shape: HandoutsTab only base64-decodes the payload segment.
const gmToken = `h.${btoa(JSON.stringify({ user_id: 'gm-1' }))}.s`;

const handout = {
  id: 'h-1',
  title: 'Mapa portu',
  description: '',
  type: 'image',
  visibility: ['all'],
  fileUrl: '/handouts/x.png',
  order: 0,
};

const gameState = {
  gameMasterId: 'gm-1',
  handouts: [handout],
  handoutFolders: [],
  participants: [],
};

const viewer = () => document.querySelector('.handout-viewer');

describe('HandoutsTab — reopening a minimized handout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getHandouts.mockResolvedValue({ handouts: [handout], handoutFolders: [] });
  });

  it('restores the minimized viewer when the handout is clicked in the list again', async () => {
    const { container } = render(
      <HandoutsTab gameId="g-1" token={gmToken} gameState={gameState} isConnected />,
      { wrapper: WindowManagerProvider }
    );
    await act(async () => {});

    const listItem = () => container.querySelector('.handout-item__content');

    await act(async () => { listItem().click(); });
    expect(viewer()).not.toBeNull();

    await act(async () => {
      viewer().querySelector('.modal-header__btn--minimize').click();
    });
    expect(viewer()).toBeNull();

    await act(async () => { listItem().click(); });
    expect(viewer()).not.toBeNull();
  });
});
