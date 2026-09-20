# FEATURE-211 — Zagnieżdżone sekcje w kreatorze kart postaci

**Status:** do zaplanowania
**Dotyczy:** `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx`,
`src/systems/custom/CustomSheetBody.jsx`, `src/utils/templateSections.js` (nowy),
`src/style.css`, `src/locales/{en,pl}/translation.json`,
`warhammer-battle-helper-backend/internal/models/SystemTemplate.go`,
`internal/systems/custom/{plugin.go,roller.go}`
**Powiązane:** FEATURE-156 (etykiety), model kluczy surogatowych pól

## Kontekst

Szablon karty postaci jest dziś płaski: `Sections[] → Fields[]`. Sekcja ma tytuł, liczbę kolumn
(1–6) i listę pól. Nie da się zgrupować pól wewnątrz sekcji — GM chcący „Broń" i „Pancerz" obok
siebie w ramach jednej sekcji „Ekwipunek" musi zrobić dwie sekcje najwyższego poziomu i stracić
wspólny nagłówek.

Feature dodaje sekcje zagnieżdżone: sekcja może zawierać inne sekcje, każda konfigurowalna
dokładnie jak dziś (tytuł, kolumny, kolejność, usuwanie).

## Ustalenia projektowe

| Decyzja | Wybór |
|---|---|
| Głębokość zagnieżdżenia | Nieograniczona |
| Układ podsekcji | Jedna komórka gridu rodzica; jej własne kolumny dzielą tę komórkę (3 kol. × 2 kol. = 1/6 karty) |
| Wąskie kolumny | Bez ostrzeżeń i bez podłogi szerokości — decyzja GM, widoczna w podglądzie |
| Model danych | `FieldDef` typu `"section"` opakowujący `*SectionDef` |
| Drag & drop | Pełny, na dowolny poziom, od razu |
| Widoczność podsekcji dla gracza | Brak — a martwa flaga `showToPlayer` zostaje usunięta |
| Styl | Dwa style: korzeń i zagnieżdżona (ten sam na każdej głębokości ≥ 1) |

## Model danych

`SectionDef` bez zmian. `FieldDef` dostaje jedno pole:

```go
// Section holds the nested section when Type == "section". A section field carries no
// per-character value — its Key never appears in Character.Stats, exactly like "label".
// The recursion runs SectionDef -> FieldDef -> *SectionDef, so a pointer (not a value)
// keeps the struct finite.
Section *SectionDef `bson:"section,omitempty" json:"section,omitempty"`
```

Front:

```js
makeDefaultField('section')
// → { key, type: 'section', label: '', section: { id: key, title: '', columns: 3, fields: [] } }
```

**Niezmiennik `section.id === field.key`.** Ustawiany przy tworzeniu i utrzymywany przy
powielaniu. Powód: DnD i zaznaczenie adresują węzeł jednym identyfikatorem, a `CustomSheetBody`
używa `section.id` jako React key dla sekcji korzenia — dwie wartości zawsze równe znaczą, że
nigdzie nie trzeba rozstrzygać „którym z nich jest ten węzeł".

Wrapperowy `label` zostaje pusty i nieedytowalny. Tytuł mieszka wyłącznie w `section.title`.

**Dlaczego wrapper, a nie sekcja jako płaski typ pola.** `FieldDef` ma już `Columns []WeaponColumn`
(kolumny tabeli broni), więc sekcja-jako-pole nie mogłaby wziąć `columns` i potrzebowałaby
`sectionColumns` + `label` jako tytułu. Powstałoby równoległe słownictwo: korzeń `title`/`columns`,
zagnieżdżona `label`/`sectionColumns`, a `SectionPropertyPanel` (`TemplateBuilder.jsx:855`)
i renderer (`CustomSheetBody.jsx:944`) dostałyby gałąź „jeśli zagnieżdżona, czytaj inne nazwy".
Wrapper kosztuje jeden poziom w JSON i daje jeden kształt sekcji na każdej głębokości.

**Migracja: żadna.** Zmiana jest addytywna — istniejące szablony nie mają `section` i czytają się
bez zmian. Usuwany `showToPlayer` zostaje w starych dokumentach bson i jest ignorowany przy
unmarshalu; zgodnie z zasadą „brak backward compat" nic nie czyścimy.

## Backend

Trzy przejścia po `Sections[].Fields[]` wymagają rekurencji — każde tym samym zabiegiem: ciało
pętli do funkcji biorącej `[]FieldDef`, wołanej dodatkowo na `field.Section.Fields`.

