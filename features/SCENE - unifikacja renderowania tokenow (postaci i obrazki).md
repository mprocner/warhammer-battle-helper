# SCENE — unifikacja renderowania tokenów (postaci + obrazki)

> Dokument referencyjny do przyszłego planu i implementacji. Zawiera ustalenia architektoniczne
> ORAZ konkretne fakty z kodu, żeby nie inwestygować ich od nowa. **Nic z tego nie jest jeszcze
> zaimplementowane** — to zapis dyskusji strategicznej.

---

## 1. Problem

Na mapie sceny żyją dziś **dwa niezależne modele renderowania i interakcji tokenów**, mimo że
renderują się w tej samej przestrzeni pikselowej (`scene-viewport__content`, canvas =
`gridWidth × CELL_SIZE`, `CELL_SIZE = 50`):

- **Tokeny postaci — model kratkowy (dyskretny).** Umieszczane przez komórki dnd-kit, jeden token
  na komórkę, pozycja jako `col/row` (liczby całkowite). Snap „za darmo", ale: brak resize, brak
  zajmowania wielu kratek, brak nakładania.
- **Obrazki — model pikselowy (ciągły).** Absolutne `x/y/width/height/rotation` w pikselach,
  własna obsługa myszy. Dowolny rozmiar/pozycja/obrót/nakładanie, ale zero przyciągania.

**Koszt:** każda funkcja dotykająca obu rodzajów tokenów (odległość, szablony AoE, zasięg, linia
wzroku) musi odpowiadać na to samo pytanie „gdzie token i jak duży" — a dziś odpowiedź jest inna
dla postaci i obrazka. To wymusza podwójną logikę i się nie skaluje. Bezpośrednim wyzwalaczem była
planowana funkcja **liczenia odległości** oraz chęć **resize tokenów postaci**.

---

## 2. Fakty z kodu (zinwestygowane)

### 2a. Tokeny postaci — model kratkowy
Łańcuch renderowania:
`DndContext.jsx` → `SceneViewport` (children) → `FightArea.jsx` → `Character.jsx` → `TokenOverlay.jsx`

- **`DndContext.jsx`**
  - `fightZones` = lista komórek `{ id, col, row, character }`, generowana przez
    `generateFightZones(gridWidth, gridHeight)` (regeneracja przy zmianie sceny/wymiarów).
  - Renderuje CSS grid `.fight-grid-inner` ze `style={{ gridTemplateColumns: repeat(gridWidth, ${CELL_SIZE}px) }}`
    (linia ~1003) i mapuje `fightZones` na `FightArea`.
  - Selekcja postaci: `activeTokenId` (useState, ~linia 77), `handleSelectToken`, `clearActiveToken`
    (czyszczone przez `onBackgroundClick`). Dodano tu też `selectedImageTokenId` +
    `handleSelectImageToken` (wzajemnie wykluczające się — jeden pierścień naraz).
  - Rozmieszczenie tokena na siatce: `handleAddCharacterToGrid`/`handleMoveCharacter` operują na
    `positionX`/`positionY` = **col/row** (int).
  - `game?.customSystemTemplate?.settings?.tokenDisplay` → `tokenDisplay` przekazywane do `FightArea`.
- **`FightArea.jsx`** — `useDroppable({ id: currentZone.id })`. Gdy `currentZone.character` istnieje,
  renderuje `<Character>`. Klik strefy → `onSelectToken`. Jedna postać na strefę/komórkę.
- **`Character.jsx`** — draggable (dnd-kit `useDraggable`), avatar + nazwa, montuje `TokenOverlay`.
- **Backend ruchu:** `MoveSceneCharacter` w `GameRepository` (`$set scenes.$[scene].characters.$[char].positionX/Y`,
  arrayFilters), broadcast `CHARACTER_MOVED`. Postać = osobna kolekcja Mongo (nie osadzona w scenie
  tak jak obrazki — `db.CharactersCollection`), ale pozycja na scenie jest w `scenes[].characters[]`.
