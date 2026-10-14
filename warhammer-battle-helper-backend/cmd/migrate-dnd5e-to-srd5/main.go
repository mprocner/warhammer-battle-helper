// migrate-dnd5e-to-srd5 renames the hardcoded game system key "dnd5e" to "srd5" (PLAYRPG-266).
//
// The key lives in these places:
//
//	games.gameSystem, characters.gameSystem, system_templates.baseSystem  -> updateMany
//	games.customSystemTemplate.baseSystem (embedded template copies)      -> updateMany
//	system_templates.name "dnd5e tokens" (token-config singleton, where
//	  baseSystem is already srd5; name = baseSystem + " tokens")          -> updateMany
//	system_access._id                                                     -> copy + delete (_id is immutable)
//
// Idempotent: a second run reports zero changes everywhere. Run it right after deploying the
// code that knows "srd5" — until then old games fail to load.
//
// Known gap: if a GM opened token config for srd5 between the deploy and this migration, the
// owner may end up with two srd5 token-config templates (the fresh one and the renamed old one);
// FindOne picks one of them. Run the migration immediately after the deploy (see DEPLOY.md) to
// keep that window to seconds.
//
// Usage:
//
//	MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-dnd5e-to-srd5/
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	oldKey = "dnd5e"
	newKey = "srd5"

	// Token-config singleton templates are named baseSystem + " tokens"
	// (TemplateService.GetOrCreateTokenConfig).
	tokenNameSuffix = " tokens"
)

// planAccessMove decides how to carry the old system_access document over to the new key.
// An already existing new doc means the admin configured access after the deploy — it wins,
// and the old doc is only removed. The old doc is never mutated.
func planAccessMove(oldDoc, newDoc *models.SystemAccess) (insert *models.SystemAccess, deleteOld bool) {
	if oldDoc == nil {
		return nil, false
	}
	if newDoc != nil {
		return nil, true
	}
	moved := *oldDoc
	moved.System = newKey
	return &moved, true
}

func renameKey(ctx context.Context, col *mongo.Collection, field string) int64 {
	res, err := col.UpdateMany(ctx, bson.M{field: oldKey}, bson.M{"$set": bson.M{field: newKey}})
	if err != nil {
		log.Fatalf("%s.%s: %v", col.Name(), field, err)
	}
	return res.ModifiedCount
}

func findAccess(ctx context.Context, col *mongo.Collection, id string) *models.SystemAccess {
	var doc models.SystemAccess
	err := col.FindOne(ctx, bson.M{"_id": id}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	if err != nil {
		log.Fatalf("system_access %s: %v", id, err)
	}
	return &doc
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
	fmt.Printf("games:            %d\n", renameKey(ctx, db.Collection("games"), "gameSystem"))
	fmt.Printf("characters:       %d\n", renameKey(ctx, db.Collection("characters"), "gameSystem"))
	fmt.Printf("system_templates: %d\n", renameKey(ctx, db.Collection("system_templates"), "baseSystem"))
	fmt.Printf("games (embedded customSystemTemplate.baseSystem): %d\n",
		renameKey(ctx, db.Collection("games"), "customSystemTemplate.baseSystem"))

	// Must run after the baseSystem rename: match only singletons that already belong to srd5.
	tokens := db.Collection("system_templates")
	res, err := tokens.UpdateMany(ctx,
		bson.M{"baseSystem": newKey, "name": oldKey + tokenNameSuffix},
		bson.M{"$set": bson.M{"name": newKey + tokenNameSuffix}})
	if err != nil {
		log.Fatalf("system_templates.name: %v", err)
	}
	fmt.Printf("system_templates token-config names: %d\n", res.ModifiedCount)

	access := db.Collection("system_access")
	insert, deleteOld := planAccessMove(findAccess(ctx, access, oldKey), findAccess(ctx, access, newKey))
	if insert != nil {
		if _, err := access.InsertOne(ctx, insert); err != nil {
			log.Fatalf("system_access insert %s: %v", newKey, err)
		}
	}
	if deleteOld {
		if _, err := access.DeleteOne(ctx, bson.M{"_id": oldKey}); err != nil {
			log.Fatalf("system_access delete %s: %v", oldKey, err)
		}
	}
	fmt.Printf("system_access:    copied=%v removedOld=%v\n", insert != nil, deleteOld)
}
