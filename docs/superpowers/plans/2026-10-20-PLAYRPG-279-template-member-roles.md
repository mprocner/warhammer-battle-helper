# PLAYRPG-279 Template Member Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace a template's single owner + read-only share list with a member list of `viewer` / `editor` / `owner` roles, guard concurrent edits with optimistic locking on `version`, and expose it in the creator and lobby.

**Architecture:** One role→action map in `internal/models/template_roles.go` feeds both the Go predicate (`service.CanOnTemplate`) and the Mongo filters (`models.RolesWith`), so authorisation and atomic conditional writes never disagree. The service decorates every template with the viewer's `myRole` + computed `permissions`; the frontend gates UI on `permissions` only. The creator sends `version` with every save and stops autosaving on 409 / 403 until the user decides.

**Tech Stack:** Go + Gin + mongo-driver v1 (`mtest` mock tests) | React + MUI + i18next, Jest via CRA.

**Spec:** `docs/superpowers/specs/PLAYRPG-279.md`

## Global Constraints

- Code comments always in English; existing Polish comments are only translated when touching that fragment.
- No hardcoded UI strings in JSX — every string goes through `t('key')`; add keys to BOTH `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`. No MUI `<Tooltip>` (use the existing `usePortalTooltip`).
- Creator colours: input bg `#fff9f0`, text `#3a2f1f`, borders `#c4a882` / `#7a5c42`, accent `#c9975b`.
- Delete dead code, CSS, i18n keys and props in the same change that orphans them.
- No backward compatibility in the data model — old fields are migrated, then dropped (Task 4).
- Role strings are exactly `"viewer"`, `"editor"`, `"owner"`. Error codes sent to the client are exactly the strings defined in Task 3 (`ErrTemplate…` / `ErrShare…`).
- Frontend tests: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Known baseline failure: `App.test.js` (axios ESM) — not a regression.
- Backend tests: `cd warhammer-battle-helper-backend && go test ./...`.
- Work on `main` in the main checkout (no worktree). Before EVERY commit run `git branch --show-current` in the same command and confirm `main` — parallel sessions share this checkout. Stage only the files you changed (never `nginx.conf` / `package-lock.json`, which carry unrelated local edits).
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

## File Structure

**Backend (`warhammer-battle-helper-backend/`)**
- Create `internal/models/template_roles.go` — role constants, `TemplateAction`, the role→action map, `IsValidRole`, `RoleCan`, `RolesWith`.
- Create `internal/models/template_roles_test.go`.
- Modify `internal/models/SystemTemplate.go` — member types, new fields; old ownership fields removed in Task 3; request types.
- Modify `internal/service/authz.go` — `RoleOf`, `CanOnTemplate`, `PermissionsFor`; `CanUseTemplate` removed in Task 3.
- Modify `internal/repository/TemplateRepository.go` — member-based conditional writes (Task 2), old ownership methods removed (Task 3).
- Rewrite `internal/service/TemplateService.go` — sentinels, conflict error, decorate, member operations.
- Modify `internal/http/TemplateHandler.go`, `internal/http/GameHandler.go`, `internal/http/AdminHandler.go`, `cmd/warhammer-battle-helper/main.go`.
- Create `cmd/migrate-template-members/main.go` + `main_test.go`. Modify `DEPLOY.md`.

**Frontend (`warhammer-battle-helper-front/src/`)**
- Modify `components/lobby/systemOptions.js`, `hooks/useTemplates.js`, `components/lobby/TemplateManagerDialog.jsx`, `components/GameLobby.jsx`.
- Create `components/creator/TemplateAccessCard.jsx` — the whole access card (visibility + members) moved out of `TemplateBuilder.jsx`.
- Create `components/creator/TemplateSaveBanner.jsx` — conflict / lost-access banner.
- Modify `components/creator/TemplateBuilder.jsx` — drop sharing state, mount the two new components, versioned + serialized saves.
- Locales en/pl, `style.css`.
- Tests: `TemplateAccessCard.test.jsx` (replaces `TemplateBuilder.sharing.test.jsx`), `TemplateBuilder.saveConflict.test.jsx`, `TemplateManagerDialog.test.jsx`, updated `systemOptions.test.js`, `CreateGameDialog.test.jsx`, `creatorTour.coverage.test.jsx`.

---

### Task 1: Role model and authorisation predicate

**Files:**
- Create: `warhammer-battle-helper-backend/internal/models/template_roles.go`
- Create: `warhammer-battle-helper-backend/internal/models/template_roles_test.go`
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (add types + fields next to existing ones; nothing removed yet)
- Modify: `warhammer-battle-helper-backend/internal/service/authz.go`
- Test: `warhammer-battle-helper-backend/internal/service/authz_test.go`

**Interfaces:**
- Produces (package `models`): `RoleViewer`, `RoleEditor`, `RoleOwner` (string consts); `type TemplateAction string`; `ActionUse`, `ActionEdit`, `ActionShare`, `ActionDelete`; `IsValidRole(role string) bool`; `RoleCan(role string, a TemplateAction) bool`; `RolesWith(a TemplateAction) []string` (sorted); `type TemplateMember struct{UserID primitive.ObjectID; Role string}`; `type TemplatePermissions struct{Edit, Share, Delete bool}`; `type TemplateMemberView struct{UserID primitive.ObjectID; Email, Role string; IsMe bool}`; new `SystemTemplate` fields `Members`, `UpdatedBy`, `MyRole`, `Permissions`, `MembersView`, `OwnerEmails`.
- Produces (package `service`): `RoleOf(t *models.SystemTemplate, userID primitive.ObjectID) string`; `CanOnTemplate(t *models.SystemTemplate, userID primitive.ObjectID, a models.TemplateAction) bool`; `PermissionsFor(t *models.SystemTemplate, userID primitive.ObjectID) models.TemplatePermissions`.

- [ ] **Step 1: Write the failing model tests**

`internal/models/template_roles_test.go`:

```go
package models

import (
	"slices"
	"testing"
)

func TestRoleCan(t *testing.T) {
	cases := []struct {
		role   string
		action TemplateAction
		want   bool
	}{
		{RoleViewer, ActionUse, true},
		{RoleViewer, ActionEdit, false},
		{RoleViewer, ActionShare, false},
		{RoleViewer, ActionDelete, false},
		{RoleEditor, ActionUse, true},
		{RoleEditor, ActionEdit, true},
		{RoleEditor, ActionShare, false},
		{RoleEditor, ActionDelete, false},
		{RoleOwner, ActionUse, true},
		{RoleOwner, ActionEdit, true},
		{RoleOwner, ActionShare, true},
		{RoleOwner, ActionDelete, true},
		{"", ActionUse, false},
		{"admin", ActionUse, false},
	}
	for _, c := range cases {
		if got := RoleCan(c.role, c.action); got != c.want {
			t.Errorf("RoleCan(%q, %q) = %v, want %v", c.role, c.action, got, c.want)
		}
	}
}

func TestRolesWith(t *testing.T) {
	cases := map[TemplateAction][]string{
		ActionUse:    {RoleEditor, RoleOwner, RoleViewer},
		ActionEdit:   {RoleEditor, RoleOwner},
		ActionShare:  {RoleOwner},
		ActionDelete: {RoleOwner},
	}
	for action, want := range cases {
		if got := RolesWith(action); !slices.Equal(got, want) {
			t.Errorf("RolesWith(%q) = %v, want %v", action, got, want)
		}
	}
}

func TestIsValidRole(t *testing.T) {
	for _, r := range []string{RoleViewer, RoleEditor, RoleOwner} {
		if !IsValidRole(r) {
			t.Errorf("IsValidRole(%q) = false, want true", r)
		}
	}
	for _, r := range []string{"", "Owner", "admin"} {
		if IsValidRole(r) {
			t.Errorf("IsValidRole(%q) = true, want false", r)
		}
	}
}
```

- [ ] **Step 2: Run, expect compile failure**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -run 'TestRoleCan|TestRolesWith|TestIsValidRole'`
Expected: FAIL — `undefined: RoleCan` (and the other new names).

- [ ] **Step 3: Implement `template_roles.go`**

```go
package models

import "slices"

// Template member roles (PLAYRPG-279). Every template has at least one owner.
const (
	RoleViewer = "viewer"
	RoleEditor = "editor"
	RoleOwner  = "owner"
)

// TemplateAction is one thing a user may do with a template.
type TemplateAction string

const (
	ActionUse    TemplateAction = "use"    // see it, create a game from it, clone it
	ActionEdit   TemplateAction = "edit"   // save name, sections, settings
	ActionShare  TemplateAction = "share"  // manage members and isPublic
	ActionDelete TemplateAction = "delete" // delete the template
)

// rolePermissions is the single source of truth for what a role may do. The Go predicate
// (service.CanOnTemplate) and the Mongo write filters (repository, through RolesWith) both read
// it, so they cannot drift apart. Adding a role is one row here plus its label in the client.
var rolePermissions = map[string][]TemplateAction{
	RoleViewer: {ActionUse},
	RoleEditor: {ActionUse, ActionEdit},
	RoleOwner:  {ActionUse, ActionEdit, ActionShare, ActionDelete},
}

// IsValidRole reports whether role is one of the known member roles.
func IsValidRole(role string) bool {
	_, ok := rolePermissions[role]
	return ok
}

// RoleCan reports whether role grants a. An unknown or empty role grants nothing.
func RoleCan(role string, a TemplateAction) bool {
	return slices.Contains(rolePermissions[role], a)
}

// RolesWith lists the roles granting a, sorted so the filters built from it are deterministic.
func RolesWith(a TemplateAction) []string {
	var roles []string
	for role, actions := range rolePermissions {
		if slices.Contains(actions, a) {
			roles = append(roles, role)
		}
	}
	slices.Sort(roles)
	return roles
}
```

- [ ] **Step 4: Add member types and fields to `SystemTemplate.go`**

Directly above `// SystemTemplate defines the structure…` add:

```go
// TemplateMember is one user's access to a template. Stored in SystemTemplate.Members.
type TemplateMember struct {
	UserID primitive.ObjectID `bson:"userId" json:"userId"`
	Role   string             `bson:"role" json:"role"`
}

// TemplatePermissions is what the requesting user may do with a template, computed per request
// from their role. The client gates its UI on these flags, never on the role name.
type TemplatePermissions struct {
	Edit   bool `json:"edit"`
	Share  bool `json:"share"`
	Delete bool `json:"delete"`
}

// TemplateMemberView is one member as an owner sees it in the access card.
type TemplateMemberView struct {
	UserID primitive.ObjectID `json:"userId"`
	Email  string             `json:"email"`
	Role   string             `json:"role"`
	IsMe   bool               `json:"isMe,omitempty"`
}
```

Inside `SystemTemplate`, after the `SharedWithUsers` field, add (old fields stay until Task 3):

```go
	// Members lists everyone with access and their role; always at least one owner. Not
	// serialised: only owners see the list, and they get it resolved to emails in MembersView.
	Members []TemplateMember `bson:"members" json:"-"`
	// UpdatedBy is the user behind the last save that changed the content. The creator names
	// them when a save is rejected as a version conflict.
	UpdatedBy primitive.ObjectID `bson:"updatedBy,omitempty" json:"-"`
	// MyRole is computed per request: the viewer's role, "" for a public template they are not
	// a member of.
	MyRole string `bson:"-" json:"myRole,omitempty"`
	// Permissions is computed per request from MyRole.
	Permissions TemplatePermissions `bson:"-" json:"permissions"`
	// MembersView is computed per request and filled ONLY for a viewer who may share: who else
	// has access is nobody else's business.
	MembersView []TemplateMemberView `bson:"-" json:"members,omitempty"`
	// OwnerEmails is computed per request and filled ONLY for a member who is not an owner.
	// Public templates never carry it, so no account can harvest authors' addresses.
	OwnerEmails []string `bson:"-" json:"ownerEmails,omitempty"`
```

- [ ] **Step 5: Run model tests, expect PASS**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/`
Expected: `ok`.

- [ ] **Step 6: Write failing authz test**

Append to `internal/service/authz_test.go` (keep `TestCanUseTemplate` for now; Task 3 deletes it):

```go
func TestCanOnTemplate(t *testing.T) {
	owner, editor, viewer, stranger := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	members := []models.TemplateMember{
		{UserID: owner, Role: models.RoleOwner},
		{UserID: editor, Role: models.RoleEditor},
		{UserID: viewer, Role: models.RoleViewer},
	}
	private := &models.SystemTemplate{Members: members}
	public := &models.SystemTemplate{Members: members, IsPublic: true}

	cases := []struct {
		name   string
		tpl    *models.SystemTemplate
		user   primitive.ObjectID
		action models.TemplateAction
		want   bool
	}{
		{"owner deletes", private, owner, models.ActionDelete, true},
		{"editor edits", private, editor, models.ActionEdit, true},
		{"editor cannot share", private, editor, models.ActionShare, false},
		{"editor cannot delete", private, editor, models.ActionDelete, false},
		{"viewer uses", private, viewer, models.ActionUse, true},
		{"viewer cannot edit", private, viewer, models.ActionEdit, false},
		{"stranger cannot use private", private, stranger, models.ActionUse, false},
		{"stranger uses public", public, stranger, models.ActionUse, true},
		{"public grants nothing beyond use", public, stranger, models.ActionEdit, false},
		{"nil template authorises nobody", nil, owner, models.ActionUse, false},
	}
	for _, c := range cases {
		if got := CanOnTemplate(c.tpl, c.user, c.action); got != c.want {
			t.Errorf("%s: CanOnTemplate = %v, want %v", c.name, got, c.want)
		}
	}

	if got := PermissionsFor(private, editor); got != (models.TemplatePermissions{Edit: true}) {
		t.Errorf("PermissionsFor(editor) = %+v, want edit only", got)
	}
	if got := RoleOf(public, stranger); got != "" {
		t.Errorf("RoleOf(stranger) = %q, want empty", got)
	}
}
```

- [ ] **Step 7: Run, expect FAIL** (`undefined: CanOnTemplate`)

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestCanOnTemplate`

- [ ] **Step 8: Implement in `authz.go`**

Add below `CanUseTemplate`:

```go
// RoleOf returns userID's role on t, or "" when they are not a member (or t is nil).
func RoleOf(t *models.SystemTemplate, userID primitive.ObjectID) string {
	if t == nil {
		return ""
	}
	for _, m := range t.Members {
		if m.UserID == userID {
			return m.Role
		}
	}
	return ""
}

// CanOnTemplate reports whether userID may perform a on t. Membership grants what the role map in
// models/template_roles.go says; a public template additionally lets anyone use it. A nil template
// (a failed fetch) authorises nobody.
//
// The same rule exists as Mongo filters in TemplateRepository (built from models.RolesWith) and as
// the visibility query in ListVisibleToMember. They read the same role map, so only the
// "public means use" clause is duplicated by hand.
func CanOnTemplate(t *models.SystemTemplate, userID primitive.ObjectID, a models.TemplateAction) bool {
	if t == nil {
		return false
	}
	if a == models.ActionUse && t.IsPublic {
		return true
	}
	return models.RoleCan(RoleOf(t, userID), a)
}

// PermissionsFor is the client-facing summary of what userID may do with t.
func PermissionsFor(t *models.SystemTemplate, userID primitive.ObjectID) models.TemplatePermissions {
	role := RoleOf(t, userID)
	return models.TemplatePermissions{
		Edit:   models.RoleCan(role, models.ActionEdit),
		Share:  models.RoleCan(role, models.ActionShare),
		Delete: models.RoleCan(role, models.ActionDelete),
	}
}
```

