# PLAYRPG-289 — Poziomy sukcesu w kreatorze szablonów

## Cel

Rzut tradycyjny w szablonie custom kończy się dziś binarnie: `evalOutcome` (`systems/custom/roller.go`)
zwraca `regular_success` albo `failure`. MG chce, żeby log pokazywał **stopień** sukcesu/porażki,
w jednym z dwóch stylów do wyboru w zakładce Ogólne kreatora:

- **Poziomy co krok** — liczba poziomów sukcesu (PS) z cyfr dziesiątek progu i rzutu.
- **Progi** — nazwane poziomy (np. „Trudny”, „Ekstremalny”) wyznaczane ułamkiem progu, każdy z
  własnym kolorem.

W UI nie używamy nazw systemów (Warhammer, Call of Cthulhu) — tylko opisowych nazw trybów.

## Decyzje

| Temat | Decyzja |
|---|---|
| Zakres | Ustawienie szablonowe (`TemplateSettings`), działa automatycznie na **każdy** rzut `traditional` z progiem (`above_threshold` / `below_threshold`). Pomijane: `raw`, `dice_pool`, rzut bez ustalonego progu. Brak przełącznika per pole. |
| Metoda „co krok” | Tylko cyfry dziesiątek: `SL = ⌊próg/krok⌋ − ⌊rzut/krok⌋` (dla `above` znak odwrócony). Krok konfigurowalny, domyślnie 10. Metody różnicy (`⌊(próg−rzut)/krok⌋`) **nie** obsługujemy. |
| Ujemne poziomy | Porażka pokazuje ujemny PS. Zero dostaje znak z wyniku: sukces `+0`, porażka `−0`. |
| Definicja progu | Dzielnik całkowity `N`: poziom osiągnięty gdy `rzut ≤ ⌊próg/N⌋`. Kolejność sprawdzania wynika z dzielnika (największy pierwszy) — MG nie układa jej ręcznie. |
| Wiersze stałe | „Sukces” (`1/1`) i „Porażka” istnieją zawsze — edytowalna nazwa i kolor, bez usuwania. Dodatkowe progi (`N ≥ 2`) dodawane/usuwane dowolnie. Domyślnie: `1/5`, `1/2`, `1/1`, Porażka. |
| Kierunek `above` w trybie progów | Progi dotyczą tylko rzutów pod próg. Rzut `above_threshold` pokazuje wyłącznie wiersz „Sukces” albo „Porażka” (nazwa + kolor). |
| Wyświetlanie PS | Obecna etykieta wyniku + liczba + skrót z i18n: `Sukces · +2 PS` / `Failure · −1 SL`. Kolory standardowe. Skrót nie jest konfigurowalny. |
| Gdzie liczone | **Backend**. Wynik (PS albo etykieta + kolor progu) zapisany w zdarzeniu jako snapshot — historia logu nie zmienia się po edycji szablonu, front nie potrzebuje szablonu do renderu. |
| Wyłączenie | Tryb `Wyłączone` zapisuje `mode: ""`, ale zachowuje skonfigurowane progi — powrót do „Progów” je przywraca. |

## Model danych

`models/SystemTemplate.go` — nowe pole w `TemplateSettings`:

```go
// SuccessLevels configures how a traditional roll's degree of success is reported (PLAYRPG-289).
// nil or Mode == "" means off — every pre-existing template, no migration.
SuccessLevels *SuccessLevelsConfig `bson:"successLevels,omitempty" json:"successLevels,omitempty"`

type SuccessLevelsConfig struct {
    Mode    string        `bson:"mode" json:"mode"`                       // "" | "tens" | "tiers"
    Step    int           `bson:"step,omitempty" json:"step,omitempty"`   // tens only; 0 reads as 10
    Success SuccessTier   `bson:"success" json:"success"`                 // tiers: fixed 1/1 row
    Failure SuccessTier   `bson:"failure" json:"failure"`                 // tiers: fixed row
    Tiers   []SuccessTier `bson:"tiers,omitempty" json:"tiers,omitempty"` // tiers: extra rows, Divisor >= 2
}

type SuccessTier struct {
    ID      string `bson:"id,omitempty" json:"id,omitempty"`
    Divisor int    `bson:"divisor,omitempty" json:"divisor,omitempty"`
    Label   string `bson:"label" json:"label"` // GM-authored, never run through i18n
    Color   string `bson:"color" json:"color"` // "#rrggbb"
}
```

