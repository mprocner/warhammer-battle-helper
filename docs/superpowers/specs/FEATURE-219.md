# FEATURE-219 — Skórka tabeli umiejętności w karcie custom

**Status:** zaprojektowane 2026-09-29 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'skill_table'` wyprowadzony, `starAffordance`, `weapons_table`)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillTable.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillTableHeader.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillTableRow.jsx` (nowy)
- `warhammer-battle-helper-front/src/style.css` (sekcja `custom-sheet`)
- `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json`
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Powiązane:** FEATURE-217 (flagi wyświetlania tabeli i drzewa — ta zmiana zmienia wygląd wierszy,
które tamta nauczyła się ukrywać i układać w dwie kolumny), FEATURE-218 (baza z atrybutu — jej
„wytłoczona płytka" dla wartości pochodnej zostaje tu przedefiniowana), FEATURE-212 (kreator
montuje prawdziwe ciało karty, więc każda zmiana wyglądu tabeli jest jednocześnie zmianą podglądu MG).

## Kontekst

Karta custom ma trzy rodzaje list: tabelę umiejętności (`skill_table`), drzewo (`skill_tree`)
i tabelę broni (`weapons_table`). Tabela umiejętności renderuje się dziś jako luźny stos wierszy:
`gap: 3px` między wierszami, brak jakichkolwiek linii, każdy input z własną zaokrągloną ramką,
nagłówek w postaci trzech drobnych etykiet — i to tylko wtedy, gdy pole ma rozwinięcia albo
checkbox rozwoju.

Karta CoC (`coc-skills-table2`) ma w tym samym miejscu prawdziwą tabelę: gradientowy pasek
nagłówkowy, kratkę, zwarte wiersze, pogrubioną wartość. Warhammer ma to samo (`.skills-table`,
od której CoC się wzorowała). Custom jest jedyną kartą, która wypada z tego rytmu.

Użytkownik planuje docelowo przenieść **wszystkie** karty (CoC i Warhammer włącznie) na silnik
custom. To przesądza dwie rzeczy w tym zadaniu: karta custom musi wyglądać co najmniej tak dobrze
jak te, które ma zastąpić, i nie może pożyczać nazw klas od systemu, który zniknie.

## Zakres

Wygląd pola `skill_table` w karcie custom, plus wyprowadzenie go z `CustomSheetBody.jsx`
do własnych komponentów.

Poza zakresem, do osobnych zadań: `skill_tree`, `weapons_table`, karty CoC i Warhammer.
Jedyny wyjątek od tej granicy to przemianowanie klasy gwiazdki (niżej) — wynika z tego, że
gwiazdkę renderuje jedna funkcja wspólna dla wszystkich trzech pól.

## Decyzje z brainstormingu

### Wariant wizualny: pasek nagłówka + linie poziome + zebra („C"), Suma wyróżniona typografią („C2")

Rozważane na makietach cztery skórki (stan obecny, kopia CoC 1:1, wariant z samymi liniami
poziomymi, kratka z wytłoczonymi polami) i trzy sposoby wyeksponowania sumy (wytłoczona płytka,
sama typografia, złota pigułka).

Wybrane:

- **pasek nagłówkowy** — gradient `#c9975b → #a67c52`, tekst `#fff9f0`, zaokrąglony u góry;
- **brak pionowych kresek** — wiersze rozdziela linia dolna `rgba(201,151,91,0.5)` i naprzemienne
  tło `rgba(255,249,240,0.55)`;
- **wiersz 26px** — luźniej niż 23px CoC, bliżej reszty karty custom;
- **Suma** `1.28rem` bold `#5a3f28`; **Baza** i **Rozwinięcia** schodzą na drugi plan:
  `0.85rem`, waga 400, `#6b5a45`.

**Dlaczego nie kopia CoC 1:1:** pełna kratka + zebra + wytłoczona Suma to trzy niezależne warstwy
tła na jednym wierszu. Przy trzydziestu umiejętnościach zaczynają ze sobą walczyć, a zebra jest już
zajęta rozdzielaniem wierszy. Hierarchię robi tu rozmiar i waga, nie kolejne tło.

**Dlaczego Suma, a nie Baza:** to Suma jest wartością, na którą gracz rzuca. Dziś obie kolumny
wyglądają identycznie (`--base` ma nawet mocniejszą, 2px ramkę), więc karta podkreśla liczbę
mniej istotną.

### Nagłówek renderuje się zawsze

Warunek `(hasAdv || showDev)` w `CustomSheetBody.jsx:826` znika.

