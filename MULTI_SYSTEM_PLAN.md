# Multi-RPG System Support + Call of Cthulhu 7e

## Context

The app is currently hardwired to Warhammer Fantasy Roleplay 4e. The user wants:
- Multiple RPG systems on one instance — GM picks system when creating a game
- Call of Cthulhu 7e as the second system, with full mechanics (Sanity, success tiers)
- Each system has its own **visual CSS theme** AND its own **data config** (characteristics, skills, roll logic)
- Sanity rolls: system rolls d100 vs SAN, displays pass/fail + formula ("1/1d6"), player rolls physical dice and enters loss manually
- Existing Warhammer games must keep working throughout

---

## Critical Files to Modify

| File | Change |
|---|---|
| `backend/internal/models/Character.go` | Replace `CharacteristicRow` struct with `map[string]int`; add `SystemID string`, `SystemData map[string]interface{}` |
| `backend/internal/models/Game.go` | Add `System string` field to `Game` and `CreateGameRequest` |
| `backend/internal/service/GameService.go` | Refactor roll methods to use `RollResolver` interface; add `RollSanity()`; add `loadSkillsForSystem()` |
| `backend/internal/http/GameHandler.go` | Add `RollSanity()` handler |
| `backend/cmd/.../main.go` | Register `CoC7eResolver`; add `POST /games/:id/rollSanity` route |
| `frontend/src/components/CharacterDetailsPanel.jsx` | Replace 10 hardcoded buttons with `useSystem()` loop; inject `CharacterSheetFactory`; gate WFRP-only sections |
| `frontend/src/components/character-sheet/sections/CharacteristicsSection.jsx` | Replace hardcoded `CHARACTERISTICS` const with `useSystem().characteristics` |
| `frontend/src/components/LogWindow.jsx` | Add `sanity` roll type routing; branch `attribute`/`skill` types on `systemId` |
| `frontend/src/components/log/rollUtils.js` | Add CoC success-tier helpers (`getCoCResultColor`, `getCoCResultColorClass`) |
| `frontend/src/components/GameLobby.jsx` | Add system selector MUI `<Select>` in create dialog; show system badge on game cards |
| `frontend/src/locales/en/translation.json` | Add CoC characteristic short-names and `coc.*` strings |

---

## New Files to Create

**Backend:**
- `backend/internal/systems/resolver.go` — `RollResolver` interface + `RollResult`/`WeaponResult` structs
- `backend/internal/systems/wfrp4e.go` — `WFRP4eResolver` (extracts existing roll logic)
- `backend/internal/systems/coc7e.go` — `CoC7eResolver` (new CoC mechanics)
- `backend/internal/data/systems/wfrp4e/skills.json` — copy of current embedded skills.json
- `backend/internal/data/systems/coc7e/skills.json` — 40+ CoC skills with characteristic + baseChance

**Frontend:**
- `frontend/src/systems/index.js` — `SYSTEMS` config; `AVAILABLE_SYSTEMS` export; `getSystem(id)` helper
- `frontend/src/contexts/SystemContext.jsx` — React context + `useSystem()` hook
- `frontend/src/themes/wfrp4e.css` — existing palette extracted to `[data-theme="wfrp4e"]` CSS vars
- `frontend/src/themes/coc7e.css` — 1920s art-deco palette `[data-theme="coc7e"]` CSS vars
- `frontend/src/components/character-sheet/CharacterSheetFactory.jsx` — routes to WFRP or CoC sheet
- `frontend/src/components/character-sheet/coc/CoCCharacterSheet.jsx` — top-level CoC sheet popup
- `frontend/src/components/character-sheet/coc/CoCCharacteristicsSection.jsx` — 8 stats, single row (no Initial/Advances/Current)
- `frontend/src/components/character-sheet/coc/CoCDerivedStatsSection.jsx` — HP, MP, SAN (with Roll SAN button), Luck
- `frontend/src/components/character-sheet/coc/CoCSkillsSection.jsx` — flat skill list with base+advances+total
- `frontend/src/components/character-sheet/coc/CoCSanitySection.jsx` — SAN tracker, insanity status, phobias/manias notes
- `frontend/src/components/character-sheet/coc/CoCWeaponsSection.jsx` — weapons with fixed dice damage + damage bonus
- `frontend/src/components/log/CoCSkillRoll.jsx` — shows tier (Regular/Hard/Extreme/Critical/Fumble)
- `frontend/src/components/log/CoCAttributeRoll.jsx` — same as CoCSkillRoll but for raw characteristics
- `frontend/src/components/log/CoCSanityRoll.jsx` — shows pass/fail + formula + "roll physical dice" prompt
- `frontend/src/data/systems/coc7e/skills.json` — frontend copy of CoC skills
- `frontend/src/locales/en/cocSkills.json` — CoC skill display names

