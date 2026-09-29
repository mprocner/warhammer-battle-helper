# FEATURE-218 — Atrybut jako wartość bazowa umiejętności

**Status:** zaprojektowane 2026-09-29 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`FieldDef.BaseFromAttr`)
- `warhammer-battle-helper-backend/internal/systems/custom/roller.go` (`skillValue`, `skillHasValue`)
- `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` (`resolveRollConfig` → `rollTarget`)
- `warhammer-battle-helper-backend/internal/systems/custom/weapon.go` (`resolveWeaponSkill`)
- `warhammer-battle-helper-front/src/systems/custom/skillLayout.js` (`resolveSkillValues`)
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (render wiersza tabeli)
- `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`FlagSwitch`, `SKILL_FLAG_META`)
- `warhammer-battle-helper-front/src/style.css`, `locales/{en,pl}/translation.json`

**Powiązane:** FEATURE-217 (pięć flag wyświetlania — ta zmiana rozszerza jej `SKILL_FLAG_LABELS`
do `SKILL_FLAG_META` i uogólnia panel), FEATURE-162 (rzuty sumują `base + advances` i nie wierzą
zapisanemu `current` — ta zmiana rozszerza tę zasadę na wyświetlanie)

## Kontekst

MG buduje tabelę umiejętności w systemie, gdzie umiejętność startuje z wartości powiązanego
atrybutu, a gracz dokłada do niej rozwinięcia. Dziś musi kazać graczowi przepisać wartość atrybutu
w kolumnę „Baza" ręcznie — i pilnować, żeby po każdej zmianie atrybutu gracz przepisał ją jeszcze
raz, w każdej umiejętności opartej na tym atrybucie.

Przypisanie atrybutu do umiejętności (`assignAttrToSkill`) już istnieje i jest czytane w trzech
miejscach rzutu: blok `attr_linked` w formule, blok `dice_skill_attr` (kość o `atrybut + umiejętność`
ściankach) oraz fallback progu, gdy MG nie podał progu jawnie, a umiejętność nie ma wartości
(`roller.go:53-64`). Czego nie ma: żeby atrybut był **bazą** umiejętności, a nie tylko osobnym
składnikiem formuły.

## Zakres

Jeden przełącznik w konfiguracji pola `skill_table`: „ustaw atrybut jako wartość bazową".
Wymaga dwóch innych flag tego samego pola. Gdy włączony, kolumna bazy pokazuje aktualną wartość
powiązanego atrybutu i jest nieedytowalna, a suma to atrybut + rozwinięcia.

Poza zakresem: drzewo umiejętności (nie ma kolumny rozwinięć, więc nie ma z czym tej flagi
połączyć — patrz niżej), inne źródła wartości bazowej niż atrybut.

## Decyzje z brainstormingu

### Wartość jest liczona, nigdy zapisywana

`stats.skills[key].base` zostaje nietknięte. Karta i rzut składają bazę z atrybutu przy każdym
odczycie.

**Dlaczego nie zapis:** `ComputeDerived(raw bson.Raw)` nie dostaje szablonu (`plugin.go:43`), więc
backend nie ma jak podstawić atrybutu przy zapisie postaci — trzeba by mu dodać szablon albo dorobić
drugą, świadomą szablonu ścieżkę, a potem pilnować, żeby **każda** zmiana atrybutu przeliczyła bazy
wszystkich umiejętności na nim opartych. Repo już raz podjęło tę decyzję dla rzutów: komentarz
w `character.go:22` mówi wprost, że rzuty sumują `base + advances`, a nie ufają zapisanemu `current`,
bo `current` to wyłącznie kopia dla wygody wyświetlania.

Skutki, świadomie przyjęte:
- zmiana atrybutu propaguje się natychmiast do wszystkich umiejętności na nim opartych,
- zapisany `base` wiersza zostaje w bazie jako dane martwe i **wraca**, gdy MG wyłączy flagę
  (to cecha, nie wada — wyłączenie flagi nie kasuje niczyich danych),
- `current` w `stats` dla takiego wiersza jest nieaktualne (nadal `base + advances`, czyli
  `0 + rozwinięcia`), więc **nikt nie może mu wierzyć** — ani rzut (już nie wierzy), ani karta
  (przestaje wierzyć w tej zmianie).

### Podstawiamy `Current` atrybutu, nie jego `Base`

Atrybuty same mają `{Base, Advances, Current}`. Bierzemy `Current`, czyli to, co gracz widzi jako
aktualną wartość atrybutu. Rozwinięcie atrybutu podnosi wszystkie oparte na nim umiejętności —
tak działa Warhammer 4e i większość systemów d20.

Drugi powód, mocniejszy: `attrLookup` (`roller.go:541`) zwraca `Current` i to ta sama wartość, którą
czytają już blok `attr_linked` i fallback progu. Wzięcie `Base` dałoby jednej karcie dwie różne
definicje „powiązanego atrybutu".

### Wiersz bez wybranego atrybutu: baza 0, nadal nieedytowalna

`assignAttrToSkill` włącza możliwość przypisania, ale pojedynczy wiersz może mieć puste `attr`.
Taki wiersz pokazuje 0 i zostaje read-only, więc cała kolumna zachowuje się jednolicie, a dziura
w szablonie jest natychmiast widoczna. Spójne z backendem: `attrLookup` na pustym kluczu zwraca
`0, false`.

## Model danych

`models.FieldDef` — jedna nowa flaga, dodatnia, brak pola = wyłączone (bez migracji, nowa funkcja):

```go
// BaseFromAttr replaces a skill's base value with its linked attribute's current value, so the
// base is derived at read time and never stored. Meaningless without both AssignAttrToSkill (the
// row needs an attribute to read) and HasAdvances (with no advances column the base IS the total,
// and a wholly derived total is just the attribute under another name). The creator enforces both
// as a precondition; the renderer and the roller re-check them, because a hand-edited template can
// carry the flag without them.
BaseFromAttr bool `bson:"baseFromAttr,omitempty" json:"baseFromAttr,omitempty"`
```

Brak zmian w `custom.Stats` — nic nowego nie jest przechowywane. To jest cała treść decyzji
„liczone, nie zapisywane".

## Architektura: jedna definicja na język

Wartość umiejętności składana jest w dwóch językach naraz i to jest najbardziej krucha część tej
zmiany. Dlatego w każdym z nich istnieje **dokładnie jedno** miejsce, które ją składa, a oba
komentarzami wskazują na siebie.

### Go — rozszerzamy istniejące funkcje, nie dokładamy równoległych

```go
func skillValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) int
func skillHasValue(stats *Stats, key, linkedAttr string, baseFromAttr bool) bool
```

Pierwotny pomysł — dopisać `effectiveSkillValue` obok `skillValue` — został odrzucony: dwie
równoległe nazwy to zaproszenie, by ktoś zawołał starą i po cichu zignorował flagę. Wszystkie sześć
call-site'ów (`roller.go:54`, `:58`, `:180`, `:223`, `:467`, `:484`) ma już `linkedAttr` w zasięgu,
więc rozszerzenie sygnatury nie wymaga przeciągania niczego nowego przez wywołania.

`skillHasValue` z włączoną flagą znaczy „atrybut istnieje": atrybut obecny i równy 0 daje realny
próg `0 + rozwinięcia`, a nie brak danych. To ta sama logika, którą obecny komentarz tej funkcji
stosuje do policzonego zera.

### Go — flaga podróżuje w nazwanej strukturze

`resolveRollConfig` zwraca dziś cztery wartości; piąta zrobiłaby nieczytelną krotkę — w `weapon.go:84`
stoi już `_, attr, _, _`. Zamiast tego:

```go
// rollTarget is what a skill key resolves to: the config to roll, the attribute the formula's
// linked-attribute blocks read, whether the skill's base is derived from that attribute, and the
// field type the log labels with.
type rollTarget struct {
	cfg          *models.RollConfig
	linkedAttr   string
	baseFromAttr bool
	fieldType    string
}
```

Sześć call-site'ów do przepisania (`plugin.go:128`, `weapon.go:84`, cztery w testach) — tyle samo,
ile dotknęłaby piąta wartość w krotce, tylko czytelniej.

`resolveWeaponSkill` (`weapon.go:69-89`) też musi przenosić `baseFromAttr`, bo rzut na trafienie
przechodzi przez `rollFromFormula` z umiejętnością wybraną w kolumnie broni. Bez tego broń oparta
na umiejętności pochodnej rzucałaby na samych rozwinięciach.

`rollFromFormula`, `rollFromFormulaDicePool`, `evalFormula` i `evalFormulaDicePool` dostają
`baseFromAttr bool` obok istniejącego `linkedAttr`.

### Front — jedna funkcja w `skillLayout.js`

```js
// resolveSkillValues answers "what numbers does this row show, and is the base editable" — the one
// place that knows a derived row's stored `current` is stale. Mirrors skillValue/skillHasValue in
// internal/systems/custom/roller.go: change one and you must change the other, or the log and the
// sheet disagree about the same skill.
resolveSkillValues(field, row, skills, attributes) → { base, advances, total, baseReadOnly }
```

Render wiersza przestaje liczyć cokolwiek. Trzygałęziowa logika sumy staje się testowalna bez DOM —
po to ten moduł istnieje (jsdom nie liczy layoutu, więc każda decyzja podejmowana na danych jest
decyzją, którą da się przetestować).

Pole `baseReadOnly` jest w wyniku, a nie liczone w renderze, bo wynika z tej samej trójki flag co
`base`: rozdzielenie ich pozwoliłoby im się rozjechać.

### Kreator — zależność jako dane

FEATURE-217 zostawiła `SKILL_FLAG_LABELS` z polem `inverted`. Rozszerzamy do `SKILL_FLAG_META`
z opcjonalnym `requires` i wyciągamy wspólny komponent `FlagSwitch`, który z tej tabeli wyprowadza
**wszystkie trzy** zachowania nowego przełącznika:

```js
baseFromAttr: {
  labelKey: 'creator.skillAttrAsBase',
  hintKey:  'creator.skillAttrAsBaseHint',
  requires: ['hasAdvances', 'assignAttrToSkill'],
},
```

- **zablokowanie:** `requires.some(f => !field[f])`
- **tooltip:** składany z **brakujących** pozycji, więc sam z siebie wypisze jedną albo dwie
- **kasowanie kaskadowe:** `clearDependentFlags(field, patch)` przechodzi po tabeli i gasi każdą
  flagę, której `requires` przestało być spełnione

Kasowanie musi trafić do **tego samego** `up()`, co zmiana warunku — dwa kolejne zapisy pokazałyby
przez moment flagę włączoną bez warunków.

Grupa „Wyświetlanie" mapuje po `skillDisplayFlags(type)`, a `baseFromAttr` renderuje się jawnie
w grupie „Zawartość", bezpośrednio pod „przypisz atrybut do umiejętności" — oba przez ten sam
`FlagSwitch`.

**Granica tego projektu, świadoma:** `requires` to płaska lista, więc wyraża wyłącznie koniunkcję
(„wszystkie te muszą być włączone"). Zależność typu „A albo B" wymusiłaby zmianę kształtu danych na
predykat — a predykat odbiera możliwość wypisania w tooltipie, **czego konkretnie** brakuje, bo
z funkcji nie da się odczytać nazw warunków. Zostajemy przy liście, dopóki jedyny realny przypadek
jest koniunkcją.

**Pułapka implementacyjna:** wyłączony MUI `Switch` nie emituje zdarzeń wskaźnika, więc
`onMouseEnter` na nim nigdy nie odpali. Tooltip wymaga owinięcia w `<span>` ze słuchaczami.
Tooltip pokazujemy tylko w stanie zablokowanym — włączony przełącznik ma już etykietę i podpis.

### Dlaczego nie w drzewie

`hasAdvances` istnieje tylko dla `attr` i `skill_table` (`TemplateBuilder.jsx:134,138`); węzeł drzewa
ma jedną wartość. Skoro warunkiem jest kolumna rozwinięć, w panelu drzewa tego przełącznika nie
będzie w ogóle — nie jako ukrycie, lecz jako konsekwencja `requires`.

## Wygląd

Input bazy wiersza pochodnego dostaje `readOnly` i modyfikator
`.custom-sheet__skill-val-input--derived` z wyglądem grawerowanej tabliczki, którego używa już
`.custom-sheet__skill-val-total` (tło `#e8dcc4`, wewnętrzny cień, ramka `#c9975b`). Read-only ma
wyglądać na read-only, inaczej gracz klika w pole i nie rozumie, dlaczego nic nie wpisuje.

