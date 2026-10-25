# PLAYRPG-261 Template Description & Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom system templates get a rich-text description and a content language; the lobby shows the description and the create-game dialog filters templates by language.

**Architecture:** Two top-level fields on `SystemTemplate` (`description`, `language`), validated and sanitized in `models`, saved through the existing versioned PATCH. The language list is one JSON file in the frontend that the JS imports and a Go test pins against the Go slice. Frontend: a pure `filterByLanguages` in `systemOptions.js`, one read-only `TemplateDescriptionDialog` reused in three places, a new "About" card in the creator's General tab.

**Tech Stack:** Go + Gin + MongoDB (mtest mocks), bluemonday via `internal/sanitize`; React 18 + MUI 7 + TipTap 3 + i18next; Jest via CRA.

**Spec:** `docs/superpowers/specs/PLAYRPG-261.md`

## Global Constraints

- Language codes, exactly and in this order: `pl, en, de, fr, es, it, pt, cs, sk, uk, ru, hu, ja, zh, ko`. `""` = unspecified.
- Description limit: 20 000 bytes **after** `sanitize.RichHTML`.
- No migration. A missing Mongo field reads as `""`.
- Variants (`BaseSystem != ""`) never carry description or language: backend 400, creator hides the card.
- Error messages are stable codes (`template_invalid_language`, `template_description_too_long`, `template_about_on_variant`), mapped to 400 via `models.IsTemplateValidationError`.
- Code comments in English. All UI strings via `t('key')`, keys added to both `locales/en/translation.json` and `locales/pl/translation.json`.
- Icons only from `@mui/icons-material`. Tooltips only via `usePortalTooltip` (never MUI `<Tooltip>`).
- `localStorage` reads/writes wrapped in try/catch.
- Frontend tests: `CI=true npm test -- --watchAll=false --testPathPattern=<name>` from `warhammer-battle-helper-front/`. Known baseline failure: `App.test.js` (axios ESM).
- Go tests that read the front-end fixture must run **on the host** (the backend container does not mount the front end): `cd warhammer-battle-helper-backend && go test ./...`.
- Before every commit, check the branch in the same command: `git branch --show-current && git add ... && git commit ...` (parallel sessions share this checkout).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `warhammer-battle-helper-front/src/utils/templateLanguages.json` (new) | The one language list, shared by Go test and JS. |
| `warhammer-battle-helper-front/src/utils/templateLanguages.js` (new) | `TEMPLATE_LANGUAGES`, `isTemplateLanguage`. |
| `warhammer-battle-helper-backend/internal/models/template_about.go` (new) | Go list, `NormalizeTemplateAbout`, the three errors. |
| `warhammer-battle-helper-backend/internal/models/template_about_test.go` (new) | Validation + fixture parity. |
| `internal/models/SystemTemplate.go` | Fields + request fields + `IsTemplateValidationError`. |
| `internal/repository/TemplateRepository.go` | `UpdateContent` takes the request, writes the two fields. |
| `internal/service/TemplateService.go` | Create/Update/Clone wiring, `templateContentChanged`. |
| `src/components/lobby/systemOptions.js` | Options carry `language`/`description`; `filterByLanguages`. |
| `src/components/common/richText/RichTextEditor.jsx` | `toolbar` prop for read-only rendering. |
| `src/components/lobby/TemplateDescriptionDialog.jsx` (new) | Read-only description popup. |
| `src/components/lobby/LanguageFilter.jsx` (new) | Multi-select + remembered value. |
| `src/components/lobby/CreateGameDialog.jsx` | Filter, ⓘ in rows, selected-system card. |
| `src/components/lobby/TemplateManagerDialog.jsx` | ⓘ next to the name. |
| `src/hooks/useTemplates.js` | Create sends `language`. |
| `src/components/creator/TemplateAboutCard.jsx` (new) | The General-tab card. |
| `src/components/creator/TemplateBuilder.jsx` | About state, save body, renders the card. |
| `src/components/tutorial/tours/creatorGeneral.js` | `about` step. |

---

### Task 1: Language list and about validation (Go models)

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/templateLanguages.json`
- Create: `warhammer-battle-helper-backend/internal/models/template_about.go`
- Create: `warhammer-battle-helper-backend/internal/models/template_about_test.go`
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (struct ~line 213, requests ~line 436, `IsTemplateValidationError` ~line 493)

**Interfaces:**
- Produces: `models.SupportedTemplateLanguages []string`, `models.MaxTemplateDescriptionBytes = 20000`, `models.NormalizeTemplateAbout(baseSystem string, description, language *string) error` (sanitizes `*description` in place; nil pointers are skipped), errors `ErrInvalidTemplateLanguage`, `ErrTemplateDescriptionTooLong`, `ErrTemplateAboutOnVariant`. Fields `SystemTemplate.Description`, `SystemTemplate.Language`; `CreateTemplateRequest.Description/Language *string`; `UpdateTemplateRequest.Description/Language *string`.

- [ ] **Step 1: Create the shared fixture**

`warhammer-battle-helper-front/src/utils/templateLanguages.json`:
```json
["pl", "en", "de", "fr", "es", "it", "pt", "cs", "sk", "uk", "ru", "hu", "ja", "zh", "ko"]
```

- [ ] **Step 2: Write the failing tests**

`warhammer-battle-helper-backend/internal/models/template_about_test.go`:
```go
package models

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

// templateLanguagesPath is the list the front end imports; both sides must hold the same codes.
// The backend container does not mount the front end, so run this on the host.
const templateLanguagesPath = "../../../warhammer-battle-helper-front/src/utils/templateLanguages.json"

