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
	game.Handouts = []models.Handout{}
	game.Scenes = []models.Scene{}

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

// AddHandout adds a handout to the game
func (r *GameRepository) AddHandout(gameID string, handout models.Handout) (*models.Handout, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	handout.ID = primitive.NewObjectID()
	handout.CreatedAt = time.Now()
	handout.UpdatedAt = time.Now()

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{"handouts": handout},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return nil, fmt.Errorf("failed to add handout: %w", err)
	}

	if result.MatchedCount == 0 {
		return nil, fmt.Errorf("game not found")
	}

	return &handout, nil
}

// UpdateHandout updates a handout in the game
func (r *GameRepository) UpdateHandout(gameID string, handoutID primitive.ObjectID, update models.UpdateHandoutRequest) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	// Build the update document dynamically
	setFields := bson.M{
		"handouts.$.updatedAt": time.Now(),
		"updatedAt":            time.Now(),
	}

	if update.Title != "" {
		setFields["handouts.$.title"] = update.Title
	}
	if update.Description != "" {
		setFields["handouts.$.description"] = update.Description
	}
	if update.Type != "" {
		setFields["handouts.$.type"] = update.Type
	}
	if update.Visibility != nil {
		setFields["handouts.$.visibility"] = update.Visibility
	}
	if update.FileURL != "" {
		setFields["handouts.$.fileUrl"] = update.FileURL
	}

	filter := bson.M{
		"_id":          objectID,
		"handouts._id": handoutID,
	}
	updateDoc := bson.M{"$set": setFields}

	result, err := r.Collection.UpdateOne(ctx, filter, updateDoc)
	if err != nil {
		return fmt.Errorf("failed to update handout: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or handout not found")
	}

	return nil
}

// DeleteHandout removes a handout from the game
func (r *GameRepository) DeleteHandout(gameID string, handoutID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$pull": bson.M{"handouts": bson.M{"_id": handoutID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to delete handout: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// ReorderHandouts updates the order of handouts in the game
func (r *GameRepository) ReorderHandouts(gameID string, handoutIDs []primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	// Get the current game to access handouts
	var game models.Game
	err = r.Collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&game)
	if err != nil {
		return fmt.Errorf("failed to get game: %w", err)
	}

	// Create a map of handout ID to handout for quick lookup
	handoutMap := make(map[primitive.ObjectID]models.Handout)
	for _, h := range game.Handouts {
		handoutMap[h.ID] = h
	}

	// Reorder handouts based on the provided order
	reorderedHandouts := make([]models.Handout, 0, len(handoutIDs))
	for i, id := range handoutIDs {
		if handout, ok := handoutMap[id]; ok {
			handout.Order = i
			handout.UpdatedAt = time.Now()
			reorderedHandouts = append(reorderedHandouts, handout)
		}
	}

	// Update the game with reordered handouts
	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$set": bson.M{
			"handouts":  reorderedHandouts,
			"updatedAt": time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to reorder handouts: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// GetHandout retrieves a specific handout from the game
func (r *GameRepository) GetHandout(gameID string, handoutID primitive.ObjectID) (*models.Handout, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	var game models.Game
	err = r.Collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&game)
	if err != nil {
		return nil, fmt.Errorf("failed to get game: %w", err)
	}

	for _, h := range game.Handouts {
		if h.ID == handoutID {
			return &h, nil
		}
	}

	return nil, fmt.Errorf("handout not found")
}

// --- Scene Repository Methods ---

// AddScene adds a scene to the game
func (r *GameRepository) AddScene(gameID string, scene models.Scene) (*models.Scene, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	scene.ID = primitive.NewObjectID()
	scene.CreatedAt = time.Now()
	scene.UpdatedAt = time.Now()
	if scene.Characters == nil {
		scene.Characters = []models.GameCharacter{}
	}
	if scene.Images == nil {
		scene.Images = []models.SceneImage{}
	}
	if scene.AssignedPlayers == nil {
		scene.AssignedPlayers = []primitive.ObjectID{}
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$push": bson.M{"scenes": scene},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return nil, fmt.Errorf("failed to add scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return nil, fmt.Errorf("game not found")
	}

	return &scene, nil
}

// UpdateScene updates a scene's properties
func (r *GameRepository) UpdateScene(gameID string, sceneID primitive.ObjectID, req models.UpdateSceneRequest) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	setFields := bson.M{
		"scenes.$.updatedAt": time.Now(),
		"updatedAt":          time.Now(),
	}

	if req.Name != nil {
		setFields["scenes.$.name"] = *req.Name
	}
	if req.GridVisible != nil {
		setFields["scenes.$.gridVisible"] = *req.GridVisible
	}
	if req.GridBgVisible != nil {
		setFields["scenes.$.gridBgVisible"] = *req.GridBgVisible
	}
	if req.GridWidth != nil {
		setFields["scenes.$.gridWidth"] = *req.GridWidth
	}
	if req.GridHeight != nil {
		setFields["scenes.$.gridHeight"] = *req.GridHeight
	}

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	updateDoc := bson.M{"$set": setFields}

	result, err := r.Collection.UpdateOne(ctx, filter, updateDoc)
	if err != nil {
		return fmt.Errorf("failed to update scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}

	return nil
}

// DeleteScene removes a scene from the game
func (r *GameRepository) DeleteScene(gameID string, sceneID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$pull": bson.M{"scenes": bson.M{"_id": sceneID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to delete scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// AssignPlayerToScene adds a player ID to a scene's assignedPlayers
func (r *GameRepository) AssignPlayerToScene(gameID string, sceneID primitive.ObjectID, playerID primitive.ObjectID) error {
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
		"$addToSet": bson.M{"scenes.$.assignedPlayers": playerID},
		"$set":      bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to assign player to scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}

	return nil
}

// RemovePlayerFromScene removes a player ID from a scene's assignedPlayers
func (r *GameRepository) RemovePlayerFromScene(gameID string, sceneID primitive.ObjectID, playerID primitive.ObjectID) error {
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
		"$pull": bson.M{"scenes.$.assignedPlayers": playerID},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove player from scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}

	return nil
}

