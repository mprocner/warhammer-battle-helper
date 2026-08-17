# FEATURE-59 — odbieranie dostępu przy wyjściu gracza z gry

Data: 2026-08-18

## Problem

Gracz opuszcza grę (sam lub wyrzucony przez GM), a w bazie przy postaciach zostaje jego ID w `visibleTo`. Formalnie nie jest już uczestnikiem, ale dane mówią, że ma dostęp.

Podczas analizy okazało się, że to jeden objaw szerszej dziury. `LeaveGame` (`internal/service/GameService.go:524`) i `KickPlayer` (`:562`) usuwają uczestnika i czyszczą `assignedPlayers` na scenach, ale:

1. `visibleTo` postaci zostaje nietknięte — były gracz dalej dostaje te postacie z `GET /games/:id/characters` (filtr w `internal/http/CharacterHandler.go:110`).
2. `UpdateGameCharacter` (`:247-256`) uznaje `createdBy` **lub** `visibleTo`, więc sam pull z `visibleTo` nie odcina byłego gracza od edycji jego własnych kart.
3. Grupa tras `/games/:id` (`cmd/warhammer-battle-helper/main.go:219`) ma wyłącznie `JWTAuthMiddleware` — zero sprawdzenia uczestnictwa. Każdy zalogowany user z ID gry trafia we wszystkie endpointy: sceny, notatki, handouty, rzuty, minigry.
4. `HandleWebSocket` (`internal/http/GameHandler.go:563`) sprawdza wyłącznie ważność JWT. Wyrzucony gracz z otwartą kartą przeglądarki dalej dostaje `GAME_STATE` i każdy kolejny broadcast.

## Zasada porządkująca

Trzy różne miejsca odpowiadają dziś na pytanie „czy ten user ma dostęp", każde po swojemu. Feature sprowadza je do dwóch czystych predykatów, testowalnych bez Mongo:

```go
func CanAccessGame(game *models.Game, userID primitive.ObjectID) bool
func CanEditCharacter(ch *models.Character, userID primitive.ObjectID, isGM bool) bool
```

Konwencja testowa projektu: `internal/repository/GameRepository_test.go` testuje wyłącznie czyste helpery, nie dotyka bazy. Nowa logika idzie w tę samą stronę — decyzja w czystej funkcji, I/O osobno.

## Warstwa 1 — sprzątanie przy wyjściu

`LeaveGame` i `KickPlayer` duplikują dziś tę samą sekwencję. Wspólne prywatne `removeUserFromGame(gameID, userID)` w `GameService`, z dwoma nowymi krokami:

```
1. charRepo.RemoveUserFromAllVisibility(gameID, userID)   ← nowe
2. gameRepo.RemoveParticipant(gameID, userID)             (istnieje; pomijane dla GM)
3. gameRepo.RemovePlayerFromAllScenes(gameID, userID)     (istnieje)
4. hub.DisconnectUser(gameID, userID)                     ← nowe
```

Nowa metoda repozytorium — jeden `UpdateMany`, nie pętla po postaciach:

```go
// internal/repository/CharactersRepository.go
func (r *CharactersRepository) RemoveUserFromAllVisibility(gameID string, userID primitive.ObjectID) error {
    // filter: {"gameId": gameObjID}
    // update: {"$pull": {"visibleTo": userID}}
}
```

### Postacie osierocone

Postać, której jedynym odbiorcą był odchodzący gracz, zostaje z `visibleTo: []`. **Nie znika** — GM widzi wszystkie postacie w grze niezależnie od `visibleTo` (`CharacterHandler.go:88`, `:107`), więc może ją później przypisać komu innemu albo skasować ręcznie. Świadomie nie kasujemy: gracz wyrzucony omyłkowo albo wracający do gry nie traci danych.

### Uzasadnienie kolejności

Projekt nie używa transakcji Mongo, więc kolejność sama musi dawać bezpieczny stan po awarii w połowie:

- awaria w kroku 1 → user dalej pełnoprawnym uczestnikiem; stan spójny, operacja ponawialna;
- awaria w kroku 3 → uczestnika już nie ma, więc guard i tak odcina; osierocony wpis w `assignedPlayers` jest kosmetyczny;
- `DisconnectUser` **na końcu**, bo dopiero po `RemoveParticipant` reconnect jest blokowany przez guard. Odwrotna kolejność zostawia okno, w którym rozłączony klient wraca i przechodzi walidację.

Krok 1 propaguje błąd w górę (`return err`), tak jak istniejące kroki. `DisconnectUser` nie zwraca błędu — jest best-effort.

### GM opuszczający własną grę

Ta sama ścieżka, zero specjalnego kodu. `RemoveParticipant` jest już dziś pomijane dla GM (`GameService.go:531`, GM nie jest zapisywany jako uczestnik). Pull `visibleTo` z jego NPC-ów jest bezszkodliwy, bo GM i tak widzi wszystko, a guard wpuści go z powrotem po `GameMasterID`.

## Warstwa 2 — guard uczestnictwa

Nowy `GameParticipantMiddleware(gameRepo)` w `internal/http/JWTMiddleware.go`, obok istniejącego `AdminAuthMiddleware` i dokładnie tym samym wzorcem: leci po `JWTAuthMiddleware`, czyta `c.Get("jwt")`, kończy przez `AbortWithStatusJSON`.

```go
game := r.Group("/games/:id").Use(http.JWTAuthMiddleware())
game.POST("/join", gameHandler.JoinGame)   // PRZED guardem — z definicji woła go nie-uczestnik

guarded := game.Use(http.GameParticipantMiddleware(gameRepo))
// wszystkie pozostałe trasy przenoszą się na `guarded`
```

