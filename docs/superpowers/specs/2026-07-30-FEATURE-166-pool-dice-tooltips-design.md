# FEATURE-166 — tooltipy z rodzajem kości i wzór pod rzutem puli (system custom)

Data: 2026-07-30

## Problem

W trybie `dice_pool` na karcie postaci systemu custom log pokazuje surowe wyniki
kości jako rząd żetonów. Gracz nie wie, która liczba pochodzi z której kości —
przy wzorze `d6+d10+d10` wynik `4` mógł wypaść na K6 albo na K10, a to zmienia
jego wagę. Sam wzór nie jest nigdzie pokazany, mimo że tryb tradycyjny wypisuje
go pod rzutem.

## Zakres

1. Tooltip nad każdym żetonem puli z rodzajem kości, która dała ten wynik.
2. Linia wzoru pod rzędem żetonów, analogicznie do `formulaBreakdown` w trybie
   tradycyjnym.

Dotyczy wyłącznie `CustomRoll` (rzuty na umiejętności i atrybuty).

## Poza zakresem

- **Żetony puli w rzucie bronią.** `RollWeaponWithTemplate` (`weapon.go:40`) woła
  `rollFromFormula`, więc broń może wpaść w tryb puli. `CustomWeaponRoll.jsx`
  renderuje linię wzoru (`formatPoolFormula(data.poolFormula, t)`), tak samo jak
  `CustomRoll`, ale nadal **nie renderuje żetonów puli ani tooltipów** — to
  istniejąca luka w widoku, nie problem tooltipów — osobne zadanie.
- **Lokalizacja notacji w trybie tradycyjnym.** `formulaBreakdown` nadal pokaże
  `d6` zamiast `K6`, a backend nadal wstawia zaszyte polskie `umiej.`
  (`roller.go`, `case "skill"`). Wyrównanie tego to osobny feature.

## Decyzje projektowe

### Tooltip pokazuje wyliczoną liczbę ścianek

Zawsze `K8`, także dla kości o ściankach z atrybutu (`d(SIŁA)`). Tooltip
odpowiada na pytanie „jaka kość fizycznie dała ten wynik"; kontekst `SIŁA`
widać obok, w linii wzoru, więc dublowanie go w tooltipie nic nie wnosi.

### Linia wzoru zawiera sam wzór

`K6+K10+K10`, bez `= 4+7+2` i bez `= 2 sukcesy`. Poszczególne wyniki są już
widoczne jako żetony, a liczba sukcesów ma własny licznik — pełny rozpis
powtarzałby te same dane trzeci raz i przy puli 10 kości rozjeżdżał linię.

### Notacja lokalizowana przez front, wzór przesyłany strukturalnie

Backend nie wysyła gotowego stringa wzoru, tylko listę członów; front skleja
go i podstawia `K`/`D` z i18n. Odrzucone: podmiana litery regexpem po stronie
frontu — etykiety atrybutów też zawierają `d` (`Odwaga` → `OKwaga`).

### Jedna struktura zamiast dwóch równoległych tablic

Żetony i linia wzoru pochodzą z tego samego pola, więc rozjazd danych jest
niemożliwy z definicji. Odrzucone: `PoolRolls []int` + równoległe
`PoolDiceSides []int` (niezmiennik równej długości pilnowany tylko konwencją)
oraz osobne `PoolDice` + `PoolFormula` (`sides` w dwóch miejscach).

### Wzór pod rzędem żetonów

Kolejność w logu: opis → żetony + licznik sukcesów → wzór → werdykt. To ten sam
element `<div className="log-formula-breakdown">` w obu trybach, w tym samym
miejscu drzewa — tryb tradycyjny po prostu nie ma rzędu żetonów nad nim, więc
wzór wygląda, jakby siedział bezpośrednio pod opisem.

## Kontrakt backendu

`internal/systems/interface.go` — nowy typ:

```go
// PoolFormulaPart to jeden człon wzoru puli: albo fragment tekstu
// (operator, etykieta atrybutu, stała), albo kość wraz z wyrzuconymi wynikami.
type PoolFormulaPart struct {
    Kind       string `json:"kind"`                 // "text" | "dice"
    Text       string `json:"text,omitempty"`       // kind=text: "+", "SIŁA", "3"
    Sides      int    `json:"sides,omitempty"`      // kind=dice: wyliczone ścianki
    CountLabel string `json:"countLabel,omitempty"` // kind=dice: "3", "SIŁA"
    SidesLabel string `json:"sidesLabel,omitempty"` // kind=dice: "SIŁA", "10+5"
    Rolls      []int  `json:"rolls,omitempty"`      // kind=dice
}
```

Zmiany w `RollResult`:

| pole | zmiana |
|---|---|
| `PoolRolls []int` | usunięte, zastąpione przez `PoolFormula []PoolFormulaPart` |
| `PoolSuccesses`, `PoolSuccessCondition` | bez zmian |
| `FormulaBreakdown` | w trybie puli przestaje być ustawiany |
| `DiceType` | zostaje — konsumuje go `GameService.go:806` (`DieType: r.DiceType` w rekordzie statystyk rzutów) |

`SidesLabel` jest rozdzielone od `Sides`, bo oba są potrzebne naraz: tooltip
używa `Sides` (`K8`), linia wzoru `SidesLabel` (`K(SIŁA)`). Puste `SidesLabel`
oznacza kość literalną i wzór pokazuje `K6`.

Brak backward compat — stary kształt `poolRolls` znika bez okresu przejściowego.

## Backend — `internal/systems/custom/roller.go`

