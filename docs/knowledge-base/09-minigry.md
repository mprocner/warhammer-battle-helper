# Minigry

## Jak to działa

Zakładka Minigry (tylko MG) uruchamia jedną z dwóch gier w kości dla wybranych uczestników.
MG może dodać też graczy NPC i ustawić liczbę rund (`MaxRounds`).

| Gra | Klucz | Przebieg |
|---|---|---|
| Yahtzee | `yahtzee` | Tury po kolei: rzut, zatrzymywanie kości (`held`), do 3 rzutów, wpis do tabeli (`score`). Wygrywa najwyższa suma |
| Kościany poker | `dicepoker` | Faza `rolling`: każdy rzuca i przerzuca w ukryciu, potem potwierdza (`confirm`). Faza `reveal`: odsłonięcie układów i wynik rundy, `next-round` |

Wspólne API: `POST /minigame/start`, `GET /minigame`, `POST /minigame/roll`,
`PATCH /minigame/held`, `POST /minigame/score`, `POST /minigame/confirm`,
`POST /minigame/next-round`, `DELETE /minigame`. Zdarzenia WS: `MINIGAME_STARTED`,
`MINIGAME_STATE_UPDATED`, `MINIGAME_ENDED`.

W pokerze serwer maskuje kości innych graczy do fazy odsłonięcia (`snapshot(forUserID)`).
Układy od najsłabszego: wysoka kość, para, dwie pary, trójka, strit, full, kareta, poker.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Zakładka | `src/components/tabs/MinigameTab.jsx`, `src/components/tabs/minigame/` |
| Plansze | `src/components/minigame/` (`YahtzeeBoardModal`, `DicePokerBoardModal`, `poker/`, `yahtzee/`) |
| Backend | `internal/http/MinigameHandler.go`, `internal/service/YahtzeeService.go`, `DicePokerService.go` |
| Pomysły na kolejne gry | `features/minigame-archetypes.md` |

## Pułapki

- **Stan minigry jest tylko w pamięci serwera** (`sync.Map` w serwisach), nie w MongoDB.
  Restart backendu, w tym autodeploy, kończy każdą trwającą rozgrywkę.
- Każda gra ma własny mutex. Nowe operacje muszą go brać, bo żądania graczy przychodzą równolegle.
- `internal/http/YahtzeeHandler.go` nie jest podpięty w `main.go` i wygląda na pozostałość po
  starszym API. Trasy obsługuje `MinigameHandler`.
- Nowa gra to: nowy serwis, `case` w `MinigameHandler.Start` i gałąź `HasGame` w każdej
  pozostałej metodzie handlera,
  plansza na froncie, tłumaczenia `minigames.<gra>.*` i krok w samouczku `tours/minigames.js`.
