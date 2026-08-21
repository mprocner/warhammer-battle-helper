# FEATURE-120 — Prawy przycisk usuwa rysunek w trybie rysowania

Data: 2026-08-21

## Cel

W trybie rysowania prawy przycisk myszy usuwa rysunek pod kursorem — natychmiast, bez
potwierdzenia i bez przełączania narzędzia. Dodatkowo najechanie kursorem na własny rysunek
podświetla go, więc widać co zniknie, zanim się kliknie.

## Stan obecny

Usunięcie ścieżki wymaga dziś trzech kroków: przełącz na narzędzie `select`, kliknij ścieżkę,
naciśnij `Delete` (`DrawingLayer.jsx:291`) albo kosz w toolbarze (`DrawingToolbar.jsx:262`).

Prawy przycisk w warstwie rysowania jest ignorowany (`DrawingLayer.jsx:317`), a komentarz przy
tym `return` jest nieaktualny — twierdzi, że prawy przycisk panuje widokiem, co przestało być
prawdą (`SceneViewport.jsx:304`).

Backend jest gotowy i nie wymaga zmian:
- `DELETE /games/:id/scenes/:sceneId/drawingPaths/:pathId` (`DrawingHandler.go:73`)
- uprawnienie właściciel-lub-GM (`DrawingService.go:175`)
- broadcast `DRAWING_PATH_REMOVED` (`DrawingService.go:183`)
- `DrawingPath.userId` wystawiony w JSON (`Game.go:377`), więc front może filtrować lokalnie

## Decyzje

| Pytanie | Decyzja |
|---|---|
| Kasowanie natychmiastowe czy menu kontekstowe | Natychmiastowe |
| W których narzędziach | We wszystkich (w `pan` warstwa i tak nie łapie zdarzeń) |
| Cudza ścieżka pod kursorem | Pomijana — hit-test szuka dalej w głąb |
| Prawy klik w trakcie rysowania | Anuluje bieżący kształt, nic nie kasuje |
| Styl podświetlenia hover | Ten sam cyan co zaznaczenie, alpha 0.35, linia ciągła |

Filtr uprawnień po stronie klienta to wygoda UX, nie zabezpieczenie — serwer pozostaje
ostateczną instancją i odrzuci cudzą ścieżkę niezależnie od tego, co wyśle front.

## Przepływ

```
prawy klik na canvasie
   │
   ▼
DrawingLayer.handleContextMenu
   ├─ tryb rysowania nieaktywny? → return (menu przeglądarki działa normalnie)
   ├─ preventDefault
   ├─ trwa rysowanie? → anuluj kształt, return
   └─ findDeletablePathAt(paths, x, y, canDelete)
        └─ trafienie → onDeletePath(id)
              └─ DndContext.handleDeleteSelectedDrawing  [istnieje]
                    └─ DELETE → WS DRAWING_PATH_REMOVED → refetch → re-render
```

## Jednostki

| Jednostka | Odpowiedzialność | Zależności |
|---|---|---|
| `findDeletablePathAt(paths, px, py, canDelete)` — nowa, czysta funkcja w `DrawingLayer.jsx`, eksportowana nazwanym eksportem | zwraca `id` najwyżej położonej ścieżki trafionej **i** kasowalnej; `null` gdy brak | `hitTestPath` |
| `handleContextMenu` — nowy handler | tłumaczy zdarzenie na jedną z trzech akcji: nic / anuluj / usuń | `findDeletablePathAt`, refy rysowania |
| gałąź hover w `handleMouseMove` | ustawia `hoveredPathId` tylko przy zmianie wyniku hit-testu | `findDeletablePathAt` |
| `drawHighlight(ctx, path, { alpha, dashed })` — uogólniony `drawSelectionHighlight` | maluje poświatę zaznaczenia albo hovera | — |
| `onDeletePath` — istniejący prop | wysyła DELETE | bez zmian |

Nowe propsy `DrawingLayer`: `userId`, `isGM`. Oba są już w `SceneViewport`
(`SceneViewport.jsx:33`, `:43`) — wystarczy przekazać je w dół przy `<DrawingLayer>`
(`SceneViewport.jsx:832`). Po obu stronach to hex string, więc porównanie `===` jest poprawne
(tak samo porównywane w `DndContext.jsx:65`).

Predykat trzymany w jednym miejscu:

```js
const canDelete = (path) => isGM || path.userId === userId;
```

## Zachowanie, przypadek po przypadku

| Sytuacja | Efekt |
|---|---|
| Prawy klik na własną ścieżkę | Usunięta natychmiast, bez potwierdzenia |
| Prawy klik na cudzą (gracz) | Pomijana, szukamy dalej pod spodem; brak kasowalnej → nic |
| GM prawy klik na dowolną | Usunięta |
| Prawy klik w pustce | Nic; zaznaczenie zostaje bez zmian |
| Prawy klik w trakcie ciągnięcia kształtu | Kształt porzucony, zapisane ścieżki nietknięte |
| Narzędzie `pan` | `pointerEvents: none` — zdarzenie nie dociera, menu przeglądarki normalne |
| Tryb mgły / tryb domyślny | Canvas rysowania nieaktywny — bez zmian |

