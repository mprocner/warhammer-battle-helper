# Gry i uczestnicy

## Jak to działa

Pod `/` jest strona startowa (`LandingPage`). **Lobby** (`/games`) pokazuje gry użytkownika,
przycisk kreatora w nagłówku i, przy pustej liście, skróty „Utwórz grę” / „Zaprojektuj system”. Tworzenie gry
(`CreateGameDialog.jsx`) to nazwa i jedna lista wyboru z wyszukiwarką, w której są zarówno
systemy wbudowane (z `allowedSystems`, patrz [02-konta-i-dostep.md](02-konta-i-dostep.md)),
jak i szablony dostępne dla użytkownika. Filtr języka zawęża tę listę i jest zapamiętywany
w przeglądarce. Gdy wyszukiwanie nic nie znajduje tylko przez filtr, dialog mówi o tym wprost.

**Filtr i wyszukiwarka w lobby** (PLAYRPG-298/299). Nad siatką gier pasek `LobbyFilterBar.jsx`:
chipy „Wszystkie / Prowadzę / Gram” pojawiają się tylko u kogoś, kto ma gry w obu rolach (rola
= `gameMasterEmail === userEmail`), wyszukiwarka zawsze, gdy jest choć jedna gra. Próg (np. 8 gier)
odrzuciliśmy: pole pojawiające się znienacka było nieintuicyjne i znikało z wpisaną frazą. Szukanie obejmuje nazwę gry i etykietę systemu z karty
(`systemLabel`), przez `findMatch` z `systemOptions.js` (bez wielkości liter i polskich znaków).
Wszystko we froncie (`lobbyFilter.js`), backend bez zmian. Stan siedzi w URL (`?role=gm&q=…`,
`useLobbyFilter`, `replace: true`), bo wejście do gry odmontowuje lobby — URL przeżywa wejście
do gry, powrót (wpis historii lobby razem z query stringiem, patrz niżej) i F5. **Pułapka:** `role` przy ukrytych chipach jest
ignorowane (stare `?role=player` u kogoś, kto przestał grać, nie chowa gier). Fraza nie trafia
do GA, bo `gtag.js` obcina query string.

**Adres gry** (PLAYRPG-338). Lobby to `/games`, sesja gry to `/games/:gameId` — osobne route'y
w `App.js`, `GameSessionRoute` montuje `GameSession` z `key={gameId}` (przejście z gry A prosto
do B przemontowuje sesję: stan, socket, log). Wejście i wyjście tylko przez `useGameRoute`
(`src/hooks/useGameRoute.js`): `openGame` robi push z `state.fromLobby` (gdy wołane z `/games`),
`leaveGame` robi `navigate(-1)`, gdy gra przyszła z lobby — wraca wpis lobby z jego filtrem,
a Wstecz nie otwiera gry ponownie — albo `navigate('/games', { replace: true })`, gdy grę
otwarto z linku / zakładki i za nią nie ma lobby. Wszystkie wejścia (lista, nowa gra, invite)
idą przez `handleJoinGame`, wszystkie wyjścia (powrót do listy, `onSessionEnded`: kick, usunięta
gra, 403/404) przez `leaveGame`. `BrowserRouter` jest w `index.js`, nad `App`, bo `App` sam
nawiguje. Gość na `/games/:id` trafia na `/login` z `state.from`, a `/login` po zalogowaniu wraca
tam (`returnPathAfterLogin` w `ProtectedRoute.jsx`, tylko ścieżki zaczynające się od `/`).
Nie-uczestnik dostaje z `GameParticipantMiddleware` 403 i ląduje w lobby z `game.accessRevoked`
(„Nie masz dostępu do tej gry” — jeden tekst dla wyrzuconego i dla obcego z linkiem; 404 dla
nie-uczestnika odrzucone, bo backend i tak nie odróżni „nigdy nie był” od „wyrzucony”, a 404
dałoby wyrzuconemu fałszywe „gra nie istnieje”). F5 na `/games/:id` w produkcji działa dzięki
`try_files … /index.html` w `nginx.conf`. **Pułapka:** sesja może skończyć się dwa razy w jednym
ticku (`GAME_DELETED` + 404 z refetchu) — `leaveGame` pamięta `location.key` wpisu, który już
opuścił, bez tego drugi `navigate(-1)` wyszedłby za lobby.

