# FEATURE-154 — Przeciągnięcie postaci w trybie swobodnym nie zapisywało pozycji

**Status:** NAPRAWIONE — 2026-07-28, gałąź `FEATURE-154`, commit `b4f5fe4`
**Znalezione:** 2026-07-27 podczas brainstormingu FEATURE-152 (z lektury kodu)
**Potwierdzone w aplikacji:** 2026-07-28, przed naprawą i po niej

## Objawy

W trybie swobodnym (`tokenPlacementMode === 'free'`) przeciągnięcie pojedynczego tokena postaci
nie zapisywało się — po odświeżeniu token wracał na starą pozycję. Przeciąganie grupowe i tokeny
będące obrazami działały poprawnie.

## Przyczyna źródłowa

Jedna, nie trzy: **pozycja tokena postaci pochodziła z `fightZones`**, czyli sztywnej siatki całych
komórek pozostałej po układzie dnd-kit, zamiast z placementu przechowywanego przez serwer. Backend,
math przeciągania i tokeny-obrazy operowały już na ułamkowych komórkach; ten jeden element został z
tyłu.

| Objaw | Mechanizm |
|---|---|
| Ruch się nie zapisuje | `handleCommitCharacterMove` szukał `zone-${row}-${col}`; ułamkowe `col`/`row` nie pasują do żadnego identyfikatora zbudowanego z liczb całkowitych, `findIndex` zwracał `-1`, funkcja robiła `return` przed `handleMoveCharacter` — PUT nigdy nie wychodził |
| Token przyskakuje do kratki | `placedCharacters` czytał `col: z.col` / `row: z.row` — współrzędne komórki, nie placementu; `fetchGameCharacters` wsadzał postać do siatki przez `Math.round(positionX)` |
| Token potrafił zniknąć | strefa mieści jedną postać (`clearedZones[zoneIndex] = {...}` nadpisuje); dwa tokeny zaokrąglone do tej samej komórki — jeden nie renderował się wcale |

Trzeci objaw nie był zgłoszony; wyszedł przy śledzeniu przepływu danych i wynikał z tej samej
przyczyny.

## Naprawa

Wyprowadzenie tokenów przeniesione do czystej funkcji `buildPlacedCharacters`
(`warhammer-battle-helper-front/src/utils/placedCharacters.js`), czytającej `positionX`/`positionY`
wprost z placementów sceny. To ten sam wzorzec, którym od początku posługują się obrazy —
`SceneViewport` filtruje je bezpośrednio z `displayedScene.images`, bez pośredniej siatki.

`fightZones` zostaje przy zadaniach, do których nadal się nadaje: pula postaci w panelu bocznym oraz
reguła zajętości komórki w trybie snap — jedynym trybie, w którym „komórka zajęta" ma sens.

Dwie zmiany wymuszone przez powyższe:

- czyszczenie aktywnego tokena pyta o placementy, nie o siatkę — inaczej token nieobecny w siatce
  byłby odznaczany natychmiast po zaznaczeniu;
- placement liczy się jako obecny na scenie niezależnie od tego, czy znalazła się dla niego wolna
  komórka — bez tego token mógłby jednocześnie stać na mapie i figurować jako dostępny w panelu.

Tryb snap przechodzi tą samą ścieżką co wcześniej; jego zachowanie się nie zmieniło.

## Testy

`src/utils/placedCharacters.test.js` — 9 przypadków, TDD z potwierdzonym RED. Pokrywają: ułamkową
pozycję przechodzącą bez zaokrąglenia, dwa placementy zaokrąglające się do jednej komórki, wartości
domyślne dla danych sprzed pól `w`/`h`/`rotation`, pierwszeństwo nakładki optymistycznej, zastępczy
obiekt dla widza bez karty postaci oraz delegowanie uprawnienia do przeciągania.

Nic w repo nie renderuje `DndContext`, więc samo podpięcie zostało zweryfikowane ręcznie w
działającej aplikacji, nie testem.

## Powiązane

- [FEATURE-153](FEATURE-153.md) — komórki vs piksele; nadal odłożone. Ta naprawa **nie** zmienia
  jednostki: pozycja postaci pozostaje w ułamkowych komórkach, po prostu przestała przechodzić przez
  siatkę całych komórek.
