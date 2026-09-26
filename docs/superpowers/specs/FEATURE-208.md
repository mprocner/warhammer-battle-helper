# FEATURE-208 — Powiązana umiejętność w tabeli broni

**Status:** do zaplanowania
**Dotyczy:** `warhammer-battle-helper-front/src/`
— `components/creator/TemplateBuilder.jsx` (`WeaponColumnsEditor`, `RollConfigEditor`, panel właściwości),
`systems/custom/CustomSheetBody.jsx`, `systems/custom/CharacterDetails.jsx`,
`style.css`, `locales/{en,pl}/translation.json`
**Backend:** **bez zmian.**
**Powiązane:** FEATURE-214 (kreator WYSIWYG — ten sam panel właściwości)

## Kontekst

Mechanizm powiązania broni z umiejętnością **już istnieje**:

- `WeaponColumn.OptionsFromSkills` (`SystemTemplate.go:270`) — kolumna `select`, której wartościami
  są umiejętności postaci; przełącznik w kreatorze (`TemplateBuilder.jsx:356`).
- `resolveWeaponSkill` (`weapon.go:70`) — wybiera **pierwszą** kolumnę spełniającą
  `Type == "select" && OptionsFromSkills` i czyta z niej klucz umiejętności wiersza.
- Ten klucz jest progiem sukcesu: przy pustym `RollConfig.Threshold` próg = `skillValue`
  wybranej umiejętności, a gdy umiejętności brak — wartość powiązanego atrybutu
  (`roller.go:54-64`).

Czyli „warunek sukcesu na powiązaną umiejętność" działa, tylko **niejawnie**. Realne dziury:

1. **Dwie kolumny umiejętności = cicha wygrana pierwszej** wg kolejności w `Columns`.
2. **GM nie widzi, skąd bierze się próg.** Panel rzutu pokazuje wyłącznie „poniżej/powyżej progu".
3. **Brak kolumny umiejętności psuje rzut po cichu.** Próg spada na atrybut, a bez atrybutu
   `hasThreshold` = fałsz i `evalOutcome` zwraca gołą liczbę. Blok `umiej.` w formule dokłada
   wtedy `skillValue(stats, "")`, czyli **0** — bez śladu w logu.

## Zakres