**Szablon w grze to kopia.** Gra własnego systemu osadza kopię szablonu
(`Game.customSystemTemplate`). Zmiany w kreatorze nie trafiają do gry same: MG klika „Synchronizuj” na karcie gry
w lobby (`GameCard.jsx` → `POST /games/:id/syncTemplate`), co pobiera aktualną wersję.

**Uczestnicy.** MG zaprasza graczy (`/invite`), gracz może odejść (`/leave`), MG może go
wyrzucić (`DELETE /participants/:userId`). Wyrzucony dostaje `KICKED_FROM_GAME` i klient od razu
wychodzi z gry, zamiast próbować się ponownie łączyć.

**Link z zaproszeniem** (PLAYRPG-303). Gra ma najwyżej jeden link `/join/<token>`.
MG zarządza nim w zakładce Gracze (`InviteLinkSection.jsx`): `GET`/`POST`/`DELETE
/games/:id/inviteLink` (odczyt / nowy token / usunięcie, tylko MG). Nowy token unieważnia stary,
usunięcie robi `$unset`. Brak wygaśnięcia i limitu użyć, a dołączenie nie wymaga zgody MG:
opublikowanie linku jest jego decyzją. Dołączenie to `POST /invites/join {token}` (zwykły JWT,
poza `/games/:id`, bo wołający nie jest jeszcze uczestnikiem). Zwraca `{gameId, joined}`:
obcy zostaje dodany jako `RolePlayer`, uczestnik (także MG) tylko otwiera grę. Zaproszenie
e-mailem i linkiem idą przez ten sam `GameService.addPlayer`: ten sam uczestnik i ten sam
broadcast `PARTICIPANT_JOINED`.

Front: `/join/:token` (`src/invite/JoinGame.jsx`) odkłada token do `localStorage`
(`pendingInvite.js`) i od razu przekierowuje: zalogowanego na `/games`, gościa na `/login`
(z podpowiedzią `PendingInviteHint` także na `/register`). `useInviteJoin` w `App.js` zużywa
token przy każdym zalogowaniu i otwiera grę przez `handleJoinGame` (`/games/:gameId`), jak lobby. Martwy link
kończy się powiadomieniem w lobby (`game.inviteLinkInvalid`). Ścieżka „nie mam konta”
(rejestracja → e-mail → logowanie) działa, bo `localStorage` jest wspólny dla kart tej samej
przeglądarki. Na innym urządzeniu token przepada i trzeba otworzyć link jeszcze raz.

**Ustawienia uczestnika w grze** (`PATCH /participant`, `PlayerSettingsPopup.jsx`): avatar
(z konta, z postaci albo wgrany), podpis (z konta, z postaci albo własny), rozmiar dymka, kolor.
Nazwę w logu wybiera `DisplayNameResolver`: podpis w grze → podpis konta → e-mail.

**Kolor uczestnika** (PLAYRPG-340). `GameParticipant.Color` (`#rrggbb`) jest per gra, nie per
konto. Domyślny przydziela backend z palety 12 kolorów (`models/participant_colors.go`,
`ParticipantPalette`, jedyne źródło): MG dostaje pierwszy przy `CreateGame`, a każdy dołączający
(`addPlayer` → `joinWithColor`, wspólne dla zaproszenia e-mailem i linkiem) pierwszy wolny.
Po wyczerpaniu palety przydział zawija się od początku. Gracz zmienia kolor w
`PlayerSettingsPopup` (paleta jako podpowiedzi + `<input type="color">`). `PATCH /participant`
waliduje format (`NormalizeParticipantColor`, 400 dla złego) i zapisuje małymi literami, a
`PARTICIPANT_UPDATED` niesie `color`, więc ramka dymka, miarki, pingi i log zmieniają się u
wszystkich bez przeładowania. Front liczy kolor helperem `participantColor(participants, userId)`
(`utils/participants.js`) z neutralnym brązem `#8a7d6a` dla autora spoza gry i dla gry przed
migracją. Stare gry koloruje `cmd/migrate-participant-colors` (kolejność `JoinedAt`, uzupełnia
tylko brakujące, ponowne uruchomienie daje zera).

**Online.** Hub śledzi połączenia WS i rozsyła `USERS_ONLINE`. `OnlineSessionService`
zapisuje czas sesji, z którego powstają statystyki czasu online (w grze i łącznie).

