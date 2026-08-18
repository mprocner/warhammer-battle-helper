# FEATURE-59 — odbieranie dostępu przy wyjściu gracza — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gracz, który opuścił grę lub został z niej wyrzucony, traci dostęp do postaci, do endpointów gry i do strumienia WebSocket.

**Architecture:** Trzy rozproszone dziś sprawdzenia dostępu sprowadzamy do dwóch czystych predykatów w `internal/service/access.go` (`CanAccessGame`, `CanEditCharacter`). Korzystają z nich: nowy middleware uczestnictwa, handlery postaci i handler WebSocketu. Sprzątanie przy wyjściu trafia do jednego prywatnego `GameService.removeUserFromGame`, wołanego z `LeaveGame` i `KickPlayer`.

**Tech Stack:** Go 1.x + Gin + MongoDB (driver `go.mongodb.org/mongo-driver`), gorilla/websocket, React + jest (react-scripts).

**Spec:** `docs/superpowers/specs/2026-08-18-FEATURE-59-revoke-access-on-leave-design.md`

## Global Constraints

- Katalog roboczy backendu: `warhammer-battle-helper-backend/`. Katalog frontendu: `warhammer-battle-helper-front/`. Wszystkie ścieżki w planie są względne wobec korzenia repo `warhammer-battle-helper/`.
- Testy backendowe **nie dotykają Mongo**. Konwencja projektu (`internal/repository/GameRepository_test.go`) — testujemy wyłącznie czyste funkcje. Metody repozytorium zostają bez testów jednostkowych.
- Bez wstecznej kompatybilności danych. Stare dokumenty można naprawić lub usunąć ręcznie.
- Gałąź: `FEATURE-59` (już istnieje, spec na niej zacommitowany).
- Format commitów: `<typ>(<zakres>): FEATURE-59 <opis małą literą>`, np. `feat(service): FEATURE-59 add game access predicate`.
- GM **nie musi** figurować w `participants` — każde sprawdzenie dostępu musi jawnie honorować `game.GameMasterID`.

---

### Task 1: Predykaty dostępu

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/access.go`
- Test: `warhammer-battle-helper-backend/internal/service/access_test.go`

**Interfaces:**
- Consumes: `models.Game`, `models.Character` (istniejące)
- Produces:
  - `service.CanAccessGame(game *models.Game, userID primitive.ObjectID) bool`
  - `service.CanEditCharacter(ch *models.Character, userID primitive.ObjectID, isGM bool) bool`
  - `service.FilterVisibleToParticipants(game *models.Game, visibleTo []primitive.ObjectID) []primitive.ObjectID`

- [ ] **Step 1: Napisz padające testy**

Utwórz `warhammer-battle-helper-backend/internal/service/access_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestCanAccessGame(t *testing.T) {
	gm := primitive.NewObjectID()
	player := primitive.NewObjectID()
	stranger := primitive.NewObjectID()

	game := &models.Game{
		GameMasterID: gm,
		Participants: []models.GameParticipant{{UserID: player}},
	}

	if !CanAccessGame(game, gm) {
		t.Error("GM must pass even when absent from participants")
	}
	if !CanAccessGame(game, player) {
		t.Error("participant must pass")
	}
	if CanAccessGame(game, stranger) {
		t.Error("stranger must not pass")
	}
	if CanAccessGame(nil, player) {
		t.Error("nil game must not pass")
	}
	if CanAccessGame(game, primitive.NilObjectID) {
		t.Error("zero user id must not pass")
	}
}

func TestCanEditCharacter(t *testing.T) {
	owner := primitive.NewObjectID()
	holder := primitive.NewObjectID()

	// Karta stworzona przez ownera, ale GM odebrał mu widoczność i oddał ją holderowi.
	ch := &models.Character{
		CreatedBy: owner,
		VisibleTo: []primitive.ObjectID{holder},
	}

	if !CanEditCharacter(ch, holder, false) {
		t.Error("user in visibleTo must be able to edit")
	}
	if CanEditCharacter(ch, owner, false) {
		t.Error("createdBy alone must NOT grant edit rights")
	}
	if !CanEditCharacter(ch, owner, true) {
		t.Error("GM must be able to edit anything")
	}

	orphan := &models.Character{CreatedBy: owner, VisibleTo: nil}
	if CanEditCharacter(orphan, owner, false) {
		t.Error("orphaned character must not be editable by a non-GM")
	}
	if CanEditCharacter(nil, owner, false) {
		t.Error("nil character must not be editable")
	}
}

