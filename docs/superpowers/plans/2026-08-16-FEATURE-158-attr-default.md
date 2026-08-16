# FEATURE-158 — Default value for attr/number fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a GM set a default value on `attr` and `number` fields in the character sheet creator; every character created afterwards in a game using that template starts with those values already filled in.

**Architecture:** `models.FieldDef` gains `Default *int`. The custom-system plugin gets a `SeedDefaults(raw, tmpl)` method (following the existing `RollWithTemplate` precedent: template-aware logic hangs off `*custom.Plugin`, not off the `systems.GameSystem` interface). `CharacterHandler.CreateGameCharacter` calls it right after `DefaultStats()` and before `ComputeDerived()`, so a seeded attribute reaches the client with `current` already computed. The creator UI adds a third box to the existing Min/Max row.

**Tech Stack:** Go 1.x + Gin + MongoDB driver (`go.mongodb.org/mongo-driver/bson`) on the backend; React + MUI + i18next on the frontend.

**Spec:** `docs/superpowers/specs/2026-08-16-FEATURE-158-attr-default-design.md`

**Branch:** `FEATURE-158` (already created; the spec is committed on it).

## Global Constraints

- Backend commands run from `warhammer-battle-helper-backend/`; frontend commands from `warhammer-battle-helper-front/`.
- `Default` is `*int`, never `int` — `omitempty` on a plain `int` would erase a deliberate default of `0`, making "no default" and "default zero" indistinguishable.
- Only `attr` and `number` field types honour `Default`. Every other type ignores it.
- No backward-compat shims and no data migration: templates saved before this change simply decode `Default` as `nil`.
- Frontend strings go through `t('key')` with English keys; both `src/locales/en/translation.json` and `src/locales/pl/translation.json` get the key in the same commit.
- Min/Max are NOT enforced against the default (they are HTML input attributes only, nowhere enforced server-side today).

## File Structure

| File | Responsibility |
|---|---|
| `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` | Modify: add `Default *int` to `FieldDef`. |
| `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` | Modify: add `SeedDefaults` method on `*Plugin`. |
| `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` | Modify: add `SeedDefaults` unit tests (the custom package keeps all its plugin-level tests in this one file). |
| `warhammer-battle-helper-backend/internal/http/CharacterHandler.go` | Modify: call `SeedDefaults` in `CreateGameCharacter`. |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` | Modify: third input in the Min/Max row of the field properties panel. |
| `warhammer-battle-helper-front/src/locales/en/translation.json` | Modify: `creator.fieldDefault`. |
| `warhammer-battle-helper-front/src/locales/pl/translation.json` | Modify: `creator.fieldDefault`. |

---

### Task 1: `FieldDef.Default` + `SeedDefaults` in the custom plugin

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:157-185` (the `FieldDef` struct)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` (append after `ComputeDerived`, before `GetDisplayName` at line 64)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (append at end of file)

**Interfaces:**
- Consumes: `models.SystemTemplate`, `models.SectionDef`, `models.FieldDef`; the package-private `decodeStats(bson.Raw) (*Stats, error)` in `plugin.go:113`; `Stats.Attributes map[string]AttrValue`, `Stats.Numbers map[string]int` from `character.go`.
- Produces: `func (p *Plugin) SeedDefaults(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error)` — Task 2 calls exactly this signature. `models.FieldDef.Default *int` with json/bson name `default` — Task 3 writes the matching JSON key from the client.

- [ ] **Step 1: Add the `Default` field to the model**

In `warhammer-battle-helper-backend/internal/models/SystemTemplate.go`, inside `type FieldDef struct`, directly after the `Max` line (`Max *int \`bson:"max,omitempty" json:"max,omitempty"\``), add:

```go
	// Default is the value written into a freshly created character's stats for this field
	// ("attr" and "number" only). Nil = no default; the character starts with the key absent,
	// exactly as before. A pointer, not an int, because 0 is a legal default and `omitempty`
	// on a plain int would erase it.
	Default *int `bson:"default,omitempty" json:"default,omitempty"`
```

Keep the surrounding fields' alignment: run `gofmt -w internal/models/SystemTemplate.go` after editing.

