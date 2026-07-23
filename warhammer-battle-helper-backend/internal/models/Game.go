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

// MusicState holds the persistent music playback state for a game session.
// Stored in MongoDB as part of the Game document.
type MusicState struct {
	IsPlaying             bool               `bson:"isPlaying" json:"isPlaying"`
	TrackURL              string             `bson:"trackUrl,omitempty" json:"trackUrl,omitempty"`
	TrackName             string             `bson:"trackName,omitempty" json:"trackName,omitempty"`
	TrackId               primitive.ObjectID `bson:"trackId,omitempty" json:"trackId,omitempty"`
	PlaylistId            string             `bson:"playlistId,omitempty" json:"playlistId,omitempty"`
	TrackIndex            int                `bson:"trackIndex" json:"trackIndex"`
	CurrentTrackStartedAt time.Time          `bson:"currentTrackStartedAt,omitempty" json:"currentTrackStartedAt,omitempty"`
	Loop                  bool               `bson:"loop" json:"loop"`
	Volume                float64            `bson:"volume" json:"volume"`
	Version               int64              `bson:"version" json:"version"`
	// Position is stored when paused; overwritten on read when IsPlaying=true.
	Position float64 `bson:"position,omitempty" json:"position,omitempty"`
}

// Game represents a game session
type Game struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name                 string             `bson:"name" json:"name"`
	GameSystem           string             `bson:"gameSystem" json:"gameSystem"` // "warhammer4e" | "coc7e"
	GameMasterID         primitive.ObjectID `bson:"gameMasterId" json:"gameMasterId"`
	GameMasterEmail      string             `bson:"-" json:"gameMasterEmail,omitempty"`
	Status               GameStatus         `bson:"status" json:"status"`
	Participants         []GameParticipant  `bson:"participants" json:"participants"`
	Characters           []GameCharacter    `bson:"characters" json:"characters"`
	Events               []GameEvent        `bson:"events" json:"events"`
	Handouts             []Handout          `bson:"handouts" json:"handouts"`
	HandoutFolders       []HandoutFolder    `bson:"handoutFolders" json:"handoutFolders"`
	Notes                []Note             `bson:"notes" json:"notes"`
	Scenes               []Scene            `bson:"scenes" json:"scenes"`
	Music                MusicState         `bson:"music" json:"music"`
	CustomSystemTemplate *SystemTemplate    `bson:"customSystemTemplate,omitempty" json:"customSystemTemplate,omitempty"`
	TemplateSourceID     primitive.ObjectID `bson:"templateSourceId,omitempty" json:"templateSourceId,omitempty"`
	ImageUrl             string             `bson:"imageUrl,omitempty" json:"imageUrl,omitempty"` // lobby tile image, e.g. "/user-files/<name>.jpg"
	MapSettings          MapSettings        `bson:"mapSettings" json:"mapSettings"`               // per-game map rules (snap/free, distance metric)
	CreatedAt            time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt            time.Time          `bson:"updatedAt" json:"updatedAt"`
	DeletedAt            *time.Time         `bson:"deletedAt,omitempty" json:"-"`
}

// MapSettings holds per-game rules for the scene map, configured by the GM in GeneralTab.
// These are a shared session truth (unlike per-user controlScheme): if the GM sets "free"
// placement, every player must see the same token positions and the same "5 cells" reading.
// Zero-value ("") means the default — the frontend reads "" as "snap" / "euclidean".
type MapSettings struct {
	TokenPlacementMode string  `bson:"tokenPlacementMode" json:"tokenPlacementMode"`     // "snap" | "free"
	MeasurementMetric  string  `bson:"measurementMetric" json:"measurementMetric"`       // "euclidean" | "chebyshev" | "alternating"
	CellDistance       float64 `bson:"cellDistance" json:"cellDistance"`                 // real-world size of one cell (front defaults 5 when 0)
	DistanceUnit       string  `bson:"distanceUnit" json:"distanceUnit"`                 // "ft" | "m" | "km" | "mi" | "in" | "cm" | "un" | "hex" | "sq" | "custom"
	CustomUnit         string  `bson:"customUnit,omitempty" json:"customUnit,omitempty"` // free-text label when distanceUnit == "custom"
}

