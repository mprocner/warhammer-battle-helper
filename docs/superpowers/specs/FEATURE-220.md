# FEATURE-220 — Skórka drzewka umiejętności w karcie custom

**Status:** zaprojektowane 2026-10-01 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-front/src/systems/custom/skillLayout.js` (`flattenTree` — nowa funkcja)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillTree.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillTreeRow.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillFieldHeader.jsx` (przemianowany z `SkillTableHeader.jsx`)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillTable.jsx` (jeden import)
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'skill_tree'` i cała rekurencja wychodzą)
- `warhammer-battle-helper-front/src/style.css` (sekcja `custom-sheet`)
- `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js`, `CustomSheetBody.skillTree.test.jsx`, `CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Powiązane:** FEATURE-219 (skórka tabeli — ta zmiana dokłada drugą z trzech list karty custom
i reużywa jej nagłówek), FEATURE-217 (dwukolumnowy układ drzewa i flagi wyświetlania — ta zmiana
zachowuje `splitBranchesWeighted` i wszystkie flagi), FEATURE-212 (kreator montuje prawdziwe ciało
karty — każda zmiana wyglądu drzewa jest jednocześnie zmianą podglądu MG).

## Kontekst

Karta custom ma trzy listy: tabelę umiejętności (`skill_table`, oskórowana w FEATURE-219),
drzewo (`skill_tree`) i tabelę broni (`weapons_table`). Drzewo zostało świadomie poza zakresem
FEATURE-219, bo jego problem nie jest problemem CSS-a.

Dziś wiersz drzewa to flexbox z `paddingLeft` nałożonym na **cały wiersz**
(`CustomSheetBody.jsx:519` i `:425`), więc kolumna wartości ucieka w prawo z każdym poziomem
zagnieżdżenia. Do tego ogon przycisków różni się per węzeł: węzeł gracza ma ołówek i kosz,
węzeł z szablonu nie ma. Nic się z niczym nie wyrównuje, więc nie ma czego oskórować.

Drugie ograniczenie, strukturalne: drzewo renderuje się rekurencyjnie i każdy węzeł razem
z potomstwem siedzi we własnym `div.custom-sheet__skill-tree-group`. Przy takim zagnieżdżeniu
`:nth-child` nie ma do czego liczyć — każda gałąź numeruje od nowa — a pasek nagłówka nie ma
gdzie usiąść, bo nie istnieje jedna lista rodzeństwa, na której czele mógłby stanąć.

Sprawdzone przed podjęciem decyzji: `custom-sheet__skill-tree-group` **nie ma ani jednej reguły
CSS**, a `renderChrome` kreatora owija pola i sekcje, nie węzły drzewa (`CustomSheetBody.jsx:1054`,
`:1064`). Od tego opakowania nie zależy nic, więc spłaszczenie jest tanie.

## Zakres

Wygląd i struktura pola `skill_tree` w karcie custom, plus wyprowadzenie go z `CustomSheetBody.jsx`
do własnych komponentów.

Poza zakresem, do osobnego zadania: `weapons_table`. Bez zmian: model danych, klucze, rzuty,
flagi MG w kreatorze.

## Decyzje z brainstormingu

### Wariant wizualny: pasma głębokości tylko na węzłach z dziećmi (makieta „C2")

Rozważane na makietach: wariant z zebrą jak w tabeli, wariant z prowadnicami zamiast zebry,
a potem trzy sposoby malowania pasm — na każdym wierszu, tylko na węzłach z dziećmi, albo
wyłącznie na komórce nazwy.

Wybrane: **trzy odcienie po głębokości, ale tylko dla węzła, który ma dzieci**. Poziom czwarty
i głębsze dziedziczą odcień trzeciego — trzy poziomy to realny przypadek (`Broń biała →
Jednoręczna → Miecz`), czwarty już nie.

**Dlaczego nie pasmo na każdym wierszu:** liść dostałby wtedy tło tak samo jak kategoria, tylko
słabsze. Tło przestałoby odpowiadać na pytanie „czy to się rozwija" i odpowiadałoby wyłącznie na
„jak głęboko" — a to mówią już wcięcie i prowadnica. Sygnał, który i tak masz, wypchnąłby sygnał,
którego nie masz. Przy wyborze „tylko z dziećmi" tło pokrywa się z trójkącikiem i oba mówią to
samo, a wiersz, w który gracz naprawdę wpisuje liczbę, jest najspokojniejszy na ekranie.

**Dlaczego nie zebra:** zebra niesie rytm wierszy, a w drzewie najważniejsza jest struktura.
Dwa pasiaste sygnały na jednym wierszu (zebra + pasmo głębokości) zaczynają ze sobą walczyć.

### Trójkącik jedzie razem z wcięciem

Trójkącik przestaje być osobnym torem siatki przy lewej krawędzi i wchodzi **do komórki nazwy**,
za prowadnice:

```
[rozwój?] [ prowadnica×głębokość · trójkącik · nazwa ] [wartość] [★] [🎲] [+ ✎ ×]
```

Powód jest wprost z makiety: przy trójkącikach zrównanych do lewej krawędzi „Jednoręczna"
wygląda, jakby rozwijała się z tego samego miejsca co „Broń biała".

To wyklucza trzymanie go w siatce: tor siatki jest z definicji wspólny dla wszystkich wierszy,
a pozycja trójkącika ma teraz zależeć od głębokości konkretnego wiersza.

**Liść nadal rezerwuje miejsce po trójkąciku** (`visibility: hidden`, tak jak dziś). Bez tego
„Miecz" i „Jednoręczna" — oba na tej samej głębokości — miałyby nazwy przesunięte o 14px
względem siebie. Wcięcie ma znaczyć poziom, nie „czy akurat mam dzieci".

### Hover jest brązowy, nie złoty

Hover tabeli to `rgba(201, 151, 91, 0.14)`. W drzewie ta wartość leży **dokładnie między** pasmem
poziomu 0 (`0.22`) a poziomu 1 (`0.13`), więc najechanie na liść wyglądałoby jak zmiana poziomu.
Drzewo dostaje `rgba(122, 92, 66, 0.18)` — inny odcień, nie inna jasność.

To ta sama klasa błędu co kolizja w kaskadzie, tylko w percepcji: dwa różne sygnały nie mogą
mówić tym samym kolorem.

### Nagłówek: reużyty, nie zduplikowany

`SkillTableHeader` przy `hasAdvances: false` renderuje dokładnie `[rozwój?] Nazwa Wartość`, czyli
to, czego potrzebuje drzewo, a `gridTemplate` dostaje propsem — więc pasuje bez zmian w zachowaniu.
Nazwa zaczęłaby jednak kłamać, dlatego plik idzie na `SkillFieldHeader.jsx`.

Drzewo **nie miało dotąd nagłówka w ogóle**; dostaje go teraz, bo jest ramą listy tak samo jak
w tabeli. Inaczej niż w tabeli, nic tu nie zależy od tego, że stoi pierwszy: pasm nie liczy
`:nth-child`, więc niezmiennik parzystości z FEATURE-219 w drzewie nie obowiązuje.

## Architektura

### `flattenTree` — rekurencja zamieniona w dane

```js
// flattenTree turns the tree into the single list of rows the DOM actually shows, in order, with
// depth as a number. A collapsed branch simply does not contribute its descendants.
flattenTree(field, customSkillNodes, { expanded, sort, addingUnderPath })
  → [{ key, label, attr, depth, custom, hasChildren, isOpen, kind: 'node' | 'addForm' }]
