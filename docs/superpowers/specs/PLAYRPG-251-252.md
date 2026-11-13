# PLAYRPG-251 + PLAYRPG-252 — Edycja i styl napisów w narzędziu rysowania

## Cel

Dziś napis to jednorazowy wpis: klik → pole → Enter. Nie da się go poprawić, przesunąć ani
obrócić; czcionka to zawsze `sans-serif`, jedna linia. Po zmianie:

- **252** — klik w istniejący napis otwiera go do edycji (treść + styl), napis można przesunąć.
- **251** — krój, rozmiar, pogrubienie, kursywa, obrys/tło, rotacja (suwak + uchwyt na mapie),
  wiele linii.

## Stan wyjściowy (co zmieniamy)

- `DrawingPath` (tekst): `points[0]`, `text`, `fontSize`, `color`. Brak operacji update —
  backend ma tylko add / undo-last / delete / clear.
- `points[0]` jest dziś **linią bazową** tekstu, a pole edycji stoi **górnym rogiem** w tym
  punkcie — po Enter napis podskakuje o wysokość linii. Naprawiamy przy okazji (kotwica = góra).
- Hit-test zgaduje szerokość (`0.6 × fontSize` na znak) — z innymi krojami i rotacją nie trafia.
- Brak walidacji tekstu po stronie serwera (długość, rozmiar).

## Decyzje

| Temat | Decyzja |
|---|---|
| Wejście w edycję | Narzędzie **Tekst**: klik w napis, który mogę edytować → edycja; w puste miejsce → nowy napis. Otwarte pole wygrywa: klik gdziekolwiek najpierw zapisuje (reguła FEATURE-121 bez zmian). Narzędzie **Zaznacz**: klik zaznacza, **podwójny klik** w napis → edycja. |
| Kto edytuje | Autor albo MG — ten sam predykat co usuwanie (`canEdit` = dawne `canDelete`). Cudzy napis jest przezroczysty dla kliku (jak przy usuwaniu): klik trafia w mój napis pod spodem albo tworzy nowy. Serwer sprawdza ponownie. |
| Kontrolki stylu | Sekcja **Tekst** w istniejącym panelu rysowania (prawy dół), widoczna przy narzędziu Tekst albo gdy zaznaczony jest napis. **Cel** kontrolek: otwarte pole edycji → styl tej sesji (zapis razem z treścią); inaczej zaznaczony napis → zapis od razu (PATCH, suwaki z debounce 250 ms); inaczej → domyślny styl następnego napisu. Kolor z palety podlega tej samej regule, gdy celem jest napis. |
| Krój | Lista stała, id zapisywane w danych (nie nazwa CSS): `sans` Roboto, `serif` Crimson Text, `display` Cinzel, `gothic` Grenze, `mono` monospace systemowy. Serwer odrzuca inne id. Grenze i warianty bold/italic Roboto ładowane leniwie (`@fontsource` dynamic import) przy pierwszym użyciu, potem `document.fonts.load` i przerysowanie canvasa — `fillText` z niezaładowaną czcionką rysuje zastępczą i sam się nie poprawi. |
| Rozmiar | Suwak 10–96 px; serwer przycina do 8–120. |
| B / I | Dwa przełączniki, pola `bold`, `italic`. |
| Obrys / tło | `textBackdrop`: `none` (domyślnie) / `outline` — halo 3 px w kolorze kontrastowym (czarny dla jasnego tekstu, biały dla ciemnego, próg luminancji 0.5) / `box` — półprzezroczysty prostokąt w kolorze kontrastowym (alfa 0.6) pod tekstem, padding 4 px. Kolory treści, nie chrome — dosłowne, poza tokenami motywu. Kolor obrysu/tła: `backdropColor` (`#rrggbb`), pusty = automatyczny kontrast; picker w sekcji Tekst, widoczny gdy tło ≠ brak, z przyciskiem powrotu do automatycznego. |
| Wiele linii | `textarea`: Enter zapisuje, Shift+Enter nowa linia, Esc anuluje. Linie rozdzielone `\n` w `text`, wysokość linii 1.2 × rozmiar. Limit serwera: 500 znaków, 20 linii. |
| Kotwica i rotacja | `points[0]` = lewy-górny róg pierwszej linii (`textBaseline = 'top'`). Obrót wokół kotwicy — napis „startuje tu i biegnie w tę stronę”, jak etykieta rzeki; dopisywanie tekstu przy obrocie wydłuża go wzdłuż kierunku zamiast przesuwać. Stopnie, normalizacja do (−180, 180]. |
| Rotacja — UI | Suwak −180…180° + przycisk „0°” w sekcji Tekst; uchwyt na mapie przy zaznaczonym napisie (narzędzie Zaznacz) — kółko z `RotateRightIcon` za końcem pierwszej linii, w kierunku tekstu. Drag używa `useTokenRotate` z nowym opcjonalnym `getPivot` (pivot = kotwica w px ekranu), z tym samym magnesem 45°. |
| Przesuwanie | Narzędzie Zaznacz: wciśnięcie na zaznaczonym napisie i ruch > 3 px → przeciąganie (podgląd na żywo), puszczenie → PATCH `points`. Tylko napisy (inne kształty poza zakresem). |
| Pusty tekst przy edycji | Zapis istniejącego napisu z pustą treścią = usunięcie (DELETE). Esc przywraca oryginał. |
| Cofnij | Bez zmian: usuwa ostatnio **dodaną** ścieżkę. Edycje nie są wpisami historii — Esc w trakcie edycji to jedyny „undo” zmiany. Opisane w pomocy. |
| Edytowany napis na canvasie | Ukryty, dopóki pole jest otwarte — pole stoi dokładnie w jego miejscu, z tym samym krojem, rozmiarem, B/I i obrotem (`transform-origin: 0 0`). |
| Współbieżność | Last write wins. `DRAWING_PATH_UPDATED` niesie cały path; klient podmienia go po `id`. |

