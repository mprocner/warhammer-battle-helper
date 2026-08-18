# FEATURE-170 — usunięcie endpointu join i wyjście do lobby po utracie dostępu

Data: 2026-08-18

## Problem

FEATURE-59 zamknęło dostęp do gry guardem uczestnictwa, ale zostawiło jedną furtkę: `POST /games/:id/join`
stoi z definicji poza guardem (`main.go:217-220`), a `JoinGame` (`GameService.go:399`) nie sprawdza ani
zaproszenia, ani listy wyrzuconych. Wyrzucony gracz, który zna id gry, woła join, znów staje się
uczestnikiem i przechodzi `CanAccessGame` wszędzie.

Analiza pokazała jednak, że ten endpoint nie ma dziś **żadnego** legalnego zastosowania:

1. Lobby listuje wyłącznie gry, w których user jest GM-em albo uczestnikiem (`GameRepository.go:147`).
2. `joinGame` (`useGames.js:56`) jest wołane tylko z `GameLobby.jsx:51`, czyli zawsze dla gry z tej listy.
3. Dla gracza `JoinGame` trafia w pętlę po `Participants`, znajduje go i zwraca błąd `user already in game`
   → handler odpowiada `400`. Front ten błąd celowo połyka (`useGames.js:66`).
4. Dla GM-a `JoinGame` zwraca grę bez żadnego efektu ubocznego (`GameService.go:406`), a front i tak
   wyrzuca ciało odpowiedzi — `joinGame` oddaje tylko `true`/`false`.
5. Samo „wejście do gry" to wyłącznie zmiana stanu klienta: `setCurrentGameId` (`App.js:97`). Prawdziwe
   ładowanie robi `GameSession` przez `GET /games/:id` i połączenie WS.
6. `InvitePlayer` dodaje uczestnika natychmiast i w pełni, więc join nigdy nie jest potrzebny do wejścia.

Gałąź „dodaj uczestnika" nie odpala się więc dla nikogo poza wyrzuconym graczem. Martwy kod, który jest
zarazem dziurą.

Sprawdzone osobno: sortowanie lobby po „ostatnio otwarte" (`GameService.go:331`) nie wisi na joinie —
sesja startuje przy rejestracji klienta WS (`hub.go:102`).

## Decyzja

Endpoint znika w całości. Jedyną drogą wejścia do gry zostaje `InvitePlayer`. Cofnięcie kicka to ponowne
zaproszenie — bez listy `kickedUsers`, bez nowego pola w modelu, bez decyzji produktowej „czy GM może
cofnąć kick".

Pełny model zaproszeń z akceptacją przez zapraszanego jest świadomie odłożony na osobne zadanie. Nic w tym
feature go nie blokuje: usunięcie joina zdejmuje z drogi endpoint, który i tak trzeba by przepisać.

## Warstwa 1 — usunięcie endpointu

Kasowane bez zamiennika:

| Plik | Co znika |
|---|---|
| `internal/service/GameService.go:398-451` | `JoinGame` |
| `internal/http/GameHandler.go:226-249` | handler `JoinGame` |
| `cmd/warhammer-battle-helper/main.go:217-220` | grupa `gameJoin` i trasa `POST /join` |
| `internal/models/Game.go:261-263` | `JoinGameRequest` — typ bez wołających |
| `internal/models/Game.go:238` | `EventTypeJoin` |
| `src/hooks/useGames.js:56-75`, `:123` | `joinGame` i jego eksport |
| `src/components/GameLobby.jsx:50-52` | `handleJoinGame` upraszcza się do `onJoinGame` |
| `src/components/GameSession.jsx:127-129` | `case 'join'` w mapowaniu historii zdarzeń |

Efekt uboczny, który jest właściwym celem: `/games/:id` traci **ostatni** wyjątek od
`GameParticipantMiddleware`. Wyrzucony gracz z id gry dostaje `403` na każdym endpointcie, łącznie z WS.

### Historyczne zdarzenia `join`

Stare dokumenty w bazie mogą nieść zdarzenia typu `join`. Po usunięciu `case 'join'` wpadają one w
`default: return null` (`GameSession.jsx:149`), czyli po prostu nie pojawiają się w logu — bez błędu i bez
pustej linii. Zgodnie z zasadą projektu „brak backward compat" nie piszemy migracji.

## Warstwa 2 — wyjście do lobby po utracie dostępu

Backend bez zmian. Guard zwraca już dziś `403` (`GameAccessMiddleware.go:40`) oraz `404` dla gry, której
nie ma (`:32`). Cała zmiana jest po stronie frontu i sprowadza się do jednego punktu decyzji.

### Czysty helper

```js
// src/utils/sessionAccess.js
export const sessionEndReasonForStatus = (status) => {
  if (status === 403) return 'accessRevoked';
  if (status === 404) return 'gameNotFound';
  return null;
};
```

### Punkt decyzji

`fetchGameState` (`GameSession.jsx:99`), przed istniejącym `if (!response.ok) throw`:

```js
const reason = sessionEndReasonForStatus(response.status);
if (reason) { onSessionEnded(reason); return; }
```

Pozostałe statusy błędne lecą w niezmienioną istniejącą ścieżkę wyjątku.

### Dwa wyzwalacze tego samego punktu

1. **Wejście z nieświeżego lobby.** Wyrzucony gracz ma otwartą zakładkę, klika stary kafelek. `App.js`
   renderuje `GameSession`, `fetchGameState` leci na mount i od razu trafia w `403`.