func TestSupportedTemplateLanguagesMatchFrontEnd(t *testing.T) {
	raw, err := os.ReadFile(templateLanguagesPath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var codes []string
	if err := json.Unmarshal(raw, &codes); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if !reflect.DeepEqual(codes, SupportedTemplateLanguages) {
		t.Errorf("front end has %v, Go has %v", codes, SupportedTemplateLanguages)
	}
}

func strp(s string) *string { return &s }

func TestNormalizeTemplateAbout(t *testing.T) {
	t.Run("unspecified and listed languages pass", func(t *testing.T) {
		for _, code := range []string{"", "pl", "ko"} {
			if err := NormalizeTemplateAbout("", nil, strp(code)); err != nil {
				t.Errorf("%q: %v", code, err)
			}
		}
	})
	t.Run("unknown language is rejected", func(t *testing.T) {
		err := NormalizeTemplateAbout("", nil, strp("xx"))
		if !errors.Is(err, ErrInvalidTemplateLanguage) {
			t.Errorf("err = %v, want ErrInvalidTemplateLanguage", err)
		}
	})
	t.Run("description is sanitized in place", func(t *testing.T) {
		d := strp(`<p>Ala<script>alert(1)</script></p>`)
		if err := NormalizeTemplateAbout("", d, nil); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(*d, "script") || !strings.Contains(*d, "Ala") {
			t.Errorf("description = %q", *d)
		}
	})
	t.Run("limit counts the sanitized form", func(t *testing.T) {
		// The script body is stripped, so this is far under the limit once sanitized.
		d := strp("<p>x</p><script>" + strings.Repeat("a", MaxTemplateDescriptionBytes) + "</script>")
		if err := NormalizeTemplateAbout("", d, nil); err != nil {
			t.Errorf("err = %v, want nil", err)
		}
		long := strp("<p>" + strings.Repeat("a", MaxTemplateDescriptionBytes) + "</p>")
		if err := NormalizeTemplateAbout("", long, nil); !errors.Is(err, ErrTemplateDescriptionTooLong) {
			t.Errorf("err = %v, want ErrTemplateDescriptionTooLong", err)
		}
	})
	t.Run("variant rejects non-empty values, accepts empty ones", func(t *testing.T) {
		if err := NormalizeTemplateAbout("warhammer4e", strp(""), strp("")); err != nil {
			t.Errorf("empty: %v", err)
		}
		if err := NormalizeTemplateAbout("warhammer4e", nil, strp("pl")); !errors.Is(err, ErrTemplateAboutOnVariant) {
			t.Errorf("language: err = %v", err)
		}
		if err := NormalizeTemplateAbout("warhammer4e", strp("<p>x</p>"), nil); !errors.Is(err, ErrTemplateAboutOnVariant) {
			t.Errorf("description: err = %v", err)
		}
	})
	t.Run("errors are validation errors", func(t *testing.T) {
		for _, err := range []error{ErrInvalidTemplateLanguage, ErrTemplateDescriptionTooLong, ErrTemplateAboutOnVariant} {
			if !IsTemplateValidationError(err) {
				t.Errorf("%v is not a validation error", err)
			}
		}
	})
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/ -run 'TemplateAbout|SupportedTemplateLanguages'`
Expected: build failure, `undefined: SupportedTemplateLanguages`.

- [ ] **Step 4: Implement**

`warhammer-battle-helper-backend/internal/models/template_about.go`:
```go
package models

import (
	"errors"

	"battle-helper/internal/sanitize"
)

// SupportedTemplateLanguages are the ISO 639-1 codes a template may declare. Kept equal to
// warhammer-battle-helper-front/src/utils/templateLanguages.json (pinned by a test).
var SupportedTemplateLanguages = []string{
	"pl", "en", "de", "fr", "es", "it", "pt", "cs", "sk", "uk", "ru", "hu", "ja", "zh", "ko",
}

// MaxTemplateDescriptionBytes caps the description after sanitizing, so stripped markup does
// not count against the author.
const MaxTemplateDescriptionBytes = 20000

var (
	ErrInvalidTemplateLanguage    = errors.New("template_invalid_language")
	ErrTemplateDescriptionTooLong = errors.New("template_description_too_long")
	ErrTemplateAboutOnVariant     = errors.New("template_about_on_variant")
)

func isSupportedTemplateLanguage(code string) bool {
	if code == "" {
		return true
	}
	for _, c := range SupportedTemplateLanguages {
		if c == code {
			return true
		}
	}
	return false
}

// NormalizeTemplateAbout validates the about fields of a save and sanitizes the description in
// place. A nil pointer means the field is not part of the save and is skipped. A token-display
// variant has no sheet of its own to describe, so it may only carry empty values.
func NormalizeTemplateAbout(baseSystem string, description, language *string) error {
	if description != nil {
		*description = sanitize.RichHTML(*description)
	}
	if baseSystem != "" {
		if (description != nil && *description != "") || (language != nil && *language != "") {
			return ErrTemplateAboutOnVariant
		}
		return nil
	}
	if language != nil && !isSupportedTemplateLanguage(*language) {
		return ErrInvalidTemplateLanguage
	}
	if description != nil && len(*description) > MaxTemplateDescriptionBytes {
		return ErrTemplateDescriptionTooLong
	}
	return nil
}
```

In `SystemTemplate.go`, add to `SystemTemplate` right after `Name`:
```go
	// Description is the author's rich-text blurb shown in the lobby; sanitized HTML.
	Description string `bson:"description,omitempty" json:"description,omitempty"`
	// Language is the ISO 639-1 code the template is written in; "" means unspecified, which is
	// also what templates saved before PLAYRPG-261 read as.
	Language string `bson:"language,omitempty" json:"language,omitempty"`
```

Add to `CreateTemplateRequest` (after `Sections`) and to `UpdateTemplateRequest` (after `Settings`):
```go
	Description *string `json:"description"`
	Language    *string `json:"language"`
```

Extend `IsTemplateValidationError`:
```go
func IsTemplateValidationError(err error) bool {
	return errors.Is(err, ErrMissingCharName) ||
		errors.Is(err, ErrDuplicateCharName) ||
		errors.Is(err, ErrDuplicateCharAvatar) ||
		errors.Is(err, ErrInvalidTemplateLanguage) ||
		errors.Is(err, ErrTemplateDescriptionTooLong) ||
		errors.Is(err, ErrTemplateAboutOnVariant)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/`
Expected: `ok`. If `sanitize` imports `models` (import cycle), stop and report; it currently imports only bluemonday.

- [ ] **Step 6: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/utils/templateLanguages.json warhammer-battle-helper-backend/internal/models/ && git commit -m "feat: PLAYRPG-261 template description and language fields with validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Save, create and clone the about fields (Go repo + service)

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateRepository.go:182-206`
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateMembers_test.go:61-115`
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go` (`Create` ~231, `Update` ~305, `Clone` ~479, `templateContentChanged` ~527)
- Modify: `warhammer-battle-helper-backend/internal/service/template_content_changed_test.go`
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService_test.go`

**Interfaces:**
- Consumes: Task 1 (`NormalizeTemplateAbout`, request fields).
- Produces: `func (r *TemplateRepository) UpdateContent(id string, editorID primitive.ObjectID, req models.UpdateTemplateRequest, bumpVersion bool) error` — the version is `*req.Version` (caller guarantees non-nil). The HTTP API is unchanged apart from the two new body fields.

Changing the repository signature to take the request (instead of adding two more positional pointers to a 7-parameter function) keeps the call readable; the compiler finds all three test callers.

- [ ] **Step 1: Write failing tests**

In `template_content_changed_test.go`, set `Description: "<p>a</p>", Language: "pl"` on `current` and append cases:
```go
		{"description changed", models.UpdateTemplateRequest{Description: str("<p>b</p>")}, true},
		{"language changed", models.UpdateTemplateRequest{Language: str("en")}, true},
		{"same description and language", models.UpdateTemplateRequest{
			Description: str("<p>a</p>"), Language: str("pl")}, false},
```

In `TemplateMembers_test.go` rewrite the three `UpdateContent` calls to the new signature and add a subtest:
```go
// in the first subtest:
		name := "New"
		v := 3
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), editor, models.UpdateTemplateRequest{Name: &name, Version: &v}, true); err != nil {
// second subtest:
		v := 5
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), primitive.NewObjectID(), models.UpdateTemplateRequest{Version: &v}, false); err != nil {
// third subtest:
		v := 1
		err := repo.UpdateContent(primitive.NewObjectID().Hex(), primitive.NewObjectID(), models.UpdateTemplateRequest{Version: &v}, false)

	mt.Run("writes description and language when present", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okWrite)
		v, desc, lang := 2, "<p>d</p>", "pl"
		req := models.UpdateTemplateRequest{Version: &v, Description: &desc, Language: &lang}
		if err := repo.UpdateContent(primitive.NewObjectID().Hex(), primitive.NewObjectID(), req, true); err != nil {
			t.Fatal(err)
		}
		set := firstStatement(mt, "updates").Lookup("u", "$set").Document()
		if set.Lookup("description").StringValue() != desc || set.Lookup("language").StringValue() != lang {
			t.Errorf("$set = %s", relaxed(t, set))
		}
	})
