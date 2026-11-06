package models

import (
	"encoding/json"
	"strings"
	"testing"
)

// The raw Game struct is sent to every player (GET /games/:id, WS GAME_STATE) and to the lobby
// list, with no per-viewer masking of top-level fields. The invite token must never ride along.
func TestGameJSONNeverCarriesInviteToken(t *testing.T) {
	game := Game{Name: "Night in Altdorf", InviteToken: "secret-invite-token"}
	out, err := json.Marshal(game)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "secret-invite-token") || strings.Contains(string(out), "inviteToken") {
		t.Fatalf("serialized game leaks the invite token: %s", out)
	}
}
