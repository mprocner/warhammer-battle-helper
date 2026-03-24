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
	GameSystem      string             `bson:"gameSystem" json:"gameSystem"` // "warhammer4e" | "coc7e"
	GameMasterID    primitive.ObjectID `bson:"gameMasterId" json:"gameMasterId"`
	GameMasterEmail string             `bson:"-" json:"gameMasterEmail,omitempty"`
	Status          GameStatus         `bson:"status" json:"status"`
	Participants    []GameParticipant  `bson:"participants" json:"participants"`
	Characters      []GameCharacter    `bson:"characters" json:"characters"`
	Events          []GameEvent        `bson:"events" json:"events"`
	Handouts        []Handout          `bson:"handouts" json:"handouts"`
	HandoutFolders  []HandoutFolder    `bson:"handoutFolders" json:"handoutFolders"`
	Scenes          []Scene            `bson:"scenes" json:"scenes"`
	CreatedAt       time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time          `bson:"updatedAt" json:"updatedAt"`
	DeletedAt       *time.Time         `bson:"deletedAt,omitempty" json:"-"`
}

// GameParticipant represents a user participating in a game
type GameParticipant struct {
	UserID           primitive.ObjectID `bson:"userId" json:"userId"`
	Username         string             `bson:"username" json:"username"`
	Email            string             `bson:"email" json:"email"`
	Role             ParticipantRole    `bson:"role" json:"role"`
	JoinedAt         time.Time          `bson:"joinedAt" json:"joinedAt"`
	Avatar           string             `bson:"avatar,omitempty" json:"avatar,omitempty"`
	Signature        string             `bson:"signature,omitempty" json:"signature,omitempty"`
	AccountAvatar    string             `bson:"-" json:"accountAvatar,omitempty"`
	AccountSignature string             `bson:"-" json:"accountSignature,omitempty"`
}

// InvitePlayerRequest is the request body for inviting a player to a game
type InvitePlayerRequest struct {
	Email string `json:"email" binding:"required"`
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
	Name       string `json:"name" binding:"required"`
	GameSystem string `json:"gameSystem" binding:"required,oneof=warhammer4e coc7e"`
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
	Locked    bool               `bson:"locked" json:"locked"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// FogPath represents a single brush stroke or shape that reveals or covers area in fog of war
type FogPath struct {
	Points    [][2]float64 `bson:"points" json:"points"`
	BrushSize float64      `bson:"brushSize" json:"brushSize"`
	Shape     string       `bson:"shape" json:"shape"` // "" or "freehand" = stroke, "rect" = filled rectangle
	Cover     bool         `bson:"cover" json:"cover"` // true = cover (add fog), false = reveal (remove fog)
}

// DrawingPath represents a single drawing stroke or shape on the annotation layer
type DrawingPath struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId"        json:"userId"`
	Tool      string             `bson:"tool"          json:"tool"` // freehand|line|rect|circle|arrow|text
	Points    [][2]float64       `bson:"points"        json:"points"`
	BrushSize float64            `bson:"brushSize"     json:"brushSize"`
	Color     string             `bson:"color"         json:"color"`    // hex, e.g. "#ff0000"
	Text      string             `bson:"text"          json:"text"`     // only for tool=="text"
	FontSize  float64            `bson:"fontSize"      json:"fontSize"` // only for tool=="text"
}

// Scene represents a battle scene with its own grid and characters
type Scene struct {
	ID              primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name            string               `bson:"name" json:"name"`
	GridVisible     bool                 `bson:"gridVisible" json:"gridVisible"`
	GridWidth       int                  `bson:"gridWidth" json:"gridWidth"`
	GridHeight      int                  `bson:"gridHeight" json:"gridHeight"`
	Characters      []GameCharacter      `bson:"characters" json:"characters"`
	Images          []SceneImage         `bson:"images" json:"images"`
	AssignedPlayers []primitive.ObjectID `bson:"assignedPlayers" json:"assignedPlayers"`
	IsDefault       bool                 `bson:"isDefault" json:"isDefault"`
	FogEnabled      bool                 `bson:"fogEnabled" json:"fogEnabled"`
	FogOpacity      float64              `bson:"fogOpacity" json:"fogOpacity"`
	RevealPaths     []FogPath            `bson:"revealPaths" json:"revealPaths"`
	DrawingPaths    []DrawingPath        `bson:"drawingPaths" json:"drawingPaths"`
	CreatedAt       time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time            `bson:"updatedAt" json:"updatedAt"`
}

