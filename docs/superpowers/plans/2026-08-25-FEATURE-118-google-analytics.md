# FEATURE-118 — Google Analytics 4 + zgoda RODO — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zmierzyć ruch i lejek pozyskania użytkownika w GA4, z banerem zgody, który blokuje załadowanie `gtag.js` do momentu jej udzielenia.

**Architecture:** Własny moduł `src/analytics/gtag.js` jest jedynym miejscem znającym `window.gtag`; wstrzykuje skrypt dynamicznie i trzyma flagę `enabled`. `ConsentContext` przechowuje wyłącznie decyzję użytkownika i nie wie o istnieniu GA — łączy je komponent-most `AnalyticsGate`. Eventy wpinane jawnie w miejscach sukcesu, nigdy w interceptorze axios.

**Tech Stack:** React 19 (CRA 5, StrictMode), react-router-dom 6, MUI 7, i18next, Jest + Testing Library. Backend: Go + Gin. Zero nowych zależności npm.

Spec: `docs/superpowers/specs/2026-08-25-FEATURE-118-google-analytics-design.md`

## Global Constraints

- Zero nowych zależności npm. `gtag.js` wstrzykiwany ręcznie.
- Skrypt GA **nie może** trafić do DOM przed zgodą. Żaden statyczny `<script>` w `public/index.html`.
- Jedyne miejsce dotykające `window.gtag` / `window.dataLayer` to `src/analytics/gtag.js`.
- `ConsentContext` **nie importuje** niczego z `src/analytics/gtag.js`.
- Nigdy nie wysyłamy adresu e-mail ani żadnego innego PII do GA. Wyłącznie `user_id` (ObjectID z Mongo).
- Nazwy eventów: `page_view`, `sign_up`, `email_verified`, `login`, `game_created` — dokładnie te, w `snake_case`.
- Klucz w localStorage: `analytics-consent`. Wartości: `granted` | `denied`.
- Zmienna konfiguracyjna: `REACT_APP_GA_MEASUREMENT_ID`. Pusta = wszystko wyłączone, baner ukryty.
- Wszystkie stringi UI przez `t('klucz')`, klucze angielskie, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`.
- Każdy dostęp do `localStorage` w `try/catch` — tryb prywatny rzuca wyjątkiem.
- Baner: przyciski „Akceptuję" i „Odrzucam" o równej wadze wizualnej (wymóg RODO). Treść nazywa konkretny cel, nie ogólne „pliki cookies".
- Testy uruchamiane: `CI=true npx jest --config` przez `npm test`. Znany baseline: `App.test.js` wywala się na błędzie ESM w axios — to nie jest regresja.

## Odstępstwa od specu (świadome)

1. Spec wymieniał `src/analytics/useAnalytics.js`. **Pomijamy** — byłby to pusty re-export `trackEvent`. Komponenty importują `trackEvent` prosto z `analytics/gtag`. Moduł sam no-opuje, gdy zgody brak, więc opakowanie nic nie wnosi (YAGNI).
2. Dochodzi plik nienazwany wprost w specu: `src/analytics/AnalyticsGate.jsx` — most zgoda→GA. Spec opisywał tę granicę, ale nie nadał jej pliku.

## Struktura plików

**Nowe:**
| Plik | Odpowiedzialność |
|---|---|
| `src/analytics/gtag.js` | transport: wstrzyknięcie skryptu, `enable`/`disable`/`trackEvent`/`setUserId` |
| `src/analytics/gtag.test.js` | testy modułu transportu |
| `src/analytics/ConsentContext.jsx` | stan zgody + localStorage; zero wiedzy o GA |
| `src/analytics/ConsentContext.test.jsx` | testy odczytu/zapisu/wyjątku |
| `src/analytics/AnalyticsGate.jsx` | most: `consent === 'granted'` → `enable()`, inaczej `disable()` |
| `src/analytics/usePageViews.js` | `useLocation()` → `page_view` |
| `src/components/consent/ConsentBanner.jsx` | UI banera |
| `src/components/consent/ConsentBanner.css` | style banera (BEM) |
| `src/components/PrivacyPolicy.jsx` | strona `/privacy` |
| `src/components/settings/PrivacySettings.jsx` | wycofanie zgody w ustawieniach |

**Modyfikowane:**
| Plik | Zmiana |
|---|---|
| `src/App.js` | `ConsentProvider`, `AnalyticsGate`, `ConsentBanner`, `PageViewTracker`, route `/privacy`, `setUserId` w logowaniu i wylogowaniu |
| `src/components/Register.jsx:73` | `sign_up` |
| `src/components/Login.jsx:52` | `login` + przekazanie `user_id` |
| `src/components/EmailVerification.jsx:34` | `email_verified` |
| `src/components/GameLobby.jsx:46` | `game_created` |
| `src/components/settings/SettingsPage.jsx` | sekcja `privacy` |
| `src/components/settings/SettingsSidebar.jsx` | pozycja `privacy` |
| `src/locales/en/translation.json`, `src/locales/pl/translation.json` | klucze `consent.*`, `privacy.*`, `userSettings.privacy.*` |
| `warhammer-battle-helper-backend/internal/http/AuthHandler.go:125` | `/login` zwraca `user_id` |
| `warhammer-battle-helper-front/Dockerfile.prod` | `ARG` + `ENV` |
| `docker-compose.prod.yml` | `args:` dla `frontend` |
| `.env.prod.example`, `warhammer-battle-helper-front/ENV_SETUP.md` | dokumentacja zmiennej |

---

### Task 1: Moduł transportu `gtag.js`

Serce feature'u. Sam wstrzykuje skrypt, sam pilnuje, żeby nie zrobić tego dwa razy, i sam potrafi się uciszyć po cofnięciu zgody.

**Files:**
- Create: `warhammer-battle-helper-front/src/analytics/gtag.js`
- Test: `warhammer-battle-helper-front/src/analytics/gtag.test.js`

**Interfaces:**
- Consumes: nic
- Produces:
  - `isConfigured(): boolean`
  - `enable(): void`
  - `disable(): void`
  - `trackEvent(name: string, params?: object): void`
  - `setUserId(userId: string | null): void`

- [ ] **Step 1: Napisz testy**

Plik `warhammer-battle-helper-front/src/analytics/gtag.test.js`:

```js
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
    expect(dataLayerCalls()).toContainEqual(['event', 'sign_up', { method: 'email' }]);
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
```

- [ ] **Step 2: Uruchom testy — mają nie przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "analytics/gtag" --watchAll=false`
Expected: FAIL — `Cannot find module './gtag'`

