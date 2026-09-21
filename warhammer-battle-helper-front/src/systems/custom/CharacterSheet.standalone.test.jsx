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

  // FEATURE-212 follow-up: the wrapper's max-width must equal the template's configured
  // width, applied inline — the CSS no longer hardcodes a cap (style.css used to hard-cap
  // .custom-sheet at 760px regardless of the popup's own width).
  it('ustawia max-width kontenera .custom-sheet na settings.sheetWidth z szablonu', () => {
    const wideTemplate = { ...template, settings: { sheetWidth: 1400 } };
    const { container } = render(
      <CustomCharacterSheet
        character={{ id: 'c1', name: 'Bohater', stats: {} }}
        onClose={() => {}}
        onCharacterUpdate={() => {}}
        gameId="g1"
        token="t"
        game={{ customSystemTemplate: wideTemplate }}
        isStandalone
      />
    );
    const sheet = container.querySelector('.custom-sheet');
    expect(sheet.style.maxWidth).toBe('1400px');
  });

  it('gdy szablon nie ma pola settings, max-width kontenera .custom-sheet spada do domyślnych 900', () => {
    // `template` const above has no `settings` key at all — not settings.sheetWidth missing,
    // the whole object absent, matching a template authored before FEATURE-212 existed.
    const { container } = renderStandalone();
    const sheet = container.querySelector('.custom-sheet');
    expect(sheet.style.maxWidth).toBe('900px');
  });
});
