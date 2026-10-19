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

const renderPanel = (field) => render(
  <PropertyPanel field={field} onChange={() => {}} onDelete={() => {}} numberFields={[]} numericFields={[]} sections={[]} />
);

test('a skill table sorted on the sheet tells the GM the order is set aside', () => {
  renderPanel({ ...makeDefaultField('skill_table', t), skills: [{ id: 'skill_a', label: 'A' }], sortAlphabetically: true });
  expect(hint()).toBeInTheDocument();
});

test('an unsorted skill table shows no hint', () => {
  renderPanel({ ...makeDefaultField('skill_table', t), skills: [{ id: 'skill_a', label: 'A' }] });
  expect(hint()).not.toBeInTheDocument();
});