// HandoutFolder represents a folder for organizing handouts
type HandoutFolder struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	Order     int                `bson:"order" json:"order"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// Handout represents a document/image shared in the game
type Handout struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Title       string              `bson:"title" json:"title"`
	Description string              `bson:"description" json:"description"`
	Type        string              `bson:"type" json:"type"` // image, pdf, text, map, letter
	Visibility  []string            `bson:"visibility" json:"visibility"`
	FileURL     string              `bson:"fileUrl" json:"fileUrl"`
	FolderID    *primitive.ObjectID `bson:"folderId,omitempty" json:"folderId,omitempty"`
	Order       int                 `bson:"order" json:"order"`
	CreatedAt   time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time           `bson:"updatedAt" json:"updatedAt"`
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

// CreateHandoutFolderRequest is the request body for creating a handout folder
type CreateHandoutFolderRequest struct {
	Name string `json:"name" binding:"required"`
}

// RenameHandoutFolderRequest is the request body for renaming a handout folder
type RenameHandoutFolderRequest struct {
	Name string `json:"name" binding:"required"`
}

// MoveHandoutRequest is the request body for moving a handout to a folder
type MoveHandoutRequest struct {
	FolderID *string `json:"folderId"` // null = ungrouped
}

// ReorderHandoutFoldersRequest is the request body for reordering handout folders
type ReorderHandoutFoldersRequest struct {
	FolderIDs []string `json:"folderIds" binding:"required"`
}

// GetHandoutsResponse is the response for getting handouts (includes folders)
type GetHandoutsResponse struct {
	Handouts       []Handout       `json:"handouts"`
	HandoutFolders []HandoutFolder `json:"handoutFolders"`
}

// CreateSceneRequest is the request body for creating a new scene
type CreateSceneRequest struct {
	Name       string `json:"name" binding:"required"`
	GridWidth  int    `json:"gridWidth"`
	GridHeight int    `json:"gridHeight"`
}

// UpdateSceneRequest is the request body for updating a scene
type UpdateSceneRequest struct {
	Name        *string `json:"name"`
	GridVisible *bool   `json:"gridVisible"`
	GridWidth   *int    `json:"gridWidth"`
	GridHeight  *int    `json:"gridHeight"`
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

// ToggleFogRequest is the request body for toggling fog of war
type ToggleFogRequest struct {
	Enabled    bool    `json:"enabled"`
	FogOpacity float64 `json:"fogOpacity"`
}

// AddFogPathRequest is the request body for adding a fog reveal/cover path
type AddFogPathRequest struct {
	Points    [][2]float64 `json:"points" binding:"required"`
	BrushSize float64      `json:"brushSize"`
	Shape     string       `json:"shape"`
	Cover     bool         `json:"cover"`
}

// AddDrawingPathRequest is the request body for adding a drawing path
type AddDrawingPathRequest struct {
	Tool      string       `json:"tool" binding:"required"`
	Points    [][2]float64 `json:"points" binding:"required"`
	BrushSize float64      `json:"brushSize"`
	Color     string       `json:"color"`
	Text      string       `json:"text"`
	FontSize  float64      `json:"fontSize"`
}

// UpdateSceneImageRequest is the request body for updating a scene image
type UpdateSceneImageRequest struct {
	X      *float64 `json:"x"`
	Y      *float64 `json:"y"`
	Width  *float64 `json:"width"`
	Height *float64 `json:"height"`
	ZIndex *int     `json:"zIndex"`
	Layer  *string  `json:"layer"`
	Locked *bool    `json:"locked"`
}
