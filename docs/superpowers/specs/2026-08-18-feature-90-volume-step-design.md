# FEATURE-90 — krok głośności muzyki 1% zamiast 5%

Data: 2026-08-18

## Cel

Suwaki głośności muzyki mają zmieniać wartość co 1%, a nie co 5% — zarówno w `MusicTab`
(suwak MG, wspólny dla całego stołu), jak i w `GeneralTab` (suwak lokalny gracza).
Dotyczy MG i graczy.

## Kontekst — dwa niezależne suwaki

W aplikacji istnieją dwa różne suwaki głośności, które łączą się mnożeniem:

```js
// useGameMusic.js:42
audioRef.current.volume = musicState.gmVolume * playerVolume;
```

| Suwak | Gdzie | Zasięg | Trwałość |
|---|---|---|---|
| `playerVolume` | `GeneralTab` (MG i gracze) | tylko własna przeglądarka | `localStorage` |
| `gmVolume` | `MusicTab` (tylko MG) | wszyscy w grze | Mongo + broadcast WS |

`playerVolume` nie dotyka sieci — dla niego zmiana kroku to jedna linia.
Cała złożoność feature'a dotyczy wyłącznie `gmVolume`.

## Problem

Dziś każdy `onChange` suwaka MG wykonuje `POST /games/:id/music/volume`
(`MusicTab.jsx:394`) → zapis Mongo → `BroadcastToGame(MUSIC_VOLUME)`
(`GameService.go:2553`). Suwak jest kontrolowany wartością z serwera
(`value={musicState.gmVolume}`), więc gałka rusza się dopiero po powrocie echa WS.

Przy kroku 1% przeciągnięcie od 0 do 100% oznaczałoby ~100 requestów, ~100 zapisów DB
i ~100 broadcastów do każdego klienta, a gałka szarpałaby się na spóźnionych echach.

## Decyzje projektowe

1. **Wartość lokalna aktualizuje się natychmiast, wysyłka jest opóźniona.**
   MG widzi i słyszy zmianę na żywo; gracze dostają wynik końcowy.
2. **Stan optymistyczny mieszka w `useGameMusic`, nie w `MusicTab`.**
   Dzięki temu istnieje jedno źródło prawdy (`musicState.gmVolume`) i własne audio MG
   reaguje natychmiast — `useEffect` z linii 42 odpala się w tej samej klatce.
   Wariant z lokalnym `useState` w `MusicTab` tworzyłby dwa stany opisujące tę samą rzecz.
3. **Jeden POST na całe przeciągnięcie, po 300 ms bezczynności (debounce).**
   Odrzucono throttle 150 ms: przy wysyłce tylko wartości końcowej znika wyścig ech
   (echo niesie tę samą liczbę co stan lokalny, więc jest no-opem), więc odpada też
   potrzeba osobnego refa do filtrowania własnych ech.
   Świadomy koszt: gracze usłyszą skok głośności zamiast płynnego przejścia.
   MG miksuje na własnych głośnikach, które reagują na żywo, więc nadal ocenia efekt.
4. **Debounce po bezczynności, nie `onPointerUp`.**
   Strzałki klawiatury nie generują `pointerup` — dosłowne „puszczenie gałki"
   wymagałoby dodatkowo `onKeyUp` i `onBlur` i psuło dostępność.
5. **Flush przy odmontowaniu.** Oczekujący POST jest wysyłany (fire-and-forget),
   a nie porzucany — inaczej wyjście z gry (np. przejście do innego widoku w ramach
   aplikacji) w ciągu 300 ms od ruchu gałką cicho gubi ustawienie.
   Dotyczy to wyłącznie nawigacji wewnątrz aplikacji — React nie odpala cleanupów
   efektów przy zamknięciu karty ani odświeżeniu strony, więc zamknięcie/reload w tym
   samym oknie 300 ms nadal cicho gubi zmianę. `sendBeacon`, który przetrwałby takie
   zamknięcie, nie potrafi nieść nagłówka `Authorization`, na którym opiera się to API —
   luka jest świadomie akceptowana, nie domykana.
6. **Wysyłka zostaje na HTTP POST, nie przechodzi na WebSocket.**
   `hub.go:321` rozgłasza przychodzące wiadomości WS ślepo — bez sprawdzenia, czy nadawca
   jest MG, i bez zapisu do bazy. Ścieżka HTTP przechodzi przez `SetVolumePersist`
   (`GameService.go:2544`), gdzie jest autoryzacja i trwałość.

## Zakres zmian

Backend: **brak**. `MusicHandler.go:757` już przycina wartość do `[0,1]`, a `float64`
nie jest wrażliwy na wielkość kroku.

Frontend:

| Plik | Zmiana |
|---|---|
| `src/components/tabs/GeneralTab.jsx:354` | `step="0.05"` → `step="0.01"` |
| `src/components/tabs/MusicTab.jsx:659` | `step="0.05"` → `step="0.01"` |
| `src/components/tabs/MusicTab.jsx:394` | `handleVolumeChange` woła prop `onGmVolumeChange` zamiast `setVolume` |
| `src/components/tabs/MusicTab.jsx:14` | usunięcie `setVolume` z importów (brak innych użyć) |
| `src/components/tabs/MusicTab.jsx:36` | nowy prop `onGmVolumeChange` |
| `src/hooks/useGameMusic.js` | nowy `onGmVolumeChange` + debounce + flush; import `setVolume` |
| `src/components/GameSession.jsx:65` | destrukturyzacja `onGmVolumeChange` z hooka |
| `src/components/GameSession.jsx:~1091` | przekazanie propa do `RightPanel` |
| `src/components/panels/RightPanel.jsx:277` | przekazanie propa do `MusicTab` |

