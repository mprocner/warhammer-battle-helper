// migrate-weapon-presets moves stored damage values to text and always-on presets into rows
// (PLAYRPG-288).
//
//	system_templates.sections, games.customSystemTemplate.sections:
//	    presetWeapons[].damage numbers -> text, alwaysOn -> addOnCreate (also presetRows)
//	characters (custom games): stats.weapons.*[].damage numbers -> text, drop .favorite;
//	    every alwaysOn preset of the game's template copied in as a row with the preset's id
//
// Per game, characters are migrated before the game's template is renamed, so a crash leaves the
// alwaysOn flags in place and a re-run finishes the job; copies are deduplicated by row id. A
// second run reports zeros. Run it right after deploying: until then characters and games with
// entered weapon damage fail to load ("cannot decode double into a string type").
//
// Usage:
//
//	MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-weapon-presets/
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsonrw"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// presetLists is an ordered slice (not a map) so presets are collected deterministically.
var presetLists = [][2]string{{"presetWeapons", "weapons"}, {"presetRows", "tables"}}

// legacyPreset is an always-on preset found in a template, waiting to be copied into characters.
type legacyPreset struct {
	FieldKey string
	Kind     string // "weapons" | "tables" — the stats map it lands in
	Row      bson.M
}

// textDamage rewrites numeric values of a damage map as text; reports whether anything changed.
func textDamage(v interface{}) bool {
	dmg, ok := v.(bson.M)
	if !ok {
		return false
	}
	changed := false
	for k, val := range dmg {
		switch n := val.(type) {
		case float64:
			dmg[k] = strconv.FormatFloat(n, 'f', -1, 64)
			changed = true
		case int32:
			dmg[k] = strconv.Itoa(int(n))
			changed = true
		case int64:
			dmg[k] = strconv.FormatInt(n, 10)
			changed = true
		}
	}
	return changed
}

// migrateSections walks a template's sections (descending into nested sections), converts preset
// damage to text and renames alwaysOn to addOnCreate. It returns the presets that were alwaysOn.
func migrateSections(sections primitive.A) ([]legacyPreset, bool) {
	var presets []legacyPreset
	changed := false
	var walkFields func(fields primitive.A)
	walkFields = func(fields primitive.A) {
		for _, f := range fields {
			field, ok := f.(bson.M)
			if !ok {
				continue
			}
			key, _ := field["key"].(string)
			for _, lk := range presetLists {
				listKey, kind := lk[0], lk[1]
				list, _ := field[listKey].(primitive.A)
				for _, p := range list {
					preset, ok := p.(bson.M)
					if !ok {
						continue
					}
					if textDamage(preset["damage"]) {
						changed = true
					}
					if on, has := preset["alwaysOn"]; has {
						delete(preset, "alwaysOn")
						changed = true
						if on == true {
							preset["addOnCreate"] = true
							presets = append(presets, legacyPreset{FieldKey: key, Kind: kind, Row: presetRow(preset)})
						}
					}
				}
			}
			if sec, ok := field["section"].(bson.M); ok {
				if inner, ok := sec["fields"].(primitive.A); ok {
					walkFields(inner)
				}
			}
		}
	}
	for _, s := range sections {
		if sec, ok := s.(bson.M); ok {
			if fields, ok := sec["fields"].(primitive.A); ok {
				walkFields(fields)
			}
		}
	}
	return presets, changed
}

// presetRow is the row a preset becomes in a character: id, cells, damage — never the flag.
func presetRow(preset bson.M) bson.M {
	row := bson.M{"id": preset["id"]}
	for _, k := range []string{"cells", "damage"} {
		if v, ok := preset[k]; ok {
			row[k] = v
		}
	}
	return row
}

// migrateStats converts a character's weapon damage to text, drops the dead row.favorite, and
// appends every preset whose id the character does not have yet. Reports whether it changed.
func migrateStats(stats bson.M, presets []legacyPreset) bool {
	changed := false
	if weapons, ok := stats["weapons"].(bson.M); ok {
		for _, rows := range weapons {
			list, _ := rows.(primitive.A)
			for _, r := range list {
				row, ok := r.(bson.M)
				if !ok {
					continue
				}
				if textDamage(row["damage"]) {
					changed = true
				}
				if _, has := row["favorite"]; has {
					delete(row, "favorite")
					changed = true
				}
			}
		}
	}
	for _, p := range presets {
		byField, ok := stats[p.Kind].(bson.M)
		if !ok {
			byField = bson.M{}
			stats[p.Kind] = byField
		}
		list, _ := byField[p.FieldKey].(primitive.A)
		if hasRow(list, p.Row["id"]) {
			continue
		}
		byField[p.FieldKey] = append(list, copyM(p.Row))
		changed = true
	}
	return changed
}

