# FEATURE-166 — Możliwość wyjechania częścią obrazka poza scenę

**Status:** zaimplementowane 2026-08-28 (gałąź FEATURE-166), weryfikacja wizualna w toku
**Data:** 2026-08-27

## Cel

MG przygotowuje obrazki i tokeny **obok** sceny, a w trakcie gry wsuwa je na planszę jednym
przeciągnięciem. Gracze nie widzą niczego, co leży poza sceną.

Dziś przeciąganie obrazka jest twardo klamrowane do granic siatki (`SceneImage.jsx:138-163`), więc
poczekalnia nie istnieje. Obrazek da się natomiast wypchnąć poza scenę **rozciąganiem** — resize
(`SceneImage.jsx:200-260`) nie klamruje wcale. Ta niespójność znika razem z feature.

## Decyzje projektowe

| Pytanie | Decyzja |
|---|---|
| Co widzi gracz przy obrazku wystającym | Część w scenie — normalnie; część poza — przycięta na krawędzi |
| Rozmiar poczekalni | Stały margines `OFFSCENE_MARGIN_CELLS = 100` komórek (5000px) z każdej strony |
| Które obiekty mogą wyjeżdżać | Wyłącznie obrazki, wszystkie trzy warstwy. Tokeny postaci bez zmian |
| Wyszarzenie poczekalni u MG | Jedna nakładka-pierścień nad warstwami obrazków |
| Fit-to-screen | Kadruje siatkę, poczekalnia poza kadrem (semantyka bez zmian; arytmetyka dostała kotwicę dla MG w trybie `classic`) |
| Obrazek w całości poza sceną | Backend w ogóle go nie wysyła graczowi |
| Część wystająca | Przycięcie CSS wystarczy — gracz ma pełne dane obrazka już wprowadzonego |
| Obrazek obrócony | AABB obróconego prostokąta |

## Geometria i granice

Nowa stała w `warhammer-battle-helper-front/src/constants/scene.js`:

```js
export const OFFSCENE_MARGIN_CELLS = 100; // poczekalnia MG wokół siatki
```

`M = OFFSCENE_MARGIN_CELLS * CELL_SIZE` = 5000px. Obszar roboczy obrazków rośnie z
`[0, gridW*CELL]` na `[-M, gridW*CELL + M]` (analogicznie w osi Y).

### Zmiany w `SceneImage.jsx`

Wspólna czysta funkcja `clampToWorkspace(x, y, w, h, gridWidth, gridHeight) → { x, y }` używana
w obu ścieżkach:

| Miejsce | Dziś | Po zmianie |
|---|---|---|
| start dragu `:138-139` | `maxX: Math.max(0, gridW*CELL - width)` | `minX: -M`, `maxX: gridW*CELL + M - width` |
| ruch `:154-155` | `Math.max(0, Math.min(…, maxX))` | `clampToWorkspace(...)` |
| commit `:162-163` | `Math.max(0, Math.min(…, maxX))` | `clampToWorkspace(...)` |
| resize `:200-260` | **brak klamrowania** | `clampToWorkspace(...)` |

### Ruch grupowy

`useGroupDrag` klamruje jedną wspólną deltę przez `clampGroupDelta` (`tokenGeometry.js:166`), dziś
zawsze do granic siatki. Selekcja bywa mieszana — obrazki mogą wyjechać, tokeny postaci nie — a cała
grupa porusza się jednym wektorem. Rozwiązanie: policzyć dwa bounding boxy (osobno postacie, osobno
obrazki) i zastosować oba ograniczenia; na każdej osi wygrywa ciaśniejsze. Zachowuje to wzajemny
układ grupy i respektuje obie reguły.

Sygnatura zmienia się na:

```js
clampGroupDelta(delta, { charBbox, imageBbox }, gridWidth, gridHeight, marginCells) → { dCol, dRow }
```

`charBbox` lub `imageBbox` może być `null`, gdy selekcja zawiera tylko jeden rodzaj.

### Walidacja serwerowa

`UpdateSceneImage` i `BatchMoveSceneTokens` odrzucają pozycję poza poczekalnią. To obrona przed
zepsutym klientem, nie przed MG. `SceneImage.X/Y` to już `float64` — wartości ujemne model przyjmuje
bez migracji.