```

Cała reguła „który wiersz jest teraz widoczny" przenosi się z JSX do danych. To nie jest
kosmetyka: jsdom nie liczy layoutu, więc **jedyne** decyzje tego pola, które da się przetestować,
to te podjęte na danych. `skillLayout.js` istnieje dokładnie po to i mówi o tym komentarzem
w pierwszej linijce.

Zachowania, które funkcja musi odtworzyć 1:1 z dzisiejszej rekurencji:
- `expanded[key] !== false` — gałąź jest domyślnie **rozwinięta**, stan trzyma tylko odstępstwa;
- obszar dzieci pokazuje się, gdy `(hasChildren || addingUnderPath === path) && (isOpen ||
  addingUnderPath === path)` — czyli dodawanie pod zwiniętym węzłem **rozwija go na czas
  dodawania**;
- sortowanie jest **per poziom** (`sortItems`), a nie globalne — rodzeństwo układa się
  alfabetycznie między sobą i wcięcie dalej znaczy to, co znaczyło;
- węzły z szablonu i węzły gracza idą w **jednej** liście rodzeństwa (`siblingItems`), więc
  sortowanie potrafi je przepleść.

Formularz dodawania jest wierszem listy (`kind: 'addForm'`), nie doczepką obok. Gdyby został poza
listą, zwijanie musiałoby znać jego miejsce osobno — czyli ta sama reguła w dwóch miejscach.

### Dwie kolumny: najpierw podział, potem spłaszczenie

`splitBranchesWeighted` zostaje bez zmian i nadal operuje na **gałęziach korzenia**, ważonych
przez `subtreeSize`. Dopiero każda kolumna osobno przechodzi przez `flattenTree`.

Odwrotna kolejność — spłaszczyć, potem przeciąć listę na pół — rozcinałaby gałąź w środku
i wcięcia w drugiej kolumnie zawisłyby bez rodzica.

Waga liczy **wszystkie** węzły gałęzi, także niewidoczne w zwiniętym stanie. To celowe
i tak działa dziś: ważenie samych widocznych wierszy przerzucałoby gałęzie między kolumnami przy
każdym zwinięciu.

### Siatka wiersza

```
[20px rozwój?] 1fr [72px wartość] [24px ★] [28px 🎲] [64px akcje]
```

Liczy ją `treeGridTemplate()` obok `skillGridTemplate()` w `skillLayout.js` — osobna funkcja,
nie parametr tamtej: drzewo nie ma kolumn rozwinięć ani nigdy mieć nie będzie (nie ma czego
rozwijać bez kolumny rozwinięć), a wspólna funkcja z flagą `isTree` musiałaby tę nieobecność
wyrażać przez wyłączenie, zamiast po prostu jej nie mieć.

Tor akcji jest szerszy niż 52px tabeli, bo drzewo mieści tam trzy przyciski (`+`, ołówek, kosz)
po 16px. 64px to wyliczenie, nie pomiar — punkt 10 weryfikacji ręcznej je sprawdza.

### Węzeł gracza traci kreskowaną krechę

Dziś węzeł dodany przez gracza ma `border-left: 2px dashed` na całym wierszu
(`.custom-sheet__skill-tree-node-row--custom`). Ta krecha znika: lewa krawędź wiersza należy
teraz do prowadnic głębokości, a dwie różne pionowe kreski o różnym znaczeniu w tym samym
miejscu to dokładnie ten sam błąd co hover w kolorze pasma.

Rozróżnienie zostaje tam, gdzie było czytelne i tak: **kursywa w nazwie** (`--custom`), plus
ołówek i kosz, których węzeł z szablonu nie ma.

### Komponenty

```
fields/SkillTree.jsx         — kontener: expanded, dodawanie/rename/kasowanie, dwie kolumny
fields/SkillTreeRow.jsx      — jeden wiersz o danej głębokości
fields/SkillFieldHeader.jsx  — wspólny nagłówek (był SkillTableHeader)
```

Podział stanu jak w FEATURE-219: `expanded`, `addingUnderPath`, `addingLabel`, `addingAttr`
wędrują do `SkillTree` (czyta je wyłącznie drzewo), a `editingPath` / `setEditingPath`
**zostają propsem** — tabela edytuje przez tę samą zmienną i dwie niezależne kopie pozwoliłyby
edytować wiersz tabeli i węzeł drzewa jednocześnie.

`editingLabel` i `editingAttr` idą do `SkillTree` razem z resztą: czyta je tylko drzewo (tabela
pisze nazwę przez `onUpdateCustomSkill` na każdym keystroke'u, bez bufora).

Flagi afordancji (`showStar`, `showRoll`, `showActions`) liczy **rodzic** i podaje jako boole,
dokładnie jak w tabeli — rezerwują tor siatki, a zasada „żywy handler **albo** `showAffordances`
kreatora" należy do polityki rodzica. Inaczej kreator dostaje inną szerokość wiersza niż gra
(FEATURE-212).

`CustomSheetBody.jsx` schodzi z 1072 linii do okolic 800 i zostaje tym, czym ma być: routerem
typów pól plus polityką afordancji.

## CSS

Wszystko w sekcji `custom-sheet` w `style.css`.

| Rzecz | Wartość |
|---|---|
| pasmo głębokości 0 / 1 / 2+ | `rgba(201,151,91,0.22 / 0.13 / 0.06)` |
| hover wiersza | `rgba(122,92,66,0.18)` |
| prowadnica | `border-left: 1px solid rgba(122,92,66,0.28)`, tor 16px, rozciągnięty na wysokość wiersza |
| linia pod wierszem | `1px solid rgba(201,151,91,0.28)` — słabsza niż `0.5` w tabeli |
| wiersz | `min-height: 26px`, `padding: 2px 4px` |
| nazwa kategorii | `font-weight: 700` |
| wartość | `1.28rem`, waga 700, `#5a3f28`, bezramkowa, tło przezroczyste |
| nagłówek | ten sam gradient `#c9975b → #a67c52` co w tabeli |

