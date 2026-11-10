package main

import (
	"testing"
	"time"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestAssignColours(t *testing.T) {
	palette := models.ParticipantPalette
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	gm := models.GameParticipant{UserID: primitive.NewObjectID()} // CreateGame never set JoinedAt
	early := models.GameParticipant{UserID: primitive.NewObjectID(), JoinedAt: t0.Add(time.Hour)}
	late := models.GameParticipant{UserID: primitive.NewObjectID(), JoinedAt: t0.Add(2 * time.Hour)}
	picked := models.GameParticipant{UserID: primitive.NewObjectID(), JoinedAt: t0, Color: palette[1]}

	got := assignColours([]models.GameParticipant{late, picked, gm, early})

	want := []colourAssignment{
		{gm.UserID, palette[0]},
		{early.UserID, palette[2]}, // palette[1] already held by the participant who picked it
		{late.UserID, palette[3]},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d assignments %v, want %d", len(got), got, len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("assignment %d = %v, want %v", i, got[i], want[i])
		}
	}
}

func TestAssignColoursFullyColouredGameIsUntouched(t *testing.T) {
	ps := []models.GameParticipant{{UserID: primitive.NewObjectID(), Color: "#123456"}}
	if got := assignColours(ps); len(got) != 0 {
		t.Errorf("got %v, want no assignments", got)
	}
}

func TestAssignColoursPastPaletteGivesDistinctWraps(t *testing.T) {
	n := len(models.ParticipantPalette) + 2
	ps := make([]models.GameParticipant, n)
	for i := range ps {
		ps[i] = models.GameParticipant{UserID: primitive.NewObjectID(), JoinedAt: time.Unix(int64(i), 0)}
	}
	got := assignColours(ps)
	if got[n-2].Color == got[n-1].Color {
		t.Errorf("two wrapped participants share %s", got[n-1].Color)
	}
}
