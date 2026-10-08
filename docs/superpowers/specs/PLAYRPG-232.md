# PLAYRPG-232 — Pole obliczane w kreatorze + kolejność działań i nawiasy w formułach

**Status:** zaprojektowane 2026-10-08 (brainstorming zaakceptowany przez użytkownika)

**Dotyczy:**
- backend — `internal/models/SystemTemplate.go` (`FieldDef.Formula`, typ `computed`)
- backend — nowy `internal/systems/custom/formula.go` (parser klocków → drzewo)
- backend — `internal/systems/custom/roller.go` (`evalFormula`, `evalFormulaDicePool` jako obchody drzewa)
- backend — `internal/systems/custom/weapon.go` (obrażenia przez nowy ewaluator)
- front — nowy moduł `src/systems/custom/formula/` (parser, ewaluator arytmetyki, `formula_cases.json`)
- front — `components/creator/FormulaBuilder.jsx` (nawiasy, klocek `number`, tryb bez kości, podświetlenie błędu)
- front — `components/creator/TemplateBuilder.jsx` (typ `computed`, `makeDefaultField`, `PropertyPanel`, `numberFields`)
- front — `systems/custom/CustomSheetBody.jsx` (render pola obliczanego)
- `src/locales/en/translation.json`, `src/locales/pl/translation.json`

## Cel

1. MG dodaje w kreatorze pole **obliczane**: etykieta, wartość domyślna, formuła. Gracz widzi
   wynik, nie może go edytować.
2. Wszystkie formuły szablonu (rzuty, obrażenia broni, pole obliczane) liczą się **z kolejnością
   działań i nawiasami**. Dziś `evalFormula` liczy od lewej do prawej: `10 + Siła * 5` przy
   Sile 40 daje 250 zamiast 210.

```
Żywotność  = Wytrzymałość * 2 + 10
Średnia    = (Siła + Zręczność) / 2
Rzut       = 2 * 3 d d6            → 2 × (suma 3d6)
Pula       = (Siła / 10) d d10
```

## Decyzje

| # | Decyzja |
|---|---|
| 1 | Formuła pola obliczanego odwołuje się do pól `attr` i `number`. Bez `progress`, `checkbox`, umiejętności i innych pól obliczanych. |
| 2 | Kolejność działań + nawiasy dla **wszystkich** formuł szablonu, w tym tickecie. |
| 3 | `d` wiąże najsilniej: `2 * 3 d d6` = 2 × (3d6). 6d6 zapisuje się `(2 * 3) d d6`. |
| 4 | Pole obliczane liczone w **JS przy renderze**, niezapisywane w `stats`. Go jest wzorcem semantyki. |
| 5 | Zgodność Go/JS pilnuje wspólny plik przypadków `formula_cases.json`, czytany przez testy obu stron. |
| 6 | Regresja wyników istniejących formuł rzutów jest akceptowana (brak backward compat) — bez migracji i bez raportu z bazy. |

## Język formuły

Formuła pozostaje tablicą klocków `[]FormulaBlock`. Parser zamienia ją na drzewo:

```
wyrażenie  := składnik ( ('+' | '-') składnik )*
składnik   := czynnik  ( ('*' | '/') czynnik )*
czynnik    := atom [ 'd' kość ]  |  kość
atom       := wartość  |  '(' wyrażenie ')'
wartość    := attr | number | const | skill | attr_linked | const_input
kość       := dice | dice_attr | dice_skill_attr
```

`'d'` to klocek `op` z `Value: "d"` (jak dziś).

**Nowe typy klocków:**
- `paren_open`, `paren_close`
- `number` — `Key` + `Label`, czyta `stats.numbers[key]`

**Zasady (identyczne w Go i JS):**
- Parser musi skonsumować wszystkie klocki; reszta po sparsowaniu = błąd.
- Dzielenie całkowite z obcięciem w stronę zera (`-7 / 2 = -3`; JS: `Math.trunc`). Dzielenie
  przez zero = błąd.
- `const` (`Num *float64`) obcinany w stronę zera (`2.7 → 2`; JS: `Math.trunc`).
- Brak minusa jednoargumentowego — `-` nie może otwierać formuły ani stać po `(`.
- Brak łańcuchów `d`: `kość d kość` jest błędem. Kość jako liczba kości wymaga nawiasu:
  `(d6) d d10`.
