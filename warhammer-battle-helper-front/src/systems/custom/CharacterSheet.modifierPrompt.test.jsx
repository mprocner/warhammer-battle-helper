import React from 'react';
import { render, within, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie axios (ESM-only), którego CRA-owy jest nie transformuje — bez mocka
// test wywala się na imporcie, zanim cokolwiek się wyrenderuje (wzorzec:
// CharacterSheet.standalone.test.jsx).
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = (modifier) => ({
  name: 'Mój system',
  sections: [{
    id: 'sec1',
    fields: [{ key: 'fld_str', type: 'attr', label: 'Siła', rollable: true }],
  }],
  ...(modifier ? { settings: { modifier } } : {}),
});

function renderSheet(modifier) {
  return render(
    <CustomCharacterSheet
      character={{ id: 'c1', name: 'Bohater', stats: { attributes: { fld_str: { current: 30 } } } }}
      onClose={() => {}}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="t"
      game={{ customSystemTemplate: template(modifier) }}
      isStandalone
    />
  );
}

describe('CustomCharacterSheet roll modifier prompt', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });
  afterEach(() => { jest.resetAllMocks(); });

  it('rolls straight away with modifier 0 when the template has no modifier configured', async () => {
    const { container } = renderSheet(null);
    fireEvent.click(container.querySelector('.custom-sheet__roll-btn'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.modifier).toBe(0);
    expect(document.querySelector('.custom-roll-overlay')).toBeNull();
  });

  it('opens the prompt and sends the confirmed modifier when it is enabled', async () => {
    const { container } = renderSheet({ enabled: true, traditionalTarget: 'roll' });
    fireEvent.click(container.querySelector('.custom-sheet__roll-btn'));

    const overlay = document.querySelector('.custom-roll-overlay');
    expect(overlay).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    const spinbutton = within(overlay).getByRole('spinbutton');
    fireEvent.change(spinbutton, { target: { value: '-20' } });
    fireEvent.keyDown(spinbutton, { key: 'Enter' });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).modifier).toBe(-20);
    expect(document.querySelector('.custom-roll-overlay')).toBeNull();
  });
});
