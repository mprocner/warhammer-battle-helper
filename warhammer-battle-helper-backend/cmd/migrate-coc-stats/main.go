// migrate-coc-stats migrates CoC 7e character documents from the flat stats
// structure to the nested group structure (attributes, resources, basicInfo, etc.).
//
// Usage:
//
//	MONGO_URI=mongodb://localhost:27017 MONGO_DB=warhammer go run ./cmd/migrate-coc-stats/
//
// The script is idempotent: documents that already have an "attributes" sub-key
// are skipped without modification.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
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

	col := client.Database(dbName).Collection("characters")

	cursor, err := col.Find(ctx, bson.M{"gameSystem": "coc7e"})
	if err != nil {
		log.Fatalf("find: %v", err)
	}
	defer cursor.Close(ctx)

	var migrated, skipped int

	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			log.Printf("decode error: %v — skipping", err)
			continue
		}

		id := doc["_id"].(primitive.ObjectID)

		rawStats, ok := doc["stats"].(bson.M)
		if !ok {
			log.Printf("doc %s: stats is not a document — skipping", id.Hex())
			skipped++
			continue
		}

		// Idempotency check: already migrated if "attributes" sub-key exists
		if _, alreadyMigrated := rawStats["attributes"]; alreadyMigrated {
			skipped++
			continue
		}

		newStats := migrateStats(rawStats)

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

func migrateStats(old bson.M) bson.M {
	getInt := func(key string) int {
		switch v := old[key].(type) {
		case int32:
			return int(v)
		case int64:
			return int(v)
		case float64:
			return int(v)
		}
		return 0
	}
	getString := func(key string) string {
		if v, ok := old[key].(string); ok {
			return v
		}
		return ""
	}

	// --- Skills: separate predefined from custom_* keys ---
	skills := bson.M{}
	if rawSkills, ok := old["skills"].(bson.M); ok {
		for k, v := range rawSkills {
			if !strings.HasPrefix(k, "custom_") {
				skills[k] = v
			}
		}
	}

	// --- CustomSkills: merge value from skills map into definition ---
	var customSkills []bson.M
	if rawCustom, ok := old["customSkills"].(bson.A); ok {
		rawSkills, _ := old["skills"].(bson.M)
		for _, item := range rawCustom {
			cs, ok := item.(bson.M)
			if !ok {
				continue
			}
			key, _ := cs["key"].(string)
			val := 0
			if rawSkills != nil {
				switch v := rawSkills[key].(type) {
				case int32:
					val = int(v)
				case int64:
					val = int(v)
				case float64:
					val = int(v)
				}
			}
			newCS := bson.M{
				"key":   key,
				"name":  cs["name"],
				"base":  cs["base"],
				"value": val,
			}
			customSkills = append(customSkills, newCS)
		}
	}
	if customSkills == nil {
		customSkills = []bson.M{}
	}

	// --- favoriteSkills / developmentSkills ---
	toStringSlice := func(key string) []string {
		result := []string{}
		if arr, ok := old[key].(bson.A); ok {
			for _, v := range arr {
				if s, ok := v.(string); ok {
					result = append(result, s)
				}
			}
		}
		return result
	}

	// --- Weapons ---
	var weapons []bson.M
	if rawWeapons, ok := old["weapons"].(bson.A); ok {
		for _, item := range rawWeapons {
			if w, ok := item.(bson.M); ok {
				weapons = append(weapons, w)
			}
		}
	}
	if weapons == nil {
		weapons = []bson.M{}
	}

	return bson.M{
		"basicInfo": bson.M{
			"occupation": getString("occupation"),
			"age":        getInt("age"),
			"sex":        getString("sex"),
			"residence":  getString("residence"),
			"birthplace": getString("birthplace"),
		},
		"attributes": bson.M{
			"str": getInt("str"),
			"con": getInt("con"),
			"siz": getInt("siz"),
			"dex": getInt("dex"),
			"app": getInt("app"),
			"int": getInt("int"),
			"pow": getInt("pow"),
			"edu": getInt("edu"),
			"mov": getInt("mov"),
		},
		"resources": bson.M{
			"hp":        getInt("hp"),
			"hpMax":     getInt("hpMax"),
			"mp":        getInt("mp"),
			"mpMax":     getInt("mpMax"),
			"sanity":    getInt("sanity"),
			"sanityMax": getInt("sanityMax"),
			"luck":      getInt("luck"),
		},
		"combat": bson.M{
			"damageBonus": getString("damageBonus"),
			"build":       getInt("build"),
		},
		"finances": bson.M{
			"spendingLevel": getString("spendingLevel"),
			"cash":          getString("cash"),
			"assets":        getString("assets"),
		},
		"equipment": getString("equipment"),
		"background": bson.M{
			"personalDescription":    getString("personalDescription"),
			"ideology":               getString("ideology"),
			"significantPeople":      getString("significantPeople"),
			"meaningfulLocations":    getString("meaningfulLocations"),
			"possessions":            getString("possessions"),
			"traits":                 getString("traits"),
			"injuriesScars":          getString("injuriesScars"),
			"phobiasManias":          getString("phobiasManias"),
			"arcaneTomes":            getString("arcaneTomes"),
			"encountersWithEntities": getString("encountersWithEntities"),
		},
		"skills":            skills,
		"customSkills":      customSkills,
		"favoriteSkills":    toStringSlice("favoriteSkills"),
		"developmentSkills": toStringSlice("developmentSkills"),
		"weapons":           weapons,
	}
}