- Pusty nawias `()` i niedomknięty nawias = błąd.
- Nieznany typ klocka = błąd (dziś Go go pomija).
- Brakujący klucz w `stats` przy kluczu obecnym w szablonie = 0 (zero value mapy, jak dziś).
- Limit **100 kości** na węzeł `d`. Przekroczenie = błąd rzutu (bez cichego przycinania).
  Liczba kości < 1 nadal podbijana do 1 (zachowanie obecne).
- Błąd parsera niesie **indeks klocka**, na którym parser się zatrzymał.

**Zmiana zachowania (celowa):** formuły puli z łańcuchem `d6 d d10` (dziś „K6K10”) przestają
być poprawne — zapis docelowy `(d6) d d10`. Kreator pokazuje błąd przy otwarciu takiego
szablonu; rzut zwraca błąd.

## Backend

**`formula.go` (nowy).** `parseFormula([]models.FormulaBlock) (node, error)` — parser
rekurencyjny według gramatyki. Węzły: `num`, `ref` (attr / number / skill / attr_linked /
const_input), `binop{op, left, right}`, `paren{inner}`, `dice{count node|nil, sides}`, gdzie
`sides` rozróżnia literał (`d6`), `dice_attr` i `dice_skill_attr`. Błąd parsera typu
`formulaError{index, reason}`.

**`roller.go`.**
- `evalFormula` = obchód drzewa: zwraca wynik, `diceType` (ścianki pierwszej kości), `labelStr`,
  `valueStr`. Sygnatura bez zmian dla wywołujących.
- `evalFormulaDicePool` = drugi obchód: `count` węzła `dice` liczony arytmetycznie, reszta
  drzewa emitowana jako części `text` (operatory, wartości, nawiasy). `extraDice` nadal trafia do
  pierwszego węzła kości.
- Trzy skopiowane gałęzie obsługi `d` (dla `dice` / `dice_attr` / `dice_skill_attr`) w obu
  funkcjach znikają — jeden węzeł `dice`.
- Usuwane: stanowe pętle `segments` / `pendingOp` z obu funkcji.

**`weapon.go`.** Obrażenia przez to samo `evalFormula`; `applyDamageOverrides` nadal zamienia
`const_input` na `const` przed parsowaniem.

**Rozpis.** Nawiasy w `labelStr` / `valueStr` (i w częściach puli) dokładnie tam, gdzie postawił
je MG — węzeł `paren` istnieje w drzewie wyłącznie po to. Bez dokładania nawiasów:
`(Siła+2)*d6 = (40+2)*4 = 168`.

**Model.** `FieldDef` dostaje:
```go
Formula []FormulaBlock `bson:"formula,omitempty" json:"formula,omitempty"`
```
Wymagane, choć liczenie jest w JS: `ShouldBindJSON` wiąże szablon do structa, pole nieznane
structowi znika przy zapisie. Typ `computed` dopisany do komentarza listy typów. `SeedDefaults`
i `ComputeDerived` nie zmieniają się — pole obliczane nic nie zapisuje w `stats`.

## Front

**`src/systems/custom/formula/`.**
- `parseFormula(blocks)` → drzewo albo `{ error: { index, reason } }` — ta sama gramatyka i zasady.
- `evaluateArithmetic(tree, { attributes, numbers })` → liczba albo błąd (bez kości i bez klocków
  kontekstu rzutu).
- `formula_cases.json` — wspólne przypadki (patrz Testy).

**`FormulaBuilder.jsx`.**
- Przyciski `(` i `)` w palecie; klocek `number` obok `attr`.
- Prop trybu pola obliczanego: paleta bez kości i bez `skill`, `attr_linked`, `dice_skill_attr`,
  `const_input`.
- `validateFormula` zastąpione przez `parseFormula` (formuła poprawna ⇔ parser ją przyjmuje).
  Dla pola obliczanego dodatkowo odrzucane klocki spoza dozwolonego zestawu.
- Klocek o indeksie z błędu podświetlony.
- `formulaToString` wypisuje nawiasy jak w rozpisie Go.

