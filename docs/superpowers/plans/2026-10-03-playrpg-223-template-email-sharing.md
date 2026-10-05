# PLAYRPG-223 — Udostępnianie szablonu konkretnym adresom email — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Właściciel szablonu custom może wpisać adres email w kreatorze (Ogólne → Widoczność) i dać tej osobie prawo używania oraz klonowania szablonu, bez wystawiania go publicznie.

**Architecture:** Szablon dostaje `SharedWith []ObjectID`. Widoczność rozstrzyga jeden eksportowany predykat `service.CanUseTemplate` (właściciel LUB publiczny LUB na liście), a jego odpowiednikiem po stronie bazy jest trzecia gałąź `$or` w `ListVisibleToUser`. Adresy do wyświetlenia doczytuje `attachShares` jednym `FindByIDs`. Dwa dedykowane endpointy (`POST`/`DELETE /templates/:id/shares`) zwracają za każdym razem pełną, świeżą listę odbiorców.

**Tech Stack:** Go 1.24.4 + Gin + mongo-driver (`mtest` do testów repozytoriów), React 18 + MUI + `react-i18next`, CRA + Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/PLAYRPG-223.md`

## Global Constraints

- **Komentarze w kodzie zawsze po angielsku**, backend i frontend, bez wyjątków. Plan i spec po polsku.
- Żadnych stringów wprost w JSX — każdy tekst przez `t('klucz')`, klucze **angielskie**, komplet w `src/locales/en/translation.json` **i** `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`.
- Paleta kreatora (karta na jasnym tle): tekst `#3a2f1f`, etykiety `#7a5c42`, akcent `#c9975b`, tło inputu `#fff9f0`, ramka `#c4a882`.
- Modyfikator CSS musi stać w pliku **za** regułą bazową o tej samej specyficzności, inaczej jest martwy.
- Backend: `CI=` nic nie znaczy, testy to `go test ./...` z `warhammer-battle-helper-backend/`.
- Frontend: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`. Znany baseline fail: `App.test.js` (axios ESM) — **nie jest regresją**.
- Brak backward compat: szablony bez pola `sharedWith` są poprawne, `omitempty` załatwia migrację. Nie piszemy skryptu migracyjnego.

---

### Task 1: Model udostępnień i predykat widoczności

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go`
- Modify: `warhammer-battle-helper-backend/internal/service/authz.go`
- Test: `warhammer-battle-helper-backend/internal/service/authz_test.go`

**Interfaces:**
- Consumes: nic (pierwsze zadanie).
- Produces: `models.TemplateShare{UserID primitive.ObjectID, Email string}`, pola `SystemTemplate.SharedWith []primitive.ObjectID` i `SystemTemplate.SharedWithUsers []models.TemplateShare`, `models.ShareTemplateRequest{Email string}`, oraz `service.CanUseTemplate(t *models.SystemTemplate, userID primitive.ObjectID) bool`.

- [ ] **Step 1: Dopisz pola do modelu**

W `internal/models/SystemTemplate.go`, w strukturze `SystemTemplate`, bezpośrednio pod polem `IsPublic`:

```go
	// SharedWith lists the users the owner granted read/clone access to, by user id. The email
	// typed in the creator is resolved to an account at share time (an unknown address is
	// rejected), so this never holds an id that points at nobody. Not serialised to JSON: the
	// client has no use for raw ids, and non-owners must not learn who else has access.
	SharedWith []primitive.ObjectID `bson:"sharedWith,omitempty" json:"-"`

	// SharedWithUsers is computed per-request (not persisted), exactly like IsOwner, and filled
	// ONLY for the owner: the recipients' addresses are nobody else's business.
	SharedWithUsers []TemplateShare `bson:"-" json:"sharedWithUsers,omitempty"`
```

Nad definicją `SystemTemplate` (obok innych typów pomocniczych) dodaj:

```go
// TemplateShare is one recipient of a template share, as the creator shows it to the owner:
// the id the server needs to revoke access, plus the address a human recognises.
type TemplateShare struct {
	UserID primitive.ObjectID `json:"userId"`
	Email  string             `json:"email"`
}
```

Na końcu pliku, obok `CloneTemplateRequest`:

```go
// ShareTemplateRequest is the request body for POST /templates/:id/shares.
type ShareTemplateRequest struct {
	Email string `json:"email" binding:"required,email"`
}
```

- [ ] **Step 2: Napisz test predykatu (jeszcze nie istnieje)**

Dopisz na końcu `internal/service/authz_test.go`:

```go
func TestCanUseTemplate(t *testing.T) {
	ownerID := primitive.NewObjectID()
	friendID := primitive.NewObjectID()
	strangerID := primitive.NewObjectID()

	private := &models.SystemTemplate{OwnerID: ownerID}
	if !CanUseTemplate(private, ownerID) {
		t.Error("the owner must always be able to use their own template")
	}
	if CanUseTemplate(private, strangerID) {
		t.Error("a private template must not be usable by anyone else")
	}

	public := &models.SystemTemplate{OwnerID: ownerID, IsPublic: true}
	if !CanUseTemplate(public, strangerID) {
		t.Error("a public template must be usable by anyone")
	}

	shared := &models.SystemTemplate{OwnerID: ownerID, SharedWith: []primitive.ObjectID{friendID}}
	if !CanUseTemplate(shared, friendID) {
		t.Error("a user on the share list must be able to use the template")
	}
	if CanUseTemplate(shared, strangerID) {
		t.Error("sharing with one user must not grant access to another")
	}

	// A nil template means the fetch failed; the caller returns that error, but the predicate
	// must not panic on the way there.
	if CanUseTemplate(nil, ownerID) {
		t.Error("a nil template must never authorise anyone")
	}
}
```