- [ ] **Step 2: Write the failing tests**

Append to `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`:

```go
// ---------------------------------------------------------------------------
// SeedDefaults (FEATURE-158)
// ---------------------------------------------------------------------------

func intPtr(v int) *int { return &v }

// seedTemplate builds a one-section template out of the given fields.
func seedTemplate(fields ...models.FieldDef) *models.SystemTemplate {
	return &models.SystemTemplate{
		Sections: []models.SectionDef{{ID: "s1", Title: "Stats", Columns: 1, Fields: fields}},
	}
}

// seedBlank runs SeedDefaults over a fresh DefaultStats() document and decodes the result.
func seedBlank(t *testing.T, tmpl *models.SystemTemplate) *Stats {
	t.Helper()
	p := New()
	blank, err := p.DefaultStats()
	if err != nil {
		t.Fatalf("DefaultStats() error: %v", err)
	}
	out, err := p.SeedDefaults(blank, tmpl)
	if err != nil {
		t.Fatalf("SeedDefaults() error: %v", err)
	}
	s, err := decodeStats(out)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	return s
}

func TestSeedDefaults_AttrSeedsBaseAdvancesStayZero(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(5)}))

	av, ok := s.Attributes["attr_1"]
	if !ok {
		t.Fatal("expected Attributes[\"attr_1\"] to be seeded")
	}
	if av.Base != 5 {
		t.Errorf("base = %d, want 5", av.Base)
	}
	if av.Advances != 0 {
		t.Errorf("advances = %d, want 0", av.Advances)
	}
}

func TestSeedDefaults_AttrZeroIsSeeded(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(0)}))

	av, ok := s.Attributes["attr_1"]
	if !ok {
		t.Fatal("a default of 0 must still create the key — nil and zero are different states")
	}
	if av.Base != 0 {
		t.Errorf("base = %d, want 0", av.Base)
	}
}

func TestSeedDefaults_NilDefaultLeavesKeyAbsent(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr"}))

	if _, ok := s.Attributes["attr_1"]; ok {
		t.Error("field without a Default must not be seeded")
	}
}

func TestSeedDefaults_NumberSeedsNumbersMap(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "num_1", Type: "number", Default: intPtr(7)}))

	if got := s.Numbers["num_1"]; got != 7 {
		t.Errorf("Numbers[\"num_1\"] = %d, want 7", got)
	}
	if _, ok := s.Attributes["num_1"]; ok {
		t.Error("a number field must not land in Attributes")
	}
}

func TestSeedDefaults_OtherTypesIgnored(t *testing.T) {
	s := seedBlank(t, seedTemplate(
		models.FieldDef{Key: "prog_1", Type: "progress", Default: intPtr(3)},
		models.FieldDef{Key: "txt_1", Type: "text_short", Default: intPtr(3)},
		models.FieldDef{Key: "tbl_1", Type: "skill_table", Default: intPtr(3)},
	))

	if len(s.Attributes) != 0 {
		t.Errorf("Attributes = %v, want empty", s.Attributes)
	}
	if len(s.Numbers) != 0 {
		t.Errorf("Numbers = %v, want empty", s.Numbers)
	}
}

func TestSeedDefaults_AllSectionsAreVisited(t *testing.T) {
	tmpl := &models.SystemTemplate{Sections: []models.SectionDef{
		{ID: "s1", Fields: []models.FieldDef{{Key: "attr_1", Type: "attr", Default: intPtr(1)}}},
		{ID: "s2", Fields: []models.FieldDef{{Key: "attr_2", Type: "attr", Default: intPtr(2)}}},
	}}

	s := seedBlank(t, tmpl)

	if s.Attributes["attr_1"].Base != 1 || s.Attributes["attr_2"].Base != 2 {
		t.Errorf("attributes = %v, want attr_1 base 1 and attr_2 base 2", s.Attributes)
	}
}

func TestSeedDefaults_NilTemplateIsANoOp(t *testing.T) {
	p := New()
	blank, _ := p.DefaultStats()

	out, err := p.SeedDefaults(blank, nil)
	if err != nil {
		t.Fatalf("SeedDefaults(nil template) error: %v", err)
	}
	s, _ := decodeStats(out)
	if len(s.Attributes) != 0 || len(s.Numbers) != 0 {
		t.Errorf("expected untouched stats, got attributes=%v numbers=%v", s.Attributes, s.Numbers)
	}
}

func TestSeedDefaults_ComputeDerivedMakesCurrentEqualBase(t *testing.T) {
	p := New()
	blank, _ := p.DefaultStats()
	tmpl := seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(5)})

	seeded, err := p.SeedDefaults(blank, tmpl)
	if err != nil {
		t.Fatalf("SeedDefaults() error: %v", err)
	}
	derived, err := p.ComputeDerived(seeded)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	s, _ := decodeStats(derived)
	if s.Attributes["attr_1"].Current != 5 {
		t.Errorf("current = %d, want 5", s.Attributes["attr_1"].Current)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `warhammer-battle-helper-backend/`:

```bash
go test ./internal/systems/custom/ -run TestSeedDefaults -v
```

Expected: compile failure — `p.SeedDefaults undefined (type *Plugin has no field or method SeedDefaults)`.

- [ ] **Step 4: Implement `SeedDefaults`**

In `warhammer-battle-helper-backend/internal/systems/custom/plugin.go`, insert after `ComputeDerived` ends (just before `// GetDisplayName …` at line 64):

