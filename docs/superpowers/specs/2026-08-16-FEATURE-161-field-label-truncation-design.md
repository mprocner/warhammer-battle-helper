# FEATURE-161 — przycinanie długich nazw pól na karcie customowej

Data: 2026-08-16

## Cel

Długa nazwa pola nie może rozwalać układu karty postaci. W sekcji wielokolumnowej
szerokość pola musi być ograniczona szerokością kolumny, w której pole stoi. Nazwa, która
się nie mieści, zostaje przycięta wielokropkiem, a pełna treść jest dostępna w dymce po
najechaniu kursorem.

## Diagnoza

Objaw: w sekcji 3-kolumnowej pole z długą nazwą rozciąga się na całą szerokość, a pozostałe
pola wychodzą poza kartę.

Przyczyna to złożenie dwóch reguł CSS:

1. `style.css:7714` — `.custom-sheet__field-label { white-space: nowrap; }` bez `overflow`,
   więc etykieta ma **min-content równy swojej pełnej szerokości** i nie da się jej zwęzić.
2. `style.css:7670-7698` — `grid-template-columns: repeat(N, 1fr)`, a `1fr` to skrót od
   `minmax(auto, 1fr)`. Minimum `auto` znaczy „nigdy węziej niż min-content zawartości".

Efekt: tor siatki puchnie do szerokości nazwy, suma torów przekracza kontener, reszta pól
zostaje wypchnięta poza kartę. Klasyczna pułapka CSS Grid — `1fr` **nie** jest tym samym co
`minmax(0, 1fr)`.

## Decyzje

| # | Decyzja | Uzasadnienie |
|---|---|---|
| 1 | Zakres = wyłącznie `custom-sheet__field-label` (attr, number, progress, text_short, text_long, select) | tam siedzi bug siatki; nazwy w tabelach i drzewie umiejętności to osobny problem szerokości tabeli |
| 2 | Jedna linia + wielokropek, nie zawijanie do 2 linii | `-webkit-line-clamp: 2` daje różne wysokości pól w jednym wierszu siatki; wymóg z zadania to kropki |
| 3 | Tooltip tylko gdy tekst faktycznie przycięty (`scrollWidth > clientWidth`) | pojawienie się dymki samo w sobie sygnalizuje „tu jest więcej tekstu"; dymka „Siła" nad polem „Siła" to szum |
| 4 | Reuse `usePortalTooltip` z `components/common/PortalTooltip.jsx`, zero nowego CSS tooltipa | paleta `.portal-tooltip` już zgodna ze schematem kart postaci; `createPortal` do `body` ucieka z `overflow` popupu |
| 5 | `placement: 'above'` (domyślne), nie `'left'` | wariant `left` nie ma fallbacku przy krawędzi (`PortalTooltip.jsx:34-37`), a etykieta w pierwszej kolumnie stoi przy lewej krawędzi karty |
| 6 | Jedna instancja hooka w `CustomSheetBody`, nie hook per etykieta | jeden `useState` i jeden portal niezależnie od liczby pól; 40 pól = 40 stanów przy wariancie per-etykieta |

Odrzucone: natywny `title` (nie da się warunkować „tylko gdy przycięte" bez pomiaru,
~1 s opóźnienia, wygląd systemowy zamiast pergaminowego), MUI `<Tooltip>` (zakazane
w CLAUDE.md).

## Zmiany CSS (`warhammer-battle-helper-front/src/style.css`)

**a) Tory siatki przestają być wypychane** — `style.css:7670-7698`, warianty `--2-col`
do `--6-col`:

```css
grid-template-columns: repeat(3, minmax(0, 1fr));
```

`minmax(0, 1fr)` zdejmuje podłogę min-content, więc tory zostają równe niezależnie od
zawartości.

**b) Etykieta dostaje wielokropek** — `style.css:7707`, do istniejącej reguły (`nowrap`
zostaje) dochodzi:

```css
max-width: 100%;
min-width: 0;
overflow: hidden;
text-overflow: ellipsis;
```

`overflow: hidden` robi podwójną robotę: przycina tekst **i** zeruje automatyczny rozmiar
minimalny etykiety jako elementu flex, dzięki czemu `.custom-sheet__field` oraz
`.custom-sheet__attr` same przestają wymuszać szerokość na siatce. `min-width: 0` to jawne
zabezpieczenie dla wiersza `.custom-sheet__attr-header`, gdzie etykieta stoi obok kostki.

**c) Kostka nie daje się ścisnąć** — `style.css:7834`:

