# PLAYRPG-241 — Wysokość pól na karcie custom (opływanie avatara)

## Problem

Sekcja karty custom to CSS grid `repeat(N, minmax(0, 1fr))` (`style.css`,
`.custom-sheet__fields--N-col`). Pola wpadają w komórki po kolei, a domyślne
`align-items: stretch` rozciąga każdy wiersz do najwyższej komórki. Tile tekstowy ma ~59px,
tile avatara ~129px, więc pole tekstowe obok avatara rośnie do 129px. MG nie może postawić
dwóch pól tekstowych jedno pod drugim obok jednego avatara — a to częsty układ nagłówka karty
(imię, profesja, obok portret).

To samo dotyczy atrybutów: `attr` bez rozwinięcia ma mieć wysokość zwykłego pola, `attr`
z rozwinięciem (base + adv) — wysokość avatara.

## Decyzje

- **Wysokość wynika z typu pola, MG jej nie ustawia.** Brak nowego pola w modelu szablonu,
  brak zmian w backendzie. Odrzucone: ręczna wysokość we właściwościach pola (więcej UI, więcej
  sposobów na zepsucie układu) i hybryda (ręczne nadpisanie dopiero gdy ktoś go potrzebuje).
- **Jednostka wysokości = tile tekstowy.** Pola „wysokie” zajmują 2 wiersze siatki
  (`grid-row: span 2`); 2 × tile + gap ≈ avatar, więc proporcja jest naturalna.
- **Czysty CSS grid, bez pomiaru w JS.** Odrzucone: masonry przez `ResizeObserver` (migotanie,
  pętla pomiar→layout→pomiar, nietestowalne w jsdom) i natywne `grid-template-rows: masonry`
  (brak stabilnego wsparcia w Chrome). Konsekwencja: opływanie działa tylko wokół pól o znanej
  liczbie jednostek; tabele i obrazy mają wysokość swobodną.
- **Bez `grid-auto-flow: dense`.** Kolejność pól w modelu = kolejność auto-placementu, więc
  strzałki ↑/↓ i indeksy drag-and-drop dalej znaczą to samo. Sparse auto-placement i tak wstawia
  kolejne pola obok komórki na 2 wiersze (przykład niżej).
- **Sekcje 1-kolumnowe zostają `flex column`** — span nic tam nie zmienia. Minimalne wysokości
  komórek obowiązują także tam, więc pole wygląda tak samo w każdej sekcji.

## Klasy wysokości

Nowy czysty moduł `systems/custom/fieldRowSpan.js`, `fieldRowSpan(field) → 1 | 2 | null`.
Jedyne źródło prawdy dla tej tabeli:

| Span | Typy |
|---|---|
| `2` | `char_avatar`, `text_long`, `attr` z `hasAdvances` |
| `1` | `text_short`, `char_name`, `number`, `computed`, `progress`, `select`, `checkbox`, `label`, `attr` bez `hasAdvances` |
| `null` (swobodna) | `image`, `skill_table`, `weapons_table`, `skill_tree`, sekcja zagnieżdżona |

Typ spoza tabeli → `null` (zachowanie jak dziś, bez rozciągania sąsiadów).

Przykład, sekcja 2-kolumnowa, kolejność w modelu `[tekst1, avatar, tekst2]`:

```
[ tekst1 ][ avatar ]
[ tekst2 ][ avatar ]
```

`tekst1` → r1c1, `avatar` → r1–r2 c2, `tekst2` → kursor auto-placementu przechodzi do r2c1,
wolne. Kolejność `[avatar, tekst1, tekst2]` daje lustrzany układ.

## Renderowanie — jedna komórka na pole

Dziś dzieckiem grida jest tile (w grze) albo `.custom-sheet__editable` (w kreatorze, wrapper
z `withChrome`). `grid-row: span 2` musi trafić w element, który faktycznie jest dzieckiem grida,
inaczej układ w kreatorze rozjedzie się z układem w grze (ta sama klasa błędu co FEATURE-212).

`CustomSheetBody.renderSection` owija każde dziecko sekcji w jeden element komórki:

```html
<div class="custom-sheet__cell custom-sheet__cell--rows-2"> … tile … </div>
```

Modyfikator: `--rows-1`, `--rows-2`, brak modyfikatora dla `null`. W kreatorze `withChrome`
dokleja `custom-sheet__editable` (i chrome) **do tego samego diva** — bez drugiego wrappera.
Drzewo grida jest identyczne w grze i w kreatorze.

Zmienia się DOM gry (jeden div więcej na pole) → snapshot `CustomSheetBody.domShape`
aktualizowany świadomie. Sekcje główne (`.custom-sheet__sections`) nie dostają komórki.

## CSS

- `.custom-sheet__fields--{2..6}-col`: `grid-auto-rows: minmax(var(--sheet-row-unit), auto)`,
  `align-items: start`.