```go
// SeedDefaults writes each field's FieldDef.Default into a stats document, which is how a
// freshly created character starts with GM-chosen values instead of blanks (FEATURE-158).
// Attr fields land in Attributes[key].Base with Advances left at 0 — advances are earned in
// play, not granted at creation — so a later ComputeDerived sets current = base. Number fields
// land in Numbers[key]. Fields with a nil Default, and every type other than "attr"/"number",
// are left untouched: nil means "no default", which is not the same as a default of 0.
//
// This hangs off *Plugin rather than the systems.GameSystem interface for the same reason as
// RollWithTemplate: only the custom system has a template to read.
func (p *Plugin) SeedDefaults(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error) {
	if tmpl == nil {
		return raw, nil
	}
	s, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}
	if s.Numbers == nil {
		s.Numbers = map[string]int{}
	}
	for _, section := range tmpl.Sections {
		for _, field := range section.Fields {
			if field.Default == nil {
				continue
			}
			switch field.Type {
			case "attr":
				s.Attributes[field.Key] = AttrValue{Base: *field.Default}
			case "number":
				s.Numbers[field.Key] = *field.Default
			}
		}
	}
	out, err := bson.Marshal(s)
	if err != nil {
		return raw, err
	}
	return out, nil
}
```

`decodeStats` already guarantees non-nil `Attributes`, `Skills` and `Weapons`, but not `Numbers` (see `plugin.go:113-128`) — hence the explicit init above.

Check that `plugin.go` imports `"battle-helper/internal/models"`; it already does (`RollWithTemplate` takes a `*models.SystemTemplate`).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
go test ./internal/systems/custom/ -run TestSeedDefaults -v
```

Expected: `ok` with all eight `TestSeedDefaults_*` tests PASS.

- [ ] **Step 6: Run the whole backend test suite and vet**

```bash
go build ./... && go vet ./... && go test ./...
```

Expected: build and vet silent; every package `ok` or `no test files`.

- [ ] **Step 7: Commit**

```bash
git add internal/models/SystemTemplate.go internal/systems/custom/plugin.go internal/systems/custom/roller_test.go
git commit -m "$(cat <<'EOF'
feat(custom): FEATURE-158 seed FieldDef.Default into new character stats

FieldDef gains Default (*int, so a deliberate 0 survives omitempty) and the
custom plugin gains SeedDefaults, which writes attr defaults into
Attributes[key].Base and number defaults into Numbers[key]. Nothing calls it
yet — the handler wiring follows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Call `SeedDefaults` when a character is created

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/http/CharacterHandler.go:171-190` (inside `CreateGameCharacter`)

**Interfaces:**
- Consumes: `(*custom.Plugin).SeedDefaults(bson.Raw, *models.SystemTemplate) (bson.Raw, error)` from Task 1; `game.CustomSystemTemplate` (`models.Game:59`); `registry.Get(gameSystem)` returning `systems.GameSystem`.
- Produces: nothing further tasks consume.

- [ ] **Step 1: Add the `custom` import**

In `warhammer-battle-helper-backend/internal/http/CharacterHandler.go`, extend the import block (currently `battle-helper/internal/models`, `.../repository`, `.../systems`, `.../systems/registry`, `.../websocket`, …) with:

```go
	"battle-helper/internal/systems/custom"
