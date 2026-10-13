# PLAYRPG-235 — Tabela atrybutów (`attr_table`)

## Cel

Nowy typ pola obok `attr`: tabela atrybutów w stylu Warhammera (WW, US, S…). GM definiuje całą listę
atrybutów w kreatorze (dodaj / usuń), gracz nie dodaje własnych. Jedna formuła rzutu dla wszystkich
atrybutów tabeli; formuła odwołuje się do „obecnego atrybutu”, więc da się zapisać np.
„tyle k6, ile wynosi atrybut”.

## Decyzje

| Pytanie | Decyzja |
|---|---|
| Czy wiersze są pełnoprawnymi atrybutami? | **Tak** — widoczne w formułach innych pól, w przypisaniu atrybutu do umiejętności, `dice_attr`, polach wyliczanych, token display, karcie skróconej |
| Orientacja na karcie | **Poziomo** jak Warhammer: atrybuty = kolumny, wiersze = Bazowa / Rozwinięcia / Razem |
| Za mało szerokości | **Zawijanie w pasma** — kolejny blok nagłówek + wiersze, bez scrolla |
| Per wiersz | nazwa, skrót, wartość domyślna, min, max, „pokaż na karcie skróconej” |
| Per tabela | rozwinięcia (czy są), etykieta rozwinięć, krok strzałek (`step`), rzucalność + formuła rzutu |
| Gracz dodaje atrybuty? | Nie |

## Model danych

### Backend — `internal/models/SystemTemplate.go`

```go
// AttrRow is one attribute of an "attr_table" field. Its ID is the attribute's key in
// Stats.Attributes — globally unique (genId), never a slug of the label, never prefixed with
// the table's key.
type AttrRow struct {
	ID              string `bson:"id" json:"id"`
	Label           string `bson:"label" json:"label"`
	Abbr            string `bson:"abbr,omitempty" json:"abbr,omitempty"`
	Default         *int   `bson:"default,omitempty" json:"default,omitempty"`
	Min             *int   `bson:"min,omitempty" json:"min,omitempty"`
	Max             *int   `bson:"max,omitempty" json:"max,omitempty"`
	ShowOnShortCard bool   `bson:"showOnShortCard,omitempty" json:"showOnShortCard,omitempty"`
}
```

`FieldDef` dostaje `AttrRows []AttrRow` (tylko dla `type == "attr_table"`). Na poziomie tabeli
używane są istniejące pola `FieldDef`: `HasAdvances`, `AdvancesLabel`, `Step`, `Rollable`,
`RollConfig`.

### Stats postaci

Bez zmian w strukturze: wartość wiersza żyje w `stats.Attributes[row.ID]` (`base`, `advances`,
`current`) — dokładnie jak pojedyncze pole `attr`. `ComputeDerived` działa bez zmian.

Klucz bez prefiksu tabeli (inaczej niż `skill_table`, gdzie `"${field.key}.${opt.id}"`): bloki
`attr`, `dice_attr` i `SkillOption.Attr` adresują atrybut jednym kluczem, a prefiks wymagałby
parsowania ścieżki w każdym z tych miejsc.

## Rdzeń: wiersz = wirtualne pole `attr`

Jedna funkcja rozwija `attr_table` w listę `FieldDef{Type: "attr"}`, po jednej na wiersz:

| Pole wirtualnego `attr` | Źródło |
|---|---|
| `Key` | `row.ID` |
| `Label`, `Abbr`, `Default`, `Min`, `Max`, `ShowOnShortCard` | wiersz |
| `HasAdvances`, `AdvancesLabel`, `Step`, `Rollable`, `RollConfig` | tabela |

### Backend

`flattenFields` (`plugin.go`) rozwija `attr_table` w wirtualne pola `attr` — tak jak dziś rozwija
`section`. Jej trzej wołający dostają wiersze bez żadnej nowej gałęzi:

- `SeedDefaults` — `case "attr"` zapisuje `row.Default` do `Attributes[row.ID].Base`.
- `resolveSkillLabel` — `field.Key == skillKey` zwraca nazwę wiersza do logu.
- `resolveRollConfig` — gałąź `field.Key == skillKey && field.Rollable` zwraca `RollConfig` tabeli
  z `fieldType "attr"`, a `RollWithTemplate` (`plugin.go:134`) ustawia `linkedAttr = skillKey`.

Komentarz `flattenFields` aktualizujemy: zwraca liście *wartości*, a `attr_table` nie jest liściem,
tylko kontenerem wierszy.

### Frontend

Nowy helper `collectAttrFields(sections)` (w `utils/templateSections.js` obok `walkFields`) zwraca
pola `attr` + wirtualne pola z wierszy `attr_table`, w tym samym kształcie co backend. Zastępuje
każde `f.type === 'attr'`, które pyta o *wartości atrybutów*, nie o układ karty:

- `TemplateBuilder.jsx` `collectFormulaFields` → chipy formuł, `dice_attr`, przypisanie atrybutu do
  umiejętności (`numberFields`)
- `TokenDisplayBuilder.jsx:88` → bindowanie tokenów
- `formula/formula.js:163` → walidacja „brakujący atrybut”
- `CustomSheetBody.jsx:155` → `attrByKey` (etykiety atrybutów w tabelach umiejętności)
- karta skrócona (`CharacterDetails.jsx`) → kafelki wierszy z `showOnShortCard`

`walkFields` zostaje bez zmian — rendering i kreator widzą tabelę jako jedno pole.

Odstępstwo od powyższego: nie ma helpera `collectAttrFields` — konsumenci wołają `walkValueFields` i
filtrują po własnemu. `weaponLayout.js` celowo zostawia ogólną etykietę „l.attr”, bo w broniach
`attr_linked` oznacza atrybut powiązany z umiejętnością.

## Formuła rzutu — „obecny atrybut”

Blok `attr_linked` („atrybut powiązany”) już istnieje i dla pola atrybutu zwraca jego wartość.
`FormulaBuilder` ukrywa go dla `fieldType === 'attr'`; odblokowujemy go dla `attr` **i** `attr_table`
(sekcja „wartości umiejętności” pokazuje wtedy tylko `attr_linked`, bez `skill` i
`dice_skill_attr` — te dotyczą umiejętności).

Przykłady:
- d100 ≤ atrybut: `d100`, próg pusty → próg = wartość obecnego atrybutu (istniejący fallback).
- atrybut × k6 (pula): tryb `dice_pool`, formuła `attr_linked d d6` — parser już to obsługuje.

### Naprawa etykiety `attr_linked` w rozpisce

`formula_eval.go:52` podpisuje `attr_linked` surowym kluczem (`attr_1728…d6`). `formulaEnv` dostaje
mapę klucz → skrót/nazwa atrybutu (z `flattenFields` szablonu), a etykieta to skrót, potem nazwa,
potem klucz. Rozpiska: `WWd6`. Dotyczy też istniejącego przypadku umiejętności z przypisanym
atrybutem.

Front ma swój odpowiednik rozpiski tylko w `weaponLayout.js:157` (podgląd obrażeń broni) — sprawdzić
przy implementacji, czy wymaga tej samej zmiany.

## Karta postaci

```
        WW   US   S    Wt   I
Baza  [31] [28] [35] [33] [30]
Rozw. [ 5] [ 0] [ 3] [ 0] [ 5]
Razem  36   28   38   33   35
        🎲   🎲   🎲   🎲   🎲

        Zw   Zr   Int  SW   Ogd
Baza  [29] [30] [31] [28] [27]
...
```

