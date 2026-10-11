# PLAYRPG-240 Character Name, Avatar and Image Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden name input above the custom character sheet with template field types `char_name` (required for a game), `char_avatar` (optional) and a generic `image` field.

**Architecture:** `char_name`/`char_avatar` are singleton field types whose value lives in the top-level `character.name`/`character.avatar` (never in `stats`), so every existing consumer (tokens, short card, lists) keeps working untouched. `image` stores a URL in `stats.images[key]`. Drafts in the creator may lack `char_name`; the backend enforces it only when a template is copied into a game (create game, sync template).

**Tech Stack:** Go + Gin + MongoDB (backend), React + i18next + jest/RTL via CRA (frontend).

**Spec:** `docs/superpowers/specs/2026-10-09-PLAYRPG-240-character-name-avatar-fields-design.md`

## Global Constraints

- Code comments in English only. Conversation and `docs/` in Polish.
- All UI strings through `t('key')`; English keys; add every key to both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`. No MUI `<Tooltip>` — portal tooltip (`usePortalTooltip`) or, inside per-field chrome, a native `title`.
- Sheet colours: inputs `#fff9f0` bg, `#3a2f1f` text, `#c4a882` border, `#7a5c42` focus/labels, `#c9975b` accents.
- A CSS modifier must be declared AFTER its base rule in `style.css` (otherwise silently dead).
- No backward compatibility: no migration of existing templates or games.
- Delete dead code/CSS/i18n in the same change that makes it dead.
- Frontend tests: run from `warhammer-battle-helper-front/` with `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Never bare `npx jest`. `App.test.js` axios ESM failure is the known baseline.
- Backend tests: run from `warhammer-battle-helper-backend/` with `go test ./internal/<pkg>/ -run <Name> -v`.
- Work on `main`, no worktree. Commit after every task; never stage `nginx.conf` or `package-lock.json` (unrelated local changes).
- Commit trailer:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

## File Map

Backend:
- Modify `internal/models/SystemTemplate.go` — field type constants, error sentinels, `CountFieldsOfType`, `ValidateSingletonFields`, `ValidateForGame`.
- Modify `internal/models/SystemTemplate_test.go` — validator tests.
- Modify `internal/service/TemplateService.go` — validate singletons on Create/Update.
- Modify `internal/http/TemplateHandler.go` — map validation errors to 400.
- Modify `internal/http/GameHandler.go` — `ValidateForGame` on custom game create; 400 mapping in `SyncTemplate`.
- Modify `internal/service/GameService.go` — `ValidateForGame` in `SyncTemplate` for custom games.
- Modify `internal/systems/custom/character.go` — `Stats.Images`.
- Modify `internal/systems/custom/roller_test.go` — round-trip test.

Frontend (`warhammer-battle-helper-front/src/`):
- Create `api/apiUrl.js` — `getApiUrl`, `getApiHeaders` without importing axios.
- Modify `api/axios.js` — re-export from `apiUrl.js`.
- Modify `utils/fileUrl.js`, `utils/fileUrl.test.js`, `components/Avatar.test.js` — import/mock `apiUrl`.
- Modify `utils/imageProcessing.js` — `PRESETS.sheetImage`.
- Modify `utils/templateSections.js` + test — `SINGLETON_FIELD_TYPES`, `usedSingletonTypes`, singleton-aware `duplicateNodeAtPath`.
- Create `systems/custom/fields/SheetImagePicker.jsx` + `SheetImagePicker.test.jsx`.
- Modify `systems/custom/CustomSheetBody.jsx` — three new cases, `uploadImage` prop.
- Create `systems/custom/CustomSheetBody.characterFields.test.jsx`.
- Modify `systems/custom/CharacterSheet.jsx` — images/avatar state, `saveCharacter(currentEdited)`, upload, header removal.
- Create `systems/custom/CharacterSheet.characterFields.test.jsx`.
- Modify `components/creator/TemplateBuilder.jsx` — field types, palette group, singleton gating, missing-name warning, no duplicate on singletons.
- Modify `components/creator/FieldChrome.jsx` + `FieldChrome.test.jsx` — hide duplicate when `onDuplicate` is null.
- Modify `hooks/useGames.js` — map template error codes to i18n.
- Modify `style.css` — picker + tile CSS; delete `custom-sheet__char-header` rules.
- Modify `locales/en/translation.json`, `locales/pl/translation.json`.

---

### Task 1: Backend — template field validators

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go`
- Test: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`

**Interfaces:**
- Produces:
  - `const models.FieldTypeCharName = "char_name"`, `models.FieldTypeCharAvatar = "char_avatar"`, `models.FieldTypeImage = "image"`
  - `var models.ErrMissingCharName`, `models.ErrDuplicateCharName`, `models.ErrDuplicateCharAvatar` (`error`; `.Error()` returns `"template_missing_char_name"`, `"template_duplicate_char_name"`, `"template_duplicate_char_avatar"`)
  - `func (t *SystemTemplate) CountFieldsOfType(typ string) int`
  - `func (t *SystemTemplate) ValidateSingletonFields() error`
  - `func (t *SystemTemplate) ValidateForGame() error`
  - `func models.IsTemplateValidationError(err error) bool`

- [ ] **Step 1: Write the failing tests** — append to `internal/models/SystemTemplate_test.go` (add `"errors"` to its imports):

```go
func templateWith(fields ...FieldDef) *SystemTemplate {
	return &SystemTemplate{Sections: []SectionDef{{ID: "s", Fields: fields}}}
}

func nested(fields ...FieldDef) FieldDef {
	return FieldDef{Key: "sub", Type: "section", Section: &SectionDef{ID: "sub", Fields: fields}}
}

func TestCountFieldsOfType_CountsNestedSections(t *testing.T) {
	tmpl := templateWith(
		FieldDef{Key: "a", Type: FieldTypeCharName},
		nested(FieldDef{Key: "b", Type: FieldTypeCharName}, nested(FieldDef{Key: "c", Type: FieldTypeImage})),
	)
	if got := tmpl.CountFieldsOfType(FieldTypeCharName); got != 2 {
		t.Errorf("char_name count = %d, want 2", got)
	}
	if got := tmpl.CountFieldsOfType(FieldTypeImage); got != 1 {
		t.Errorf("image count = %d, want 1", got)
	}
}

func TestValidateSingletonFields(t *testing.T) {
	cases := []struct {
		name string
		tmpl *SystemTemplate
		want error
	}{
		{"empty draft is fine", templateWith(), nil},
		{"one of each is fine", templateWith(FieldDef{Type: FieldTypeCharName}, FieldDef{Type: FieldTypeCharAvatar}), nil},
		{"many images are fine", templateWith(FieldDef{Type: FieldTypeImage}, FieldDef{Type: FieldTypeImage}), nil},
		{"two names", templateWith(FieldDef{Type: FieldTypeCharName}, nested(FieldDef{Type: FieldTypeCharName})), ErrDuplicateCharName},
		{"two avatars", templateWith(FieldDef{Type: FieldTypeCharAvatar}, FieldDef{Type: FieldTypeCharAvatar}), ErrDuplicateCharAvatar},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := c.tmpl.ValidateSingletonFields(); !errors.Is(got, c.want) {
				t.Errorf("ValidateSingletonFields() = %v, want %v", got, c.want)
			}
		})
	}
}