```

Keep it in the existing alphabetical group with the other `battle-helper/...` imports, i.e. directly after `"battle-helper/internal/systems"` and before `"battle-helper/internal/systems/registry"`.

- [ ] **Step 2: Seed inside the blank-stats branch**

In `CreateGameCharacter`, the current block reads:

```go
		if len(statsRaw) == 0 {
			statsRaw = defaultStatsFor(sys, req.Name)
		}
```

Replace it with:

```go
		if len(statsRaw) == 0 {
			statsRaw = defaultStatsFor(sys, req.Name)
			// FEATURE-158: a custom game's template can give attr/number fields a default value,
			// which the character starts with. Seeding here (and not in the client) keeps the whole
			// blank-sheet shape on the backend, and running before ComputeDerived below means the
			// seeded base already reaches the client with current computed.
			if customPlugin, ok := sys.(*custom.Plugin); ok && game.CustomSystemTemplate != nil {
				if seeded, seedErr := customPlugin.SeedDefaults(statsRaw, game.CustomSystemTemplate); seedErr == nil {
					statsRaw = seeded
				} else {
					log.Printf("CreateGameCharacter: SeedDefaults failed for game %s: %v", gameID, seedErr)
				}
			}
		}
```

The type assertion doubles as the system check — only the custom plugin has this method, so no `gameSystem == "custom"` string comparison is needed. A seeding error is logged and swallowed: the character is still created with a blank sheet, exactly as before the feature.

- [ ] **Step 3: Verify it builds and nothing regressed**

```bash
go build ./... && go vet ./... && go test ./...
```

Expected: build and vet silent; every package `ok` or `no test files`.

- [ ] **Step 4: Commit**

```bash
git add internal/http/CharacterHandler.go
git commit -m "$(cat <<'EOF'
feat(characters): FEATURE-158 apply template defaults to new characters

CreateGameCharacter runs the custom plugin's SeedDefaults over the blank
stats document before ComputeDerived, so a character created in a custom
game starts with the GM's default attr/number values.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: "Default" input in the creator's field properties panel

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:591-596` (the Min/Max row)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (the `creator` block, near `"fieldAbbrHint"` at line 1144)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (same position)

**Interfaces:**
- Consumes: `models.FieldDef.Default` from Task 1 — the client writes the JSON key `default` on a field object; `null` means "no default".
- Produces: nothing further tasks consume.

- [ ] **Step 1: Add the i18n keys**

In `warhammer-battle-helper-front/src/locales/en/translation.json`, inside the `creator` block, after the `"fieldAbbrHint"` line, add:

```json
    "fieldDefault": "Default",
```

In `warhammer-battle-helper-front/src/locales/pl/translation.json`, at the same position:

```json
    "fieldDefault": "Domyślna",
