# FEATURE-162 — Ujemne rozwinięcia na karcie postaci

**Status:** zaprojektowane, gotowe do planu implementacji
**Zgłoszone:** 2026-09-07

## Cel

Pole **Rozwinięcie** (`advances`) na karcie postaci systemu `custom` ma dziś twardo ustawione
minimum `0`. Ma go stracić, żeby dało się wpisać wartość ujemną.

Przypadek użycia: postać dostaje trwałą karę — traci rękę, zostaje okaleczona, dostaje klątwę. GM
chce to zapisać jako `-10` do Zręczności zamiast obniżać bazę, bo baza to wartość „naturalna"
postaci, a rozwinięcie to wszystko, co ją modyfikuje w trakcie gry. Rozdzielenie tych dwóch liczb
jest całym sensem pary baza/rozwinięcie, a blokada na zerze pozwala jej działać tylko w jedną
stronę.

## Zakres

| Input | Zmiana |
|---|---|
| `attr` → Rozwinięcie (`CustomSheetBody.jsx:502`) | usunąć `min={0}` |
| `skill_table` → Rozwinięcie (`CustomSheetBody.jsx:~700`, `onChange.skillAdvances`) | usunąć `min={0}` |
| `attr` → Baza | bez zmian — zostaje przy `field.min` z kreatora |
| `skill_table` → Baza, `skill_tree`, `progress` | bez zmian — zostają przy `min={0}` |

Kara typu „stracił rękę" uderza także w umiejętności oparte na tej cesze, więc oba rozwinięcia
lecą razem — to jedna mechanika i jeden hardcode w dwóch miejscach.

Poza pierwotnym zakresem: konfiguracja minimum w kreatorze, migracja szablonów. Zmiany w Go
okazały się jednak konieczne — patrz Decyzja 2 poniżej, poprawiona po finalnym przeglądzie gałęzi.

## Decyzje projektowe

### 1. Twarde usunięcie `min`, nie nowe pole konfiguracji

Rozważona alternatywa: nowe pole `advancesMin` w kreatorze, per-pole. Odrzucone.

Gdyby domyślną wartością było `0`, stare szablony dalej blokowałyby ujemne i GM musiałby przeklikać
każde pole z osobna, żeby dostać zachowanie, o które prosi ten feature. Gdyby domyślną wartością był
brak minimum, pole istniałoby wyłącznie po to, żeby ktoś mógł ręcznie przywrócić blokadę, której
nikt nie zgłaszał. W obu wariantach dokładamy stan do `SystemTemplate`, UI do kreatora i tłumaczenia
w dwóch językach za zero realnej korzyści.

Blokada na zerze nie jest tu regułą systemu gry — jest przypadkowym `min={0}` przy inpucie.
Usunięcie jej wraca do stanu, w którym rozwinięcie to po prostu modyfikator ze znakiem.

### 2. Persystencja nie wymaga zmian — ścieżka rzutów już tak (poprawione po finalnym review)

**Ta sekcja pierwotnie twierdziła, że backend nie wymaga żadnych zmian. To było błędne** —
poprawne dla zapisu, błędne dla rzutów. Finalny przegląd całej gałęzi znalazł ambiguację, którą
odblokowanie ujemnych rozwinięć uczyniło osiągalną, i naprawa poszła do Go za wyraźną zgodą
użytkownika (patrz commit naprawczy tagowany tym samym FEATURE-162).

**Persystencja — bez zmian, to zostaje prawdą.** `internal/systems/custom/plugin.go` w
`ComputeDerived` liczy `current = base + advances` na zwykłym `int` (`custom/character.go`:
`Advances int`). Nie ma tam żadnego klampowania ani walidacji — wartość ujemna zapisuje się i
przelicza poprawnie już dziś. Blokada była wyłącznie po stronie inputu.

Analogicznie po stronie Reacta: `CharacterSheet.jsx` w `updateAdvances` i `updateSkillAdvances` robi
`Number(value) || 0`, co przepuszcza `-5` bez zmian (`||` zjada tylko `NaN` i `0`, a `0` i tak jest
zerem).

**Ścieżka rzutów — wymagała zmian.** `internal/systems/custom/roller.go` miał dwie funkcje, które
traktowały `0` jako sentinel „jeszcze nie policzone", a nie jako realną wartość:

- `skillValue` czytała `Current`, spadając do `Base` tylko gdy `Current == 0`. Baza `30` z karą
  `-30` też liczy `Current == 0`, więc sentinel się uruchamiał i rzut używał niekaranej bazy `30`,
  podczas gdy karta pokazywała `0`. Naprawa: `skillValue` sumuje `Base + Advances` wprost — to i tak
  jest to, czym `Current` zawsze jest po `ComputeDerived`, więc sentinel był zbędny.
