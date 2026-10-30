# PLAYRPG-288 — Kość w polu gracza formuły obrażeń + presety „przy tworzeniu postaci”

## Cel

MG chce formuły obrażeń typu „nóż: 1K4 + modyfikator obrażeń”, gdzie modyfikator to liczba
(`1`, `-1`) **albo kość** (`1K4`, jak Damage Bonus w CoC). Modyfikator różni się między postaciami
i nie dotyczy każdej broni (pistolet go nie dostaje).

Dziś formuła obrażeń ma blok `const_input` (▢, „+ Pole gracza”) — liczbę wpisywaną przez gracza per
broń. Przyjmuje tylko liczbę. Kość „do wypełnienia” (`dice` z `value: "d"`) przyjmuje tylko ścianki
i zawsze rzuca (`diceCount` podbija 0 do 1), więc nie da się zrobić kości opcjonalnej.

Drugi problem: preset broni `alwaysOn` żyje w szablonie i jest na karcie tylko do odczytu, więc
„Nieuzbrojony” od MG nie może mieć modyfikatora konkretnej postaci.

## Decyzje

| Temat | Decyzja |
|---|---|
| Gdzie wpisywany modyfikator | Per broń, w istniejącym ▢. **Bez** nowego typu pola postaci i bez chipa w formule — rozważone i odłożone (wymagało rozdzielania broni białej/palnej i dokładało typ pola). Wartość liczona automatycznie z atrybutów (tabela CoC) — ewentualnie w przyszłości jako rozszerzenie pola obliczanego, poza zakresem. |
| Blok w kreatorze | Rozszerzamy istniejący ▢ (`const_input`), nie dodajemy drugiego bloku. Zero nowych przycisków. |
| Gramatyka wpisu | `[±] wyraz (± wyraz)*`, wyraz = liczba całkowita albo `[N]K M` (`K`/`k`/`d`/`D`, brak `N` = 1). Spacje ignorowane. Bez mnożenia i nawiasów. `N ≥ 1`, `M ≥ 1`, limit kości jak dziś (`maxDicePerTerm`). |
| Puste ▢ | Blokuje rzut, jak dziś. Broń bez modyfikatora dostaje jawne `0`. |
| Błędny wpis | Czerwona ramka + blokada rzutu na karcie; backend zwraca 400 (obrona, nie ścieżka UI). |
| Tooltip | Portal tooltip na ▢ z przykładami `2`, `-1`, `1K4`, `1K6+1`; przy błędnym wpisie pierwsza linia „Niepoprawne wyrażenie”. |
| `alwaysOn` | Zastąpione `addOnCreate`: preset kopiowany do wierszy postaci przy jej tworzeniu, potem zwykły wiersz gracza (edycja, usuwanie, ponowne dodanie z katalogu). Dotyczy **broni i tabel danych**. Preset z flagą jest też w katalogu. |
| Świadomy koszt | Edycja presetu przez MG nie dociera do istniejących postaci; preset dodany po stworzeniu postaci jest tylko w katalogu. |
| Id skopiowanego wiersza | Równe `id` presetu. Daje idempotentną migrację bez znacznika i zachowuje gwiazdki z `favoriteWeapons`. Dodanie z katalogu dalej generuje nowe id (`genRowId`). |
| Migracja | Pełna (`cmd/migrate-weapon-presets`), uruchamiana na prod zaraz po deployu. |

## Model danych

`internal/systems/custom/character.go`:

- `WeaponRow.Damage`: `map[string]float64` → `map[string]string`. Trzyma ▢ (wyrażenie) i ścianki
  kości gracza (tekst `"6"`, parsowany `strconv.Atoi`).
- `WeaponRow.Favorite` — **usunąć**. Nic go nie czyta; ulubione wszystkich broni są w
  `Stats.FavoriteWeapons` (front: `CharacterSheet.jsx` `toggleWeaponFavorite`).
- Komentarz `Stats.FavoriteWeapons` poprawić: lista id ulubionych broni (wierszy gracza).

`internal/models/SystemTemplate.go`:

- `PresetWeapon.Damage`: `map[string]float64` → `map[string]string`.
- `PresetWeapon.AlwaysOn` i `PresetRow.AlwaysOn` → `AddOnCreate bool`
  (`bson:"addOnCreate,omitempty" json:"addOnCreate,omitempty"`), komentarze przepisane na nową
  semantykę.

## Backend

### Parser wpisu ▢ — `systems/custom/damage_expr.go` (nowy)

```go
// parseDamageExpr turns a player-entered damage modifier ("2", "-1", "1K4", "2d6+1") into formula
// blocks: const, dice (with a count) and op. A leading minus becomes "0 -".
func parseDamageExpr(s string) ([]models.FormulaBlock, error)
```

Zwracane bloki są w składni, którą `parseFormula` już zna (`2K6` → `const 2`, `op d`, `dice d6`;
`K4` → samo `dice d4`) — ewaluator nie dostaje nowego typu.
Błąd → sentinel `ErrInvalidDamageExpr`.

### `applyDamageOverrides` (`weapon.go`)

- `const_input`: `parseDamageExpr(override)` → wstawia `paren_open` + bloki + `paren_close` w miejsce
  ▢ (z unikalnymi id pochodnymi od id ▢). Puste/brak → `const 0` (siatka bezpieczeństwa jak dziś).
  Błąd parsowania → błąd w górę, `RollWeaponWithTemplate` zwraca go przed rzutem ataku (tak jak dziś
  dla zepsutej formuły).
- `dice` gracza: `strconv.Atoi(override)`.
- `const` (nadpisanie przez gracza): `strconv.ParseFloat`.
- Sygnatura zmienia się na `(blocks, map[string]string) ([]models.FormulaBlock, error)`.

Rozbicie w logu powstaje z istniejącego `label`: `1d4+(1d4) = 3+(2) = 5`.

### `resolveWeaponRow`

Usunąć zapasowe szukanie w `field.PresetWeapons` — wszystkie bronie są w `stats.Weapons`. Funkcja
sprowadza się do `findWeaponRow`.

### `SeedDefaults` (`plugin.go`)

Nowe gałęzie w pętli po polach:

- `weapons_table`: każdy `PresetWeapon` z `AddOnCreate` → `WeaponRow{ID: p.ID, Cells: copy, Damage: copy}`
  dopisany do `s.Weapons[field.Key]`.
- `data_table`: analogicznie `PresetRow` → `TableRow` w `s.Tables[field.Key]`.

Kopie map, nie współdzielone referencje. `SeedDefaults` woła dziś tylko `CharacterHandler.go:221`
(postać w grze z `CustomSystemTemplate`) — to jedyne miejsce tworzenia postaci custom.

## Frontend — karta

- `weaponLayout.js` `renderDamageFormula`: ▢ → `<input type="text">` (szerokość dobrana do
  `1K6+1`), tooltip portalowy (`.portal-tooltip`, wzorzec z CLAUDE.md) z przykładami; przy błędzie
  dodatkowa linia. Kość gracza zostaje `type="number"`.
- Nowy `systems/custom/formula/damageExpr.js`: `isValidDamageExpr(s)` — lustro gramatyki Go.
- `weaponDamageIncomplete` → rozróżnia puste od błędnego; `weaponRowIssue` zwraca nowy powód
  `'damageInvalid'`, `weaponIssueTitle` mapuje go na `customSheet.weaponDamageInvalid`.
- `CharacterSheet.jsx` `updateWeaponDamage`: zapisuje string (bez `Number(value) || 0`).
- `RowTable.jsx`: usunąć `alwaysOnPresets`, renderowanie presetów tylko do odczytu i wszystko, co
  służyło tylko im (propsy `locked`, `isPreset` w `WeaponsTable.jsx`, klucze
  `customSheet.weaponPresetLocked` / `rowPresetLocked`, martwe CSS). Katalog pokazuje wszystkie
  presety.
- `CharacterDetails.jsx` (custom): rozwiązywanie ulubionych przez `presetWeapons` usunąć — id
  ulubionych wskazują tylko wiersze gracza.

## Frontend — kreator

