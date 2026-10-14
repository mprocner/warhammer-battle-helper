package main

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestPlanAccessMove(t *testing.T) {
	u := primitive.NewObjectID()
	old := &models.SystemAccess{System: oldKey, UserIDs: []primitive.ObjectID{u}}
	existing := &models.SystemAccess{System: newKey, AllUsers: true}

	tests := []struct {
		name          string
		oldDoc        *models.SystemAccess
		newDoc        *models.SystemAccess
		wantInsert    bool
		wantDeleteOld bool
	}{
		{"only old: copy under new id, drop old", old, nil, true, true},
		{"both: admin's new doc wins, drop old", old, existing, false, true},
		{"only new: already migrated, nothing to do", nil, existing, false, false},
		{"neither: nothing to do", nil, nil, false, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			insert, deleteOld := planAccessMove(tc.oldDoc, tc.newDoc)
			if (insert != nil) != tc.wantInsert {
				t.Fatalf("insert = %+v, want insert %v", insert, tc.wantInsert)
			}
			if deleteOld != tc.wantDeleteOld {
				t.Fatalf("deleteOld = %v, want %v", deleteOld, tc.wantDeleteOld)
			}
			if insert != nil {
				if insert.System != newKey {
					t.Errorf("insert.System = %q, want %q", insert.System, newKey)
				}
				if len(insert.UserIDs) != 1 || insert.UserIDs[0] != u {
					t.Errorf("insert.UserIDs = %v, want [%v]", insert.UserIDs, u)
				}
				if tc.oldDoc.System != oldKey {
					t.Errorf("planAccessMove mutated the old doc: System = %q", tc.oldDoc.System)
				}
			}
		})
	}
}