Powód pierwszy, wizualny: w tej skórce pasek nagłówka jest **ramą tabeli** — daje jej górną
krawędź. Pole bez rozwinięć i bez rozwoju zostałoby gołymi wierszami z zebrą, bez czapki.

Powód drugi, twardszy: **zebra liczy parzystość rodzeństwa**. Wiersze i nagłówek są dziećmi tego
samego kontenera (`.custom-sheet__skill-table` albo `.custom-sheet__skill-col`), a nagłówek jest
pierwszym z nich. Nagłówek znikający warunkowo przesuwałby parzystość i te same wiersze raz byłyby
jasne, raz ciemne — zależnie od flagi pola. To powiązanie między JSX a arkuszem jest nieoczywiste
i **musi** zostać opisane komentarzem w CSS przy regule `:nth-child`.

Przycisk „+ Dodaj umiejętność" stoi poza kontenerem tabeli (`CustomSheetBody.jsx:967`), więc
w tę parzystość nie wchodzi. To nie jest przypadek do naprawienia — to warunek, który trzeba
zachować.

Zawartość nagłówka:

```
[↗]  Nazwa           Bazowa  Rozwinięcia  Suma   [ ]  [ ]     ← hasAdvances
[↗]  Nazwa                  Wartość              [ ]  [ ]     ← bez rozwinięć
```

Kolumna nazwy dostaje etykietę „Nazwa", mimo że tytuł pola stoi linijkę wyżej
w `.custom-sheet__section-title`. Decyzja użytkownika: nagłówek ma opisywać wszystkie kolumny,
a nie tylko liczbowe.

Ikona `↗` (`TrendingUpIcon`) i jej tooltip „rozwój" zostają bez zmian, tylko w kolorze `#fff9f0`.

### Nazwy klas: koniec z `coc-*` w karcie custom

`starAffordance` (`CustomSheetBody.jsx:257`, `:267`) renderuje `coc-star-btn`, którego CSS leży
w sekcji CoC (`style.css:4199`). Ta sama funkcja obsługuje `skill_table` **i** `skill_tree`,
a `weapons_table` wypisuje tę klasę jeszcze dwa razy wprost (`:1022`, `:1054`).

`coc-star-btn` → `custom-sheet__star-btn` (wraz z `--active` i `--static`) we wszystkich czterech
miejscach. Blok CSS kopiowany 1:1 — **zero zmian pikseli** w drzewie i broniach. `.coc-star-btn`
zostaje nietknięty, bo karta CoC nadal go używa.

**Dlaczego całość, a nie tylko tabela:** gwiazdka to jedna funkcja. „Tylko w tabeli" znaczyłoby
rozszczepić ją na dwie wersje albo przeciągnąć nazwę klasy propsem — czyli dorobić rozgałęzienie
po to, by usunąć je przy następnym zadaniu. Gdy karta CoC przejdzie na silnik custom, blok
`.coc-star-btn` znika jednym cięciem i nic w karcie custom tego nie zauważy.

## Architektura: tabela wyprowadzona z `CustomSheetBody`

`CustomSheetBody.jsx` ma 1257 linii, z czego `case 'skill_table'` to ~130 wklejonych w `switch`.
Po dołożeniu nagłówka urośnie.

```
systems/custom/fields/
  SkillTable.jsx        — kontener: nagłówek, wiersze, dodawanie/rename/kasowanie, przycisk „+”
  SkillTableHeader.jsx  — czysta prezentacja: gridTemplate + flagi → pasek etykiet
  SkillTableRow.jsx     — jeden wiersz, z trybem edycji nazwy włącznie
```

`skillLayout.js` **bez zmian**. `skillGridTemplate`, `buildSkillRows`, `splitHalf`
i `resolveSkillValues` zostają tam, gdzie są — to nadal czysta arytmetyka układu, testowalna bez DOM.

### Podział stanu

| Stan | Gdzie ląduje | Dlaczego |
|---|---|---|
| `newSkillRows` | do `SkillTable` | czyta go wyłącznie tabela |
| `renameSortLabels` | do `SkillTable` (nadal `useRef`) | j.w. |
| `editingPath` / `setEditingPath` | **props** z `CustomSheetBody` | `skill_tree` siedzi na tej samej zmiennej |

`editingPath` jest współdzielone z drzewem (`renderCustomNode`: `editingPath === key`). Wyprowadzenie
go do tabeli oznaczałoby dwa niezależne stany edycji i możliwość, by wiersz tabeli i węzeł drzewa
były edytowane jednocześnie — dziś to niemożliwe i ma takie zostać.

### Propsy `SkillTable`

