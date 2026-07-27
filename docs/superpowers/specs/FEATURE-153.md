# FEATURE-153 — Rozjazd jednostek: cells (character token) vs px (scene image)

**Status:** backlog (odłożone świadomie, nie bug)
**Znalezione:** 2026-07-27, podczas brainstormingu FEATURE-152
**Decyzja:** zostawić jak jest; ten dokument utrwala ustalenia, żeby nie odkrywać ich ponownie.

## Stan faktyczny

Dwa rodzaje tokenów na wspólnej warstwie (`MapTokensLayer`) trzymają geometrię w **różnych
jednostkach**. To nie jest przypadek ani zaszłość — wynika z domeny.

### Character token — ułamkowe **komórki**

| Miejsce | Dowód |
|---|---|
| `internal/models/Game.go:119-122` | `PositionX float64 // col in cells; float so "free" mode can be fractional`, analogicznie `PositionY`, `W`, `H` (width/height **w komórkach**) |
| `internal/models/Game.go:271-276` | `UpdateSceneCharacterRequest{ PositionX, PositionY, W, H *float64 }` — `float64` właśnie po to, żeby free mode mógł zapisać ułamek |
| `scene/MapCharacterToken.jsx:209` | render: `left: (pos.col + groupDCol) * CELL_SIZE` — **mnożenie** przez CELL_SIZE dopiero przy rysowaniu |
| `scene/MapCharacterToken.jsx:97-98` | drag: `const dCol = (e.clientX - mouseX) / z / CELL_SIZE` — **dzielenie**, delta wychodzi w komórkach |
| `scene/MapCharacterToken.jsx:112-116` | commit: `snap ? Math.round(pos.col) : pos.col` → `onCommitMove(id, finalCol, finalRow)` |

### Scene image — **piksele**

| Miejsce | Dowód |
|---|---|
| `internal/models/Game.go:296-300` | `Width`, `Height`, `Rotation float64` — px / stopnie |
| `scene/SceneImage.jsx:437-440` | render: `left: pos.x + groupDx` — **bez** CELL_SIZE |
| `scene/SceneImage.jsx:453` | snap preview: `Math.round(pos.x / CELL_SIZE) * CELL_SIZE - pos.x` — **dzieli** x przez CELL_SIZE, żeby przyciąć do kratki → x jest w px |

## Częste nieporozumienie

Przejście na „tryb swobodny" (`tokenPlacementMode === 'free'`) **nie** przekonwertowało pozycji
postaci na piksele. Zmieniło `int` → `float64`: ta sama jednostka (komórka), tylko ciągła zamiast
dyskretnej. `col = 3.47` znaczy „47% szerokości komórki w prawo od kolumny 3", a nie „3.47 px".

## Dlaczego zostawiamy

- **Semantyka się różni.** Pionek postaci należy do siatki bitewnej: jego rozmiar w komórkach
  („duży potwór = 2×2") jest wielkością z reguł gry, nie z warstwy prezentacji. Obraz sceny jest
  swobodną dekoracją/mapą — kratka go nie obowiązuje.
- **Koszt ujednolicenia.** Trzeba by przepisać drag/resize/persist dla postaci, model + repository
  + DTO w Go, oraz każde miejsce liczące w komórkach: marquee (`selectTokensInRect`), linijka
  (`onTokenDragMeasure*`), snap preview, `generateFightZones`. Plus migracja istniejących gier.
- **Nie blokuje niczego dzisiaj.** W szczególności FEATURE-152 (rotacja tokenów) jest wobec
  jednostek obojętna — math rotacji czyta środek z `getBoundingClientRect()` (screen px z DOM,
  `SceneImage.jsx:258-262`) i zwraca stopnie. Nigdy nie dotyka `image.x` ani `col/row`.

## Gdyby kiedyś robić

Kierunek: **px**, tak jak `SceneImage` (ono jest bliżej DOM-u, a `CELL_SIZE` i tak jest stałą).
`W`/`H` postaci zostawić w komórkach albo dodać obok wariant px — rozmiar w komórkach niesie
znaczenie regułowe i jego utrata byłaby regresją.

## Powiązane

- FEATURE-152 — rotacja tokenów (jednostko-agnostyczna, nie czeka na to)
- FEATURE-154 — free-mode move postaci nie zapisuje się (lookup po `zone-${row}-${col}`)
