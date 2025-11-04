# Warhammer Battle Helper - Multiplayer Frontend Guide

## Overview
The frontend now supports multiplayer game sessions with real-time WebSocket synchronization.

---

## New Components

### 1. **GameLobby** (`src/components/GameLobby.jsx`)
The main hub where players can:
- View all active games
- Create new games (automatically becomes Game Master)
- Join existing games
- See player counts and game status

**Features:**
- Auto-refreshes game list every 5 seconds
- Beautiful parchment-themed UI matching the Warhammer aesthetic
- Error handling and loading states

**Usage:**
```jsx
<GameLobby
  onJoinGame={(gameId) => setCurrentGameId(gameId)}
  token={user.token}
/>
```

---

### 2. **GameSession** (`src/components/GameSession.jsx`)
The active game session component that:
- Manages WebSocket connection to the game
- Displays game header with participant info
- Integrates DndContext and LogWindow
- Handles real-time events (joins, leaves, moves, etc.)
- Provides "Leave Game" functionality

**Features:**
- Real-time synchronization via WebSocket
- Connection status indicator
- Event handling for all game actions
- Automatic game state fetching

**Usage:**
```jsx
<GameSession
  gameId={gameId}
  token={user.token}
  onLeaveGame={() => setCurrentGameId(null)}
/>
```

---

### 3. **useWebSocket Hook** (`src/hooks/useWebSocket.js`)
Custom React hook for managing WebSocket connections.

**Features:**
- Automatic connection on mount
- Exponential backoff reconnection (up to 5 attempts)
- Clean disconnect on unmount
- Message parsing and error handling
- Connection status tracking

**API:**
```javascript
const { isConnected, error, sendMessage, reconnect, disconnect } = useWebSocket(
  gameId,
  token,
  (message) => {
    // Handle incoming message
    console.log('Received:', message);
  }
);
```

**WebSocket Message Format:**
```javascript
{
  type: "GAME_STATE" | "PARTICIPANT_JOINED" | "CHARACTER_MOVED" | ...,
  payload: { /* event-specific data */ },
  gameId: "..."
}
```

---

## Updated Components

### **LogWindow** (`src/components/LogWindow.jsx`)
Now supports both legacy `messages` prop and new `logs` prop format:

```javascript
// New format (used by GameSession)
<LogWindow logs={logs} addLogMessage={addLogMessage} />

// Legacy format (still works)
<LogWindow messages={messages} addLogMessage={addLogMessage} />
```

---

## App Routing

The main `App.js` now handles:

### Routes:
- **`/`** - Game Lobby (shows lobby or active game session)
- **`/solo`** - Legacy single-player mode
- **`/login`** - Login page
- **`/register`** - Registration page

### State Management:
```javascript
const [currentGameId, setCurrentGameId] = useState(null);

// When user joins game
setCurrentGameId(gameId);

// When user leaves game
setCurrentGameId(null);
```

The main route conditionally renders:
- **GameLobby** when `currentGameId` is null
- **GameSession** when `currentGameId` is set

---

## WebSocket Events

### Events FROM Server:

| Event Type | Description | Payload |
|------------|-------------|---------|
| `GAME_STATE` | Full game state on connection | `{ game: {...} }` |
| `PARTICIPANT_JOINED` | Player joined game | `{ userId, username, role }` |
| `PARTICIPANT_LEFT` | Player left game | `{ userId }` |
| `CHARACTER_ADDED` | Character placed on grid | `{ character: {...} }` |
| `CHARACTER_MOVED` | Character position changed | `{ characterId, x, y, movedBy }` |
| `CHARACTER_REMOVED` | Character removed | `{ characterId }` |
| `LOG_MESSAGE` | Chat/log message | `{ message, type, username }` |
| `DICE_ROLLED` | Dice roll result | `{ sides, result, username }` |

---

## User Flow

### 1. **Login**
User logs in → Redirected to `/` (Game Lobby)

### 2. **Create Game**
1. Click "Create New Game"
2. Enter game name
3. Automatically joins as Game Master
4. GameSession component loads
5. WebSocket connects
6. Battle grid ready!

### 3. **Join Game**
1. See list of active games in lobby
2. Click "Join Game" on any game card
3. GameSession loads
4. WebSocket connects
5. Real-time sync begins!

### 4. **In-Game Actions**
- Drag characters onto grid → All players see update
- Move characters → Broadcast via WebSocket
- Roll dice → Everyone sees result
- Leave game → Return to lobby

---

## API Integration

### REST Endpoints Used:
```javascript
// Fetch all games
GET http://localhost:8080/games

// Create game
POST http://localhost:8080/games
Headers: { Authorization: Bearer <token> }
Body: { name: "Game Name" }

// Join game
POST http://localhost:8080/games/:id/join
Headers: { Authorization: Bearer <token> }

// Leave game
POST http://localhost:8080/games/:id/leave
Headers: { Authorization: Bearer <token> }

// Get game details
GET http://localhost:8080/games/:id
```

### WebSocket Connection:
```
ws://localhost:8080/games/:id/ws?token=<jwt_token>
```

---

## Styling

All new components use:
- **Aged parchment theme** (warm cream/beige colors)
- **Cinzel font** for headings
- **Crimson Text** for body text
- **Material-UI components** with custom styling
- **3D effects** for cards and buttons

---

## Development Notes

### Running the App:
```bash
# Backend
cd warhammer-battle-helper-backend
go run cmd/warhammer-battle-helper/main.go

# Frontend
cd warhammer-battle-helper-front
npm start
```

### Testing Multiplayer:
1. Open two browser windows
2. Login as different users in each
3. Create game in window 1
4. Join game in window 2
5. Move characters and watch real-time sync!

### WebSocket Debugging:
Open browser console to see WebSocket messages:
- Connection events
- Incoming messages
- Reconnection attempts

---

## Future Enhancements

Potential additions:
- [ ] Character movement via WebSocket (currently using REST)
- [ ] In-game chat
- [ ] Game Master controls (kick players, pause game)
- [ ] Turn-based combat system
- [ ] Game history playback
- [ ] Spectator mode
- [ ] Voice chat integration

---

## Troubleshooting

### WebSocket won't connect:
- Check backend is running on port 8080
- Verify JWT token is valid
- Check browser console for errors
- Ensure CORS is configured correctly

### Game state not syncing:
- Check WebSocket connection status
- Verify hub is running in backend (`go hub.Run()`)
- Check backend logs for broadcast messages

### Can't join game:
- Verify token in Authorization header
- Check if game exists in database
- Ensure you're not already in the game

---

Happy Gaming! ⚔️