- [ ] **Step 3: Uruchom test — ma nie kompilować się**

```bash
cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestCanUseTemplate
```

Oczekiwane: `undefined: CanUseTemplate`.

- [ ] **Step 4: Dopisz predykat**

Na końcu `internal/service/authz.go` (pakiet potrzebuje importu `"slices"`):

```go
// CanUseTemplate reports whether userID may pick a template as a game system and clone it:
// its owner, anyone while it is public, or a user the owner shared it with by email. A nil
// template (a failed fetch) authorises nobody — the caller returns the fetch error, and this
// must not panic on the way there.
//
// Exported, unlike its neighbours in this file, because the same decision is also made in
// package http when a game is created; the alternative was a fourth hand-written copy of the
// condition. The rule additionally exists as a Mongo query in
// TemplateRepository.ListVisibleToUser — a predicate cannot filter a find(). Change one of the
// two, change the other; nothing checks that they agree.
func CanUseTemplate(t *models.SystemTemplate, userID primitive.ObjectID) bool {
	if t == nil {
		return false
	}
	if t.OwnerID == userID || t.IsPublic {
		return true
	}
	return slices.Contains(t.SharedWith, userID)
}
```

- [ ] **Step 5: Uruchom test — ma przejść**

```bash
cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestCanUseTemplate -v
```

Oczekiwane: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go \
        warhammer-battle-helper-backend/internal/service/authz.go \
        warhammer-battle-helper-backend/internal/service/authz_test.go
git commit -m "feat: PLAYRPG-223 template share list and visibility predicate"
```

---

### Task 2: Warstwa repozytorium

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateRepository.go`
- Modify: `warhammer-battle-helper-backend/internal/repository/UserRepository.go`
- Test: `warhammer-battle-helper-backend/internal/repository/TemplateRepository_test.go` (nowy)

**Interfaces:**
- Consumes: pole `sharedWith` z Task 1.
- Produces: `(*TemplateRepository).AddShare(id string, ownerID, targetID primitive.ObjectID) error`, `(*TemplateRepository).RemoveShare(id string, ownerID, targetID primitive.ObjectID) error`, `(*UserRepository).FindByEmailCI(email string) (*models.User, error)`.

- [ ] **Step 1: Napisz testy repozytorium (plik nowy)**

Utwórz `internal/repository/TemplateRepository_test.go`. Wzorzec z `UserRepository_test.go`: `mtest` z klientem mockowym sprawdza, **jakie polecenie poszło do bazy**, a nie co by z nim zrobiło prawdziwe Mongo.

```go
package repository

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestTemplateRepository_AddShare(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("adds the target to sharedWith with the owner in the filter", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}})

		ownerID := primitive.NewObjectID()
		targetID := primitive.NewObjectID()
		id := primitive.NewObjectID()

		if err := repo.AddShare(id.Hex(), ownerID, targetID); err != nil {
			t.Fatalf("AddShare() returned unexpected error: %v", err)
		}

		// The owner check IS the filter — there is no separate read before the write, so there
		// is no window in which ownership could change between the two.
		cmd := mt.GetStartedEvent().Command
		updates := cmd.Lookup("updates").Array()
		first := updates.Index(0).Value().Document()
		if first.Lookup("q").Document().Lookup("ownerId").ObjectID() != ownerID {
			t.Error("the update must be filtered by ownerId")
		}
		if _, err := first.Lookup("u").Document().LookupErr("$addToSet"); err != nil {
			t.Error("a repeated share must be a no-op, which means $addToSet, not $push")
		}
	})

	mt.Run("reports not found when nothing matched", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}, {Key: "nModified", Value: 0}})

		err := repo.AddShare(primitive.NewObjectID().Hex(), primitive.NewObjectID(), primitive.NewObjectID())
		if err == nil {
			t.Error("a template that is missing or owned by somebody else must be an error")
		}
	})
}

func TestTemplateRepository_RemoveShare(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("pulls the target out of sharedWith", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}})

		ownerID := primitive.NewObjectID()
		if err := repo.RemoveShare(primitive.NewObjectID().Hex(), ownerID, primitive.NewObjectID()); err != nil {
			t.Fatalf("RemoveShare() returned unexpected error: %v", err)
		}

		cmd := mt.GetStartedEvent().Command
		first := cmd.Lookup("updates").Array().Index(0).Value().Document()
		if first.Lookup("q").Document().Lookup("ownerId").ObjectID() != ownerID {
			t.Error("the update must be filtered by ownerId")
		}
		if _, err := first.Lookup("u").Document().LookupErr("$pull"); err != nil {
			t.Error("revoking access must use $pull")
		}
	})
}
```

- [ ] **Step 2: Uruchom testy — mają nie kompilować się**

```bash
cd warhammer-battle-helper-backend && go test ./internal/repository/ -run TestTemplateRepository
```

