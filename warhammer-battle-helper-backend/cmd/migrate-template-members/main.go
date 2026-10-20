// migrate-template-members converts template ownership to member roles (PLAYRPG-279).
//
//	system_templates: ownerId -> members[{ownerId, owner}], sharedWith[] -> members[{id, viewer}],
//	                  then $unset ownerId and sharedWith
//	games:            $unset customSystemTemplate.ownerId / .sharedWith on embedded copies
//
// Idempotent: documents that already have members are skipped, so a second run reports zeros.
// Run it right after deploying the code that reads members — until then every template is
// invisible to its owner.
//
// Known gap: a GM who opens token config for a hardcoded system between the deploy and this
// migration gets a fresh token-config singleton next to the old one; FindOne then picks one of
// them. Keep the window to seconds (see DEPLOY.md).
//
// Usage:
//
//	MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-template-members/
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// membersFor builds the member list for a pre-PLAYRPG-279 template: its owner, then everyone it
// was shared with as a viewer (the only access sharing granted), skipping the owner and duplicates.
func membersFor(ownerID primitive.ObjectID, sharedWith []primitive.ObjectID) []models.TemplateMember {
	members := []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}}
	seen := map[primitive.ObjectID]bool{ownerID: true}
	for _, id := range sharedWith {
		if seen[id] {
			continue
		}
		seen[id] = true
		members = append(members, models.TemplateMember{UserID: id, Role: models.RoleViewer})
	}
	return members
}

type legacyTemplate struct {
	ID         primitive.ObjectID   `bson:"_id"`
	OwnerID    primitive.ObjectID   `bson:"ownerId"`
	SharedWith []primitive.ObjectID `bson:"sharedWith"`
}

func migrateTemplates(ctx context.Context, col *mongo.Collection) int {
	cursor, err := col.Find(ctx, bson.M{"members": bson.M{"$exists": false}})
	if err != nil {
		log.Fatalf("system_templates find: %v", err)
	}
	defer cursor.Close(ctx)

	n := 0
	for cursor.Next(ctx) {
		var doc legacyTemplate
		if err := cursor.Decode(&doc); err != nil {
			log.Fatalf("system_templates decode: %v", err)
		}
		if doc.OwnerID.IsZero() {
			log.Printf("skip %s: no ownerId", doc.ID.Hex())
			continue
		}
		_, err := col.UpdateOne(ctx, bson.M{"_id": doc.ID}, bson.M{
			"$set":   bson.M{"members": membersFor(doc.OwnerID, doc.SharedWith)},
			"$unset": bson.M{"ownerId": "", "sharedWith": ""},
		})
		if err != nil {
			log.Fatalf("system_templates %s: %v", doc.ID.Hex(), err)
		}
		n++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("system_templates cursor: %v", err)
	}
	return n
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
	fmt.Printf("system_templates migrated: %d\n", migrateTemplates(ctx, db.Collection("system_templates")))

	res, err := db.Collection("games").UpdateMany(ctx,
		bson.M{"$or": bson.A{
			bson.M{"customSystemTemplate.ownerId": bson.M{"$exists": true}},
			bson.M{"customSystemTemplate.sharedWith": bson.M{"$exists": true}},
		}},
		bson.M{"$unset": bson.M{"customSystemTemplate.ownerId": "", "customSystemTemplate.sharedWith": ""}})
	if err != nil {
		log.Fatalf("games: %v", err)
	}
	fmt.Printf("games (embedded template copies cleaned): %d\n", res.ModifiedCount)
}
