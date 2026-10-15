# PLAYRPG-269 — Tabela danych (`data_table`) + wspólny rdzeń tabel wierszowych

## Cel

GM może dodać do szablonu ogólną tabelę do przechowywania danych (np. ekwipunek): własne kolumny,
wiersze gracza, predefiniowane wiersze GM-a. Działa jak okrojona tabela broni — bez rzutów, bez
obrażeń, bez kolumny „z umiejętności” — plus kolumna długiego tekstu (np. opis przedmiotu).

Przy okazji wydzielamy z tabeli broni generyczny rdzeń „tabeli wierszowej”, z którego korzystają
oba typy. Dziś renderowanie komórki wg typu kolumny jest skopiowane 3 razy
(`WeaponsTableRow`, `WeaponsPresetRow`, `WeaponPresetsEditor`); kopia pod nowy typ dałaby 5.

## Decyzje

| Temat | Decyzja |
|---|---|
| Typ pola | `data_table`, paleta kreatora → grupa „Tabele”, ikona `ViewListIcon` |
| Kolumny | Definiowane przez GM-a. Typy: `text`, `number`, `select` (lista ręczna), `long_text`. Brak `optionsFromSkills`. |
| Predefiniowane wiersze | Jak w broni: `alwaysOn` = renderowane z szablonu, tylko do odczytu (edycja GM-a dociera do wszystkich); bez `alwaysOn` = katalog, gracz kopiuje do własnego wiersza (snapshot). |
| Długi tekst | Nie w siatce. Rozwijany wiersz: przycisk strzałki przełącza panel pod wierszem na pełną szerokość. |
| Edycja długiego tekstu | Tylko w trybie edycji wiersza (ołówek) — spójnie z resztą komórek. Rozwinięcie w spoczynku jest tylko do odczytu. |
| Rzuty, gwiazdka ulubionych | Brak |
| Skrócona karta | Tabela się na niej nie pojawia |
| Wiersz podsumowania / agregaty | Poza zakresem etapu 1 |
| Architektura | Wspólny rdzeń `RowTable` + sloty kolumn; `WeaponsTable` i `DataTable` to cienkie wrappery |

## 1. Model danych i backend

### Szablon (`models/SystemTemplate.go`)

```go
// FieldDef — data_table only
Columns    []WeaponColumn `bson:"columns,omitempty" json:"columns,omitempty"` // reused
PresetRows []PresetRow    `bson:"presetRows,omitempty" json:"presetRows,omitempty"`

type PresetRow struct {
    ID       string            `bson:"id" json:"id"`
    Cells    map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
    AlwaysOn bool              `bson:"alwaysOn,omitempty" json:"alwaysOn,omitempty"`
}
```

- `Columns` współdzielone z `weapons_table`; `WeaponColumn.Type` zyskuje wartość `"long_text"`.
  Nazwa `WeaponColumn` zostaje (rename to czysta kosmetyka).
- Komentarz typu pola w `FieldDef.Type` uzupełniony o `data_table`.

### Postać (`systems/custom/character.go`)

```go
// Tables holds the player-added rows of each data_table field, keyed by field key.
Tables map[string][]TableRow `bson:"tables,omitempty" json:"tables,omitempty"`

type TableRow struct {
    ID    string            `bson:"id" json:"id"`
    Cells map[string]string `bson:"cells,omitempty" json:"cells,omitempty"`
}
```

- Osobny typ zamiast `WeaponRow`: wiersz danych nie ma `Damage` ani `Favorite`.
- `plugin.go`: `Tables` nil → pusta mapa, analogicznie do `Weapons`.
- `ComputeDerived` przepisuje stats przez strukturę `Stats` — klucz nieobecny w strukturze zginąłby
  przy pierwszym zapisie. Stąd test round-tripu (niżej).
- Liczby w komórkach jako string, jak w broni. Nikt na nich nie liczy w etapie 1.
- Brak nowych endpointów i logiki: dane płyną zwykłym update postaci + broadcast WS.

