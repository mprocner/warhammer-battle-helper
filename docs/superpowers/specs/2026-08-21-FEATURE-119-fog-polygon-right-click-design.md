# FEATURE-119 — Prawy przycisk kończy wielokąt w narzędziu mgły wojny

Data: 2026-08-21

## Cel

W trybie mgły wojny prawy przycisk myszy kończy rysowanie wielokąta — dokładnie tak, jak
kliknięcie lewym w pierwszy punkt. Gdy wielokąt ma mniej niż 3 wierzchołki (nie da się z niego
zrobić figury), prawy przycisk go porzuca. W pozostałych narzędziach mgły prawy przycisk
przerywa kształt rysowany w tej chwili.

## Stan obecny

Wielokąt zamyka się dziś jedynym sposobem: klik lewym w promieniu 15 px ekranu od pierwszego
punktu, przy co najmniej 3 wierzchołkach (`FogLayer.jsx:253`). Trafienie w mały cel bywa
uciążliwe przy dużym zoomie i przy wielokątach, których pierwszy punkt zjechał poza widok.

Prawy przycisk w warstwie mgły nie robi nic — `handleMouseDown` odrzuca wszystko poza
`e.button !== 0` (`FogLayer.jsx:232`), a canvas nie ma `onContextMenu`, więc wyskakuje natywne
menu przeglądarki.

Anulowanie wielokąta istnieje tylko pod klawiszem Escape (`FogLayer.jsx:195`).

Wzorzec do naśladowania jest świeży: FEATURE-120 dodała `handleContextMenu` w
`DrawingLayer.jsx:344` — prawy przycisk przerywa stroke w trakcie, w przeciwnym razie kasuje
ścieżkę pod kursorem. Tam też siedzą guardy na macOS ctrl+klik (`DrawingLayer.jsx:373`,
`DrawingLayer.jsx:434`), których `FogLayer` nie ma.

Backend bez zmian — wielokąt trafia na serwer istniejącą ścieżką `onPathComplete` z
`shape: 'polygon'`.

## Decyzje

| Pytanie | Decyzja |
|---|---|
| Prawy przy >= 3 wierzchołkach | Zamyka i zapisuje wielokąt |
| Prawy przy 1–2 wierzchołkach | Porzuca wielokąt (to samo co Escape) |
| Prawy gdy wielokąt nieaktywny | Nic, poza zablokowaniem menu przeglądarki |
| Zakres | Cały tryb mgły — w pozostałych narzędziach prawy porzuca kształt w trakcie |
| Narzędzie `pan` | Bez zmian — warstwa nie łapie zdarzeń, natywne menu działa |
| Testy | Czysty helper `canClosePolygon` + test jednostkowy |

Zakres „cały tryb mgły” zamiast „tylko wielokąt”, bo prawy przycisk ma znaczyć jedno:
*skończ to, co robisz*. Rozbieżność między warstwą rysowania a warstwą mgły byłaby pułapką dla
mięśniowej pamięci użytkownika.

## Przepływ

```
contextmenu na canvasie mgły
  │
  ├─ !isEditingFog (tryb pan lub brak trybu mgły) → return, natywne menu
  │
  ├─ preventDefault + stopPropagation
  │
  ├─ fogTool === 'polygon' && polygonActiveRef
  │     ├─ canClosePolygon(pts) → finishPolygon(commit = true)  → onPathComplete
  │     └─ w przeciwnym razie   → finishPolygon(commit = false) → sam reset
  │
  └─ isDrawingRef (freehand / rect / circle / line w trakcie)
        → isDrawingRef = false, currentPathRef = null, rectStartRef = null, render(null)
```

## Zmiany w kodzie

Jeden plik produkcyjny (`components/scene/FogLayer.jsx`) i jeden nowy plik testu
(`components/scene/FogLayer.test.js`).

### 1. Czysty helper

