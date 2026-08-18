# FEATURE-90 — krok głośności 1% — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oba suwaki głośności muzyki zmieniają wartość co 1% zamiast co 5%, bez zalewania backendu requestami przy przeciąganiu suwaka MG.

**Architecture:** Suwak gracza w `GeneralTab` jest czysto lokalny (`useState` + `localStorage`) — wystarczy zmiana atrybutu `step`. Suwak MG w `MusicTab` jest kontrolowany stanem z serwera, więc przenosimy jego obsługę do hooka `useGameMusic`: nowy `onGmVolumeChange` aktualizuje `musicState.gmVolume` natychmiast (gałka i własne audio MG reagują w tej samej klatce), a `POST /games/:id/music/volume` leci raz, po 300 ms bezczynności.

**Tech Stack:** React 19, Create React App (`react-scripts test` = Jest + jsdom), `@testing-library/react` 16 (`renderHook`), axios przez `src/api/music.js`.

**Spec:** `docs/superpowers/specs/2026-08-18-feature-90-volume-step-design.md`

## Global Constraints

- Backend nie jest zmieniany. `MusicHandler.go:757` już przycina wartość do `[0,1]`.
- Krok obu suwaków: dokładnie `step="0.01"`.
- Opóźnienie wysyłki: `VOLUME_COMMIT_DELAY_MS = 300`.
- Handler `WS_EVENTS.MUSIC_VOLUME` w `useGameMusic.js` pozostaje niezmieniony.
- Testy jednostkowe muszą mockować `../api/music` fabryką (`jest.mock` z factory) — prawdziwy moduł ciągnie axios w ESM, którego transform CRA odrzuca. Ten sam powód dotyczy `../api/axios`.
- Znany, istniejący błąd suite'u: `src/App.test.js` wywala się na ESM axiosa. To stan bazowy, nie regresja.
- Wszystkie stringi UI przez `t('klucz')` — w tym feature nie dodajemy nowych kluczy i18n.

## File Structure

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `src/hooks/useGameMusic.js` | źródło prawdy o stanie muzyki; dostaje debounce'owaną wysyłkę głośności MG | modyfikacja |
| `src/hooks/useGameMusic.volume.test.js` | testy debounce'u, optymistycznego stanu i echa WS | nowy |
| `src/components/GameSession.jsx` | przekazuje `onGmVolumeChange` z hooka do `RightPanel` | modyfikacja |
| `src/components/panels/RightPanel.jsx` | przekazuje prop do `MusicTab` | modyfikacja |
| `src/components/tabs/MusicTab.jsx` | suwak MG woła prop zamiast API; krok 1% | modyfikacja |
| `src/components/tabs/GeneralTab.jsx` | suwak gracza; krok 1% | modyfikacja |

---

### Task 1: Debounce'owana zmiana głośności MG w `useGameMusic`

Sedno feature'a. Po tym zadaniu hook wystawia `onGmVolumeChange`, ale nikt go jeszcze nie używa — `MusicTab` podłączamy w Zadaniu 2.

**Files:**
- Modify: `warhammer-battle-helper-front/src/hooks/useGameMusic.js`
- Test: `warhammer-battle-helper-front/src/hooks/useGameMusic.volume.test.js` (nowy)

**Interfaces:**
- Consumes: `setVolume(gameId, volume)` z `src/api/music.js:95` — zwraca Promise.
- Produces: `useGameMusic(gameId)` dokłada do zwracanego obiektu `onGmVolumeChange: (vol: number) => void`. Wywołanie natychmiast ustawia `musicState.gmVolume` na `vol` i planuje pojedynczy `setVolume(gameId, vol)` po 300 ms bez kolejnych wywołań.

- [ ] **Step 1: Napisz test debounce'u i stanu optymistycznego**

Utwórz `warhammer-battle-helper-front/src/hooks/useGameMusic.volume.test.js`:

```jsx
import { renderHook, act } from '@testing-library/react';
import { useGameMusic } from './useGameMusic';
import { setVolume } from '../api/music';
import { WS_EVENTS } from '../websocket/events';

jest.mock('../api/axios', () => ({ getApiUrl: () => 'http://api.test' }));

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../api/music', () => ({
  getMusic: jest.fn().mockResolvedValue({ musicFiles: [], playlists: [] }),
  playTrack: jest.fn().mockResolvedValue({}),
  nextTrack: jest.fn().mockResolvedValue({}),
  setVolume: jest.fn().mockResolvedValue({}),
}));

describe('useGameMusic — GM volume', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setVolume.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('sends a single request with the last value after a burst of changes', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      for (let i = 1; i <= 10; i++) {
        result.current.onGmVolumeChange(i / 100);
      }
    });

    expect(setVolume).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith('game-1', 0.1);
  });

  it('updates gmVolume immediately, before the request goes out', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.73);
    });

    expect(result.current.musicState.gmVolume).toBe(0.73);
    expect(setVolume).not.toHaveBeenCalled();
  });

  it('does not roll the state back when the WS echo carries the same value', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.73);
      jest.advanceTimersByTime(300);
    });

    act(() => {
      result.current.handleMusicMessage({
        type: WS_EVENTS.MUSIC_VOLUME,
        payload: { volume: 0.73 },
      });
    });

    expect(result.current.musicState.gmVolume).toBe(0.73);
  });

  it('flushes a pending change when the hook unmounts', () => {
    const { result, unmount } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.42);
    });

    unmount();

    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith('game-1', 0.42);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "useGameMusic.volume" --watchAll=false`

