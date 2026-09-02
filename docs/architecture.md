# Architektura systemu — Warhammer Battle Helper

> Ostatnia aktualizacja: 2026-03-03

## Stack

| Warstwa | Technologia |
|---------|-------------|
| Backend | Go + Gin, MongoDB, gorilla/websocket |
| Frontend | React 18, DnD Kit, i18next, MUI (minimalnie), vanilla CSS BEM |
| Baza danych | MongoDB — single embedded document per Game |
| Storage | Lokalny filesystem (avatars, user-files, music-files) |
| Auth | JWT (Bearer token) |

---

## Modele danych

### `Character` (`internal/models/Character.go`)
```go
type Character struct {
    ID         primitive.ObjectID
    GameID     primitive.ObjectID
    GameSystem string               // "warhammer4e" | "coc7e"
    CreatedBy  primitive.ObjectID
    VisibleTo  []primitive.ObjectID
    IsNPC      bool
    Name       string               // display na siatce
    Avatar     string
    Stats      bson.Raw             // system-specyficzne dane jako BSON
    States     []CharacterState     // kondycje/stany
    CreatedAt  time.Time
}
```
Posiada customowy `MarshalJSON()` — bson.Raw jest serializowany jako Extended JSON.

### `Game` (`internal/models/Game.go`) — wszystko embedded
```
Game
├── ID, Name, GameSystem ("warhammer4e"|"coc7e"), Status
├── GameMasterID, Participants []GameParticipant (role: gm|player)
├── Characters []GameCharacter (pozycje na siatce — wszystkie sceny)
├── Events []GameEvent (logi: move, dice_roll, message)
├── Handouts, HandoutFolders
└── Scenes []Scene
    ├── ID, Name, GridWidth, GridHeight, GridVisible
    ├── Images []SceneImage (layer: "background"|"gm")
    ├── Characters []GameCharacter (pozycje na tej scenie)
    ├── AssignedPlayers []primitive.ObjectID
    ├── FogEnabled
    ├── RevealPaths []FogPath     ← fog of war
    └── DrawingPaths []DrawingPath ← drawing layer
```

### `FogPath`
```go
type FogPath struct {
    Points    [][2]float64  // współrzędne w space sceny (nie piksele ekranu)
    BrushSize float64
    Shape     string        // "freehand" | "rect"
    Cover     bool          // true=dodaj mgłę, false=odkryj
}
```

### `DrawingPath`
```go
type DrawingPath struct {
    ID        primitive.ObjectID
    UserID    primitive.ObjectID
    Tool      string        // freehand|line|rect|circle|arrow|text
    Points    [][2]float64
    BrushSize float64
    Color     string        // hex
    Text      string
    FontSize  float64
}
```

---

## Plugin pattern — systemy gry

### Interface (`internal/systems/interface.go`)
```go
type RollResult struct {
    RollType      string  // "skill"|"weapon"|"attribute"|"sanity"
    CharacterID   string
    CharacterName string
    Username      string
    Roll          int
    Target        int
    Outcome       string  // "critical_success"|"extreme_success"|"hard_success"|"regular_success"|"failure"|"fumble"
    SuccessLevel  int     // SL dla Warhammera; 0 dla CoC
    SkillKey      string
    SkillName     string
    Modifier      int
    WeaponName    string
    Damage        string
    DamageRoll    int
    SanLoss       string  // CoC only
    SanLossResult int     // CoC only
}

type GameSystem interface {
    RollSkill(stats bson.Raw, skillKey string, modifier int) (*RollResult, error)
    RollWeapon(stats bson.Raw, weaponName, weaponSkill, damage string, modifier int) (*RollResult, error)
    ComputeDerived(stats bson.Raw) (bson.Raw, error)
    DefaultStats() (bson.Raw, error)
}
```