- [ ] **Step 9: Run full backend tests, expect PASS**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Expected: all `ok`.

- [ ] **Step 10: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-backend/internal/models/template_roles.go warhammer-battle-helper-backend/internal/models/template_roles_test.go warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/service/authz.go warhammer-battle-helper-backend/internal/service/authz_test.go && \
git commit -m "feat: PLAYRPG-279 template roles and permission predicate

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 2: Member-based repository writes

Additive: new methods live next to the old ones, which Task 3 deletes.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateRepository.go`
- Test: `warhammer-battle-helper-backend/internal/repository/TemplateMembers_test.go` (new)

**Interfaces:**
- Consumes: `models.RolesWith`, `models.TemplateAction` constants, `models.RoleOwner`, `models.TemplateMember` (Task 1).
- Produces: `var ErrTemplateNoMatch error`;
  `ListVisibleToMember(userID primitive.ObjectID) ([]models.SystemTemplate, error)`;
  `FindTokenConfig(userID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error)` (nil, nil when absent);
  `UpdateContent(id string, version int, editorID primitive.ObjectID, name *string, sections []models.SectionDef, settings *models.TemplateSettings, bumpVersion bool) error`;
  `SetVisibility(id string, callerID primitive.ObjectID, isPublic bool) error`;
  `AddMember(id string, callerID primitive.ObjectID, member models.TemplateMember) error`;
  `SetMemberRole(id string, callerID, targetID primitive.ObjectID, role string) error`;
  `RemoveMember(id string, callerID, targetID primitive.ObjectID) error`;
  `Leave(id string, userID primitive.ObjectID) error`;
  `DeleteAsMember(id string, callerID primitive.ObjectID) error`;
  `PullMemberEverywhere(userID primitive.ObjectID) error`.
  Every conditional write returns `ErrTemplateNoMatch` when nothing matched.

- [ ] **Step 1: Write the failing tests**

`internal/repository/TemplateMembers_test.go`:

```go
package repository

import (
	"errors"
	"strings"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

var (
	okWrite   = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}}
	noneWrite = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}, {Key: "nModified", Value: 0}}
)

// firstStatement returns the first entry of an update/delete command's statement array.
func firstStatement(mt *mtest.T, arrayKey string) bson.Raw {
	return mt.GetStartedEvent().Command.Lookup(arrayKey).Array().Index(0).Value().Document()
}

// relaxed renders a document as relaxed extended JSON so a test can look for a fragment without
// depending on key order inside bson.M.
func relaxed(t *testing.T, doc bson.Raw) string {
	t.Helper()
	out, err := bson.MarshalExtJSON(doc, false, false)
	if err != nil {
		t.Fatalf("MarshalExtJSON: %v", err)
	}
	return string(out)
}

func oid(id primitive.ObjectID) string { return `{"$oid":"` + id.Hex() + `"}` }

func mustContain(t *testing.T, haystack string, fragments ...string) {
	t.Helper()
	for _, f := range fragments {
		if !strings.Contains(haystack, f) {
			t.Errorf("expected %s to contain %s", haystack, f)
		}
	}
}

func TestListVisibleToMember(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("matches membership or public", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch))
		user := primitive.NewObjectID()
		if _, err := repo.ListVisibleToMember(user); err != nil {
			t.Fatal(err)
		}
		filter := relaxed(t, mt.GetStartedEvent().Command.Lookup("filter").Document())
		mustContain(t, filter, `"members.userId":`+oid(user), `"isPublic":true`)
	})
}

func TestUpdateContent(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("filters by version and editor role, stamps updatedBy on a content change", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		editor := primitive.NewObjectID()
		name := "New"
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), 3, editor, &name, nil, nil, true); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		q := st.Lookup("q").Document()
		if q.Lookup("version").AsInt64() != 3 {
			t.Error("the save must be filtered by the version the client saw")
		}
		mustContain(t, relaxed(t, q), `"userId":`+oid(editor), `"role":{"$in":["editor","owner"]}`)
		u := st.Lookup("u").Document()
		if u.Lookup("$inc", "version").AsInt64() != 1 {
			t.Error("a content change must bump version")
		}
		if u.Lookup("$set", "updatedBy").ObjectID() != editor {
			t.Error("a content change must record who saved it")
		}
	})

	mt.Run("no content change: no bump, no updatedBy, version still checked", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), 5, primitive.NewObjectID(), nil, nil, nil, false); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		if st.Lookup("q", "version").AsInt64() != 5 {
			t.Error("a stale client is stale even when it changes nothing")
		}
		u := st.Lookup("u").Document()
		if _, err := u.LookupErr("$inc"); err == nil {
			t.Error("no content change must not bump version")
		}
		if _, err := u.LookupErr("$set", "updatedBy"); err == nil {
			t.Error("no content change must not move updatedBy")
		}
	})

	mt.Run("nothing matched is ErrTemplateNoMatch", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(noneWrite)
		err := repo.UpdateContent(primitive.NewObjectID().Hex(), 1, primitive.NewObjectID(), nil, nil, nil, false)
		if !errors.Is(err, ErrTemplateNoMatch) {
			t.Errorf("err = %v, want ErrTemplateNoMatch", err)
		}
	})
}

func TestMemberWrites(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	caller, target := primitive.NewObjectID(), primitive.NewObjectID()
	ownerGuard := `"role":{"$ne":"owner"}`
	shareRole := `"role":{"$in":["owner"]}`

	mt.Run("SetVisibility requires share", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.SetVisibility(primitive.NewObjectID().Hex(), caller, true); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), `"userId":`+oid(caller), shareRole)
		if !st.Lookup("u", "$set", "isPublic").Boolean() {
			t.Error("isPublic must be set")
		}
	})

	mt.Run("AddMember requires share and refuses an existing member", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		err := repo.AddMember(primitive.NewObjectID().Hex(), caller, models.TemplateMember{UserID: target, Role: models.RoleEditor})
		if err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), shareRole, `"members.userId":{"$ne":`+oid(target)+`}`)
		if _, err := st.Lookup("u").Document().LookupErr("$push", "members"); err != nil {
			t.Error("AddMember must $push into members")
		}
	})

	mt.Run("SetMemberRole below owner keeps an owner", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.SetMemberRole(primitive.NewObjectID().Hex(), caller, target, models.RoleViewer); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), shareRole, ownerGuard)
		if _, err := st.LookupErr("arrayFilters"); err != nil {
			t.Error("the role must be set through an arrayFilter on userId")
		}
	})

	mt.Run("SetMemberRole to owner needs no owner guard", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.SetMemberRole(primitive.NewObjectID().Hex(), caller, target, models.RoleOwner); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(relaxed(t, firstStatement(mt, "updates").Lookup("q").Document()), ownerGuard) {
			t.Error("promoting to owner can never leave the template ownerless")
		}
	})

	mt.Run("RemoveMember requires share and keeps an owner", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.RemoveMember(primitive.NewObjectID().Hex(), caller, target); err != nil {
			t.Fatal(err)
		}
		st := firstStatement(mt, "updates")
		mustContain(t, relaxed(t, st.Lookup("q").Document()), shareRole, ownerGuard)
		if _, err := st.Lookup("u").Document().LookupErr("$pull", "members"); err != nil {
			t.Error("RemoveMember must $pull from members")
		}
	})

	mt.Run("Leave keeps an owner but needs no share", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.Leave(primitive.NewObjectID().Hex(), caller); err != nil {
			t.Fatal(err)
		}
		q := relaxed(t, firstStatement(mt, "updates").Lookup("q").Document())
		mustContain(t, q, ownerGuard)
		if strings.Contains(q, shareRole) {
			t.Error("leaving must not require the share permission")
		}
	})

	mt.Run("DeleteAsMember requires delete; nothing deleted is ErrTemplateNoMatch", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}})
		err := repo.DeleteAsMember(primitive.NewObjectID().Hex(), caller)
		if !errors.Is(err, ErrTemplateNoMatch) {
			t.Errorf("err = %v, want ErrTemplateNoMatch", err)
		}
		mustContain(t, relaxed(t, firstStatement(mt, "deletes").Lookup("q").Document()), `"userId":`+oid(caller), shareRole)
	})

	mt.Run("PullMemberEverywhere updates many", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		if err := repo.PullMemberEverywhere(target); err != nil {
			t.Fatal(err)
		}
		if !firstStatement(mt, "updates").Lookup("multi").Boolean() {
			t.Error("a deleted account must be pulled from every template")
		}
	})
}
```

(`shareRole` doubles as the delete-role fragment: both actions are owner-only today. If the role map changes, the expected fragment changes with it.)

- [ ] **Step 2: Run, expect compile failure**

Run: `cd warhammer-battle-helper-backend && go test ./internal/repository/ -run 'TestListVisibleToMember|TestUpdateContent|TestMemberWrites'`
Expected: FAIL — `undefined: ErrTemplateNoMatch` etc.

- [ ] **Step 3: Implement in `TemplateRepository.go`**

Add `"errors"` to the imports. Append:

```go
// ErrTemplateNoMatch means a conditional template write matched no document: the template is
// gone, the caller lacks the role the filter requires, the version moved on, or the write would
// leave the template without an owner. The repository cannot tell which; the service re-reads the
// document to find out. Authorisation lives in the filter so check and write are one operation.
var ErrTemplateNoMatch = errors.New("template write matched no document")

func templateObjectID(id string) (primitive.ObjectID, error) {
	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, fmt.Errorf("invalid template id: %w", err)
	}
	return objID, nil
}

// memberWith matches templates where userID holds a role that grants a.
func memberWith(userID primitive.ObjectID, a models.TemplateAction) bson.M {
	return bson.M{"members": bson.M{"$elemMatch": bson.M{
		"userId": userID,
		"role":   bson.M{"$in": models.RolesWith(a)},
	}}}
}

// keepsAnOwnerWithout matches templates that still have an owner once userID stops being one:
// userID is a member below owner, or some other member is an owner.
func keepsAnOwnerWithout(userID primitive.ObjectID) bson.M {
	return bson.M{"$or": bson.A{
		bson.M{"members": bson.M{"$elemMatch": bson.M{"userId": userID, "role": bson.M{"$ne": models.RoleOwner}}}},
		bson.M{"members": bson.M{"$elemMatch": bson.M{"userId": bson.M{"$ne": userID}, "role": models.RoleOwner}}},
	}}
}

// conditionalUpdate runs one UpdateOne and maps "nothing matched" to ErrTemplateNoMatch.
func (r *TemplateRepository) conditionalUpdate(filter, update bson.M, opts ...*options.UpdateOptions) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	res, err := r.collection.UpdateOne(ctx, filter, update, opts...)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrTemplateNoMatch
	}
	return nil
}

// ListVisibleToMember returns templates the user may use when creating a game: every one they are
// a member of and every public one, newest first. Token-config templates are excluded — they are
// not selectable game systems. This is the query half of service.CanOnTemplate(…, ActionUse).
func (r *TemplateRepository) ListVisibleToMember(userID primitive.ObjectID) ([]models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"$or": bson.A{
			// Mongo matches an array field element-wise: "some member has this userId".
			bson.M{"members.userId": userID},
			bson.M{"isPublic": true},
		},
		"baseSystem": bson.M{"$in": bson.A{"", nil}},
	}
	cursor, err := r.collection.Find(ctx, filter, options.Find().SetSort(bson.M{"createdAt": -1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var templates []models.SystemTemplate
	if err := cursor.All(ctx, &templates); err != nil {
		return nil, err
	}
	return templates, nil
}

// FindTokenConfig returns the user's token-config singleton for a hardcoded system, or (nil, nil)
// when none exists yet. GetOrCreateTokenConfig enforces the singleton per (owner, baseSystem).
func (r *TemplateRepository) FindTokenConfig(userID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"baseSystem": baseSystem,
		"members":    bson.M{"$elemMatch": bson.M{"userId": userID, "role": models.RoleOwner}},
	}
	var t models.SystemTemplate
	err := r.collection.FindOne(ctx, filter).Decode(&t)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// UpdateContent saves name/sections/settings when the stored version still equals version and
// editorID may edit — optimistic locking with the authorisation in the same filter. The filter
// checks version even when nothing changes: a stale client is stale regardless of its payload.
// Only a real content change (bumpVersion, decided by the service) increments version — lobby
// compares it with each game's embedded copy to offer a sync — and records editorID in updatedBy.
func (r *TemplateRepository) UpdateContent(id string, version int, editorID primitive.ObjectID, name *string, sections []models.SectionDef, settings *models.TemplateSettings, bumpVersion bool) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	set := bson.M{"updatedAt": time.Now()}
	if name != nil {
		set["name"] = *name
	}
	if sections != nil {
		set["sections"] = sections
	}
	if settings != nil {
		set["settings"] = *settings
	}
	update := bson.M{"$set": set}
	if bumpVersion {
		update["$inc"] = bson.M{"version": 1}
		set["updatedBy"] = editorID
	}
	filter := memberWith(editorID, models.ActionEdit)
	filter["_id"] = objID
	filter["version"] = version
	return r.conditionalUpdate(filter, update)
}

// SetVisibility sets isPublic when callerID may share. Version is untouched: who may open a
// template changes nothing about its content.
func (r *TemplateRepository) SetVisibility(id string, callerID primitive.ObjectID, isPublic bool) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := memberWith(callerID, models.ActionShare)
	filter["_id"] = objID
	return r.conditionalUpdate(filter, bson.M{"$set": bson.M{"isPublic": isPublic, "updatedAt": time.Now()}})
}

// AddMember appends member when callerID may share and member.UserID is not yet a member.
func (r *TemplateRepository) AddMember(id string, callerID primitive.ObjectID, member models.TemplateMember) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := bson.M{"_id": objID, "$and": bson.A{
		memberWith(callerID, models.ActionShare),
		bson.M{"members.userId": bson.M{"$ne": member.UserID}},
	}}
	return r.conditionalUpdate(filter, bson.M{
		"$push": bson.M{"members": member},
		"$set":  bson.M{"updatedAt": time.Now()},
	})
}

// SetMemberRole changes targetID's role when callerID may share. Any role below owner also
// requires the template to keep another owner, so two owners demoting each other at the same
// moment cannot both succeed.
func (r *TemplateRepository) SetMemberRole(id string, callerID, targetID primitive.ObjectID, role string) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	conds := bson.A{memberWith(callerID, models.ActionShare), bson.M{"members.userId": targetID}}
	if role != models.RoleOwner {
		conds = append(conds, keepsAnOwnerWithout(targetID))
	}
	return r.conditionalUpdate(
		bson.M{"_id": objID, "$and": conds},
		bson.M{"$set": bson.M{"members.$[m].role": role, "updatedAt": time.Now()}},
		options.Update().SetArrayFilters(options.ArrayFilters{Filters: []interface{}{bson.M{"m.userId": targetID}}}),
	)
}

// RemoveMember pulls targetID when callerID may share and the template keeps an owner.
func (r *TemplateRepository) RemoveMember(id string, callerID, targetID primitive.ObjectID) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := bson.M{"_id": objID, "$and": bson.A{
		memberWith(callerID, models.ActionShare),
		bson.M{"members.userId": targetID},
		keepsAnOwnerWithout(targetID),
	}}
	return r.conditionalUpdate(filter, bson.M{
		"$pull": bson.M{"members": bson.M{"userId": targetID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	})
}

// Leave pulls userID from the members of a template they belong to, unless they are its last owner.
func (r *TemplateRepository) Leave(id string, userID primitive.ObjectID) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := bson.M{"_id": objID, "$and": bson.A{
		bson.M{"members.userId": userID},
		keepsAnOwnerWithout(userID),
	}}
	return r.conditionalUpdate(filter, bson.M{
		"$pull": bson.M{"members": bson.M{"userId": userID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	})
}

// DeleteAsMember deletes the template when callerID holds a role that may delete it.
func (r *TemplateRepository) DeleteAsMember(id string, callerID primitive.ObjectID) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	filter := memberWith(callerID, models.ActionDelete)
	filter["_id"] = objID
	res, err := r.collection.DeleteOne(ctx, filter)
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrTemplateNoMatch
	}
	return nil
}