Klasa pasma (`--d0`, `--d1`, `--d2`) jest **wypisywana tylko dla węzła, który ma dzieci** —
liść nie dostaje żadnej. Reguła „tylko kategorie" mieszka więc w JSX, gdzie widać ją obok
`hasChildren`, a nie w selektorze złożonym z dwóch klas, gdzie trzeba by ją odtwarzać z pamięci.

Pasma są trzema klasami modyfikatora, a nie zmienną CSS liczoną z głębokości: głębokość 4+ ma dziedziczyć odcień trzeciego, więc i tak potrzebny jest zacisk, a
zacisk w JS jest widoczny i testowalny, w odróżnieniu od arytmetyki w `calc()`.

Reguły wartości muszą być zakotwiczone w klasie wiersza drzewa, tak jak tabela kotwiczy swoje
w `.custom-sheet__skill-row` — obie listy renderują `.custom-sheet__skill-val-input` i od
FEATURE-219 to zakotwiczenie jest jedyną rzeczą, która trzyma ich wyglądy osobno.

**Modyfikator stawiany ZA regułą bazową** przy równej specyficzności — pułapka z CLAUDE.md.

## i18n

Bez nowych kluczy. Nagłówek używa istniejących `customSheet.name` i `customSheet.value`
z FEATURE-219.

