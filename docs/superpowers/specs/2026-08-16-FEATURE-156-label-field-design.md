# FEATURE-156 — pole "etykieta" w kreatorze kart postaci

Data: 2026-08-16

## Cel

MG może umieścić na karcie postaci statyczny tekst (wskazówkę, ostrzeżenie, nagłówek
opisowy) o wybranym kolorze i wielkości czcionki. Tekst pochodzi z szablonu i jest
identyczny na każdej postaci utworzonej z tego szablonu.

## Decyzje

| # | Decyzja | Uzasadnienie |
|---|---|---|
| 1 | Etykieta = zwykłe pole w gridzie sekcji (jedna komórka) | reużywa drag&drop z palety, sortowanie, panel właściwości |
| 2 | Wielkość czcionki = 4 presety (`small`/`normal`/`large`/`heading`) | wartości semantyczne; skala typografii karty zostaje w jednym miejscu (CSS) |
| 3 | Kolor = paleta 8 swatchy, zapis jako hex | paleta gwarantuje kontrast na kremowym tle karty; hex (nie indeks) sprawia, że zmiana kolejności swatchy nie przemalowuje istniejących szablonów |
| 4 | Treść w nowym polu `text` (wieloliniowe); `label` = nazwa robocza tylko w kreatorze | długi akapit nie rozpycha kafelków w kreatorze; `label` NIE renderuje się na karcie |
| 5 | Tekst wyłącznie szablonowy, brak nadpisania per-postać | zero zapisu w `Character.Stats`, zero migracji; edycja w kreatorze dociera do wszystkich postaci w grze po synchronizacji szablonu (patrz niżej) |
| 6 | Styl trzymany w płaskich polach `FieldDef`, nie w zagnieżdżonym `LabelConfig` | trzy skalary z jasnymi domyślnymi; zgodne z `abbr`/`advancesLabel`/`options` |

Odrzucone: nadpisywanie treści per-postać (do tego służy `text_long` z wartością
domyślną), pełny color picker (pozwala na niewidzialny tekst na jasnym tle),
przełącznik "pełna szerokość" (YAGNI).

## Model (backend)

`internal/models/SystemTemplate.go`, `FieldDef` — nowy typ `"label"` w komentarzu `Type`
oraz trzy pola:

```go
// Label-only fields (type == "label"). The label is pure sheet decoration: it stores no
// per-character value, so its Key never appears in Character.Stats. Label carries the
// GM-facing name shown in the creator; Text is what renders on the sheet.
Text      string `bson:"text,omitempty" json:"text,omitempty"`
TextColor string `bson:"textColor,omitempty" json:"textColor,omitempty"` // hex; empty = default sheet text color
TextSize  string `bson:"textSize,omitempty" json:"textSize,omitempty"`   // "small"|"normal"|"large"|"heading"; empty = "normal"
```

Poza modelem backend nie wymaga zmian:

- `TemplateService.Update` (`internal/service/TemplateService.go:99`) zapisuje `Sections`
  w całości, bez walidacji per-typ.
- `custom.SeedDefaults` (`internal/systems/custom/plugin.go:72`) obsługuje wyłącznie
  `attr`/`number`, więc etykieta nie zasieje niczego w statsach nowej postaci.
- `ComputeDerived`, rolki i `token_masking.go` operują na wartościach w `Stats`, których
  etykieta nie ma.

Pola muszą istnieć w structcie Go mimo schemaless Mongo: `SystemTemplate` jest dekodowany
do typowanego structa, więc klucze nieopisane w modelu wyparowałyby przy pierwszym
`Update` (odczyt je gubi, zapis nadpisuje dokument bez nich).

`Key` etykiety dalej jest generowany (`genId('label')`) i unikalny — React używa go jako
`key` przy renderze listy pól — ale nigdy nie trafia do bazy postaci.

### Propagacja zmian do istniejących gier

Gra trzyma **osadzoną kopię** szablonu (`models/Game.go:59`, `Game.CustomSystemTemplate`),
a nie referencję. Edycja etykiety w kreatorze nie zmienia więc kart w trwających grach,
dopóki MG nie kliknie synchronizacji szablonu w lobby
(`POST /games/:id/syncTemplate` → `GameService.SyncTemplate`). Po synchronizacji nowy
tekst pojawia się od razu u wszystkich postaci, bo etykieta nie ma wartości per-postać —
render czyta wyłącznie szablon.

