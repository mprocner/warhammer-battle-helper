# Czat i rzuty

## Jak to działa

**Log** to wspólna lista zdarzeń gry: wiadomości czatu, rzuty z karty, rzuty z czatu, rzuty
przyciskami kości. Każde zdarzenie jest dopisywane do `Game.Events` (`$push`) i rozsyłane przez
WebSocket (`LOG_MESSAGE`, `DICE_ROLLED`, `SKILL_ROLLED`, `WEAPON_ROLLED`). Komponent do
wyświetlenia wpisu wybiera `resolveRollComponent.js`, a dla rzutów systemowych moduł systemu.

**Widoczność rzutu** wybiera się w `DiceRollControls` i dotyczy też rzutów z karty:

| Wartość | Kto widzi |
|---|---|
| `all` | wszyscy |
| `gm_and_roller` | MG i rzucający |
| `gm_only` | tylko MG (rzucający widzi tylko potwierdzenie „wysłano”) |
| `<userId>` | tylko rzucający i wybrany gracz (**bez MG**) |

Routing robi `RollPublisher.Publish`, a przy odczycie historii ten sam filtr stosuje
`GameHandler`. Przełącznik „Moje rzuty” filtruje log lokalnie.

**Komendy czatu** (`src/chat/commands/`): `/roll` (`/r`), `/gmroll` (`/gmr`, wymusza
`gm_only`), `/help`. Parser na froncie rozpoznaje komendę, a wyrażenie liczy backend
(`POST /rollExpression`, pakiet `internal/dice`).

**Składnia wyrażeń** (lexer → parser → evaluate):

| Przykład | Znaczenie |
|---|---|
| `d10`, `3d100` | kości, sumowane |
| `2d6 + 1d4 + 3`, `d100 -1` | suma składników i stałych |
| `4d6kh3`, `2d20kl1` | zachowaj najwyższe / najniższe |
| `6d10>=7` | pula: liczy kości z wynikiem ≥ 7 (musi być jedynym rzutem) |
| `d100-10 vs 45` | test: sukces, gdy wynik ≤ 45 (nie łączy się z pulą) |

Limity (`dice/limits.go`): 100 znaków, 10 składników, 20 kości w składniku, 50 kości łącznie,
1000 ścian, stała do 1000, próg `vs` do 10000. Komunikaty błędów mają klucze
`chat.commands.diceErrors.<powód>`.

**Wiadomości** są normalizowane przez `NormalizeChatMessage`: zwija puste linie, a długość
liczy w runach (znakach), nie bajtach. Limit 500 znaków jest ten sam na froncie (`MAX_MESSAGE_LENGTH`
w `ChatInput.jsx`) i na backendzie.

**Przyciski kości** pod czatem: domyślny zestaw albo `DiceButtons` z szablonu.

**Statystyki rzutów** (`RollStat`): każdy rzut zapisuje kość, wynik i typ. Są dostępne dla gry
(`/games/:id/roll-stats`, `RollStatsPanel`) i łącznie w ustawieniach konta (`DiceStats.jsx`):
liczba rzutów, średnia, krytyki, pechowe rzuty, rozkład.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Okno logu i czat | `src/components/LogWindow.jsx`, `src/components/log/` |
| Komendy | `src/chat/commands/commandRegistry.js`, `parseChatInput.js`, `useChatCommands.js`, `useChatHistory.js` |
| Parser kości | `internal/dice/` |
| Rzuty, publikacja | `internal/service/DiceRollService.go`, `roll_publisher.go`, `GameService.executeRoll` |
| Wiadomości | `internal/service/chat_message.go` |
| Statystyki | `internal/http/StatsHandler.go`, `src/components/stats/` |

## Pułapki

- `Game.Events` rośnie bez limitu wewnątrz dokumentu gry. MongoDB ma limit 16 MB na dokument,
  więc bardzo długa kampania może go kiedyś dobić. Na razie nic tego nie przycina.
- Rzut `gm_only` nie wraca do rzucającego ani przez WS, ani przez historię. Front pokazuje
  wtedy osobne potwierdzenie, żeby nie wyglądało, że rzut przepadł.
- Zmieniając limit długości wiadomości, zmień go w obu miejscach.
- Rzut do wybranego gracza celowo pomija MG. Jeśli to ma się zmienić, zmieniasz `RollPublisher`
  i filtr historii w `GameHandler` jednocześnie.
- Notacja kości to nie tekst do tłumaczenia: przykłady w `commandRegistry.js` są literałami,
  a tłumaczone są tylko opisy.