```css
.custom-sheet__roll-btn { flex-shrink: 0; }
```

Bez tego w `.custom-sheet__attr-header` (flex row) przeglądarka ściśnie *przycisk* zamiast
etykiety i ikona 14 px zrobi się owalna.

## Zmiany JSX (`warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx`)

**Hook** — obok istniejących `useState` (ok. linia 185):

```jsx
const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
```

**Helper** — jedna definicja obok `renderField`:

```jsx
// renderFieldLabel emits a field's name truncated to its grid column. The tooltip fires only
// when the text is actually clipped: the ellipsis is what tells the player there is more to
// read, so a label that fits needs no hover hint. scrollWidth is the untruncated content
// width, clientWidth the visible box — they differ exactly when overflow:hidden cut something.
const renderFieldLabel = (text) => (
  <label
    className="custom-sheet__field-label"
    onMouseEnter={e => {
      const el = e.currentTarget;
      if (el.scrollWidth > el.clientWidth) showTooltip(text, el);
    }}
    onMouseLeave={hideTooltip}
  >
    {text}
  </label>
);
```

**Podmiany** — 7 linii (`455`, `493`, `512`, `528`, `554`, `568`, `612`) z
`<label className="custom-sheet__field-label">{field.label}</label>` na
`{renderFieldLabel(field.label)}`.

**Portal** — `{tooltipNode}` na końcu `return`, obok `.custom-sheet__sections`.

## Zasięg zmiany

Podgląd w kreatorze (`TemplateBuilder.jsx:1069`) renderuje ten sam `CustomSheetBody`, więc
MG widzi przycięcie i dymkę już przy projektowaniu szablonu — dokładnie tam, gdzie decyduje
o długości nazwy i liczbie kolumn. Bez dodatkowej pracy.

Bez zmian: `checkbox` (własny markup `custom-sheet__checkbox-label`), pole `label`
(celowo zawija się przez `pre-wrap`/`break-word`), `CharacterDetails.jsx` (osobny markup
panelu, nie używa tej klasy). Zero nowych kluczy i18n — dymka pokazuje `field.label`
wpisany przez MG, nie tłumaczony string.

## Poza zakresem

`weapons_table` i `skill_table` w sekcji wielokolumnowej. Po poprawce (a) przestaną
wypychać kartę, ale własna zawartość tabeli nadal może przekroczyć komórkę. To problem
szerokości tabeli, nie długości nazwy pola — osobne zadanie.

## Testy

Nowy `src/systems/custom/CustomSheetBody.smoke.test.jsx`, wzorzec jak
`rolls/CustomRoll.smoke.test.jsx` (`render` z `@testing-library/react` +
`import '../../i18n'`).

jsdom nie liczy layoutu — `scrollWidth` i `clientWidth` zawsze zwracają `0`, więc warunek
nigdy sam z siebie nie zadziała. Podstawiamy je na konkretnym węźle:

```jsx
Object.defineProperty(labelEl, 'scrollWidth', { value: 300, configurable: true });
Object.defineProperty(labelEl, 'clientWidth', { value: 100, configurable: true });
fireEvent.mouseEnter(labelEl);
```

Dwa przypadki, bo testujemy *warunek*, nie samo pokazywanie:

1. `scrollWidth > clientWidth` → `.portal-tooltip` w `document.body` z pełną nazwą
2. `scrollWidth === clientWidth` → brak `.portal-tooltip`

To pierwszy test renderujący dla `CustomSheetBody`.

## Weryfikacja ręczna

Testy nie obejmują sekcji CSS — `minmax(0, 1fr)`, `text-overflow: ellipsis` i
`flex-shrink: 0` to zachowanie silnika layoutu, którego jsdom nie stosuje.

1. Kreator szablonu → sekcja 3-kolumnowa → trzy pola typu `attr`, pierwsze z nazwą
   ~40 znaków (np. „Odporność na wpływy chaosu i korupcję")
2. Podgląd w kreatorze: trzy kolumny równej szerokości, pierwsza nazwa z „…", nic nie
   wychodzi poza ramkę
3. Hover na przyciętą nazwę → dymka nad etykietą z pełnym tekstem; hover na krótką → brak
   dymki
4. To samo w karcie postaci w grze (`CharacterSheetPopup`) — potwierdza, że portal ucieka
   z `overflow` popupu
5. Pole `attr` z kostką: ikona zostaje okrągła, ściska się etykieta
6. Pierwsza kolumna przy lewej krawędzi ekranu → dymka przełącza się na wyrównanie do lewej
   i nie ucieka poza widok