To zachowanie odróżnia etykietę od `text_long` z wartością domyślną: tam synchronizacja
zaktualizuje szablon, ale wartości już utworzonych postaci zostaną stare, bo domyślne
wartości zasiewa się tylko przy tworzeniu postaci (`SeedDefaults`).

## Kreator (`components/creator/TemplateBuilder.jsx`)

1. `FIELD_TYPES` (~linia 90): `{ type: 'label', labelKey: 'creator.fieldType.label',
   icon: <LabelIcon fontSize="small" />, desc: 'creator.fieldType.labelDesc' }`.
2. `PALETTE_GROUPS` (~linia 105): dodanie `'label'` do grupy `paletteGroupText`
   (obok `text_short`, `text_long`).
3. `makeDefaultField` (~linia 110):
   `if (type === 'label') return { ...base, text: '', textColor: '', textSize: 'normal' };`
   Baza daje już `showToPlayer: true` i `rollable: false`.
4. `FieldPropertyPanel` — blok warunkowy `field.type === 'label'` pod polem `label`:
   - `<TextField multiline rows={3}>` na `text`,
   - rząd 8 swatchy koloru (`<button>` z tłem, aktywny obrysowany), zapis hex,
   - `<Select>` rozmiaru: mała / normalna / duża / nagłówek.
   Dodatkowo istniejący TextField `label` dostaje warunkowy `helperText`
   (`creator.fieldLabelHintLabel`) informujący, że to nazwa tylko dla kreatora.
5. Kafelek na kanwie (~linia 840) dla typu `label` pokazuje `field.label || field.text`
   (skrócone) — inaczej pole bez nazwy roboczej byłoby pustym prostokątem.

Nic nie trzeba ukrywać: `abbr`, `showOnShortCard`, `min`/`max`/`default`, `rollable`,
`assignAttrToSkill` są już bramkowane po `field.type` i etykieta nie wchodzi na żadną
z tych list.

Podgląd na żywo działa bez dodatkowego kodu — kanwa renderuje
`<CustomSheetBody sections={sections} />` (~linia 1013), więc render z sekcji poniżej
obsługuje jednocześnie kreator i kartę.

`LABEL_COLORS` (stała w `TemplateBuilder.jsx`):

`#3a2f1f` ciemny brąz · `#7a5c42` brąz · `#c9975b` złoty · `#8b2c2c` czerwony ·
`#3f6b3f` zielony · `#2f4a6b` granat · `#5c3a6b` fiolet · `#4a4a4a` grafit

## Render karty (`systems/custom/CustomSheetBody.jsx`)

Nowy `case` w switchu po `field.type` (obok `text_long`, ~linia 565):

```jsx
case 'label':
  return (
    <div key={field.key} className="custom-sheet__field custom-sheet__field--label">
      <div
        className={`custom-sheet__label-text custom-sheet__label-text--${field.textSize || 'normal'}`}
        style={field.textColor ? { color: field.textColor } : undefined}
      >
        {field.text}
      </div>
    </div>
  );
```

- Brak `<label>` — nie ma kontrolki, do której miałby się odnosić.
- Rozmiar przez klasę CSS (skończony zbiór wartości), kolor przez inline `style`
  (wartość ciągła — inaczej trzeba by generować 8 reguł CSS w synchronie z paletą w JS).
- `field.text` renderowany jako plain text, nigdy `dangerouslySetInnerHTML`: treść MG
  trafia na kartę widzianą przez wszystkich graczy, więc HTML byłby XSS-em w sesji
  multiplayer.

`CharacterDetails.jsx` (panel postaci na siatce) nie wymaga zmian — filtruje pola po
jawnych typach (`attr` rollable, `progress`), więc etykieta jest wykluczona sama.

## CSS (`src/style.css`, przy `.custom-sheet__field-label`, ~linia 7707)

```css
.custom-sheet__field--label { justify-content: center; }

.custom-sheet__label-text {
    font-family: 'Crimson Text', serif;
    color: #3a2f1f;            /* domyślny, gdy textColor pusty */
    white-space: pre-wrap;     /* zachowuje \n i podwójne spacje */
    word-break: break-word;    /* długie słowo nie rozpycha kolumny gridu */
}
.custom-sheet__label-text--small   { font-size: 0.8rem; }
.custom-sheet__label-text--normal  { font-size: 0.95rem; }
.custom-sheet__label-text--large   { font-size: 1.2rem; }
.custom-sheet__label-text--heading {
    font-size: 1.45rem;
    font-family: 'Cinzel', serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
```

