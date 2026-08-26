import React from 'react';
import { render } from '@testing-library/react';
import '../i18n';

// src/api/axios.js ciągnie ESM-only axios, którego jest z konfiguracji CRA nie transformuje.
// Karty nie robią requestów przy samym renderze, więc stałe wartości wystarczą.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

// registry.js importuje wszystkie systemy naraz (inaczej niż testy pojedynczych systemów, które
// importują sam CharacterSheet) — więc ściąga też warhammer4e/hooks/useRollActions.js i
// warhammer4e/CharacterDetails.jsx, które importują pakiet 'axios' bezpośrednio, a nie przez
// api/axios.js. Bez tego mocka Jest wywala się na parsowaniu ESM-only axios, zanim dojdzie do
// renderu. Karty nie wywołują tych metod przy samym renderze (tylko po kliknięciu rzutu), więc
// puste stuby wystarczą.
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
}));

import { listSystems, getSystem } from './registry';

const game = {
  customSystemTemplate: {
    name: 'Mój system',
    sections: [{
      id: 'sec1',
      fields: [{ key: 'fld_origin', type: 'text_short', label: 'Pochodzenie' }],
    }],
  },
};

// Regresja na FEATURE-172: system `custom` został dodany bez gałęzi isStandalone, więc karta
// wyrwana do osobnego okna renderowała DraggablePopup, ten wołał useWindowManager, a hook rzucał
// poza WindowManagerProvider. Iterujemy po rejestrze, żeby kolejny dodany system oblał ten test
// zamiast wywalić się u użytkownika.
describe.each(listSystems().map(s => [s.value]))('system %s w osobnym oknie', (key) => {
  const system = getSystem(key);
  const Sheet = system.CharacterSheet;

  it('renderuje się bez WindowManagerProvider i bez DraggablePopup', () => {
    const character = system.normalizeCharacter({ id: 'c1', name: 'Bohater', stats: {} });

    const { container } = render(
      <Sheet
        character={character}
        onClose={() => {}}
        onCharacterUpdate={() => {}}
        addLogMessage={() => {}}
        gameId="g1"
        token="t"
        game={game}
        isStandalone
      />
    );

    expect(container.querySelector('.sheet-standalone')).not.toBeNull();
    // .resize-handle istnieje wyłącznie w DraggablePopup — .character-sheet-popup nie rozstrzyga,
    // bo nosi go też wrapper standalone.
    expect(container.querySelector('.resize-handle')).toBeNull();
  });
});
