import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { makeDefaultField, PropertyPanel } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const t = i18n.t.bind(i18n);
const hint = () => screen.queryByText(t('creator.reorderSortedHint'));
const presetHint = () => screen.queryByText(t('creator.presetReorderSortedHint'));

const renderPanel = (field) => render(
  <PropertyPanel field={field} onChange={() => {}} onDelete={() => {}} numberFields={[]} numericFields={[]} sections={[]} />
);

test('a skill table sorted on the sheet tells the GM the order is set aside', () => {
  renderPanel({ ...makeDefaultField('skill_table', t), skills: [{ id: 'skill_a', label: 'A' }], sortAlphabetically: true });
  expect(hint()).toBeInTheDocument();
  expect(presetHint()).not.toBeInTheDocument();
});

test('an unsorted skill table shows no hint', () => {
  renderPanel({ ...makeDefaultField('skill_table', t), skills: [{ id: 'skill_a', label: 'A' }] });
  expect(hint()).not.toBeInTheDocument();
});

const textCol = { key: 'c1', label: 'Name', type: 'text', options: [], optionsFromSkills: false };
const numberCol = { key: 'c2', label: 'Weight', type: 'number', options: [], optionsFromSkills: false };
const preset = { id: 'preset_a', cells: {}, addOnCreate: false };

test('a sorted data table with a text column shows the hint', () => {
  renderPanel({ ...makeDefaultField('data_table', t), columns: [textCol], presetRows: [preset], sortAlphabetically: true });
  expect(presetHint()).toBeInTheDocument();
  expect(hint()).not.toBeInTheDocument();
});

// sortColumnKey finds no text column to sort by, so the sheet keeps the GM's order despite the
// flag — the hint would be false.
test('a sorted data table without a text column shows no hint', () => {
  renderPanel({ ...makeDefaultField('data_table', t), columns: [numberCol], presetRows: [preset], sortAlphabetically: true });
  expect(presetHint()).not.toBeInTheDocument();
});

test('a sorted weapons table shows the hint under its preset weapons', () => {
  renderPanel({ ...makeDefaultField('weapons_table', t), columns: [textCol], presetWeapons: [preset], sortAlphabetically: true });
  expect(presetHint()).toBeInTheDocument();
});
