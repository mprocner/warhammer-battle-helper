# PLAYRPG-298 + PLAYRPG-299 — Filtr ról i wyszukiwarka na liście gier

## Cel

Lobby (`/games`, `GameLobby.jsx`) pokazuje wszystkie gry w jednej siatce, bez filtrów. Ten sam
użytkownik bywa MG w jednej kampanii i graczem w innej, a przy wielu grach trudno znaleźć
konkretną. Nad siatką dochodzi jeden pasek: chipy ról „Prowadzę / Gram / Wszystkie” (298)
i pole wyszukiwania (299). Oba pojawiają się tylko wtedy, gdy mają sens, żeby nie zaśmiecać
ekranu nowym użytkownikom.

## Decyzje

| Temat | Decyzja |
|---|---|
| Gdzie filtrujemy | Tylko frontend. Lista gier przychodzi cała jednym fetchem przy wejściu; backend bez zmian. |
| Rola gry | `game.gameMasterEmail === userEmail` → „Prowadzę” (`gm`), inaczej „Gram” (`player`). Ta sama reguła co `isGM` w `GameCard`. |
| Widoczność chipów | Tylko gdy użytkownik ma ≥ 1 grę w każdej roli. Kto tylko prowadzi albo tylko gra, chipów nie widzi. |
| Widoczność wyszukiwarki | Gdy `games.length > 8`, liczone łącznie, niezależnie od chipa (inaczej pole znikałoby przy przełączaniu chipów razem z wpisaną frazą). |
| Ukryty filtr nie działa | Gdy chipy są ukryte, `role` jest ignorowane; gdy pole jest ukryte, `q` jest ignorowane. Gra nigdy nie chowa się za niewidoczną kontrolką. |
| Po czym szukamy | Nazwa gry **lub** etykieta systemu, ta sama, którą pokazuje karta (`systemLabel`: nazwa szablonu dla `custom`, inaczej `t('gameSystems.<id>')`). |
| Dopasowanie | `findMatch` z `components/lobby/systemOptions.js`: bez rozróżniania wielkości liter, bez polskich znaków (NFD + `ł→l`). Fraza przycięta (`trim`); pusta = brak filtra. |
| Łączenie | Chip i fraza działają razem (AND). |
| Kolejność | Bez zmian; filtr tylko ukrywa. |
| Stan | W URL: `/games?role=gm&q=zamek`, przez `useSearchParams` z `replace: true` (wpisywanie nie zaśmieca historii). Puste/domyślne wartości usuwane z URL. Nieznane `role` = „Wszystkie”. Bez localStorage. |
| Dlaczego URL | Gra otwiera się dziś pod tym samym `/games` (stan `currentGameId` podmienia lobby na `GameSession`), więc lobby się odmontowuje. Stan komponentu przepadałby przy każdym wejściu do gry; URL przeżywa wejście i powrót oraz F5. Czyste `/games` (np. z menu) = brak filtrów. Osobny URL gry: PLAYRPG-338. |
| Prywatność | `analytics/gtag.js` obcina cały query string z `page_location`/`page_referrer` (FEATURE-118), więc fraza nie trafia do GA. |
| Pusty wynik | Gdy gry są, ale filtr nic nie zostawia: komunikat w siatce (wariant z frazą: „Brak gier pasujących do «…»”, bez frazy: brak gier w tej roli) + przycisk „Wyczyść filtry”, który usuwa `role` i `q`. Dotychczasowy pusty stan („Utwórz pierwszą grę”) zostaje tylko dla zera gier. |
| Liczniki na chipach | Brak. |

## Struktura kodu

- `components/lobby/gameLabels.js` (nowy) — `systemLabel(game, t)` przeniesione z `GameCard.jsx`;
  `GameCard` importuje stąd.
- `components/lobby/lobbyFilter.js` (nowy) — czyste funkcje:
  - `gameRole(game, userEmail)` → `'gm' | 'player'`
  - `lobbyFilterVisibility(games, userEmail)` → `{ showRoles, showSearch }`
  - `filterLobbyGames(games, { role, query, userEmail, t })` → przefiltrowana tablica
    (przyjmuje już efektywne wartości — ignorowanie ukrytych parametrów robi hook)
  - stała `SEARCH_THRESHOLD = 8`
- `hooks/useLobbyFilter.js` (nowy) — czyta/zapisuje `role` i `q` z `useSearchParams`, liczy
  widoczność, zwraca `{ role, query, setRole, setQuery, clear, showRoles, showSearch, visibleGames }`.
- `components/lobby/LobbyFilterBar.jsx` (nowy) — chipy (MUI `Chip`, wybrany `filled`, reszta
  `outlined`) po lewej, `TextField` z `SearchIcon` i przyciskiem czyszczenia (`ClearIcon`) po prawej;
  `flexWrap`, na wąskim ekranie się zawija. Nie renderuje się, gdy `!showRoles && !showSearch`.
- `GameLobby.jsx` — pasek między alertami a siatką; siatka mapuje `visibleGames`; nowy pusty stan
  „brak wyników” obok istniejącego.

## i18n

Nowe klucze w `game.*` (en + pl): etykiety chipów (`filterAll`, `filterRunning`, `filterPlaying`),
placeholder i aria-label pola, przycisk czyszczenia pola, komunikaty pustego wyniku (z frazą /
bez), `clearFilters`.

## Dokumentacja

- Changelog: punkt trafia do sekcji `games` wersji 1.0.0, bo 1.0.0 nie jest jeszcze
  wdrożone (decyzja z planu) — to nie jest nowa wersja MINOR. Teksty w `changelog.json` en/pl.
- Baza wiedzy: `docs/knowledge-base/03-gry-i-uczestnicy.md` (akapit o lobby) + wiersz
  w `00-inwentaryzacja.md`.
- Przewodnik: sekcja `## … {#the-game-list}` w `src/help/{pl,en}/01-getting-started.md`.
- Lobby nie ma samouczka — bez zmian w `tours/`.

## Testy

- `lobbyFilter.test.js` — role; progi widoczności (8 vs 9 gier; jedna rola vs obie); dopasowanie
  po nazwie i po etykiecie systemu (wbudowany i szablon); polskie znaki („lodz” → „Łódź”);
  pusta / spacjowa fraza; AND chipa i frazy.
- `LobbyFilterBar` / lobby w `MemoryRouter` (`import '../../i18n'`): chipy ukryte przy jednej roli;
  pole ukryte przy ≤ 8 grach; klik chipa ustawia `?role=`; ukryte `role` z URL ignorowane;
  „Wyczyść filtry” usuwa oba parametry.