- **Linie siatki = bordery komórek.** `.fight-zone { border-right/-bottom: 1px solid #d4a574; }`
  (`style.css` ~1510) + `.fight-grid-inner` border-top/left. **Widoczny grid jest sprzężony z
  droppable-komórkami dnd-kit.** Usunięcie komórek wymaga przerysowania siatki jako tła CSS
  (`repeating-linear-gradient` co 50px) — trywialne, ale trzeba pamiętać.

### 2b. Obrazki — model pikselowy
Łańcuch: `SceneViewport` → `SceneLayer` → `SceneImage`

- **`SceneImage.jsx`** — absolutny `div` (`left/top = x/y`, `width/height`, `transform: rotate`),
  ręczny drag/resize/rotate z przeliczaniem przez zoom, klampowanie do granic siatki
  (`gridWidth*CELL_SIZE - width`). Uchwyty resize (8) + rotate — tylko GM, tylko `editingLayer==='grid'`,
  tylko `!locked`. **Ta ręcznie napisana matematyka drag/resize/rotate to gotowy fundament dla
  swobodnego ruchu postaci w Fazie 3.**
- **`SceneLayer.jsx`** — sortuje po `zIndex`, kontener z `zIndex` per warstwa: `background:1`,
  `tokens:5`, `gm:10`. `pointer-events:none` na kontenerze, `auto` na obrazkach.
- **`SceneViewport.jsx`** — dzieli `displayedScene.images` po `img.layer` na `background`/`tokens`/`gm`
  (~linia 368) i renderuje trzy `SceneLayer`. Warstwa `gm` montowana tylko `isGM`; `tokens` i
  `background` dla wszystkich. Grid postaci (`children`) w `.scene-viewport__grid-layer` między nimi.
- **Backend:** `SceneImage` osadzony w `Scene.Images` w `Game.Scenes`. Update:
  `GameRepository.UpdateSceneImage` (dwupoziomowe `arrayFilters` scene/img). Broadcast `SCENE_IMAGE_UPDATED`.

### 2c. Dwa różne „layer"
- **`image.layer`** = `"background" | "gm" | "tokens"` — GDZIE obrazek żyje (pole na SceneImage).
- **`editingLayer`** = `null | "grid" | "fog" | "drawing"` — który TRYB edycji jest aktywny
  (`useFogTools.js`, przełączany w `DrawingToolbar.jsx`; drag/resize obrazków tylko przy `'grid'`).

### 2d. Geometria
- `src/constants/scene.js`: `CELL_SIZE = 50`, `getCanvasSize = (w,h) => ({ width: w*50, height: h*50 })`.
- Kąt slotu pierścienia (wspólny): `-90 + i*45` stopni (0 = góra, zgodnie z ruchem wskazówek).

---

## 3. Decyzje architektoniczne (uzgodnione)

### 3a. Kierunek unifikacji
Ujednolicić w stronę **modelu obrazków**: swobodne pozycjonowanie + snap do siatki + rozmiar
wyrażony w kratkach + rotacja + nakładanie. To standard VTT (Foundry/Roll20). Model kratkowy
(jeden token na komórkę CSS grid) to legacy-przypadek szczególny — jeśli unifikować, to w tę stronę,
**nigdy** wciskać obrazki w droppable-komórki dnd-kit.

### 3b. Wspólny renderer, ale DWA byty danych
- **Dobre:** warstwa tokenów staje się „warstwą tokenów mapy", na której żyją dwa rodzaje:
  token-postać i token-obrazek. Współdzielą: układ współrzędnych, snap, drag, resize, z-order,
  zaznaczenie, **odległość**.
- **Błędne (nie robić):** zamieniać postać w `SceneImage`. To błąd kategorii — postać jest podparta
  dokumentem `Character` (statystyki, rzuty, karta, właściciel/widoczność, HP z pola karty przez
  `resolveField`, stany z `character.states`), obrazek to freeform overlay bez karty. Dosłowne
  scalenie = dwa źródła prawdy o pozycji/stanie → piekło synchronizacji.