---

## Architecture

### Backend: RollResolver Interface

```go
// internal/systems/resolver.go
type RollResolver interface {
    GetCharacteristicValue(char *models.Character, name string) (int, error)
    ResolveRoll(roll, target int) RollResult
    ParseDamageFormula(formula string, char *models.Character) (int, error)
    GetSystemID() string
}
```

`GameService` gains a `resolvers map[string]RollResolver` field. `RollSkill`/`RollDice`/`RollWeapon` call `loadResolverForGame(gameID)` to pick the right resolver. All broadcast payloads include `"systemId": resolver.GetSystemID()`.

**WFRP4eResolver**: Extracts the existing switch-case characteristic lookup + SL calculation + "SB+4"/"BB+3" damage parsing.

**CoC7eResolver**: d100 roll-under with 5-tier evaluation:
- Critical: roll == 01
- Extreme: roll ≤ skill/5
- Hard: roll ≤ skill/2
- Regular: roll ≤ skill
- Failure: roll > skill
- Fumble: roll 96-100 (or 100 if skill > 50)

`GameService.RollSanity(gameID, characterID, minLossFormula, maxLossFormula string, ...)` — rolls d100 vs `character.SystemData["currentSan"]`, broadcasts `SANITY_ROLLED` with pass/fail + formula. Does NOT deduct SAN (player does it manually).

### Backend: Character Model Migration

`CharacteristicRow` becomes `map[string]int` with a custom `UnmarshalBSONValue` that handles **both** old struct-format BSON documents and new map-format — zero migration scripts needed. Old WFRP documents deserialize transparently.

```go
// New Character fields (additive, backward compatible):
SystemID   string                 `bson:"systemId,omitempty" json:"systemId,omitempty"`
SystemData map[string]interface{} `bson:"systemData,omitempty" json:"systemData,omitempty"`
```

CoC-specific values (currentSan, maxSan, luck, magicPoints, phobias) live in `SystemData`.

### Frontend: System Context

`SystemContext.jsx` exposes a `useSystem()` hook returning:
```js
{
  id: 'coc7e',
  name: 'Call of Cthulhu 7e',
  characteristics: [
    { key: 'STR', longKey: 'STRENGTH' },
    { key: 'CON', longKey: 'CONSTITUTION' },
    { key: 'SIZ', longKey: 'SIZE' },
    { key: 'DEX', longKey: 'DEXTERITY' },
    { key: 'APP', longKey: 'APPEARANCE' },
    { key: 'INT', longKey: 'INTELLIGENCE' },
    { key: 'POW', longKey: 'POWER' },
    { key: 'EDU', longKey: 'EDUCATION' },
  ],
  charMapping: { STRENGTH: 'STR', CONSTITUTION: 'CON', ... }
}
```

Wrapped around `GameSession.jsx` render:
```jsx
<SystemProvider systemId={gameState.system || 'wfrp4e'}>
  <div data-theme={gameState.system || 'wfrp4e'}>
    {/* existing JSX */}
  </div>
</SystemProvider>
```

### Frontend: CSS Themes

CSS variables scoped by `data-theme` attribute on the game session root div. Both theme files imported in `App.js` (selectors prevent conflicts).

`wfrp4e.css` — gothic parchment (existing palette extracted into variables)
`coc7e.css` — 1920s art-deco: dark mahogany `#3d2b1f`, aged paper `#f5f0e8`, bronze borders `#8b7355`

Roll result colors are **identical across themes** per CLAUDE.md: gold/green/red/purple.

### Frontend: Character Sheet Factory

```jsx
// CharacterSheetFactory.jsx
const system = useSystem();
switch (system.id) {
  case 'coc7e':  return <CoCCharacterSheet {...props} />;
  default:       return <CharacterSheetPopup {...props} />;  // untouched WFRP sheet
}
```

`CharacterDetailsPanel.jsx` imports `CharacterSheetFactory` instead of `CharacterSheetPopup`.

### Frontend: CoC Character Sheet Structure

`CoCCharacterSheet` mirrors `CharacterSheetPopup` structure but uses these sections:
- `CoCCharacteristicsSection` — 8 stats in single-row table (no Initial/Advances/Current)
- `CoCDerivedStatsSection` — HP `(CON+SIZ)/10`, MP `POW/5`, SAN (with **Roll SAN** button), Luck
- `CoCSkillsSection` — flat list: skill name | characteristic | base chance | advances | total
- `CoCSanitySection` — SAN loss tracking, insanity status (5+ in one roll = Temporary; 1/5 in session = Indefinite), phobias notes
- `CoCWeaponsSection` — name | skill | damage dice | range
- Reuses: `useAutoSave` hook (unchanged), `DraggablePopup` if it exists

