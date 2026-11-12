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

Na niezaznaczonym tokenie (`showAtRest` w `TokenRingChrome`) stan widać tylko, gdy jest aktywny,
pole i wybór — gdy mają wartość, a licznik (`number`) **zawsze**, z brakiem wartości jako 0.
Pułapka: `ImageTokenSlot.Number` to `float64` z `omitempty`, więc zero w ogóle nie przychodzi
w JSON. Warunek `number != null` chował każdy licznik równy 0 (domyślna wartość nowego slotu),
a u postaci — każdy licznik, którego nikt jeszcze nie ustawił.

**Ping** wskaźnikiem i linijka miarki to zdarzenia ulotne: klient wysyła je przez WebSocket,
a hub przekazuje je dalej, nic nie zapisując.

**Kolor gracza na mapie** (PLAYRPG-340, model w `03-gry-i-uczestnicy.md`). Miarki (własna
i cudze) i pingi rysują się kolorem uczestnika z `participantColor`. `POINTER_PING` niesie
`userId` nadawcy (hub przekazuje payload surowo, jak `MAP_RULER`), a `PointerPing` dostaje kolor
przez `--ping-color`. Rysowanie startuje w kolorze gracza: `useDrawingTools(playerColor)` zwraca
`pickedColor ?? playerColor`. Kolor z przybyłych później uczestników albo zmieniony w
ustawieniach podąża więc za graczem, dopóki ten nie wybierze koloru w toolbarze. Od tej chwili
wygrywa wybór ręczny.

**Współrzędne** mgły i rysunków są zapisywane w przestrzeni sceny, nie w pikselach ekranu, więc
działają przy każdym zoomie.

**Kolejka tur (PLAYRPG-1).** Każda scena może mieć walkę (`Scene.Combat`, `json:"-"`). Wpisy:
postać (`gameCharacter`, `Character.ID` — na scenie czy nie; jeden wpis na postać, aktywna
podświetla wszystkie swoje tokeny, menu tokenu operuje na jej wpisie), obrazek z warstwy tokenów
(`SceneImage.ID`) albo wpis ręczny. Wpis nigdy nie wskazuje rozstawienia — dawny kind `character`
(`GameCharacter.ID`) usunięto w PLAYRPG-352, a `Prune` wyrzuca zapisane wpisy nieznanego rodzaju.
Wpis postaci nie dziedziczy `Hidden` tokenu (MG ukrywa ręcznie); wpis obrazka startuje ukryty,
gdy obrazek jest ukryty. Panel dodawania (zawsze widoczny pod stopką okna — okno służy do przygotowania walki) grupuje kandydatów (`addGroups`: postacie graczy, BN, tokeny;
sortowanie `localeCompare` w języku UI, puste grupy pominięte), „Wszyscy” dodaje grupę jednym
`POST .../combat/entries` (PLAYRPG-358). Okno walki montuje `DndContext`, bo tylko tam jest
lista postaci (`initialCharacters`). Pasek u MG prowadzi walkę bez okna: jeden przycisk
`next`/`end-round` (przełącza się na `allActed`), klik w portret = `activate`. Pasek to portal do `body` (`position: fixed`, z-index 1400 — nad
panelami i ich uchwytami, pod oknami Window Managera od 1500); przeciąganie ogranicza okno
przeglądarki, a domyślne miejsce liczy `useStripPosition` ze środka mapy pod `.top-bars`. Tura to
flaga `Acted` + jedno `ActiveID`; MG może aktywować kogokolwiek. Odczyt wyłącznie przez
`GET /games/:id/scenes/:sceneId/combat` — `BuildCombatView` maskuje per widz (gracz: bez ukrytych,
bez wartości, ukryta tura → `LastVisibleActiveID`). Zapis wyłącznie przez `CombatService.mutate`.

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

- **Domyślna scena nie ma nazwy.** `EnsureDefaultScene` tworzy ją z pustym `Name`, bo serwer nie
  zna języka widza. Front pokazuje wtedy `scenes.defaultName` („Scena 1” / „Scene 1”) —
  każde miejsce wyświetlające nazwę sceny musi iść przez `sceneDisplayName`
  (`src/components/scene/sceneName.js`), inaczej pokaże pustą kartę. Szybkie „+ Scena” nazywa
  nowe sceny po stronie klienta (`scenes.numberedName`), więc ta nazwa zostaje w języku MG.

- Zdarzenia myszy na scenie: przeczytaj sekcję „Zdarzenia myszy na scenie” w `CLAUDE.md`.
  Kolejność `contextmenu` różni się między macOS a Windows, mysz to jeden pointer, a listener
  na `document` w fazie capture wyprzedza każdy handler Reacta.
- Hub przekazuje wiadomości od klienta wszystkim w grze bez walidacji (`ReadPump` →
  `Broadcast`). Nie opieraj na tym niczego, co wymaga uprawnień. Wszystko trwałe musi iść przez REST.
- Ukrycie tokenu albo zmiana karty zmienia to, **kto** widzi token, więc wymaga refetchu, nie delty.
- Przypisanie gracza do sceny usuwa go z innych scen w pętli, bez transakcji. Błąd w połowie
  może zostawić gracza na dwóch scenach.
- Warstwy canvasowe (`FogLayer`, `DrawingLayer`) i `SceneViewport` nie mają testów renderujących.
- `Scene.Combat` ma `json:"-"`, bo surowy `Game` idzie do graczy i do lobby. Test
  `TestSceneCombatNeverSerialized` pilnuje, żeby nikt tego nie zdjął.
- Każdy zapis walki jest warunkowy po `Combat.Version`. Przegrany wyścig wersji `mutate` powtarza
  (do 3 prób: wczytaj → uprawnienia → prune → zmiana → zapis); 409 dostaje klient dopiero po
  wyczerpaniu prób. `ErrConflict` zwrócony przez samą zmianę (nieaktualny aktywny przy `next` /
  `end-turn`, nieaktualna kolejność) **nie** jest powtarzany — zapis owija `saveError`, żeby te dwa
  przypadki dało się odróżnić. `end-turn`/`next` niosą „kogo dotyczą”, więc podwójne kliknięcie
  nie przeskoczy uczestnika.
- `end-turn` gracza wymaga jego sceny, trackera widocznego dla graczy i nieukrytego wpisu. Brak walki
  i walka ukryta dają graczowi to samo 403 — 404 zdradzałby, że ukryta walka istnieje. Gracz ma
  `canEndTurn` tylko na wpisie naprawdę aktywnym, nie na podstawionym „ostatnim widocznym”.
- Wpisy po usuniętych tokenach nie są czyszczone przy usuwaniu — `combat.Prune` odfiltrowuje je przy
  każdym odczycie i zapisie. Nowa ścieżka usuwania tokenu nie musi wiedzieć o walce, ale klient musi
  refetchować walkę na jej evencie (`onSourcesChanged` w `GameSession`).
- Zmiany walki ukrytej przed graczami idą eventem tylko do MG — sam event zdradzałby jej istnienie.
- Do walki trafiają tylko obrazki z warstwy `tokens` — `buildEntry` odrzuca inne.
- ID rozstawienia (`GameCharacter.ID`) nadaje repozytorium (`AddSceneCharacter`, `AddCharacter`),
  dlatego zwraca zapisany obiekt i to on idzie w evencie. Broadcast własnej kopii z serwisu
  wysyłał `"id": "000000000000000000000000"` (`json:"id"` bez `omitempty`), a klient dopisuje
  placement z eventu bez refetcha — do F5 każda akcja po `placement.id` trafiała w próżnię
  (PLAYRPG-352).