## Widoczność gracza (backend)

### Predykat

Jedno miejsce, `internal/service/GameService.go`:

```go
// SceneImageTouchesGrid reports whether any part of img can appear inside the scene grid.
// Rotation is handled via the axis-aligned bounding box of the rotated rect: the AABB always
// contains the rotated shape, so an image whose corner is visible to the GM is never withheld
// from players. The reverse error (sending an image the clip renders to nothing) is accepted.
func SceneImageTouchesGrid(img models.SceneImage, gridWidth, gridHeight int) bool
```

Środek obrotu = środek obrazka, zgodnie z CSS `transform: rotate` w `SceneImage.jsx:236`.
Cztery rogi po rotacji, min/max, przecięcie z `[0, gridW*CELL] × [0, gridH*CELL]`.

Przecięcie **ścisłe** — styk samą krawędzią (zerowe pole wspólne) liczy się jako *poza* sceną.

Wybór AABB zamiast dokładnego przecięcia (SAT): AABB myli się wyłącznie w stronę wysłania obrazka,
którego przycinanie i tak zredukuje do zera. Nigdy nie ukryje obrazka, którego róg MG widzi w scenie
— a to jest błąd, którego MG nie ma jak zauważyć bez pytania graczy.

### Trzy punkty wpięcia

Wszystkie już istnieją dla flagi `Hidden`; reguła granicy jedzie tym samym torem.

**1. Snapshot** — `FilterSceneImageTokensForUser` (`GameService.go:2341`), obok istniejącego warunku:

```go
if img.Hidden || !SceneImageTouchesGrid(img, scene.GridWidth, scene.GridHeight) {
    continue
}
```

**2. Pojedynczy ruch** — `UpdateSceneImage` (`GameService.go:1970-2030`). Funkcja już porównuje
`Hidden` przed/po i wybiera event. Zamiast dokładać drugą, równoległą tabelkę dla granicy, obie
reguły łączy jeden predykat widoczności:

```go
// playerCanSeeSceneImage — the single answer to "should a player hold this image at all".
func playerCanSeeSceneImage(img models.SceneImage, gridWidth, gridHeight int) bool {
    return !img.Hidden && SceneImageTouchesGrid(img, gridWidth, gridHeight)
}
```

Wybór eventu = porównanie tego predykatu przed i po zastosowaniu żądania:

| przed | po | do graczy |
|---|---|---|
| poza | poza | nic |
| poza | dotyka | `SceneImageAdded` — pełne dane, `TokenOverlay` zamaskowany |
| dotyka | poza | `SceneImageDeleted` |
| dotyka | dotyka | `SceneImageUpdated` (jak dziś) |

Ruch obrazka nie idzie przez `fetchGameState`, tylko przez różnicowy broadcast WS. Dzięki temu
wjazd na scenę jest natychmiastowy — gracz dostaje URL obrazka dokładnie w chwili, gdy MG go
wprowadza, i ani chwili wcześniej.

Połączony predykat naprawia przy okazji istniejący błąd: dziś odkrycie obrazka (`Hidden: false`)
leżącego poza sceną wysyła graczom `SceneImageAdded` niezależnie od pozycji (`GameService.go:1985`).
Po zmianie odkrycie poza sceną nie wysyła nic.

**3. Ruch grupowy** — `BatchMoveSceneTokens` (`GameService.go:2069-2081`). Dziś buduje `visibleImages`
odsiewając ukryte. Rozszerzenie o to samo przejście granicy: obrazki, które właśnie weszły, idą do
graczy jako `SceneImageAdded`, te które wyszły — `SceneImageDeleted`, reszta zostaje w
`SceneTokensMoved`.

**Dodatkowo** — `AddImageToScene` (`GameService.go:1812`) i `DuplicateSceneImage`
(`GameService.go:1917`) rozsyłają `SceneImageAdded` bezwarunkowo. Obie muszą przepuścić do graczy
tylko obrazki spełniające `playerCanSeeSceneImage`; MG dostaje event zawsze. Bez tego MG dodający
lub duplikujący obrazek prosto do poczekalni wysyła go graczom.

### Uwagi

