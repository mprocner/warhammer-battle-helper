package config

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Database holds database connections and collections
type Database struct {
	Client                    *mongo.Client
	CharactersCollection      *mongo.Collection
	UsersCollection           *mongo.Collection
	GamesCollection           *mongo.Collection
	RollStatsCollection       *mongo.Collection
	OnlineSessionsCollection  *mongo.Collection
	SystemTemplatesCollection *mongo.Collection
}

// ConnectDatabase establishes a connection to MongoDB and returns database collections
func ConnectDatabase() (*Database, error) {
	// Get MongoDB URI from environment or use default
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://root:examplee@mongo:27017"
	}

	// Get database name from environment or use default
	dbName := os.Getenv("MONGO_DB_NAME")
	if dbName == "" {
		dbName = "battle_helperr"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to MongoDB
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	// Ping the database to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	fmt.Println("Connected to MongoDB!")

	// Get database and collections
	db := client.Database(dbName)

	return &Database{
		Client:                    client,
		CharactersCollection:      db.Collection("characters"),
		UsersCollection:           db.Collection("users"),
		GamesCollection:           db.Collection("games"),
		RollStatsCollection:       db.Collection("roll_stats"),
		OnlineSessionsCollection:  db.Collection("online_sessions"),
		SystemTemplatesCollection: db.Collection("system_templates"),
	}, nil
}

// Disconnect closes the MongoDB connection
func (d *Database) Disconnect() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := d.Client.Disconnect(ctx); err != nil {
		return fmt.Errorf("failed to disconnect from MongoDB: %w", err)
	}

	fmt.Println("Disconnected from MongoDB")
	return nil
}
