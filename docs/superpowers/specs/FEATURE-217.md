# FEATURE-217 — Pięć flag wyświetlania dla tabeli i drzewa umiejętności

**Status:** zaprojektowane 2026-09-28 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`FieldDef`)
- `warhammer-battle-helper-backend/internal/systems/custom/character.go` (`Stats`)
- `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` (`resolveRollConfig`)
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`skill_table`, `skill_tree`)
- `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx` (handlery stanu)
- `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (panel właściwości)
- `warhammer-battle-helper-front/src/style.css`, `locales/{en,pl}/translation.json`

**Powiązane:** FEATURE-208 (kolumna skilla w tabeli broni — czyta te same klucze),
FEATURE-211 (zagnieżdżone sekcje — `flattenFields`/`walkFields` jako ścieżka obchodu),
FEATURE-212 (szerokość karty — powód, dla którego kreator montuje prawdziwy `CustomSheetBody`),
FEATURE-214 (WYSIWYG kreatora — zasada, którą ta zmiana rozszerza na gwiazdkę i dodawanie skilli)

## Kontekst

MG konfiguruje pole `skill_table` w kreatorze szablonu. Dziś ma tam dwie flagi
(`assignAttrToSkill`, `rollable`) i listę umiejętności. Brakuje sterowania tym, **jak** tabela
wygląda na karcie gracza — a każdy system gry chce czegoś innego:

- gwiazdka „do ulubionych” (czyli: do skróconej karty postaci) jest dziś pokazywana **zawsze**,
  także tam, gdzie skrócona karta nie ma sensu,
- Zew Cthulhu zaznacza umiejętności użyte na sesji, żeby rozwinąć je między sesjami — w systemie
  custom nie ma na to niczego,
- przy szerokiej karcie (FEATURE-212) długa jednokolumnowa lista marnuje pół ekranu,
- niektóre systemy drukują umiejętności alfabetycznie, inne w kolejności tematycznej,
- drzewo pozwala graczowi dopisać własną umiejętność, tabela nie.

## Zakres

Pięć przełączników w panelu właściwości pola. Cztery działają w `skill_table` **i** `skill_tree`,
piąty (2 kolumny) tylko w tabeli — drzewo ma wcięcia zależne od głębokości, więc dzielenie go na
pół kolumnami rozerwałoby hierarchię.

| Przełącznik | skill_table | skill_tree |
|---|---|---|
| Gwiazdka ulubionych | tak | tak |
| Zaznaczanie do rozwoju | tak | tak |
| Layout 2-kolumnowy | tak | **nie** |
| Sortowanie alfabetyczne | tak | tak (per poziom) |
| Gracz może dodawać umiejętności | tak (nowe) | już jest |

## Model danych

### `models.FieldDef` — cztery nowe flagi

| Pole bson | Typ | Dla | Brak pola znaczy |
|---|---|---|---|
| `hideFavorites` | `bool, omitempty` | skill_table, skill_tree | gwiazdka **widoczna** |
| `showDevelopment` | `bool, omitempty` | skill_table, skill_tree | kolumna ukryta |
| `sortAlphabetically` | `bool, omitempty` | skill_table, skill_tree | kolejność z szablonu |
| `twoColumns` | `bool, omitempty` | skill_table | jedna kolumna |

Punkt „gracz dodaje umiejętności” **nie dostaje nowego pola** — `PlayerCanAddSkills` już istnieje
(`SystemTemplate.go:231`) i dziś czyta je wyłącznie `skill_tree`. Rozszerzamy warunek w kreatorze
i w renderze na `skill_table`.

#### Dlaczego `hideFavorites` jest odwrócone

Gwiazdka ma zostać widoczna w istniejących szablonach bez migracji danych. Pole `showFavorites`
z `omitempty` tego nie da: `false` serializuje się jako brak pola, a brak pola musiałby znaczyć
„pokaż” — czyli wyłączenie gwiazdki byłoby nieutrwalalne. Alternatywa `*bool` wymusza odpakowanie
wskaźnika w każdym odczycie po obu stronach.

Cena: jedna flaga w modelu ma inną polaryzację niż cztery pozostałe. **Wymaga komentarza w kodzie
przy deklaracji pola** — inaczej ktoś „naprawi” nazwę i wyłączy gwiazdkę wszystkim.

Checkbox w kreatorze nazywa się „pokaż gwiazdkę” i jest zaznaczony przy `!field.hideFavorites`.

### `custom.Stats` — jedno nowe pole

```go
DevelopmentSkills []string `bson:"developmentSkills,omitempty" json:"developmentSkills,omitempty"`
```

Klucze identyczne jak w `Skills`: `${field.key}.${opt.id}` dla tabeli, dot-path dla drzewa.
Lustro `coc7e/character.go:118`.

Pole **musi** wejść do struktury, nawet jeśli żaden kod w Go go nie czyta: `ComputeDerived`
unmarshaluje stats do `Stats` i marshaluje z powrotem, więc klucz nieobecny w strukturze wyleciałby
przy pierwszym zapisie postaci. Dokładnie dlatego `FavoriteSkills` też tam siedzi.

Znacznik rozwoju jest per-postać (a więc per-gracz), nie per-szablon — to stan sesji, nie
konfiguracja.

## Backend — jedna realna dziura

Umiejętności dodane przez gracza do **tabeli** lądują w istniejącym `stats.customSkillNodes` pod
kluczem `${field.key}.${genId('skill')}` — ta sama przestrzeń kluczy, z której korzysta drzewo,
tylko płaska. Dzięki temu działa bez zmian:

- `resolveSkillLabel` (`roller.go:598`) ma fallback do `CustomSkillNodes` niezależny od typu pola,
- `collectSkillOptions` (`CustomSheetBody.jsx:53`) wrzuca wszystkie custom nodes do selektu broni,
  więc FEATURE-208 obejmuje je za darmo.

**Dziura:** `resolveRollConfig` (`plugin.go:220`) w gałęzi `skill_table` ustala `linkedAttr`
wyłącznie przez dopasowanie `opt.ID` w `field.Skills`. Umiejętność dodana przez gracza nie ma tam
wpisu, więc jej `CustomSkillNodes[skillKey].LinkedAttr` jest ignorowany i rzut bierze atrybut
z poziomu pola. Gałąź `skill_tree` (`plugin.go:209-219`) ten fallback ma.

Naprawa: w gałęzi `skill_table`, gdy `AssignAttrToSkill` i żadne `opt.ID` nie pasuje, sięgnij do
`stats.CustomSkillNodes[skillKey].LinkedAttr`.

Nic poza tym: nowe flagi to booly bez wariantów niepoprawnych, a `developmentSkills` przechodzi
przelotowo jak `favoriteSkills`.

## Front — układ wiersza

### Jedna siatka zamiast dwóch trybów

Dziś `.custom-sheet__skill-row--advances` ma zaszyte `grid-template-columns: 1fr 56px 56px 48px
24px 28px` (`style.css:8211`), a wariant bez advances to flex z inputem `width: 72px`. Pięć flag
wysadza obie ścieżki: kolumna rozwoju z przodu, gwiazdka warunkowa, akcje edytuj/usuń tylko na
wierszach gracza — a nagłówek musi trafiać w te same kolumny co wiersze (komentarz `style.css:8207`
mówi o tym wprost).

Rozwiązanie: helper liczy **jeden** template, używany przez nagłówek i wszystkie wiersze pola,
wstrzykiwany inline:

```
[showDev && '20px', '1fr', hasAdv ? '56px 56px 48px' : '72px',
 showStar && '24px', field.rollable && '28px', playerCanAdd && '52px']
