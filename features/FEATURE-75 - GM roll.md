# FEATURE-75: GM Roll Visibility

---

## Opis funkcjonalności

Nad przyciskami kości w panelu logu pojawia się globalny select z 3 opcjami widoczności rzutu:

| Opcja | Kto widzi wynik |
|-------|----------------|
| **Wszyscy** *(domyślne)* | Wszyscy uczestnicy gry |
| **MG + Gracz** | Tylko MG + gracz, który rzucał |
| **Tylko MG** | Wyłącznie MG |

**Ważne zachowania:**
- Wybór widoczności jest "sticky" — utrzymuje się do czasu zmiany przez użytkownika
- Nieautoryzowani gracze widzą **ciszę** — żadnego sygnału że rzut nastąpił
- Dotyczy wszystkich typów rzutów: kości, skill, atrybut, broń (Warhammer4e i CoC7e)
- Ukryte rzuty mają ikonę kłódki (🔒) w logu MG
- Filtrowanie działa też po odświeżeniu strony — historyczne ukryte rzuty są filtrowane przy `GET /games/:id`

---

## Dokumentacja techniczna

### Architektura — przepływ danych

```
Frontend select → rollVisibility state (GameSession)
    ↓ prop drilling
LogWindow / CharacterDetailsPanel / CharacterSheet
    ↓ { visibility } w body requesa
POST /rollDice | /rollSkill | /rollWeapon
    ↓
GameHandler → GameService.RollXxx(visibility)
    ↓ zapis do DB
GameEvent { Visibility, RollerUserID }
    ↓ broadcast warunkowy
BroadcastToUsers([gmId]) | BroadcastToUsers([gmId, rollerId]) | BroadcastToGame
    ↓ tylko uprawnieni klienci
handleWebSocketMessage → addLogMessage
    ↓
LogWindow render + ikona kłódki gdy visibility != "all"
```

**Odświeżenie strony:**
```
fetchGameState() → GET /games/:id
    ↓ userID z JWT
GameService.GetByIDForUser(id, userID)
    ↓ filtruje Game.Events wg Visibility + RollerUserID
Zwraca tylko eventy które user ma prawo widzieć
```

---

### Backend

#### `internal/models/Game.go`
Dodać pola do `GameEvent`:
```go
type GameEvent struct {
    ID           primitive.ObjectID     `bson:"_id,omitempty" json:"id"`
    Type         EventType              `bson:"type" json:"type"`
    Data         map[string]interface{} `bson:"data" json:"data"`
    CreatedBy    primitive.ObjectID     `bson:"createdBy" json:"createdBy"`
    Username     string                 `bson:"username" json:"username"`
    Visibility   string                 `bson:"visibility" json:"visibility"`
    RollerUserID primitive.ObjectID     `bson:"rollerUserId" json:"rollerUserId"`
    CreatedAt    time.Time              `bson:"createdAt" json:"createdAt"`
}
```
Stare eventy bez `Visibility` mają domyślnie pusty string → traktowane jak "all".

#### `internal/websocket/hub.go`
Nowa metoda obok `BroadcastToGame`:
```go
func (h *Hub) BroadcastToUsers(gameID, messageType string, payload map[string]interface{}, userIDs []string) {
    message := Message{Type: messageType, GameID: gameID, Payload: payload}
    msg, err := json.Marshal(message)
    if err != nil { return }
    targetSet := make(map[string]bool)
    for _, id := range userIDs { targetSet[id] = true }
    h.mu.RLock()
    defer h.mu.RUnlock()
    for client := range h.Games[gameID] {
        if targetSet[client.ID.Hex()] {
            select { case client.Send <- msg: default: }
        }
    }
}
```

#### `internal/http/GameHandler.go`
W każdym z 3 handlerów (RollDice, RollSkill, RollWeapon) — wyciągnąć `visibility` z body i przekazać do serwisu. Default: `"all"` jeśli puste.

Dodać filtrowanie eventów w GetGame (lub dedykowana funkcja serwisu):
```go
requestingUserID := // z JWT claims
filteredEvents := []models.GameEvent{}
for _, e := range game.Events {
    switch e.Visibility {
    case "gm_only":
        if requestingUserID == game.GameMasterID { filteredEvents = append(filteredEvents, e) }
    case "gm_and_roller":
        if requestingUserID == game.GameMasterID || requestingUserID == e.RollerUserID {
            filteredEvents = append(filteredEvents, e)
        }
    default: // "all" lub stare eventy
        filteredEvents = append(filteredEvents, e)
    }
}
game.Events = filteredEvents
```

