import React from 'react';
import { render, act } from '@testing-library/react';
import '../../i18n';
import HandoutsTab from './HandoutsTab';
import { getHandouts, createHandout, uploadHandoutFile } from '../../api/handouts';

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

const createdHandout = {
  id: 'h-1',
  title: 'Mapa portu',
  description: '',
  type: 'pdf',
  visibility: ['all'],
  fileUrl: '/handouts/x.pdf',
  order: 0,
};

const gameStateWith = (handouts) => ({
  gameMasterId: 'gm-1',
  handouts,
  handoutFolders: [],
  participants: [],
});

const renderTab = (gameState) =>
  render(
    <HandoutsTab gameId="g-1" token={gmToken} gameState={gameState} isConnected />
  );

const titles = () =>
  Array.from(document.querySelectorAll('.handout-item__title')).map((el) => el.textContent);

describe('HandoutsTab — create/WebSocket race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getHandouts.mockResolvedValue({ handouts: [], handoutFolders: [] });
    uploadHandoutFile.mockResolvedValue({ url: createdHandout.fileUrl });
  });

  it('does not duplicate the handout when the WS update lands before the POST resolves', async () => {
    let resolveCreate;
    createHandout.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );

    const { container, rerender } = renderTab(gameStateWith([]));
    await act(async () => {});

    // Open the create modal
    await act(async () => {
      container.querySelector('.handouts-tab__add-btn').click();
    });

    // Fill the required fields: title + an uploaded file
    const titleInput = container.querySelector('#title');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      setter.call(titleInput, createdHandout.title);
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [new File(['%PDF-'], 'mapa.pdf', { type: 'application/pdf' })],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit — the POST is now in flight
    await act(async () => {
      container.querySelector('.handout-modal__form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(createHandout).toHaveBeenCalledTimes(1);

    // The WS broadcast reaches GameSession first and pushes the handout into gameState
    await act(async () => {
      rerender(
        <HandoutsTab
          gameId="g-1"
          token={gmToken}
          gameState={gameStateWith([createdHandout])}
          isConnected
        />
      );
    });

    // Only now does the POST response arrive
    await act(async () => {
      resolveCreate(createdHandout);
    });

    expect(titles()).toEqual([createdHandout.title]);
  });

  it('shows the handout when the POST resolves before any WS update', async () => {
    createHandout.mockResolvedValue(createdHandout);

    const { container } = renderTab(gameStateWith([]));
    await act(async () => {});

    await act(async () => {
      container.querySelector('.handouts-tab__add-btn').click();
    });

    const titleInput = container.querySelector('#title');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      setter.call(titleInput, createdHandout.title);
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [new File(['%PDF-'], 'mapa.pdf', { type: 'application/pdf' })],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      container.querySelector('.handout-modal__form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(titles()).toEqual([createdHandout.title]);
  });
});
