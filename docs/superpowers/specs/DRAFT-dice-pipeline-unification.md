# DRAFT — Unifikacja pipeline'u rzutów kośćmi

**Status:** szkic ticketu, do nadania numeru PLAYRPG. Realizować **po** PLAYRPG-231.
**Zależy od:** [PLAYRPG-231](PLAYRPG-231.md) — domena `internal/dice`, `DiceRollService`,
`ExpressionDiceRoll`.

## Problem

Po PLAYRPG-231 istnieją dwie ścieżki rzutu kośćmi bez postaci:

| Ścieżka | Wejście | Zdarzenie | Renderer |
|---|---|---|---|
| przyciski kości, Warhammer `useRollActions`, `CharacterDetails` | `POST /roll {sides, count}` | `simple` / `multi` | `SimpleDiceRoll` / `MultiDiceRoll` (×5 systemów) |
| komendy czatu `/r`, `/gmr` | `POST /rollExpression {expression}` | `expression` | `ExpressionDiceRoll` (wspólny) |

Ten sam rzut `2d10` wygląda w logu różnie, zależnie od źródła. Logika losowania i zapisu
statystyk jest zdublowana (`GameService.RollDice` + `Dice.RollMany` vs `DiceRollService`).

## Cel

Jedna ścieżka: każdy rzut kośćmi bez postaci przechodzi przez `DiceRollService.RollExpression`.

## Zakres

1. Przyciski kości (`RightPanel.rollDice`) wysyłają wyrażenie `"${count}d${sides}"` na
   `/rollExpression`.
2. Warhammer `useRollActions.js:52` i `CharacterDetails.jsx:303` — to samo.
3. Martwe ścieżki `axios.post(`${getApiUrl()}/roll`)` bez `gameId`
   (`useRollActions.js:72`, `CharacterDetails.jsx:323`) — sprawdzić, czy endpoint istnieje,
   i usunąć, jeśli nie.
4. Lokalny fallback losowania w `RightPanel.rollDice` (brak `gameId`/`token`) — usunąć,
   jeśli tryb offline nie istnieje.
5. Usunąć: `POST /games/:id/roll`, `GameHandler.RollDice`, `GameService.RollDice`,
   `service/Roll.go` (`Dice`), `SimpleDiceRoll.jsx`, `MultiDiceRoll.jsx`, wpisy
   `simple`/`multi` w 5 plikach `systems/*/index.js`, ich testy i nieużywane klucze i18n
   oraz CSS.
6. Stare zdarzenia `simple`/`multi` w bazie — bez backward compat: kasujemy albo zostawiamy
   z fallbackiem „Roll: X”. Decyzja przy realizacji.

## Ryzyka

- Przyciski kości to najczęściej używana funkcja czatu — regresja widoczna od razu. Weryfikacja
  w przeglądarce obowiązkowa.
- Warhammer może parsować odpowiedź `/roll` (`results`, `sum`) — sprawdzić konsumentów
  odpowiedzi HTTP, nie tylko zdarzeń WS.
- Klucz `count ≤ 20` — dziś przycinany po cichu w handlerze, po zmianie zwróci 400
  `count_out_of_range`. UI przycisków ma `MAX_DICE_COUNT = 20`, więc nie powinno wystąpić.
