# PLAYRPG-266 — D&D 5e → SRD 5.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** System „D&D 5e” widoczny jako „SRD 5.2”, z kluczem `srd5` w kodzie i danych, z atrybucją CC-BY i migracją istniejących danych.

**Architecture:** Etykieta systemu przenosi się z modułów JS do i18n (`gameSystems.<id>`), więc ID staje się stałym kluczem niezależnym od nazwy. Rename `dnd5e` → `srd5` w Go, JS, i18n i CSS. Jednorazowy skrypt `cmd/migrate-dnd5e-to-srd5` przepisuje klucz w Mongo. Atrybucja: strona `/licenses` + stopka w arkuszu SRD.

**Tech Stack:** Go + mongo-driver, React (CRA) + react-i18next + MUI, Jest/RTL.

**Spec:** `docs/superpowers/specs/PLAYRPG-266.md`

## Global Constraints

- Komentarze w kodzie po angielsku. Rozmowa i `docs/` po polsku.
- Wszystkie stringi UI przez `t('klucz')`, en + pl. **Jedyny wyjątek:** dosłowna notka atrybucji WotC (stała `SRD_ATTRIBUTION`).
- Ikony wyłącznie z `@mui/icons-material`.
- **dnd-kit ≠ D&D.** Nie ruszać: `.dnd-context`, `components/DndContext.jsx`, „DnD Kit” w README/CLAUDE.md/`docs/architecture.md`, komentarza `GameService.go:2476` o `DndContext.jsx`. Nigdy ślepego `s/dnd/srd/` na całym repo.
- `docs/superpowers/**` i `.claude/agent-memory/**` — bez zmian (historia).
- Testy frontu: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/` (pojedynczy plik: `--testPathPattern=<nazwa>`). Baseline fail `App.test.js` (axios ESM) to nie regresja.
- Testy backendu: `go test ./...` z `warhammer-battle-helper-backend/`.
- macOS: `sed -i ''`. W tym shellu `grep` to alias ugrep — używaj `/usr/bin/grep`.
- Wersja SRD w notce atrybucji: **5.2.1** (aktualne wydanie WotC). Etykieta systemu zostaje „SRD 5.2” — to nazwa rodziny reguł.

---

### Task 1: Backend — rename pakietu `dnd5e` → `srd5`

**Files:**
- Move: `warhammer-battle-helper-backend/internal/systems/dnd5e/` → `internal/systems/srd5/` (`character.go`, `derived.go`, `roller.go`, `roller_test.go`, `tokenfields.go`, `skills.json` i reszta zawartości)
- Modify: `internal/systems/registry/registry.go:8,17,21`
- Modify: `internal/systems/interface.go:8,42,85` (komentarze)
- Modify: `internal/service/GameService.go:735` (komentarz)
- Test: `internal/systems/registry/defaultstats_smoke_test.go:10`, `internal/systems/registry/tokenfields_smoke_test.go:7,12`, `internal/http/AdminHandler_systems_test.go:33-34`, `internal/service/SystemAccessService_test.go` (wszystkie `"dnd5e"`)

**Interfaces:**
- Produces: klucz rejestru `"srd5"`; `systemOrder = []string{"warhammer4e", "coc7e", "coc7e_dark_ages", "srd5", "custom"}`; pakiet `battle-helper/internal/systems/srd5` z `srd5.New()`.

- [ ] **Step 1: Zaktualizuj testy na nowy klucz (failing first)**

```bash
cd warhammer-battle-helper-backend
sed -i '' 's/"dnd5e"/"srd5"/g' \
  internal/systems/registry/defaultstats_smoke_test.go \
  internal/systems/registry/tokenfields_smoke_test.go \
  internal/http/AdminHandler_systems_test.go \
  internal/service/SystemAccessService_test.go
