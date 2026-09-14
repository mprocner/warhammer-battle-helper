# BUG-195 — Scalenie narzędzi PAN i Select w jedno

Data: 2026-09-13
Status: zaakceptowany, do implementacji

## Problem

Scena ma dwa narzędzia manipulacji tokenami, które robią prawie to samo, ale rozjeżdżają się
w szczegółach. Zgłoszone objawy:

1. W Select zaznaczony token **nie rozsuwa pierścienia** — brak slotów, ikon konfiguracji,
   widoczności i oznaczenia jako zabity. W PAN wszystko to jest.
2. W PAN da się przesuwać **wyłącznie tokeny**; obrazów z warstwy tła i MG nie da się ruszyć
   ani obrócić.
3. W PAN kursor **nie zmienia się** nad krawędzią tokena (uchwyt resize). W Select się zmienia.

### Przyczyny — po jednej na objaw

**Objaw 1 — dwa równoległe stany zaznaczenia.**

| narzędzie | stan | kształt |
|---|---|---|
| PAN (`editingLayer === null`) | `activeTokenId` + `selectedImageId` | singleton z toggle |
| Select (`editingLayer === 'select'`) | `selectedTokens: [{kind,id}]` | tablica, marquee + shift |

Oba znaczą „ten token jest wybrany", ale `TokenOverlay` dostaje `selected={activeTokenId === id}`
(`MapTokensLayer.jsx:120`), a w Select nikt `activeTokenId` nie ustawia. Pierścień zostaje zwinięty
mimo zaznaczenia.

**Objaw 2 — to nie usterka, tylko brakujący mechanizm w PAN.** Uzbrajanie warstwy
(`imageEditLayer`) czyta wyłącznie gałąź Select (`utils/tokenManipulation.js:24`), a PAN twardo
ogranicza przeciąganie do warstwy `tokens` (`SceneImage.jsx:26`). Jedno narzędzie z paskiem warstw
usuwa różnicę bez dopisywania logiki.

**Objaw 3 — kursor `grab` z `!important`.**

```js
// SceneViewport.jsx:720
(controlScheme === 'modern' && editingLayer === null) ? ' scene-viewport--grab' : ''
```
```css
/* SceneViewport.css:54-57 */
.scene-viewport--grab .scene-viewport__sizer *:not(.token-overlay, .token-overlay *) {
  cursor: grab !important;
}
```

Reguła dotyczy **każdego** potomka `__sizer` poza `.token-overlay` — w tym `.token-resize-handle`
i `.token-rotate-toggle`. Ich `cursor: ns-resize` przegrywa z `!important`. Warunek to dokładnie
„schemat `modern` **i** tryb PAN", co zgadza się ze zgłoszeniem (objaw tylko na nowoczesnym
sterowaniu). Sloty działają, bo `:not()` je wyjmuje.

### Dlaczego w ogóle są dwa narzędzia

Zaszłość po starszym sterowaniu, w którym pan mapy wymagał lewego przycisku. Od FEATURE-142
(`useRightDragPan`) mapę panuje prawy przycisk na każdej warstwie, więc osobny tryb „ręka"
stracił rację bytu.

Wzorzec branżowy potwierdza kierunek: Foundry VTT i Owlbear Rodeo nie mają narzędzia pan w ogóle
(prawy drag / spacja), a lewy pasek Foundry to *warstwy*, nie tryby myszy — dokładnie to, czym
u nas jest `imageEditLayer`. Figma, Excalidraw i Miro trzymają rękę wyłącznie jako zapas dla
trackpada; narzędziem domyślnym jest strzałka. Roll20 ma rękę, ale to ta sama zaszłość.

## Rozwiązanie

Jedno narzędzie manipulacji dla MG i gracza, na jednym stanie zaznaczenia. PAN znika.

### Model stanu

`selectedTokens: [{kind, id}]` zostaje jedynym źródłem prawdy. `activeTokenId` i `selectedImageId`
znikają.

```
length === 1  → pierścień rozsunięty + uchwyty resize/rotate   (dawny „aktywny token")
length >= 2   → pierścienie zwinięte, uchwyty schowane, menu grupy pod PPM
length === 0  → nic
```

`TokenOverlay selected` i `canManipulateToken` czytają ten sam warunek, więc rozjazd z objawów
1 i 3 nie ma się gdzie wziąć.