#### `internal/service/GameService.go`
Dodać helper `broadcastRoll` i użyć go we wszystkich 3 roll functions:
```go
func (s *GameService) broadcastRoll(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID) {
    switch visibility {
    case "gm_only":
        s.hub.BroadcastToUsers(gameID, eventType, payload, []string{gmID.Hex()})
    case "gm_and_roller":
        targets := []string{gmID.Hex()}
        if rollerID != gmID { targets = append(targets, rollerID.Hex()) }
        s.hub.BroadcastToUsers(gameID, eventType, payload, targets)
    default:
        s.hub.BroadcastToGame(gameID, eventType, payload)
    }
}
```

Każda roll function dostaje parametr `visibility string`, zapisuje go do `GameEvent.Visibility` i używa `broadcastRoll` zamiast `BroadcastToGame`.

---

### Frontend

#### `src/components/GameSession.jsx`
```js
const [rollVisibility, setRollVisibility] = useState('all');
```
Przekazać jako props do: `LogWindow`, `CharacterDetailsPanel`, oraz komponentów renderujących CharacterSheetPopup.

#### `src/components/LogWindow.jsx`
Nad przyciskami kości:
```jsx
<select value={rollVisibility} onChange={e => onVisibilityChange(e.target.value)}>
  <option value="all">{t('roll.visibility.all')}</option>
  <option value="gm_and_roller">{t('roll.visibility.gmAndRoller')}</option>
  <option value="gm_only">{t('roll.visibility.gmOnly')}</option>
</select>
```
Dołączyć `visibility` do body wszystkich wywołań `/rollDice`.

#### Komponenty z wywołaniami API (warhammer4e, coc7e)
We wszystkich miejscach wywołujących `/rollSkill` i `/rollWeapon`:
```js
body: JSON.stringify({ ...existingFields, visibility: rollVisibility })
```

#### Wyświetlanie w logu
W `LogWindow.jsx` przy renderowaniu wpisów — gdy `msg.data?.visibility && msg.data.visibility !== 'all'` pokazać `<LockIcon fontSize="small" />` obok timestampu.

#### i18n
```json
// en/translation.json
"roll": { "visibility": { "all": "Everyone", "gmAndRoller": "GM + Player", "gmOnly": "GM Only" } }

// pl/translation.json
"roll": { "visibility": { "all": "Wszyscy", "gmAndRoller": "MG + Gracz", "gmOnly": "Tylko MG" } }
```

---

### Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `internal/models/Game.go` | +Visibility, +RollerUserID w GameEvent |
| `internal/websocket/hub.go` | +BroadcastToUsers |
| `internal/service/GameService.go` | +visibility param, +broadcastRoll helper |
| `internal/http/GameHandler.go` | +visibility z body, filtruj eventy przy GET |
| `src/components/GameSession.jsx` | +rollVisibility state + prop drilling |
| `src/components/LogWindow.jsx` | +select UI + visibility w API calls |
| `src/systems/warhammer4e/` | +visibility w API calls |
| `src/systems/coc7e/` | +visibility w API calls |
| `src/locales/en/translation.json` | +roll.visibility keys |
| `src/locales/pl/translation.json` | +roll.visibility keys |

---

### Weryfikacja

1. **Test "Wszyscy"**: Gracz1 rzuca skill → wynik u GM, Gracz1, Gracz2 ✓
2. **Test "MG + Gracz"**: Gracz1 rzuca z gm_and_roller → wynik u GM + Gracz1; Gracz2 nie widzi nic ✓
3. **Test "Tylko MG"**: GM rzuca z gm_only → wynik tylko u GM; Gracz1 i Gracz2 nie widzą nic ✓
4. **Test weapon/attribute roll** — te same scenariusze ✓
5. **Test CoC** — te same scenariusze ✓
6. **Test odświeżenia (gracz)**: Gracz2 odświeża → `GET /games/:id` filtruje ukryty event → log czysty ✓
7. **Test odświeżenia (MG)**: MG odświeża → `GET /games/:id` zawiera ukryte eventy → log z ikoną 🔒 ✓