### Front — mapowanie stats

`tables: s.tables || {}` dochodzi wszędzie tam, gdzie dziś mapowane jest `weapons`:
`systems/custom/CharacterSheet.jsx` (stan początkowy, sync zdalny, payload zapisu),
`systems/custom/index.js`, `systems/custom/CustomSheetBody.jsx`.

## 2. Komponenty karty (`systems/custom/fields/`)

| Plik | Rola |
|---|---|
| `RowTable.jsx` | Rdzeń: nagłówek, wiersze `alwaysOn`, wiersze gracza, stopka (+ dodaj, select katalogu), stan rozwinięcia |
| `RowTablePresetRow.jsx` | Wiersz GM-a: komórki wyciszone, kłódka w kolumnie akcji |
| `RowTablePlayerRow.jsx` | Wiersz gracza: spoczynek / edycja; ołówek → ✓ ✕ |
| `RowTableCell.jsx` | Jedna komórka wg typu kolumny: statyczna z tooltipem przy przycięciu / `input` / `select` / `textarea` (`long_text`) |
| `rowTableLayout.js` | `rowGridTemplate`, `rowLabel`, `cellLabel` — przeniesione i uogólnione z `weaponLayout.js` |
| `WeaponsTable.jsx` | Wrapper: sloty gwiazdki, obrażeń, rzutu; teksty „broń” |
| `DataTable.jsx` | Wrapper: bez slotów; teksty „wiersz” |

Usuwane: `WeaponsTableRow.jsx`, `WeaponsPresetRow.jsx`. W `weaponLayout.js` zostaje to, co
specyficzne dla broni: `weaponRowIssue`, `weaponIssueTitle`, `weaponSkillColumn`,
`renderDamageFormula`.

Dwa komponenty wierszy, nie jeden z flagą — wiersz GM-a nie ma trybu edycji, ołówka ani usuwania
(uzasadnienie z komentarza `WeaponsTableRow`). Wspólny kod schodzi poziom niżej, do `RowTableCell`.

### Sloty

`leading` i `trailing`: tablice `{ key, track, header, render(row, { isPreset, editing }) }`.

`rowGridTemplate` składa ścieżki: [strzałka] → `leading` → kolumny GM-a (bez `long_text`) →
`trailing` → akcje. Ten sam string idzie do nagłówka i każdego wiersza — niezmiennik z FEATURE-224.
Szerokość kolumny z jej typu, nigdy z treści (reguły z `weaponGridTemplate` bez zmian: `number`
56px, `select` `minmax(0, 140px)`, pierwsza `text` `minmax(0, 2fr)`, reszta `minmax(0, 1fr)`).

- Broń: `leading = [gwiazdka]`, `trailing = [obrażenia, rzut]`.
- Dane: `leading = []`, `trailing = []`.

### Rozwinięcie wiersza (w rdzeniu)

- Rdzeń dzieli kolumny na siatkowe i `long_text`. Jeśli tabela ma ≥1 kolumnę `long_text`, rdzeń
  dokłada na początku ścieżkę strzałki 22px. Broń nigdy jej nie ma (kreator nie oferuje
  `long_text` dla broni).
- Ikony: `ChevronRight` (zwinięty) / `ExpandMore` (rozwinięty), `@mui/icons-material`.
- Stan: `useState(() => new Set())` z id rozwiniętych wierszy w `RowTable`. Lokalny — nie trafia
  do stats ani WS, reset po odświeżeniu. Wiele wierszy może być rozwiniętych naraz.
- Tryb edycji wymusza rozwinięcie (`textarea` musi być widoczna). Po ✓ wiersz wraca do stanu sprzed
  edycji.
- Wiersz, którego wszystkie komórki `long_text` są puste, w spoczynku nie pokazuje strzałki; ścieżka
  zostaje zarezerwowana.