## Testy

**Nowe, bez DOM** (`skillLayout.test.js`): kolejność i głębokość wierszy; zwinięta gałąź nie oddaje
potomków; dodawanie pod zwiniętym węzłem wkłada wiersz formularza i odsłania ten węzeł;
sortowanie per poziom przeplata węzły gracza z szablonowymi; `splitBranchesWeighted` + `flattenTree`
nie rozcinają gałęzi; głębokość 4 dostaje ten sam indeks pasma co 3 (zacisk).

**Istniejące**: `CustomSheetBody.skillTree.test.jsx` zostaje i nadal renderuje przez
`CustomSheetBody` — to on pilnuje, że spłaszczenie nie zmieniło zachowania widocznego z zewnątrz.

**Snapshoty `domShape`**: zmienią się **celowo i istotnie** — tym razem drzewo naprawdę zmienia
kształt DOM. W FEATURE-219 nieruszony snapshot był dowodem poprawności ekstrakcji; tutaj takiego
dowodu nie ma i trzeba to powiedzieć wprost, zamiast udawać, że jest.

## Weryfikacja ręczna

jsdom nie wczytuje `style.css` i nie liczy layoutu, więc **żaden test nie sprawdzi wyglądu**.
FEATURE-219 pokazała, ile to kosztuje: użytkownik przy pierwszym spojrzeniu wyłapał rozjechane
rozmiary ikon, czego nie dało się ani przetestować, ani wyczytać z CSS-a.

1. drzewo trzypoziomowe — trzy odcienie pasm, czwarty poziom w odcieniu trzeciego;
2. liść na tym samym poziomie co kategoria — nazwy wyrównane, liść bez pasma;
3. zwijanie i rozwijanie na każdym poziomie;
4. dodanie węzła pod **zwiniętą** gałęzią — gałąź ma się odsłonić;
5. hover na liściu i na kategorii — nie może wyglądać jak zmiana poziomu;
6. dwie kolumny — gałąź nie rozcięta, prowadnice mają rodzica nad sobą;
7. sortowanie alfabetyczne włączone — rodzeństwo przeplecione, wcięcia nienaruszone;
8. długa nazwa na trzecim poziomie — wielokropek, kolumna wartości stoi;
9. kreator obok gry — te same szerokości wierszy;
10. tor akcji: `+`, ołówek i kosz mieszczą się bez zawijania.

## Poza zakresem

- `weapons_table` — ostatnia z trzech list.
- Migracja kart CoC i Warhammer na silnik custom.
- Zmiany w modelu danych, kluczach i rzutach.