```

- [ ] **Step 2: Add the input to the Min/Max row**

In `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx`, the block currently reads:

```jsx
      {(field.type === 'attr' || field.type === 'number') && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField size="small" label="Min" type="number" value={field.min ?? ''} onChange={e => up({ min: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
          <TextField size="small" label="Max" type="number" value={field.max ?? ''} onChange={e => up({ max: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
        </Box>
      )}
```

Add a third `TextField` after the Max one, inside the same `Box`:

```jsx
          <TextField size="small" label={t('creator.fieldDefault')} type="number" value={field.default ?? ''} onChange={e => up({ default: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
```

`'' → null` mirrors Min/Max: an emptied box must send `null` so the backend decodes "no default", not `0`. Do not touch `makeDefaultField` (`TemplateBuilder.jsx:111-128`) — a new field simply has no `default` key, and `field.default ?? ''` renders `undefined` as an empty box. No CSS changes: the three boxes share the existing flex row.

- [ ] **Step 3: Verify the frontend builds**

Run from `warhammer-battle-helper-front/`:

```bash
npm test -- --watchAll=false && npm run build
```

Expected: the existing Jest suite passes (this change adds no tests — the creator has no render tests) and the CRA build completes, which is also the lint gate: react-scripts runs ESLint (config lives in `package.json` → `eslintConfig`) as part of the build and fails on errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/creator/TemplateBuilder.jsx src/locales/en/translation.json src/locales/pl/translation.json
git commit -m "$(cat <<'EOF'
feat(creator): FEATURE-158 add a Default input to attr and number fields

The field properties panel's Min/Max row gains a third box writing
field.default, which the backend seeds into every character created
afterwards. An emptied box sends null so "no default" stays distinct
from a default of 0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: End-to-end verification

**Files:** none (manual verification against the local docker stack).

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing.

- [ ] **Step 1: Bring up the stack**

```bash
docker compose up -d --build
```

Wait until the backend container reports it is listening.

- [ ] **Step 2: Set defaults in the creator**

Log in, open the character sheet creator, and on a template you own:
1. Add (or pick) an `attr` field, set its **Default** to `20`.
2. Add (or pick) a second `attr` field, set its **Default** to `0`.
3. Add a `number` field, set its **Default** to `3`.
4. Leave one `attr` field with an empty **Default**.
5. Wait for the autosave (debounce is 1200 ms), then reload the creator page and confirm all four boxes still show what you typed — this proves `null` vs `0` survived the round trip.

- [ ] **Step 3: Create a character in a game on that template**

`SeedDefaults` reads `game.CustomSystemTemplate`, a snapshot of the template embedded when the
game was created — not a live reference. A default added after the game already exists only
reaches new characters once that snapshot is refreshed via "Sync template to game"
(`creator.syncTemplate`, `POST /games/:id/syncTemplate`). Verify both halves of that explicitly,
rather than "create or open a game", which would only exercise one branch depending on which
you pick:

1. **New game, created after Step 2's edits**: start a fresh game on that template, then use
   "Add character" and "Add NPC".
2. **Existing game, created before Step 2's edits, not yet synced**: open a game on that
   template that already existed before you set the defaults, and use "Add character" without
   clicking "Sync template to game" first. Expected: the new character's attr/number fields are
   blank, exactly as before this feature — the game's embedded template snapshot predates the
   defaults, so there is nothing yet for `SeedDefaults` to seed.
3. **Same existing game, now synced**: in the lobby, click "Sync template to game" for that
   game, then use "Add character" again. Expected: this new character now shows the defaults,
   because the sync refreshed `game.CustomSystemTemplate`. The character created in sub-step 2
   must remain unchanged — sync affects only characters created after it runs.

Expected on the freshly opened sheet (sub-steps 1 and 3):
- the first attr shows `20`
- the `number` field shows `3`
- the zero-default attr and the no-default attr both look empty (an attr input renders `0` as blank — `value={base || ''}` in `CustomSheetBody.jsx`); this is the known, accepted display behaviour, not a bug in the seed

- [ ] **Step 4: Confirm the zero default really was stored**

The zero-default attr must exist in the document even though it renders blank. Check the API response for the game's characters (browser devtools → Network → the `GET /games/<id>/characters` request) and confirm the character's `stats.attributes` contains the zero-default field's key with `"base": 0`, while the no-default field's key is absent entirely.

- [ ] **Step 5: Confirm existing characters were not touched**

Open a character that existed in that game before the defaults were set. Its values must be unchanged — defaults apply at creation only, never as a backfill.

- [ ] **Step 6: Confirm a template without defaults still creates blank characters**

Create a character in a game on a template where no field has a default. Every field must be blank, exactly as before this feature.

---

## Out of scope (do not implement)

- Backfilling characters that already exist when a default is set or changed
- Defaults for `progress`, `select`, `checkbox`, `text_short`, `text_long`, `skill_table`, `weapons_table`, `skill_tree`
- A separate default for `advances`
- Enforcing Min/Max anywhere
