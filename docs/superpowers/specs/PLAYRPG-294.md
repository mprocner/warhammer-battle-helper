# PLAYRPG-294 — Kości przewagi i utrudnienia w szablonie

## Cel

MG szablonu custom może zamiast liczbowego modyfikatora rzutu włączyć **kości przewagi** i **kości
utrudnienia** (EN: *edge dice* / *setback dice*): gracz przed rzutem wybiera liczbę dodatkowych
kości, a rzut bierze najlepszy (przewaga) albo najgorszy (utrudnienie) wynik. Prezentacja wyboru jak
w karcie CoC (`CoCDiceModOverlay`) — pionowa kolumna przycisków, `0` pod kursorem — z liczbą
przycisków wynikającą z maksimów ustawionych przez MG.

Nazwy CoC („bonus/penalty dice”) nie są używane w UI szablonu.

## Decyzje

| Temat | Decyzja |
|---|---|
| Nazwa | PL: kość przewagi / kość utrudnienia. EN: edge die / setback die. |
| Wykluczenie | Szablon ma **albo** liczbowy modyfikator, **albo** kości — nigdy oba. Jedno pole `Kind` w `ModifierConfig`. |
| Maksima | Osobne dla przewagi i utrudnienia. `0` wyłącza daną stronę (np. 0/2 = tylko utrudnienie). |
| Tryb | Do wyboru przez MG: `formula` (domyślny) — cała formuła rzucana N+1 razy; `tens` — jak CoC, nowa kość dziesiątek przy tych samych jednościach, tylko dla formuły `d100`. |
| Kierunek „lepszego” | Z `successType` pola: `below_threshold` → niższy lepszy, `above_threshold` → wyższy lepszy. MG tego nie ustawia. |
| Pola bez kości | `raw`, `dice_pool`, oraz tryb `tens` przy formule innej niż pojedyncze `d100` — rzut idzie od razu, bez pytania i bez błędu. |
| Broń | Trafienie bronią przechodzi przez `rollFromFormula`, więc dostaje kości tak samo jak umiejętność. Rzut obrażeń — bez zmian. |

## Model danych

`models/SystemTemplate.go` — `ModifierConfig` rozszerzony, bez nowego pola w `TemplateSettings`:

```go
type ModifierConfig struct {
    Enabled bool `bson:"enabled" json:"enabled"`

    // Kind: "number" (the numeric prompt, also when empty — every pre-existing template) | "dice"
    // (edge/setback dice, PLAYRPG-294). One kind per template, which is what makes the two
    // mutually exclusive without a validation rule.
    Kind string `bson:"kind,omitempty" json:"kind,omitempty"`

    // number: TraditionalTarget, PoolTarget, Step, Min, Max, Presets — unchanged.

    // dice:
    DiceMode   string `bson:"diceMode,omitempty" json:"diceMode,omitempty"`     // "formula" (default) | "tens"
    MaxEdge    int    `bson:"maxEdge,omitempty" json:"maxEdge,omitempty"`       // 0 = no edge dice
    MaxSetback int    `bson:"maxSetback,omitempty" json:"maxSetback,omitempty"` // 0 = no setback dice
}
```

Brak migracji: `Kind == ""` czytamy jako `number`.

Usuwamy martwe `RollConfig.RollAdvType` (zapisywane w `TemplateBuilder.jsx`, nieczytane nigdzie)
wraz z jego domyślną wartością w kreatorze.

## Backend

### Transport wartości

Request rzutu custom niesie dziś `modifier` (int) do `RollWithTemplate` / `RollWeaponWithTemplate`.
Przy `Kind == "dice"` ta sama liczba oznacza kości: `+N` przewaga, `−N` utrudnienie. Bez zmiany
sygnatur — wykluczenie rodzajów gwarantuje, że wartość ma zawsze jedno znaczenie.

`resolveModifier` (`systems/custom/modifier.go`) pozostaje jedynym miejscem decyzji:

- nowy target `ModTargetEdgeDice = "edge_dice"` (stała współdzielona z `modifierConfig.js`),
- przy `Kind == "dice"` clamp do `[-MaxSetback, MaxEdge]`,
- zwraca `ModTargetNone, 0` gdy pole nie obsługuje kości: `rollMode == "dice_pool"`,
  `successType == "raw"`; warunek `tens` + nie-`d100` sprawdzany w rollerze (zna formułę) i też
  daje rzut bez kości.

Serwer nie ufa wartości: `Kind != "dice"` zeruje kości, `Kind == "dice"` zeruje liczbowy modyfikator.

