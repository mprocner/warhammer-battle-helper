import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import en from '../locales/en/translation.json';
import pl from '../locales/pl/translation.json';
import Contact, { isContactFormValid } from './Contact';
import { CONTACT_EMAIL } from '../legal/legalInfo';

jest.mock('../api/apiUrl', () => ({ getApiUrl: () => 'http://api.test', getApiHeaders: (h = {}) => h }));

const renderPage = ({ user = null, url = '/contact' } = {}) => render(
  <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Contact user={user} />
  </MemoryRouter>
);

const field = (key) => screen.getByLabelText(new RegExp('^' + i18n.t(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
const type = (key, value) => fireEvent.change(field(key), { target: { value } });
const submit = () => screen.getByRole('button', { name: i18n.t('contact.submit') });
const sentBody = () => JSON.parse(global.fetch.mock.calls[0][1].body);

const keyPaths = (node, prefix = '') => Object.entries(node).flatMap(([key, value]) => (
  typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`]
));

const EMPTY = { name: '', message: '', contentLocation: '', justification: '', goodFaith: false, childAbuse: false };

describe('isContactFormValid', () => {
  it('needs only a message for a bug report', () => {
    expect(isContactFormValid('bug', EMPTY, '')).toBe(false);
    expect(isContactFormValid('bug', { ...EMPTY, message: 'x' }, '')).toBe(true);
    expect(isContactFormValid('bug', { ...EMPTY, message: 'x' }, 'not-an-email')).toBe(false);
  });

  it('follows terms §4 for a content report', () => {
    const report = { ...EMPTY, contentLocation: 'Game X', justification: 'why', goodFaith: true };
    expect(isContactFormValid('content', report, '')).toBe(false);
    expect(isContactFormValid('content', { ...report, name: 'Jan' }, 'jan@example.com')).toBe(true);
    expect(isContactFormValid('content', { ...report, name: 'Jan', goodFaith: false }, 'jan@example.com')).toBe(false);
    // Child sexual abuse reports may be anonymous.
    expect(isContactFormValid('content', { ...report, childAbuse: true }, '')).toBe(true);
  });
});

describe('Contact', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    localStorage.clear();
  });
  afterEach(() => {
    delete global.fetch;
    i18n.changeLanguage('en');
  });

  it('shows the fallback address and prefills the e-mail of a logged-in user', () => {
    renderPage({ user: { email: 'gm@example.com' } });
    expect(screen.getAllByRole('link', { name: CONTACT_EMAIL })[0]).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`);
    expect(field('contact.email')).toHaveValue('gm@example.com');
  });

  it('sends a bug report with the JWT and shows a confirmation', async () => {
    localStorage.setItem('token', 'jwt-token');
    renderPage();
    expect(submit()).toBeDisabled();

    type('contact.message', 'The fog does not clear');
    fireEvent.click(submit());

    await waitFor(() => expect(screen.getByText(i18n.t('contact.sent'))).toBeInTheDocument());
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://api.test/contact');
    expect(options.headers.Authorization).toBe('Bearer jwt-token');
    expect(sentBody()).toMatchObject({ type: 'bug', message: 'The fog does not clear', website: '' });
  });

  it('asks for the terms §4 fields in a content report', async () => {
    renderPage({ url: '/contact?type=content' });
    type('contact.nameRequired', 'Jan Kowalski');
    type('contact.email', 'jan@example.com');
    type('contact.contentLocation', 'Game "Dragons", scene 2');
    type('contact.justification', 'A scanned rulebook');
    expect(submit()).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('contact.goodFaith') }));
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());

    await waitFor(() => expect(screen.getByText(i18n.t('contact.sentContent'))).toBeInTheDocument());
    expect(sentBody()).toMatchObject({
      type: 'content', name: 'Jan Kowalski', email: 'jan@example.com',
      contentLocation: 'Game "Dragons", scene 2', justification: 'A scanned rulebook',
      goodFaith: true, childAbuse: false,
    });
  });

  it('lets a child sexual abuse report go without name and e-mail', () => {
    renderPage({ url: '/contact?type=content' });
    type('contact.contentLocation', 'Game X');
    type('contact.justification', '...');
    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('contact.goodFaith') }));
    expect(submit()).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('contact.childAbuse') }));
    expect(submit()).toBeEnabled();
  });

  it('explains a rate-limit rejection and keeps the draft', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429 });
    renderPage();
    type('contact.message', 'Hello');
    fireEvent.click(submit());

    await waitFor(() => expect(screen.getByText(new RegExp(i18n.t('contact.tooMany')))).toBeInTheDocument());
    expect(field('contact.message')).toHaveValue('Hello');
  });

  it('shows an error with the fallback address when sending fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    renderPage();
    type('contact.message', 'Hello');
    fireEvent.click(submit());
    await waitFor(() => expect(screen.getByText(new RegExp(i18n.t('contact.error')))).toBeInTheDocument());
  });

  it('has the same contact keys in English and Polish', () => {
    expect(keyPaths(pl.contact).sort()).toEqual(keyPaths(en.contact).sort());
  });
});