// AddSceneCharacter adds a character to a scene
func (r *GameRepository) AddSceneCharacter(gameID string, sceneID primitive.ObjectID, character models.GameCharacter) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	character.ID = primitive.NewObjectID()
	character.PlacedAt = time.Now()
	character.UpdatedAt = time.Now()

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$push": bson.M{"scenes.$.characters": character},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to add character to scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}

	return nil
}

// UpdateSceneCharacterPosition updates a character's position within a scene
func (r *GameRepository) UpdateSceneCharacterPosition(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID, x, y int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{
		"$set": bson.M{
			"scenes.$[scene].characters.$[char].positionX": x,
			"scenes.$[scene].characters.$[char].positionY": y,
			"scenes.$[scene].characters.$[char].updatedAt": time.Now(),
			"updatedAt": time.Now(),
		},
	}
	opts := options.Update().SetArrayFilters(options.ArrayFilters{
		Filters: []interface{}{
			bson.M{"scene._id": sceneID},
			bson.M{"char.characterId": characterID},
		},
	})

	result, err := r.Collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return fmt.Errorf("failed to update scene character position: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// RemoveSceneCharacter removes a character from a scene
func (r *GameRepository) RemoveSceneCharacter(gameID string, sceneID primitive.ObjectID, characterID primitive.ObjectID) error {
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
		"$pull": bson.M{"scenes.$.characters": bson.M{"characterId": characterID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to remove character from scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}

	return nil
}

// AddSceneImage adds an image to a scene
func (r *GameRepository) AddSceneImage(gameID string, sceneID primitive.ObjectID, image models.SceneImage) (*models.SceneImage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return nil, fmt.Errorf("invalid game ID: %w", err)
	}

	image.ID = primitive.NewObjectID()
	image.CreatedAt = time.Now()
	image.UpdatedAt = time.Now()

	filter := bson.M{
		"_id":        objectID,
		"scenes._id": sceneID,
	}
	update := bson.M{
		"$push": bson.M{"scenes.$.images": image},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return nil, fmt.Errorf("failed to add image to scene: %w", err)
	}

	if result.MatchedCount == 0 {
		return nil, fmt.Errorf("game or scene not found")
	}

	return &image, nil
}

// UpdateSceneImage updates an image within a scene
func (r *GameRepository) UpdateSceneImage(gameID string, sceneID primitive.ObjectID, imageID primitive.ObjectID, req models.UpdateSceneImageRequest) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	setFields := bson.M{
		"scenes.$[scene].images.$[img].updatedAt": time.Now(),
		"updatedAt": time.Now(),
	}

	if req.X != nil {
		setFields["scenes.$[scene].images.$[img].x"] = *req.X
	}
	if req.Y != nil {
		setFields["scenes.$[scene].images.$[img].y"] = *req.Y
	}
	if req.Width != nil {
		setFields["scenes.$[scene].images.$[img].width"] = *req.Width
	}
	if req.Height != nil {
		setFields["scenes.$[scene].images.$[img].height"] = *req.Height
	}
	if req.ZIndex != nil {
		setFields["scenes.$[scene].images.$[img].zIndex"] = *req.ZIndex
	}
	if req.Layer != nil {
		setFields["scenes.$[scene].images.$[img].layer"] = *req.Layer
	}

	filter := bson.M{"_id": objectID}
	update := bson.M{"$set": setFields}
	opts := options.Update().SetArrayFilters(options.ArrayFilters{
		Filters: []interface{}{
			bson.M{"scene._id": sceneID},
			bson.M{"img._id": imageID},
		},
	})

	result, err := r.Collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return fmt.Errorf("failed to update scene image: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game not found")
	}

	return nil
}

// DeleteSceneImage removes an image from a scene
func (r *GameRepository) DeleteSceneImage(gameID string, sceneID primitive.ObjectID, imageID primitive.ObjectID) error {
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
		"$pull": bson.M{"scenes.$.images": bson.M{"_id": imageID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to delete scene image: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("game or scene not found")
	}

	return nil
}

// GetScene retrieves a specific scene from the game
func (r *GameRepository) GetScene(gameID string, sceneID primitive.ObjectID) (*models.Scene, error) {
	game, err := r.GetByID(gameID)
	if err != nil {
		return nil, err
	}

	for _, s := range game.Scenes {
		if s.ID == sceneID {
			return &s, nil
		}
	}

	return nil, fmt.Errorf("scene not found")
}
