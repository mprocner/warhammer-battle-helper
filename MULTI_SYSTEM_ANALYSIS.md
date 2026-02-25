# Multi-RPG System Support - Architecture Analysis

## Context

The Warhammer Battle Helper is currently tightly coupled to Warhammer Fantasy 4e rules. The goal is to support **simultaneous** multi-system gameplay (Warhammer, Call of Cthulhu 7e, D&D 5e/Pathfinder) on the same instance. Users should be able to create games under different RPG systems, each with its own character sheets, dice mechanics, and skill structures. Scenes, music, handouts, and file management are system-agnostic and will be reused as-is.

---

## System Comparison: Why This Is Non-Trivial

| Feature | Warhammer 4e | Call of Cthulhu 7e | D&D 5e |
|---|---|---|---|
| **Dice** | d100 (roll-under) | d100 (roll-under) | d20 (roll-over) |
| **Characteristics** | 10 (WS,BS,S,T,I,Ag,Dex,Int,WP,Fel) | 8 (STR,CON,SIZ,DEX,APP,INT,POW,EDU) | 6 (STR,DEX,CON,INT,WIS,CHA) |
| **Success** | Roll <= target | Roll <= skill% | Roll + mod >= DC |
| **Critical** | Doublets (11,22...99,100) | 01 always critical | Natural 20 |
| **Fumble** | Doublet + failure | 100 (or 96-100 if skill<50) | Natural 1 |
| **Success Levels** | SL = target/10 - roll/10 | Regular/Hard(half)/Extreme(fifth) | Binary pass/fail |
| **Skills** | Characteristic + advances | Flat percentage (0-99%) | Proficiency bonus + ability mod |
| **Damage** | SB+weapon+SL | Weapon dice + damage bonus | Weapon dice + ability mod |
| **HP System** | Wounds (SB+TB+WPB) | HP (CON+SIZ based) | Hit Dice per level |
| **Unique Mechanic** | Armour by location | Sanity / Luck | Advantage/Disadvantage |
| **Talents/Feats** | Talents (times taken) | None (occupation-based) | Feats (optional rule) |
| **Armour** | Location-based AP | Single DR value | AC (single value) |
| **Currency** | Brass/Silver/Gold pennies | 1920s dollars/pounds | CP/SP/GP/PP |

---

## Part 1: What Can Be REUSED As-Is (No Changes Needed)

These components are already system-agnostic (~60% of the codebase):

### Frontend
- **Scene/Battle Map system** (`components/scene/`) - grid, tokens, images, zoom
- **Music player** and playlist management
- **Handouts/Documents** system
- **File management** (upload, folders, file browser in `FilesTab`)
- **Game Lobby** (`GameLobby.jsx`) - creating/joining games (needs minor addition: system selector)
- **WebSocket hook** (`useWebSocket.js`) - real-time communication
- **Avatar upload** (`AvatarUpload.jsx`)
- **i18n infrastructure** (`locales/`) - translation system itself
- **API layer** (`api/axios.js`)
- **General layout** - panels, tabs, drag/resize patterns

### Backend
- **Authentication** (`AuthHandler.go`, JWT) - completely system-agnostic
- **User management** (`UserRepository.go`) - files, folders, music
- **WebSocket hub** (`hub.go`) - message broadcasting
- **Scene management** (`SceneHandler.go`) - battle maps, images, grid
- **Handout management** - upload, reorder, display
- **File storage** (`storage/`) - local file serving
- **Music management** - tracks, playlists, playback state
- **Game session lifecycle** - create, join, leave, participants

---

## Part 2: What Needs ABSTRACTION (Core Architecture Changes)

### 2.1 Game System Definition Layer (NEW)

**What:** A configuration/definition layer that describes each RPG system's rules.

**Where:**
- Backend: new `internal/systems/` package with per-system configs
- Frontend: new `src/systems/` directory with per-system definitions
- Database: `Game` model needs a `system` field

**Each system definition would include:**
```
SystemDefinition {
    id: "warhammer4e" | "coc7e" | "dnd5e"
    name: "Warhammer Fantasy 4e"
    characteristics: [{ key, shortLabel, fullName }]
    skillStructure: { type, categories, linkedToCharacteristic }
    rollMechanics: { diceType, successCondition, criticalCondition, fumbleCondition }
    damageFormula: { type, variables }
    characterSheetSections: [which sections to show]
    dataFiles: { skills, talents, weapons, armour }
}
```

### 2.2 Character Model Refactoring

**Current problem:** `CharacteristicRow` struct has 10 hardcoded fields (WS, BS, S, T...).

**File:** `internal/models/Character.go`

**Change:** Replace fixed struct with dynamic map:
```go
// Before (hardcoded)
type CharacteristicRow struct {
    WS, BS, S, T, I, Ag, Dex, Int, WP, Fel int
}

// After (dynamic)
type CharacteristicRow map[string]int  // {"STR": 50, "DEX": 65, ...}
```

