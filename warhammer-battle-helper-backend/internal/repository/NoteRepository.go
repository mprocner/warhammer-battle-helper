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

type NoteRepository struct {
	Collection *mongo.Collection
}

func NewNoteRepository(collection *mongo.Collection) *NoteRepository {
	return &NoteRepository{Collection: collection}
}

// AddNote appends a note to the game's notes array
func (r *NoteRepository) AddNote(gameID string, note models.Note) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{"notes": note},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add note: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// UpdateNote updates specific fields of a note using arrayFilters
func (r *NoteRepository) UpdateNote(gameID string, noteID primitive.ObjectID, fields bson.M) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	// Build $set with arrayFilter placeholder
	setFields := bson.M{"updatedAt": time.Now()}
	for k, v := range fields {
		setFields["notes.$[elem]."+k] = v
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{"$set": setFields}
	opts := options.Update().SetArrayFilters(options.ArrayFilters{
		Filters: []interface{}{bson.M{"elem._id": noteID}},
	})

	result, err := r.Collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return fmt.Errorf("failed to update note: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// DeleteNote removes a note from the game's notes array and cleans it from all participants' noteOrder
func (r *NoteRepository) DeleteNote(gameID string, noteID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$pull": bson.M{
			"notes":                      bson.M{"_id": noteID},
			"participants.$[].noteOrder": noteID.Hex(),
		},
		"$set": bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to delete note: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// SaveNoteOrder persists the ordered list of note IDs for a specific participant
func (r *NoteRepository) SaveNoteOrder(gameID string, userID primitive.ObjectID, noteIDs []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$set": bson.M{
			"participants.$[elem].noteOrder": noteIDs,
			"updatedAt":                      time.Now(),
		},
	}
	opts := options.Update().SetArrayFilters(options.ArrayFilters{
		Filters: []interface{}{bson.M{"elem.userId": userID}},
	})

	result, err := r.Collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return fmt.Errorf("failed to save note order: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// AddNoteToOrder prepends a note ID to a participant's noteOrder
func (r *NoteRepository) AddNoteToOrder(gameID string, userID primitive.ObjectID, noteID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{
			"participants.$[elem].noteOrder": bson.M{
				"$each":     []string{noteID},
				"$position": 0,
			},
		},
	}
	opts := options.Update().SetArrayFilters(options.ArrayFilters{
		Filters: []interface{}{bson.M{"elem.userId": userID}},
	})

	_, err = r.Collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return fmt.Errorf("failed to add note to order: %w", err)
	}
	return nil
}

// GetGame retrieves a game document (needed for permission checks)
func (r *NoteRepository) GetGame(gameID string) (*models.Game, error) {
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