// UpdateMapSettingsRequest is a partial update — only provided fields are changed.
type UpdateMapSettingsRequest struct {
	TokenPlacementMode *string  `json:"tokenPlacementMode,omitempty"`
	MeasurementMetric  *string  `json:"measurementMetric,omitempty"`
	CellDistance       *float64 `json:"cellDistance,omitempty"`
	DistanceUnit       *string  `json:"distanceUnit,omitempty"`
	CustomUnit         *string  `json:"customUnit,omitempty"`
}

// GameParticipant represents a user participating in a game
type GameParticipant struct {
	UserID             primitive.ObjectID `bson:"userId" json:"userId"`
	Username           string             `bson:"username" json:"username"`
	Email              string             `bson:"email" json:"email"`
	Role               ParticipantRole    `bson:"role" json:"role"`
	JoinedAt           time.Time          `bson:"joinedAt" json:"joinedAt"`
	Avatar             string             `bson:"avatar,omitempty" json:"avatar,omitempty"`
	AvatarType         string             `bson:"avatarType,omitempty" json:"avatarType,omitempty"`
	AvatarCharacterId  string             `bson:"avatarCharacterId,omitempty" json:"avatarCharacterId,omitempty"`
	AvatarCharacterUrl string             `bson:"-" json:"avatarCharacterUrl,omitempty"`
	Signature          string             `bson:"signature,omitempty" json:"signature,omitempty"`
	AvatarSize         string             `bson:"avatarSize,omitempty" json:"avatarSize,omitempty"`
	ShowSignature      bool               `bson:"showSignature,omitempty" json:"showSignature,omitempty"`
	AccountAvatar      string             `bson:"-" json:"accountAvatar,omitempty"`
	AccountSignature   string             `bson:"-" json:"accountSignature,omitempty"`
	NoteOrder          []string           `bson:"noteOrder,omitempty" json:"noteOrder,omitempty"`
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
	PositionX   float64            `bson:"positionX" json:"positionX"` // col in cells; float so "free" mode can be fractional
	PositionY   float64            `bson:"positionY" json:"positionY"` // row in cells
	W           float64            `bson:"w" json:"w"`                 // width in cells (default 1; adapter falls back for old docs)
	H           float64            `bson:"h" json:"h"`                 // height in cells (default 1)
	ZIndex      int                `bson:"zIndex" json:"zIndex"`       // shared stacking with scene images
	IsEnemy     bool               `bson:"isEnemy" json:"isEnemy"`
	// Hidden hides this token placement from players who don't hold the character card (VisibleTo).
	// Token visibility is deliberately separate from card visibility: a card-holder always sees the
	// token; for everyone else this flag decides. Enforced server-side (FilterSceneCharacterTokensForUser).
	Hidden bool `bson:"hidden,omitempty" json:"hidden,omitempty"`
	// Killed is computed-only (bson:"-"): enriched from Character.Killed so the token can render the
	// dead strike-through even for a card-less player, who never receives the Character document.
	Killed    bool               `bson:"-" json:"killed,omitempty"`
	PlacedBy  primitive.ObjectID `bson:"placedBy" json:"placedBy"`
	PlacedAt  time.Time          `bson:"placedAt" json:"placedAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`

	// TokenGear is this placement's per-token customization of the blueprint (GM-only). Absent/nil =
	// the token follows the blueprint everywhere. Lives on the placement, NOT the Character, because
	// one card can have several placements that must not share gear.
	TokenGear *CharacterTokenGear `bson:"tokenGear,omitempty" json:"tokenGear,omitempty"`
	// TokenView is computed-only (never persisted): the masked projection sent to a viewer without the
	// card. Populated by FilterSceneCharacterTokensForUser; nil for GM/card-holders (they get the full
	// Character + raw TokenGear).
	TokenView *CharacterTokenView `bson:"-" json:"tokenView,omitempty"`
}