- `plugin.go:83` — defaulty świeżo tworzonej postaci
- `plugin.go:167` (`resolveRollConfig`) — szukanie `RollConfig` dla klucza rzutu
- `roller.go:579` (`resolveSkillLabel`) — etykieta umiejętności do logu rzutu
- `weapon.go:127` (`findWeaponField`) — odnalezienie pola `weapons_table` przy rzucie bronią.
  **Wyjątek**: ta funkcja zwraca `*models.FieldDef` wskazujący W SZABLON, bo wołający czyta
  przez niego presety GM. Wspólny helper zwracający kopie tu nie zadziała — potrzebna własna
  rekurencja zwracająca adres elementu tablicy.

Skutki braku rekurencji, każdy inny: broń w podsekcji nie da się rzucić w ogóle
(`weapon.go:127` nie znajdzie pola), pole w podsekcji nie dostanie wartości startowej
(`plugin.go:83`), rzut z podsekcji nie znajdzie swojego `RollConfig` (`plugin.go:167`),
a log rzutu pokaże surowy klucz zamiast nazwy umiejętności (`roller.go:579` ma fallback
na `skillKey`, więc nie wysypie się — po prostu wypisze `attr_1726...`).

`"section"` nie łapie się na żaden `case` w `switch field.Type` w `plugin.go:83`, więc sam wrapper
nie trafia do `Stats` — tak jak `label`.

## Front — operacje na drzewie

Zaznaczenie `{sectionIdx, fieldIdx}` zastępuje **ścieżka**: `number[] | null`. `[2]` = trzecia
sekcja korzenia, `[2,0]` = jej pierwsze dziecko (pole albo podsekcja — ta sama tablica `fields`),
`[2,0,1]` = drugie dziecko tej podsekcji.

Operacje wychodzą z komponentu do nowego `src/utils/templateSections.js` (tak jak wcześniej
wyszedł `templateFields.js`) — czysty kod bez DOM, testowalny zwykłym jestem:

```js
nodeAt(sections, path)          // → { node, parentFields, index }
childrenOf(node)                // SectionDef → .fields | field 'section' → .section.fields
updateAtPath(sections, path, patch)
insertAtPath(sections, parentPath, index, node)
removeAtPath(sections, path)
moveNode(sections, fromPath, toParentPath, toIndex)
duplicateNodeAtPath(sections, path, { mint })
indexNodes(sections)            // → Map<nodeId, path>
walkFields(sections, fn)        // rekurencyjny obchód wszystkich pól
```

`TemplateBuilder` zostaje klejem React: stan, autosave, render.

**Powielanie podsekcji — pułapka.** Dzisiejszy `duplicateFieldInSections` świadomie wymienia tylko
klucz najwyższego poziomu, bo zagnieżdżone id są adresowane jako `<fieldKey>.<optionId>`. Dla
podsekcji to nie wystarcza: jej potomkowie to pełnoprawne pola z własnymi kluczami w `Stats`.
`duplicateNodeAtPath` musi przebić klucze **całego poddrzewa** i utrzymać `section.id === key`,
inaczej duplikat od razu koliduje w `findDuplicateKeys`, a dwa pola dzielą jedną wartość u postaci.

**Rekurencja w dziewięciu miejscach frontu**, wszystkie przez `walkFields` (poza rendererem):
`findDuplicateKeys` (`TemplateBuilder.jsx`), `collectSkillOptions` (`CustomSheetBody.jsx`),
`numberFields` (`TemplateBuilder.jsx`), picker pól w `TokenDisplayBuilder`, `renderField`
w rendererze, trzy przejścia w `CharacterDetails.jsx` (`shortCardSections`, `favoriteSkillsData`,
`favoriteWeaponsData`) oraz licznik pól w `TemplateManagerDialog.jsx`.

**Pierwotny spis mówił o pięciu i był ZŁY** — brakowało `CharacterDetails.jsx` i lobby. Wyszło to
dopiero w finalnej recenzji całej gałęzi, bo recenzje poszczególnych tasków widzą tylko swój diff.
Objawy pominięcia są ciche i każdy inny: pole z `showOnShortCard` w podsekcji nie renderuje się na
skróconej karcie (mimo że kreator maluje na nim odznakę ▤), a ulubiona umiejętność albo broń
z podsekcji nie znajduje etykiety, wpada w gałąź sieroty i **znika z listy ulubionych**.
Wniosek na przyszłość: spis miejsc do urekurencyjnienia wyprowadzaj gerpem po `\.fields`,
nie z pamięci.

## Front — paleta i panele

Nowa grupa `creator.paletteGroupLayout` na górze `PALETTE_GROUPS`, w niej jeden typ `section`
z ikoną `ViewQuiltIcon` (`@mui/icons-material`). Wpada do istniejącej pętli renderującej, więc
lista po „dodaj pole" wewnątrz sekcji dostaje ją bez osobnej zmiany — jedno źródło (`FIELD_TYPES`)
karmi oba miejsca.