Feature **nie zmienia mechaniki rzutu ani modelu danych.** Wyłącznie inwariant UI („co najwyżej
jedna kolumna umiejętności") i widoczność powiązania po stronie GM-a, plus blokada rzutu z
niewypełnionej broni.

Świadomie **poza zakresem**: wybór kolumny w konfiguracji rzutu (niepotrzebny, skoro kolumna jest
jedna), formuły progu typu `umiejętność × 5` (`evalThreshold` zostaje `strconv.Atoi`), oznaczanie
powiązania na karcie gracza (gracze znają zasady gry albo GM je wyjaśni).

## Ustalenia projektowe

| Decyzja | Wybór |
|---|---|
| Liczba kolumn umiejętności | Co najwyżej jedna, wymuszana w UI |
| Sposób wymuszenia | Wzajemne wykluczanie (radio) + komunikat o przeniesieniu |
| Walidacja w backendzie | Brak — `resolveWeaponSkill` już toleruje stare dane z dwiema |
| Źródło progu | Bez zmian: wartość wybranej umiejętności |
| Widoczność | Tylko GM (kreator) |
| Pusta umiejętność w wierszu | Blokada rzutu, przez rozszerzenie istniejącego predykatu |

## 1. Inwariant: jedna kolumna umiejętności

Rolę „kolumny umiejętności" ma kolumna spełniająca **oba** warunki: `type === 'select'`
**i** `optionsFromSkills` — ten sam predykat co backend (`weapon.go:73`).

To nie jest pedanteria. Dziś przełączenie typu kolumny z `select` na `text` **zostawia**
`optionsFromSkills: true` w danych. Gdyby front liczył rolę po samej fladze, martwa kolumna
blokowałaby żywą, a backend i tak rolowałby z tej drugiej — front i backend pokazywałyby
sprzeczne wersje tego samego szablonu.

W `WeaponColumnsEditor` (`TemplateBuilder.jsx:316`):

- włączenie przełącznika w kolumnie B gasi go we wszystkich pozostałych — jedna operacja
  na tablicy kolumn, nie dwa kolejne `onChange`;
- zmiana typu kolumny z `select` na inny gasi flagę przy okazji (czyszczenie martwych danych
  od razu, nie zostawianie ich „na wszelki wypadek");
- po przeniesieniu roli: jednorazowy komunikat u góry edytora
  *„Kolumna umiejętności przeniesiona z «Broń boczna»"*, kasowany przy następnej edycji.
  Bez niego wzajemne wykluczanie gasi konfigurację innej kolumny całkiem bezgłośnie.

Backend zostaje bez walidacji: `resolveWeaponSkill` bierze pierwszą pasującą kolumnę, więc
szablon zapisany wcześniej z dwiema dalej rzuca zamiast się wywalić.

## 2. Widoczność u GM-a

`RollConfigEditor` dostaje nowy prop `skillColumnLabel` (`string | null`), liczony przez
wywołującego (`TemplateBuilder.jsx:885`) — dzięki temu edytor konfiguracji rzutu nadal nie wie
nic o broniach i zostaje używalny dla `attr` / `skill_table` / `skill_tree`.

Pod selectem „warunek sukcesu", tylko gdy `fieldType === 'weapons_table'`:

| Stan | Komunikat |
|---|---|
| `skillColumnLabel` ustawione, `successType !== 'raw'` | *„Próg = wartość umiejętności wybranej w kolumnie **Umiejętność**"* |
| `skillColumnLabel === null`, `successType !== 'raw'` | Ostrzeżenie: *„Brak kolumny z umiejętnościami — rzut na trafienie nie ma żadnego progu i wypisze gołą liczbę, a blok «umiej.» w formule doda 0"* |
| `skillColumnLabel === null`, `successType === 'raw'` | Ostrzeżenie skrócone do części o formule |
| `successType === 'raw'`, kolumna jest | Nic — progu nie ma, a o formule mówi badge |

Warunek `successType !== 'raw'` jest konieczny: przy `raw` `evalOutcome` zwraca samą liczbę,
żadnego progu nie ma i podpowiedź o progu byłaby kłamstwem.

Osobno, przy samej kolumnie w `WeaponColumnsEditor`: **badge** „umiejętność ataku", pokazywany
**zawsze**, także przy `successType: 'raw'`. Powód: `successType` rządzi wyłącznie progiem, a
wybrana umiejętność wchodzi do rzutu jeszcze trzema drogami od niego niezależnymi — blok `skill`
(`roller.go:222`), blok `dice_skill_attr` (`roller.go:178`) oraz formuła obrażeń, która dostaje
ten sam `skillKey` i `linkedAttr` (`weapon.go:57`).

## 3. Blokada rzutu na karcie

`weaponDamageIncomplete(blocks, row)` (`CustomSheetBody.jsx:75`) zostaje zastąpione przez
`weaponRowIssue(field, row)` zwracające `null | 'damage' | 'skill'`. Jeden predykat kompletności
wiersza zamiast dwóch równoległych mechanizmów; typ zwracany zamiast `boolean`, bo komunikaty
są różne.

Reguła dla `'skill'`: zgłaszana **tylko** gdy pole ma kolumnę umiejętności, a komórka wiersza jest
pusta. Tabela broni bez takiej kolumny to zwykła lista ekwipunku i musi zostać rolowalna —
`weapons_table` jest tworzone z `rollable: true` na sztywno (`TemplateBuilder.jsx:139`) i nie ma
przełącznika, którym GM mógłby to wyłączyć.

Gdy wiersz ma oba braki naraz, wygrywa `'skill'`. Trzy powody: kolumny renderują się przed
obrażeniami, więc tooltip wskazuje najbardziej lewy brak i po jego usunięciu sam przeskakuje na
następny; formuła obrażeń czyta ten sam `skillKey` (`weapon.go:57`), więc pusta umiejętność
potrafi cicho wliczyć zero do obrażeń; a `'damage'` i tak nie wystąpi, gdy GM nie zdefiniował
`damageFormula`. W funkcji znaczy to po prostu: sprawdzamy umiejętność przed obrażeniami i
zwracamy pierwszy trafiony.

Mapowanie wyniku na komunikat **jawną tablicą**, nie sklejanym kluczem
(`customSheet.weaponIssue.${issue}`): sklejony klucz jest niewidoczny dla grepa, więc
`i18n-sync` by go nie znalazł.

Trzy miejsca wywołania, wszystkie już dziś blokują po obrażeniach:

| Miejsce | Linia |
|---|---|
| Wiersz gracza | `CustomSheetBody.jsx:885` |
| Wiersz presetu (`alwaysOn`) | `CustomSheetBody.jsx:801` |
| Ulubione bronie w panelu postaci | `CharacterDetails.jsx:230` |

Preset blokujemy tak samo: jeśli GM nie wybrał umiejętności w preset-broni, wiersz jest równie
niekompletny co graczowy, a rzut byłby cicho pozbawiony progu.

`weaponRowIssue` mieszka w `CustomSheetBody.jsx` obok poprzednika i jest stamtąd eksportowane —
`CharacterDetails.jsx` już tak importuje `weaponDamageIncomplete`. Alternatywą było
`utils/templateSections.js`, odrzucone: predykat czyta stan wiersza postaci, nie tylko kształt
szablonu.

## 4. i18n

Nowe klucze, równolegle w `en/` i `pl/`:

| Klucz | Rola |
|---|---|
| `customSheet.weaponSkillMissing` | Tooltip zablokowanego przycisku rzutu |
| `creator.weaponSkillColumnBadge` | Badge przy kolumnie |
| `creator.weaponThresholdFromSkill` | Podpowiedź o progu (z nazwą kolumny) |
| `creator.weaponThresholdNoSkillColumn` | Ostrzeżenie o braku kolumny (jest próg) |
| `creator.weaponNoSkillColumnRaw` | Ostrzeżenie o braku kolumny (`raw`, bez progu) |
| `creator.weaponSkillColumnMoved` | Komunikat o przeniesieniu roli |

## 5. Testy

| Test | Zakres |
|---|---|
| `CustomSheetBody.weaponRowIssue.test.jsx` (nowy) | Czysta funkcja: brak problemu / brak obrażeń / brak umiejętności / brak kolumny umiejętności = brak blokady |
| `TemplateBuilder.weaponColumns.test.jsx` (nowy) | Włącz w A, włącz w B → A zgaszone; zmiana typu z `select` → flaga zgaszona |

`CustomSheetBody.weaponRowIssue.test.jsx` testuje czystą funkcję, więc nie renderuje i nie potrzebuje i18n.
`TemplateBuilder.weaponColumns.test.jsx` testuje wyeksportowaną czystą funkcję, ale import
z `TemplateBuilder.jsx` ciągnie axios (ESM), więc potrzebuje `jest.mock('axios')` — tak jak
`TemplateBuilder.sheetWidth.test.jsx`.

Backend: `weapon_test.go` i `roller_test.go` bez zmian, bo w Go nic się nie zmienia.

## 6. Znana konsekwencja: zmiana typu kolumny na `text`

Gdy GM przełączy kolumnę umiejętności z `select` na `text`, flaga gaśnie (sekcja 1), ale
**komórki graczy zostają** — czyszczenie `Character.Stats` wymagałoby ruszenia backendu, który w
tym feature zostaje nietknięty. W komórce siedzi nieprzezroczysty identyfikator umiejętności
(surogat, nie slug etykiety), więc gracz zobaczy w polu tekstowym surowe `skill_1712…` zamiast
nazwy. Próg rzutu znika przy okazji: `resolveWeaponSkill` nie znajdzie już pasującej kolumny,
`skillKey` będzie pusty, a `RollConfig.LinkedAttr` dla `weapons_table` jest zawsze pusty (pole
na atrybut istnieje tylko przy węzłach drzewa umiejętności, `TemplateBuilder.jsx:169`), więc
`hasThreshold` = fałsz i rzut na trafienie wypisze gołą liczbę.

Zachowanie świadomie zostawione takie, jakie jest. Ostrzeżenie w `RollConfigEditor` (sekcja 2)
pokaże wtedy brak kolumny umiejętności, co jest jedynym sygnałem, jakiego GM potrzebuje, by
cofnąć zmianę.
