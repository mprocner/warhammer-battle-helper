package repositories

import (
	"battle-helper/domain/models"
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var charCollection *mongo.Collection

func init() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	mongoURI := "mongodb://root:example@mongo:27017"
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		panic(err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		fmt.Println("MongoDB not connected: " + err.Error())
		panic("MongoDB not connected: " + err.Error())
	}
	fmt.Println("Connected to MongoDB!")
	db := client.Database("battle_helper")
	charCollection = db.Collection("characters")
}

type CharactersRepository struct {
	Collection *mongo.Collection
}

func NewCharactersRepository() *CharactersRepository {
	return &CharactersRepository{charCollection}
}

func (r *CharactersRepository) GetAll() ([]models.Character, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := r.Collection.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	var characters []models.Character
	if err := cursor.All(ctx, &characters); err != nil {
		return nil, err
	}
	return characters, nil
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
