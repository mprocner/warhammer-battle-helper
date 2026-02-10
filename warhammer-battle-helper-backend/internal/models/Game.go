package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// GameStatus represents the current state of a game
type GameStatus string

const (
	GameStatusActive    GameStatus = "active"
	GameStatusPaused    GameStatus = "paused"
	GameStatusCompleted GameStatus = "completed"
)

// ParticipantRole represents a user's role in a game
type ParticipantRole string

const (
	RoleGameMaster ParticipantRole = "gm"
	RolePlayer     ParticipantRole = "player"
)

// Game represents a game session
type Game struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name            string             `bson:"name" json:"name"`
	GameMasterID    primitive.ObjectID `bson:"gameMasterId" json:"gameMasterId"`
	GameMasterEmail string             `bson:"-" json:"gameMasterEmail,omitempty"`
	Status          GameStatus         `bson:"status" json:"status"`
	Participants    []GameParticipant  `bson:"participants" json:"participants"`
	Characters      []GameCharacter    `bson:"characters" json:"characters"`
	Events          []GameEvent        `bson:"events" json:"events"`
	Handouts        []Handout          `bson:"handouts" json:"handouts"`
	Scenes          []Scene            `bson:"scenes" json:"scenes"`
	CreatedAt       time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// GameParticipant represents a user participating in a game
type GameParticipant struct {
	UserID   primitive.ObjectID `bson:"userId" json:"userId"`
	Username string             `bson:"username" json:"username"`
	Role     ParticipantRole    `bson:"role" json:"role"`
	JoinedAt time.Time          `bson:"joinedAt" json:"joinedAt"`
	LeftAt   *time.Time         `bson:"leftAt,omitempty" json:"leftAt,omitempty"`
	IsActive bool               `bson:"isActive" json:"isActive"`
}

// GameCharacter represents a character placed on the battle grid
type GameCharacter struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	CharacterID primitive.ObjectID `bson:"characterId" json:"characterId"`
	Name        string             `bson:"name" json:"name"`
	Avatar      string             `bson:"avatar" json:"avatar"`
	PositionX   int                `bson:"positionX" json:"positionX"`
	PositionY   int                `bson:"positionY" json:"positionY"`
	IsEnemy     bool               `bson:"isEnemy" json:"isEnemy"`
	PlacedBy    primitive.ObjectID `bson:"placedBy" json:"placedBy"`
	PlacedAt    time.Time          `bson:"placedAt" json:"placedAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// EventType represents different types of game events
type EventType string

const (
	EventTypeMove            EventType = "move"
	EventTypeAttack          EventType = "attack"
	EventTypeDiceRoll        EventType = "dice_roll"
	EventTypeMessage         EventType = "message"
	EventTypeCharacterAdd    EventType = "character_add"
	EventTypeCharacterRemove EventType = "character_remove"
	EventTypeJoin            EventType = "join"
	EventTypeLeave           EventType = "leave"
)

// GameEvent represents an event that occurred in the game
type GameEvent struct {
	ID        primitive.ObjectID     `bson:"_id,omitempty" json:"id"`
	Type      EventType              `bson:"type" json:"type"`
	Data      map[string]interface{} `bson:"data" json:"data"`
	CreatedBy primitive.ObjectID     `bson:"createdBy" json:"createdBy"`
	Username  string                 `bson:"username" json:"username"`
	CreatedAt time.Time              `bson:"createdAt" json:"createdAt"`
}

// CreateGameRequest is the request body for creating a new game
type CreateGameRequest struct {
	Name string `json:"name" binding:"required"`
}

// JoinGameRequest is the request body for joining a game
type JoinGameRequest struct {
	GameID string `json:"gameId" binding:"required"`
}

// MoveCharacterRequest is the request body for moving a character
type MoveCharacterRequest struct {
	CharacterID string `json:"characterId" binding:"required"`
	PositionX   int    `json:"positionX" binding:"required"`
	PositionY   int    `json:"positionY" binding:"required"`
}

// AddCharacterRequest is the request body for adding a character to the grid
type AddCharacterRequest struct {
	CharacterID string `json:"characterId" binding:"required"`
	PositionX   int    `json:"positionX"`
	PositionY   int    `json:"positionY"`
	IsEnemy     bool   `json:"isEnemy"`
}

// SceneImage represents an image placed on a scene layer
type SceneImage struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	FileURL   string             `bson:"fileUrl" json:"fileUrl"`
	FileName  string             `bson:"fileName" json:"fileName"`
	Layer     string             `bson:"layer" json:"layer"` // "background" or "gm"
	X         float64            `bson:"x" json:"x"`
	Y         float64            `bson:"y" json:"y"`
	Width     float64            `bson:"width" json:"width"`
	Height    float64            `bson:"height" json:"height"`
	ZIndex    int                `bson:"zIndex" json:"zIndex"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// Scene represents a battle scene with its own grid and characters