## Backend

- `models.DrawingPath`: nowe pola `FontFamily string`, `Bold bool`, `Italic bool`,
  `Rotation float64`, `TextBackdrop string` (`omitempty` niepotrzebne — brak backward compat).
- `AddDrawingPathRequest` dostaje te same pola. `UpdateDrawingPathRequest` — wszystkie pola
  wskaźnikami (partial): `Text`, `Points`, `Color`, `FontSize`, `FontFamily`, `Bold`, `Italic`,
  `Rotation`, `TextBackdrop`.
- `normalizeTextPath(*DrawingPath) error` (czysta funkcja, `drawing_text.go`): `TrimSpace`
  całej treści (jak dziś frontend), pusty → błąd, limit znaków/linii, whitelist kroju (pusty →
  `sans`), clamp rozmiaru, normalizacja rotacji, whitelist `textBackdrop` (pusty → `none`).
  Wołana przy Add (dla `tool == "text"`) i Update (na scalonym wyniku).
- `PATCH /games/:id/scenes/:sceneId/drawing/path/:pathId` → `DrawingService.UpdateDrawingPath`:
  znajdź path, 404 gdy brak, 403 gdy nie autor i nie MG, 400 gdy `tool != "text"`, scal,
  normalizuj, `DrawingRepository.UpdateDrawingPath` (`$set` całego elementu przez arrayFilters
  `s._id` + `p._id`), broadcast `DRAWING_PATH_UPDATED {sceneId, path}`.

## Frontend

- `components/scene/drawingText.js` (czyste funkcje + testy): `TEXT_FONTS`, `textFontCss(path)`,
  `textLines`, `measureTextBox(path)` (offscreen canvas `measureText`, fallback na szacunek gdy
  brak canvasa — jsdom), `textBoxCorners`, `hitTestText` (punkt do lokalnych współrzędnych
  odwrotną rotacją), `contrastColor`, `normalizeRotation`, `ensureTextFont(fontId, bold, italic)`.
- `DrawingLayer`: rysowanie tekstu (linie, rotacja, backdrop), obrys zaznaczenia jako obrócony
  prostokąt, `hiddenPathId` (edytowany napis), `dragOffset` przeciąganego napisu, nowe wejścia:
  `onEditText(path)`, `onMoveText(pathId, point)`. Przerysowanie po załadowaniu czcionki.
- `useDrawingTextInput`: sesja `{pos, value, style, editingPath}`; `placeAt`, `editPath`,
  `setStyle`, `commit` (`onCommit({coords, text, style, editingPath})`), `cancel`. Hook
  przeniesiony do `DndContext` — panel i viewport są rodzeństwem, oba czytają sesję.
- `SceneViewport`: `textarea` w miejscu napisu; uchwyt rotacji (`DrawingTextRotateHandle`) nad
  zaznaczonym napisem.
- `DrawingToolbar`: sekcja Tekst (krój — natywny `select`, rozmiar, B, I, backdrop ×3, rotacja +
  reset). Dostaje `textStyle` i `onTextStyleChange(patch)`.
- `useDrawingTools`: domyślny styl tekstu (`fontFamily`, `bold`, `italic`, `rotation`,
  `textBackdrop`, `fontSize`).
- `GameSession`: `handleDrawingPathUpdate(pathId, patch)` — optymistyczny merge w stanie +
  PATCH; obsługa `DRAWING_PATH_UPDATED`.
- `api/scenes.js`: `updateDrawingPath`.

## Testy

- Go: `normalizeTextPath` (tabela), `UpdateDrawingPath` przez `mtest` — autor OK, obcy gracz 403,
  MG OK, nie-tekst 400, broadcast niesie znormalizowany path.
- JS: `drawingText.test.js` (hit-test z rotacją 0/90°, wiele linii, kontrast, normalizacja),
  `useDrawingTextInput.test.jsx` (edit/cancel/pusty = delete/styl sesji),
  `useTokenRotate.test.jsx` (`getPivot`), `DrawingToolbar.smoke.test.jsx` (sekcja Tekst, cel).
- Wygląd i gesty (drag, uchwyt, textarea nad obróconym napisem) — tylko przeglądarka; canvas
  nie ma testów renderujących.

## Dokumentacja

Changelog 1.0.0 (niewydany — punkt w sekcji `scene`), `06-scena.md`, wiersz w
`00-inwentaryzacja.md`, pomoc `02-game-screen.md` pl/en (narzędzie Tekst). Tutorial: krok
`drawingToolbar` celuje w `.drawing-toolbar` — bez zmian selektora; tekst kroku sprawdzić.

## Poza zakresem

- Przesuwanie i edycja innych kształtów niż tekst.
- Historia edycji w „Cofnij”.
- Wyrównanie tekstu, odstępy, własne czcionki użytkownika.