**Reguła celu** (ta sama dla pól i dla sekcji, dziedziczona z dzisiejszego zachowania palety):

- zaznaczona sekcja → nowy węzeł jako jej dziecko
- zaznaczone pole → nowy węzeł jako rodzeństwo obok niego, w jego rodzicu
- nic nie zaznaczone → ostatnia sekcja korzenia; gdy nie ma żadnej, powstaje nowa korzenia

Podpowiedź celu `creator__palette-hint` (`TemplateBuilder.jsx:1613`) działa dalej, pokazując
tytuł sekcji docelowej.

`SectionPropertyPanel` dostaje `path` i `siblingCount` zamiast `sectionIdx`/`totalSections`,
ale czyta dalej `section.title` i `section.columns` — bez gałęzi „a jeśli zagnieżdżona".
Usunięcie podsekcji kasuje całe poddrzewo, bez potwierdzenia — tak jak dzisiejsze usuwanie sekcji.

## Front — drag & drop

Dziś DnD ma dwie klasy obiektów (sekcje pionowo, pola wewnątrz i między sekcjami), a
`collisionDetection` odsiewa id sekcji od kluczy pól. Po zmianie wszystko jest **węzłem**: korzeń
to kontener o ścieżce `[]`, którego dziećmi są sekcje najwyższego poziomu. Każda sekcja na każdej
głębokości to własny `SortableContext` nad id swoich dzieci, plus sentinel `__drop__<id>`.

- **Sentinel ma KAŻDA sekcja**, nie tylko pusta, i renderuje się po ostatnim dziecku. Najechanie
  na węzeł znaczy „wstaw przed nim”, a id samej sekcji znaczy „obok mnie”, więc bez sentinela
  ostatni slot listy jest nieosiągalny, a do niepustej podsekcji nie da się nic wrzucić do środka.
  `dropTargetOf` zwraca dla sentinela indeks `-1`, który `insertAtPath` czyta jako „dopisz na
  koniec” — jedna gałąź obsługuje sekcję pustą i pełną.
- **`toIndex` w `moveNode` to indeks PO usunięciu** przeciąganego węzła — konwencja dnd-kit
  (`arrayMove` stosuje indeks `over` już po usunięciu), a także ta sama, której używają strzałki
  (`moveWithinParent`). Wcześniejsza wersja odejmowała 1 przy ruchu w dół — to cicho zamieniało
  „przesuń o jeden w dół” w brak akcji i czyniło ostatni slot nieosiągalnym.
- `indexNodes` daje `Map<id, path>` na render; `handleDragOver` / `handleDragEnd` tłumaczą
  `active.id` i `over.id` na ścieżki i wołają `moveNode`. Gdy `handleDragOver` już przeniósł węzeł
  między kontenerami, ustawia flagę w ref; `handleDragEnd` widząc ją **nie woła `moveNode`
  drugi raz** — drzewo jest już poprawne, a ponowne złożenie przesunęłoby węzeł o slot.
- **Strażnik cyklu**: odrzuć upuszczenie, gdy ścieżka celu ma ścieżkę źródła jako prefiks —
  inaczej sekcja ląduje w samej sobie i poddrzewo znika.
- **Sekcja zmienia kształt przy przekraczaniu korzenia.** Lista korzenia trzyma `SectionDef`,
  każda inna lista trzyma `FieldDef`. Przeciągnięcie sekcji korzenia do innej sekcji musi ją
  opakować w wrapper (`{ key: id, type: 'section', section: <SectionDef> }`), a wyciągnięcie
  podsekcji na korzeń — rozpakować z powrotem. Konwersja jest bezstratna dzięki niezmiennikowi
  `section.id === key`. Pole liściowe **nie może** trafić na korzeń — takie upuszczenie
  odrzucamy, bo pole nie jest sekcją.
- `collisionDetection`: `pointerWithin` z fallbackiem `closestCenter`. Zagnieżdżone kontenery
  nachodzą geometrycznie na rodziców, a `closestCenter` na mieszance „dziecko + kontener" trafia
  w środek pudełka rodzica i upuszcza obok zamiast wewnątrz.
- Mutowanie `sectionsRef` w `handleDragOver` zostaje — dławi kolejne wywołania, zanim React
  przerenderuje.

**Ryzyko odnotowane świadomie:** DnD to najbardziej splątana część `TemplateBuilder`, a
`pointerWithin` przy zagnieżdżonych sortable jest miejscem, w którym należy się spodziewać
poprawek po pierwszych testach ręcznych. Logika ruchu siedzi w `templateSections.js` właśnie po to,
żeby dało się rozdzielić „zły model" od „zła detekcja kolizji".

## Renderer i style

