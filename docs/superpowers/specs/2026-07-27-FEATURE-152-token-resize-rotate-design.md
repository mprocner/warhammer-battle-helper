# FEATURE-152 — Skalowanie i obrót pojedynczego tokena niezależnie od narzędzia

**Data:** 2026-07-27
**Status:** projekt zatwierdzony, gotowy do planu implementacji

## Problem

Zaznaczony pojedynczy token w narzędziu **Select** nie daje się skalować ani obracać. W narzędziu
**Pan** skalowanie działa. Rozbieżność jest arbitralna — ten sam token zachowuje się inaczej
zależnie od aktywnej zakładki.

Weryfikacja stanu wyjściowego (istotna, bo zgłoszenie zakładało więcej niż jest w kodzie):

- **Rotacji tokenów nie ma dziś wcale**, w żadnym narzędziu. Uchwyt obrotu istnieje wyłącznie dla
  obrazów sceny na warstwie background/GM (`SceneImage.jsx:504-512`), i tylko gdy ich warstwa jest
  uzbrojona w Select. Komentarz `SceneImage.jsx:515` mówi wprost o tokenach-obrazach:
  *„No rotate, matching characters."*
- Skalowanie tokenów bramkują dwa osobne, rozjechane warunki, oba wykluczające Select:

```js
// MapCharacterToken.jsx:129
const canResize = (isGM || canDrag) && (!editingLayer || activeTool === 'pan');
// SceneImage.jsx:516
isToken && selected && isGM && !image.locked && (editingLayer === null || activeTool === 'pan')
```

Feature obejmuje więc dwie rzeczy: domknięcie luki w Select oraz **dodanie rotacji tokenów**
(nowa funkcja dla obu rodzajów).

## Zakres

Pojedynczy token — postać **i** obraz — daje się skalować i obracać niezależnie od aktywnego
narzędzia (Pan albo Select).

Poza zakresem, celowo:

- rotacja zaznaczenia grupowego (obrót wokół centroidu przesuwa środek każdego tokena, więc to
  zapis pozycji wszystkich tokenów, nie samego kąta — inny problem);
- menu kontekstowe dla tokena postaci (osobny feature);
- ujednolicenie jednostek cells/px — [FEATURE-153](FEATURE-153.md);
- brak zapisu przy przeciąganiu postaci w trybie swobodnym — [FEATURE-154](FEATURE-154.md).

## Architektura

### Wspólny predykat widoczności uchwytów

Nowy czysty moduł `warhammer-battle-helper-front/src/utils/tokenManipulation.js`, wzorem
`utils/angleSnap.js`:

```js
export function canManipulateToken({
  allowed, locked, editingLayer, activeTool, imageEditLayer,
  activeSelected, groupSelected, multiSelectActive,
}) { ... }
```

Zwraca prawdę gdy `allowed && !locked` oraz spełniony jeden z warunków kontekstu:

| Kolejność | Kontekst | Warunek |
|---|---|---|
| 1 | Select, dokładnie jeden token | `editingLayer === 'select' && imageEditLayer === 'tokens' && groupSelected && !multiSelectActive` |
| 2 | Pan (domyślny) lub narzędzie pan | `(editingLayer === null \|\| activeTool === 'pan') && activeSelected` |

**Kolejność jest istotna, nie kosmetyczna.** `activeTool` mieszka w `useDrawingTools`
(`src/hooks/useDrawingTools.js:7`), a `editingLayer` w `useFogTools` — przełączenie zakładki nie
resetuje narzędzia. Użytkownik, który w trybie rysowania wybrał narzędzie Pan i przeszedł na
zakładkę Select, ma `editingLayer === 'select'` przy `activeTool === 'pan'`. Gdyby gałąź Pan była
sprawdzana pierwsza, przechwyciłaby ten stan i gałąź Select nigdy by się nie wykonała — czyli
feature nie działałby dokładnie tam, gdzie miał. Jawna zakładka wygrywa z zaległym narzędziem.

**Dwa różne pojęcia zaznaczenia — nie wolno ich mylić.** Aplikacja ma dwa niezależne stany
zaznaczenia i uchwyty zależą w każdym trybie od innego:

