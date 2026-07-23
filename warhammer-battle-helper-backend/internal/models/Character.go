package models

import (
	"encoding/json"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Character is the unified model for all game systems.
// System-specific data lives in Stats as raw BSON, decoded by the appropriate plugin.
type Character struct {
	ID         primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	GameID     primitive.ObjectID   `bson:"gameId" json:"gameId"`
	GameSystem string               `bson:"gameSystem" json:"gameSystem"` // "warhammer4e" | "coc7e"
	CreatedBy  primitive.ObjectID   `bson:"createdBy" json:"createdBy"`
	VisibleTo  []primitive.ObjectID `bson:"visibleTo" json:"visibleTo"`
	IsNPC      bool                 `bson:"isNPC,omitempty" json:"isNPC,omitempty"`
	// Top-level common fields for grid display
	Name   string `bson:"name" json:"name"`
	Avatar string `bson:"avatar" json:"avatar"`
	// System-specific payload – stored and returned as raw JSON/BSON
	Stats  bson.Raw         `bson:"stats" json:"stats"`
	States []CharacterState `bson:"states,omitempty" json:"states,omitempty"`
	// Killed marks the character as dead — the token is struck through with a red X on the
	// map. Independent of the token overlay config; toggled via PATCH .../killed.
	Killed bool `bson:"killed,omitempty" json:"killed,omitempty"`
	// Manual per-token ring-slot/square values used to live here (TokenOverlay); they moved to the
	// placement (GameCharacter.TokenGear) so multiple placements of one card don't share values.
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

// MarshalJSON overrides default serialisation so that Stats (bson.Raw) is
// emitted as plain JSON instead of MongoDB Extended JSON (which wraps numbers
// in {"$numberDouble":"0"} and breaks the frontend).
func (ch Character) MarshalJSON() ([]byte, error) {
	var statsJSON json.RawMessage
	if len(ch.Stats) > 0 {
		// relaxed=true → plain numbers; canonical=false; escapeHTML=false
		b, err := bson.MarshalExtJSON(ch.Stats, false, false)
		if err == nil {
			statsJSON = json.RawMessage(b)
		}
	}
	if statsJSON == nil {
		statsJSON = json.RawMessage("{}")
	}

	return json.Marshal(struct {
		ID         primitive.ObjectID   `json:"id"`
		GameID     primitive.ObjectID   `json:"gameId"`
		GameSystem string               `json:"gameSystem"`
		CreatedBy  primitive.ObjectID   `json:"createdBy"`
		VisibleTo  []primitive.ObjectID `json:"visibleTo"`
		IsNPC      bool                 `json:"isNPC,omitempty"`
		Name       string               `json:"name"`
		Avatar     string               `json:"avatar"`
		Stats      json.RawMessage      `json:"stats"`
		States     []CharacterState     `json:"states,omitempty"`
		Killed     bool                 `json:"killed,omitempty"`
		CreatedAt  time.Time            `json:"createdAt"`
		UpdatedAt  time.Time            `json:"updatedAt"`
	}{
		ID:         ch.ID,
		GameID:     ch.GameID,
		GameSystem: ch.GameSystem,
		CreatedBy:  ch.CreatedBy,
		VisibleTo:  ch.VisibleTo,
		IsNPC:      ch.IsNPC,
		Name:       ch.Name,
		Avatar:     ch.Avatar,
		Stats:      statsJSON,
		States:     ch.States,
		Killed:     ch.Killed,
		CreatedAt:  ch.CreatedAt,
		UpdatedAt:  ch.UpdatedAt,
	})
}

// CharacterState is a generic condition/status (used by all systems).
type CharacterState struct {
	Name  string `bson:"name" json:"name"`
	Level int    `bson:"level" json:"level"`
}

// TokenOverlayValue is the live, per-character value for a manual (non-field-bound)
// ring slot or square (FEATURE-102). Only the field matching the slot's current Type
// is read, so a stale value left behind by a slot-type change is harmless.
type TokenOverlayValue struct {
	Number *float64 `bson:"number,omitempty" json:"number,omitempty"`
	Select string   `bson:"select,omitempty" json:"select,omitempty"`
}
