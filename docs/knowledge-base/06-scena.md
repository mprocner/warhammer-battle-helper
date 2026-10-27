# Scena (mapa)

## Jak to działa

**Sceny.** Gra ma wiele scen (`Game.Scenes`), jedna jest domyślna (`IsDefault`). MG przypisuje
graczy do scen (`AssignedPlayers`). Przypisanie usuwa gracza ze wszystkich innych scen, więc
gracz jest zawsze na jednej scenie. Scena ma siatkę (`GridWidth/Height`, `GridVisible`),
opcjonalną muzykę sceny (`SceneMusic*`), mgłę i rysunki.

**Ustawienia mapy** są wspólne dla całej gry (`PATCH /mapSettings`): rozmiar komórki, jednostka
odległości, przyciąganie do siatki lub swobodne ustawianie. Zmiana wywołuje refetch u
wszystkich, żeby każdy klient stosował tę samą regułę.

**Warstwy obrazków** (`SceneImage.Layer`): `background` (tło), `gm` (widoczne tylko dla MG),
`tokens` (obrazki zachowujące się jak tokeny). `LayerSelector` wybiera warstwę, na której
działa zaznaczanie.

**Tryby** (`sceneModes.js`, w `GameSession` jako `editingLayer`, zawsze jeden z nich):

| Tryb | Kto | Co robi |
|---|---|---|
| `select` | wszyscy | Domyślny. Zaznaczanie, przesuwanie, ramka zaznaczenia, obrót, skalowanie |
| `measure` | wszyscy | Miarka, opcjonalnie z obszarem działania (AoE). Linijka jest wysyłana innym na żywo i nie jest zapisywana. Linijka pojawia się też przy przeciąganiu tokenu |
| `fog` | MG | Mgła wojny: pędzel, prostokąt, linia; zakrywanie i odkrywanie, cofnij, odkryj wszystko |
| `drawing` | wszyscy | Odręcznie, linia, prostokąt, koło, strzałka, wielokąt, tekst, zaznaczanie rysunków |

Środkowy przycisk cyklicznie przełącza tryby (`isModeCycleClick`). Mapę przesuwa się
przeciąganiem prawym przyciskiem (`useRightDragPan`, próg ruchu chroni przed przypadkowym
przesunięciem przy kliknięciu). Schemat sterowania to preferencja użytkownika
(`sceneControlScheme`): `modern` (kółko = zoom) albo `classic` (Ctrl+kółko = zoom, kółko = przewijanie).

**Tokeny postaci** to umieszczenia (`GameCharacter`) na scenie. Jedna postać może mieć kilka
umieszczeń. **Widoczność tokenu** (`Hidden`) jest niezależna od widoczności karty: posiadacz
karty zawsze widzi token, a gracz bez karty nie dostaje ukrytego tokenu wcale
(`FilterSceneCharacterTokensForUser`). MG widzi ukryte tokeny przyciemnione.

**Wyposażenie tokenu** (`TokenGear`, FEATURE-102): 8 slotów na pierścieniu, kwadraty i paski HP.
Układ pochodzi z `TokenDisplayConfig` szablonu, a wartości z postaci (stany, statystyki) albo
z danego umieszczenia (paski ręczne, dodane paski). Każdy element może być ukryty dla graczy,
a pasek może ukrywać tylko liczby. Gracz bez karty dostaje gotowy `TokenView` z rozwiązanymi
wartościami, nigdy surowe dane.

**Ping** wskaźnikiem i linijka miarki to zdarzenia ulotne: klient wysyła je przez WebSocket,
a hub przekazuje je dalej, nic nie zapisując.

**Współrzędne** mgły i rysunków są zapisywane w przestrzeni sceny, nie w pikselach ekranu, więc
działają przy każdym zoomie.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Viewport, zoom, przewijanie | `src/components/scene/SceneViewport.jsx`, `ZoomContext.js` |
| Tryby | `src/components/scene/sceneModes.js`, `ModeSwitchLabel.jsx` |
| Tokeny | `MapTokensLayer.jsx`, `MapCharacterToken.jsx`, `TokenResizeHandles.jsx`, `TokenRotateHandle.jsx`, `MarqueeOverlay.jsx`, `src/hooks/useGroupDrag.js` |
| Wyposażenie tokenu | `src/components/token-display/`, `src/api/tokenGear.js` |
| Mgła | `FogLayer.jsx`, `src/hooks/useFogTools.js`, `useFogGmOpacity.js`, backend `FogHandler/FogService/FogRepository` |
| Rysowanie | `DrawingLayer.jsx`, `DrawingToolbar.jsx`, `useDrawingTextInput.js`, `src/hooks/useDrawingTools.js`, backend `Drawing*` |
| Miarka | `MapRulerOverlay.jsx`, `src/hooks/useMapRuler.js`, `useDragRuler.js` |
| Menu kontekstowe | `SceneImageContextMenu.jsx`, `SceneTokenMultiContextMenu.jsx` |
| Backend scen | `internal/http/SceneHandler.go`, `GameService` (sceny, tokeny, widoczność) |

## Pułapki

- Zdarzenia myszy na scenie: przeczytaj sekcję „Zdarzenia myszy na scenie” w `CLAUDE.md`.
  Kolejność `contextmenu` różni się między macOS a Windows, mysz to jeden pointer, a listener
  na `document` w fazie capture wyprzedza każdy handler Reacta.
- Hub przekazuje wiadomości od klienta wszystkim w grze bez walidacji (`ReadPump` →
  `Broadcast`). Nie opieraj na tym niczego, co wymaga uprawnień. Wszystko trwałe musi iść przez REST.
- Ukrycie tokenu albo zmiana karty zmienia to, **kto** widzi token, więc wymaga refetchu, nie delty.
- Przypisanie gracza do sceny usuwa go z innych scen w pętli, bez transakcji. Błąd w połowie
  może zostawić gracza na dwóch scenach.
- Warstwy canvasowe (`FogLayer`, `DrawingLayer`) i `SceneViewport` nie mają testów renderujących.