### Frontend: CoC Log Components

CoC success tiers use same 4-color scheme (CLAUDE.md):
- Critical (01) → gold
- Extreme/Hard/Regular Success → green
- Failure → red
- Fumble → purple

`CoCSanityRoll.jsx` displays:
- `SAN` token
- "Rolled 45 vs SAN 62 — Formula: 1/1d6"
- "PASSED — lose at least 1 SAN (roll physical dice)" OR "FAILED — lose up to 1d6 SAN (roll physical dice)"

`LogWindow.jsx` routes on `data.rollType`:
- `'sanity'` → `CoCSanityRoll`
- `'skill'` with `data.systemId === 'coc7e'` → `CoCSkillRoll`
- `'attribute'` with `data.systemId === 'coc7e'` → `CoCAttributeRoll`
- All existing paths unchanged

---

## Phased Delivery (Warhammer always working)

### Phase 1 — Backend Foundation
1. Add `System string` to `Game` + `CreateGameRequest` (additive)
2. Add `SystemID`, `SystemData` to `Character` (additive)
3. Migrate `CharacteristicRow` to `map[string]int` with backward-compat BSON unmarshaller
4. Create `internal/systems/` package with `RollResolver` interface + `WFRP4eResolver`
5. Move `skills.json` to `internal/data/systems/wfrp4e/skills.json`; update embed
6. Refactor `RollDice`/`RollSkill`/`RollWeapon` to use resolver; add `systemId` to all broadcast payloads
7. **Verify**: All existing WFRP rolls work; no DB migration needed

### Phase 2 — Frontend Abstraction
1. Create `src/systems/index.js` with WFRP definition
2. Create `SystemContext.jsx`
3. Wrap `GameSession.jsx` with `<SystemProvider>` + `data-theme` div
4. Refactor `CharacterDetailsPanel.jsx` buttons to use `useSystem()`
5. Refactor `CharacteristicsSection.jsx` to use `useSystem()`
6. Create `CharacterSheetFactory.jsx` (routes to existing WFRP sheet only for now)
7. Add system selector to `GameLobby.jsx`; add system badge on game cards
8. Add `rollUtils.js` CoC helpers (non-breaking additions)
9. Create `wfrp4e.css` and `coc7e.css` theme files
10. **Verify**: Existing WFRP games render identically; game creation shows system picker

### Phase 3 — CoC Backend
1. Create `internal/data/systems/coc7e/skills.json`
2. Create `CoC7eResolver` with 5-tier success evaluation
3. Add `GameService.RollSanity()` + `GameHandler.RollSanity()` + route `POST /games/:id/rollSanity`
4. Register `CoC7eResolver` in `main.go`
5. **Verify**: Create CoC game, roll skills, sanity roll broadcasts correctly

### Phase 4 — CoC Frontend
1. Create `src/data/systems/coc7e/skills.json`
2. Add CoC entry to `SYSTEMS` config
3. Create all `components/character-sheet/coc/` components
4. Wire `CharacterSheetFactory` to serve `CoCCharacterSheet` for CoC games
5. Create `CoCSkillRoll.jsx`, `CoCAttributeRoll.jsx`, `CoCSanityRoll.jsx`
6. Update `LogWindow.jsx` with systemId-based routing
7. Add CoC translations; create `locales/en/cocSkills.json`; register namespace in `i18n.js`
8. **Verify**: Full CoC game end-to-end — character sheet, skill rolls, sanity rolls

---

## Verification

1. **WFRP regression**: Create WFRP game → place character → roll skills/weapon from CharacterDetailsPanel → log shows WFRP SL-based results (unchanged)
2. **CoC character sheet**: Create CoC game → create character → open sheet → check 8 stats display, HP/MP/SAN derive correctly
3. **CoC skill roll**: Roll a CoC skill → LogWindow shows success tier label (e.g. "Extreme Success") in green
4. **Sanity roll**: Roll SAN from CoC sheet → LogWindow shows "PASSED — lose at least 1 SAN (roll physical dice)" with formula
5. **CSS themes**: WFRP game = gothic parchment palette; CoC game = 1920s art-deco palette
6. **System persistence**: Refresh page mid-game → correct system/theme reapplied from `game.system` field
7. **MongoDB compat**: Load existing WFRP character (old struct-format BSON) → characteristics parse correctly via custom unmarshaller
