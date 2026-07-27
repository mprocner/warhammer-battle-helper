# FEATURE-154 — Przeciągnięcie postaci w trybie swobodnym prawdopodobnie nie zapisuje pozycji

**Status:** do weryfikacji ręcznej, potem fix
**Znalezione:** 2026-07-27, podczas brainstormingu FEATURE-152
**Ważne:** to wniosek z **czytania kodu**, nie z uruchomienia aplikacji. Przed naprawą potwierdzić
zachowanie w działającej grze — wnioskowanie statyczne może mieć lukę.

## Podejrzenie

`warhammer-battle-helper-front/src/components/DndContext.jsx:458`

```js
const handleCommitCharacterMove = (characterId, col, row) => {
  const zones = fightZonesRef.current;
  const zoneId = `zone-${row}-${col}`;
  const targetIdx = zones.findIndex(z => z.id === zoneId);
  const currentIdx = zones.findIndex(z => z.character?.id === characterId);
  if (targetIdx === -1 || currentIdx === targetIdx) return;   // ← wyjście
  // ...
  handleMoveCharacter(characterId, col, row);                 // ← nigdy nie wykona się
};
```

`fightZones` powstaje z `generateFightZones(gridWidth, gridHeight)` (`DndContext.jsx:310`), więc
`zone.id` jest budowane z **całkowitych** indeksów: `zone-0-0`, `zone-1-0`, …

W trybie swobodnym (`tokenPlacementMode === 'free'`) commit przekazuje pozycję ułamkową —
`MapCharacterToken.jsx:112-113`:

```js
const finalCol = Math.max(0, Math.min(snap ? Math.round(pos.col) : pos.col, gridWidth - size.w));
```

Czyli `col = 3.47` → `zoneId = "zone-2.31-3.47"` → `findIndex` zwraca `-1` → funkcja robi `return`
**przed** `handleMoveCharacter`, więc PUT na serwer nigdy nie leci. Token trzyma się lokalnie
(`justMovedRef` pomija jeden sync z propsów), ale po `fetchGameState()` z WebSocketa powinien
wrócić na starą pozycję.

## Co powinno działać mimo to

Inne ścieżki nie przechodzą przez ten lookup, więc powinny zapisywać poprawnie:

- **Image token** w free mode — własny commit w `SceneImage`, nie dotyka `fightZones`.
- **Group drag** (multi-select) — `handleCommitGroupMove` → `batchMoveTokens` (`DndContext.jsx:479`),
  bez sprawdzania stref.
- **Resize postaci** — `handleResizeCharacter` (`DndContext.jsx:491`) woła `fetch` bezpośrednio,
  bez lookupu strefy.

To dobry test różnicujący: jeśli group drag w free mode utrwala pozycję, a pojedynczy drag nie —
diagnoza się potwierdza.

## Kroki weryfikacji

1. Gra z `tokenPlacementMode = 'free'`.
2. Przeciągnąć **pojedynczą** postać na pozycję nienależącą do kratki, puścić.
3. Odświeżyć / wymusić `fetchGameState()`.
4. Czy token wrócił na starą pozycję? Jeśli tak — potwierdzone.
5. Kontrola: to samo z zaznaczeniem 2 tokenów (group drag) — powinno się zapisać.

## Szkic naprawy

Kolizja stref to reguła **snap mode**: „komórka jest zajęta" nie ma sensu przy pozycjonowaniu
ciągłym. Prawdopodobnie: sprawdzać strefę tylko gdy `snap`, a w free mode iść prosto do
`handleMoveCharacter(characterId, col, row)`. Kształt fixa ustalić po weryfikacji — możliwe, że
`fightZones` w ogóle nie powinno bramkować persystencji, tylko lokalny stan.

## Powiązane

- FEATURE-153 — cells vs px (kontekst, skąd biorą się ułamkowe `col`/`row`)
