# PLAYRPG-237 Template Sync Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the lobby sync control only when the game's source template has a newer version, as a "New template version [Sync]" bar for the GM, confirmed by a dialog.

**Architecture:** Backend computes a per-request `templateUpdateAvailable` flag in `GetGamesForUser` (GM only) from one `$in` version lookup; `isPublic` stops bumping `version`. Frontend `GameCard` renders the bar from that flag; `GameLobby` routes the click through the existing `ConfirmDialog`.

**Tech Stack:** Go + mongo-driver (`mtest` mocks), React + MUI + i18next, Jest/RTL (CRA).

Spec: `docs/superpowers/specs/PLAYRPG-237.md`

## Global Constraints

- Code comments in English.
- No hardcoded UI strings — always `t('key')`, en + pl added together.
- Icons only from `@mui/icons-material`.
- Flag is never `true` for a non-GM viewer; failure of the version lookup must not fail the lobby.
- Remove now-unused code/i18n in the same change (`creator.syncTemplate`).
- Frontend tests: `CI=true npm test -- --watchAll=false --testPathPattern=<name>` from `warhammer-battle-helper-front/`. Baseline fail `App.test.js` (axios ESM) is not a regression.
- Backend tests: `go test ./internal/...` from `warhammer-battle-helper-backend/`.

---

### Task 1: Template repository — content-only version bump + version lookup

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateRepository.go:103-124`
- Test: `warhammer-battle-helper-backend/internal/repository/TemplateRepository_test.go`

**Interfaces:**
- Produces: `func (r *TemplateRepository) GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error)`

- [ ] **Step 1: Write the failing tests** (append to `TemplateRepository_test.go`)

```go
func TestTemplateRepository_Update_Version(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	okUpdate := bson.D{{Key: "ok", Value: 1}, {Key: "n", Value: 1}, {Key: "nModified", Value: 1}}

	updateDoc := func(mt *mtest.T) bson.Raw {
		cmd := mt.GetStartedEvent().Command
		return cmd.Lookup("updates").Array().Index(0).Value().Document().Lookup("u").Document()
	}

	mt.Run("visibility alone does not bump version", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okUpdate)
		public := true
		if err := repo.Update(primitive.NewObjectID().Hex(), nil, nil, nil, &public); err != nil {
			t.Fatalf("Update() returned unexpected error: %v", err)
		}
		if _, err := updateDoc(mt).LookupErr("$inc"); err == nil {
			t.Error("toggling isPublic must not $inc version — it would flag every game as outdated")
		}
	})

	mt.Run("content change bumps version", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		mt.AddMockResponses(okUpdate)
		name := "New name"
		if err := repo.Update(primitive.NewObjectID().Hex(), &name, nil, nil, nil); err != nil {
			t.Fatalf("Update() returned unexpected error: %v", err)
		}
		inc, err := updateDoc(mt).LookupErr("$inc", "version")
		if err != nil || inc.AsInt64() != 1 {
			t.Error("a name/sections/settings change must $inc version by 1")
		}
	})
}

func TestTemplateRepository_GetVersionsByIDs(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("maps each found id to its version", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		a, b := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "db.templates", mtest.FirstBatch,
			bson.D{{Key: "_id", Value: a}, {Key: "version", Value: 4}},
		))

		got, err := repo.GetVersionsByIDs([]primitive.ObjectID{a, b})
		if err != nil {
			t.Fatalf("GetVersionsByIDs() returned unexpected error: %v", err)
		}
		if got[a] != 4 {
			t.Errorf("got[a] = %d, want 4", got[a])
		}
		if _, ok := got[b]; ok {
			t.Error("a deleted template must be absent from the map, not zero")
		}
	})

	mt.Run("empty input issues no query", func(mt *mtest.T) {
		repo := NewTemplateRepository(mt.Coll)
		got, err := repo.GetVersionsByIDs(nil)
		if err != nil || len(got) != 0 {
			t.Fatalf("GetVersionsByIDs(nil) = %v, %v; want empty map, nil", got, err)
		}
		if mt.GetStartedEvent() != nil {
			t.Error("no ids must mean no round trip")
		}
	})
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/repository/ -run 'TestTemplateRepository_(Update_Version|GetVersionsByIDs)' -v`
Expected: build FAIL — `repo.GetVersionsByIDs undefined`.

- [ ] **Step 3: Implement**

Replace the `update := ...` line in `Update` with:

```go
	update := bson.M{"$set": bson.M{"updatedAt": time.Now()}}
	// Version tracks the sheet the players see — lobby compares it against each game's embedded
	// copy to offer a sync. Visibility (isPublic) changes nothing about that sheet, so it must not
	// bump it, exactly like updateShares.
	if name != nil || sections != nil || settings != nil {
		update["$inc"] = bson.M{"version": 1}
	}