- [ ] **Step 3: Zaimplementuj moduł**

Plik `warhammer-battle-helper-front/src/analytics/gtag.js`:

```js
// Jedyne miejsce w aplikacji, które zna window.gtag / window.dataLayer.
//
// Dlaczego wstrzykujemy skrypt ręcznie zamiast wpisać <script> do index.html:
// gtag.js już przy samym załadowaniu wysyła żądanie do Google (a więc IP użytkownika,
// czyli dane osobowe) i zapisuje cookie _ga. Statycznego tagu nie da się pogodzić
// ze zgodą — jedyny punkt kontroli to decyzja, czy w ogóle go wstrzyknąć.

const MEASUREMENT_ID = process.env.REACT_APP_GA_MEASUREMENT_ID || '';

let injected = false;
let enabled = false;
let currentUserId = null;

export const isConfigured = () => Boolean(MEASUREMENT_ID);

// Dokładnie ta forma co w oficjalnym snippecie Google: gtag.js czyta z dataLayer
// obiekty `arguments`, nie zwykłe tablice.
function gtag() {
    window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
}

const clearGaCookies = () => {
    document.cookie
        .split(';')
        .map((entry) => entry.split('=')[0].trim())
        .filter((name) => name === '_ga' || name.startsWith('_ga_'))
        .forEach((name) => {
            document.cookie = `${name}=; Max-Age=0; path=/`;
            document.cookie = `${name}=; Max-Age=0; path=/; domain=.${window.location.hostname}`;
        });
};

export const enable = () => {
    if (!isConfigured()) return;

    enabled = true;
    window[`ga-disable-${MEASUREMENT_ID}`] = false;

    if (!injected) {
        injected = true;
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
        document.head.appendChild(script);

        gtag('js', new Date());
        // send_page_view: false — pageview'y wysyła usePageViews przy zmianie routa.
        // Bez tego pierwsze wejście policzyłoby się dwa razy.
        gtag('config', MEASUREMENT_ID, { send_page_view: false });
    }

    if (currentUserId) gtag('set', { user_id: currentUserId });
};

export const disable = () => {
    enabled = false;
    if (isConfigured()) window[`ga-disable-${MEASUREMENT_ID}`] = true;
    clearGaCookies();
};

export const trackEvent = (name, params = {}) => {
    if (!enabled) return;
    gtag('event', name, params);
};

// Wołane także przed udzieleniem zgody (np. przy starcie z zapisanym tokenem).
// Zapamiętujemy wartość i wysyłamy ją dopiero, gdy GA wolno działać.
export const setUserId = (userId) => {
    currentUserId = userId;
    if (!enabled) return;
    gtag('set', { user_id: userId });
};
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "analytics/gtag" --watchAll=false`
Expected: PASS, 7 testów

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/analytics/gtag.js warhammer-battle-helper-front/src/analytics/gtag.test.js
git commit -m "feat(front): FEATURE-118 add consent-gated gtag transport module"
```

---

### Task 2: `ConsentContext`

Trzyma decyzję użytkownika i nic poza tym. Świadomie nie wie o GA — dzięki temu pod tę samą zgodę da się później podpiąć inny skrypt third-party.

**Files:**
- Create: `warhammer-battle-helper-front/src/analytics/ConsentContext.jsx`
- Test: `warhammer-battle-helper-front/src/analytics/ConsentContext.test.jsx`

**Interfaces:**
- Consumes: nic
- Produces:
  - `CONSENT_GRANTED = 'granted'`, `CONSENT_DENIED = 'denied'`, `CONSENT_STORAGE_KEY = 'analytics-consent'`
  - `<ConsentProvider>{children}</ConsentProvider>`
  - `useConsent(): { consent: 'granted' | 'denied' | null, grant(): void, deny(): void }`

- [ ] **Step 1: Napisz testy**

Plik `warhammer-battle-helper-front/src/analytics/ConsentContext.test.jsx`:

```jsx
import { renderHook, act } from '@testing-library/react';
import { ConsentProvider, useConsent, CONSENT_STORAGE_KEY } from './ConsentContext';

const wrapper = ({ children }) => <ConsentProvider>{children}</ConsentProvider>;

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('ConsentContext', () => {
  it('startuje bez decyzji, gdy localStorage jest pusty', () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();
  });

  it('czyta zapisaną decyzję przy starcie', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBe('granted');
  });

  it('ignoruje śmieci w localStorage', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'maybe');
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();
  });

  it('grant() i deny() zapisują decyzję', () => {
    const { result } = renderHook(() => useConsent(), { wrapper });

    act(() => result.current.grant());
    expect(result.current.consent).toBe('granted');
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted');

    act(() => result.current.deny());
    expect(result.current.consent).toBe('denied');
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
  });

  it('przeżywa localStorage rzucający wyjątkiem (tryb prywatny)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied');
    });

    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();

    act(() => result.current.grant());
    expect(result.current.consent).toBe('granted');
  });

  it('useConsent poza providerem rzuca wyjątkiem zamiast po cichu nie działać', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useConsent())).toThrow(/ConsentProvider/);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają nie przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "ConsentContext" --watchAll=false`
Expected: FAIL — `Cannot find module './ConsentContext'`

- [ ] **Step 3: Zaimplementuj kontekst**

Plik `warhammer-battle-helper-front/src/analytics/ConsentContext.jsx`:

```jsx
import React, { createContext, useCallback, useContext, useState } from 'react';