- `--sheet-row-unit` = wysokość tile tekstowego (~59px, potwierdzona w przeglądarce).
- `.custom-sheet__cell`: `display: flex; flex-direction: column`, pierwsze dziecko `flex: 1` —
  treść wypełnia komórkę (ten sam mechanizm, którego dziś używa `.custom-sheet__editable`).
- `.custom-sheet__cell--rows-1`: `min-height: var(--sheet-row-unit)`.
  `.custom-sheet__cell--rows-2`: `grid-row: span 2`, `min-height: calc(2 × jednostka + 8px)`.
  Komórki nie są rozciągane (`align-items: start`), więc pole 1-jednostkowe w wierszu z tabelą
  zostaje 1 jednostką.
- `minmax(…, auto)` to bezpiecznik: gdy pole urośnie ponad jednostkę (np. `attr` w wąskiej
  kolumnie układa części pionowo), wiersz się rozpycha zamiast przycinać treść.
- `align-items: start` kończy rozciąganie: tile tekstowy obok tabeli zostaje jedną jednostką.
- `select`, `checkbox`, `label` — dziś niższe od tile — wypełniają jednostkę, treść wyśrodkowana
  pionowo.
- `attr` bez rozwinięcia ma dziś ~75px (cyfra 1.55rem + nagłówek z kostką) — więcej niż jednostka.
  W komórce `--rows-1` jest ściśnięty (mniejsze paddingi, gap i cyfra) do wysokości tile
  tekstowego. `attr` z rozwinięciem bez zmian.
- `text_long` w komórce `--rows-2`: textarea rośnie do wysokości komórki zamiast zostawiać pustkę
  pod sobą.
- Rozmiar avatara (dziś 96px) dostrojony tak, by tile avatara = 2 jednostki + gap. Liczby
  sprawdzone w przeglądarce, nie wyliczone na oko.
- Reguły modyfikatorów deklarowane po regułach bazowych tile/attr (pułapka kolejności kaskady
  w `style.css`).

## Drag-and-drop w kreatorze

`indexInContainer` (`utils/sheetDnd.js`) grupuje komórki w wiersze po `top`, a `bottom` wiersza
liczy jako `max(bottom)` jego komórek. Komórka na 2 wiersze ma `top` wiersza, w którym startuje,
i `bottom` wiersza następnego — wiersze zachodzą na siebie. W przykładzie wyżej kursor
w szczelinie obok `tekst2` trafia przez `rows.find` w wiersz 1, a indeks liczony jest względem
`tekst1`/avatara.

Poprawka w `rowsOf`: dolna krawędź wiersza = `min(max(bottom) komórek, top następnego wiersza − GAP)`.
Dla zwykłych wierszy siatka i tak gwarantuje `max(bottom) ≤ top następnego − GAP`, więc nic się nie
zmienia; przycinane są tylko komórki wychodzące w dół. Dwa przypadki z przykładu:

- kursor w szczelinie obok `tekst2` → wiersz 2 → wstawienie za `tekst2` (indeks 3),
- kursor pod `tekst1`, nad `tekst2` → między wierszami → przed `tekst2` (indeks 2).

Odrzucone „wygrywa najniższy z pasujących wierszy”: naprawia pierwszy przypadek, ale nie drugi.
`isAfter`, `isRowLayout`, `ghostRectFor` bez zmian — komórka na 2 wiersze dzieli `top` z wierszem
startowym, a strona „przed/za” liczona jest po środku jej prostokąta.

## Testy

- `fieldRowSpan.test.js` — cała tabela typ → span, w tym `attr` z i bez `hasAdvances`
  oraz nieznany typ → `null`.
- `sheetDnd.test.js` — komórka na 2 wiersze, kursor w szczelinie wiersza 2 → indeks względem
  wiersza 2. Test najpierw czerwony na obecnym kodzie.
- `CustomSheetBody` — w grze każde pole sekcji siedzi w `custom-sheet__cell` z właściwym
  modyfikatorem; w kreatorze `custom-sheet__editable` jest na tym samym elemencie (brak
  podwójnego wrappera).
- Snapshot `domShape` — świadoma aktualizacja.
- Wysokości i opływanie (CSS) — jsdom nie liczy layoutu. Ręczny check w przeglądarce: 2 pola
  tekstowe obok avatara w sekcji 2- i 3-kolumnowej, `attr` z/bez rozwinięcia obok siebie,
  pole tekstowe obok tabeli, drag-and-drop obok avatara.

## Poza zakresem

- Krótka karta postaci (`CharacterDetails`).
- Ręczne nadpisywanie wysokości przez MG.
- Opływanie wokół pól o wysokości swobodnej (tabele, obrazy, sekcje zagnieżdżone).