**`TemplateBuilder.jsx`.**
- `computed` w `FIELD_TYPES`, grupa palety „Stats”.
- `makeDefaultField('computed')` → baza + `{ formula: [], default: null }`.
- `PropertyPanel`: etykieta, wartość domyślna (liczba całkowita, opcjonalna), `FormulaBuilder`
  w trybie pola obliczanego.
- `numberFields` (źródło klocków formuły) obejmuje pola `attr` **i** `number` — także dla
  formuł rzutów.

**`CustomSheetBody.jsx`.** Pole `computed` renderowane jako wartość tylko do odczytu, w ramie jak
`number`, bez inputa i bez `onChange`. Wartość liczona przy renderze z bieżących `stats`
(lokalnie edytowanych), więc zmienia się natychmiast przy wpisywaniu atrybutu. Kreator
(prawdziwy `CustomSheetBody`) pokazuje wynik dla pustej postaci.

**Wartość pola obliczanego:**

| Sytuacja | Wynik |
|---|---|
| formuła poprawna, wszystkie klucze w szablonie | wynik obliczenia |
| klucz w szablonie, brak wartości w `stats` | traktowany jako 0 |
| formuła pusta / niepoprawna | wartość domyślna |
| dzielenie przez zero | wartość domyślna |
| klocek wskazuje pole usunięte z szablonu | wartość domyślna |
| brak wartości domyślnej + którykolwiek błąd | puste pole |

**i18n.** Klucze: nazwa typu pola, etykieta wartości domyślnej, przyciski nawiasów, komunikaty
błędów parsera (po jednym na `reason`), en + pl.

## Testy

**Wspólny plik** `warhammer-battle-helper-front/src/systems/custom/formula/formula_cases.json`
(w `src/`, bo CRA nie importuje spoza `src`; test Go czyta go ścieżką względną).

```json
{ "name": "...", "blocks": [...], "attributes": {...}, "numbers": {...},
  "expect": 42 | "error" | "valid" }
```

`"valid"` / `"error"` dla przypadków z kośćmi (JS ich nie liczy, tylko parsuje). Obowiązkowe:
- kolejność działań: `10 + 25 * 2 = 60`, `25 * 2 + 10 = 60`
- nawiasy: `(40 + 30) / 2 = 35`; `20 - 6 - 4 = 10`; `20 - (6 - 4) = 18`
- `-7 / 2 = -3`; `const 2.7 → 2`
- dzielenie przez zero → error
- niedomknięty nawias, pusty `()`, reszta po sparsowaniu, `-` na początku → error
- nieznany typ klocka → error
- łańcuch `d6 d d10` → error; `(d6) d d10` → valid; `2 * 3 d d6` → valid
- klucz w szablonie bez wartości w `stats` → 0
- klocek `number`

**Go.**
- Test czytający `formula_cases.json`: parser + arytmetyka (przypadki liczbowe), parser
  (`valid`/`error`).
- Istniejące testy rollera zakładające liczenie od lewej do prawej dostają nowe oczekiwania —
  jako celowa zmiana w commicie.
- Rozpis z nawiasami; `2 * 3 d d6` jako 2 × suma (wstrzyknięty `rng`, wzorzec istniejący).
- Pula z wyrażeniem jako liczbą kości; `extraDice` na pierwszym węźle kości.
- Limit 100 kości → błąd.
- Obrażenia broni z `const_input`.

**JS.**
- Test parsera i ewaluatora czytający `formula_cases.json`.
- `FormulaBuilder`: przyciski nawiasów, brak kości w trybie pola obliczanego, podświetlenie
  klocka z błędem.
- `CustomSheetBody` z polem obliczanym: wynik, wartość domyślna przy błędzie, puste pole.

**Znana luka:** wspólny plik nie obejmuje rozpisu — istnieje tylko w Go.

## Poza zakresem

- Karta skrócona, rzucalność, `abbr` dla pola obliczanego.
- Pole obliczane w slocie tokena (wymagałoby liczenia w Go i zapisu w `stats`).
- Odwołania do innych pól obliczanych (graf zależności, cykle).
- Minus jednoargumentowy, funkcje (`min`, `max`, `floor`).
- Walidacja szablonu po stronie serwera przy zapisie (bez zmian względem dziś).
- Migracja / raport istniejących formuł, których wynik się zmieni.
