package combat

import (
	"errors"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func entry(name string, ini int) models.CombatEntry {
	return models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual, Name: name, Initiative: ini}
}

func names(c *models.Combat) []string {
	out := make([]string, len(c.Entries))
	for i, e := range c.Entries {
		out[i] = e.Name
	}
	return out
}

func eq(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func noneKilled(models.CombatEntry) bool { return false }

func TestInsertSortsDescendingTiesAfter(t *testing.T) {
	c := &models.Combat{}
	Insert(c, entry("a", 10))
	Insert(c, entry("b", 15))
	Insert(c, entry("c", 10))
	Insert(c, entry("d", 3))
	eq(t, names(c), []string{"b", "a", "c", "d"})
}

func TestSetInitiativeMovesEntryAndKeepsActive(t *testing.T) {
	c := &models.Combat{}
	a, b := entry("a", 10), entry("b", 5)
	Insert(c, a)
	Insert(c, b)
	c.ActiveID = b.ID
	if err := SetInitiative(c, b.ID, 20); err != nil {
		t.Fatal(err)
	}
	eq(t, names(c), []string{"b", "a"})
	if c.ActiveID != b.ID {
		t.Fatal("active entry must stay active after its value changes")
	}
}

func TestReorderRequiresPermutation(t *testing.T) {
	c := &models.Combat{}
	a, b := entry("a", 10), entry("b", 5)
	Insert(c, a)
	Insert(c, b)
	if err := Reorder(c, []primitive.ObjectID{a.ID}); !errors.Is(err, ErrBadOrder) {
		t.Fatalf("short list: got %v", err)
	}
	if err := Reorder(c, []primitive.ObjectID{a.ID, a.ID}); !errors.Is(err, ErrBadOrder) {
		t.Fatalf("duplicate: got %v", err)
	}
	if err := Reorder(c, []primitive.ObjectID{b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	eq(t, names(c), []string{"b", "a"})
}

func TestActivateTracksLastVisible(t *testing.T) {
	c := &models.Combat{}
	v, h := entry("v", 10), entry("h", 5)
	h.Hidden = true
	Insert(c, v)
	Insert(c, h)
	_ = Activate(c, v.ID)
	_ = Activate(c, h.ID)
	if c.ActiveID != h.ID || c.LastVisibleActiveID != v.ID {
		t.Fatalf("active=%v lastVisible=%v", c.ActiveID, c.LastVisibleActiveID)
	}
}

func TestNextMarksActedAndSkipsKilled(t *testing.T) {
	c := &models.Combat{}
	a, b, k, d := entry("a", 20), entry("b", 15), entry("k", 10), entry("d", 5)
	for _, e := range []models.CombatEntry{a, b, k, d} {
		Insert(c, e)
	}
	killed := func(e models.CombatEntry) bool { return e.ID == k.ID }
	if err := Next(c, primitive.NilObjectID, killed); err != nil || c.ActiveID != a.ID {
		t.Fatalf("first next: err=%v active=%v", err, c.ActiveID)
	}
	_ = Next(c, a.ID, killed)
	_ = Next(c, b.ID, killed)
	if c.ActiveID != d.ID {
		t.Fatalf("killed entry must be skipped, active=%v", c.ActiveID)
	}
	_ = Next(c, d.ID, killed)
	if !c.ActiveID.IsZero() {
		t.Fatal("when everyone acted nobody is active")
	}
	if c.Round != 0 {
		t.Fatal("next never closes the round")
	}
}

// Two players ending the same turn: the second request names a turn that is already over.
func TestNextWithStaleExpectedIsConflict(t *testing.T) {
	c := &models.Combat{}
	a, b, d := entry("a", 20), entry("b", 15), entry("d", 5)
	Insert(c, a)
	Insert(c, b)
	Insert(c, d)
	_ = Activate(c, a.ID)
	if err := Next(c, a.ID, noneKilled); err != nil {
		t.Fatal(err)
	}
	if err := Next(c, a.ID, noneKilled); !errors.Is(err, ErrConflict) {
		t.Fatalf("got %v, want ErrConflict", err)
	}
	if c.ActiveID != b.ID {
		t.Fatal("a conflicting call must not move the turn")
	}
}

func TestEndRoundResetsAndActivatesFirstAlive(t *testing.T) {
	c := &models.Combat{Round: 1}
	k, a := entry("k", 20), entry("a", 10)
	Insert(c, k)
	Insert(c, a)
	c.Entries[0].Acted, c.Entries[1].Acted = true, true
	EndRound(c, func(e models.CombatEntry) bool { return e.ID == k.ID })
	if c.Round != 2 || c.Entries[0].Acted || c.Entries[1].Acted || c.ActiveID != a.ID {
		t.Fatalf("round=%d active=%v entries=%+v", c.Round, c.ActiveID, c.Entries)
	}
}

func TestRemoveClearsActive(t *testing.T) {
	c := &models.Combat{}
	a := entry("a", 1)
	Insert(c, a)
	_ = Activate(c, a.ID)
	if err := Remove(c, a.ID); err != nil {
		t.Fatal(err)
	}
	if !c.ActiveID.IsZero() || !c.LastVisibleActiveID.IsZero() || len(c.Entries) != 0 {
		t.Fatalf("%+v", c)
	}
	if err := Remove(c, a.ID); !errors.Is(err, ErrEntryNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestPruneDropsEntriesWithoutSource(t *testing.T) {
	liveChar := primitive.NewObjectID()
	goneChar := primitive.NewObjectID()
	img := models.SceneImage{ID: primitive.NewObjectID(), Layer: "tokens"}
	scene := &models.Scene{Images: []models.SceneImage{img}}
	chars := map[primitive.ObjectID]*models.Character{liveChar: {ID: liveChar}}

	// A character entry needs no placement on the scene, only a living character.
	keepChar := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryGameCharacter, SourceID: liveChar, Name: "keepChar"}
	keepImg := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryImage, SourceID: img.ID, Name: "keepImg"}
	keepManual := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryManual, Name: "keepManual"}
	deletedChar := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryGameCharacter, SourceID: goneChar, Name: "goneChar"}
	deletedImage := models.CombatEntry{ID: primitive.NewObjectID(), Kind: models.CombatEntryImage, SourceID: primitive.NewObjectID(), Name: "goneImage"}
	// Stored entries are not migrated: a kind the tracker no longer knows (the old per-placement
	// "character" entry) is dropped.
	retired := models.CombatEntry{ID: primitive.NewObjectID(), Kind: "character", SourceID: primitive.NewObjectID(), Name: "retired"}

	c := &models.Combat{Entries: []models.CombatEntry{keepChar, retired, keepImg, deletedChar, keepManual, deletedImage}, ActiveID: deletedImage.ID, LastVisibleActiveID: retired.ID}
	Prune(c, scene, chars)
	eq(t, names(c), []string{"keepChar", "keepImg", "keepManual"})
	if !c.ActiveID.IsZero() || !c.LastVisibleActiveID.IsZero() {
		t.Fatal("a pruned active entry leaves nobody active")
	}
}

func TestCloneIsDeep(t *testing.T) {
	c := &models.Combat{Entries: []models.CombatEntry{entry("a", 1)}}
	cp := Clone(c)
	cp.Entries[0].Name = "changed"
	if c.Entries[0].Name != "a" {
		t.Fatal("clone shares the entries array")
	}
	if Clone(nil) != nil {
		t.Fatal("clone of nil is nil")
	}
}
