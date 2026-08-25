# FEATURE-118 — Google Analytics 4 + zgoda RODO

Data: 2026-08-25
Status: design zatwierdzony, gotowy do planu implementacji

## Cel

Zmierzyć ruch na `playrpg.net` oraz lejek pozyskania użytkownika:
wejście → rejestracja → weryfikacja maila → logowanie → utworzenie gry.

Zakres celowo wyklucza instrumentację wnętrza `GameSession` (zakładki, narzędzia,
czas sesji) — duży koszt, mała wartość przy obecnej skali. Do dodania później na
gotowej infrastrukturze.

## Decyzje

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Narzędzie | GA4 (`gtag.js`) | Wymóg użytkownika; darmowe, standardowe |
| Zgoda | Baner blokujący ładowanie skryptu | RODO: `gtag.js` wysyła IP do Google już przy ładowaniu |
| Sposób wpięcia | Własny moduł + dynamiczne wstrzyknięcie skryptu | Zero zależności; jedyny sposób na kontrolę momentu ładowania |
| `user_id` | Tak — `user_id` z `/profile` | Retencja i cross-device; NIGDY email (zakaz PII w regulaminie GA) |
| Panel admina | Poza zakresem | Używany wyłącznie przez właściciela; zanieczyściłby dane |
| Konfiguracja | `REACT_APP_GA_MEASUREMENT_ID` (build-time) | Ten sam wzorzec co istniejące `REACT_APP_API_URL` |

### Odrzucone alternatywy

- **`react-ga4`** — cienki wrapper na `gtag`, który i tak piszemy; dochodzi słabo
  utrzymywana zależność.
- **Google Tag Manager** — elastyczność bez redeploya, ale konfiguracja żyje poza
  gitem (brak code review na tym, co faktycznie wychodzi) i +100 KB. Przerost formy
  dla solo-projektu.
- **Umami / Plausible (cookieless)** — pozwoliłoby pominąć baner, ale to nie jest GA.
- **Statyczny `<script>` w `index.html`** — niemożliwy do pogodzenia ze zgodą: strzał
  sieciowy do Google (IP = dane osobowe) leci przy ładowaniu, a automatyczny
  `page_view` i cookie `_ga` powstają zanim React się zamontuje.

## Architektura

```
src/analytics/
  gtag.js            — jedyne miejsce znające window.gtag; init/track/setUserId/disable
  ConsentContext.jsx — stan zgody + localStorage; NIE importuje niczego z analytics/
  useAnalytics.js    — API dla komponentów: trackEvent, setUserId
  usePageViews.js    — nasłuch useLocation() → page_view
src/components/consent/
  ConsentBanner.jsx
  ConsentBanner.css
src/components/PrivacyPolicy.jsx — route /privacy, publiczny
```

Granica kluczowa: `ConsentContext` przechowuje wyłącznie `'granted' | 'denied' | null`
i nie wie o istnieniu GA. To `gtag.js` subskrybuje zmianę i decyduje o wstrzyknięciu
skryptu. Dzięki temu pod tę samą zgodę da się później podpiąć kolejny skrypt
third-party (osadzone YouTube, Hotjar) bez dotykania modułu analityki.

### Przepływ

```
App mount
  └─ ConsentProvider czyta localStorage['analytics-consent']
       ├─ null      → ConsentBanner widoczny, gtag.js NIE ładowany
       ├─ 'denied'  → nic
       └─ 'granted' → gtag.init(MEASUREMENT_ID) — dynamiczny <script>
                        ├─ usePageViews:  zmiana useLocation() → page_view
                        ├─ App po loginie: gtag('set', {user_id})
                        └─ komponenty:    trackEvent(...)
```

Uwaga implementacyjna: `gtag.js` trzyma wewnętrzną flagę `injected`, bo React 19
StrictMode montuje efekty dwukrotnie w dev.

## Katalog eventów

Nazwy w `snake_case`. `sign_up` i `login` to nazwy zarezerwowane GA4 — trafiają do
gotowych raportów lejka bez dodatkowej konfiguracji.

| Event | Miejsce wpięcia | Parametry |
|---|---|---|
| `page_view` | `usePageViews` w `App.js` | `page_path` |
| `sign_up` | `Register.jsx:73` — po sukcesie POST `/register` | `method: 'email'` |
| `email_verified` | `EmailVerification.jsx:33` — `.then()` | — |
| `login` | `Login.jsx` — po sukcesie POST `/login` | `method: 'email'` |
| `game_created` | `GameLobby.jsx:47` — po `createGame()` | `game_system` |