- **Wzorzec:** adapter / anty-korupcja: interfejs `MapToken { id, kind: 'character'|'image', col, row, w, h }`.
  Logika placement/drag/snap/dystans **wspólna**; zawartość (avatar+overlay z karty vs obrazek+overlay
  ręczny) i akcje domenowe (rzuty, otwarcie karty, drag bramkowany właścicielem) **wyspecjalizowane**
  (delegacja, nie kopiowanie).
- **Storage zostaje rozdzielony:** `GameCharacter` (dochodzi `w,h`) i `SceneImage` — dwa osobne byty.
  NIE scalać w jedną tablicę „tokens" z dyskryminatorem (pola zbyt różne, duża ryzykowna zmiana danych,
  znikoma korzyść). Unifikacja jest na **froncie (renderer + geometria)**.

### 3c. Kluczowy niuans — rozdziel motywacje
Praca dzieli się na dwie warstwy o różnym koszcie:
1. **„Odległość / funkcje między-tokenowe potrzebują jednego systemu"** → rozwiązuje **wspólna
   abstrakcja geometrii** (dane + util). **Tanie, niskoryzykowne.** Odległość da się dostarczyć
   RAZ na tej abstrakcji, mimo że każdy token wciąż renderuje się inaczej.
2. **„Resize postaci + swobodny ruch"** → wymaga **wymiany renderera** postaci (porzucenie
   droppable-komórek dnd-kit). **Drogie, dotyka serca multiplayera.**

### 3d. Kolejność prac (ważne!)
Zasada: **refaktoryzuj ze stanu zielonego, nie wpół-czerwonego** — feature ma działać i być
zweryfikowany, zanim przebuduje się podłoże (jego znane zachowanie = oracle regresji).

1. **Najpierw dokończyć i zweryfikować E2E domenową część ImageTokena** (overlay/config — jest
   foundation-independent, przetrwa refactor). Interfejs komponentu overlay trzymać **agnostyczny
   bytu** (`gameId, sceneId, entityId, dane-overlaya, canEdit`), żeby wpiął się na nową warstwę.
2. **Świadomie NIE budować snapu obrazków na starym `SceneImage`** — snap należy do wspólnej
   geometrii; zrobiony teraz w SceneImage to kod do wyrzucenia. Przyjdzie z refactorem, od razu dla
   obu rodzajów tokenów.
3. Dopiero potem refactor renderowania.

### 3e. „Zróbmy to teraz" (brak produkcyjnych klientów)
Argument słuszny: kasuje koszty **migracji/kompatybilności/rolloutu** (można czyścić stare gry,
kasować dnd-kit bez dual-path). NIE kasuje **złożoności implementacji i ryzyka regresji** — więc
robić, ale jako **te same uporządkowane fazy z checkpointami** (git-checkpoint przed Fazą 3), nie
„big bang", który jest niemożliwy do zbisektowania. „Refaktoryzuj ze stanu zielonego" obowiązuje
niezależnie od liczby użytkowników.

### 3f. Nie przeprojektuj
Wspólną geometrię projektować pod **trzy konkretne potrzeby**: odległość, resize postaci, tokeny
wielokratkowe. Nie pod wyobrażone przyszłe rzeczy (zasada [[no-speculative-future-proofing]]).

---

## 4. Proponowany plan fazowy

- **Faza 0 — wspólna geometria (tanio, odblokowuje wszystko).**
  Kanoniczny model umieszczania: `{ col, row, w, h }` w kratkach (postać domyślnie 1×1).
  Moduł `tokenGeometry.js`: `rectOf(token)` (→ px), `cellsOf(token)`, `snapToGrid(...)`,
  `distanceBetween(a, b, metric)`. Backend: postać dostaje `w,h` (domyślnie 1); obrazek-token
  wyprowadza `col/row/w/h` z `x/y/width/height ÷ 50`. Po tej fazie odległość i każda przyszła
  funkcja piszą się RAZ, niezależnie od renderera.
- **Faza 1 — snap obrazków-tokenów** (wyrażony w tej geometrii). Bonus: wielokratkowe tokeny-obrazki
  (czego postacie dziś nie potrafią). Implementacyjnie: kwantyzacja w handlerach zapisu
  `SceneImage.jsx` (`savePosition`/resize) — `snap(v)=round(v/50)*50`, `snapSize(v)=max(50, round(v/50)*50)`,
  bramkowane na `layer==='tokens'`. Bez zmian backendu (dalej px, wielokrotności 50).
