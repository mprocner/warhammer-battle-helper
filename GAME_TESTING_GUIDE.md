# Warhammer Battle Helper - Multiplayer Game Testing Guide

## Overview
This guide shows how to test the multiplayer game system with real-time WebSocket synchronization.

## Prerequisites
1. Backend server running on `http://localhost:8080`
2. MongoDB running
3. Two users registered (for testing multiplayer features)

---

## Step 1: Register & Login Users

### Register User 1 (Game Master)
```bash
curl -X POST http://localhost:8080/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "gm@test.com",
    "password": "password123"
  }'
```

### Register User 2 (Player)
```bash
curl -X POST http://localhost:8080/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player@test.com",
    "password": "password123"
  }'
```

### Login as GM
```bash
curl -X POST http://localhost:8080/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "gm@test.com",
    "password": "password123"
  }'
```

**Save the token from response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Export as environment variable:
```bash
export GM_TOKEN="your_token_here"
export PLAYER_TOKEN="player_token_here"
```

---

## Step 2: Create a Game

```bash
curl -X POST http://localhost:8080/games \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GM_TOKEN" \
  -d '{
    "name": "Epic Battle at Altdorf"
  }'
```

**Expected Response:**
```json
{
  "id": "67a1b2c3d4e5f6g7h8i9j0k1",
  "name": "Epic Battle at Altdorf",
  "gameMasterId": "...",
  "status": "active",
  "participants": [...],
  "characters": [],
  "events": [],
  "createdAt": "2025-10-20T...",
  "updatedAt": "2025-10-20T..."
}
```

**Save the game ID:**
```bash
export GAME_ID="67a1b2c3d4e5f6g7h8i9j0k1"
```

---

## Step 3: List All Games

```bash
curl -X GET http://localhost:8080/games
```

---

## Step 4: Get Specific Game Details

```bash
curl -X GET http://localhost:8080/games/$GAME_ID
```

---

## Step 5: Invite the Player to the Game

Inviting is the only way a player enters a game — there is no self-service join.

```bash
curl -X POST http://localhost:8080/games/$GAME_ID/invite \
  -H "Authorization: Bearer $GM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "player@example.com"}'
```

**Expected:** Player is added to participants list, all connected WebSocket clients receive `PARTICIPANT_JOINED` event.

---

## Step 6: Create a Character (to add to grid)

First, create a character:

```bash
curl -X POST http://localhost:8080/my-characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GM_TOKEN" \
  -d '{
    "basicInfo": {
      "name": "Sigmar the Brave",
      "race": "Human",
      "class": "Warrior",
      "profession": "Soldier",
      "type": "hero"
    },
    "characteristics": {
      "WW": {"base": 40, "advances": 10},
      "US": {"base": 35, "advances": 5},
      "S": {"base": 35, "advances": 0},
      "Wt": {"base": 35, "advances": 5},
      "I": {"base": 40, "advances": 10},
      "Zw": {"base": 30, "advances": 0},
      "Zr": {"base": 35, "advances": 5},
      "Int": {"base": 30, "advances": 0},
      "SW": {"base": 35, "advances": 5},
      "Ogd": {"base": 30, "advances": 0}
    },
    "skills": {"Melee": 50, "Athletics": 40},
    "weapons": [{"name": "Longsword", "bonus": 5}],
    "avatar": "https://example.com/avatar.png"
  }'
```

**Save character ID from response:**
```bash
export CHAR_ID="character_id_here"
```

---

## Step 7: Add Character to Battle Grid

```bash
curl -X POST http://localhost:8080/games/$GAME_ID/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GM_TOKEN" \
  -d '{
    "characterId": "'$CHAR_ID'",
    "positionX": 5,
    "positionY": 5,
    "isEnemy": false
  }'
```

**Expected:** All connected WebSocket clients receive `CHARACTER_ADDED` event.

---

## Step 8: Move Character on Grid

```bash
curl -X PUT http://localhost:8080/games/$GAME_ID/characters/move \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -d '{
    "characterId": "'$CHAR_ID'",
    "positionX": 7,
    "positionY": 8
  }'
```

**Expected:** All connected WebSocket clients receive `CHARACTER_MOVED` event.

