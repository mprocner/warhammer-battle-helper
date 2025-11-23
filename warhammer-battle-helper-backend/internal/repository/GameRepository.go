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

type GameRepository struct {
	Collection *mongo.Collection
}

func NewGameRepository(collection *mongo.Collection) *GameRepository {
	return &GameRepository{Collection: collection}
}

// Create creates a new game
func (r *GameRepository) Create(game *models.Game) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	game.CreatedAt = time.Now()
	game.UpdatedAt = time.Now()
	game.Participants = []models.GameParticipant{}
	game.Characters = []models.GameCharacter{}
	game.Events = []models.GameEvent{}

	result, err := r.Collection.InsertOne(ctx, game)
	if err != nil {
		return fmt.Errorf("failed to create game: %w", err)
	}

	game.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a game by its ID
func (r *GameRepository) GetByID(id string) (*models.Game, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	var game models.Game
	err = r.Collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&game)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("game not found")
		}
		return nil, fmt.Errorf("failed to get game: %w", err)
	}

	return &game, nil
}

// GetAll retrieves all active games
func (r *GameRepository) GetAll() ([]models.Game, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Only return active and paused games, not completed ones
	filter := bson.M{
		"status": bson.M{
			"$in": []models.GameStatus{models.GameStatusActive, models.GameStatusPaused},
		},
	}

	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	cursor, err := r.Collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get games: %w", err)
	}

	var games []models.Game
	if err := cursor.All(ctx, &games); err != nil {
		return nil, fmt.Errorf("failed to decode games: %w", err)
	}

	return games, nil
}

// Update updates a game
func (r *GameRepository) Update(game *models.Game) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	game.UpdatedAt = time.Now()

	filter := bson.M{"_id": game.ID}
	update := bson.M{"$set": game}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update game: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// Delete deletes a game
func (r *GameRepository) Delete(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	result, err := r.Collection.DeleteOne(ctx, bson.M{"_id": objectID})
	if err != nil {
		return fmt.Errorf("failed to delete game: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// AddParticipant adds a participant to a game
func (r *GameRepository) AddParticipant(gameID string, participant models.GameParticipant) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	participant.JoinedAt = time.Now()
	participant.IsActive = true

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{"participants": participant},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add participant: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// RemoveParticipant marks a participant as inactive
func (r *GameRepository) RemoveParticipant(gameID string, userID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	now := time.Now()
	filter := bson.M{
		"_id":                 objectID,
		"participants.userId": userID,
	}
	update := bson.M{
		"$set": bson.M{
			"participants.$.isActive": false,
			"participants.$.leftAt":   now,
			"updatedAt":               now,
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove participant: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or participant not found")
	}

	return nil
}

// AddCharacter adds a character to the game grid
func (r *GameRepository) AddCharacter(gameID string, character models.GameCharacter) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	character.ID = primitive.NewObjectID()
	character.PlacedAt = time.Now()
	character.UpdatedAt = time.Now()

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{"characters": character},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add character: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// UpdateCharacterPosition updates a character's position on the grid
func (r *GameRepository) UpdateCharacterPosition(gameID string, characterID primitive.ObjectID, x, y int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	// Search by characterId (the original character's ID), not by the GameCharacter's _id
	filter := bson.M{
		"_id":                    objectID,
		"characters.characterId": characterID,
	}
	update := bson.M{
		"$set": bson.M{
			"characters.$.positionX": x,
			"characters.$.positionY": y,
			"characters.$.updatedAt": time.Now(),
			"updatedAt":              time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update character position: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or character not found")
	}

	return nil
}

// RemoveCharacter removes a character from the game grid
func (r *GameRepository) RemoveCharacter(gameID string, characterID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$pull": bson.M{"characters": bson.M{"characterId": characterID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove character: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// AddEvent adds an event to the game's event log
func (r *GameRepository) AddEvent(gameID string, event models.GameEvent) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	event.ID = primitive.NewObjectID()
	event.CreatedAt = time.Now()

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{"events": event},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add event: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}
