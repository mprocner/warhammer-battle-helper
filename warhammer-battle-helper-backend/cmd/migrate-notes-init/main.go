// migrate-notes-init ensures every game document has notes as an empty array
// instead of null/missing. Required for $push operations to work correctly.
//
// Usage:
//
//	MONGO_URI=mongodb://localhost:27017 MONGO_DB=warhammer go run ./cmd/migrate-notes-init/
//
// The script is idempotent: documents that already have an array are skipped.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		log.Fatal("MONGO_DB env variable is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer client.Disconnect(ctx)

	col := client.Database(dbName).Collection("games")

	// Match documents where notes is null or the field doesn't exist
	filter := bson.M{"notes": bson.M{"$not": bson.M{"$type": "array"}}}
	update := bson.M{"$set": bson.M{"notes": bson.A{}}}

	result, err := col.UpdateMany(ctx, filter, update)
	if err != nil {
		log.Fatalf("update: %v", err)
	}

	fmt.Printf("Done. Fixed: %d game(s)\n", result.ModifiedCount)
}