### Anulowanie rysunku

Wystarczy wyzerować `isDrawingRef.current`, `currentPathRef.current`, `shapeStartRef.current`
i przerysować. Późniejsze `mouseup` nie zapisze ścieżki, bo `handleMouseUp` ma już strażnika
`if (!isDrawingRef.current || !isDrawingMode) return` (`DrawingLayer.jsx:381`); to samo dotyczy
`handleMouseLeave`. Flagi „porzucone" nie dokładamy — mniej stanu, mniej rzeczy do rozjechania.

### Kolejność zdarzeń

Przeglądarka odpala `mousedown` (button 2) przed `contextmenu`. `handleMouseDown` odrzuca
wszystko poza `button === 0`, więc prawy przycisk nie rozpoczyna rysowania i do `contextmenu`
docieramy z nietkniętym stanem. Ten `return` zostaje; poprawiamy tylko jego komentarz.

`stopPropagation` **nie** jest potrzebny i celowo go nie dokładamy. Jedyny handler `contextmenu`
na ścieżce bąbelkowania z canvasu siedzi na `.scene-viewport__content` (`SceneViewport.jsx:718`)
i otwiera menu grupowe tokenów tylko przy `editingLayer === 'select' && selectedTokens.length > 1`.
W trybie rysowania oba warunki są nieosiągalne: wyjście z trybu Select czyści zaznaczenie
(`DndContext.jsx:136`), a strażnik i tak by zdarzenia nie przepuścił. `SceneImage.jsx:427` nie jest
przodkiem canvasu, a menu obrazka i tokenów nasłuchują na `document` w fazie przechwytywania, więc
`stopPropagation` z fazy bąbelkowania nic by im nie zrobił.

## Hover podświetlenie

Podświetlamy wyłącznie ścieżki kasowalne — dokładnie te, które prawy klik zabierze. Jedna reguła
(`canDelete`), dwa zastosowania. Hover działa w tych samych narzędziach co kasowanie, czyli we
wszystkich poza `pan`; dla GM-a oznacza to każdą ścieżkę na scenie.

Gałąź hover wchodzi w `handleMouseMove` **przed** strażnikiem
`if (!isDrawingRef.current || !isDrawingMode) return` (`DrawingLayer.jsx:355`). Hit-test liczymy
przy każdym ruchu, ale `setHoveredPathId` wołamy tylko gdy wynik się zmienił, więc przerysowanie
canvasu następuje na wejściu i zejściu z rysunku, a nie przy każdym zdarzeniu myszy.
W trakcie ciągnięcia kształtu hover jest wyłączony. `onMouseLeave` czyści hover.

`drawSelectionHighlight` uogólniamy do `drawHighlight(ctx, path, { alpha, dashed })`:
zaznaczenie woła `{ alpha: 0.7, dashed: true }`, hover `{ alpha: 0.35, dashed: false }`.
Gałąź `text` sama dziś zeruje `setLineDash` (`DrawingLayer.jsx:243`) — po uogólnieniu słucha
parametru.

Kolejność malowania w `render`: zapisane ścieżki → podgląd na żywo → hover → zaznaczenie.
Zaznaczenie na wierzchu, bo jest stanem trwałym; hover pod nim, bo jest przelotny.

## Testy

Warstwy canvas nie mają testów renderujących i to się nie zmienia (rysowanie na `<canvas>`
w jsdom to atrapa). Testujemy czystą funkcję.

Nowy plik `DrawingLayer.test.js`, przypadki dla `findDeletablePathAt`:

1. trafienie we własną ścieżkę → jej `id`
2. trafienie w cudzą, gdy nie jesteś GM → `null`
3. cudza na wierzchu, własna pod spodem w tym samym punkcie → `id` własnej
4. GM trafia w cudzą → jej `id`
5. klik w pustce → `null`
6. dwie własne nachodzące → `id` dodanej później

Punkty 3 i 6 to serce reguły; reszta to strażnicy.

## i18n

Jeden klucz do zmiany: `scenes.drawingDelete` — tooltip kosza wspomina o prawym kliku
(np. „Usuń zaznaczone (lub prawy klik na rysunku)"). Równolegle w `en` i `pl`. Nowych kluczy brak.

## Sprzątanie w tym samym commicie

- nieaktualny komentarz „right button → pan" przy `DrawingLayer.jsx:317`
- nagłówkowy blok dokumentacyjny komponentu (`DrawingLayer.jsx:4-19`) — dopisać hover i prawy klik

## Poza zakresem

Backend, narzędzie „gumka" w toolbarze, kasowanie przeciąganiem, zmiana kursora przy hoverze,
potwierdzenie usunięcia, menu kontekstowe rysunku.