```

In `TemplateService_test.go` add:
```go
func TestAboutFields(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	owner := primitive.NewObjectID()
	id := primitive.NewObjectID()
	v := 1
	str := func(s string) *string { return &s }

	mt.Run("update with an unknown language is rejected before writing", func(mt *mtest.T) {
		mt.AddMockResponses(found(templateDoc(id, "T", false, member(owner, models.RoleOwner))))
		_, err := newSvc(mt).Update(id.Hex(), owner, models.UpdateTemplateRequest{Version: &v, Language: str("xx")})
		if !errors.Is(err, models.ErrInvalidTemplateLanguage) {
			t.Errorf("err = %v, want ErrInvalidTemplateLanguage", err)
		}
	})

	mt.Run("update on a variant with a language is rejected", func(mt *mtest.T) {
		doc := append(templateDoc(id, "T", false, member(owner, models.RoleOwner)), bson.E{Key: "baseSystem", Value: "warhammer4e"})
		mt.AddMockResponses(found(doc))
		_, err := newSvc(mt).Update(id.Hex(), owner, models.UpdateTemplateRequest{Version: &v, Language: str("pl")})
		if !errors.Is(err, models.ErrTemplateAboutOnVariant) {
			t.Errorf("err = %v, want ErrTemplateAboutOnVariant", err)
		}
	})

	mt.Run("create stores the sanitized description and the language", func(mt *mtest.T) {
		mt.AddMockResponses(wrote, users(owner, "me@example.com"))
		created, err := newSvc(mt).Create(owner, models.CreateTemplateRequest{
			Name: "T", Description: str(`<p>a</p><script>x</script>`), Language: str("pl")})
		if err != nil {
			t.Fatal(err)
		}
		if created.Language != "pl" || created.Description != "<p>a</p>" {
			t.Errorf("created = %q / %q", created.Language, created.Description)
		}
	})

	mt.Run("clone copies description and language", func(mt *mtest.T) {
		src := append(templateDoc(id, "T", true, member(primitive.NewObjectID(), models.RoleOwner)),
			bson.E{Key: "description", Value: "<p>d</p>"}, bson.E{Key: "language", Value: "en"})
		mt.AddMockResponses(found(src), wrote, users(owner, "me@example.com"))
		clone, err := newSvc(mt).Clone(id.Hex(), owner, "")
		if err != nil {
			t.Fatal(err)
		}
		if clone.Description != "<p>d</p>" || clone.Language != "en" {
			t.Errorf("clone = %q / %q", clone.Description, clone.Language)
		}
	})
}
```
(If `decorateOrLog` issues no user lookup for an owner-only template, the extra `users(...)` mock is simply unused — mtest does not fail on leftover responses.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/repository/ ./internal/service/`
Expected: build failure on the new `UpdateContent` signature / missing fields in the content-change comparison.

- [ ] **Step 3: Implement**

`TemplateRepository.UpdateContent`:
```go
// UpdateContent saves the content fields present in req when editorID may edit and the stored
// version still equals *req.Version. bumpVersion is set only when the content actually changed.
func (r *TemplateRepository) UpdateContent(id string, editorID primitive.ObjectID, req models.UpdateTemplateRequest, bumpVersion bool) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	set := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		set["name"] = *req.Name
	}
	if req.Sections != nil {
		set["sections"] = req.Sections
	}
	if req.Settings != nil {
		set["settings"] = *req.Settings
	}
	if req.Description != nil {
		set["description"] = *req.Description
	}
	if req.Language != nil {
		set["language"] = *req.Language
	}
	update := bson.M{"$set": set}
	if bumpVersion {
		update["$inc"] = bson.M{"version": 1}
		set["updatedBy"] = editorID
	}
	filter := memberWith(editorID, models.ActionEdit)
	filter["_id"] = objID
	filter["version"] = *req.Version
	return r.conditionalUpdate(filter, update)
}
```
Keep the existing doc comment if there is one above the function; replace only its wording about parameters.

`TemplateService.Update` — after the `ValidateSingletonFields` block, before the repo call:
```go
	if err := models.NormalizeTemplateAbout(t.BaseSystem, req.Description, req.Language); err != nil {
		return nil, err
	}
	err = s.repo.UpdateContent(id, editorID, req, templateContentChanged(t, req))
```

`TemplateService.Create` — before building `t`:
```go
	if err := models.NormalizeTemplateAbout(req.BaseSystem, req.Description, req.Language); err != nil {
		return nil, err
	}
```
and in the struct literal:
```go
		Description: derefOr(req.Description),
		Language:    derefOr(req.Language),
```
with a small helper at the bottom of the file:
```go
// derefOr returns *s, or "" for a field the request left out.
func derefOr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
```