sed -i '' 's/denied dnd5e/denied srd5/; s/dnd5e row = /srd5 row = /' internal/service/SystemAccessService_test.go
```

- [ ] **Step 2: Uruchom — oczekiwany FAIL**

Run: `go test ./internal/systems/registry/ ./internal/service/ ./internal/http/`
Expected: FAIL w `registry` (np. `unknown system "srd5"` / pusta lista token fields dla `srd5`). Testy service/http, które używają fake store, mogą przejść — to OK.

- [ ] **Step 3: Przenieś pakiet i zmień nazwę**

```bash
git mv internal/systems/dnd5e internal/systems/srd5
sed -i '' 's/^package dnd5e$/package srd5/' internal/systems/srd5/*.go
sed -i '' 's/"dnd5e: /"srd5: /g' internal/systems/srd5/*.go
sed -i '' 's/D&D 5e/SRD 5.2/g' internal/systems/srd5/*.go internal/systems/interface.go
sed -i '' 's/(e\.g\. D&D advantage\/disadvantage)/(e.g. SRD 5.2 advantage\/disadvantage)/' internal/service/GameService.go
```

W `internal/systems/registry/registry.go`:

```go
	"battle-helper/internal/systems/srd5"
```
```go
	"srd5":            srd5.New(),
```
```go
var systemOrder = []string{"warhammer4e", "coc7e", "coc7e_dark_ages", "srd5", "custom"}
```

Run `gofmt -w internal/systems/registry/registry.go` (wyrównanie mapy).

- [ ] **Step 4: Uruchom całość — PASS**

Run: `go build ./... && go test ./...`
Expected: PASS.

- [ ] **Step 5: Grep kontrolny**

Run: `/usr/bin/grep -rn -iE 'dnd5e|D&D' --include='*.go' .`
Expected: brak wyników. (`DndContext.jsx` w `GameService.go:2476` nie pasuje do wzorca — to dnd-kit, zostaje.)

- [ ] **Step 6: Commit**

```bash
git add -A internal/
git commit -m "refactor: PLAYRPG-266 rename dnd5e system package to srd5"
```

---

### Task 2: Backend — skrypt migracji `cmd/migrate-dnd5e-to-srd5`

**Files:**
- Create: `warhammer-battle-helper-backend/cmd/migrate-dnd5e-to-srd5/main.go`
- Test: `warhammer-battle-helper-backend/cmd/migrate-dnd5e-to-srd5/main_test.go`

**Interfaces:**
- Consumes: `models.SystemAccess` (`System string \`bson:"_id"\``, `AllUsers bool`, `UserIDs []primitive.ObjectID`, `UpdatedAt time.Time`) z `battle-helper/internal/models`.
- Produces: `func planAccessMove(oldDoc, newDoc *models.SystemAccess) (insert *models.SystemAccess, deleteOld bool)`.

- [ ] **Step 1: Napisz failing test**

`cmd/migrate-dnd5e-to-srd5/main_test.go`:

```go
package main

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestPlanAccessMove(t *testing.T) {
	u := primitive.NewObjectID()
	old := &models.SystemAccess{System: oldKey, UserIDs: []primitive.ObjectID{u}}
	existing := &models.SystemAccess{System: newKey, AllUsers: true}

	tests := []struct {
		name          string
		oldDoc        *models.SystemAccess
		newDoc        *models.SystemAccess
		wantInsert    bool
		wantDeleteOld bool
	}{
		{"only old: copy under new id, drop old", old, nil, true, true},
		{"both: admin's new doc wins, drop old", old, existing, false, true},
		{"only new: already migrated, nothing to do", nil, existing, false, false},
		{"neither: nothing to do", nil, nil, false, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			insert, deleteOld := planAccessMove(tc.oldDoc, tc.newDoc)
			if (insert != nil) != tc.wantInsert {
				t.Fatalf("insert = %+v, want insert %v", insert, tc.wantInsert)
			}
			if deleteOld != tc.wantDeleteOld {
				t.Fatalf("deleteOld = %v, want %v", deleteOld, tc.wantDeleteOld)
			}
			if insert != nil {
				if insert.System != newKey {
					t.Errorf("insert.System = %q, want %q", insert.System, newKey)
				}
				if len(insert.UserIDs) != 1 || insert.UserIDs[0] != u {
					t.Errorf("insert.UserIDs = %v, want [%v]", insert.UserIDs, u)
				}
				if tc.oldDoc.System != oldKey {
					t.Errorf("planAccessMove mutated the old doc: System = %q", tc.oldDoc.System)
				}
			}
		})
	}
}
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `go test ./cmd/migrate-dnd5e-to-srd5/`
Expected: FAIL kompilacji — `undefined: planAccessMove`, `undefined: oldKey`.

- [ ] **Step 3: Implementacja**

`cmd/migrate-dnd5e-to-srd5/main.go`:

```go
// migrate-dnd5e-to-srd5 renames the hardcoded game system key "dnd5e" to "srd5" (PLAYRPG-266).
//
// The key lives in four places:
//
//	games.gameSystem, characters.gameSystem, system_templates.baseSystem  -> updateMany
//	system_access._id                                                     -> copy + delete (_id is immutable)
//
// Idempotent: a second run reports zero changes everywhere. Run it right after deploying the
// code that knows "srd5" — until then old games fail to load.
//
// Usage:
//
//	MONGO_URI=mongodb://localhost:27018 MONGO_DB=warhammer go run ./cmd/migrate-dnd5e-to-srd5/
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	oldKey = "dnd5e"
	newKey = "srd5"
)

// planAccessMove decides how to carry the old system_access document over to the new key.
// An already existing new doc means the admin configured access after the deploy — it wins,
// and the old doc is only removed. The old doc is never mutated.
func planAccessMove(oldDoc, newDoc *models.SystemAccess) (insert *models.SystemAccess, deleteOld bool) {
	if oldDoc == nil {
		return nil, false
	}
	if newDoc != nil {
		return nil, true
	}
	moved := *oldDoc
	moved.System = newKey
	return &moved, true
}

func renameKey(ctx context.Context, col *mongo.Collection, field string) int64 {
	res, err := col.UpdateMany(ctx, bson.M{field: oldKey}, bson.M{"$set": bson.M{field: newKey}})
	if err != nil {
		log.Fatalf("%s.%s: %v", col.Name(), field, err)
	}
	return res.ModifiedCount
}

func findAccess(ctx context.Context, col *mongo.Collection, id string) *models.SystemAccess {
	var doc models.SystemAccess
	err := col.FindOne(ctx, bson.M{"_id": id}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	if err != nil {
		log.Fatalf("system_access %s: %v", id, err)
	}
	return &doc
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
	fmt.Printf("games:            %d\n", renameKey(ctx, db.Collection("games"), "gameSystem"))
	fmt.Printf("characters:       %d\n", renameKey(ctx, db.Collection("characters"), "gameSystem"))
	fmt.Printf("system_templates: %d\n", renameKey(ctx, db.Collection("system_templates"), "baseSystem"))

	access := db.Collection("system_access")
	insert, deleteOld := planAccessMove(findAccess(ctx, access, oldKey), findAccess(ctx, access, newKey))
	if insert != nil {
		if _, err := access.InsertOne(ctx, insert); err != nil {
			log.Fatalf("system_access insert %s: %v", newKey, err)
		}
	}
	if deleteOld {
		if _, err := access.DeleteOne(ctx, bson.M{"_id": oldKey}); err != nil {
			log.Fatalf("system_access delete %s: %v", oldKey, err)
		}
	}
	fmt.Printf("system_access:    copied=%v removedOld=%v\n", insert != nil, deleteOld)
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `go vet ./cmd/migrate-dnd5e-to-srd5/ && go test ./cmd/migrate-dnd5e-to-srd5/ -v`
Expected: PASS, 4 subtesty.

- [ ] **Step 5: Lokalny przebieg na docker stacku**

Skrypt nie zależy od kodu aplikacji — wystarczy ręczny dokument testowy:

```bash
docker compose exec mongo mongosh warhammer --quiet --eval '
  db.games.insertOne({_id: "plan266", gameSystem: "dnd5e"});
  db.system_access.insertOne({_id: "dnd5e", allUsers: true, userIds: []});'
MONGO_URI=mongodb://localhost:27018 MONGO_DB=warhammer go run ./cmd/migrate-dnd5e-to-srd5/
MONGO_URI=mongodb://localhost:27018 MONGO_DB=warhammer go run ./cmd/migrate-dnd5e-to-srd5/
docker compose exec mongo mongosh warhammer --quiet --eval '
  printjson(db.games.findOne({_id: "plan266"}));
  printjson(db.system_access.find({_id: {$in: ["dnd5e","srd5"]}}).toArray());
  db.games.deleteOne({_id: "plan266"});'
```

Expected: pierwszy przebieg `games: ≥1`, `copied=true removedOld=true`; drugi `games: 0`, `copied=false removedOld=false`; gra ma `gameSystem: "srd5"`; w `system_access` tylko `srd5` z `allUsers: true`. (Nazwę serwisu mongo i bazy sprawdź w `docker-compose.yml`, jeśli różna.)

- [ ] **Step 6: Commit**

```bash
git add cmd/migrate-dnd5e-to-srd5/
git commit -m "feat: PLAYRPG-266 migration script dnd5e -> srd5"
```

---

### Task 3: Frontend — etykieta systemu wyłącznie w i18n

Na tym etapie klucz to nadal `dnd5e` — rename w Tasku 4.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/registry.js` (`listSystems`, komentarz)
- Modify: `src/systems/{warhammer4e,coc7e,coc7e_dark_ages,dnd5e,custom}/index.js` (usuń `label:`)
- Modify: `src/components/lobby/CreateGameDialog.jsx:62-64` (`regularSystems`)
- Modify: `src/components/lobby/GameCard.jsx:21-24,67,113` (`systemLabel`)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (`gameSystems`)
- Create: `src/systems/registry.labels.test.js`
- Modify: `src/components/lobby/CreateGameDialog.test.jsx:109,115,119`

**Interfaces:**
- Produces: `listSystems(): Array<{ value: string }>` (bez `label`). Etykieta: `t(\`gameSystems.${key}\`)`.
- `buildSystemOptions(systems, templates)` w `systemOptions.js` **bez zmian** — dalej oczekuje `{ value, label }`; etykietę dokleja wołający.

- [ ] **Step 1: Napisz test strażnika**

`src/systems/registry.labels.test.js`:

```js
// registry.js imports every system, and some of them import the ESM-only 'axios' package
// directly — CRA's jest cannot parse it, so both entry points are stubbed (same as
// standaloneRender.test.jsx). Nothing here makes a request.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
}));

/* eslint-disable import/first */
import en from '../locales/en/translation.json';
import pl from '../locales/pl/translation.json';
import { listSystems, getSystem } from './registry';
/* eslint-enable import/first */