## Implementacja rdzenia

W `useGameMusic.js`:

```js
const VOLUME_COMMIT_DELAY_MS = 300;

const volumeTimerRef = useRef(null);     // id timera
const pendingVolumeRef = useRef(null);   // wartość czekająca na wysłanie

const commitGmVolume = useCallback((vol) => {
  setVolume(gameId, vol).catch(err => console.error('Failed to set volume:', err));
}, [gameId]);

const onGmVolumeChange = useCallback((vol) => {
  setMusicState(prev => ({ ...prev, gmVolume: vol }));  // natychmiast: gałka + audio MG
  pendingVolumeRef.current = vol;
  if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
  volumeTimerRef.current = setTimeout(() => {
    volumeTimerRef.current = null;
    pendingVolumeRef.current = null;
    commitGmVolume(vol);
  }, VOLUME_COMMIT_DELAY_MS);
}, [commitGmVolume]);

// flush przy odmontowaniu
useEffect(() => () => {
  if (volumeTimerRef.current) {
    clearTimeout(volumeTimerRef.current);
    // Zerujemy oba refy PRZED commitem: to samo cleanup może odpalić się ponownie
    // (np. przy zmianie gameId, bez żadnej realnej akcji użytkownika pomiędzy), a wtedy
    // truthy volumeTimerRef.current sprawiłby, że drugi commit poleciałby do NOWEGO
    // gameId z głośnością STAREJ gry — zapis między grami.
    volumeTimerRef.current = null;
    const pending = pendingVolumeRef.current;
    pendingVolumeRef.current = null;
    commitGmVolume(pending);
  }
}, [commitGmVolume]);
```

`onGmVolumeChange` dochodzi do obiektu zwracanego przez hook.

`syncFromGame` (wywoływane po każdym `fetchGameState()`) dostało jeden warunek: dopóki
`volumeTimerRef.current` jest ustawiony (commit MG wciąż czeka), pole `gmVolume` w
`setMusicState` zachowuje wartość lokalną zamiast nadpisywać ją danymi z serwera —
inaczej gałka MG cofałaby się w trakcie przeciągania, gdy WS-owy `fetchGameState()`
przyleci w złym momencie.

Handler `WS_EVENTS.MUSIC_VOLUME` (`useGameMusic.js:225`) początkowo zostawiono **bez
zmian** — założenie było, że echo zawsze niesie wartość już trzymaną lokalnie, więc
nadpisanie jest no-opem. To prawda tylko dla jednego MG w grze: gdy drugi MG (drugi tab
tego samego konta albo współ-MG) zmieni głośność w trakcie gdy commit tego taba wciąż
czeka, echo niesie CUDZĄ, inną wartość — gałka i audio tego taba skakały na moment do
wartości z cudzego echa, po czym wracały, gdy przyleciało echo własnego commitu. Finalna
wartość i tak była poprawna (własny commit ląduje jako ostatni), ale widać i słychać było
mignięcie. Poprawka: ten sam warunek co w `syncFromGame` — dopóki `volumeTimerRef.current`
jest ustawiony, echo nie nadpisuje `gmVolume`.

## Obsługa błędów

Nieudany POST: `console.error`, stan lokalny zostaje na wartości optymistycznej —
zgodnie z obecnym zachowaniem `MusicTab.jsx:398`. Ewentualny rozjazd ze stanem serwera
naprawia kolejny `syncFromGame`.

## Testy

Plik `src/hooks/useGameMusic.volume.test.js`, wzorowany na
`src/components/tabs/HandoutsTab.wsRace.test.jsx`. Fake timery + zamockowane `api/music`:

1. Dziesięć szybkich wywołań `onGmVolumeChange` → dokładnie jedno wywołanie `setVolume`,
   z ostatnią wartością.
2. `musicState.gmVolume` zmienia się natychmiast po wywołaniu, przed upływem timera.
3. Echo WS `MUSIC_VOLUME` przychodzące PO tym, jak commit już poleciał, nie wywołuje
   drugiego `setVolume` (echo nie wraca ścieżką commitu).
4. Echo WS `MUSIC_VOLUME` z INNĄ (nieaktualną) wartością, które przyjdzie w trakcie
   oczekiwania na commit, nie zmienia tego, co finalnie trafia do `setVolume` — wygrywa
   wartość z ostatniego ruchu gałką, a nie echo w locie. Test sprawdza też
   `musicState.gmVolume`: dzięki guardowi w handlerze `MUSIC_VOLUME` gałka w ogóle nie
   skacze do wartości z echa, tylko zostaje na lokalnej wartości przez cały czas
   oczekiwania na commit.
5. Oczekująca zmiana jest wysyłana (flush) przy odmontowaniu hooka.

Weryfikacja ręczna: przeciągnięcie suwaka MG w zakładce Sieć pokazuje jeden request
zamiast kilkunastu; suwak gracza w `GeneralTab` przeskakuje co 1% i przeżywa reload.

## Poza zakresem

- Logarytmiczna (percepcyjna) skala głośności. Przy `gmVolume = 0.10` krok 1% u gracza
  zmienia realną głośność o 0.001 i jest niesłyszalny. Skala liniowa zostaje bez zmian.
- Płynne przejście głośności u graczy w trakcie ruchu gałką MG.
