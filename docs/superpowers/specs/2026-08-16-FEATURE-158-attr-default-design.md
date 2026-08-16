# FEATURE-158 — Wartość domyślna pola liczbowego w kreatorze kart postaci

Data: 2026-08-16

## Problem

Kreator kart postaci pozwala ustawić dla pola `attr` i `number` etykietę, skrót, Min i Max,
ale nie pozwala powiedzieć, od jakiej wartości postać startuje. Każda nowo utworzona postać
w grze na systemie custom rodzi się z pustymi atrybutami, więc GM prowadzący system, gdzie
atrybut startuje np. od 20, wpisuje tę samą liczbę ręcznie w każdej nowej karcie.

## Rozwiązanie

Nowe pole konfiguracji **Domyślna** dla pól typu `attr` i `number`. Wartość jest wpisywana
do statystyk postaci w momencie jej tworzenia. Pole puste = zachowanie dzisiejsze
(postać startuje bez wartości).

Zakres celowo obejmuje `number` obok `attr`: oba typy dzielą już rząd Min/Max w panelu
właściwości i oba trzymają jedną liczbę, więc to ten sam kod i ta sama kratka w UI.

## A. Model danych (backend)

`models.FieldDef` (`warhammer-battle-helper-backend/internal/models/SystemTemplate.go:157`)
dostaje jedno pole, obok `Min`/`Max`:

```go
// Default is the value written into a freshly created character's stats for this field
// ("attr" and "number" only). Nil = no default; the character starts with the key absent,
// exactly as before. A pointer, not an int, because 0 is a legal default.
Default *int `bson:"default,omitempty" json:"default,omitempty"`
```

Wskaźnik, nie `int`, z tego samego powodu co sąsiadujące `Min`/`Max`: `0` to legalna wartość
domyślna, a `omitempty` na zwykłym `int` zjadłby ją do „brak". Stare szablony nie mają tego
klucza w BSON-ie, więc dekodują się do `nil` — brak migracji, brak zmiany zachowania.

## B. Seed przy tworzeniu postaci

### Gdzie

Backend, w `CharacterHandler.CreateGameCharacter`
(`warhammer-battle-helper-backend/internal/http/CharacterHandler.go:180`).

Dlaczego nie front: FEATURE-155 świadomie przeniosło budowę pustej karty z klienta na backend
(klient wysyłał Warhammerowy szkielet dla każdego systemu, przez co custom-owe postacie rodziły
się z `weapons` jako tablicą tam, gdzie plugin trzyma mapę, i każdy późniejszy rzut ginął
w `decodeStats`). Komentarz w `CreateGameCharacter` opisuje ten bug wprost. Defaulty to ta sama
klasa problemu — kształt startowej karty należy do backendu.

Dlaczego nie leniwie przy renderze: gdyby karta tylko *pokazywała* default przy braku wartości,
zmiana szablonu zmieniałaby wartości istniejących postaci, a „pusta" i „równa domyślnej" byłyby
nie do odróżnienia.

### Jak

Nowa metoda na `*custom.Plugin` — nie w interfejsie `systems.GameSystem`:

```go
// SeedDefaults writes FieldDef.Default into a blank stats document: attr fields land in
// Attributes[key].Base (advances stay 0; ComputeDerived then sets current = base), number
// fields in Numbers[key]. Fields without a Default are left absent.
func (p *Plugin) SeedDefaults(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error)
```

Interfejs `GameSystem` zostaje nietknięty, bo tylko system custom ma szablon. Wzorzec jest
w repo ustalony: `RollWithTemplate` i `RollWeaponWithTemplate` wiszą na `*custom.Plugin`,
a `GameService.RollSkill` sięga po nie przez `game.GameSystem == "custom"` + type assertion.

Wywołanie w handlerze, wewnątrz istniejącej gałęzi „create bez statów", przed `ComputeDerived`:

```go
if len(statsRaw) == 0 {
    statsRaw = defaultStatsFor(sys, req.Name)
    if gameSystem == "custom" && game.CustomSystemTemplate != nil {
        if seeded, seedErr := sys.(*custom.Plugin).SeedDefaults(statsRaw, game.CustomSystemTemplate); seedErr == nil {
            statsRaw = seeded
        } else {
            log.Printf("CreateGameCharacter: SeedDefaults failed: %v", seedErr)
        }
    }
}
```

Kolejność ma znaczenie: `ComputeDerived` odpala się zaraz potem i liczy
`current = base + advances`, więc zaseedowany atrybut od razu wychodzi do klienta z poprawnym
`current`. Błąd seedowania jest logowany i połykany — postać powstaje z pustymi statami,
tak jak dziś; brak defaultów nie jest powodem, by odmówić utworzenia karty.

### Reguły zapisu

- `attr` z `Default = d` → `Attributes[key] = {base: d, advances: 0, current: d}`.
  Rozwinięcia zostają zerowe — to rzecz, którą postać zdobywa w grze, nie startowa.
- `number` z `Default = d` → `Numbers[key] = d`.
- pole bez `Default` (`nil`) → klucza w mapie brak, dokładnie jak dziś.
- typy inne niż `attr` i `number` → `Default` ignorowane, nawet gdyby jakoś trafiło do BSON-u.
- pola przechodzą po wszystkich sekcjach szablonu (`tmpl.Sections[].Fields[]`).