Nazwa umiejętności nadal nosi skrót atrybutu w nawiasie (`Skradanie (Zr)`), co już działa
od FEATURE-217 — więc źródło liczby jest widoczne bez dodatkowego tooltipa.

## Testy

Frontend: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`.
Znany baseline fail: `App.test.js` (axios ESM). Backend: `go test ./...`.

| Plik | Co sprawdza |
|---|---|
| `roller_test.go` | próg z atrybutu + rozwinięcia; blok `skill` z tą samą sumą; `dice_skill_attr` liczący ścianki z efektywnej wartości; flaga włączona przy **braku** atrybutu → 0 i nierozstrzygnięty próg (`hasThreshold == false`); flaga wyłączona → bez zmian |
| `weapon_test.go` | rzut na trafienie bronią, której kolumna umiejętności wskazuje umiejętność pochodną, używa atrybutu + rozwinięć |
| `skillLayout.test.js` | `resolveSkillValues`: pochodna baza z `current` atrybutu; suma atrybut + rozwinięcia **przy celowo nieaktualnym `current` w fixture** (test, który łapie najcichszy błąd tej zmiany); brak atrybutu → 0 i `baseReadOnly`; flaga przy wyłączonych rozwinięciach → baza edytowalna i ze `stats` |
| `CustomSheetBody.skillTable.test.jsx` | input bazy `readOnly` z wartością atrybutu; suma w wierszu; wiersz bez atrybutu |
| `TemplateBuilder.skillFlags.test.jsx` | `clearDependentFlags` jako czysta funkcja: gaszenie przy wyłączeniu każdego z dwóch warunków, brak gaszenia gdy oba spełnione, brak wpływu na flagi bez `requires` |

Poza pokryciem testami zostaje wygląd — jsdom nie liczy layoutu, więc kontrast i czytelność
tabliczki read-only trzeba zobaczyć w przeglądarce.
