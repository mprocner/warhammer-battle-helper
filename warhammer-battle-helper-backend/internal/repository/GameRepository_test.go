package repository

import (
	"battle-helper/internal/models"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func handoutIDsOf(handouts []models.Handout) []primitive.ObjectID {
	ids := make([]primitive.ObjectID, 0, len(handouts))
	for _, h := range handouts {
		ids = append(ids, h.ID)
	}
	return ids
}

func handoutTitlesOf(handouts []models.Handout) []string {
	titles := make([]string, 0, len(handouts))
	for _, h := range handouts {
		titles = append(titles, h.Title)
	}
	return titles
}

func assertTitles(t *testing.T, got []models.Handout, want []string) {
	t.Helper()
	titles := handoutTitlesOf(got)
	if len(titles) != len(want) {
		t.Fatalf("got handouts %v, want %v", titles, want)
	}
	for i := range want {
		if titles[i] != want[i] {
			t.Fatalf("got handouts %v, want %v", titles, want)
		}
	}
}

func assertOrderIsSequential(t *testing.T, got []models.Handout) {
	t.Helper()
	for i, h := range got {
		if h.Order != i {
			t.Fatalf("handout %q has order %d at position %d", h.Title, h.Order, i)
		}
	}
}

func TestApplyHandoutOrder(t *testing.T) {
	a := models.Handout{ID: primitive.NewObjectID(), Title: "a"}
	b := models.Handout{ID: primitive.NewObjectID(), Title: "b"}
	c := models.Handout{ID: primitive.NewObjectID(), Title: "c"}
	existing := []models.Handout{a, b, c}

	t.Run("reorders to the requested sequence", func(t *testing.T) {
		got := applyHandoutOrder(existing, []primitive.ObjectID{c.ID, a.ID, b.ID})
		assertTitles(t, got, []string{"c", "a", "b"})
		assertOrderIsSequential(t, got)
	})

	t.Run("keeps one entry per id when the client repeats an id", func(t *testing.T) {
		// A client whose local list holds two copies of one handout (create/WS race)
		// must not be able to write that duplicate into the game.
		got := applyHandoutOrder(existing, []primitive.ObjectID{a.ID, b.ID, a.ID, c.ID})
		assertTitles(t, got, []string{"a", "b", "c"})
		assertOrderIsSequential(t, got)
	})

	t.Run("appends handouts the client did not send", func(t *testing.T) {
		// A handout created after the client built its list must survive the reorder.
		got := applyHandoutOrder(existing, []primitive.ObjectID{c.ID, a.ID})
		assertTitles(t, got, []string{"c", "a", "b"})
		assertOrderIsSequential(t, got)
	})

	t.Run("ignores ids that do not exist in the game", func(t *testing.T) {
		got := applyHandoutOrder(existing, []primitive.ObjectID{b.ID, primitive.NewObjectID(), a.ID, c.ID})
		assertTitles(t, got, []string{"b", "a", "c"})
		assertOrderIsSequential(t, got)
	})

	t.Run("keeps every handout when the client sends nothing", func(t *testing.T) {
		got := applyHandoutOrder(existing, nil)
		assertTitles(t, got, []string{"a", "b", "c"})
		assertOrderIsSequential(t, got)
	})

	t.Run("does not mutate the stored slice", func(t *testing.T) {
		before := handoutIDsOf(existing)
		applyHandoutOrder(existing, []primitive.ObjectID{c.ID, b.ID, a.ID})
		after := handoutIDsOf(existing)
		for i := range before {
			if before[i] != after[i] {
				t.Fatalf("applyHandoutOrder mutated the input slice")
			}
		}
	})
}
