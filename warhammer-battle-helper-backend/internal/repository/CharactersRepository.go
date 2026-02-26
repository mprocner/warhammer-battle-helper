package repository

import (
	"battle-helper/internal/models"
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type CharactersRepository struct {
	Collection *mongo.Collection
}

func NewCharactersRepository(collection *mongo.Collection) *CharactersRepository {
	return &CharactersRepository{Collection: collection}
}

func (r *CharactersRepository) GetByID(id string) (*models.Character, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	fmt.Println("AttackerID from request:", id)
	objectID, err := primitive.ObjectIDFromHex(id)
	fmt.Println("Converted ObjectID:", objectID)
	if err != nil {
		fmt.Println("ObjectIDFromHex error:", err)
		return nil, err
	}
	fmt.Println("Searching for _id:", objectID.Hex())

	var character models.Character
	err = r.Collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&character)
	if err != nil {
		fmt.Println("FindOne error:", err)
		return nil, err
	}
	return &character, nil
}

func (r *CharactersRepository) GetByGameID(gameID string) ([]models.Character, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return nil, err
	}

	cursor, err := r.Collection.Find(ctx, bson.M{"gameId": objectID})
	if err != nil {
		return nil, err
	}
	var characters []models.Character
	if err := cursor.All(ctx, &characters); err != nil {
		return nil, err
	}
	return characters, nil
}

func (r *CharactersRepository) Create(character *models.Character) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	character.CreatedAt = time.Now()
	character.UpdatedAt = time.Now()

	result, err := r.Collection.InsertOne(ctx, character)
	if err != nil {
		return err
	}

	character.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

func (r *CharactersRepository) Update(id string, character *models.Character) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return err
	}

	character.UpdatedAt = time.Now()

	update := bson.M{
		"$set": character,
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": objectID}, update)
	return err
}

func (r *CharactersRepository) Delete(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return err
	}

	_, err = r.Collection.DeleteOne(ctx, bson.M{"_id": objectID})
	return err
}

func (r *CharactersRepository) UpdateVisibility(id string, visibleTo []primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return err
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": objectID}, bson.M{
		"$set": bson.M{"visibleTo": visibleTo},
	})
	return err
}