// A system's display name lives only in i18n — a missing key would show the raw
// "gameSystems.xyz" in the lobby instead of failing anywhere.
describe.each(listSystems().map(s => [s.value]))('system %s', (key) => {
  it('has a display name in en and pl', () => {
    expect(typeof en.gameSystems[key]).toBe('string');
    expect(typeof pl.gameSystems[key]).toBe('string');
  });

  it('does not carry its own label', () => {
    expect(getSystem(key).label).toBeUndefined();
  });
});
```

(Sprawdź, czy `standaloneRender.test.jsx` używa `eslint-disable import/first` — jeśli nie i lint nie protestuje, usuń te komentarze.)

- [ ] **Step 2: Uruchom — FAIL**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=registry.labels`
Expected: FAIL `does not carry its own label` (5×) — moduły mają `label`.

- [ ] **Step 3: Usuń `label` z modułów, zaktualizuj rejestr**

Usuń linię `label: '...',` z obiektu domyślnego w:
- `src/systems/warhammer4e/index.js:52` (`'Warhammer Fantasy Roleplay 4e'`)
- `src/systems/coc7e/index.js:69` (`'Call of Cthulhu 7e'`)
- `src/systems/coc7e_dark_ages/index.js:52` (`'Call of Cthulhu: Dark Ages'`)
- `src/systems/dnd5e/index.js:66` (`'D&D 5e'`)
- `src/systems/custom/index.js:44` (`'Własny system'`)