Oczekiwane: `repo.AddShare undefined`.

- [ ] **Step 3: Dopisz metody repozytorium szablonów**

W `internal/repository/TemplateRepository.go`, pod metodą `Update`:

```go
// AddShare grants targetID read/clone access to a template ownerID owns. The ownership check IS
// the filter rather than a read before the write: authorisation and update are then one
// operation, with no window between them. $addToSet makes a repeated share a silent no-op
// without first reading the document.
func (r *TemplateRepository) AddShare(id string, ownerID, targetID primitive.ObjectID) error {
	return r.updateShares(id, ownerID, bson.M{"$addToSet": bson.M{"sharedWith": targetID}})
}

// RemoveShare revokes targetID's access. Pulling an id that is not there matches the document
// and changes nothing, so a double revoke is not an error — the caller gets the list as it is.
func (r *TemplateRepository) RemoveShare(id string, ownerID, targetID primitive.ObjectID) error {
	return r.updateShares(id, ownerID, bson.M{"$pull": bson.M{"sharedWith": targetID}})
}

// updateShares applies one share mutation and stamps updatedAt. Version is deliberately NOT
// incremented: it tracks the sheet the players see, and who may open a template changes nothing
// about its content.
func (r *TemplateRepository) updateShares(id string, ownerID primitive.ObjectID, mutation bson.M) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid template id: %w", err)
	}

	mutation["$set"] = bson.M{"updatedAt": time.Now()}
	res, err := r.collection.UpdateOne(ctx, bson.M{"_id": objID, "ownerId": ownerID}, mutation)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("template not found or not owned by user")
	}
	return nil
}
```

- [ ] **Step 4: Dopisz trzecią gałąź widoczności**

W tym samym pliku, w `ListVisibleToUser`, podmień filtr:

```go
	filter := bson.M{
		"$or": bson.A{
			bson.M{"ownerId": ownerID},
			bson.M{"isPublic": true},
			// Mongo compares an array field against a scalar element-wise, so this reads
			// "ownerID is one of the shared-with ids", not "the array equals [ownerID]".
			// This is the query half of service.CanUseTemplate — keep the two in step.
			bson.M{"sharedWith": ownerID},
		},
		"baseSystem": bson.M{"$in": bson.A{"", nil}},
	}
```

Zaktualizuj komentarz nad metodą — pierwsze zdanie ma brzmieć:

```go
// ListVisibleToUser returns templates the user may use when creating a game: their own, every
// public one, and every one whose owner shared it with them by email — newest first.
```

- [ ] **Step 5: Dopisz wyszukiwanie użytkownika bez względu na wielkość liter**

W `internal/repository/UserRepository.go`, zaraz pod `FindByEmail` (plik importuje już `options`; jeśli nie, dodaj `"go.mongodb.org/mongo-driver/mongo/options"`):

```go
// FindByEmailCI looks a user up by email ignoring letter case. Registration stores the address
// exactly as typed (AuthHandler writes req.Email verbatim) and FindByEmail is an exact match, so
// a lowercased needle would miss an account registered as "Jan@Example.com". Collation strength 2
// compares base letters and accents but not case. Sign-up and sign-in keep using FindByEmail:
// normalising those is a separate change with a much larger blast radius.
func (r *UserRepository) FindByEmailCI(email string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var user models.User
	opts := options.FindOne().SetCollation(&options.Collation{Locale: "en", Strength: 2})
	if err := r.Collection.FindOne(ctx, bson.M{"email": email}, opts).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}
```

- [ ] **Step 6: Uruchom testy repozytoriów — mają przejść**

```bash
cd warhammer-battle-helper-backend && go test ./internal/repository/ -v -run "TestTemplateRepository|TestUserRepository"
```

Oczekiwane: wszystkie `PASS` (stare testy `UserRepository` też).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-backend/internal/repository/
git commit -m "feat: PLAYRPG-223 share mutations and case-insensitive email lookup"
```

---

### Task 3: Warstwa serwisu

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:105`

**Interfaces:**
- Consumes: `repo.AddShare` / `repo.RemoveShare` / `userRepo.FindByEmailCI` (Task 2), `CanUseTemplate` i `models.TemplateShare` (Task 1), istniejące `userRepo.FindByIDs(ids []primitive.ObjectID) ([]models.User, error)`.
- Produces: `NewTemplateService(repo *repository.TemplateRepository, userRepo *repository.UserRepository) *TemplateService`, `(*TemplateService).AddShare(id string, ownerID primitive.ObjectID, email string) ([]models.TemplateShare, error)`, `(*TemplateService).RemoveShare(id string, ownerID, targetID primitive.ObjectID) ([]models.TemplateShare, error)`.

Zadanie bez testów jednostkowych — i to jest świadome. `TemplateService` trzyma typy konkretne repozytoriów, nie interfejsy, więc nic tutaj nie da się wywołać bez bazy. To ta sama granica, którą opisuje komentarz na górze `authz.go`: decyzje warte testu mieszkają w predykacie, a ten jest już pokryty w Task 1. Weryfikacją jest kompilacja plus ścieżka ręczna z Task 7.

- [ ] **Step 1: Wstrzyknij repozytorium użytkowników**

W `internal/service/TemplateService.go` podmień strukturę i konstruktor (plik potrzebuje importu `"strings"`):

