# FEATURE-170 — usunięcie endpointu join i wyjście do lobby po utracie dostępu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usunąć `POST /games/:id/join` — jedyny endpoint stojący poza guardem uczestnictwa — i wyprowadzać gracza z martwej sesji do lobby z komunikatem, gdy backend odpowie `403` albo `404`.

**Architecture:** Backend to czyste usunięcie: znika serwis, handler, trasa, typ requestu i stała zdarzenia. Front traci wołanie joina, a zyskuje jeden punkt decyzji w `fetchGameState`, karmiony przez czysty helper `sessionEndReasonForStatus`. Ten sam punkt obsługuje dwa wyzwalacze: wejście z nieświeżego lobby oraz wyczerpany reconnect WebSocketu po `hub.DisconnectUser`.

**Tech Stack:** Go + Gin (backend), React + MUI + i18next (front), Jest przez `react-scripts test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-FEATURE-170-remove-join-endpoint-design.md`
- Gałąź robocza: `FEATURE-170` (już istnieje, spec zacommitowany).
- Wszystkie stringi w JSX przez `t('klucz')`; klucze angielskie, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`.
- Brak backward compat — stare dokumenty w bazie nie są migrowane.
- Martwy kod, CSS, klucze i18n i propsy kasujemy w tej samej zmianie, nie zostawiamy oflagowane.
- Commity: prefiks typu + `FEATURE-170` w tytule, wzorem historii gałęzi `FEATURE-59` (np. `fix(front): FEATURE-59 refetch characters when a participant leaves`).
- Kolejność zadań 1 → 2 jest istotna: front przestaje wołać joina, zanim backend go usunie. Odwrotna kolejność zostawia commit, w którym wejście do gry jest zepsute.

## Struktura plików

**Tworzone**
- `warhammer-battle-helper-front/src/utils/sessionAccess.js` — jedyna odpowiedzialność: mapowanie statusu HTTP na powód zakończenia sesji.
- `warhammer-battle-helper-front/src/utils/sessionAccess.test.js` — testy powyższego.

**Modyfikowane**
- `warhammer-battle-helper-front/src/hooks/useGames.js` — traci `joinGame`.
- `warhammer-battle-helper-front/src/components/GameLobby.jsx` — traci `handleJoinGame`, zyskuje render `notice`.
- `warhammer-battle-helper-front/src/components/GameSession.jsx` — traci `case 'join'`, zyskuje `onSessionEnded` i wpięcie `onReconnectFailed`.
- `warhammer-battle-helper-front/src/hooks/useWebSocket.js` — zyskuje opcjonalny callback `onReconnectFailed`.
- `warhammer-battle-helper-front/src/App.js` — stan `lobbyNotice` i handler `handleSessionEnded`.
- `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` — dwa nowe klucze, jeden usunięty.
- `warhammer-battle-helper-backend/internal/service/GameService.go`, `internal/http/GameHandler.go`, `internal/models/Game.go`, `cmd/warhammer-battle-helper/main.go` — usunięcie joina.

---

### Task 1: Front przestaje wołać join

Czyste usunięcie martwego wołania. Nie ma tu testu do napisania — `joinGame` nie miał testu, a zachowanie użytkownika się nie zmienia: dziś request kończy się błędem `400`, który front i tak połyka.

**Files:**
- Modify: `warhammer-battle-helper-front/src/hooks/useGames.js:55-75`, `:123`
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx:23-24`, `:50-52`, `:112`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:127-129`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:176`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json:176`

**Interfaces:**
- Consumes: nic.
- Produces: `useGames(token)` przestaje zwracać `joinGame`. `GameLobby` podaje `onJoinGame` wprost do `GameCard`.

- [ ] **Step 1: Usuń `joinGame` z `useGames.js`**

Skasuj cały blok wraz z komentarzem nad nim (linie 55-75):

```js
  // Returns true when the caller is in the game and may enter it.
  const joinGame = useCallback(async (gameId) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/join`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!response.ok) {
        const errorData = await response.json();
        // Re-entering a game you never left is success, not an error.
        if (errorData.error === 'user already in game') return true;
        throw new Error(errorData.error || 'Failed to join game');
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);
```

Następnie zdejmij go z obiektu zwracanego (linia 123) — po zmianie:

```js
  return {
    games, error, loading, syncingGameId,
    setError, fetchGames, createGame, deleteGame, leaveGame, syncTemplate,
  };
```

- [ ] **Step 2: Usuń `handleJoinGame` z `GameLobby.jsx`**

Skasuj destrukturyzację `joinGame` (linia 24) — po zmianie:

```js
  const {
    games, error, loading, syncingGameId,
    setError, fetchGames, createGame, deleteGame, leaveGame, syncTemplate,
  } = useGames(token);
```

Skasuj cały handler (linie 50-52):

```js
  const handleJoinGame = useCallback(async (gameId) => {
    if (await joinGame(gameId)) onJoinGame(gameId);
  }, [joinGame, onJoinGame]);
```

Podepnij `onJoinGame` wprost (linia 112) — po zmianie:

```jsx
                onJoin={onJoinGame}
```

- [ ] **Step 3: Usuń `case 'join'` z mapowania historii w `GameSession.jsx`**

Skasuj linie 127-129:

```js
            case 'join':
              message = `${event.username} joined the game`;
              return { createdAt, message, type: 'success', timestamp };
```

Historyczne zdarzenia `join` ze starych gier wpadną teraz w `default: return null` i po prostu nie pojawią się w logu.

- [ ] **Step 4: Usuń nieużywany klucz i18n `game.joinGame`**

W obu plikach skasuj linię 176. W `src/locales/en/translation.json`:

```json
    "joinGame": "Join Game",
```

W `src/locales/pl/translation.json`:

```json
    "joinGame": "Dołącz do Gry",
```

Klucz nie ma żadnego wołającego — przycisk wejścia używa `game.enterGame` (`components/lobby/GameCard.jsx:169`).

- [ ] **Step 5: Sprawdź, że nic nie odwołuje się do usuniętych nazw**

Run: `cd warhammer-battle-helper-front && grep -rn "joinGame\|handleJoinGame\|game.joinGame" src/`

Expected: jedyne trafienia to `onJoinGame` (prop przekazywany z `App.js`) — żadnego `joinGame` jako samodzielnej nazwy ani `handleJoinGame`.

- [ ] **Step 6: Uruchom testy frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`

Expected: PASS, zero failed suites.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useGames.js \
        warhammer-battle-helper-front/src/components/GameLobby.jsx \
        warhammer-battle-helper-front/src/components/GameSession.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "refactor(front): FEATURE-170 stop calling the join endpoint"
```

---

### Task 2: Backend traci endpoint join

Po Tasku 1 nikt już tej trasy nie woła, więc usunięcie jest bezpieczne. Efekt docelowy: `/games/:id` nie ma **żadnego** wyjątku od `GameParticipantMiddleware`.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:398-451`
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go:226-249`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:217-222`
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go:238`, `:261-263`

**Interfaces:**
- Consumes: `GameParticipantMiddleware(gameRepo)` z FEATURE-59 (`internal/http/GameAccessMiddleware.go:17`) — po tej zmianie obejmuje całą grupę `/games/:id`.
- Produces: `POST /games/:id/join` przestaje istnieć; Gin odpowiada `404`.

- [ ] **Step 1: Usuń `GameService.JoinGame`**

W `internal/service/GameService.go` skasuj komentarz i całą funkcję (linie 398-451), od:

```go
// JoinGame adds a user to a game
func (s *GameService) JoinGame(gameID string, userID primitive.ObjectID, username string) (*models.Game, error) {
```

aż do zamykającej klamry przed `// DeleteGame deletes a game entirely (GM only).`

- [ ] **Step 2: Usuń handler `JoinGame`**

W `internal/http/GameHandler.go` skasuj linie 226-249, od:

```go
// JoinGame adds current user to a game
func (h *GameHandler) JoinGame(c *gin.Context) {
```

aż do zamykającej klamry przed `// DeleteGame deletes a game (GM only)`.

- [ ] **Step 3: Usuń trasę i osobną grupę w `main.go`**

Skasuj linie 217-220 wraz z komentarzem:

```go
	// POST /join is called by someone who is not a participant yet, so it lives in its own
	// group without the participation guard.
	gameJoin := r.Group("/games/:id", http.JWTAuthMiddleware())
	gameJoin.POST("/join", gameHandler.JoinGame)

```

Zostaje wyłącznie grupa strzeżona:

```go
	game := r.Group("/games/:id", http.JWTAuthMiddleware(), http.GameParticipantMiddleware(gameRepo))
```

- [ ] **Step 4: Usuń `EventTypeJoin` i `JoinGameRequest` z modelu**

W `internal/models/Game.go` skasuj linię 238:

```go
	EventTypeJoin            EventType = "join"
```

oraz linie 261-263:

```go
// JoinGameRequest is the request body for joining a game
type JoinGameRequest struct {
	GameID string `json:"gameId" binding:"required"`
}
```

- [ ] **Step 5: Zbuduj backend**

Run: `cd warhammer-battle-helper-backend && go build ./...`

Expected: brak wyjścia (sukces). Jeśli kompilator zgłosi nieużywany import w `GameService.go` lub `GameHandler.go`, usuń go — `JoinGame` był ostatnim użyciem tylko wtedy, gdy kompilator to potwierdzi.

- [ ] **Step 6: Uruchom testy backendu**

Run: `cd warhammer-battle-helper-backend && go test ./...`

Expected: `ok` albo `no test files` dla każdego pakietu, zero `FAIL`.

- [ ] **Step 7: Potwierdź, że nie została żadna wzmianka**

Run: `cd warhammer-battle-helper-backend && grep -rn "JoinGame\|EventTypeJoin" --include="*.go" .`

Expected: zero trafień.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go \
        warhammer-battle-helper-backend/internal/http/GameHandler.go \
        warhammer-battle-helper-backend/internal/models/Game.go \
        warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat(http): FEATURE-170 remove the unguarded join endpoint"
```

---

### Task 3: Helper `sessionEndReasonForStatus`

TDD: test przed implementacją. Helper jest czysty, więc testuje się bez renderu — konwencja `src/utils/*.test.js`.

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/sessionAccess.js`
- Test: `warhammer-battle-helper-front/src/utils/sessionAccess.test.js`

**Interfaces:**
- Consumes: nic.
- Produces: `sessionEndReasonForStatus(status: number) => 'accessRevoked' | 'gameNotFound' | null` — nazwany eksport z `src/utils/sessionAccess.js`. Zwracany string jest zarazem sufiksem klucza i18n (`game.accessRevoked`, `game.gameNotFound`), z czego korzystają Taski 4 i 5.

- [ ] **Step 1: Napisz test, który nie przechodzi**

Utwórz `warhammer-battle-helper-front/src/utils/sessionAccess.test.js`:

```js
import { sessionEndReasonForStatus } from './sessionAccess';

describe('sessionEndReasonForStatus', () => {
  it('reads 403 as revoked access', () => {
    expect(sessionEndReasonForStatus(403)).toBe('accessRevoked');
  });

  it('reads 404 as a game that no longer exists', () => {
    expect(sessionEndReasonForStatus(404)).toBe('gameNotFound');
  });

  it('returns null for a successful response', () => {
    expect(sessionEndReasonForStatus(200)).toBeNull();
  });

  it('returns null for other failures so they keep the existing error path', () => {
    expect(sessionEndReasonForStatus(500)).toBeNull();
    expect(sessionEndReasonForStatus(401)).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=sessionAccess`

Expected: FAIL — `Cannot find module './sessionAccess' from 'src/utils/sessionAccess.test.js'`.

- [ ] **Step 3: Napisz minimalną implementację**

Utwórz `warhammer-battle-helper-front/src/utils/sessionAccess.js`:

```js
// Maps a failed game fetch onto the reason the session ended, or null when the status is
// not about access at all. The returned string doubles as the i18n key suffix under
// `game.` — the lobby renders it as the notice explaining why the user is back there.
export const sessionEndReasonForStatus = (status) => {
  if (status === 403) return 'accessRevoked';
  if (status === 404) return 'gameNotFound';
  return null;
};
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=sessionAccess`

Expected: PASS, `Tests: 4 passed`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/sessionAccess.js \
        warhammer-battle-helper-front/src/utils/sessionAccess.test.js
git commit -m "feat(front): FEATURE-170 add a helper mapping HTTP status to session end reason"
```

---

### Task 4: Wyjście do lobby z komunikatem

Wpina helper w `fetchGameState` i doprowadza powód do lobby. Po tym tasku działa wyzwalacz „wejście z nieświeżego lobby"; żywa sesja dochodzi w Tasku 5.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:34`, `:97-105`
- Modify: `warhammer-battle-helper-front/src/App.js:1`, `:31`, `:97-103`, `:174-186`
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx:19`, `:94`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `sessionEndReasonForStatus` z Taska 3.
- Produces: prop `onSessionEnded(reason)` na `GameSession`; propsy `notice` i `onDismissNotice` na `GameLobby`.

- [ ] **Step 1: Dodaj klucze i18n**

W `src/locales/en/translation.json`, w sekcji `"game"`, tuż po `"noActiveGames"` (linia 186):

```json
    "accessRevoked": "You no longer have access to this game.",
    "gameNotFound": "This game no longer exists.",
```

W `src/locales/pl/translation.json`, w tym samym miejscu:

```json
    "accessRevoked": "Nie masz już dostępu do tej gry.",
    "gameNotFound": "Ta gra już nie istnieje.",
```

- [ ] **Step 2: Wepnij punkt decyzji w `GameSession.jsx`**

Dodaj import obok pozostałych importów z `../utils` (linie 26-27):

```js
import { sessionEndReasonForStatus } from '../utils/sessionAccess';
```

Rozszerz sygnaturę komponentu (linia 34):

```js
const GameSession = ({ gameId, token, onGoToGameList, onSessionEnded, onLogout }) => {
```

W `fetchGameState` (linia 105) wstaw sprawdzenie **przed** istniejącym rzutem wyjątku:

```js
      const reason = sessionEndReasonForStatus(response.status);
      if (reason) { onSessionEnded(reason); return; }

      if (!response.ok) throw new Error('Failed to fetch game state');
```

Dopisz `onSessionEnded` do tablicy zależności `fetchGameState` (linia 164):

```js
  }, [gameId, token, historyLoaded, syncFromGame, onSessionEnded]);
```

- [ ] **Step 3: Dodaj stan i handler w `App.js`**

Obok istniejących stanów (po linii 31):

```js
    const [lobbyNotice, setLobbyNotice] = useState(null);
```

Obok `handleGoToGameList` (po linii 103) — osobny handler, nie dodatkowy argument do `handleGoToGameList`,
bo tamten jest w dwóch miejscach podpięty wprost jako `onClick` i dostałby `SyntheticEvent` zamiast powodu.

Handler musi być owinięty w `useCallback`, inaczej dostaje nową referencję przy każdym renderze `App`,
przez co `fetchGameState` (który ma go w zależnościach) też — a `useEffect` na linii `GameSession.jsx:851`
przeładowywałby cały stan gry przy każdym renderze `App`. Obie settery są stabilne, więc tablica jest pusta:

```js
    // Reason is the i18n key suffix under `game.` produced by sessionEndReasonForStatus.
    // useCallback keeps the reference stable: GameSession puts it in fetchGameState's deps,
    // and an unstable one would refetch the whole game state on every App render.
    const handleSessionEnded = useCallback((reason) => {
        setCurrentGameId(null);
        setLobbyNotice(reason);
    }, []);
```

Dopisz `useCallback` do importu Reacta (linia 1):

```js
import React, {useState, useEffect, useCallback} from 'react';
```

W `handleJoinGame` (linia 96) wyczyść komunikat, żeby nie wisiał po wejściu do innej gry:

```js
    const handleJoinGame = (gameId) => {
        setLobbyNotice(null);
        setCurrentGameId(gameId);
        addLogMessage(`Joining game ${gameId}`, 'info');
    };
```

- [ ] **Step 4: Przekaż propsy w renderze `App.js`**

`GameSession` (linia 174) dostaje nowy prop:

```jsx
                                        <GameSession
                                            gameId={currentGameId}
                                            token={user.token}
                                            onGoToGameList={handleGoToGameList}
                                            onSessionEnded={handleSessionEnded}
                                            onLogout={handleLogout}
                                        />
```

`GameLobby` (linia 181) dostaje komunikat i sposób jego zamknięcia:

```jsx
                                        <GameLobby
                                            onJoinGame={handleJoinGame}
                                            token={user.token}
                                            userEmail={user.email}
                                            allowedSystems={allowedSystems}
                                            notice={lobbyNotice}
                                            onDismissNotice={() => setLobbyNotice(null)}
                                        />
```

- [ ] **Step 5: Wyrenderuj komunikat w `GameLobby.jsx`**

Rozszerz sygnaturę (linia 19):

```js
const GameLobby = ({ onJoinGame, token, userEmail, allowedSystems, notice, onDismissNotice }) => {
```

Nad istniejącym alertem błędu (linia 94) dodaj:

```jsx
          {notice && <Alert severity="warning" sx={{ mb: 3 }} onClose={onDismissNotice}>{t(`game.${notice}`)}</Alert>}
```

`Alert` jest już zaimportowany (linia 3), `t` już dostępne (linia 20) — nic nie dochodzi do importów.

- [ ] **Step 6: Uruchom testy frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`

Expected: PASS, zero failed suites.

- [ ] **Step 7: Sprawdź, że oba pliki tłumaczeń są zgodne**

Run: `cd warhammer-battle-helper-front && node -e "const en=require('./src/locales/en/translation.json'),pl=require('./src/locales/pl/translation.json');const miss=Object.keys(en.game).filter(k=>!(k in pl.game));console.log('missing in pl:',miss)"`

Expected: `missing in pl: []`

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/GameSession.jsx \
        warhammer-battle-helper-front/src/components/GameLobby.jsx \
        warhammer-battle-helper-front/src/App.js \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(front): FEATURE-170 send a player back to the lobby when access is gone"
```

---

### Task 5: Wykrycie utraty dostępu w żywej sesji

Bez tego wyrzucony gracz z otwartą sesją wisi cicho: `hub.DisconnectUser` zamyka socket, reconnect pięć razy trafia na `403` przed `Upgrade`, a przeglądarka nie ujawnia statusu nieudanego handshake'u.

Sonda leci dopiero po wyczerpaniu backoffu, nie po pierwszym `onclose` — inaczej każdy restart backendu generowałby dodatkowy `GET /games/:id` na klienta.

**Files:**
- Modify: `warhammer-battle-helper-front/src/hooks/useWebSocket.js:16`, `:25-26`, `:86-90`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:845-849`

**Interfaces:**
- Consumes: `fetchGameState` z Taska 4, które po zmianie samo obsługuje `403`/`404`.
- Produces: `useWebSocket(gameId, token, onMessage, onReconnectFailed?)` — czwarty parametr opcjonalny, wołany bezargumentowo po wyczerpaniu prób reconnectu.

- [ ] **Step 1: Dodaj callback do `useWebSocket`**

Rozszerz sygnaturę i dokumentację hooka (linie 10-16):

```js
/**
 * Custom hook for WebSocket connection to game room
 * @param {string} gameId - The game ID to connect to
 * @param {string} token - JWT authentication token
 * @param {function} onMessage - Callback for handling incoming messages
 * @param {function} [onReconnectFailed] - Called once the reconnect attempts run out. A failed
 *   handshake hides its HTTP status from the browser, so the caller probes over HTTP instead.
 */
const useWebSocket = (gameId, token, onMessage, onReconnectFailed) => {
```

Dodaj ref obok istniejącego `onMessageRef` (po linii 26):

```js
  const onReconnectFailedRef = useRef(onReconnectFailed);
  useEffect(() => { onReconnectFailedRef.current = onReconnectFailed; }, [onReconnectFailed]);
```

W gałęzi wyczerpanych prób (linia 88):

```js
          } else {
            setError('Failed to connect after multiple attempts');
            onReconnectFailedRef.current?.();
          }
```

- [ ] **Step 2: Podepnij `fetchGameState` w `GameSession.jsx`**

Wywołanie hooka (linia 845) dostaje czwarty argument:

```js
  const { isConnected, error: wsError, sendMessage } = useWebSocket(
    gameId,
    token,
    handleWebSocketMessage,
    fetchGameState
  );
```

Serwer żywy i brak dostępu → `fetchGameState` dostaje `403` → `onSessionEnded('accessRevoked')` → gracz ląduje w lobby. Serwer po restarcie → zwykły refetch, czyli i tak pożądane odświeżenie stanu.

- [ ] **Step 3: Uruchom testy frontu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`

Expected: PASS, zero failed suites.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useWebSocket.js \
        warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "fix(front): FEATURE-170 probe game access when the websocket cannot reconnect"
```

---

### Task 6: Weryfikacja ręczna na lokalnym stacku

Testy jednostkowe pokrywają tylko helper — reszta to usunięcia i wpięcia, których nie da się sprawdzić bez Mongo i dwóch przeglądarek. Ten task nic nie commituje poza ewentualnymi poprawkami znalezionych usterek.

**Files:** brak zmian, o ile weryfikacja przejdzie.

**Interfaces:**
- Consumes: wszystko z Tasków 1-5.
- Produces: potwierdzenie, że cofnięcie kicka działa przez ponowne zaproszenie, bez listy `kickedUsers`.

- [ ] **Step 1: Podnieś stack**

Run: `cd /Users/mateuszprocner/priv/warhammer-battle-helper && docker compose up -d --build`

Expected: kontenery backendu, frontu i Mongo w stanie `running` (`docker compose ps`).

- [ ] **Step 2: Potwierdź, że trasy join nie ma**

Run (podstaw ważny JWT i istniejące id gry):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/games/$GAME_ID/join
```

Expected: `404`.

- [ ] **Step 3: Kick w trakcie żywej sesji**

Dwa konta w dwóch przeglądarkach (albo okno prywatne). Gracz siedzi w sesji, GM wyrzuca go z listy uczestników.

Expected: po wyczerpaniu backoffu reconnectu (do ~30 s) zakładka gracza sama wraca do lobby z żółtym alertem „Nie masz już dostępu do tej gry.", a kafelka tej gry nie ma na liście.

- [ ] **Step 4: Kick przy nieświeżym lobby**

Gracz siedzi w lobby (nie odświeża strony), GM go wyrzuca. Gracz klika stary kafelek gry.

Expected: natychmiastowy powrót do lobby z tym samym alertem, bez migotania pustego widoku sesji.

- [ ] **Step 5: Cofnięcie kicka**

GM zaprasza wyrzuconego gracza ponownie przez `POST /games/:id/invite`, gracz odświeża lobby i wchodzi.

Expected: wejście działa normalnie — potwierdza, że kick da się cofnąć bez listy `kickedUsers`.

- [ ] **Step 6: Gra skasowana przy nieświeżym lobby**

Gracz siedzi w lobby, GM kasuje grę. Gracz klika stary kafelek.

Expected: powrót do lobby z alertem „Ta gra już nie istnieje."

- [ ] **Step 7: Ścieżka szczęśliwa bez regresji**

Zwykły gracz wchodzi do swojej gry i wraca do lobby przyciskiem powrotu.

Expected: wejście działa (o jeden request mniej niż przed zmianą), powrót nie pokazuje żadnego alertu.

---

## Zakres świadomie pominięty

- `WS_EVENTS.GAME_DELETED` (`GameSession.jsx:190`) dalej woła `onGoToGameList()` bez komunikatu. To żywy push po WebSockecie, który już działa; podpięcie pod niego `onSessionEnded('gameNotFound')` byłoby ulepszeniem w cudzej ścieżce.
- Natychmiastowe powiadomienie o kicku (dedykowane zdarzenie WS przed `DisconnectUser`).
- Migracja starych `visibleTo` w bazie.
- Pełny model zaproszeń z akceptacją przez zapraszanego.