`TemplateService.Clone` — add to the literal:
```go
		Description:      src.Description,
		Language:         src.Language,
```

`templateContentChanged` — extend the doc comment to "(name, sections, settings, description, language)" and add before `return false`:
```go
	if req.Description != nil && *req.Description != current.Description {
		return true
	}
	if req.Language != nil && *req.Language != current.Language {
		return true
	}
```
Note: `req.Description` is already sanitized when this runs (Update normalizes first), so the sanitizer's echo of an unchanged description compares equal.

- [ ] **Step 4: Run tests**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: all `ok`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-backend/internal/ && git commit -m "feat: PLAYRPG-261 save, create and clone template description and language

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Language list, names and the filter logic (JS)

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/templateLanguages.js`
- Create: `warhammer-battle-helper-front/src/utils/templateLanguages.test.js`
- Modify: `warhammer-battle-helper-front/src/components/lobby/systemOptions.js`
- Modify: `warhammer-battle-helper-front/src/components/lobby/systemOptions.test.js`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json`

**Interfaces:**
- Consumes: `src/utils/templateLanguages.json` (Task 1).
- Produces: `TEMPLATE_LANGUAGES: string[]`, `isTemplateLanguage(code): boolean`; options from `buildSystemOptions` gain `language: string` (`''` when unset) and `description: string` (`''` when unset) on template options; `filterByLanguages(options, langs): option[]`. i18n keys `languages.<code>` for every code plus `languages.unspecified`.

- [ ] **Step 1: Write failing tests**

`src/utils/templateLanguages.test.js`:
```js
import i18n from '../i18n';
import { TEMPLATE_LANGUAGES, isTemplateLanguage } from './templateLanguages';

test('every language has a name in en and pl', () => {
  ['en', 'pl'].forEach(lng => {
    [...TEMPLATE_LANGUAGES, 'unspecified'].forEach(code => {
      expect(typeof i18n.getResource(lng, 'translation', `languages.${code}`)).toBe('string');
    });
  });
});

test('isTemplateLanguage accepts listed codes only', () => {
  expect(isTemplateLanguage('pl')).toBe(true);
  expect(isTemplateLanguage('xx')).toBe(false);
  expect(isTemplateLanguage('')).toBe(false);
});
```