func TestValidateForGame(t *testing.T) {
	if err := templateWith().ValidateForGame(); !errors.Is(err, ErrMissingCharName) {
		t.Errorf("no name: got %v, want ErrMissingCharName", err)
	}
	if err := templateWith(FieldDef{Type: FieldTypeCharName}, FieldDef{Type: FieldTypeCharName}).ValidateForGame(); !errors.Is(err, ErrDuplicateCharName) {
		t.Errorf("two names: got %v, want ErrDuplicateCharName", err)
	}
	if err := templateWith(nested(FieldDef{Type: FieldTypeCharName})).ValidateForGame(); err != nil {
		t.Errorf("nested name: got %v, want nil", err)
	}
}

func TestIsTemplateValidationError(t *testing.T) {
	for _, err := range []error{ErrMissingCharName, ErrDuplicateCharName, ErrDuplicateCharAvatar} {
		if !IsTemplateValidationError(err) {
			t.Errorf("%v should be a validation error", err)
		}
	}
	if IsTemplateValidationError(errors.New("template not found")) {
		t.Error("unrelated error classified as validation error")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -run 'TestCountFieldsOfType|TestValidate|TestIsTemplateValidationError' -v`
Expected: compile FAIL — `undefined: FieldTypeCharName` etc.

- [ ] **Step 3: Implement** — in `internal/models/SystemTemplate.go` change the import block to:

```go
import (
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)
```

Update the `FieldDef.Type` comment to list the new types:

```go
	Type  string `bson:"type" json:"type"` // "attr"|"number"|"computed"|"progress"|"text_short"|"text_long"|"checkbox"|"select"|"skill_table"|"skill_tree"|"weapons_table"|"label"|"section"|"char_name"|"char_avatar"|"image"
```

Append at the end of the file:

```go
// Field types bound to the character document rather than to Stats (PLAYRPG-240). A char_name
// field edits Character.Name and a char_avatar field edits Character.Avatar, so neither ever
// has a key in Stats. An image field stores its URL in the custom system's Stats.Images.
const (
	FieldTypeCharName   = "char_name"
	FieldTypeCharAvatar = "char_avatar"
	FieldTypeImage      = "image"
)

// Template validation errors. The messages are stable codes, not prose: handlers return them
// verbatim and the frontend maps each one to a translated message.
var (
	ErrMissingCharName     = errors.New("template_missing_char_name")
	ErrDuplicateCharName   = errors.New("template_duplicate_char_name")
	ErrDuplicateCharAvatar = errors.New("template_duplicate_char_avatar")
)

// IsTemplateValidationError reports whether err is one of the template validation errors, so
// handlers can answer 400 instead of 500.
func IsTemplateValidationError(err error) bool {
	return errors.Is(err, ErrMissingCharName) ||
		errors.Is(err, ErrDuplicateCharName) ||
		errors.Is(err, ErrDuplicateCharAvatar)
}

// CountFieldsOfType counts leaf fields of the given type at any depth. Nested sections
// (Type == "section") are descended into, never counted themselves.
func (t *SystemTemplate) CountFieldsOfType(typ string) int {
	n := 0
	var visit func(fields []FieldDef)
	visit = func(fields []FieldDef) {
		for _, f := range fields {
			if f.Type == "section" {
				if f.Section != nil {
					visit(f.Section.Fields)
				}
				continue
			}
			if f.Type == typ {
				n++
			}
		}
	}
	for _, s := range t.Sections {
		visit(s.Fields)
	}
	return n
}

// ValidateSingletonFields rejects a template with more than one char_name or char_avatar field.
// A missing char_name is allowed: the creator autosaves drafts, and a draft that has no name
// field yet is legitimate. ValidateForGame is the stricter check for templates entering a game.
func (t *SystemTemplate) ValidateSingletonFields() error {
	if t.CountFieldsOfType(FieldTypeCharName) > 1 {
		return ErrDuplicateCharName
	}
	if t.CountFieldsOfType(FieldTypeCharAvatar) > 1 {
		return ErrDuplicateCharAvatar
	}
	return nil
}

// ValidateForGame is the check for a custom template that is about to back a game: on top of
// the singleton rule, it requires exactly one char_name, because without it players have no
// way to edit their character's name.
func (t *SystemTemplate) ValidateForGame() error {
	if err := t.ValidateSingletonFields(); err != nil {
		return err
	}
	if t.CountFieldsOfType(FieldTypeCharName) == 0 {
		return ErrMissingCharName
	}
	return nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -v`
Expected: PASS (all models tests).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go
git commit -m "feat: PLAYRPG-240 template validators for character name and avatar fields"
```

---

### Task 2: Backend — enforce validation on template save, game create and sync

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go` (`Create` ~145, `Update` ~276)
- Modify: `warhammer-battle-helper-backend/internal/http/TemplateHandler.go` (`CreateTemplate`, `UpdateTemplate`)
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go` (`CreateGame` custom branch ~70-86, `SyncTemplate` ~612)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go` (`SyncTemplate` ~2930)

**Interfaces:**
- Consumes: `ValidateSingletonFields`, `ValidateForGame`, `IsTemplateValidationError` from Task 1.
- Produces: HTTP 400 `{"error": "<code>"}` with codes `template_missing_char_name` | `template_duplicate_char_name` | `template_duplicate_char_avatar` from `POST /templates`, `PUT /templates/:id`, `POST /games`, `POST /games/:id/syncTemplate`.

The services have no repository fakes in this codebase (existing service tests cover pure functions only), so this task is verified by compile + the Task 1 unit tests + the manual curl in Task 10. Keep each wiring change to the single call shown.

- [ ] **Step 1: TemplateService.Create** — after the `t := &models.SystemTemplate{...}` literal and before `s.repo.Create(t)`, insert:

```go
	// Token-display variants (BaseSystem != "") carry no sheet, so only genuine custom
	// templates are checked.
	if t.BaseSystem == "" {
		if err := t.ValidateSingletonFields(); err != nil {
			return nil, err
		}
	}
```

- [ ] **Step 2: TemplateService.Update** — after the ownership check (`if t.OwnerID != ownerID {...}`) and before `s.repo.Update(...)`, insert:

```go
	if t.BaseSystem == "" {
		incoming := &models.SystemTemplate{Sections: req.Sections}
		if err := incoming.ValidateSingletonFields(); err != nil {
			return nil, err
		}
	}
```

- [ ] **Step 3: TemplateHandler** — in `CreateTemplate`, replace the error branch with:

```go
	if err != nil {
		if models.IsTemplateValidationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
```

In `UpdateTemplate`, add as the first check inside `if err != nil {`:

```go
		if models.IsTemplateValidationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
```

(`models` is already imported in TemplateHandler.go — it binds `models.CreateTemplateRequest`.)

- [ ] **Step 4: GameHandler.CreateGame** — in the `if req.GameSystem == "custom" {` branch, after the `CanUseTemplate` check and before `template = t`, insert:

```go
		// A template can be saved as an incomplete draft, but a game needs a name field —
		// otherwise its players have nowhere to edit their character's name.
		if err := t.ValidateForGame(); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
```

- [ ] **Step 5: GameService.SyncTemplate** — after `tmpl, err := templateFetcher.Get(...)` error check and before `s.gameRepo.SetCustomTemplate(...)`, insert:

```go
	// Hardcoded-system games also sync (a token-display variant, no sections), so the sheet
	// rule applies to custom games only.
	if game.GameSystem == "custom" {
		if err := tmpl.ValidateForGame(); err != nil {
			return nil, err
		}
	}
```

- [ ] **Step 6: GameHandler.SyncTemplate** — in the error branch, add before `c.JSON(status, ...)`:

```go
		if models.IsTemplateValidationError(err) {
			status = http.StatusBadRequest
		}
```

- [ ] **Step 7: Build and run all backend tests**

Run: `cd warhammer-battle-helper-backend && go build ./... && go vet ./internal/... && go test ./...`
Expected: build OK, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/TemplateService.go warhammer-battle-helper-backend/internal/http/TemplateHandler.go warhammer-battle-helper-backend/internal/http/GameHandler.go warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "feat: PLAYRPG-240 require a character name field when a template backs a game"
```

---

### Task 3: Backend — persist image field values

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/character.go` (`Stats` struct)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`

**Interfaces:**
- Produces: `custom.Stats.Images map[string]string` (bson/json `images`).

- [ ] **Step 1: Write the failing test** — append to `roller_test.go` next to `TestComputeDerived_PreservesDevelopmentSkills`:

```go
// An image field's URL lives only in stats.images. ComputeDerived round-trips stats through
// Stats, so a key missing from the struct is silently dropped on the first save.
func TestComputeDerived_PreservesImages(t *testing.T) {
	raw, err := bson.Marshal(bson.M{
		"attributes": bson.M{},
		"skills":     bson.M{},
		"images":     bson.M{"fld_crest": "/avatars/crest.webp"},
	})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	out, err := (&Plugin{}).ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived: %v", err)
	}

	var got Stats
	if err := bson.Unmarshal(out, &got); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if got.Images["fld_crest"] != "/avatars/crest.webp" {
		t.Errorf("Images = %v, want fld_crest -> /avatars/crest.webp", got.Images)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run TestComputeDerived_PreservesImages -v`
Expected: compile FAIL — `got.Images undefined`.

- [ ] **Step 3: Implement** — in `Stats` (character.go), after the `FavoriteWeapons` field add:

```go
	// Images holds the URL of each image field (PLAYRPG-240), keyed by field key. Upload goes
	// through POST /avatars; only the returned URL is stored here.
	Images map[string]string `bson:"images,omitempty" json:"images,omitempty"`
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/systems/custom/character.go warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git commit -m "feat: PLAYRPG-240 store image field URLs in custom stats"
```

---

### Task 4: Frontend — decouple URL helpers from axios, add sheet image preset

**Files:**
- Create: `warhammer-battle-helper-front/src/api/apiUrl.js`
- Modify: `warhammer-battle-helper-front/src/api/axios.js`
- Modify: `warhammer-battle-helper-front/src/utils/fileUrl.js`
- Modify: `warhammer-battle-helper-front/src/utils/fileUrl.test.js`
- Modify: `warhammer-battle-helper-front/src/components/Avatar.test.js`
- Modify: `warhammer-battle-helper-front/src/utils/imageProcessing.js`

**Why:** `CustomSheetBody` will render images through `resolveFileUrl`. Today `utils/fileUrl.js` imports `api/axios.js`, which imports the ESM-only `axios` that CRA's jest cannot parse, so every `CustomSheetBody` test file would start failing. `getApiUrl` needs no HTTP client.

**Interfaces:**
- Produces: `api/apiUrl.js` exports `getApiUrl(): string`, `getApiHeaders(extra?): object`. `api/axios.js` keeps exporting both (re-export), so no other import changes. `PRESETS.sheetImage = { maxEdge: 1024, aspect: null }`.

- [ ] **Step 1: Create `api/apiUrl.js`**

```js
// Base URL and common headers, kept apart from api/axios.js so that modules which only need
// to build a URL (utils/fileUrl.js) do not pull in the axios client — jest under CRA cannot
// parse axios's ESM build.
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

export const getApiUrl = () => API_BASE_URL;

// Helper function to get headers with ngrok bypass
export const getApiHeaders = (additionalHeaders = {}) => ({
    'ngrok-skip-browser-warning': 'true',
    ...additionalHeaders
});
```

- [ ] **Step 2: Edit `api/axios.js`** — replace the `const API_BASE_URL = ...` line with:

```js
import { getApiUrl, getApiHeaders } from './apiUrl';

const API_BASE_URL = getApiUrl();
```

Delete the local `export const getApiUrl = ...` and the `getApiHeaders` definition (with its comment), and add right after the imports:

```js
export { getApiUrl, getApiHeaders };
```

Keep `console.log('API Base URL:', API_BASE_URL);` and `baseURL: API_BASE_URL` unchanged.

- [ ] **Step 3: Edit `utils/fileUrl.js`** — change line 1 to:

```js
import { getApiUrl } from '../api/apiUrl';
```

- [ ] **Step 4: Edit the two tests** — in `utils/fileUrl.test.js` change the mock to `jest.mock('../api/apiUrl', () => ({ getApiUrl: () => 'http://api.test' }));` and in `components/Avatar.test.js` to `jest.mock('../api/apiUrl', () => ({ getApiUrl: () => 'http://api.test' }));`.

- [ ] **Step 5: Add the preset** — in `utils/imageProcessing.js` `PRESETS`, after `avatar`:

```js
  // Image field on a custom character sheet (PLAYRPG-240): free proportions, the field is
  // sheet-column wide, so 1024px covers the widest sheet without shipping a 4K original.
  sheetImage:   { maxEdge: 1024, aspect: null },
```

- [ ] **Step 6: Run affected tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='fileUrl|Avatar|imageProcessing|CharacterSheet|CharacterDetails'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/api/apiUrl.js warhammer-battle-helper-front/src/api/axios.js warhammer-battle-helper-front/src/utils/fileUrl.js warhammer-battle-helper-front/src/utils/fileUrl.test.js warhammer-battle-helper-front/src/components/Avatar.test.js warhammer-battle-helper-front/src/utils/imageProcessing.js
git commit -m "refactor: PLAYRPG-240 split API URL helpers from the axios client"
```

---

### Task 5: Frontend — singleton helpers in templateSections

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/templateSections.js`
- Test: `warhammer-battle-helper-front/src/utils/templateSections.test.js`

**Interfaces:**
- Produces: `SINGLETON_FIELD_TYPES: string[]` (`['char_name', 'char_avatar']`), `usedSingletonTypes(sections): Set<string>`; `duplicateNodeAtPath` returns `sections` unchanged for a singleton leaf and omits singletons from a copied section.

- [ ] **Step 1: Write the failing tests** — add `SINGLETON_FIELD_TYPES, usedSingletonTypes` to the import list at the top of `templateSections.test.js`, then append:

```js
describe('singleton field types', () => {
  const withSingletons = () => ([
    { id: 'sec_a', title: 'A', columns: 3, fields: [
      { key: 'nm', type: 'char_name', label: 'Imię' },
      { key: 'sub', type: SECTION_TYPE, label: '', section: { id: 'sub', title: 'S', columns: 2, fields: [
        { key: 'av', type: 'char_avatar', label: 'Portret' },
        { key: 'img', type: 'image', label: 'Herb' },
      ] } },
    ] },
  ]);

  test('lists both character-bound types', () => {
    expect(SINGLETON_FIELD_TYPES).toEqual(['char_name', 'char_avatar']);
  });

  test('usedSingletonTypes finds singletons at any depth and ignores image', () => {
    expect([...usedSingletonTypes(withSingletons())].sort()).toEqual(['char_avatar', 'char_name']);
    expect(usedSingletonTypes([]).size).toBe(0);
  });

  test('duplicating a singleton field is a no-op', () => {
    const tree = withSingletons();
    expect(duplicateNodeAtPath(tree, [0, 0], { mint, copySuffix: '(kopia)' })).toBe(tree);
  });

  test('duplicating a section drops singletons from the copy but keeps other fields', () => {
    const next = duplicateNodeAtPath(withSingletons(), [0, 1], { mint, copySuffix: '(kopia)' });
    const copy = next[0].fields[2];
    expect(copy.section.fields.map(f => f.type)).toEqual(['image']);
    expect(next[0].fields[1].section.fields.map(f => f.type)).toEqual(['char_avatar', 'image']);
  });

  test('duplicating a root section drops a nested singleton too', () => {
    const next = duplicateNodeAtPath(withSingletons(), [0], { mint, copySuffix: '(kopia)' });
    expect([...usedSingletonTypes([next[1]])]).toEqual([]);
    expect(next[1].fields.map(f => f.type)).toEqual([SECTION_TYPE]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=templateSections`
Expected: FAIL — `SINGLETON_FIELD_TYPES` / `usedSingletonTypes` undefined.

- [ ] **Step 3: Implement** — in `utils/templateSections.js`, add near `SECTION_TYPE`'s export:

```js
// Field types bound to the character document (character.name / character.avatar) instead of
// stats. A template holds at most one of each (PLAYRPG-240), so the creator gates adding and
// duplicating them, and the backend rejects a second one.
export const SINGLETON_FIELD_TYPES = ['char_name', 'char_avatar'];

// usedSingletonTypes returns which singleton types the template already contains, at any depth.
export function usedSingletonTypes(sections) {
  const used = new Set();
  walkFields(sections, (f) => { if (SINGLETON_FIELD_TYPES.includes(f.type)) used.add(f.type); });
  return used;
}

// dropSingletons removes singleton fields from a freshly copied section, recursively. It mutates
// its argument, which is only ever the deep copy duplicateNodeAtPath owns.
function dropSingletons(section) {
  section.fields = (section.fields || []).filter(f => !SINGLETON_FIELD_TYPES.includes(f.type));
  section.fields.forEach(f => { if (isContainer(f)) dropSingletons(sectionOf(f)); });
}
```

Replace `duplicateNodeAtPath` with:

```js
export function duplicateNodeAtPath(sections, path, { mint, copySuffix }) {
  const found = locate(sections, path);
  if (!found) return sections;
  // A second char_name/char_avatar would break the one-per-template rule, and the backend
  // would then reject every autosave of the template without the GM noticing.
  if (SINGLETON_FIELD_TYPES.includes(found.node.type)) return sections;
  const copy = remintKeys(JSON.parse(JSON.stringify(found.node)), mint);
  // Apply suffix to section title (both root and nested shapes) or leaf field label
  if (isContainer(copy)) {
    const section = sectionOf(copy);
    section.title = `${section.title || ''} ${copySuffix}`.trim();
    dropSingletons(section);
  } else if (copy.label) {
    copy.label = `${copy.label} ${copySuffix}`;
  }
  return insertAtPath(sections, path.slice(0, -1), path[path.length - 1] + 1, copy);
}
```

`walkFields` is declared later in the same file as a function declaration, so it is hoisted — no reordering needed. Check that `sectionOf(rootSection)` returns the root section itself (it is used that way on line ~267 today).

- [ ] **Step 4: Run to verify pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=templateSections`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/templateSections.js warhammer-battle-helper-front/src/utils/templateSections.test.js
git commit -m "feat: PLAYRPG-240 singleton field helpers for the template tree"
```

---

### Task 6: Frontend — SheetImagePicker component

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/SheetImagePicker.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/fields/SheetImagePicker.test.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (append after the `.custom-sheet__textarea` block, ~line 8330)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `locales/pl/translation.json` (`customSheet` object)

**Interfaces:**
- Consumes: `PRESETS` (Task 4), `resolveFileUrl` (`utils/fileUrl.js`), `ImageCropModal`.
- Produces: `<SheetImagePicker url preset variant upload onChange />`
  - `url: string` — stored URL or `''`
  - `preset: object` — a `PRESETS` entry
  - `variant: 'avatar' | 'free'`
  - `upload: ((File) => Promise<string>) | null`
  - `onChange: ((url: string) => void) | null` — `''` means removed
  - Both `upload` and `onChange` non-null ⇒ interactive; otherwise static and disabled.

- [ ] **Step 1: Add i18n keys** — in `en` `customSheet`:

```json
"imageUpload": "Upload image",
"imageChange": "Change image",
"imageRemove": "Remove image",
"imageUploadFailed": "Image upload failed"
```

in `pl` `customSheet`:

```json
"imageUpload": "Wgraj obrazek",
"imageChange": "Zmień obrazek",
"imageRemove": "Usuń obrazek",
"imageUploadFailed": "Nie udało się wgrać obrazka"
```

- [ ] **Step 2: Write the failing test** — `SheetImagePicker.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import SheetImagePicker from './SheetImagePicker';
import { PRESETS } from '../../../utils/imageProcessing';

const renderPicker = (props) => render(
  <SheetImagePicker url="" preset={PRESETS.sheetImage} variant="free" upload={null} onChange={null} {...props} />
);

test('static picker shows a disabled upload button and no actions', () => {
  renderPicker();
  expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
});

test('interactive empty picker enables the upload button', () => {
  renderPicker({ upload: jest.fn(), onChange: jest.fn() });
  expect(screen.getByRole('button', { name: 'Upload image' })).toBeEnabled();
});

test('filled picker shows the resolved image', () => {
  renderPicker({ url: '/avatars/crest.webp' });
  expect(screen.getByRole('img').getAttribute('src')).toMatch(/\/avatars\/crest\.webp$/);
});

test('remove clears the value', () => {
  const onChange = jest.fn();
  renderPicker({ url: '/avatars/crest.webp', upload: jest.fn(), onChange });
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(onChange).toHaveBeenCalledWith('');
});

test('a filled static picker has no change/remove actions', () => {
  renderPicker({ url: '/avatars/crest.webp' });
  expect(screen.queryByRole('button', { name: 'Change image' })).toBeNull();
});

test('avatar variant carries its modifier class', () => {
  const { container } = renderPicker({ variant: 'avatar', preset: PRESETS.avatar });
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('.custom-sheet__image--avatar')).not.toBeNull();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=SheetImagePicker`
Expected: FAIL — cannot find module `./SheetImagePicker`.

- [ ] **Step 4: Implement `SheetImagePicker.jsx`**

```jsx
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageCropModal from '../../../components/common/ImageCropModal';
import { resolveFileUrl } from '../../../utils/fileUrl';
import { AFFORDANCE_ICON_SIZE } from './affordances';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// One picker for both image-bearing field types: char_avatar (round, square crop) and image
// (free crop, full field width). Uploading is the caller's job, through `upload(file)`, the same
// split ImageCropModal makes — so the sheet body never imports the HTTP client. With no
// `upload`/`onChange` the picker renders static and disabled: a read-only sheet and the template
// creator show the control, they just cannot use it.
function SheetImagePicker({ url, preset, variant, upload, onChange }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [pickedFile, setPickedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const enabled = Boolean(upload && onChange);
  const src = resolveFileUrl(url);

  const openPicker = () => {
    if (enabled && !isUploading) inputRef.current?.click();
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setPickedFile(file);
  };

  const confirmCrop = async (processed) => {
    setPickedFile(null);
    setIsUploading(true);
    try {
      onChange(await upload(processed));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setIsUploading(false);
    }
  };

  const className = `custom-sheet__image custom-sheet__image--${variant}`
    + (isUploading ? ' custom-sheet__image--uploading' : '');

  return (
    <div className={className}>
      {src ? (
        <img className="custom-sheet__image-img" src={src} alt="" />
      ) : (
        <button
          type="button"
          className="custom-sheet__image-empty"
          onClick={openPicker}
          disabled={!enabled}
          aria-label={t('customSheet.imageUpload')}
        >
          <AddPhotoAlternateIcon style={{ fontSize: 24 }} />
        </button>
      )}
      {src && enabled && (
        <div className="custom-sheet__image-actions">
          <button type="button" className="custom-sheet__image-btn" onClick={openPicker} aria-label={t('customSheet.imageChange')}>
            <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
          <button type="button" className="custom-sheet__image-btn" onClick={() => onChange('')} aria-label={t('customSheet.imageRemove')}>
            <DeleteIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
        </div>
      )}
      {failed && <div className="custom-sheet__image-error">{t('customSheet.imageUploadFailed')}</div>}
      {enabled && (
        <input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={handleFile} hidden />
      )}
      {pickedFile && (
        <ImageCropModal file={pickedFile} preset={preset} onConfirm={confirmCrop} onCancel={() => setPickedFile(null)} />
      )}
    </div>
  );
}

export default SheetImagePicker;
```

- [ ] **Step 5: Add CSS** — append after the `.custom-sheet__textarea` rules in `style.css` (the `.custom-sheet__tile--image` modifier must come after the base `.custom-sheet__tile-value` at ~8214):

```css
/* Image-bearing fields (PLAYRPG-240): char_avatar and image share one picker. The tile's value
   row is a fixed-height flex line for inputs; an image needs its natural height instead. */
.custom-sheet__tile--image .custom-sheet__tile-value {
    display: block;
}

.custom-sheet__image {
    position: relative;
    width: 100%;
}

.custom-sheet__image-img {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid #c4a882;
    border-radius: 3px;
}

.custom-sheet__image-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 64px;
    background: #fff9f0;
    border: 1px dashed #c4a882;
    border-radius: 3px;
    color: #c9975b;
    cursor: pointer;
}

.custom-sheet__image-empty:hover:not(:disabled) {
    border-color: #7a5c42;
}

.custom-sheet__image-empty:disabled {
    cursor: default;
    opacity: 0.6;
}

.custom-sheet__image--avatar {
    width: 96px;
    margin: 0 auto;
}

.custom-sheet__image--avatar .custom-sheet__image-img,
.custom-sheet__image--avatar .custom-sheet__image-empty {
    width: 96px;
    height: 96px;
    min-height: 0;
    border-radius: 50%;
    object-fit: cover;
}

.custom-sheet__image--uploading .custom-sheet__image-img {
    filter: brightness(0.6);
}

.custom-sheet__image-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 4px;
}

.custom-sheet__image-btn {
    display: flex;
    padding: 2px;
    background: rgba(255, 249, 240, 0.9);
    border: 1px solid #c4a882;
    border-radius: 3px;
    color: #7a5c42;
    cursor: pointer;
}

.custom-sheet__image-btn:hover {
    border-color: #7a5c42;
}

.custom-sheet__image-error {
    margin-top: 4px;
    font-size: 0.8rem;
    color: #8b2c2c;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=SheetImagePicker`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/fields/SheetImagePicker.jsx warhammer-battle-helper-front/src/systems/custom/fields/SheetImagePicker.test.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-240 image picker for custom sheet fields"
```

---

### Task 7: Frontend — render the three new field types in CustomSheetBody

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.characterFields.test.jsx`

**Interfaces:**
- Consumes: `SheetImagePicker` (Task 6), `PRESETS` (Task 4).
- Produces (CustomSheetBody contract):
  - `values.name: string`, `values.avatar: string`, `values.images: { [key]: url }`
  - `onChange.name(value: string)`, `onChange.avatar(url: string)`, `onChange.image(key: string, url: string)`
  - new prop `uploadImage: ((File) => Promise<string>) | null` (default `null`)

- [ ] **Step 1: Write the failing test** — `CustomSheetBody.characterFields.test.jsx`:

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [{
  id: 's', title: '', columns: 3, fields: [
    { key: 'nm', type: 'char_name', label: 'Imię' },
    { key: 'av', type: 'char_avatar', label: 'Portret' },
    { key: 'crest', type: 'image', label: 'Herb' },
  ],
}];

const handlers = () => ({ name: jest.fn(), avatar: jest.fn(), image: jest.fn(), text: jest.fn() });

test('char_name shows character.name and edits it, never stats.texts', () => {
  const onChange = handlers();
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ name: 'Bohater', texts: {} }} onChange={onChange} uploadImage={jest.fn()} />
  );
  const input = container.querySelector('.custom-sheet__tile--text .custom-sheet__text-input');
  expect(input.value).toBe('Bohater');
  fireEvent.change(input, { target: { value: 'Bohaterka' } });
  expect(onChange.name).toHaveBeenCalledWith('Bohaterka');
  expect(onChange.text).not.toHaveBeenCalled();
});

test('char_avatar and image render pickers with their own values', () => {
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ avatar: '/avatars/a.webp', images: { crest: '/avatars/c.webp' } }} />
  );
  expect(container.querySelector('.custom-sheet__image--avatar img').getAttribute('src')).toMatch(/\/avatars\/a\.webp$/);
  expect(container.querySelector('.custom-sheet__image--free img').getAttribute('src')).toMatch(/\/avatars\/c\.webp$/);
});