`CustomSheetBody.jsx:942` — `renderSection(section, depth)` woła się rekurencyjnie, a `renderField`
dostaje case `'section'` → `renderSection(field.section, depth + 1)`. Podsekcja jest zwykłym
dzieckiem gridu, więc „jedna komórka rodzica" wychodzi z samego CSS: bez `grid-column`, bez `span`.

**`min-width: 0` na zagnieżdżonym pudełku jest obowiązkowe.** Kontener rodzica ma
`minmax(0, 1fr)`, ale to chroni ścieżki gridu, nie element w komórce — element gridu ma domyślnie
`min-width: auto` i najszersze dziecko (długa nazwa umiejętności, tabela broni) rozepchnie komórkę
ponad przydzielony ułamek. Bez tego przy 1/6 karta wychodzi poza swoją szerokość.

Dwa nowe bloki CSS, zero klas zależnych od poziomu (głębokość jest nieograniczona, więc styl
indeksowany poziomem wymusiłby arbitralny limit):

```
.custom-sheet__section--nested          /* ramka #c4a882 1px, tło rgba(255,249,240,.5), mniejszy padding, min-width: 0 */
.custom-sheet__section-heading--nested  /* #7a5c42, mniejszy stopień */
```

Te same dwa modyfikatory dla `.creator__section` w kanwie kreatora. Kolory zgodne ze schematem
kart postaci z CLAUDE.md. Głębokość czyta się z wcięcia, nie z koloru.

`SectionCanvas` staje się rekurencyjny: w `creator__fields-grid` dziecko typu `section` renderuje
kolejny `SectionCanvas` zamiast `FieldCard`. Każdy poziom niesie własny `SortableContext` i własny
pasek akcji (przenieś / edytuj / usuń) — istniejący kod, operujący teraz na ścieżce.

Sekcja jednokolumnowa to `flex-direction: column`, nie grid (`style.css:7713`) — podsekcja jako
dziecko flexa zachowuje się tam poprawnie (pełna szerokość), bez osobnego przypadku.

## Sprzątanie: martwa flaga `showToPlayer`

`showToPlayer` jest dziś autorowana w kreatorze i trzymana w modelu, ale **nigdzie nieczytana** —
żaden renderer jej nie sprawdza, backend niczego po niej nie maskuje
(`grep -rni "showtoplayer"` poza kreatorem i i18n: zero trafień). Gracz i tak widzi całą kartę.

Usuwane w tej samej zmianie:

- `<Switch>` w `PropertyPanel` (`TemplateBuilder.jsx:820`)
- `showToPlayer` w `makeDefaultField` (`TemplateBuilder.jsx:128`)
- `ShowToPlayer` w `FieldDef` (`SystemTemplate.go:215`) i jego użycie w `SystemTemplate_test.go:20`
- klucz `creator.showToPlayer` w `locales/en/` i `locales/pl/`

Klucz `token.showToPlayers` **zostaje** — to widoczność tokenów, osobny i działający mechanizm.

## Nowe klucze i18n

`creator.fieldType.section`, `creator.fieldType.sectionDesc`, `creator.paletteGroupLayout` —
en i pl równolegle.

## Testy

- **`src/utils/templateSections.test.js`** — główne pokrycie, czyste drzewo bez DOM:
  `nodeAt`, `insertAtPath`, `removeAtPath`, `moveNode`, strażnik cyklu (upuszczenie sekcji
  w swojego potomka nie zmienia drzewa), `duplicateNodeAtPath` przebijający klucze całego
  poddrzewa i trzymający `section.id === key`, `walkFields` po trzech poziomach.
- **`src/systems/custom/CustomSheetBody.nestedSections.test.jsx`** — render podsekcji: nagłówek,
  klasa `--nested`, klasa kolumn dziecka. Wzorzec z `CustomSheetBody.smoke.test.jsx`,
  i18n przez `import '../../i18n';`.
- **Go** — rekurencyjne defaulty w `plugin.go` (pole w podsekcji dostaje `Default`),
  `resolveRollConfig` znajdujący konfigurację rzutu dla klucza z podsekcji, oraz
  `resolveSkillLabel` zwracający etykietę zamiast surowego klucza. Trzy ścieżki, które bez
  rekurencji zawodzą cicho — żadna nie rzuca błędu.
- **Bez testów renderujących `TemplateBuilder`** — plik nie ma ich dziś, a DnD w jsdom nie działa
  (brak `window.PointerEvent`, `getBoundingClientRect` zwraca zera). Logika ruchu siedzi
  w `templateSections.js` właśnie po to, żeby dała się przetestować bez DnD.

Uruchamianie frontu: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Znany baseline fail `App.test.js` (axios ESM) nie jest regresją.
