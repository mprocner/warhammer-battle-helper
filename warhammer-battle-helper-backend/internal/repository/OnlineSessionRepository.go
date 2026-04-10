package repository

import (
	"battle-helper/internal/models"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type OnlineSessionRepository struct {
	collection *mongo.Collection
}

func NewOnlineSessionRepository(col *mongo.Collection) *OnlineSessionRepository {
	return &OnlineSessionRepository{collection: col}
}

func (r *OnlineSessionRepository) EnsureIndexes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := r.collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "gameId", Value: 1}, {Key: "userId", Value: 1}}},
		{Keys: bson.D{{Key: "endedAt", Value: 1}}, Options: options.Index().SetSparse(true)},
	}, options.CreateIndexes())
	return err
}

// Open creates a new online session if the user doesn't already have one open in this game.
func (r *OnlineSessionRepository) Open(gameID, userID primitive.ObjectID, startedAt time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	count, err := r.collection.CountDocuments(ctx, bson.M{
		"gameId":  gameID,
		"userId":  userID,
		"endedAt": nil,
	})
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	session := models.OnlineSession{
		GameID:    gameID,
		UserID:    userID,
		StartedAt: startedAt,
	}
	_, err = r.collection.InsertOne(ctx, session)
	return err
}

// Close ends the open session for a user in a game.
func (r *OnlineSessionRepository) Close(gameID, userID primitive.ObjectID, endedAt time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Find the open session to compute duration
	var session models.OnlineSession
	err := r.collection.FindOne(ctx, bson.M{
		"gameId":  gameID,
		"userId":  userID,
		"endedAt": nil,
	}).Decode(&session)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil
		}
		return err
	}

	duration := int64(endedAt.Sub(session.StartedAt).Seconds())
	if duration < 0 {
		duration = 0
	}

	_, err = r.collection.UpdateByID(ctx, session.ID, bson.M{
		"$set": bson.M{
			"endedAt":  endedAt,
			"duration": duration,
		},
	})
	return err
}

// CloseAll closes all orphaned sessions (crash recovery). Sets duration = 0.
func (r *OnlineSessionRepository) CloseAll() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()
	_, err := r.collection.UpdateMany(ctx, bson.M{"endedAt": nil}, bson.M{
		"$set": bson.M{
			"endedAt":  now,
			"duration": int64(0),
		},
	})
	return err
}

type OnlineStatsSummary struct {
	TotalSeconds int64 `json:"totalSeconds"`
	SessionCount int   `json:"sessionCount"`
}

// GetForGame returns aggregated online stats for a user in a specific game.
func (r *OnlineSessionRepository) GetForGame(ctx context.Context, gameID, userID primitive.ObjectID) (*OnlineStatsSummary, error) {
	return r.aggregate(ctx, bson.M{"gameId": gameID, "userId": userID})
}

// GetForUser returns aggregated online stats for a user across all games.
func (r *OnlineSessionRepository) GetForUser(ctx context.Context, userID primitive.ObjectID) (*OnlineStatsSummary, error) {
	return r.aggregate(ctx, bson.M{"userId": userID})
}

// aggregate runs the online stats aggregation pipeline with the given match filter.
// SessionCount groups by calendar day (UTC) so refreshes don't inflate the count.
func (r *OnlineSessionRepository) aggregate(ctx context.Context, matchFilter bson.M) (*OnlineStatsSummary, error) {
	now := time.Now()
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: matchFilter}},
		// Compute effective duration: use stored duration for closed sessions,
		// calculate (now - startedAt) in seconds for the active session.
		{{Key: "$addFields", Value: bson.M{
			"effectiveDuration": bson.M{
				"$cond": bson.A{
					"$endedAt", // truthy = closed session, falsy (null/missing) = active
					"$duration",
					bson.M{"$divide": bson.A{
						bson.M{"$subtract": bson.A{now, "$startedAt"}},
						1000, // milliseconds to seconds
					}},
				},
			},
		}}},
		// Group by game + calendar day to count unique session days per game
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"gameId": "$gameId",
				"day":    bson.M{"$dateToString": bson.M{"format": "%Y-%m-%d", "date": "$startedAt"}},
			},
			"daySeconds": bson.M{"$sum": "$effectiveDuration"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":          nil,
			"totalSeconds": bson.M{"$sum": "$daySeconds"},
			"sessionCount": bson.M{"$sum": 1},
		}}},
	}

	cur, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	if cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		return &OnlineStatsSummary{
			TotalSeconds: toInt64(raw["totalSeconds"]),
			SessionCount: int(toInt64(raw["sessionCount"])),
		}, nil
	}

	return &OnlineStatsSummary{}, nil
}

func toInt64(v any) int64 {
	switch n := v.(type) {
	case int32:
		return int64(n)
	case int64:
		return n
	case float64:
		return int64(n)
	}
	return 0
}