func TestFilterVisibleToParticipants(t *testing.T) {
	gm := primitive.NewObjectID()
	player := primitive.NewObjectID()
	departed := primitive.NewObjectID()

	game := &models.Game{
		GameMasterID: gm,
		Participants: []models.GameParticipant{{UserID: player}},
	}

	got := FilterVisibleToParticipants(game, []primitive.ObjectID{player, departed, gm})

	if len(got) != 2 {
		t.Fatalf("got %d ids, want 2 (%v)", len(got), got)
	}
	if got[0] != player || got[1] != gm {
		t.Errorf("got %v, want [player gm] with departed dropped", got)
	}

	empty := FilterVisibleToParticipants(game, nil)
	if empty == nil {
		t.Error("must return an empty slice, never nil (it is marshalled to JSON)")
	}
}
```

- [ ] **Step 2: Uruchom testy, upewnij się że padają**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestCanAccessGame|TestCanEditCharacter|TestFilterVisibleToParticipants' -v`
Expected: FAIL — `undefined: CanAccessGame`, `undefined: CanEditCharacter`, `undefined: FilterVisibleToParticipants`

- [ ] **Step 3: Napisz implementację**

Utwórz `warhammer-battle-helper-backend/internal/service/access.go`:

```go
package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CanAccessGame reports whether userID may touch this game at all.
// The GM is checked explicitly: older games do not carry him in Participants.
func CanAccessGame(game *models.Game, userID primitive.ObjectID) bool {
	if game == nil || userID.IsZero() {
		return false
	}
	if game.GameMasterID == userID {
		return true
	}
	for _, p := range game.Participants {
		if p.UserID == userID {
			return true
		}
	}
	return false
}

// CanEditCharacter reports whether userID may edit this character.
// CreatedBy deliberately does NOT grant edit rights on its own: it survives a player
// leaving the game, so honouring it would keep a departed player's write access alive.
func CanEditCharacter(ch *models.Character, userID primitive.ObjectID, isGM bool) bool {
	if isGM {
		return true
	}
	if ch == nil {
		return false
	}
	for _, visID := range ch.VisibleTo {
		if visID == userID {
			return true
		}
	}
	return false
}

// FilterVisibleToParticipants drops every ID that is neither the GM nor a current
// participant. Guards against a stale GM client re-adding a departed player.
func FilterVisibleToParticipants(game *models.Game, visibleTo []primitive.ObjectID) []primitive.ObjectID {
	out := make([]primitive.ObjectID, 0, len(visibleTo))
	for _, id := range visibleTo {
		if CanAccessGame(game, id) {
			out = append(out, id)
		}
	}
	return out
}
```

- [ ] **Step 4: Uruchom testy, upewnij się że przechodzą**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestCanAccessGame|TestCanEditCharacter|TestFilterVisibleToParticipants' -v`
Expected: PASS — trzy testy `ok`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/access.go warhammer-battle-helper-backend/internal/service/access_test.go
git commit -m "feat(service): FEATURE-59 add game and character access predicates"
```

---

### Task 2: Middleware uczestnictwa

**Files:**
- Create: `warhammer-battle-helper-backend/internal/http/GameAccessMiddleware.go`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:219-223`

**Interfaces:**
- Consumes: `service.CanAccessGame` (Task 1), `getUserIDFromContext` (`internal/http/SceneHandler.go:18`), `repository.GameRepository.GetByID`
- Produces: `http.GameParticipantMiddleware(gameRepo *repository.GameRepository) gin.HandlerFunc`

Ten task nie ma testu jednostkowego — middleware wymaga Mongo, a jego decyzja to `CanAccessGame` przetestowane w Tasku 1. Weryfikacja: kompilacja + ręczny smoke test w kroku 4.

- [ ] **Step 1: Napisz middleware**

Utwórz `warhammer-battle-helper-backend/internal/http/GameAccessMiddleware.go`:

```go
package http

import (
	"net/http"

	"battle-helper/internal/repository"
	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
)

// GameParticipantMiddleware rejects callers who are neither the GM nor a participant of
// the game in the :id path parameter. Must run after JWTAuthMiddleware.
//
// Without it a JWT alone opened every /games/:id endpoint, so a player who left (or was
// kicked) kept full access to scenes, notes, handouts, rolls and minigames.
func GameParticipantMiddleware(gameRepo *repository.GameRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := getUserIDFromContext(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		game, err := gameRepo.GetByID(c.Param("id"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "Game not found"})
			return
		}

		if !service.CanAccessGame(game, userID) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "You are not a participant of this game"})
			return
		}

		c.Next()
	}
}
```

- [ ] **Step 2: Wepnij middleware w routing**

W `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go` znajdź:

```go
	game := r.Group("/games/:id").Use(http.JWTAuthMiddleware())

	game.DELETE("", gameHandler.DeleteGame)
	game.POST("/invite", gameHandler.InvitePlayer)
	game.POST("/join", gameHandler.JoinGame)
	game.POST("/leave", gameHandler.LeaveGame)
```

Zamień na:

```go
	// POST /join is called by someone who is not a participant yet, so it lives in its own
	// group without the participation guard.
	gameJoin := r.Group("/games/:id", http.JWTAuthMiddleware())
	gameJoin.POST("/join", gameHandler.JoinGame)

	game := r.Group("/games/:id", http.JWTAuthMiddleware(), http.GameParticipantMiddleware(gameRepo))

	game.DELETE("", gameHandler.DeleteGame)
	game.POST("/invite", gameHandler.InvitePlayer)
	game.POST("/leave", gameHandler.LeaveGame)
```

Uwaga: linia `game.POST("/join", ...)` **znika** z grupy `game` — przeniosła się do `gameJoin`. Żadna inna linia routingu się nie zmienia; `game` zachowuje nazwę, więc pozostałe ~90 tras zostaje nietkniętych. Dwie grupy Gina o tym samym prefiksie są dozwolone, dopóki nie rejestrują tej samej pary metoda+ścieżka.

`r.GET("/games/:id", ...)` (`main.go:174`) i `r.GET("/games/:id/ws", ...)` (`main.go:177`) zostają bez zmian — pierwsza obsługuje ekran dołączania, drugą załatwia Task 8.

- [ ] **Step 3: Zbuduj projekt**

Run: `cd warhammer-battle-helper-backend && go build ./...`
Expected: brak wyjścia (sukces)

- [ ] **Step 4: Ręczny smoke test**

Podnieś lokalny stack dockerowy, zdobądź JWT gracza, który nie należy do gry `<gameId>`:

```bash
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:8080/games/<gameId>/characters
```
Expected: `HTTP/1.1 403 Forbidden` oraz `{"error":"You are not a participant of this game"}`

Ten sam request z tokenem GM-a lub uczestnika: `HTTP/1.1 200 OK`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/GameAccessMiddleware.go warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat(http): FEATURE-59 guard game endpoints behind participation"
```

---

### Task 3: `createdBy` przestaje wystarczać do edycji postaci

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/CharacterHandler.go:247-261` (`UpdateGameCharacter`)
- Modify: `warhammer-battle-helper-backend/internal/http/CharacterHandler.go:373-382` (`authorizeCharacterEdit`)

**Interfaces:**
- Consumes: `service.CanEditCharacter` (Task 1)
- Produces: nic nowego

Zachowanie pokrywa `TestCanEditCharacter` z Tasku 1 — tutaj wyłącznie podmiana wywołania na predykat.

- [ ] **Step 1: Podmień pierwszą kopię logiki**

W `UpdateGameCharacter` znajdź:

```go
	if !isGM {
		canEdit := existingCharacter.CreatedBy == userObjID
		if !canEdit {
			for _, visID := range existingCharacter.VisibleTo {
				if visID == userObjID {
					canEdit = true
					break
				}
			}
		}
		if !canEdit {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
			return
		}
	}
```

Zamień na:

```go
	if !service.CanEditCharacter(existingCharacter, userObjID, isGM) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
		return
	}
```

- [ ] **Step 2: Podmień drugą kopię logiki**

W `authorizeCharacterEdit` znajdź:

```go
	if game.GameMasterID != userObjID {
		canEdit := ch.CreatedBy == userObjID
		for _, visID := range ch.VisibleTo {
			if visID == userObjID {
				canEdit = true
				break
			}
		}
		if !canEdit {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
			return nil, false
		}
	}
```