func hasRow(list primitive.A, id interface{}) bool {
	for _, r := range list {
		if row, ok := r.(bson.M); ok && row["id"] == id {
			return true
		}
	}
	return false
}

// copyM deep-copies one level of nested maps, so characters never share a preset's maps.
func copyM(m bson.M) bson.M {
	out := bson.M{}
	for k, v := range m {
		if inner, ok := v.(bson.M); ok {
			out[k] = copyM(inner)
		} else {
			out[k] = v
		}
	}
	return out
}

// decodeM decodes a raw document with every nested document as bson.M (the driver's default is
// primitive.D for nested documents inside interface{} values).
func decodeM(raw bson.Raw) (bson.M, error) {
	dec, err := bson.NewDecoder(bsonrw.NewBSONDocumentReader(raw))
	if err != nil {
		return nil, err
	}
	dec.DefaultDocumentM()
	var out bson.M
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

func migrateTemplates(ctx context.Context, col *mongo.Collection) int {
	cursor, err := col.Find(ctx, bson.M{})
	if err != nil {
		log.Fatalf("system_templates find: %v", err)
	}
	defer cursor.Close(ctx)
	n := 0
	for cursor.Next(ctx) {
		doc, err := decodeM(cursor.Current)
		if err != nil {
			log.Fatalf("system_templates decode: %v", err)
		}
		sections, _ := doc["sections"].(primitive.A)
		if _, changed := migrateSections(sections); !changed {
			continue
		}
		if _, err := col.UpdateOne(ctx, bson.M{"_id": doc["_id"]}, bson.M{"$set": bson.M{"sections": sections}}); err != nil {
			log.Fatalf("system_templates %v: %v", doc["_id"], err)
		}
		n++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("system_templates cursor: %v", err)
	}
	return n
}

func migrateGames(ctx context.Context, games, characters *mongo.Collection) (int, int) {
	cursor, err := games.Find(ctx, bson.M{"customSystemTemplate": bson.M{"$exists": true}})
	if err != nil {
		log.Fatalf("games find: %v", err)
	}
	defer cursor.Close(ctx)
	nGames, nChars := 0, 0
	for cursor.Next(ctx) {
		doc, err := decodeM(cursor.Current)
		if err != nil {
			log.Fatalf("games decode: %v", err)
		}
		tmpl, _ := doc["customSystemTemplate"].(bson.M)
		sections, _ := tmpl["sections"].(primitive.A)
		presets, changed := migrateSections(sections)
		nChars += migrateCharacters(ctx, characters, doc["_id"], presets)
		if !changed {
			continue
		}
		if _, err := games.UpdateOne(ctx, bson.M{"_id": doc["_id"]}, bson.M{"$set": bson.M{"customSystemTemplate.sections": sections}}); err != nil {
			log.Fatalf("games %v: %v", doc["_id"], err)
		}
		nGames++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("games cursor: %v", err)
	}
	return nGames, nChars
}

// migrateCharacters runs before the game's template is written back, so the alwaysOn flags that
// produced presets survive a crash here and a re-run copies what is still missing.
func migrateCharacters(ctx context.Context, col *mongo.Collection, gameID interface{}, presets []legacyPreset) int {
	cursor, err := col.Find(ctx, bson.M{"gameId": gameID, "gameSystem": "custom"})
	if err != nil {
		log.Fatalf("characters find: %v", err)
	}
	defer cursor.Close(ctx)
	n := 0
	for cursor.Next(ctx) {
		doc, err := decodeM(cursor.Current)
		if err != nil {
			log.Fatalf("characters decode: %v", err)
		}
		stats, _ := doc["stats"].(bson.M)
		if stats == nil || !migrateStats(stats, presets) {
			continue
		}
		if _, err := col.UpdateOne(ctx, bson.M{"_id": doc["_id"]}, bson.M{"$set": bson.M{"stats": stats}}); err != nil {
			log.Fatalf("characters %v: %v", doc["_id"], err)
		}
		n++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("characters cursor: %v", err)
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

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database(dbName)
	fmt.Printf("system_templates migrated: %d\n", migrateTemplates(ctx, db.Collection("system_templates")))
	nGames, nChars := migrateGames(ctx, db.Collection("games"), db.Collection("characters"))
	fmt.Printf("games migrated: %d\ncharacters migrated: %d\n", nGames, nChars)
}