Uwaga: `coc7e/index.js` i `coc7e_dark_ages/index.js` mają też `label:` w tablicach umiejętności (linie 10-15) — **tych nie ruszać**, tylko pole obiektu systemu.

`src/systems/registry.js`:

```js
// Display names are NOT part of a system module: they live only in i18n as
// gameSystems.<key> (en + pl), so renaming a system is a translation edit with no data
// migration. A new system needs that key in both languages (registry.labels.test.js).
const systems = { warhammer4e, coc7e, coc7e_dark_ages, dnd5e, custom };
```
```js
export function listSystems() {
  return Object.keys(systems).map(value => ({ value }));
}
```

- [ ] **Step 4: Konsumenci liczą etykietę przez `t()`**

`src/components/lobby/CreateGameDialog.jsx` — zastąp `regularSystems`:

```js
  const regularSystems = useMemo(() => listSystems()
    .filter(sys => sys.value !== 'custom' && (allowedSystems ?? []).includes(sys.value))
    .map(sys => ({ ...sys, label: t(`gameSystems.${sys.value}`) })),
  [allowedSystems, t]);
```

`src/components/lobby/GameCard.jsx:21-24`:

```js
// A custom game shows its template's name; hardcoded systems show their i18n display name.
const systemLabel = (game, t) => game.gameSystem === 'custom' && game.customSystemTemplate
  ? game.customSystemTemplate.name
  : t(`gameSystems.${game.gameSystem}`, { defaultValue: game.gameSystem });
```

i w obu wywołaniach (linie 67 i 113): `{systemLabel(game, t)}`.

- [ ] **Step 5: Tłumaczenia — zachowaj obecne widoczne nazwy**

`src/locales/en/translation.json` → `gameSystems`:

```json
  "gameSystems": {
    "warhammer4e": "Warhammer Fantasy Roleplay 4e",
    "coc7e": "Call of Cthulhu 7e",
    "coc7e_dark_ages": "Call of Cthulhu: Dark Ages",
    "dnd5e": "D&D 5e",
    "custom": "Custom System"
  },
```

