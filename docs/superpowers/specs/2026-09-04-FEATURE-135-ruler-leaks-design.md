# FEATURE-135 — Miernik odległości przestaje zdradzać graczom to, czego nie widzą

**Status:** zaprojektowane
**Data:** 2026-09-04

## Objaw

Dwa niezależne wycieki informacji przez miernik odległości (ruler):

1. **Start w marginesie GM.** MG trzyma tokeny w wyszarzonym pasie `OFFSCENE_MARGIN` wokół siatki
   (`SceneViewport.jsx`, `.scene-offscene-veil`). Gracze tego obszaru w ogóle nie renderują —
   ich sizer nie zawiera marginesu. Kiedy MG przeciąga token stamtąd na scenę, drag ruler jest
   rozgłaszany przez `MAP_RULER` i gracz widzi linię wychodzącą znikąd: dowiaduje się, że coś
   wchodzi na mapę i z której strony.
2. **Mgła wojny nie przykrywa miernika.** `MapRulerOverlay` ma `zIndex: 40`, `FogLayer` — `30`.
   Ruler rysuje się **nad** mgłą, więc token przesuwany przez MG pod mgłą zdradza graczom swoją
   trasę i długość ruchu, mimo że sam token jest zakryty.

Istniejąca ochrona (BUG-178, `isPrivateDrag`) zamyka tylko przypadek tokenu **ukrytego**
(`placement.hidden`, obraz `hidden` lub warstwa `gm`). Token widoczny, ale stojący poza sceną albo
pod mgłą, nie jest przez nią objęty.

## Zakres — decyzje

| Pytanie | Decyzja |
|---|---|
| Co znaczy „poza sceną" | Wyszarzony margines GM wokół siatki. Pula w sidebarze **nie** — drag ruler startuje wyłącznie z tokenów na mapie (`MapCharacterToken`, `SceneImage`, `useGroupDrag`), dnd-kit z sidebara go nie odpala. |
| Który koniec przesądza — **drag ruler** | **Tylko start.** Token wyjeżdżający poza scenę jest przez cały gest widoczny dla graczy, więc nie ma czego ukrywać. |
| Który koniec przesądza — **manualny ruler** | **Oba.** Tu nic się nie porusza: koniec linii **jest** ujawnieniem. Pomiar zaczęty na siatce rozgłasza się swobodnie, więc przeciągnięcie końca na token odłożony w marginesie wypuściłoby jego dokładny środek (`snapPoint` magnetyzuje do środków, a `buildRulerSnapTargets` filtruje po prywatności, nie po pozycji). Patrz „Zmiana 1c". |
| Manualny ruler (tryb measure) | **Objęty tym samym gate'em startu.** Wbrew pierwotnemu założeniu **da się** go wystartować z marginesu — patrz „Zmiana 1b". |
| Cele przyciągania rulera (`snapPoint`) | **Filtrujemy prywatne tokeny** z listy celów — patrz „Zmiana 3". |
| Czyje rulery pod mgłą | Tylko **cudze** (rozgłoszone). Własny zostaje na wierzchu — wyciek istnieje wyłącznie przez broadcast, a chowanie własnej linii i plakietki psułoby pomiar w stronę mgły. |

## Zmiana 1 — gate startu poza sceną

Reguła ląduje w `hooks/useDragRuler.js`, obok `isPrivateDrag`: ta sama, raz na przeciągnięcie
podejmowana i zamrożona do jego końca decyzja o rozgłaszaniu.

```js
// Punkt poza siatką: gracze tego obszaru nie renderują, więc koniec rulera stamtąd mówi im,
// że token wchodzi na mapę i z której strony. Nazwa jest celowo neutralna wobec pozycji —
// drag ruler ocenia nią tylko START, manualny ruler start ORAZ każdy rozgłaszany koniec.
export function isOffscenePoint(point, { gridWidth, gridHeight } = {}) { ... }
```

