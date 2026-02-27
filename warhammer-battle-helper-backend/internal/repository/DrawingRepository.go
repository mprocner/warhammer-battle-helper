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

// AddDrawingPath appends a drawing path to a scene's drawingPaths array
func (r *DrawingRepository) AddDrawingPath(gameID string, sceneID primitive.ObjectID, path models.DrawingPath) error {
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
		"$push": bson.M{"scenes.$.drawingPaths": path},
		"$set":  bson.M{"scenes.$.updatedAt": time.Now(), "updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add drawing path: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// RemoveDrawingPathByID removes a specific drawing path by its ObjectID
func (r *DrawingRepository) RemoveDrawingPathByID(gameID string, sceneID primitive.ObjectID, pathID primitive.ObjectID) error {
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
		"$pull": bson.M{"scenes.$.drawingPaths": bson.M{"_id": pathID}},
		"$set":  bson.M{"scenes.$.updatedAt": time.Now(), "updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove drawing path: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
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
