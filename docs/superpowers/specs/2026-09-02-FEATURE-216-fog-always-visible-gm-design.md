# FEATURE-216 — Mgła wojny zawsze widoczna u MG

**Status:** design zaakceptowany
**Data:** 2026-09-02

## Problem

MG widzi mgłę wojny **tylko** po wejściu w tryb mgły (`editingLayer === 'fog'`). Gdy przełączy się
na rysowanie, mierzenie albo zwykły pan, mgła znika z jego ekranu — MG traci z oczu to, co gracze
mają zasłonięte, choć mgła dla nich cały czas działa.

Cel: mgła widoczna u MG **zawsze**, gdy jest włączona w ustawieniach sceny, niezależnie od
wybranego narzędzia — jako półprzezroczysty cień, tak jak dziś w trybie mgły. Warstwa mgły nie może
przy tym przechwytywać zdarzeń myszy poza trybem mgły, żeby nie zmienić zachowania innych narzędzi.

## Stan wyjściowy

| Miejsce | Co robi |
|---|---|
| `SceneViewport.jsx:881` | Gate montażu: MG `editingLayer === 'fog'`, gracz `scene.fogEnabled` |
| `FogLayer.jsx:404-405` | Drugi, zduplikowany gate: `if (isGM && !inFogMode) return null;` |
| `FogLayer.jsx:408` | `cssOpacity = !isGM ? 1.0 : inFogMode ? 0.5 : fogOpacity` |
| `FogLayer.jsx:420` | `pointerEvents: isEditingFog ? 'auto' : 'none'` |

Dwie obserwacje z tego stanu, które kształtują rozwiązanie:

1. **Wymaganie „nie łapać eventów" jest już spełnione.** `pointerEvents` przełącza się na `'none'`
   wszędzie poza `isEditingFog` (tryb mgły z narzędziem innym niż `pan`). Ta część nie wymaga
   żadnej zmiany — trzeba tylko jej nie zepsuć.
2. **`scene.fogOpacity` to martwe pole.** Gracz dostaje twardo `1.0`, a gałąź `: fogOpacity` jest
   nieosiągalna, bo poprzedza ją `return null` dla MG poza trybem mgły. Pole nie ma też żadnego UI
   w `ScenesTab` — jedyny sterownik mgły tam to checkbox `fogEnabled` (`ScenesTab.jsx:418-428`).

## Rozwiązanie

### A. Jeden gate widoczności, w `FogLayer`

Warunek montażu jest dziś rozpisany w dwóch plikach i trzeba go zmieniać w dwóch miejscach zgodnie.
Scalamy go w komponent, który i tak ma własny `return null`. `SceneViewport` renderuje `<FogLayer>`
bezwarunkowo — dokładnie tak, jak sąsiedni `<DrawingLayer>` w tym samym pliku.

`SceneViewport.jsx:881` — warunek `(isGM ? editingLayer === 'fog' : displayedScene?.fogEnabled)`
zastąpiony przez `displayedScene &&`.

`FogLayer.jsx`:

```js
const inFogMode    = isGM && editingLayer === 'fog';
const isEditingFog = inFogMode && fogTool !== 'pan';

if (!fogVisibleFor({ isGM, fogEnabled, inFogMode })) return null;
```

gdzie predykat jest eksportowaną czystą funkcją (wzorem `canClosePolygon` z tego samego pliku):

```js
export const fogVisibleFor = ({ isGM, fogEnabled, inFogMode }) =>
  isGM ? (fogEnabled || inFogMode) : fogEnabled;
```

Człon `|| inFogMode` zachowuje istniejące zachowanie: przy `fogEnabled === false` MG po wejściu
w tryb mgły nadal widzi warstwę i może malować odsłonięcia „na zapas", zanim włączy mgłę graczom.
To świadomie zachowana funkcja, nie efekt uboczny.

`pointerEvents` i `cursor` zostają bez zmian — sterują się `isEditingFog`, który nie zmienia
znaczenia. Poza trybem mgły warstwa jest klikalna na wylot, więc żadne inne narzędzie nie traci
zdarzeń.

**Świadomie przyjęty skutek uboczny:** `FogLayer` ma `zIndex: 30`, `DrawingLayer` — `25`
(`DrawingLayer.jsx:488`). Gdy MG rysuje przy włączonej mgle, jego rysunek jest przyciemniony mgłą.
To zgodne z tym, co widzi gracz, i uznajemy za pożądane.

### B. Przezroczystość podglądu MG jako preferencja użytkownika

`cssOpacity` upraszcza się do:

```js
const cssOpacity = isGM ? fogGmOpacity : 1.0;
```

Gracz zawsze dostaje pełną, nieprześwitującą mgłę — suwak nie ma jak przypadkiem odsłonić mu mapy.

**Gdzie mieszka wartość.** Nie w scenie: to podgląd MG, nie właściwość mapy. Nie w `localStorage`:
projekt ma już ustalony wzorzec preferencji per-użytkownik na backendzie —
`User.Settings.SceneControlScheme` (`internal/models/User.go:31`) obsługiwane przez
`GET/PATCH /settings` (`AuthHandler.GetSettings`/`UpdateSettings`) i konsumowane hookiem
`useControlScheme` (`hooks/useControlScheme.js`). `sceneControlScheme` to preferencja dokładnie tej
samej natury — lokalne zachowanie sceny, nie dane gry — więc nowa preferencja idzie tam samo.

