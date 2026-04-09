package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type RollStat struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty"         json:"id"`
	UserID      primitive.ObjectID  `bson:"userId"                json:"userId"`
	GameID      *primitive.ObjectID `bson:"gameId,omitempty"      json:"gameId,omitempty"`
	DieType     int                 `bson:"dieType"               json:"dieType"`
	Result      int                 `bson:"result"                json:"result"`
	RollType    string              `bson:"rollType"              json:"rollType"`
	CharacterID *primitive.ObjectID `bson:"characterId,omitempty" json:"characterId,omitempty"`
	Outcome     string              `bson:"outcome,omitempty"     json:"outcome,omitempty"`
	Timestamp   time.Time           `bson:"timestamp"             json:"timestamp"`
}
