package repository

import (
	"battle-helper/internal/models"
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SystemAccessRepository struct {
	collection *mongo.Collection
}

func NewSystemAccessRepository(col *mongo.Collection) *SystemAccessRepository {
	return &SystemAccessRepository{collection: col}
}

func (r *SystemAccessRepository) List(ctx context.Context) ([]models.SystemAccess, error) {
	cur, err := r.collection.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	var out []models.SystemAccess
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Get returns nil, nil when the system has no document — that is the "nobody" state,
// not an error.
func (r *SystemAccessRepository) Get(ctx context.Context, system string) (*models.SystemAccess, error) {
	var doc models.SystemAccess
	err := r.collection.FindOne(ctx, bson.M{"_id": system}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func (r *SystemAccessRepository) Upsert(ctx context.Context, system string, allUsers bool, userIDs []primitive.ObjectID) error {
	// A nil slice would be stored as null, and $pull fails on a non-array field.
	if userIDs == nil {
		userIDs = []primitive.ObjectID{}
	}
	_, err := r.collection.UpdateOne(ctx,
		bson.M{"_id": system},
		bson.M{"$set": bson.M{"allUsers": allUsers, "userIds": userIDs, "updatedAt": time.Now()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (r *SystemAccessRepository) PullUser(ctx context.Context, userID primitive.ObjectID) error {
	_, err := r.collection.UpdateMany(ctx,
		bson.M{"userIds": userID},
		bson.M{"$pull": bson.M{"userIds": userID}},
	)
	return err
}