Expected: FAIL — `TypeError: result.current.onGmVolumeChange is not a function` we wszystkich czterech testach.

- [ ] **Step 3: Dodaj `setVolume` do importów hooka**

W `src/hooks/useGameMusic.js:2` zamień:

```js
import { getMusic, playTrack, nextTrack } from '../api/music';
```

na:

```js
import { getMusic, playTrack, nextTrack, setVolume } from '../api/music';
```

- [ ] **Step 4: Dodaj stałą i refy**

W `src/hooks/useGameMusic.js`, tuż nad `export function useGameMusic(gameId) {`, dodaj:

```js
// The GM slider is a controlled input fed by server state, so every change used to cost
// a POST + Mongo write + broadcast. With a 1% step that is ~100 round-trips per drag, so
// the value is applied locally at once and committed once the GM stops moving the knob.
const VOLUME_COMMIT_DELAY_MS = 300;
```

Wewnątrz hooka, obok pozostałych refów (po `musicStateRef`, ok. linii 32), dodaj:

```js
  const volumeTimerRef = useRef(null);
  const pendingVolumeRef = useRef(null);
```

- [ ] **Step 5: Dodaj `onGmVolumeChange` i flush przy odmontowaniu**

W `src/hooks/useGameMusic.js`, bezpośrednio pod `onPlayerVolumeChange` (ok. linii 38), dodaj:

```js
  const commitGmVolume = useCallback((vol) => {
    setVolume(gameId, vol).catch(err => console.error('Failed to set volume:', err));
  }, [gameId]);

  const onGmVolumeChange = useCallback((vol) => {
    // Optimistic: this also drives audioRef.current.volume through the effect below,
    // so the GM hears his own change without waiting for the WS echo.
    setMusicState(prev => ({ ...prev, gmVolume: vol }));
    pendingVolumeRef.current = vol;
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => {
      volumeTimerRef.current = null;
      pendingVolumeRef.current = null;
      commitGmVolume(vol);
    }, VOLUME_COMMIT_DELAY_MS);
  }, [commitGmVolume]);

  // Flush rather than drop: leaving the game within 300ms of a change would otherwise
  // lose it silently.
  useEffect(() => () => {
    if (volumeTimerRef.current) {
      clearTimeout(volumeTimerRef.current);
      commitGmVolume(pendingVolumeRef.current);
    }
  }, [commitGmVolume]);
```

- [ ] **Step 6: Wystaw `onGmVolumeChange` ze zwracanego obiektu**

W `src/hooks/useGameMusic.js` w bloku `return` (ok. linii 199) dodaj wpis po `onPlayerVolumeChange`:

```js
  return {
    audioRef,
    musicState,
    playerVolume,
    onPlayerVolumeChange,
    onGmVolumeChange,
    handleMusicMessage,
    handleSceneAssignAll,
    syncFromGame,
  };
```

- [ ] **Step 7: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "useGameMusic.volume" --watchAll=false`

Expected: PASS — 4 passed.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useGameMusic.js warhammer-battle-helper-front/src/hooks/useGameMusic.volume.test.js
git commit -m "feat(front): FEATURE-90 debounce the GM music volume commit

The GM slider is controlled by server state, so every onChange cost a POST,
a Mongo write and a broadcast to every client. A 1% step would turn one drag
into ~100 round-trips.

useGameMusic now owns the change: gmVolume is set optimistically so the knob
and the GM's own audio react in the same frame, and a single POST is sent
300ms after the GM stops moving. A pending commit is flushed on unmount so
leaving the game right after a change does not drop it silently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Podłączenie suwaka MG i krok 1% w `MusicTab`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:65` oraz ok. `:1094`
- Modify: `warhammer-battle-helper-front/src/components/panels/RightPanel.jsx:44` oraz `:277-281`
- Modify: `warhammer-battle-helper-front/src/components/tabs/MusicTab.jsx:14,36,394-401,659`

**Interfaces:**
- Consumes: `onGmVolumeChange: (vol: number) => void` z Zadania 1.
- Produces: brak nowego API — kończy przepływ propa.

- [ ] **Step 1: Przekaż prop w `GameSession.jsx`**

Linia 65 — dodaj `onGmVolumeChange` do destrukturyzacji:

