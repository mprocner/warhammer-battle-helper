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
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name         string             `bson:"name" json:"name"`
	GameMasterID primitive.ObjectID `bson:"gameMasterId" json:"gameMasterId"`
	Status       GameStatus         `bson:"status" json:"status"`
	Participants []GameParticipant  `bson:"participants" json:"participants"`
	Characters   []GameCharacter    `bson:"characters" json:"characters"`
	Events       []GameEvent        `bson:"events" json:"events"`
	CreatedAt    time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time          `bson:"updatedAt" json:"updatedAt"`
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
	PositionX   int    `json:"positionX" binding:"required"`
	PositionY   int    `json:"positionY" binding:"required"`
	IsEnemy     bool   `json:"isEnemy"`
}
