# PLAYRPG-224 Create-Game System Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the create-game system `<Select>` with a searchable MUI `Autocomplete` grouped into four sections (Game systems, My templates, Shared with me, Public), with the owner's email shown only on templates shared with the viewer.

**Architecture:** The backend marks each listed template with a per-request `SharedWithMe` flag (from `SharedWith`, no query) and, only for those rows, the owner's `OwnerEmail` (one batched `FindByIDs`, failure logged and swallowed). The frontend builds, orders and filters the options in a pure module `systemOptions.js`; `CreateGameDialog` only renders it through `Autocomplete`.

**Tech Stack:** Go 1.24 + mongo-driver `mtest` mocks | React 19 + MUI 7 `Autocomplete` + i18next + Jest/RTL (CRA).

Spec: `docs/superpowers/specs/PLAYRPG-224.md`

## Global Constraints

- Group order: `systems`, `mine`, `shared`, `public`. Systems in `registry.js` order; `mine` by `updatedAt` descending; `shared` and `public` alphabetical (`localeCompare`, `sensitivity: 'base'`).
- A template that is public **and** shared with the viewer goes to `shared`.
- The group is decided by `sharedWithMe`, never by the presence of `ownerEmail`.
- `ownerEmail` is set by the backend ONLY on rows where `SharedWithMe` is true. Public rows never carry an author.
- Search: substring, case- and diacritic-insensitive, `ł→l` folded manually; in `shared` the query also matches `ownerEmail`.
- Code comments in English. UI strings only via `t('key')`, keys added to both `locales/en` and `locales/pl`.
- MUI styling via `sx` / `slotProps`, not classes in `style.css` (emotion wins on MUI roots).
- Icons only from `@mui/icons-material` (none needed here).
- Frontend tests: `CI=true npm test -- --watchAll=false --testPathPattern=<name>` from `warhammer-battle-helper-front/`. Bare `npx jest` does not work. `App.test.js` (axios ESM) is a known baseline failure.
- Backend tests: `go test ./internal/service/...` from `warhammer-battle-helper-backend/`.

---

### Task 1: Backend — `SharedWithMe` + `OwnerEmail` on the template list

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (struct `SystemTemplate`, next to `IsOwner`)
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go` (new `attachOwners`, `ListForUser` around lines 213-231, import `slices`)
- Create: `warhammer-battle-helper-backend/internal/service/TemplateService_test.go`

**Interfaces:**
- Produces (JSON on `GET /templates` rows): `sharedWithMe: boolean` (omitted when false), `ownerEmail: string` (omitted when empty). Task 2 consumes both.

- [ ] **Step 1: Write the failing test**

Create `internal/service/TemplateService_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func templateDoc(id, owner primitive.ObjectID, name string, public bool, sharedWith ...primitive.ObjectID) bson.D {
	shared := bson.A{}
	for _, s := range sharedWith {
		shared = append(shared, s)
	}
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "ownerId", Value: owner},
		{Key: "name", Value: name},
		{Key: "isPublic", Value: public},
		{Key: "sharedWith", Value: shared},
	}
}

