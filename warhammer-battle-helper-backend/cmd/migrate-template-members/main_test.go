package main

import (
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestMembersFor(t *testing.T) {
	owner, a, b := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()

	got := membersFor(owner, []primitive.ObjectID{a, owner, b, a})
	want := []models.TemplateMember{
		{UserID: owner, Role: models.RoleOwner},
		{UserID: a, Role: models.RoleViewer},
		{UserID: b, Role: models.RoleViewer},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}

	if solo := membersFor(owner, nil); len(solo) != 1 || solo[0].Role != models.RoleOwner {
		t.Errorf("membersFor(owner, nil) = %+v, want only the owner", solo)
	}
}