export const CONSENT_STORAGE_KEY = 'analytics-consent';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

const ConsentContext = createContext(null);

// localStorage rzuca w trybie prywatnym niektórych przeglądarek — brak zapisu
// oznacza po prostu, że baner pokaże się ponownie, a nie że aplikacja ma paść.
const readStored = () => {
    try {
        const value = localStorage.getItem(CONSENT_STORAGE_KEY);
        return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : null;
    } catch (e) {
        return null;
    }
};

const writeStored = (value) => {
    try {
        localStorage.setItem(CONSENT_STORAGE_KEY, value);
    } catch (e) {
        // Decyzja żyje wtedy tylko do końca sesji.
    }
};

export const ConsentProvider = ({ children }) => {
    const [consent, setConsent] = useState(readStored);

    const decide = useCallback((value) => {
        writeStored(value);
        setConsent(value);
    }, []);

    const grant = useCallback(() => decide(CONSENT_GRANTED), [decide]);
    const deny = useCallback(() => decide(CONSENT_DENIED), [decide]);

    return (
        <ConsentContext.Provider value={{ consent, grant, deny }}>
            {children}
        </ConsentContext.Provider>
    );
};

export const useConsent = () => {
    const ctx = useContext(ConsentContext);
    if (!ctx) throw new Error('useConsent must be used inside a ConsentProvider');
    return ctx;
};
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "ConsentContext" --watchAll=false`
Expected: PASS, 6 testów

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/analytics/ConsentContext.jsx warhammer-battle-helper-front/src/analytics/ConsentContext.test.jsx
git commit -m "feat(front): FEATURE-118 add ConsentContext with localStorage persistence"
```

---

### Task 3: Most `AnalyticsGate` + tłumaczenia + baner zgody

Łączy Task 1 z Task 2 i daje użytkownikowi UI. Po tym zadaniu feature działa end-to-end dla samego ładowania GA.

**Files:**
- Create: `warhammer-battle-helper-front/src/analytics/AnalyticsGate.jsx`
- Create: `warhammer-battle-helper-front/src/components/consent/ConsentBanner.jsx`
- Create: `warhammer-battle-helper-front/src/components/consent/ConsentBanner.css`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Modify: `warhammer-battle-helper-front/src/App.js`
- Test: `warhammer-battle-helper-front/src/analytics/AnalyticsGate.test.jsx`

**Interfaces:**
- Consumes: `useConsent`, `CONSENT_GRANTED` (Task 2); `enable`, `disable` (Task 1)
- Produces: `<AnalyticsGate />` (renderuje `null`), `<ConsentBanner />`

- [ ] **Step 1: Napisz test mostu**

Plik `warhammer-battle-helper-front/src/analytics/AnalyticsGate.test.jsx`:

```jsx
import { render } from '@testing-library/react';
import AnalyticsGate from './AnalyticsGate';
import { ConsentProvider, CONSENT_STORAGE_KEY } from './ConsentContext';
import { enable, disable } from './gtag';

jest.mock('./gtag', () => ({
  enable: jest.fn(),
  disable: jest.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('AnalyticsGate', () => {
  it('nie włącza GA, gdy decyzji nie ma', () => {
    render(<ConsentProvider><AnalyticsGate /></ConsentProvider>);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).toHaveBeenCalled();
  });

  it('włącza GA, gdy zgoda jest zapisana', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    render(<ConsentProvider><AnalyticsGate /></ConsentProvider>);
    expect(enable).toHaveBeenCalled();
  });

  it('nie włącza GA po odmowie', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
    render(<ConsentProvider><AnalyticsGate /></ConsentProvider>);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "AnalyticsGate" --watchAll=false`
Expected: FAIL — `Cannot find module './AnalyticsGate'`

- [ ] **Step 3: Zaimplementuj most**

Plik `warhammer-battle-helper-front/src/analytics/AnalyticsGate.jsx`:

```jsx
import { useEffect } from 'react';
import { useConsent, CONSENT_GRANTED } from './ConsentContext';
import { enable, disable } from './gtag';

// Jedyny punkt styku między decyzją użytkownika a Google Analytics.
// ConsentContext celowo nie wie o GA — kolejny skrypt third-party dopina się tutaj,
// jako drugi subskrybent, bez przebudowy kontekstu.
const AnalyticsGate = () => {
    const { consent } = useConsent();

    useEffect(() => {
        if (consent === CONSENT_GRANTED) enable();
        else disable();
    }, [consent]);

    return null;
};

export default AnalyticsGate;
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "AnalyticsGate" --watchAll=false`
Expected: PASS, 3 testy

- [ ] **Step 5: Dodaj klucze i18n (angielskie)**

W `warhammer-battle-helper-front/src/locales/en/translation.json` dodaj na najwyższym poziomie, po bloku `"auth"`:

```json
  "consent": {
    "title": "Analytics consent",
    "message": "We use Google Analytics to see how the site is used. It stores cookies on your device and sends data to Google. Nothing happens until you decide.",
    "accept": "Accept",
    "decline": "Decline",
    "privacyLink": "Privacy policy"
  },
```

- [ ] **Step 6: Dodaj klucze i18n (polskie)**

W `warhammer-battle-helper-front/src/locales/pl/translation.json`, w tym samym miejscu:

