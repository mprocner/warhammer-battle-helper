package service

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubHub struct {
	toGame  int
	toUsers [][]string
}

func (h *stubHub) BroadcastToGame(gameID, messageType string, payload map[string]interface{}) {
	h.toGame++
}

func (h *stubHub) BroadcastToUsers(gameID, messageType string, payload map[string]interface{}, userIDs []string) {
	h.toUsers = append(h.toUsers, userIDs)
}

func TestRollPublisher_RoutesByVisibility(t *testing.T) {
	gm, roller, other := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

	cases := []struct {
		name       string
		visibility string
		roller     primitive.ObjectID
		wantGame   bool
		wantUsers  []string
	}{
		{"all", "all", roller, true, nil},
		{"empty means all", "", roller, true, nil},
		{"gm only", "gm_only", roller, false, []string{gm.Hex()}},
		{"gm and roller", "gm_and_roller", roller, false, []string{gm.Hex(), roller.Hex()}},
		{"gm and roller when gm rolls", "gm_and_roller", gm, false, []string{gm.Hex()}},
		{"targeted player", other.Hex(), roller, false, []string{roller.Hex(), other.Hex()}},
		{"targeted at self", roller.Hex(), roller, false, []string{roller.Hex()}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			hub := &stubHub{}
			NewRollPublisher(hub).Publish("g1", "DICE_ROLLED", nil, tc.visibility, tc.roller, gm)

			if tc.wantGame {
				if hub.toGame != 1 || len(hub.toUsers) != 0 {
					t.Fatalf("want one game-wide broadcast, got game=%d users=%v", hub.toGame, hub.toUsers)
				}
				return
			}
			if hub.toGame != 0 || len(hub.toUsers) != 1 || !reflect.DeepEqual(hub.toUsers[0], tc.wantUsers) {
				t.Fatalf("want users %v, got game=%d users=%v", tc.wantUsers, hub.toGame, hub.toUsers)
			}
		})
	}
}