Zamień na:

```go
	if !service.CanEditCharacter(ch, userObjID, game.GameMasterID == userObjID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this character"})
		return nil, false
	}
```

Zaktualizuj też komentarz nad `authorizeCharacterEdit` — dziś brzmi „(GM, owner, or in VisibleTo)", a `owner` przestał wystarczać:

```go
// authorizeCharacterEdit resolves the character and checks edit rights: GM, or present in
// VisibleTo. CreatedBy alone is not enough — it outlives a player leaving the game.
```

- [ ] **Step 3: Dodaj import `service`, jeśli go brakuje**

Sprawdź blok importów w `CharacterHandler.go`. Jeżeli nie ma `"battle-helper/internal/service"`, dopisz go.

Run: `cd warhammer-battle-helper-backend && go build ./...`
Expected: brak wyjścia (sukces)

- [ ] **Step 4: `DeleteGameCharacter` zostaje bez zmian — potwierdź**

Run: `cd warhammer-battle-helper-backend && grep -nE "CreatedBy (==|!=)" internal/http/CharacterHandler.go`
Expected: dokładnie jedno trafienie — warunek w `DeleteGameCharacter` (`existingCharacter.CreatedBy != userObjID`, ok. `:575`), gdzie ownership jest właściwą regułą. Żadnego w `UpdateGameCharacter` ani `authorizeCharacterEdit`.

Jeżeli grep nic nie zwraca, sprawdź czy warunek w `DeleteGameCharacter` nie został skasowany przez pomyłkę — ma zostać.

- [ ] **Step 5: Uruchom pełne testy backendu i zacommituj**

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: wszystkie pakiety `ok` lub `no test files`

```bash
git add warhammer-battle-helper-backend/internal/http/CharacterHandler.go
git commit -m "fix(http): FEATURE-59 stop createdBy alone from granting character edit rights"
```

---

### Task 4: Filtrowanie `visibleTo` po stronie serwera

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/CharacterHandler.go:688-710` (`UpdateCharacterVisibility`)

**Interfaces:**
- Consumes: `service.FilterVisibleToParticipants` (Task 1)
- Produces: nic nowego

- [ ] **Step 1: Odfiltruj nie-uczestników i nadawaj przefiltrowaną listę**

W `UpdateCharacterVisibility` znajdź:

```go
	visibleTo := make([]primitive.ObjectID, 0, len(req.VisibleTo))
	for _, idStr := range req.VisibleTo {
		objID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID in visibleTo: " + idStr})
			return
		}
		visibleTo = append(visibleTo, objID)
	}

	if err := h.CharacterRepo.UpdateVisibility(charID, visibleTo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterVisibilityUpdated, map[string]interface{}{
			"characterId": charID,
			"visibleTo":   req.VisibleTo,
		})
	}