// PullMemberEverywhere removes a deleted account from every template. A template whose only owner
// it was is left ownerless — usable by its members, editable by nobody (PLAYRPG-279 leaves
// reassigning an owner to a separate admin ticket).
func (r *TemplateRepository) PullMemberEverywhere(userID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := r.collection.UpdateMany(ctx,
		bson.M{"members.userId": userID},
		bson.M{"$pull": bson.M{"members": bson.M{"userId": userID}}},
	)
	return err
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./internal/repository/`
Expected: `ok`. If a `mustContain` fragment fails only on formatting (e.g. relaxed JSON prints the `$in` array differently), print the actual filter from the failure message and fix the expected fragment — do not loosen the assertion to something that no longer pins the role.

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-backend/internal/repository/TemplateRepository.go warhammer-battle-helper-backend/internal/repository/TemplateMembers_test.go && \
git commit -m "feat: PLAYRPG-279 member-based conditional template writes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 3: Switch service and HTTP layer to members; remove single-owner model

One commit: removing `OwnerID` / `SharedWith` breaks every reader at compile time, so service, handlers and their tests move together. The compiler is the checklist — `go build ./...` must list zero errors before the tests run.

**Files:**
- Modify: `internal/models/SystemTemplate.go` (remove old fields + `TemplateShare` + `ShareTemplateRequest`; new request types)
- Modify: `internal/service/authz.go` (remove `CanUseTemplate`)
- Rewrite: `internal/service/TemplateService.go`
- Modify: `internal/repository/TemplateRepository.go` (remove `ListVisibleToUser`, `FindByOwnerAndBaseSystem`, `Update`, `AddShare`, `RemoveShare`, `updateShares`, `Delete`)
- Modify: `internal/http/TemplateHandler.go`, `internal/http/GameHandler.go:84,108`, `internal/http/AdminHandler.go` (`DeleteUser` + struct), `cmd/warhammer-battle-helper/main.go:203-211,370`
- Tests: rewrite `internal/service/TemplateService_test.go`; edit `internal/service/authz_test.go` (delete `TestCanUseTemplate`); edit `internal/repository/TemplateRepository_test.go` (delete `TestTemplateRepository_AddShare`, `TestTemplateRepository_RemoveShare`, `TestTemplateRepository_Update_Version` — superseded by Task 2 tests); edit `internal/service/template_content_changed_test.go:25-26` (drop `IsPublic`).

**Interfaces:**
- Consumes: Task 1 + Task 2 symbols.
- Produces (service): sentinels `ErrTemplateNotFound` ("template not found"), `ErrTemplateForbidden` ("not authorized"), `ErrTemplateVersionRequired` ("version is required"), `ErrTemplateLastOwner` ("template must keep at least one owner"), `ErrTemplateMemberNotFound` ("member not found"), `ErrTemplateInvalidRole` ("invalid role"), `ErrTemplateNotShareable` ("token config templates cannot be shared"), `ErrShareUserNotFound` ("user not found"), `ErrShareSelf` ("cannot share with yourself"); `type TemplateConflictError struct{Version int; UpdatedBy string; UpdatedAt time.Time}`; methods `ListForUser`, `Get` (unchanged, internal), `GetForUser`, `Create`, `FindTokenConfig`, `GetOrCreateTokenConfig`, `GetVersionsByIDs` (unchanged), `Update`, `SetVisibility`, `AddMember`, `SetMemberRole`, `RemoveMember`, `Leave`, `Clone`, `Delete`, `RemoveUserEverywhere`.
- Produces (HTTP): routes and JSON per spec — 409 body `{"error":"version conflict","version":N,"updatedBy":"email","updatedAt":"…"}`.

- [ ] **Step 1: Models — remove old, add requests**

In `SystemTemplate.go`:
- Delete the `TemplateShare` type and its comment.
- In `SystemTemplate` delete `OwnerID`, `SharedWith`, `SharedWithUsers`, `IsOwner`, `SharedWithMe`, `OwnerEmail` with their comments. Update the `IsPublic` comment to: `// IsPublic lets every logged-in user use (create a game from, clone) the template. Editing still needs a member role.`
- Replace `UpdateTemplateRequest` and `ShareTemplateRequest` with:

```go
// UpdateTemplateRequest is the request body for PATCH /templates/:id. Version is the template
// version the client last saw; the save is refused with 409 when it is stale.
type UpdateTemplateRequest struct {
	Name     *string           `json:"name"`
	Sections []SectionDef      `json:"sections"`
	Settings *TemplateSettings `json:"settings"`
	Version  *int              `json:"version"`
}

// SetTemplateVisibilityRequest is the request body for PATCH /templates/:id/visibility.
type SetTemplateVisibilityRequest struct {
	IsPublic *bool `json:"isPublic" binding:"required"`
}

// AddTemplateMemberRequest is the request body for POST /templates/:id/members.
type AddTemplateMemberRequest struct {
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role" binding:"required"`
}

// SetTemplateMemberRoleRequest is the request body for PATCH /templates/:id/members/:userId.
type SetTemplateMemberRoleRequest struct {
	Role string `json:"role" binding:"required"`
}
```

- [ ] **Step 2: authz — remove `CanUseTemplate`** (function and its doc comment) from `authz.go`; delete `TestCanUseTemplate` from `authz_test.go`.

- [ ] **Step 3: Repository — remove the old ownership methods** listed under Files, with their comments. Delete the three superseded tests in `TemplateRepository_test.go` (keep `TestTemplateRepository_GetVersionsByIDs`; drop imports that become unused).

- [ ] **Step 4: Rewrite `internal/service/TemplateService.go`**

Keep `templateContentChanged` and `sameJSON` exactly as they are (bottom of the file). Replace everything above them with:

```go
package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// Template errors. The messages are stable codes: handlers send them verbatim and the creator
// maps them to translated text (memberErrorKey in TemplateAccessCard.jsx).
var (
	ErrTemplateNotFound        = errors.New("template not found")
	ErrTemplateForbidden       = errors.New("not authorized")
	ErrTemplateVersionRequired = errors.New("version is required")
	ErrTemplateLastOwner       = errors.New("template must keep at least one owner")
	ErrTemplateMemberNotFound  = errors.New("member not found")
	ErrTemplateInvalidRole     = errors.New("invalid role")
	ErrTemplateNotShareable    = errors.New("token config templates cannot be shared")
	ErrShareUserNotFound       = errors.New("user not found")
	ErrShareSelf               = errors.New("cannot share with yourself")
)

// TemplateConflictError rejects a save made against a version somebody else has already
// replaced. It carries what the creator shows before the user picks "load theirs" or "overwrite":
// the version to overwrite with, and who saved it when.
type TemplateConflictError struct {
	Version   int
	UpdatedBy string // email; "" when the account could not be resolved
	UpdatedAt time.Time
}

func (e *TemplateConflictError) Error() string { return "version conflict" }

type TemplateService struct {
	repo     *repository.TemplateRepository
	userRepo *repository.UserRepository
}

func NewTemplateService(repo *repository.TemplateRepository, userRepo *repository.UserRepository) *TemplateService {
	return &TemplateService{repo: repo, userRepo: userRepo}
}

// load reads a template; any read failure is reported as not found, as before PLAYRPG-279.
func (s *TemplateService) load(id string) (*models.SystemTemplate, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrTemplateNotFound
	}
	return t, nil
}

// deny picks the error for a user lacking an action. Somebody who cannot even use the template
// must not learn it exists, so they get "not found" rather than "not authorized".
func deny(t *models.SystemTemplate, userID primitive.ObjectID) error {
	if CanOnTemplate(t, userID, models.ActionUse) {
		return ErrTemplateForbidden
	}
	return ErrTemplateNotFound
}

func (s *TemplateService) loadFor(id string, userID primitive.ObjectID, a models.TemplateAction) (*models.SystemTemplate, error) {
	t, err := s.load(id)
	if err != nil {
		return nil, err
	}
	if !CanOnTemplate(t, userID, a) {
		return nil, deny(t, userID)
	}
	return t, nil
}

// loadForShare is loadFor(ActionShare) that also refuses token-config singletons, which are
// private per user and have no access card.
func (s *TemplateService) loadForShare(id string, callerID primitive.ObjectID) (*models.SystemTemplate, error) {
	t, err := s.loadFor(id, callerID, models.ActionShare)
	if err != nil {
		return nil, err
	}
	if t.BaseSystem != "" {
		return nil, ErrTemplateNotShareable
	}
	return t, nil
}

// stamp sets the per-request role fields that need no database lookup.
func stamp(t *models.SystemTemplate, viewerID primitive.ObjectID) {
	t.MyRole = RoleOf(t, viewerID)
	t.Permissions = PermissionsFor(t, viewerID)
}

// decorate fills every per-request field for viewerID, resolving all needed emails in ONE
// FindByIDs across the batch — a query per template would turn a lobby load into N+1.
// MembersView goes only to viewers who may share; OwnerEmails only to members below owner.
// Role and permissions are set before the lookup, so a failed lookup costs the emails, never the
// gating: callers log the error and still answer.
func (s *TemplateService) decorate(templates []*models.SystemTemplate, viewerID primitive.ObjectID) error {
	var ids []primitive.ObjectID
	seen := make(map[primitive.ObjectID]bool)
	for _, t := range templates {
		stamp(t, viewerID)
		for _, m := range t.Members {
			wanted := t.Permissions.Share || (t.MyRole != "" && m.Role == models.RoleOwner)
			if wanted && !seen[m.UserID] {
				seen[m.UserID] = true
				ids = append(ids, m.UserID)
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
		if t.Permissions.Share {
			views := make([]models.TemplateMemberView, 0, len(t.Members))
			for _, m := range t.Members {
				// An id with no account behind it is skipped: a list hiding one dead row beats a
				// creator that cannot open.
				if email, ok := emails[m.UserID]; ok {
					views = append(views, models.TemplateMemberView{UserID: m.UserID, Email: email, Role: m.Role, IsMe: m.UserID == viewerID})
				}
			}
			t.MembersView = views
			continue
		}
		if t.MyRole == "" {
			continue
		}
		for _, m := range t.Members {
			if email, ok := emails[m.UserID]; ok && m.Role == models.RoleOwner {
				t.OwnerEmails = append(t.OwnerEmails, email)
			}
		}
	}
	return nil
}

func (s *TemplateService) decorateOrLog(templates []*models.SystemTemplate, viewerID primitive.ObjectID) {
	if err := s.decorate(templates, viewerID); err != nil {
		log.Printf("warn: failed to resolve template member emails for user %s: %v", viewerID.Hex(), err)
	}
}

// listMembers re-reads the template and answers with its members as stored, never a list the
// handler assembled optimistically. Always a non-nil slice, so the client gets [] and not null.
func (s *TemplateService) listMembers(id string, callerID primitive.ObjectID) ([]models.TemplateMemberView, error) {
	t, err := s.load(id)
	if err != nil {
		return nil, err
	}
	if err := s.decorate([]*models.SystemTemplate{t}, callerID); err != nil {
		return nil, err
	}
	if t.MembersView == nil {
		return []models.TemplateMemberView{}, nil
	}
	return t.MembersView, nil
}

// explainNoMatch names the condition that made a conditional member write match nothing, by
// re-reading the template: gone, caller lost the share role, target is no member, or — the
// remaining guard in the filter — the write would have left no owner. A zero targetID is a write
// with no target guard (visibility, add): once share holds, only a concurrent delete is left.
func (s *TemplateService) explainNoMatch(id string, callerID, targetID primitive.ObjectID) error {
	t, err := s.load(id)
	if err != nil {
		return ErrTemplateNotFound
	}
	if !CanOnTemplate(t, callerID, models.ActionShare) {
		return deny(t, callerID)
	}
	if targetID.IsZero() {
		return ErrTemplateNotFound
	}
	if RoleOf(t, targetID) == "" {
		return ErrTemplateMemberNotFound
	}
	return ErrTemplateLastOwner
}

func (s *TemplateService) ListForUser(viewerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	templates, err := s.repo.ListVisibleToMember(viewerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	refs := make([]*models.SystemTemplate, len(templates))
	for i := range templates {
		refs[i] = &templates[i]
	}
	// Emails are decoration: useTemplates.js swallows a fetch error wholesale, so failing here
	// would empty the whole lobby over a problem with one column.
	s.decorateOrLog(refs, viewerID)
	return templates, nil
}

// Get reads a template with no access check. Internal callers only (game creation checks
// CanOnTemplate itself; SyncTemplate re-reads the template a game was created from, which its GM
// keeps the right to do even after losing access). HTTP reads go through GetForUser.
func (s *TemplateService) Get(id string) (*models.SystemTemplate, error) {
	return s.load(id)
}

// GetForUser reads a template the viewer may use. Without access it is "not found", so ids
// cannot be probed for existence.
func (s *TemplateService) GetForUser(id string, viewerID primitive.ObjectID) (*models.SystemTemplate, error) {
	t, err := s.loadFor(id, viewerID, models.ActionUse)
	if err != nil {
		return nil, err
	}
	s.decorateOrLog([]*models.SystemTemplate{t}, viewerID)
	return t, nil
}

func (s *TemplateService) Create(ownerID primitive.ObjectID, req models.CreateTemplateRequest) (*models.SystemTemplate, error) {
	if req.Sections == nil {
		req.Sections = []models.SectionDef{}
	}
	t := &models.SystemTemplate{
		Members:  []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}},
		Name:     req.Name,
		Sections: req.Sections,
		Settings: models.TemplateSettings{DiceButtons: models.DefaultDiceButtons()},
		// BaseSystem marks this as a named token-display variant of a hardcoded system
		// (FEATURE-102); "" keeps it a genuine custom template. Sections are ignored
		// when BaseSystem is set — the sheet comes from the Go plugin.
		BaseSystem: req.BaseSystem,
	}
	// Token-display variants (BaseSystem != "") carry no sheet, so only genuine custom
	// templates are checked.
	if t.BaseSystem == "" {
		if err := t.ValidateSingletonFields(); err != nil {
			return nil, err
		}
	}
	if err := s.repo.Create(t); err != nil {
		return nil, fmt.Errorf("failed to create template: %w", err)
	}
	// Without the per-request fields the fresh row would be filed under "public" by the client.
	s.decorateOrLog([]*models.SystemTemplate{t}, ownerID)
	return t, nil
}

// GetVersionsByIDs returns the current version of each still-existing template in ids.
func (s *TemplateService) GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	return s.repo.GetVersionsByIDs(ids)
}

// FindTokenConfig returns the user's token-display config singleton for a hardcoded system, or
// nil when not yet configured. Read-only — used when assembling game state.
func (s *TemplateService) FindTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	t, err := s.repo.FindTokenConfig(ownerID, baseSystem)
	if err != nil {
		return nil, err
	}
	if t != nil {
		stamp(t, ownerID)
	}
	return t, nil
}