`src/locales/pl/translation.json` → `gameSystems`:

```json
  "gameSystems": {
    "warhammer4e": "Warhammer Fantasy Roleplay 4e",
    "coc7e": "Zew Cthulhu 7e",
    "coc7e_dark_ages": "Zew Cthulhu: Mroczne Wieki",
    "dnd5e": "D&D 5e",
    "custom": "Własny system"
  },
```

- [ ] **Step 6: Test dialogu przez i18n zamiast literału**

`src/components/lobby/CreateGameDialog.test.jsx` linie 109, 115, 119: zamień `'Warhammer Fantasy Roleplay 4e'` na `i18n.t('gameSystems.warhammer4e')`.

- [ ] **Step 7: Uruchom — PASS**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='registry.labels|CreateGameDialog|systemOptions|GameCard|standaloneRender'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems src/components/lobby src/locales
git commit -m "refactor: PLAYRPG-266 system display names live only in i18n"
```

---

### Task 4: Frontend — rename `dnd5e` → `srd5` (katalog, komponenty, i18n, CSS)

**Files:**
- Move: `src/systems/dnd5e/` → `src/systems/srd5/`
- Modify: `src/systems/registry.js`
- Modify: wszystkie pliki w `src/systems/srd5/**` (komponenty `DnD5e*`, klucze `dnd.*`, klasy `dnd-*`, `index.js`)
- Modify: `src/style.css` (klasy `.dnd-*` poza `.dnd-context`)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (blok `dnd` → `srd`, `gameSystems.dnd5e` → `gameSystems.srd5`)
- Modify (komentarze): `src/components/log/TruncatedLabel.jsx:16`, `src/systems/custom/CharacterSheet.jsx:452`, `src/utils/tokenGeometry.js:50`
- Test: `src/components/lobby/CreateGameDialog.test.jsx:21`, `src/components/log/TruncatedLabel.test.jsx:54`, `src/systems/custom/rolls/CustomWeaponRoll.smoke.test.jsx:79`, `src/systems/srd5/rolls/WeaponRoll.smoke.test.jsx`

**Interfaces:**
- Consumes: `listSystems()` / `gameSystems.<key>` z Taska 3.
- Produces: klucz `srd5`; komponenty `Srd5CharacterSheet`, `Srd5CharacterDetails`, `Srd5AdvantageOverlay`, `Srd5AdvantageModal`, `Srd5SkillRoll`, `Srd5WeaponRoll`; namespace i18n `srd.*`; prefiks CSS `.srd-*`; główny kontener arkusza `.srd-sheet-layout`.

- [ ] **Step 1: Test na nowy klucz (failing first)**

`src/components/lobby/CreateGameDialog.test.jsx:21`:

```js
const ALL_SYSTEMS = ['warhammer4e', 'coc7e', 'coc7e_dark_ages', 'srd5', 'custom'];
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern='registry.labels'`
Expected: PASS (jeszcze `dnd5e`). Ten krok tylko ustawia test dialogu; właściwy strażnik to `registry.labels` w Step 6 po rename.

- [ ] **Step 2: Przenieś katalog i przemianuj identyfikatory**

```bash
cd warhammer-battle-helper-front/src
git mv systems/dnd5e systems/srd5
F=$(find systems/srd5 -name '*.js' -o -name '*.jsx' -o -name '*.json')
sed -i '' 's/DnD5e/Srd5/g' $F
sed -i '' "s/'dnd\./'srd./g; s/\`dnd\./\`srd./g; s/\"dnd\./\"srd./g" $F
sed -i '' 's/\bdnd-/srd-/g' $F
sed -i '' 's/D&D 5e conditions (PHB)/SRD 5.2 conditions/; s/D&D 5e/SRD 5.2/g; s/Error saving D&D character/Error saving SRD character/' $F
```

`src/systems/srd5/index.js` — obiekt systemu:

```js
const srd5 = {
```
```js
export default srd5;
```

`src/systems/registry.js`:

```js
import srd5 from './srd5';
```
```js
const systems = { warhammer4e, coc7e, coc7e_dark_ages, srd5, custom };
```

Uwaga: BSD sed nie zna `\b` w każdym trybie — po kroku sprawdź Step 4 (grep) i jeśli `dnd-` zostało, użyj `perl -pi -e 's/\bdnd-/srd-/g' $F`.

- [ ] **Step 3: CSS — bez `.dnd-context`**

```bash
perl -pi -e 's/\.dnd-(?!context\b)/.srd-/g' style.css
/usr/bin/grep -n '\.dnd-' style.css
```

Expected: jedyne trafienia to `.dnd-context` (dnd-kit).

- [ ] **Step 4: Grep — w katalogu systemu nie zostało nic z „dnd”**

Run: `/usr/bin/grep -rn -iE 'dnd|D&D|PHB' systems/srd5`
Expected: brak wyników.

- [ ] **Step 5: Tłumaczenia — blok `dnd` → `srd`, klucz systemu**

Skrypt zachowujący kolejność kluczy (z `warhammer-battle-helper-front/`):

```bash
node -e '
const fs = require("fs");
for (const lang of ["en", "pl"]) {
  const p = `src/locales/${lang}/translation.json`;
  const src = JSON.parse(fs.readFileSync(p, "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(src)) out[k === "dnd" ? "srd" : k] = v;
  const gs = {};
  for (const [k, v] of Object.entries(out.gameSystems)) {
    if (k === "dnd5e") gs.srd5 = "SRD 5.2"; else gs[k] = v;
  }
  out.gameSystems = gs;
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
}'
git diff --stat src/locales
```

Expected: diff tylko w `"dnd": {` → `"srd": {` i `gameSystems`. Jeśli diff pokazuje przeformatowanie całego pliku (inne wcięcia / escapowanie), cofnij (`git checkout src/locales`) i zrób te trzy zmiany ręcznie w edytorze w obu plikach.

- [ ] **Step 6: Komentarze i testy poza katalogiem systemu**

- `src/components/log/TruncatedLabel.jsx:16` i `src/components/log/TruncatedLabel.test.jsx:54`: `coc7e/dnd5e` → `coc7e/srd5`.
- `src/systems/custom/CharacterSheet.jsx:452`: `warhammer4e, coc7e i dnd5e.` → `warhammer4e, coc7e i srd5.`
- `src/systems/custom/rolls/CustomWeaponRoll.smoke.test.jsx:79`: `coc7e/dnd5e` → `coc7e/srd5`.
- `src/utils/tokenGeometry.js:50`: `// 'alternating' (5-10-5: every second diagonal step costs 2 — D&D 3.5 style).` → `// 'alternating' (5-10-5: every second diagonal step costs 2).`

- [ ] **Step 7: Uruchom pełną suitę**

Run (z `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`. `registry.labels` i `standaloneRender` iterują `srd5`.

- [ ] **Step 8: Grep kontrolny frontu**

Run: `/usr/bin/grep -rn -E "dnd5e|D&D|DnD5e|\.dnd-|['\`\"]dnd\." src`
Expected: tylko `.dnd-context` w `style.css` (+ ewentualnie `className="dnd-context"` w `DndContext.jsx`, które ten wzorzec nie łapie — OK).

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "refactor: PLAYRPG-266 rename dnd5e frontend system to srd5"
```

---

### Task 5: Atrybucja CC-BY — strona `/licenses` i stopka arkusza

**Files:**
- Create: `src/components/Licenses.jsx`
- Create: `src/components/Licenses.test.jsx`
- Modify: `src/App.js:13,181` (import + trasa)
- Modify: `src/components/Navigation.jsx` (przycisk obok `/privacy`, ~linia 65)
- Modify: `src/systems/srd5/CharacterSheet.jsx` (stopka na końcu `sheetContent`, kontener `.srd-sheet-layout`)
- Create: `src/systems/srd5/CharacterSheet.attribution.test.jsx`
- Modify: `src/style.css` (`.srd-sheet__attribution`)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Produces: `export const SRD_ATTRIBUTION: string` z `components/Licenses.jsx`; trasa `/licenses`; klucze `licenses.title`, `licenses.intro`, `licenses.srdTitle`, `licenses.ccLink`, `navigation.licenses`, `srd.attribution`, `srd.attributionLink`.

- [ ] **Step 1: Zweryfikuj brzmienie notki**

Otwórz oficjalny PDF SRD na https://www.dndbeyond.com/srd (sekcja Legal Information) i porównaj z tekstem w Step 3 słowo w słowo, łącznie z numerem wersji. Licencja SRD zabrania dodawania innych wzmianek o WotC poza tą notką — nigdzie indziej nie wymieniamy WotC.

- [ ] **Step 2: Failing testy**

`src/components/Licenses.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import Licenses, { SRD_ATTRIBUTION } from './Licenses';

describe('Licenses', () => {
  it('shows the verbatim SRD attribution and links the CC-BY licence', () => {
    render(<Licenses />);
    expect(screen.getByText(SRD_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('licenses.ccLink') }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/legalcode');
  });
});
```

`src/systems/srd5/CharacterSheet.attribution.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';

// Same stubs as standaloneRender.test.jsx: the sheet pulls in ESM-only axios.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
}));

/* eslint-disable import/first */
import srd5 from './index';
/* eslint-enable import/first */