Świadomie pominięte: `game_joined`. `onJoinGame` wywoływane z dwóch miejsc
(`GameLobby.jsx:47` po utworzeniu, `:109` z listy) — rozróżnianie kontekstu nie
zmieni żadnej decyzji przy obecnej skali.

Eventy wpinamy **jawnie w miejscach sukcesu**, nie w interceptorze `axiosInstance` —
globalny interceptor rozlewa analitykę po całej apce niewidocznie i wysyła zdarzenia
o rzeczach, których nie chcieliśmy mierzyć.

Ograniczenie do świadomej akceptacji: `page_view` da płytkie dane, bo lobby i sesja
gry nie są routami (`currentGameId` to stan w `App.js`, URL zostaje `/`). Lejek
opiera się na eventach, nie na pageview'ach.

## Zgoda i prywatność

**Baner.** Widoczny na każdej stronie (także `/login`, `/register`), dopóki
`localStorage['analytics-consent']` jest puste. Dwa przyciski o **równej wadze
wizualnej** — „Akceptuję" i „Odrzucam". To wymóg RODO, nie estetyka: odmowa musi być
tak samo łatwa jak zgoda. Trzeci element: link do `/privacy`.

**Wycofanie zgody.** Przełącznik w `SettingsPage`, czytający ten sam `ConsentContext`.
Przy cofnięciu: zapis `'denied'` + kasowanie cookies `_ga*`. Przeładowanie strony tego
nie wymusza — `gtag.js` siedzi już w pamięci — dlatego moduł trzyma flagę `enabled`
i po cofnięciu przestaje wysyłać niezależnie od załadowanego skryptu.

**Polityka prywatności.** Route `/privacy`, poza `ProtectedRoute`. Treść przez i18n
(klucze angielskie, tłumaczenia w `en/` i `pl/translation.json` — konwencja projektu).
Szkic techniczny przygotowany w ramach ticketu, do przejrzenia przez właściciela;
nie stanowi porady prawnej. Musi wymieniać: Google jako odbiorcę danych, transfer do
USA, `user_id` jako dane pseudonimizowane, sposób wycofania zgody.

## Konfiguracja i wdrożenie

`REACT_APP_GA_MEASUREMENT_ID` — wzorzec identyczny jak `REACT_APP_API_URL`:

- `ARG` + `ENV` w `warhammer-battle-helper-front/Dockerfile.prod`
- `args:` w usłudze `frontend` w `docker-compose.prod.yml`
- wpis w `.env.prod.example`
- opis w `warhammer-battle-helper-front/ENV_SETUP.md`

Pusta zmienna = moduł nie robi nic i baner się nie pokazuje. Domyślny stan w dev,
żeby `npm start` nie zaśmiecał produkcyjnych danych. Świadomie zmienna zamiast
sprawdzania `NODE_ENV` — pozwala celowo przetestować GA lokalnie.

Backend — jedna zmiana addytywna. `/login` (`internal/http/AuthHandler.go:125`)
zwraca dziś wyłącznie `{token}`, więc front nie zna `user_id` w momencie logowania.
Dokładamy pole:

```go
c.JSON(http.StatusOK, gin.H{"token": token, "user_id": user.ID.Hex()})
```

`App.handleLogin` przekazuje je dalej do `setUserId`. `/profile` już zwraca `user_id`
(`AuthHandler.go:277`), więc ścieżka „powrót z zapisanym tokenem" jest pokryta.

Odrzucone: wołanie `/profile` po logowaniu (dodatkowe RTT, dwa źródła tej samej
prawdy) oraz dekodowanie JWT po stronie frontu (kusi, by później użyć tego do
autoryzacji).

## Testy

Jednostkowe dla `gtag.js` (fake `window.gtag`):

- nie wysyła nic przed zgodą
- wysyła po zgodzie
- przestaje wysyłać po cofnięciu zgody
- nie wstrzykuje skryptu dwa razy (StrictMode)

Dla `ConsentContext`: odczyt i zapis `localStorage`, poprawne zachowanie przy
wyjątku z `localStorage` (tryb prywatny).

Bez testów renderowania — zgodnie z praktyką reszty frontu.

Baseline: `App.test.js` wywala się na błędzie ESM w axios. To znany stan sprzed
zmiany, nie regresja.

## Poza zakresem

- Eventy z wnętrza `GameSession`
- GA w panelu admina
- `<meta name="robots" content="noindex, nofollow">` w `public/index.html:8` —
  zostaje bez zmian. Zdjęcie go to osobna decyzja o wypuszczeniu apki do indeksu
  Google. Konsekwencja do świadomej akceptacji: dopóki tag stoi, kanał „organic
  search" w GA będzie pusty, a cały ruch pokaże się jako direct/referral.
