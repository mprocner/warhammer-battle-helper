# PLAYRPG-293 — Wejście do kreatora w nagłówku lobby

## Cel

Jedyną drogą do kreatora systemów z ekranu listy gier (poza dialogiem tworzenia gry) jest dziś
`CreatorTile` — kafelek zawsze na końcu siatki gier. Kto ma sporo gier, nie widzi go bez
przewijania. Kreator ma być osiągalny od razu, niezależnie od liczby gier.

Przy okazji pusty stan lobby (brak gier) dostaje akcje zamiast pasywnego napisu i tłumaczy
ścieżkę gracza: do cudzej gry wchodzi się z zaproszenia MG wysłanego na e-mail.

## Decyzje

| Temat | Decyzja |
|---|---|
| Przycisk kreatora | W nagłówku `GameLobby`, przed „Utwórz Nową Grę”: `variant="outlined"`, `TuneIcon`. Kolejność: drugorzędny po lewej, główny po prawej. Klik → `openManager` (jak dziś kafelek). |
| Kafelek | Usunięty: `CreatorTile.jsx`, import + JSX w `GameLobby.jsx`, klucze `creator.tileTitle` / `creator.tileDesc` (en/pl). Brak innych użyć; lobby nie ma tutorialu, więc żadna kotwica kroku nie znika. |
| Wąski ekran | Kontener nagłówka dostaje `flexWrap: 'wrap'` + `gap` — przyciski zawijają się pod tytuł zamiast ściskać. |
| Pusty stan | Ta sama karta co dziś. Tytuł „Nie masz jeszcze żadnej gry”, opis „Utwórz własną albo poproś Mistrza Gry o zaproszenie na Twój e-mail”, dwa przyciski: „Utwórz grę” (`setCreateOpen(true)`) i „Zaprojektuj system” (`openManager`). |
| Duplikacja CTA | Świadoma — przyciski pustego stanu powtarzają nagłówek, bo tam ląduje wzrok nowego użytkownika. |
| Klucz `game.noActiveGames` | Zastąpiony nowymi kluczami (tytuł + opis); stary usunięty z en/pl. Etykiety przycisków pustego stanu — własne klucze, nie `game.createNewGame` (krótsza forma). |
| Sortowanie | Bez zmian. `GameService` już sortuje po „ostatnio otwartej przez użytkownika” (`sessionRepo.LatestStartedPerGame`), z fallbackiem na `createdAt`. |

## Poza zakresem

- Filtry ról (Prowadzę / Gram), zwinięte zakończone gry, wyszukiwarka, widok listy — osobny ticket
  o skalowaniu lobby.
- MG jako imię + awatar zamiast e-maila na kafelku gry.
- Odchudzony endpoint `GET /games` (otwarty leak ukrytych placements i zdarzeń `gm_only`).

## Zmiany w plikach

- `warhammer-battle-helper-front/src/components/GameLobby.jsx` — przycisk w nagłówku, nowy pusty
  stan, usunięty `CreatorTile`.
- `warhammer-battle-helper-front/src/components/lobby/CreatorTile.jsx` — usunięty.
- `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` — nowe klucze
  (przycisk nagłówka, tytuł/opis/przyciski pustego stanu), usunięte `creator.tileTitle`,
  `creator.tileDesc`, `game.noActiveGames`.

## Testy

Nowy `GameLobby.test.jsx` (render, `import '../i18n';`), z zamockowanymi `useGames` /
`useTemplates` i ciężkimi dziećmi (`TemplateBuilder`, dialogi) tam, gdzie przeszkadzają:

- przycisk kreatora w nagłówku jest widoczny przy niepustej liście i otwiera menedżer szablonów;
- przy pustej liście karta pokazuje tytuł, tekst o zaproszeniu i oba CTA; „Utwórz grę” otwiera
  dialog tworzenia, „Zaprojektuj system” — menedżer;
- przy niepustej liście pustego stanu nie ma, a kafelka kreatora nie ma nigdy.