```

Add after `GetByID`:

```go
// GetVersionsByIDs returns the current version of every template in ids that still exists, in one
// round trip with only _id and version projected. A deleted template is simply absent from the map.
func (r *TemplateRepository) GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	out := make(map[primitive.ObjectID]int, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := r.collection.Find(ctx, bson.M{"_id": bson.M{"$in": ids}},
		options.Find().SetProjection(bson.M{"_id": 1, "version": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var row struct {
			ID      primitive.ObjectID `bson:"_id"`
			Version int                `bson:"version"`
		}
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		out[row.ID] = row.Version
	}
	return out, cursor.Err()
}
```

- [ ] **Step 4: Run to verify pass**

Run: `go test ./internal/repository/ -v -run TestTemplateRepository`
Expected: PASS (all, including AddShare/RemoveShare).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/repository/TemplateRepository.go warhammer-battle-helper-backend/internal/repository/TemplateRepository_test.go
git commit -m "feat: PLAYRPG-237 bump template version on content only, add version lookup"
```

---

### Task 2: Game service — compute `templateUpdateAvailable` for the GM

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go` (Game struct, after `TemplateSourceID`)
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go` (after `Get`)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go` (`GetGamesForUser`, ~line 284; new helper near `templateSourceID` at the end)
- Create: `warhammer-battle-helper-backend/internal/service/template_update_flag_test.go`

**Interfaces:**
- Consumes: `TemplateRepository.GetVersionsByIDs` (Task 1).
- Produces: JSON field `templateUpdateAvailable` (bool, omitted when false) on every game in `GET /games`; `func markTemplateUpdates(games []models.Game, userID primitive.ObjectID, lookup func([]primitive.ObjectID) (map[primitive.ObjectID]int, error))`.

- [ ] **Step 1: Write the failing test** (`template_update_flag_test.go`)

```go
package service

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestMarkTemplateUpdates(t *testing.T) {
	gm := primitive.NewObjectID()
	other := primitive.NewObjectID()
	newer, same, gone := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

	game := func(owner, src primitive.ObjectID, embedded int) models.Game {
		return models.Game{
			GameMasterID:         owner,
			TemplateSourceID:     src,
			CustomSystemTemplate: &models.SystemTemplate{Version: embedded},
		}
	}
	versions := map[primitive.ObjectID]int{newer: 5, same: 3}

	t.Run("flags only the GM's games with a newer source", func(t *testing.T) {
		games := []models.Game{
			game(gm, newer, 3),    // newer source
			game(gm, same, 3),     // up to date
			game(gm, gone, 3),     // source deleted
			game(other, newer, 3), // viewer is a player here
			{GameMasterID: gm},    // hardcoded system, no template
		}
		var asked []primitive.ObjectID
		markTemplateUpdates(games, gm, func(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
			asked = ids
			return versions, nil
		})

		want := []bool{true, false, false, false, false}
		for i, w := range want {
			if games[i].TemplateUpdateAvailable != w {
				t.Errorf("games[%d].TemplateUpdateAvailable = %v, want %v", i, games[i].TemplateUpdateAvailable, w)
			}
		}
		if len(asked) != 3 {
			t.Errorf("lookup asked for %d ids, want 3 (only the GM's templated games)", len(asked))
		}
	})

	t.Run("lookup failure leaves every flag false", func(t *testing.T) {
		games := []models.Game{game(gm, newer, 3)}
		markTemplateUpdates(games, gm, func([]primitive.ObjectID) (map[primitive.ObjectID]int, error) {
			return nil, errors.New("mongo down")
		})
		if games[0].TemplateUpdateAvailable {
			t.Error("a failed lookup must not flag anything")
		}
	})

	t.Run("no templated GM games skips the lookup", func(t *testing.T) {
		games := []models.Game{game(other, newer, 3)}
		markTemplateUpdates(games, gm, func([]primitive.ObjectID) (map[primitive.ObjectID]int, error) {
			t.Fatal("lookup must not be called when there is nothing to check")
			return nil, nil
		})
	})
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/service/ -run TestMarkTemplateUpdates -v`
Expected: build FAIL — `undefined: markTemplateUpdates` / `TemplateUpdateAvailable`.

- [ ] **Step 3: Implement**

`models/Game.go`, after the `TemplateSourceID` line:

```go
	// TemplateUpdateAvailable is computed per-request in the lobby list, for the game's GM only: the
	// source template has a newer version than the embedded copy. Never persisted, never true for a player.
	TemplateUpdateAvailable bool `bson:"-" json:"templateUpdateAvailable,omitempty"`
```

`TemplateService.go`, after `Get`:

```go
// GetVersionsByIDs returns the current version of each still-existing template in ids.
func (s *TemplateService) GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	return s.repo.GetVersionsByIDs(ids)
}
```

(`primitive` is already imported in `TemplateService.go`; if not, add `"go.mongodb.org/mongo-driver/bson/primitive"`.)

`GameService.go`, append near `templateSourceID`:

```go
// markTemplateUpdates sets TemplateUpdateAvailable on the games userID runs whose source template
// moved past the embedded copy. One lookup for the whole list; a failed lookup leaves every flag
// false — the badge is a hint, never a reason to fail the lobby.
func markTemplateUpdates(games []models.Game, userID primitive.ObjectID, lookup func([]primitive.ObjectID) (map[primitive.ObjectID]int, error)) {
	var ids []primitive.ObjectID
	for i := range games {
		g := &games[i]
		if g.GameMasterID == userID && !g.TemplateSourceID.IsZero() && g.CustomSystemTemplate != nil {
			ids = append(ids, g.TemplateSourceID)
		}
	}
	if len(ids) == 0 {
		return
	}
	versions, err := lookup(ids)
	if err != nil {
		return
	}
	for i := range games {
		g := &games[i]
		if g.GameMasterID != userID || g.CustomSystemTemplate == nil {
			continue
		}
		if v, ok := versions[g.TemplateSourceID]; ok && v > g.CustomSystemTemplate.Version {
			g.TemplateUpdateAvailable = true
		}
	}
}
```

In `GetGamesForUser`, right after the enrichment `for` loop (before the sorting comment):

```go
	markTemplateUpdates(games, userID, s.templateService.GetVersionsByIDs)
```

- [ ] **Step 4: Run to verify pass**

Run: `go test ./internal/service/ -run TestMarkTemplateUpdates -v && go build ./... && go test ./internal/...`
Expected: PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/Game.go warhammer-battle-helper-backend/internal/service/TemplateService.go warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/service/template_update_flag_test.go
git commit -m "feat: PLAYRPG-237 flag games whose source template has a newer version"
```

---

### Task 3: GameCard — conditional "new template version" bar

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/lobby/GameCard.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Create: `warhammer-battle-helper-front/src/components/lobby/GameCard.test.jsx`

**Interfaces:**
- Consumes: `game.templateUpdateAvailable` (Task 2).
- Produces: `GameCard` prop `onSync(game)` now receives the **whole game object** (was `game.id`). Task 4 relies on this.

- [ ] **Step 1: Write the failing test** (`GameCard.test.jsx`)

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import GameCard from './GameCard';

const baseGame = {
  id: 'g1', name: 'Krypta', gameSystem: 'custom', status: 'active',
  customSystemTemplate: { name: 'Tmpl' }, participants: [],
};

const renderCard = (props = {}) => render(
  <GameCard game={baseGame} isGM loading={false} syncing={false}
    onJoin={jest.fn()} onDelete={jest.fn()} onLeave={jest.fn()} onSync={jest.fn()}
    showTooltip={jest.fn()} hideTooltip={jest.fn()} {...props} />
);

describe('GameCard template update bar', () => {
  it('shows the bar to the GM when a newer template exists', () => {
    renderCard({ game: { ...baseGame, templateUpdateAvailable: true } });
    expect(screen.getByText('New template version')).toBeInTheDocument();
  });

  it('hides the bar without the flag', () => {
    renderCard();
    expect(screen.queryByText('New template version')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument();
  });

  it('hides the bar from a player even with the flag', () => {
    renderCard({ isGM: false, game: { ...baseGame, templateUpdateAvailable: true } });
    expect(screen.queryByText('New template version')).not.toBeInTheDocument();
  });

  it('passes the whole game to onSync', () => {
    const onSync = jest.fn();
    const game = { ...baseGame, templateUpdateAvailable: true };
    renderCard({ game, onSync });
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSync).toHaveBeenCalledWith(game);
  });

  it('disables the button while syncing', () => {
    renderCard({ syncing: true, game: { ...baseGame, templateUpdateAvailable: true } });
    expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false --testPathPattern=GameCard`
Expected: FAIL — "Unable to find an element with the text: New template version".

- [ ] **Step 3: Implement**

i18n — in `"game": { ... }` of **en**:

```json
    "templateUpdateAvailable": "New template version",
    "syncTemplateAction": "Sync",
    "syncTemplateTitle": "Sync template",
    "syncTemplateConfirm": "The template of \"{{name}}\" will be updated. Values of fields removed in the new version will be lost.",
```

and **pl**:

```json
    "templateUpdateAvailable": "Nowa wersja szablonu",
    "syncTemplateAction": "Synchronizuj",
    "syncTemplateTitle": "Synchronizacja szablonu",
    "syncTemplateConfirm": "Szablon gry \"{{name}}\" zostanie zaktualizowany. Wartości pól usuniętych w nowej wersji zostaną utracone.",
```

Delete `"syncTemplate": ...` from the `"creator"` object in both files (keep `syncFailed`).

`GameCard.jsx` — remove the whole `{isGM && game.gameSystem === 'custom' && ( <IconButton ... SyncIcon ... /> )}` block from the action pill. Then insert directly before the `{/* Enter bar flush with the bottom edge */}` comment:

```jsx
      {/* Template update bar — GM only, and only when the source template moved past the game's copy */}
      {isGM && game.templateUpdateAvailable && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
          borderTop: '1px solid #c9975b', background: 'linear-gradient(180deg, #f3dfb6 0%, #ead09c 100%)',
        }}>
          <SyncIcon sx={{ fontSize: '1rem', color: '#7a5c42', animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          <Typography sx={{ flexGrow: 1, fontFamily: 'Crimson Text, serif', fontSize: '0.9rem', fontWeight: 600, color: '#3a2f1f' }}>
            {t('game.templateUpdateAvailable')}
          </Typography>
          <Button size="small" variant="outlined" onClick={() => onSync(game)} disabled={syncing}
            sx={{ fontFamily: 'Cinzel, serif', fontSize: '0.7rem', fontWeight: 700, py: 0.25, minWidth: 0, color: '#7a5c42', borderColor: '#7a5c42' }}>
            {t('game.syncTemplateAction')}
          </Button>
        </Box>
      )}
```

Check the Enter bar keeps `mt: 'auto'` — the plaque has `flexGrow: 1`, so the bar stays glued above the Enter button.

- [ ] **Step 4: Run to verify pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=GameCard`
Expected: PASS (5 tests).
Run: `grep -rn "creator.syncTemplate'" src` → no output.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/lobby/GameCard.jsx warhammer-battle-helper-front/src/components/lobby/GameCard.test.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-237 show template sync bar only when a newer version exists"
```

---

### Task 4: GameLobby — confirm before syncing

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameLobby.jsx` (lines ~33, 64-70, 112, 146-156)

**Interfaces:**
- Consumes: `GameCard onSync(game)` (Task 3); i18n keys `game.syncTemplateTitle`, `game.syncTemplateConfirm`, `game.syncTemplateAction` (Task 3); `useGames().syncTemplate(gameId)` (existing, refetches on success).

No automated test: rendering `GameLobby` needs `useGames`/`useTemplates` fetch mocks, tooltip hook and dialogs — spec allows manual verification here. `ConfirmDialog` itself is unchanged.

- [ ] **Step 1: Implement**

State comment (line ~33):

```jsx
  const [gamePrompt, setGamePrompt] = useState(null);          // { type: 'delete'|'leave'|'sync', game }
```

`handleConfirmGamePrompt`:

```jsx
  const handleConfirmGamePrompt = useCallback(() => {
    if (!gamePrompt) return;
    const { type, game } = gamePrompt;
    setGamePrompt(null);
    if (type === 'delete') deleteGame(game.id);
    else if (type === 'sync') syncTemplate(game.id);
    else leaveGame(game.id);
  }, [gamePrompt, deleteGame, leaveGame, syncTemplate]);
```

`GameCard` prop:

```jsx
                onSync={(g) => setGamePrompt({ type: 'sync', game: g })}
```

Game `ConfirmDialog` — replace the title/message/confirmLabel with a lookup so three types stay readable:

```jsx
      <ConfirmDialog
        open={!!gamePrompt}
        danger={gamePrompt?.type === 'delete'}
        title={{
          delete: t('game.deleteGame'), leave: t('game.leaveGame'), sync: t('game.syncTemplateTitle'),
        }[gamePrompt?.type]}
        message={{
          delete: t('game.deleteGameConfirm', { name: gamePrompt?.game?.name }),
          leave: t('game.leaveGameConfirm', { name: gamePrompt?.game?.name }),
          sync: t('game.syncTemplateConfirm', { name: gamePrompt?.game?.name }),
        }[gamePrompt?.type]}
        confirmLabel={{
          delete: t('common.delete'), leave: t('game.leaveGame'), sync: t('game.syncTemplateAction'),
        }[gamePrompt?.type]}
        onConfirm={handleConfirmGamePrompt}
        onCancel={() => setGamePrompt(null)}
      />
```

- [ ] **Step 2: Run lint + full frontend suite**

Run (from `warhammer-battle-helper-front/`): `npx eslint src/components/GameLobby.jsx src/components/lobby/GameCard.jsx && CI=true npm test -- --watchAll=false`
Expected: no ESLint errors; all suites pass except baseline `App.test.js`.

- [ ] **Step 3: Manual browser check** (local docker stack, see memory "local e2e verification recipe")

1. As GM of a custom game, open lobby → no bar.
2. Edit the source template (add a field), save → back to lobby (F5) → bar "New template version [Sync]" on that game only.
3. Toggle the template public/private only → F5 → no new bar on an up-to-date game.
4. Click Sync → dialog with the warning; Cancel → nothing happens, bar stays.
5. Sync again → Confirm → spinner, bar disappears after refetch.
6. Log in as a player of that game → no bar, no sync icon.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/components/GameLobby.jsx
git commit -m "feat: PLAYRPG-237 confirm template sync with a data-loss warning"
```

---

### Task 1b: Template service — bump version only when content really changed

**Why (found after Task 1):** `TemplateBuilder.jsx:1583` sends the WHOLE body `{name, sections, settings, isPublic}` on every save, including the isPublic toggle and no-op debounced autosaves. Task 1's "non-nil field ⇒ bump" check therefore still bumps on every save. The decision must compare content against the stored template in the service. User chose this (option A').

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateRepository.go` (`Update`)
- Modify: `warhammer-battle-helper-backend/internal/repository/TemplateRepository_test.go` (`TestTemplateRepository_Update_Version`)
- Modify: `warhammer-battle-helper-backend/internal/service/TemplateService.go` (`Update`, new helper)
- Create: `warhammer-battle-helper-backend/internal/service/template_content_changed_test.go`

**Interfaces:**
- Changes: `func (r *TemplateRepository) Update(id string, name *string, sections []models.SectionDef, settings *models.TemplateSettings, isPublic *bool, bumpVersion bool) error` — the repo obeys the flag, no own heuristics.
- Produces: `func templateContentChanged(current *models.SystemTemplate, req models.UpdateTemplateRequest) bool` (package `service`).

- [ ] **Step 1: Failing tests**

`template_content_changed_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
)

func TestTemplateContentChanged(t *testing.T) {
	current := &models.SystemTemplate{
		Name:     "Krypta",
		Sections: []models.SectionDef{{ID: "s1", Label: "Attrs"}},
		Settings: models.TemplateSettings{},
	}
	str := func(s string) *string { return &s }
	yes := true

	cases := []struct {
		name string
		req  models.UpdateTemplateRequest
		want bool
	}{
		{"identical full body (no-op autosave)", models.UpdateTemplateRequest{
			Name: str("Krypta"), Sections: []models.SectionDef{{ID: "s1", Label: "Attrs"}},
			Settings: &models.TemplateSettings{}, IsPublic: &yes}, false},
		{"visibility only", models.UpdateTemplateRequest{IsPublic: &yes}, false},
		{"name changed", models.UpdateTemplateRequest{Name: str("Krypta 2")}, true},
		{"section label changed", models.UpdateTemplateRequest{
			Sections: []models.SectionDef{{ID: "s1", Label: "Attributes"}}}, true},
		{"section added", models.UpdateTemplateRequest{
			Sections: []models.SectionDef{{ID: "s1", Label: "Attrs"}, {ID: "s2"}}}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := templateContentChanged(current, c.req); got != c.want {
				t.Errorf("templateContentChanged() = %v, want %v", got, c.want)
			}
		})
	}
}
```

Add one settings-changed case using any scalar field of `models.TemplateSettings` (read the struct; pick e.g. a bool/string field) → `true`. If the `SectionDef` field names `ID`/`Label` differ, use the real ones (read `internal/models/SystemTemplate.go`).

In `TemplateRepository_test.go`, rewrite `TestTemplateRepository_Update_Version` subtests to drive the flag: `repo.Update(id, &name, nil, nil, &public, false)` → no `$inc`; `repo.Update(id, nil, nil, nil, nil, true)` → `$inc.version == 1`.

- [ ] **Step 2: Run to verify failure**

`go test ./internal/service/ -run TestTemplateContentChanged -v` → build FAIL (undefined).

- [ ] **Step 3: Implement**

Repo `Update`: add `bumpVersion bool` param; replace Task 1's `if name != nil || sections != nil || settings != nil` with `if bumpVersion`. Update the comment: the caller (service) decides, because the creator sends the whole body on every save.

Service helper (TemplateService.go):

```go
// templateContentChanged reports whether req alters what players see (name, sections, settings).
// The creator sends the whole body on every save — visibility toggles and no-op autosaves
// included — so "field present" says nothing; only a value comparison does. JSON is the
// comparison form because encoding/json sorts map keys (TemplateSettings carries maps),
// which bson does not guarantee.
func templateContentChanged(current *models.SystemTemplate, req models.UpdateTemplateRequest) bool {
	if req.Name != nil && *req.Name != current.Name {
		return true
	}
	if req.Sections != nil && !sameJSON(req.Sections, current.Sections) {
		return true
	}
	if req.Settings != nil && !sameJSON(*req.Settings, current.Settings) {
		return true
	}
	return false
}

// sameJSON compares two values by their JSON encoding. A marshal error counts as "different",
// so a failure can only cause a spurious version bump, never hide a real change.
func sameJSON(a, b interface{}) bool {
	ja, errA := json.Marshal(a)
	jb, errB := json.Marshal(b)
	return errA == nil && errB == nil && bytes.Equal(ja, jb)
}
```

In `Update`, `t` is already loaded: call
`s.repo.Update(id, req.Name, req.Sections, req.Settings, req.IsPublic, templateContentChanged(t, req))`.

- [ ] **Step 4: Run** `go test ./internal/repository/ ./internal/service/ && go vet ./... && go build ./...` → PASS.

- [ ] **Step 5: Commit** `feat: PLAYRPG-237 bump template version only on a real content change`