```json
  "consent": {
    "title": "Zgoda na analitykę",
    "message": "Używamy Google Analytics, żeby zobaczyć, jak korzystacie z serwisu. Zapisuje to pliki cookie na Twoim urządzeniu i wysyła dane do Google. Nic się nie dzieje, dopóki nie zdecydujesz.",
    "accept": "Akceptuję",
    "decline": "Odrzucam",
    "privacyLink": "Polityka prywatności"
  },
```

- [ ] **Step 7: Zaimplementuj baner**

Plik `warhammer-battle-helper-front/src/components/consent/ConsentBanner.jsx`:

```jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConsent } from '../../analytics/ConsentContext';
import { isConfigured } from '../../analytics/gtag';
import './ConsentBanner.css';

const ConsentBanner = () => {
    const { t } = useTranslation();
    const { consent, grant, deny } = useConsent();

    // Bez measurement ID nie ma czego akceptować — baner nie ma prawa się pokazać
    // w dev ani w buildzie bez skonfigurowanego GA.
    if (!isConfigured() || consent !== null) return null;

    return (
        <div className="consent-banner" role="dialog" aria-label={t('consent.title')}>
            <div className="consent-banner__text">
                <strong className="consent-banner__title">{t('consent.title')}</strong>
                <span>{t('consent.message')}</span>
                <Link className="consent-banner__link" to="/privacy">
                    {t('consent.privacyLink')}
                </Link>
            </div>
            <div className="consent-banner__actions">
                {/* Oba przyciski mają identyczny styl — RODO wymaga, żeby odmowa
                    była tak samo łatwa jak zgoda. To nie jest decyzja estetyczna. */}
                <button type="button" className="consent-banner__button" onClick={deny}>
                    {t('consent.decline')}
                </button>
                <button type="button" className="consent-banner__button" onClick={grant}>
                    {t('consent.accept')}
                </button>
            </div>
        </div>
    );
};

export default ConsentBanner;
```

- [ ] **Step 8: Dodaj style**

Plik `warhammer-battle-helper-front/src/components/consent/ConsentBanner.css`:

```css
.consent-banner {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2000;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 24px;
    background: linear-gradient(135deg, #2b2118 0%, #3a2f1f 100%);
    border-top: 2px solid #7a5c42;
    color: #e8d5b7;
    font-family: 'Crimson Text', serif;
}

.consent-banner__text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 720px;
    font-size: 15px;
    line-height: 1.4;
}

.consent-banner__title {
    font-family: 'Cinzel', serif;
    color: #c9975b;
    letter-spacing: 0.5px;
}

.consent-banner__link {
    color: #c9975b;
    text-decoration: underline;
    width: fit-content;
}

.consent-banner__actions {
    display: flex;
    gap: 12px;
}

.consent-banner__button {
    min-width: 120px;
    padding: 10px 18px;
    background: #7a5c42;
    color: #f4e8d8;
    border: 1px solid #c4a882;
    border-radius: 4px;
    font-family: 'Cinzel', serif;
    font-size: 14px;
    cursor: pointer;
}

.consent-banner__button:hover {
    background: #8f6d4e;
}
```

- [ ] **Step 9: Wepnij w `App.js`**

W `warhammer-battle-helper-front/src/App.js` dodaj importy pod istniejącymi importami komponentów:

```js
import { ConsentProvider } from './analytics/ConsentContext';
import AnalyticsGate from './analytics/AnalyticsGate';
import ConsentBanner from './components/consent/ConsentBanner';
```

Następnie owiń zawartość `ThemeProvider`. Zamień:

```jsx
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Router>
                <div className="App">
```

na:

```jsx
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <ConsentProvider>
                <AnalyticsGate />
                <Router>
                    <ConsentBanner />
                    <div className="App">
```

i domknij — zamień:

```jsx
                </div>
            </Router>
        </ThemeProvider>
```

na:

```jsx
                    </div>
                </Router>
            </ConsentProvider>
        </ThemeProvider>
```

Uwaga na wcięcia: cała zawartość między tymi znacznikami przesuwa się o jeden poziom. `ConsentBanner` musi być **wewnątrz** `Router`, bo używa `<Link to="/privacy">`.

- [ ] **Step 10: Uruchom cały zestaw testów**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`
Expected: PASS wszędzie poza znanym `App.test.js` (błąd ESM w axios — baseline sprzed zmiany)

- [ ] **Step 11: Commit**

```bash
git add warhammer-battle-helper-front/src/analytics warhammer-battle-helper-front/src/components/consent warhammer-battle-helper-front/src/locales warhammer-battle-helper-front/src/App.js
git commit -m "feat(front): FEATURE-118 add consent banner gating Google Analytics"
```

---

### Task 4: Pageview'y

**Files:**
- Create: `warhammer-battle-helper-front/src/analytics/usePageViews.js`
- Modify: `warhammer-battle-helper-front/src/App.js`
- Test: `warhammer-battle-helper-front/src/analytics/usePageViews.test.jsx`

**Interfaces:**
- Consumes: `trackEvent` (Task 1), `useLocation` z `react-router-dom`
- Produces: `usePageViews(): void`, `<PageViewTracker />` (lokalny komponent w `App.js`)

- [ ] **Step 1: Napisz test**

Plik `warhammer-battle-helper-front/src/analytics/usePageViews.test.jsx`:

```jsx
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { usePageViews } from './usePageViews';
import { trackEvent } from './gtag';

jest.mock('./gtag', () => ({ trackEvent: jest.fn() }));

const Tracker = () => {
  usePageViews();
  return null;
};

beforeEach(() => jest.clearAllMocks());

