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

  // PLAYRPG-303: the game invite link carries its secret in the PATH (/join/<token>), so cutting
  // the query string is not enough — the token segment has to go too.
  it('never sends the invite token from /join/<token> in page_location or page_referrer', () => {
    window.history.replaceState(null, '', '/join/sekretnyToken123');
    Object.defineProperty(document, 'referrer', {
      value: 'https://playrpg.net/join/innyToken456',
      configurable: true,
    });
    const gtag = loadModule();
    gtag.enable();
    gtag.trackEvent('page_view', { page_path: '/join/sekretnyToken123' });

    const eventCall = dataLayerCalls().find((args) => args[0] === 'event' && args[1] === 'page_view');
    expect(eventCall[2].page_location).toBe(`${window.location.origin}/join`);
    expect(eventCall[2].page_referrer).toBe('https://playrpg.net/join');
    // The caller's page_path is sanitized too, not trusted.
    expect(eventCall[2].page_path).toBe('/join');
    expect(JSON.stringify(dataLayerCalls())).not.toMatch(/sekretnyToken123|innyToken456/);
  });

  it('sanitizePath strips only the invite token segment', () => {
    const { sanitizePath } = loadModule();
    expect(sanitizePath('/join/abc-_123')).toBe('/join');
    expect(sanitizePath('/join/abc/extra')).toBe('/join');
    expect(sanitizePath('/join')).toBe('/join');
    expect(sanitizePath('/games')).toBe('/games');
    expect(sanitizePath('/joined/x')).toBe('/joined/x');
  });

  // PLAYRPG-338: a game session lives at /games/<id>. The id is not a secret, but every game would
  // be its own page in the reports — GA gets one placeholder path for all sessions.
  it('sanitizePath collapses a game session path to /games/:id', () => {
    const { sanitizePath } = loadModule();
    expect(sanitizePath('/games/6731a2f0c9e4b1d2a3f45678')).toBe('/games/:id');
    expect(sanitizePath('/games/6731a2f0c9e4b1d2a3f45678/extra')).toBe('/games/:id');
    expect(sanitizePath('/games')).toBe('/games');
    expect(sanitizePath('/games/')).toBe('/games/');
    expect(sanitizePath('/gamesx/1')).toBe('/gamesx/1');
  });

  it('never sends the game id in page_location, page_referrer or page_path', () => {
    window.history.replaceState(null, '', '/games/6731a2f0c9e4b1d2a3f45678');
    Object.defineProperty(document, 'referrer', {
      value: 'https://playrpg.net/games/aaaabbbbccccddddeeeeffff',
      configurable: true,
    });
    const gtag = loadModule();
    gtag.enable();
    gtag.trackEvent('page_view', { page_path: '/games/6731a2f0c9e4b1d2a3f45678' });

    const eventCall = dataLayerCalls().find((args) => args[0] === 'event' && args[1] === 'page_view');
    expect(eventCall[2].page_location).toBe(`${window.location.origin}/games/:id`);
    expect(eventCall[2].page_referrer).toBe('https://playrpg.net/games/:id');
    expect(eventCall[2].page_path).toBe('/games/:id');
    expect(JSON.stringify(dataLayerCalls())).not.toMatch(/6731a2f0c9e4b1d2a3f45678|aaaabbbbccccddddeeeeffff/);
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

  // Production case: on the apex host gtag's cookie_domain 'auto' writes _ga and
  // _ga_<ID without "G-"> with domain=.playrpg.net. A host-only delete (no domain attribute)
  // does not match a domain cookie, so the .playrpg.net variant is the one that matters.
  it('on playrpg.net deletes _ga and the _ga_<ID> session cookie with domain=.playrpg.net', () => {
    setHostname('playrpg.net');
    document.cookie = '_ga=GA1.1.123; path=/';
    document.cookie = '_ga_TEST123=GS1.1.456; path=/';

    const cookieSetSpy = jest.spyOn(document, 'cookie', 'set');
    const gtag = loadModule();
    gtag.enable();
    gtag.disable();

    const assignments = cookieSetSpy.mock.calls.map((call) => call[0]);
    ['_ga', '_ga_TEST123'].forEach((name) => {
      expect(assignments).toContain(`${name}=; Max-Age=0; path=/; domain=.playrpg.net`);
      expect(assignments).toContain(`${name}=; Max-Age=0; path=/`);
    });

    cookieSetSpy.mockRestore();
  });
});