```

Zamień na:

```go
	visibleTo := make([]primitive.ObjectID, 0, len(req.VisibleTo))
	for _, idStr := range req.VisibleTo {
		objID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID in visibleTo: " + idStr})
			return
		}
		visibleTo = append(visibleTo, objID)
	}

	// A GM tab that never saw the player leave still holds his id in its cached visibleTo
	// and submits the whole set on save, which would resurrect the revoked access.
	visibleTo = service.FilterVisibleToParticipants(game, visibleTo)

	if err := h.CharacterRepo.UpdateVisibility(charID, visibleTo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.Hub != nil {
		visibleHex := make([]string, 0, len(visibleTo))
		for _, id := range visibleTo {
			visibleHex = append(visibleHex, id.Hex())
		}
		h.Hub.BroadcastToGame(gameID, websocket.EventCharacterVisibilityUpdated, map[string]interface{}{
			"characterId": charID,
			"visibleTo":   visibleHex,
		})
	}
```

Broadcast **musi** nieść listę po filtrze, nie surowe `req.VisibleTo` — inaczej klienci zapisaliby u siebie stan, którego nie ma w bazie.

- [ ] **Step 2: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build bez wyjścia, testy `ok`

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/CharacterHandler.go
git commit -m "fix(http): FEATURE-59 drop non-participants from a visibility update"
```

---

### Task 5: Repozytorium — hurtowe usunięcie z `visibleTo`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/CharactersRepository.go` (dopisz metodę na końcu pliku)

**Interfaces:**
- Consumes: nic nowego
- Produces: `(*CharactersRepository).RemoveUserFromAllVisibility(gameID string, userID primitive.ObjectID) error`

Bez testu jednostkowego — metoda to samo I/O Mongo, a konwencja projektu nie testuje takich metod.

- [ ] **Step 1: Dopisz metodę**

Na końcu `warhammer-battle-helper-backend/internal/repository/CharactersRepository.go`:

```go
// RemoveUserFromAllVisibility strips userID from visibleTo across every character of the
// game in one UpdateMany. Called when a player leaves or is kicked: without it the database
// keeps claiming the departed player may see those characters.
//
// Characters left with an empty visibleTo are kept, not deleted — the GM sees every
// character in his game regardless of visibleTo and can hand the card to someone else.
func (r *CharactersRepository) RemoveUserFromAllVisibility(gameID string, userID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	gameObjID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return err
	}

	_, err = r.Collection.UpdateMany(ctx,
		bson.M{"gameId": gameObjID},
		bson.M{"$pull": bson.M{"visibleTo": userID}},
	)
	return err
}
```

- [ ] **Step 2: Zbuduj**

Run: `cd warhammer-battle-helper-backend && go build ./...`
Expected: brak wyjścia (sukces)

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-backend/internal/repository/CharactersRepository.go
git commit -m "feat(repository): FEATURE-59 strip a user from every character's visibleTo"
```

---

### Task 6: Hub — rozłączanie użytkownika

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/websocket/hub.go` (dopisz metodę po `unregisterClient`)
- Test: `warhammer-battle-helper-backend/internal/websocket/hub_test.go` (nowy plik — pierwszy test w tym pakiecie)

**Interfaces:**
- Consumes: `(*Hub).removeClient` (`hub.go:116`, wymaga trzymanego write locka)
- Produces: `(*Hub).DisconnectUser(gameID string, userID primitive.ObjectID)`

- [ ] **Step 1: Napisz padający test**

Utwórz `warhammer-battle-helper-backend/internal/websocket/hub_test.go`:

```go
package websocket

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// isClosed reports whether ch is closed. A buffered, empty, open channel hits the default
// branch; a closed one yields ok == false.
func isClosed(ch chan []byte) bool {
	select {
	case _, ok := <-ch:
		return !ok
	default:
		return false
	}
}

func TestHub_DisconnectUser(t *testing.T) {
	h := NewHub()

	target := primitive.NewObjectID()
	bystander := primitive.NewObjectID()

	tabOne := &Client{ID: target, GameID: "g1", Send: make(chan []byte, 1)}
	tabTwo := &Client{ID: target, GameID: "g1", Send: make(chan []byte, 1)}
	other := &Client{ID: bystander, GameID: "g1", Send: make(chan []byte, 1)}
	elsewhere := &Client{ID: target, GameID: "g2", Send: make(chan []byte, 1)}

	h.Games["g1"] = map[*Client]bool{tabOne: true, tabTwo: true, other: true}
	h.Games["g2"] = map[*Client]bool{elsewhere: true}

	h.DisconnectUser("g1", target)

	if !isClosed(tabOne.Send) || !isClosed(tabTwo.Send) {
		t.Error("every tab of the target user in that game must be closed")
	}
	if isClosed(other.Send) {
		t.Error("another user in the same game must be left alone")
	}
	if isClosed(elsewhere.Send) {
		t.Error("the same user in a different game must be left alone")
	}

	if len(h.Games["g1"]) != 1 {
		t.Errorf("game g1 holds %d clients, want 1", len(h.Games["g1"]))
	}
	if _, still := h.Games["g1"][tabOne]; still {
		t.Error("disconnected client must be removed from the game room")
	}
}

func TestHub_DisconnectUser_UnknownGame(t *testing.T) {
	h := NewHub()

	// Must not panic on a game with no clients registered.
	h.DisconnectUser("nope", primitive.NewObjectID())
}
```

- [ ] **Step 2: Uruchom test, upewnij się że pada**

Run: `cd warhammer-battle-helper-backend && go test ./internal/websocket/ -run TestHub_DisconnectUser -v`
Expected: FAIL — `h.DisconnectUser undefined (type *Hub has no field or method DisconnectUser)`

- [ ] **Step 3: Napisz implementację**

W `warhammer-battle-helper-backend/internal/websocket/hub.go`, zaraz za `unregisterClient` (kończy się w `:112`), dopisz:

```go
// DisconnectUser closes every connection userID holds in gameID. Used when a player leaves
// or is kicked: the REST guard blocks his next request, but an already-open socket would
// keep streaming GAME_STATE and every later broadcast until he closed the tab himself.
func (h *Hub) DisconnectUser(gameID string, userID primitive.ObjectID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.Games[gameID]
	if !ok {
		return
	}

	// Collect first, remove second — removeClient deletes from the map we are ranging over.
	var targets []*Client
	for client := range clients {
		if client.ID == userID {
			targets = append(targets, client)
		}
	}

	for _, client := range targets {
		h.removeClient(client)
	}
}
```

- [ ] **Step 4: Uruchom test, upewnij się że przechodzi**

Run: `cd warhammer-battle-helper-backend && go test ./internal/websocket/ -run TestHub_DisconnectUser -v`
Expected: PASS — dwa testy `ok`

Uruchom też z detektorem wyścigów, skoro dotykamy huba:

Run: `cd warhammer-battle-helper-backend && go test -race ./internal/websocket/`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/websocket/hub.go warhammer-battle-helper-backend/internal/websocket/hub_test.go
git commit -m "feat(websocket): FEATURE-59 add hub method to disconnect a user from a game"
```

---

### Task 7: Wspólne sprzątanie w `LeaveGame` i `KickPlayer`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:523-589`

**Interfaces:**
- Consumes: `(*CharactersRepository).RemoveUserFromAllVisibility` (Task 5), `(*Hub).DisconnectUser` (Task 6), istniejące `RemoveParticipant` i `RemovePlayerFromAllScenes`
- Produces: `(*GameService).removeUserFromGame(game *models.Game, gameID string, userID primitive.ObjectID) error` (prywatna)

- [ ] **Step 1: Dodaj wspólny helper**

W `warhammer-battle-helper-backend/internal/service/GameService.go`, bezpośrednio przed `// LeaveGame removes a user from a game` (`:523`), wstaw:

```go
// removeUserFromGame revokes everything a departing user held: card visibility, participation,
// scene assignments and live sockets. Shared by LeaveGame and KickPlayer.
//
// The order matters because there is no transaction. Failing on step 1 leaves the user fully
// in the game — a consistent, retryable state. DisconnectUser goes last: only after
// RemoveParticipant does the participation guard reject his reconnect, so cutting the socket
// earlier would leave a window for the client to come back in.
func (s *GameService) removeUserFromGame(game *models.Game, gameID string, userID primitive.ObjectID) error {
	if err := s.charRepo.RemoveUserFromAllVisibility(gameID, userID); err != nil {
		return err
	}

	// The GM is not necessarily stored as a participant on older games.
	if game.GameMasterID != userID {
		if err := s.gameRepo.RemoveParticipant(gameID, userID); err != nil {
			return err
		}
	}

	if err := s.gameRepo.RemovePlayerFromAllScenes(gameID, userID); err != nil {
		return err
	}

	s.hub.DisconnectUser(gameID, userID)

	return nil
}
```

- [ ] **Step 2: Przepnij `LeaveGame` na helper**

Znajdź w `LeaveGame`:

```go
	// GM is not stored as a participant, so skip RemoveParticipant
	if game.GameMasterID != userID {
		if err := s.gameRepo.RemoveParticipant(gameID, userID); err != nil {
			return err
		}
	}

	if err := s.gameRepo.RemovePlayerFromAllScenes(gameID, userID); err != nil {
		return err
	}
```

Zamień na:

```go
	if err := s.removeUserFromGame(game, gameID, userID); err != nil {
		return err
	}
```

Reszta `LeaveGame` (zdarzenie `EventTypeLeave` i broadcast `EventParticipantLeft`) zostaje bez zmian.

- [ ] **Step 3: Przepnij `KickPlayer` na helper**

Znajdź w `KickPlayer`:

```go
	if err := s.gameRepo.RemoveParticipant(gameID, targetUserID); err != nil {
		return err
	}

	if err := s.gameRepo.RemovePlayerFromAllScenes(gameID, targetUserID); err != nil {
		return err
	}
```

Zamień na:

```go
	if err := s.removeUserFromGame(game, gameID, targetUserID); err != nil {
		return err
	}
```

Broadcast `EventParticipantLeft` poniżej zostaje bez zmian.

- [ ] **Step 4: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build bez wyjścia, testy `ok`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "fix(service): FEATURE-59 revoke card visibility and sockets when a player leaves"
```

---

### Task 8: WebSocket odrzuca nie-uczestnika

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go:586-623` (`HandleWebSocket`)

**Interfaces:**
- Consumes: `service.CanAccessGame` (Task 1), `(*GameService).GetGame`
- Produces: nic nowego

- [ ] **Step 1: Sprawdź uczestnictwo przed `Upgrade`**

W `HandleWebSocket` znajdź:

```go
	claims := token.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
```

Zamień na:

```go
	claims := token.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	// Check participation BEFORE upgrading, so a rejected client gets a plain HTTP response
	// instead of a broken handshake. A valid JWT alone used to be enough to keep streaming
	// GAME_STATE to a player who had already left.
	game, err := h.GameService.GetGame(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}
	if !service.CanAccessGame(game, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant of this game"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
```

- [ ] **Step 2: Wykorzystaj już pobraną grę zamiast drugiego zapytania**

Niżej w tej samej funkcji znajdź:

```go
	// Send initial game state only to the connecting client, with notes filtered for them
	game, err := h.GameService.GetGame(gameID)
	if err == nil {
		h.attachTokenConfig(game)
```

Zamień na:

```go
	// Send initial game state only to the connecting client, with notes filtered for them.
	// `game` was already fetched above for the participation check.
	h.attachTokenConfig(game)
```

Usuń zamykający `}` należący do tego `if err == nil {` — blok przestaje być warunkowy. Po zmianie ciało to `attachTokenConfig`, trzy wywołania filtrów i `BroadcastToUsers`, wszystko na jednym poziomie wcięcia.

- [ ] **Step 3: Zbuduj**

Run: `cd warhammer-battle-helper-backend && go build ./...`
Expected: brak wyjścia (sukces). Jeżeli pojawi się `declared and not used: err` albo `game redeclared`, znaczy że krok 2 zostawił resztkę starego bloku.

- [ ] **Step 4: Ręczna weryfikacja**

Na lokalnym stacku: dołącz jako gracz, otwórz sesję, po czym GM wyrzuca go przez interfejs.
Expected: karta wyrzuconego gracza traci połączenie WebSocket natychmiast, a próba ponownego połączenia kończy się `403` w zakładce Network.

- [ ] **Step 5: Uruchom testy i zacommituj**

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: wszystkie pakiety `ok` lub `no test files`

```bash
git add warhammer-battle-helper-backend/internal/http/GameHandler.go
git commit -m "fix(http): FEATURE-59 reject a non-participant websocket before upgrading"
```

---

### Task 9: Frontend przestaje wskrzeszać usunięty wpis

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/stripUserFromCharacters.js`
- Test: `warhammer-battle-helper-front/src/utils/stripUserFromCharacters.test.js`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:220-226`

**Interfaces:**
- Consumes: nic z wcześniejszych tasków
- Produces: `stripUserFromCharacters(characters, userId)` — nazwany i domyślny eksport, zwraca nową tablicę postaci bez `userId` w `visibleTo`

- [ ] **Step 1: Napisz padający test**

Utwórz `warhammer-battle-helper-front/src/utils/stripUserFromCharacters.test.js`:

```js
import { stripUserFromCharacters } from './stripUserFromCharacters';

describe('stripUserFromCharacters', () => {
  it('removes the id from every character that carries it', () => {
    const characters = [
      { id: 'c1', visibleTo: ['u1', 'u2'] },
      { id: 'c2', visibleTo: ['u2'] },
      { id: 'c3', visibleTo: ['u1'] },
    ];

    expect(stripUserFromCharacters(characters, 'u1')).toEqual([
      { id: 'c1', visibleTo: ['u2'] },
      { id: 'c2', visibleTo: ['u2'] },
      { id: 'c3', visibleTo: [] },
    ]);
  });

  it('keeps the original object for a character that never had the id', () => {
    const untouched = { id: 'c1', visibleTo: ['u2'] };
    const [result] = stripUserFromCharacters([untouched], 'u1');
    expect(result).toBe(untouched);
  });

  it('handles characters without a visibleTo array', () => {
    expect(stripUserFromCharacters([{ id: 'c1' }], 'u1')).toEqual([{ id: 'c1' }]);
  });

  it('treats a missing character list as empty', () => {
    expect(stripUserFromCharacters(undefined, 'u1')).toEqual([]);
    expect(stripUserFromCharacters(null, 'u1')).toEqual([]);
  });

  it('returns the list unchanged when no user id is given', () => {
    const list = [{ id: 'c1', visibleTo: ['u1'] }];
    expect(stripUserFromCharacters(list, undefined)).toBe(list);
  });
});
```

- [ ] **Step 2: Uruchom test, upewnij się że pada**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=stripUserFromCharacters`
Expected: FAIL — `Cannot find module './stripUserFromCharacters'`

- [ ] **Step 3: Napisz implementację**

Utwórz `warhammer-battle-helper-front/src/utils/stripUserFromCharacters.js`:

```js
/**
 * Removes a user id from the visibleTo list of every character.
 *
 * CharacterVisibilityModal seeds its checkboxes from character.visibleTo and submits the
 * whole set on save, including ids it never rendered. Left stale after a player leaves, a
 * GM opening that modal would write the departed player's id straight back into the
 * database. PARTICIPANT_LEFT only trimmed the participants list, so this closes the gap.
 *
 * @param {Array<{visibleTo?: string[]}>|null|undefined} characters
 * @param {string|null|undefined} userId
 * @returns {Array} the original list when nothing changed, otherwise a new array
 */
export const stripUserFromCharacters = (characters, userId) => {
  if (!userId) return characters || [];
  return (characters || []).map((character) => {
    const visibleTo = character.visibleTo || [];
    if (!visibleTo.includes(userId)) return character;
    return { ...character, visibleTo: visibleTo.filter((id) => id !== userId) };
  });
};

export default stripUserFromCharacters;
```

- [ ] **Step 4: Uruchom test, upewnij się że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern=stripUserFromCharacters`
Expected: PASS — `Tests: 5 passed`

- [ ] **Step 5: Podepnij helper pod `PARTICIPANT_LEFT`**

W `warhammer-battle-helper-front/src/components/GameSession.jsx` dopisz import obok pozostałych importów z `../utils/`:

```js
import { stripUserFromCharacters } from '../utils/stripUserFromCharacters';
```

Znajdź:

```js
      case WS_EVENTS.PARTICIPANT_LEFT:
        addLogMessage(`A player left the game`, 'info');
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, participants: (prev.participants || []).filter(p => p.userId !== message.payload.userId) };
        });
        break;
```

Zamień na:

```js
      case WS_EVENTS.PARTICIPANT_LEFT:
        addLogMessage(`A player left the game`, 'info');
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: (prev.participants || []).filter(p => p.userId !== message.payload.userId),
            characters: stripUserFromCharacters(prev.characters, message.payload.userId),
          };
        });
        break;
```

- [ ] **Step 6: Uruchom pełne testy frontendu**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test`
Expected: wszystkie suity przechodzą

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/stripUserFromCharacters.js warhammer-battle-helper-front/src/utils/stripUserFromCharacters.test.js warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "fix(front): FEATURE-59 drop a departed player from cached character visibility"
```

---

## Weryfikacja końcowa

Po wszystkich taskach, na lokalnym stacku dockerowym:

- [ ] Gracz z dostępem do postaci opuszcza grę → `GET /games/:id/characters` jego tokenem zwraca `403`
- [ ] W bazie: `db.characters.find({gameId: ObjectId("<id>")})` nie zawiera już jego ID w żadnym `visibleTo`
- [ ] Postać, której był jedynym odbiorcą, dalej jest widoczna na liście GM-a
- [ ] GM wyrzuca gracza z otwartą sesją → jego WebSocket rozłącza się natychmiast, reconnect kończy się `403`
- [ ] GM otwiera modal widoczności po wyjściu gracza i zapisuje → usunięty wpis **nie wraca** do bazy
- [ ] GM i pozostali gracze pracują normalnie: rzuty, sceny, notatki, handouty bez `403`
- [ ] Dołączanie do gry (`POST /games/:id/join`) dalej działa dla kogoś spoza gry