**Also change:**
- `Wounds` struct - different systems calculate HP differently
- `ArmourPoints` struct - CoC/D&D don't use location-based armour
- `Wealth` struct - different currency systems
- Add `SystemID string` field to `Character` model

### 2.3 Roll Mechanics Abstraction

**Current problem:** `GameService.go` hardcodes d100 roll-under logic, SL calculation, doublet detection.

**Files to change:**
- `internal/service/GameService.go` (lines ~500-700 - roll logic)
- `internal/service/Roll.go`
- `warhammer-battle-helper-front/src/components/log/rollUtils.js`

**What's needed:**
- Backend: A `RollResolver` interface per system that takes (roll, target, modifiers) and returns a standardized result
- Frontend: `rollUtils.js` needs to branch on system type for color coding and display logic

**Roll result structure should be standardized:**
```
RollResult {
    rollValue: number
    targetValue: number
    success: boolean
    criticalSuccess: boolean
    criticalFailure: boolean
    successLevel: number | null      // Warhammer SL, null for D&D
    successTier: string | null       // CoC: "regular"/"hard"/"extreme", null for others
    damage: number | null
    systemSpecific: {}               // any extra system-specific data
}
```

### 2.4 Skill System Abstraction

**Current problem:** Skills are loaded from embedded `skills.json` (Warhammer-only), with hardcoded basic/advanced/grouped/magic categorization.

**Files to change:**
- `internal/data/skills.json` -> per-system skill files
- `internal/service/GameService.go` (skill lookup logic)
- `warhammer-battle-helper-front/src/data/skills.json`
- `CharacterSheetPopup.jsx` (skill rendering, ~800 lines of skill-related code)

**What's needed:**
- Per-system skill definition files
- Skill value calculation varies: Warhammer (char + advances), CoC (flat %), D&D (proficiency + ability mod)
- Skill categories vary: Warhammer (basic/advanced/magic), CoC (flat list), D&D (ability-grouped)

### 2.5 Character Sheet UI

**Current problem:** `CharacterSheetPopup.jsx` (2768 lines) and `CharacterDetailsPanel.jsx` are entirely Warhammer-specific.

**Recommended approach: System-specific sheet components with shared sub-components**
- `CharacterSheet_Warhammer.jsx`, `CharacterSheet_CoC.jsx`, `CharacterSheet_DnD.jsx`
- A wrapper that loads the right one based on game system
- Shared atomic UI components: editable fields, skill rows, dice buttons, stat displays
- This avoids over-abstraction while preventing duplication of basic UI elements
- Each system gets a tailored sheet, but unique mechanics (CoC Sanity, D&D spell slots) are handled naturally

### 2.6 Log/Roll Display Components

**Current problem:** `AttributeRoll.jsx`, `SkillRoll.jsx`, `WeaponRoll.jsx` assume Warhammer roll structure (SL, doublets, SB damage).

**Files to change:**
- `components/log/AttributeRoll.jsx`
- `components/log/SkillRoll.jsx`
- `components/log/WeaponRoll.jsx`
- `components/log/FightResult.jsx`
- `components/log/rollUtils.js`
- `components/log/WaxSealToken.jsx`

**What's needed:**
- Roll display components need to handle different result structures
- Color logic (gold/green/red/purple) works for all systems - can stay
- Success level display differs: SL number (Warhammer), tier label (CoC), pass/fail (D&D)
- Damage display differs per system

### 2.7 Characteristic Buttons (Quick Panel)

**Current problem:** `CharacterDetailsPanel.jsx` lines 533-624 hardcode 10 Warhammer characteristic buttons.

**Change:** Generate buttons dynamically from system definition's characteristic list. Same click -> roll flow, just different characteristics per system.

---

## Part 3: What Needs NEW System-Specific Implementation

### 3.1 Call of Cthulhu Specific
- **Sanity system** - Sanity points, Sanity rolls, going insane
- **Luck mechanic** - spendable Luck points to modify rolls
- **Skill improvement** - check-based advancement (mark skills used, roll for improvement)
- **Occupation system** - instead of careers/talents
- **Damage bonus** - derived from STR+SIZ table lookup
- **Success tiers** - Regular (<=skill), Hard (<=skill/2), Extreme (<=skill/5)
- **Opposed rolls** - compare success tiers, not SL

### 3.2 D&D 5e Specific
- **Ability scores + modifiers** - (score - 10) / 2
- **Proficiency bonus** - level-based, applied to proficient skills/attacks
- **Advantage/Disadvantage** - roll 2d20, take higher/lower
- **Saving throws** - per-ability, with proficiency
- **Spell slots** - level-based resource tracking
- **Class features** - very different from talents
- **AC system** - single defense number (not location-based)
- **Initiative** - DEX-based, determines turn order
- **Hit dice** - per-class, for healing during rests
- **Conditions** - partially overlaps with Warhammer states (can reuse `CharacterState` model)

