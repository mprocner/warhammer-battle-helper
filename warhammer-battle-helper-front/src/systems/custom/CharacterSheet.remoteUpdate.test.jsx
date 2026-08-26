import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie ESM-only axios, którego jest z konfiguracji CRA nie transformuje.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = {
  name: 'Mój system',
  sections: [{
    id: 'sec1',
    fields: [{ key: 'fld_origin', type: 'text_short', label: 'Pochodzenie' }],
  }],
};

const character = (texts) => ({ id: 'c1', name: 'Bohater', stats: { texts } });

function renderSheet(texts) {
  const utils = render(
    <CustomCharacterSheet
      character={character(texts)}
      onClose={() => {}}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="t"
      game={{ customSystemTemplate: template }}
      isStandalone
    />
  );
  const input = () => utils.container.querySelector('.custom-sheet__text-input');
  const receiveRemote = (newTexts) => utils.rerender(
    <CustomCharacterSheet
      character={character(newTexts)}
      onClose={() => {}}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="t"
      game={{ customSystemTemplate: template }}
      isStandalone
    />
  );
  return { input, receiveRemote };
}

describe('CustomCharacterSheet a zmiany tej samej postaci z zewnątrz', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  // Ta sama postać edytowana w drugim oknie: WS -> refetch -> nowy prop `character`.
  // Karta musi to pokazać, jeśli sama nie ma niezapisanych zmian.
  it('pokazuje zmianę z zewnątrz, gdy nie ma lokalnych edycji', () => {
    const { input, receiveRemote } = renderSheet({ fld_origin: 'Altdorf' });
    expect(input().value).toBe('Altdorf');

    receiveRemote({ fld_origin: 'Nuln' });

    expect(input().value).toBe('Nuln');
  });

  // Powód istnienia strażnika: rzut innego gracza wywołuje refetch. Gdyby karta
  // nadpisywała się bezwarunkowo, kasowałaby tekst wpisywany właśnie tutaj.
  it('nie kasuje lokalnej edycji, gdy zmiana z zewnątrz przyjdzie w trakcie pisania', () => {
    const { input, receiveRemote } = renderSheet({ fld_origin: 'Altdorf' });

    fireEvent.change(input(), { target: { value: 'Middenheim' } });
    expect(input().value).toBe('Middenheim');

    receiveRemote({ fld_origin: 'Nuln' });

    expect(input().value).toBe('Middenheim');
  });
});