### Registry (`internal/systems/registry/registry.go`)
```go
var registry = map[string]systems.GameSystem{
    "warhammer4e": warhammer4e.New(),
    "coc7e":       coc7e.New(),
}
func Get(gameSystem string) (systems.GameSystem, error)
```

### Warhammer 4e (`internal/systems/warhammer4e/`)
- `roller.go`: `RollSkill`, `RollWeapon`, `ComputeDerived`, `rollD100`, `rollDamage`
- `character.go`: `Stats` struct (Characteristics, BasicSkills, AdvancedSkills, Talents, Wounds, Movement...)
- `skills.json`: definicje umiejętności z przypisaniem do charakterystyk
- Formuła ran: `SB + 2×TB + WPB + Hardy(TB × timesTaken)`
- Klucze atrybutów: `attr_WS`, `attr_BS`, `attr_S`, `attr_T`, `attr_I`, `attr_Ag`, `attr_Dex`, `attr_Int`, `attr_WP`, `attr_Fel`

### CoC 7e (`internal/systems/coc7e/`)
- `roller.go`, `character.go`
- Stopnie sukcesu: Critical(01) / Extreme(≤skill/5) / Hard(≤skill/2) / Regular(≤skill%) / Failure / Fumble(100)

### Frontend registry (`src/systems/registry.js`)
```js
const systems = { warhammer4e, coc7e };
export function getSystem(gameSystem) {
    return systems[gameSystem] || warhammer4e; // fallback dla old data
}
```
Każdy moduł systemu eksportuje: `{ CharacterSheet, CharacterDetails, rolls: { SkillRoll, WeaponRoll, ... } }`

---

## Warstwy backendu

```
HTTP Handler → Service → Repository → MongoDB
               ↓
           hub.BroadcastToGame(gameID, "EVENT_TYPE", payload)
               ↓
           Wszyscy klienci WS w grze otrzymują event
```

### Wzorzec aktualizacji MongoDB
Głównie `$push/$pull/$set` z `arrayFilters` dla zagnieżdżonych tablic:
```go
filter := bson.M{"_id": gameObjID, "scenes._id": sceneObjID}
update := bson.M{"$push": bson.M{"scenes.$.revealPaths": fogPath}}
```

---

## WebSocket

**Hub**: `internal/websocket/hub.go` — `BroadcastToGame(gameID, eventType, payload)`

### Typy zdarzeń
| Event | Kiedy |
|-------|-------|
| `CHARACTER_UPDATED` | Update/clone postaci |
| `CHARACTER_VISIBILITY_UPDATED` | Zmiana widoczności |
| `FOG_TOGGLED` | Włącz/wyłącz mgłę |
| `FOG_PATH_ADDED` | Dodanie pędzla mgły |
| `FOG_PATH_REMOVED` | Undo ostatniego pędzla |
| `FOG_CLEARED` | Wyczyszczenie mgły |
| `DRAWING_PATH_ADDED` | Dodanie rysunku |
| `DRAWING_PATH_REMOVED` | Usunięcie rysunku |
| `DRAWING_CLEARED` | Wyczyszczenie rysunków |
| `SCENE_CREATED/UPDATED/DELETED` | Operacje na scenach |
| `GAME_UPDATED` | Ogólna aktualizacja gry |
| `MUSIC_STATE_CHANGED` | Zmiana stanu muzyki |
| `POINTER_PING` | Wskaźnik GM na siatce |

**Frontend**: `useWebSocket.js` hook → każdy event triggeruje `fetchGameState()` (full refetch).

---

## API Endpoints (najważniejsze)