- **Predykat:** `col` poza `[0, gridWidth]` albo `row` poza `[0, gridHeight]` → poza sceną.
  Punktem jest środek tokenu w komórkach — ten sam `center`, który dostaje `onMeasureStart`.
  Duży token wystający poza krawędź, ale ze środkiem w siatce, liczy się jako widoczny.
- **Fail closed** jak w BUG-178: brak wymiarów albo wartość nieskończona/NaN → prywatne.
  Brak rulera bije wyciek pozycji.
- **Wpięcie:**
  ```js
  privateRef.current = isPrivateDrag(tokens, sceneRef.current)
    || isOffscenePoint(center, sceneRef.current);
  ```
- **Wymiary siatki:** `gridWidth`/`gridHeight` dochodzą do propsów hooka i do mirrora `sceneRef`
  (`useLayoutEffect`, z tego samego powodu co `images`/`characters` — muszą być aktualne, zanim
  przeglądarka dostarczy następny `mousedown`). Źródło: `DndContext.jsx:43`, gdzie już są
  policzone (`currentScene?.gridWidth || DEFAULT_GRID_WIDTH`).
- **Bez zmian:** lokalny `dragRuler` ustawia się zawsze — przeciągający widzi swój odczyt
  niezależnie od gate'u. Blokowany jest wyłącznie `send`.

### Odrzucone warianty

- **Decyzja w miejscach wywołania** (`MapCharacterToken`, `SceneImage`, `useGroupDrag`) — jedna
  reguła rozsmarowana na trzy pliki, każdy z własną szansą na pominięcie.
- **Gate po stronie serwera** — `MAP_RULER` to głupi relay w hubie (jak `POINTER_PING`), nie zna
  sceny ani wymiarów siatki. Dołożenie mu tej wiedzy to nowa zależność dla jednego przypadku.

## Zmiana 1b — ten sam gate dla manualnego rulera

