/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const base = { id: 't1', name: 'T', version: 1, sections: [], settings: { diceButtons: [] },
  description: '<p>old</p>', language: '', permissions: { edit: true, share: false, delete: false } };
const patches = () => global.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
const flushDebounce = async () => { await act(async () => { jest.advanceTimersByTime(1300); }); };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ...base, version: 2 }) });
});
afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

const mount = (template = base) => render(
  <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);

test('custom template shows the card with the missing-language hint', () => {
  mount();
  expect(document.body.querySelector('.creator__settings-card--about')).not.toBeNull();
  expect(screen.getByText('Set the language so players can find this template with the language filter.')).toBeInTheDocument();
});

test('a variant has no card and its saves carry no about fields', async () => {
  mount({ ...base, baseSystem: 'warhammer4e', description: undefined });
  expect(document.body.querySelector('.creator__settings-card--about')).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('System name'), { target: { value: 'X' } });
  await flushDebounce();
  const body = JSON.parse(patches()[0][1].body);
  expect('language' in body).toBe(false);
  expect('description' in body).toBe(false);
});

test('picking a language saves it with the description', async () => {
  mount();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Template language' }));
  fireEvent.click(screen.getByRole('option', { name: 'Polish' }));
  await flushDebounce();
  const body = JSON.parse(patches()[0][1].body);
  expect(body.language).toBe('pl');
  expect(body.description).toBe('<p>old</p>');
});

test('editing the description saves the new HTML', async () => {
  mount();
  const editor = document.body.querySelector('.creator__settings-card--about .tiptap').editor;
  act(() => { editor.commands.insertContent('new'); });
  await flushDebounce();
  expect(JSON.parse(patches()[0][1].body).description).toMatch(/new/);
});