- Nagłówek kolumny: skrót (fallback: nazwa). Pełna nazwa w portal tooltipie (wzorzec z CLAUDE.md).
- Bez rozwinięć: jeden wiersz z edytowalną wartością, bez „Razem”.
- Etykieta wiersza rozwinięć = `advancesLabel`.
- Rząd kostek tylko gdy `rollable`; klik → `onRoll({ skillKey: row.id, label: row.label })`.
- W kreatorze kostki renderowane statycznie jako `disabled` przez `showAffordances`.
- Zawijanie: podział na pasma w JS. `ResizeObserver` na wrapperze tabeli mierzy szerokość;
  atrybutów na pasmo = `max(1, floor((szerokość − kolumna etykiet) / 48px))`; każde pasmo to osobny
  grid z własną kolumną etykiet. Czyste CSS (`auto-fill`) odpada — nie umie powtórzyć kolumny
  etykiet w zawiniętej linii. Pomiar jest lokalny dla tabeli i nie łamie zasady „karta nie mierzy
  layoutu” z `fieldRowSpan.js` — ta dotyczy wysokości pól w siatce sekcji. Bez `ResizeObserver`
  (jsdom) lub przed pierwszym pomiarem: jedno pasmo ze wszystkimi atrybutami.
- Styl: nagłówki, ramki i inputy jak `skill_table`, paleta kremowa z CLAUDE.md.
- `fieldRowSpan.js`: `attr_table` → `null` (wysokość z treści), jak pozostałe tabele — liczba pasm
  zależy od szerokości, więc nie da się jej skwantować z samej definicji pola.
- Inputy: `min`/`max` z wiersza, `step` z tabeli; zmiana przez istniejące `onChange.attr` /
  `onChange.advances` z kluczem `row.id`.

## Kreator

- Paleta: `attr_table` w grupie „Statystyki” obok `attr` (ikona z `@mui/icons-material`).
- `makeDefaultField('attr_table')`: `{ attrRows: [], step: 1, hasAdvances: false, advancesLabel,
  rollable: false }`.
- Grupa „Wartości”: przełącznik rozwinięć + etykieta, krok.
- Grupa „Atrybuty”: lista wierszy — nazwa, skrót, domyślna, min, max, przełącznik karty skróconej,
  ✕; przycisk „Dodaj atrybut” (`genId('attr')`). Liczby obcinane `Math.trunc` (ułamek 400-uje
  PATCH szablonu — ten sam powód co dla `attr`).
- Grupa „Rzut”: przełącznik rzucalności + `RollConfigEditor` z `fieldType="attr_table"`.
- Przełącznik „pokaż na karcie skróconej” na poziomie pola NIE pojawia się dla `attr_table`
  (`SHORT_CARD_TYPES` bez zmian) — decyduje wiersz.
- Usunięcie wiersza: dane w statach postaci osierocone, bez migracji (brak backward compat).
  Formuły/umiejętności wskazujące na usunięty wiersz łapie istniejąca walidacja „brakujący atrybut”.

## i18n

Nowe klucze w `en` + `pl`: typ pola + opis, nagłówek grupy atrybutów, „Dodaj atrybut”, etykiety
kolumn edytora wierszy, etykieta wiersza „Razem”/„Wartość”. Synchronizacja skillem `i18n-sync`.

## Testy

Go (`roller_test.go`, `plugin` testy):
- rzut wierszem tabeli: `d100` z progiem z atrybutu; pula `attr_linked d d6`
- `SeedDefaults` zapisuje `Default` wiersza
- `resolveSkillLabel` zwraca nazwę wiersza
- etykieta `attr_linked` w rozpisce = skrót atrybutu (także dla umiejętności)

JS:
- `collectAttrFields` — kształt wirtualnych pól, kolejność, zagnieżdżone sekcje
- `CustomSheetBody.attrTable.test.jsx` — render z/bez rozwinięć, klik kostki, `showAffordances`
- podział na pasma — czysta funkcja `(liczba atrybutów, szerokość) → pasma`, testowana bez DOM
- kreator — dodaj/usuń wiersz, wiersz widoczny jako chip w `FormulaBuilder` innego pola
- `FormulaBuilder` — `attr_linked` dostępny dla `attr` i `attr_table`

## Poza zakresem

- Dodawanie atrybutów przez gracza.
- Orientacja pionowa / przełącznik orientacji.
- Formuła per wiersz.
