# BUG-194 — Ikona rotacji tokenu nachodzi na górny slot pierścienia

Data: 2026-09-11
Status: zaakceptowany, do implementacji

## Problem

Po zaznaczeniu tokenu uchwyt rotacji (`.token-rotate-handle`) leży dokładnie na slocie 0
pierścienia stanów.

Kolizja jest **matematycznie dokładna, nie zależna od rozmiaru tokenu**:

- `.token-rotate-handle` (`style.css:10984`): `top: -26px`, wysokość `18px` → środek **17px nad
  górną krawędzią** tokenu.
- slot 0 (`utils/tokenRingGeometry.js`): `ringRadius = halfLong + RING_MARGIN`, `RING_MARGIN = 17`
  → środek również **17px nad górną krawędzią**.

`halfLong` skraca się po obu stronach, więc token 1x1 (50px) i 3x3 (150px) mają ten sam zerowy
odstęp. Rozjeżdża się jedynie token szerszy niż wyższy, o `(w − h) / 2`.

Rozmiar wpływa natomiast na **gęstość pierścienia** — odstęp sąsiednich slotów to
`2 · r · sin(22.5°) ≈ 0.765 · r`:

| token | `r` | odstęp środków | ikona slotu | luz |
|---|---|---|---|---|
| 1x1 | 42 | 32px | 22px | 10px |
| 3x3 | 92 | 70px | 22px | 48px |

Dlatego na małym tokenie nie da się wcisnąć niczego *obok* slotu — i tam objaw jest dotkliwy.

### Drugi, ukryty wariant tej samej usterki

Oba rodzaje tokenów obracają się inaczej:

| host | co dostaje `rotate()` | zachowanie uchwytu |
|---|---|---|
| `MapCharacterToken` | tylko `.map-char-token__avatar` (`:298`) | nieruchomy → stała kolizja ze slotem 0 |
| `SceneImage` | cały kontener `.scene-image` (`:456`) | **obraca się razem z tokenem** |

Pierścień slotów na obrazku jest kontr-obrócony (`.scene-image__upright`, `:495-496`), a uchwyt
nie — więc orbituje po pierścieniu i wpada kolejno w każdy slot. Ten sam bug, tylko przerywany.

**Konsekwencja projektowa:** samo przeniesienie uchwytu na równik nie wystarczy. Uchwyt musi
trafić do kontr-obrotu, inaczej na obrazku odjedzie z kolumny i wjedzie w czaszkę.

## Zakres

Wyłącznie frontend. Backend, model rotacji i matematyka kąta (`useTokenRotate`, `angleSnap`)
bez zmian.

## Rozważone alternatywy

| Wariant | Werdykt |
|---|---|
| Odsunąć pierścień (`RING_MARGIN`↑), ikona w rogu | Odrzucony. `RING_MARGIN` jest nośne: wyliczają się z niego `EQUATOR_GAP` i `HP_CLEAR`, a `style.css` trzyma zsynchronizowane ręcznie literały (`top: -50px` na `.token-hp-stack--expanded`, `bottom: -54px` na nazwie postaci). Róg też nie jest wolny — slot diagonalny leży ~4.7px na zewnątrz rogu, a w samym rogu siedzi `.token-resize-handle--ne`. |
| Mniejsza ikona na ramce zaznaczenia | Odrzucony. Ramka to 8 uchwytów resize. Wolny łuk przy 22.5° na tokenie 50px ma `2 · 25 · sin(11.25°) = 9.75px`, a same połówki sąsiednich uchwytów zajmują 10px — luz ujemny, zanim postawimy ikonę. |
| Martwy kąt tuż za pierścieniem (22.5°) | Odrzucony. Przy aktywnym slocie 0 (push 16, chip 46px) odstęp środków spada do ~23px przy potrzebnych ~20 — ta sama klasa „zero slack", którą komentarz w `TokenRingChrome.jsx` opisuje jako źródło pętli flickera. |
| Tylko skrót klawiszowy, bez ikony | Odrzucony jako jedyne rozwiązanie — zerowa odkrywalność. Trafia obok, jako przyspieszacz (FEATURE-200). |
| **Kolumna prawego równika** | **Wybrany.** |

### Jak robią to inne systemy