// GetOrCreateTokenConfig returns the user's single token-display config for a hardcoded system,
// creating an empty one on first use. Sections stay empty; only Settings are meaningful.
func (s *TemplateService) GetOrCreateTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	existing, err := s.repo.FindTokenConfig(ownerID, baseSystem)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		stamp(existing, ownerID)
		return existing, nil
	}
	t := &models.SystemTemplate{
		Members:    []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}},
		Name:       baseSystem + " tokens",
		Sections:   []models.SectionDef{},
		Settings:   models.TemplateSettings{DiceButtons: models.DefaultDiceButtons()},
		BaseSystem: baseSystem,
	}
	if err := s.repo.Create(t); err != nil {
		return nil, fmt.Errorf("failed to create token config: %w", err)
	}
	stamp(t, ownerID)
	return t, nil
}

// Update saves content for a member who may edit. Order matters: permission first (a demoted
// editor with the creator still open gets 403, not a conflict), then the version.
func (s *TemplateService) Update(id string, editorID primitive.ObjectID, req models.UpdateTemplateRequest) (*models.SystemTemplate, error) {
	t, err := s.loadFor(id, editorID, models.ActionEdit)
	if err != nil {
		return nil, err
	}
	if req.Version == nil {
		return nil, ErrTemplateVersionRequired
	}
	if t.BaseSystem == "" {
		incoming := &models.SystemTemplate{Sections: req.Sections}
		if err := incoming.ValidateSingletonFields(); err != nil {
			return nil, err
		}
	}
	err = s.repo.UpdateContent(id, *req.Version, editorID, req.Name, req.Sections, req.Settings, templateContentChanged(t, req))
	if errors.Is(err, repository.ErrTemplateNoMatch) {
		return nil, s.saveRejection(id, editorID)
	}
	if err != nil {
		return nil, err
	}
	updated, err := s.load(id)
	if err != nil {
		return nil, err
	}
	// The creator replaces its template object with this response, so every per-request field
	// must be recomputed here or the UI would lose its members and permissions until a refetch.
	s.decorateOrLog([]*models.SystemTemplate{updated}, editorID)
	return updated, nil
}

// saveRejection explains an UpdateContent that matched nothing: the template is gone, the editor
// lost the role between read and write, or — the usual case — somebody saved first.
func (s *TemplateService) saveRejection(id string, editorID primitive.ObjectID) error {
	current, err := s.load(id)
	if err != nil {
		return ErrTemplateNotFound
	}
	if !CanOnTemplate(current, editorID, models.ActionEdit) {
		return deny(current, editorID)
	}
	conflict := &TemplateConflictError{Version: current.Version, UpdatedAt: current.UpdatedAt}
	if !current.UpdatedBy.IsZero() {
		if users, err := s.userRepo.FindByIDs([]primitive.ObjectID{current.UpdatedBy}); err == nil && len(users) == 1 {
			conflict.UpdatedBy = users[0].Email
		}
	}
	return conflict
}

// SetVisibility switches isPublic for a member who may share.
func (s *TemplateService) SetVisibility(id string, callerID primitive.ObjectID, isPublic bool) (*models.SystemTemplate, error) {
	if _, err := s.loadForShare(id, callerID); err != nil {
		return nil, err
	}
	if err := s.repo.SetVisibility(id, callerID, isPublic); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return nil, s.explainNoMatch(id, callerID, primitive.NilObjectID)
		}
		return nil, err
	}
	updated, err := s.load(id)
	if err != nil {
		return nil, err
	}
	s.decorateOrLog([]*models.SystemTemplate{updated}, callerID)
	return updated, nil
}

// AddMember grants the account behind email the given role and returns the member list. Adding
// somebody who is already a member changes their role instead.
//
// The share permission is confirmed BEFORE the address is resolved: FindByEmailCI's hit/miss split
// is itself sensitive ("this address has an account"), and resolving first would let any caller
// probe arbitrary addresses against any template id.
func (s *TemplateService) AddMember(id string, callerID primitive.ObjectID, email, role string) ([]models.TemplateMemberView, error) {
	if !models.IsValidRole(role) {
		return nil, ErrTemplateInvalidRole
	}
	t, err := s.loadForShare(id, callerID)
	if err != nil {
		return nil, err
	}
	target, err := s.userRepo.FindByEmailCI(email)
	if err != nil {
		// Only a genuine miss is "user not found"; an infrastructure failure must not be blamed
		// on the address the owner typed.
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrShareUserNotFound
		}
		return nil, err
	}
	if target.ID == callerID {
		return nil, ErrShareSelf
	}
	if RoleOf(t, target.ID) != "" {
		return s.SetMemberRole(id, callerID, target.ID, role)
	}
	err = s.repo.AddMember(id, callerID, models.TemplateMember{UserID: target.ID, Role: role})
	if errors.Is(err, repository.ErrTemplateNoMatch) {
		// Lost a race to another owner adding the same person: that is a role change now.
		if current, rerr := s.load(id); rerr == nil && RoleOf(current, target.ID) != "" {
			return s.SetMemberRole(id, callerID, target.ID, role)
		}
		return nil, s.explainNoMatch(id, callerID, primitive.NilObjectID)
	}
	if err != nil {
		return nil, err
	}
	return s.listMembers(id, callerID)
}

// SetMemberRole changes a member's role and returns the member list.
func (s *TemplateService) SetMemberRole(id string, callerID, targetID primitive.ObjectID, role string) ([]models.TemplateMemberView, error) {
	if !models.IsValidRole(role) {
		return nil, ErrTemplateInvalidRole
	}
	t, err := s.loadForShare(id, callerID)
	if err != nil {
		return nil, err
	}
	if RoleOf(t, targetID) == "" {
		return nil, ErrTemplateMemberNotFound
	}
	if err := s.repo.SetMemberRole(id, callerID, targetID, role); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return nil, s.explainNoMatch(id, callerID, targetID)
		}
		return nil, err
	}
	return s.listMembers(id, callerID)
}

// RemoveMember revokes a member's access and returns the remaining list.
func (s *TemplateService) RemoveMember(id string, callerID, targetID primitive.ObjectID) ([]models.TemplateMemberView, error) {
	t, err := s.loadForShare(id, callerID)
	if err != nil {
		return nil, err
	}
	if RoleOf(t, targetID) == "" {
		return nil, ErrTemplateMemberNotFound
	}
	if err := s.repo.RemoveMember(id, callerID, targetID); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return nil, s.explainNoMatch(id, callerID, targetID)
		}
		return nil, err
	}
	return s.listMembers(id, callerID)
}

// Leave removes the caller from a template's members. Leaving twice is not an error.
func (s *TemplateService) Leave(id string, userID primitive.ObjectID) error {
	t, err := s.load(id)
	if err != nil {
		return err
	}
	if RoleOf(t, userID) == "" {
		return ErrTemplateNotFound
	}
	if err := s.repo.Leave(id, userID); err != nil {
		if !errors.Is(err, repository.ErrTemplateNoMatch) {
			return err
		}
		current, rerr := s.load(id)
		if rerr != nil || RoleOf(current, userID) == "" {
			return nil
		}
		return ErrTemplateLastOwner
	}
	return nil
}

// Clone creates a private copy of a template the caller may use, owned by the caller alone.
func (s *TemplateService) Clone(sourceID string, ownerID primitive.ObjectID, name string) (*models.SystemTemplate, error) {
	src, err := s.loadFor(sourceID, ownerID, models.ActionUse)
	if err != nil {
		return nil, err
	}
	cloneName := name
	if cloneName == "" {
		cloneName = src.Name
	}
	clone := &models.SystemTemplate{
		Members:          []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}},
		Name:             cloneName,
		Sections:         src.Sections,
		Settings:         src.Settings,
		IsPublic:         false,
		OriginTemplateID: src.ID,
	}
	if err := s.repo.Create(clone); err != nil {
		return nil, fmt.Errorf("failed to clone template: %w", err)
	}
	s.decorateOrLog([]*models.SystemTemplate{clone}, ownerID)
	return clone, nil
}

// Delete removes a template for a member who may delete it.
func (s *TemplateService) Delete(id string, callerID primitive.ObjectID) error {
	if _, err := s.loadFor(id, callerID, models.ActionDelete); err != nil {
		return err
	}
	if err := s.repo.DeleteAsMember(id, callerID); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return ErrTemplateNotFound
		}
		return err
	}
	return nil
}

// RemoveUserEverywhere drops a deleted account from every template's members.
func (s *TemplateService) RemoveUserEverywhere(userID primitive.ObjectID) error {
	return s.repo.PullMemberEverywhere(userID)
}
```

(`bytes` and `encoding/json` stay imported for `sameJSON`.)

- [ ] **Step 5: Handlers**

Replace the body of `internal/http/TemplateHandler.go` below `ListTemplates` (keep `ListTemplates` and `mustUserID`) with:

```go
// CreateTemplate creates a new system template owned by the caller.
func (h *TemplateHandler) CreateTemplate(c *gin.Context) {
	var req models.CreateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	t, err := h.TemplateService.Create(mustUserID(c), req)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, t)
}

// GetTemplate returns a single template the caller may use.
func (h *TemplateHandler) GetTemplate(c *gin.Context) {
	t, err := h.TemplateService.GetForUser(c.Param("id"), mustUserID(c))
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, t)
}