- `FormulaBuilder.jsx`: bez zmian w logice; `constInputTitle` dostaje przykłady.
- `TablePresetsEditor.jsx`: przełącznik `alwaysOn` → `addOnCreate`, etykieta
  `creator.tablePresetAddOnCreate` („Dodaj przy tworzeniu postaci”). Pole ▢ presetu jako tekst z
  tą samą walidacją; podpowiedź, że puste ▢ wypełni gracz.
- i18n (en + pl): `weaponPresetsHint`, `dataTablePresetsHint`, `damageFormulaHint`,
  `constInputTitle`, tutorial `tutorial.creatorField.*.data_table` (dziś mówi „zawsze na karcie”) —
  przepisać na nową semantykę. Klucz `tablePresetAlwaysOn` usunąć.
- Tutorial: brak nowego kroku (żadna nowa grupa/karta/typ pola); tylko tekst wyżej.
- **Podgląd = gra:** kreator (`TemplateBuilder`, także render „ducha” przy przeciąganiu) i podgląd
  w lobby (`TemplateSheetPreview`) przekazują do `CustomSheetBody` `values` z helpera
  `addOnCreateValues(sections)` (`systems/custom/addOnCreate.js`) — frontowe lustro `SeedDefaults`.
  Bez tego presety `addOnCreate` zniknęłyby z podglądu, choć nowa postać je dostanie.

## Limity gramatyki

Liczba kości 1–100 (`maxDicePerTerm`), ścianki 1–1000, stała 0–9999 — identycznie w Go i JS,
przypięte `damage_expr_cases.json`.

## Parzystość Go/JS

`systems/custom/formula/damage_expr_cases.json` — wspólny plik przypadków (wzorzec
`formula_cases.json`): wpis, `valid`, dla wpisów bez kości wynik. Czytany przez test Go i test JS.

## Migracja — `cmd/migrate-weapon-presets`

Wzorzec: `cmd/migrate-template-members`. Dla każdego `SystemTemplate` i każdej gry z
`CustomSystemTemplate`:

1. `Damage` w presetach broni: liczby → tekst (`"%g"`).
2. W grze: każdej postaci tej gry dopisz presety z `alwaysOn: true` jako wiersze z `id` presetu —
   **pomiń**, jeśli postać ma już wiersz o tym id (bronie i tabele danych).
3. `alwaysOn` → `addOnCreate` w presetach.

Dla każdej postaci custom: `Damage` w `stats.weapons.*[]` liczby → tekst; usuń `favorite` z wierszy.

Krok 2 przed 3, per gra. Ponowne uruchomienie jest bezpieczne: po kroku 3 brak `alwaysOn`, a
przerwanie w połowie kończy dedup po id. Dokumenty czytane jako `bson.M` (nie przez nowe typy, które
nie zdekodują `double` do `string`). Flaga `-dry-run` raportuje liczby zmian.

**Kolejność wdrożenia:** deploy → natychmiast migracja. Do jej końca postacie i gry z bronią
z wpisanymi obrażeniami nie wczytają się (`cannot decode double into a string type`).

## Testy

Go:
- `damage_expr_test.go` — przypadki ze wspólnego JSON + limit kości.
- `weapon_test.go` — ▢ z kością, z liczbą ujemną, błędny wpis → błąd przed atakiem; rozbicie z
  wstrzykniętym rng (`backend-roller-test-pattern`); usunięte testy fallbacku do presetów.
- `plugin` — `SeedDefaults` kopiuje presety `addOnCreate` (broń + tabela), id = id presetu, mapy
  niezależne.
- Migracja — test na `bson.M` (konwersja, dedup, rename, idempotencja).

JS:
- `damageExpr.test.js` — wspólny JSON.
- `weaponLayout` / `CustomSheetBody.weaponsTable.test.jsx` — ▢ jako tekst, powód `damageInvalid`,
  tooltip.
- `RowTable` / data table / `TablePresetsEditor` — bez ścieżki `alwaysOn`, przełącznik
  `addOnCreate`.
- `tourTranslations.test.js` / `creatorTour.coverage.test.jsx` — przechodzą bez nowych kroków.