```

Kolumna akcji (52px) rezerwuje się dla **wszystkich** wierszy, gdy `playerCanAddSkills` jest
włączone — inaczej wiersz gracza byłby szerszy od szablonowego i siatka by pływała. Wariant
`--advances` w CSS znika, zostaje jedna reguła na wiersz.

Efekt uboczny: wiersz bez advances przestaje być flexem i staje się siatką z kolumną `72px`.
Wygląd zostaje ten sam (input ma dziś dokładnie `width: 72px`), ale wyrównanie przestaje zależeć
od `gap` i `flex: 1`.

### Nagłówek i podpowiedzi

Warunek renderu nagłówka rośnie z `hasAdvances` do `hasAdvances || showDevelopment`. Komórka
rozwoju nosi `TrendingUpIcon` (ta sama ikona co `coc7e/sections/SkillsSection.jsx:77`). Gdy
`hasAdvances` jest wyłączone, nagłówek to sama ikona nad pierwszą kolumną — reszta komórek pusta.

W wierszu siedzi natywny `<input type="checkbox">`, nie przycisk-ikona: ikona jest opisem kolumny,
nie afordansem zaznaczania.

Drzewo nagłówka nie ma, więc tam checkbox dostaje portal tooltip przez **istniejący**
`usePortalTooltip` (`CustomSheetBody.jsx:280`) — jedna instancja na całą kartę, zero nowej
infrastruktury tooltipowej.

### Kolejność wierszy

```
rows = [...templateSkills, ...customNodesUnder(field.key)]
if (sortAlphabetically) rows.sort(byLabel)        // localeCompare
rows = [...rows.filter(niepusty), ...rows.filter(świeży)]   // świeży wiersz zawsze na dole
```

Umiejętności gracza są **wplatane alfabetycznie** między szablonowe (jedna lista do przeczytania
wzrokiem), ale wiersz dopiero dodany — jeszcze bez nazwy — trzyma się na końcu, żeby nie skakał
pod palcami podczas pisania. Po zatwierdzeniu wskakuje na swoje miejsce. Wzorzec `isNew`
z `coc7e/sections/SkillsSection.jsx:39-45`.

W **drzewie** sortowanie jest per poziom: rodzeństwo sortuje się między sobą, hierarchia zostaje.
Wymaga zmiany strukturalnej w rekurencji: dziś `renderTreeNode` renderuje najpierw
`templateChildren.map(...)`, a potem osobnym wywołaniem `renderCustomNodes(...)` — dwie listy pod
rząd. Alfabetyczne wplecenie wymaga zbudowania **jednej posortowanej tablicy rodzeństwa** na
poziom, z oznaczeniem, który element jest szablonowy, a który gracza. To jedyna ingerencja
w rekurencję drzewa.

### Layout 2-kolumnowy

Podział pół na pół, kolumnowo: `slice(0, ceil(n/2))` do lewego bloku, resztę do prawego. Dwa
niezależne bloki obok siebie (flex, `gap`, `min-width: 0` na każdym), każdy z własnym nagłówkiem
kolumn. Wzorzec `.coc-skills-two-col` (`style.css:3873`) i `coc7e/sections/SkillsSection.jsx:200`.

Przycisk dodawania umiejętności jest **pod całością**, nie w kolumnie.

Odrzucone: `column-count: 2` (wiersz jest siatką — przeglądarka złamie go w środku, a wspólny
nagłówek kolumn nie ma jak się powtórzyć) oraz podział naprzemienny wiersz-po-wierszu (przy
sortowaniu alfabetycznym czyta się zygzakiem).

### Dodawanie wiersza w tabeli — świadomie inaczej niż w drzewie

Drzewo: najpierw formularz (`renderAddForm`), po ✓ powstaje węzeł.
Tabela: jak w Zewie Cthulhu — klik `+ dodaj umiejętność` **od razu** tworzy węzeł z pustą nazwą
(istniejące `onAddCustomSkill` zasiewa przy okazji `skills[key]`, `CharacterSheet.jsx:160`), wiersz
startuje w trybie edycji z nazwą jako inputem, a ✓ (`CheckIcon`) tylko wychodzi z edycji.

Rozbieżność jest zamierzona: użytkownik chce zachowania z CoC („doda się kolejny wiersz z pustymi
wartościami”), a formularz drzewa nie ma jak wpisać się w siatkę kolumn tabeli.

Po zatwierdzeniu wiersz gracza wygląda jak szablonowy, ale ma dodatkowo `EditIcon` (powrót do
edycji nazwy) i `DeleteIcon` — tak samo jak węzły gracza w drzewie i jak w CoC.

Klucz generuje istniejące `confirmAdd` (`${parentPath}.${genId('skill')}`) z `parentPath ===
field.key`. Nowego stanu potrzebny jest tylko `Set` świeżych kluczy (do trzymania ich na dole);
`editingPath` wystarcza jako pojedyncze pole „edytowany wiersz”, bo naraz edytuje się jeden.

Pułapka: węzeł z pustą etykietą jest zapisywany przez autosave przed nadaniem nazwy, więc rzut na
taki wiersz pokaże w logu goły klucz (`resolveSkillLabel` fallback). CoC ma dokładnie to samo
zachowanie — nie obchodzimy go.

## Kreator

Nowa grupa `propsGroupDisplay` („Wyświetlanie”) w panelu właściwości pola, z czterema
przełącznikami: gwiazdka, rozwój, sortowanie, 2 kolumny. `playerCanAddSkills` zostaje w grupie
„Zawartość” (jest tam dziś dla drzewa), warunek rozszerzony na oba typy pól.

Przy gwiazdce podpis wyjaśniający: ulubione umiejętności trafiają na **skróconą kartę postaci**.

### Prop `showRollMarkers` → `showAffordances`

Ten sam prop steruje teraz znacznikiem rzutu, gwiazdką, checkboxem rozwoju i przyciskiem
dodawania. Bez żywych handlerów renderują się jako `disabled`. Miejsca do zmiany:
`CustomSheetBody.jsx` (deklaracja + komentarz + użycie), `TemplateBuilder.jsx:1879`,
`CustomSheetBody.chromeSeam.test.jsx`.

Zasada, którą to utrwala i którą dopisujemy do `CLAUDE.md`: **kreator pokazuje dokładnie to, co
gracz zobaczy w grze.** Dlatego `TemplateBuilder` montuje prawdziwy `CustomSheetBody` w prawdziwym
wrapperze `.custom-sheet`, a nie własny podgląd — osobny podgląd z własnym chrome ukrywał błąd
szerokości treści z FEATURE-212. Kontrolka, której kreator nie pokazuje, to kontrolka, o której
szerokość wiersza kłamie.

### i18n

Nowe klucze w `en` i `pl`: `creator.propsGroupDisplay`, `creator.skillShowFavorites` (+ podpis),
`creator.skillShowDevelopment`, `creator.skillSortAlphabetically`, `creator.skillTwoColumns`,
`customSheet.development`, `customSheet.addSkill`, `customSheet.editSkill`,
`customSheet.removeSkill`, `customSheet.saveSkill`.

Przy okazji: `skill_tree` ma dziś zahardkodowane polskie stringi — `placeholder="Nazwa
umiejętności…"`, `title="Dodaj podrzędną umiejętność"`, `title="Edytuj nazwę"`, `title="Usuń"`,
`<option>— atrybut —</option>`, `+ dodaj`. Łamią regułę i18n z `CLAUDE.md`, a tabela będzie
potrzebowała dokładnie tych samych napisów. Przenosimy je do `t()` w obu językach — to nie scope
creep, to te same linie, które i tak dotykamy.