Zmiany:

- `models.UserSettings` — nowe pole `FogGmOpacity float64` (`bson:"fogGmOpacity,omitempty"`).
- `hooks/useFogGmOpacity.js` — kopia kształtu `useControlScheme`: `useState` z wartością domyślną,
  `getSettings()` w `useEffect`, setter zapisujący przez `updateSettings`.
- `GameSession.jsx` — wywołanie hooka i przekazanie pary wartość/setter do `SceneViewport`
  (dalej do `FogLayer`) oraz do `DrawingToolbar`, wzorem istniejącego `brushSize`
  (`GameSession.jsx:66`, `:1061`).
- `DrawingToolbar.jsx` — suwak w `drawing-toolbar__slider-row`, renderowany gdy `isFogMode`,
  bezpośrednio pod suwakiem `brushSize` (`DrawingToolbar.jsx:193-204`). Zakres `0.1`–`1.0`,
  krok `0.05`, wartość domyślna `0.5` (dzisiejsza stała). Etykieta pokazuje procent. Dolna granica
  `0.1`, nie `0`: przy zerze warstwa byłaby niewidoczna, a wciąż przechwytywałaby zdarzenia w trybie
  mgły — MG malowałby w ciemno. Front czyta ustawienie jako `settings.fogGmOpacity || 0.5`, więc brak
  pola u istniejących użytkowników daje dzisiejszą wartość.
- i18n: nowy klucz `scenes.fogGmOpacity` w `locales/en` i `locales/pl`, dodany w obu równolegle.

Suwak jest osiągalny tylko po wejściu w tryb mgły. To akceptowalne: ustawia się go raz, a preferencja
działa potem we wszystkich trybach.

**Błąd do naprawienia po drodze.** `UserRepository.UpdateSettings` (`UserRepository.go:72`) robi
`$set: {"settings": settings}` — podmienia **cały** poddokument. Dziś nieszkodliwe, bo pole jest
jedno. Z dwoma polami zapis przezroczystości skasowałby `sceneControlScheme`, bo front PATCHuje
pojedyncze pole (`useControlScheme.js` wysyła `{ sceneControlScheme: val }`). Naprawa:

- request DTO z pointerami (`*string`, `*float64`), żeby odróżnić „pole nieprzysłane" od pola
  przysłanego z wartością zerową — bez tego rozróżnienia nie da się zbudować częściowego `$set`;
- `UpdateSettings` buduje `bson.M` z kluczami `settings.<pole>` wyłącznie dla pól obecnych
  w żądaniu; pusty zestaw pól kończy się bez zapisu.

Wydzielamy do tego czystą funkcję `settingsUpdateFields(req) bson.M`, którą da się przetestować
bez Mongo.

### C. Usunięcie `scene.fogOpacity`

Pole nigdy nie wpływało na render i nie ma UI. Zgodnie z zasadą „brak backward compat — stare dane
można usunąć" znika w całości, razem z całą ścieżką, którą było przenoszone:

| Plik | Co usunąć |
|---|---|
| `internal/models/Game.go:398` | `Scene.FogOpacity` |
| `internal/models/Game.go:549` | `ToggleFogRequest.FogOpacity` |
| `internal/service/FogService.go:41-53` | domyślka `0.85`, argument, klucz `fogOpacity` w broadcaście `EventFogToggled` |
| `internal/repository/FogRepository.go:23-41` | parametr `opacity` i warunkowe `setFields["scenes.$.fogOpacity"]` |
| `components/GameSession.jsx:703-707` | `fogOpacity` z destrukturyzacji payloadu WS i z aktualizacji sceny |
| `components/tabs/ScenesTab.jsx:196` | `fogOpacity` z ciała `toggleFog` |
| `components/scene/FogLayer.jsx:51` | `const fogOpacity = ...` |

## Testy

`FogLayer` to warstwa canvasowa — w tym repo takie warstwy nie mają testów renderujących i to się
nie zmienia. Zamiast tego testujemy wydzielone czyste funkcje:

- `FogLayer.test.js` — `fogVisibleFor` na pełnej tablicy prawdy ośmiu kombinacji
  (`isGM` × `fogEnabled` × `inFogMode`). Kluczowe przypadki: MG + `fogEnabled` + dowolny inny tryb
  → widoczna (to jest ten feature); MG + `!fogEnabled` + tryb mgły → widoczna (malowanie na zapas);
  gracz + `!fogEnabled` → ukryta.
- backend — `settingsUpdateFields`: żądanie z samym `fogGmOpacity` daje dokładnie jeden klucz
  `settings.fogGmOpacity` i nie rusza `settings.sceneControlScheme` (to jest ten błąd z sekcji B);
  żądanie z samym `sceneControlScheme` — symetrycznie; puste żądanie daje pustą mapę.

Regresja do sprawdzenia ręcznie, bo `pointerEvents` nie jest testowalne w jsdom: przy włączonej
mgle i narzędziu innym niż mgła — przeciąganie tokenów, rysowanie, linijka i pan prawym przyciskiem
działają jak wcześniej.

## Poza zakresem

- Sterowanie przezroczystością mgły **graczy** — gracz zawsze `1.0`.
- Osobne przezroczystości dla różnych trybów MG — jedna wartość dla wszystkich.
- Zmiana kolejności warstw mgły i rysowania.