- **Roll20** — uchwyt na górze tokenu i **dokładnie ten sam bug** (wątek „How do I rotate the token
  when the three bubbles keep covering the spoke…"). Obejście społeczności to nie przesunięcie
  uchwytu, tylko klawisz: `E` + kółko (snap 45°/30°), `ALT` = 1°.
- **Foundry VTT** — brak uchwytu w ogóle: `Shift`+kółko / `Shift`+WASD, `Ctrl`+kółko na drobny krok.
- **Figma / Illustrator** — brak ikony; strefa hover tuż za narożnym uchwytem, sygnalizowana kursorem.

Wspólny wniosek: każdy, kto miał chrome wokół tokenu, wyprowadził rotację poza pierścień albo na
klawisz. Ten spec robi pierwsze, FEATURE-200 dokłada drugie.

## Decyzje projektowe

| Pytanie | Decyzja |
|---|---|
| Gdzie | Prawa kolumna równika, pod czaszką i okiem: `x = equatorX`, `y = EQUATOR_STACK_STEP * 2` (52). |
| Pozycja stała czy upakowana | **Stała.** Czaszka wymaga `canEdit`, oko wymaga GM — na tokenie gracza obie znikają i rotacja wisi sama na `y = 52`. Stabilność pozycji między rolami bije zwartość: ikona skacząca w górę, bo GM coś przełączył, jest gorsza niż luka. |
| Gdzie mieszka komponent | Zostaje `TokenRotateHandle`. `TokenRingChrome` odpada — renderuje się tylko gdy istnieje `tokenDisplay \|\| tokenView` (`MapCharacterToken.jsx:303`), a rotacja musi działać na tokenie bez żadnej konfiguracji overlaya. |
| Kontr-obrót | `TokenRotateHandle` dostaje prop `counterRotate`. `SceneImage` podaje `rotation`, `MapCharacterToken` podaje `0`. |
| Wygląd | Nowy `.token-rotate-toggle` wzorowany na `.token-gear` (22px koło, border `#c9975b`, tło `rgba(20,12,4,0.75)`). Stary `.token-rotate-handle` **usuwany** — styl uchwytów resize wyglądałby obco w kolumnie przycisków. |
| Tooltip | Zostaje natywny `title` z `t('scenes.rotateToken')`. Przejście całej kolumny na portal tooltip to osobna porządkówka. |
| Skrót `R` | Poza zakresem → FEATURE-200 (wymaga rejestru skrótów; dołożenie czwartego rozsypanego listenera `window` byłoby długiem). |

## Rozwiązanie

### `utils/tokenRingGeometry.js`

Nowa eksportowana stała zastępuje magiczne `26` w `TokenRingChrome.jsx:185` oraz nowe `52`:

```js
// Pionowy rytm kolumny prawego równika: czaszka (0), oko (1x), rotacja (2x). Jedno źródło, żeby
// kolumna nie rozjechała się przy dokładaniu kolejnej ikony.
export const EQUATOR_STACK_STEP = 26;
```

`tokenRingGeometry()` bez zmian — `equatorX` już jest tym, czego potrzebuje uchwyt.

### `components/token-display/TokenRingChrome.jsx`

Literał `26px` w transformacie oka (`:185`) zastąpiony przez `EQUATOR_STACK_STEP` (import
dołączony do istniejącego z `tokenRingGeometry`).

### `components/scene/TokenRotateHandle.jsx`

Nowe propsy: `width`, `height`, `counterRotate = 0`.

Struktura renderu — kotwica `inset: 0` z `rotate(-counterRotate)`. Origin kotwicy leży w środku
kontenera, więc obrót dokładnie znosi obrót hosta (ten sam trik co `.scene-image__upright`).
W środku uchwyt przesunięty na pozycję kolumny:

```jsx
const { equatorX } = tokenRingGeometry(width, height, true);
// ...
<div className="token-rotate-anchor" style={{ transform: `rotate(${-counterRotate}deg)` }}>
  <div
    className="token-rotate-toggle"
    style={{
      left: '50%',
      top: '50%',
      transform: `translate(calc(-50% + ${equatorX}px), calc(-50% + ${EQUATOR_STACK_STEP * 2}px))`,
    }}
    onMouseDown={onRotateStart}
    title={t('scenes.rotateToken')}
  >
    <RotateRightIcon style={{ fontSize: 14 }} />
  </div>
</div>
```

Kotwica musi być `pointer-events: none`, sam uchwyt `pointer-events: auto` — inaczej niewidzialny
kwadrat `inset: 0` przykryje token i zje drag.

### `components/scene/MapCharacterToken.jsx`

```jsx
<TokenRotateHandle
  onRotateStart={handleRotateStart}
  width={size.w * CELL_SIZE}
  height={size.h * CELL_SIZE}
  counterRotate={0}
/>
```

Te same wyrażenia wymiarów, które już lecą do `TokenOverlay` (`:318-319`).

### `components/scene/SceneImage.jsx`

```jsx
<TokenRotateHandle
  onRotateStart={handleRotateStart}
  width={size.width}
  height={size.height}
  counterRotate={rotation}
/>
```

Uchwyt zostaje rodzeństwem `.scene-image__upright` (bez zagnieżdżania w nim) — własna kotwica
załatwia kontr-obrót, a mieszanie go z overlayem stanów sklejałoby dwie niezależne rzeczy.

`.scene-image__rotate-handle` (uchwyt obrazków tła, `:525`) **bez zmian** — obrazek tła nie ma
pierścienia slotów, więc nie ma tam czego naprawiać.

### `style.css`

- Usunąć `.token-rotate-handle` i `.token-rotate-handle:active` (`:10984-11002`).
- Dodać `.token-rotate-anchor` (`position: absolute; inset: 0; pointer-events: none;`).
- Dodać `.token-rotate-toggle` — kopia geometrii `.token-gear` (22px koło, `padding: 0`,
  `border: 1px solid #c9975b`, `background: rgba(20,12,4,0.75)`, `color: #f0d8b0`,
  `box-shadow: 0 1px 3px rgba(0,0,0,0.7)`, flex-center, `pointer-events: auto`),
  z `cursor: grab` oraz `cursor: grabbing` na `:active` (rotacja to przeciąganie, nie klik),
  `z-index: 30` (zachowany z obecnego uchwytu — nad overlayem stanów, który ma `z-index: 5`).

## Świadoma niespójność: obrazek tła zostaje z uchwytem na górze

Linia podziału **nie** przebiega między obrazkami a tokenami:

| obiekt | uchwyt po zmianie |
|---|---|
| token postaci | prawy równik |
| obrazek na warstwie tokenów (`isToken`) | prawy równik |
| obrazek tła / GM (`!isToken`) | **bez zmian — góra** |

Każdy token, obrazkowy czy postaciowy, dostaje to samo. Reguła: *obiekt z pierścieniem chowa
rotację do kolumny akcji, goła ramka trzyma ją na szypułce.*

Dlaczego nie ujednolicamy:

1. **Te uchwyty i tak nigdy nie były spójne.** `SceneViewport.css:431-455` daje obrazkowi tła
   `opacity: 0` z wyjazdem na hover kontenera, białą półprzezroczystą ramkę i `z-index: 10`;
   token ma uchwyt widoczny zawsze gdy zaznaczony, brązową ramkę i `z-index: 30`. Różny moment
   pojawienia się to mocniejszy sygnał niż różna pozycja — i nikt tego nie zgłosił.
2. **Konteksty się nie stykają.** Uchwyt obrazka tła wymaga `isLayerArmed` (uzbrojona warstwa
   obrazków); tokeny manipuluje się pod narzędziem pan/select. Nie widać obu naraz.
3. **Na obrazku tła góra niesie informację.** Uchwyt obraca się razem z obiektem i wskazuje jego
   „górę" — semantyka PowerPointa/Canvy. Na tokenie tej informacji utrzymać się nie da, bo
   pierścień jest kontr-obrócony i szypułka orbitując wjeżdża w sloty.
4. **Prawa strona nie ma tam sensu.** Bez pierścienia `equatorX` trzeba by wymyślić — arbitralne
   68px za krawędzią, przy dużym obrazku łatwo poza widocznym obszarem.

Skutek uboczny, zgodny z regułą: przeniesienie obrazka z warstwy tła na warstwę tokenów przenosi
jego uchwyt z góry na prawy równik. To nie usterka — obiekt właśnie zyskał pierścień.

## i18n

Bez zmian. `scenes.rotateToken` i `scenes.rotateImage` już istnieją w `en` i `pl`.

## Testy

- `utils/tokenRingGeometry.test.js` — case na `EQUATOR_STACK_STEP` i na to, że pozycja rotacji
  zależy od rozmiaru tokenu **wyłącznie** przez `equatorX` (offset `y` jest stały dla każdego
  rozmiaru).
- `components/scene/useTokenRotate.test.jsx` — bez zmian, matematyka kąta nietknięta.
- Komponenty sceny nie mają testów renderujących (świadomy stan po FEATURE-152) i ten spec ich
  nie dorabia.

### Weryfikacja ręczna

1. Token postaci 1x1 z pełnym pierścieniem 8 slotów — ikona rotacji nie dotyka żadnego slotu.
2. Ten sam token 3x3 — ikona nadal w kolumnie, odstępy zachowane.
3. Token-obrazek obrócony o 90° i 180° — ikona **zostaje** na godzinie 3, pod okiem, nie orbituje.
4. Token bez konfiguracji overlaya — ikona widoczna i chwytna (brak czaszki/oka nad nią).
5. Gracz (nie-GM) na swoim tokenie — ikona na `y = 52`, ta sama pozycja co u GM.
6. Aktywny (rozepchnięty) slot równikowy na godzinie 3 — chip nie sięga ikony.

## Poza zakresem

- **FEATURE-200** — rejestr skrótów klawiszowych (`constants/shortcuts.js` +
  `ShortcutsContext` + `useShortcut` + legenda), migracja istniejących trzech listenerów
  z `DndContext.jsx:147-190`, oraz `R` = obrót zaznaczonego tokenu o 45°.
- Przejście kolumny równika z `title` na portal tooltip.
