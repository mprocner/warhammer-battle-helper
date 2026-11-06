/* eslint-disable testing-library/no-node-access, testing-library/no-container, testing-library/no-unnecessary-act, import/first */
import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import '../../i18n';

jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = {
  name: 'Mój system',
  sections: [{ id: 's', fields: [{
    key: 'inv', type: 'data_table', label: 'Ekwipunek',
    columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
    presetRows: [{ id: 'p1', cells: { name: 'Lina' } }],
  }] }],
};

const renderSheet = (stats = {}) => render(
  <CustomCharacterSheet
    character={{ id: 'c1', name: 'B', stats }}
    onClose={() => {}}
    onCharacterUpdate={() => {}}
    gameId="g1"
    token="t"
    game={{ customSystemTemplate: template }}
    isStandalone
  />
);

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
});
afterEach(() => jest.useRealTimers());

const lastBody = () => JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);

test('adding a row and typing saves it under stats.tables', async () => {
  const { container } = renderSheet();
  fireEvent.click(screen.getByText('+ Add row'));
  fireEvent.change(container.querySelector('.custom-sheet__row-table-cell-input'), { target: { value: 'Plecak' } });
  await act(async () => { jest.advanceTimersByTime(800); });

  const rows = lastBody().stats.tables.inv;
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toMatch(/^r_/);
  expect(rows[0].cells).toEqual({ name: 'Plecak' });
});

test('a catalog pick is copied as a snapshot of its cells', async () => {
  const { container } = renderSheet();
  fireEvent.change(container.querySelector('.custom-sheet__row-table-preset-picker'), { target: { value: 'p1' } });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(lastBody().stats.tables.inv[0].cells).toEqual({ name: 'Lina' });
});

test('removing a row drops it from stats.tables', async () => {
  const { container } = renderSheet({ tables: { inv: [{ id: 'r_1', cells: { name: 'X' } }] } });
  fireEvent.click(container.querySelector('.custom-sheet__row-table-remove'));
  fireEvent.click(screen.getByText('Delete'));
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(lastBody().stats.tables.inv).toEqual([]);
});
