import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const respond = (status, body) => Promise.resolve({
  ok: status < 400, status, json: () => Promise.resolve(body),
});

// A bare jest.fn() would return undefined for calls no test queues a response for — e.g.
// TokenDisplayBuilder's own unrelated field-catalog fetch, which also fires on mount for a
// baseSystem template. Give it a harmless default; mockReturnValueOnce below still takes
// priority for the share/unshare calls under test.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
});
afterEach(() => { jest.resetAllMocks(); });

test('sharing posts the typed address and shows the list the server returns', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [{ userId: 'u9', email: 'kolega@example.com' }]));
  mount(base);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'kolega@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText('kolega@example.com')).toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/shares$/);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ email: 'kolega@example.com' });
});

test('an address with no account leaves the list alone and says so', async () => {
  global.fetch.mockReturnValueOnce(respond(404, { error: 'user not found' }));
  mount({ ...base, sharedWithUsers: [{ userId: 'u9', email: 'kolega@example.com' }] });

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'nikt@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText('No account uses this address.')).toBeInTheDocument());
  expect(screen.getByText('kolega@example.com')).toBeInTheDocument();
  // The typed address survives the failure — retyping an email to fix one character is rude.
  expect(screen.getByLabelText('Email address')).toHaveValue('nikt@example.com');
});

test('an invalid address shows a distinct message, not "that is your own address"', async () => {
  // Gin's binding validator rejects the address before AddShare ever runs, so the body carries
  // its own validator-internal error text — never one of the service's sentinel strings.
  global.fetch.mockReturnValueOnce(respond(400, {
    error: "Key: 'ShareTemplateRequest.Email' Error:Field validation for 'Email' failed on the 'email' tag",
  }));
  mount(base);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'jan@' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText("That doesn't look like a valid email address.")).toBeInTheDocument());
  expect(screen.queryByText('That is your own address.')).not.toBeInTheDocument();
});

test('a vanished template reports a generic failure, not "no account uses this address"', async () => {
  // TemplateRepository.updateShares' default branch answers 404 with this exact message
  // whenever the template is gone or changed owner in another tab — never a missing recipient.
  global.fetch.mockReturnValueOnce(respond(404, { error: 'template not found or not owned by user' }));
  mount(base);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'kolega@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText('Could not share the template.')).toBeInTheDocument());
  expect(screen.queryByText('No account uses this address.')).not.toBeInTheDocument();
});

test('revoking sends the recipient id and adopts the shortened list', async () => {
  global.fetch.mockReturnValueOnce(respond(200, []));
  mount({ ...base, sharedWithUsers: [{ userId: 'u9', email: 'kolega@example.com' }] });

  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

  await waitFor(() => expect(screen.queryByText('kolega@example.com')).not.toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/shares\/u9$/);
  expect(init.method).toBe('DELETE');
});

test('a named variant of a built-in system has no sharing section', () => {
  mount({ ...base, baseSystem: 'warhammer4e' });
  expect(screen.queryByText('Share with specific people')).not.toBeInTheDocument();
});
