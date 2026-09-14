# Autoryzacja postaci sceny + wspólny `requireGM` — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domknąć trzy endpointy postaci sceny, które nie sprawdzają uprawnień, i sprowadzić 33 ręczne kopie sprawdzenia MG w `GameService.go` do jednego helpera.

**Architecture:** Decyzja i pobranie danych są rozdzielone. Czyste predykaty (`isGameMaster`, `ownsCharacter`, `updateTouchesVisibility`) nie dotykają repozytoriów i są testowane jednostkowo; cienkie metody `requireGM` i `requireGMOrCharacterOwner` dokładają do nich pobranie gry i postaci. Ten podział nie jest estetyczny, tylko wymuszony: `GameService.gameRepo` jest **konkretnym typem** `*repository.GameRepository`, nie interfejsem, więc metody go dotykające nie dają się przetestować bez bazy — i dlatego wszystkie dotychczasowe testy w `internal/service/` testują funkcje czyste.

**Tech Stack:** Go, Gin, MongoDB (`go.mongodb.org/mongo-driver`), testy `go test` bez frameworka.

**Spec:** `docs/superpowers/specs/2026-09-14-scene-character-authz-design.md`

## Global Constraints

- Testy uruchamiasz: `cd warhammer-battle-helper-backend && go test ./...`. Kompilację sprawdzasz `go build ./...`. Oba muszą przechodzić na koniec **każdego** taska.
- Zakres wyłącznie backendowy. **Nigdy nie dotykaj `warhammer-battle-helper-front/`.**
- Komentarze w kodzie po **angielsku**.
- Migracja nie zmienia **żadnego** komunikatu w postaci `only the game master can <akcja>` — tekst po migracji musi być znak w znak taki sam jak przed. Jedyny wyjątek to trzy miejsca zwracające dziś `"not authorized"`, wymienione imiennie w Tasku 5.
- Nie dotykasz `internal/service/FogService.go`, `DrawingService.go`, `YahtzeeService.go`, `DicePokerService.go` — mają własne `isGM` nad własnymi repozytoriami; ujednolicanie ich jest poza zakresem.
- Nie dotykasz sprawdzeń w warstwie HTTP (`CharacterHandler.go:606`, `:678`, `HandoutHandler.go:82`) — zwracają odpowiedzi HTTP bezpośrednio, nie pasują do helpera zwracającego `error`.
- Kod odpowiedzi przy odmowie zostaje **400**, tak jak we wszystkich istniejących sprawdzeniach MG. Zmiana na 403 to osobna decyzja o API.

---

### Task 1: Czyste predykaty autoryzacji

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/authz.go`
- Test: `warhammer-battle-helper-backend/internal/service/authz_test.go`

**Interfaces:**
- Consumes: `models.Game`, `models.Character`, `models.UpdateSceneCharacterRequest`.
- Produces: `isGameMaster(game *models.Game, userID primitive.ObjectID) bool`, `ownsCharacter(ch *models.Character, userID primitive.ObjectID) bool`, `updateTouchesVisibility(req models.UpdateSceneCharacterRequest) bool`. Wszystkie pakietowo-prywatne, używane przez Task 2.

- [ ] **Step 1: Napisz testy**

Utwórz `internal/service/authz_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestIsGameMaster(t *testing.T) {
	gmID := primitive.NewObjectID()
	playerID := primitive.NewObjectID()
	game := &models.Game{GameMasterID: gmID}

	if !isGameMaster(game, gmID) {
		t.Error("the GM must be recognised as the GM")
	}
	if isGameMaster(game, playerID) {
		t.Error("a player must not be recognised as the GM")
	}
	// A nil game means the fetch failed; the caller returns that error, but the predicate must
	// not panic on the way there.
	if isGameMaster(nil, gmID) {
		t.Error("a nil game must never authorise anyone")
	}
}