### 3.3 Per-System Data Files Needed
Each system needs its own:
- `skills.json` - skill definitions
- `weapons.json` - weapon stats
- `armour.json` - armour stats
- Optionally: `talents.json` / `feats.json` / `occupations.json`
- Translation keys in `locales/`

---

## Part 4: Recommended Implementation Order

### Phase 1: Foundation (Backend + Data Model)
1. Add `system` field to `Game` and `Character` models
2. Create `internal/systems/` package with system definition interface
3. Implement Warhammer system definition (extract current hardcoded values)
4. Refactor `CharacteristicRow` from struct to `map[string]int`
5. Refactor roll handlers to use system-aware logic via `RollResolver` interface
6. Ensure existing Warhammer functionality works identically after refactor

### Phase 2: Frontend Abstraction
1. Create `src/systems/` with system definitions (characteristics, skill categories)
2. Add system selector to game creation flow
3. Refactor `CharacterDetailsPanel.jsx` - dynamic characteristic buttons
4. Refactor `rollUtils.js` - system-aware success/color logic
5. Refactor roll display components to handle generic result structure
6. Verify Warhammer still works perfectly

### Phase 3: Second System (Call of Cthulhu)
1. Create CoC system definition (backend + frontend)
2. Create CoC skill/weapon data files
3. Implement CoC roll resolver (success tiers, fumble rules)
4. Build CoC character sheet component
5. Add Sanity system (CoC-specific section)
6. Add CoC-specific log display formatting
7. Add CoC translations

### Phase 4: Third System (D&D 5e)
1. Create D&D system definition
2. Implement d20 roll resolver (roll-over, advantage/disadvantage)
3. Build D&D character sheet component
4. Add ability modifier calculation, proficiency system
5. Add spell slot tracking
6. Add D&D translations

---

## Part 5: Key Files That Need Modification

### Backend (Go)
| File | Change | Impact |
|---|---|---|
| `internal/models/Character.go` | Dynamic characteristics, flexible wounds/armour | HIGH |
| `internal/models/Game.go` | Add `System` field | LOW |
| `internal/service/GameService.go` | Abstract roll logic, system-aware skill lookup | HIGH |
| `internal/service/Roll.go` | Support multiple dice types | MEDIUM |
| `internal/data/skills.json` | Move to per-system data loading | MEDIUM |
| `internal/http/GameHandler.go` | Pass system context to service | LOW |
| `cmd/warhammer-battle-helper/main.go` | No structural changes needed | NONE |

### Frontend (React)
| File | Change | Impact |
|---|---|---|
| `CharacterSheetPopup.jsx` (2768 lines) | Split into system-specific sheets with shared components | HIGH |
| `CharacterDetailsPanel.jsx` | Dynamic characteristics, system-aware rolls | HIGH |
| `rollUtils.js` | System-aware success/critical/color logic | MEDIUM |
| `AttributeRoll.jsx`, `SkillRoll.jsx`, `WeaponRoll.jsx` | Generic result display | MEDIUM |
| `LogWindow.jsx` | Minor - just routes to correct display component | LOW |
| `GameLobby.jsx` | Add system selector dropdown | LOW |
| `GameSession.jsx` | Load system definition, pass as context | LOW |
| `data/skills.json`, `talents.json`, etc. | Move under system-specific directories | LOW |

### Files That Need NO Changes
- All scene components (`components/scene/`)
- Music components and backend handlers
- Handout system
- File management
- Authentication system
- WebSocket infrastructure
- Avatar upload
- i18n framework (just add new translation keys)

---

## Part 6: Risks and Considerations

1. **CharacterSheetPopup.jsx is 2768 lines** - This is the hardest refactoring target. Consider splitting it into smaller components first (even within Warhammer) before adding multi-system support.

2. **MongoDB schema migration** - Changing `CharacteristicRow` from struct to map requires migrating existing character documents. Plan a migration script.

3. **Backward compatibility** - Existing Warhammer games and characters must continue working. The `FlexInt` type already handles some schema flexibility - similar patterns may help.

4. **D&D is fundamentally different** - d20 roll-over vs d100 roll-under is a bigger gap than Warhammer-to-CoC. The roll result display will need more variation.

5. **Naming** - The app is called "Warhammer Battle Helper". Supporting multiple systems may warrant a name change (e.g., "RPG Battle Helper" or "Tabletop Helper").

6. **Scope creep** - Each RPG system has deep mechanics. Decide upfront which features per system are in scope (basic rolls + character sheet) vs out of scope (full combat automation, spell databases, etc.).