// UpdateTemplate saves name, sections and settings, guarded by the version the client last saw.
func (h *TemplateHandler) UpdateTemplate(c *gin.Context) {
	var req models.UpdateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.TemplateService.Update(c.Param("id"), mustUserID(c), req)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// SetTemplateVisibility switches isPublic; owner-only, kept out of the autosave body.
func (h *TemplateHandler) SetTemplateVisibility(c *gin.Context) {
	var req models.SetTemplateVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.TemplateService.SetVisibility(c.Param("id"), mustUserID(c), *req.IsPublic)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// CloneTemplate creates a private copy of a usable template for the caller.
func (h *TemplateHandler) CloneTemplate(c *gin.Context) {
	var req models.CloneTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clone, err := h.TemplateService.Clone(c.Param("id"), mustUserID(c), req.Name)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, clone)
}

// AddTemplateMember grants an account, named by email, a role. Every member endpoint answers
// with the full member list, so the client never merges a partial response into what it shows.
func (h *TemplateHandler) AddTemplateMember(c *gin.Context) {
	var req models.AddTemplateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	members, err := h.TemplateService.AddMember(c.Param("id"), mustUserID(c), req.Email, req.Role)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// SetTemplateMemberRole changes one member's role.
func (h *TemplateHandler) SetTemplateMemberRole(c *gin.Context) {
	targetID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req models.SetTemplateMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	members, err := h.TemplateService.SetMemberRole(c.Param("id"), mustUserID(c), targetID, req.Role)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// RemoveTemplateMember revokes one member's access.
func (h *TemplateHandler) RemoveTemplateMember(c *gin.Context) {
	targetID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	members, err := h.TemplateService.RemoveMember(c.Param("id"), mustUserID(c), targetID)
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// LeaveTemplate removes the caller from a template's members; the client needs no own user id.
func (h *TemplateHandler) LeaveTemplate(c *gin.Context) {
	if err := h.TemplateService.Leave(c.Param("id"), mustUserID(c)); err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteTemplate deletes a template the caller may delete.
func (h *TemplateHandler) DeleteTemplate(c *gin.Context) {
	if err := h.TemplateService.Delete(c.Param("id"), mustUserID(c)); err != nil {
		writeTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// writeTemplateError maps service errors onto status codes. The body's error string is the
// sentinel's stable message; the creator tells cases with the same status apart by it.
func writeTemplateError(c *gin.Context, err error) {
	var conflict *service.TemplateConflictError
	switch {
	case errors.As(err, &conflict):
		c.JSON(http.StatusConflict, gin.H{
			"error":     conflict.Error(),
			"version":   conflict.Version,
			"updatedBy": conflict.UpdatedBy,
			"updatedAt": conflict.UpdatedAt,
		})
		return
	case models.IsTemplateValidationError(err),
		errors.Is(err, service.ErrTemplateVersionRequired),
		errors.Is(err, service.ErrTemplateLastOwner),
		errors.Is(err, service.ErrTemplateInvalidRole),
		errors.Is(err, service.ErrTemplateNotShareable),
		errors.Is(err, service.ErrShareSelf):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrTemplateForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrTemplateNotFound),
		errors.Is(err, service.ErrTemplateMemberNotFound),
		errors.Is(err, service.ErrShareUserNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
```

Add `"errors"` to its imports. Delete `ShareTemplate`, `UnshareTemplate`, `writeShareError`.

- [ ] **Step 6: Routes (`cmd/warhammer-battle-helper/main.go`)**

Replace the template routes block (lines ~203-211) with:

```go
	// System templates (custom creator)
	auth.GET("/templates", templateHandler.ListTemplates)
	auth.POST("/templates", templateHandler.CreateTemplate)
	auth.GET("/templates/:id", templateHandler.GetTemplate)
	auth.PATCH("/templates/:id", templateHandler.UpdateTemplate)
	auth.PATCH("/templates/:id/visibility", templateHandler.SetTemplateVisibility)
	auth.POST("/templates/:id/clone", templateHandler.CloneTemplate)
	auth.POST("/templates/:id/members", templateHandler.AddTemplateMember)
	auth.PATCH("/templates/:id/members/:userId", templateHandler.SetTemplateMemberRole)
	auth.DELETE("/templates/:id/members/:userId", templateHandler.RemoveTemplateMember)
	auth.DELETE("/templates/:id/membership", templateHandler.LeaveTemplate)
	auth.DELETE("/templates/:id", templateHandler.DeleteTemplate)
```

and the admin handler construction (line ~370) with:

```go
	adminHandler := http.AdminHandler{AdminRepo: adminRepo, SystemAccess: systemAccessService, Templates: templateService}
```

- [ ] **Step 7: GameHandler + AdminHandler**

`GameHandler.go` — both `!service.CanUseTemplate(t, userID)` (lines ~84, ~108) become `!service.CanOnTemplate(t, userID, models.ActionUse)`.

`AdminHandler.go` — add field `Templates *service.TemplateService` to `AdminHandler` (import `battle-helper/internal/service` if not yet imported). In `DeleteUser`, between the `SystemAccess.RemoveUser` block and `AdminRepo.DeleteUser`, add:

```go
	// Same reasoning: losing template memberships before a failed delete is harmless and retryable.
	if err := h.Templates.RemoveUserEverywhere(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
```

- [ ] **Step 8: Fix remaining compile errors**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./...`
Expected after fixes: no output. In `template_content_changed_test.go` lines 25-26: remove `IsPublic: &yes` from the first case and delete the `"visibility only"` case (visibility no longer travels in this request); drop `yes` if unused. Any other error is a reader of a removed field — move it to `Members` / `RoleOf` / `CanOnTemplate`, never re-add the field.

- [ ] **Step 9: Rewrite service tests**

Replace `internal/service/TemplateService_test.go` with:

```go
package service

import (
	"errors"
	"testing"
	"time"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func member(id primitive.ObjectID, role string) models.TemplateMember {
	return models.TemplateMember{UserID: id, Role: role}
}

func templateDoc(id primitive.ObjectID, name string, public bool, members ...models.TemplateMember) bson.D {
	ms := bson.A{}
	for _, m := range members {
		ms = append(ms, bson.D{{Key: "userId", Value: m.UserID}, {Key: "role", Value: m.Role}})
	}
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "name", Value: name},
		{Key: "isPublic", Value: public},
		{Key: "version", Value: 1},
		{Key: "members", Value: ms},
	}
}

func found(docs ...bson.D) bson.D {
	return mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch, docs...)
}

func users(pairs ...interface{}) bson.D {
	var docs []bson.D
	for i := 0; i < len(pairs); i += 2 {
		docs = append(docs, bson.D{{Key: "_id", Value: pairs[i]}, {Key: "email", Value: pairs[i+1]}})
	}
	return mtest.CreateCursorResponse(0, "db.users", mtest.FirstBatch, docs...)
}

var (
	wrote   = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}}
	matched0 = bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 0}, {Key: "nModified", Value: 0}}
)

func newSvc(mt *mtest.T) *TemplateService {
	// Both repositories read the same mocked collection; responses are consumed in call order.
	return NewTemplateService(repository.NewTemplateRepository(mt.Coll), repository.NewUserRepository(mt.Coll))
}

func TestListForUser_Decoration(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("owners see members, other members see owners, public strangers see neither", func(mt *mtest.T) {
		svc := newSvc(mt)
		viewer, alice := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			found(
				templateDoc(primitive.NewObjectID(), "Own", false, member(viewer, models.RoleOwner), member(alice, models.RoleViewer)),
				templateDoc(primitive.NewObjectID(), "Public", true, member(alice, models.RoleOwner)),
				templateDoc(primitive.NewObjectID(), "Edits", false, member(alice, models.RoleOwner), member(viewer, models.RoleEditor)),
			),
			users(viewer, "me@example.com", alice, "alice@example.com"),
		)

		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatal(err)
		}
		by := map[string]models.SystemTemplate{}
		for _, tpl := range got {
			by[tpl.Name] = tpl
		}

		own := by["Own"]
		if own.MyRole != models.RoleOwner || own.Permissions != (models.TemplatePermissions{Edit: true, Share: true, Delete: true}) {
			t.Errorf("Own: role %q perms %+v", own.MyRole, own.Permissions)
		}
		if len(own.MembersView) != 2 || own.OwnerEmails != nil {
			t.Errorf("Own: members %+v ownerEmails %v", own.MembersView, own.OwnerEmails)
		}
		for _, m := range own.MembersView {
			if m.IsMe != (m.UserID == viewer) {
				t.Errorf("Own: IsMe wrong on %+v", m)
			}
		}

		pub := by["Public"]
		if pub.MyRole != "" || pub.Permissions != (models.TemplatePermissions{}) || pub.MembersView != nil || pub.OwnerEmails != nil {
			t.Errorf("Public must reveal nothing: %+v", pub)
		}

		edits := by["Edits"]
		if edits.MyRole != models.RoleEditor || edits.Permissions != (models.TemplatePermissions{Edit: true}) {
			t.Errorf("Edits: role %q perms %+v", edits.MyRole, edits.Permissions)
		}
		if edits.MembersView != nil || len(edits.OwnerEmails) != 1 || edits.OwnerEmails[0] != "alice@example.com" {
			t.Errorf("Edits: members %+v ownerEmails %v", edits.MembersView, edits.OwnerEmails)
		}

		finds := 0
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "find" {
				finds++
			}
		}
		if finds != 2 {
			t.Errorf("expected 2 finds (templates + one batched user lookup), got %d", finds)
		}
	})

	mt.Run("a failed email lookup keeps roles and permissions", func(mt *mtest.T) {
		svc := newSvc(mt)
		viewer, alice := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			found(templateDoc(primitive.NewObjectID(), "Edits", false, member(alice, models.RoleOwner), member(viewer, models.RoleEditor))),
			mtest.CreateCommandErrorResponse(mtest.CommandError{Code: 1, Message: "users unavailable"}),
		)
		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatalf("emails are decoration; their failure must not fail the list: %v", err)
		}
		if got[0].MyRole != models.RoleEditor || !got[0].Permissions.Edit {
			t.Errorf("gating must survive a failed lookup: %+v", got[0])
		}
	})
}

func TestUpdate_Authorisation(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	owner, editor, viewer, stranger := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	id := primitive.NewObjectID()
	doc := templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor), member(viewer, models.RoleViewer))
	v := 1

	mt.Run("viewer gets forbidden before any version check", func(mt *mtest.T) {
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), viewer, models.UpdateTemplateRequest{})
		if !errors.Is(err, ErrTemplateForbidden) {
			t.Errorf("err = %v, want ErrTemplateForbidden", err)
		}
	})

	mt.Run("stranger gets not found", func(mt *mtest.T) {
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), stranger, models.UpdateTemplateRequest{Version: &v})
		if !errors.Is(err, ErrTemplateNotFound) {
			t.Errorf("err = %v, want ErrTemplateNotFound", err)
		}
	})

	mt.Run("missing version is rejected", func(mt *mtest.T) {
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), editor, models.UpdateTemplateRequest{})
		if !errors.Is(err, ErrTemplateVersionRequired) {
			t.Errorf("err = %v, want ErrTemplateVersionRequired", err)
		}
	})

	mt.Run("stale version is a conflict naming who saved", func(mt *mtest.T) {
		saved := time.Date(2026, 10, 20, 14, 32, 0, 0, time.UTC)
		current := bson.D{
			{Key: "_id", Value: id},
			{Key: "name", Value: "T"},
			{Key: "isPublic", Value: false},
			{Key: "version", Value: 7},
			{Key: "members", Value: bson.A{
				bson.D{{Key: "userId", Value: owner}, {Key: "role", Value: models.RoleOwner}},
				bson.D{{Key: "userId", Value: editor}, {Key: "role", Value: models.RoleEditor}},
			}},
			{Key: "updatedBy", Value: owner},
			{Key: "updatedAt", Value: saved},
		}
		mt.AddMockResponses(found(doc), matched0, found(current), users(owner, "owner@example.com"))

		_, err := newSvc(mt).Update(id.Hex(), editor, models.UpdateTemplateRequest{Version: &v})
		var conflict *TemplateConflictError
		if !errors.As(err, &conflict) {
			t.Fatalf("err = %v, want *TemplateConflictError", err)
		}
		if conflict.Version != 7 || conflict.UpdatedBy != "owner@example.com" || !conflict.UpdatedAt.Equal(saved) {
			t.Errorf("conflict = %+v", conflict)
		}
	})
}

func TestMembers(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	owner, editor := primitive.NewObjectID(), primitive.NewObjectID()
	id := primitive.NewObjectID()

	mt.Run("a non-owner cannot probe addresses", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor))))
		_, err := newSvc(mt).AddMember(id.Hex(), editor, "nobody@example.com", models.RoleViewer)
		if !errors.Is(err, ErrTemplateForbidden) {
			t.Errorf("err = %v, want ErrTemplateForbidden", err)
		}
		if n := len(mt.GetAllStartedEvents()); n != 1 {
			t.Errorf("the address must not be resolved before authorisation: %d commands", n)
		}
	})

	mt.Run("an unknown role is rejected", func(mt *mtest.T) {
		_, err := newSvc(mt).AddMember(id.Hex(), owner, "x@example.com", "admin")
		if !errors.Is(err, ErrTemplateInvalidRole) {
			t.Errorf("err = %v, want ErrTemplateInvalidRole", err)
		}
	})

	mt.Run("demoting the last owner is refused", func(mt *mtest.T) {
		solo := templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor))
		mt.AddMockResponses(found(solo), matched0, found(solo))
		_, err := newSvc(mt).SetMemberRole(id.Hex(), owner, owner, models.RoleEditor)
		if !errors.Is(err, ErrTemplateLastOwner) {
			t.Errorf("err = %v, want ErrTemplateLastOwner", err)
		}
	})

	mt.Run("the last owner cannot leave; a viewer can", func(mt *mtest.T) {
		solo := templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleViewer))
		mt.AddMockResponses(found(solo), matched0, found(solo))
		if err := newSvc(mt).Leave(id.Hex(), owner); !errors.Is(err, ErrTemplateLastOwner) {
			t.Errorf("owner leave err = %v, want ErrTemplateLastOwner", err)
		}
		mt.AddMockResponses(found(solo), wrote)
		if err := newSvc(mt).Leave(id.Hex(), editor); err != nil {
			t.Errorf("viewer leave err = %v, want nil", err)
		}
	})

	mt.Run("an editor cannot delete", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner), member(editor, models.RoleEditor))))
		if err := newSvc(mt).Delete(id.Hex(), editor); !errors.Is(err, ErrTemplateForbidden) {
			t.Errorf("err = %v, want ErrTemplateForbidden", err)
		}
	})

	mt.Run("a stranger reading a private template gets not found", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner))))
		if _, err := newSvc(mt).GetForUser(id.Hex(), primitive.NewObjectID()); !errors.Is(err, ErrTemplateNotFound) {
			t.Errorf("err = %v, want ErrTemplateNotFound", err)
		}
	})
}
```

- [ ] **Step 10: Run all backend tests**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Expected: all `ok`. A test that consumes mock responses in a different order than the service issues commands fails with a decode error — reorder the mocks to the actual call sequence (`GetByID` → write → `GetByID` → users), do not change the service to fit the test.

- [ ] **Step 11: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-backend/internal warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go && \
git status --short && \
git commit -m "feat: PLAYRPG-279 template members replace single owner and share list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

(Check `git status --short` output before the commit lands: only backend files may be staged.)

---

### Task 4: Data migration

**Files:**
- Create: `warhammer-battle-helper-backend/cmd/migrate-template-members/main.go`
- Create: `warhammer-battle-helper-backend/cmd/migrate-template-members/main_test.go`
- Modify: `DEPLOY.md` (new section next to the dnd5e→srd5 one)

**Interfaces:**
- Consumes: `models.TemplateMember`, `models.RoleOwner`, `models.RoleViewer`.
- Produces: `membersFor(ownerID primitive.ObjectID, sharedWith []primitive.ObjectID) []models.TemplateMember`.

- [ ] **Step 1: Failing test**

```go
package main

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestMembersFor(t *testing.T) {
	owner, a, b := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

	got := membersFor(owner, []primitive.ObjectID{a, owner, b, a})
	want := []models.TemplateMember{
		{UserID: owner, Role: models.RoleOwner},
		{UserID: a, Role: models.RoleViewer},
		{UserID: b, Role: models.RoleViewer},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}

	if solo := membersFor(owner, nil); len(solo) != 1 || solo[0].Role != models.RoleOwner {
		t.Errorf("membersFor(owner, nil) = %+v, want only the owner", solo)
	}
}
```

- [ ] **Step 2: Run, expect FAIL** — `cd warhammer-battle-helper-backend && go test ./cmd/migrate-template-members/` → `undefined: membersFor`.

- [ ] **Step 3: Implement `main.go`**

```go
// migrate-template-members converts template ownership to member roles (PLAYRPG-279).
//
//	system_templates: ownerId -> members[{ownerId, owner}], sharedWith[] -> members[{id, viewer}],
//	                  then $unset ownerId and sharedWith
//	games:            $unset customSystemTemplate.ownerId / .sharedWith on embedded copies
//
// Idempotent: documents that already have members are skipped, so a second run reports zeros.
// Run it right after deploying the code that reads members — until then every template is
// invisible to its owner.
//
// Known gap: a GM who opens token config for a hardcoded system between the deploy and this
// migration gets a fresh token-config singleton next to the old one; FindOne then picks one of
// them. Keep the window to seconds (see DEPLOY.md).
//
// Usage:
//
//	MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-template-members/
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// membersFor builds the member list for a pre-PLAYRPG-279 template: its owner, then everyone it
// was shared with as a viewer (the only access sharing granted), skipping the owner and duplicates.
func membersFor(ownerID primitive.ObjectID, sharedWith []primitive.ObjectID) []models.TemplateMember {
	members := []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}}
	seen := map[primitive.ObjectID]bool{ownerID: true}
	for _, id := range sharedWith {
		if seen[id] {
			continue
		}
		seen[id] = true
		members = append(members, models.TemplateMember{UserID: id, Role: models.RoleViewer})
	}
	return members
}

type legacyTemplate struct {
	ID         primitive.ObjectID   `bson:"_id"`
	OwnerID    primitive.ObjectID   `bson:"ownerId"`
	SharedWith []primitive.ObjectID `bson:"sharedWith"`
}

func migrateTemplates(ctx context.Context, col *mongo.Collection) int {
	cursor, err := col.Find(ctx, bson.M{"members": bson.M{"$exists": false}})
	if err != nil {
		log.Fatalf("system_templates find: %v", err)
	}
	defer cursor.Close(ctx)

	n := 0
	for cursor.Next(ctx) {
		var doc legacyTemplate
		if err := cursor.Decode(&doc); err != nil {
			log.Fatalf("system_templates decode: %v", err)
		}
		if doc.OwnerID.IsZero() {
			log.Printf("skip %s: no ownerId", doc.ID.Hex())
			continue
		}
		_, err := col.UpdateOne(ctx, bson.M{"_id": doc.ID}, bson.M{
			"$set":   bson.M{"members": membersFor(doc.OwnerID, doc.SharedWith)},
			"$unset": bson.M{"ownerId": "", "sharedWith": ""},
		})
		if err != nil {
			log.Fatalf("system_templates %s: %v", doc.ID.Hex(), err)
		}
		n++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("system_templates cursor: %v", err)
	}
	return n
}

func main() {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27018"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		log.Fatal("MONGO_DB env variable is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database(dbName)
	fmt.Printf("system_templates migrated: %d\n", migrateTemplates(ctx, db.Collection("system_templates")))

	res, err := db.Collection("games").UpdateMany(ctx,
		bson.M{"$or": bson.A{
			bson.M{"customSystemTemplate.ownerId": bson.M{"$exists": true}},
			bson.M{"customSystemTemplate.sharedWith": bson.M{"$exists": true}},
		}},
		bson.M{"$unset": bson.M{"customSystemTemplate.ownerId": "", "customSystemTemplate.sharedWith": ""}})
	if err != nil {
		log.Fatalf("games: %v", err)
	}
	fmt.Printf("games (embedded template copies cleaned): %d\n", res.ModifiedCount)
}
```

- [ ] **Step 4: Run, expect PASS** — `cd warhammer-battle-helper-backend && go vet ./cmd/migrate-template-members/ && go test ./cmd/migrate-template-members/`

- [ ] **Step 5: DEPLOY.md**

Read the existing dnd5e→srd5 section (around line 130-165) and add after it, in the same style:

````markdown
### PLAYRPG-279 — template member roles

Templates move from `ownerId` + `sharedWith` to `members` with roles. Until the migration runs,
every template is invisible to its owner, and a GM who opens token config gets a duplicate
token-config singleton. Same procedure as above:

1. Stop `autopull.service` if enabled.
2. Deploy: `cd /opt/warhammer-battle-helper && bash scripts/deploy.sh`
3. Immediately run:

```bash
cd /opt/warhammer-battle-helper
docker run --rm --network warhammer-battle-helper_default \
  -v "$PWD/warhammer-battle-helper-backend":/src -w /src \
  -e MONGO_URI='mongodb://<user>:<password>@mongo:27017/?authSource=admin' \
  -e MONGO_DB=<db-name> \
  golang:1.24-alpine go run ./cmd/migrate-template-members/
```

It prints two counts; a second run prints zeros. Then open the creator on a shared template and
check that its access card lists the previous recipients as Viewers.
````

- [ ] **Step 6: Verify locally against the docker stack**

Run (local stack must be up; credentials per `docker-compose.yml`):

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-backend && \
MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-template-members/ && \
MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-template-members/
```

Expected: first run prints non-zero template count (if local data exists), second prints `0` and `0`. If the stack is down or credentials differ, report it and skip — do not guess credentials.

- [ ] **Step 7: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-backend/cmd/migrate-template-members DEPLOY.md && \
git commit -m "feat: PLAYRPG-279 migration from template owner to members

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 5: Lobby — grouping, permissions, leaving

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/systemOptions.js:12-24`
- Modify: `warhammer-battle-helper-front/src/components/lobby/systemOptions.test.js`
- Modify: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx:16-18,86-87` (fixtures only)
- Modify: `warhammer-battle-helper-front/src/hooks/useTemplates.js`
- Modify: `warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.jsx`
- Create: `warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json`

**Interfaces:**
- Consumes: template JSON fields `myRole`, `permissions {edit, share, delete}`, `ownerEmails` (Task 3).
- Produces: `useTemplates().leaveTemplate(templateId) => Promise<boolean>`; `TemplateManagerDialog` prop `onLeaveTemplate(template)`; i18n keys `creator.roles.viewer|editor|owner`, `creator.leaveTemplate`, `creator.leaveTemplateConfirm` (used again in Task 6).

- [ ] **Step 1: Update `systemOptions.test.js` fixtures and grouping test (failing)**

Replace the fixture rows at lines 11-17 with:

```js
  { id: 'p2', name: 'zombie Apocalypse', isPublic: true },
  { id: 'm-old', name: 'Old Mine', myRole: 'owner', updatedAt: '2026-09-01T10:00:00Z' },
  { id: 's1', name: 'Wiedźmin', myRole: 'viewer', ownerEmails: ['alice@example.com'] },
  { id: 'p1', name: 'Arkham Nights', isPublic: true },
  { id: 'm-new', name: 'New Mine', myRole: 'owner', updatedAt: '2026-10-04T10:00:00.5Z' },
  { id: 's2', name: 'Bastion', isPublic: true, myRole: 'editor', ownerEmails: ['bob@example.com', 'carol@example.com'] },
  { id: 's3', name: 'Cień', myRole: 'viewer' },
```

Change the test at line 46 to `it('groups by myRole even when the owner emails are missing', …)` and, wherever the file asserts on an `ownerEmail` of `s2`, expect `'bob@example.com, carol@example.com'`. Keep `expect(cien.ownerEmail).toBeUndefined();`.

In `CreateGameDialog.test.jsx`: `isOwner: true` → `myRole: 'owner'`; `isOwner: false, sharedWithMe: true, ownerEmail: 'alice@example.com'` → `myRole: 'viewer', ownerEmails: ['alice@example.com']`; drop every remaining `isOwner: false`.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='systemOptions|CreateGameDialog'`
Expected: FAIL (grouping still reads `isOwner`).

- [ ] **Step 2: Implement in `systemOptions.js`**

```js
// myRole, not ownerEmails, decides the group: the email lookup may fail server-side and a
// missing email must not move a template the viewer belongs to into "public".
const groupOf = (tpl) => {
  if (tpl.myRole === 'owner') return 'mine';
  return tpl.myRole ? 'shared' : 'public';
};

const toOption = (tpl, group) => ({
  value: `${CUSTOM_PREFIX}${tpl.id}`,
  label: tpl.name,
  group,
  ...(group === 'shared' && tpl.ownerEmails?.length ? { ownerEmail: tpl.ownerEmails.join(', ') } : {}),
});
```

Run the same command. Expected: PASS.

- [ ] **Step 3: i18n keys**

In `src/locales/en/translation.json` under `"creator"`: delete `"sharedTemplate"`; add

```json
    "roles": { "viewer": "Viewer", "editor": "Editor", "owner": "Owner" },
    "leaveTemplate": "Leave template",
    "leaveTemplateConfirm": "Leave \"{{name}}\"? It disappears from your list until an owner shares it with you again.",
```

In `src/locales/pl/translation.json` under `"creator"`: delete `"sharedTemplate"`; add

```json
    "roles": { "viewer": "Podgląd", "editor": "Edytor", "owner": "Właściciel" },
    "leaveTemplate": "Opuść szablon",
    "leaveTemplateConfirm": "Opuścić „{{name}}”? Zniknie z Twojej listy, dopóki właściciel znów Ci go nie udostępni.",
```

Run: `grep -rn "sharedTemplate" warhammer-battle-helper-front/src` — only `TemplateManagerDialog.jsx` may still hit (fixed next step).

- [ ] **Step 4: Failing `TemplateManagerDialog.test.jsx`**

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateManagerDialog from './TemplateManagerDialog';

const tpl = (over) => ({ id: 'x', name: 'X', sections: [], version: 1, permissions: { edit: false, share: false, delete: false }, ...over });

const mount = (templates, handlers = {}) => render(
  <TemplateManagerDialog open templates={templates} onClose={() => {}} onCreateTemplate={() => {}}
    onEditTemplate={handlers.edit || (() => {})} onCloneTemplate={() => {}}
    onDeleteTemplate={handlers.del || (() => {})} onLeaveTemplate={handlers.leave || (() => {})} />,
);

// The row's icon buttons carry no accessible name of their own (tooltips are portal-based), so
// they are found by their MUI icon test id.
const icons = (name) => screen.queryAllByTestId(name);

test('an owner gets edit and delete, no leave', () => {
  mount([tpl({ myRole: 'owner', permissions: { edit: true, share: true, delete: true } })]);
  expect(icons('EditIcon')).toHaveLength(1);
  expect(icons('DeleteIcon')).toHaveLength(1);
  expect(icons('LogoutIcon')).toHaveLength(0);
});

test('an editor gets edit and leave, never delete', () => {
  mount([tpl({ myRole: 'editor', permissions: { edit: true, share: false, delete: false } })]);
  expect(icons('EditIcon')).toHaveLength(1);
  expect(icons('DeleteIcon')).toHaveLength(0);
  expect(icons('LogoutIcon')).toHaveLength(1);
  expect(screen.getByText(/· Editor/)).toBeInTheDocument();
});

test('a public template the user is no member of offers clone only', () => {
  mount([tpl({ isPublic: true })]);
  expect(icons('EditIcon')).toHaveLength(0);
  expect(icons('DeleteIcon')).toHaveLength(0);
  expect(icons('LogoutIcon')).toHaveLength(0);
  expect(icons('ContentCopyIcon')).toHaveLength(1);
});

test('leave hands the template to the lobby', () => {
  const leave = jest.fn();
  const viewerTpl = tpl({ myRole: 'viewer' });
  mount([viewerTpl], { leave });
  fireEvent.click(icons('LogoutIcon')[0]);
  expect(leave).toHaveBeenCalledWith(viewerTpl);
});
```

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateManagerDialog`
Expected: FAIL.

- [ ] **Step 5: Implement `TemplateManagerDialog.jsx`**

- Import `LogoutIcon from '@mui/icons-material/Logout'`.
- Signature: add `onLeaveTemplate` to the destructured props.
- Update the component comment's last sentence: `…which ones apply depends on the viewer's permissions, so a row-wide click…`.
- `{tpl.isOwner && (` before the edit button → `{tpl.permissions?.edit && (`.
- `{tpl.isOwner && (` before the delete button → `{tpl.permissions?.delete && (`.
- After the delete button block add:

```jsx
                      {tpl.myRole && tpl.myRole !== 'owner' && (
                        <IconButton size="small" onClick={() => onLeaveTemplate(tpl)}
                          onMouseEnter={e => showTooltip(t('creator.leaveTemplate'), e.currentTarget)} onMouseLeave={hideTooltip}
                          sx={{ color: 'error.light' }}>
                          <LogoutIcon fontSize="small" />
                        </IconButton>
                      )}
```

- Secondary line: replace `{!tpl.isOwner && \` · ${t('creator.sharedTemplate')}\`}` with `{tpl.myRole && tpl.myRole !== 'owner' && \` · ${t(\`creator.roles.${tpl.myRole}\`)}\`}`.

Run the test. Expected: PASS.

- [ ] **Step 6: `useTemplates.js` — leaveTemplate**

Update the header comment's first sentence to: `// useTemplates owns the custom-system templates visible to the user: those they are a member of plus every public one (each carrying myRole/permissions from the server).` Add before `replaceTemplate`:

```js
  // Leaving answers ok only once the server removed the membership; a refused leave (last owner)
  // keeps the row, so the list never shows a state the server does not have.
  const leaveTemplate = useCallback(async (templateId) => {
    try {
      const res = await fetch(`${getApiUrl()}/templates/${templateId}/membership`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) return false;
      setTemplates(prev => prev.filter(tpl => tpl.id !== templateId));
      return true;
    } catch {
      return false;
    }
  }, [authHeaders]);
```

and add `leaveTemplate` to the returned object.

- [ ] **Step 7: `GameLobby.jsx`**

- Destructure `leaveTemplate` from `useTemplates(token)`.
- `templatePrompt` becomes `{ type: 'delete' | 'leave', template }`; update its comment to `// { type: 'delete'|'leave', template }`.
- Replace `handleConfirmTemplateDelete` with:

```jsx
  const handleConfirmTemplatePrompt = useCallback(() => {
    if (!templatePrompt) return;
    const { type, template } = templatePrompt;
    setTemplatePrompt(null);
    if (type === 'delete') deleteTemplate(template.id);
    else leaveTemplate(template.id);
  }, [templatePrompt, deleteTemplate, leaveTemplate]);
```

- `TemplateManagerDialog` props: `onDeleteTemplate={(tpl) => setTemplatePrompt({ type: 'delete', template: tpl })}` and add `onLeaveTemplate={(tpl) => setTemplatePrompt({ type: 'leave', template: tpl })}`.
- The template `ConfirmDialog`:

```jsx
      <ConfirmDialog
        open={!!templatePrompt}
        danger
        title={templatePrompt?.type === 'leave' ? t('creator.leaveTemplate') : t('common.delete')}
        message={templatePrompt?.type === 'leave'
          ? t('creator.leaveTemplateConfirm', { name: templatePrompt?.template?.name })
          : t('creator.deleteConfirm', { name: templatePrompt?.template?.name })}
        confirmLabel={templatePrompt?.type === 'leave' ? t('creator.leaveTemplate') : t('common.delete')}
        onConfirm={handleConfirmTemplatePrompt}
        onCancel={() => setTemplatePrompt(null)}
      />
```

- [ ] **Step 8: Run lobby tests + lint**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='lobby|GameLobby|useTemplates' && npx eslint src/components/GameLobby.jsx src/components/lobby src/hooks/useTemplates.js`
Expected: PASS, no lint errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/lobby warhammer-battle-helper-front/src/hooks/useTemplates.js warhammer-battle-helper-front/src/components/GameLobby.jsx warhammer-battle-helper-front/src/locales && \
git commit -m "feat: PLAYRPG-279 lobby gates templates on permissions and lets members leave

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 6: Creator access card

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateAccessCard.jsx`
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateAccessCard.test.jsx`
- Delete: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.sharing.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (remove lines ~1277-1297 `shareErrorKey`; state at ~1337-1341; `isPublicRef` ~1373-1374; reset effect lines ~1469-1472; `setPublicAndSave` + `handleShare` + `handleUnshare` ~1627-1669; card JSX ~1874-1948; now-unused icon imports)
- Modify: `warhammer-battle-helper-front/src/components/creator/creatorTour.coverage.test.jsx` (General-tab test template)
- Modify: `warhammer-battle-helper-front/src/style.css` (after `.creator__share-email`, ~line 11691)
- Modify: locales en/pl (`creator.general.*`, `tutorial.creatorGeneral.visibility`)

**Interfaces:**
- Consumes: template JSON `permissions`, `members [{userId, email, role, isMe}]`, `isPublic`, `id`; endpoints from Task 3; i18n `creator.roles.*`, `creator.leaveTemplate`, `creator.leaveTemplateConfirm` (Task 5).
- Produces: `export default function TemplateAccessCard({ template, token, onTemplateUpdated, onLeft })`; `export async function memberErrorKey(res)`. TemplateBuilder gains `handleLeft` (close without flushing a save).

- [ ] **Step 1: i18n**

en, `creator.general` — replace the visibility/share keys with:

```json
      "visibilityTitle": "Access",
      "visibilityHint": "Owners decide who can use, edit and manage this template.",
      "makePublic": "Public template",
      "publicDesc": "Everyone can use this template to create a game. Only members with the Editor or Owner role can change it.",
      "privateDesc": "Only the people listed below can see and use this template.",
      "visibilityError": "Could not change the visibility.",
      "shareTitle": "People with access",
      "shareHint": "Viewers can use and clone the template. Editors can also change it. Owners can also manage access and delete it.",
      "shareEmailLabel": "Email address",
      "shareRoleLabel": "Role",
      "shareRoleOf": "Role of {{email}}",
      "shareButton": "Share",
      "shareRemove": "Remove access",
      "memberYou": "(you)",
      "shareErrorNotFound": "No account uses this address.",
      "shareErrorSelf": "That is your own address.",
      "shareErrorInvalid": "That doesn't look like a valid email address.",
      "shareErrorFailed": "Could not change access.",
      "memberErrorLastOwner": "A template needs at least one owner. Make someone else an owner first.",
      "sharePublicNote": "This template is public, so everyone can already use it. The roles below still decide who may edit it."
```

(`shareEmpty` is deleted — the list always contains at least the viewing owner.)

pl, `creator.general`:

```json
      "visibilityTitle": "Dostęp",
      "visibilityHint": "Właściciele decydują, kto może używać, edytować i zarządzać tym szablonem.",
      "makePublic": "Szablon publiczny",
      "publicDesc": "Każdy może użyć tego szablonu do stworzenia gry. Zmieniać go mogą tylko członkowie z rolą Edytor lub Właściciel.",
      "privateDesc": "Tylko osoby z listy poniżej widzą ten szablon i mogą go używać.",
      "visibilityError": "Nie udało się zmienić widoczności.",
      "shareTitle": "Osoby z dostępem",
      "shareHint": "Podgląd: może używać i klonować szablon. Edytor: może też go zmieniać. Właściciel: może też zarządzać dostępem i usunąć szablon.",
      "shareEmailLabel": "Adres email",
      "shareRoleLabel": "Rola",
      "shareRoleOf": "Rola: {{email}}",
      "shareButton": "Udostępnij",
      "shareRemove": "Odbierz dostęp",
      "memberYou": "(Ty)",
      "shareErrorNotFound": "Żadne konto nie używa tego adresu.",
      "shareErrorSelf": "To Twój własny adres.",
      "shareErrorInvalid": "To nie wygląda na poprawny adres email.",
      "shareErrorFailed": "Nie udało się zmienić dostępu.",
      "memberErrorLastOwner": "Szablon musi mieć co najmniej jednego właściciela. Najpierw nadaj tę rolę komuś innemu.",
      "sharePublicNote": "Ten szablon jest publiczny, więc i tak mogą go używać wszyscy. Role poniżej nadal decydują, kto może go edytować."
```

`tutorial.creatorGeneral.visibility`:
- en: `{ "title": "Who can use and edit it", "body": "Owners manage access here. Viewers can use and clone the template, Editors can also change it, Owners can also manage access and delete it. A public template can be used by anyone, but only members can edit it." }`
- pl: `{ "title": "Kto może go używać i edytować", "body": "Tutaj właściciele zarządzają dostępem. Podgląd pozwala używać i klonować szablon, Edytor może go też zmieniać, a Właściciel dodatkowo zarządza dostępem i może go usunąć. Z publicznego szablonu może skorzystać każdy, ale edytować go mogą tylko członkowie." }`

- [ ] **Step 2: Failing `TemplateAccessCard.test.jsx`**

```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '../../i18n';
import TemplateAccessCard from './TemplateAccessCard';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const me = { userId: 'u1', email: 'me@example.com', role: 'owner', isMe: true };
const anna = { userId: 'u9', email: 'anna@example.com', role: 'viewer' };
const base = { id: 't1', name: 'T', isPublic: false, permissions: { edit: true, share: true, delete: true }, members: [me, anna] };

const respond = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const mount = (template = base, props = {}) => render(
  <TemplateAccessCard template={template} token="tok" onTemplateUpdated={props.onTemplateUpdated || (() => {})} onLeft={props.onLeft || (() => {})} />,
);

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
});
afterEach(() => { jest.resetAllMocks(); });

test('adding posts email and role and adopts the returned list', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [me, anna, { userId: 'u7', email: 'kolega@example.com', role: 'editor' }]));
  mount();

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'kolega@example.com' } });
  fireEvent.mouseDown(screen.getByLabelText('Role'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  await waitFor(() => expect(screen.getByText('kolega@example.com')).toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/members$/);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ email: 'kolega@example.com', role: 'editor' });
  expect(screen.getByLabelText('Email address')).toHaveValue('');
});

test('an unknown address keeps the typed email and says so', async () => {
  global.fetch.mockReturnValueOnce(respond(404, { error: 'user not found' }));
  mount();
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'nikt@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await waitFor(() => expect(screen.getByText('No account uses this address.')).toBeInTheDocument());
  expect(screen.getByLabelText('Email address')).toHaveValue('nikt@example.com');
});

test('changing a role patches that member', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [me, { ...anna, role: 'editor' }]));
  mount();
  fireEvent.mouseDown(screen.getByLabelText('Role of anna@example.com'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/members\/u9$/);
  expect(init.method).toBe('PATCH');
  expect(JSON.parse(init.body)).toEqual({ role: 'editor' });
});

test('demoting the last owner shows the server refusal', async () => {
  global.fetch.mockReturnValueOnce(respond(400, { error: 'template must keep at least one owner' }));
  mount();
  fireEvent.mouseDown(screen.getByLabelText('Role of me@example.com'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Editor'));
  await waitFor(() => expect(screen.getByText(/needs at least one owner/)).toBeInTheDocument());
});

test('removing another member deletes them', async () => {
  global.fetch.mockReturnValueOnce(respond(200, [me]));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
  await waitFor(() => expect(screen.queryByText('anna@example.com')).not.toBeInTheDocument());
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/members\/u9$/);
  expect(init.method).toBe('DELETE');
});

test('leaving from the own row confirms, calls membership and reports it', async () => {
  const onLeft = jest.fn();
  global.fetch.mockReturnValueOnce(respond(200, { ok: true }));
  mount(base, { onLeft });
  fireEvent.click(screen.getByRole('button', { name: 'Leave template' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Leave template' }).pop());
  await waitFor(() => expect(onLeft).toHaveBeenCalled());
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/templates\/t1\/membership$/);
});

test('the public switch calls the visibility endpoint and hands back the template', async () => {
  const onTemplateUpdated = jest.fn();
  global.fetch.mockReturnValueOnce(respond(200, { ...base, isPublic: true }));
  mount(base, { onTemplateUpdated });
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(onTemplateUpdated).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true })));
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/templates\/t1\/visibility$/);
  expect(JSON.parse(init.body)).toEqual({ isPublic: true });
});

test('a refused visibility change flips the switch back', async () => {
  global.fetch.mockReturnValueOnce(respond(403, { error: 'not authorized' }));
  mount();
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(screen.getByText('Could not change the visibility.')).toBeInTheDocument());
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
```

The leave confirmation uses `ConfirmModal`; check its confirm button's accessible name in `components/common/ConfirmModal.jsx` — it renders `confirmLabel`, which this card sets to `t('creator.leaveTemplate')`, hence the second "Leave template" button. If `ConfirmModal` renders nothing until `isOpen`, the `getAllByRole(...).pop()` picks the modal's button.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateAccessCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TemplateAccessCard.jsx`**

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Button, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Select, Switch,
  TextField, Typography,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import ShareIcon from '@mui/icons-material/Share';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import ConfirmModal from '../common/ConfirmModal';

const ROLES = ['viewer', 'editor', 'owner'];
const FONT = { fontFamily: 'Crimson Text, serif' };

// memberErrorKey maps a failed member/visibility response onto an i18n key. Status alone is not
// enough: 400 means "your own address", "last owner" or gin's email validator (whose text is
// validator-internal, not a sentinel), and 404 means "no such account" or "template gone". The
// body's `error` is read first; status is the fallback once the known sentinels are ruled out.
export async function memberErrorKey(res) {
  let message = null;
  try {
    const body = await res.json();
    message = typeof body?.error === 'string' ? body.error : null;
  } catch { /* no parseable body: fall through to the status-based fallback */ }

  if (message === 'cannot share with yourself') return 'creator.general.shareErrorSelf';
  if (message === 'user not found') return 'creator.general.shareErrorNotFound';
  if (message === 'template must keep at least one owner') return 'creator.general.memberErrorLastOwner';
  if (res.status === 400 && message !== 'invalid role') return 'creator.general.shareErrorInvalid';
  return 'creator.general.shareErrorFailed';
}

// The creator's access card: public switch plus the member list with roles. Rendered only for a
// viewer whose permissions include share. Member writes are deliberately NOT optimistic: the
// server resolves addresses and enforces the last-owner rule, so every endpoint answers with the
// whole list and the card adopts it.
export default function TemplateAccessCard({ template, token, onTemplateUpdated, onLeft }) {
  const { t } = useTranslation();
  const [isPublic, setIsPublic] = useState(!!template.isPublic);
  const [members, setMembers] = useState(template.members || []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const base = `${getApiUrl()}/templates/${template.id}`;
  const headers = (json) => getApiHeaders({
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });

  // Runs one member request and adopts the list it answers with.
  const membersRequest = async (path, method, body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}${path}`, {
        method, headers: headers(!!body), ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) { setError(t(await memberErrorKey(res))); return false; }
      setMembers(await res.json());
      return true;
    } catch {
      setError(t('creator.general.shareErrorFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    if (await membersRequest('/members', 'POST', { email: trimmed, role })) setEmail('');
  };

  const handleVisibility = async (value) => {
    setIsPublic(value);
    setError(null);
    try {
      const res = await fetch(`${base}/visibility`, { method: 'PATCH', headers: headers(true), body: JSON.stringify({ isPublic: value }) });
      if (!res.ok) throw new Error('visibility');
      onTemplateUpdated?.(await res.json());
    } catch {
      setIsPublic(!value);
      setError(t('creator.general.visibilityError'));
    }
  };

  const handleLeave = async () => {
    setConfirmLeave(false);
    setError(null);
    try {
      const res = await fetch(`${base}/membership`, { method: 'DELETE', headers: headers(false) });
      if (!res.ok) { setError(t(await memberErrorKey(res))); return; }
      onLeft?.();
    } catch {
      setError(t('creator.general.shareErrorFailed'));
    }
  };

  return (
    <div className="creator__settings-card creator__settings-card--visibility">
      <div className="creator__settings-card-header">
        <span className="creator__settings-card-title">{t('creator.general.visibilityTitle')}</span>
        <span className="creator__settings-card-hint">{t('creator.general.visibilityHint')}</span>
      </div>
      <div className="creator__settings-card-body">
        <FormControlLabel
          control={<Switch checked={isPublic} onChange={e => handleVisibility(e.target.checked)} />}
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {isPublic
                ? <PublicIcon sx={{ fontSize: 18, color: '#c9975b' }} />
                : <LockIcon sx={{ fontSize: 18, color: '#7a5c42' }} />}
              <Typography sx={{ ...FONT, fontSize: '0.95rem', color: '#3a2f1f' }}>
                {t('creator.general.makePublic')}
              </Typography>
            </Box>
          }
        />
        <Typography sx={{ ...FONT, fontSize: '0.85rem', color: 'text.secondary', mt: 0.5, ml: 0.5 }}>
          {isPublic ? t('creator.general.publicDesc') : t('creator.general.privateDesc')}
        </Typography>

        <div className="creator__share">
          <div className="creator__share-title">{t('creator.general.shareTitle')}</div>
          <div className="creator__share-hint">{t('creator.general.shareHint')}</div>
          {isPublic && <div className="creator__share-note">{t('creator.general.sharePublicNote')}</div>}

          <div className="creator__share-row">
            <TextField
              size="small"
              type="email"
              label={t('creator.general.shareEmailLabel')}
              value={email}
              error={Boolean(error)}
              helperText={error || ' '}
              disabled={busy}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              sx={{ flex: 1, '& .MuiInputBase-input': FONT, '& .MuiInputLabel-root': FONT }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="creator-share-role" sx={FONT}>{t('creator.general.shareRoleLabel')}</InputLabel>
              <Select
                labelId="creator-share-role"
                label={t('creator.general.shareRoleLabel')}
                value={role}
                disabled={busy}
                onChange={e => setRole(e.target.value)}
                sx={FONT}
              >
                {ROLES.map(r => <MenuItem key={r} value={r} sx={FONT}>{t(`creator.roles.${r}`)}</MenuItem>)}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<ShareIcon />}
              disabled={busy || !email.trim()}
              onClick={handleAdd}
              sx={{ ...FONT, fontWeight: 600, flexShrink: 0, height: 40 }}
            >
              {t('creator.general.shareButton')}
            </Button>
          </div>

          <ul className="creator__share-list">
            {members.map(m => (
              <li key={m.userId} className="creator__share-item">
                <PersonIcon sx={{ fontSize: 18, color: '#c9975b' }} />
                <span className="creator__share-email">
                  {m.email}
                  {m.isMe && <span className="creator__share-you"> {t('creator.general.memberYou')}</span>}
                </span>
                <Select
                  size="small"
                  value={m.role}
                  disabled={busy}
                  // SelectDisplayProps, not inputProps: the clickable element is the display div;
                  // inputProps would label the hidden native input nobody interacts with.
                  SelectDisplayProps={{ 'aria-label': t('creator.general.shareRoleOf', { email: m.email }) }}
                  onChange={e => membersRequest(`/members/${m.userId}`, 'PATCH', { role: e.target.value })}
                  sx={{ ...FONT, minWidth: 120, '& .MuiSelect-select': { py: 0.5 } }}
                >
                  {ROLES.map(r => <MenuItem key={r} value={r} sx={FONT}>{t(`creator.roles.${r}`)}</MenuItem>)}
                </Select>
                {m.isMe ? (
                  <IconButton
                    size="small"
                    aria-label={t('creator.leaveTemplate')}
                    onClick={() => setConfirmLeave(true)}
                    sx={{ color: '#b57a5a', '&:hover': { color: '#8b3a2a', backgroundColor: 'rgba(180, 60, 40, 0.1)' } }}
                  >
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                ) : (
                  <IconButton
                    size="small"
                    aria-label={t('creator.general.shareRemove')}
                    onClick={() => membersRequest(`/members/${m.userId}`, 'DELETE')}
                    sx={{ color: '#b57a5a', '&:hover': { color: '#8b3a2a', backgroundColor: 'rgba(180, 60, 40, 0.1)' } }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmLeave}
        message={t('creator.leaveTemplateConfirm', { name: template.name })}
        confirmLabel={t('creator.leaveTemplate')}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
```

- [ ] **Step 4: CSS** — in `style.css` after the `.creator__share-email` rule add:

```css
.creator__share-you {
    font-style: italic;
    color: #7a5c42;
}
```

- [ ] **Step 5: Run card tests, expect PASS**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateAccessCard`
If the MUI `Select` listbox query differs in this MUI version (e.g. the listbox opens on `mouseDown` of the element with `role="combobox"`), adjust the query to `screen.getByRole('combobox', { name: … })` — keep the asserted request bodies unchanged.

- [ ] **Step 6: Wire into `TemplateBuilder.jsx`**

1. Remove: `shareErrorKey` (and its comment block), state `isPublic`, `shares`, `shareEmail`, `shareError`, `sharing`; `isPublicRef` (+ its `.current =` line); in the `[template?.id]` reset effect the lines `setIsPublic(...)`, `setShares(...)`, `setShareEmail('')`, `setShareError(null)`; functions `setPublicAndSave`, `handleShare`, `handleUnshare` (+ the "Sharing is deliberately NOT optimistic" comment).
2. In `saveTemplate` body: `JSON.stringify({ name: currentName, sections: currentSections, settings: settingsRef.current })` (no `isPublic`; Task 7 adds `version`).
3. Add after `handleClose`:

```jsx
  // After leaving the template the user may no longer save it, so a pending debounced save is
  // dropped rather than flushed.
  const handleLeft = useCallback(() => {
    clearTimeout(saveTimer.current);
    onClose?.();
  }, [onClose]);
```

4. Replace the whole `{!isVariant && ( <div className="creator__settings-card creator__settings-card--visibility"> … </div> )}` block (including its "Visibility … meaningless for a hardcoded-system token config" comment) with:

```jsx
            {/* Access is meaningless for a hardcoded-system token config (a private per-user
                singleton) and is the owner's business alone: editors never see the card. */}
            {!isVariant && template?.permissions?.share && (
              <TemplateAccessCard
                key={template.id}
                template={template}
                token={token}
                onTemplateUpdated={onTemplateUpdated}
                onLeft={handleLeft}
              />
            )}
```

5. Add `import TemplateAccessCard from './TemplateAccessCard';`. Remove imports that are now unused: run `npx eslint src/components/creator/TemplateBuilder.jsx` and delete every `no-unused-vars` import it lists (expected: `PublicIcon`, `LockIcon`, `ShareIcon`, `PersonIcon`, possibly `Switch` / `FormControlLabel` if nothing else uses them — check with grep before deleting).

- [ ] **Step 7: Builder-level tests**

Delete `TemplateBuilder.sharing.test.jsx` (`git rm`). Append to `TemplateAccessCard.test.jsx`:

```jsx
// Mounted through the real creator: the card's gate lives in TemplateBuilder.
import TemplateBuilder from './TemplateBuilder';

describe('inside the creator', () => {
  beforeEach(() => {
    localStorage.setItem('tutorialSeen:creator:general', '1');
    localStorage.setItem('tutorialSeen:creator:sheet', '1');
  });
  const builder = (template) => render(
    <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
  );

  test('an owner sees the access card', () => {
    builder({ ...base, sections: [], settings: { diceButtons: [] } });
    expect(screen.getByText('People with access')).toBeInTheDocument();
  });

  test('an editor does not', () => {
    builder({ ...base, sections: [], settings: { diceButtons: [] }, permissions: { edit: true, share: false, delete: false }, members: undefined });
    expect(screen.queryByText('People with access')).not.toBeInTheDocument();
  });

  test('a named variant of a built-in system does not', () => {
    builder({ ...base, sections: [], settings: { diceButtons: [] }, baseSystem: 'warhammer4e' });
    expect(screen.queryByText('People with access')).not.toBeInTheDocument();
  });
});
```

(Move the `import TemplateBuilder` line to the top of the file with the other imports — ESLint `import/first`.)

In `creatorTour.coverage.test.jsx`, the General-tab test template becomes
`{ id: 't', name: 'T', settings: {}, sections: [], permissions: { edit: true, share: true, delete: true }, members: [] }` — the access card must be on screen for its tutorial step to be checked.

- [ ] **Step 8: Run creator + tutorial tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='creator|tutorial|tourTranslations'`
Expected: PASS (all `TemplateBuilder.*` suites, `TemplateAccessCard`, `creatorTour.coverage`, `tourTranslations`).

- [ ] **Step 9: Dead-key sweep**

Run: `cd warhammer-battle-helper-front && grep -rn "shareEmpty\|shareErrorKey\|sharedWithUsers\|isPublicRef\|/shares" src` → expect no hits. Run the `i18n-sync` skill's key diff (or `node` one-liner comparing key sets) to confirm en/pl have identical keys.

- [ ] **Step 10: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/creator warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales && \
git status --short && \
git commit -m "feat: PLAYRPG-279 creator access card with member roles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 7: Versioned saves and the conflict banner

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateSaveBanner.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`saveTemplate`, `triggerSave`, `handleClose`, the `[template?.id]` reset effect, render under `DialogTitle`)
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.saveConflict.test.jsx`
- Modify: locales en/pl

**Interfaces:**
- Consumes: PATCH 409 body `{version, updatedBy, updatedAt}`, 403 (Task 3); `template.version`.
- Produces: `TemplateSaveBanner({ block, onReload, onOverwrite })` where `block` is `null | { kind: 'conflict', email, updatedAt, version } | { kind: 'forbidden' }`.

- [ ] **Step 1: i18n** — under `creator` add

en:
```json
    "saveConflict": {
      "message": "{{email}} saved this template at {{time}}.",
      "messageUnknown": "Someone else saved this template at {{time}}.",
      "reload": "Load their version",
      "overwrite": "Overwrite with mine"
    },
    "saveForbidden": "You no longer have edit access to this template. Unsaved changes will be lost when you close it.",
```

pl:
```json
    "saveConflict": {
      "message": "{{email}} zapisał(a) ten szablon o {{time}}.",
      "messageUnknown": "Ktoś inny zapisał ten szablon o {{time}}.",
      "reload": "Wczytaj jego wersję",
      "overwrite": "Nadpisz moją"
    },
    "saveForbidden": "Nie masz już uprawnień do edycji tego szablonu. Niezapisane zmiany przepadną po zamknięciu.",
```

- [ ] **Step 2: Failing test `TemplateBuilder.saveConflict.test.jsx`**

```jsx
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const base = { id: 't1', name: 'T', version: 3, sections: [], settings: { diceButtons: [] },
  permissions: { edit: true, share: false, delete: false } };
const respond = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const patches = () => global.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
const rename = (value) => fireEvent.change(screen.getByPlaceholderText('System name'), { target: { value } });
const flushDebounce = async () => { await act(async () => { jest.advanceTimersByTime(1300); }); };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
});
afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

const mount = (onTemplateUpdated = () => {}) => render(
  <TemplateBuilder template={base} token="tok" onClose={() => {}} onTemplateUpdated={onTemplateUpdated} />,
);

test('a save carries the version and adopts the next one', async () => {
  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'A', version: 4 }));
  mount();
  rename('A');
  await flushDebounce();
  expect(JSON.parse(patches()[0][1].body).version).toBe(3);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 5 }));
  rename('AB');
  await flushDebounce();
  expect(JSON.parse(patches()[1][1].body).version).toBe(4);
});

test('a conflict shows who saved, stops autosave, and overwrite sends their version', async () => {
  global.fetch.mockReturnValueOnce(respond(409, { error: 'version conflict', version: 9, updatedBy: 'anna@example.com', updatedAt: '2026-10-20T14:32:00Z' }));
  mount();
  rename('A');
  await flushDebounce();
  await waitFor(() => expect(screen.getByText(/anna@example\.com saved this template/)).toBeInTheDocument());

  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 10 }));
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }));
  await waitFor(() => expect(patches()).toHaveLength(2));
  const body = JSON.parse(patches()[1][1].body);
  expect(body.version).toBe(9);
  expect(body.name).toBe('AB');
  await waitFor(() => expect(screen.queryByText(/saved this template/)).not.toBeInTheDocument());
});

