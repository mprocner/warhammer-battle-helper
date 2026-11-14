# Prywatność, analityka i SEO

## Jak to działa

### Czcionki z własnego serwera

Wszystkie czcionki (Cinzel, Crimson Text, Roboto) są w paczkach
`@fontsource/*` i importowane w `src/index.js` — webpack wrzuca pliki `.woff2` do
`build/static/media`, więc serwuje je nasz nginx. Wcześniej `public/index.html` ładował
Google Fonts (`fonts.googleapis.com` + `fonts.gstatic.com`), co wysyłało IP każdego
odwiedzającego do Google **zanim** zobaczył baner zgody. Importujemy tylko używane grubości
(Cinzel 400/600/700/900, Crimson Text 400/600/700 + kursywy,
Roboto 300/400/500). Każdy plik grubości zawiera podzbiory latin i latin-ext (polskie znaki)
rozdzielone `unicode-range`, więc przeglądarka pobiera tylko to, czego potrzebuje. Kod nie
nazywa czcionek wprost — używa tokenów `--font-display` / `--font-body` / `--font-ui`
(zob. [13-motywy.md](13-motywy.md)).

`src/publicIndex.test.js` pilnuje, żeby `public/index.html` nie ładował niczego z obcej
domeny (`<link>`, `<script>`, `<iframe>`, `<img>`).

### Zgoda i Google Analytics

Trzy elementy, każdy z jedną odpowiedzialnością:

- `ConsentContext` — trzyma decyzję `'granted' | 'denied' | null` w `localStorage`
  (`analytics-consent`), słucha zdarzenia `storage` (wycofanie w innej karcie). O GA nic nie wie.
- `AnalyticsGate` — jedyny most: `granted` → `enable()`, wszystko inne → `disable()`.
- `gtag.js` — jedyne miejsce, które zna `window.dataLayer`. Skrypt
  `googletagmanager.com/gtag/js` jest **wstrzykiwany dopiero w `enable()`**; w `index.html` go
  nie ma. `disable()` podnosi oficjalny wyłącznik `window['ga-disable-<ID>'] = true` i kasuje
  cookies `_ga` / `_ga_*` na każdym poziomie domeny hosta (`.www.playrpg.net`, `.playrpg.net`)
  oraz bez atrybutu `domain` — GA4 z `cookie_domain: 'auto'` zapisuje je na `.playrpg.net`,
  a samo kasowanie host-only by ich nie ruszyło.

Bez `REACT_APP_GA_MEASUREMENT_ID` (dev, staging) `isConfigured()` jest fałszem: baner się nie
pokazuje, `enable()` nic nie robi, a ustawienia prywatności mówią „analityka wyłączona”.

**Audyt 2026-11-06 (PLAYRPG-307) — zweryfikowane testami jsdom** (`consentFlow.test.jsx` —
prawdziwy `gtag.js` złożony jak w `App.js`, plus `gtag.test.js`, `ConsentBanner.test.jsx`,
`ConsentContext.test.jsx`, `AnalyticsGate.test.jsx`):

| Scenariusz | Wynik |
|---|---|
| Nowy odwiedzający (GA skonfigurowane) widzi baner | ✔ |
| Przed decyzją: brak `<script>` GA, `window.dataLayer` nie istnieje, brak cookies `_ga` | ✔ |
| Odmowa: baner znika, `denied` zapisane, nawigacja dalej nic nie wysyła | ✔ |
| Zapisana odmowa: baner się nie pokazuje przy kolejnej wizycie | ✔ |
| Zgoda: skrypt wstrzyknięty raz, `config` z `send_page_view: false`, jeden `page_view` bieżącej strony | ✔ |
| Adblock (zdarzenie `error` na skrypcie): aplikacja działa, nawigacja i ustawienia bez błędów | ✔ |
| Wycofanie w ustawieniach prywatności (`/privacy` i `/settings` używają tego samego `PrivacySettings`): wyłącznik GA podniesiony, `_ga` i `_ga_<ID>` skasowane, kolejne nawigacje nic nie dopisują | ✔ |
| Kasowanie cookies na `playrpg.net` i `www.playrpg.net` próbuje `domain=.playrpg.net` | ✔ |
| Wycofanie w innej karcie wycisza bieżącą | ✔ |
| Bez measurement ID baner ukryty, `enable()` nic nie robi | ✔ |
| `page_location` / `page_referrer` bez query stringa (tokeny resetu hasła) | ✔ |
| Ścieżki przez `sanitizePath`: `/join/<token>` → `/join` (sekret zaproszenia), `/games/<id>` → `/games/:id` (PLAYRPG-338: ID to nie sekret, ale każda gra byłaby osobną stroną w raportach) | ✔ |