## Poza zakresem

Skrócona karta (`custom/CharacterDetails.jsx`) czyta `stats.favoriteSkills` i nie wie nic o nowych
flagach. Po wyłączeniu gwiazdki w szablonie stare wpisy **zostają** na karcie, dopóki gracz ich nie
odznaczy — nowych nie da się dodać. Świadomie: czyszczenie `favoriteSkills` przy przestawieniu
przełącznika w kreatorze oznaczałoby kasowanie danych graczy jako efekt uboczny edycji szablonu.

Layout 2-kolumnowy dla drzewa — hierarchia z wcięciami nie znosi podziału na pół.

## Testy

Uruchamianie frontu: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Znany baseline fail: `App.test.js` (axios ESM) — nie jest regresją.

| Plik | Co sprawdza |
|---|---|
| `CustomSheetBody.skillTable.flags.test.jsx` (nowy) | gwiazdka jest bez flagi i znika przy `hideFavorites`; `showDevelopment` daje checkbox jako pierwszą kontrolkę wiersza i ikonę w nagłówku (także bez `hasAdvances`); `sortAlphabetically` ustala kolejność nazw; `twoColumns` daje dwa bloki z podziałem `ceil(n/2)`; `playerCanAddSkills` daje przycisk, a klik — wiersz w trybie edycji z inputem nazwy |
| `CustomSheetBody.skillTree.test.jsx` (istnieje) | sortowanie per poziom z wplecionymi umiejętnościami gracza; gating gwiazdki; checkbox rozwoju |
| `CustomSheetBody.chromeSeam.test.jsx` (istnieje) | `showAffordances` bez handlerów → gwiazdka, checkbox i przycisk dodawania jako `disabled` |
| `TemplateBuilder.skillFlags.test.jsx` (nowy) | przełączniki panelu zapisują flagi do pola (wzorzec `TemplateBuilder.weaponColumns.test.jsx`) |
| `plugin_test.go` | rzut na umiejętność dodaną przez gracza w `skill_table` z `assignAttrToSkill` bierze `linkedAttr` z `CustomSkillNodes`, nie z pola |

i18n w testach renderujących: `import '../../i18n';` (side-effect, bez providera).