| Argument | Znaczenie | Źródło |
|---|---|---|
| `activeSelected` | token kliknięty/aktywny (jeden w całej scenie) | `activeTokenId === character.id` / `selectedImageId === image.id` — prop `selected` |
| `groupSelected` | token należy do zaznaczenia z marquee | `isTokenSelected(kind, id)` — prop `multiSelected` |

W Pan uchwyty pokazują się dla tokena aktywnego (dzisiejsze zachowanie). W Select dla tokena
z zaznaczenia grupowego, i tylko gdy jest ono jednoelementowe.

Predykat zastępuje `canResize` w `MapCharacterToken.jsx:129` i warunek w `SceneImage.jsx:516`, i
rządzi **obydwoma** uchwytami (skalowanie + obrót) w **obu** hostach.

Dwa argumenty zależą od hosta i muszą być podane jawnie, bo rodzaje tokenów mają różne modele
uprawnień i blokad:

| Argument | Token postaci | Obraz-token |
|---|---|---|
| `allowed` | `isGM \|\| canDrag` (zachowuje dzisiejszą regułę z `:129`) | `isGM` |
| `locked` | zawsze `false` — `GameCharacter` nie ma pola blokady | `image.locked` |

*Dlaczego wspólna funkcja, a nie dwa zsynchronizowane warunki:* rozjazd między zakładkami wziął się
z tego, że reguła istniała w dwóch kopiach. Jedna czysta funkcja usuwa klasę błędu, a nie tylko
bieżący jej przypadek. Przy okazji staje się testowalna bez renderowania komponentu.

*Konsekwencja:* obrót pojawia się także w Pan, nie tylko w Select. To celowe — token ma zachowywać
się tak samo niezależnie od narzędzia, a taki właśnie stan zakładało zgłoszenie.

*Warunek `imageEditLayer === 'tokens'`* wynika z istniejącej reguły Select: manipulowalna jest
tylko uzbrojona warstwa; na innej token jest tłem dla marquee (`MapCharacterToken.jsx:64`,
`SceneImage.jsx:21-23`).

### Rotacja — wspólny hook

`warhammer-battle-helper-front/src/components/scene/useTokenRotate.js`:

```js
useTokenRotate({ containerRef, rotation, setRotation, enabled, onCommit })
  → { isRotating, handleRotateStart }
```

Ciało to przeniesiona logika z `SceneImage.jsx:254-292`: środek z `getBoundingClientRect()`,
`Math.atan2`, `snapAngle`, listenery `mousemove`/`mouseup` na `document`, commit na puszczeniu.

*Dlaczego hook, skoro skalowanie zostaje per-host:* asymetria jest uzasadniona jednostkami.
Skalowanie operuje na geometrii modelu, a ta jest w różnych jednostkach — postać w ułamkowych
komórkach, obraz w pikselach (szczegóły: [FEATURE-153](FEATURE-153.md)) — więc wspólny kod
wymagałby rozgałęzień na rodzaj tokena. Rotacja czyta środek z DOM (screen px) i zwraca stopnie:
nie dotyka ani `image.x`, ani `col`/`row`. Jest jednostkowo obojętna, więc dzieli się bez szwów.

Uchwyt: nowy `TokenRotateHandle.jsx` obok istniejącego `TokenResizeHandles.jsx` — komponent
prezentacyjny, przyjmuje `onRotateStart`, renderuje `RotateRightIcon` nad tokenem. Ta sama umowa,
co `TokenResizeHandles`: uchwyt jest wspólny, math zostaje u hosta.

### Renderowanie obrotu

| Rodzaj | Węzeł obracany | Sposób utrzymania overlaya pionowo |
|---|---|---|
| Obraz-token | kontener `.scene-image` (już to robi, `SceneImage.jsx:444`) | opakowanie `<ImageTokenOverlay>` w `.scene-image__upright` z `rotate(-θ)` |
| Token postaci | `.map-char-token__avatar` (koło z obwódką) | nic — kontener się nie obraca, więc `.map-char-token__name` i `<TokenOverlay>` stoją same |