Reguła kliknięcia (`toggleTokenSelected`, `DndContext.jsx:373`):

```js
if (additive)                                    → przełącz przynależność
else if (prev.length === 1 && prev[0] === ten)   → []             // zwiń pierścień
else                                             → [{ kind, id }] // zawęź do jednego
```

Ostatnia gałąź obsługuje oba przypadki naraz: klik w jeden z pięciu zaznaczonych **i** klik
w szósty spoza zaznaczenia — zaznaczenie zwija się do klikniętego. Toggle działa tylko na
jedynym zaznaczonym, więc nie kłóci się z zawężaniem grupy.

Konsumenci do przepięcia:

- `clearActiveToken` (`DndContext.jsx:385`) → czyści `selectedTokens`
- handler Delete dla pojedynczego obrazka (`DndContext.jsx:152-168`) → **usunięty**; zostaje
  grupowy (`:173`), któremu bramka `editingLayer === 'select'` zamienia się na `isGM` (patrz
  „Ryzyka" — tryb przestaje być `gmOnly`, więc sama bramka na tryb niczego już nie chroni)
- efekt czyszczący `selectedImageId` przy zmianie trybu (`DndContext.jsx:118`) → usunięty
- `handleSelectToken` / `handleSelectImage` (`:340`, `:352`) → usunięte, zastąpione
  `toggleTokenSelected`; bramka własności z `:343` **przenosi się** do nowej ścieżki

### Model trybu

`editingLayer` nigdy nie jest `null` — zawsze string, domyślnie `'select'`
(`useFogTools.js:9`). Nie istnieje stan „żadne narzędzie nie wybrane".

```js
// sceneModes.js
{ value: 'select',  Icon: NearMeIcon,      labelKey: 'scenes.selectLayer'               },
{ value: 'measure', Icon: StraightenIcon,  labelKey: 'scenes.measureLayer'              },
{ value: 'fog',     Icon: CloudIcon,       labelKey: 'scenes.fogLayer',    gmOnly: true },
{ value: 'drawing', Icon: EditIcon,        labelKey: 'scenes.drawingLayer'              },
```

Wpis PAN znika, `'select'` traci `gmOnly`. Cykl środkowym klikiem: MG 4 pozycje, gracz 3.
`DrawingToolbar` po kliknięciu aktywnej zakładki wraca do `'select'`, nie do `null`
(`DrawingToolbar.jsx:88`).

### Warstwy

`imageEditLayer` domyślnie `'tokens'` zamiast `'background'` (`useFogTools.js:11`). Bez tego MG
po wejściu do gry miałby uzbrojoną warstwę tła i nie ruszyłby żadnego tokena — regres względem
dzisiejszego PAN.

Gracz nie widzi `LayerSelector` (już dziś `if (!isGM) return null`) i dostaje `'tokens'` na
sztywno przy przekazywaniu propa. `useFogTools` zostaje bez zmian — to decyzja miejsca
przekazania, nie stanu.

### Pan mapy

Zostaje wyłącznie prawy drag (`useRightDragPan`, działa na każdej warstwie) i pasek przewijania.
Lewy drag na pustym polu należy do marquee.

### Ikony i nazwy

| element | ikona | uzasadnienie |
|---|---|---|
| scalony tryb | `NearMeIcon` | klasyczna strzałka kursora = manipulacja obiektami |
| zaznaczanie ścieżki (`DrawingToolbar.jsx:40`) | `AdsClickIcon` | strzałka z sygnałem kliknięcia — to narzędzie wybiera ścieżkę **kliknięciem**, nigdy ramką |

`ArrowSelectorToolIcon` **nie istnieje** w `@mui/icons-material@7.3.4` — sprawdzone, nie próbować.
`NearMeIcon` musi zmienić właściciela, bo inaczej dwie identyczne strzałki stałyby obok siebie na
pasku trybów i na pasku narzędzi rysowania.

Etykieta `scenes.selectLayer`: „Select / Move" / „Zaznacz / Przesuń" — nazwa mówi obie rzeczy,
które narzędzie robi, i zgadza się z językiem komentarzy w kodzie (`useFogTools.js:5`).

## Co znika

| co | gdzie | dlaczego |
|---|---|---|
| tryb PAN (`editingLayer === null`) | `sceneModes.js:12`, `tokenManipulation.js:30`, `DndContext.jsx:118`, `SceneViewport.jsx:720`, `SceneImage.jsx:26,335,455` | scalony w `'select'` |
| narzędzie `pan` | `DrawingToolbar.jsx:32`, `DrawingLayer.jsx:345,468`, `FogLayer.jsx:71`, `SceneViewport.jsx:334`, te same warunki co wyżej | rysujesz — rysuj; pan został na PPM |
| lewy drag = pan mapy | `SceneViewport.jsx:332-345` + `panStartRef` | lewy należy do marquee |
| `.scene-viewport--grab` | `SceneViewport.jsx:720`, `SceneViewport.css:54-57` | przyczyna objawu 3; sygnalizowała „tu lewy drag panuje", a lewego pana nie ma |
| `activeTokenId`, `selectedImageId` | `DndContext.jsx:96-98` i konsumenci | jeden stan |
| `scenes.panLayer`, `scenes.drawingTool_pan` | `locales/en/`, `locales/pl/` | martwe klucze |
| importy `PanToolIcon`, `HighlightAltIcon` | `sceneModes.js`, `DrawingToolbar.jsx` | ikony zwolnione |
| pierścień na **zablokowanym** obrazie-tokenie | `SceneImage.jsx` — gałąź zaznaczania | świadoma decyzja, patrz niżej |

`.scene-viewport--grabbing` (`SceneViewport.css:60-63`) **zostaje** — używa go prawy drag przez
`setIsPanning`.

Po scaleniu `canManipulateToken` zwija się z trzech gałęzi do jednej: `allowed && !locked &&
imageEditLayer === 'tokens' && length === 1`.

## Znane ograniczenie

Trackpad + schemat `modern` zostaje bez przeciągania mapy. Przeciąganie dwoma palcami to na
trackpadzie *scroll*, a nie trzymanie prawego przycisku; prawego da się tylko kliknąć. W schemacie
`modern` zwykły scroll to zoom (`SceneViewport.jsx:216`), więc nie panuje.

| schemat | mysz | trackpad |
|---|---|---|
| `classic` | prawy drag + scroll | OK — scroll przewija mapę (`SceneViewport.jsx:207-213`) |
| `modern` | prawy drag | brak przeciągania mapy |

Obejście istnieje i jest wystarczające: przełączenie na `classic` w `ControlSchemeSelector`.
Spacja + lewy drag (wzorzec Figma/Photoshop) **świadomie odłożona** do pierwszego zgłoszenia od
użytkownika — nie ma znanego gracza na trackpadzie, a dopisanie to jeden listener z tym samym
wyjątkiem na pola tekstowe co `isModeCycleClick` (`sceneModes.js:42`).

To decyzja, nie przeoczenie. Nie traktować jako regresu.

## Decyzje podjęte w trakcie implementacji

Obie wyszły z review i obie rozstrzygnął autor projektu. Zapisane tutaj, żeby nikt nie
„naprawił" ich później jako usterek.

### Ping MG w trybie Select — przywrócony

Bramka `isGM` na marquee miała skutek uboczny, którego spec nie przewidział: gałąź zaznaczania
kończyła się `return`, przez co presja MG nie docierała do ustawienia pointer-pinga na dole
`handleContentMouseDown`. Gracz przelatywał obok tej gałęzi i pingował normalnie — MG tracił ping
w swoim jedynym domyślnym trybie. Wcześniej nikt tego nie widział, bo Select był `gmOnly`,
a gracze pingowali z trybu PAN.

Naprawione: gałąź nie kończy się już `return`, presja spada do ustawienia pinga. Marquee i ping
nie mogą się pogryźć — marquee materializuje się dopiero po **ruchu** wskaźnika, a ping wymaga
~500 ms **bezruchu** i kasuje się po przekroczeniu 5 px. Presja na tokenie nadal wychodzi wcześniej
i nigdy nie pinguje.

### Brak kursora sygnalizującego pan — świadomie zostawiony

Po skasowaniu `.scene-viewport--grab` pusta siatka nie ma żadnego kursora mówiącego, że mapę da się
przeciągnąć; `grabbing` pojawia się dopiero po przekroczeniu progu 8 px prawym przyciskiem.
Wcześniej w trybie PAN była łapka.

Nie naprawiamy tego w BUG-195. **Ta klasa była przyczyną objawu 3** — `cursor: grab !important`
na każdym potomku `__sizer` zjadał kursory uchwytów resize. Dorobienie afordancji dla prawego
przycisku bez odtworzenia tamtego buga to osobny problem projektowy, a nie ma testu, który by tego
pilnował. Osobny ticket.

### Zablokowany token-obraz traci też pierścień

W PAN kliknięcie **zablokowanego** obrazu na warstwie tokenów rozsuwało jego pierścień stanów/HP —
stary handler nie sprawdzał `locked` w ogóle. Scalone narzędzie dziedziczy bramkę z Selecta
(`image.locked` blokuje zaznaczenie), więc edycja HP takiego tokena wymaga wcześniejszego
odblokowania.

Decyzja autora: **zostaje tak**. Blokada ma znaczyć „nietykalny", a nie „nieprzesuwalny, ale
edytowalny" — spójność wygrywa z zachowaniem jednej funkcji z PAN.

## Poza zakresem

**Marquee dla gracza.** Przydatne przy dwóch postaciach albo zwierzęciu, ale to nie usunięcie
niespójności, tylko nowa zdolność — i nie jest zmianą frontendową:

```go
// internal/service/GameService.go:2161
if game.GameMasterID != userID {
    return fmt.Errorf("only the game master can move scene tokens")
}
```

Wymagałoby poluzowania tej bramki z walidacją **per-id po stronie serwera**: batch musi zawierać
wyłącznie postacie należące do wołającego i zero obrazów. Filtr frontendowy nie jest
zabezpieczeniem — gracz może wysłać request ręcznie i przemycić obrazy MG (także z warstwy `gm`
i ukryte) albo cudze postacie i NPC-e. Inny obszar ryzyka, inne testy → osobny FEATURE.

Gracz i tak dostaje w BUG-195 więcej niż ma dziś: uchwyty resize i rotację własnego tokena,
niedostępne, dopóki Select był `gmOnly`.

**Klik w cudzy token** dla gracza nadal nic nie robi — dzisiejsza bramka własności
(`DndContext.jsx:343`) przenosi się do nowej ścieżki zaznaczania bez zmiany zachowania.

## Testy

Jednostkowe (bez DOM):

- `utils/tokenManipulation.test.js` — przycięty do jednej gałęzi; znikają przypadki
  `activeTool: 'pan'` i `editingLayer: null`
- `components/scene/sceneModes.test.js` — lista i cykl dla obu ról (MG 4, gracz 3), brak `null`
- nowy zestaw na regułę kliknięcia: toggle przy jednym zaznaczonym, zawężenie przy pięciu, klik
  w token spoza zaznaczenia, shift bez zmiany reguły

Renderujące:

- `components/scene/DrawingToolbar.smoke.test.jsx` — „powrót do `'select'`" zamiast „powrót do
  `null`" (`:74`), brak przycisku `pan`
- `components/scene/LayerSelector.smoke.test.jsx` — bez zmian

Bez pokrycia zostaje to, co dziś: `SceneViewport`, `FogLayer`, `DrawingLayer` (warstwy canvasowe).

Ręcznie:

- kursor nad krawędzią zaznaczonego tokena w **obu** schematach sterowania (objaw 3)
- PPM-pan w każdym trybie, w tym w fog i drawing (po usunięciu narzędzia `pan`)
- gracz przesuwa własny token, nie rusza cudzego
- MG po wejściu do gry rusza tokenem bez dotykania paska warstw (domyślne `'tokens'`)

Uruchomienie: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Baseline fail `App.test.js` (axios ESM) — nie regres.

## Ryzyka

- **Prawy przycisk na scenie jest gęsto obłożony** (menu obrazu, menu grupy, `FogLayer`,
  `DrawingLayer`, `useRightDragPan`). Po usunięciu lewego pana staje się jedyną drogą do
  przesuwania mapy, więc każdy regres tam boli bardziej niż dotąd. Ostrzeżenia z `CLAUDE.md`
  o kolejności `contextmenu` i o `buttons` obowiązują bez zmian.
- **Delete traci bramkę na tryb.** Dziś handler grupowy wymaga `editingLayer === 'select'`
  (`DndContext.jsx:173`), a ten tryb był `gmOnly`. Po scaleniu tryb jest domyślny i dostępny dla
  gracza — bramka musi przejść na `isGM`, inaczej gracz skasuje zaznaczony obraz klawiszem.