```go
type TemplateService struct {
	repo     *repository.TemplateRepository
	userRepo *repository.UserRepository
}

func NewTemplateService(repo *repository.TemplateRepository, userRepo *repository.UserRepository) *TemplateService {
	return &TemplateService{repo: repo, userRepo: userRepo}
}
```

- [ ] **Step 2: Dopisz rozwiązywanie adresów**

W tym samym pliku, pod konstruktorem:

```go
// attachShares fills SharedWithUsers on every template viewerID owns, resolving all their
// recipient ids in ONE FindByIDs across the whole batch — a query per template would turn a
// lobby load into N+1. Templates the viewer does not own are left untouched: who else may use
// somebody's template is the owner's business alone.
//
// An id that resolves to no account is skipped rather than reported. Accounts are not deleted
// anywhere in this codebase today, so this is defence against a hand-edited document, not an
// expected state — and a share list that hides one dead row is better than a creator that
// cannot open.
func (s *TemplateService) attachShares(templates []*models.SystemTemplate, viewerID primitive.ObjectID) error {
	var ids []primitive.ObjectID
	seen := make(map[primitive.ObjectID]bool)
	for _, t := range templates {
		if t.OwnerID != viewerID {
			continue
		}
		for _, id := range t.SharedWith {
			if !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}

	users, err := s.userRepo.FindByIDs(ids)
	if err != nil {
		return err
	}
	emails := make(map[primitive.ObjectID]string, len(users))
	for _, u := range users {
		emails[u.ID] = u.Email
	}

	for _, t := range templates {
		if t.OwnerID != viewerID || len(t.SharedWith) == 0 {
			continue
		}
		shares := make([]models.TemplateShare, 0, len(t.SharedWith))
		for _, id := range t.SharedWith {
			if email, ok := emails[id]; ok {
				shares = append(shares, models.TemplateShare{UserID: id, Email: email})
			}
		}
		t.SharedWithUsers = shares
	}
	return nil
}

// listShares re-reads the template and resolves its recipients, so every share endpoint answers
// with the list as actually stored rather than one the handler assembled optimistically.
// It returns an empty (non-nil) slice for a template shared with nobody, so the client always
// receives [] and never null.
func (s *TemplateService) listShares(id string, ownerID primitive.ObjectID) ([]models.TemplateShare, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	if t.OwnerID != ownerID {
		return nil, fmt.Errorf("not authorized")
	}
	if err := s.attachShares([]*models.SystemTemplate{t}, ownerID); err != nil {
		return nil, err
	}
	if t.SharedWithUsers == nil {
		return []models.TemplateShare{}, nil
	}
	return t.SharedWithUsers, nil
}
```

- [ ] **Step 3: Dopisz operacje udostępniania**

Pod `listShares`:

```go
// AddShare grants the account behind email read/clone access to a template the caller owns and
// returns the resulting recipient list. The address is resolved here, and a miss is a loud
// error: that is what keeps SharedWith free of ids pointing at nobody, and what makes a typo
// visible to the owner instead of silently granting access to no one.
func (s *TemplateService) AddShare(id string, ownerID primitive.ObjectID, email string) ([]models.TemplateShare, error) {
	target, err := s.userRepo.FindByEmailCI(strings.TrimSpace(email))
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}
	if target.ID == ownerID {
		return nil, fmt.Errorf("cannot share with yourself")
	}
	if err := s.repo.AddShare(id, ownerID, target.ID); err != nil {
		return nil, err
	}
	return s.listShares(id, ownerID)
}

// RemoveShare revokes one recipient's access and returns the remaining list. It takes a user id,
// not an email: the client already has the id from the list it is showing, so there is nothing
// to resolve and nothing to get wrong.
func (s *TemplateService) RemoveShare(id string, ownerID, targetID primitive.ObjectID) ([]models.TemplateShare, error) {
	if err := s.repo.RemoveShare(id, ownerID, targetID); err != nil {
		return nil, err
	}
	return s.listShares(id, ownerID)
}
```

- [ ] **Step 4: Dołącz listę do odczytów**

Podmień `ListForUser` na:

```go
func (s *TemplateService) ListForUser(ownerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	templates, err := s.repo.ListVisibleToUser(ownerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	refs := make([]*models.SystemTemplate, len(templates))
	for i := range templates {
		templates[i].IsOwner = templates[i].OwnerID == ownerID
		refs[i] = &templates[i]
	}
	if err := s.attachShares(refs, ownerID); err != nil {
		return nil, fmt.Errorf("failed to resolve template shares: %w", err)
	}
	return templates, nil
}
```

Podmień ogon `Update` (wszystko od `if err := s.repo.Update(...)`) na:

```go
	if err := s.repo.Update(id, req.Name, req.Sections, req.Settings, req.IsPublic); err != nil {
		return nil, err
	}
	updated, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	// The creator replaces its whole template object with this response, so anything computed
	// per-request has to be recomputed here. Without SharedWithUsers the debounced save would
	// blank the share list in the UI without touching the database; without IsOwner the manager
	// row would lose its edit and delete buttons until the next refetch.
	updated.IsOwner = updated.OwnerID == ownerID
	if err := s.attachShares([]*models.SystemTemplate{updated}, ownerID); err != nil {
		return nil, err
	}
	return updated, nil
```