Reguła jest **addytywna** wobec `Hidden` — obrazek ukryty pozostaje ukryty niezależnie od pozycji.
Żadna istniejąca ścieżka nie zmienia zachowania dla obrazków w całości wewnątrz siatki.

Warstwa `gm` i tak nie renderuje się graczom (`SceneViewport.jsx:783` — gate `isGM &&`). Reguła
stosuje się do niej jednolicie, ale realny efekt widać na warstwach `background` i `tokens`.

## Front

### Przycinanie u gracza

`SceneImage` renderuje obrazek w **nieobracanym** wrapperze o rozmiarze siatki:

```
<div class="scene-image-clip">     ← inset 0 (= siatka), bez rotacji
   overflow: hidden dla gracza     ← przycina w przestrzeni sceny
   overflow: visible dla MG
  <div class="scene-image">        ← x/y/width/height + rotate, jak dziś
```

Dlaczego wrapper, a nie `overflow: hidden` na warstwie: warstwa `tokens` to `MapTokensLayer`
z przeplatanym z-order obrazków i tokenów postaci. Przycięcie całej warstwy ucięłoby pierścienie HP
postaci stojących przy krawędzi siatki. Wrapper per obrazek zachowuje z-order i nie dotyka postaci.

Dlaczego wrapper się nie obraca: `clip-path` na obróconym elemencie obraca się razem z nim, więc
prostokąt sceny trzeba by przeliczać do lokalnego układu obrazka. Nieobracany wrapper tnie
w przestrzeni sceny za darmo, poprawnie dla dowolnej rotacji.

### Poczekalnia MG

W `SceneViewport`, wyłącznie gdy `isGM`, wokół `scene-viewport__content` pojawia się kontener
większy o `M` z każdej strony. `content` zachowuje rozmiar siatki i pozycję, więc współrzędne
obrazków i cała ścieżka gracza pozostają nietknięte.

**Wyjątek — tryb sterowania `classic`.** Sam powiększony `sizer` nie wystarcza: lewa i górna
poczekalnia leżą w ujemnych współrzędnych, których model scrollowania CSS nie obejmuje, więc
połowa poczekalni była nieosiągalna. `scene-viewport__transform` dostaje dla MG przesunięcie
kotwicy o `M` (`translate`), co przenosi całość w dodatnią przestrzeń scrollowalną, a `handleFit`
dolicza ten sam człon przy centrowaniu. **Semantyka `handleFit` się nie zmienia** — nadal kadruje
samą siatkę; zmienia się tylko arytmetyka, bo siatka nie zaczyna się już w punkcie (0,0) sizera.
Dla gracza i w trybie `modern` kotwica wynosi 0, więc oba wzory redukują się do poprzednich.

Nakładka-pierścień — jeden div nad warstwami obrazków, `pointer-events: none`:

```css
.scene-offscene-veil {
  /* Element ma rozmiar SIATKI, a pierścień rysuje border szerokości marginesu.
     content-box jest krytyczny — globalne `* { box-sizing: border-box }` (style.css:2)
     kazałoby borderowi zjeść szerokość i przyciemnić wnętrze siatki zamiast pierścienia. */
  box-sizing: content-box;
  border-style: solid;
  border-color: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
```

**Dwie zmiany względem pierwotnego projektu, obie wymuszone przez implementację:**

1. **Border zamiast `clip-path`.** Pierwotnie spec przewidywał `clip-path: polygon(evenodd, …)`
   z obwodem zewnętrznym i wewnętrznym. To **nie działa**: CSS `polygon()` tworzy jedną zamkniętą
   ścieżkę, więc osiem punktów daje samoprzecinający się ośmiokąt z dwiema diagonalnymi szczelinami.
   Pomiar ray-castem: przyciemnione tylko 74,8% pierścienia, goła cała lewa flanka. Border jest
   dokładny, tańszy w rysowaniu i nie wymaga clipa.
2. **Bez `backdrop-filter: grayscale(1)`.** Po poszerzeniu marginesu do 100 komórek nakładka ma
   ~11000×11000px. `backdrop-filter` wymusza ponowne komponowanie wszystkiego pod spodem przy
   każdym odrysowaniu, a MG bez przerwy panuje i zoomuje. Został sam przyciemniony wash + brak
   kratki. Jeśli okaże się to zbyt słabym sygnałem, tańszą alternatywą jest `filter: grayscale(1)`
   na samym obrazku, nie na tle.