- **Faza 2 — odległość / pomiar** na wspólnej warstwie. **Może wyjść przed Fazą 3** — jednolita
  odległość bez ruszania renderera postaci.
- **Faza 3 — unifikacja renderera + resize postaci** (droga, świadoma). Postacie przechodzą na
  absolutne pozycjonowanie + snap-drag (reużyć matematykę z `SceneImage`). Retire
  `fightZones`/`FightArea`/dnd-kit. Przerysować siatkę jako tło CSS. Dodać resize dla postaci
  (mają teraz `w,h`).

---

## 5. Decyzje semantyczne do zablokowania (wymuszone przez odległość/unifikację)

- **Metryka odległości:** euklidesowa (cale, typowe dla Warhammera) vs Chebyshev („każda kratka =1")
  vs 5-10-5. Decyzja zasadowa, nie techniczna.
- **Duże tokeny (2×2):** liczyć od środka, od najbliższej krawędzi, czy od zajmowanej kratki do
  kratki? Ma znaczenie dopiero przy tokenach >1 kratki.
- **Snap pomiaru:** odległość zaokrąglana do kratek czy „prawdziwa" pikselowa.
- **Jeden token na kratkę vs nakładanie:** model kratkowy dziś zabrania nakładania; model swobodny
  pozwala. Unifikacja = świadoma zmiana semantyki (w VTT zwykle OK).
- **Widoczność per-token** (`Character.visibleTo`) MUSI przetrwać na wspólnej warstwie — to metadana
  tokenu, nie właściwość warstwy (token-obrazki są dla wszystkich, ale postać może być ukryta).

---

## 6. Ryzyka Fazy 3

1. Usunięcie dnd-kit = utrata `DragOverlay`/collision/a11y → przenieść drag na wzorzec z `SceneImage`
   (mamy go, sprawdzony).
2. Widoczna siatka sprzężona z komórkami → przerysować jako tło CSS (repeating-linear-gradient).
3. Semantyka „jeden token na kratkę" znika (model swobodny pozwala nakładać) — świadoma zmiana.
4. Migracja danych mała: `positionX/Y` zostają sensowne (col/row), dochodzi `w,h=1`.
5. Stacking z-index: `.scene-viewport__grid-layer` (postacie) nie ma własnego z-index — zweryfikować
   w przeglądarce jak postacie usiądą względem warstw obrazków.

---

## 7. Reużywalne zasoby (nie wynajdujemy koła)

- **`SceneImage.jsx`** — ręczny drag/resize/rotate (przeliczanie zoom, klampowanie do granic,
  uchwyty, obrót) = gotowy fundament swobodnego ruchu postaci.
- **Kąt slotu pierścienia** `-90 + i*45` + geometria overlaya — już współdzielona wizualnie między
  `TokenOverlay` (postać) i `ImageTokenOverlay` (obrazek). Przy unifikacji renderera to okazja, by
  pogodzić oba overlaye (montować tak samo na `MapToken`), bo są ~80% takie same.
- **Wzorzec Foundry:** jedna warstwa tokenów, jeden `Token` z geometrią `{x,y,width,height}`, a to
  co token reprezentuje siedzi w podpiętym „aktorze" — dokładnie model docelowy.

---

## 8. Stan obecny (kontekst)

Cała dotychczasowa praca dotyczyła **ImageTokena** (zgodnie z kolejnością „najpierw dokończ
ImageToken, potem refactor"): warstwa `tokens`, overlay stanów/HP/liczb per-token, panel
konfiguracji (słoneczko), widoczność per-pasek i per-slot (domyślnie ukryte przed graczami),
kłódka współdzielenia slotu na scenie, edytowalny input liczby, duplikacja obrazków, skalowanie
pierścienia do rozmiaru tokena, blokada selekcji dla graczy. Szczegóły modelu:
[[image-token-overlay]] (pamięć projektu).