`evalFormulaDicePool` zwraca `(parts []gsys.PoolFormulaPart, diceType int, err error)`
zamiast `(allRolls []int, diceType int, labelStr string, err error)`. Zmienne
lokalne `allRolls` i `labelParts` zastępuje jedna `parts`.

| blok | dziś | po zmianie |
|---|---|---|
| `op` (≠ `d`) | `labelParts += b.Value` | `parts += {Kind:"text", Text:b.Value}` |
| `attr` / `skill` / `attr_linked` / `const` | `labelParts += label` | `parts += {Kind:"text", Text:label}` |
| `dice` pojedyncza | `allRolls += rolled` | `parts += {Kind:"dice", Sides:sides, Rolls:[rolled]}` |
| `dice` po operatorze `d` | pop `labelParts`, `"3d6"` | pop członu, `parts += {Kind:"dice", CountLabel:"3", Sides:6, Rolls:[...]}` |
| `dice_attr` | `"d(SIŁA)"` | `parts += {Kind:"dice", Sides:8, SidesLabel:"SIŁA", Rolls:[...]}` |
| `dice_skill_attr` | `"d(10+5)"` | `parts += {Kind:"dice", Sides:15, SidesLabel:"10+5", Rolls:[...]}` |

### Operator `d`, gdy licznik sam jest kością

Wzór `d6d10` znaczy „rzuć K6, potem tyle K10". Dziś kod zdejmuje ostatnią
etykietę, przez co `d6` znika ze wzoru, ale jego wynik zostaje w `allRolls` i
liczy się do sukcesów. Reguła po zmianie:

- ostatni człon to `text` → zdejmij go, `CountLabel` = jego `Text`
- ostatni człon to `dice` → **zostaw go**, `CountLabel` pusty

Drugi przypadek renderuje się wtedy jako `K6K10`, wyniki obu kości zachowują
prawdziwą liczbę ścianek w tooltipach, a matematyka sukcesów pozostaje taka jak
dziś (kość-licznik nadal się wlicza).

`rollFromFormulaDicePool` liczy sukcesy przelatując `parts` po `Rolls` zamiast
po `allRolls` i nie ustawia `FormulaBreakdown`.

## Frontend

### Nowy moduł `src/systems/custom/rolls/poolFormula.js`

Dwie czyste funkcje, bez Reacta:

```js
// [{value, sides}] — po jednym wpisie na wyrzuconą kość, w kolejności rzutu
flattenPoolDice(poolFormula)

// "K6+K10+K10" | "3K6" | "K(SIŁA)+2"
formatPoolFormula(poolFormula, t)
```

Reguła renderu członu w `formatPoolFormula`:

- `kind: "text"` → `part.text` bez zmian
- `kind: "dice"` z `sidesLabel` → `${countLabel}${t('dice.dieNotation')}(${sidesLabel})`
- `kind: "dice"` bez `sidesLabel` → `${countLabel}${t('dice.label', { sides })}`

### `CustomRoll.jsx`

- żetony mapują `flattenPoolDice(data.poolFormula)` zamiast `data.poolRolls`;
  warunek sukcesu bez zmian, porównuje `value`
- każdy żeton: `onMouseEnter={e => showTooltip(t('dice.label', { sides }), e.currentTarget)}`
  + `onMouseLeave={hideTooltip}`, z `usePortalTooltip()` w domyślnym trybie
  `placement: 'above'` — żetony leżą w poziomym rzędzie, tooltip po lewej
  zasłaniałby sąsiedni żeton
- jedna zmienna `formulaText = poolFormulaText || data.formulaBreakdown` zasila
  oba miejsca: pulę wygrywa `formatPoolFormula(...)`, gdy go brak — string
  trybu tradycyjnego. Pod rzędem żetonów renderuje się ten sam element w obu
  trybach: `{formulaText ? <div className="log-formula-breakdown">{formulaText}</div> : null}`
- warunek ukrywania `diceLabel` i `modifierText` w linii opisu to
  `hasFormula = Boolean(formulaText)` — ta sama zmienna, która steruje
  renderem linii wzoru, więc oba miejsca fizycznie nie mogą się rozjechać

### i18n

Zero nowych kluczy. `dice.label` (`K{{sides}}` / `D{{sides}}`, linia 892) i
`dice.dieNotation` (`K` / `D`, linia 897) istnieją w obu językach.

### CSS

Zero zmian. `.custom-pool-die`, `.custom-pool-dice`, `.portal-tooltip`
wystarczają.

## Testy

**Backend, `custom/roller_test.go`:** istniejąca asercja `res.PoolRolls == [4 6 2]`
(linia 379) przechodzi na `PoolFormula`. Nowe przypadki:

- wzór mieszany `d6+d10+d10` — trzy człony kości o różnych `Sides`, przeplecione
  członami tekstowymi `+`
- `3d6` — jeden człon, `CountLabel:"3"`, trzy wpisy w `Rolls`
- kość o ściankach z atrybutu — `SidesLabel` ustawione, `Sides` wyliczone z
  wartości postaci

**Frontend, `poolFormula.test.js`:** flatten (`3d6` → trzy wpisy o tych samych
`sides`; wzór mieszany → różne `sides`) i format (kość literalna, kość z
`countLabel`, kość z `sidesLabel`, człony tekstowe) z atrapą `t`.

**Frontend, `CustomRoll.smoke.test.jsx`** (dodane w przeglądzie po scaleniu):
gałąź renderu — "dice.length > 0" vs. formuła — to logika, która nie siedzi w
module czystym, więc wymaga osobnego testu. Pokrywa: rzut puli z kośćmi
(żetony + linia wzoru pod nimi) oraz rzut puli, którego `poolFormula` ma same
człony tekstowe (linia wzoru mimo braku żetonów).