test('image remove routes through onChange.image with the field key', () => {
  const onChange = handlers();
  render(
    <CustomSheetBody sections={sections} values={{ images: { crest: '/avatars/c.webp' } }} onChange={onChange} uploadImage={jest.fn()} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(onChange.image).toHaveBeenCalledWith('crest', '');
});

test('read-only sheet renders the pickers disabled', () => {
  render(<CustomSheetBody sections={sections} values={{}} />);
  screen.getAllByRole('button', { name: 'Upload image' }).forEach(btn => expect(btn).toBeDisabled());
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.characterFields`
Expected: FAIL — inputs/pickers not rendered (`default: return null`).

- [ ] **Step 3: Implement** — in `CustomSheetBody.jsx`:

Imports, after the `WeaponsTable` import:

```jsx
import SheetImagePicker from './fields/SheetImagePicker';
import { PRESETS } from '../../utils/imageProcessing';
```

Update the contract comment above the component:

```jsx
// onChange = { attr, advances, skill, skillAdvances, text, progress, number, name, avatar, image,
//              weaponAdd, weaponAddFromPreset, weaponRemove, weaponCell, weaponDamage, weaponFavorite }
//            | null (read-only)
// onRoll   = (rollModal) => void | null (no rolls)
// uploadImage = (File) => Promise<url> | null — uploads for char_avatar and image fields
```

Add the prop after `showAffordances = false,`:

```jsx
  uploadImage = null,
```

Add after `const weapons  = values.weapons    || {};`:

```jsx
  const images   = values.images     || {};
```

Add these cases right after the `case 'text_long': ...` block:

```jsx
      // The character's own name, not a stats value: values.name is character.name, which
      // tokens, lists and the short card all read. Same tile as a short text field.
      case 'char_name':
        return renderTile(field, 'text', (
          <input
            type="text"
            className="custom-sheet__text-input"
            value={values.name || ''}
            onChange={onChange ? e => onChange.name(e.target.value) : undefined}
            readOnly={readOnly}
          />
        ));

      case 'char_avatar':
        return renderTile(field, 'image', (
          <SheetImagePicker
            url={values.avatar || ''}
            preset={PRESETS.avatar}
            variant="avatar"
            upload={onChange ? uploadImage : null}
            onChange={onChange ? onChange.avatar : null}
          />
        ));

      case 'image':
        return renderTile(field, 'image', (
          <SheetImagePicker
            url={images[field.key] || ''}
            preset={PRESETS.sheetImage}
            variant="free"
            upload={onChange ? uploadImage : null}
            onChange={onChange ? url => onChange.image(field.key, url) : null}
          />
        ));
```

- [ ] **Step 4: Run all CustomSheetBody tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS, including existing snapshot/domShape tests (no existing markup changed).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.characterFields.test.jsx
git commit -m "feat: PLAYRPG-240 render name, avatar and image fields on the custom sheet"
```

---

### Task 8: Frontend — wire the sheet: state, saving, upload, header removal

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.characterFields.test.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (delete `.custom-sheet__char-header`, `.custom-sheet__char-name-input`, `.custom-sheet__char-name-input:focus`, `.custom-sheet__template-name`, ~7770-7800)
- Modify: locales (delete `character.name` only if unused after this change)

**Interfaces:**
- Consumes: CustomSheetBody contract from Task 7.
- Produces: PUT payload carrying `name`, `avatar`, `stats.images`.

- [ ] **Step 1: Write the failing test** — `CharacterSheet.characterFields.test.jsx`:

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '../../i18n';

jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = {
  name: 'Mój system',
  sections: [{ id: 's', fields: [
    { key: 'nm', type: 'char_name', label: 'Imię' },
    { key: 'crest', type: 'image', label: 'Herb' },
  ] }],
};

const renderSheet = (character) => render(
  <CustomCharacterSheet
    character={character}
    onClose={() => {}}
    onCharacterUpdate={() => {}}
    gameId="g1"
    token="t"
    game={{ customSystemTemplate: template }}
    isStandalone
  />
);

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
});
afterEach(() => jest.useRealTimers());

const lastBody = () => JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);

