package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type OnlineSession struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"          json:"id"`
	GameID    primitive.ObjectID `bson:"gameId"                 json:"gameId"`
	UserID    primitive.ObjectID `bson:"userId"                 json:"userId"`
	StartedAt time.Time          `bson:"startedAt"              json:"startedAt"`
	EndedAt   *time.Time         `bson:"endedAt,omitempty"      json:"endedAt,omitempty"`
	Duration  int64              `bson:"duration"               json:"duration"`
}
