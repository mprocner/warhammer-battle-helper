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

type User struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email    string             `bson:"email" json:"email"`
	Password string             `bson:"password" json:"-"`
	Files    []UserFile         `bson:"files" json:"files"`
	Folders  []UserFolder       `bson:"folders" json:"folders"`
}