**Zakładka Ogólne** (`GeneralTab.jsx`): info o grze, obrazek gry, status połączenia, język,
schemat sterowania sceną, głośność muzyki u gracza. Dla MG także ustawienia mapy: rozmiar
komórki, jednostka odległości, przyciąganie do siatki oraz konfiguracja wyglądu tokenów.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Lobby | `src/components/GameLobby.jsx`, `src/components/lobby/` |
| Ekran gry | `src/components/GameSession.jsx` |
| Panel boczny i zakładki | `src/components/panels/`, `tabDefinitions.jsx` (zakładki `gmOnly`) |
| Online i ustawienia uczestnika | `src/components/online-users/`, `src/hooks/useOnlineUsers.js` |
| Kolor uczestnika | `internal/models/participant_colors.go`, `joinWithColor` w `invite_link.go`, `cmd/migrate-participant-colors/`, `src/utils/participants.js` |
| Backend gry | `internal/http/GameHandler.go`, `internal/service/GameService.go` |
| Link z zaproszeniem | `internal/service/invite_link.go`, `internal/http/InviteLinkHandler.go`, `src/invite/`, `src/components/tabs/InviteLinkSection.jsx` |
| Sesje online, statystyki | `internal/service/OnlineSessionService.go`, `internal/http/StatsHandler.go` |

## Pułapki

- `syncTemplate` nadpisuje kopię w grze. Wartości pól usuniętych z szablonu przepadają
  (dialog ostrzega o tym użytkownika), więc usuwanie pól w używanym szablonie warto
  przemyśleć. Klucze pól to generowane id (`genId(type)`), a nie slug etykiety, więc zmiana etykiety jest bezpieczna.
- `FilterVisibleToParticipants` wycina z `VisibleTo` osoby spoza gry. Bez tego nieaktualny
  klient MG mógłby z powrotem dodać gracza, który odszedł.
- Zakładki `gmOnly` są ukrywane na froncie, ale prawdziwą granicą jest `requireGM` na backendzie.
- `Game.InviteToken` ma `json:"-"`. Surowa struktura `Game` idzie do graczy (`GET /games/:id`,
  `GAME_STATE`) i do lobby bez maskowania pól najwyższego poziomu, więc każde inne
  oznaczenie wypuściłoby token do każdego gracza. MG czyta go tylko przez `GET .../inviteLink`.
  Pilnuje tego `Game_invite_test.go`.
- Token siedzi w **ścieżce**, a obcinanie query stringa w `gtag.js` go nie łapie.
  `sanitizePath` zwija `/join/<cokolwiek>` do `/join` w `page_location`, `page_referrer`
  i `page_path`. Nowa trasa z sekretem w ścieżce musi trafić do tego samego wzorca.
- `AddParticipant` ma w filtrze `participants.userId: {$ne}` i zwraca `added`. Sprawdzenie
  i dopisanie to jedna atomowa operacja, więc podwójny klik ani dwie karty nie dodadzą tej samej
  osoby dwa razy (StrictMode też odpala efekty podwójnie). `takePendingInvite` czyta i kasuje
  token w jednym kroku z tego samego powodu.
- **Wyścig o kolor.** Dwa równoczesne dołączenia widzą ten sam „pierwszy wolny” kolor.
  `AddParticipant(..., uniqueColor)` dokłada do filtra `participants.color: {$ne}`, więc push
  przegranego nic nie trafia. `joinWithColor` czyta wtedy grę jeszcze raz i bierze następny
  kolor (limit prób = paleta + 2). Gdy paleta jest wyczerpana, kolor i tak jest wspólny, więc
  guard znika. Zawinięcie liczy tylko uczestników z kolorem: inaczej migracja dałaby dwóm
  ostatnim osobom ten sam kolor.
- **Duplikaty z pickera są dozwolone.** Gwarancję unikalności daje tylko przydział domyślny.
  Popup podpowiada „Ten kolor ma też: …”, ale nie blokuje.
- **Paleta istnieje dwa razy.** Kopia w `utils/participants.js` służy tylko jako podpowiedzi
  w pickerze. Rozjazd z Go niczego nie psuje, ale nowy kolor dopisuj w obu miejscach.
- `PATCH /participant` nadpisuje wszystkie pola naraz, także `color`. Klient, który pominie
  kolor, dostanie 400. Popup wysyła go zawsze (fallback dla gry przed migracją).
- Każda porażka linku (zły format, unieważniony, usunięta gra) to jeden błąd
  `ErrInviteLinkInvalid` → 404, żeby obcy nie mógł sprawdzać, które tokeny kiedyś istniały.
