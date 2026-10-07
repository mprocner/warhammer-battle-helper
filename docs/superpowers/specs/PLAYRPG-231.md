# PLAYRPG-231 — Komendy rzutu kośćmi w czacie

**Status:** zaprojektowane 2026-10-07 (brainstorming zaakceptowany przez użytkownika)
**Następny krok po wdrożeniu:** [DRAFT — unifikacja pipeline'u rzutów](DRAFT-dice-pipeline-unification.md)

**Dotyczy:**
- backend — nowy pakiet domenowy `internal/dice/`
- backend — nowy serwis aplikacyjny `internal/service/DiceRollService.go` + porty
- backend — wydzielenie `RollPublisher` i `DisplayNameResolver` z `GameService` (refaktor bez zmiany zachowania)
- backend — nowy handler `internal/http/DiceRollHandler.go`, routing w `main.go`
- front — nowy moduł `src/chat/commands/` (rejestr komend, parser wejścia, historia)
- front — `components/log/ChatInput.jsx` (kontrakt `onSubmit`, podpowiedzi, pomoc, błąd, historia)
- front — `components/panels/RightPanel.jsx` (wpięcie `useChatCommands`)
- front — `components/log/ExpressionDiceRoll.jsx` + `LogWindow.jsx` (renderer niezależny od systemu)
- `src/locales/en/translation.json`, `src/locales/pl/translation.json`

## Cel

Gracz rzuca kośćmi, wpisując komendę w czacie zamiast klikać przyciski. Wpis w logu pokazuje
wynik każdej kości oraz wynik końcowy.

```
/r d10            /roll 3d100        /r d100 -1        /r 2d6 + 1d4 + 3
/r 4d6kh3         /r 2d20kl1         /r 6d10>=7        /r d100-10 vs 45
/gmr 2d10         /help
```

## Zakres

| # | Funkcja | Decyzja |
|---|---|---|
| MVP | `/r`, `/roll`, `NdX`, `dX`, `±N`, wynik każdej kości + suma | ✔️ |
| 1 | Mieszane wyrażenia `2d6 + 1d4 + 3`, dowolne spacje | ✔️ |
| 3 | Keep highest / lowest: `4d6kh3`, `2d20kl1` | ✔️ |
| 5 | Pula sukcesów: `6d10>=7` | ✔️ |
| 7 | `vs N` — sukces/porażka, **zawsze `wynik ≤ N`**, bez SL, bez poziomów CoC | ✔️ |
| 8 | Rzut tajny `/gmroll`, `/gmr` → widoczność `gm_only` | ✔️ |
| 11 | ↑ / ↓ — historia wysłanych wpisów | ✔️ |
| 12 | Podpowiedzi komend po wpisaniu `/` | ✔️ |
| 13 | Błąd składni pod inputem, tekst zostaje w polu | ✔️ |
| 14 | `/help` — lokalna ściąga, nic nie trafia do logu | ✔️ |

Poza zakresem (świadomie): aliasy `d%`, sam `/r` bez kości, etykiety rzutu (`/r d100 Percepcja`),
przewaga/utrudnienie, kości eksplodujące, szept `/w`, „rzuć ponownie” w logu, rzut umiejętnością
postaci, rzuty inline `[[…]]`, kierunek `vs` zależny od systemu (D&D liczy `≥` — świadomie
pomijamy), samouczek czatu (`tutorial/tours/chat.js`).

## Decyzje

1. **Nowy pipeline obok starego** (podejście 1). `POST /games/:id/roll`, przyciski kości,
   `SimpleDiceRoll`/`MultiDiceRoll` zostają bez zmian. Konsekwencja: `2d10` z przycisku i `/r 2d10`
   wyglądają w logu inaczej, dopóki nie wejdzie ticket unifikacyjny.
2. **Gramatykę zna tylko backend.** Front rozpoznaje wyłącznie *nazwę* komendy (`/r`, `/gmr`,
   `/help`) i na tej podstawie wybiera akcję. Wyrażenie wysyła jako surowy string. Dwa parsery
   (Go + JS) rozjechałyby się bez testu spinającego oba języki — patrz `skillValue` /
   `resolveSkillValues`. Koszt: błąd składni widać po wysłaniu, nie w trakcie pisania.
3. **Losowanie na backendzie** — jak dziś. Klient nigdy nie wysyła wyników.
4. **Komenda ≠ wyrażenie.** „Komenda” (`/gmr`, `/help`) to język interfejsu czatu — żyje na
   froncie. „Wyrażenie kości” (`2d6+3 vs 10`) to język domeny — żyje w `internal/dice`. Backend
   nie wie, że istnieje `/gmr`; dostaje wyrażenie i `visibility: "gm_only"`.
5. **Domena bez infrastruktury.** `internal/dice` nie importuje `models`, Mongo, Gin, websocketu
   ani `systems`. Mapowanie wyniku domenowego na payload zdarzenia robi warstwa aplikacji.
6. **Renderer wyrażenia jest niezależny od systemu.** Rejestrujemy go raz w `LogWindow`
   (mapa wspólnych rendererów, sprawdzana przed `system.getRollComponent`), zamiast kopiować do
   5 plików `systems/*/index.js`.

## Architektura — warstwy (DDD)

```
┌── Interfejs ───────────────────────────────────────────────────────────────┐
│ front: ChatInput ─ useChatCommands ─ chat/commands (registry, parseInput)  │
│ front: LogWindow ─ ExpressionDiceRoll                                      │
│ backend: http/DiceRollHandler  (JWT → actor, JSON ↔ DTO, błąd → 400)       │
├── Aplikacja ───────────────────────────────────────────────────────────────┤
│ service/DiceRollService.RollExpression                                     │
│   gra → parse → evaluate → zdarzenie → zapis → broadcast → statystyki      │
│   zależy od PORTÓW (interfejsy deklarowane po stronie konsumenta)          │
├── Domena ──────────────────────────────────────────────────────────────────┤
│ internal/dice: Parse, Expression (AST), Limits, Evaluate, Outcome, Error   │
│   czyste funkcje, losowość wstrzykiwana przez dice.Roller                  │
├── Infrastruktura ──────────────────────────────────────────────────────────┤
│ GameRepository, RollStatsRepository, websocket.Hub                         │
│ (adaptery: RollPublisher, DisplayNameResolver)                             │
└────────────────────────────────────────────────────────────────────────────┘
```

Zależności idą tylko w dół. Domenę da się przetestować bez Mongo i bez HTTP. Serwis da się
przetestować na fake'ach portów.

## Domena — `internal/dice`

### Gramatyka

```
expression := term ( ('+' | '-') term )* [ 'vs' integer ]
term       := diceTerm | integer
diceTerm   := [integer] 'd' integer [ keep | threshold ]
keep       := ('kh' | 'kl') integer
threshold  := '>=' integer
```

- Wielkość liter bez znaczenia (`2D6KH1` = `2d6kh1`). Białe znaki ignorowane wszędzie, więc
  `d100 -1`, `d100-1` i `d100 - 1` to to samo.
- Brak liczby kości = 1 (`d10` = `1d10`).
- Pierwszy składnik nie może mieć znaku (`-2 + d6` → błąd). `vs` tylko na końcu.

### Reguły semantyczne (po parsowaniu)

| Reguła | Kod błędu |
|---|---|
| co najmniej jeden składnik kościany | `no_dice` |
| składnik z `>=` (pula) musi być **jedynym** składnikiem kościanym i mieć znak `+` | `pool_mixed` |
| `vs` niedozwolone w trybie puli | `pool_with_check` |
| `kh`/`kl`: `1 ≤ K ≤ liczba kości` | `keep_out_of_range` |
| `>=`: `1 ≤ T ≤ ściany` | `threshold_out_of_range` |
| ściany `2..1000` | `sides_out_of_range` |
| kości w składniku `1..20` (jak dzisiejszy limit `/roll`) | `count_out_of_range` |
| łącznie kości ≤ 50 | `too_many_dice` |
| składników ≤ 10 | `too_many_terms` |
| stała `0..1000`, próg `vs` `0..10000` | `number_out_of_range` |
| wyrażenie ≤ 100 znaków | `too_long` |
| błąd składni | `unexpected_token` (z pozycją), `unexpected_end`, `empty` |

Limity są wartością (`dice.DefaultLimits()`), nie stałymi rozsianymi po kodzie. Testy mogą
podać własne.

### Typy (szkic)

```go
package dice

// Roller is the domain's source of randomness. systems.DefaultRoller() satisfies it
// structurally, so the domain does not import the systems package.
type Roller interface{ Intn(n int) int }

type Expression struct {
    Terms []Term
    Check *Check // nil when there is no "vs"
}

type Term struct {
    Sign      int        // +1 or -1
    Constant  *int       // set for a numeric term
    Dice      *DiceSpec  // set for a dice term
}

type DiceSpec struct {
    Count, Sides int
    Keep         *Keep // kh / kl
    Threshold    *int  // >= T, turns the expression into a success pool
}

type Keep struct {
    Highest bool
    Count   int
}

type Check struct{ Target int }

type Mode string // "sum" | "pool"

type Outcome struct {
    Canonical string        // normalized notation, e.g. "2d6+1d4-1"
    Mode      Mode
    Terms     []TermOutcome
    Total     int           // sum, or the success count in pool mode
    Check     *CheckOutcome
}

type TermOutcome struct {
    Sign     int
    Constant *int
    Dice     []Die    // empty for a constant
    Subtotal int
}

type Die struct {
    Sides   int
    Value   int
    Kept    bool // false = dropped by kh/kl
    Success bool // pool mode only
}

type CheckOutcome struct {
    Target  int
    Success bool // Total <= Target
}

type Error struct {
    Code     string         // e.g. "keep_out_of_range"
    Position int            // rune offset into the input, -1 when not positional
    Params   map[string]int // e.g. {"max": 20}
}

func Parse(input string, limits Limits) (Expression, error)
func Evaluate(expr Expression, rng Roller) Outcome
```

`Parse` łączy składnię i walidację semantyczną, a każdy błąd zwraca jako `*dice.Error`.
`Evaluate` nie może zawieść, bo przyjmuje wyłącznie zwalidowane `Expression`.

### Ewaluacja

- **sum**: dla każdego składnika kościanego rzucamy `Count` kości. `kh`/`kl` oznacza
  `Kept=false` na odrzuconych (przy remisie odrzucamy późniejszą kość — deterministycznie).
  `Subtotal` = suma zachowanych. `Total` = Σ `Sign × Subtotal`.
- **pool**: `Success = Value ≥ T`. `Subtotal` = liczba sukcesów. Stałe ± modyfikują liczbę
  sukcesów. `Total` nie schodzi poniżej 0.
- **vs**: `Success = Total ≤ Target`.

## Aplikacja — `DiceRollService`

```go
type DiceRollService struct {
    games     gameLookup          // GetByID
    events    eventAppender       // AddEvent
    publisher rollPublisher       // Publish(gameID, eventType, payload, visibility, roller, gm)
    names     displayNameResolver // DisplayName(game, userID, fallback)
    stats     rollStatsRecorder   // Record(*models.RollStat) error
    rng       dice.Roller
    limits    dice.Limits
}

func (s *DiceRollService) RollExpression(gameID, input string, actor Actor, visibility string) (dice.Outcome, error)
```

Kolejność: `Parse` (błąd → zwróć `*dice.Error` przed jakimkolwiek odczytem z bazy) → wczytaj
grę → `Evaluate` → zbuduj `models.GameEvent{Type: EventTypeDiceRoll}` z payloadem → `AddEvent`
→ `Publish(websocket.EventDiceRolled, …)` → statystyki w gorutynie.

**Porty** to małe interfejsy zadeklarowane w pliku serwisu (Go: interfejs definiuje konsument).
`*repository.GameRepository` i `*repository.RollStatsRepository` spełniają je bez zmian.

**Wydzielenia z `GameService`** (zachowanie bez zmian, `GameService` deleguje):
- `broadcastRoll` → `RollPublisher{hub}` w `service/roll_publisher.go`,
- `resolveDisplayNameForUser` → `DisplayNameResolver{userRepo}` w `service/display_name_resolver.go`.

Bez tego `DiceRollService` musiałby zależeć od całego `GameService` albo kopiować routing widoczności.

**Statystyki:** każda rzucona kość (także odrzucona przez `kh`/`kl`) to jeden `RollStat`
z `RollType: "generic"`, `DieType: Sides`. Strona statystyk liczy fizyczne rzuty, więc nie zmienia
się nic.

### Payload zdarzenia (`data`)

```json
{
  "rollType": "expression",
  "expression": "2d6+1d4-1",
  "mode": "sum",
  "terms": [
    { "sign": 1, "count": 2, "sides": 6, "keep": null, "threshold": null,
      "dice": [ { "value": 4, "kept": true, "success": false }, { "value": 2, "kept": true, "success": false } ],
      "subtotal": 6 },
    { "sign": 1, "count": 1, "sides": 4, "dice": [ { "value": 3, "kept": true } ], "subtotal": 3 },
    { "sign": -1, "constant": 1, "subtotal": 1 }
  ],
  "total": 8,
  "check": null,
  "username": "…", "visibility": "all", "rollerUserId": "…"
}
```

Mapowanie `dice.Outcome → map[string]interface{}` żyje w serwisie (`outcomeToPayload`), nie w
domenie. Domena nie wie, że istnieje JSON ani Mongo.

## HTTP — `DiceRollHandler`

`POST /games/:id/rollExpression` (grupa `game` — JWT + uczestnik gry)

```json
// request
{ "expression": "2d6+3", "visibility": "gm_only" }
// 200
{ ...payload jak wyżej... }
// 400 — błąd wyrażenia
{ "error": "invalid_expression", "code": "keep_out_of_range", "position": 5, "params": { "max": 4 } }
```

Inne 400 (brak pola) i 500 tak jak w pozostałych handlerach.

## Front — moduł `src/chat/commands/`

| Plik | Odpowiedzialność |
|---|---|
| `commandRegistry.js` | lista komend: `{ name, aliases, action, visibility?, usageKey, examples }` + `findCommand(token)`, `matchCommands(prefix)` |
| `parseChatInput.js` | czysta funkcja: `text → { kind: 'message', text } \| { kind: 'command', command, args } \| { kind: 'unknownCommand', name }` |
| `useChatHistory.js` | historia w pamięci (max 50, bez duplikatów pod rząd), `prev()` / `next()` / `push()` |
| `useChatCommands.js` | `submit(text) → Promise<{ ok: true } \| { ok: false, error: { key, params } }>` — wybiera `sendMessage` / `rollExpression` / `help` |

Rejestr:

| Komenda | Aliasy | Akcja |
|---|---|---|
| `/roll` | `/r` | `rollExpression(args, rollVisibility)` — widoczność z selecta |
| `/gmroll` | `/gmr` | `rollExpression(args, 'gm_only')` |
| `/help` | — | otwiera panel pomocy, nic nie wysyła |

**Zasady wejścia:**
- Tekst nie zaczyna się od `/` → zwykła wiadomość (bez zmian).
- `/nieznana …` → lokalny błąd `chat.commands.errors.unknown`, nic nie leci do backendu.
- `/r` bez argumentu → lokalny błąd `chat.commands.errors.missingExpression`.

### `ChatInput` — kontrakt i zachowanie

- `onSend(text)` → `onSubmit(text)` zwracające `Promise<{ok, error}>`. Pole czyścimy **tylko
  przy `ok`**. Przy błędzie tekst zostaje, pod polem pojawia się `.chat-input__error`. Błąd znika
  przy następnej zmianie treści.
- Błąd backendu `code` → klucz `chat.commands.diceErrors.<code>` z `params`.
- **Podpowiedzi (12):** gdy tekst zaczyna się od `/` i nie ma jeszcze spacji, nad polem pojawia
  się lista pasujących komend (nazwa, aliasy, składnia). `Tab` albo klik uzupełnia do `/nazwa `.
  `Esc` zamyka. **Enter dalej wysyła** — podpowiedzi nie przechwytują Entera.
- **Pomoc (14):** `/help` otwiera nad polem panel ze wszystkimi komendami, składnią wyrażeń i
  przykładami. Zamykany `Esc` lub przyciskiem. Pole zostaje wyczyszczone, log bez zmian.
- **Historia (11):** ↑ / ↓ działa, gdy pole jest puste **albo** pokazuje niezmieniony wpis
  z historii. W każdej innej sytuacji strzałki zostają natywne, bo textarea jest wieloliniowa
  i przechwycenie ↑ zepsułoby nawigację po liniach. Zapisujemy wysłane wiadomości i komendy.
  Historia żyje w pamięci i znika po odświeżeniu strony.

### Log

- `components/log/ExpressionDiceRoll.jsx`: nagłówek (gracz + `expression`), składniki z kośćmi
  jako tokeny (reuse `DiceResultToken`), odrzucone kości wyszarzone i przekreślone, sukcesy puli
  wyróżnione `#c9975b`, duży wynik końcowy. Przy `check`: znacznik „Sukces”/„Porażka” i próg.
- `LogWindow.jsx`: `sharedRollComponents = { expression: ExpressionDiceRoll }` sprawdzane przed
  `system.getRollComponent(rollType)`. Fallback „Roll: X” dla nieznanych typów bez zmian.

### i18n (en + pl)

`chat.commands.*` (usage, przykłady, nagłówek pomocy, błędy lokalne),
`chat.commands.diceErrors.<code>` (wszystkie kody z tabeli reguł), `dice.expression.*`
(sukces/porażka, sukcesy puli, „próg”).

## Testy

**Backend**
- `internal/dice/parse_test.go` — tabela: każdy przykład z „Cel” + każdy kod błędu (kod
  i pozycja), wielkość liter, spacje.
- `internal/dice/evaluate_test.go` — fake `Roller` z kolejką wartości: suma, `kh`/`kl` (w tym
  remis), pula ze stałą (i z klamrą na 0), `vs` na granicy (`Total == Target` → sukces).
- `service/DiceRollService_test.go` — fake'i portów: błąd wyrażenia nie dotyka bazy, payload ma
  oczekiwany kształt, widoczność trafia do `Publish`, liczba `RollStat` = liczba rzuconych kości.
- `RollPublisher` / `DisplayNameResolver` — obecne testy `GameService` muszą przejść bez zmian.

**Front** (`CI=true npm test -- --watchAll=false`)
- `parseChatInput.test.js`, `commandRegistry.test.js` — czyste funkcje.
- `useChatHistory.test.jsx` — `renderHook`.
- `useChatCommands.test.jsx` — routing komend, `/gmr` wymusza `gm_only`, mapowanie błędu 400.
- `ChatInput.test.jsx` — rozszerzony: błąd zostawia tekst, `Tab` uzupełnia, `Esc` zamyka,
  ↑ przy pustym polu, ↑ w wieloliniowym tekście nie przechwycone, `/help` otwiera panel.
- `ExpressionDiceRoll.test.jsx` — suma, keep, pula, check.

## Kolejność wdrożenia (commity)

1. Domena `internal/dice` + testy.
2. Wydzielenie `RollPublisher` i `DisplayNameResolver` (refaktor, testy zielone bez zmian).
3. `DiceRollService` + handler + routing + testy.
4. Front: `chat/commands` + `ChatInput` + `RightPanel` + i18n + testy.
5. Front: `ExpressionDiceRoll` + `LogWindow` + testy.
6. Ręczna weryfikacja w przeglądarce (dwóch graczy, `/gmr` niewidoczny dla gracza).
