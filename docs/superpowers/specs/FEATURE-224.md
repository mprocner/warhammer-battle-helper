# FEATURE-224 — Skórka tabeli broni w karcie custom

**Status:** zaprojektowane 2026-10-01 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-front/src/systems/custom/weaponLayout.js` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/weaponLayout.test.js` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTableRow.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsPresetRow.jsx` (nowy)
- `warhammer-battle-helper-front/src/systems/custom/fields/SkillFieldHeader.jsx` (klasa paska)
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'weapons_table'` i trzy pomocniki wychodzą)
- `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (import pomocników)
- `warhammer-battle-helper-front/src/style.css`
- `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponRowIssue.test.jsx`, `CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Powiązane:** FEATURE-219 (skórka tabeli umiejętności — stąd pochodzi pasek nagłówka, zebra
i hover), FEATURE-220 (skórka drzewka — stąd wzorzec „czysta funkcja układu plus komponenty pola"),
FEATURE-212 (kreator montuje prawdziwe ciało karty — patrz „Gwiazdka wchodzi do polityki afordancji").

## Kontekst

Karta custom ma trzy listy. Tabela umiejętności dostała skórkę w FEATURE-219, drzewko w FEATURE-220.
Tabela broni jest trzecia i ostatnia — i jako jedyna ma kolumny **definiowane przez MG**: dowolna
liczba, każda typu `text`, `number` albo `select`.

Dziś wiersz to flexbox, w którym każda kolumna dostaje `flex: 1`. Dwa skutki:

1. Kolumna „Cechy" dostaje tyle samo miejsca co „Nazwa", choć jedno bywa jednym słowem,
   a drugie zdaniem.
2. Nagłówek i wiersze trzymają się razem **wyłącznie dlatego, że mają zgodną liczbę elementów
   `flex: 1`**. Nikt tego nie pilnuje. Przy kolumnach definiowanych przez MG to jest umowa oparta
   na tym, że dwa miejsca w kodzie przypadkiem się zgadzają.

Tabela ma trzy rodzaje wierszy: broń „zawsze obecna" z szablonu MG (read-only, kłódka, rzucana
po id presetu i nigdy nie kopiowana do `stats`), wiersz gracza (inputy i selecty) oraz stopkę
z przyciskiem dodawania i katalogiem presetów.

## Zakres

Wygląd i struktura pola `weapons_table`, plus wyprowadzenie go z `CustomSheetBody.jsx`.

**Poza zakresem, świadomie:** przesuwanie szerokości kolumn przez MG. Użytkownik chce tego
„na którymś kolejnym etapie"; nie powstaje pod to żadne pole w modelu, żaden prop ani żadna
warstwa pośrednia, bo i tak będzie potrzebowało własnej obsługi w kreatorze i własnego zapisu
w szablonie. Projektowanie pod nie teraz byłoby zgadywaniem kształtu, którego jeszcze nie znamy.

## Decyzje z brainstormingu

### Wariant wizualny: skórka tabeli umiejętności, bez znacznika krawędziowego

Rozważane na makietach trzy układy: stan obecny, skórka FEATURE-219 z zebrą (broń MG znakowana
złotą krawędzią po lewej) oraz wariant bez zebry, w którym tło zostaje przy broni MG.

Wybrana **skórka z zebrą, z której użytkownik usunął złotą krawędź**.

To wymusiło rozstrzygnięcie, którego makieta nie przewidywała. Po zabraniu tła przez zebrę
i usunięciu krawędzi broni MG nie zostaje **żaden** znacznik poza kłódką — a że w tej skórce
inputy są bezramkowe, komórka statyczna i edytowalna wyglądają identycznie. Gracz odkryłby
nieedytowalność dopiero przy kliknięciu.

Kursywa odpada: w drzewku znaczy już „to mój węzeł, nie z szablonu", czyli dokładnie odwrotność.

Wolnym kanałem zostaje **kolor tekstu**: komórki broni MG dostają `#6b5a45` zamiast `#3a2f1f`,
nazwa pozostaje pogrubiona. To ten sam przygaszony brąz, którym tabela umiejętności oznacza Bazę
i Rozwinięcia jako drugi plan — słownik, który karta już ma.

### Szerokości z typu kolumny, nie z zawartości

| typ kolumny | tor |
|---|---|
| pierwsza `text` (nazwa) | `minmax(0, 2fr)` |
| pozostałe `text` | `minmax(0, 1fr)` |
| `select` | `minmax(0, 140px)` |
| `number` | `56px` |
| obrażenia | `minmax(0, 1fr)` |
| gwiazdka | `22px` |
| akcje | `52px` |

**Dlaczego nie „do zawartości":** `auto` i `max-content` dają szerokość zależną od danych. Gracz
wpisuje „Miecz bastardowy kalibrowany" i kolumna rośnie, przesuwając pozostałe — w trakcie
pisania, pod kursorem. To ta sama klasa zjawiska, którą FEATURE-219 zwalczała zamrażaniem pozycji
sortowania na czas zmiany nazwy: układ nie może ruszać się od tego, co ktoś właśnie wpisuje.

Typ kolumny jest już w danych, więc reguła nie wymaga ani nowego pola w modelu, ani pracy
w kreatorze.

`minmax(0, …)` jest konieczne: bez niego tor `fr` ustępuje zawartości i wracamy do problemu,
który rozwiązujemy.

**„Nazwa" to pierwsza kolumna typu `text`** — dokładnie ta, którą kod już dziś uznaje za nazwę
broni. `weaponRowLabel` szuka pierwszej niepustej kolumny `text` i to jej wartość trafia do logu
rzutu. Jedna definicja nazwy, nie dwie.

### Gwiazdka wchodzi do polityki afordancji

Znalezione przy czytaniu kodu, nie w rozmowie. Gwiazdka ulubionych w tabeli broni jest wypisana
ręcznie i bramkowana samym `onToggleFavorite` (`CustomSheetBody.jsx:618`, `:838`), bez gałęzi
`showAffordances`, którą mają oba pola umiejętności.

Skutek dzisiaj: w **kreatorze** `onToggleFavorite` jest `null`, więc wiersz nie renderuje
gwiazdki w ogóle — a nagłówek i tak rezerwuje na nią `22px`. Kolumny wiersza są w kreatorze
przesunięte o `22px` plus odstęp względem swoich etykiet. To jest dokładnie ta klasa błędu,
o której mówi FEATURE-212: kreator pokazuje inną szerokość wiersza niż gra.

Naprawa wchodzi w zakres, bo cała ta zmiana jest o wyrównaniu: `showStar` liczy rodzic jako
`!!onToggleFavorite || showAffordances`, rezerwuje tor tylko wtedy, a wiersz renderuje gwiazdkę
statycznie, gdy nie ma handlera — tak jak robią to pola umiejętności od FEATURE-219.

Callback zostaje weaponowy (`onChange.weaponFavorite(id)`), więc `starAffordance` nie da się tu
reużyć bez zmiany jego kontraktu — gwiazdka broni dostaje własny render z tą samą logiką
„statycznie, gdy nie ma handlera".

## Architektura

### `weaponLayout.js` — osobny moduł, nie dopisek do `skillLayout.js`

```js
// weaponGridTemplate builds ONE grid-template-columns string for a weapons_table.
weaponGridTemplate(field, { showStar, showActions, hasDamage }) → string
```

Nowy plik obok `skillLayout.js`, nie w nim: tabela broni nie jest umiejętnością, a nazwa modułu
nie ma kłamać. Ta sama filozofia — czysta arytmetyka, zero DOM, bo jsdom nie liczy layoutu
i tylko decyzje podjęte na danych da się tu przetestować.

Do tego modułu przenoszą się trzy pomocniki, które dziś mieszkają w `CustomSheetBody.jsx`
i są **importowane przez kreator** (`TemplateBuilder.jsx:35`): `renderDamageFormula`,
`weaponSkillColumn`, `collectSkillOptions`. Zostawienie ich w `CustomSheetBody` znaczyłoby, że ten
plik nadal jest domem logiki broni, tylko bez jej renderu. Import w kreatorze idzie za nimi.

`renderDamageFormula` zwraca JSX, więc `weaponLayout.js` nie jest wyłącznie arytmetyką — i to jest
świadome odstępstwo od wzorca `skillLayout.js`. Alternatywa (czwarty moduł na jedną funkcję)
rozdzielałaby rzeczy, które zawsze zmieniają się razem.

### Komponenty

```
fields/WeaponsTable.jsx      — kontener: nagłówek, trzy rodzaje wierszy, stopka
fields/WeaponsTableRow.jsx   — wiersz gracza
fields/WeaponsPresetRow.jsx  — broń MG
```

Dwa osobne komponenty wiersza, nie jeden z flagą. Różnią się **każdą komórką** (`span` kontra
`input`/`select`), ogonem (kłódka kontra ✕) i tym, że preset nie ma stanu do edycji. Jeden
komponent byłby `switch`em nad dwoma niespokrewnionymi kształtami.

Wspólna jest kolumna obrażeń — obie wołają `renderDamageFormula`, preset z `readOnly = true`.
To jedna linijka w każdym, nie duplikacja logiki.

Po tej zmianie `CustomSheetBody.jsx` zostaje routerem typów pól, polityką afordancji
i `withChrome`.

### Nagłówek: wspólny CSS, osobny markup

Klasa paska przechodzi z `custom-sheet__skill-field-header` na `custom-sheet__field-header` —
po dołożeniu broni ta pierwsza zaczęłaby kłamać.

Komponent **nie** jest uwspólniany. `SkillFieldHeader` niesie ikonę rozwoju z tooltipem i stały
zestaw etykiet; broń niesie etykiety od MG i nic poza tym. Wspólny jest wygląd, nie zachowanie,
a jeden komponent obsługujący oba byłby przełącznikiem nad dwoma niezwiązanymi kształtami.

## CSS

| Rzecz | Wartość |
|---|---|
| pasek nagłówka | gradient `#c9975b → #a67c52`, tekst `#fff9f0`, Cinzel 10px |
| wiersz | `min-height: 26px`, `padding: 2px 4px`, linia dolna `1px solid rgba(201,151,91,0.5)` |
| zebra | `:nth-child(even)` → `rgba(255,249,240,0.55)` |
| hover | `rgba(201,151,91,0.14)` |
| nazwa broni | `font-weight: 700` |
| komórki broni MG | `color: #6b5a45` |
| input i select w wierszu | tło przezroczyste, bez ramki, pierścień fokusu `2px solid #7a5c42` |

Hover jest **złoty**, nie brązowy jak w drzewku: tam kolidowałby z pasmami głębokości, tutaj
pasm nie ma, a zebra jest jaśniejsza od hovera i oba są jaśniejsze od tła karty.

Zebra liczy parzystość rodzeństwa, więc **nagłówek musi zostać pierwszym dzieckiem kontenera** —
ten sam niezmiennik co w tabeli umiejętności, z tym samym komentarzem w CSS. Stopka
(`weapon-add-row`) jest rodzeństwem kontenera, nie wierszy, i tak ma zostać.

Reguły komórek muszą być **zakotwiczone w klasie wiersza broni**. Klasy `weapon-cell-input`
i `weapon-cell-select` są dziś unikalne dla tego pola, ale ta sama dyscyplina trzyma od
FEATURE-219 rozdzielone wyglądy tabeli i drzewka i nie ma powodu jej tu łamać.

**Modyfikator stawiany ZA regułą bazową** przy równej specyficzności — pułapka z CLAUDE.md.

### Kolumna obrażeń zostaje zawijalna

`.custom-sheet__weapon-damage` zachowuje `flex-wrap: wrap`. Przy liniach poziomych zawinięta
formuła podbije wysokość jednego wiersza wyraźniej niż dziś.

Świadomie bez zmian: alternatywą jest ucięcie formuły, czyli ukrycie danych, których gracz
potrzebuje do rzutu. Punkt idzie na listę do obejrzenia w przeglądarce.

## i18n

Bez nowych kluczy.

## Testy

**Nowe, bez DOM** (`weaponLayout.test.js`): tor per typ kolumny; pierwsza kolumna `text` dostaje
`2fr`, kolejne `1fr`; tabela bez żadnej kolumny `text`; kolumny opcjonalne (gwiazdka, akcje,
obrażenia) wchodzą i wychodzą z szablonu; `weaponSkillColumn` i `collectSkillOptions` po
przeprowadzce nadal zwracają to samo.

**Istniejące**: `CustomSheetBody.weaponRowIssue.test.jsx` zostaje strażnikiem zachowania
(blokada rzutu przy niekompletnym wierszu) i renderuje przez `CustomSheetBody`.

**Snapshoty `domShape`**: zmienią się **celowo** — markup przechodzi z flexa na siatkę. Jak
w FEATURE-220, nietknięty snapshot nie jest tu dowodem niczego i nie wolno go tak przedstawiać.

## Weryfikacja ręczna

jsdom nie wczytuje `style.css` i nie liczy layoutu, więc **żaden test nie sprawdzi wyglądu**.

1. broń MG obok broni gracza — przygaszony tekst czytelnie odróżnia, kłódka na miejscu;
2. kolumny: `text`, `select` z umiejętnościami, `number` — czy proporcje mają sens przy czterech
   i przy siedmiu kolumnach;
3. długa nazwa broni — wielokropek, sąsiednie kolumny stoją;
4. długa formuła obrażeń — zawinięcie podbija jeden wiersz, reszta bez zmian;
5. tabela **bez** kolumny obrażeń;
6. tabela bez żadnej kolumny `text` (same `select`/`number`);
7. zebra: pierwszy wiersz pod paskiem nagłówka ma być przyciemniony i zostać taki po dodaniu broni;
8. **kreator obok gry — te same szerokości wierszy**, w tym gwiazdka obecna statycznie
   w kreatorze (patrz „Gwiazdka wchodzi do polityki afordancji");
9. dodanie broni z katalogu presetów i ręcznie;
10. Tab po wierszu — widać, gdzie jest fokus, także w `select`.

## Poza zakresem

- Przesuwanie szerokości kolumn przez MG (osobny etap, bez przygotowań teraz).
- Migracja kart CoC i Warhammer na silnik custom.
- Zmiany w modelu danych, kluczach, rzutach i formule obrażeń.
