import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import i18n from '../i18n';
import { ConsentProvider, CONSENT_STORAGE_KEY } from './ConsentContext';
import AnalyticsGate from './AnalyticsGate';
import { usePageViews } from './usePageViews';
import ConsentBanner from '../components/consent/ConsentBanner';
import PrivacySettings from '../components/settings/PrivacySettings';

// End-to-end consent journey with the REAL gtag module, wired the way App.js wires it.
// gtag reads the measurement ID once, at module load, so the env var is set inside the mock
// factory - it runs on the first import, before any component pulls the module in.
// jest.resetModules() is not an option here: it would load a second copy of React
// ("Invalid hook call"), see ConsentBanner.test.jsx.
const MEASUREMENT_ID = 'G-FLOW123';
jest.mock('./gtag', () => {
  process.env.REACT_APP_GA_MEASUREMENT_ID = 'G-FLOW123';
  return jest.requireActual('./gtag');
});

// gtag keeps module state (injected / enabled), so the tests below form one ordered story:
// the "nothing yet" checks must run before the first grant injects the script.

const PageViewTracker = () => {
  usePageViews();
  return null;
};

const renderApp = () => render(
  <ConsentProvider>
    <AnalyticsGate />
    <MemoryRouter initialEntries={['/']}>
      <ConsentBanner />
      <PageViewTracker />
      <Routes>
        <Route path="/" element={<Link to="/privacy">to privacy</Link>} />
        <Route path="/privacy" element={<><PrivacySettings /><Link to="/">to home</Link></>} />
      </Routes>
    </MemoryRouter>
  </ConsentProvider>
);

const gaScripts = () => document.querySelectorAll('script[src*="googletagmanager.com"]');
const dataLayerCalls = () => Array.from(window.dataLayer || []).map((args) => Array.from(args));
const pageViews = () => dataLayerCalls().filter((args) => args[0] === 'event' && args[1] === 'page_view');
const banner = () => screen.queryByRole('dialog', { name: i18n.t('consent.title') });

const expireCookie = (name) => { document.cookie = `${name}=; Max-Age=0; path=/`; };

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  localStorage.clear();
  expireCookie('_ga');
  expireCookie('_ga_FLOW123');
});

describe('consent flow (real gtag)', () => {
  it('shows the banner to a new visitor and sends nothing to Google before a decision', () => {
    renderApp();

    expect(banner()).toBeInTheDocument();
    expect(gaScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('decline hides the banner, remembers "denied" and still loads nothing', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('consent.decline') }));

    expect(banner()).not.toBeInTheDocument();
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
    expect(gaScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();

    // Navigating after a refusal must not sneak a page_view in either.
    fireEvent.click(screen.getByRole('link', { name: 'to privacy' }));
    expect(window.dataLayer).toBeUndefined();
  });

  it('a stored refusal keeps the banner away on the next visit', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
    renderApp();
    expect(banner()).not.toBeInTheDocument();
    expect(gaScripts()).toHaveLength(0);
  });

  it('accept loads GA once and sends the page view of the page the visitor is on', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('consent.accept') }));

    expect(banner()).not.toBeInTheDocument();
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted');
    expect(gaScripts()).toHaveLength(1);
    expect(gaScripts()[0].src).toContain(MEASUREMENT_ID);
    expect(dataLayerCalls()).toContainEqual(['config', MEASUREMENT_ID, { send_page_view: false }]);
    expect(pageViews()).toHaveLength(1);
    expect(pageViews()[0][2].page_path).toBe('/');
  });

  // An ad blocker cancels the request: the <script> fires `error` and window.gtag never
  // arrives. Our gtag() only pushes onto a plain array, so the app must carry on unchanged.
  it('keeps working when an ad blocker blocks the GA script', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    renderApp();
    gaScripts().forEach((script) => fireEvent.error(script));

    fireEvent.click(screen.getByRole('link', { name: 'to privacy' }));
    expect(screen.getByLabelText(i18n.t('userSettings.privacy.analyticsLabel'))).toBeChecked();
    expect(pageViews().some((args) => args[2].page_path === '/privacy')).toBe(true);
  });

  it('withdrawing in the privacy settings stops sending and deletes the GA cookies', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    // GA4 names its session cookie after the measurement ID without the "G-" prefix.
    document.cookie = '_ga=GA1.1.111.222; path=/';
    document.cookie = '_ga_FLOW123=GS1.1.333; path=/';
    renderApp();
    expect(window[`ga-disable-${MEASUREMENT_ID}`]).toBe(false);

    fireEvent.click(screen.getByRole('link', { name: 'to privacy' }));
    const toggle = screen.getByLabelText(i18n.t('userSettings.privacy.analyticsLabel'));
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
    expect(window[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);

    const before = dataLayerCalls().length;
    fireEvent.click(screen.getByRole('link', { name: 'to home' }));
    expect(dataLayerCalls()).toHaveLength(before);
  });

  it('a withdrawal in another tab silences this one too', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    renderApp();
    expect(window[`ga-disable-${MEASUREMENT_ID}`]).toBe(false);

    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_STORAGE_KEY, newValue: 'denied' }));
    });

    expect(window[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    const before = dataLayerCalls().length;
    fireEvent.click(screen.getByRole('link', { name: 'to privacy' }));
    expect(dataLayerCalls()).toHaveLength(before);
  });
});
