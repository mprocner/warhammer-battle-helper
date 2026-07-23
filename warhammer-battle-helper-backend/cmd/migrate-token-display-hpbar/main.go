// migrate-token-display-hpbar folds the old single token-display HP bar into the new hpBars list.
//
//	Before: settings.tokenDisplay.hpBar: {key, maxKey, label}
//	After:  settings.tokenDisplay.hpBars: [{id, label, field: {key, maxKey, label}}]  (+ hpBar unset)
//
// Runs over every system_templates doc AND every games.customSystemTemplate that still carries a
// legacy hpBar. Idempotent: a doc that already has hpBars (or no hpBar) is skipped.
//
// Usage:
//
//	MONGO_URI=mongodb://localhost:27018 MONGO_DB=warhammer go run ./cmd/migrate-token-display-hpbar/
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

func genID() string { return primitive.NewObjectID().Hex() }

// hpBarToList converts a legacy hpBar subdoc into a one-element hpBars slice, or returns false when
// there's nothing to migrate (no hpBar, or hpBars already present).
func hpBarToList(td bson.M) ([]interface{}, bool) {
	if td == nil {
		return nil, false
	}
	if _, has := td["hpBars"]; has {
		return nil, false // already migrated
	}
	raw, ok := td["hpBar"]
	if !ok || raw == nil {
		return nil, false
	}
	field, ok := raw.(bson.M)
	if !ok {
		return nil, false
	}
	label, _ := field["label"].(string)
	return []interface{}{bson.M{
		"id":    genID(),
		"label": label,
		"field": field,
	}}, true
}

func main() {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27018"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		log.Fatal("MONGO_DB env variable is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database(dbName)
	var migrated, skipped int

	// --- system_templates.settings.tokenDisplay ---
	tmpls := db.Collection("system_templates")
	cur, err := tmpls.Find(ctx, bson.M{})
	if err != nil {
		log.Fatalf("find templates: %v", err)
	}
	for cur.Next(ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			continue
		}
		settings, _ := doc["settings"].(bson.M)
		if settings == nil {
			skipped++
			continue
		}
		td, _ := settings["tokenDisplay"].(bson.M)
		bars, ok := hpBarToList(td)
		if !ok {
			skipped++
			continue
		}
		if _, err := tmpls.UpdateByID(ctx, doc["_id"], bson.M{
			"$set":   bson.M{"settings.tokenDisplay.hpBars": bars},
			"$unset": bson.M{"settings.tokenDisplay.hpBar": ""},
		}); err != nil {
			log.Printf("template %v update: %v", doc["_id"], err)
			continue
		}
		migrated++
	}
	cur.Close(ctx)

	// --- games.customSystemTemplate.settings.tokenDisplay (embedded) ---
	games := db.Collection("games")
	gcur, err := games.Find(ctx, bson.M{"customSystemTemplate": bson.M{"$ne": nil}})
	if err != nil {
		log.Fatalf("find games: %v", err)
	}
	for gcur.Next(ctx) {
		var doc bson.M
		if err := gcur.Decode(&doc); err != nil {
			continue
		}
		cst, _ := doc["customSystemTemplate"].(bson.M)
		settings, _ := cst["settings"].(bson.M)
		if settings == nil {
			skipped++
			continue
		}
		td, _ := settings["tokenDisplay"].(bson.M)
		bars, ok := hpBarToList(td)
		if !ok {
			skipped++
			continue
		}
		if _, err := games.UpdateByID(ctx, doc["_id"], bson.M{
			"$set":   bson.M{"customSystemTemplate.settings.tokenDisplay.hpBars": bars},
			"$unset": bson.M{"customSystemTemplate.settings.tokenDisplay.hpBar": ""},
		}); err != nil {
			log.Printf("game %v update: %v", doc["_id"], err)
			continue
		}
		migrated++
	}
	gcur.Close(ctx)

	fmt.Printf("Done. Migrated %d, skipped %d.\n", migrated, skipped)
}