`systems/interface.go` — `RollResult` dostaje:

```go
HasSuccessLevel bool   `json:"hasSuccessLevel,omitempty"` // SuccessLevel has no omitempty, so 0 alone can't say "not computed"
TierLabel       string `json:"tierLabel,omitempty"`
TierColor       string `json:"tierColor,omitempty"`
```

`Outcome` się nie zmienia (`regular_success` / `failure`), więc `isSuccessOutcome` (obrażenia broni),
`OUTCOME_BORDER` w toastach i `RollStat` działają jak dotąd.

## Backend — logika

Nowy plik `systems/custom/successlevel.go`, czysta funkcja:

```go
func applySuccessLevels(cfg *models.SuccessLevelsConfig, successType string, roll, threshold int, hasThreshold, success bool, res *gsys.RollResult)
```

Wywoływana w `rollFromFormula` po `evalOutcome`, na progu **po** modyfikatorze. Rzut bronią
przechodzi tą samą ścieżką, więc dostaje poziomy bez osobnego kodu. `rollFromFormulaDicePool` jej
nie wywołuje.

- **No-op** gdy: `cfg == nil`, `cfg.Mode == ""`, `successType == "raw"`, `!hasThreshold`.
- **tens**: `step := cfg.Step` (0 → 10). `below`: `SL = floorDiv(threshold, step) − floorDiv(roll, step)`;
  `above`: odwrotnie. `floorDiv` zaokrągla w dół (Go `/` obcina do zera — ujemne progi z
  FEATURE-162 dałyby zły wynik). Ustawia `SuccessLevel` i `HasSuccessLevel = true`.
- **tiers**: `below` — progi sortowane malejąco po `Divisor`; pierwszy z
  `roll ≤ floorDiv(threshold, Divisor)` wygrywa (tylko gdy rzut jest sukcesem); brak dopasowania →
  `Success` przy sukcesie, `Failure` przy porażce. `above` — tylko `Success` / `Failure`. Ustawia
  `TierLabel` i `TierColor`.

### Walidacja (serwis, przy zapisie szablonu)

- `Mode` ∈ {`""`, `tens`, `tiers`}
- `Step` 0 lub 1–100
- `Divisor` dodatkowych progów 2–100, bez duplikatów
- `Color` w formacie `#rrggbb` (wszystkie wiersze)
- `Label` niepusty, ≤ 40 znaków — sprawdzane tylko gdy `Mode == "tiers"` (wyłączony tryb może
  przechowywać cokolwiek zapisał wcześniej)

## Frontend — kreator

Nowy komponent `components/creator/SuccessLevelsBuilder.jsx`, klasa
`.creator__settings-card--success-levels`, renderowany w `TemplateBuilder` zaraz po
`ModifierConfigBuilder`. Kontrolowany (`value` / `onChange` → `settings.successLevels`), wzorzec jak
`ModifierConfigBuilder`.

- **Przełącznik trybu** (segmenty): Wyłączone / Poziomy co krok / Progi
  (`creator.successLevels.mode.off|tens|tiers`).
- **Co krok**: input „Krok” (1–100, domyślnie 10) + żywy przykład liczony z tej samej formuły,
  np. „Próg 45, rzut 38 → +1 PS”.