type Scene struct {
	ID              primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name            string               `bson:"name" json:"name"`
	GridVisible     bool                 `bson:"gridVisible" json:"gridVisible"`
	GridBgVisible   bool                 `bson:"gridBgVisible" json:"gridBgVisible"`
	GridWidth       int                  `bson:"gridWidth" json:"gridWidth"`
	GridHeight      int                  `bson:"gridHeight" json:"gridHeight"`
	Characters      []GameCharacter      `bson:"characters" json:"characters"`
	Images          []SceneImage         `bson:"images" json:"images"`
	AssignedPlayers []primitive.ObjectID `bson:"assignedPlayers" json:"assignedPlayers"`
	IsDefault       bool                 `bson:"isDefault" json:"isDefault"`
	CreatedAt       time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time            `bson:"updatedAt" json:"updatedAt"`
}

// Handout represents a document/image shared in the game
type Handout struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Title       string             `bson:"title" json:"title"`
	Description string             `bson:"description" json:"description"`
	Type        string             `bson:"type" json:"type"` // image, pdf, text, map, letter
	Visibility  []string           `bson:"visibility" json:"visibility"`
	FileURL     string             `bson:"fileUrl" json:"fileUrl"`
	Order       int                `bson:"order" json:"order"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// CreateHandoutRequest is the request body for creating a new handout
type CreateHandoutRequest struct {
	Title       string   `json:"title" binding:"required"`
	Description string   `json:"description"`
	Type        string   `json:"type" binding:"required"`
	Visibility  []string `json:"visibility" binding:"required"`
	FileURL     string   `json:"fileUrl" binding:"required"`
}

// UpdateHandoutRequest is the request body for updating a handout
type UpdateHandoutRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Type        string   `json:"type"`
	Visibility  []string `json:"visibility"`
	FileURL     string   `json:"fileUrl"`
}

// ReorderHandoutsRequest is the request body for reordering handouts
type ReorderHandoutsRequest struct {
	HandoutIDs []string `json:"handoutIds" binding:"required"`
}

// CreateSceneRequest is the request body for creating a new scene
type CreateSceneRequest struct {
	Name       string `json:"name" binding:"required"`
	GridWidth  int    `json:"gridWidth"`
	GridHeight int    `json:"gridHeight"`
}

// UpdateSceneRequest is the request body for updating a scene
type UpdateSceneRequest struct {
	Name          *string `json:"name"`
	GridVisible   *bool   `json:"gridVisible"`
	GridBgVisible *bool   `json:"gridBgVisible"`
	GridWidth     *int    `json:"gridWidth"`
	GridHeight    *int    `json:"gridHeight"`
}

// AssignPlayerToSceneRequest is the request body for assigning a player to a scene
type AssignPlayerToSceneRequest struct {
	PlayerID string `json:"playerId" binding:"required"`
}

// AddSceneImageRequest is the request body for adding an image to a scene
type AddSceneImageRequest struct {
	FileURL  string  `json:"fileUrl" binding:"required"`
	FileName string  `json:"fileName" binding:"required"`
	Layer    string  `json:"layer" binding:"required"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
}

// UpdateSceneImageRequest is the request body for updating a scene image
type UpdateSceneImageRequest struct {
	X      *float64 `json:"x"`
	Y      *float64 `json:"y"`
	Width  *float64 `json:"width"`
	Height *float64 `json:"height"`
	ZIndex *int     `json:"zIndex"`
	Layer  *string  `json:"layer"`
}