```js
  const { audioRef, musicState, playerVolume, onPlayerVolumeChange, onGmVolumeChange, handleMusicMessage, handleSceneAssignAll, syncFromGame } = useGameMusic(gameId);
```

W propsach `RightPanel` (ok. linii 1094), bezpośrednio pod `onPlayerVolumeChange={onPlayerVolumeChange}`, dodaj:

```jsx
          onGmVolumeChange={onGmVolumeChange}
```

- [ ] **Step 2: Przepuść prop przez `RightPanel.jsx`**

W liście propsów komponentu (ok. linii 44), pod `onPlayerVolumeChange,`, dodaj:

```js
  onGmVolumeChange,
```

W renderze `MusicTab` (ok. linii 277) dodaj prop:

```jsx
                <MusicTab
                  gameId={gameId}
                  token={token}
                  musicState={musicState}
                  audioRef={audioRef}
                  onGmVolumeChange={onGmVolumeChange}
                />
```

- [ ] **Step 3: Przyjmij prop w `MusicTab.jsx`**

Linia 36:

```js
const MusicTab = ({ gameId, token, musicState, audioRef, onGmVolumeChange }) => {
```

- [ ] **Step 4: Przełącz handler na prop**

Zamień `MusicTab.jsx:394-401` z:

```js
  const handleVolumeChange = async (e) => {
    const vol = parseFloat(e.target.value);
    try {
      await setVolume(gameId, vol);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  };
```

na:

```js
  const handleVolumeChange = (e) => {
    onGmVolumeChange(parseFloat(e.target.value));
  };
```

- [ ] **Step 5: Usuń nieużywany import `setVolume`**

W `MusicTab.jsx:14` usuń `setVolume, ` z listy importów z `'../../api/music'`. Pozostałe importy zostają bez zmian.

Weryfikacja: `cd warhammer-battle-helper-front && grep -n "setVolume" src/components/tabs/MusicTab.jsx`

Expected: brak wyników.

- [ ] **Step 6: Zmień krok suwaka MG**

W `MusicTab.jsx` (ok. linii 659), w `<input type="range">` sekcji `music-tab__volume-control`:

```jsx
            step="0.01"
```

- [ ] **Step 7: Sprawdź lintem, że nic nie zostało niepodpięte**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/tabs/MusicTab.jsx src/components/panels/RightPanel.jsx src/components/GameSession.jsx`

Expected: brak błędów (`no-unused-vars` złapałoby osierocony import `setVolume`).

- [ ] **Step 8: Weryfikacja ręczna**

Uruchom aplikację, wejdź jako MG do gry, zakładka Muzyka. W DevTools otwórz zakładkę Sieć i przefiltruj po `volume`.

Expected:
- gałka i procent obok niej ruszają się co 1% i płynnie, bez cofania,
- odtwarzana muzyka zmienia głośność u MG w trakcie ciągnięcia,
- po jednym przeciągnięciu przez cały zakres leci **jeden** `POST .../music/volume` z wartością końcową,
- po odświeżeniu strony suwak pokazuje tę wartość.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/GameSession.jsx warhammer-battle-helper-front/src/components/panels/RightPanel.jsx warhammer-battle-helper-front/src/components/tabs/MusicTab.jsx
git commit -m "feat(front): FEATURE-90 move the GM volume slider to 1% steps

MusicTab now delegates the change to useGameMusic instead of posting on every
onChange, so the knob reads the optimistic value and the request is debounced.
The direct setVolume import is gone with its last caller.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Krok 1% dla suwaka gracza w `GeneralTab`

Osobne zadanie, bo dotyka niezależnego suwaka: `playerVolume` żyje wyłącznie w `useState` + `localStorage` (`useGameMusic.js:24-37`) i nigdy nie dotyka sieci. Zero ryzyka po stronie backendu.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx:354`

**Interfaces:**
- Consumes: istniejący prop `onPlayerVolumeChange(vol: number)`.
- Produces: brak.

- [ ] **Step 1: Zmień krok**

W `GeneralTab.jsx` (ok. linii 354), w `<input type="range">` sekcji `general-tab__volume-control`:

```jsx
              step="0.01"
```

- [ ] **Step 2: Weryfikacja ręczna**

Wejdź do gry jako gracz, zakładka Ogólne, sekcja głośności.

Expected:
- procent obok suwaka zmienia się co 1%,
- głośność odtwarzanej muzyki reaguje natychmiast,
- po odświeżeniu strony wartość jest zachowana (`localStorage`),
- w DevTools w zakładce Sieć **nie ma żadnego requestu** przy ruszaniu tym suwakiem.

- [ ] **Step 3: Uruchom pełny suite testów**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`

Expected: wszystko przechodzi poza znanym `src/App.test.js` (błąd ESM axiosa — stan bazowy, nie regresja).

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx
git commit -m "feat(front): FEATURE-90 move the player volume slider to 1% steps

playerVolume is local state backed by localStorage and never hits the network,
so the finer step costs nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
