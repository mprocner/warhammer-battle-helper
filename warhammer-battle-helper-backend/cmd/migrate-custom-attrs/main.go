// migrate-custom-attrs migrates custom-system character documents from the
// two-map attribute structure to the denormalized per-attribute object:
//
//	Before: attributes: {"str": 50}, advances: {"str": 5}
//	After:  attributes: {"str": {"base": 50, "advances": 5, "current": 55}}
//
// Usage:
//
//	MONGO_URI=mongodb://localhost:27018 MONGO_DB=warhammer go run ./cmd/migrate-custom-attrs/
//
// The script is idempotent: documents whose first attribute value is already
// a subdocument (has a "base" key) are skipped without modification.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27018"
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

	col := client.Database(dbName).Collection("characters")

	cursor, err := col.Find(ctx, bson.M{"gameSystem": "custom"})
	if err != nil {
		log.Fatalf("find: %v", err)
	}
	defer cursor.Close(ctx)

	var migrated, skipped int

	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			log.Printf("decode error: %v — skipping", err)
			skipped++
			continue
		}

		id := doc["_id"].(primitive.ObjectID)

		rawStats, ok := doc["stats"].(bson.M)
		if !ok {
			log.Printf("doc %s: stats is not a document — skipping", id.Hex())
			skipped++
			continue
		}

		oldAttrs, _ := rawStats["attributes"].(bson.M)

		// Idempotency check: already migrated if any attribute value is a subdocument.
		if isAlreadyMigrated(oldAttrs) {
			skipped++
			continue
		}

		oldAdvances, _ := rawStats["advances"].(bson.M)

		newAttrs := migrateAttrs(oldAttrs, oldAdvances)

		newStats := bson.M{}
		for k, v := range rawStats {
			newStats[k] = v
		}
		newStats["attributes"] = newAttrs
		delete(newStats, "advances")

		_, err := col.UpdateOne(ctx,
			bson.M{"_id": id},
			bson.M{"$set": bson.M{"stats": newStats}},
		)
		if err != nil {
			log.Printf("doc %s: update error: %v", id.Hex(), err)
			continue
		}
		migrated++
	}

	if err := cursor.Err(); err != nil {
		log.Fatalf("cursor error: %v", err)
	}

	fmt.Printf("Done. Migrated: %d  Skipped (already migrated or error): %d\n", migrated, skipped)
}

func isAlreadyMigrated(attrs bson.M) bool {
	for _, v := range attrs {
		if _, isDoc := v.(bson.M); isDoc {
			return true
		}
		break // only check one entry
	}
	return false
}

func migrateAttrs(oldAttrs, oldAdvances bson.M) bson.M {
	toInt := func(m bson.M, key string) int {
		if m == nil {
			return 0
		}
		switch v := m[key].(type) {
		case int32:
			return int(v)
		case int64:
			return int(v)
		case float64:
			return int(v)
		}
		return 0
	}

	newAttrs := bson.M{}
	for key := range oldAttrs {
		base := toInt(oldAttrs, key)
		adv := toInt(oldAdvances, key)
		newAttrs[key] = bson.M{
			"base":     base,
			"advances": adv,
			"current":  base + adv,
		}
	}
	return newAttrs
}
