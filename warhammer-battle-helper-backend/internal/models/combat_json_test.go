package models

import (
	"encoding/json"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// The raw Game goes to players (GET /games/:id, the WS GAME_STATE snapshot) and to the lobby list.
// A hidden ambush must never leave the server through any of them.
func TestSceneCombatNeverSerialized(t *testing.T) {
	g := Game{Scenes: []Scene{{
		ID:   primitive.NewObjectID(),
		Name: "Forest",
		Combat: &Combat{
			Version: 1, Round: 3, VisibleToPlayers: false,
			Entries: []CombatEntry{{ID: primitive.NewObjectID(), Kind: CombatEntryManual, Name: "Ambush", Initiative: 17, Hidden: true}},
		},
	}}}
	b, err := json.Marshal(g)
	if err != nil {
		t.Fatal(err)
	}
	out := strings.ToLower(string(b))
	for _, needle := range []string{"combat", "ambush", "initiative", "visibletoplayers"} {
		if strings.Contains(out, needle) {
			t.Errorf("serialized game leaks %q: %s", needle, out)
		}
	}
}