- Panel rozwinięcia jest **dzieckiem elementu wiersza** z `grid-column: 1 / -1`, nie osobnym
  rodzeństwem — zebra liczy parzystość rodzeństwa i osobny element przestawiłby kolory kolejnych
  wierszy (ta sama pułapka, przez którą stopka broni stoi poza kontenerem).
- Kilka kolumn `long_text` → w panelu jedna pod drugą, każda z etykietą kolumny. Tekst z zachowanymi
  łamaniami linii (`white-space: pre-wrap`).
- Wiersze `alwaysOn` rozwijają się tak samo, tylko do odczytu.

### `CharacterSheet.jsx`

Generyczne helpery na `edited[storeKey][fieldKey]`:
`addRow(storeKey, fieldKey)`, `addRowFromPreset(storeKey, fieldKey, preset, extraCopy)`,
`mapRow(storeKey, fieldKey, rowId, updater)`, `removeRow(storeKey, fieldKey, rowId)`.

- Handlery broni stają się cienkimi wywołaniami z `'weapons'`; `removeWeaponRow` nadal czyści
  `favoriteWeapons`, kopia z presetu nadal kopiuje `damage`. Nazwy `onChange.weapon*` bez zmian.
- Nowe `onChange.tableAdd` (zwraca id — wiersz otwiera się w edycji), `tableAddFromPreset`,
  `tableCell`, `tableRemove` na `'tables'`.
- Id wiersza danych: `r_<ts>_<rand>` — bez kropki, nie koliduje z `editingPath` umiejętności
  (`editingPath` współdzielony przez całą kartę: jedna rzecz edytowana naraz).

### `CustomSheetBody.jsx`

Nowy `case 'data_table'` → `<DataTable>`. W kreatorze (bez `onChange`) nie ma wierszy gracza ani
stopki — tak jak w broni. Strzałka rozwinięcia działa także w kreatorze: to stan widoku, nie
potrzebuje żadnego handlera, więc GM może podejrzeć opis wiersza `alwaysOn` dokładnie tak, jak
zobaczy go gracz.

## 3. Kreator (`components/creator/`)

Wyjęte z `TemplateBuilder.jsx` (2313 linii) do osobnych plików:

| Plik | Źródło | Zmiana |
|---|---|---|
| `TableColumnsEditor.jsx` | `WeaponColumnsEditor` + `updateWeaponColumns` | props `columnTypes` (lista dozwolonych typów), `allowSkillColumn` |
| `TablePresetsEditor.jsx` | `WeaponPresetsEditor` | props `presets`, `onChange`, `renderPresetExtra`; komórki przez `RowTableCell` w trybie edycji |
| `OptionsEditor.jsx` | `OptionsEditor` | przeniesiony bez zmian (używają go oba edytory i pole `select`) |

- Broń: `columnTypes = ['text','number','select']`, `allowSkillColumn`, `renderPresetExtra` =
  formuła obrażeń, presety w `presetWeapons`.
- Dane: `columnTypes = ['text','number','select','long_text']`, bez `allowSkillColumn`, presety
  w `presetRows`.

Wpięcie w `TemplateBuilder.jsx`:
- `FIELD_TYPES` + `PALETTE_GROUPS` (grupa „Tabele”).
- `makeDefaultField`: `data_table` → `{ ...base, columns: [], presetRows: [] }` (`rollable: false`).
- Grupa „Treść” w panelu właściwości: `TableColumnsEditor` + `TablePresetsEditor`. Grupy „Rzut” i
  „Wyświetlanie” nie obejmują `data_table`.
- `EditablePlaceholder.jsx`: `data_table` bez kolumn → placeholder wiersza jak broń.

## 4. i18n

Nowe klucze (en + pl):
- `customSheet.row`, `addRow`, `addRowFromList`, `editRow`, `saveRow`, `removeRow`,
  `rowPresetLocked`, `expandRow`, `collapseRow`
