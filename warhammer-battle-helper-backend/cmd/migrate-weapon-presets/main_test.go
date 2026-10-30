package main

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func legacySections() primitive.A {
	weapons := bson.M{
		"key": "weapons", "type": "weapons_table",
		"presetWeapons": primitive.A{
			bson.M{"id": "preset_fists", "cells": bson.M{"name": "Fists"}, "damage": bson.M{"d1": 3.0}, "alwaysOn": true},
			bson.M{"id": "preset_sword", "damage": bson.M{"d1": 8.0}},
		},
	}
	gear := bson.M{"key": "gear", "type": "data_table",
		"presetRows": primitive.A{bson.M{"id": "preset_rope", "cells": bson.M{"name": "Rope"}, "alwaysOn": true}}}
	nested := bson.M{"key": "s1", "type": "section", "section": bson.M{"fields": primitive.A{gear}}}
	return primitive.A{bson.M{"id": "sec", "fields": primitive.A{weapons, nested}}}
}

func TestMigrateSections(t *testing.T) {
	secs := legacySections()
	presets, changed := migrateSections(secs)
	if !changed {
		t.Fatal("changed = false, want true")
	}
	if len(presets) != 2 || presets[0].Row["id"] != "preset_fists" || presets[0].Kind != "weapons" ||
		presets[1].Row["id"] != "preset_rope" || presets[1].Kind != "tables" || presets[1].FieldKey != "gear" {
		t.Fatalf("presets = %+v, want fists (weapons) then rope (tables, nested)", presets)
	}
	fists := secs[0].(bson.M)["fields"].(primitive.A)[0].(bson.M)["presetWeapons"].(primitive.A)[0].(bson.M)
	if fists["damage"].(bson.M)["d1"] != "3" || fists["addOnCreate"] != true || fists["alwaysOn"] != nil {
		t.Errorf("fists = %+v, want damage \"3\", addOnCreate, no alwaysOn", fists)
	}
	sword := secs[0].(bson.M)["fields"].(primitive.A)[0].(bson.M)["presetWeapons"].(primitive.A)[1].(bson.M)
	if sword["damage"].(bson.M)["d1"] != "8" || sword["addOnCreate"] != nil {
		t.Errorf("sword = %+v, want damage \"8\" and no flag", sword)
	}

	if presets, changed := migrateSections(secs); changed || len(presets) != 0 {
		t.Errorf("second run: changed=%v presets=%d, want a no-op", changed, len(presets))
	}
}

func TestMigrateStats(t *testing.T) {
	presets, _ := migrateSections(legacySections())
	stats := bson.M{"weapons": bson.M{"weapons": primitive.A{
		bson.M{"id": "w1", "damage": bson.M{"d1": 6.0, "m1": 2.5}, "favorite": true},
	}}}

	if !migrateStats(stats, presets) {
		t.Fatal("migrateStats = false, want true")
	}
	rows := stats["weapons"].(bson.M)["weapons"].(primitive.A)
	if len(rows) != 2 || rows[1].(bson.M)["id"] != "preset_fists" {
		t.Fatalf("weapons = %+v, want w1 then the copied preset", rows)
	}
	w1 := rows[0].(bson.M)
	if w1["damage"].(bson.M)["d1"] != "6" || w1["damage"].(bson.M)["m1"] != "2.5" || w1["favorite"] != nil {
		t.Errorf("w1 = %+v, want text damage and no favorite", w1)
	}
	if rows[1].(bson.M)["addOnCreate"] != nil || rows[1].(bson.M)["alwaysOn"] != nil {
		t.Errorf("copied row %+v must not carry the preset flag", rows[1])
	}
	gear := stats["tables"].(bson.M)["gear"].(primitive.A)
	if len(gear) != 1 || gear[0].(bson.M)["id"] != "preset_rope" {
		t.Errorf("tables.gear = %+v, want the rope row", gear)
	}

	// A re-run (e.g. after a crash before the template rename) must not duplicate rows.
	if migrateStats(stats, presets) {
		t.Error("second run changed stats, want a no-op")
	}
}
