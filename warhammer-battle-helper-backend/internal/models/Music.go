package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MusicFile represents an uploaded music file in the user's music library
type MusicFile struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	FileURL   string             `bson:"fileUrl" json:"fileUrl"`
	MimeType  string             `bson:"mimeType" json:"mimeType"`
	Size      int64              `bson:"size" json:"size"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

// Playlist represents a music playlist
type Playlist struct {
	ID        primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name      string               `bson:"name" json:"name"`
	Tracks    []primitive.ObjectID `bson:"tracks" json:"tracks"`
	CreatedAt time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time            `bson:"updatedAt" json:"updatedAt"`
}
