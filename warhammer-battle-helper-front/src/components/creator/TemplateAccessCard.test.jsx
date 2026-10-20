import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '../../i18n';
import TemplateAccessCard from './TemplateAccessCard';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const me = { userId: 'u1', email: 'me@example.com', role: 'owner', isMe: true };
const anna = { userId: 'u9', email: 'anna@example.com', role: 'viewer' };
const base = { id: 't1', name: 'T', isPublic: false, permissions: { edit: true, share: true, delete: true }, members: [me, anna] };

const respond = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const mount = (template = base, props = {}) => render(
  <TemplateAccessCard template={template} token="tok" onTemplateUpdated={props.onTemplateUpdated || (() => {})} onLeft={props.onLeft || (() => {})} />,
);

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
});
afterEach(() => { jest.resetAllMocks(); });

test('adding posts email and role and adopts the returned list', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [me, anna, { userId: 'u7', email: 'kolega@example.com', role: 'editor' }]));
  mount();

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'kolega@example.com' } });
  fireEvent.mouseDown(screen.getByLabelText('Role'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  expect(await screen.findByText('kolega@example.com')).toBeInTheDocument();
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/members$/);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ email: 'kolega@example.com', role: 'editor' });
  expect(screen.getByLabelText('Email address')).toHaveValue('');
});

test('an unknown address keeps the typed email and says so', async () => {
  global.fetch.mockReturnValueOnce(respond(404, { error: 'user not found' }));
  mount();
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'nikt@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(await screen.findByText('No account uses this address.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toHaveValue('nikt@example.com');
});

test('changing a role patches that member', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [me, { ...anna, role: 'editor' }]));
  mount();
  fireEvent.mouseDown(screen.getByLabelText('Role of anna@example.com'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/members\/u9$/);
  expect(init.method).toBe('PATCH');
  expect(JSON.parse(init.body)).toEqual({ role: 'editor' });
});

test('demoting the last owner shows the server refusal', async () => {
  global.fetch.mockReturnValueOnce(respond(400, { error: 'template must keep at least one owner' }));
  mount();
  fireEvent.mouseDown(screen.getByLabelText('Role of me@example.com'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  expect(await screen.findByText(/needs at least one owner/)).toBeInTheDocument();
});

test('removing another member deletes them', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [me]));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
  await waitFor(() => expect(screen.queryByText('anna@example.com')).not.toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/members\/u9$/);
  expect(init.method).toBe('DELETE');
});

test('leaving from the own row confirms, calls membership and reports it', async () => {
  const onLeft = jest.fn();
  global.fetch.mockReturnValueOnce(respond(200, { ok: true }));
  mount(base, { onLeft });
  fireEvent.click(screen.getByRole('button', { name: 'Leave template' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Leave template' }).pop());
  await waitFor(() => expect(onLeft).toHaveBeenCalled());
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/templates\/t1\/membership$/);
});

test('the public switch calls the visibility endpoint and hands back the template', async () => {
  const onTemplateUpdated = jest.fn();
  global.fetch.mockReturnValueOnce(respond(200, { ...base, isPublic: true }));
  mount(base, { onTemplateUpdated });
  fireEvent.click(screen.getByRole('switch'));
  await waitFor(() => expect(onTemplateUpdated).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true })));
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/visibility$/);
  expect(JSON.parse(init.body)).toEqual({ isPublic: true });
});

test('a refused visibility change flips the switch back', async () => {
  global.fetch.mockReturnValueOnce(respond(403, { error: 'not authorized' }));
  mount();
  fireEvent.click(screen.getByRole('switch'));
  expect(await screen.findByText('Could not change the visibility.')).toBeInTheDocument();
  expect(screen.getByRole('switch')).not.toBeChecked();
});

test('an owner demoting themselves is refreshed from the server when the answer is empty', async () => {
  // The server answers [] once the caller no longer has share; the card must re-fetch the
  // template instead of rendering an empty list, so the builder can hide it.
  const onTemplateUpdated = jest.fn();
  const fresh = { ...base, permissions: { edit: true, share: false, delete: false }, members: undefined };
  global.fetch.mockReturnValueOnce(respond(200, [])).mockReturnValueOnce(respond(200, fresh));
  mount(base, { onTemplateUpdated });
  fireEvent.mouseDown(screen.getByLabelText('Role of me@example.com'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  await waitFor(() => expect(onTemplateUpdated).toHaveBeenCalledWith(fresh));
  expect(global.fetch.mock.calls[1][0]).toMatch(/\/templates\/t1$/);
});

// Mounted through the real creator: the card's gate lives in TemplateBuilder.
describe('inside the creator', () => {
  beforeEach(() => {
    localStorage.setItem('tutorialSeen:creator:general', '1');
    localStorage.setItem('tutorialSeen:creator:sheet', '1');
  });
  const builder = (template) => render(
    <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
  );

  test('an owner sees the access card', () => {
    builder({ ...base, sections: [], settings: { diceButtons: [] } });
    expect(screen.getByText('People with access')).toBeInTheDocument();
  });

  test('an editor does not', () => {
    builder({ ...base, sections: [], settings: { diceButtons: [] }, permissions: { edit: true, share: false, delete: false }, members: undefined });
    expect(screen.queryByText('People with access')).not.toBeInTheDocument();
  });

  test('a named variant of a built-in system does not', () => {
    builder({ ...base, sections: [], settings: { diceButtons: [] }, baseSystem: 'warhammer4e' });
    expect(screen.queryByText('People with access')).not.toBeInTheDocument();
  });
});
