# Strona changeloga — projekt

Data: 2026-11-06

## Cel

Publiczna strona `/changelog` z historią wersji PlayRPG, dostępna bez logowania. Pierwsze
wydanie `1.0.0` opisuje wszystko, co aplikacja ma dziś. Kolejne wersje dopisujemy razem
z poprawkami i nowymi funkcjami, w tym samym commicie co zmiana.

## Decyzje

| Temat | Wybór | Odrzucone |
|---|---|---|
| Źródło wpisów | plik w repo (dane strukturalne + i18n) | backend + MongoDB, Markdown w `public/` |
| Numeracja | SemVer `MAJOR.MINOR.PATCH` | V1/V2, same daty |
| Treść 1.0.0 | przegląd obszarami, językiem gracza, w stylu user-guide z PR #3 | lista wszystkich FEATURE/PLAYRPG, odtwarzanie wersji 0.x |
| Punkty wejścia | Navigation, stopka landing, wersja w lobby, kropka w zakładce Ogólne | toast po wejściu do gry |

Znaczenie SemVer w tej aplikacji: PATCH to same poprawki, MINOR to nowe funkcje, MAJOR to
przełom. Granicę MAJOR wyznaczamy umownie, bo aplikacja nie ma publicznego API.

## Dane

### `src/changelog/releases.js`

Zawiera tylko strukturę, bez tekstów. Najnowsza wersja jest pierwsza.

```js
export const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-11-06', // deploy day, ISO
    sections: [
      { id: 'scene', items: ['map', 'fog', 'drawing', 'tokens'] },
      { id: 'characters', items: [/* ... */] },
    ],
  },
];

export const LATEST_VERSION = RELEASES[0].version;
```

