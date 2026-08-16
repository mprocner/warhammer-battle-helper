import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie pakiet axios, który jest ESM-only — jest z konfiguracji CRA go nie
// transformuje i test wywala się na `import` zanim cokolwiek się wyrenderuje. Panel ulubionych
// nie robi żadnego requestu przy renderze, więc podmieniamy cały moduł na stałe wartości.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterDetails from './CharacterDetails';

// Ulubione są listą samych kluczy w stats.favoriteSkills — etykieta i wartość doklejają się
// z definicji: węzła drzewa z szablonu, wiersza skill_table albo stats.customSkillNodes.
// Klucz bez definicji jest sierotą (FEATURE-160: wartość zapisana pod gołym kluczem korzenia,
// albo węzeł skasowany przez GM z szablonu już po tym, jak gracz dał gwiazdkę).
const template = {
  sections: [{
    id: 'sec1',
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      tree: { key: 'tree_123', label: 'Kategoria', children: [{ key: 'node_a', label: 'Broń biała' }] },
    }],
  }],
};

function renderWithFavorites(favoriteSkills, skills) {
  return render(
    <CustomCharacterDetails
      character={{ id: 'c1', name: 'Bohater', stats: { favoriteSkills, skills } }}
      onCharacterUpdate={() => {}}
      game={{ customSystemTemplate: template }}
    />
  );
}

describe('CustomCharacterDetails favourite skills', () => {
  it('shows a favourite that still has a node in the template', () => {
    const { container } = renderWithFavorites(
      ['fld_tree.node_a'],
      { 'fld_tree.node_a': { base: 40, current: 40 } }
    );

    const labels = [...container.querySelectorAll('.custom-character-details__favorite-label')];
    expect(labels.map(el => el.textContent)).toEqual(['Broń biała']);
  });

  it('drops a favourite whose definition no longer exists instead of guessing a label from the key', () => {
    const { container } = renderWithFavorites(
      ['tree_123', 'fld_tree.node_gone'],
      { tree_123: { base: 666, current: 666 }, 'fld_tree.node_gone': { base: 40, current: 40 } }
    );

    expect(container.querySelectorAll('.custom-character-details__favorite-item').length).toBe(0);
  });
});