---

## Step 9: Test WebSocket Real-time Updates

### Using wscat (install with `npm install -g wscat`)

#### Terminal 1 - Connect as GM:
```bash
wscat -c "ws://localhost:8080/games/$GAME_ID/ws?token=$GM_TOKEN"
```

#### Terminal 2 - Connect as Player:
```bash
wscat -c "ws://localhost:8080/games/$GAME_ID/ws?token=$PLAYER_TOKEN"
```

#### Terminal 3 - Make API calls:
Now when you make any API call (add character, move character, etc.), **both terminals should receive the WebSocket message instantly!**

Example: Move a character in Terminal 3, and you'll see this in Terminals 1 & 2:
```json
{
  "type": "CHARACTER_MOVED",
  "gameId": "...",
  "payload": {
    "characterId": "...",
    "x": 7,
    "y": 8,
    "movedBy": "player@test.com"
  }
}
```

---

## Step 10: Leave Game

```bash
curl -X POST http://localhost:8080/games/$GAME_ID/leave \
  -H "Authorization: Bearer $PLAYER_TOKEN"
```

**Expected:** All WebSocket clients receive `PARTICIPANT_LEFT` event.

---

## WebSocket Events Reference

### Events FROM Server TO Client:

| Event Type | When Triggered | Payload |
|------------|----------------|---------|
| `GAME_STATE` | Initial connection | Full game state |
| `PARTICIPANT_JOINED` | User joins game | `{userId, username, role}` |
| `PARTICIPANT_LEFT` | User leaves game | `{userId}` |
| `CHARACTER_ADDED` | Character placed on grid | `{character}` |
| `CHARACTER_MOVED` | Character position updated | `{characterId, x, y, movedBy}` |
| `CHARACTER_REMOVED` | Character removed from grid | `{characterId}` |
| `LOG_MESSAGE` | Message logged | `{message, type, username}` |
| `DICE_ROLLED` | Dice rolled | `{sides, result, username}` |

---

## Testing Checklist

- [ ] Create game as GM
- [ ] List all games (public endpoint)
- [ ] Get game details
- [ ] Join game as player
- [ ] Create character
- [ ] Add character to grid (GM can see on WebSocket)
- [ ] Move character (both GM and player see update)
- [ ] Open 2+ WebSocket connections (different users)
- [ ] Verify real-time sync (move character, see update everywhere)
- [ ] Leave game
- [ ] Check event log persists in MongoDB

---

## Debugging Tips

### Check WebSocket Hub Status
Add this to your code to see connected clients:
```go
fmt.Printf("Game %s has %d connected clients\n", gameID, hub.GetGameClientCount(gameID))
```

### View MongoDB Collections
```bash
docker exec -it mongo mongosh

use battle_helper
db.games.find().pretty()
db.games.findOne({_id: ObjectId("your_game_id")})
```

### Check Backend Logs
Look for these messages:
- `Client X joined game Y. Total clients in game: N`
- `Broadcast message type 'TYPE' to N clients in game Y`

---

## Advanced Testing

### Test with Postman/Insomnia
1. Import the curl commands as HTTP requests
2. Use WebSocket tab to connect to `ws://localhost:8080/games/:id/ws?token=...`
3. Watch real-time events while making API calls

### Test Concurrent Users
Run multiple WebSocket connections and verify:
1. All clients receive the same events
2. No race conditions in character movement
3. Event order is maintained

---

## Next Steps

Once backend is working:
1. **Frontend Integration** - Connect React app with WebSocket
2. **Build GameLobby component** - List games, create/join buttons
3. **Update DndContext** - Send moves via WebSocket instead of local state
4. **Sync LogWindow** - Receive log events via WebSocket

---

## Troubleshooting

### "game not found" error
- Check if game ID is correct
- Verify game exists: `curl http://localhost:8080/games`

### WebSocket connection fails
- Ensure token is valid (not expired)
- Check CORS settings allow WebSocket upgrade
- Verify game ID exists

### Events not broadcasting
- Check hub is running: `go hub.Run()` in main.go
- Verify client is registered in hub
- Check firewall/network settings

---

Happy Testing! 🎲⚔️