describe('usePageViews', () => {
  it('wysyła page_view ze ścieżką bieżącego routa', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Tracker />
        <Routes><Route path="/register" element={<div />} /></Routes>
      </MemoryRouter>
    );
    expect(trackEvent).toHaveBeenCalledWith('page_view', { page_path: '/register' });
  });

  it('nie wysyła duplikatu przy re-renderze bez zmiany ścieżki', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/login']}><Tracker /></MemoryRouter>
    );
    rerender(<MemoryRouter initialEntries={['/login']}><Tracker /></MemoryRouter>);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "usePageViews" --watchAll=false`
Expected: FAIL — `Cannot find module './usePageViews'`

- [ ] **Step 3: Zaimplementuj hook**

Plik `warhammer-battle-helper-front/src/analytics/usePageViews.js`:

```js
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackEvent } from './gtag';

// Świadome ograniczenie: lobby i sesja gry nie są routami (currentGameId to stan
// w App.js), więc pageview'y pokażą tylko ekrany logowania, rejestracji, ustawień
// i „/". Lejek opiera się na eventach, nie na pageview'ach.
export const usePageViews = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        trackEvent('page_view', { page_path: pathname });
    }, [pathname]);
};

export default usePageViews;
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "usePageViews" --watchAll=false`
Expected: PASS, 2 testy

- [ ] **Step 5: Wepnij w `App.js`**

Dodaj import:

```js
import { usePageViews } from './analytics/usePageViews';
```

Nad `function App()` dodaj mały komponent — `usePageViews` wymaga kontekstu routera, więc nie da się go wywołać w samym `App`, które renderuje `Router` dopiero w JSX:

```jsx
// usePageViews potrzebuje useLocation, a więc kontekstu Routera. App renderuje
// Router dopiero w swoim JSX, dlatego hook mieszka w osobnym komponencie w środku.
const PageViewTracker = () => {
    usePageViews();
    return null;
};
```

W JSX, tuż pod `<ConsentBanner />`:

```jsx
                    <PageViewTracker />
```

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/analytics/usePageViews.js warhammer-battle-helper-front/src/analytics/usePageViews.test.jsx warhammer-battle-helper-front/src/App.js
git commit -m "feat(front): FEATURE-118 send page_view on route change"
```

---

### Task 5: Eventy lejka

Cztery jawne wywołania w miejscach sukcesu. Świadomie **nie** w interceptorze `axiosInstance` — globalny interceptor rozlewa analitykę po całej aplikacji niewidocznie.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/Register.jsx`
- Modify: `warhammer-battle-helper-front/src/components/Login.jsx`
- Modify: `warhammer-battle-helper-front/src/components/EmailVerification.jsx`
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx`

**Interfaces:**
- Consumes: `trackEvent` (Task 1)
- Produces: eventy `sign_up`, `login`, `email_verified`, `game_created` w GA

- [ ] **Step 1: `sign_up` w `Register.jsx`**

Dodaj import:

```js
import { trackEvent } from '../analytics/gtag';
```

W `handleSubmit`, w bloku `try`, zaraz po `setSuccess(t('auth.registrationSuccess'));`:

```js
            trackEvent('sign_up', { method: 'email' });
```

- [ ] **Step 2: `login` w `Login.jsx`**

Dodaj import:

```js
import { trackEvent } from '../analytics/gtag';
```

W `handleSubmit`, po `addLogMessage(\`Successfully logged in as ${formData.email}\`, 'success');`:

```js
            trackEvent('login', { method: 'email' });
```

- [ ] **Step 3: `email_verified` w `EmailVerification.jsx`**

Dodaj import:

```js
import { trackEvent } from '../analytics/gtag';
```

Zamień:

```js
            .then(() => setStatus('success'))
```

na:

```js
            .then(() => {
                setStatus('success');
                trackEvent('email_verified');
            })
```

- [ ] **Step 4: `game_created` w `GameLobby.jsx`**

Dodaj import:

```js
import { trackEvent } from '../analytics/gtag';
```

W `handleCreateGame` zamień:

```js
    const game = await createGame(payload);
    if (!game) return;
    setCreateOpen(false);
    onJoinGame(game.id);
```

na:

```js
    const game = await createGame(payload);
    if (!game) return;
    trackEvent('game_created', { game_system: game.gameSystem });
    setCreateOpen(false);
    onJoinGame(game.id);
```

- [ ] **Step 5: Sprawdź, że nic nie pękło**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`
Expected: PASS poza znanym `App.test.js`

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/Register.jsx warhammer-battle-helper-front/src/components/Login.jsx warhammer-battle-helper-front/src/components/EmailVerification.jsx warhammer-battle-helper-front/src/components/GameLobby.jsx
git commit -m "feat(front): FEATURE-118 track signup funnel events"
```

---

### Task 6: `user_id` — backend + front

`/login` zwraca dziś wyłącznie `{token}`, więc front nie zna `user_id` w momencie logowania. Dokładamy pole (zmiana addytywna) i przekazujemy je do GA.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/AuthHandler.go:125`
- Modify: `warhammer-battle-helper-front/src/components/Login.jsx`
- Modify: `warhammer-battle-helper-front/src/App.js`

**Interfaces:**
- Consumes: `setUserId` (Task 1)
- Produces: `POST /login` → `{ token, user_id }`; `onLogin(email, token, userId)`

- [ ] **Step 1: Backend — dołóż `user_id` do odpowiedzi `/login`**

W `warhammer-battle-helper-backend/internal/http/AuthHandler.go` zamień linię 125:

```go
	c.JSON(http.StatusOK, gin.H{"token": token})
```

na:

```go
	c.JSON(http.StatusOK, gin.H{"token": token, "user_id": user.ID.Hex()})