### Czego seed nie dotyka

- **Klonowanie postaci** (`CloneGameCharacter`) — kopiuje istniejące staty, defaultów nie rusza.
- **Istniejące postacie po zmianie szablonu** — default to zdarzenie z chwili utworzenia karty,
  nie żywe wiązanie do szablonu.
- **Create z jawnymi statami** — warunek `len(statsRaw) == 0` zostaje bez zmian: kto przysyła
  własne staty, dostaje własne staty. W praktyce front nigdy ich nie przysyła
  (`DndContext.jsx` — `handleAddCharacter` i `handleAddNPC` wysyłają samą nazwę), więc seed
  łapie każdą nową postać i każdego NPC-a.
- **Istniejąca gra, dopóki GM jej nie zsynchronizuje z szablonem** — `SeedDefaults` czyta
  `game.CustomSystemTemplate`, czyli zatrzaśniętą kopię szablonu osadzoną w grze w chwili jej
  utworzenia, a nie żywe odwołanie do bieżącej wersji szablonu. Default dodany do szablonu
  po utworzeniu gry nie trafi do nowych postaci w tej grze, dopóki GM nie użyje
  „Sync template to game" (`creator.syncTemplate`, `POST /games/:id/syncTemplate`,
  `internal/service/GameService.go:2877-2901`) — dopiero synchronizacja odświeża
  `CustomSystemTemplate` w dokumencie gry. Gry utworzone po edycji szablonu dostają aktualną
  kopię od razu i niczego nie wymagają. To zachowanie zgodne z tym, jak dziś działa każda inna
  zmiana szablonu wobec już trwających gier — nie jest to defekt tej funkcji, ale warto je
  spisać, bo to najbardziej prawdopodobny sposób, w jaki ktoś zgłosi ją jako niedziałającą.

## C. Kreator (UI)

Rząd Min/Max dla `attr`/`number`
(`warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:591-596`)
dostaje trzecią kratkę:

```jsx
<TextField size="small" label={t('creator.fieldDefault')} type="number"
  value={field.default ?? ''}
  onChange={e => up({ default: e.target.value === '' ? null : Number(e.target.value) })}
  sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
```

- ten sam pattern `'' → null` co Min/Max — puste wejście musi dać `null`, żeby backend
  zdekodował je jako „brak defaultu", a nie jako `0`
- `flex: 1` na wszystkich trzech kratkach w `Box` z `display: flex` — trzy równe kolumny
  zamiast dwóch, zero nowego CSS
- pole widoczne tylko dla `attr` i `number`, bo siedzi wewnątrz istniejącego warunku
- domyślna wartość nowo dodanego pola: brak klucza `default` w `makeDefaultField()`
  (`TemplateBuilder.jsx:111-128`) — nie dokładamy `default: null`, bo `field.default ?? ''`
  radzi sobie z `undefined` tak samo

Zapis idzie istniejącą ścieżką autosave (`triggerSave`, debounce 1200 ms) — nowe pole jest
zwykłą właściwością obiektu pola, nic w mechanice zapisu się nie zmienia.

### Brak walidacji względem Min/Max

Default poza zakresem `[Min, Max]` jest przyjmowany. Dziś `Min`/`Max` to wyłącznie atrybuty
HTML inputa na karcie postaci (`CustomSheetBody.jsx:467,502,519`) — backend ich nie egzekwuje
przy żadnym zapisie. Twardy clamp na defaulcie byłby jedynym miejscem w systemie, gdzie te
granice cokolwiek znaczą; taka niespójność jest gorsza niż GM wpisujący default poza zakresem.

## D. i18n

Jeden nowy klucz w obu plikach:

- `creator.fieldDefault` → `"Default"` (en) / `"Domyślna"` (pl)

## E. Testy

Testy jednostkowe w pakiecie `custom` (backend, zgodnie z konwencją repo — logika systemów
jest pokryta testami Go):

1. `attr` z `Default = 5` → `Attributes["k"].Base == 5`, `Advances == 0`
2. `attr` z `Default = 0` → klucz istnieje, `Base == 0` (odróżnienie ustawionego zera od `nil`)
3. `attr` bez `Default` → klucza w `Attributes` brak
4. `number` z `Default` → `Numbers["k"]` ma wartość
5. typ inny niż `attr`/`number` z ustawionym `Default` → ignorowany, mapy nietknięte
6. `ComputeDerived` po `SeedDefaults` → `Current == Base`
7. pola z wielu sekcji szablonu → wszystkie zaseedowane

Front bez testów automatycznych — kreator nie ma testów renderowych. Weryfikacja ręczna:
ustaw default na polu `attr` i na polu `number`, utwórz nową postać w grze na tym szablonie,
sprawdź, że karta pokazuje wartości; utwórz postać na szablonie bez defaultów i sprawdź,
że karta jest pusta.

## Poza zakresem

- backfill istniejących postaci po ustawieniu/zmianie defaultu
- defaulty dla typów `progress`, `select`, `checkbox`, `text_short`, `text_long`
  oraz tabel (`skill_table`, `weapons_table`, `skill_tree`)
- osobna wartość domyślna dla `advances`
- egzekwowanie Min/Max gdziekolwiek w systemie