Pierwotna decyzja („z marginesu nie da się wystartować manualnego rulera") była **fałszywa**.

**Dlaczego się myliliśmy — faza capture.** Handler siedzi na `content`
(`SceneViewport.jsx`, `onMouseDownCapture`), ale `onMouseDownCapture` **nie** znaczy „tylko kiedy
klikniesz dokładnie w ten element". Faza capture przebiega **całym łańcuchem przodków** od `window`
w dół do celu zdarzenia — czyli handler na `content` odpala się dla dowolnego jego potomka w DOM,
niezależnie od tego, gdzie ten potomek jest namalowany. Obraz odłożony w marginesie
(`clampToWorkspace` dopuszcza ±`OFFSCENE_MARGIN_CELLS`, `utils/tokenGeometry.js`) jest potomkiem
`content`, tyle że o ujemnych współrzędnych, i w trybie measure pozostaje klikalny
(`SceneImage.jsx` — `isLayerInert` obowiązuje wyłącznie w trybie select). Naciśnięcie go
uruchamiało `rulerStart` z ujemnym `col`/`row`, a `useMapRuler` **nie miał żadnego gate'u**.

Gorsze od wycieku przez drag ruler: `snapPoint` przyciąga początek do środka odłożonego tokenu,
więc rozgłaszany `from` był jego **dokładną** pozycją poza sceną.

Pułapka do zapamiętania: *„handler jest na elemencie X" nie ogranicza zdarzenia do prostokąta X.*
Ogranicza je do poddrzewa X — a poddrzewo może być namalowane gdziekolwiek.

**Rozwiązanie:** `hooks/useMapRuler.js` dostaje `gridWidth`/`gridHeight` i ten sam
`isOffscenePoint` (import z `./useDragRuler`), z lustrzaną mechaniką:

- decyzja podejmowana **raz** w `start()` i zamrożona w `privateRef` do `end()`;
- oceniany jest punkt **po snapowaniu** — to on trafiłby na drut, a snap magnetyzuje początek do
  środka odłożonego tokenu;
- blokowany jest wyłącznie `send`; lokalna linia, plakietka i odczyt odległości działają jak dotąd;
- stan rulera jest **lustrzany w refie** (`rulerRef`, dokładnie jak `fromRef` w `useDragRuler`),
  a każdy `send` i reset `privateRef` wykonuje się w **ciele handlera** — **nigdy** wewnątrz updatera
  `setRuler`.

  **Dlaczego to jest twarda reguła, a nie stylistyka.** React 19 pod `React.StrictMode`
  (`src/index.js` owija całą aplikację) wywołuje updatery stanu **dwukrotnie** w trybie
  deweloperskim — to celowa detekcja updaterów z efektami ubocznymi. Updater, który wysyła i czyści
  `privateRef`, robi to więc dwa razy: pierwszy przebieg blokuje wysyłkę i zeruje flagę, drugi widzi
  już `false` i **rozgłasza** zamykającą klatkę `active: false` z pozycją spoza sceny — czyli otwiera
  z powrotem wyciek, którego gate pilnuje. Przy okazji znika duplikat: pod StrictMode stary układ
  wysyłał 4 wiadomości na 3 logiczne klatki.

  Pułapka do zapamiętania: *updater `setState` musi być czystą funkcją stanu.* Wszystko, co ma
  skutek uboczny (wysyłka po drucie, zapis do refa), należy do handlera — tam wykonuje się raz.

## Zmiana 1c — gate KOŃCA manualnego rulera

Reguła „tylko start" była uzasadniona rozumowaniem **specyficznym dla drag rulera**: przeciągany
token jest przez cały gest widoczny dla graczy, więc wyjazd poza scenę niczego nie ukrywa. Do
manualnego narzędzia to się **nie przenosi** — tam nic się nie porusza, a koniec linii to jedyna
informacja, którą pomiar niesie.

**Wyciek:** `buildRulerSnapTargets` (Zmiana 3) filtruje cele po **prywatności**, nie po **pozycji**.
Token widoczny, ale odłożony w marginesie MG, dalej jest celem przyciągania. Pomiar zaczęty na
siatce ma `privateRef === false` i rozgłasza swobodnie — więc przeciągnięcie końca na taki token
kładzie na drut jego **dokładny środek poza sceną**. Ten sam wyciek, którego dotyczy cała gałąź,
tyle że drugim końcem linii.

**Reguła:**

- klatka, której **koniec** (punkt po snapowaniu — ten, który trafiłby na drut) leży poza siatką,
  **nie jest rozgłaszana**;
- jeśli wcześniej w tym pomiarze coś już poszło w świat, wychodzi **dokładnie jedna** klatka
  zamykająca (`active: false`), żeby u innych graczy nie została zamrożona linia wskazująca na
  odłożony token. Niesie ona `from` dwa razy — `from` startował na siatce, więc w normalnych
  warunkach żadna współrzędna spoza sceny się na nią nie załapie. Zastrzeżenie: `privateRef` jest
  zamrażany raz, na podstawie wymiarów siatki W MOMENCIE STARTU, podczas gdy `move` za każdym
  razem czyta `gridWidth`/`gridHeight` na żywo — więc gdyby MG zmienił rozmiar siatki w trakcie
  trwającego pomiaru, `from` mógłby się znaleźć poza NOWĄ siatką, a `privateRef` mimo to zostać
  `false`. Brzegowy przypadek: klatki `active: true` niosą to samo `from` przez cały pomiar, więc
  ta sama współrzędna i tak już wyszła w świat wcześniej — klatka zamykająca nie jest tu wektorem
  wycieku, tylko powtarza coś, co już zostało rozgłoszone;
- dopóki koniec zostaje poza sceną, **nie wychodzi nic więcej** (decyduje o tym `liveRef`, nie
  throttle);
- kiedy koniec wraca na siatkę, rozgłaszanie **wznawia się normalnie** — pomiar nigdy nie był
  prywatny w sensie startu;
- lokalna linia, plakietka i odczyt odległości działają **zawsze**, także z końcem poza sceną;
- gate **startu** zostaje bez zmian: prywatny od startu znaczy, że nie wychodzi nic, łącznie
  z klatką zamykającą — nie ma czego zamykać.

**Stan:** `liveRef` („czy nasza linia jest teraz narysowana u innych"). Ustawia go zwracana przez
`send` informacja o tym, czy klatka faktycznie poszła na drut — dzięki temu jedno miejsce wie
o wszystkich powodach zablokowania wysyłki. Ten sam ref sprawia, że `end()` pomija klatkę
zamykającą, kiedy nie ma czego zamykać.

**Predykat** jest wspólny z drag rulerem, dlatego nosi teraz neutralną wobec pozycji nazwę
`isOffscenePoint` (dawniej `isOffsceneStart`). Ta sama funkcja, dwie różne polityki jej użycia —
i to rozróżnienie musi być widoczne w kodzie, nie tylko w spec-u.

**Drag ruler zostaje bez zmian** — reguła „tylko start" jest tam nadal poprawna.

## Zmiana 2 — mgła nad cudzymi rulerami

`MapRulerOverlay` dostaje prop `zIndex` (domyślnie `40`, dzisiejsza wartość).
`SceneViewport` dzieli `displayRulers` na dwie tablice i renderuje dwie nakładki:

| Nakładka | Zawartość | `zIndex` |
|---|---|---|
| cudza | `mapRulers` innych graczy | `28` |
| własna | manualny ruler + własny drag ruler | `40` |

Stos warstw po zmianie:

```
1  obrazy background
5  obrazy tokens
10 obrazy gm
11 .scene-offscene-veil
25 DrawingLayer
28 MapRulerOverlay — cudze rulery      ← nowe
30 FogLayer
40 MapRulerOverlay — własny ruler
```

- **Gracz:** mgła nieprzezroczysta → cudze rulery pod nią znikają; własna linia i plakietka
  z odległością zostają czytelne, także przy pomiarze w stronę mgły.
- **MG:** mgła półprzezroczysta (`fogGmOpacity`) → cudze rulery widoczne przez nią, przygaszone;
  własny na wierzchu.
- Obie nakładki to rodzeństwo w tym samym kontekście składania (`content`), więc o kolejności
  decyduje wyłącznie `zIndex`, nie kolejność w DOM.

### Przycinanie do prostokąta mgły (`clip`)

Sam `zIndex` nie wystarczy. Plakietka z odległością to `div` w punkcie środkowym linii, przesunięty
`transform: translate(-50%, -140%)` (`MapRulerOverlay.css`) — maluje się **~28 px POWYŻEJ** swojego
punktu. Canvas `FogLayer` ma dokładnie `canvasWidth × canvasHeight`, a `.map-ruler-overlay` nie miała
żadnej reguły `overflow`, więc cudzy ruler ze środkiem w górnym ~0,6 komórki wyświetlał plakietkę
na ramce **nad** mapą, poza zasięgiem mgły. To samo po lewej/prawej i dla dowolnej geometrii poza
siatką (SVG jest `overflow: visible`).

`MapRulerOverlay` dostaje więc prop `clip` (domyślnie `false` → `overflow: visible`), ustawiany
**wyłącznie** na instancji cudzych rulerów. Przycinamy kontener, nie pojedyncze elementy — dzięki
temu wszystko, co ta nakładka kiedykolwiek narysuje, jest przystające do prostokąta canvasu mgły,
także geometria dodana w przyszłości. Własna nakładka zostaje nieprzycięta.

Skutek uboczny wart odnotowania: `clip` obcina cudze rulery na krawędzi mapy **także na scenach
bez mgły** — prostokąt jest ten sam niezależnie od tego, czy mgła jest włączona. Pożądane
(cudza linia i tak nie ma czego pokazywać poza mapą, a gracze nie renderują marginesu MG), ale
uzasadnienie powyżej mówi wyłącznie o przystawaniu do mgły, więc łatwo to przeoczyć.

### Skutek uboczny po stronie MG (zaakceptowany)

Przy `fogGmOpacity` = 1.0 MG **przestaje widzieć cudze rulery nad zamgloną częścią mapy** — wcześniej
przy `z-index: 40` były widoczne zawsze. Przy domyślnej półprzezroczystości widać je nadal, przygaszone.
Akceptujemy: alternatywą byłby trzeci stos zależny od roli, a MG i tak może zmniejszyć `fogGmOpacity`.

## Zmiana 3 — cele przyciągania rulera bez ukrytych tokenów

`rulerSnapTargets` w `SceneViewport.jsx` budowano ze **wszystkich** postaci i **wszystkich** obrazów
warstwy `tokens`, bez filtru `hidden`/`gm`. Koniec manualnego rulera trafiający w promień ukrytego
tokenu przyciągał się do jego dokładnego środka, a `useMapRuler` ten środek rozgłaszał — czyli wyciek
z BUG-178 otwarty na nowo, tym razem przez manualne narzędzie.

**Decyzja:** filtrujemy prywatne tokeny z listy celów, a nie gate'ujemy broadcast co klatkę.
Gate per-klatka wymagałby przeliczania prywatności przy każdym ruchu myszy i gasiłby ruler
w środku pomiaru; filtr celów usuwa problem u źródła — nie ma czego przyciągnąć.

**Kompromis (zaakceptowany):** MG traci przyciąganie do środka **ukrytego** tokenu. Pomiar „na oko"
do niego nadal działa (tryb free / środek komórki w trybie snap).

Gracz, który **nie ma karty** postaci, nie traci nic — backend wycina ukryte placementy z jego
payloadu sceny, więc jego lista celów nigdy ich nie zawierała. Ale **posiadacz karty traci**:
`keepSceneCharacterForViewer` to `!gc.Hidden || hasCard[gc.CharacterID]`
(`internal/service/GameService.go`) — udokumentowany rozdział „widoczność tokenu vs widoczność
karty" sprawia, że posiadacz karty **dostaje** ukryty placement i widzi token. Filtr działa po
fladze `hidden`, nie po tym, co widzi konkretny odbiorca, więc taki gracz traci przyciąganie do
środka tokenu, który ma prawo widzieć. Nieszkodliwe (pomiar „na oko" działa), ale prawdziwe —
wcześniejsze zdanie „gracze nigdy nie mieli ukrytych placementów" było po prostu fałszywe.

**Implementacja:** czysty helper `buildRulerSnapTargets({ characters, images })` w
`utils/tokenGeometry.js`, obok dwóch predykatów, które dzieli teraz z `isPrivateDrag`:

```js
export function isCharacterPlacementPrivate(gc) { return !!gc.hidden; }
export function isImagePrivate(img) { return !!img.hidden || img.layer === 'gm'; }
```

Predykaty leżą w `tokenGeometry.js` (nie w `useDragRuler.js`), bo importuje je i hook, i warstwa
utils — odwrotny kierunek (utils → hooks) byłby inwersją zależności. Dzięki wspólnej definicji
„czego gracz nie widzi" gate drag rulera i lista celów nie mogą się rozjechać.

## Znane granice (świadomie nie zamykane)

- **Group drag z mieszaną selekcją.** `useGroupDrag.js` liczy początek rulera ze **środka bboxa
  selekcji**, więc zaznaczenie „obraz odłożony w marginesie + token na siatce" może dać środek
  wewnątrz siatki i przejść przez `isOffscenePoint`. Nic spoza sceny nie wycieka — sama linia
  zaczyna się na siatce — ale granica jest inna niż dla pojedynczego tokenu; zapisane, żeby nie
  zaskoczyło przy czytaniu kodu.
- **`POINTER_PING`** renderuje się na `z-index: 1000000`, nad mgłą i bez żadnego gate'u: ping MG pod
  mgłą ujawnia graczom miejsce. To świadomy gest MG, a nie efekt uboczny ruchu tokenem — ale klasa
  informacji jest ta sama.
- **Odbiorca ma drugą linię obrony, ale nie zastępuje klatki zamykającej.** Handler
  `WS_EVENTS.MAP_RULER` w `warhammer-battle-helper-front/src/components/GameSession.jsx:810-827`
  na klatce `active: false` **usuwa** cały wpis (`delete next[ruId]`) — `from`/`to` tej klatki nigdy
  nie trafiają do stanu. Jest tam też bezpiecznik: dla `active: true` planowany jest
  `setTimeout(..., 3000)` (linia 822-826), który sam skasuje ruler, gdyby nadawca rozłączył się
  w trakcie pomiaru bez wysłania zamknięcia; każda kolejna klatka dla tego `ruId` (łącznie z
  zamykającą) czyści poprzedni timer (`clearTimeout`, linia 815). To NIE czyni klatki zamykającej
  z Zmiany 1c zbędną — bez niej linia wskazująca na odłożony token wisiałaby u graczy przez
  te 3 sekundy zamiast zniknąć natychmiast, a trzy sekundy patrzenia na linię wskazującą staged
  token to dokładnie ten wyciek, któremu ta zmiana zapobiega. Zapisane, żeby przyszli recenzenci
  wiedzieli, że ten bezpiecznik istnieje, zanim zaproponują usunięcie klatki zamykającej jako
  „redundantnej".
- **Drag ruler wystawia dokładny punkt docelowy poza sceną, nie samą widoczność tokenu.** Decyzja
  „tylko start" dla drag rulera (Zmiana 1, uzasadniona tym, że przeciągany token jest widoczny dla
  graczy przez cały gest) nie jest tu podważana — użytkownik ją podjął i zostaje. Warto jednak
  zapisać wprost: przeciągnięcie tokenu POZA scenę i tak wystawia na drut dokładną współrzędną
  docelową w marginesie (`hooks/useDragRuler.test.js` asercja `to: { col: -8, row: 3 }`). Uzasadnienie
  w spec-u mówi o widoczności TOKENU podczas ruchu, ale to, co faktycznie idzie w świat, to
  WSPÓŁRZĘDNA MARGINESU pod tym tokenem — inna klasa informacji niż „gracz widzi token". Nazwane
  tutaj wprost, żeby nie zostało odkryte na nowo jako bug.

## Testy

**`hooks/useDragRuler.test.js`** (dokładamy do istniejącego pliku BUG-178):

| Przypadek | Oczekiwanie |
|---|---|
| start `col: -5` (margines po lewej) | `sendMessage` nie wołane |
| start `col > gridWidth` | `sendMessage` nie wołane |
| start `row` poza `[0, gridHeight]` | `sendMessage` nie wołane |
| start wewnątrz siatki, token widoczny | `sendMessage` wołane z `MAP_RULER` |
| brak `gridWidth`/`gridHeight` w propsach | `sendMessage` nie wołane (fail closed) |
| dowolny z powyższych | lokalny `dragRuler` ustawiony — odczyt przeciągającego działa |

**`MapRulerOverlay`** (nowy plik testowy, komponent czysto prezentacyjny):

- prop `zIndex` ląduje na `style` nakładki; brak propa → `40`;
- tablica z samymi cudzymi rulerami renderuje tylko ich plakietki (nazwy graczy), bez własnej.

**`hooks/useMapRuler.test.js`** (nowy plik, Zmiana 1b):

| Przypadek | Oczekiwanie |
|---|---|
| `start` w marginesie, potem `move` i `end` | `sendMessage` nie wołane ani razu; lokalny `ruler` ustawiony |
| `start` poza dalszą krawędzią siatki | `sendMessage` nie wołane |
| `snapPoint` magnetyzuje start na punkt poza sceną | `sendMessage` nie wołane (oceniamy punkt PO snapie) |
| brak `gridWidth`/`gridHeight` | `sendMessage` nie wołane (fail closed) |
| `start` na siatce | `MAP_RULER` wołane, `end` wysyła `active: false` |
| `start` na siatce, `move` z końcem poza sceną | rozgłaszanie ustaje, wychodzi **dokładnie jedna** klatka `active: false` niosąca `from`, nie koniec |
| drugi `move` z końcem poza sceną | nic więcej nie wychodzi |
| `end()` po wyjeździe końca poza scenę | brak drugiej klatki zamykającej |
| koniec wraca na siatkę | rozgłaszanie wznowione, `end` znów zamyka |
| `snapPoint` magnetyzuje **koniec** na punkt poza sceną | oceniany jest punkt PO snapie — środek odłożonego tokenu nie trafia na drut |
| pomiar prywatny od startu, koniec wjeżdża i wyjeżdża | `sendMessage` nie wołane ani razu |
| dowolny z powyższych | lokalny `ruler` ustawiony przez cały czas |

Osobny blok `describe('under React.StrictMode')` owija `renderHook` w `<React.StrictMode>`
(opcja `wrapper`) i sprawdza, że pomiar prywatny nie wysyła **ani jednej** wiadomości przez
`start`/`move`/`end`, a pomiar na siatce wysyła dokładnie 3 (po jednej na logiczną klatkę). Ten
wrapper przypina LICZBY wysyłek (0 dla pomiaru prywatnego, 3 dla pomiaru na siatce) i wyłapuje
PEŁNY powrót do starego układu (send/reset z powrotem wewnątrz updatera `setRuler`, cały plik
sprzed fixa) — pod takim rewertem test faktycznie pada. Nie wyłapuje jednak częściowego
cofnięcia: przy obecnym kodzie, gdzie `liveRef` i znacznik throttle'a już istnieją, przeniesienie
samego `send`/resetu z `end()` z powrotem do wnętrza updatera nadal przechodzi 15/15 (pierwszy
przebieg wysyła klatkę i czyści `liveRef`, drugi widzi już `false` i nic nie wysyła), podobnie
przeniesienie throttlowanego `send` z `move()` (znacznik `lastSendRef.current` zostaje ustawiony
w pierwszym przebiegu, więc drugi jest odrzucany przez throttle). Innymi słowy: trzymanie
wysyłki i resetu w ciele handlera, a nie wewnątrz updatera stanu, jest dziś regułą pilnowaną
przez REVIEW, nie przez ten test — `liveRef` i znacznik throttle'a tylko maskują skutki
częściowego złamania tej reguły.

**`utils/tokenGeometry.test.js`** (Zmiana 3): `buildRulerSnapTargets` pomija ukrytą postać, ukryty
obraz i obraz z warstwy `gm`, zachowuje widoczne, i — jak dotąd — pomija obrazy spoza warstwy
`tokens`. Plus predykaty `isCharacterPlacementPrivate` / `isImagePrivate` osobno.

**`MapRulerOverlay`** (Zmiana 2, `clip`): brak propa → `overflow: visible`; `clip` → `overflow: hidden`.

Warstwy canvasowe (`FogLayer`, `DrawingLayer`) i `SceneViewport` pozostają bez testów renderujących
— zgodnie z dotychczasowym stanem pokrycia sceny. Oznacza to, że przeplot warstw (z 28 pod mgłą)
i przekazanie `clip` na właściwą instancję weryfikuje wyłącznie ręczny przebieg w przeglądarce
(Zadanie 3 planu).
