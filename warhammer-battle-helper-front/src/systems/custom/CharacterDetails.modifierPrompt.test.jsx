import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie axios (ESM-only), którego CRA-owy jest nie transformuje — bez mocka
// test wywala się na imporcie, zanim cokolwiek się wyrenderuje (wzorzec:
// CharacterDetails.favorites.test.jsx).
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterDetails from './CharacterDetails';

const template = (modifier) => ({
  sections: [{
    id: 'sec1',
    fields: [{ key: 'fld_str', type: 'attr', label: 'Siła', rollable: true, showOnShortCard: true }],
  }],
  ...(modifier ? { settings: { modifier } } : {}),
});

function renderDetails(modifier) {
  return render(
    <CustomCharacterDetails
      character={{ id: 'c1', name: 'Bohater', stats: { attributes: { fld_str: { current: 30 } } } }}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="tok"
      game={{ customSystemTemplate: template(modifier) }}
    />
  );
}

describe('CustomCharacterDetails roll modifier prompt', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });
  afterEach(() => { jest.resetAllMocks(); });

  it('rolls straight away with modifier 0 when the template has no modifier configured', async () => {
    renderDetails(null);
    fireEvent.click(screen.getByTitle(/roll|rzut/i));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.modifier).toBe(0);
    expect(document.querySelector('.custom-roll-overlay')).toBeNull();
  });

  it('opens the prompt and sends the confirmed modifier when it is enabled', async () => {
    renderDetails({ enabled: true, traditionalTarget: 'roll' });
    fireEvent.click(screen.getByTitle(/roll|rzut/i));

    expect(document.querySelector('.custom-roll-overlay')).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-20' } });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).modifier).toBe(-20);
    expect(document.querySelector('.custom-roll-overlay')).toBeNull();
  });
});
