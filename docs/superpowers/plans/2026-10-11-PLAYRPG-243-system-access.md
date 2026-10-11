# PLAYRPG-243 System Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin decides in a new "Systems" admin-panel tab which users may create games in each hardcoded system (all users or a picked list); the setting lives in MongoDB and replaces `feature-toggles.json`.

**Architecture:** New `system_access` collection (one doc per system, `_id` = system key) behind `SystemAccessService`, which owns the fail-closed `allowed` rule and admin-row shaping. `GameHandler` gates `POST /games` and serves `GET /features` from it; `AdminHandler` exposes `/admin/systems`. The game frontend fetches `/features` each time the create dialog opens; the react-admin panel gets a `systems` resource.

**Tech Stack:** Go 1.24 + Gin + mongo-driver (backend), React 18 + MUI + Jest/RTL via CRA (frontend), react-admin 5.14 (admin panel).

**Spec:** `docs/superpowers/specs/PLAYRPG-243.md`

## Global Constraints

- Gated systems = `registry.ListSystems()` minus `custom` (`warhammer4e`, `coc7e`, `coc7e_dark_ages`, `dnd5e`). `custom` is always allowed for everyone.
- Fail-closed: no document for a system → nobody may create games in it. No seed.
- Users identified by `userId` (ObjectID), never email.
- Only game **creation** is gated. Game listing, joining, `GET /games/:id`, WebSocket, `EnsureTokenConfig` stay untouched.
- Code comments always in English.
- Game frontend: no new i18n keys. Admin panel: English labels inline (it has no i18n).
- Backend tests: `cd warhammer-battle-helper-backend && go test ./internal/...`
- Frontend tests: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Known baseline fail: `App.test.js` (axios ESM) — not a regression.
- Admin panel has no test setup — verified manually.
- Work on `main`, no worktree. Do not stage `warhammer-battle-helper-front/nginx.conf` or `warhammer-battle-helper-front/package-lock.json` (unrelated local changes).

## File Map

| File | Change |
|---|---|
| `warhammer-battle-helper-backend/internal/systems/registry/registry.go` | + `HardcodedSystems()` |
| `warhammer-battle-helper-backend/internal/systems/registry/hardcoded_test.go` | new |
| `warhammer-battle-helper-backend/internal/models/SystemAccess.go` | new model |
| `warhammer-battle-helper-backend/internal/service/SystemAccessService.go` | new service + store port + admin view |
| `warhammer-battle-helper-backend/internal/service/SystemAccessService_test.go` | new |
| `warhammer-battle-helper-backend/internal/repository/SystemAccessRepository.go` | new |
| `warhammer-battle-helper-backend/internal/config/database.go` | + `SystemAccessCollection` |
| `warhammer-battle-helper-backend/internal/http/GameHandler.go` | gate via service, rewrite `GetFeatures` |
| `warhammer-battle-helper-backend/internal/http/AdminHandler.go` | + systems endpoints, `DeleteUser` pulls user |
| `warhammer-battle-helper-backend/internal/http/AdminHandler_systems_test.go` | new |
| `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go` | wiring, routes, drop toggles |
| `warhammer-battle-helper-backend/internal/features/toggle.go` | delete |
| `warhammer-battle-helper-backend/feature-toggles.json` | delete |
| `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx` | own `/features` fetch |
| `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx` | async render + new cases |
| `warhammer-battle-helper-front/src/components/GameLobby.jsx` | drop `allowedSystems` prop |
| `warhammer-battle-helper-front/src/App.js` | drop `allowedSystems` state + fetches |
| `warhammer-battle-helper-admin/src/dataProvider.js` | `systems` resource + client-side filter |
| `warhammer-battle-helper-admin/src/users/UserList.jsx` | search input source `q` |
| `warhammer-battle-helper-admin/src/systems/SystemList.jsx` | new |
| `warhammer-battle-helper-admin/src/systems/SystemEdit.jsx` | new |
| `warhammer-battle-helper-admin/src/AdminApp.jsx` | + `systems` resource |

---

### Task 1: `registry.HardcodedSystems`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/registry/registry.go` (after `ListSystems`)
- Test: `warhammer-battle-helper-backend/internal/systems/registry/hardcoded_test.go`

**Interfaces:**
- Produces: `func HardcodedSystems() []string` — `ListSystems()` order, without `"custom"`.

- [ ] **Step 1: Write the failing test**

```go
package registry

import (
	"slices"
	"testing"
)

// HardcodedSystems is the set an admin configures access for; custom must never be in it,
// or the access gate would start hiding user-authored templates.
func TestHardcodedSystemsExcludesCustom(t *testing.T) {
	got := HardcodedSystems()
	if slices.Contains(got, "custom") {
		t.Fatalf("HardcodedSystems() contains custom: %v", got)
	}
	var want []string
	for _, s := range ListSystems() {
		if s != "custom" {
			want = append(want, s)
		}
	}
	if !slices.Equal(got, want) {
		t.Fatalf("HardcodedSystems() = %v, want %v", got, want)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/registry/ -run TestHardcodedSystems`
Expected: FAIL — `undefined: HardcodedSystems`

- [ ] **Step 3: Implement**

Append to `registry.go`:

```go
// CustomSystem is the key of the user-authored system; it is not a fixed plugin and is never
// subject to admin access configuration.
const CustomSystem = "custom"

// HardcodedSystems returns the built-in Go-plugin systems — every registered system except
// custom — in stable order. These are the systems whose availability the admin configures.
func HardcodedSystems() []string {
	all := ListSystems()
	out := make([]string, 0, len(all))
	for _, k := range all {
		if k != CustomSystem {
			out = append(out, k)
		}
	}
	return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/registry/`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/registry/registry.go warhammer-battle-helper-backend/internal/systems/registry/hardcoded_test.go