2. **Wyrzucenie w trakcie żywej sesji.** `hub.DisconnectUser` zamyka socket, `useWebSocket` wchodzi w
   reconnect z backoffem (`useWebSocket.js:73-88`). Każda próba trafia na `403` przed `Upgrade`, ale
   przeglądarka nie ujawnia statusu nieudanego handshake'u — po pięciu próbach zostaje tylko
   `Failed to connect after multiple attempts`, a sesja wisi otwarta i cicha.

   `useWebSocket` dostaje opcjonalny callback `onReconnectFailed`, trzymany w refie tym samym wzorcem co
   `onMessage` (`:25-26`), wołany w gałęzi wyczerpanych prób (`:88`). `GameSession` podaje mu
   `fetchGameState`. Serwer żywy i brak dostępu → `403` → wyjście. Serwer po restarcie → zwykły refetch,
   czyli i tak pożądane odświeżenie.

   Sondujemy dopiero po wyczerpaniu backoffu, nie po pierwszym `onclose`, żeby każdy restart backendu nie
   generował dodatkowego `GET /games/:id` na klienta.

### Kanał komunikatu

Nowy prop `onSessionEnded(reason)` obok istniejącego `onGoToGameList` — **nie** dodatkowy argument do
`onGoToGameList`. Ten ostatni jest w dwóch miejscach podpięty wprost jako handler kliknięcia
(`GameSession.jsx:968`, `GeneralTab.jsx:404`), więc dopisanie mu parametru sprawiłoby, że kliknięcie
przycisku wysyła `SyntheticEvent` jako powód zakończenia sesji.

Nazwa opisuje zdarzenie, nie jeden jego powód, bo obsługuje zarówno odebrany dostęp, jak i skasowaną grę.

W `App.js`:

```js
const [lobbyNotice, setLobbyNotice] = useState(null);
const handleSessionEnded = (reason) => { setCurrentGameId(null); setLobbyNotice(reason); };
```

`GameLobby` przyjmuje `notice` i renderuje `<Alert severity="warning">` nad istniejącym alertem błędu
(`GameLobby.jsx:94`), z treścią `t("game." + notice)` i zamykaniem przez `onClose`. Dwa nowe klucze w
`locales/en` i `locales/pl`: `game.accessRevoked`, `game.gameNotFound`.

Lobby odmontowuje się przy wejściu w sesję, więc powrót odpala `fetchGames` z mountu i kafelek nieaktualnej
gry znika sam — bez dodatkowego kodu.

## Testy

| Co | Gdzie | Przypadki |
|---|---|---|
| `sessionEndReasonForStatus` | nowy `src/utils/sessionAccess.test.js` | 403 → `accessRevoked`; 404 → `gameNotFound`; 200 → `null`; 500 → `null` |

Backend nie dostaje nowych testów, bo nie dostaje nowej logiki — to czyste usunięcie. Weryfikacja:
`go build ./...` i `go test ./...` przechodzą po wycięciu `JoinGame`, `JoinGameRequest` i `EventTypeJoin`.

### Weryfikacja ręczna

Lokalny stack dockerowy, dwa konta:

1. GM wyrzuca gracza z otwartą sesją → zakładka gracza po wyczerpaniu reconnectu ląduje w lobby z
   ostrzeżeniem, a kafelka tej gry nie ma.
2. Gracz z otwartym lobby zostaje wyrzucony, klika stary kafelek → wraca natychmiast z tym samym
   ostrzeżeniem.
3. `curl -X POST` na `/games/:id/join` z ważnym JWT → `404` z Gina, trasa nie istnieje.
4. GM zaprasza wyrzuconego ponownie → wchodzi normalnie, co potwierdza cofanie kicka bez listy
   `kickedUsers`.

## Poza zakresem

**Pełny model zaproszeń z akceptacją.** `InvitePlayer` dalej dodaje uczestnika natychmiast, bez pytania
zapraszanego o zgodę. Osobne zadanie.

**Powiadomienie o kicku w czasie rzeczywistym.** Wyrzucony gracz dowiaduje się dopiero po wyczerpaniu
backoffu reconnectu, czyli po kilkunastu sekundach. Natychmiastowy komunikat wymagałby dedykowanego
zdarzenia WS wysyłanego tuż przed `DisconnectUser` — świadomie pominięte, bo ta ścieżka domyka scenariusz
bez nowego protokołu.

**Stare `visibleTo` w bazie.** Bez zmian względem FEATURE-59: gry sprzed tamtej zmiany dalej niosą id
graczy, którzy odeszli. Guard ich nie wpuszcza, ale ponowne zaproszenie ożywia stare wpisy.

**Pliki handoutów i muzyki bez guardu.** Stwierdzenie, że wyrzucony gracz dostaje `403` wszędzie, jest
prawdziwe dla `GET /games/:id` i tras pod guardem uczestnictwa — nie dla `GET /handouts/:filename` ani
`GET /music-files/:filename`. Obie te trasy są zarejestrowane w `main.go` bezpośrednio na gołym routerze,
w sekcji „Static file serving (no auth)", bez `JWTAuthMiddleware` i bez guardu — kto zna URL pliku, dalej
go pobierze, nawet po wyrzuceniu z gry. Stan sprzed FEATURE-170, świadomie pozostawiony bez zmian; zamknięcie
tej furtki wymagałoby osobnego mechanizmu autoryzacji dla plików statycznych.