```

Zmiana jest addytywna — istniejący klient czytający `response.data.token` działa dalej.

- [ ] **Step 2: Zweryfikuj kompilację backendu**

Run: `cd warhammer-battle-helper-backend && go build ./...`
Expected: brak wyjścia (sukces)

Bez testu jednostkowego: `AuthHandler` nie ma dziś żadnego testu i nie ma wstrzykiwanego repozytorium — postawienie atrapy pod jedno pole odpowiedzi kosztowałoby więcej niż wnosi. Weryfikacja w Step 3 jest end-to-end.

- [ ] **Step 3: Zweryfikuj odpowiedź na żywym stacku**

```bash
docker compose up -d --build backend
curl -s -X POST http://localhost:8080/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<twoj-testowy-email>","password":"<haslo>"}'
```

Expected: JSON z dwoma polami, np. `{"token":"eyJ...","user_id":"507f1f77bcf86cd799439011"}`

- [ ] **Step 4: Front — przekaż `user_id` z `Login.jsx`**

Zamień:

```js
            const { token } = response.data;
            localStorage.setItem('token', token);

            addLogMessage(`Successfully logged in as ${formData.email}`, 'success');
            trackEvent('login', { method: 'email' });
            onLogin(formData.email, token);
```

na:

```js
            const { token, user_id: userId } = response.data;
            localStorage.setItem('token', token);

            addLogMessage(`Successfully logged in as ${formData.email}`, 'success');
            trackEvent('login', { method: 'email' });
            onLogin(formData.email, token, userId);
```

- [ ] **Step 5: Front — ustaw `user_id` w `App.js`**

Dodaj import:

```js
import { setUserId } from './analytics/gtag';
```

W `checkAuthStatus`, po `setUser({ email: response.data.email, token });`:

```js
                    setUserId(response.data.user_id);