- [ ] **Step 5: Przepnij `Clone` na wspólny predykat**

W `Clone` podmień blok strażnika:

```go
	// Visibility guard: GetByID does not filter by visibility, so block cloning a template the
	// requester may not use. One predicate, the same one the game-creation path uses.
	if !CanUseTemplate(src, ownerID) {
		return nil, fmt.Errorf("not authorized")
	}
```

- [ ] **Step 6: Popraw wywołanie konstruktora**

W `cmd/warhammer-battle-helper/main.go:105`:

```go
	templateService := service.NewTemplateService(templateRepo, userRepo)
```

`userRepo` powstaje trzy linie wyżej (`main.go:102`), więc kolejność jest już dobra.

- [ ] **Step 7: Zbuduj i uruchom cały backend**

```bash
cd warhammer-battle-helper-backend && go build ./... && go vet ./... && go test ./...
```

Oczekiwane: build bez błędów, `go vet` cicho, wszystkie testy `PASS`/`no test files`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/TemplateService.go \
        warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat: PLAYRPG-223 resolve share recipients in the template service"
```

---

### Task 4: Endpointy HTTP

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/TemplateHandler.go`
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:195-201`

**Interfaces:**
- Consumes: `TemplateService.AddShare` / `RemoveShare` (Task 3), `models.ShareTemplateRequest` (Task 1).
- Produces: `POST /templates/:id/shares` i `DELETE /templates/:id/shares/:userId`, oba odpowiadają `200` z tablicą `[{userId, email}]`.

- [ ] **Step 1: Dopisz handlery**

W `internal/http/TemplateHandler.go`, pod `CloneTemplate`:

```go
// ShareTemplate grants another user, named by email, the right to use and clone the caller's
// template. It answers with the full recipient list rather than the added entry, so the client
// never has to merge a partial response into state it is already showing.
func (h *TemplateHandler) ShareTemplate(c *gin.Context) {
	var req models.ShareTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := mustUserID(c)
	shares, err := h.TemplateService.AddShare(c.Param("id"), userID, req.Email)
	if err != nil {
		writeShareError(c, err)
		return
	}
	c.JSON(http.StatusOK, shares)
}

// UnshareTemplate revokes one user's access and answers with the remaining list.
func (h *TemplateHandler) UnshareTemplate(c *gin.Context) {
	targetID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	userID := mustUserID(c)
	shares, err := h.TemplateService.RemoveShare(c.Param("id"), userID, targetID)
	if err != nil {
		writeShareError(c, err)
		return
	}
	c.JSON(http.StatusOK, shares)
}

// writeShareError maps the service's sentinel messages onto status codes. Sharing is the only
// place where "this address matches no account" is a normal, user-facing outcome, so the client
// must be able to tell it apart from a missing template — hence a distinct message rather than a
// bare 404. A template that exists but belongs to somebody else also answers 404, not 403: the
// owner id sits inside the update filter, so the two cases are indistinguishable here, and
// leaking "this template exists" to a non-owner buys nothing.
func writeShareError(c *gin.Context, err error) {
	switch err.Error() {
	case "not authorized":
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized"})
	case "cannot share with yourself":
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot share with yourself"})
	case "user not found":
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
	default:
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	}
}
```

- [ ] **Step 2: Zarejestruj trasy**

W `cmd/warhammer-battle-helper/main.go`, w bloku „System templates (custom creator)", pod linią z `clone`:

```go
	auth.POST("/templates/:id/shares", templateHandler.ShareTemplate)
	auth.DELETE("/templates/:id/shares/:userId", templateHandler.UnshareTemplate)
```

- [ ] **Step 3: Zbuduj i sprawdź, że router wstaje**

```bash
cd warhammer-battle-helper-backend && go build ./... && go vet ./...
```

Oczekiwane: cicho. Gin wywala panic o konflikcie tras dopiero w czasie startu — jeśli nazwa parametru rozjedzie się z `:id` z sąsiednich tras, zobaczysz to w Task 7 przy podnoszeniu kontenera.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/TemplateHandler.go \
        warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat: PLAYRPG-223 share and unshare endpoints"
```

---