```
field, skills, attrs, attrByKey, customSkillNodes,
developmentSkills, onToggleDevelopment,
onChange, readOnly,
onAddCustomSkill, onRemoveCustomSkill, onUpdateCustomSkill,
editingPath, setEditingPath,
showTooltip, hideTooltip,
showStar, showRoll, renderStar, renderRoll
```

`showStar` i `showRoll` to **boole liczone przez rodzica**, osobno od render-propsów `renderStar`
i `renderRoll`. To nie jest nadmiarowość: flagi rezerwują tor w siatce, a zasada „rezerwuj, gdy
`onRoll` **albo** `showAffordances`" należy do polityki afordancji rodzica. Gdyby tabela wnioskowała
o rezerwacji z tego, czy render-prop coś zwrócił, kreator (bez żywych handlerów, ale z
`showAffordances`) dostałby inną szerokość wiersza niż gra — dokładnie błąd FEATURE-212.

`renderStar(key)` i `renderRoll(onClick)` zamiast czwórki `onRoll` / `showAffordances` /
`favoriteSkills` / `onToggleFavorite`: tabela nie ma powodu wiedzieć, co to ulubiona umiejętność.

### DOM poza nagłówkiem zostaje bajt w bajt

Ekstrakcja nie ma prawa przesunąć ani jednego opakowania. Pilnują tego dwie rzeczy: snapshot
w `CustomSheetBody.domShape.test.jsx` oraz `renderChrome` — seam, przez który kreator dokłada
uchwyty przeciągania do tego samego drzewa elementów. Jedyna zamierzona zmiana kształtu to
bezwarunkowy nagłówek.

## CSS

Wszystko w sekcji `custom-sheet` w `style.css`.

| Selektor | Zmiana |
|---|---|
| `.custom-sheet__skill-table` | `gap: 3px` → `0` (linie mają stykać się z wierszami) |
| `.custom-sheet__skill-table-header` | gradient `#c9975b → #a67c52`, `border-radius: 4px 4px 0 0`, `padding: 5px 3px` |
| `.custom-sheet__skill-col-label` | kolor `#fff9f0`, rozmiar 10px; font **zostaje Cinzel** |
| `.custom-sheet__skill-row` | `min-height: 26px`, `border-bottom: 1px solid rgba(201,151,91,0.5)`, `:nth-child(even)` → `rgba(255,249,240,0.55)`, `border-radius` usunięty |
| `.custom-sheet__skill-row .custom-sheet__skill-val-input` | tło przezroczyste, bez ramki, wypełnia komórkę, `1.28rem` bold `#5a3f28` |
| `.custom-sheet__skill-row .custom-sheet__skill-val-input--base` | stara reguła (ramka 2px, bold) **usunięta**; drugi plan: `0.85rem`, waga 400, `#6b5a45` |
| `.custom-sheet__skill-row .custom-sheet__skill-val-input--adv` | drugi plan: `0.85rem`, waga 400, `#6b5a45` |
| `.custom-sheet__skill-val-total` | z wytłoczonej płytki na `1.28rem` bold `#5a3f28` |
| `.custom-sheet__skill-row .custom-sheet__skill-val-input--derived` | płytka z cieniem → wypełnienie komórki `rgba(122,92,66,0.10)` przy drugoplanowym kroju |
| `.custom-sheet__star-btn` (+ `--active`, `--static`) | nowy blok, kopia `.coc-star-btn` 1:1 |

Font nagłówka: makieta pokazała Georgię, bo strona towarzysząca nie ładuje fontów karty.
W aplikacji ma być **Cinzel**, tak jak dotychczasowe etykiety kolumn i reszta nagłówków karty.

### `--derived` traci płytkę

FEATURE-218 dała bazie liczonej z atrybutu „wytłoczoną płytkę" (tło + cień wewnętrzny),
bo tym językiem karta mówi „policzone, nie dotykaj". W bezramkowej tabeli płytka jest teraz
najmocniejszym elementem wiersza i przebija Sumę — czyli odwraca hierarchię, którą to zadanie
ustawia. Zostaje samo wypełnienie komórki, bez cienia i zaokrąglenia: sygnał „zablokowane"
przetrwa, krzyk nie.

### Pole bez rozwinięć: pojedyncza wartość dostaje wyróżnienie Sumy

Gdy `hasAdvances` jest wyłączone, kolumny Suma nie ma — jest jedna wartość i to **ona** jest tą
istotną. Dlatego wyróżnienie (`1.28rem`, bold, `#5a3f28`) siedzi na regule **bez modyfikatora**,
a drugi plan dokładają `--base` i `--adv`, czyli klasy, które wiersz dopina **wyłącznie**, gdy pole
ma rozwinięcia (`CustomSheetBody.jsx`: `hasAdv ? ' custom-sheet__skill-val-input--base' : ''`).
Jedna reguła obsługuje więc oba układy i nie ma jak się z nimi rozjechać.