git commit -m "feat: PLAYRPG-243 registry lists hardcoded systems"
```

---

### Task 2: Model + `SystemAccessService`

**Files:**
- Create: `warhammer-battle-helper-backend/internal/models/SystemAccess.go`
- Create: `warhammer-battle-helper-backend/internal/service/SystemAccessService.go`
- Test: `warhammer-battle-helper-backend/internal/service/SystemAccessService_test.go`

**Interfaces:**
- Consumes: `registry.HardcodedSystems()`, `registry.CustomSystem` (Task 1)
- Produces:
  - `models.SystemAccess{System string; AllUsers bool; UserIDs []primitive.ObjectID; UpdatedAt time.Time}`
  - `service.NewSystemAccessService(store systemAccessStore) *SystemAccessService` — any type with methods `List(ctx) ([]models.SystemAccess, error)`, `Get(ctx, system string) (*models.SystemAccess, error)`, `Upsert(ctx, system string, allUsers bool, userIDs []primitive.ObjectID) error`, `PullUser(ctx, userID primitive.ObjectID) error`
  - `(*SystemAccessService).IsAllowed(ctx, system string, userID primitive.ObjectID) (bool, error)`
  - `(*SystemAccessService).AllowedSystems(ctx, userID primitive.ObjectID) ([]string, error)`
  - `(*SystemAccessService).AdminList(ctx) ([]SystemAccessView, error)`
  - `(*SystemAccessService).AdminGet(ctx, system string) (*SystemAccessView, error)`
  - `(*SystemAccessService).AdminUpdate(ctx, system string, allUsers bool, userIDs []string) (*SystemAccessView, error)`
  - `(*SystemAccessService).RemoveUser(ctx, userID primitive.ObjectID) error`
  - `service.SystemAccessView{ID string "id"; AllUsers bool "allUsers"; UserIDs []string "userIds"; Configured bool "configured"}`
  - `service.ErrUnknownSystem`, `service.ErrInvalidUserID`

- [ ] **Step 1: Create the model**

`internal/models/SystemAccess.go`:

```go
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SystemAccess says who may create games in one hardcoded system. The system key is the
// document id, so there is at most one document per system. A missing document means
// nobody has access (fail-closed).
type SystemAccess struct {
	System    string               `bson:"_id"`
	AllUsers  bool                 `bson:"allUsers"`
	UserIDs   []primitive.ObjectID `bson:"userIds"`
	UpdatedAt time.Time            `bson:"updatedAt"`
}
```

- [ ] **Step 2: Write the failing tests**

`internal/service/SystemAccessService_test.go`:

```go
package service

