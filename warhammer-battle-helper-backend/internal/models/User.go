package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// UserFile represents an uploaded file in the user's files repository
type UserFile struct {
	ID        primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Name      string              `bson:"name" json:"name"`
	FileURL   string              `bson:"fileUrl" json:"fileUrl"`
	FolderID  *primitive.ObjectID `bson:"folderId,omitempty" json:"folderId,omitempty"`
	MimeType  string              `bson:"mimeType" json:"mimeType"`
	Size      int64               `bson:"size" json:"size"`
	CreatedAt time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time           `bson:"updatedAt" json:"updatedAt"`
}

// UserFolder represents a folder in the user's files repository
type UserFolder struct {
	ID        primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	Name      string              `bson:"name" json:"name"`
	ParentID  *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	CreatedAt time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time           `bson:"updatedAt" json:"updatedAt"`
}

type UserSettings struct {
	SceneControlScheme string `bson:"sceneControlScheme,omitempty" json:"sceneControlScheme,omitempty"`
}

type User struct {
	ID               primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email            string             `bson:"email" json:"email"`
	IsAdmin          bool               `bson:"isAdmin,omitempty" json:"isAdmin,omitempty"`
	Password         string             `bson:"password" json:"-"`
	Active           bool               `bson:"active" json:"-"`
	ActivationToken  string             `bson:"activationToken" json:"-"`
	ResetToken       string             `bson:"resetToken,omitempty" json:"-"`
	ResetTokenExpiry time.Time          `bson:"resetTokenExpiry,omitempty" json:"-"`
	Avatar           string             `bson:"avatar,omitempty" json:"avatar,omitempty"`
	Signature        string             `bson:"signature,omitempty" json:"signature,omitempty"`
	Files            []UserFile         `bson:"files" json:"files"`
	Folders          []UserFolder       `bson:"folders" json:"folders"`
	Music            []MusicFile        `bson:"music" json:"music"`
	MusicFolders     []MusicFolder      `bson:"musicFolders" json:"musicFolders"`
	Playlists        []Playlist         `bson:"playlists" json:"playlists"`
	Settings         UserSettings       `bson:"settings,omitempty" json:"settings,omitempty"`
}