*Dlaczego obraz-token dostaje kontrobrót zamiast przeniesienia overlaya poza obracany węzeł:*
przeniesienie wymagałoby zdjęcia `transform` z kontenera, a wtedy uchwyty skalowania i obrotu
przestałyby się obracać razem z obrazem — dla obrazów tła to regresja, bo uchwyty mają trzymać się
narożników obróconego kształtu. Kontrobrót jest przy tym **dokładny**, nie przybliżony: root
overlaya to `.token-overlay` z `position: absolute; inset: 0` (`style.css:10412-10417`,
`TokenRingChrome.jsx:112`), więc jego `transform-origin` pokrywa się ze środkiem kontenera, a
złożenie `rotate(θ)` z `rotate(-θ)` wokół tego samego punktu daje identyczność. Opakowanie żyje w
`SceneImage`, więc `TokenRingChrome` i `TokenOverlay` — dzielone przez oba rodzaje tokenów —
zostają nietknięte.

Overlay nigdy się nie obraca: to UI odczytu (liczby HP, sloty stanów), które przy 90° byłoby
nieczytelne, a przy 180° do góry nogami. Tak samo rozwiązują to Roll20 i Foundry VTT.

Dla postaci obracany jest cały badge awatara, nie samo zdjęcie w środku. `.map-char-token__avatar`
ma `border-radius: 50%` i `overflow: hidden` (`style.css:10761-10766`), więc przy tokenie 1×1
różnica jest niewidoczna; ujawnia się przy niekwadratowym (elipsa).

`transform-origin` pozostaje domyślny (`50% 50%`), więc środek tokena jest nieruchomy —
linijka mierzy od `col + w/2` (`MapCharacterToken.jsx:89`) i obrotu nie zauważa.

`transform` nie zmienia layoutu, więc obrócony token niekwadratowy maluje się poza swoim
kontenerem, a marquee i podgląd przyciągania nadal czytają `w`/`h`. **To jest zamierzone:** obrót
jest kosmetyczny, ślad tokena na siatce się nie zmienia (jak w Foundry). Alternatywa — zamiana
`w`↔`h` — działałaby wyłącznie dla kątów prostych, a `snapAngle` jest magnetyczny, nie dyskretny:
przyciąga do wielokrotności 45° tylko w promieniu 10°, poza tym przepuszcza kąt surowy
(`utils/angleSnap.js:9-12`), więc token może stać pod 30°.

### Backend — pole `Rotation` dla tokena postaci

Obraz sceny ma już `Rotation` (`models/Game.go:300`). `GameCharacter` nie ma.

| Plik | Zmiana |
|---|---|
| `internal/models/Game.go` (`GameCharacter`, ~`:131`) | `Rotation float64 \`bson:"rotation" json:"rotation"\`` — tagi identyczne jak `SceneImage.Rotation`, bez `omitempty`: oba rodzaje tokenów muszą opisywać obrót tak samo, bo front ujednolica je jednym adapterem |
| `internal/models/Game.go:271` (`UpdateSceneCharacterRequest`) | `Rotation *float64 \`json:"rotation,omitempty"\`` |
| `internal/repository/GameRepository.go` (po `:1086`) | kolejny blok `if req.Rotation != nil { setFields["scenes.$[scene].characters.$[char].rotation"] = *req.Rotation }` |

`GameService.UpdateSceneCharacterGeometry` (`:1552`) i `SceneHandler.UpdateSceneCharacter` (`:191`)
bez zmian — przekazują cały request dalej.

Brak pola w istniejących dokumentach odczytuje się jako `0`, czyli brak obrotu. Migracja
niepotrzebna.

Widoczność dla graczy: `Rotation` to zwykłe pole placementu, nie element `TokenGear`, więc
przechodzi przez `FilterSceneCharacterTokensForUser` bez maskowania — token obraca się u wszystkich.
Obrót nie jest informacją poufną.

### Front — zapis obrotu postaci

`DndContext.jsx` dostaje `handleRotateCharacter(characterId, rotation)` zbudowany wzorem
`handleResizeCharacter` (`:491`): optymistyczny wpis do `charGeomOverride`, potem `PUT` na
`/games/:id/scenes/:sid/characters/:charId` z `{ rotation }`. Serwer rozgłasza po WebSocketcie,
klienci robią `fetchGameState()` — istniejąca ścieżka, bez nowego kanału.

Obraz-token korzysta z istniejącego `updateSceneImage(gameId, sceneId, imageId, { rotation })`
(`src/api/scenes.js:36`).

