// migrate-skill-options converts custom-system templates from the old shared option model
// (FlexOption: a string OR {label, attr}) to the split model introduced with stable keys:
//
//	skill_table fields:   options: [{label,attr}|string]  →  skills: [{id,label,attr}]
//	select fields:        options: [{label}|string]       →  options: [string]
//	weapon select-columns: columns[].options: [...]        →  options: [string]
//
// The old object-form options can no longer decode into the Go structs (which now expect
// []string for select and []SkillOption for skill_table), so loading games/templates fails
// until this runs. It rewrites both standalone templates and the copy embedded in each game.
//
// Usage:
//
//	MONGO_URI=mongodb://localhost:27018 MONGO_DB=warhammer go run ./cmd/migrate-skill-options/
//
// Idempotent: a skill_table field already carrying `skills` (no `options`) and select/column
// options already plain strings are left untouched.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync/atomic"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var idCounter uint64

func genID(prefix string) string {
	n := atomic.AddUint64(&idCounter, 1)
	return fmt.Sprintf("%s_%d_%d", prefix, time.Now().UnixNano(), n)
}

func asString(v interface{}) string {
	s, _ := v.(string)
	return s
}

// optionLabel returns the label of a FlexOption element (a plain string or a {label,attr} doc).
func optionLabel(v interface{}) string {
	switch o := v.(type) {
	case string:
		return o
	case bson.M:
		return asString(o["label"])
	}
	return ""
}

// stringifyOptions converts an options array to plain strings, reporting whether any element
// was an object (i.e. whether a rewrite is actually needed).
func stringifyOptions(opts bson.A) (bson.A, bool) {
	out := make(bson.A, 0, len(opts))
	objSeen := false
	for _, el := range opts {
		if _, isDoc := el.(bson.M); isDoc {
			objSeen = true
		}
		out = append(out, optionLabel(el))
	}
	return out, objSeen
}

// normalizeField mutates one field doc in place, returning true if anything changed.
func normalizeField(field bson.M) bool {
	changed := false

	switch asString(field["type"]) {
	case "skill_table":
		// Move options (string|{label,attr}) → skills [{id,label,attr}]; drop options.
		if opts, ok := field["options"].(bson.A); ok {
			skills := make(bson.A, 0, len(opts))
			for _, el := range opts {
				switch o := el.(type) {
				case string:
					skills = append(skills, bson.M{"id": genID("skill"), "label": o, "attr": ""})
				case bson.M:
					skills = append(skills, bson.M{"id": genID("skill"), "label": asString(o["label"]), "attr": asString(o["attr"])})
				}
			}
			field["skills"] = skills
			delete(field, "options")
			changed = true
		}
	case "select":
		if opts, ok := field["options"].(bson.A); ok {
			if newOpts, objSeen := stringifyOptions(opts); objSeen {
				field["options"] = newOpts
				changed = true
			}
		}
	}

	// Weapon select-columns may carry object options → plain strings.
	if cols, ok := field["columns"].(bson.A); ok {
		for _, c := range cols {
			col, ok := c.(bson.M)
			if !ok {
				continue
			}
			if opts, ok := col["options"].(bson.A); ok {
				if newOpts, objSeen := stringifyOptions(opts); objSeen {
					col["options"] = newOpts
					changed = true
				}
			}
		}
	}

	return changed
}

func normalizeSections(sections bson.A) bool {
	changed := false
	for _, s := range sections {
		sec, ok := s.(bson.M)
		if !ok {
			continue
		}
		fields, ok := sec["fields"].(bson.A)
		if !ok {
			continue
		}
		for _, f := range fields {
			if field, ok := f.(bson.M); ok {
				if normalizeField(field) {
					changed = true
				}
			}
		}
	}
	return changed
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

	tplMigrated := migrateCollection(ctx, db.Collection("system_templates"), bson.M{}, func(doc bson.M) (bson.M, bool) {
		sections, ok := doc["sections"].(bson.A)
		if !ok || !normalizeSections(sections) {
			return nil, false
		}
		return bson.M{"sections": sections}, true
	})

	gameMigrated := migrateCollection(ctx, db.Collection("games"), bson.M{"customSystemTemplate": bson.M{"$exists": true}}, func(doc bson.M) (bson.M, bool) {
		tmpl, ok := doc["customSystemTemplate"].(bson.M)
		if !ok {
			return nil, false
		}
		sections, ok := tmpl["sections"].(bson.A)
		if !ok || !normalizeSections(sections) {
			return nil, false
		}
		return bson.M{"customSystemTemplate": tmpl}, true
	})

	fmt.Printf("Done. system_templates migrated: %d  games migrated: %d\n", tplMigrated, gameMigrated)
}

// migrateCollection iterates docs matching filter, applies transform, and $sets the returned
// patch when transform reports a change. Returns the number of updated documents.
func migrateCollection(ctx context.Context, col *mongo.Collection, filter bson.M, transform func(bson.M) (bson.M, bool)) int {
	cursor, err := col.Find(ctx, filter)
	if err != nil {
		log.Fatalf("find %s: %v", col.Name(), err)
	}
	defer cursor.Close(ctx)

	migrated := 0
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			log.Printf("%s: decode error: %v — skipping", col.Name(), err)
			continue
		}
		patch, changed := transform(doc)
		if !changed {
			continue
		}
		id := doc["_id"].(primitive.ObjectID)
		if _, err := col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": patch}); err != nil {
			log.Printf("%s doc %s: update error: %v", col.Name(), id.Hex(), err)
			continue
		}
		migrated++
	}
	if err := cursor.Err(); err != nil {
		log.Fatalf("cursor %s: %v", col.Name(), err)
	}
	return migrated
}
