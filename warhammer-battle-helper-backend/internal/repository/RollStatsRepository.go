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

type RollStatsRepository struct {
	collection *mongo.Collection
}

func NewRollStatsRepository(col *mongo.Collection) *RollStatsRepository {
	return &RollStatsRepository{collection: col}
}

func (r *RollStatsRepository) EnsureIndexes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := r.collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "gameId", Value: 1}, {Key: "userId", Value: 1}, {Key: "timestamp", Value: -1}}},
	}, options.CreateIndexes())
	return err
}

func (r *RollStatsRepository) Record(stat *models.RollStat) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	stat.Timestamp = time.Now()
	_, err := r.collection.InsertOne(ctx, stat)
	return err
}

// DiceSummary holds aggregated stats for one die type.
type DiceSummary struct {
	DieType     int            `json:"dieType"`
	Total       int            `json:"total"`
	Average     float64        `json:"average"`
	CritCount   int            `json:"critCount"`
	FumbleCount int            `json:"fumbleCount"`
	Buckets     []int          `json:"buckets"`
	ByOutcome   map[string]int `json:"byOutcome,omitempty"`
}

func (r *RollStatsRepository) GetForGame(ctx context.Context, gameID, userID primitive.ObjectID) ([]DiceSummary, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"gameId": gameID, "userId": userID}}},
		{{Key: "$group", Value: bson.M{
			"_id":         "$dieType",
			"total":       bson.M{"$sum": 1},
			"sum":         bson.M{"$sum": "$result"},
			"outcomes":    bson.M{"$push": "$outcome"},
			"results":     bson.M{"$push": "$result"},
			"critCount":   bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$result", 1}}, 1, 0}}},
			"fumbleCount": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$result", 100}}, 1, 0}}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: -1}}}},
	}
	return r.aggregate(ctx, pipeline)
}

func (r *RollStatsRepository) GetForUser(ctx context.Context, userID primitive.ObjectID) ([]DiceSummary, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"userId": userID}}},
		{{Key: "$group", Value: bson.M{
			"_id":         "$dieType",
			"total":       bson.M{"$sum": 1},
			"sum":         bson.M{"$sum": "$result"},
			"outcomes":    bson.M{"$push": "$outcome"},
			"results":     bson.M{"$push": "$result"},
			"critCount":   bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$result", 1}}, 1, 0}}},
			"fumbleCount": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$result", 100}}, 1, 0}}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: -1}}}},
	}
	return r.aggregate(ctx, pipeline)
}

func (r *RollStatsRepository) aggregate(ctx context.Context, pipeline mongo.Pipeline) ([]DiceSummary, error) {
	cur, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []DiceSummary
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			continue
		}
		summary := DiceSummary{
			DieType:     toInt(raw["_id"]),
			Total:       toInt(raw["total"]),
			CritCount:   toInt(raw["critCount"]),
			FumbleCount: toInt(raw["fumbleCount"]),
			ByOutcome:   map[string]int{},
		}
		if total := summary.Total; total > 0 {
			summary.Average = toFloat(raw["sum"]) / float64(total)
		}
		if outcomes, ok := raw["outcomes"].(bson.A); ok {
			for _, o := range outcomes {
				if s, ok := o.(string); ok && s != "" {
					summary.ByOutcome[s]++
				}
			}
		}
		if len(summary.ByOutcome) == 0 {
			summary.ByOutcome = nil
		}
		if results, ok := raw["results"].(bson.A); ok {
			summary.Buckets = computeBuckets(results, summary.DieType)
		}
		results = append(results, summary)
	}
	return results, cur.Err()
}

func toInt(v any) int {
	switch n := v.(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	}
	return 0
}

func toFloat(v any) float64 {
	switch n := v.(type) {
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case float64:
		return n
	}
	return 0
}

// computeBuckets distributes raw roll results into histogram buckets.
// d100: 10 buckets of 10 (1-10, 11-20, …, 91-100)
// dieType ≤ 12: one bucket per face (d4, d6, d8, d10, d12)
// dieType > 12 (d20, d100 handled above): 4 equal buckets
func computeBuckets(results bson.A, dieType int) []int {
	var numBuckets int
	switch {
	case dieType == 100:
		numBuckets = 10
	case dieType <= 12:
		numBuckets = dieType
	default:
		numBuckets = 4
	}

	buckets := make([]int, numBuckets)
	bucketSize := float64(dieType) / float64(numBuckets)

	for _, r := range results {
		v := toInt(r)
		if v < 1 || v > dieType {
			continue
		}
		idx := int(float64(v-1) / bucketSize)
		if idx >= numBuckets {
			idx = numBuckets - 1
		}
		buckets[idx]++
	}
	return buckets
}
