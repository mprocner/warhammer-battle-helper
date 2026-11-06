package service

import (
	"encoding/base64"
	"strings"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestNewInviteToken(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		token, err := newInviteToken()
		if err != nil {
			t.Fatalf("newInviteToken: %v", err)
		}
		raw, err := base64.RawURLEncoding.DecodeString(token)
		if err != nil {
			t.Fatalf("token %q is not raw URL-safe base64: %v", token, err)
		}
		// 256 bits of entropy: well above the 128-bit floor for an unguessable secret.
		if len(raw) != inviteTokenBytes || inviteTokenBytes*8 < 128 {
			t.Fatalf("token carries %d bytes, want %d (>= 128 bit)", len(raw), inviteTokenBytes)
		}
		// The token goes into a URL path segment pasted into chat apps: no padding, no '/' or '+'.
		if strings.ContainsAny(token, "=/+") {
			t.Fatalf("token %q contains characters that are not URL-safe", token)
		}
		if seen[token] {
			t.Fatalf("token %q generated twice", token)
		}
		seen[token] = true
	}
}

func TestIsWellFormedInviteToken(t *testing.T) {
	valid, err := newInviteToken()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name  string
		token string
		want  bool
	}{
		{"freshly generated", valid, true},
		// An empty token must never reach the lookup: it is what "no link" looks like.
		{"empty", "", false},
		{"too short", valid[:len(valid)-1], false},
		{"too long", valid + "A", false},
		{"not base64", strings.Repeat("!", len(valid)), false},
		{"mongo operator smuggled in", "$ne" + valid[3:], false},
	}
	for _, c := range cases {
		if got := isWellFormedInviteToken(c.token); got != c.want {
			t.Errorf("%s: isWellFormedInviteToken(%q) = %v, want %v", c.name, c.token, got, c.want)
		}
	}
}

func TestPlayerParticipant(t *testing.T) {
	user := &models.User{
		ID:        primitive.NewObjectID(),
		Email:     "anna@example.com",
		Avatar:    "/avatars/a.png",
		Signature: "Anna",
	}

	stored, broadcast := playerParticipant(user)

	if stored.UserID != user.ID || stored.Email != user.Email || stored.Username != user.Email {
		t.Errorf("stored participant does not identify the user: %+v", stored)
	}
	if stored.Role != models.RolePlayer || broadcast.Role != models.RolePlayer {
		t.Error("a joining user must always become a player, never a GM")
	}
	// Account avatar/signature are computed fields (bson:"-"): they belong on the broadcast so
	// other clients can render the newcomer at once, and are meaningless in the stored copy.
	if stored.AccountAvatar != "" || stored.AccountSignature != "" {
		t.Error("the stored participant must not carry computed account fields")
	}
	if broadcast.AccountAvatar != user.Avatar || broadcast.AccountSignature != user.Signature {
		t.Errorf("broadcast participant is missing account avatar/signature: %+v", broadcast)
	}
	if broadcast.UserID != stored.UserID || broadcast.Email != stored.Email {
		t.Error("stored and broadcast participant must describe the same user")
	}
}

func TestNeedsToJoin(t *testing.T) {
	gm, player, stranger := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	game := &models.Game{
		GameMasterID: gm,
		Participants: []models.GameParticipant{{UserID: player, Role: models.RolePlayer}},
	}

	if needsToJoin(game, gm) {
		t.Error("the GM opening their own link must not be added as a player")
	}
	if needsToJoin(game, player) {
		t.Error("an existing participant must just open the game")
	}
	if !needsToJoin(game, stranger) {
		t.Error("a stranger with a valid link must be added")
	}
}
