package websocket

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SessionTracker is implemented by OnlineSessionService to avoid import cycles.
type SessionTracker interface {
	Open(gameID string, userID primitive.ObjectID)
	Close(gameID string, userID primitive.ObjectID)
}

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

// Hub maintains the set of active clients and broadcasts messages to the clients
type Hub struct {
	// Registered clients per game
	Games map[string]map[*Client]bool

	// Register requests from the clients
	Register chan *Client

	// Unregister requests from clients
	Unregister chan *Client

	// Inbound messages from clients
	Broadcast chan *Message

	// Mutex for thread-safe operations
	mu sync.RWMutex

	// SessionTracker tracks online sessions (optional, nil-safe)
	sessionTracker SessionTracker
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		Games:      make(map[string]map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan *Message, 256),
	}
}

// SetSessionTracker sets the session tracker for online time tracking.
func (h *Hub) SetSessionTracker(st SessionTracker) {
	h.sessionTracker = st
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

	if h.sessionTracker != nil {
		go h.sessionTracker.Open(client.GameID, client.ID)
	}
}

// unregisterClient removes a client from a game room
func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.removeClient(client)
}

// DisconnectUser closes every connection userID holds in gameID. Used when a player leaves
// or is kicked: the REST guard blocks his next request, but an already-open socket would
// keep streaming GAME_STATE and every later broadcast until he closed the tab himself.
func (h *Hub) DisconnectUser(gameID string, userID primitive.ObjectID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.Games[gameID]
	if !ok {
		return
	}

	// Collect first, remove second — removeClient deletes from the map we are ranging over.
	var targets []*Client
	for client := range clients {
		if client.ID == userID {
			targets = append(targets, client)
		}
	}

	for _, client := range targets {
		h.removeClient(client)
	}
}

// removeClient removes a client and closes its session if no other tabs remain.
// Must be called with h.mu held (write lock).
func (h *Hub) removeClient(client *Client) {
	clients, ok := h.Games[client.GameID]
	if !ok {
		return
	}
	if _, exists := clients[client]; !exists {
		return
	}

	delete(clients, client)
	close(client.Send)

	// Close online session only if user has no other clients in this game
	if h.sessionTracker != nil && !h.hasOtherClient(client.ID, clients) {
		go h.sessionTracker.Close(client.GameID, client.ID)
	}

	// Remove empty game rooms
	if len(clients) == 0 {
		delete(h.Games, client.GameID)
	}

	fmt.Printf("Client %s left game %s. Remaining clients: %d\n",
		client.ID.Hex(), client.GameID, len(clients))
}

// hasOtherClient checks if userID has another client connection in the given clients map.
func (h *Hub) hasOtherClient(userID primitive.ObjectID, clients map[*Client]bool) bool {
	for c := range clients {
		if c.ID == userID {
			return true
		}
	}
	return false
}

// broadcastMessage sends a message to all clients in a game
func (h *Hub) broadcastMessage(message *Message) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.Games[message.GameID]
	if !ok {
		return
	}

	messageBytes, err := json.Marshal(message)
	if err != nil {
		fmt.Printf("Error marshaling message: %v\n", err)
		return
	}

	var stale []*Client
	for client := range clients {
		select {
		case client.Send <- messageBytes:
		default:
			stale = append(stale, client)
		}
	}

	for _, client := range stale {
		h.removeClient(client)
	}

	fmt.Printf("Broadcast message type '%s' to %d clients in game %s\n",
		message.Type, len(clients), message.GameID)
}

// BroadcastToGameExcept sends a message to all clients in a game except the specified user.
func (h *Hub) BroadcastToGameExcept(gameID, messageType string, payload map[string]interface{}, excludeUserID string) {
	message := Message{Type: messageType, GameID: gameID, Payload: payload}
	msg, err := json.Marshal(message)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	sent := 0
	for client := range h.Games[gameID] {
		if client.ID.Hex() == excludeUserID {
			continue
		}
		select {
		case client.Send <- msg:
			sent++
		default:
		}
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

// BroadcastExceptUsers sends to every client in the game EXCEPT the listed users — the denylist twin
// of BroadcastToUsers. Use it when the audience is naturally a complement ("everyone who does NOT
// hold this character's card") and enumerating that complement would cost a database read. The hub
// already holds the connected clients, so subtracting a short exclusion list from them is free.
func (h *Hub) BroadcastExceptUsers(gameID, messageType string, payload map[string]interface{}, excludeUserIDs []string) {
	message := Message{Type: messageType, GameID: gameID, Payload: payload}
	msg, err := json.Marshal(message)
	if err != nil {
		return
	}
	excluded := make(map[string]bool, len(excludeUserIDs))
	for _, id := range excludeUserIDs {
		excluded[id] = true
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.Games[gameID] {
		if excluded[client.ID.Hex()] {
			continue
		}
		select {
		case client.Send <- msg:
		default:
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
