import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie ESM-only axios, którego jest z konfiguracji CRA nie transformuje —
// bez tego mocka test wywala się na `import`, zanim cokolwiek się wyrenderuje. Karta nie robi
// żadnego requestu przy renderze, więc stałe wartości wystarczą.
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

function renderStandalone() {
  return render(
    <CustomCharacterSheet
      character={{ id: 'c1', name: 'Bohater', stats: {} }}
      onClose={() => {}}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="t"
      game={{ customSystemTemplate: template }}
      isStandalone
    />
  );
}

describe('CustomCharacterSheet w osobnym oknie', () => {
  // Regresja na FEATURE-172: bez gałęzi isStandalone karta renderowała DraggablePopup,
  // ten wołał useWindowManager, a ten rzucał poza WindowManagerProvider.
  it('renderuje się bez WindowManagerProvider', () => {
    const { container } = renderStandalone();
    expect(container.querySelector('.sheet-standalone')).not.toBeNull();
    // .resize-handle występuje wyłącznie w DraggablePopup (DraggablePopup.jsx:166-173).
    // Sam .character-sheet-popup nie rozstrzyga — nosi go też wrapper standalone.
    expect(container.querySelector('.resize-handle')).toBeNull();
  });

  it('renderuje pola z szablonu przekazanego w propie game', () => {
    const { container } = renderStandalone();
    const labels = [...container.querySelectorAll('.custom-sheet__field-label')];
    expect(labels.map(el => el.textContent)).toContain('Pochodzenie');
  });
});