- **Progi**: wiersze posortowane malejąco po dzielniku.
  - dodatkowy próg: `1/` + input dzielnika, nazwa, `<input type="color">` (wzorzec
    `TokenDisplayBuilder`), usuń (`DeleteOutline`);
  - stały „Sukces” z napisem `1/1` i stała „Porażka” — nazwa + kolor, bez dzielnika i usuwania;
  - „Dodaj próg” (`Add`) wstawia najmniejszy wolny dzielnik ≥ 2;
  - notka: progi dotyczą rzutów pod próg; rzut nad próg pokazuje tylko sukces/porażkę.
- **Wartości domyślne** przy pierwszym wejściu w „Progi” (gdy `success.label` puste), nazwy przez
  `t()` w języku MG, zapisywane jako zwykły tekst: `1/5` Ekstremalny sukces (złoty `#c9975b`),
  `1/2` Trudny sukces (ciemniejsza zieleń), `1/1` Sukces (zieleń logu), Porażka (czerwień logu) —
  konkretne hexy dobrane z istniejących `--log-*`.
- Zduplikowany dzielnik: czerwona ramka + blokada zapisu jak inne błędy kreatora.

Karta postaci w podglądzie kreatora nie renderuje wyników rzutów — zasada „kreator = gra” nie
wymaga tu nic więcej.

### Tutorial

Nowy krok `successLevels` w `tutorial/tours/creatorGeneral.js` po `modifier`, kotwica
`.creator__settings-card--success-levels`, klucze `tutorial.creatorGeneral.successLevels.*` w en/pl.

## Frontend — log i toast

Helper `systems/custom/rolls/successLevelDisplay.js`: `successLevelDisplay(data, outcomeLabel, t)` →
`{ label, color } | null`. Używany przez `CustomRoll.jsx` i `CustomWeaponRoll.jsx`.

- `data.tierLabel` → etykieta wyniku = `tierLabel`, kolor = `tierColor` — na napisie wyniku, liczbie
  rzutu (`log-roll-value`) i pieczęci (`WaxSealToken` prop `overrideColor`).
- `data.hasSuccessLevel` → `{outcomeLabel} · {+N|−N} {t('customRoll.slAbbr')}`; znak zera z
  outcome. Kolory standardowe.
- Żadne → zachowanie bez zmian (stare wpisy, szablony bez configu).

`ToastStack.jsx`: kolor ramki = `data.tierColor` jeśli jest, inaczej `OUTCOME_BORDER[outcome]`.

## Testy

- **Go** `systems/custom/successlevel_test.go` (tabela):
  - tens: 45/38 → +1; 45/44 → 0 (sukces); 45/47 → 0 (porażka); 45/72 → −3; `above`; krok 5;
    ujemny próg (floor)
  - tiers: 60/12 → `1/5`; 60/30 → `1/2`; 60/31 → `1/1`; 60/61 → Porażka; `above` → tylko
    Sukces/Porażka
  - no-op: `raw`, `!hasThreshold`, `nil`, `mode ""`; `dice_pool` nie dostaje pól
  - modyfikator na próg przesuwa poziom (test przez `rollFromFormula` z wstrzykniętym rng)
  - walidacja w serwisie
- **Front**:
  - `successLevelDisplay.test.js` — czysta funkcja, w tym `+0` / `−0`
  - `SuccessLevelsBuilder.test.jsx` — przełączanie trybów, domyślne wartości, dodaj/usuń próg,
    zachowanie progów po wyłączeniu, duplikat dzielnika
  - render `CustomRoll` z `tierColor` i z `hasSuccessLevel`
  - `creatorTour.coverage.test.jsx` / `tourTranslations.test.js` przechodzą z nowym krokiem
- i18n en/pl przez skill `i18n-sync`.

## Poza zakresem

- Metoda różnicy dla trybu „co krok”.
- Osobne progi dla rzutów nad próg.
- Krytyki i fumble — flagi `CritSuccess` / `CritFail` w `RollConfig` istnieją, ale `evalOutcome`
  ich nie czyta; osobny temat.
- Wyłączanie poziomów dla pojedynczego pola.
- Konfigurowalny skrót „PS”.
