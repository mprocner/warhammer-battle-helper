package repository

import (
	"battle-helper/internal/models"
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type DrawingRepository struct {
	Collection *mongo.Collection
}

func NewDrawingRepository(collection *mongo.Collection) *DrawingRepository {
	return &DrawingRepository{Collection: collection}
}

// AddDrawingPaths appends drawing paths to a scene's drawingPaths array in one $push.
func (r *DrawingRepository) AddDrawingPaths(gameID string, sceneID primitive.ObjectID, paths []models.DrawingPath) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	// Initialize drawingPaths to [] if null (scenes created before this field was added)
	initFilter := bson.M{
		"_id": objectID,
		"scenes": bson.M{
			"$elemMatch": bson.M{"_id": sceneID, "drawingPaths": nil},
		},
	}
	r.Collection.UpdateOne(ctx, initFilter, bson.M{"$set": bson.M{"scenes.$.drawingPaths": bson.A{}}}) //nolint

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$push": bson.M{"scenes.$.drawingPaths": bson.M{"$each": paths}},
		"$set":  bson.M{"scenes.$.updatedAt": time.Now(), "updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add drawing paths: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// RemoveDrawingPaths removes the listed drawing paths from a scene in one $pull.
func (r *DrawingRepository) RemoveDrawingPaths(gameID string, sceneID primitive.ObjectID, pathIDs []primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$pull": bson.M{"scenes.$.drawingPaths": bson.M{"_id": bson.M{"$in": pathIDs}}},
		"$set":  bson.M{"scenes.$.updatedAt": time.Now(), "updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove drawing paths: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// SetDrawingPathPoints writes the points of each given path (matched by ID) in one bulk write.
// Only points are written, so a concurrent style edit of the same label is not overwritten.
func (r *DrawingRepository) SetDrawingPathPoints(gameID string, sceneID primitive.ObjectID, paths []models.DrawingPath) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	now := time.Now()
	writes := make([]mongo.WriteModel, 0, len(paths))
	for _, p := range paths {
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": objectID}).
			SetUpdate(bson.M{"$set": bson.M{
				"scenes.$[scene].drawingPaths.$[path].points": p.Points,
				"scenes.$[scene].updatedAt":                   now,
				"updatedAt":                                   now,
			}}).
			SetArrayFilters(options.ArrayFilters{
				Filters: []interface{}{bson.M{"scene._id": sceneID}, bson.M{"path._id": p.ID}},
			}))
	}

	result, err := r.Collection.BulkWrite(ctx, writes)
	if err != nil {
		return fmt.Errorf("failed to move drawing paths: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// UpdateDrawingPath replaces one drawing path (matched by its ID) inside a scene
func (r *DrawingRepository) UpdateDrawingPath(gameID string, sceneID primitive.ObjectID, path models.DrawingPath) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	now := time.Now()
	update := bson.M{"$set": bson.M{
		"scenes.$[scene].drawingPaths.$[path]": path,
		"scenes.$[scene].updatedAt":            now,
		"updatedAt":                            now,
	}}
	opts := options.Update().SetArrayFilters(options.ArrayFilters{
		Filters: []interface{}{bson.M{"scene._id": sceneID}, bson.M{"path._id": path.ID}},
	})

	result, err := r.Collection.UpdateOne(ctx, bson.M{"_id": objectID}, update, opts)
	if err != nil {
		return fmt.Errorf("failed to update drawing path: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// ClearDrawingPaths removes all drawing paths from a scene
func (r *DrawingRepository) ClearDrawingPaths(gameID string, sceneID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$set": bson.M{
			"scenes.$.drawingPaths": []models.DrawingPath{},
			"scenes.$.updatedAt":    time.Now(),
			"updatedAt":             time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to clear drawing paths: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// GetGame retrieves a game document (needed for participant validation)
func (r *DrawingRepository) GetGame(gameID string) (*models.Game, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	var game models.Game
	err = r.Collection.FindOne(ctx, bson.M{"_id": objectID}, options.FindOne()).Decode(&game)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("game not found")
		}
		return nil, fmt.Errorf("failed to get game: %w", err)
	}
	return &game, nil
}