- Sekcja to `{ id, items }`. Ten sam kształt służy obu rodzajom wersji:
  - `1.0.0` ma sekcje obszarowe: `accounts`, `games`, `systems`, `characters`, `creator`,
    `scene`, `dice`, `materials`, `minigames`, `tutorials`. Podział pochodzi
    z `docs/knowledge-base/00-inwentaryzacja.md` (PR #3), bez panelu admina.
  - kolejne wersje mają sekcje `added`, `changed` i `fixed`.
- `id` punktu jest stabilnym kluczem tekstu, nie tekstem.

### Namespace i18n `changelog`

Pliki `src/locales/en/changelog.json` i `src/locales/pl/changelog.json` rejestruję w `i18n.js`
tak samo jak `skills`, `weapons` itd. Dzięki temu `translation.json` (2532 linie) nie rośnie.

```json
{
  "title": "What's new",
  "intro": "PlayRPG release history.",
  "latest": "Latest",
  "sections": { "scene": "Scene and map", "added": "New", "changed": "Changed", "fixed": "Fixed" },
  "releases": {
    "1_0_0": { "scene": { "map": "…", "fog": "…" } }
  }
}
```

Klucz wersji to `version` z kropkami zamienionymi na `_`, bo i18next używa kropki jako
separatora zagnieżdżenia.

Stringi linków i wiersza wersji (Navigation, stopka, lobby, GeneralTab) trafiają do
`translation.json` obok sąsiednich kluczy: `navigation.changelog`, `landing.footer.label`,
`settings.version`, `settings.versionLink`.

### Ikony sekcji

Komponent strony mapuje `id` sekcji na ikonę z `@mui/icons-material`. Test sprawdza, że każda
sekcja użyta w `RELEASES` ma ikonę.

## Śledzenie „widziane”

- Klucz `localStorage['changelog.lastSeenVersion']`. Każdy odczyt i zapis jest w `try/catch`;
  wyjątek traktuję jak brak klucza.
- Wejście na `/changelog` zapisuje `LATEST_VERSION`.
- Hook `useChangelogUnseen()` zwraca `true`, gdy zapisana wartość różni się od
  `LATEST_VERSION`. Porównuję stringi, bez parsowania semver, bo pytanie brzmi tylko „czy
  widział najnowszą”.
- Brak klucza oznacza wersję niewidzianą, więc każdy, także gość, raz zobaczy kropkę przy 1.0.0.
- Hook to `useSyncExternalStore` nasłuchujący własnego zdarzenia `changelog-seen` (ta sama karta)
  i `storage` (inne karty). Gracz, który otworzy changelog z gry w nowej karcie, po powrocie
  nie widzi już kropki — wszystkie cztery miejsca gasną jednocześnie.

## Strona `/changelog`

- Trasa publiczna w `App.js` obok `/licenses`, bez `ProtectedRoute`.
- Komponent `src/components/Changelog.jsx` na wzór `Licenses.jsx`: `Container maxWidth="md"`
  z `Paper`.
- Na górze tytuł i wstęp. Pod nimi wszystkie wersje od najnowszej, rozwinięte. Każda wersja:
  - nagłówek `1.0.0 · 6 listopada 2026` z kotwicą `id="v1.0.0"`, żeby dało się linkować
    konkretne wydanie, plus etykieta „Najnowsza” przy pierwszej;
  - sekcje z ikoną, tytułem i listą punktów.
- Datę formatuje `Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' })`.
- Wszystkie stringi idą przez `t()`, bez tekstów wpisanych w JSX.

```
┌──────────────────────────────────────────┐
│ Co nowego                                │
│ Historia zmian PlayRPG.               │
│                                          │
│ 1.0.0 · 6 listopada 2026   [Najnowsza]   │
│ ──────────────────────────────────────── │
│ [ikona] Scena i mapa                     │
│   • …                                    │
│ [ikona] Postacie                         │
│   • …                                    │
└──────────────────────────────────────────┘
```

## Punkty wejścia

Kropkę rysuje jedna globalna klasa BEM `.changelog-dot` w `style.css`. Wszystkie miejsca czytają
`useChangelogUnseen()`.

1. **`Navigation.jsx`**: `IconButton` z `NewReleasesIcon` obok privacy, licenses i terms,
   z kropką. Navigation renderuje się dla gości i zalogowanych poza widokiem gry.
2. **`LandingPage.jsx`**: nowa stopka `landing__footer` z linkami Co nowego · Prywatność ·
   Regulamin · Licencje.
3. **`GameLobby.jsx`**: mały link `v{LATEST_VERSION}` z kropką w dolnym rogu widoku `/games`.
4. **`GeneralTab.jsx`**: wiersz „Wersja 1.0.0 — co nowego” w sekcji informacji o grze,
   z kropką. Link otwiera `/changelog` w nowej karcie (`target="_blank"`
   `rel="noopener noreferrer"`), więc gra zostaje otwarta. Kropka pojawia się też na ikonie
   zakładki Ogólne. `tabDefinitions.jsx` nie obsługuje dziś znaczników, więc wymaga to
   nowego mechanizmu w miejscu, które renderuje ikony zakładek.

## Treść 1.0.0

- Sekcje obszarowe z listy wyżej, 3–6 punktów w każdej.
- Język gracza i MG, jak w `docs/user-guide/` z PR #3: opis, co można zrobić, bez nazw
  komponentów i numerów ticketów.
- Źródło: inwentaryzacja z PR #3. Każdy punkt sprawdzam w kodzie na `main`, bo PR #3 nie jest
  zmergowany.
- Pomijam panel admina i funkcje niepodłączone (np. `YahtzeeHandler` nie jest w `main.go`).
- `date` dla 1.0.0 wpisuję w dniu deployu.

## Utrzymanie

Zmiana widoczna dla użytkownika dopisuje punkt do nowej wersji w `RELEASES` oraz teksty en i pl
w tym samym commicie. Dodaję tę regułę do `CLAUDE.md` w sekcji „Kluczowe konwencje”.

## Testy

- `src/changelog/releases.test.js`:
  - wersje są unikalne, zgodne z formatem SemVer i ułożone malejąco;
  - `date` to poprawna data ISO;
  - każda para sekcja/punkt ma tekst w en i pl, a każda sekcja ma tytuł w obu językach;
  - każda użyta sekcja ma ikonę.
- `useChangelogUnseen.test.jsx` (`renderHook`): brak klucza, stary klucz, aktualny klucz,
  `localStorage` rzucający wyjątek.
- `Changelog.test.jsx`: render wersji i sekcji, zapis `lastSeenVersion` po wejściu.
- Tutorial: sprawdzam, czy tour zakładki Ogólne (`src/components/tutorial/tours/`) potrzebuje
  kroku dla nowego wiersza wersji, i czy wymaga tego test pokrycia.

## Poza zakresem

- Edycja changeloga bez deployu (backend, panel admina).
- Synchronizacja `package.json` `version` z `LATEST_VERSION`.
- Wystawienie user-guide w aplikacji i linki z changeloga do niego.
