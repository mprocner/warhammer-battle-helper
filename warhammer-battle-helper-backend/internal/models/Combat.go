package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Combat entry kinds.
const (
	CombatEntryCharacter = "character" // SourceID = GameCharacter.ID (the scene placement)
	CombatEntryImage     = "image"     // SourceID = SceneImage.ID
	CombatEntryManual    = "manual"    // no token; Name + Initiative only
)

// Combat is one scene's initiative tracker. It is embedded in Scene with json:"-": the raw Game is
// serialized to players and to the lobby list, so the tracker leaves the server only through the
// per-viewer masked view (service.BuildCombatView).
type Combat struct {
	// Version grows by one on every write; a write only lands if the stored version is the one it
	// read (repository.SaveSceneCombat). Two clicks racing on the same state cannot both apply.
	Version int `bson:"version"`
	Round   int `bson:"round"`
	// ActiveID is the entry whose turn it is; zero = nobody.
	ActiveID primitive.ObjectID `bson:"activeId,omitempty"`
	// LastVisibleActiveID is the last non-hidden entry that was active. Players see it as active
	// while a hidden entry acts, so a hidden turn never shows up for them.
	LastVisibleActiveID primitive.ObjectID `bson:"lastVisibleActiveId,omitempty"`
	// VisibleToPlayers=false hides the whole tracker (GM preparation).
	VisibleToPlayers bool          `bson:"visibleToPlayers"`
	Entries          []CombatEntry `bson:"entries"` // display order
	StartedAt        time.Time     `bson:"startedAt"`
}

// CombatEntry is one participant. Character name/avatar/killed are resolved live from the
// character document; image entries keep their own Name because SceneImage has none.
type CombatEntry struct {
	ID         primitive.ObjectID `bson:"_id"`
	Kind       string             `bson:"kind"`
	SourceID   primitive.ObjectID `bson:"sourceId,omitempty"`
	Name       string             `bson:"name"`
	Initiative int                `bson:"initiative"`
	Acted      bool               `bson:"acted"`
	// Hidden hides this entry from players. Independent of the token's own Hidden flag.
	Hidden bool `bson:"hidden"`
}

type CombatSourceRequest struct {
	Kind       string `json:"kind" binding:"required,oneof=character image manual"`
	SourceID   string `json:"sourceId"`
	Name       string `json:"name"`
	Initiative int    `json:"initiative"`
	Hidden     bool   `json:"hidden"`
}

type AddCombatEntriesRequest struct {
	Entries []CombatSourceRequest `json:"entries" binding:"required,min=1,dive"`
}

type UpdateCombatEntryRequest struct {
	Name       *string `json:"name"`
	Initiative *int    `json:"initiative"`
	Acted      *bool   `json:"acted"`
	Hidden     *bool   `json:"hidden"`
}

type UpdateCombatRequest struct {
	VisibleToPlayers *bool `json:"visibleToPlayers"`
}

type ReorderCombatRequest struct {
	EntryIDs []string `json:"entryIds" binding:"required"`
}

type CombatEntryRefRequest struct {
	EntryID string `json:"entryId" binding:"required"`
}

// NextTurnRequest names the entry the caller believes is active ("" = nobody), so a double click
// cannot skip a participant.
type NextTurnRequest struct {
	AfterEntryID string `json:"afterEntryId"`
}