- Fallback progu w `rollFromFormula` (tryb `traditional`) decydował `sv > 0 ? sv : attrValue` —
  realne zero (albo liczba ujemna) uciekało do atrybutu tak samo jak brak umiejętności. Naprawa:
  nowa funkcja `skillHasValue` pyta, czy wpis umiejętności w ogóle niesie dane (którekolwiek z
  `Base`, `Advances` jest niezerowe — `Current` celowo pominięty, bo to tylko utrwalona kopia
  `Base+Advances`, a sprawdzanie go raportowałoby „ma wartość" dla tego samego pustego kształtu,
  który `skillValue` czyta jako `0`), a nie czy suma jest dodatnia. Rozróżnia to „postać nigdy nie
  tknęła tej umiejętności" (spadamy do atrybutu — stare, chciane zachowanie) od „suma naprawdę
  wyszła na zero albo ujemnie" (używamy jej wprost).
- **Finalny przegląd gałęzi (fala 2) znalazł ten sam sentinel `threshold == 0` jeszcze wyżej, w
  `evalOutcome`** — po naprawie `skillValue`/`skillHasValue` próg mógł już legalnie wynosić `0`
  (skasowana do zera umiejętność albo cecha), a `evalOutcome` mimo to czytał `threshold == 0` jako
  „nic nie skonfigurowano" i drukował surowy wynik rzutu zamiast werdyktu — a `weapon.go` zależny od
  `isSuccessOutcome` (szuka podciągu „success") nigdy nie odpalał obrażeń dla w pełni skasowanej
  umiejętności. Naprawa: `evalOutcome` przyjmuje jawny `hasThreshold bool` zamiast zgadywać z
  wartości; każde z czterech miejsc wołających go ustawia go na `true` tylko wtedy, gdy próg
  faktycznie pochodzi z jawnego `cfg.Threshold`, z umiejętności (`skillHasValue`) albo z cechy,
  która naprawdę jest obecna w danych (nowa funkcja `attrLookup`, rozróżniająca „cecha
  niepodpięta" od „cecha skasowana do zera" po obecności klucza w mapie).
- **Przy okazji (fala 3) poprawiono też `rollFixedD100`.** Dawniej decydowało o surowym rzucie
  kryterium `threshold + modifier == 0`, liczone PO doliczeniu modyfikatora — więc nieskonfigurowany
  rzut d100 z niezerowym modyfikatorem dostawał werdykt przeciwko samemu modyfikatorowi. Teraz
  decyduje `hasThreshold`, liczone PRZED modyfikatorem — modyfikator sam w sobie nie jest progiem,
  więc taki rzut zostaje surowy. Nowe zachowanie jest poprawniejsze; poprzednio nie było ani spisane,
  ani przetestowane.

### 3. Konsekwencja: przy `above_threshold` kara zamienia się w automatyczny sukces

Znany skutek uboczny odblokowania ujemnych progów, spisany świadomie, żeby nie trafił kiedyś do
zgłoszenia jako błąd: w trybie `above_threshold` („przebij próg") ujemny albo zerowy próg oznacza,
że **każdy rzut wygrywa** — kara, która miała utrudniać, w tym trybie robi postać bezwzględnie
lepszą. W `below_threshold` (rzut-pod-d100) to samo zjawisko działa odwrotnie i poprawnie: próg `0`
albo ujemny oznacza automatyczną porażkę, dokładnie to, czego GM chce od kary.

To nie nowy błąd tej gałęzi — to proste następstwo istniejącej semantyki „przebij swoją wartość" w
`above_threshold`, którą FEATURE-162 tylko uczyniło osiągalnym (dotąd próg nie mógł zejść do zera
ani niżej). Konsekwencja jest jednostronna: GM projektujący karę przez rozwinięcie musi wiedzieć,
że działa ona sensownie tylko w trybach rzut-pod (np. `below_threshold`), a w `above_threshold`
efekt jest odwrotny do zamierzonego. To świadomy, udokumentowany kompromis, nie coś do naprawy.

Ważne uściślenie (fala 3): próg ujemny wcale nie jest tu potrzebny. Przy odczycie obecnościowym
(`skillHasValue`/`attrLookup`) wystarczy KAŻDY obecny wpis cechy albo umiejętności sumujący się do
zera, żeby dostać werdykt tam, gdzie stary kod drukował surowy rzut — w tym wpis `SeedDefaults` z
jawnym `default: 0` (`plugin.go:90`) albo wartość wpisana, a potem wyczyszczona z powrotem do zera.
To zgodne z własnym stanowiskiem `SeedDefaults` („nil to nie 0") i jest świadomym zachowaniem, nie
błędem do naprawy.

### 4. `step` zostaje bez zmian

FEATURE-157 wstawiła na te inputy `step={field.step || 1}`. Natywny `step` w HTML to snap-to-grid,
a kotwicą siatki (`step base`) jest `min`, jeśli istnieje. Dziś przy `min={0}` i `step=5` dozwolone
są `0, 5, 10…`.

Po usunięciu `min` kotwicą staje się atrybut `value`, a dopiero w jego braku `0`. React na
montowaniu ustawia `defaultValue`, czyli atrybut `value`, więc kotwicą bywa wartość, z jaką pole
się wyrenderowało — nie zawsze zero. Praktycznie: przy skoku `5` strzałki dalej chodzą co `5` i
schodzą poniżej zera, ale punkt siatki może być przesunięty (`-3, 2, 7…` zamiast `-5, 0, 5…`).

Tego nie naprawiamy. To ta sama natywna dziwność, którą FEATURE-157 świadomie zostawiła na wierzchu
(commit `fbbdaab`: „a hand-typed 3 arrows up to 4, because the grid anchors on min"); ominięcie jej
wymagałoby własnych przycisków spinnera, bo kliknięć natywnego spinnera nie da się przechwycić.
GM, któremu to przeszkadza, ustawia skok `1`. Punkt 5 weryfikacji ręcznej sprawdza, co siatka robi
naprawdę — jeśli okaże się gorzej, niż tu opisano, to materiał na osobne zgłoszenie, nie na
rozszerzenie tego.

## Pułapka implementacyjna: wpisywanie minusa

W `<input type="number">` sam znak `-` to stan `badInput`: `e.target.value` zwraca `""`, nie `"-"`.
Handler robi wtedy `Number("") || 0` → `0`, a `value={adv || ''}` renderuje pusty string.

React porównuje `props.value` z `node.value` (które przy `badInput` też jest `""`) i nie nadpisuje
DOM-u, więc wpisany minus powinien przetrwać do momentu dopisania cyfry. To zachowanie zależy jednak
od przeglądarki i wersji Reacta, a jsdom nie odtwarza `badInput` (`window.PointerEvent` i sąsiednie
braki jsdom są tu opisane w `CLAUDE.md`), więc **testem tego nie sprawdzimy**.

Weryfikacja ręczna w przeglądarce, na obu inputach:

1. Wpisać `-3` w Rozwinięcie cechy — pole ma pokazać `-3`, nie `3` ani `0`.
2. Sprawdzić, że Suma spadła o 3 względem Bazy.
3. Odczekać autosave i przeładować kartę — wartość ma wrócić z serwera jako `-3`.
4. Powtórzyć dla Rozwinięcia w tabeli umiejętności.
5. Sprawdzić strzałki przy polu ze skokiem > 1 — mają schodzić poniżej zera po siatce.

## Testy

Rozszerzenie `systems/custom/CustomSheetBody.smoke.test.jsx`, który po FEATURE-157 renderuje już
oba potrzebne przypadki (`attr` z rozwinięciami i `skill_table` z rozwinięciami):

- input Rozwinięcia (`attr`) **nie ma** atrybutu `min`;
- input Rozwinięcia (`skill_table`) **nie ma** atrybutu `min`;
- input Bazy dalej **ma** `min` z `field.min`.

Trzecia asercja jest tu istotna: pinuje, że poluzowaliśmy rozwinięcie, a nie całą kartę.

### Testy Go (ścieżka rzutów, dopisane po finalnym przeglądzie gałęzi — Decyzja 2)

`internal/systems/custom/roller_test.go`:

- `TestSkillValue` — `Base+Advances` sumuje się wprost, także gdy wynik jest `0` albo ujemny;
  ignoruje `Current`.
- `TestSkillHasValue` — rozróżnia „umiejętność bez danych" (spadek do cechy) od „suma naprawdę
  wynosi zero" (używamy jej wprost); wpis w całości zerowy (kształt, jaki dodaje
  `addCustomSkillNode` na froncie — `{base: 0, advances: 0, current: 0}`) dalej czyta się jako brak
  danych. Osobny przypadek (fala 3, finding 2) pinuje, że sam niezerowy `Current` przy zerowych
  `Base`/`Advances` — czyli stały, nieaktualny odczyt — też czyta się jako brak danych: `Current`
  jest przez `skillHasValue` celowo pomijany.
- `TestRollFromFormula_NegativeAdvancesThreshold` — cztery przypadki progu przy ujemnych
  rozwinięciach (skasowana do zera, częściowo obniżona, brak umiejętności, umiejętność obecna ale
  pusta) plus przypadek z `Current` niezgodnym z `Base+Advances` (finding 6 — ma być ignorowany).
- `TestEvalOutcome` — nowy parametr `hasThreshold`; przypadek „próg realnie wynosi zero, ale został
  wyznaczony" musi dać werdykt, nie surowy rzut; przypadek „nic nie wyznaczono" dalej daje surowy
  rzut.
- `TestRollFromFormula_CancelledThresholdProducesRealVerdict` — w pełni skasowana umiejętność albo
  cecha (finding 1): werdykt zamiast surowego rzutu, w obu trybach `SuccessType`, oraz przypadek
  „nic nie skonfigurowano" pinujący stare zachowanie bez zmian.
- `internal/systems/custom/weapon_test.go`,
  `TestRollWeaponWithTemplate_CancelledSkillStillRollsDamage` — atak bronią z w pełni skasowaną
  umiejętnością mimo to rzuca obrażenia (konsekwencja dla `weapon.go` opisana w Decyzji 2).

Front (`CustomRoll.smoke.test.jsx`, ślad w logu rzutów): próg `0` renderuje się dla zwykłego rzutu
(realna, skasowana wartość), ale zostaje ukryty dla rzutu pulowego bez skonfigurowanego progu
sukcesu (`PoolSuccessThreshold` domyślnie `0` = „liczy się każda kostka" — liczba nie niesie tam
informacji).
