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

type FogRepository struct {
	Collection *mongo.Collection
}

func NewFogRepository(collection *mongo.Collection) *FogRepository {
	return &FogRepository{Collection: collection}
}

// ToggleFog sets fogEnabled and optionally fogOpacity on a scene
func (r *FogRepository) ToggleFog(gameID string, sceneID primitive.ObjectID, enabled bool, opacity float64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	setFields := bson.M{
		"scenes.$.fogEnabled": enabled,
		"scenes.$.updatedAt":  time.Now(),
		"updatedAt":           time.Now(),
	}
	if opacity > 0 {
		setFields["scenes.$.fogOpacity"] = opacity
	}

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{"$set": setFields}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to toggle fog: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// AddFogPath appends a reveal path to a scene's revealPaths array
func (r *FogRepository) AddFogPath(gameID string, sceneID primitive.ObjectID, path models.FogPath) error {
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
		"$push": bson.M{"scenes.$.revealPaths": path},
		"$set":  bson.M{"scenes.$.updatedAt": time.Now(), "updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add fog path: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// ClearFogPaths removes all reveal paths from a scene
func (r *FogRepository) ClearFogPaths(gameID string, sceneID primitive.ObjectID) error {
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
			"scenes.$.revealPaths": []models.FogPath{},
			"scenes.$.updatedAt":   time.Now(),
			"updatedAt":            time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to clear fog paths: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// RemoveLastFogPath removes the last reveal path from a scene using arrayFilters
func (r *FogRepository) RemoveLastFogPath(gameID string, sceneID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	// $pop removes the last element of an array
	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$pop": bson.M{"scenes.$.revealPaths": 1},
		"$set": bson.M{"scenes.$.updatedAt": time.Now(), "updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove last fog path: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// RevealAllFog replaces all revealPaths with a single full-canvas reveal rect
func (r *FogRepository) RevealAllFog(gameID string, sceneID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	fullReveal := models.FogPath{
		Points:    [][2]float64{{-100, -100}, {99999, 99999}},
		BrushSize: 1,
		Shape:     "rect",
		Cover:     false,
	}

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$set": bson.M{
			"scenes.$.revealPaths": []models.FogPath{fullReveal},
			"scenes.$.updatedAt":   time.Now(),
			"updatedAt":            time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to reveal all fog: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}
	return nil
}

// GetScene retrieves a specific scene (needed for GM validation)
func (r *FogRepository) GetGame(gameID string) (*models.Game, error) {
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