Append to `systemOptions.test.js` (and add `filterByLanguages` to the import):
```js
describe('filterByLanguages', () => {
  const opts = buildSystemOptions(systems, [
    { id: 'a', name: 'A', myRole: 'owner', language: 'pl', description: '<p>x</p>' },
    { id: 'b', name: 'B', myRole: 'owner', language: 'en' },
    { id: 'c', name: 'C', myRole: 'owner' },
  ]);
  const labels = (list) => list.map(o => o.label);

  it('carries language and description onto template options', () => {
    const a = opts.find(o => o.label === 'A');
    expect(a.language).toBe('pl');
    expect(a.description).toBe('<p>x</p>');
    expect(opts.find(o => o.label === 'C').language).toBe('');
  });

  it('passes everything through with no language chosen', () => {
    expect(filterByLanguages(opts, [])).toBe(opts);
  });

  it('keeps built-in systems and templates in a chosen language, drops unspecified', () => {
    expect(labels(filterByLanguages(opts, ['pl']))).toEqual([
      'Warhammer Fantasy Roleplay 4e', 'Call of Cthulhu 7e', 'A',
    ]);
  });

  it('matches any of several chosen languages', () => {
    expect(labels(filterByLanguages(opts, ['pl', 'en'])).slice(2)).toEqual(['A', 'B']);
  });
});
```
(Order of `A`, `B` follows `byUpdatedDesc` with no `updatedAt` → stable original order.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='templateLanguages|systemOptions'`
Expected: FAIL — `Cannot find module './templateLanguages'`, `filterByLanguages is not a function`.

- [ ] **Step 3: Implement**

`src/utils/templateLanguages.js`:
```js
import codes from './templateLanguages.json';

// ISO 639-1 codes a custom template may declare. The JSON is also read by a Go test
// (internal/models/template_about_test.go), so the backend validates exactly this list.
export const TEMPLATE_LANGUAGES = codes;

export const isTemplateLanguage = (code) => TEMPLATE_LANGUAGES.includes(code);
```

`systemOptions.js` — `toOption` becomes:
```js
const toOption = (tpl, group) => ({
  value: `${CUSTOM_PREFIX}${tpl.id}`,
  label: tpl.name,
  group,
  language: tpl.language || '',
  description: tpl.description || '',
  ...(group === 'shared' && tpl.ownerEmails?.length ? { ownerEmail: tpl.ownerEmails.join(', ') } : {}),
});
```
and at the end of the file:
```js
// Built-in systems have translated UI and no content language, so a language filter never
// hides them. A template with no language set has nothing to match and drops out.
export function filterByLanguages(options, langs) {
  if (langs.length === 0) return options;
  return options.filter(opt => opt.group === 'systems' || langs.includes(opt.language));
}
```

Translations — new top-level object in `locales/en/translation.json`:
```json
  "languages": {
    "unspecified": "Unspecified",
    "pl": "Polish", "en": "English", "de": "German", "fr": "French", "es": "Spanish",
    "it": "Italian", "pt": "Portuguese", "cs": "Czech", "sk": "Slovak", "uk": "Ukrainian",
    "ru": "Russian", "hu": "Hungarian", "ja": "Japanese", "zh": "Chinese", "ko": "Korean"
  },
```
and in `locales/pl/translation.json`:
```json
  "languages": {
    "unspecified": "Nieokreślony",
    "pl": "Polski", "en": "Angielski", "de": "Niemiecki", "fr": "Francuski", "es": "Hiszpański",
    "it": "Włoski", "pt": "Portugalski", "cs": "Czeski", "sk": "Słowacki", "uk": "Ukraiński",
    "ru": "Rosyjski", "hu": "Węgierski", "ja": "Japoński", "zh": "Chiński", "ko": "Koreański"
  },
```
Format each key on its own line to match the files' existing style.

- [ ] **Step 4: Run tests**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/utils/templateLanguages.* warhammer-battle-helper-front/src/components/lobby/systemOptions* warhammer-battle-helper-front/src/locales && git commit -m "feat: PLAYRPG-261 template language list and language filter logic

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Read-only description popup

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/common/richText/RichTextEditor.jsx`
- Modify: `warhammer-battle-helper-front/src/components/common/richText/RichTextEditor.test.jsx`
- Create: `warhammer-battle-helper-front/src/components/lobby/TemplateDescriptionDialog.jsx`
- Create: `warhammer-battle-helper-front/src/components/lobby/TemplateDescriptionDialog.test.jsx`
- Modify: `locales/en/translation.json`, `locales/pl/translation.json` (`creator.about.*`)

**Interfaces:**
- Produces: `RichTextEditor` prop `toolbar = true`. `<TemplateDescriptionDialog template={{ name, description, language } | null} onClose={fn} />` — open when `template` is non-null. i18n keys `creator.about.descriptionTitle`.

Rendering through a read-only TipTap instance (not `dangerouslySetInnerHTML`) means the editor schema parses the HTML a second time after the server sanitizer, and the formatting looks exactly like the creator's.

- [ ] **Step 1: Write failing tests**

Append to `RichTextEditor.test.jsx`:
```js
test('toolbar={false} renders content only', () => {
  const { container } = render(<RichTextEditor value="<p>x</p>" editable={false} toolbar={false} />);
  expect(container.querySelector('.rich-toolbar')).toBeNull();
  expect(container.querySelector('.tiptap').textContent).toBe('x');
});
```

`TemplateDescriptionDialog.test.jsx`:
```js
/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateDescriptionDialog from './TemplateDescriptionDialog';

test('shows name, language and formatted description', () => {
  render(<TemplateDescriptionDialog onClose={() => {}}
    template={{ name: 'Krypta', language: 'pl', description: '<p>Ala <strong>ma</strong></p>' }} />);
  expect(screen.getByText('Krypta')).toBeInTheDocument();
  expect(screen.getByText('Polish')).toBeInTheDocument();
  expect(document.querySelector('.tiptap strong').textContent).toBe('ma');
});

test('no language chip for an unspecified template; close calls onClose', () => {
  const onClose = jest.fn();
  render(<TemplateDescriptionDialog onClose={onClose} template={{ name: 'K', language: '', description: '<p>x</p>' }} />);
  expect(screen.queryByText('Unspecified')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

test('renders nothing without a template', () => {
  render(<TemplateDescriptionDialog onClose={() => {}} template={null} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```
(`common.close` is "Close" in en — confirm with `grep '"close"' src/locales/en/translation.json`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='RichTextEditor|TemplateDescriptionDialog'`
Expected: FAIL.

- [ ] **Step 3: Implement**

`RichTextEditor.jsx`: change the signature to
```js
const RichTextEditor = ({ value = '', onChange, editable = true, toolbar = true, className = '' }) => {
```
and the toolbar line to
```js
      {toolbar && <RichTextToolbar editor={editor} disabled={!editable} />}
```
Update the component comment: "`toolbar={false}` with `editable={false}` is the read-only view."

`TemplateDescriptionDialog.jsx`:
```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import RichTextEditor from '../common/richText/RichTextEditor';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';

// Read-only view of a template's description, shared by the system picker, the selected-system
// card and "My templates". Open while `template` is set.
function TemplateDescriptionDialog({ template, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!template} onClose={onClose} maxWidth="sm" fullWidth PaperProps={parchmentDialogProps()}>
      {template && (
        <>
          <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
            {template.name}
            {template.language && (
              <Chip size="small" variant="outlined" label={t(`languages.${template.language}`)}
                sx={{ fontFamily: BODY_FONT, color: 'primary.main', borderColor: 'primary.light' }} />
            )}
          </DialogTitle>
          <DialogContent>
            <RichTextEditor className="template-description" value={template.description} editable={false} toolbar={false} />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0 }}>
            <Button onClick={onClose} sx={{ fontFamily: BODY_FONT }}>{t('common.close')}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export default TemplateDescriptionDialog;
```

Add `creator.about` keys now (used by Tasks 5–7) inside the existing `"creator"` object:

en:
```json
    "about": {
      "title": "Description and language",
      "hint": "Shown to players picking a system for a new game.",
      "language": "Template language",
      "description": "Description",
      "languageMissing": "Set the language so players can find this template with the language filter.",
      "showDescription": "Show description",
      "more": "More",
      "filterLabel": "Template language",
      "filterAll": "All"
    },
```
pl:
```json
    "about": {
      "title": "Opis i język",
      "hint": "Widoczne dla graczy, którzy wybierają system nowej gry.",
      "language": "Język szablonu",
      "description": "Opis",
      "languageMissing": "Ustaw język, żeby gracze znaleźli ten szablon przez filtr języka.",
      "showDescription": "Pokaż opis",
      "more": "Więcej",
      "filterLabel": "Język szablonu",
      "filterAll": "Wszystkie"
    },
```

- [ ] **Step 4: Run tests**

Same as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/components/common/richText warhammer-battle-helper-front/src/components/lobby/TemplateDescriptionDialog* warhammer-battle-helper-front/src/locales && git commit -m "feat: PLAYRPG-261 read-only template description dialog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Create-game dialog — language filter, ⓘ and selected-system card

**Files:**
- Create: `warhammer-battle-helper-front/src/components/lobby/LanguageFilter.jsx`
- Modify: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx`
- Modify: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx`

**Interfaces:**
- Consumes: `filterByLanguages`, option `language`/`description` (Task 3); `TemplateDescriptionDialog` (Task 4); `TEMPLATE_LANGUAGES`; keys `creator.about.*`, `languages.*`.
- Produces: `<LanguageFilter value={string[]} onChange={fn} disabled />`; `loadLanguageFilter(): string[]`, `saveLanguageFilter(langs)`, storage key `createGame.languageFilter`.

- [ ] **Step 1: Make the existing tests survive a second combobox**

MUI 7 `Select` renders `role="combobox"`, so the unscoped `getByRole('combobox')` in `CreateGameDialog.test.jsx` (5 uses) would find two. Add a helper near the top and replace all 5 uses:
```js
const systemInput = () => screen.getByRole('combobox', { name: i18n.t('game.gameSystem') });
```

- [ ] **Step 2: Write failing tests**

Change the fixture `templates` in `CreateGameDialog.test.jsx` to:
```js
const templates = [
  { id: 'm1', name: 'Moja Kampania', myRole: 'owner', updatedAt: '2026-10-01T10:00:00Z', language: 'pl', description: '<p>Opis <strong>kampanii</strong></p>' },
  { id: 's1', name: 'Łowcy Czarownic', myRole: 'viewer', ownerEmails: ['alice@example.com'], language: 'en' },
  { id: 'p1', name: 'Mroczne Ziemie', isPublic: true },
];
```
and add `beforeEach(() => localStorage.clear());` next to the existing `beforeEach`. Then append:
```js
const openSystems = () => {
  fireEvent.mouseDown(systemInput());
  return screen.getByRole('listbox');
};
const chooseLanguage = (name) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: i18n.t('creator.about.filterLabel') }));
  fireEvent.click(screen.getByRole('option', { name }));
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
};