```

W `handleLogin` zmień sygnaturę i dodaj wywołanie:

```js
    const handleLogin = async (email, token, userId) => {
        setUser({ email, token });
        setUserId(userId);
```

W `handleLogout`, po `setUser(null);`:

```js
        setUserId(null);
```

- [ ] **Step 6: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`
Expected: PASS poza znanym `App.test.js`

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/AuthHandler.go warhammer-battle-helper-front/src/components/Login.jsx warhammer-battle-helper-front/src/App.js
git commit -m "feat: FEATURE-118 return user_id from login and report it to analytics"
```

---

### Task 7: Strona polityki prywatności

Publiczny route `/privacy` — baner linkuje do niego, zanim ktokolwiek jest zalogowany.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/PrivacyPolicy.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Modify: `warhammer-battle-helper-front/src/App.js`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: route `/privacy`

- [ ] **Step 1: Klucze angielskie**

W `src/locales/en/translation.json`, po bloku `"consent"`:

```json
  "privacy": {
    "title": "Privacy policy",
    "intro": "This page explains what data PlayRPG stores on your device and what we send to third parties.",
    "necessaryTitle": "Data required for the service",
    "necessaryBody": "We store your login token, your interface language and your music volume in your browser's local storage. These are required for the site to work and do not need your consent. They never leave your browser.",
    "analyticsTitle": "Analytics",
    "analyticsBody": "If you accept, we load Google Analytics 4. It stores the cookies _ga and _ga_<ID> on your device and sends Google your IP address, browser information, the pages you open and the actions listed below. Google acts as a separate controller and processes this data outside the European Economic Area, including in the United States.",
    "eventsTitle": "What we measure",
    "eventsBody": "Page views, account registration, e-mail confirmation, logging in and creating a game. We never send your e-mail address or any other data that identifies you directly.",
    "userIdTitle": "Account identifier",
    "userIdBody": "While you are logged in we send Google your account identifier — a random string of characters, never your e-mail. It lets us tell whether the same person came back on another device.",
    "withdrawTitle": "Withdrawing consent",
    "withdrawBody": "You can withdraw your consent at any time in Settings, under Privacy. We then stop sending data and delete the analytics cookies. Declining costs you nothing — the site works exactly the same.",
    "contactTitle": "Contact",
    "contactBody": "Questions about your data: noreply@playrpg.net"
  },
```

- [ ] **Step 2: Klucze polskie**

W `src/locales/pl/translation.json`, w tym samym miejscu:

```json
  "privacy": {
    "title": "Polityka prywatności",
    "intro": "Ta strona wyjaśnia, co PlayRPG zapisuje na Twoim urządzeniu i co wysyłamy podmiotom trzecim.",
    "necessaryTitle": "Dane niezbędne do działania serwisu",
    "necessaryBody": "W pamięci lokalnej przeglądarki zapisujemy Twój token logowania, wybrany język interfejsu i głośność muzyki. Są niezbędne do działania serwisu i nie wymagają Twojej zgody. Nigdy nie opuszczają Twojej przeglądarki.",
    "analyticsTitle": "Analityka",
    "analyticsBody": "Jeśli wyrazisz zgodę, ładujemy Google Analytics 4. Zapisuje on na Twoim urządzeniu pliki cookie _ga oraz _ga_<ID> i przesyła Google Twój adres IP, informacje o przeglądarce, otwierane strony oraz zdarzenia wymienione niżej. Google jest odrębnym administratorem tych danych i przetwarza je poza Europejskim Obszarem Gospodarczym, w tym w Stanach Zjednoczonych.",
    "eventsTitle": "Co mierzymy",
    "eventsBody": "Odsłony stron, rejestrację konta, potwierdzenie adresu e-mail, logowanie oraz utworzenie gry. Nigdy nie wysyłamy Twojego adresu e-mail ani innych danych identyfikujących Cię bezpośrednio.",
    "userIdTitle": "Identyfikator konta",
    "userIdBody": "Gdy jesteś zalogowany, wysyłamy do Google identyfikator Twojego konta — losowy ciąg znaków, nigdy adres e-mail. Pozwala nam rozpoznać, że ta sama osoba wróciła na innym urządzeniu.",
    "withdrawTitle": "Wycofanie zgody",
    "withdrawBody": "Zgodę możesz wycofać w każdej chwili w Ustawieniach, w sekcji Prywatność. Przestajemy wtedy wysyłać dane i kasujemy pliki cookie analityki. Odmowa nic Cię nie kosztuje — serwis działa dokładnie tak samo.",
    "contactTitle": "Kontakt",
    "contactBody": "Pytania o Twoje dane: noreply@playrpg.net"
  },
```

- [ ] **Step 3: Zaimplementuj stronę**

Plik `warhammer-battle-helper-front/src/components/PrivacyPolicy.jsx`:

```jsx
import React from 'react';
import { Container, Box, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

const SECTIONS = [
    'necessary',
    'analytics',
    'events',
    'userId',
    'withdraw',
    'contact',
];

const PrivacyPolicy = () => {
    const { t } = useTranslation();

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        {t('privacy.title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        {t('privacy.intro')}
                    </Typography>

                    {SECTIONS.map((section) => (
                        <Box key={section} sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                {t(`privacy.${section}Title`)}
                            </Typography>
                            <Typography variant="body2">
                                {t(`privacy.${section}Body`)}
                            </Typography>
                        </Box>
                    ))}
                </Paper>
            </Box>
        </Container>
    );
};

export default PrivacyPolicy;
```

- [ ] **Step 4: Dodaj route w `App.js`**

Dodaj import:

```js
import PrivacyPolicy from './components/PrivacyPolicy';
```

W `<Routes>`, obok pozostałych publicznych tras (`/verify-email`, `/forgot-password`, `/reset-password`):

```jsx
                    <Route path="/privacy" element={<PrivacyPolicy />} />
```

Route musi być **poza** `ProtectedRoute` — baner linkuje do niego przed zalogowaniem.

- [ ] **Step 5: Sprawdź komplet kluczy w obu językach**

Run: `cd warhammer-battle-helper-front && node -e "const en=require('./src/locales/en/translation.json'),pl=require('./src/locales/pl/translation.json');const k=o=>Object.keys(o).sort().join(',');console.log('consent', k(en.consent)===k(pl.consent), 'privacy', k(en.privacy)===k(pl.privacy));"`
Expected: `consent true privacy true`

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/PrivacyPolicy.jsx warhammer-battle-helper-front/src/locales warhammer-battle-helper-front/src/App.js
git commit -m "feat(front): FEATURE-118 add privacy policy page"
```

---

### Task 8: Wycofanie zgody w ustawieniach

RODO: wycofanie musi być tak samo łatwe jak udzielenie.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/settings/PrivacySettings.jsx`
- Modify: `warhammer-battle-helper-front/src/components/settings/SettingsPage.jsx`
- Modify: `warhammer-battle-helper-front/src/components/settings/SettingsSidebar.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `useConsent` (Task 2), `isConfigured` (Task 1)
- Produces: sekcja `privacy` w `SettingsPage`

- [ ] **Step 1: Klucze angielskie**

W `src/locales/en/translation.json`, wewnątrz istniejącego bloku `"userSettings"`, obok `"account"`, `"changePassword"`, `"statistics"`:

```json
    "privacy": {
      "title": "Privacy",
      "analyticsLabel": "Google Analytics",
      "analyticsHelp": "Helps us see how the site is used. You can change this at any time — the site works the same either way.",
      "unavailable": "Analytics is not enabled on this installation."
    },
```

- [ ] **Step 2: Klucze polskie**

W `src/locales/pl/translation.json`, w bloku `"userSettings"`:

```json
    "privacy": {
      "title": "Prywatność",
      "analyticsLabel": "Google Analytics",
      "analyticsHelp": "Pomaga nam zobaczyć, jak korzystacie z serwisu. Możesz to zmienić w każdej chwili — serwis działa tak samo w obu przypadkach.",
      "unavailable": "Analityka nie jest włączona w tej instalacji."
    },
```

- [ ] **Step 3: Zaimplementuj sekcję**

Plik `warhammer-battle-helper-front/src/components/settings/PrivacySettings.jsx`:

```jsx
import React from 'react';
import { Box, Typography, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useConsent, CONSENT_GRANTED } from '../../analytics/ConsentContext';
import { isConfigured } from '../../analytics/gtag';

const PrivacySettings = () => {
    const { t } = useTranslation();
    const { consent, grant, deny } = useConsent();

    if (!isConfigured()) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('userSettings.privacy.unavailable')}
            </Typography>
        );
    }

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
                {t('userSettings.privacy.title')}
            </Typography>
            <FormControlLabel
                control={
                    <Switch
                        checked={consent === CONSENT_GRANTED}
                        onChange={(e) => (e.target.checked ? grant() : deny())}
                    />
                }
                label={t('userSettings.privacy.analyticsLabel')}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('userSettings.privacy.analyticsHelp')}
            </Typography>
        </Box>
    );
};

export default PrivacySettings;
```

- [ ] **Step 4: Podepnij do `SettingsPage.jsx`**

Dodaj import:

```js
import PrivacySettings from './PrivacySettings';
```

Rozszerz mapę:

```js
const SECTION_COMPONENTS = {
    account: <AccountSettingsForm />,
    changePassword: <ChangePasswordForm />,
    statistics: <RollStatisticsSettings />,
    privacy: <PrivacySettings />,
};
```

- [ ] **Step 5: Dodaj pozycję w `SettingsSidebar.jsx`**

Rozszerz import ikon:

```js
import { LockReset as LockResetIcon, AccountCircle as AccountCircleIcon, BarChart as BarChartIcon, PrivacyTip as PrivacyTipIcon } from '@mui/icons-material';
```

Rozszerz listę:

```js
const SECTIONS = [
    { key: 'account', icon: <AccountCircleIcon /> },
    { key: 'changePassword', icon: <LockResetIcon /> },
    { key: 'statistics', icon: <BarChartIcon /> },
    { key: 'privacy', icon: <PrivacyTipIcon /> },
];
```

- [ ] **Step 6: Sprawdź komplet kluczy**

Run: `cd warhammer-battle-helper-front && node -e "const en=require('./src/locales/en/translation.json'),pl=require('./src/locales/pl/translation.json');const k=o=>Object.keys(o).sort().join(',');console.log(k(en.userSettings.privacy)===k(pl.userSettings.privacy));"`
Expected: `true`

- [ ] **Step 7: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`
Expected: PASS poza znanym `App.test.js`

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/settings warhammer-battle-helper-front/src/locales
git commit -m "feat(front): FEATURE-118 add consent withdrawal in settings"
```

---

### Task 9: Konfiguracja i wdrożenie

Ten sam wzorzec co istniejące `REACT_APP_API_URL`: zmienna wstrzykiwana w czasie budowania obrazu.

**Files:**
- Modify: `warhammer-battle-helper-front/Dockerfile.prod`
- Modify: `docker-compose.prod.yml`
- Modify: `.env.prod.example`
- Modify: `warhammer-battle-helper-front/ENV_SETUP.md`

**Interfaces:**
- Consumes: `REACT_APP_GA_MEASUREMENT_ID` czytane w `src/analytics/gtag.js` (Task 1)
- Produces: nic dla kodu

- [ ] **Step 1: `Dockerfile.prod`**

W `warhammer-battle-helper-front/Dockerfile.prod` zamień:

```dockerfile
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
```

na:

```dockerfile
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

# Puste = GA wyłączone i baner zgody ukryty. Tak zostaje w każdym środowisku
# poza produkcją, żeby testy nie zaśmiecały danych.
ARG REACT_APP_GA_MEASUREMENT_ID
ENV REACT_APP_GA_MEASUREMENT_ID=$REACT_APP_GA_MEASUREMENT_ID
```

- [ ] **Step 2: `docker-compose.prod.yml`**

W usłudze `frontend` zamień:

```yaml
      args:
        REACT_APP_API_URL: ${REACT_APP_API_URL:-http://localhost:8080}
```

na:

```yaml
      args:
        REACT_APP_API_URL: ${REACT_APP_API_URL:-http://localhost:8080}
        REACT_APP_GA_MEASUREMENT_ID: ${REACT_APP_GA_MEASUREMENT_ID:-}
```

Nie dodawaj tego do usługi `admin` — panel administracyjny jest poza zakresem feature'u.

- [ ] **Step 3: `.env.prod.example`**

Pod linią `REACT_APP_API_URL=https://yourdomain.com/api` dodaj:

```
# Google Analytics 4 — identyfikator strumienia danych (format G-XXXXXXXXXX).
# Puste = analityka wyłączona, baner zgody się nie pokazuje.
REACT_APP_GA_MEASUREMENT_ID=
```

- [ ] **Step 4: `ENV_SETUP.md`**

Na końcu sekcji „How It Works" dodaj:

```markdown
### Google Analytics

`REACT_APP_GA_MEASUREMENT_ID` przechowuje identyfikator strumienia danych GA4
(format `G-XXXXXXXXXX`). Zmienna jest odczytywana w czasie budowania — po jej
zmianie trzeba przebudować obraz, samo `restart` nie wystarczy.

Pusta wartość (domyślna w dev) wyłącza analitykę całkowicie: skrypt Google nie jest
ładowany, a baner zgody się nie pokazuje. Zostaw ją pustą lokalnie, żeby `npm start`
nie zaśmiecał produkcyjnych danych.
```

- [ ] **Step 5: Zweryfikuj build produkcyjny**

```bash
cd warhammer-battle-helper-front
REACT_APP_GA_MEASUREMENT_ID=G-TEST123 npm run build
grep -rl "G-TEST123" build/static/js | head -1
```

Expected: ścieżka do pliku `build/static/js/main.<hash>.js` — potwierdza, że zmienna trafia do bundla.

Następnie sprawdź, że pusta wartość jej nie zostawia:

```bash
npm run build
grep -rc "googletagmanager" build/static/js/main.*.js
```

Expected: `1` — URL zostaje w kodzie modułu (jest zaszyty w `enable()`), ale bez measurement ID `enable()` kończy się na pierwszym `if`. To zachowanie pokryte testem „bez measurement ID nie robi nic".

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/Dockerfile.prod docker-compose.prod.yml .env.prod.example warhammer-battle-helper-front/ENV_SETUP.md
git commit -m "chore: FEATURE-118 wire GA measurement id through the prod build"
```

---

## Weryfikacja ręczna po wykonaniu wszystkich zadań

Uruchom front z ustawionym ID: `cd warhammer-battle-helper-front && REACT_APP_GA_MEASUREMENT_ID=G-TEST123 npm start`

1. Wyczyść `localStorage`, odśwież → baner widoczny. **Zakładka Network: żadnego żądania do `googletagmanager.com`.** To jest najważniejszy test całego feature'u.
2. Kliknij „Odrzucam" → baner znika, nadal zero żądań do Google, `localStorage['analytics-consent'] === 'denied'`.
3. Wyczyść `localStorage`, odśwież, kliknij „Akceptuję" → żądanie do `googletagmanager.com` pojawia się, cookie `_ga` powstaje.
4. Zaloguj się → w `window.dataLayer` widoczne `['event','login',...]` oraz `['set',{user_id:...}]`. Sprawdź, że `user_id` **nie jest adresem e-mail**.
5. Ustawienia → Prywatność → wyłącz przełącznik → `window['ga-disable-G-TEST123'] === true`, cookies `_ga*` zniknęły, kolejne akcje nie dopisują eventów do `dataLayer`.
6. Otwórz `/privacy` bez zalogowania → strona się renderuje.

Przed pierwszym wdrożeniem na produkcję: załóż strumień danych GA4 dla `playrpg.net`, wpisz jego ID do `.env.prod`, przebuduj obraz frontu.
