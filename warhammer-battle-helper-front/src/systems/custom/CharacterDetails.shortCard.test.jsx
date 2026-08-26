import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie axios (ESM-only), którego CRA nie transformuje w jest — bez tego
// mocka test wywala się na `import` zanim cokolwiek się wyrenderuje.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterDetails from './CharacterDetails';

// Etykieta = klucz wielkimi literami, więc test czyta z DOM-u dokładnie to, co wstawił.
const attr = (key, extra = {}) => ({
  key,
  type: 'attr',
  label: key.toUpperCase(),
  showOnShortCard: true,
  rollable: false,
  ...extra,
});

function renderCard(sections, stats = {}, props = {}) {
  return render(
    <CustomCharacterDetails
      character={{ id: 'c1', name: 'Bohater', stats }}
      onCharacterUpdate={() => {}}
      game={{ customSystemTemplate: { sections } }}
      {...props}
    />
  );
}

describe('CustomCharacterDetails short card', () => {
  it('renders every flagged field instead of stopping at six', () => {
    const fields = Array.from({ length: 8 }, (_, i) => attr(`a${i}`));
    const { container } = renderCard([{ id: 's1', fields }]);

    expect(container.querySelectorAll('.custom-character-details__attr').length).toBe(8);
  });

  it('leaves out a rollable field that the GM did not flag for the short card', () => {
    const { container } = renderCard([{ id: 's1', fields: [
      attr('shown'),
      attr('hidden', { showOnShortCard: false, rollable: true }),
    ] }]);

    const abbrs = [...container.querySelectorAll('.custom-character-details__attr-abbr')];
    expect(abbrs.map(el => el.textContent)).toEqual(['SHOWN']);
  });

  it('groups tiles into one block per template section, in template order', () => {
    const { container } = renderCard([
      { id: 's1', fields: [attr('a'), attr('b'), attr('c')] },
      { id: 's2', fields: [attr('d'), attr('e'), attr('f'), attr('g')] },
    ]);

    const sections = [...container.querySelectorAll('.custom-character-details__section')];
    expect(sections.map(s => s.querySelectorAll('.custom-character-details__attr').length)).toEqual([3, 4]);
  });

  it('skips a section whose fields are all unflagged', () => {
    const { container } = renderCard([
      { id: 's1', fields: [attr('a')] },
      { id: 's2', fields: [attr('b', { showOnShortCard: false })] },
    ]);

    expect(container.querySelectorAll('.custom-character-details__section').length).toBe(1);
  });

  it('shows the dice button only on rollable fields and opens the modifier modal', () => {
    const { container } = renderCard([{ id: 's1', fields: [
      attr('plain'),
      attr('rolls', { rollable: true }),
    ] }]);

    const tiles = [...container.querySelectorAll('.custom-character-details__attr')];
    expect(tiles[0].querySelector('.custom-character-details__roll-btn')).toBeNull();

    fireEvent.click(tiles[1].querySelector('.custom-character-details__roll-btn'));
    expect(container.querySelector('.custom-roll-overlay')).not.toBeNull();
  });

  it('reads an attribute tile from current and a number tile from stats.numbers', () => {
    const { container } = renderCard(
      [{ id: 's1', fields: [
        attr('str'),
        { key: 'gold', type: 'number', label: 'GOLD', showOnShortCard: true },
      ] }],
      { attributes: { str: { base: 3, advances: 2, current: 5 } }, numbers: { gold: 42 } }
    );

    const vals = [...container.querySelectorAll('.custom-character-details__attr-val')];
    expect(vals.map(el => el.textContent)).toEqual(['5', '42']);
  });

  it('renders a flagged progress field inside its own section and saves the bumped value', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    const onCharacterUpdate = jest.fn();

    const { container } = renderCard(
      [{ id: 's1', fields: [
        attr('str'),
        { key: 'hp', type: 'progress', label: 'HP', showOnShortCard: true },
      ] }],
      { progress: { hp: { current: 3, max: 10 } } },
      { onCharacterUpdate, gameId: 'g1', token: 'tok' }
    );

    const section = container.querySelector('.custom-character-details__section');
    const resource = section.querySelector('.custom-character-details__resource');
    expect(resource).not.toBeNull();

    const plus = resource.querySelectorAll('.custom-character-details__resource-btn')[1];
    fireEvent.click(plus);

    expect(onCharacterUpdate).toHaveBeenCalledWith(expect.objectContaining({
      stats: expect.objectContaining({ progress: { hp: { current: 4, max: 10 } } }),
    }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'http://test/games/g1/characters/c1',
      expect.objectContaining({ method: 'PUT' })
    ));
  });
});