```js
export const MIN_POLYGON_POINTS = 3;
export const canClosePolygon = (points) => points.length >= MIN_POLYGON_POINTS;
```

Zastępuje gołe `pts.length >= 3` w dwóch miejscach: w snap-checku (`FogLayer.jsx:253`) i we
wskaźniku snapu w `render` (`FogLayer.jsx:146`). Próg dostaje nazwę zamiast być magiczną trójką
rozsianą po pliku.

### 2. `finishPolygon(commit)`

Lokalna funkcja (`useCallback`) w komponencie. Resetuje `polygonPointsRef`, `polygonActiveRef`,
`polygonCursorRef`, woła `render(null)`, a przy `commit === true` dodatkowo
`onPathComplete({ points, brushSize, shape: 'polygon', cover: fogCoverMode })`.

Trzy miejsca kasujące dziś te same refy schodzą do jednego wywołania: gałąź snapu w
`handleMouseDown`, handler Escape i nowy `handleContextMenu`.

Uwaga na kolejność: kopia punktów (`[...pts]`) musi powstać **przed** wyzerowaniem refa, tak jak
robi to dzisiejsza gałąź snapu.

### 3. `handleContextMenu`

Nowy handler wg przepływu wyżej, podpięty jako `onContextMenu` na canvasie.

`stopPropagation` jest tu profilaktyczne: `SceneViewport.jsx:718` ma własny `onContextMenu`, ale
reaguje wyłącznie przy `editingLayer === 'select'`, więc w trybie mgły i tak by nie zadziałał.

### 4. Guardy na macOS ctrl+klik

Na macOS ctrl+lewy przycisk to systemowa emulacja prawego: przeglądarka wysyła **oba** zdarzenia
— `contextmenu` i `mousedown` z `button === 0` — w kolejności niezdefiniowanej przez spec.

- `handleMouseDown` (`FogLayer.jsx:230`): `if (e.button !== 0 || e.ctrlKey) return;`
  Bez tego jedno kliknięcie dokłada wierzchołek **i** zamyka wielokąt.
- `handleMouseUp` (`FogLayer.jsx:320`): dodać warunek `e.button !== 0`.
  Bez tego zwolnienie prawego przycisku w trakcie ciągnięcia prostokąta zapisuje kształt, który
  miał zostać porzucony — na przeglądarkach, gdzie `mouseup` wyprzedza `contextmenu`.

Relay `handleMouseLeave` → `handleMouseUp` pozostaje sprawny: wg specyfikacji `button` ma
znaczenie tylko dla zdarzeń wciśnięcia/zwolnienia, a poza nimi wynosi 0.

## Testy

Nowy `components/scene/FogLayer.test.js` — testy jednostkowe `canClosePolygon`:

- 0, 1, 2 punkty → `false`
- 3 punkty → `true`
- 4 punkty → `true`

Reszta (refy, canvas, zdarzenia myszy) bez testów — zgodnie ze stanem komponentów `scene`,
gdzie `DrawingLayer.test.js` też pokrywa wyłącznie czystą funkcję pomocniczą.

Weryfikacja ręczna w aplikacji, jako GM w trybie mgły:

1. Wielokąt, 3+ punkty, prawy przycisk → figura zamknięta i odsłonięta, brak menu przeglądarki.
2. Wielokąt, 1 punkt, prawy przycisk → wielokąt znika, nic nie zapisane.
3. Prostokąt w trakcie ciągnięcia, prawy przycisk → kształt porzucony.
4. Narzędzie `pan`, prawy przycisk → natywne menu przeglądarki działa jak dotąd.

## Poza zakresem

- Wydzielenie logiki wielokąta do hooka `useFogPolygon` — `FogLayer.jsx` ma 378 linii i trzyma
  trzy refy tylko dla wielokąta, ale to refactor większy niż sam feature.
- Zmiany w backendzie, modelu, i18n i toolbarze — żadne nie są potrzebne.