describe('CreateGameDialog language filter', () => {
  it('shows everything until a language is chosen', async () => {
    await renderDialog();
    expect(within(openSystems()).getByText('Mroczne Ziemie')).toBeInTheDocument();
  });

  it('keeps built-in systems and matching templates, drops unspecified', async () => {
    await renderDialog();
    chooseLanguage('Polish');
    const list = openSystems();
    expect(within(list).getByText('Moja Kampania')).toBeInTheDocument();
    expect(within(list).queryByText('Łowcy Czarownic')).not.toBeInTheDocument();
    expect(within(list).queryByText('Mroczne Ziemie')).not.toBeInTheDocument();
    expect(within(list).getByText(i18n.t('gameSystems.warhammer4e'))).toBeInTheDocument();
  });

  it('clears a selection the filter hides', async () => {
    await renderDialog();
    fireEvent.click(within(openSystems()).getByText('Mroczne Ziemie'));
    chooseLanguage('Polish');
    expect(systemInput()).toHaveValue('');
  });

  it('remembers the filter for the next open', async () => {
    const { unmount } = await renderDialog();
    chooseLanguage('English');
    unmount();
    await renderDialog();
    expect(within(openSystems()).queryByText('Moja Kampania')).not.toBeInTheDocument();
  });
});

describe('CreateGameDialog description', () => {
  it('the info icon opens the description without selecting the template', async () => {
    await renderDialog();
    const list = openSystems();
    const row = within(list).getByText('Moja Kampania').closest('li');
    const icon = within(row).getByTestId('InfoOutlinedIcon').closest('button');
    fireEvent.mouseDown(icon);
    fireEvent.click(icon);
    expect(screen.getByRole('dialog', { name: /Moja Kampania/ })).toBeInTheDocument();
    expect(systemInput()).toHaveValue('');
  });

  it('only templates with a description get the icon', async () => {
    await renderDialog();
    const row = within(openSystems()).getByText('Mroczne Ziemie').closest('li');
    expect(within(row).queryByTestId('InfoOutlinedIcon')).not.toBeInTheDocument();
  });

  it('a selected template with a description shows its card', async () => {
    await renderDialog();
    expect(document.querySelector('.create-game__selected-about')).toBeNull();
    fireEvent.click(within(openSystems()).getByText('Moja Kampania'));
    const card = document.querySelector('.create-game__selected-about');
    expect(card).toHaveTextContent('kampanii');
    fireEvent.click(within(card).getByRole('button', { name: i18n.t('creator.about.more') }));
    expect(screen.getByRole('dialog', { name: /Moja Kampania/ })).toBeInTheDocument();
  });
});
```
Add `/* eslint-disable testing-library/no-node-access */` at the top of the file if not present. If `getByRole('dialog', { name })` finds the outer create dialog too, scope by `getAllByRole('dialog')` and pick the last.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CreateGameDialog`
Expected: the new tests FAIL (no filter combobox, no icon); the existing ones PASS with the scoped helper.

- [ ] **Step 4: Implement `LanguageFilter.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Chip, MenuItem, TextField } from '@mui/material';
import { TEMPLATE_LANGUAGES } from '../../utils/templateLanguages';
import { BODY_FONT } from './lobbyStyles';

const STORAGE_KEY = 'createGame.languageFilter';

// The filter is a per-viewer convenience: someone who plays in two languages should not
// re-pick them for every game. Unknown codes from an older list are dropped on read.
export function loadLanguageFilter() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(code => TEMPLATE_LANGUAGES.includes(code)) : [];
  } catch {
    return [];
  }
}

export function saveLanguageFilter(langs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(langs)); } catch { /* storage unavailable */ }
}

// Empty selection means "all languages", so the field shows that instead of a blank box.
function LanguageFilter({ value, onChange, disabled }) {
  const { t } = useTranslation();
  return (
    <TextField select fullWidth size="small" disabled={disabled}
      label={t('creator.about.filterLabel')} value={value}
      onChange={e => onChange(e.target.value)}
      InputLabelProps={{ shrink: true }}
      SelectProps={{
        multiple: true,
        displayEmpty: true,
        renderValue: (selected) => (selected.length === 0
          ? t('creator.about.filterAll')
          : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map(code => <Chip key={code} size="small" label={t(`languages.${code}`)} />)}
            </Box>
          )),
      }}
      sx={{ mt: 2, '& .MuiInputBase-input': { fontFamily: BODY_FONT }, '& .MuiInputLabel-root': { fontFamily: BODY_FONT } }}>
      {TEMPLATE_LANGUAGES.map(code => (
        <MenuItem key={code} value={code} sx={{ fontFamily: BODY_FONT }}>{t(`languages.${code}`)}</MenuItem>
      ))}
    </TextField>
  );
}

export default LanguageFilter;
```

- [ ] **Step 5: Wire it into `CreateGameDialog.jsx`**

Imports:
```js
import { Autocomplete, Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, ListSubheader, TextField, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { CUSTOM_PREFIX, buildSystemOptions, filterByLanguages, filterSystemOptions, findMatch } from './systemOptions';
import LanguageFilter, { loadLanguageFilter, saveLanguageFilter } from './LanguageFilter';
import TemplateDescriptionDialog from './TemplateDescriptionDialog';
```

State (next to the others):
```js
  const [languages, setLanguages] = useState(loadLanguageFilter);
  // The option whose description is open in the popup; null = closed.
  const [describing, setDescribing] = useState(null);
```

Options:
```js
  const options = useMemo(
    () => filterByLanguages(buildSystemOptions(regularSystems, templates), languages),
    [regularSystems, templates, languages]
  );
```

Handler:
```js
  const handleLanguagesChange = (langs) => {
    setLanguages(langs);
    saveLanguageFilter(langs);
  };
```

Extend the existing "dangling selection" effect so it also covers a filtered-out choice — replace it with:
```js
  // A template selected here can be deleted from the manager stacked on top of this dialog, or
  // hidden by the language filter; clear the choice rather than submit something not on the list.
  useEffect(() => {
    if (isCustom(selection) && !options.some(opt => opt.value === selection)) {
      setSelection(null);
    }
  }, [options, selection]);
```
The open-reset effect does NOT reset `languages` (it is remembered by design).