### Task 5: Autoryzacja przy tworzeniu gry

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go:69-98`

**Interfaces:**
- Consumes: `service.CanUseTemplate` (Task 1).
- Produces: nic nowego — zamyka istniejącą dziurę i ujednolica drugą gałąź.

- [ ] **Step 1: Dołóż strażnika do gałęzi `custom`**

W `CreateGame`, w bloku `if req.GameSystem == "custom"`, pod pobraniem szablonu:

```go
		t, err := h.TemplateService.Get(req.CustomTemplateID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		// Until PLAYRPG-223 this branch checked nothing: any template id, including somebody
		// else's private one, was accepted here.
		if !service.CanUseTemplate(t, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to use this template"})
			return
		}
		template = t
```

- [ ] **Step 2: Przepnij gałąź wariantu tokenowego na ten sam predykat**

W gałęzi `else if req.CustomTemplateID != ""` podmień ręczny warunek:

```go
		if !service.CanUseTemplate(t, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to use this template"})
			return
		}
```

Sprawdzenie `t.BaseSystem != req.GameSystem` zostaje bez zmian, nad tym warunkiem — to inne pytanie (czy szablon pasuje do systemu), nie pytanie o dostęp.

- [ ] **Step 3: Zbuduj i uruchom testy**

```bash
cd warhammer-battle-helper-backend && go build ./... && go test ./...
```

Oczekiwane: `PASS`. Jeśli `service` nie jest jeszcze zaimportowany w `GameHandler.go`, dodaj `"battle-helper/internal/service"` do importów — plik i tak trzyma `*service.GameService`, więc import już tam jest.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/GameHandler.go
git commit -m "fix: PLAYRPG-223 check template visibility when creating a game"
```

---

### Task 6: Kreator — sekcja udostępnień

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (stan ok. 1341, karta widoczności ok. 1828)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json` (gałąź `creator.general`)
- Modify: `warhammer-battle-helper-front/src/style.css` (po regule `.creator__settings-card-body`, ok. linia 10698)
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.sharing.test.jsx` (nowy)

**Interfaces:**
- Consumes: `sharedWithUsers` na obiekcie szablonu oraz oba endpointy z Task 4.
- Produces: nic dla innych zadań.

Lobby zostaje **nietknięte**: `CreateGameDialog` grupuje przez `!tpl.isOwner`, więc udostępnione szablony wpadają do „Szablony społeczności" same, a `TemplateManagerDialog` już pokazuje klonowanie każdemu i edycję tylko właścicielowi.

- [ ] **Step 1: Dopisz klucze i18n (angielskie)**

W `src/locales/en/translation.json`, w obiekcie `creator.general`, po `"privateDesc"`:

```json
    "shareTitle": "Share with specific people",
    "shareHint": "They can use and clone this template, but never edit it.",
    "shareEmailLabel": "Email address",
    "shareButton": "Share",
    "shareEmpty": "Not shared with anyone yet.",
    "shareRemove": "Revoke access",
    "shareErrorNotFound": "No account uses this address.",
    "shareErrorSelf": "That is your own address.",
    "shareErrorFailed": "Could not share the template.",
    "sharePublicNote": "This template is public, so everyone can already use it. The list below starts mattering again the moment you switch it back to private.",
```

- [ ] **Step 2: Dopisz polskie odpowiedniki**

W `src/locales/pl/translation.json`, w tej samej gałęzi i tej samej kolejności:

```json
    "shareTitle": "Udostępnij konkretnym osobom",
    "shareHint": "Mogą używać i klonować ten szablon, ale nigdy go nie edytują.",
    "shareEmailLabel": "Adres email",
    "shareButton": "Udostępnij",
    "shareEmpty": "Nikomu jeszcze nie udostępniono.",
    "shareRemove": "Odbierz dostęp",
    "shareErrorNotFound": "Żadne konto nie używa tego adresu.",
    "shareErrorSelf": "To Twój własny adres.",
    "shareErrorFailed": "Nie udało się udostępnić szablonu.",
    "sharePublicNote": "Ten szablon jest publiczny, więc i tak mogą go używać wszyscy. Lista poniżej zacznie mieć znaczenie, gdy przełączysz go z powrotem na prywatny.",
```

- [ ] **Step 3: Napisz test (jeszcze nie przechodzi)**

Utwórz `src/components/creator/TemplateBuilder.sharing.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

// TemplateBuilder pulls in api/axios AND, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to mount the creator.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const base = { id: 't1', name: 'T', sections: [], settings: { diceButtons: [] } };
const mount = (template) => render(
  <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);

const respond = (status, body) => Promise.resolve({
  ok: status < 400, status, json: () => Promise.resolve(body),
});

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.resetAllMocks(); });

test('sharing posts the typed address and shows the list the server returns', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [{ userId: 'u9', email: 'kolega@example.com' }]));
  mount(base);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'kolega@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText('kolega@example.com')).toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/shares$/);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ email: 'kolega@example.com' });
});

test('an address with no account leaves the list alone and says so', async () => {
  global.fetch.mockReturnValueOnce(respond(404, { error: 'user not found' }));
  mount({ ...base, sharedWithUsers: [{ userId: 'u9', email: 'kolega@example.com' }] });

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'nikt@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText('No account uses this address.')).toBeInTheDocument());
  expect(screen.getByText('kolega@example.com')).toBeInTheDocument();
  // The typed address survives the failure — retyping an email to fix one character is rude.
  expect(screen.getByLabelText('Email address')).toHaveValue('nikt@example.com');
});

test('revoking sends the recipient id and adopts the shortened list', async () => {
  global.fetch.mockReturnValueOnce(respond(200, []));
  mount({ ...base, sharedWithUsers: [{ userId: 'u9', email: 'kolega@example.com' }] });

  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

  await waitFor(() => expect(screen.queryByText('kolega@example.com')).not.toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/shares\/u9$/);
  expect(init.method).toBe('DELETE');
});

test('a named variant of a built-in system has no sharing section', () => {
  mount({ ...base, baseSystem: 'warhammer4e' });
  expect(screen.queryByText('Share with specific people')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Uruchom test — ma paść**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder.sharing
```

Oczekiwane: FAIL, `Unable to find a label with the text of: Email address`.

- [ ] **Step 5: Dodaj stan i akcje do `TemplateBuilder`**

W `TemplateBuilder.jsx`, pod `const [isPublic, setIsPublic] = useState(...)` (ok. 1341):

```jsx
  const [shares,     setShares]     = useState(template?.sharedWithUsers || []);
  const [shareEmail, setShareEmail] = useState('');
  const [shareError, setShareError] = useState(null);
  const [sharing,    setSharing]    = useState(false);
```

W efekcie resetującym stan przy zmianie szablonu (ten, który woła `setIsPublic(template?.isPublic || false)`, ok. 1463) dopisz obok:

```jsx
    setShares(template?.sharedWithUsers || []);
    setShareEmail('');
    setShareError(null);
```

Pod `setPublicAndSave` (ok. 1610):

```jsx
  // Sharing is deliberately NOT optimistic, unlike the rest of the creator: the address is
  // resolved to an account on the server, so the client cannot know the outcome in advance.
  // Both endpoints answer with the whole recipient list, so state is never assembled here.
  const handleShare = async () => {
    const email = shareEmail.trim();
    if (!email || sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      const res = await fetch(`${getApiUrl()}/templates/${template.id}/shares`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ email }),
      });
      if (res.status === 404) { setShareError(t('creator.general.shareErrorNotFound')); return; }
      if (res.status === 400) { setShareError(t('creator.general.shareErrorSelf')); return; }
      if (!res.ok) { setShareError(t('creator.general.shareErrorFailed')); return; }
      setShares(await res.json());
      setShareEmail('');
    } catch {
      setShareError(t('creator.general.shareErrorFailed'));
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async (userId) => {
    try {
      const res = await fetch(`${getApiUrl()}/templates/${template.id}/shares/${userId}`, {
        method: 'DELETE',
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` }),
      });
      if (!res.ok) return;
      setShares(await res.json());
    } catch { /* non-critical: the list keeps showing what the server last described */ }
  };