func TestOwnsCharacter(t *testing.T) {
	ownerID := primitive.NewObjectID()
	viewerID := primitive.NewObjectID()
	strangerID := primitive.NewObjectID()

	cases := []struct {
		name string
		ch   *models.Character
		user primitive.ObjectID
		want bool
	}{
		{
			name: "the creator owns it",
			ch:   &models.Character{CreatedBy: ownerID},
			user: ownerID,
			want: true,
		},
		{
			// Card access is ownership for this purpose: the frontend's isOwnCharacter accepts it,
			// so a narrower server rule would 403 a legitimate click.
			name: "a card-holder owns it",
			ch:   &models.Character{CreatedBy: ownerID, VisibleTo: []primitive.ObjectID{viewerID}},
			user: viewerID,
			want: true,
		},
		{
			name: "a stranger does not",
			ch:   &models.Character{CreatedBy: ownerID, VisibleTo: []primitive.ObjectID{viewerID}},
			user: strangerID,
			want: false,
		},
		{
			name: "an empty VisibleTo does not authorise",
			ch:   &models.Character{CreatedBy: ownerID},
			user: strangerID,
			want: false,
		},
		{
			name: "a nil character never authorises",
			ch:   nil,
			user: ownerID,
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ownsCharacter(tc.ch, tc.user); got != tc.want {
				t.Errorf("ownsCharacter = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestUpdateTouchesVisibility(t *testing.T) {
	hidden := true
	x := 3.0

	if !updateTouchesVisibility(models.UpdateSceneCharacterRequest{Hidden: &hidden}) {
		t.Error("a request carrying Hidden must be recognised as a visibility change")
	}
	if updateTouchesVisibility(models.UpdateSceneCharacterRequest{PositionX: &x}) {
		t.Error("a geometry-only request must not be recognised as a visibility change")
	}
	if updateTouchesVisibility(models.UpdateSceneCharacterRequest{}) {
		t.Error("an empty request must not be recognised as a visibility change")
	}
	// The value does not matter — asking to UNHIDE is exactly the interesting attack, so a false
	// Hidden must count just as much as a true one.
	unhide := false
	if !updateTouchesVisibility(models.UpdateSceneCharacterRequest{Hidden: &unhide}) {
		t.Error("Hidden=false must also count as a visibility change")
	}
}
```

- [ ] **Step 2: Uruchom testy i potwierdź, że padają**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestIsGameMaster|TestOwnsCharacter|TestUpdateTouchesVisibility' -v`
Expected: FAIL kompilacji — `undefined: isGameMaster`, `undefined: ownsCharacter`, `undefined: updateTouchesVisibility`.

- [ ] **Step 3: Napisz predykaty**

Utwórz `internal/service/authz.go`:

```go
package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Authorization rules for game-scoped operations, split in two on purpose.
//
// The predicates below are pure: they take data and answer a question, so they are unit-testable.
// The requireX methods further down add the fetching. GameService holds concrete repository types
// rather than interfaces, so anything that touches a repo cannot be tested without a database —
// which is why every decision worth testing lives in a predicate instead.

// isGameMaster reports whether userID runs this game. A nil game (a failed fetch) authorises
// nobody: the caller returns the fetch error, and this must not panic on the way there.
func isGameMaster(game *models.Game, userID primitive.ObjectID) bool {
	return game != nil && game.GameMasterID == userID
}

// ownsCharacter reports whether userID may act on this character: they created it, or they hold
// its card (VisibleTo). Deliberately wider than the VisibleTo-only rule the read pipeline uses for
// hasCard — it has to cover the frontend's isOwnCharacter, or legitimate UI actions would 403.
func ownsCharacter(ch *models.Character, userID primitive.ObjectID) bool {
	if ch == nil {
		return false
	}
	if ch.CreatedBy == userID {
		return true
	}
	for _, id := range ch.VisibleTo {
		if id == userID {
			return true
		}
	}
	return false
}

// updateTouchesVisibility reports whether a scene-token update asks to change the GM's eye toggle.
// Only that field is GM-only; the geometry fields belong to the token's owner too. A pointer field
// gives us the distinction for free: nil means "not part of this request".
func updateTouchesVisibility(req models.UpdateSceneCharacterRequest) bool {
	return req.Hidden != nil
}
```

Uwaga: **nie** dodawaj tu importu `fmt` — żadna z tych trzech funkcji go nie używa, a nieużywany import to w Go błąd kompilacji. Dojdzie w Tasku 2 razem z pierwszą funkcją, która formatuje komunikat.

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'TestIsGameMaster|TestOwnsCharacter|TestUpdateTouchesVisibility' -v`
Expected: PASS, 3 funkcje testowe (`TestOwnsCharacter` z 5 podprzypadkami).

- [ ] **Step 5: Sprawdź, że reszta pakietu się buduje**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build bez błędów, wszystkie testy przechodzą.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/authz.go \
        warhammer-battle-helper-backend/internal/service/authz_test.go
git commit -m "feat: add pure authorization predicates for game-scoped operations"
```

---

### Task 2: Helpery `requireGM` i `requireGMOrCharacterOwner`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/authz.go`

**Interfaces:**
- Consumes: `isGameMaster`, `ownsCharacter` z Taska 1; `s.gameRepo.GetByID(id string) (*models.Game, error)`; `s.charRepo.GetByID(id string) (*models.Character, error)`.
- Produces:
  - `func (s *GameService) requireGM(gameID string, userID primitive.ObjectID, action string) (*models.Game, error)`
  - `func (s *GameService) requireGMOrCharacterOwner(gameID string, characterID string, userID primitive.ObjectID, action string) (*models.Game, error)`

  Oba zwracają `(nil, err)` przy odmowie. `characterID` jest **stringiem**, bo `charRepo.GetByID` przyjmuje string — wywołujący mający `primitive.ObjectID` podaje `.Hex()`.

- [ ] **Step 1: Dopisz helpery**

Dodaj `"fmt"` do bloku importów `internal/service/authz.go`, a na końcu pliku te dwie metody:

```go
// requireGM fetches the game and rejects anyone who is not its GM. It returns the game because
// most callers need it immediately after the check; discard it with `_` when you don't.
//
// `action` completes "only the game master can %s", so every message this produces is identical to
// the hand-written copy it replaces.
func (s *GameService) requireGM(gameID string, userID primitive.ObjectID, action string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	if !isGameMaster(game, userID) {
		return nil, fmt.Errorf("only the game master can %s", action)
	}
	return game, nil
}

// requireGMOrCharacterOwner allows the GM, or a player who holds the character. The character is
// only fetched when the caller is not the GM — the GM path must not fail because a character row
// is missing.
func (s *GameService) requireGMOrCharacterOwner(gameID string, characterID string, userID primitive.ObjectID, action string) (*models.Game, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	if isGameMaster(game, userID) {
		return game, nil
	}
	ch, err := s.charRepo.GetByID(characterID)
	if err != nil {
		return nil, err
	}
	if !ownsCharacter(ch, userID) {
		return nil, fmt.Errorf("only the game master or the character's owner can %s", action)
	}
	return game, nil
}
```

Te dwie metody dotykają repozytoriów, więc **nie mają testów jednostkowych** — nie da się ich napisać bez bazy (patrz nagłówek planu). Cała ich logika decyzyjna siedzi w predykatach z Taska 1, które testy mają.

- [ ] **Step 2: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build czysty, testy przechodzą. Nieużywane funkcje pakietowe **nie** są w Go błędem — brak wywołań na tym etapie jest w porządku.

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/authz.go
git commit -m "feat: add requireGM and requireGMOrCharacterOwner helpers"
```

---

### Task 3: Domknięcie trzech endpointów postaci sceny

To jest właściwa poprawka bezpieczeństwa. Trzy funkcje serwisu dostają sprawdzenie, dwa handlery dostają wyciągnięcie `userID`.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go` — `AddCharacterToScene` (~`:1483`), `UpdateSceneCharacterGeometry` (~`:1516`), `RemoveCharacterFromScene` (~`:1778`)
- Modify: `warhammer-battle-helper-backend/internal/http/SceneHandler.go` — `UpdateSceneCharacter` (~`:204`), `RemoveSceneCharacter` (~`:236`)

**Interfaces:**
- Consumes: `requireGM`, `requireGMOrCharacterOwner` z Taska 2; `updateTouchesVisibility` z Taska 1.
- Produces: zmienione sygnatury serwisu —
  - `UpdateSceneCharacterGeometry(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID, userID primitive.ObjectID, req models.UpdateSceneCharacterRequest) error`
  - `RemoveCharacterFromScene(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID, userID primitive.ObjectID) error`
  - `AddCharacterToScene` — sygnatura **bez zmian**, już przyjmuje `placedBy`.

- [ ] **Step 1: Znajdź wszystkich wywołujących**

Run:
```bash
cd warhammer-battle-helper-backend
grep -rn "UpdateSceneCharacterGeometry\|RemoveCharacterFromScene\|AddCharacterToScene" --include=*.go .
```
Zapisz wynik w raporcie. Zmiana sygnatur musi objąć **każde** trafienie; jeśli wywołujący jest inny niż handlery wymienione wyżej, zatrzymaj się i zgłoś to zamiast zgadywać.

- [ ] **Step 2: Dodaj sprawdzenie w `AddCharacterToScene`**

Sygnatura zostaje. Na samym początku ciała, przed `s.charRepo.GetByID(characterID)`:

```go
	// Placing a token is the sidebar's on/off-grid toggle, which players use on their own
	// characters — so this is owner-or-GM, not GM-only.
	if _, err := s.requireGMOrCharacterOwner(gameID, characterID, placedBy, "place a character on a scene"); err != nil {
		return err
	}
```

- [ ] **Step 3: Dodaj sprawdzenie per-pole w `UpdateSceneCharacterGeometry`**

Zmień sygnaturę na:

```go
func (s *GameService) UpdateSceneCharacterGeometry(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID, userID primitive.ObjectID, req models.UpdateSceneCharacterRequest) error {
```

i wstaw jako pierwsze instrukcje ciała:

```go
	// Hidden is the GM's eye toggle and its only effect is on OTHER viewers (a card-holder sees
	// their own token regardless — see keepSceneCharacterForViewer), so it is GM-only while the
	// geometry fields belong to the owner too.
	//
	// A mixed request is refused whole rather than partially applied: answering 200 after silently
	// dropping Hidden would leave the client rendering a token as revealed that the server never
	// revealed, and would give an attacker no signal at all.
	if updateTouchesVisibility(req) {
		if _, err := s.requireGM(gameID, userID, "change token visibility"); err != nil {
			return err
		}
	} else if _, err := s.requireGMOrCharacterOwner(gameID, characterID.Hex(), userID, "move a scene token"); err != nil {
		return err
	}
```

- [ ] **Step 4: Dodaj sprawdzenie w `RemoveCharacterFromScene`**

Zmień sygnaturę na:

```go
func (s *GameService) RemoveCharacterFromScene(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID, userID primitive.ObjectID) error {
```

i wstaw jako pierwsze instrukcje ciała:

```go
	// The other half of the sidebar's on/off-grid toggle — a player takes their own token off the
	// map, so this is owner-or-GM like the placing side.
	if _, err := s.requireGMOrCharacterOwner(gameID, characterID.Hex(), userID, "remove a character from a scene"); err != nil {
		return err
	}
```

- [ ] **Step 5: Przepnij dwa handlery**

W `internal/http/SceneHandler.go`, w `UpdateSceneCharacter`, po zbindowaniu `req` a przed wywołaniem serwisu:

```go
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.UpdateSceneCharacterGeometry(gameID, sceneID, characterID, userID, req); err != nil {
```

W `RemoveSceneCharacter`, po sparsowaniu `characterID` a przed wywołaniem serwisu:

```go
	userID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.GameService.RemoveCharacterFromScene(gameID, sceneID, characterID, userID); err != nil {
```

Wzorzec skopiuj z `AddSceneCharacter` (~`:189`), który już to robi — ten sam kod błędu, ten sam komunikat.

- [ ] **Step 6: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build czysty, wszystkie testy przechodzą. Jeśli build zgłasza „not enough arguments", został wywołujący nieuwzględniony w Kroku 1 — popraw go, nie obchodź.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go \
        warhammer-battle-helper-backend/internal/http/SceneHandler.go
git commit -m "fix: authorize the three scene-character endpoints"
```

---

### Task 4: Migracja sprawdzeń MG — gra, handouty, muzyka

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go`

**Interfaces:**
- Consumes: `requireGM` z Taska 2.
- Produces: nic nowego — czysto strukturalna zamiana.

Każde miejsce ma dziś ten kształt:

```go
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can invite players")
	}
```

i po zamianie ten:

```go
	game, err := s.requireGM(gameID, userID, "invite players")
	if err != nil {
		return err
	}
```

albo — gdy `game` nie jest dalej używana — ten:

```go
	if _, err := s.requireGM(gameID, userID, "invite players"); err != nil {
		return err
	}
```

**Tekst akcji bierzesz dosłownie z istniejącego komunikatu**, wycinając prefiks `only the game master can `. Nazwa zmiennej użytkownika bywa różna (`userID`, `gmUserID`, `gmID`) — podaj tę, która jest w danej funkcji.

Miejsca w tym tasku (numery linii sprzed migracji, przesuną się w trakcie — szukaj po tekście komunikatu):

| linia | akcja |
|---|---|
| 350 | `invite players` |
| 399 | `delete the game` |
| 523 | `kick players` |
| 988 | `create handouts` |
| 1025 | `update handouts` |
| 1055 | `delete handouts` |
| 1087 | `reorder handouts` |
| 1190 | `create handout folders` |
| 1218 | `rename handout folders` |
| 1241 | `delete handout folders` |
| 1270 | `reorder handout folders` |
| 1306 | `move handouts` |
| 2680, 2730, 2764, 2789, 2810 | `control music` |

- [ ] **Step 1: Zamień wszystkie 17 miejsc z tabeli**

Rób je po kolei, sprawdzając przy każdym, czy zmienna `game` jest dalej w funkcji używana — to decyduje, którą z dwóch form wybrać. Niewykorzystana zmienna `game` jest w Go **błędem kompilacji**, więc pomyłka wyjdzie natychmiast.

- [ ] **Step 2: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build czysty, testy przechodzą.

- [ ] **Step 3: Potwierdź, że żaden komunikat się nie zmienił**

Run:
```bash
cd warhammer-battle-helper-backend
git diff -U0 internal/service/GameService.go | grep -E '^[+-].*only the game master' | sort | uniq -c
```
Expected: każdy tekst występuje **parzyście** — raz jako `-` w starej formie, raz jako `+` w nowej. Tekst widoczny tylko po jednej stronie znaczy, że literówka weszła do komunikatu.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "refactor: route game, handout and music GM checks through requireGM"
```

---

### Task 5: Migracja sprawdzeń MG — sceny, obrazy, token gear

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go`

**Interfaces:**
- Consumes: `requireGM` z Taska 2.
- Produces: nic nowego.

Forma zamiany jest identyczna jak w Tasku 4 — powtórzona tu, bo taski czyta się osobno:

```go
	// przed
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}

	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can create scenes")
	}

	// po, gdy `game` jest dalej używana
	game, err := s.requireGM(gameID, userID, "create scenes")
	if err != nil {
		return err
	}

	// po, gdy nie jest
	if _, err := s.requireGM(gameID, userID, "create scenes"); err != nil {
		return err
	}
```

Miejsca (numery sprzed migracji — szukaj po tekście komunikatu):

| linia | akcja |
|---|---|
| 1360 | `create scenes` |
| 1403 | `update scenes` |
| 1430 | `delete scenes` |
| 1452 | `assign players to scenes` |
| 1575 | `edit token gear` |
| 1799 | `add images to scenes` |
| 1884 | `duplicate scene images` |
| 1976 | `update scene images` |
| 2162 | `move scene tokens` |
| 2252 | `delete scene images` |
| 2276, 2337 | `edit image tokens` |
| 2403 | `share token slots` |

- [ ] **Step 1: Zamień wszystkie 13 miejsc z tabeli**

- [ ] **Step 2: Zamień trzy miejsca zwracające `"not authorized"`**

To jedyne miejsca, w których **komunikat się zmienia**. Dziś:

```go
	if game.GameMasterID != gmID {
		return "", fmt.Errorf("not authorized")
	}
```

Trzy wystąpienia, przy `SetImageUrl` (~`:421`), `UpdateMapSettings` (~`:442`) i przy token-display blueprint (~`:3086`). Zamień na `requireGM` z akcjami odpowiednio: `change the game image`, `update map settings`, `read the token blueprint`.

Zmiana tekstu jest tu bezpieczna i celowa: sprawdziłem, że front nigdzie nie porównuje treści tych błędów (`grep -rn "not authorized" warhammer-battle-helper-front/src/` nie daje trafień). Ujednolicenie komunikatu jest wartością samą w sobie.

- [ ] **Step 3: NIE dotykaj `GameService.go:469`**

```go
	// The GM is not necessarily stored as a participant on older games.
	if game.GameMasterID != userID {
		if err := s.gameRepo.RemoveParticipant(gameID, userID); err != nil {
```

To **nie jest sprawdzenie uprawnień** — to logika opuszczania gry: „jeśli wołający nie jest MG, wypisz go z uczestników". Mechaniczna zamiana na `requireGM` odwróciłaby sens i zamieniła poprawne wyjście z gry w błąd. Zostaw bez zmian.

Potwierdź w raporcie, że to miejsce widziałeś i świadomie pominąłeś.

- [ ] **Step 4: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build czysty, testy przechodzą.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "refactor: route scene, image and token-gear GM checks through requireGM"
```

---

### Task 6: Bramki końcowe

**Files:**
- Modify: żaden, chyba że bramka coś wykaże.

- [ ] **Step 1: Sprawdź, że w `GameService.go` nie został żaden ręczny warunek**

Run:
```bash
cd warhammer-battle-helper-backend
grep -n "GameMasterID != " internal/service/GameService.go
```
Expected: **dokładnie jedno** trafienie — linia z `RemoveParticipant` (logika opuszczania gry, Task 5 Krok 3). Każde inne trafienie to miejsce pominięte w migracji.

- [ ] **Step 2: Sprawdź, że nie został żaden ręcznie sklejony komunikat**

Run:
```bash
cd warhammer-battle-helper-backend
grep -n 'fmt.Errorf("only the game master' internal/service/GameService.go
```
Expected: **zero** trafień. Jedyny egzemplarz tego komunikatu ma żyć w `requireGM` w `authz.go`. Jeśli coś zostało w `GameService.go`, wróć do Tasku 4 albo 5.

- [ ] **Step 3: Sprawdź, że trzy endpointy postaci naprawdę mają sprawdzenie**

Run:
```bash
cd warhammer-battle-helper-backend
grep -n "requireGMOrCharacterOwner\|requireGM(" internal/service/GameService.go | head -40
```
Expected: wśród trafień są trzy wywołania `requireGMOrCharacterOwner` (place / move / remove) oraz `requireGM` z akcją `change token visibility`.

- [ ] **Step 4: Pełny build, vet i testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./... && go test ./...`
Expected: wszystko czyste. `go vet` łapie m.in. źle sparowane argumenty `fmt.Errorf`, co przy tej migracji jest realnym ryzykiem.

- [ ] **Step 5: Przebieg ręczny**

**Odstępstwo od specu, świadome.** Spec wymieniał „regresję na trzy załatane endpointy" wśród
testów jednostkowych. Nie da się jej tak napisać: te trzy funkcje wołają `gameRepo` i `charRepo`,
które są konkretnymi typami, więc test bez bazy wywali się na `nil` wskaźniku. Cała ich logika
decyzyjna jest pokryta testami predykatów z Taska 1; sama ścieżka end-to-end schodzi do przebiegu
ręcznego poniżej. Punkty 3, 4, 5 i 7 są dokładnie tą regresją.

Ten punkt należy do właściciela repo, nie do wykonawcy planu. Na lokalnym stacku (recepta na JWT: pamięć `local-e2e-verification-recipe`):

1. MG przesuwa token gracza — działa.
2. Gracz przesuwa własny token — działa.
3. Gracz przesuwa cudzy token (request ręcznie, `PUT .../characters/:charId` z `positionX`) — **400**.
4. Gracz wysyła `{"hidden": false}` na cudzy ukryty token — **400**, token pozostaje ukryty po refetchu.
5. Gracz wysyła `{"positionX": 5, "hidden": false}` na **własny** token — **400**, i pozycja też **nie** została zapisana (odmowa w całości).
6. Gracz zdejmuje własną postać z siatki przełącznikiem w panelu — działa.
7. Gracz próbuje usunąć cudzą postać ze sceny (request ręcznie) — **400**.
8. MG robi wszystko powyższe — działa bez zmian.

- [ ] **Step 6: Commit (tylko jeśli bramki wymusiły poprawki)**

```bash
git add -A warhammer-battle-helper-backend/
git commit -m "fix: close the gaps the authz gates found"
```

---

## Notatki dla wykonawcy

**Czego NIE robić:**

- Nie zmieniaj `internal/service/FogService.go`, `DrawingService.go`, `YahtzeeService.go`, `DicePokerService.go`. Mają własne `isGM` nad własnymi repozytoriami i ujednolicanie ich jest osobnym zadaniem.
- Nie ruszaj sprawdzeń w `internal/http/CharacterHandler.go` ani `HandoutHandler.go` — inny kształt, zwracają HTTP bezpośrednio.
- Nie zmieniaj kodu odpowiedzi z 400 na 403. Cały backend zwraca dziś 400 dla błędów serwisu; zmiana to osobna decyzja o API.
- Nie dopuszczaj gracza do `BatchMoveSceneTokens`. To wymaga walidacji per-id i jest osobnym ticketem.
- Nie pisz testów konstruujących `GameService` z prawdziwymi repozytoriami. Repozytoria są konkretnymi typami, nie interfejsami — takie testy wymagałyby bazy, a projekt tego nie robi nigdzie.

**Pułapki:**

- **Niewykorzystana zmienna `game` to błąd kompilacji w Go**, nie ostrzeżenie. Dlatego wybór między `game, err := s.requireGM(...)` a `if _, err := s.requireGM(...)` wyjdzie natychmiast przy buildzie — nie zgaduj, po prostu zbuduj.
- **`charRepo.GetByID` przyjmuje `string`.** Funkcje trzymające `primitive.ObjectID` muszą podać `.Hex()`.
- **`requireGMOrCharacterOwner` pobiera postać dopiero, gdy wołający nie jest MG.** Nie przestawiaj tego — ścieżka MG nie może się wywalić dlatego, że rekord postaci zniknął.
- **Numery linii w tabelach Tasków 4 i 5 są sprzed migracji** i przesuwają się z każdą zamianą. Szukaj po treści komunikatu, nie po numerze.