test('the old name header is gone', () => {
  const { container } = renderSheet({ id: 'c1', name: 'Bohater', stats: {} });
  expect(container.querySelector('.custom-sheet__char-header')).toBeNull();
});

test('typing in the name field saves character.name, keeping the avatar', async () => {
  const { container } = renderSheet({ id: 'c1', name: 'Bohater', avatar: '/avatars/a.webp', stats: {} });
  fireEvent.change(container.querySelector('.custom-sheet__text-input'), { target: { value: 'Bohaterka' } });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(lastBody()).toMatchObject({ name: 'Bohaterka', avatar: '/avatars/a.webp' });
});

test('removing an image saves immediately and drops the key from stats.images', async () => {
  const { getByRole } = renderSheet({ id: 'c1', name: 'B', stats: { images: { crest: '/avatars/c.webp' } } });
  await act(async () => { fireEvent.click(getByRole('button', { name: 'Remove image' })); });
  expect(lastBody().stats.images).toEqual({});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CharacterSheet.characterFields`
Expected: FAIL — header still present / `stats.images` undefined.

- [ ] **Step 3: Implement state** — in `CharacterSheet.jsx`:

In both `edited` initialisers (the `useState({...})` and the `setEdited({...})` inside the re-sync effect) add after `favoriteWeapons`:

```jsx
    images:           stats.images            || {},
```

(use `s.images` in the effect, matching its local variable).

After `const [charName, setCharName] = useState(...)` add:

```jsx
  const [charAvatar, setCharAvatar] = useState(character?.avatar || '');
```

After `const charNameRef = useRef(charName);` add:

```jsx
  const charAvatarRef  = useRef(charAvatar);
```

In the re-sync effect, after `charNameRef.current = character?.name || '';` add:

```jsx
    setCharAvatar(character?.avatar || '');
    charAvatarRef.current = character?.avatar || '';
```

- [ ] **Step 4: Implement saving** — change `saveCharacter` to take only the stats:

```jsx
  // Name and avatar are read from refs rather than passed in: they change through their own
  // fields, and every save — whichever field triggered it — must carry their latest values.
  const saveCharacter = useCallback(async (currentEdited) => {
    if (!gameId) return;
    setIsSaving(true);
    const updated = {
      ...character,
      name: charNameRef.current,
      avatar: charAvatarRef.current,
      stats: {
```

and add inside the `stats` object after `favoriteWeapons`:

```jsx
        images:           currentEdited.images,
```

Change `triggerAutoSave`:

```jsx
  const triggerAutoSave = useCallback((e) => {
    dirtyRef.current = true;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveCharacter(e), 800);
  }, [saveCharacter]);
```

Then drop the name argument at every call site:

Run: `cd warhammer-battle-helper-front/src/systems/custom && sed -i '' 's/, charNameRef\.current)/)/g' CharacterSheet.jsx && grep -n "charNameRef.current)" CharacterSheet.jsx`
Expected: no output (all `triggerAutoSave(ne, charNameRef.current)`, `saveCharacter(ne, charNameRef.current)`, `saveCharacter(edited, charNameRef.current)` now take one argument).

- [ ] **Step 5: Implement handlers** — add after `updateText`:

```jsx
  const updateName = (value) => {
    setCharName(value);
    charNameRef.current = value;
    triggerAutoSave(edited);
  };

  // An upload is a finished, one-click action like a favourite, so it saves straight away
  // instead of waiting out the autosave debounce.
  const updateAvatar = (url) => {
    setCharAvatar(url);
    charAvatarRef.current = url;
    saveCharacter(edited);
  };

  const updateImage = (key, url) => {
    const images = { ...edited.images };
    if (url) images[key] = url;
    else delete images[key];
    const ne = { ...edited, images };
    setEdited(ne);
    saveCharacter(ne);
  };

  const uploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('avatar', file, file.name);
    const res = await fetch(`${getApiUrl()}/avatars`, {
      method: 'POST',
      headers: getApiHeaders({ 'Authorization': `Bearer ${token}` }),
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url;
  }, [token]);
```

In `renderBody`, change `values={edited}` to:

```jsx
    values={{ ...edited, name: charName, avatar: charAvatar }}
```

add to the `onChange` object after `number:`:

```jsx
      name:     (val)             => updateName(val),
      avatar:   (url)             => updateAvatar(url),
      image:    (key, url)        => updateImage(key, url),
```

and add the prop after `onToggleDevelopment={toggleDevelopmentSkill}`:

```jsx
    uploadImage={uploadImage}
```

- [ ] **Step 6: Remove the header** — replace

```jsx
        <>
          {/* Character name */}
          <div className="custom-sheet__char-header">
            ...
          </div>

          {renderBody()}
        </>
```

with just `renderBody()` (the ternary branch becomes `) : renderBody()}`). Delete the four CSS rules listed in **Files**. Then:

Run: `cd warhammer-battle-helper-front/src && grep -rn "character\.name'" --include='*.js' --include='*.jsx' . ; grep -rn "custom-sheet__char-header\|char-name-input\|custom-sheet__template-name" .`
Expected: second grep empty. If the first grep is empty too, delete `"name"` from the `character` object in both locale files; if anything still uses `character.name`, keep it.

- [ ] **Step 7: Run custom-system tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='systems/custom|standaloneRender'`
Expected: PASS (including existing `CharacterSheet.remoteUpdate` and `.standalone` tests).

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx warhammer-battle-helper-front/src/systems/custom/CharacterSheet.characterFields.test.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-240 edit name, avatar and images from sheet fields, drop the name header"
```

---

### Task 9: Frontend — creator: new field types, singleton gating, missing-name warning, error messages

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/FieldChrome.jsx`
- Test: `warhammer-battle-helper-front/src/components/creator/FieldChrome.test.jsx`
- Modify: `warhammer-battle-helper-front/src/hooks/useGames.js`
- Modify: `warhammer-battle-helper-front/src/style.css` (palette disabled modifier, after `.creator__palette-card:hover` ~9651)
- Modify: locales

**Interfaces:**
- Consumes: `SINGLETON_FIELD_TYPES`, `usedSingletonTypes` (Task 5); backend error codes (Task 2).

- [ ] **Step 1: Write the failing FieldChrome test** — append to `FieldChrome.test.jsx`, reusing that file's existing render helper/props. If it has none, use:

```jsx
test('hides the duplicate button when onDuplicate is null', () => {
  render(
    <FieldChrome
      field={{ key: 'nm', type: 'char_name', label: 'Imię' }}
      onSelect={() => {}} onEdit={() => {}} onDuplicate={null} onRemove={() => {}}
      onMoveUp={() => {}} onMoveDown={() => {}}
    />
  );
  expect(screen.queryByRole('button', { name: i18n.t('creator.fieldDuplicate') })).toBeNull();
  expect(screen.getByRole('button', { name: i18n.t('creator.fieldDelete') })).toBeInTheDocument();
});
```

(Match the file's existing i18n import form: `import i18n from '../../i18n'` if it calls `i18n.t`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FieldChrome`
Expected: FAIL — duplicate button still rendered.

- [ ] **Step 3: FieldChrome** — wrap the duplicate button:

```jsx
        {onDuplicate && (
          <button
            className="creator__chrome-btn"
            aria-label={t('creator.fieldDuplicate')}
            onClick={e => { e.stopPropagation(); onDuplicate(); }}
          >
            <ContentCopyIcon style={{ fontSize: 13 }} />
          </button>
        )}
```

Run the FieldChrome test again — expected PASS.

- [ ] **Step 4: TemplateBuilder field types and palette** — imports:

```jsx
import BadgeIcon from '@mui/icons-material/Badge';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ImageIcon from '@mui/icons-material/Image';
```

and add `SINGLETON_FIELD_TYPES, usedSingletonTypes,` to the `../../utils/templateSections` import.

Add to `FIELD_TYPES` (after `section`):

```jsx
  { type: 'char_name',   labelKey: 'creator.fieldType.charName',    icon: <BadgeIcon fontSize="small" />,         desc: 'creator.fieldType.charNameDesc' },
  { type: 'char_avatar', labelKey: 'creator.fieldType.charAvatar',  icon: <AccountCircleIcon fontSize="small" />, desc: 'creator.fieldType.charAvatarDesc' },
  { type: 'image',       labelKey: 'creator.fieldType.image',       icon: <ImageIcon fontSize="small" />,         desc: 'creator.fieldType.imageDesc' },
```

Add to `PALETTE_GROUPS` after the layout group:

```jsx
  { labelKey: 'creator.paletteGroupCharacter', types: ['char_name', 'char_avatar', 'image'] },
```

- [ ] **Step 5: TemplateBuilder gating** — inside the component, next to `duplicateKeys` state, add:

```jsx
  // Which one-per-template types are already placed; drives the palette, the inline picker
  // and the missing-name warning.
  const usedSingletons = useMemo(() => usedSingletonTypes(sections), [sections]);
```

At the top of both `addNode` and `addNodeTo` add:

```jsx
    if (usedSingletons.has(type)) return;
```

In `buildChrome`'s `common` object change `onDuplicate` to:

```jsx
      onDuplicate: SINGLETON_FIELD_TYPES.includes(node.type) ? null : () => duplicateNode(path),
```

and add `usedSingletons` to `buildChrome`'s dependency array is NOT needed (it does not read it) — leave the array unchanged.

In the inline picker, change `{FIELD_TYPES.map(ft => (` to:

```jsx
              {FIELD_TYPES.filter(ft => !usedSingletons.has(ft.type)).map(ft => (
```

In the palette, replace the palette `<button ...>` with:

```jsx
                  {groupTypes.map(ft => {
                    const used = usedSingletons.has(ft.type);
                    return (
                      <button
                        key={ft.type}
                        // aria-disabled, not disabled: a disabled button fires no mouseenter in
                        // Chrome, and the tooltip is what explains why the card is greyed out.
                        aria-disabled={used}
                        className={`creator__palette-card${used ? ' creator__palette-card--used' : ''}`}
                        onMouseEnter={e => showPaletteTooltip(
                          used ? t('creator.singletonUsed') : t(ft.desc, { defaultValue: ft.type }),
                          e.currentTarget,
                        )}
                        onMouseLeave={hidePaletteTooltip}
                        onClick={() => { if (!used) addNode(ft.type); }}
                      >
                        <span className="creator__palette-icon">{ft.icon}</span>
                        <div className="creator__palette-info">
                          <div className="creator__palette-name">{t(ft.labelKey, { defaultValue: ft.type })}</div>
                          <div className="creator__palette-desc">{t(ft.desc, { defaultValue: '' })}</div>
                        </div>
                      </button>
                    );
                  })}
```

In the palette header, directly after the existing `{selected !== null ? (...) : ... : null}` expression, add:

```jsx
            {!usedSingletons.has('char_name') && (
              <div className="creator__palette-hint creator__palette-hint--warn">
                {t('creator.missingCharName')}
              </div>
            )}
```

CSS, after `.creator__palette-card:hover`:

```css
.creator__palette-card--used,
.creator__palette-card--used:hover {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    background: rgba(255, 255, 255, 0.5);
    border-color: rgba(201, 151, 91, 0.25);
}
```

- [ ] **Step 6: Translate game errors** — in `hooks/useGames.js`, above the hook:

```js
// Codes the backend returns when a template cannot back a game (PLAYRPG-240).
const TEMPLATE_ERROR_KEYS = {
  template_missing_char_name: 'creator.templateMissingCharName',
  template_duplicate_char_name: 'creator.templateDuplicateCharName',
  template_duplicate_char_avatar: 'creator.templateDuplicateCharAvatar',
};
```

In `createGame` change the throw to:

```js
        const key = TEMPLATE_ERROR_KEYS[errorData.error];
        throw new Error(key ? t(key) : (errorData.error || 'Failed to create game'));
```

and add `t` to `createGame`'s dependency array. In `syncTemplate` change `setError(data.error || t('creator.syncFailed'));` to:

```js
        const key = TEMPLATE_ERROR_KEYS[data.error];
        setError(key ? t(key) : (data.error || t('creator.syncFailed')));
```

- [ ] **Step 7: i18n** — `en` `creator.fieldType`:

```json
"charName": "Character name",
"charNameDesc": "The character's name, shown on tokens and lists. One per sheet.",
"charAvatar": "Avatar",
"charAvatarDesc": "Character portrait, shown on the token. One per sheet.",
"image": "Image",
"imageDesc": "A picture the player uploads"
```

`en` `creator`:

```json
"paletteGroupCharacter": "Character",
"singletonUsed": "Already on the sheet — only one allowed",
"missingCharName": "The sheet has no Character name field, so a game cannot use it yet",
"templateMissingCharName": "This template has no Character name field. Add it in the template creator.",
"templateDuplicateCharName": "This template has more than one Character name field.",
"templateDuplicateCharAvatar": "This template has more than one Avatar field."
```

`pl` `creator.fieldType`:

```json
"charName": "Nazwa postaci",
"charNameDesc": "Imię postaci, widoczne na tokenach i listach. Jedno na kartę.",
"charAvatar": "Avatar",
"charAvatarDesc": "Portret postaci, widoczny na tokenie. Jeden na kartę.",
"image": "Obrazek",
"imageDesc": "Obrazek wgrywany przez gracza"
```

`pl` `creator`:

```json
"paletteGroupCharacter": "Postać",
"singletonUsed": "Już jest na karcie — dozwolone tylko jedno",
"missingCharName": "Karta nie ma pola Nazwa postaci, więc gra nie może jej jeszcze użyć",
"templateMissingCharName": "Szablon nie ma pola Nazwa postaci. Dodaj je w kreatorze szablonu.",
"templateDuplicateCharName": "Szablon ma więcej niż jedno pole Nazwa postaci.",
"templateDuplicateCharAvatar": "Szablon ma więcej niż jedno pole Avatar."
```

Then run the `i18n-sync` skill's diff to confirm en/pl have the same key set.

- [ ] **Step 8: Traversal census** — new types must not leak into lists that assume a stats value. Run:

`cd warhammer-battle-helper-front/src && grep -rn "walkFields(" --include='*.js' --include='*.jsx' . | grep -v test`

For each hit, confirm it filters by an explicit type allowlist (e.g. `f.type === 'attr'`, `SHORT_CARD_TYPES.includes`). Any hit that collects *all* leaf fields for a value-bearing purpose (token-display field picker, short card) must exclude `char_name`, `char_avatar`, `image`. Do the same for Go: `grep -rn "flattenFields(" warhammer-battle-helper-backend/internal | grep -v _test`. Record findings in the commit message body; fix any leak with the existing allowlist pattern of that site.

- [ ] **Step 9: Run creator tests and lint**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='creator|FieldChrome|templateSections|useGames'`
Expected: PASS.

Run: `cd warhammer-battle-helper-front && npx eslint src/components/creator/TemplateBuilder.jsx src/components/creator/FieldChrome.jsx src/hooks/useGames.js src/systems/custom src/utils/templateSections.js src/api`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/components/creator/FieldChrome.jsx warhammer-battle-helper-front/src/components/creator/FieldChrome.test.jsx warhammer-battle-helper-front/src/hooks/useGames.js warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-240 character name, avatar and image fields in the template creator"
```

---

### Task 10: Full verification

- [ ] **Step 1: Full suites**

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: PASS.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS except the known `App.test.js` axios ESM baseline.

- [ ] **Step 2: Backend enforcement against the running stack** (JWT recipe: memory `local-e2e-verification-recipe`). With a template that has no `char_name` field:

```bash
curl -s -X POST http://localhost:8080/games -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"name":"t","gameSystem":"custom","customTemplateId":"<TEMPLATE_ID>"}'
```

Expected: `{"error":"template_missing_char_name"}` with HTTP 400.

- [ ] **Step 3: Browser check** (user does this or `run` skill) — in the creator: palette shows the "Character" group; adding "Character name" greys it out with the tooltip; the warning disappears; duplicating a section with the name field yields a copy without it. In a game: name typed in the field updates the token label after save; avatar upload shows on the short card and token; image field uploads, changes, removes; old header above the sheet is gone.

- [ ] **Step 4: Report** — list anything unverified (e.g. browser check not done) explicitly; do not claim done without it.
