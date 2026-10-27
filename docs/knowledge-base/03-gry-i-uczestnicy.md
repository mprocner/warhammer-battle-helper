# Gry i uczestnicy

## Jak to działa

**Lobby** (`/`) pokazuje gry użytkownika i kafelek kreatora szablonów. Tworzenie gry
(`CreateGameDialog.jsx`) to nazwa i jedna lista wyboru z wyszukiwarką, w której są zarówno
systemy wbudowane (z `allowedSystems`, patrz [02-konta-i-dostep.md](02-konta-i-dostep.md)),
jak i szablony dostępne dla użytkownika. Filtr języka zawęża tę listę i jest zapamiętywany
w przeglądarce. Gdy wyszukiwanie nic nie znajduje tylko przez filtr, dialog mówi o tym wprost.

**Szablon w grze to kopia.** Gra własnego systemu osadza kopię szablonu
(`Game.customSystemTemplate`). Zmiany w kreatorze nie trafiają do gry same: MG uruchamia
`POST /games/:id/syncTemplate`, które pobiera aktualną wersję.

**Uczestnicy.** MG zaprasza graczy (`/invite`), gracz może odejść (`/leave`), MG może go
wyrzucić (`DELETE /participants/:userId`). Wyrzucony dostaje `KICKED_FROM_GAME` i klient od razu
wychodzi z gry, zamiast próbować się ponownie łączyć.

**Ustawienia uczestnika w grze** (`PATCH /participant`, `PlayerSettingsPopup.jsx`): avatar
(z konta, z postaci albo wgrany), podpis (z konta, z postaci albo własny), rozmiar dymka.
Nazwę w logu wybiera `DisplayNameResolver`: podpis w grze → podpis konta → e-mail.

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
| Backend gry | `internal/http/GameHandler.go`, `internal/service/GameService.go` |
| Sesje online, statystyki | `internal/service/OnlineSessionService.go`, `internal/http/StatsHandler.go` |

## Pułapki

- `syncTemplate` nadpisuje kopię w grze. Wartości postaci zapisane pod kluczami pól usuniętych
  z szablonu przestają być wyświetlane, więc usuwanie pól w używanym szablonie warto
  przemyśleć. Klucze pól są stabilne (np. `SkillOption.ID`), więc zmiana etykiety jest bezpieczna.
- `FilterVisibleToParticipants` wycina z `VisibleTo` osoby spoza gry. Bez tego nieaktualny
  klient MG mógłby z powrotem dodać gracza, który odszedł.
- Zakładki `gmOnly` są ukrywane na froncie, ale prawdziwą granicą jest `requireGM` na backendzie.
