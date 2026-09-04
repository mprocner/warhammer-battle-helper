# FEATURE-187 — Widoczność tokenów postaci egzekwowana na żywo

Data: 2026-09-04

## Problem

Ukrycie tokena postaci ikoną oczka nie ukrywa go przed graczami. Token znika u gracza
dopiero po odświeżeniu strony (F5).

## Przyczyna

Backend jest poprawny. `GameService.FilterSceneCharacterTokensForUser`
(`internal/service/GameService.go:2568`) usuwa placement z `Hidden` dla widza bez karty
postaci, a zostawia go dla GM i dla posiadacza karty (`Character.VisibleTo`). Filtr biegnie
na `GET /games/:id` (`GameHandler.go:222`), więc pełne pobranie stanu zawsze zwraca
prawidłowy zestaw tokenów.

Błąd jest we froncie, w ścieżce live. Handler `SCENE_CHARACTER_UPDATED`
(`GameSession.jsx:533`) nie pobiera stanu z serwera — mutuje `gameState` lokalnie,
ustawiając `{ ...c, hidden }` na placemencie. Skutki:

- Mapa renderuje z `currentScene.characters` (`DndContext.jsx:979`, `buildPlacedCharacters`),
  czyli dokładnie z tych zmutowanych danych — placement u gracza nadal istnieje.
- `MapCharacterToken.jsx:277` liczy `hiddenFromPlayers = isGM && hidden`, więc u gracza flaga
  nie robi nic. Front nigdy nie miał filtra widoczności — i mieć go nie powinien.
- `setCharacterUpdateTrigger` prowadzi do `fetchGameCharacters` (`DndContext.jsx:842`), które
  odświeża wyłącznie `fightZones` (pula boczna i occupancy), nie dane renderujące mapę.

Ta sama przyczyna daje drugi objaw. Handler `CHARACTER_VISIBILITY_UPDATED`
(`GameSession.jsx:313`) również mutuje tylko lokalnie. Gdy GM nada graczowi kartę postaci,
której token jest ukryty, gracz nie dostanie tokena na mapę do czasu F5. Odebranie karty
przy ukrytym tokenie zostawia token widoczny.

## Rozwiązanie

Serwerowy filtr zostaje jedynym miejscem, które zna regułę widoczności. Handlery WS
przestają zgadywać wynik tej reguły i pobierają stan przez `fetchGameState()`.

Odrzucone alternatywy:

- **Targetowany broadcast** (wzorzec `DecideSceneImageBroadcast` dla obrazów sceny): serwer
  liczy posiadaczy karty i wysyła ADD/REMOVE per użytkownik. Oszczędza refetch, ale duplikuje
  regułę `hasCard` w ścieżce broadcastu obok filtra.
- **Filtr kliencki**: front sam ukrywa token gdy `hidden && !mamKarty`. Najszybsze, ale reguła
  widoczności żyje wtedy w dwóch miejscach, a payload WS musiałby nieść dane o ukrytym tokenie
  do wszystkich.

## Zmiany

### 1. `GameSession.jsx:533` — handler `SCENE_CHARACTER_UPDATED`

Usunąć lokalną mutację `{ ...c, hidden }`, wywołać `fetchGameState()`. `setCharacterUpdateTrigger`
zostaje — odświeża `fightZones` w `DndContext`.

Optymistyczna mutacja nie wraca nawet dla GM: przygaszenie tokena i stan ikony oczka u GM
pojawiają się po refetchu, kosztem jednego round-tripu. Decyzja świadoma — jedna ścieżka
dla wszystkich widzów.

### 2. `GameService.go:1531` — payload zdarzenia

Skurczyć payload do `{ sceneId }`. Pola `characterId` i `hidden` nie są już nikomu potrzebne,
a dziś trafiają do wszystkich graczy — gracz bez karty dowiaduje się, że pod danym
`characterId` istnieje ukryty token. Komentarz przy broadcaście uzupełnić o informację, że
payload jest celowo pusty (refetch dostarcza dane przez filtr).

### 3. `GameSession.jsx:313` — handler `CHARACTER_VISIBILITY_UPDATED`

Dołożyć `fetchGameState()`. Lokalna mutacja `characters[].visibleTo` i `setCharacterDataTrigger`
zostają — dają natychmiastowy stan modala widoczności i odświeżenie puli w `DndContext`.
Refetch dokłada lub zabiera ukryty token na mapie.

## Reguła po naprawie

Zachowanie się nie zmienia — zaczyna być egzekwowane na żywo, nie dopiero po F5.

| Widz | Token oznaczony `hidden` |
|---|---|
| GM | widzi, przygaszony (`map-char-token--hidden`) |
| gracz w `VisibleTo` | widzi normalnie, bez żadnego oznaczenia |
| gracz bez karty | nie dostaje placementu w ogóle |

Posiadacz karty nie dostaje sygnału, że GM ukrył token przed resztą — token wygląda u niego
jak każdy inny.

## Weryfikacja

Backend: logika `FilterSceneCharacterTokensForUser` bez zmian, zmienia się tylko kształt
payloadu broadcastu. `go test ./...` jako regresja.

Front: handlery WS w `GameSession.jsx` nie mają pokrycia testami — komponent renderuje całą
sesję gry, a `GameSession` nie jest testowany. Weryfikacja manualna dwoma sesjami wg
`local-e2e-verification-recipe`:

1. Oczko na tokenie postaci, której gracz NIE ma w `VisibleTo` — token znika u gracza bez F5,
   u GM zostaje przygaszony.
2. Oczko na tokenie postaci, którą gracz MA — token zostaje u gracza, nieprzygaszony.
3. Nadanie karty w menu widoczności przy ukrytym tokenie — token pojawia się u gracza na żywo.
4. Odebranie karty przy ukrytym tokenie — token znika u gracza na żywo.