// CharacterTokenGear is the per-token (per-placement) gear. Two shapes for the two structures it
// customizes: slots use a per-ring-POSITION overlay (the ring is a fixed 8 positions, so a per-token
// customization can only REPLACE one, never add a 9th), bars use an append model (a bar list has no
// fixed capacity). This asymmetry is intentional. GM-only to edit; purely additive.
type CharacterTokenGear struct {
	// SlotOverrides: per-ring-position overlay, keyed by the BLUEPRINT slot's stable id at that
	// position (TokenSlot.ID is the position's permanent identity). Also keyed by square id for
	// square visibility overrides. Presence = this token customizes something at that position; the
	// three axes inside are independently optional.
	SlotOverrides map[string]SlotOverride `bson:"slotOverrides,omitempty" json:"slotOverrides,omitempty"`

	// BarOverrides: per-token visibility override for a blueprint bar (keyed by bar id). BarValues:
	// manual current/max for a bar (blueprint manual bar or an AddedBar), keyed by bar id (shared
	// id-space). AddedBars: full bar definitions existing ONLY on this token.
	BarOverrides map[string]bool       `bson:"barOverrides,omitempty" json:"barOverrides,omitempty"`
	BarValues    map[string]HPBarValue `bson:"barValues,omitempty" json:"barValues,omitempty"`
	AddedBars    []TokenHPBar          `bson:"addedBars,omitempty" json:"addedBars,omitempty"`
}

// SlotOverride is everything a token can customize at one ring position, each axis independently
// optional: Slot (nil = keep blueprint's slot; non-nil = per-token replacement), Hidden (nil =
// inherit effective slot's DefaultHidden; non-nil = forced), Value (manual number/select value).
type SlotOverride struct {
	Slot   *TokenSlot         `bson:"slot,omitempty" json:"slot,omitempty"`
	Hidden *bool              `bson:"hidden,omitempty" json:"hidden,omitempty"`
	Value  *TokenOverlayValue `bson:"value,omitempty" json:"value,omitempty"`
}

// HPBarValue is a manual bar's per-token current/max.
type HPBarValue struct {
	Current float64 `bson:"current" json:"current"`
	Max     float64 `bson:"max" json:"max"`
}

// CharacterTokenView is the FULLY-RESOLVED masked projection of a character's token sent to a viewer
// without the card, scoped to ONE placement. Never persisted (json-only DTO). Deliberately baked
// server-side (values already resolved, not raw stats + client-side field resolution) so a card-less
// viewer only ever receives the exact visible display values — never a raw stats subtree, and never
// the definition/value of a hidden element. The client renders it verbatim: no blueprint lookup, no
// visibility recomputation, zero client/server masking drift.
type CharacterTokenView struct {
	// Slots: exactly 8 entries (ring positions). A nil entry = nothing renders at that position
	// (hidden or empty on this token). A non-nil entry carries the effective slot definition + its
	// resolved display value (nil Value for icon slots — those read level from States).
	Slots   []*TokenViewSlot `json:"slots,omitempty"`
	Squares []TokenViewCell  `json:"squares,omitempty"` // visible squares, resolved
	Bars    []TokenViewBar   `json:"bars,omitempty"`    // visible HP bars, resolved (current/max baked)
	States  []CharacterState `json:"states,omitempty"`  // filtered to visible icon-slot conditions only
}

// TokenViewSlot is one visible ring position for a card-less viewer: the effective slot definition
// plus its already-resolved display value (icon slots leave Value nil and use States for level).
type TokenViewSlot struct {
	Slot  *TokenSlot  `json:"slot"`
	Value interface{} `json:"value,omitempty"`
}

