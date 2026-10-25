# PLAYRPG-261 — Opis i język szablonu systemu

## Cel

GM tworzący custom system może dodać do niego sformatowany opis i wskazać język, w którym szablon
jest napisany. Opis widać w lobby (picker systemu przy tworzeniu gry, „Moje szablony”). W oknie
tworzenia gry pojawia się filtr języka szablonów.

## Decyzje

| Temat | Decyzja |
|---|---|
| Miejsce pól | Top-level na `SystemTemplate` (obok `Name`), nie w `Settings` — to metadane szablonu, nie konfiguracja karty. |
| Format opisu | HTML z TipTap, ten sam zestaw co notatki (`RICH_TEXT_EXTENSIONS`), czyszczony `sanitize.RichHTML`. Bez obrazków. |
| Limit opisu | 20 000 bajtów po sanitizacji, inaczej 400. |
| Język — wartości | `""` = nieokreślony albo kod ISO 639-1 z listy. Inny kod → 400. |
| Lista języków | `pl, en, de, fr, es, it, pt, cs, sk, uk, ru, hu, ja, zh, ko`. |
| Istniejące szablony | Bez migracji. Brak pola w Mongo = zero value `""` = nieokreślony. |
| Wymuszanie języka | Miękkie: nowy szablon dostaje język interfejsu (`i18n.language`, jeśli jest na liście). Pusty język → podpowiedź w kreatorze, nie blokada. |
| Klon | Kopiuje opis i język. |
| Warianty (`BaseSystem` ≠ `""`) | Nie mają opisu ani języka. Kreator nie pokazuje karty, backend odrzuca niepuste wartości (400). |
| Systemy wbudowane | Bez języka (UI tłumaczone). Zawsze widoczne, niezależnie od filtra. |
| Filtr | Multi-select, pusty = wszystkie. Z wybranymi językami szablony nieokreślone odpadają. Zapamiętany w `localStorage`. |
| Wybór wykluczony filtrem | Czyszczony — „Utwórz” nie może stworzyć gry z systemu, którego nie widać. |
| Opis w lobby | Ikona ⓘ w wierszu pickera + karta wybranego systemu pod pickerem + ikona ⓘ w „Moich szablonach”. Wszędzie ten sam popup. |

## Backend

### Model (`internal/models/SystemTemplate.go`)

```go
// Description is the GM's rich-text blurb shown in the lobby; sanitized HTML.
Description string `bson:"description,omitempty" json:"description,omitempty"`
// Language is the ISO 639-1 code the template is written in; "" means unspecified.
Language string `bson:"language,omitempty" json:"language,omitempty"`
```

`CreateTemplateRequest` i `UpdateTemplateRequest` dostają `Description *string` i
`Language *string`. Zmiana obu pól to zmiana treści: przechodzi przez wersjonowany zapis
z PLAYRPG-279 (podbija `version`, ustawia `UpdatedBy`, konflikt → 409 i banner).

### Lista języków (`internal/models/template_languages.go`)

`SupportedTemplateLanguages []string` + `IsSupportedTemplateLanguage(code string) bool`
(`""` → true). Lista pinowana fixture'em JSON wspólnym z frontendem (wzorzec
`formula_cases.json`): test Go czyta fixture i porównuje z `SupportedTemplateLanguages`.

### Serwis

Przy Create i Update:
1. `Language` spoza listy → 400.
2. `Description` → `sanitize.RichHTML`, potem limit 20 000 bajtów → 400.
3. Szablon z `BaseSystem` i niepustym opisem/językiem → 400.

Clone kopiuje oba pola.

## Frontend

### Lista języków (`src/utils/templateLanguages.js`)

`TEMPLATE_LANGUAGES` (te same kody) + test czytający wspólny fixture. Nazwy przez klucze
`languages.<kod>` w `locales/en` i `locales/pl`, plus `languages.unspecified`.

### Kreator — zakładka Ogólne (`TemplateBuilder.jsx`)

