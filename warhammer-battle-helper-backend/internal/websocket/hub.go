package websocket

import (
	"encoding/json"
	"fmt"
	"sync"

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

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.registerClient(client)

		case client := <-h.Unregister:
			h.unregisterClient(client)

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

// BroadcastToGame sends a message to all clients in a specific game
func (h *Hub) BroadcastToGame(gameID, messageType string, payload map[string]interface{}) {
	message := &Message{
		Type:    messageType,
		GameID:  gameID,
		Payload: payload,
	}
	h.Broadcast <- message
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
