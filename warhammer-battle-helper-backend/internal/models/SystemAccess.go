package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SystemAccess says who may create games in one hardcoded system. The system key is the
// document id, so there is at most one document per system. A missing document means
// nobody has access (fail-closed).
type SystemAccess struct {
	System    string               `bson:"_id"`
	AllUsers  bool                 `bson:"allUsers"`
	UserIDs   []primitive.ObjectID `bson:"userIds"`
	UpdatedAt time.Time            `bson:"updatedAt"`
}