Nowa karta `creator__settings-card--about` („Opis i język”) jako pierwsza karta po
`TemplateAccessCard`, tylko dla `!isVariant`:
- select języka z opcją „Nieokreślony”;
- `RichTextEditor` na opis;
- przy pustym języku podpowiedź: ustaw język, żeby gracze znaleźli szablon przez filtr.

Zapis idzie istniejącą ścieżką autozapisu kreatora (razem z `name`/`sections`/`settings`).

`TemplateManagerDialog` przy tworzeniu szablonu wysyła `language` = `i18n.language`, jeśli kod
jest na liście, inaczej nic.

### Tutorial

Nowa karta wymaga kroku w `src/components/tutorial/tours/creator*.js` i kluczy
`tutorial.creator*` w en/pl (pilnuje `creatorTour.coverage.test.jsx`).

### Popup opisu (`components/lobby/TemplateDescriptionDialog.jsx`)

Dialog tylko do odczytu: tytuł = nazwa szablonu, chip języka, opis renderowany jak notatka
(read-only). Używany w trzech miejscach poniżej.

### Picker systemu (`CreateGameDialog.jsx`)

- **Ikona ⓘ** (`InfoOutlined`) w `renderOption` szablonu z opisem. `onMouseDown`:
  `preventDefault` + `stopPropagation` (inaczej wiersz wybiera opcję); `onClick` otwiera popup.
  Otwarcie popupu zamyka listę — akceptowane.
- **Karta wybranego systemu** pod pickerem, tylko gdy wybrany szablon ma opis: nazwa, chip
  języka, opis przycięty do 3 linii (`line-clamp`), „Więcej” → popup.
- **Filtr języka** nad pickerem: multi-select „Język szablonu”, puste = „Wszystkie”, chipy
  wybranych. Stan w `localStorage` (każdy odczyt/zapis w try/catch; brak storage = pusty filtr).

### Logika filtra (`components/lobby/systemOptions.js`)

- `toOption` przenosi `language` i `description` do opcji.
- `filterByLanguages(options, langs)`: pusta lista → bez zmian; opcja grupy `systems` → zawsze
  przechodzi; szablon → przechodzi, gdy `langs` zawiera jego `language`.
- Dialog filtruje opcje przed przekazaniem do `Autocomplete` (filtr języka), a
  `filterSystemOptions` dalej obsługuje wyszukiwanie. Pusta grupa znika jak dziś.
- Gdy po zmianie filtra wybrana opcja nie jest już na liście → `setSelection` czyści wybór.

### Moje szablony (`TemplateManagerDialog.jsx`)

Ikona ⓘ przy nazwie szablonu z opisem; tooltip przez `usePortalTooltip`, klik → ten sam popup.

## Testy

**Go**
- język spoza listy → 400; `""` i kod z listy → OK;
- opis jest sanitizowany (np. `<script>` znika), za długi → 400;
- wariant z opisem/językiem → 400;
- klon kopiuje oba pola;
- lista języków zgodna z fixture'em.

**JS**
- `filterByLanguages`: pusty filtr, systemy wbudowane zawsze, nieokreślone odpadają, kilka języków;
- fixture listy języków;
- `CreateGameDialog`: filtr chowa szablony, filtr czyści wykluczony wybór, klik ⓘ otwiera popup
  i nie wybiera opcji, karta wybranego systemu tylko z opisem, filtr pamiętany po ponownym
  otwarciu;
- `TemplateManagerDialog`: ⓘ tylko przy szablonie z opisem;
- kreator: karta tylko dla nie-wariantu, zmiana języka/opisu trafia do zapisu;
- tutorial: `creatorTour.coverage.test.jsx`, `tourTranslations.test.js`.

## Poza zakresem

- Filtr języka gdzie indziej niż w oknie tworzenia gry.
- Wyszukiwanie po treści opisu.
- Wiele języków na jeden szablon.