Adapter `characterToMapToken` (`utils/tokenGeometry.js:102-115`) twardo wpisuje `rotation: 0` z
komentarzem *„characters don't rotate (unreadable avatar + no facing in the rules)"* — po tej
zmianie nieprawdziwym. Musi czytać `gc.rotation || 0`. Dziś żaden konsument `MapToken` nie używa
pola `rotation` (linijka, marquee i przeciąganie grupowe czytają tylko `col`/`row`/`w`/`h`), więc
zmiana jest spójnościowa, nie funkcjonalna — ale zostawienie zera zakłamałoby model.

### Reset obrotu

`handleGroupResetRotation` (`DndContext.jsx:236-239`) iteruje dziś wyłącznie po `groupImages()` —
postacie były pominięte, bo nie miały czego resetować. Po dodaniu rotacji trzeba dołożyć postacie z
zaznaczenia, inaczej pozycja w menu grupowym kłamie.

Dla pojedynczej postaci reset odbywa się przez przeciągnięcie uchwytu do zera —
`snapAngle` magnetycznie łapie 0° w promieniu 10°. Menu kontekstowe dla tokena postaci
(`MapCharacterToken` nie ma dziś żadnego) to osobny feature.

## Testy

- `src/utils/tokenManipulation.test.js` — tablica prawdy predykatu: Pan; `activeTool === 'pan'`;
  Select z jednym tokenem; Select z dwoma (fałsz); Select na nieuzbrojonej warstwie (fałsz);
  token zablokowany (fałsz); brak uprawnień (fałsz).
- `src/components/scene/useTokenRotate.test.jsx` — hook na atrapie kontenera z podmienionym
  `getBoundingClientRect` (jsdom nie liczy layoutu): wejście w stan obracania, blokada przy
  `enabled: false`, ćwierć obrotu za wskaźnikiem, jednokrotny commit na `mouseup`, magnetyczne
  przyciągnięcie do 45°.
- **Bez testu komponentowego uchwytów.** Reguła widoczności jest w całości w predykacie i to on ma
  tablicę prawdy; wyrenderowanie `MapCharacterToken` wymagałoby atrapy `ZoomContext`, i18n i
  kilkunastu propsów, żeby sprawdzić to samo rozgałęzienie drugi raz. Sam render uchwytów
  weryfikowany ręcznie w aplikacji (kroki w planie).
- `snapAngle` ma już testy (`utils/angleSnap.test.js`) — bez zmian.
- Backend: nowy test nie powstaje. Warstwa repozytorium gry nie ma dziś zaplecza testowego
  (jedyny test repozytorium to `UserRepository_test.go`); dołożenie go byłoby osobną pracą.
  Zmiana to jeden blok `if` w istniejącym wzorcu sześciu identycznych.

## i18n

Nowy klucz `scenes.rotateToken` w `locales/en/translation.json` i `locales/pl/translation.json`.

## Ryzyka

- **Overlay poza obracanym węzłem (obraz-token).** Wymaga przestawienia DOM w `SceneImage`, a nie
  samego CSS. Trzeba sprawdzić, czy overlay nie polega na pozycjonowaniu względem obracanego
  rodzica.
- **Uchwyt obrotu a przeciąganie.** `handleMouseDown` tokena pomija naciśnięcia na
  `.map-char-token__handle` i `.token-overlay` (`MapCharacterToken.jsx:53`). Klasa uchwytu obrotu
  musi trafić do tego samego wykluczenia, inaczej obrót zacznie od przeciągnięcia tokena.
- **Kolizja z marquee w Select.** Naciśnięcie uchwytu musi zatrzymać propagację, żeby
  `handleContentMouseDown` w `SceneViewport` nie zaczął rysować prostokąta zaznaczenia.

## Powiązane

- [FEATURE-153](FEATURE-153.md) — cells vs px (świadomie odłożone; rotacja jest wobec tego obojętna)
- [FEATURE-154](FEATURE-154.md) — brak zapisu pozycji przy przeciąganiu postaci w trybie swobodnym
- FEATURE-143 — magnetyczne przyciąganie kąta co 45° (`snapAngle`, wykorzystywane tutaj)
