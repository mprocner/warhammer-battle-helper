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

- **Rzut bronią w trybie puli.** `RollWeaponWithTemplate` (`weapon.go:40`) woła
  `rollFromFormula`, więc broń może wpaść w tryb puli, ale `CustomWeaponRoll.jsx`
  w ogóle nie renderuje żetonów puli. To istniejąca luka w widoku, nie problem
  tooltipów — osobne zadanie.
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

Kolejność w logu: opis → żetony + licznik sukcesów → wzór → werdykt. Tryb
tradycyjny zachowuje wzór nad wynikiem, więc gałęzie renderu pozostają
rozdzielone.

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
| `DiceType` | zostaje — konsumuje go `ToastStack.jsx:37` |

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
- pod rzędem żetonów `<div className="log-formula-breakdown">{formatPoolFormula(...)}</div>`
- warunek ukrywania `diceLabel` i `modifierText` w linii opisu (dziś
  `!data.formulaBreakdown`) musi objąć też pulę, która `formulaBreakdown` już
  nie dostaje — jedna zmienna `hasFormula` użyta w obu miejscach
- gałąź `else if (data.formulaBreakdown)` dla trybu tradycyjnego bez zmian

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

Testu renderu `CustomRoll` nie dokładamy — cała logika siedzi w module czystym,
a komponent po zmianie to samo mapowanie propsów na JSX.