`word-break` jest istotny: etykieta w gridzie 3-kolumnowym dostaje ~1/3 szerokości,
a `.custom-sheet__field` to flex column — bez tego jedno długie słowo rozepchnęłoby
kolumnę i przesunęło sąsiednie pola.

## Widoczność dla gracza

Etykieta zapisuje `showToPlayer` tak jak każde inne pole i na tym kończy się zakres
FEATURE-156.

Known gap (osobny feature, poza zakresem): `showToPlayer` jest dziś w całym projekcie
wyłącznie zapisywane — nie filtruje go `CustomSheetBody`, nie filtruje `CharacterSheet`,
nie maskuje backend; wartości wszystkich pól trafiają do każdego gracza w odpowiedzi API.
Zaimplementowanie filtra tylko dla etykiet dałoby przełącznik działający przy jednym typie
pola i martwy przy dziesięciu innych. Zrobione poprawnie jest to zadanie backendowe
(wzorzec: `internal/service/token_masking.go` — serwer wycina niewidoczne dane przed
wysłaniem), bo ukrycie pola w JSX nie chroni przed podglądem odpowiedzi API.

## i18n

Nowe klucze w `locales/en/translation.json` i `locales/pl/translation.json`
(klucze angielskie, zgodnie z CLAUDE.md):

| Klucz | EN | PL |
|---|---|---|
| `creator.fieldType.label` | Label | Etykieta |
| `creator.fieldType.labelDesc` | Static text shown on the sheet | Statyczny tekst na karcie |
| `creator.labelText` | Text | Tekst |
| `creator.labelTextHint` | Shown on every character from this template | Widoczny na każdej postaci z tego szablonu |
| `creator.labelColor` | Text color | Kolor tekstu |
| `creator.labelSize` | Font size | Wielkość czcionki |
| `creator.labelSizeSmall` | Small | Mała |
| `creator.labelSizeNormal` | Normal | Normalna |
| `creator.labelSizeLarge` | Large | Duża |
| `creator.labelSizeHeading` | Heading | Nagłówek |
| `creator.fieldLabelHintLabel` | Creator-only name, not shown on the sheet | Nazwa tylko dla kreatora, nie pokazuje się na karcie |

Swatche kolorów nie mają podpisów — kolor jest widoczny bezpośrednio.

## Testy

Cała logika feature'a to render stringa z klasą i kolorem, więc testy jednostkowe
ograniczają się do niezmienników danych (wzorzec repo: testy przy czystych funkcjach —
`src/utils/*.test.js`, `internal/**/roller_test.go`; komponenty renderujące testów nie mają).

1. **Go, `internal/models`** — round-trip BSON `FieldDef` z `type: "label"`:
   marshal → unmarshal → `Text`, `TextColor`, `TextSize` przeżywają. Chroni przed cichą
   utratą pól przy `Update`.
2. **Go, `SeedDefaults`** — szablon z polem `label` → statsy nowej postaci nie zawierają
   klucza etykiety. Broni niezmiennika "etykieta nie ma wartości per-postać".

Weryfikacja ręczna (checklist):

- etykieta przeciągnięta z palety ląduje w gridzie jako zwykła komórka,
- zmiana koloru i rozmiaru widoczna natychmiast w podglądzie kreatora,
- zapis szablonu → przeładowanie strony → ustawienia przetrwały,
- otwarcie karty istniejącej postaci z tego szablonu → etykieta jest, statsy nietknięte,
- zmiana tekstu etykiety w kreatorze przy trwającej grze → karty pokazują starą treść
  do czasu synchronizacji szablonu z lobby, po niej nową,
- długie słowo bez spacji w gridzie 3-kolumnowym nie rozpycha layoutu,
- `\n` w tekście łamie linię na karcie.

Test end-to-end (`test/`) świadomie pominięty — koszt setupu przewyższa ryzyko przy
zmianie tej wielkości.

## Pliki do zmiany

| Plik | Zmiana |
|---|---|
| `internal/models/SystemTemplate.go` | 3 pola + komentarz typu w `FieldDef` |
| `components/creator/TemplateBuilder.jsx` | typ w palecie, `makeDefaultField`, panel właściwości, `LABEL_COLORS`, kafelek kanwy |
| `systems/custom/CustomSheetBody.jsx` | `case 'label'` w switchu |
| `src/style.css` | `.custom-sheet__label-text` + 4 modyfikatory rozmiaru |
| `locales/en/translation.json`, `locales/pl/translation.json` | 11 kluczy |
| `internal/models/*_test.go` (nowy), `internal/systems/custom/*_test.go` | 2 testy |