// TokenViewCell is one visible square, resolved.
type TokenViewCell struct {
	ID      string      `json:"id"`
	Caption string      `json:"caption,omitempty"`
	Value   interface{} `json:"value,omitempty"`
}

// TokenViewBar is one visible HP bar, fully resolved (current/max are the final numbers, whether the
// bar was field-bound or manual — the card-less client never sees which, nor the underlying stat).
type TokenViewBar struct {
	ID      string  `json:"id"`
	Label   string  `json:"label,omitempty"`
	Color   string  `json:"color,omitempty"`
	Current float64 `json:"current"`
	Max     float64 `json:"max"`
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
	ID           primitive.ObjectID     `bson:"_id,omitempty" json:"id"`
	Type         EventType              `bson:"type" json:"type"`
	Data         map[string]interface{} `bson:"data" json:"data"`
	CreatedBy    primitive.ObjectID     `bson:"createdBy" json:"createdBy"`
	Username     string                 `bson:"username" json:"username"`
	Visibility   string                 `bson:"visibility" json:"visibility"`     // "all" | "gm_and_roller" | "gm_only"
	RollerUserID primitive.ObjectID     `bson:"rollerUserId" json:"rollerUserId"` // who triggered the roll
	CreatedAt    time.Time              `bson:"createdAt" json:"createdAt"`
}

// CreateGameRequest is the request body for creating a new game
type CreateGameRequest struct {
	Name             string `json:"name" binding:"required"`
	GameSystem       string `json:"gameSystem" binding:"required"`
	CustomTemplateID string `json:"customTemplateId,omitempty"` // required when gameSystem="custom"
}

// JoinGameRequest is the request body for joining a game
type JoinGameRequest struct {
	GameID string `json:"gameId" binding:"required"`
}

// MoveCharacterRequest is the request body for moving a character (legacy top-level grid).
type MoveCharacterRequest struct {
	CharacterID string `json:"characterId" binding:"required"`
	PositionX   int    `json:"positionX"`
	PositionY   int    `json:"positionY"`
}

// UpdateSceneCharacterRequest is a partial geometry update for a scene token (position and/or
// size). Mirrors UpdateSceneImageRequest — only provided fields are changed.
type UpdateSceneCharacterRequest struct {
	PositionX *float64 `json:"positionX,omitempty"`
	PositionY *float64 `json:"positionY,omitempty"`
	W         *float64 `json:"w,omitempty"`
	H         *float64 `json:"h,omitempty"`
	ZIndex    *int     `json:"zIndex,omitempty"`
	Hidden    *bool    `json:"hidden,omitempty"`
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
	Layer     string             `bson:"layer" json:"layer"` // "background" | "gm" | "tokens"
	X         float64            `bson:"x" json:"x"`
	Y         float64            `bson:"y" json:"y"`
	Width     float64            `bson:"width" json:"width"`
	Height    float64            `bson:"height" json:"height"`
	ZIndex    int                `bson:"zIndex" json:"zIndex"`
	Locked    bool               `bson:"locked" json:"locked"`
	Rotation  float64            `bson:"rotation" json:"rotation"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`

	// Killed marks a tokens-layer image as dead (red strike-through), like Character.Killed.
	// Independent of TokenOverlay — a token can be killed with no ring configured.
	Killed bool `bson:"killed,omitempty" json:"killed,omitempty"`

	// Hidden hides a tokens-layer image from players (GM-only visibility). The server never sends
	// a hidden token to a non-GM (see FilterSceneImageTokensForUser); the GM sees it dimmed. This
	// is the image-token analogue of Character.VisibleTo (characters use a per-player allow-list).
	Hidden bool `bson:"hidden,omitempty" json:"hidden,omitempty"`

	// TokenOverlay is the self-contained states/HP ring for an image on the "tokens" layer.
	// Unlike the character overlay (TokenDisplayConfig layout kept separate from Character.States/
	// TokenOverlay live values), config and live values are NOT split here: an image-token's
	// overlay is never shared across documents, so there is nothing to decouple. nil/absent = the
	// image carries no overlay (the default for background/gm images and for a tokens-layer image
	// the GM has not configured yet).
	TokenOverlay *ImageTokenOverlay `bson:"tokenOverlay,omitempty" json:"tokenOverlay,omitempty"`
}