```
Auth:            POST /register, POST /login
Games:           GET/POST /games, GET /games/:id
Characters:      GET/POST /games/:id/characters
                 PUT/DELETE /games/:id/characters/:charId
                 POST /games/:id/characters/:charId/clone
                 PUT /games/:id/characters/:charId/visibility
Rolls:           POST /games/:id/roll         (plain dice, anonimowy)
                 POST /games/:id/rollSkill    (skill/attr test, JWT)
                 POST /games/:id/rollWeapon   (weapon attack, JWT)
Scenes:          GET/POST /games/:id/scenes
                 PUT/DELETE /games/:id/scenes/:sceneId
                 POST /games/:id/scenes/:sceneId/characters
                 PUT /games/:id/scenes/:sceneId/characters/move
                 POST/DELETE /games/:id/scenes/:sceneId/images/:imageId
Fog:             PATCH /games/:id/scenes/:sceneId/fog   (toggle)
                 POST /games/:id/scenes/:sceneId/fog/path
                 DELETE /games/:id/scenes/:sceneId/fog/paths
                 DELETE /games/:id/scenes/:sceneId/fog/path/last
Drawing:         POST /games/:id/scenes/:sceneId/drawing/path
                 DELETE /games/:id/scenes/:sceneId/drawing/path/last
                 DELETE /games/:id/scenes/:sceneId/drawing/path/:pathId
                 DELETE /games/:id/scenes/:sceneId/drawing/paths
Avatars:         POST /avatars, GET /avatars/:filename
User Files:      GET/POST /files, DELETE /files/:fileId, GET /user-files/:filename
Music:           GET/POST /music, DELETE /music/:musicId, GET /music-files/:filename
                 POST/PUT/DELETE /playlists/:playlistId
                 POST /games/:id/music/play|pause|stop|volume
WebSocket:       GET /games/:id/ws
```

---

## Frontend — kluczowe komponenty

### Stan gry (`GameSession.jsx`)
```js
gameState          // pełny dokument Game z backendu
editingLayer       // 'grid' | 'fog' | 'drawing'
drawingTool        // freehand|line|rect|circle|arrow|text
drawingColor, brushSize, drawingFontSize
musicState         // { trackId, isPlaying, volume }
```

### Warstwy sceny (`SceneViewport.jsx`)
```
SceneViewport (CSS zoom container)
├── SceneImage (tło, zIndex 5)
├── SceneLayer (siatka + postacie, zIndex 10)
├── FogLayer (canvas destination-out, zIndex 20)
├── DrawingLayer (canvas source-over, zIndex 25)
└── DrawingToolbar (floating, zIndex 40)
```

### Roll hooks (`character-sheet/hooks/useRollActions.js`)
- `handleCharacteristicClick` → `isSkill: true, skillKey: attr_${charName}` → `rollSkill`
- `handleSkillClick` → `isSkill: true, skillKey` → `rollSkill`
- Oba routują przez `POST /games/:id/rollSkill`

### Karta postaci Warhammer (`character-sheet/sections/`)
13 sekcji: CharacterInfo, Characteristics, BasicSkills, AdvancedSkills, WeaponSkills,
MagicSkills, Talents, Weapons, ArmourPoints, Armour, Spells, Wealth, ResourceBoxes, Notes

### Log komponentów (`components/log/`)
`AttributeRoll`, `SkillRoll`, `WeaponRoll`, `FightResult`, `SimpleDiceRoll`, `SimpleMessage`

---

## Konwencje i pułapki

1. **`ComputeDerived` musi być wywołane na GET** — nie tylko Create/Update/Clone
2. **`bson.Raw` Stats** — brak pól Warhammer w modelu Character; CustomMarshalJSON wymagany
3. **Koordynaty Fog/Drawing** — przechowywane w space sceny, nie w pikselach ekranu
4. **Roll klucze**: `attr_WS` (charakterystyki) vs `MELEE_BASIC` (umiejętności) vs custom key
5. **Brak backward compat** — nie trzeba obsługiwać starych danych
6. **WS full refetch** — frontend nie merguje delta, zawsze `fetchGameState()` po evencie
7. **GM vs Player** — GM widzi wszystkie postacie; player tylko te w `VisibleTo`
8. **Sceny są embedded** — `Game.Scenes[i].DrawingPaths` itp., nie osobna kolekcja