```

- [ ] **Step 6: Dodaj sekcję do karty widoczności**

W zakładce Ogólne, wewnątrz `<div className="creator__settings-card-body">` karty widoczności (ok. 1834–1852), pod `<Typography>` z `publicDesc`/`privateDesc`:

```jsx
                <div className="creator__share">
                  <div className="creator__share-title">{t('creator.general.shareTitle')}</div>
                  <div className="creator__share-hint">{t('creator.general.shareHint')}</div>
                  {isPublic && (
                    <div className="creator__share-note">{t('creator.general.sharePublicNote')}</div>
                  )}
                  <div className="creator__share-row">
                    <TextField
                      size="small"
                      type="email"
                      label={t('creator.general.shareEmailLabel')}
                      value={shareEmail}
                      error={Boolean(shareError)}
                      helperText={shareError || ' '}
                      disabled={sharing}
                      onChange={e => { setShareEmail(e.target.value); setShareError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleShare(); }}
                      sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: 'Crimson Text, serif' },
                            '& .MuiInputLabel-root': { fontFamily: 'Crimson Text, serif' } }}
                    />
                    <Button
                      variant="contained"
                      startIcon={<ShareIcon />}
                      disabled={sharing || !shareEmail.trim()}
                      onClick={handleShare}
                      sx={{ fontFamily: 'Crimson Text, serif', fontWeight: 600, flexShrink: 0, height: 40 }}
                    >
                      {t('creator.general.shareButton')}
                    </Button>
                  </div>
                  {shares.length === 0 ? (
                    <div className="creator__share-empty">{t('creator.general.shareEmpty')}</div>
                  ) : (
                    <ul className="creator__share-list">
                      {shares.map(share => (
                        <li key={share.userId} className="creator__share-item">
                          <PersonIcon sx={{ fontSize: 18, color: '#c9975b' }} />
                          <span className="creator__share-email">{share.email}</span>
                          <IconButton
                            size="small"
                            aria-label={t('creator.general.shareRemove')}
                            onClick={() => handleUnshare(share.userId)}
                            sx={{ color: '#a04040' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
```

Dopisz brakujące importy ikon na górze pliku (reszta — `TextField`, `Button`, `IconButton`, `DeleteIcon` — już jest):

```jsx
import ShareIcon from '@mui/icons-material/Share';
import PersonIcon from '@mui/icons-material/Person';
```

Kosz celowo **nie** dostaje tooltipa. `TemplateBuilder` prowadzi własny `paletteTooltip` przez `createPortal`, a wstawianie drugiego systemu tooltipów dla jednej ikony kosztuje więcej niż daje; `aria-label` niesie tę samą informację dla czytnika ekranu i dla testu.

- [ ] **Step 7: Dodaj style**

W `src/style.css`, zaraz za regułą `.creator__settings-card-body` (ok. linia 10698):

```css
/* ── Share list inside the visibility card ───────────────────────────── */

.creator__share {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(201, 151, 91, 0.4);
}

.creator__share-title {
    font-family: 'Crimson Text', serif;
    font-weight: 600;
    font-size: 0.95rem;
    color: #3a2f1f;
}

.creator__share-hint,
.creator__share-empty,
.creator__share-note {
    font-family: 'Crimson Text', serif;
    font-size: 0.85rem;
    color: #7a5c42;
}

.creator__share-note {
    margin-top: 6px;
    font-style: italic;
}

.creator__share-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 10px;
    max-width: 480px;
}

.creator__share-list {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    max-width: 480px;
}

.creator__share-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid #c4a882;
    border-radius: 6px;
    background: #fff9f0;
    margin-bottom: 6px;
}

.creator__share-email {
    flex: 1;
    font-family: 'Crimson Text', serif;
    font-size: 0.9rem;
    color: #3a2f1f;
    overflow-wrap: anywhere;
}
```

- [ ] **Step 8: Uruchom test — ma przejść**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder
```

Oczekiwane: wszystkie pliki `TemplateBuilder.*` na zielono, łącznie ze starymi (`sheetWidth`, `skillFlags`, `dragDrop`, `chromeWiring`, `weaponColumns`).

Uwaga na `sheetWidth`: jego test zakłada, że zakładka Ogólne ma **dokładnie jeden** `role="slider"`. Ta zmiana nie dodaje suwaka, więc ma dalej przechodzić — jeśli padnie na „found multiple", coś poszło nie tak z umiejscowieniem sekcji.

- [ ] **Step 9: Sprawdź spójność tłumaczeń**

```bash
cd warhammer-battle-helper-front && python3 -c "
import json
en = json.load(open('src/locales/en/translation.json'))['creator']['general']
pl = json.load(open('src/locales/pl/translation.json'))['creator']['general']
print('tylko en:', sorted(set(en) - set(pl)))
print('tylko pl:', sorted(set(pl) - set(en)))
"
```

Oczekiwane: obie listy puste.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/components/creator/TemplateBuilder.sharing.test.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat: PLAYRPG-223 share a custom template by email from the creator"
```

---

### Task 7: Weryfikacja end-to-end na lokalnym dockerze

**Files:** żadnych — to zadanie nic nie zmienia w kodzie. Jeśli coś tu padnie, poprawka wraca do zadania, które ją wprowadziło.

**Interfaces:**
- Consumes: całość z zadań 1–6.
- Produces: dowód, że ścieżka działa w aplikacji, a nie tylko w testach.

Żaden test w tym planie nie przechodzi przez prawdziwe Mongo: `mtest` sprawdza kształt polecenia, a testy frontu mają zamockowany `fetch`. Collation, trzecia gałąź `$or` i składanie listy po stronie serwera są weryfikowane **wyłącznie** tutaj.

- [ ] **Step 1: Podnieś stos i przygotuj dwa konta**

Potrzebne są dwa aktywne konta. Token zdobywasz wg przepisu z pamięci projektu (wyczyść `activationToken`, ustaw `active`).

- [ ] **Step 2: Przejdź ścieżkę właściciela**

Jako konto A: kreator szablonów → otwórz szablon → zakładka Ogólne → sekcja Widoczność.
1. Wpisz adres bez konta → komunikat „Żadne konto nie używa tego adresu", lista bez zmian, wpisany tekst zostaje.
2. Wpisz własny adres → „To Twój własny adres".
3. Wpisz adres konta B **inną wielkością liter** niż przy rejestracji → wiersz pojawia się na liście. To jedyny sprawdzian collation.
4. Wpisz adres konta B drugi raz → lista bez duplikatu, bez błędu.
5. Zamknij i otwórz kreator ponownie → lista nadal tam jest (dowód, że `GET /templates` niesie `sharedWithUsers`).
6. Zmień coś w szablonie i poczekaj na autozapis (ikona klepsydry → „zapisano") → lista **nie znika**. To sprawdzian, że `Update` dokłada `SharedWithUsers`.

- [ ] **Step 3: Przejdź ścieżkę odbiorcy**

Jako konto B:
1. Tworzenie gry → lista systemów → szablon widoczny w grupie „Szablony społeczności".
2. Utwórz na nim grę → wstaje, karta postaci ma pola z szablonu.
3. Kreator szablonów → szablon na liście, z klonowaniem, **bez** edycji i usuwania.
4. Sklonuj → kopia pojawia się jako własna i prywatna.

- [ ] **Step 4: Sprawdź cofnięcie dostępu**

Konto A usuwa konto B z listy → konto B odświeża lobby → szablon znika z wyboru systemu i z menedżera. Gra utworzona wcześniej **działa dalej** — szablon został do niej skopiowany przy tworzeniu, a odebranie dostępu nie jest wstecznym odebraniem gry.

- [ ] **Step 5: Sprawdź zamkniętą dziurę**

Jako konto B, z `curl` i swoim tokenem, spróbuj utworzyć grę na id **prywatnego, nieudostępnionego** szablonu konta A:

```bash
curl -i -X POST http://localhost:8080/games \
  -H "Authorization: Bearer $TOKEN_B" -H 'Content-Type: application/json' \
  -d '{"name":"hack","gameSystem":"custom","customTemplateId":"<PRYWATNE_ID_KONTA_A>"}'
```

Oczekiwane: `403` z `not authorized to use this template`. Przed tą zmianą: `201`.

- [ ] **Step 6: Pełne zestawy testów na koniec**

```bash
cd warhammer-battle-helper-backend && go test ./...
cd ../warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Oczekiwane: backend w całości zielony; front zielony **poza** `App.test.js` (axios ESM — znany baseline, nie regresja).

- [ ] **Step 7: Commit (jeśli cokolwiek poprawiałeś)**

```bash
git add -A && git commit -m "fix: PLAYRPG-223 issues found in manual verification"
```