Błędów w przepływie zgody nie znaleziono. Jedyny wyciek przed zgodą był poza nim — Google Fonts
w `index.html` (naprawione, sekcja wyżej).

**Tylko na drucie — ręczna lista kontrolna** (produkcyjny build z ustawionym ID, okno
incognito, DevTools → Network z „Preserve log”):

1. Pierwsze wejście, baner widoczny: filtr `google` w Network — **zero** żądań (żadnego
   `googletagmanager.com`, `fonts.googleapis.com`, `fonts.gstatic.com`). Application → Cookies —
   brak `_ga`.
2. „Odrzucam”, przejdź kilka stron — dalej zero żądań do Google.
3. Nowe incognito, „Akceptuję” — pojawia się `gtag/js?id=G-…`, potem żądania z filtrem
   `collect?v=2`. W każdym sprawdź parametry: `dl` (page_location) bez `?` i bez `token=`,
   `dr` (referrer) też bez query stringa — najlepiej wejdź z linku `/reset-password?token=test`.
   Jeśli pojawi się `form_destination` (enhanced measurement „form interactions”), nie może nieść
   query stringa; w razie wątpliwości wyłącz „Form interactions” w GA → Data streams → Enhanced
   measurement.
4. Cookies: `_ga` i `_ga_<ID bez G->` z domeną `.playrpg.net`.
5. Wycofaj zgodę w `/privacy` (albo Ustawienia → Prywatność): cookies `_ga*` znikają, kolejne
   nawigacje nie generują `collect?v=2`.
6. Z włączonym adblockiem zaakceptuj zgodę: żądanie `gtag/js` jest zablokowane (czerwone),
   aplikacja działa normalnie, w konsoli brak błędów z naszego kodu.

### Meta tagi i podgląd linków

`public/index.html` jest jedynym HTML-em, jaki dostaje crawler (Google, Facebook, Messenger,
Discord, Slack) — **nie uruchamia JavaScriptu**, więc wszystko, co ma się pokazać w wynikach
wyszukiwania albo w podglądzie linku, musi być tam statycznie. Każdy adres w SPA zwraca ten sam
plik, więc podgląd jest jeden dla całego serwisu:

- `<html lang="pl">` — główna publiczność; po starcie `src/i18n.js` przestawia `lang` na język
  interfejsu (zdarzenie `languageChanged`).
- `<title>` i `description` po polsku, `theme-color` `#e8dcc4` (pergamin z `MuiAppBar`
  w `theme.js`, więc pasek przeglądarki na telefonie zlewa się z nagłówkiem).
- Open Graph (`og:type/title/description/url/image`, `og:locale` `pl_PL` + `og:locale:alternate`
  `en_US`) i Twitter Card `summary_large_image`. Obrazek: `public/og-image.png` 1200×630,
  adres **bezwzględny** `https://playrpg.net/og-image.png`.
- `manifest.json` — nazwa PlayRPG, opis, kolory z motywu (zamiast domyślnych z CRA).

**Obrazek podglądu** generujemy z HTML-a: `scripts/og-image/og.html` (logo `public/img/logo.png`,
napis „PlayRPG” w Cinzel, hasło w Crimson Text) renderuje `scripts/og-image/render.sh` przez
headless Chrome. Logo jest ciemnobrązowe, dlatego leży na pergaminie w ciemnobrązowej ramie,
a nie na ciemnym tle. Czcionki skrypt bierze z `node_modules` frontu.

`src/publicIndex.test.js` sprawdza obecność tagów OG/Twitter i to, że `og:image` jest
bezwzględnym URL-em pliku, który faktycznie leży w `public/`.

### Tytuły stron