Guard woła `CanAccessGame` → `403`. Gra nieznaleziona → `404`.

Dwa wyjątki, o które trzeba zadbać:

- `POST /games/:id/join` zostaje przed guardem;
- **GM nie jest zapisany jako participant** — guard musi go przepuszczać jawnie po `game.GameMasterID`.

`GET /games/:id` (`main.go:174`) zostaje bez zmian — jest celowo `JWTOptionalMiddleware` i obsługuje ekran dołączania.

## Warstwa 3 — uprawnienia do postaci

W `UpdateGameCharacter` (`CharacterHandler.go:247-256`) i drugim handlerze z tym samym wzorcem (`:373`) ręczna pętla ustępuje `CanEditCharacter`, w którym `createdBy` **przestaje sam wystarczać** — liczy się obecność w `visibleTo` albo bycie GM-em.

Analiza rozjazdu: `CreatedBy` jest ustawiane tylko w dwóch miejscach (`:206` create, `:635` clone) i oba w tej samej linijce ustawiają `VisibleTo` na tego samego usera. Zbiory rozjeżdżają się wyłącznie wtedy, gdy GM ręcznie odbierze twórcy widoczność — czyli w tym samym scenariuszu, który ten feature naprawia. Brak przepływu, w którym aktywny gracz legalnie edytuje kartę mając `createdBy` bez `visibleTo`.

`DeleteGameCharacter` (`:575`) **bez zmian** — tam warunek brzmi `!isGM && createdBy != user`, czyli kasować może tylko właściciel. Ownership jest tu właściwą regułą.

### Walidacja `UpdateCharacterVisibility`

`UpdateCharacterVisibility` (`:660`) przyjmuje dziś dowolną listę ID. Backend ładuje grę i po cichu odfiltrowuje z `visibleTo` każde ID, które nie jest uczestnikiem ani GM-em. Zapis przechodzi, tyle że oczyszczony — GM ze starym stanem w zakładce nie dostaje niezrozumiałego błędu, a wskrzeszenie usuniętego wpisu jest niemożliwe niezależnie od stanu klienta.

## Warstwa 4 — WebSocket

`HandleWebSocket` sprawdza `CanAccessGame` **przed** `upgrader.Upgrade` (`GameHandler.go:591`) i zwraca `403` JSON. Klient dostaje normalną odpowiedź HTTP zamiast zerwanego handshake'u.

Rozłączanie żywych połączeń:

```go
// internal/websocket/hub.go
func (h *Hub) DisconnectUser(gameID string, userID primitive.ObjectID) {
    h.mu.Lock()
    defer h.mu.Unlock()
    // 1. zebrać klienty o c.ID == userID z h.Games[gameID]
    // 2. dla każdego wywołać h.removeClient(c)
}
```

Zbieramy przed usuwaniem, żeby nie mutować mapy w trakcie iteracji — ten sam wzorzec co lista `stale` w `broadcastMessage` (`hub.go:168`). `removeClient` (`:116`) wymaga trzymanego write locka i już robi `close(client.Send)` oraz zamknięcie sesji online, więc nie dokładamy nowej logiki cyklu życia.

## Warstwa 5 — frontend

`CharacterVisibilityModal` seeduje `selectedIds` z `character.visibleTo` (`CharacterVisibilityModal.jsx:11`) i przy zapisie wysyła **cały set** (`:47`), nie tylko widoczne checkboxy. Handler `PARTICIPANT_LEFT` (`GameSession.jsx:220`) czyści tylko `participants`, nie rusza `characters[].visibleTo`. Skutkiem jest wskrzeszenie: GM otwiera modal po wyjściu gracza, zapisuje, usunięty wpis wraca do bazy.

Fix: rozszerzyć ten sam handler `PARTICIPANT_LEFT` o usunięcie `userId` z `visibleTo` każdej postaci. Zero nowych broadcastów — zdarzenie już leci.

Logika idzie do czystego helpera `stripUserFromCharacters(characters, userId)` w `src/utils/`, zamiast testowania switcha wewnątrz `GameSession.jsx`. Wzorzec jak `src/utils/appendUnique.test.js`.

Backendowy filtr z warstwy 3 jest drugą, niezależną linią obrony na ten sam scenariusz.

## Testy

Wszystkie bez Mongo, zgodnie z konwencją projektu.

| Co | Gdzie | Przypadki |
|---|---|---|
| `CanAccessGame` | nowy test w `internal/service` | GM spoza `participants` → true; participant → true; obcy → false |
| `CanEditCharacter` | tamże | obecny w `visibleTo` → true; samo `createdBy` → **false**; GM → true; puste `visibleTo` i nie-GM → false |
| filtr `UpdateCharacterVisibility` | tamże | ID nie-uczestnika wycięte; ID uczestnika zachowane; GM zachowany |
| `Hub.DisconnectUser` | nowy `internal/websocket/hub_test.go` | dwie karty tego samego usera → obie zamknięte; inny user w tej grze → nietknięty; ten sam user w innej grze → nietknięty; nieistniejąca gra → brak paniki |
| `stripUserFromCharacters` | nowy plik w `src/utils/` + test | usuwa ID ze wszystkich postaci; brak ID → zawartość bez zmian |

`RemoveUserFromAllVisibility` wymaga Mongo, więc bez testu jednostkowego — weryfikacja ręczna na lokalnym stacku dockerowym.

## Poza zakresem

Tokeny i placementy odchodzącego gracza zostają na scenach. To jego postacie na mapie, nie kwestia dostępu — GM usuwa je ręcznie. Wciąganie tego rozjeżdża feature.
