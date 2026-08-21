# FEATURE-172 — Podpis odległości przy linijce skaluje się z zoomem

**Status:** backlog
**Znalezione:** 2026-08-21, podczas brainstormingu FEATURE-100

## Objaw

Plakietka z odległością przy linijce pomiaru (np. „12 m") zmienia rozmiar razem z zoomem sceny.
Przy zoomie 25% ma około 3 piksele wysokości i jest nieczytelna; przy 200% zajmuje dwa razy więcej
miejsca, niż powinna.

Deklaracja w CSS mówi `font-size: 12px`, ale to **nie jest** 12 pikseli ekranu.

## Przyczyna

| Miejsce | Dowód |
|---|---|
| `scene/MapRulerOverlay.css:10` | `.map-ruler-badge { font-size: 12px; }` |
| `scene/SceneViewport.jsx:849` | `<MapRulerOverlay ...>` renderowany wewnątrz `.scene-viewport__content` |
| `scene/SceneViewport.jsx:700` | przodek `.scene-viewport__transform` ma `transform: scale(${zoom})` |
| `scene/MapRulerOverlay.jsx:7-8` | komentarz pliku sam to stwierdza: *„the parent already lives in scene space (zoom is applied by an ancestor transform)"* |

`transform: scale()` nie zmienia jednostek — przeskalowuje **wyrenderowany obraz** całego poddrzewa.
Przeglądarka robi layout przy `font-size: 12px`, a potem mnoży gotowe piksele przez zoom. Realny rozmiar
na ekranie to `12 * zoom`.

Deklaracja `12px` opisuje więc rozmiar w **przestrzeni sceny**, nie na ekranie. Nie da się tego wyczytać
z samego pliku CSS — trzeba wiedzieć, gdzie komponent wisi w drzewie.

## Kontrprzykład w tym samym katalogu

`PointerPing.css` ma `width: 200px` i `border: 20px`. Te liczby wyglądają absurdalnie, dopóki nie
zauważysz, że są w jednostkach mapy. Ping **ma** być kółkiem o stałej wielkości w świecie gry, żeby
wskazywał to samo pole niezależnie od zoomu — i dlatego siedzi tam, gdzie siedzi. To jest poprawne
i nie należy tego ruszać.

Plakietka odległości ma odwrotny wymóg: stała wielkość na ekranie.

## Rozwiązanie

Kontrskalowanie. Plakietka musi zostać fizycznie w `__transform` (podąża za końcem linijki, czyli
potrzebuje współrzędnych sceny), ale ma odkręcić skalowanie tekstu:

```jsx
const { zoom } = useZoom();
// ...
style={{ transform: `translate(-50%, -140%) scale(${1 / zoom})` }}
```

Infrastruktura już istnieje: `scene/ZoomContext.js` + `useZoom()`. Korzystają z niej `SceneImage.jsx:26`
i `MapCharacterToken.jsx:24`.

Uwaga na kolejność w `transform` — obecny `translate(-50%, -140%)` z `MapRulerOverlay.css:5` musi zostać
połączony ze `scale`, a procenty w `translate` odnoszą się do rozmiaru elementu, więc kolejność
`translate` przed `scale` daje inny wynik niż odwrotna. Sprawdzić wizualnie przy 25%, 100% i 200%.

## Szersza perspektywa

SVG ma na ten problem wbudowane `vector-effect="non-scaling-stroke"`, ale **tylko dla obrysów** — dla
tekstu odpowiednika nie ma, stąd ręczne kontrskalowanie. Silniki rysujące mapę na canvasie
(np. Foundry VTT na PixiJS) omijają temat inaczej: scena i warstwa etykiet to dwa osobne rendery,
etykiety zawsze w rozdzielczości ekranu. Cena — nie da się ich stylować CSS-em.

## Zakres

Sprawdzić przy okazji, czy inne elementy interfejsu nie wpadły do `__transform` przez pomyłkę.
Kryterium: czy element opisuje **miejsce na mapie** (zostaje skalowany), czy **stan aplikacji**
(ma być stałej wielkości).