`src/hooks/usePageTitle.js` ustawia `document.title` na `„<strona> · PlayRPG”` (`formatPageTitle`)
i przy odmontowaniu wraca do gołego `PlayRPG`. Strona podaje już przetłumaczony tekst, więc zmiana
języka po prostu re-renderuje ją z nową wartością. Klucze leżą w `pageTitle.*` (en/pl); wyjątki:

- `/games` — „Twoje gry”; `/games/:id` — **nazwa gry** (`gameState.name`; do czasu fetchu tytuł lobby),
- `/character-sheet` — imię postaci (okno karty łatwo znaleźć wśród kart przeglądarki),
- `/help/:page` — `„<strona przewodnika> · Pomoc · PlayRPG”`, przegląd to samo `„Pomoc”`,
- `/changelog` — nagłówek strony z przestrzeni `changelog` (`title`).

Kolejność efektów jest bezpieczna: przy zmianie trasy React wykonuje wszystkie cleanupy
odmontowywanej strony **przed** efektami nowej, więc reset do „PlayRPG” nigdy nie nadpisze tytułu
strony, która właśnie weszła (test w `usePageTitle.test.jsx`).

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Czcionki | `src/index.js` (importy `@fontsource/*`) |
| Zgoda, most do GA, transport GA | `src/analytics/ConsentContext.jsx`, `AnalyticsGate.jsx`, `gtag.js`, `usePageViews.js` |
| Baner, przełącznik w ustawieniach | `src/components/consent/ConsentBanner.jsx`, `src/components/settings/PrivacySettings.jsx` |
| Test całego przepływu zgody | `src/analytics/consentFlow.test.jsx` |
| Strażnik `index.html` | `src/publicIndex.test.js` |
| Meta tagi, OG, Twitter Card | `public/index.html`, `public/manifest.json` |
| Obrazek podglądu linku | `public/og-image.png`, źródło `scripts/og-image/` |
| `<html lang>` za językiem UI | `src/i18n.js` |
| Tytuły stron | `src/hooks/usePageTitle.js`, klucze `pageTitle.*` w `locales/{en,pl}/translation.json` |

## Pułapki

- Nowa czcionka = nowa paczka `@fontsource/<nazwa>` i import konkretnej grubości, nigdy
  `<link>` do Google Fonts w `index.html` ani `@import url(...)` w CSS. `SceneViewport.css`
  odwołuje się do `MedievalSharp`, której nigdy nie ładowaliśmy — przeglądarka używa fallbacku
  `serif`.
- Każdy nowy skrypt third-party (piksel, czat, mapa, embed) ładuj tak jak GA: wstrzyknięcie po
  zgodzie, subskrybent w `AnalyticsGate` (albo obok niego), nigdy statyczny tag w `index.html`.
  `consentFlow.test.jsx` nie zobaczy obcego skryptu dodanego gdzie indziej.
- `consentFlow.test.jsx` dzieli stan modułu `gtag.js` między testami (wstrzyknięty skrypt zostaje),
  więc testy „przed zgodą” muszą stać przed pierwszym „Akceptuję”. `jest.resetModules()` nie
  wchodzi w grę — ładuje drugą kopię Reacta.
- `disable()` kasuje tylko `_ga` i `_ga_*`. Gdyby w GA włączyć powiązanie z Google Ads / Google
  Signals, gtag może dopisać `_gcl_au` — wtedy trzeba rozszerzyć filtr i politykę prywatności.
- Nowa zależność npm w kontenerze dev wymaga `docker compose up --build --renew-anon-volumes`
  — inaczej anonimowy wolumen `node_modules` nie zobaczy paczek `@fontsource`.
- Podgląd linku jest statyczny i jednakowy dla każdej podstrony — SPA nie ma SSR, a crawlery nie
  uruchamiają JS. Tytuły per strona (`usePageTitle`) widać w karcie przeglądarki, nie w podglądzie.
- Facebook/Messenger cache'ują podgląd. Po zmianie obrazka trzeba go odświeżyć w Sharing Debuggerze
  Facebooka albo zmienić nazwę pliku (`og-image-v2.png`).
- Dopóki `nginx.vps.conf.example` trzyma `auth_basic` na `location /`, crawlery dostają 401 i nie
  zobaczą ani tagów, ani obrazka.