- `creator.fieldType.dataTable`, `creator.fieldType.dataTableDesc`
- `creator.dataTablePresetsTitle`, `dataTablePresetsHint`, `dataTablePresetsNoColumns`,
  `dataTablePresetAdd`
- `creator.tableColTypeLongText`

Klucze edytora kolumn są wspólne, więc zmieniają nazwę z `weapon*` na `table*` (te same wartości):
`weaponColumns`→`tableColumns`, `weaponColumnLabel`→`tableColumnLabel`,
`weaponColType{Text,Number,Select}`→`tableColType{…}`, `weaponAddColumn`→`tableAddColumn`,
`weaponPresetAlwaysOn`→`tablePresetAlwaysOn`.

Klasy CSS wspólnych części tabeli: `custom-sheet__weapon-*` → `custom-sheet__row-table-*`, a w
kreatorze `creator__weapon-(col|preset)*` → `creator__table-*`. Zostają tylko nazwy broni:
`weapon-damage`, `weapon-dmg-*`, `weapon-threshold-hint`, `field--weapon-table`. Testy broni i
snapshot dostają tę samą zmianę nazw selektorów (mechanicznie, w osobnym commicie przed
refactorem). Snapshot ma potem pasować do nowych komponentów bez `-u`, co dowodzi, że DOM się nie
zmienił.

Wspólne komponenty dostają teksty od wrappera przez props — broń dalej mówi „Dodaj broń”, tabela
danych „Dodaj wiersz”. Klucze broni zostają. Klucze, które po refactorze nie mają czytelnika, są
usuwane w tej samej zmianie.

## 5. Testy

**Strażnik regresji refactoru** — bez zmian asercji:
`CustomSheetBody.weaponsTable.test.jsx`, `weaponLayout.test.js`, `weaponLayout.rowIssue.test.js`,
`TemplateBuilder.weaponColumns.test.jsx`, `CharacterDetails.favorites.test.jsx`,
`CustomSheetBody.domShape.test.jsx` (snapshot). Jedyna dozwolona zmiana to mechaniczna zmiana nazw
klas w selektorach (sekcja 4).
`WeaponColumnsEditor.test.jsx` → `TableColumnsEditor.test.jsx`: zmienia się tylko import i nazwa
komponentu. Konieczność zmiany asercji = zmiana zachowania = regresja do wyjaśnienia.

Funkcje przeniesione z `weaponLayout.js` do `rowTableLayout.js` (`weaponGridTemplate` →
`rowGridTemplate`): testy idą za funkcją, asercje wartości bez zmian.

**Nowe:**
- `rowTableLayout.test.js` — szablon siatki ze slotami i ścieżką strzałki; `long_text` poza siatką.
- `CustomSheetBody.dataTable.test.jsx` — dodanie wiersza otwiera edycję; strzałka rozwija/zwija;
  edycja wymusza rozwinięcie i pokazuje `textarea`; pusty opis → brak strzałki; wiersz `alwaysOn`
  ma kłódkę i jest tylko do odczytu; katalog kopiuje komórki; brak gwiazdki i rzutu.
- `TableColumnsEditor.test.jsx` — `long_text` dostępny tylko gdy w `columnTypes`; przełącznik
  „z umiejętności” ukryty bez `allowSkillColumn`.
- `TemplateBuilder.dataTable.test.jsx` — dodanie pola z palety, kolumny i presetu `alwaysOn`;
  podgląd `CustomSheetBody` pokazuje wiersz presetu.
- Go: `Tables` przeżywa round-trip `ComputeDerived`.

## Poza zakresem

- Wiersz podsumowania i agregaty kolumn liczbowych (suma/min/max/średnia; problem ilość × waga).
- Obecność na skróconej karcie, gwiazdka ulubionych.
- Zmiana nazwy `WeaponColumn` → `TableColumn` w Go.