func TestListForUser_OwnerEmail(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("only rows shared with the viewer reveal their owner", func(mt *mtest.T) {
		// Both repositories read the same mocked collection; responses are consumed in call order.
		svc := NewTemplateService(repository.NewTemplateRepository(mt.Coll), repository.NewUserRepository(mt.Coll))
		viewer, alice, bob := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch,
				templateDoc(primitive.NewObjectID(), viewer, "Own", false),
				templateDoc(primitive.NewObjectID(), alice, "Public", true),
				templateDoc(primitive.NewObjectID(), alice, "Shared", false, viewer),
				templateDoc(primitive.NewObjectID(), alice, "SharedToo", false, viewer),
				templateDoc(primitive.NewObjectID(), bob, "PublicShared", true, viewer),
			),
			mtest.CreateCursorResponse(0, "db.users", mtest.FirstBatch,
				bson.D{{Key: "_id", Value: alice}, {Key: "email", Value: "alice@example.com"}},
				bson.D{{Key: "_id", Value: bob}, {Key: "email", Value: "bob@example.com"}},
			),
		)

		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatalf("ListForUser() returned unexpected error: %v", err)
		}
		byName := make(map[string]models.SystemTemplate, len(got))
		for _, tpl := range got {
			byName[tpl.Name] = tpl
		}

		cases := []struct {
			name         string
			sharedWithMe bool
			ownerEmail   string
		}{
			{"Own", false, ""},
			{"Public", false, ""},
			{"Shared", true, "alice@example.com"},
			{"SharedToo", true, "alice@example.com"},
			{"PublicShared", true, "bob@example.com"},
		}
		for _, c := range cases {
			tpl := byName[c.name]
			if tpl.SharedWithMe != c.sharedWithMe {
				t.Errorf("%s: SharedWithMe = %v, want %v", c.name, tpl.SharedWithMe, c.sharedWithMe)
			}
			if tpl.OwnerEmail != c.ownerEmail {
				t.Errorf("%s: OwnerEmail = %q, want %q", c.name, tpl.OwnerEmail, c.ownerEmail)
			}
		}

		// One find for the templates, ONE for all owners — never a query per row.
		finds := 0
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "find" {
				finds++
			}
		}
		if finds != 2 {
			t.Errorf("expected 2 find commands, got %d", finds)
		}
	})

	mt.Run("a failed owner lookup keeps the row in its group", func(mt *mtest.T) {
		svc := NewTemplateService(repository.NewTemplateRepository(mt.Coll), repository.NewUserRepository(mt.Coll))
		viewer, alice := primitive.NewObjectID(), primitive.NewObjectID()

		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch,
				templateDoc(primitive.NewObjectID(), alice, "Shared", false, viewer),
			),
			mtest.CreateCommandErrorResponse(mtest.CommandError{Code: 1, Message: "users unavailable"}),
		)

		got, err := svc.ListForUser(viewer)
		if err != nil {
			t.Fatalf("the owner email is decoration; its failure must not fail the list: %v", err)
		}
		if len(got) != 1 || !got[0].SharedWithMe {
			t.Fatal("the row must stay shared-with-me even without its owner's email")
		}
		if got[0].OwnerEmail != "" {
			t.Errorf("OwnerEmail = %q, want empty after a failed lookup", got[0].OwnerEmail)
		}
	})
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/service/ -run TestListForUser_OwnerEmail -v`
Expected: compile FAIL — `tpl.SharedWithMe undefined` / `tpl.OwnerEmail undefined`.

- [ ] **Step 3: Add the model fields**

In `internal/models/SystemTemplate.go`, directly below the `IsOwner` field:

```go
	// SharedWithMe is computed per-request (not persisted): true when the requesting user is in
	// SharedWith and does not own the template. The lobby groups templates on it.
	SharedWithMe bool `bson:"-" json:"sharedWithMe,omitempty"`
	// OwnerEmail is computed per-request (not persisted) and filled ONLY when SharedWithMe is
	// true: sharing is the owner revealing themselves to this user. Public templates never carry
	// it — every logged-in account would otherwise be able to harvest their authors' addresses.
	OwnerEmail string `bson:"-" json:"ownerEmail,omitempty"`
