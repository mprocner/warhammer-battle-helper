# FEATURE-214 — Kreator WYSIWYG: edycja na wyrenderowanej karcie

**Status:** do zaplanowania
**Dotyczy:** `warhammer-battle-helper-front/src/`
— `systems/custom/CustomSheetBody.jsx`,
`components/creator/TemplateBuilder.jsx`,
`components/creator/FieldChrome.jsx` (nowy), `components/creator/SectionChrome.jsx` (nowy),
`utils/sheetDnd.js` (nowy), `utils/templateSections.js`,
`style.css`, `locales/{en,pl}/translation.json`
**Backend:** bez zmian — model szablonu ten sam.
**Powiązane:** FEATURE-211 (sekcje zagnieżdżone), FEATURE-212 (szerokość karty), FEATURE-213

## Kontekst

Kreator ma dziś dwa niezależne renderery tej samej rzeczy. Zakładka 2 („Pola") rysuje
abstrakcyjne kafelki (`FieldCard`: tag typu, skrót, badge'e) w siatce kreatora. Zakładka 3
(„Podgląd") rysuje prawdziwą kartę przez `CustomSheetBody`. GM układa szablon w jednym widoku,
a skutek ogląda w drugim.

Rozjazd nie jest teoretyczny: `TemplatePreview` ma własny chrome zamiast wrappera `.custom-sheet`
z sesji, przez co **nie miał limitu szerokości** i ukrył błąd, który wyszedł dopiero w
FEATURE-212.

Feature likwiduje podział: **widok edycji JEST wyrenderowaną kartą**, a narzędzia edycji
dokładane są jako warstwa chrome na wierzchu.

## Ustalenia projektowe

| Decyzja | Wybór |
|---|---|
| Liczba widoków | Jeden. Zakładki: `1 Ogólne › 2 Karta`. Podgląd = przełącznik (ikona oka), nie zakładka |
| Szew w rendererze | Opcjonalny prop `renderChrome` w `CustomSheetBody` |
| Wrapper karty w edycji | Prawdziwy `.custom-sheet` z limitem szerokości GM-a, nie `.creator__prev-sheet` |
| Właściwości pola | `DraggablePopup` zamiast dokowanego panelu 400px |
| Paleta typów | Zostaje, zwężona do paska ikon ~56px |
| Wartości pól w edycji | Puste. Placeholdery tylko-w-edycji, rysowane przez chrome |
| Chrome pola | Prawy górny róg, `absolute`, na hover |
| Chrome sekcji | Lewy górny róg, `absolute`, względem pudełka sekcji (nie nagłówka) |
| Widoczność chrome | Najgłębszy element wygrywa; realizowane CSS-em przez `:has()` |
| DnD — podgląd | Duch poza przepływem (`ghostRectFor`), układ zamrożony |
| DnD — mechanizm | Jeden droppable na kartę + własny indeks prostokątów; bez `SortableContext` |

## Model interakcji

Trzy rozłączne poziomy kontaktu z węzłem:

| Gest | Znaczenie | Efekt |
|---|---|---|
| Hover | „mogę tu coś zrobić" | Chrome się pojawia. Nic się nie zaznacza. |
| Klik | zaznaczenie | Obwódka; węzeł staje się celem palety. Popup się NIE otwiera. |
| Przycisk edycji (chrome) | edycja właściwości | Otwiera `DraggablePopup` z `PropertyPanel` |

**Dlaczego klik nie otwiera popupu.** Paleta dodaje pole do *zaznaczonej* sekcji, a dodawanie
kilku pól pod rząd to dominujący przepływ przy budowie szablonu. Gdyby zaznaczenie otwierało
popup właściwości, ten popup wisiałby nad kartą przez cały czas dodawania — zasłaniając
dokładnie to, co GM buduje.

## Architektura renderowania

`CustomSheetBody` zostaje jedynym kodem wiedzącym, jak wygląda karta:

```
CustomSheetBody({ sections, values, onChange, ..., renderChrome = null })
```

- `renderChrome === null` → render **identyczny co do bajta** z dzisiejszym. Sesja gracza nie
  zmienia się ani wizualnie, ani w strukturze DOM.
- `renderChrome` podany → każdy węzeł (pole i sekcja) opakowany w
  `<div className="custom-sheet__editable">` z `position: relative`, a do środka wstrzyknięty
  wynik `renderChrome(node, path)`.

**Warunek „bajt w bajt" jest nienegocjowalny z dwóch powodów.** Po stronie feature'u: render
różny od sesyjnego oznacza powrót do oglądania przybliżenia. Po stronie ryzyka: `CustomSheetBody`
obsługuje każdą kartę custom w każdej sesji, więc każda zmiana w gałęzi bez `renderChrome` jest
potencjalną regresją u graczy, którzy kreatora nie otworzyli.

**Ścieżki.** `renderField` i `renderSection` dostają `path: number[]` — ta sama konwencja co
`templateSections.js` z FEATURE-211. `renderSection` już się rekurencyjnie wywołuje, więc to
dołożenie argumentu i `[...path, i]` w `.map()`, nie przebudowa.

**Podział odpowiedzialności:**

| Komponent | Wie o |
|---|---|
| `CustomSheetBody` | wygląd karty + *gdzie* są szwy. Nic o edycji |
| `FieldChrome` | przycisk edycji, uchwyt DnD, obwódka, badge `⚠ dup` |
| `SectionChrome` | to samo + „Dodaj pole" |
| `TemplateBuilder` | stan, zaznaczenie, DnD, autosave |

**Odrzucone alternatywy.**
*React Context zamiast propa* — `CustomSheetBody` ma być jednym źródłem prawdy o wyglądzie karty;
ukryte wejście spoza drzewa propsów to zły interfejs dla takiego komponentu.
*Warstwa nakładkowa mierzona `getBoundingClientRect`* — wymaga `ResizeObserver` i przeliczeń
przy każdym reflow, a `@dnd-kit` potrzebuje refów NA węzłach, nie obok; do tego w jsdom
`getBoundingClientRect` zwraca zera, więc całość byłaby nietestowalna.
*Kopia renderera (`EditableSheetBody`)* — to dokładnie ten dryf, który feature likwiduje.

## Placeholdery tylko-w-edycji

Rysowane **przez chrome**, nie przez `CustomSheetBody` — dzięki temu warunek „bajt w bajt"
zostaje nienaruszony.

| Stan | Placeholder |
|---|---|
| `label` z pustym tekstem | przygaszona kursywa „Tekst etykiety" |
| sekcja bez pól | kreskowana ramka, `min-height`, „Dodaj pole lub przeciągnij tutaj" |
| `weapons_table` bez wierszy | jeden wiersz-duch, przygaszony |
| pole bez etykiety | przygaszone „—" w miejscu etykiety |

Wszystkie przygaszone i kursywą, żeby ani przez chwilę nie czytały się jako dane.

**Dlaczego nie dane przykładowe.** Fikcyjne wartości kolidowałyby z prawdziwymi wartościami
domyślnymi (`plugin.go:83`) — GM nie odróżniłby „tak będzie u gracza" od wypełniacza. Do tego
pole `attr` z zakresem `1–10` dostałoby wartość spoza zakresu albo przyciętą; obie wersje
wprowadzają w błąd co do działania zakresu.

## Diagnostyka

- `⚠ dup` (zduplikowany klucz) — **stale widoczny**, nie na hover. To jedyna ochrona przed
  dwoma polami dzielącymi jedną wartość w `Stats`.
- Badge `⚄ rollable` — **usuwany**. Rollable pole widać po przycisku rzutu, który renderuje
  `CustomSheetBody`.
- Tag typu pola — **usuwany**. Typ jest teraz widoczny wprost; to sens WYSIWYG.
- Badge short-card — **usuwany**. Właściwość rzadka, widoczna w panelu właściwości.

## Chrome — pozycjonowanie

Siatka karty to `grid` z `gap: 8px`. Przy karcie 900px sekcja 6-kolumnowa daje ≈136px na pole;
przy zagnieżdżeniu schodzi niżej i **nie ma podłogi** (świadoma decyzja FEATURE-211).

Wzorce z rynku nie przenoszą się wprost: rynna Notion wymaga bloków jednokolumnowych, pływający
toolbar Gutenberga wymaga bloków pełnej szerokości. Karta jest siatką 2D do 6 kolumn — nad polem
jest sąsiad z poprzedniego wiersza, obok sąsiad z tego samego. Toolbar „nad polem" albo rozpycha
układ (render przestaje być wierny), albo zasłania sąsiada.

Dlatego **narożniki** — jedyne miejsce należące do elementu:

- **pole → prawy górny róg**: pigułka `absolute`, uchwyt DnD + przycisk edycji (~48px);
- **sekcja → lewy górny róg**: uchwyt + edycja + „Dodaj pole".

**Przeciwne rogi są konieczne**, bo sekcja zagnieżdżona i jej pierwsze dziecko zaczynają się w
tym samym punkcie; wspólny róg dawałby nakładanie przy każdym zagnieżdżeniu.

**Chrome sekcji jest pozycjonowane względem pudełka sekcji, nie nagłówka.** `CustomSheetBody`
renderuje nagłówek warunkowo (`{section.title && …}`), a sekcja bez tytułu to normalny stan
(`makeDefaultSection` tworzy ją z `title: ''`) — oparcie chrome na nagłówku zostawiłoby takie
sekcje bez uchwytu i bez „Dodaj pole".

**Poniżej ~48px szerokości** pigułka przykrywa pole niemal w całości. Zaakceptowane: na hoverze
GM patrzy na to jedno pole, a kolumnę tej szerokości wybrał sam.

## Widoczność chrome — CSS, nie stan React

Hover NIE idzie przez stan React: 40 pól × `useState` to 40 re-renderów przy przesuwaniu myszy.

```css
.custom-sheet__editable:hover > .creator__chrome { opacity: 1; }
/* najgłębszy wygrywa — przodek gasi swoje chrome, gdy hover ma potomek */
.custom-sheet__editable:has(.custom-sheet__editable:hover) > .creator__chrome { opacity: 0; }
```

Reguła „najgłębszy wygrywa" jest konieczna, bo hover propaguje przez wszystkich przodków w DOM,
a FEATURE-211 zniósł limit głębokości: pole na głębokości 5 zapalałoby 6 pigułek, których rogi
układają się w schodek w tym samym miejscu ekranu.

Fallback, gdyby `:has()` okazał się niedostępny w docelowych przeglądarkach: `mouseenter`/
`mouseleave` ze stanem w JEDNYM miejscu (`hoveredPath` w `TemplateBuilder`), nie per pole.

## Panel właściwości → popup

`PropertyPanel` i `SectionPropertyPanel` przenoszą się do `DraggablePopup` **z niezmienioną
treścią**. Zmienia się kontener, nie zawartość.

**Dlaczego teraz, a nie osobnym feature'em — arytmetyka:**

```
paleta 200px + panel 400px + padding canvasu 48px = 648px chrome
laptop 1440px → dla karty zostaje 792px
SHEET_WIDTH_DEFAULT = 900px
```

Przy dokowanym panelu WYSIWYG **nie może pokazać wiernego renderu domyślnej karty na laptopie**.
Feature zjadłby własną obietnicę. Bez panelu: 1192px. Bez panelu i z paletą 56px: 1336px.

`components/common/DraggablePopup.jsx` już istnieje (portal, przeciąganie, resize, minimalizacja)
i jest używany przez minigry oraz kartę postaci — więc koszt to opakowanie, nie nowy komponent.
Gratis dochodzi możliwość odsunięcia właściwości, gdy zasłaniają edytowane pole.

**Granica zakresu:** redesign *zawartości* panelu (`RollConfigEditor`, presety broni,
`FormulaBuilder`) NIE należy do tego feature'u.

## Paleta

Pasek ikon ~56px, rozwijany na hover; tooltipy portalowe już istnieją (`showPaletteTooltip`).

Paleta i inline-picker nie są duplikatem — różnią się stanem celu:

| | Paleta | Inline „+" |
|---|---|---|
| Cel | zaznaczona sekcja, lepki | ta sekcja, jednorazowy |
| Koszt 5 pól | 5 kliknięć | 10 kliknięć |
| Wygrywa przy | budowie szablonu od zera | dorzuceniu pola później |

Cel musi być czytelny **z karty** (wyraźna obwódka zaznaczonej sekcji), bo pasek 56px nie ma
miejsca na dzisiejszy `creator__palette-hint`. Gdy nic nie zaznaczone — paleta przygaszona,
karta pokazuje `creator.paletteSelectSection`.

## Drag & drop

### Rezygnacja z `SortableContext`

Dzisiejsza maszyneria (`useSortable`, `rectSortingStrategy`, sentinele, `redirectIntoTarget`,
`dropIntent`) istnieje głównie po to, by okiełznać przesuwanie elementów. Komentarz przy
`redirectIntoTarget` mówi to wprost.

Przy kafelkach o zbliżonych rozmiarach „największa część wspólna" (`rectIntersection`) i
„najbliżej wskaźnika" dawały tę samą odpowiedź. Przy prawdziwych polach — `long_text` 200px obok
`attr` 40px — przestają: wysokie pole wygrywa kolizje samym rozmiarem.

Gorsza jest pętla sprzężenia: wysokość wiersza CSS grid = wysokość najwyższego elementu, więc
przesunięcie wysokiego pola w wiersz niskich zmienia wysokość wiersza → wszystko poniżej skacze
→ pod wskaźnikiem jest inny element → decyzja się zmienia → układ wraca. Migotanie.

To ta sama zasada, którą projekt już zna: **nigdy nie rozstrzygaj dropu z geometrii, którą ta
decyzja zmienia.**

### Mechanizm

```
JEDEN droppable (cały obszar karty)
+ indeks prostokątów: Map<path, DOMRect>, mierzony RAZ na dragStart
+ @dnd-kit sprowadzony do: sensory, DragOverlay, autoscroll
```

Zamrożenie układu płaci dwa razy: czyni pomiar poprawnym ORAZ jednorazowym.

`@dnd-kit` zostaje (zamiast gołych Pointer Events) dla progu aktywacji sensora (odróżnienie
kliknięcia od przeciągnięcia), autoscrolla przy krawędzi i `DragOverlay` portalowanego poza
`overflow: hidden`.

**Tracimy** wbudowane przeciąganie klawiaturą (`KeyboardSensor` potrzebuje droppable'i). Nie
boli: przyciski `↑`/`↓` zostają i dają przewidywalny krok.

**Zyskujemy** swobodę celu: pojęcie „kontekstu" znika, więc przeciągnięcie pola z sekcji korzenia
do sekcji na głębokości 4 to zwykły drop.

### Wyznaczanie miejsca — `utils/sheetDnd.js`

```js
measureNodes(refs) → Map<path, DOMRect>
insertionAt(pointer, rects) → { parentPath, index }
ghostRectFor({ parentPath, index }, draggedRect, rects) → { top, left, width, height }
```

`insertionAt`:
1. Wskaźnik nad dzieckiem → wstaw przed/za nim, zależnie od strony jego środka.
2. Oś z geometrii rodzeństwa: następne dziecko z tym samym `top` → oś pozioma; inaczej pionowa.
   Sekcja 1-kolumnowa to `flex-column`, więc zawsze pionowa.
3. Wskaźnik nad sekcją, ale nad żadnym dzieckiem → dopisz na koniec tej sekcji. To zastępuje
   sentinel i `DropZone`.

`ghostRectFor`: `left`/`width` z prostokąta dziecka stojącego obecnie na pozycji `index`
(szerokość kolumny docelowej), `height` z przeciąganego pola. Przy dopisywaniu na koniec wiersza
z wolną kolumną: `left` = prawa krawędź ostatniego dziecka + `gap`.

### Podgląd: duch poza przepływem

Półprzezroczysty prostokąt (`absolute`, `opacity: 0.35`) z przeciąganym polem wyrenderowanym
przez `CustomSheetBody`, narysowany NA karcie w miejscu wstawienia. Nic nie rozpycha, więc
zamrożony pomiar zostaje ważny.

`DragOverlay` (duch pod kursorem) renderuje to samo pole — niesiesz to, co upuszczasz.

**Odrzucone: duch rezerwujący miejsce (prawdziwa luka).** Wymagałby węzła-placeholdera w
rendererze, ponownego pomiaru po każdej zmianie pozycji i histerezy strojonej w przeglądarce.
Żadna popularna biblioteka nie daje tej kombinacji: `@hello-pangea/dnd` ma rozsuwający
placeholder przy zmiennych wysokościach, ale **nie obsługuje siatek 2D**;
`@dnd-kit/sortable` obsługuje siatkę, ale przesuwa `transform`em, który nie zmienia wysokości
wiersza — więc przy zmiennych wysokościach podgląd kłamie.

**Wymaganie, żeby ta droga została otwarta** (przejście na wersję rezerwującą kasuje wyłącznie
`ghostRectFor` i jeden `<div>`; reszta jest fundamentem): pomiar musi być **wywoływalną funkcją**,
nie efektem ubocznym zaszytym w `handleDragStart` — wersja rezerwująca woła to samo, tylko częściej.

Histereza, której wersja rezerwująca wymaga, potrzebowałaby poprzedniej decyzji jako argumentu
`insertionAt`. Parametru NIE dodajemy na zapas: funkcja ma jedno miejsce wywołania i jeden plik
testów, więc rozszerzenie sygnatury wtedy, gdy będzie potrzebna, jest zmianą mechaniczną.

### Zakazy

`moveNode` musi odrzucić upuszczenie węzła w samego siebie lub we własnego potomka.

### Scroll

Prostokąty zmierzone na `dragStart` są w układzie viewportu. Przewinięcie kontenera w trakcie
przeciągania wymaga korekty o deltę `scrollTop` względem stanu z `dragStart`. `@dnd-kit` robił to
za nas przy N droppable'ach (własny rejestr + śledzenie przewijalnych przodków); przy własnym
indeksie spada to na nas. Objaw pominięcia jest podstępny: DnD działa idealnie do pierwszego
przewinięcia, potem wstawia konsekwentnie o kilka pozycji za wysoko.

## Kolejność prac

| Etap | Zakres | Weryfikacja |
|---|---|---|
| 1 | Szew `renderChrome` + `path` w `CustomSheetBody` | istniejące testy `CustomSheetBody.*` zielone BEZ zmian + nowy test szwu |
| 2 | `FieldChrome`, `SectionChrome`, hover, zaznaczenie, placeholdery, paleta 56px | testy renderujące |
| 3 | Właściwości w `DraggablePopup` | przeglądarka (z-index nad MUI Dialog) |
| 4 | DnD: `sheetDnd.js`, jeden droppable, `DragOverlay`, duch | testy jednostkowe + przeglądarka |
| 5 | Sprzątanie | brak martwych klas i kluczy |

Etap 1 jest osobny celowo: to jedyny moment, w którym dotykamy kodu działającego u wszystkich
graczy w sesji.

## Testy

**Nowe, jednostkowe (bez DOM):**
- `insertionAt` — syntetyczne prostokąty: wstawienie przed/za, wybór osi w wierszu vs w kolumnie,
  dopisanie na koniec, sekcja pusta, zagnieżdżenie.
- `ghostRectFor` — szerokość kolumny docelowej, wysokość przeciąganego, koniec wiersza.
- `moveNode` — odrzucenie dropu w samego siebie i we własnego potomka.

**Nowe, renderujące:**
- Szew: `renderChrome={(n, p) => <b data-path={p.join('.')} />}` wywołany raz na węzeł z właściwą
  ścieżką; `renderChrome={null}` nie dokłada ani jednego elementu do DOM.
- Placeholdery pustych węzłów.
- `FieldChrome` / `SectionChrome` — obecność przycisków, `⚠ dup`.

Testy renderujące: `import '../../i18n';` (side-effect, bez providera) — dominująca konwencja
w projekcie.

**Czego NIE testujemy w jsdom:** samego przeciągania. `window.PointerEvent` nie istnieje,
`document.elementFromPoint` nie istnieje, `getBoundingClientRect` zwraca zera. Dlatego CAŁA
decyzja o dropie siedzi w czystych funkcjach `sheetDnd.js`, a warstwa mierząca zostaje cienka.

**Weryfikacja w przeglądarce (obowiązkowa):** drop do sekcji pustej; drop do sekcji na
głębokości ≥3; drop węzła w samego siebie (odrzucony); przeciąganie z przewijaniem karty;
popup właściwości nad `Dialog`em; karta szersza niż okno.

**Bez zmian:** `TemplateBuilder.sheetWidth.test.jsx` (zakładka Ogólne nietknięta).
Znany baseline fail `App.test.js` (axios ESM) nie jest regresją.

## Sprzątanie

Usuwane w tej samej zmianie (zasada: nie flagujemy martwego kodu na potem):

- Komponenty: `FieldCard`, `SectionCanvas`, `DropZone`, `TemplatePreview` + `TemplatePreview.test.jsx`
- Funkcje: `redirectIntoTarget`, `collisionDetection`, `dropSentinelId`, `dropHeaderId`, `dropIntent`
- CSS: rodziny `.creator__canvas-*`, `.creator__prev-*`, `.creator__drop-zone*`
- i18n (en + pl): `canvasStepChip`, `dropZone`, `previewNoSections`, `previewSubtitle`,
  `previewDefaultName`, `tabPreview`; `tabFields` → `tabSheet`

## Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Przepisanie DnD (największy kawałek) | Decyzja w czystych funkcjach; lista scenariuszy do weryfikacji w przeglądarce |
| `DraggablePopup` pod MUI `Dialog` (z-index 1300) | Sprawdzić w przeglądarce, nie na oko |
| Chrome przykrywa pole < 48px | Zaakceptowane |
| `:has()` niedostępne | Fallback: `hoveredPath` w jednym miejscu |
| Regresja w sesji gracza | Etap 1 osobno; `renderChrome === null` = render bajt w bajt |

## Poza zakresem

- Duch rezerwujący miejsce (wersja B) — droga otwarta przez dwa wymagania wyżej
- „Przenieś do sekcji…" w popupie właściwości (alternatywa dla przeciągania przez wysoką kartę)
- Drzewo nawigacyjne (odpowiednik Navigatora z Webflow) przy dużych szablonach
- Redesign zawartości `PropertyPanel`
