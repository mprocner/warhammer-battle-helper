import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const base = { id: 't1', name: 'T', version: 3, sections: [], settings: { diceButtons: [] },
  permissions: { edit: true, share: false, delete: false } };
const respond = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const patches = () => global.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
const rename = (value) => fireEvent.change(screen.getByPlaceholderText('System name'), { target: { value } });
const flushDebounce = async () => { await act(async () => { jest.advanceTimersByTime(1300); }); };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
});
afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

const mount = (onTemplateUpdated = () => {}) => render(
  <TemplateBuilder template={base} token="tok" onClose={() => {}} onTemplateUpdated={onTemplateUpdated} />,
);

test('a save carries the version and adopts the next one', async () => {
  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'A', version: 4 }));
  mount();
  rename('A');
  await flushDebounce();
  expect(JSON.parse(patches()[0][1].body).version).toBe(3);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 5 }));
  rename('AB');
  await flushDebounce();
  expect(JSON.parse(patches()[1][1].body).version).toBe(4);
});

test('a conflict shows who saved, stops autosave, and overwrite sends their version', async () => {
  global.fetch.mockReturnValueOnce(respond(409, { error: 'version conflict', version: 9, updatedBy: 'anna@example.com', updatedAt: '2026-10-20T14:32:00Z' }));
  mount();
  rename('A');
  await flushDebounce();
  await screen.findByText(/anna@example\.com saved this template/);

  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 10 }));
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }));
  await waitFor(() => expect(patches()).toHaveLength(2));
  const body = JSON.parse(patches()[1][1].body);
  expect(body.version).toBe(9);
  expect(body.name).toBe('AB');
  await waitFor(() => expect(screen.queryByText(/saved this template/)).not.toBeInTheDocument());
});

test('load their version replaces local state with the server copy', async () => {
  const onTemplateUpdated = jest.fn();
  global.fetch.mockReturnValueOnce(respond(409, { error: 'version conflict', version: 9, updatedBy: '', updatedAt: '2026-10-20T14:32:00Z' }));
  mount(onTemplateUpdated);
  rename('Mine');
  await flushDebounce();
  await screen.findByText(/Someone else saved this template/);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'Theirs', version: 9 }));
  fireEvent.click(screen.getByRole('button', { name: 'Load their version' }));
  await waitFor(() => expect(screen.getByPlaceholderText('System name')).toHaveValue('Theirs'));
  expect(onTemplateUpdated).toHaveBeenCalledWith(expect.objectContaining({ name: 'Theirs', version: 9 }));

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'Theirs2', version: 10 }));
  rename('Theirs2');
  await flushDebounce();
  expect(JSON.parse(patches().pop()[1].body).version).toBe(9);
});

test('losing edit access shows the banner and stops autosave', async () => {
  global.fetch.mockReturnValueOnce(respond(403, { error: 'not authorized' }));
  mount();
  rename('A');
  await flushDebounce();
  await screen.findByText(/no longer have edit access/);
  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);
});

test('saves are serialized: a second save waits for the first and sends its new version', async () => {
  let resolveFirst;
  global.fetch.mockReturnValueOnce(new Promise(r => { resolveFirst = r; }));
  mount();
  rename('A');
  await flushDebounce();
  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 5 }));
  await act(async () => { resolveFirst({ ok: true, status: 200, json: () => Promise.resolve({ ...base, name: 'A', version: 4 }) }); });
  await waitFor(() => expect(patches()).toHaveLength(2));
  expect(JSON.parse(patches()[1][1].body).version).toBe(4);
});

test('a timer pending when the 409 lands does not save after "Load their version"', async () => {
  let resolveFirst;
  global.fetch.mockReturnValueOnce(new Promise(r => { resolveFirst = r; }));
  mount();
  rename('A');
  await flushDebounce();
  expect(patches()).toHaveLength(1);
  rename('Mine');

  await act(async () => { resolveFirst({ ok: false, status: 409, json: () => Promise.resolve({ error: 'version conflict', version: 9, updatedBy: '', updatedAt: '2026-10-20T14:32:00Z' }) }); });
  await screen.findByText(/Someone else saved this template/);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'Theirs', version: 9 }));
  fireEvent.click(screen.getByRole('button', { name: 'Load their version' }));
  await waitFor(() => expect(screen.getByPlaceholderText('System name')).toHaveValue('Theirs'));

  await flushDebounce();
  expect(patches()).toHaveLength(1);
  expect(screen.getByPlaceholderText('System name')).toHaveValue('Theirs');
});

test('a save queued behind a save that gets a 409 is not sent, and overwrite leaves no banner', async () => {
  let resolveFirst;
  global.fetch.mockReturnValueOnce(new Promise(r => { resolveFirst = r; }));
  mount();
  rename('A');
  await flushDebounce();
  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);

  await act(async () => { resolveFirst({ ok: false, status: 409, json: () => Promise.resolve({ error: 'version conflict', version: 9, updatedBy: 'anna@example.com', updatedAt: '2026-10-20T14:32:00Z' }) }); });
  await screen.findByText(/anna@example\.com saved this template/);
  await flushDebounce();
  expect(patches()).toHaveLength(1);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 10 }));
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }));
  await waitFor(() => expect(patches()).toHaveLength(2));
  await waitFor(() => expect(screen.queryByText(/saved this template/)).not.toBeInTheDocument());
  await flushDebounce();
  expect(patches()).toHaveLength(2);
});

test('closing the dialog while a banner is up sends no save', async () => {
  global.fetch.mockReturnValueOnce(respond(409, { error: 'version conflict', version: 9, updatedBy: '', updatedAt: '2026-10-20T14:32:00Z' }));
  mount();
  rename('A');
  await flushDebounce();
  await screen.findByText(/Someone else saved this template/);
  rename('AB');

  fireEvent.click(screen.getAllByTestId('CloseIcon')[0]);
  await flushDebounce();
  expect(patches()).toHaveLength(1);
});
