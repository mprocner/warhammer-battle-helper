package websocket

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Client represents a WebSocket client connection
type Client struct {
	ID     primitive.ObjectID
	GameID string
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
}

// Message represents a WebSocket message
type Message struct {
	Type    string                 `json:"type"`
	GameID  string                 `json:"gameId,omitempty"`
	Payload map[string]interface{} `json:"payload"`
}

// MusicState holds the current music playback state for a game
type MusicState struct {
	IsPlaying  bool      `json:"isPlaying"`
	TrackURL   string    `json:"trackUrl,omitempty"`
	TrackName  string    `json:"trackName,omitempty"`
	Position   float64   `json:"position"`
	Volume     float64   `json:"volume"`
	PlaylistId string    `json:"playlistId,omitempty"`
	TrackIndex int       `json:"trackIndex"`
	StartedAt  time.Time // server time when playback started (used to calculate elapsed)
}

// Hub maintains the set of active clients and broadcasts messages to the clients
type Hub struct {
	// Registered clients per game
	Games map[string]map[*Client]bool

	// Current music state per game (in-memory, not persisted)
	MusicStates map[string]*MusicState

	// Register requests from the clients
	Register chan *Client

	// Unregister requests from clients
	Unregister chan *Client

	// Inbound messages from clients
	Broadcast chan *Message

	// Mutex for thread-safe operations
	mu sync.RWMutex
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		Games:       make(map[string]map[*Client]bool),
		MusicStates: make(map[string]*MusicState),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		Broadcast:   make(chan *Message, 256),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.registerClient(client)
			go h.BroadcastOnlineUsers(client.GameID)

		case client := <-h.Unregister:
			h.unregisterClient(client)
			go h.BroadcastOnlineUsers(client.GameID)

		case message := <-h.Broadcast:
			h.broadcastMessage(message)
		}
	}
}

// registerClient adds a client to a game room
func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.Games[client.GameID] == nil {
		h.Games[client.GameID] = make(map[*Client]bool)
	}
	h.Games[client.GameID][client] = true

	fmt.Printf("Client %s joined game %s. Total clients in game: %d\n",
		client.ID.Hex(), client.GameID, len(h.Games[client.GameID]))

	// Send current music state to the newly connected client
	if ms, ok := h.MusicStates[client.GameID]; ok && ms.IsPlaying {
		// Calculate current playback position: original position + time elapsed since play started
		currentPosition := ms.Position + time.Since(ms.StartedAt).Seconds()

		msg := &Message{
			Type:   "MUSIC_PLAY",
			GameID: client.GameID,
			Payload: map[string]interface{}{
				"trackUrl":   ms.TrackURL,
				"trackName":  ms.TrackName,
				"position":   currentPosition,
				"playlistId": ms.PlaylistId,
				"trackIndex": ms.TrackIndex,
			},
		}
		msgBytes, err := json.Marshal(msg)
		if err == nil {
			select {
			case client.Send <- msgBytes:
			default:
			}
		}
		// Also send volume if not default
		if ms.Volume != 1.0 {
			volMsg := &Message{
				Type:   "MUSIC_VOLUME",
				GameID: client.GameID,
				Payload: map[string]interface{}{
					"volume": ms.Volume,
				},
			}
			volBytes, err := json.Marshal(volMsg)
			if err == nil {
				select {
				case client.Send <- volBytes:
				default:
				}
			}
		}
	}
}

// unregisterClient removes a client from a game room
func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.Games[client.GameID]; ok {
		if _, ok := clients[client]; ok {
			delete(clients, client)
			close(client.Send)

			// Remove empty game rooms
			if len(clients) == 0 {
				delete(h.Games, client.GameID)
			}

			fmt.Printf("Client %s left game %s. Remaining clients: %d\n",
				client.ID.Hex(), client.GameID, len(clients))
		}
	}
}