// ImageTokenOverlay is the states/HP ring attached directly to one SceneImage. Every field here
// is both "layout" and "live value" at once (see SceneImage.TokenOverlay).
type ImageTokenOverlay struct {
	Enabled bool              `bson:"enabled" json:"enabled"`
	HPBars  []ImageTokenHPBar `bson:"hpBars,omitempty" json:"hpBars,omitempty"`
	Slots   []ImageTokenSlot  `bson:"slots,omitempty" json:"slots,omitempty"` // ring, ordered; angle = index (-90 + i*45)
}

// ImageTokenHPBar is one HP/resource bar on the token (the "multiple HP bars" requirement).
// Current/Max are stored as plain values — there is no stats document to bind to, unlike the
// character overlay's FieldBinding HP bar. Hidden masks the values from players (see
// service.MaskImageTokenForPlayer); Color is an accent on the label chip so stacked bars stay
// distinguishable.
type ImageTokenHPBar struct {
	ID      string  `bson:"id" json:"id"`
	Label   string  `bson:"label" json:"label"`
	Current float64 `bson:"current" json:"current"`
	Max     float64 `bson:"max" json:"max"`
	Color   string  `bson:"color,omitempty" json:"color,omitempty"`
	Hidden  bool    `bson:"hidden,omitempty" json:"hidden,omitempty"`
}

// ImageTokenSlot is one ring position: a condition icon (with a live level) or a manual number
// chip (with a live value). No "field"/"select" types — images have no stats to bind to.
// ConditionKey follows the same generated-once, rename-safe rule as TokenSlot.ConditionKey.
type ImageTokenSlot struct {
	ID             string  `bson:"id" json:"id"`
	Type           string  `bson:"type" json:"type"` // "icon" | "number"
	Icon           string  `bson:"icon,omitempty" json:"icon,omitempty"`
	ConditionKey   string  `bson:"conditionKey,omitempty" json:"conditionKey,omitempty"`
	ConditionLabel string  `bson:"conditionLabel,omitempty" json:"conditionLabel,omitempty"`
	Level          int     `bson:"level,omitempty" json:"level,omitempty"` // 0 = inactive
	NumberLabel    string  `bson:"numberLabel,omitempty" json:"numberLabel,omitempty"`
	Number         float64 `bson:"number,omitempty" json:"number,omitempty"`
	Hidden         bool    `bson:"hidden,omitempty" json:"hidden,omitempty"` // hidden from players (masked to empty)
	// Locked = this ring position is shared across every tokens-layer image in the scene: its
	// config is identical everywhere and editing it propagates to all. The live value
	// (Level/Number) stays per-token. All tokens at this position carry the same Locked value.
	Locked bool `bson:"locked,omitempty" json:"locked,omitempty"`
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
	SceneMusicId    string               `bson:"sceneMusicId,omitempty" json:"sceneMusicId,omitempty"`
	SceneMusicType  string               `bson:"sceneMusicType,omitempty" json:"sceneMusicType,omitempty"`
	SceneMusicName  string               `bson:"sceneMusicName,omitempty" json:"sceneMusicName,omitempty"`
	SceneMusicLoop  bool                 `bson:"sceneMusicLoop" json:"sceneMusicLoop"`
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

// Note represents a note created by a game participant
type Note struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Title     string             `bson:"title"         json:"title"`
	Content   string             `bson:"content"       json:"content"`
	IsPrivate bool               `bson:"isPrivate"     json:"isPrivate"`
	CreatorID primitive.ObjectID `bson:"creatorId"     json:"creatorId"`
	CreatedAt time.Time          `bson:"createdAt"     json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt"     json:"updatedAt"`
}