```

- [ ] **Step 4: Implement `attachOwners` and wire it into `ListForUser`**

In `internal/service/TemplateService.go`, add `"slices"` to the imports and add below `attachShares`:

```go
// attachOwners fills OwnerEmail on the rows shared with the viewer, resolving every owner in
// ONE FindByIDs across the whole batch. It only reads SharedWithMe, so ListForUser must set
// that flag first. An owner id that resolves to no account leaves the row without an email.
func (s *TemplateService) attachOwners(templates []*models.SystemTemplate) error {
	var ids []primitive.ObjectID
	seen := make(map[primitive.ObjectID]bool)
	for _, t := range templates {
		if t.SharedWithMe && !seen[t.OwnerID] {
			seen[t.OwnerID] = true
			ids = append(ids, t.OwnerID)
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
		if t.SharedWithMe {
			t.OwnerEmail = emails[t.OwnerID]
		}
	}
	return nil
}
```

Replace the body of `ListForUser` with:

```go
func (s *TemplateService) ListForUser(ownerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	templates, err := s.repo.ListVisibleToUser(ownerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	refs := make([]*models.SystemTemplate, len(templates))
	for i := range templates {
		templates[i].IsOwner = templates[i].OwnerID == ownerID
		// Set here, from the document alone, so the lobby's grouping never depends on the
		// owner lookup below succeeding.
		templates[i].SharedWithMe = !templates[i].IsOwner && slices.Contains(templates[i].SharedWith, ownerID)
		refs[i] = &templates[i]
	}
	// SharedWithUsers is decoration on the owner's own rows, not the list itself: useTemplates.js
	// (frontend) swallows a fetch error wholesale, so failing ListForUser here would empty the
	// whole lobby over a problem with the recipients column. Log it and answer with templates
	// that simply have no resolved share emails, rather than no templates at all.
	if err := s.attachShares(refs, ownerID); err != nil {
		log.Printf("warn: failed to resolve template shares for user %s: %v", ownerID.Hex(), err)
	}
	// Same trade-off for the owner's email on rows shared with the viewer.
	if err := s.attachOwners(refs); err != nil {
		log.Printf("warn: failed to resolve template owners for user %s: %v", ownerID.Hex(), err)
	}
	return templates, nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/service/ -run TestListForUser_OwnerEmail -v && go test ./... && go vet ./...`
Expected: PASS everywhere.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go \
        warhammer-battle-helper-backend/internal/service/TemplateService.go \
        warhammer-battle-helper-backend/internal/service/TemplateService_test.go
git commit -m "feat: PLAYRPG-224 mark templates shared with the viewer and reveal their owner"
```

---

### Task 2: Frontend — `systemOptions.js` (build, order, fold, filter)

**Files:**
- Create: `warhammer-battle-helper-front/src/components/lobby/systemOptions.js`
- Test: `warhammer-battle-helper-front/src/components/lobby/systemOptions.test.js`

**Interfaces:**
- Consumes: template rows `{ id, name, isOwner, sharedWithMe?, ownerEmail?, updatedAt }` (Task 1), systems `{ value, label }` from `listSystems()`.
- Produces:
  - `CUSTOM_PREFIX = 'custom:'`
  - `buildSystemOptions(systems, templates) → Array<{ value: string, label: string, group: 'systems'|'mine'|'shared'|'public', ownerEmail?: string }>`
  - `normalizeForSearch(text: string) → string`
  - `findMatch(text: string, query: string) → [start, end] | null` (code-point indices into `text`)
  - `filterSystemOptions(options, query: string) → options`

- [ ] **Step 1: Write the failing test**

```js
import {
  CUSTOM_PREFIX, buildSystemOptions, normalizeForSearch, findMatch, filterSystemOptions,
} from './systemOptions';

const systems = [
  { value: 'warhammer4e', label: 'Warhammer Fantasy Roleplay 4e' },
  { value: 'coc7e', label: 'Call of Cthulhu 7e' },
];

const templates = [
  { id: 'p2', name: 'zombie Apocalypse', isOwner: false, isPublic: true },
  { id: 'm-old', name: 'Old Mine', isOwner: true, updatedAt: '2026-09-01T10:00:00Z' },
  { id: 's1', name: 'Wiedźmin', isOwner: false, sharedWithMe: true, ownerEmail: 'alice@example.com' },
  { id: 'p1', name: 'Arkham Nights', isOwner: false, isPublic: true },
  { id: 'm-new', name: 'New Mine', isOwner: true, updatedAt: '2026-10-04T10:00:00.5Z' },
  { id: 's2', name: 'Bastion', isOwner: false, isPublic: true, sharedWithMe: true, ownerEmail: 'bob@example.com' },
  { id: 's3', name: 'Cień', isOwner: false, sharedWithMe: true },
];

describe('buildSystemOptions', () => {
  const options = buildSystemOptions(systems, templates);
  const labelsOf = (group) => options.filter(o => o.group === group).map(o => o.label);

  it('keeps the groups contiguous and in order', () => {
    const groups = options.map(o => o.group).filter((g, i, all) => all[i - 1] !== g);
    expect(groups).toEqual(['systems', 'mine', 'shared', 'public']);
  });

  it('keeps systems in registry order and values bare', () => {
    expect(options.slice(0, 2).map(o => o.value)).toEqual(['warhammer4e', 'coc7e']);
  });

  it('puts the most recently edited own template first', () => {
    expect(labelsOf('mine')).toEqual(['New Mine', 'Old Mine']);
  });

  it('sorts shared and public alphabetically, ignoring case', () => {
    expect(labelsOf('shared')).toEqual(['Bastion', 'Cień', 'Wiedźmin']);
    expect(labelsOf('public')).toEqual(['Arkham Nights', 'zombie Apocalypse']);
  });

  it('files a public template shared with the viewer under shared', () => {
    expect(options.find(o => o.label === 'Bastion').group).toBe('shared');
  });

  it('groups by sharedWithMe even when the owner email is missing', () => {
    const cien = options.find(o => o.label === 'Cień');
    expect(cien.group).toBe('shared');
    expect(cien.ownerEmail).toBeUndefined();
  });

  it('prefixes template values', () => {
    expect(options.find(o => o.label === 'Wiedźmin').value).toBe(`${CUSTOM_PREFIX}s1`);
  });
});

describe('normalizeForSearch', () => {
  it('folds case and Polish diacritics, including ł', () => {
    expect(normalizeForSearch('Łowca ŻÓŁW źdźbło')).toBe('lowca zolw zdzblo');
  });
});

describe('findMatch', () => {
  it('returns code-point bounds of the first match in the original text', () => {
    expect(findMatch('Wielki Łowca', 'lowca')).toEqual([7, 12]);
  });

  it('returns null for no match or an empty query', () => {
    expect(findMatch('Bastion', 'xyz')).toBeNull();
    expect(findMatch('Bastion', '   ')).toBeNull();
  });
});

describe('filterSystemOptions', () => {
  const options = buildSystemOptions(systems, templates);

  it('returns everything for an empty query', () => {
    expect(filterSystemOptions(options, '')).toBe(options);
  });

  it('matches a substring of the label, diacritic-insensitive', () => {
    expect(filterSystemOptions(options, 'WIEDZ').map(o => o.label)).toEqual(['Wiedźmin']);
  });

  it('matches the owner email only for shared templates', () => {
    expect(filterSystemOptions(options, 'alice@').map(o => o.label)).toEqual(['Wiedźmin']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=systemOptions`
Expected: FAIL — `Cannot find module './systemOptions'`.

- [ ] **Step 3: Write the implementation**

```js
// Builds, orders and filters the create-game system picker's options. Kept out of the dialog
// so the grouping and matching rules are testable without rendering MUI.

// A value is either a bare system key (hardcoded Go plugin) or "custom:<templateId>" for a
// system authored in the creator — a template id can never collide with a system key.
export const CUSTOM_PREFIX = 'custom:';

const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
// Date.parse, not string comparison: Go's RFC3339 output has a variable number of fractional digits.
const byUpdatedDesc = (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);

// sharedWithMe, not ownerEmail, decides the group: the email lookup may fail server-side and
// a missing email must not move a template the viewer was given into "public".
const groupOf = (tpl) => {
  if (tpl.isOwner) return 'mine';
  return tpl.sharedWithMe ? 'shared' : 'public';
};

const toOption = (tpl, group) => ({
  value: `${CUSTOM_PREFIX}${tpl.id}`,
  label: tpl.name,
  group,
  ...(group === 'shared' && tpl.ownerEmail ? { ownerEmail: tpl.ownerEmail } : {}),
});

// Array order IS group order: Autocomplete's groupBy only merges adjacent options.
export function buildSystemOptions(systems, templates) {
  const buckets = { mine: [], shared: [], public: [] };
  templates.forEach(tpl => buckets[groupOf(tpl)].push(tpl));
  return [
    ...systems.map(sys => ({ value: sys.value, label: sys.label, group: 'systems' })),
    ...buckets.mine.sort(byUpdatedDesc).map(tpl => toOption(tpl, 'mine')),
    ...buckets.shared.map(tpl => toOption(tpl, 'shared')).sort(byLabel),
    ...buckets.public.map(tpl => toOption(tpl, 'public')).sort(byLabel),
  ];
}

// "ł" is a letter of its own, not "l" plus a combining mark, so NFD leaves it untouched.
const EXTRA_FOLDS = { 'ł': 'l', 'Ł': 'l' };

// Folds one character to its search form, always to exactly one character, so a match index
// in the folded text is also an index in the original label (needed for highlighting).
const foldChar = (c) => {
  if (EXTRA_FOLDS[c]) return EXTRA_FOLDS[c];
  const folded = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return folded.length === 1 ? folded : c;
};

export const normalizeForSearch = (text) => Array.from(text || '').map(foldChar).join('');

// Returns [start, end) of the first match in code points of `text`, or null.
export function findMatch(text, query) {
  const q = Array.from(normalizeForSearch(query.trim()));
  if (q.length === 0) return null;
  const t = Array.from(normalizeForSearch(text));
  for (let i = 0; i + q.length <= t.length; i++) {
    if (q.every((c, j) => t[i + j] === c)) return [i, i + q.length];
  }
  return null;
}

export function filterSystemOptions(options, query) {
  if (!query.trim()) return options;
  return options.filter(opt => findMatch(opt.label, query)
    || (opt.group === 'shared' && opt.ownerEmail && findMatch(opt.ownerEmail, query)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=systemOptions`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/lobby/systemOptions.js \
        warhammer-battle-helper-front/src/components/lobby/systemOptions.test.js
git commit -m "feat: PLAYRPG-224 build, order and filter the system picker options"
```

---

### Task 3: Frontend — `Autocomplete` in `CreateGameDialog` + i18n

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (`creator` block, ~line 1374)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (`creator` block, ~line 1374)
- Test: `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx`

**Interfaces:**
- Consumes: everything Task 2 produces.
- Props of `CreateGameDialog` unchanged: `{ open, loading, templates, allowedSystems, onClose, onCreate, onOpenCreator }`; `onCreate` payload unchanged.

- [ ] **Step 1: Add the i18n keys**

In `locales/en/translation.json`, `creator` block: replace
`"groupCommunity": "Community templates",` with

```json
    "groupSharedWithMe": "Shared with me",
    "groupPublic": "Public templates",
    "searchSystem": "Type to search…",
    "noSystemMatch": "No matching system or template",
```

In `locales/pl/translation.json`, `creator` block: replace
`"groupCommunity": "Szablony społeczności",` with

```json
    "groupSharedWithMe": "Udostępnione mi",
    "groupPublic": "Szablony publiczne",
    "searchSystem": "Wpisz, aby wyszukać…",
    "noSystemMatch": "Brak pasującego systemu lub szablonu",
```

Verify: `grep -rn "groupCommunity" src` → no results.

- [ ] **Step 2: Write the failing test**

Create `src/components/lobby/CreateGameDialog.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../../i18n';
import CreateGameDialog from './CreateGameDialog';

const templates = [
  { id: 'm1', name: 'Moja Kampania', isOwner: true, updatedAt: '2026-10-01T10:00:00Z' },
  { id: 's1', name: 'Łowcy Czarownic', isOwner: false, sharedWithMe: true, ownerEmail: 'alice@example.com' },
  { id: 'p1', name: 'Mroczne Ziemie', isOwner: false, isPublic: true },
];

const renderDialog = (props = {}) => render(
  <CreateGameDialog open loading={false} templates={templates}
    onClose={jest.fn()} onCreate={jest.fn()} onOpenCreator={jest.fn()} {...props} />
);

const search = (text) => {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
  return screen.getByRole('listbox');
};

describe('CreateGameDialog system search', () => {
  it('narrows the list diacritic-insensitively and hides emptied groups', () => {
    renderDialog();
    const listbox = search('lowca');

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Łowcy Czarownic');
    expect(options[0]).toHaveTextContent('alice@example.com');
    expect(within(listbox).getByText(i18n.t('creator.groupSharedWithMe'))).toBeInTheDocument();
    expect(within(listbox).queryByText(i18n.t('creator.groupPublic'))).not.toBeInTheDocument();
  });

  it('never shows an author on public templates', () => {
    renderDialog();
    const listbox = search('mroczne');
    expect(within(listbox).getByRole('option')).toHaveTextContent(/^Mroczne Ziemie$/);
  });

  it('tells the user when nothing matches', () => {
    renderDialog();
    search('zzzz');
    expect(screen.getByText(i18n.t('creator.noSystemMatch'))).toBeInTheDocument();
  });

  it('creates a game on the picked template', () => {
    const onCreate = jest.fn();
    renderDialog({ onCreate });
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    fireEvent.click(within(search('mroczne')).getByRole('option'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.create') }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sesja', gameSystem: 'custom', customTemplateId: 'p1' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CreateGameDialog`
Expected: FAIL — `Unable to find an accessible element with the role "combobox"` (the old `Select` renders a button-like div, not a combobox input).

- [ ] **Step 4: Rewrite the picker in `CreateGameDialog.jsx`**

Imports — replace the `@mui/material` import and add the options module:

```jsx
import {
  Autocomplete, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  ListSubheader, TextField, Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { listSystems } from '../../systems/registry';
import { parchmentDialogProps, DISPLAY_FONT, BODY_FONT } from './lobbyStyles';
import { CUSTOM_PREFIX, buildSystemOptions, filterSystemOptions, findMatch } from './systemOptions';
```

Delete the local `const CUSTOM_PREFIX = 'custom:';` and its comment (the comment now lives in `systemOptions.js`); keep `isCustom` and `templateIdOf`. Below `subheaderSx` add:

```jsx
const GROUP_LABEL_KEYS = {
  systems: 'creator.groupSystems',
  mine: 'creator.groupMyTemplates',
  shared: 'creator.groupSharedWithMe',
  public: 'creator.groupPublic',
};

// Bolds the first matched fragment of the label; a hit only on the owner email leaves it plain.
function HighlightedLabel({ label, query }) {
  const match = findMatch(label, query);
  if (!match) return label;
  const chars = Array.from(label);
  return (
    <>
      {chars.slice(0, match[0]).join('')}
      <strong>{chars.slice(match[0], match[1]).join('')}</strong>
      {chars.slice(match[1]).join('')}
    </>
  );
}
```

Update the top comment of the component to: `// The only place a game gets created. Picking the system and picking a custom template are the same act, so they share one searchable picker instead of a second "choose template" modal.`

Inside the component, add query state next to `selection`:

```jsx
  // What the user typed, kept apart from the input text: after a pick MUI fills the input with
  // the chosen label, which must neither filter the list nor highlight matches.
  const [query, setQuery] = useState('');
```

Replace the `myTemplates` / `communityTemplates` memos with:

```jsx
  const options = useMemo(
    () => buildSystemOptions(regularSystems, customAllowed ? templates : []),
    [regularSystems, templates, customAllowed]
  );
  const selectedOption = options.find(opt => opt.value === selection) ?? null;
```

In the open-reset effect add `setQuery('');` after `setSelection(DEFAULT_SYSTEM);`.

Delete `labelFor`, the `options` array of `ListSubheader`/`MenuItem` and its comment, and replace the whole `<FormControl>…</FormControl>` with:

```jsx
        <Autocomplete
          disableClearable
          disabled={loading}
          options={options}
          value={selectedOption}
          onChange={(e, opt) => setSelection(opt.value)}
          onInputChange={(e, value, reason) => setQuery(reason === 'input' ? value : '')}
          filterOptions={(opts) => filterSystemOptions(opts, query)}
          groupBy={(opt) => opt.group}
          getOptionLabel={(opt) => opt.label}
          isOptionEqualToValue={(opt, val) => opt.value === val.value}
          noOptionsText={t('creator.noSystemMatch')}
          renderGroup={(params) => (
            <li key={params.key}>
              <ListSubheader component="div" sx={subheaderSx}>{t(GROUP_LABEL_KEYS[params.group])}</ListSubheader>
              <ul style={{ padding: 0 }}>{params.children}</ul>
            </li>
          )}
          renderOption={(props, opt) => {
            const { key, ...optionProps } = props;
            return (
              <li key={key} {...optionProps}>
                <Box sx={{ display: 'flex', flexDirection: 'column', fontFamily: BODY_FONT }}>
                  <span><HighlightedLabel label={opt.label} query={query} /></span>
                  {opt.ownerEmail && (
                    <Typography component="span" variant="caption"
                      sx={{ fontFamily: BODY_FONT, color: 'text.secondary' }}>
                      {opt.ownerEmail}
                    </Typography>
                  )}
                </Box>
              </li>
            );
          }}
          slotProps={{ listbox: { sx: { maxHeight: 380 } } }}
          sx={{ mt: 2 }}
          renderInput={(params) => (
            <TextField {...params} label={t('game.gameSystem')} placeholder={t('creator.searchSystem')}
              sx={{
                '& .MuiInputBase-input': { fontFamily: BODY_FONT, fontSize: '1.1rem' },
                '& .MuiInputLabel-root': { fontFamily: BODY_FONT, fontSize: '1.1rem' },
              }} />
          )}
        />
```

The template-removed fallback effect, `handleSubmit`, the creator CTA and `DialogActions` stay as they are.

- [ ] **Step 5: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="CreateGameDialog|systemOptions"`
Expected: PASS.

Then the whole suite: `CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` failure.

Then lint: `npx eslint src/components/lobby/`
Expected: no errors (no unused imports — `FormControl`, `InputLabel`, `MenuItem`, `Select` must be gone).

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx \
        warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-224 searchable, four-group system picker in the create-game dialog"
```

---

### Task 4: Browser check

No test covers the MUI popup styling (parchment paper, sticky group headers, highlight, email line), so it gets looked at once in a real browser.

- [ ] **Step 1: Run the worktree frontend at :3000**

The frontend container always mounts the main checkout. Swap only the frontend layer (the backend change needs the backend from this branch too — if the running backend is main, `sharedWithMe`/`ownerEmail` will be missing and every shared template shows under Public; restart the backend from the worktree only with the user's OK, it drops all WebSockets):

```bash
docker stop warhammer-battle-helper-frontend-1
docker compose -f <worktree>/docker-compose.yml -p playrpg224 up -d frontend
```

- [ ] **Step 2: Check by hand**

- Open the create-game dialog: four headed groups, Warhammer preselected.
- Type `lowca` / `ŁOWCA` / part of a sharer's email: list narrows, empty groups disappear, match bolded.
- Type nonsense: "No matching system or template".
- Pick a template, blur, reopen: full list again (no stale filter).
- Shared row shows the owner's email in a second line; public rows show none.
- Polish UI: group names and messages translated.

- [ ] **Step 3: Restore the stack**

```bash
docker compose -p playrpg224 down
docker start warhammer-battle-helper-frontend-1
```
