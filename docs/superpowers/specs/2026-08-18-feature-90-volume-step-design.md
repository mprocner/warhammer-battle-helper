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
   a nie porzucany — inaczej wyjście z gry w ciągu 300 ms od ruchu gałką cicho gubi
   ustawienie.
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

const volumeTimerRef = useRef(null);   // id timera
const pendingValueRef = useRef(null);    // wartość czekająca na wysłanie

const commitVolume = useCallback((vol) => {
  setVolume(gameId, vol).catch(err => console.error('Failed to set volume:', err));
}, [gameId]);

const onGmVolumeChange = useCallback((vol) => {
  setMusicState(prev => ({ ...prev, gmVolume: vol }));  // natychmiast: gałka + audio MG
  pendingValueRef.current = vol;
  if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
  volumeTimerRef.current = setTimeout(() => {
    volumeTimerRef.current = null;
    pendingValueRef.current = null;
    commitVolume(vol);
  }, VOLUME_COMMIT_DELAY_MS);
}, [commitVolume]);

// flush przy odmontowaniu
useEffect(() => () => {
  if (volumeTimerRef.current) {
    clearTimeout(volumeTimerRef.current);
    commitVolume(pendingValueRef.current);
  }
}, [commitVolume]);
```

`onGmVolumeChange` dochodzi do obiektu zwracanego przez hook.

Handler `WS_EVENTS.MUSIC_VOLUME` (`useGameMusic.js:181`) pozostaje **bez zmian**.

## Obsługa błędów

Nieudany POST: `console.error`, stan lokalny zostaje na wartości optymistycznej —
zgodnie z obecnym zachowaniem `MusicTab.jsx:398`. Ewentualny rozjazd ze stanem serwera
naprawia kolejny `syncFromGame`.

## Testy

Nowy plik `src/hooks/useGameMusic.volume.test.js`, wzorowany na
`src/components/tabs/HandoutsTab.wsRace.test.jsx`. Fake timery + zamockowane `api/music`:

1. Dziesięć szybkich wywołań `onGmVolumeChange` → dokładnie jedno wywołanie `setVolume`,
   z ostatnią wartością.
2. `musicState.gmVolume` zmienia się natychmiast po wywołaniu, przed upływem timera.
3. Zdarzenie WS `MUSIC_VOLUME` z tą samą wartością nie cofa stanu lokalnego.

Weryfikacja ręczna: przeciągnięcie suwaka MG w zakładce Sieć pokazuje jeden request
zamiast kilkunastu; suwak gracza w `GeneralTab` przeskakuje co 1% i przeżywa reload.

## Poza zakresem

- Logarytmiczna (percepcyjna) skala głośności. Przy `gmVolume = 0.10` krok 1% u gracza
  zmienia realną głośność o 0.001 i jest niesłyszalny. Skala liniowa zostaje bez zmian.
- Płynne przejście głośności u graczy w trakcie ruchu gałką MG.