### Tryb `formula`

`rollFromFormula` ewaluuje formułę `1 + |N|` razy (`evalFormula`), wybiera wynik wg kierunku.
Breakdown wybranego rzutu trafia do `FormulaBreakdown`; wszystkie wyniki do `AllRolls`.

### Tryb `tens`

Formuła musi być dokładnie jednym blokiem `dice` o wartości `d100`. Logika przeniesiona z
`coc7e.rollWithDiceMod`: główny d100, potem `|N|` nowych dziesiątek przy tych samych jednościach,
`00+0 = 100`. Wybór wg kierunku z `successType` (CoC zawsze miał „niższy lepszy”, tu
`above_threshold` odwraca). Wspólnej funkcji z CoC nie wydzielamy — CoC zostaje nietknięty.

### Wynik

`RollResult` używa istniejących pól: `DiceMod` (zastosowana, po clampie, liczba kości ze znakiem),
`AllRolls` (kandydaci, wybrany = `Roll`). `Modifier` = 0, `ModifierTarget` = `edge_dice` tylko gdy
kości faktycznie zastosowano. Poziomy sukcesu (`applySuccessLevels`) liczone z wybranego wyniku.

## Frontend

### Kreator — `ModifierConfigBuilder`

- Przełącznik rodzaju: „Liczba” / „Kości przewagi i utrudnienia”.
- „Liczba” — obecny formularz bez zmian.
- „Kości” — tryb (cała formuła / dziesiątki d100) + dwa inputy: max przewagi, max utrudnienia
  (0–5). Krótki opis, że pola `raw` i pule kości rzucają bez kości.
- Przełączenie rodzaju nie kasuje pól drugiego rodzaju (powrót je przywraca).

### Karta gry

- Nowy komponent `EdgeDiceOverlay` (`systems/custom/`) wzorowany na `CoCDiceModOverlay`: kolumna od
  `+MaxEdge` do `−MaxSetback`, przycisk `0` wyśrodkowany pod kursorem — offset liczony z
  rzeczywistej liczby przycisków nad zerem (`MaxEdge × BUTTON_HEIGHT`), nie ze stałej.
  Klasy CSS własne (`.edge-dice-*`), kolorystyka jak CoC: zielony / złoty / czerwony.
  Tooltip przycisku: „+N kości przewagi” / „−N kości utrudnienia” (portal tooltip wg konwencji).
- `useRollPrompt` rozgałęzia się po `Kind`: `number` → `RollModifierOverlay`, `dice` →
  `EdgeDiceOverlay`. Pole nieobsługujące kości (lustrzany predykat w `modifierConfig.js`) → rzut
  od razu.
- Obie karty (`CharacterSheet`, `CharacterDetails`) korzystają z hooka — bez osobnej logiki.

### Log

Rzut custom z `diceMod ≠ 0` pokazuje linię „+N kości przewagi” / „−N kości utrudnienia” oraz
wszystkie `AllRolls` z wyróżnionym wybranym (jak CoC `SkillRoll`).

### i18n

Klucze en/pl z liczbą mnogą: `custom.edgeDice` / `custom.setbackDice` + etykiety kreatora.

### Tutorial kreatora

Nowa grupa „Kości” w karcie modyfikatora → nowy krok albo wariant tekstu w `tours/creator*.js`
(pilnuje `creatorTour.coverage.test.jsx`).

## Testy

**Go** (`custom/modifier_test.go`, `custom/roller_test.go`, rng wstrzykiwany):
- clamp do `[-MaxSetback, MaxEdge]`, asymetryczne maksima (0/2),
- `Kind` zeruje wartość drugiego rodzaju,
- `formula`: N+1 ewaluacji, wybór wg `below` / `above`,
- `tens`: te same jednostki, `00+0 = 100`, wybór wg kierunku,
- fallbacki bez kości: `raw`, `dice_pool`, `tens` + formuła ≠ `d100`,
- broń: kości na trafieniu, obrażenia bez zmian.

**Frontend**:
- `EdgeDiceOverlay` — liczba przycisków i pozycja `0` przy 2/2, 0/2, 3/0,
- `useRollPrompt` — gałąź `dice`, pole bez kości rzuca od razu,
- `modifierConfig.js` — predykat obsługi kości zgodny z backendem,
- `ModifierConfigBuilder` — przełącznik rodzaju zachowuje pola drugiego.

## Poza zakresem

- Kości dla pól `raw` i `dice_pool`.
- Konfigurowalne nazwy kości.
- Zmiany w hardcoded CoC.