// broadcastMessage sends a message to all clients in a game
func (h *Hub) broadcastMessage(message *Message) {
	// Track music state changes (needs write lock for MusicStates)
	switch message.Type {
	case "MUSIC_PLAY":
		h.mu.Lock()
		playlistId := ""
		if pid, ok := message.Payload["playlistId"]; ok {
			playlistId = fmt.Sprintf("%v", pid)
		}
		trackIndex := 0
		if ti, ok := message.Payload["trackIndex"]; ok {
			trackIndex = int(toFloat64(ti))
		}
		h.MusicStates[message.GameID] = &MusicState{
			IsPlaying:  true,
			TrackURL:   fmt.Sprintf("%v", message.Payload["trackUrl"]),
			TrackName:  fmt.Sprintf("%v", message.Payload["trackName"]),
			Position:   toFloat64(message.Payload["position"]),
			Volume:     h.getMusicVolume(message.GameID),
			PlaylistId: playlistId,
			TrackIndex: trackIndex,
			StartedAt:  time.Now(),
		}
		h.mu.Unlock()
	case "MUSIC_PAUSE":
		h.mu.Lock()
		if ms, ok := h.MusicStates[message.GameID]; ok {
			ms.IsPlaying = false
			ms.Position = toFloat64(message.Payload["position"])
		}
		h.mu.Unlock()
	case "MUSIC_STOP":
		h.mu.Lock()
		delete(h.MusicStates, message.GameID)
		h.mu.Unlock()
	case "MUSIC_VOLUME":
		h.mu.Lock()
		if ms, ok := h.MusicStates[message.GameID]; ok {
			ms.Volume = toFloat64(message.Payload["volume"])
		}
		h.mu.Unlock()
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.Games[message.GameID]; ok {
		messageBytes, err := json.Marshal(message)
		if err != nil {
			fmt.Printf("Error marshaling message: %v\n", err)
			return
		}

		for client := range clients {
			select {
			case client.Send <- messageBytes:
			default:
				// Client's send channel is full, close it
				close(client.Send)
				delete(clients, client)
			}
		}

		fmt.Printf("Broadcast message type '%s' to %d clients in game %s\n",
			message.Type, len(clients), message.GameID)
	}
}

// getMusicVolume returns the current volume for a game (caller must hold lock)
func (h *Hub) getMusicVolume(gameID string) float64 {
	if ms, ok := h.MusicStates[gameID]; ok {
		return ms.Volume
	}
	return 1.0
}

// toFloat64 safely converts an interface value to float64
func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	default:
		return 0
	}
}

// BroadcastToGame sends a message to all clients in a specific game
func (h *Hub) BroadcastToGame(gameID, messageType string, payload map[string]interface{}) {
	message := &Message{
		Type:    messageType,
		GameID:  gameID,
		Payload: payload,
	}
	h.Broadcast <- message
}

// BroadcastToUsers sends a message directly to specific users in a game (bypasses Broadcast channel).
func (h *Hub) BroadcastToUsers(gameID, messageType string, payload map[string]interface{}, userIDs []string) {
	message := Message{Type: messageType, GameID: gameID, Payload: payload}
	msg, err := json.Marshal(message)
	if err != nil {
		return
	}
	targetSet := make(map[string]bool)
	for _, id := range userIDs {
		targetSet[id] = true
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.Games[gameID] {
		if targetSet[client.ID.Hex()] {
			select {
			case client.Send <- msg:
			default:
			}
		}
	}
}

// GetGameOnlineUserIDs returns the list of connected user IDs for a game (thread-safe)
func (h *Hub) GetGameOnlineUserIDs(gameID string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := []string{}
	for client := range h.Games[gameID] {
		ids = append(ids, client.ID.Hex())
	}
	return ids
}

// BroadcastOnlineUsers sends USERS_ONLINE event to all clients in a game.
// Writes directly to Send channels (bypasses Broadcast channel to avoid deadlock).
func (h *Hub) BroadcastOnlineUsers(gameID string) {
	ids := h.GetGameOnlineUserIDs(gameID)
	payload := map[string]interface{}{"onlineUserIds": ids}
	msg, err := json.Marshal(Message{Type: "USERS_ONLINE", GameID: gameID, Payload: payload})
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.Games[gameID] {
		select {
		case client.Send <- msg:
		default:
		}
	}
}

// GetGameClientCount returns the number of connected clients in a game
func (h *Hub) GetGameClientCount(gameID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.Games[gameID]; ok {
		return len(clients)
	}
	return 0
}

// WritePump pumps messages from the hub to the websocket connection
func (c *Client) WritePump() {
	defer func() {
		c.Conn.Close()
	}()

	for message := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			fmt.Printf("Error writing message to client %s: %v\n", c.ID.Hex(), err)
			return
		}
	}
}

// ReadPump pumps messages from the websocket connection to the hub
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	for {
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				fmt.Printf("WebSocket error for client %s: %v\n", c.ID.Hex(), err)
			}
			break
		}

		var message Message
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			fmt.Printf("Error unmarshaling message from client %s: %v\n", c.ID.Hex(), err)
			continue
		}

		// Set the game ID from the client if not provided in message
		if message.GameID == "" {
			message.GameID = c.GameID
		}

		// Handle the message based on type
		// Note: Actual game logic will be handled by the service layer
		// The hub just broadcasts the message
		c.Hub.Broadcast <- &message
	}
}