### Specyficzność: wszystko pod `.custom-sheet__skill-row`, modyfikatory po regule bazowej

Każda reguła wartości w tabeli — z modyfikatorem i bez — jest potomkiem `.custom-sheet__skill-row`.
Dwa powody, oba twarde:

1. **Izolacja drzewa.** `skill_tree` renderuje ten sam input z **gołą** klasą
   `.custom-sheet__skill-val-input`, ale w wierszu `.custom-sheet__skill-tree-node-row`.
   Bez zakotwiczenia w klasie wiersza tabeli wyróżnienie pojedynczej wartości wyciekłoby do drzewa,
   którego to zadanie nie dotyczy.
2. **Deterministyczna kaskada.** Gdyby regułę bazową napisać jako potomka (0,2,0), a modyfikatory
   zostawić na gołych klasach (0,1,0), potomek wygrywałby z nimi niezależnie od kolejności w pliku
   i unieważniał je po cichu — pułapka opisana w CLAUDE.md. Przy jednakowej specyficzności decyduje
   kolejność, więc modyfikatory muszą stać w pliku **za** regułą bez modyfikatora.

## i18n

Nowe klucze w `customSheet` (dziś są tam tylko `base`, `advances`, `total`):

| Klucz | en | pl |
|---|---|---|
| `customSheet.name` | `Name` | `Nazwa` |
| `customSheet.value` | `Value` | `Wartość` |

`customSheet.value` opisuje pojedynczą kolumnę wartości w polu bez rozwinięć.

## Testy

**Aktualizowane** w `CustomSheetBody.skillTable.test.jsx`:
- asercja „brak nagłówka, gdy pole nie ma rozwinięć ani rozwoju" (linia 89) odwraca się w „nagłówek
  jest zawsze",
- pięć asercji `coc-star-btn` → `custom-sheet__star-btn`.

**Aktualizowane** w `CustomSheetBody.domShape.test.jsx`: asercja `.coc-star-btn` oraz regeneracja
snapshotu (zmiana kształtu zamierzona — bezwarunkowy nagłówek).

**Nowe:**
- nagłówek renderuje się dla pola bez żadnej flagi,
- nagłówek pokazuje „Nazwa" i „Wartość", gdy pole nie ma rozwinięć,
- nagłówek pokazuje „Nazwa", „Bazowa", „Rozwinięcia", „Suma", gdy ma,
- `gridTemplateColumns` nagłówka i wiersza nadal identyczne **po ekstrakcji** (istniejąca asercja
  z linii 83–84 zostaje i to ona pilnuje, że podział na trzy komponenty nie rozjechał układu).

Testy zostają w `CustomSheetBody.*.test.jsx` i renderują przez `CustomSheetBody`, a nie przez
`SkillTable` wprost. To celowe: gwarancją jest zachowanie całej karty, a nie komponentu w izolacji —
a to przez `CustomSheetBody` tabela dostaje propsy, które kreator i gra podają inaczej.

## Weryfikacja ręczna

jsdom nie liczy layoutu, więc **żaden test nie sprawdzi wyglądu**. FEATURE-217 i FEATURE-218
zostały wypuszczone bez ani jednego kliknięcia w przeglądarce i ich CSS jest do dziś niezweryfikowany.
To zadanie jest w całości wizualne, więc krok ręczny jest jego częścią, nie dodatkiem:

1. tabela z rozwinięciami i bez,
2. jedno- i dwukolumnowa (`twoColumns`),
3. z checkboxem rozwoju i bez,
4. z bazą z atrybutu (FEATURE-218) — sprawdzić, że zablokowana baza nadal czyta się jako zablokowana,
5. wiersz dodany przez gracza: tryb edycji nazwy, zapis, kasowanie,
6. podgląd w `TemplateBuilder` — musi wyglądać identycznie jak w grze (FEATURE-212),
7. długa nazwa umiejętności — wielokropek, bez rozpychania kolumn.

## Poza zakresem

- `skill_tree` — ta sama skórka, ale wymaga przebudowy wiersza z flexa na siatkę, bo dziś kolumny
  drzewa nie są wyrównane (zestaw przycisków różni się per węzeł, wcięcie idzie na cały wiersz).
  Osobne zadanie.
- `weapons_table` — osobne zadanie.
- Migracja kart CoC i Warhammer na silnik custom.
- Nowa flaga MG sterująca nagłówkiem — nagłówek jest zawsze, bez przełącznika.
