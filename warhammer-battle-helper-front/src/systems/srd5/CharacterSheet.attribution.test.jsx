import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';

// Same stubs as standaloneRender.test.jsx: the sheet pulls in ESM-only axios.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
}));

/* eslint-disable import/first */
import srd5 from './index';
/* eslint-enable import/first */

it('links the licence page in a new tab, so the game session is not navigated away', () => {
  const character = srd5.normalizeCharacter({ id: 'c1', name: 'Bohater', stats: {} });
  render(
    <srd5.CharacterSheet character={character} onClose={() => {}} onCharacterUpdate={() => {}}
      addLogMessage={() => {}} gameId="g1" token="t" game={{}} isStandalone />
  );
  const link = screen.getByRole('link', { name: i18n.t('srd.attributionLink') });
  expect(link).toHaveAttribute('href', '/licenses');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
