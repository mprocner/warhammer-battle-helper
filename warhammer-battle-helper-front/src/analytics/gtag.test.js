// Moduł trzyma stan na poziomie modułu (injected/enabled), więc każdy test
// dostaje świeżą instancję przez jest.resetModules() + require w środku testu.
const MEASUREMENT_ID = 'G-TEST123';

const loadModule = (id = MEASUREMENT_ID) => {
  jest.resetModules();
  process.env.REACT_APP_GA_MEASUREMENT_ID = id;
  // eslint-disable-next-line global-require
  return require('./gtag');
};

const scriptTags = () =>
  Array.from(document.querySelectorAll('script[src*="googletagmanager.com"]'));

const dataLayerCalls = () => Array.from(window.dataLayer || []).map((args) => Array.from(args));

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.dataLayer;
  delete window[`ga-disable-${MEASUREMENT_ID}`];
  window.history.replaceState(null, '', '/');
  // Testy referrer nadpisują document.referrer przez defineProperty (configurable: true);
  // delete przywraca domyślne '' z jsdom, żeby testy się nie zanieczyszczały nawzajem.
  delete document.referrer;
});

describe('gtag transport', () => {
  it('nie wysyła niczego przed udzieleniem zgody', () => {
    const gtag = loadModule();
    gtag.trackEvent('sign_up', { method: 'email' });
    expect(scriptTags()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('enable() wstrzykuje skrypt i konfiguruje GA bez automatycznego page_view', () => {
    const gtag = loadModule();
    gtag.enable();
    expect(scriptTags()).toHaveLength(1);
    expect(scriptTags()[0].src).toContain(MEASUREMENT_ID);
    expect(dataLayerCalls()).toContainEqual([
      'config', MEASUREMENT_ID, { send_page_view: false },
    ]);
  });

  it('nie wstrzykuje skryptu dwa razy (StrictMode montuje efekty podwójnie)', () => {
    const gtag = loadModule();
    gtag.enable();
    gtag.enable();
    expect(scriptTags()).toHaveLength(1);
  });

  it('wysyła eventy po zgodzie', () => {
    const gtag = loadModule();
    gtag.enable();
    gtag.trackEvent('sign_up', { method: 'email' });
    expect(dataLayerCalls()).toContainEqual([
      'event',
      'sign_up',
      {
        page_location: `${window.location.origin}${window.location.pathname}`,
        page_referrer: '',
        method: 'email',
      },
    ]);
  });

  it('nigdy nie wysyła query stringa w page_location (tokeny resetu/weryfikacji żyją w ?token=)', () => {
    window.history.replaceState(null, '', '/reset-password?token=super-secret');
    const gtag = loadModule();
    gtag.enable();
    gtag.trackEvent('page_view', { page_path: '/reset-password' });

    const eventCall = dataLayerCalls().find((args) => args[0] === 'event' && args[1] === 'page_view');
    expect(eventCall).toBeDefined();
    expect(eventCall[2].page_location).toBe(`${window.location.origin}/reset-password`);
    expect(eventCall[2].page_location).not.toContain('?');
    expect(eventCall[2].page_location).not.toContain('super-secret');
  });

  it('nigdy nie wysyła query stringa z document.referrer w page_referrer', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://playrpg.net/reset-password?token=secret123',
      configurable: true,
    });
    const gtag = loadModule();
    gtag.enable();
    gtag.trackEvent('login');

    const eventCall = dataLayerCalls().find((args) => args[0] === 'event' && args[1] === 'login');
    expect(eventCall).toBeDefined();
    // Pinujemy dokładną wartość (tak jak page_location wyżej) — samo
    // .not.toContain('?')/.not.toContain('secret123') przepuściłoby też literalne 'x'.
    expect(eventCall[2].page_referrer).toBe('https://playrpg.net/reset-password');
    expect(eventCall[2].page_referrer).not.toContain('?');
    expect(eventCall[2].page_referrer).not.toContain('secret123');
  });

  it('enable() ustawia sanitized page_location i page_referrer jako domyślne dla wszystkich eventów (w tym generowanych przez enhanced measurement)', () => {
    window.history.replaceState(null, '', '/reset-password?token=super-secret');
    Object.defineProperty(document, 'referrer', {
      value: 'https://playrpg.net/some-page?token=secret123',
      configurable: true,
    });
    const gtag = loadModule();
    gtag.enable();

    expect(dataLayerCalls()).toContainEqual([
      'set',
      {
        page_location: `${window.location.origin}/reset-password`,
        page_referrer: 'https://playrpg.net/some-page',
      },
    ]);
  });

  it('enable() wysyła gtag w porządku: js, set, config', () => {
    const gtag = loadModule();
    gtag.enable();

    const calls = dataLayerCalls();
    const jsIndex = calls.findIndex((args) => args[0] === 'js');
    const setIndex = calls.findIndex((args) => args[0] === 'set' && args[1]?.page_location !== undefined);
    const configIndex = calls.findIndex((args) => args[0] === 'config');

    expect(jsIndex).not.toBe(-1);
    expect(setIndex).not.toBe(-1);
    expect(configIndex).not.toBe(-1);
    expect(jsIndex < setIndex && setIndex < configIndex).toBe(true);
  });

  it('enable() wciąż wysyła setPageContext na drugiej zgrodzie (po wycofaniu i ponownym udzieleniu zgody)', () => {
    const gtag = loadModule();
    gtag.enable();
    const callsAfterFirstEnable = dataLayerCalls().length;

    gtag.disable();
    gtag.enable();
    const callsAfterSecondEnable = dataLayerCalls().length;

    // Powinniśmy mieć drugi 'set' z oczyszczoną page_location i page_referrer
    const setWithPageLocation = dataLayerCalls().filter((args) => args[0] === 'set' && args[1]?.page_location !== undefined);
    expect(setWithPageLocation).toHaveLength(2);

    // Skrypt powinien być wstrzyknięty tylko raz
    expect(scriptTags()).toHaveLength(1);
  });

  it('caller nie może nadpisać sanitized page_location/page_referrer przez własne params', () => {
    const gtag = loadModule();
    gtag.enable();
    gtag.trackEvent('sign_up', { page_location: 'https://evil.example/?token=x' });

    const eventCall = dataLayerCalls().find((args) => args[0] === 'event' && args[1] === 'sign_up');
    expect(eventCall).toBeDefined();
    expect(eventCall[2].page_location).toBe(`${window.location.origin}${window.location.pathname}`);
    expect(eventCall[2].page_location).not.toContain('evil.example');
  });

  it('disable() ucisza już załadowany skrypt i podnosi oficjalny wyłącznik GA', () => {
    const gtag = loadModule();
    gtag.enable();
    gtag.disable();
    gtag.trackEvent('login', { method: 'email' });
    expect(window[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    expect(dataLayerCalls()).not.toContainEqual(['event', 'login', { method: 'email' }]);
  });

  it('zapamiętuje user_id ustawione przed zgodą i wysyła je po enable()', () => {
    const gtag = loadModule();
    gtag.setUserId('507f1f77bcf86cd799439011');
    expect(window.dataLayer).toBeUndefined();
    gtag.enable();
    expect(dataLayerCalls()).toContainEqual(['set', { user_id: '507f1f77bcf86cd799439011' }]);
  });

  it('bez measurement ID nie robi nic', () => {
    const gtag = loadModule('');
    expect(gtag.isConfigured()).toBe(false);
    gtag.enable();
    expect(scriptTags()).toHaveLength(0);
  });
});

describe('clearGaCookies (przez disable())', () => {
  const originalLocation = window.location;

  const setHostname = (hostname) => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname,
        origin: `https://${hostname}`,
        pathname: '/',
        search: '',
        href: `https://${hostname}/`,
      },
      writable: true,
      configurable: true,
    });
  };

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('usuwa _ga i _ga_<ID> ustawione dla bieżącej domeny', () => {
    document.cookie = '_ga=GA1.1.123; path=/';
    document.cookie = '_ga_G-TEST123=GS1.1.456; path=/';
    expect(document.cookie).toContain('_ga=GA1.1.123');
    expect(document.cookie).toContain('_ga_G-TEST123=GS1.1.456');

    const gtag = loadModule();
    gtag.enable();
    gtag.disable();

    expect(document.cookie).not.toContain('_ga=GA1.1.123');
    expect(document.cookie).not.toContain('_ga_G-TEST123=GS1.1.456');
  });

  // I4: GA zapisuje _ga na najwyższej rejestrowalnej domenie (.playrpg.net), więc
  // na www.playrpg.net trzeba spróbować skasować cookie na każdym poziomie etykiet
  // hosta, nie tylko na domain=.www.playrpg.net (który niczego nie dopasuje).
  it('przy wielopoziomowym hoście próbuje skasować cookie na każdym poziomie etykiet', () => {
    setHostname('www.playrpg.net');
    document.cookie = '_ga=GA1.1.123; path=/';

    const cookieSetSpy = jest.spyOn(document, 'cookie', 'set');
    const gtag = loadModule();
    gtag.enable();
    gtag.disable();

    const assignments = cookieSetSpy.mock.calls.map((call) => call[0]);
    expect(assignments.some((a) => a.startsWith('_ga=') && a.includes('domain=.www.playrpg.net'))).toBe(true);
    expect(assignments.some((a) => a.startsWith('_ga=') && a.includes('domain=.playrpg.net') && !a.includes('.www.'))).toBe(true);
    expect(assignments.some((a) => a.startsWith('_ga=') && !a.includes('domain='))).toBe(true);

    cookieSetSpy.mockRestore();
  });
});