Render `<LanguageFilter value={languages} onChange={handleLanguagesChange} disabled={loading} />` directly before `<Autocomplete`.

In `renderOption`, wrap the existing `<Box>` so the icon sits on the right:
```jsx
              <li key={key} {...optionProps}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', fontFamily: BODY_FONT, flex: 1, minWidth: 0 }}>
                    {/* existing label + ownerEmail */}
                  </Box>
                  {opt.description && (
                    // mousedown would otherwise select the row before click ever fires.
                    <IconButton size="small" aria-label={t('creator.about.showDescription')}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={e => { e.stopPropagation(); setDescribing(opt); }}
                      sx={{ color: 'primary.main' }}>
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </li>
```

Selected-system card, directly after `</Autocomplete>` (before the creator CTA box):
```jsx
        {selectedOption?.description && (
          <Box className="create-game__selected-about"
            sx={{ mt: 1.5, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.light', background: 'rgba(255,255,255,0.4)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 600, color: 'primary.main' }}>{selectedOption.label}</Typography>
              {selectedOption.language && (
                <Chip size="small" variant="outlined" label={t(`languages.${selectedOption.language}`)} sx={{ fontFamily: BODY_FONT }} />
              )}
            </Box>
            <Box sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              <RichTextEditor value={selectedOption.description} editable={false} toolbar={false} />
            </Box>
            <Button size="small" onClick={() => setDescribing(selectedOption)} sx={{ fontFamily: BODY_FONT, textTransform: 'none', mt: 0.5, px: 0 }}>
              {t('creator.about.more')}
            </Button>
          </Box>
        )}
```
Import `RichTextEditor from '../common/richText/RichTextEditor'`. Line-clamp applies to the editor's block content; if paragraphs inside escape the clamp in the browser, apply the clamp to `.rich-text__content .tiptap` via `sx={{ '& .tiptap': {...} }}` instead — verify visually.

Popup: wrap the component's return in a fragment and render the popup after the main `</Dialog>` (a sibling, not nested in `DialogContent`):
```jsx
      <TemplateDescriptionDialog
        template={describing && { name: describing.label, description: describing.description, language: describing.language }}
        onClose={() => setDescribing(null)} />
```

- [ ] **Step 6: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CreateGameDialog|systemOptions'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/components/lobby && git commit -m "feat: PLAYRPG-261 language filter and template descriptions in the create-game dialog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: "My templates" ⓘ and the default language on create

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.jsx`
- Modify: `warhammer-battle-helper-front/src/components/lobby/TemplateManagerDialog.test.jsx`
- Modify: `warhammer-battle-helper-front/src/hooks/useTemplates.js:29-43`

**Interfaces:**
- Consumes: `TemplateDescriptionDialog` (Task 4), `isTemplateLanguage` (Task 3).

- [ ] **Step 1: Write failing tests**

Append to `TemplateManagerDialog.test.jsx`:
```js
test('only a template with a description gets the info icon, which opens it', () => {
  mount([tpl({ id: 'a', name: 'With', description: '<p>d</p>', language: 'pl' }), tpl({ id: 'b', name: 'Without' })]);
  expect(icons('InfoOutlinedIcon')).toHaveLength(1);
  fireEvent.click(icons('InfoOutlinedIcon')[0].closest('button'));
  expect(screen.getAllByRole('dialog').pop()).toHaveTextContent('With');
});
```
(add `/* eslint-disable testing-library/no-node-access */` at the top.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TemplateManagerDialog`
Expected: FAIL (0 icons).

- [ ] **Step 3: Implement**

`TemplateManagerDialog.jsx`: import `InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'` and `TemplateDescriptionDialog from './TemplateDescriptionDialog'`; add `const [describing, setDescribing] = useState(null);`. In the `primary` Box, after the name `Typography`:
```jsx
                        {tpl.description && (
                          <IconButton size="small" onClick={() => setDescribing(tpl)}
                            onMouseEnter={e => showTooltip(t('creator.about.showDescription'), e.currentTarget)} onMouseLeave={hideTooltip}
                            sx={{ color: 'primary.main', p: 0.25 }}>
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        )}
```
After `{tooltipNode}`:
```jsx
      <TemplateDescriptionDialog template={describing} onClose={() => setDescribing(null)} />
```
Update the component's header comment: the ⓘ opens a read-only view and is not one of the row's actions.

`useTemplates.js` — `createTemplate`:
```js
  const createTemplate = useCallback(async (name) => {
    // A new template starts in the UI language: right for most authors, and it keeps the
    // language filter useful without asking for one more field up front.
    const language = isTemplateLanguage(i18n.language) ? i18n.language : '';
    try {
      const response = await fetch(`${getApiUrl()}/templates`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, sections: [], language }),
      });
```
with `const { t, i18n } = useTranslation();` and `import { isTemplateLanguage } from '../utils/templateLanguages';`. Add `i18n` to the `useCallback` deps.

- [ ] **Step 4: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='TemplateManagerDialog|useTemplates'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/components/lobby warhammer-battle-helper-front/src/hooks/useTemplates.js && git commit -m "feat: PLAYRPG-261 description in My templates, new templates start in the UI language

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Creator "Description and language" card + tutorial step

**Files:**
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateAboutCard.jsx`
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.about.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (state ~1310, refs ~1338, `applyTemplate` ~1453, `sendSave` body ~1483, General tab ~1887)
- Modify: `warhammer-battle-helper-front/src/components/tutorial/tours/creatorGeneral.js`
- Modify: `locales/en/translation.json`, `locales/pl/translation.json` (`tutorial.creatorGeneral.about`)

**Interfaces:**
- Consumes: `RichTextEditor`, `TEMPLATE_LANGUAGES`, `creator.about.*` keys.
- Produces: `<TemplateAboutCard description={string} language={string} onChange={({ description?, language? }) => void} />` with root class `creator__settings-card creator__settings-card--about`.

- [ ] **Step 1: Write failing tests**

`TemplateBuilder.about.test.jsx`:
```js
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const base = { id: 't1', name: 'T', version: 1, sections: [], settings: { diceButtons: [] },
  description: '<p>old</p>', language: '', permissions: { edit: true, share: false, delete: false } };
const patches = () => global.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
const flushDebounce = async () => { await act(async () => { jest.advanceTimersByTime(1300); }); };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ...base, version: 2 }) });
});
afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

const mount = (template = base) => render(
  <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);