// CreateNoteRequest is the request body for creating a new note
type CreateNoteRequest struct {
	Title     string `json:"title" binding:"required"`
	Content   string `json:"content"`
	IsPrivate bool   `json:"isPrivate"`
}

// UpdateNoteRequest is the request body for updating a note
type UpdateNoteRequest struct {
	Title     *string `json:"title"`
	Content   *string `json:"content"`
	IsPrivate *bool   `json:"isPrivate"`
}

// ReorderNotesRequest is the request body for reordering notes
type ReorderNotesRequest struct {
	NoteIDs []string `json:"noteIds" binding:"required"`
}

// CreateSceneRequest is the request body for creating a new scene
type CreateSceneRequest struct {
	Name       string `json:"name" binding:"required"`
	GridWidth  int    `json:"gridWidth"`
	GridHeight int    `json:"gridHeight"`
}

// UpdateSceneRequest is the request body for updating a scene
type UpdateSceneRequest struct {
	Name           *string `json:"name"`
	GridVisible    *bool   `json:"gridVisible"`
	GridWidth      *int    `json:"gridWidth"`
	GridHeight     *int    `json:"gridHeight"`
	SceneMusicId   *string `json:"sceneMusicId"`
	SceneMusicType *string `json:"sceneMusicType"`
	SceneMusicName *string `json:"sceneMusicName"`
	SceneMusicLoop *bool   `json:"sceneMusicLoop"`
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
	X        *float64 `json:"x,omitempty"`
	Y        *float64 `json:"y,omitempty"`
	Width    *float64 `json:"width,omitempty"`
	Height   *float64 `json:"height,omitempty"`
	ZIndex   *int     `json:"zIndex,omitempty"`
	Layer    *string  `json:"layer,omitempty"`
	Locked   *bool    `json:"locked,omitempty"`
	Rotation *float64 `json:"rotation,omitempty"`
	Killed   *bool    `json:"killed,omitempty"`
	Hidden   *bool    `json:"hidden,omitempty"`
	// TokenOverlay replaces the whole overlay layout+values in one shot. Used by the GM's config
	// panel (add/remove/rename slots and HP bars); frequent per-play value bumps go through the
	// atomic PATCH .../tokenOverlay/hp|slot endpoints instead.
	TokenOverlay *ImageTokenOverlay `json:"tokenOverlay,omitempty"`
}

// PatchImageTokenHPRequest steps or sets one HP bar's current value. Exactly one of Delta/Value
// is expected (delta = relative +/-, value = absolute); mirrors PatchStatFieldRequest.
type PatchImageTokenHPRequest struct {
	BarID string   `json:"barId" binding:"required"`
	Delta *float64 `json:"delta,omitempty"`
	Value *float64 `json:"value,omitempty"`
}

// PatchImageTokenSlotRequest bumps an icon slot's level (Delta) or sets a number slot's value
// (Number). Exactly one is expected, matching the slot's type.
type PatchImageTokenSlotRequest struct {
	SlotID string   `json:"slotId" binding:"required"`
	Delta  *int     `json:"delta,omitempty"`
	Number *float64 `json:"number,omitempty"`
}

// DuplicateSceneImageRequest asks for Count copies of a scene image, placed next to the original.
type DuplicateSceneImageRequest struct {
	Count int `json:"count"`
}

// ApplyImageTokenSlotRequest shares (or unshares) one ring position across every tokens-layer
// image in the scene. Locked=true applies Slot's config to that position on all tokens (keeping
// each token's own slot id, resetting the live Level/Number) and marks it locked. Locked=false
// just clears the locked flag at that position on all tokens (config/values kept). Slot is
// required only when Locked is true.
type ApplyImageTokenSlotRequest struct {
	Position int             `json:"position"`
	Locked   bool            `json:"locked"`
	Slot     *ImageTokenSlot `json:"slot,omitempty"`
}