it('links the licence page in a new tab, so the game session is not navigated away', () => {
  const character = srd5.normalizeCharacter({ id: 'c1', name: 'Bohater', stats: {} });
  render(
    <srd5.CharacterSheet character={character} onClose={() => {}} onCharacterUpdate={() => {}}
      addLogMessage={() => {}} gameId="g1" token="t" game={{}} isStandalone />
  );
  const link = screen.getByRole('link', { name: i18n.t('srd.attributionLink') });
  expect(link).toHaveAttribute('href', '/licenses');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern='Licenses|attribution'`
Expected: FAIL — `Cannot find module './Licenses'` oraz brak linku w arkuszu.

- [ ] **Step 3: Strona `/licenses`**

`src/components/Licenses.jsx`:

```jsx
import React from 'react';
import { Container, Box, Paper, Typography, Link } from '@mui/material';
import { useTranslation } from 'react-i18next';

// CC-BY-4.0 attribution required by the SRD licence. Reproduced verbatim from the official
// document, so it deliberately bypasses i18n: a translated notice is no longer the notice the
// licence asks for. The licence also forbids any other mention of the publisher — keep it here only.
export const SRD_ATTRIBUTION = 'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

const Licenses = () => {
    const { t } = useTranslation();

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        {t('licenses.title')}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        {t('licenses.intro')}
                    </Typography>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        {t('licenses.srdTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        {SRD_ATTRIBUTION}
                    </Typography>
                    <Link href={CC_BY_URL} target="_blank" rel="noopener noreferrer" variant="body2">
                        {t('licenses.ccLink')}
                    </Link>
                </Paper>
            </Box>
        </Container>
    );
};

export default Licenses;
```

Jeśli Step 1 wykazał inne brzmienie, zaktualizuj `SRD_ATTRIBUTION` i etykiety `srd.attribution` (Step 6) do tej samej wersji.

`src/App.js` — obok importu `PrivacyPolicy` (linia 13):

```js
import Licenses from './components/Licenses';
```

pod trasą `/privacy` (linia 181):

```jsx
                        <Route path="/licenses" element={<Licenses />} />
```

- [ ] **Step 4: Link w nawigacji**

`src/components/Navigation.jsx` — import obok `PolicyIcon`:

```js
import GavelIcon from '@mui/icons-material/Gavel';
```

(dopasuj do stylu importu `PolicyIcon` w tym pliku — jeśli jest named import z `@mui/icons-material`, dodaj `Gavel as GavelIcon` do tej listy).

Bezpośrednio po `IconButton` z `navigate('/privacy')`:

```jsx
                        <IconButton
                            color="inherit"
                            onClick={() => navigate('/licenses')}
                            title={t('navigation.licenses')}
                        >
                            <GavelIcon />
                        </IconButton>
```

- [ ] **Step 5: Stopka w arkuszu SRD**

`src/systems/srd5/CharacterSheet.jsx` — jako ostatnie dziecko `<div className="srd-sheet-layout">` (przed jego zamykającym `</div>`, po bloku z equipment):

```jsx
      {/* CC-BY attribution where the SRD content is used. New tab: the sheet lives inside a
          running session (popup) or a standalone window — navigating in place would leave it. */}
      <p className="srd-sheet__attribution">
        {t('srd.attribution')}{' · '}
        <a href="/licenses" target="_blank" rel="noopener noreferrer">{t('srd.attributionLink')}</a>
      </p>
```

`src/style.css` — obok pozostałych reguł `.srd-sheet__*`:

```css
.srd-sheet__attribution {
  margin: 12px 0 0;
  font-size: 0.7rem;
  color: #7a5c42;
  text-align: center;
}
.srd-sheet__attribution a {
  color: #7a5c42;
  text-decoration: underline;
}
```

- [ ] **Step 6: Tłumaczenia**

`en/translation.json`:
- `navigation.licenses`: `"Licenses"`
- nowy blok top-level `"licenses"`: `{ "title": "Licenses", "intro": "Third-party material used in this app and the licences it is used under.", "srdTitle": "System Reference Document", "ccLink": "Creative Commons Attribution 4.0 International License" }`
- w bloku `srd`: `"attribution": "Includes material from SRD 5.2.1 (CC-BY-4.0)"`, `"attributionLink": "Licenses"`

`pl/translation.json`:
- `navigation.licenses`: `"Licencje"`
- `"licenses"`: `{ "title": "Licencje", "intro": "Materiały zewnętrzne użyte w aplikacji i licencje, na których z nich korzystamy.", "srdTitle": "System Reference Document", "ccLink": "Licencja Creative Commons Uznanie autorstwa 4.0 Międzynarodowa" }`
- w bloku `srd`: `"attribution": "Zawiera materiały z SRD 5.2.1 (CC-BY-4.0)"`, `"attributionLink": "Licencje"`

Uruchom skill `i18n-sync`, by potwierdzić, że en i pl mają te same klucze.

- [ ] **Step 7: Uruchom — PASS**

Run: `CI=true npm test -- --watchAll=false --testPathPattern='Licenses|attribution|standaloneRender'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/Licenses.jsx src/components/Licenses.test.jsx src/App.js src/components/Navigation.jsx src/systems/srd5 src/style.css src/locales
git commit -m "feat: PLAYRPG-266 SRD 5.2 CC-BY attribution page and sheet footer"
```

---

### Task 6: Dokumentacja, grep końcowy, pełne suity

**Files:**
- Modify: `MULTI_SYSTEM_ANALYSIS.md` (żywe wzmianki o `dnd5e` / D&D → `srd5` / SRD 5.2)
- Modify: `docs/superpowers/specs/PLAYRPG-266.md` (wersja notki 5.2.1, dozwolone trafienia grepa)
- Modify: `.claude/agents/fullstack-architect.md` — **bez zmian** (przykład „add D&D 5e” to hipotetyczny prompt użytkownika, nie opis kodu)

- [ ] **Step 1: Docs**

Run: `/usr/bin/grep -n -iE 'dnd5e|D&D' MULTI_SYSTEM_ANALYSIS.md docs/architecture.md CLAUDE.md README.md DEPLOY.md`
Zaktualizuj trafienia opisujące obecny kod (`dnd5e` → `srd5`, „D&D 5e” → „SRD 5.2”). Nie ruszaj „DnD Kit”.

W specu `PLAYRPG-266.md`: w sekcji 4 zmień wersję w oczekiwanej notce na 5.2.1, a w sekcji 5 dopisz do dozwolonych trafień grepa `cmd/migrate-dnd5e-to-srd5/` (skrypt musi znać stary klucz).

W `DEPLOY.md` dopisz jednorazowy krok po deployu PLAYRPG-266:

```
MONGO_URI=... MONGO_DB=... go run ./cmd/migrate-dnd5e-to-srd5/
```

- [ ] **Step 2: Grep końcowy całego repo**

Run (z rootu repo):

```bash
/usr/bin/grep -rn -E "dnd5e|D&D|DnD5e|\.dnd-|['\`\"]dnd\." \
  warhammer-battle-helper-front/src warhammer-battle-helper-backend warhammer-battle-helper-admin/src \
  MULTI_SYSTEM_ANALYSIS.md docs/architecture.md CLAUDE.md README.md DEPLOY.md
```

Expected — dozwolone wyłącznie: `.dnd-context` (dnd-kit) w `style.css`, `cmd/migrate-dnd5e-to-srd5/*` (stary klucz), wpis w `DEPLOY.md` z nazwą skryptu.

- [ ] **Step 3: Pełne suity**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./...`
Expected: PASS.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: PASS poza baseline `App.test.js`.

- [ ] **Step 4: Ręcznie w przeglądarce (lokalny stack)**

1. Na `main` sprzed zmian (lub ręcznym insertem jak w Task 2 Step 5) — gra `dnd5e` z postacią.
2. Nowy kod + `go run ./cmd/migrate-dnd5e-to-srd5/`.
3. Gra otwiera się z arkuszem SRD (nie Warhammera); rzut umiejętności działa.
4. Lobby i kreator gry: „SRD 5.2” w en i pl; pozostałe systemy z dotychczasowymi nazwami.
5. Stopka w popupie arkusza i w oknie standalone; link otwiera `/licenses` w nowej karcie.
6. `/licenses` po wylogowaniu; ikona w nawigacji.

- [ ] **Step 5: Commit**

```bash
git add MULTI_SYSTEM_ANALYSIS.md DEPLOY.md docs/superpowers/specs/PLAYRPG-266.md
git commit -m "docs: PLAYRPG-266 SRD rename notes and deploy step"
```

---

## Wdrożenie (poza planem kodu)

1. Deploy backend + front.
2. Natychmiast: `MONGO_URI=<prod> MONGO_DB=<prod> go run ./cmd/migrate-dnd5e-to-srd5/`.
3. Panel admina → Systems: sprawdź, że `srd5` ma dostęp przeniesiony z `dnd5e`.