import (
	"context"
	"errors"
	"slices"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubAccessStore struct {
	docs     map[string]*models.SystemAccess
	err      error
	calls    int
	upserted *models.SystemAccess
	pulled   primitive.ObjectID
}

func (s *stubAccessStore) List(ctx context.Context) ([]models.SystemAccess, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	out := []models.SystemAccess{}
	for _, d := range s.docs {
		out = append(out, *d)
	}
	return out, nil
}

func (s *stubAccessStore) Get(ctx context.Context, system string) (*models.SystemAccess, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return s.docs[system], nil
}

func (s *stubAccessStore) Upsert(ctx context.Context, system string, allUsers bool, userIDs []primitive.ObjectID) error {
	s.calls++
	s.upserted = &models.SystemAccess{System: system, AllUsers: allUsers, UserIDs: userIDs}
	return s.err
}

func (s *stubAccessStore) PullUser(ctx context.Context, userID primitive.ObjectID) error {
	s.calls++
	s.pulled = userID
	return s.err
}

func TestAllowed(t *testing.T) {
	me := primitive.NewObjectID()
	other := primitive.NewObjectID()
	cases := []struct {
		name string
		doc  *models.SystemAccess
		want bool
	}{
		{"no document is fail-closed", nil, false},
		{"all users", &models.SystemAccess{AllUsers: true}, true},
		{"all users ignores the list", &models.SystemAccess{AllUsers: true, UserIDs: []primitive.ObjectID{other}}, true},
		{"on the list", &models.SystemAccess{UserIDs: []primitive.ObjectID{other, me}}, true},
		{"not on the list", &models.SystemAccess{UserIDs: []primitive.ObjectID{other}}, false},
		{"empty list means nobody", &models.SystemAccess{UserIDs: []primitive.ObjectID{}}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := allowed(tc.doc, me); got != tc.want {
				t.Errorf("allowed = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestIsAllowedCustomSkipsStore(t *testing.T) {
	store := &stubAccessStore{}
	ok, err := NewSystemAccessService(store).IsAllowed(context.Background(), "custom", primitive.NewObjectID())
	if err != nil || !ok {
		t.Fatalf("IsAllowed(custom) = %v, %v; want true, nil", ok, err)
	}
	if store.calls != 0 {
		t.Errorf("store touched %d times for custom", store.calls)
	}
}

func TestIsAllowedReadsDocument(t *testing.T) {
	me := primitive.NewObjectID()
	store := &stubAccessStore{docs: map[string]*models.SystemAccess{
		"dnd5e": {System: "dnd5e", UserIDs: []primitive.ObjectID{me}},
	}}
	svc := NewSystemAccessService(store)
	if ok, _ := svc.IsAllowed(context.Background(), "dnd5e", me); !ok {
		t.Error("listed user denied dnd5e")
	}
	if ok, _ := svc.IsAllowed(context.Background(), "warhammer4e", me); ok {
		t.Error("unconfigured warhammer4e allowed")
	}
}

func TestIsAllowedPropagatesStoreError(t *testing.T) {
	store := &stubAccessStore{err: errors.New("db down")}
	ok, err := NewSystemAccessService(store).IsAllowed(context.Background(), "dnd5e", primitive.NewObjectID())
	if err == nil || ok {
		t.Fatalf("IsAllowed = %v, %v; want false, error", ok, err)
	}
}

func TestAllowedSystems(t *testing.T) {
	me := primitive.NewObjectID()
	store := &stubAccessStore{docs: map[string]*models.SystemAccess{
		"dnd5e":       {System: "dnd5e", UserIDs: []primitive.ObjectID{me}},
		"warhammer4e": {System: "warhammer4e", AllUsers: true},
		"coc7e":       {System: "coc7e", UserIDs: []primitive.ObjectID{primitive.NewObjectID()}},
	}}
	got, err := NewSystemAccessService(store).AllowedSystems(context.Background(), me)
	if err != nil {
		t.Fatal(err)
	}
	// Registry order, custom always last.
	want := []string{"warhammer4e", "dnd5e", "custom"}
	if !slices.Equal(got, want) {
		t.Errorf("AllowedSystems = %v, want %v", got, want)
	}
}

func TestAllowedSystemsEmptyStoreLeavesOnlyCustom(t *testing.T) {
	got, err := NewSystemAccessService(&stubAccessStore{}).AllowedSystems(context.Background(), primitive.NewObjectID())
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got, []string{"custom"}) {
		t.Errorf("AllowedSystems = %v, want [custom]", got)
	}
}

func TestAdminListReturnsEveryHardcodedSystem(t *testing.T) {
	u := primitive.NewObjectID()
	store := &stubAccessStore{docs: map[string]*models.SystemAccess{
		"dnd5e": {System: "dnd5e", UserIDs: []primitive.ObjectID{u}},
	}}
	rows, err := NewSystemAccessService(store).AdminList(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 4 {
		t.Fatalf("got %d rows, want 4: %+v", len(rows), rows)
	}
	for _, r := range rows {
		if r.UserIDs == nil {
			t.Errorf("%s: userIds is nil, must serialize as []", r.ID)
		}
		switch r.ID {
		case "dnd5e":
			if !r.Configured || !slices.Equal(r.UserIDs, []string{u.Hex()}) {
				t.Errorf("dnd5e row = %+v", r)
			}
		case "custom":
			t.Error("custom must not be listed")
		default:
			if r.Configured || r.AllUsers || len(r.UserIDs) != 0 {
				t.Errorf("unconfigured row = %+v", r)
			}
		}
	}
}

func TestAdminGetRejectsNonHardcoded(t *testing.T) {
	svc := NewSystemAccessService(&stubAccessStore{})
	for _, sys := range []string{"custom", "pf2e"} {
		if _, err := svc.AdminGet(context.Background(), sys); !errors.Is(err, ErrUnknownSystem) {
			t.Errorf("AdminGet(%q) err = %v, want ErrUnknownSystem", sys, err)
		}
	}
}

func TestAdminUpdate(t *testing.T) {
	u := primitive.NewObjectID()
	store := &stubAccessStore{}
	row, err := NewSystemAccessService(store).AdminUpdate(context.Background(), "dnd5e", false, []string{u.Hex()})
	if err != nil {
		t.Fatal(err)
	}
	if store.upserted == nil || store.upserted.System != "dnd5e" || !slices.Equal(store.upserted.UserIDs, []primitive.ObjectID{u}) {
		t.Errorf("upserted = %+v", store.upserted)
	}
	if !row.Configured || !slices.Equal(row.UserIDs, []string{u.Hex()}) {
		t.Errorf("row = %+v", row)
	}
}

func TestAdminUpdateValidatesBeforeWriting(t *testing.T) {
	store := &stubAccessStore{}
	svc := NewSystemAccessService(store)
	if _, err := svc.AdminUpdate(context.Background(), "custom", true, nil); !errors.Is(err, ErrUnknownSystem) {
		t.Errorf("custom: err = %v, want ErrUnknownSystem", err)
	}
	if _, err := svc.AdminUpdate(context.Background(), "dnd5e", false, []string{"nope"}); !errors.Is(err, ErrInvalidUserID) {
		t.Errorf("bad id: err = %v, want ErrInvalidUserID", err)
	}
	if store.calls != 0 {
		t.Errorf("store touched %d times on invalid input", store.calls)
	}
}

func TestRemoveUser(t *testing.T) {
	u := primitive.NewObjectID()
	store := &stubAccessStore{}
	if err := NewSystemAccessService(store).RemoveUser(context.Background(), u); err != nil {
		t.Fatal(err)
	}
	if store.pulled != u {
		t.Errorf("pulled = %v, want %v", store.pulled, u)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run 'Allowed|AdminList|AdminGet|AdminUpdate|RemoveUser'`
Expected: FAIL — `undefined: allowed`, `undefined: NewSystemAccessService`

- [ ] **Step 4: Implement the service**

`internal/service/SystemAccessService.go`:

```go
package service

import (
	"context"
	"errors"
	"slices"

	"battle-helper/internal/models"
	"battle-helper/internal/systems/registry"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrUnknownSystem = errors.New("not a configurable game system")
	ErrInvalidUserID = errors.New("invalid user id")
)

// systemAccessStore is the persistence port of SystemAccessService, declared by the consumer
// so tests can pass a stub instead of MongoDB.
type systemAccessStore interface {
	List(ctx context.Context) ([]models.SystemAccess, error)
	Get(ctx context.Context, system string) (*models.SystemAccess, error)
	Upsert(ctx context.Context, system string, allUsers bool, userIDs []primitive.ObjectID) error
	PullUser(ctx context.Context, userID primitive.ObjectID) error
}

// SystemAccessView is one row of the admin "Systems" tab. ID is the system key because
// react-admin requires an `id` field.
type SystemAccessView struct {
	ID         string   `json:"id"`
	AllUsers   bool     `json:"allUsers"`
	UserIDs    []string `json:"userIds"`
	Configured bool     `json:"configured"`
}

// SystemAccessService decides who may create games in each hardcoded system.
// Only creation is gated: existing games stay reachable for their GM and players.
type SystemAccessService struct {
	store systemAccessStore
}

func NewSystemAccessService(store systemAccessStore) *SystemAccessService {
	return &SystemAccessService{store: store}
}

// allowed is the whole access rule. A missing document denies everyone, so a system newly
// added to the registry stays hidden until the admin opens it.
func allowed(doc *models.SystemAccess, userID primitive.ObjectID) bool {
	if doc == nil {
		return false
	}
	return doc.AllUsers || slices.Contains(doc.UserIDs, userID)
}

func isHardcoded(system string) bool {
	return slices.Contains(registry.HardcodedSystems(), system)
}

func (s *SystemAccessService) IsAllowed(ctx context.Context, system string, userID primitive.ObjectID) (bool, error) {
	if system == registry.CustomSystem {
		return true, nil
	}
	doc, err := s.store.Get(ctx, system)
	if err != nil {
		return false, err
	}
	return allowed(doc, userID), nil
}

// AllowedSystems lists the systems userID may create games in, in registry order.
func (s *SystemAccessService) AllowedSystems(ctx context.Context, userID primitive.ObjectID) ([]string, error) {
	docs, err := s.byID(ctx)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, sys := range registry.HardcodedSystems() {
		if allowed(docs[sys], userID) {
			out = append(out, sys)
		}
	}
	return append(out, registry.CustomSystem), nil
}

// AdminList returns one row per hardcoded system, configured or not.
func (s *SystemAccessService) AdminList(ctx context.Context) ([]SystemAccessView, error) {
	docs, err := s.byID(ctx)
	if err != nil {
		return nil, err
	}
	systems := registry.HardcodedSystems()
	out := make([]SystemAccessView, 0, len(systems))
	for _, sys := range systems {
		out = append(out, view(sys, docs[sys]))
	}
	return out, nil
}

func (s *SystemAccessService) AdminGet(ctx context.Context, system string) (*SystemAccessView, error) {
	if !isHardcoded(system) {
		return nil, ErrUnknownSystem
	}
	doc, err := s.store.Get(ctx, system)
	if err != nil {
		return nil, err
	}
	v := view(system, doc)
	return &v, nil
}

// AdminUpdate validates everything before writing, so a bad request never half-applies.
func (s *SystemAccessService) AdminUpdate(ctx context.Context, system string, allUsers bool, userIDs []string) (*SystemAccessView, error) {
	if !isHardcoded(system) {
		return nil, ErrUnknownSystem
	}
	ids := make([]primitive.ObjectID, 0, len(userIDs))
	for _, raw := range userIDs {
		id, err := primitive.ObjectIDFromHex(raw)
		if err != nil {
			return nil, ErrInvalidUserID
		}
		ids = append(ids, id)
	}
	if err := s.store.Upsert(ctx, system, allUsers, ids); err != nil {
		return nil, err
	}
	v := view(system, &models.SystemAccess{System: system, AllUsers: allUsers, UserIDs: ids})
	return &v, nil
}

// RemoveUser drops a deleted account from every system's list, so no orphaned id remains.
func (s *SystemAccessService) RemoveUser(ctx context.Context, userID primitive.ObjectID) error {
	return s.store.PullUser(ctx, userID)
}

func (s *SystemAccessService) byID(ctx context.Context) (map[string]*models.SystemAccess, error) {
	docs, err := s.store.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]*models.SystemAccess, len(docs))
	for i := range docs {
		out[docs[i].System] = &docs[i]
	}
	return out, nil
}

func view(system string, doc *models.SystemAccess) SystemAccessView {
	v := SystemAccessView{ID: system, UserIDs: []string{}}
	if doc == nil {
		return v
	}
	v.Configured = true
	v.AllUsers = doc.AllUsers
	for _, id := range doc.UserIDs {
		v.UserIDs = append(v.UserIDs, id.Hex())
	}
	return v
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemAccess.go warhammer-battle-helper-backend/internal/service/SystemAccessService.go warhammer-battle-helper-backend/internal/service/SystemAccessService_test.go
git commit -m "feat: PLAYRPG-243 system access service with fail-closed rule"
```

---

### Task 3: Repository + gate game creation + drop feature toggles

**Files:**
- Create: `warhammer-battle-helper-backend/internal/repository/SystemAccessRepository.go`
- Modify: `warhammer-battle-helper-backend/internal/config/database.go` (struct + `return &Database{...}`)
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go:1-30` (imports, struct), `:40-66` (`CreateGame` gate), `:751-762` (`GetFeatures`)
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:8` (import), `:176-181` (wiring + route)
- Delete: `warhammer-battle-helper-backend/internal/features/toggle.go`, `warhammer-battle-helper-backend/feature-toggles.json`

**Interfaces:**
- Consumes: `service.NewSystemAccessService`, `IsAllowed`, `AllowedSystems` (Task 2)
- Produces: `repository.NewSystemAccessRepository(col *mongo.Collection) *SystemAccessRepository`; `config.Database.SystemAccessCollection`; `GameHandler.SystemAccess *service.SystemAccessService`; variable `systemAccessService` in `main.go` (reused by Task 4)

- [ ] **Step 1: Add the collection**

`internal/config/database.go` — add a struct field and its initializer:

```go
	SystemTemplatesCollection *mongo.Collection
	SystemAccessCollection    *mongo.Collection
}
```

```go
		SystemTemplatesCollection: db.Collection("system_templates"),
		SystemAccessCollection:    db.Collection("system_access"),
	}, nil
```

- [ ] **Step 2: Create the repository**

`internal/repository/SystemAccessRepository.go`:

```go
package repository

import (
	"battle-helper/internal/models"
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SystemAccessRepository struct {
	collection *mongo.Collection
}

func NewSystemAccessRepository(col *mongo.Collection) *SystemAccessRepository {
	return &SystemAccessRepository{collection: col}
}

func (r *SystemAccessRepository) List(ctx context.Context) ([]models.SystemAccess, error) {
	cur, err := r.collection.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	var out []models.SystemAccess
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Get returns nil, nil when the system has no document — that is the "nobody" state,
// not an error.
func (r *SystemAccessRepository) Get(ctx context.Context, system string) (*models.SystemAccess, error) {
	var doc models.SystemAccess
	err := r.collection.FindOne(ctx, bson.M{"_id": system}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func (r *SystemAccessRepository) Upsert(ctx context.Context, system string, allUsers bool, userIDs []primitive.ObjectID) error {
	// A nil slice would be stored as null, and $pull fails on a non-array field.
	if userIDs == nil {
		userIDs = []primitive.ObjectID{}
	}
	_, err := r.collection.UpdateOne(ctx,
		bson.M{"_id": system},
		bson.M{"$set": bson.M{"allUsers": allUsers, "userIds": userIDs, "updatedAt": time.Now()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (r *SystemAccessRepository) PullUser(ctx context.Context, userID primitive.ObjectID) error {
	_, err := r.collection.UpdateMany(ctx,
		bson.M{"userIds": userID},
		bson.M{"$pull": bson.M{"userIds": userID}},
	)
	return err
}
```

- [ ] **Step 3: Switch `GameHandler` to the service**

In `internal/http/GameHandler.go`:

Imports — remove `"battle-helper/internal/features"`.

Struct — replace `FeatureToggles  features.FeatureToggles` with:

```go
	SystemAccess    *service.SystemAccessService
```

In `CreateGame`, delete the block:

```go
	if !h.FeatureToggles.IsSystemAllowed(req.GameSystem, username) {
		c.JSON(http.StatusForbidden, gin.H{"error": "game system not available for your account"})
		return
	}
```

and insert right after the `userID, err := primitive.ObjectIDFromHex(userIDStr)` error check:

```go
	allowed, err := h.SystemAccess.IsAllowed(c.Request.Context(), req.GameSystem, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "game system not available for your account"})
		return
	}
```

Replace the whole `GetFeatures` function with:

```go
// GetFeatures lists the game systems the caller may create games in. The create-game
// dialog fetches it on every open, so an admin's access change shows without a reload.
func (h *GameHandler) GetFeatures(c *gin.Context) {
	allowed, err := h.SystemAccess.AllowedSystems(c.Request.Context(), mustUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"allowedSystems": allowed})
}
```

- [ ] **Step 4: Rewire `main.go` and delete the toggles**

Remove the import `"battle-helper/internal/features"`. Replace:

```go
	// --- FEATURE TOGGLES ---
	ft := features.Load("./feature-toggles.json")

	gameHandler := http.GameHandler{GameService: gameService, TemplateService: templateService, Hub: hub, FeatureToggles: ft, UserFiles: userFilesStorage}
	statsHandler := http.StatsHandler{StatsRepo: statsRepo, SessionService: sessionService}
	r.GET("/features", http.JWTOptionalMiddleware(), gameHandler.GetFeatures)
```

with:

```go
	systemAccessService := service.NewSystemAccessService(repository.NewSystemAccessRepository(db.SystemAccessCollection))

	gameHandler := http.GameHandler{GameService: gameService, TemplateService: templateService, Hub: hub, SystemAccess: systemAccessService, UserFiles: userFilesStorage}
	statsHandler := http.StatsHandler{StatsRepo: statsRepo, SessionService: sessionService}
	r.GET("/features", http.JWTAuthMiddleware(), gameHandler.GetFeatures)
```

Then:

```bash
git rm warhammer-battle-helper-backend/internal/features/toggle.go warhammer-battle-helper-backend/feature-toggles.json
```

- [ ] **Step 5: Build, vet, test**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./internal/http/ ./internal/service/ ./internal/repository/ ./cmd/... && go test ./internal/...`
Expected: build clean, all `ok`. If `go build` reports `"fmt" imported and not used` in `GameHandler.go`, remove that import (the deleted `Printf`s may have been its last users).

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/repository/SystemAccessRepository.go warhammer-battle-helper-backend/internal/config/database.go warhammer-battle-helper-backend/internal/http/GameHandler.go warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat: PLAYRPG-243 gate game creation on system_access, drop feature-toggles.json"
```

---

### Task 4: Admin endpoints

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/AdminHandler.go` (imports, struct, `DeleteUser`, new methods at end)
- Modify: `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go:372-382` (handler init + routes)
- Test: `warhammer-battle-helper-backend/internal/http/AdminHandler_systems_test.go`

**Interfaces:**
- Consumes: `AdminList`, `AdminGet`, `AdminUpdate`, `RemoveUser`, `ErrUnknownSystem`, `ErrInvalidUserID`, `SystemAccessView` (Task 2); `systemAccessService` in `main.go` (Task 3)
- Produces: `GET /admin/systems` → `[]SystemAccessView` + `X-Total-Count`; `GET /admin/systems/:id` → `SystemAccessView` | 404; `PATCH /admin/systems/:id` body `{allUsers: bool, userIds: [string]}` → `SystemAccessView` | 400

- [ ] **Step 1: Write the failing tests**

`internal/http/AdminHandler_systems_test.go`:

```go
package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
)

// Every case here is rejected before the store is touched, so the nil store is safe.
func adminSystemsRequest(t *testing.T, method, system, body string, handle func(*AdminHandler, *gin.Context)) int {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/admin/systems/"+system, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: system}}
	handle(&AdminHandler{SystemAccess: service.NewSystemAccessService(nil)}, c)
	return w.Code
}

func TestUpdateSystemRejectsBadInput(t *testing.T) {
	cases := []struct {
		name, system, body string
	}{
		{"custom is not configurable", "custom", `{"allUsers":true,"userIds":[]}`},
		{"unknown system", "pf2e", `{"allUsers":true,"userIds":[]}`},
		{"malformed user id", "dnd5e", `{"allUsers":false,"userIds":["nope"]}`},
		{"missing allUsers", "dnd5e", `{"userIds":[]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code := adminSystemsRequest(t, http.MethodPatch, tc.system, tc.body, (*AdminHandler).UpdateSystem)
			if code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", code)
			}
		})
	}
}

func TestGetSystemUnknownIs404(t *testing.T) {
	code := adminSystemsRequest(t, http.MethodGet, "custom", "", (*AdminHandler).GetSystem)
	if code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/http/ -run 'UpdateSystem|GetSystem'`
Expected: FAIL — `unknown field SystemAccess in struct literal`, `UpdateSystem undefined`

- [ ] **Step 3: Implement**

`internal/http/AdminHandler.go` — imports become:

```go
import (
	"battle-helper/internal/repository"
	"battle-helper/internal/service"
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)
```

Struct:

```go
type AdminHandler struct {
	AdminRepo    *repository.AdminRepository
	SystemAccess *service.SystemAccessService
}
```

In `DeleteUser`, between the `DeleteUser` error check and the final `c.JSON(http.StatusOK, ...)`:

```go
	if err := h.SystemAccess.RemoveUser(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
```

Append at the end of the file:

```go
// GET /admin/systems
func (h *AdminHandler) ListSystems(c *gin.Context) {
	ctx, cancel := h.withTimeout()
	defer cancel()

	rows, err := h.SystemAccess.AdminList(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.Header("X-Total-Count", fmt.Sprint(len(rows)))
	c.JSON(http.StatusOK, rows)
}

// GET /admin/systems/:id
func (h *AdminHandler) GetSystem(c *gin.Context) {
	ctx, cancel := h.withTimeout()
	defer cancel()

	row, err := h.SystemAccess.AdminGet(ctx, c.Param("id"))
	if errors.Is(err, service.ErrUnknownSystem) {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, row)
}

// PATCH /admin/systems/:id
func (h *AdminHandler) UpdateSystem(c *gin.Context) {
	var req struct {
		AllUsers *bool    `json:"allUsers"`
		UserIDs  []string `json:"userIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AllUsers == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "allUsers field required"})
		return
	}
	ctx, cancel := h.withTimeout()
	defer cancel()

	row, err := h.SystemAccess.AdminUpdate(ctx, c.Param("id"), *req.AllUsers, req.UserIDs)
	if errors.Is(err, service.ErrUnknownSystem) || errors.Is(err, service.ErrInvalidUserID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	c.JSON(http.StatusOK, row)
}
```

`main.go` — handler init and routes:

```go
	adminHandler := http.AdminHandler{AdminRepo: adminRepo, SystemAccess: systemAccessService}
```

```go
	admin.GET("/stats/sessions", adminHandler.SessionStats)
	admin.GET("/systems", adminHandler.ListSystems)
	admin.GET("/systems/:id", adminHandler.GetSystem)
	admin.PATCH("/systems/:id", adminHandler.UpdateSystem)
	// --- END ADMIN ---
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...`
Expected: all `ok`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/http/AdminHandler.go warhammer-battle-helper-backend/internal/http/AdminHandler_systems_test.go warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go
git commit -m "feat: PLAYRPG-243 admin endpoints for system access"
```

---

### Task 5: Create-game dialog fetches its own access list

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx:1-10` (import), `:44-75` (state, effect, options), `:166-190` (creator CTA)
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx:19`, `:131`
- Modify: `warhammer-battle-helper-front/src/App.js:45`, `:71-76`, `:92-100`, `:222`
- Test: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx`

**Interfaces:**
- Consumes: `GET /features` → `{allowedSystems: string[]}` (Task 3; always contains `"custom"`)
- Produces: `CreateGameDialog` props `{ open, loading, templates, onClose, onCreate, onOpenCreator }` — `allowedSystems` removed

- [ ] **Step 1: Update the tests**

In `CreateGameDialog.test.jsx`:

Imports at the top become:

```js
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import i18n from '../../i18n';
import axiosInstance from '../../api/axios';
import CreateGameDialog from './CreateGameDialog';
```

Replace the axios-mock comment line with:

```js
// The dialog fetches /features through the shared axios instance; axios itself is ESM,
// which CRA's jest cannot parse, so the whole module is stubbed.
```

Replace `renderDialog` with:

```js
const ALL_SYSTEMS = ['warhammer4e', 'coc7e', 'coc7e_dark_ages', 'dnd5e', 'custom'];

beforeEach(() => {
  axiosInstance.get.mockReset();
  axiosInstance.get.mockResolvedValue({ data: { allowedSystems: ALL_SYSTEMS } });
});

const dialog = (props) => (
  <CreateGameDialog open loading={false} templates={templates}
    onClose={jest.fn()} onCreate={jest.fn()} onOpenCreator={jest.fn()} {...props} />
);

// Renders and lets the /features request settle, so the hardcoded systems are in the list.
const renderDialog = async (props = {}) => {
  const utils = render(dialog(props));
  await act(async () => {});
  return utils;
};
```

Make every existing `it(...)` callback `async` and change each `renderDialog(...)` call inside it to `await renderDialog(...)`.

Append a new `describe` block at the end of the file:

```js
describe('CreateGameDialog system access', () => {
  it('lists no hardcoded system until /features answers', () => {
    axiosInstance.get.mockReturnValue(new Promise(() => {}));
    render(dialog());
    expect(search('warhammer')).toBeNull();
    expect(within(search('mroczne')).getByRole('option')).toHaveTextContent('Mroczne Ziemie');
  });

  it('lists only the systems the user may create games in', async () => {
    axiosInstance.get.mockResolvedValue({ data: { allowedSystems: ['warhammer4e', 'custom'] } });
    await renderDialog();
    expect(search('warhammer')).not.toBeNull();
    expect(search('d&d')).toBeNull();
  });

  it('keeps templates and the creator link when /features fails', async () => {
    axiosInstance.get.mockRejectedValue(new Error('network'));
    await renderDialog();
    expect(search('warhammer')).toBeNull();
    expect(within(search('mroczne')).getByRole('option')).toHaveTextContent('Mroczne Ziemie');
    expect(screen.getByText(i18n.t('creator.designYours'))).toBeInTheDocument();
  });

  it('refetches access on every open', async () => {
    const { rerender } = await renderDialog();
    rerender(dialog({ open: false }));
    rerender(dialog({ open: true }));
    await act(async () => {});
    expect(axiosInstance.get).toHaveBeenCalledTimes(2);
    expect(axiosInstance.get).toHaveBeenCalledWith('/features');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CreateGameDialog`
Expected: the 4 new tests FAIL (no fetch happens, all systems shown without a prop); the existing ones still PASS.

- [ ] **Step 3: Implement in `CreateGameDialog.jsx`**

Add the import after the `react-i18next` import:

```js
import axiosInstance from '../../api/axios';
```

Change the signature:

```js
function CreateGameDialog({ open, loading, templates, onClose, onCreate, onOpenCreator }) {
```

After `const [query, setQuery] = useState('');` add:

```js
  // Hardcoded systems this user may create games in; null until /features answers. Fetched on
  // every open so an access change made in the admin panel shows without a page reload.
  const [allowedSystems, setAllowedSystems] = useState(null);
```

Replace from `// "custom" is feature-gated like any other system...` through the `options` `useMemo` with:

```js
  // Until /features answers (or if it fails) no hardcoded system is offered; the backend
  // enforces access on create anyway. Custom templates are never gated.
  const regularSystems = useMemo(() => listSystems().filter(sys =>
    sys.value !== 'custom' && (allowedSystems ?? []).includes(sys.value)
  ), [allowedSystems]);

  const options = useMemo(
    () => buildSystemOptions(regularSystems, templates),
    [regularSystems, templates]
  );
```

Replace the "Every open starts from a clean form" effect with:

```js
  // Every open starts from a clean form — a half-filled name from a cancelled attempt
  // reappearing later reads as a bug — and with a fresh access list.
  useEffect(() => {
    if (!open) return undefined;
    setName('');
    setSelection(null);
    setPickerOpen(false);
    setQuery('');
    setAllowedSystems(null);
    // A reply from an earlier open must not overwrite the current one.
    let cancelled = false;
    axiosInstance.get('/features')
      .then(res => { if (!cancelled) setAllowedSystems(res.data.allowedSystems); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);
```

Unwrap the creator CTA: replace `{customAllowed && (` + the closing `)}` around the `<Box sx={{ mt: 2, display: 'flex', ... }}>` block so the `<Box>` renders unconditionally (keep its content and the comment above it unchanged).

- [ ] **Step 4: Remove the prop plumbing**

`GameLobby.jsx`:
- line 19: `const GameLobby = ({ onJoinGame, token, userEmail, notice, onDismissNotice }) => {`
- delete the `allowedSystems={allowedSystems}` line passed to `<CreateGameDialog>`.

`App.js`:
- delete `const [allowedSystems, setAllowedSystems] = useState(null);`
- in `checkAuthStatus` delete the whole block:
  ```js
                    try {
                        const featuresRes = await axiosInstance.get('/features');
                        setAllowedSystems(featuresRes.data.allowedSystems);
                    } catch (e) {
                        // Features endpoint failed — show all systems, backend will enforce
                    }
  ```
- replace `handleLogin` with:
  ```js
    const handleLogin = (email, token, userId) => {
        setUser({ email, token });
        setUserId(userId);
    };
  ```
- delete the `allowedSystems={allowedSystems}` line passed to `<GameLobby>`.

Run: `cd warhammer-battle-helper-front && git grep -n allowedSystems -- src`
Expected: matches only in `components/lobby/CreateGameDialog.jsx` and its test.

- [ ] **Step 5: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CreateGameDialog|systemOptions|GameCard'`
Expected: all PASS.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` failure.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx warhammer-battle-helper-front/src/components/GameLobby.jsx warhammer-battle-helper-front/src/App.js
git commit -m "feat: PLAYRPG-243 create-game dialog fetches system access on open"
```

---

### Task 6: Admin panel "Systems" tab

**Files:**
- Modify: `warhammer-battle-helper-admin/src/dataProvider.js` (`RESOURCE_MAP`, `getList`)
- Modify: `warhammer-battle-helper-admin/src/users/UserList.jsx` (`SearchInput` source)
- Create: `warhammer-battle-helper-admin/src/systems/SystemList.jsx`
- Create: `warhammer-battle-helper-admin/src/systems/SystemEdit.jsx`
- Modify: `warhammer-battle-helper-admin/src/AdminApp.jsx`

**Interfaces:**
- Consumes: `/admin/systems` endpoints (Task 4); rows `{id, allUsers, userIds, configured}`
- Produces: react-admin resource `systems`

- [ ] **Step 1: `dataProvider.js`**

```js
const RESOURCE_MAP = {
  users: "/admin/users",
  games: "/admin/games",
  systems: "/admin/systems",
};
```

In `getList`, replace

```js
    const data = await request("GET", path);
    const total = data.length;

    // Client-side sort + pagination (data is small for admin use)
    const { field = "id", order = "ASC" } = params.sort || {};
    const sorted = [...data].sort((a, b) => {
```

with

```js
    const data = await request("GET", path);

    // Client-side filter + sort + pagination (data is small for admin use).
    // `q` is the free-text search sent by SearchInput and AutocompleteArrayInput; it matches the email.
    const filter = params.filter || {};
    const filtered = data.filter((row) =>
      Object.entries(filter).every(([key, value]) => {
        if (value === undefined || value === null || value === "") return true;
        if (key === "q") {
          return String(row.email ?? "").toLowerCase().includes(String(value).toLowerCase());
        }
        return String(row[key]) === String(value);
      })
    );
    const total = filtered.length;

    const { field = "id", order = "ASC" } = params.sort || {};
    const sorted = [...filtered].sort((a, b) => {
```

- [ ] **Step 2: `UserList.jsx` search goes through `q`**

```js
  <SearchInput key="q" source="q" alwaysOn />,
```

(With `source="email"` the new filter would compare emails for equality, not substring.)

- [ ] **Step 3: `systems/SystemList.jsx`**

```jsx
import React from "react";
import { List, Datagrid, TextField, FunctionField, EditButton } from "react-admin";
import Typography from "@mui/material/Typography";

function AccessLabel({ record }) {
  if (record.allUsers) return "All users";
  if (record.userIds.length > 0) return `${record.userIds.length} user(s)`;
  return (
    <Typography component="span" variant="body2" color="error">
      {record.configured ? "Nobody" : "Nobody (not configured)"}
    </Typography>
  );
}

export function SystemList() {
  return (
    <List pagination={false} sort={{ field: "id", order: "ASC" }}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="id" label="System" />
        <FunctionField label="Access" render={(record) => <AccessLabel record={record} />} />
        <EditButton />
      </Datagrid>
    </List>
  );
}
```

- [ ] **Step 4: `systems/SystemEdit.jsx`**

```jsx
import React from "react";
import {
  Edit,
  SimpleForm,
  TextField,
  BooleanInput,
  ReferenceArrayInput,
  AutocompleteArrayInput,
} from "react-admin";
import { useWatch } from "react-hook-form";
import Alert from "@mui/material/Alert";

// readOnly, not disabled: react-admin drops disabled values on submit, which would wipe the
// picked users whenever "All users" is on. Keeping them lets the admin flip back.
function UsersInput() {
  const allUsers = useWatch({ name: "allUsers" });
  const userIds = useWatch({ name: "userIds" }) || [];
  return (
    <>
      <ReferenceArrayInput source="userIds" reference="users" perPage={1000}>
        <AutocompleteArrayInput optionText="email" label="Selected users" readOnly={allUsers} fullWidth />
      </ReferenceArrayInput>
      {!allUsers && userIds.length === 0 && (
        <Alert severity="warning">Nobody can create games in this system.</Alert>
      )}
    </>
  );
}

export function SystemEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <TextField source="id" label="System" />
        <BooleanInput source="allUsers" label="All users" />
        <UsersInput />
      </SimpleForm>
    </Edit>
  );
}
```

- [ ] **Step 5: `AdminApp.jsx`**

Add imports:

```jsx
import ExtensionIcon from "@mui/icons-material/Extension";
import { SystemList } from "./systems/SystemList";
import { SystemEdit } from "./systems/SystemEdit";
```

Add after the `games` resource:

```jsx
      <Resource
        name="systems"
        icon={ExtensionIcon}
        list={SystemList}
        edit={SystemEdit}
        options={{ label: "Systems" }}
      />
```

- [ ] **Step 6: Build**

Run: `cd warhammer-battle-helper-admin && CI=true npm run build`
Expected: `Compiled successfully` (CI=true turns ESLint warnings into errors — fix any).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-admin/src/dataProvider.js warhammer-battle-helper-admin/src/users/UserList.jsx warhammer-battle-helper-admin/src/systems/SystemList.jsx warhammer-battle-helper-admin/src/systems/SystemEdit.jsx warhammer-battle-helper-admin/src/AdminApp.jsx
git commit -m "feat: PLAYRPG-243 admin Systems tab"
```

---

### Task 7: End-to-end verification + cleanup

**Files:**
- Delete memory: `deploy-feature-toggles-todo.md` + its line in `MEMORY.md` (memory dir, not repo)

- [ ] **Step 1: Restart the local backend** so the new code and routes are live (`docker compose up -d --build backend` from repo root; if the build hangs on the keychain credential helper, ask the user to run it — see memory `docker-build-credential-hang`).

- [ ] **Step 2: Get JWTs** for an admin user A and a non-admin user B (recipe: memory `local-e2e-verification-recipe`). Export `A=<jwt>`, `B=<jwt>`, `BID=<B user id>`, `API=http://localhost:8080`.

- [ ] **Step 3: Run the scenarios**

```bash
# 1. empty collection → fail-closed
curl -s -H "Authorization: Bearer $B" $API/features                       # {"allowedSystems":["custom"]}
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $B" -H 'Content-Type: application/json' \
  -d '{"name":"t","gameSystem":"warhammer4e"}' $API/games                 # 403
curl -s -H "Authorization: Bearer $A" $API/admin/systems                  # 4 rows, configured:false, userIds:[]

# 2. open warhammer4e for everyone
curl -s -X PATCH -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"allUsers":true,"userIds":[]}' $API/admin/systems/warhammer4e
curl -s -H "Authorization: Bearer $B" $API/features                       # ["warhammer4e","custom"]
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $B" -H 'Content-Type: application/json' \
  -d '{"name":"t","gameSystem":"warhammer4e"}' $API/games                 # 200

# 3. dnd5e for B only
curl -s -X PATCH -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d "{\"allUsers\":false,\"userIds\":[\"$BID\"]}" $API/admin/systems/dnd5e
curl -s -H "Authorization: Bearer $B" $API/features                       # includes dnd5e
curl -s -H "Authorization: Bearer $A" $API/features                       # no dnd5e

# 4. B creates a dnd5e game, loses access, still sees and opens it
GID=$(curl -s -H "Authorization: Bearer $B" -H 'Content-Type: application/json' \
  -d '{"name":"old","gameSystem":"dnd5e"}' $API/games | jq -r .id)
curl -s -X PATCH -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d '{"allUsers":false,"userIds":[]}' $API/admin/systems/dnd5e
curl -s -H "Authorization: Bearer $B" $API/games | jq '.[].id' | grep $GID   # still listed
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $B" $API/games/$GID   # 200

# 5. deleting a user pulls them from lists
curl -s -X PATCH -H "Authorization: Bearer $A" -H 'Content-Type: application/json' \
  -d "{\"allUsers\":false,\"userIds\":[\"$BID\"]}" $API/admin/systems/dnd5e
# (use a throwaway user as B for this step, or re-create B afterwards)
curl -s -X DELETE -H "Authorization: Bearer $A" $API/admin/users/$BID
curl -s -H "Authorization: Bearer $A" $API/admin/systems/dnd5e            # userIds: []
```

If `jq -r .id` yields `null`, check the create response shape (`curl ... | jq .`) and adjust the field path.

- [ ] **Step 4: Browser check (manual, user)** — admin panel: Systems tab lists 4 systems, edit dnd5e, toggle "All users" on and off keeps picked users, autocomplete filters by typed email, warning shows for empty list. Game app: create-game dialog shows only allowed systems; change access in admin, reopen dialog without reload — list updates.

- [ ] **Step 5: Memory cleanup** — delete `deploy-feature-toggles-todo.md` from the memory dir and its line from `MEMORY.md`. If the browser check from Step 4 is not done in-session, add a `playrpg-243-pending-browser-check` memory like the existing ones.

- [ ] **Step 6: Remind the user** — after deploying to prod, configure all 4 systems in the admin panel; until then nobody can create games in hardcoded systems.