test('load their version replaces local state with the server copy', async () => {
  const onTemplateUpdated = jest.fn();
  global.fetch.mockReturnValueOnce(respond(409, { error: 'version conflict', version: 9, updatedBy: '', updatedAt: '2026-10-20T14:32:00Z' }));
  mount(onTemplateUpdated);
  rename('Mine');
  await flushDebounce();
  await waitFor(() => expect(screen.getByText(/Someone else saved this template/)).toBeInTheDocument());

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'Theirs', version: 9 }));
  fireEvent.click(screen.getByRole('button', { name: 'Load their version' }));
  await waitFor(() => expect(screen.getByPlaceholderText('System name')).toHaveValue('Theirs'));
  expect(onTemplateUpdated).toHaveBeenCalledWith(expect.objectContaining({ name: 'Theirs', version: 9 }));

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'Theirs2', version: 10 }));
  rename('Theirs2');
  await flushDebounce();
  expect(JSON.parse(patches().pop()[1].body).version).toBe(9);
});

test('losing edit access shows the banner and stops autosave', async () => {
  global.fetch.mockReturnValueOnce(respond(403, { error: 'not authorized' }));
  mount();
  rename('A');
  await flushDebounce();
  await waitFor(() => expect(screen.getByText(/no longer have edit access/)).toBeInTheDocument());
  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);
});

