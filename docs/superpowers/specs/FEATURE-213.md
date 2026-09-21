# FEATURE-213 — Karta pola nie rozciąga się do wysokości zagnieżdżonej sekcji

**Status:** zaimplementowane 2026-09-21 (zweryfikowane ręcznie przez użytkownika)
**Dotyczy:** `warhammer-battle-helper-front/src/style.css` (reguła `.creator__canvas-field`)
**Powiązane:** FEATURE-211 (zagnieżdżone sekcje — dopiero one wstawiają wysoki element
do wiersza siatki kreatora, więc to ta zmiana ujawniła problem)

## Kontekst

W kreatorze szablonu MG dodaje sekcję 2-kolumnową, a w niej: w jednej kolumnie zagnieżdżoną
sekcję, w drugiej zwykłe pole (np. `text`). Oba elementy dostają tę samą wysokość — karta pola
rozciąga się na całą wysokość sekcji obok. W podglądzie karty postaci tego nie ma: pole jest
niskie, sekcja wysoka.

## Przyczyna

`.creator__fields-grid` to CSS grid bez zadeklarowanego `align-items`, czyli z domyślnym
`stretch`. Każdy element siatki dostaje wysokość swojego wiersza, a wiersz jest tak wysoki jak
jego najwyższy element — czyli zagnieżdżona sekcja. `min-height: 62px` na karcie ustala tylko
dolną granicę i nie broni przed rozciągnięciem w górę.

Podgląd zachowuje się **tak samo** — `.custom-sheet__fields--2-col` to również grid ze
`stretch`, a `.custom-sheet__field` też dostaje pełną wysokość wiersza. Różnica jest wyłącznie
wizualna: pole na karcie postaci nie ma tła ani ramki, a jego zawartość (etykieta + input)
siada u góry, więc nadmiarowa przestrzeń jest niewidoczna. Karta w kreatorze ma tło, ramkę
i stan `--selected`, więc rozciągnięty prostokąt rzuca się w oczy.

To ważne dla zakresu: **nie naprawiamy podglądu, bo w podglądzie nie ma czego naprawiać.**
Zmiana dotyczy tylko kreatora.

## Zmiana

Jedna deklaracja w istniejącej regule w `style.css`:

```css
.creator__canvas-field {
    align-self: start;   /* NEW */
    min-height: 62px;    /* bez zmian */
    /* reszta reguły bez zmian */
}
```

`align-self` na elemencie siatki nadpisuje `align-items` rodzica wyłącznie dla tego elementu.
Zagnieżdżone sekcje (`.creator__section--nested`) tej własności nie dostają, więc nadal
rozciągają się do wysokości wiersza — dwie sekcje obok siebie zachowują równą wysokość.

### Dlaczego nie `align-items: start` na siatce

Prostszy zapis, ale zmienia zachowanie **wszystkich** elementów wiersza, w tym sekcji. Wiersz
z dwiema zagnieżdżonymi sekcjami o różnej liczbie pól przestałby być wyrównany — dolne krawędzie
ramek rozjechałyby się. Rozciąganie sekcji jest tu pożądane, rozciąganie karty pola nie; celujemy
więc w kartę, nie w siatkę.

### Dlaczego nie sztywne `height: 62px`

Wysokość karty zależy od zawartości: pole z `abbr` dokłada drugą linię (`--abbr` + `--label`),
pole `attr`/`number` z `min`/`max`/`step` dokłada chip zakresu (`.creator__canvas-field-range`).
Sztywna wartość przycinałaby te warianty albo podnosiła wszystkie karty do wysokości
najrzadszego przypadku. Akceptujemy, że w wierszu samych pól karta z chipem zakresu jest
o kilka pikseli wyższa od sąsiadek.

## Czego zmiana nie dotyka

| Element | Dlaczego bezpieczny |
|---|---|
| `.creator__drop-zone` | `grid-column: 1 / -1` — własny wiersz, sam sobie wyznacza wysokość |
| DnD (dnd-kit) | kreator nie używa `DragOverlay`; sortable przesuwa karty transformem w miejscu, a `align-self` wchodzi raz, statycznie, nie w trakcie gestu |
| `.creator__canvas-field--drop-beside::before` | pseudo-element `position: absolute`, poza flow; karta pozostaje jego `position: relative` przodkiem |
| `.creator__section--drop-into` | zmienia wyłącznie kolor/tło/cień, bez wpływu na wysokość |
| Podgląd i karta postaci (`.custom-sheet__*`) | nietykane |

## Weryfikacja

Testu jednostkowego **nie piszemy**. jsdom nie liczy layoutu — `getBoundingClientRect` zwraca
zera, a wyliczonej wysokości elementu siatki nie da się tam odczytać, więc test sprawdzałby
najwyżej obecność stringa w CSS, czyli nic.

Weryfikacja wizualna w kreatorze:

1. Dodaj sekcję, ustaw jej układ na 2 kolumny.
2. W pierwszej kolumnie dodaj pole typu `text`.
3. W drugiej dodaj zagnieżdżoną sekcję i wrzuć do niej 3–4 pola.
4. Oczekiwane: karta pola `text` zostaje niska (≈62px) i przylega do górnej krawędzi komórki,
   sekcja obok zachowuje swoją wysokość.
5. Kontrola regresji: wiersz z dwiema zagnieżdżonymi sekcjami o różnej liczbie pól nadal ma
   obie ramki równej wysokości.
6. Kontrola regresji: przeciągnięcie pola między sekcjami nadal działa, wskaźnik wstawienia
   (pionowa kreska na lewej krawędzi karty) nadal ma pełną wysokość karty.
