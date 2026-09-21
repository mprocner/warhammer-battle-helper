import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

// TemplateBuilder pulls in api/axios AND, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to mount the creator.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const base = { id: 't1', name: 'T', sections: [], settings: { diceButtons: [] } };
const mount = (template) => render(
  <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);

test('a custom template gets the sheet-width card', () => {
  mount(base);
  expect(screen.getByText('Character sheet window')).toBeInTheDocument();
});

test('a named variant of a built-in system does not — its sheet comes from the Go plugin', () => {
  mount({ ...base, baseSystem: 'warhammer4e' });
  expect(screen.queryByText('Character sheet window')).not.toBeInTheDocument();
});

test('the slider writes the width through updateSettings', () => {
  mount(base);
  // getByRole('slider') being singular is load-bearing: the General tab has exactly one slider today.
  // If a second slider is added, this query will fail with "found multiple" — scope it then.
  expect(screen.getByText('900 px')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
  expect(screen.getByText('950 px')).toBeInTheDocument();
});