test('saves are serialized: a second save waits for the first and sends its new version', async () => {
  let resolveFirst;
  global.fetch.mockReturnValueOnce(new Promise(r => { resolveFirst = r; }));
  mount();
  rename('A');
  await flushDebounce();
  rename('AB');
  await flushDebounce();
  expect(patches()).toHaveLength(1);

  global.fetch.mockReturnValueOnce(respond(200, { ...base, name: 'AB', version: 5 }));
  await act(async () => { resolveFirst({ ok: true, status: 200, json: () => Promise.resolve({ ...base, name: 'A', version: 4 }) }); });
  await waitFor(() => expect(patches()).toHaveLength(2));
  expect(JSON.parse(patches()[1][1].body).version).toBe(4);
});
```

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=saveConflict`
Expected: FAIL (no `version` in the body, no banner).

- [ ] **Step 3: Implement `TemplateSaveBanner.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@mui/material';

const FONT = { fontFamily: 'Crimson Text, serif' };

// Shown when the creator stopped autosaving: somebody else saved first (conflict) or the user
// lost edit access (forbidden). Nothing is saved or discarded until the user picks an action.
export default function TemplateSaveBanner({ block, onReload, onOverwrite }) {
  const { t, i18n } = useTranslation();
  if (!block) return null;

  if (block.kind === 'forbidden') {
    return <Alert severity="error" sx={{ borderRadius: 0, ...FONT }}>{t('creator.saveForbidden')}</Alert>;
  }

  const time = new Date(block.updatedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  return (
    <Alert
      severity="warning"
      sx={{ borderRadius: 0, ...FONT }}
      action={(
        <>
          <Button color="inherit" size="small" onClick={onReload} sx={FONT}>{t('creator.saveConflict.reload')}</Button>
          <Button color="inherit" size="small" onClick={onOverwrite} sx={FONT}>{t('creator.saveConflict.overwrite')}</Button>
        </>
      )}
    >
      {block.email
        ? t('creator.saveConflict.message', { email: block.email, time })
        : t('creator.saveConflict.messageUnknown', { time })}
    </Alert>
  );
}
```