Mgła celowo lekka: uchwyty resize i obramowanie selekcji leżą pod nakładką i muszą pozostać
czytelne. Jeśli w praktyce staną się nieczytelne, alternatywą jest wyniesienie uchwytów nad nakładkę.

Poczekalnia bez kratki — czytelnie odróżnia się od sceny.

### i18n

Brak nowych stringów. Feature nie dodaje UI z tekstem.

## Testy

Komponenty sceny nie mają testów renderujących (konwencja projektu) — testowana jest czysta
geometria i logika serwerowa.

**Go, `GameService_test.go`:**

- `SceneImageTouchesGrid`: w całości wewnątrz, w całości poza, przecinający krawędź, styk samą
  krawędzią (= poza), obrócony 45° z rogiem wchodzącym na scenę mimo prostokąta poza sceną.
- `FilterSceneImageTokensForUser`: obrazek poza sceną nie trafia do gracza; MG dostaje wszystko;
  `Hidden` nadal wygrywa niezależnie od pozycji.
- `UpdateSceneImage`: tabelka czterech przejść granicy (`Added` / `Deleted` / `Updated` / cisza).

**JS:**

- `clampToWorkspace` jako czysta funkcja — granice ujemne i dodatnie, obie osie, resize i drag.

## Znalezione przy okazji — osobne zgłoszenia

Feature ujawnił trzy rzeczy leżące poza jego zakresem. Żadna nie jest regresją i żadna nie blokuje
scalenia, ale każda zasługuje na własne zgłoszenie:

1. **Event grupowego ruchu wysyła `req.Characters` w komplecie** (`GameService.go:2176-2180`), więc
   id i współrzędne **ukrytego** umiejscowienia postaci trafiają do każdego gniazda gracza, mimo że
   filtr snapshotu je usuwa. Komentarz „nieznane id nic nie robią po stronie klienta" jest prawdziwy
   dla renderowania, nie dla tego, co idzie po drucie. Naprawa wymaga reguły widoczności postaci
   (`Hidden` **plus** `VisibleTo` z BUG-178), nie predykatu tego feature.
2. **`GET /games/:id/scenes` zwraca wszystkie obrazki scen bez filtrowania** dowolnemu zalogowanemu
   użytkownikowi (`SceneHandler.go:26-36`, routing `main.go:251` — tylko auth, brak sprawdzenia MG,
   brak `FilterSceneImageTokensForUser`). Wyciekały tamtędy ukryte obrazki, wartości ukrytych pasków
   HP i warstwa `gm` na długo przed tą gałęzią; aplikacja woła ten endpoint tylko z panelu MG, więc
   wykorzystanie wymaga ręcznie złożonego żądania.
3. **Zmniejszenie siatki zostawia obrazki poza obszarem roboczym** bez żadnej rekoncyliacji
   (`UpdateScene`). Gałąź zawiera własne złagodzenie — strażnik zapisu jest ograniczony do żądań
   zmieniających geometrię, więc osierocony obrazek nadal da się ukryć i zablokować. Sama decyzja
   (przyciąć przy zmniejszeniu? ostrzec? zostawić?) jest pytaniem produktowym.

## Świadomie poza zakresem

- **Tokeny postaci poza sceną.** Liczą się w komórkach, mają snap do siatki i zajętość
  `fightZones`; ujemne komórki dotykałyby snapu, kolizji i panelu bocznego. Osobny feature, jeśli
  okaże się potrzebny.
- **Dokładne przecięcie (SAT).** Eliminuje wyłącznie wyciek URL obrazka, którego gracz i tak nie
  zobaczy. ~40 linii geometrii plus testy za znikomy zysk.
- **Serwerowe przycinanie geometrii.** Nie działa z rotacją, wymaga osobnych pól crop. Gdy obrazek
  dotknął sceny, MG świadomie go pokazuje — przycinanie CSS wystarcza.
- **Przycisk „pokaż poczekalnię".** Margines jest ograniczony, obrazek nie może się zgubić.