test('custom template shows the card with the missing-language hint', () => {
  const { container } = mount();
  expect(container.querySelector('.creator__settings-card--about')).not.toBeNull();
  expect(screen.getByText('Set the language so players can find this template with the language filter.')).toBeInTheDocument();
});

test('a variant has no card and its saves carry no about fields', async () => {
  const { container } = mount({ ...base, baseSystem: 'warhammer4e', description: undefined });
  expect(container.querySelector('.creator__settings-card--about')).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('System name'), { target: { value: 'X' } });
  await flushDebounce();
  const body = JSON.parse(patches()[0][1].body);
  expect('language' in body).toBe(false);
  expect('description' in body).toBe(false);
});

test('picking a language saves it with the description', async () => {
  mount();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Template language' }));
  fireEvent.click(screen.getByRole('option', { name: 'Polish' }));
  await flushDebounce();
  const body = JSON.parse(patches()[0][1].body);
  expect(body.language).toBe('pl');
  expect(body.description).toBe('<p>old</p>');
});

test('editing the description saves the new HTML', async () => {
  const { container } = mount();
  const editor = container.querySelector('.creator__settings-card--about .tiptap').editor;
  act(() => { editor.commands.insertContent('new'); });
  await flushDebounce();
  expect(JSON.parse(patches()[0][1].body).description).toMatch(/new/);
});
```
- [ ] **Step 2: Run to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='TemplateBuilder.about|creatorTour.coverage'`
Expected: `TemplateBuilder.about` FAILS (no card). Coverage test still passes (no card yet).

- [ ] **Step 3: Implement `TemplateAboutCard.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, TextField, Typography } from '@mui/material';
import RichTextEditor from '../common/richText/RichTextEditor';
import { TEMPLATE_LANGUAGES } from '../../utils/templateLanguages';

// The template's lobby face: what players read before picking it, and the language the
// create-game filter matches on.
function TemplateAboutCard({ description, language, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="creator__settings-card creator__settings-card--about">
      <div className="creator__settings-card-header">
        <span className="creator__settings-card-title">{t('creator.about.title')}</span>
        <span className="creator__settings-card-hint">{t('creator.about.hint')}</span>
      </div>
      <div className="creator__settings-card-body">
        <TextField select size="small" label={t('creator.about.language')} value={language}
          onChange={e => onChange({ language: e.target.value })}
          SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 240, mb: 1 }}>
          <MenuItem value="">{t('languages.unspecified')}</MenuItem>
          {TEMPLATE_LANGUAGES.map(code => <MenuItem key={code} value={code}>{t(`languages.${code}`)}</MenuItem>)}
        </TextField>
        {!language && (
          <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
            {t('creator.about.languageMissing')}
          </Typography>
        )}
        <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem', color: '#7a5c42', mb: 0.5 }}>
          {t('creator.about.description')}
        </Typography>
        <RichTextEditor value={description} onChange={html => onChange({ description: html })} />
      </div>
    </div>
  );
}

export default TemplateAboutCard;
```

- [ ] **Step 4: Wire into `TemplateBuilder.jsx`**

State next to `settings`:
```js
  const [about, setAbout] = useState({ description: template?.description || '', language: template?.language || '' });
```
Ref next to `settingsRef`:
```js
  const aboutRef = useRef(about);
  aboutRef.current = about;
```
In `applyTemplate`, after `setSettings(...)`:
```js
    setAbout({ description: tpl?.description || '', language: tpl?.language || '' });
```
In `sendSave`'s body, after `settings: settingsRef.current,`:
```js
          // A token-display variant has no about fields; the server rejects non-empty ones.
          ...(isVariant ? {} : aboutRef.current),
```
and add `isVariant` to `sendSave`'s `useCallback` deps.

Updater next to `updateSettings`:
```js
  const updateAbout = (patch) => {
    const next = { ...about, ...patch };
    setAbout(next);
    aboutRef.current = next; // sync so the debounced save reads the fresh value
    triggerSave(sections, name);
  };
```
Render, right after the `TemplateAccessCard` block and before the sheet-width card:
```jsx
            {!isVariant && (
              <TemplateAboutCard description={about.description} language={about.language} onChange={updateAbout} />
            )}
```
Import `TemplateAboutCard from './TemplateAboutCard'`.

- [ ] **Step 5: Tutorial step**

`creatorGeneral.js` — insert after the `visibility` step:
```js
    { id: 'about', target: '.creator__settings-card--about', placement: 'auto' },
```
en `tutorial.creatorGeneral` (after `visibility`):
```json
      "about": {
        "title": "Description and language",
        "body": "Tell players what this system is about. The description shows next to the template when someone creates a game, and the language lets them find it with the language filter."
      },
```
pl:
```json
      "about": {
        "title": "Opis i język",
        "body": "Napisz graczom, czym jest ten system. Opis widać przy szablonie, gdy ktoś tworzy grę, a język pozwala go znaleźć filtrem języka."
      },
```

- [ ] **Step 6: Run tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='TemplateBuilder|creatorTour|tourTranslations|CreatorTour'`
Expected: PASS. If `TemplateBuilder.sheetWidth.test.jsx` "getByRole('slider') is singular" still holds (no new slider) — it should.

- [ ] **Step 7: Commit**

```bash
git branch --show-current && git add warhammer-battle-helper-front/src/components/creator warhammer-battle-helper-front/src/components/tutorial warhammer-battle-helper-front/src/locales && git commit -m "feat: PLAYRPG-261 description and language card in the creator

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification and docs

**Files:**
- Modify: `docs/architecture.md` (template model section, if it lists `SystemTemplate` fields)

- [ ] **Step 1: Full backend suite on the host**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Expected: all `ok`.

- [ ] **Step 2: Full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` axios ESM failure.

- [ ] **Step 3: i18n parity**

Run the `i18n-sync` skill's diff script (or `node -e` comparing key sets of `locales/en/translation.json` and `locales/pl/translation.json`). Expected: no missing keys.

- [ ] **Step 4: Docs**

`grep -n "SystemTemplate" docs/architecture.md`; if fields are listed, add `description` (sanitized HTML, lobby) and `language` (ISO 639-1, `""` = unspecified, list in `src/utils/templateLanguages.json`).

- [ ] **Step 5: Commit (only if docs changed)**

```bash
git branch --show-current && git add docs/architecture.md && git commit -m "docs: PLAYRPG-261 template description and language

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Browser check (user)**

Things no test measures: line-clamp of the selected card, ⓘ alignment in picker rows, the language Select's chip height next to the system picker, the read-only editor's look inside the parchment dialog.