- [ ] **Step 4: Change `TemplateBuilder.jsx`**

1. Import: `import TemplateSaveBanner from './TemplateSaveBanner';`
2. Next to the other refs (after `nameRef`):

```jsx
  // version the server last confirmed; every save sends it and the server refuses a stale one.
  const versionRef = useRef(template?.version);
  // Saves run one at a time: two in flight would carry the same version and the second would
  // conflict with the first. Each save chains onto the previous one and reads versionRef only
  // when it actually starts.
  const saveChain = useRef(Promise.resolve());
  // null while autosave runs; { kind: 'conflict', email, updatedAt, version } or
  // { kind: 'forbidden' } once the server refused a save and autosave is paused.
  const [saveBlock, setSaveBlock] = useState(null);
  const saveBlockRef = useRef(null);
  saveBlockRef.current = saveBlock;
```

3. Replace the `[template?.id]` reset effect with a reusable `applyTemplate` plus the effect:

```jsx
  // Puts a server copy of the template into local state: on first mount of an id and when the
  // user chooses "load their version" after a conflict.
  const applyTemplate = useCallback((tpl) => {
    setSections(tpl?.sections || []);
    setName(tpl?.name || '');
    setSettings(tpl?.settings || { diceButtons: [] });
    versionRef.current = tpl?.version;
    setSelected(null);
    setEditingPath(null);
    setAddingToPath(null);
    setDragState(null);
  }, []);

  useEffect(() => {
    applyTemplate(template);
    setSaveBlock(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);
```

(Keep any other resets the current effect performs after Task 6 — the list above is the effect's content once the sharing lines are gone; compare before replacing.)

4. Replace `saveTemplate` with:

```jsx
  // Sends one save. versionOverride is "overwrite with mine": the version from the 409, which
  // makes the server accept this state on top of the other person's save.
  const sendSave = useCallback(async (currentSections, currentName, versionOverride) => {
    if (!template?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/templates/${template.id}`, {
        method: 'PATCH',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({
          name: currentName,
          sections: currentSections,
          settings: settingsRef.current,
          version: versionOverride ?? versionRef.current,
        }),
      });
      if (res.status === 409) {
        const body = await res.json();
        setSaveBlock({ kind: 'conflict', email: body.updatedBy, updatedAt: body.updatedAt, version: body.version });
        return;
      }
      if (res.status === 403) {
        setSaveBlock({ kind: 'forbidden' });
        return;
      }
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      versionRef.current = updated.version;
      onTemplateUpdated?.(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch { /* silent */ } finally {
      setIsSaving(false);
    }
  }, [template?.id, token, onTemplateUpdated]);

  const saveTemplate = useCallback((currentSections, currentName, versionOverride) => {
    saveChain.current = saveChain.current.then(() => sendSave(currentSections, currentName, versionOverride));
    return saveChain.current;
  }, [sendSave]);
```

5. In `triggerSave`, after `setDuplicateKeys(findDuplicateKeys(s));` add `if (saveBlockRef.current) return;` and a one-line comment `// Paused until the user resolves the banner; local edits keep accumulating.`

6. `handleClose`:

```jsx
  const handleClose = useCallback(async () => {
    clearTimeout(saveTimer.current);
    // A refused save stays refused: flushing would only hit the same 409/403 again.
    if (!saveBlockRef.current) {
      try { await saveTemplate(sectionsRef.current, nameRef.current); } catch { /* ignore */ }
    }
    onClose?.();
  }, [saveTemplate, onClose]);
```

(keep its existing comment about the in-game re-sync race above it.)

7. Banner handlers (after `handleLeft`):

```jsx
  const handleReloadTheirs = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/templates/${template.id}`, {
        headers: getApiHeaders({ 'Authorization': `Bearer ${token}` }),
      });
      if (!res.ok) return;
      const fresh = await res.json();
      applyTemplate(fresh);
      onTemplateUpdated?.(fresh);
      setSaveBlock(null);
    } catch { /* banner stays; the user can retry */ }
  }, [template?.id, token, applyTemplate, onTemplateUpdated]);

  const handleOverwriteMine = useCallback(() => {
    const version = saveBlockRef.current?.version;
    setSaveBlock(null);
    saveBlockRef.current = null;
    clearTimeout(saveTimer.current);
    saveTemplate(sectionsRef.current, nameRef.current, version);
  }, [saveTemplate]);
```

8. Render the banner directly after `</DialogTitle>` and before `<DialogContent …>`:

```jsx
      <TemplateSaveBanner block={saveBlock} onReload={handleReloadTheirs} onOverwrite={handleOverwriteMine} />
```

- [ ] **Step 5: Run conflict tests, expect PASS**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=saveConflict`
If a test fails only because `act` warnings or timer flushing leave a promise pending, add `await act(async () => {})` after the click — do not weaken the asserted request bodies or counts.

- [ ] **Step 6: Run all creator tests + lint**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='creator|GeneralTab' && npx eslint src/components/creator`
Expected: PASS, no lint errors. (`GeneralTab` mounts the builder for token configs; its token-config template carries `version` from the backend.)

- [ ] **Step 7: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && \
git add warhammer-battle-helper-front/src/components/creator warhammer-battle-helper-front/src/locales && \
git commit -m "feat: PLAYRPG-279 versioned creator saves with conflict banner

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 8: Full verification and end-to-end check

**Files:** none new (fixes only, if verification finds something).

- [ ] **Step 1: Whole suites**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-backend && go vet ./... && go test ./...
cd /Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-front && CI=true npm test -- --watchAll=false && npx eslint src
```

Expected: Go all `ok`; Jest all green except the known `App.test.js` axios ESM failure; ESLint clean.

- [ ] **Step 2: Leftover sweep**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && \
grep -rn "OwnerID\|SharedWith\|IsOwner\|OwnerEmail\b\|CanUseTemplate\|ShareTemplate\|/shares" warhammer-battle-helper-backend/internal warhammer-battle-helper-backend/cmd/warhammer-battle-helper ; \
grep -rn "isOwner\|sharedWithMe\|sharedWithUsers\|ownerEmail\b" warhammer-battle-helper-front/src | grep -v "NotesTab\|notes/"
```

Expected: backend — no hits (the migration's `legacyTemplate.OwnerID` lives in `cmd/migrate-template-members`, which is not searched). Frontend — only `ownerEmail` on the create-game option object (`systemOptions.js`, `CreateGameDialog.jsx`), which is the option's own field, not the template's.

- [ ] **Step 3: Local stack end-to-end with curl**

Follow the `local-e2e-verification-recipe` memory to get JWTs for two local accounts (A, B). Run the migration (Task 4 Step 6) first. Then, with `$A` / `$B` tokens and a template `$T` owned by A:

```bash
API=http://localhost:8080
curl -s -XPOST $API/templates/$T/members -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"email":"<B email>","role":"editor"}'
curl -s $API/templates -H "Authorization: Bearer $B" | jq '.[] | select(.id=="'$T'") | {myRole, permissions, ownerEmails, members}'
curl -s -XPATCH $API/templates/$T -H "Authorization: Bearer $B" -H 'Content-Type: application/json' -d '{"name":"by B","version":1}' | jq '{version}'
curl -s -w '\n%{http_code}\n' -XPATCH $API/templates/$T -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"name":"by A","version":1}'
curl -s -w '\n%{http_code}\n' -XDELETE $API/templates/$T -H "Authorization: Bearer $B"
curl -s -w '\n%{http_code}\n' -XPATCH $API/templates/$T/members/<A userId> -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"role":"editor"}'
```

Expected in order: member list with B as editor; B sees `myRole: "editor"`, `permissions.edit: true`, `ownerEmails: [A]`, no `members`; B's save returns `version: 2`; A's stale save → `409` with `updatedBy` = B's email; B's delete → `403`; A demoting themselves as sole owner → `400` `template must keep at least one owner`. Use the real backend port from `docker-compose.yml` if it is not 8080. If the stack cannot run, say so — do not report this step as done.

- [ ] **Step 4: Browser check handed to the user**

Per the `user-tests-in-browser` memory, list for the user what to click: access card (add with role, change role, remove, leave own row), editor view (no access card, edit allowed, no delete in manager, leave icon), two browsers editing the same template (conflict banner, both buttons), demoting an open editor (403 banner).

- [ ] **Step 5: Commit any fixes from Steps 1-3** with a `fix: PLAYRPG-279 …` message (branch check in the same command). No commit if nothing changed.
