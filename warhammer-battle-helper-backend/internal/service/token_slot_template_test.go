package service

import (
	"testing"

	"battle-helper/internal/models"
)

// No locked position means no rule, and a token under no rule must stay overlay-less — fabricating
// an empty overlay would light up the ring chrome on every image the GM drops on the map.
func TestApplyTemplateToOverlay_NilWhenNothingLockedAndNoOverlay(t *testing.T) {
	if got := ApplyTemplateToOverlay(nil, nil); got != nil {
		t.Fatalf("nil template must enforce no overlay, got %+v", got)
	}
	if got := ApplyTemplateToOverlay(make([]*models.ImageTokenSlot, 8), nil); got != nil {
		t.Fatalf("all-nil template must enforce no overlay, got %+v", got)
	}
}

// No locked position, but the image already has an overlay: there is nothing to enforce, so the
// overlay must come back exactly as it went in — not dropped, not rewritten.
func TestApplyTemplateToOverlay_UnchangedWhenNothingLocked(t *testing.T) {
	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots: []models.ImageTokenSlot{
			{ID: "existing-id", Type: "icon", Icon: "shield", Level: 2},
		},
	}

	got := ApplyTemplateToOverlay(nil, overlay)
	if got != overlay {
		t.Fatalf("no locked position must return the overlay unchanged, got %+v want %+v", got, overlay)
	}
}

// One locked position seeds all eight slots on a fresh (nil) overlay: the rule at its index, empty
// everywhere else, so the ring angles (angle = index) stay stable. This is the old
// SeedOverlayFromTemplate behaviour, now expressed as ApplyTemplateToOverlay(tpl, nil).
func TestApplyTemplateToOverlay_SeedsEightSlotsWhenOverlayNil(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[2] = &models.ImageTokenSlot{Type: "number", NumberLabel: "Armour"}

	overlay := ApplyTemplateToOverlay(tpl, nil)
	if overlay == nil {
		t.Fatal("a locked position must produce an overlay")
	}
	if !overlay.Enabled {
		t.Fatal("produced overlay must be enabled")
	}
	if len(overlay.HPBars) != 0 {
		t.Fatalf("HP bars are out of scope and must not be touched, got %+v", overlay.HPBars)
	}
	if len(overlay.Slots) != 8 {
		t.Fatalf("want 8 slots, got %d", len(overlay.Slots))
	}
	if s := overlay.Slots[2]; s.Type != "number" || s.NumberLabel != "Armour" || !s.Locked {
		t.Fatalf("locked position must carry the template config, got %+v", s)
	}
	if s := overlay.Slots[0]; s.Type != "empty" || s.Locked {
		t.Fatalf("unlocked position must be an empty unlocked slot, got %+v", s)
	}

	seen := map[string]bool{}
	for i, s := range overlay.Slots {
		if s.ID == "" {
			t.Fatalf("slot %d has no id", i)
		}
		if seen[s.ID] {
			t.Fatalf("slot %d reuses id %s", i, s.ID)
		}
		seen[s.ID] = true
	}
}

// The live value belongs to the token, never to the rule: a template entry that somehow carries one
// must not hand it to every new token.
func TestApplyTemplateToOverlay_ZeroesLiveValuesWhenOverlayNil(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[1] = &models.ImageTokenSlot{ID: "template-id", Type: "icon", Icon: "shield", Level: 3, Number: 7}

	overlay := ApplyTemplateToOverlay(tpl, nil)
	s := overlay.Slots[1]
	if s.Level != 0 || s.Number != 0 {
		t.Fatalf("live values must reset, got level=%d number=%v", s.Level, s.Number)
	}
	if s.ID == "" || s.ID == "template-id" {
		t.Fatalf("seeded slot must get its own fresh id, got %q", s.ID)
	}
}

// Regression guard for the AddImageToScene leak: a seeded Hidden slot must still be blanked on its
// way to a player.
func TestApplyTemplateToOverlay_HiddenSlotIsMaskedForPlayers(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[0] = &models.ImageTokenSlot{Type: "icon", Icon: "poison", ConditionKey: "poisoned", ConditionLabel: "Poisoned", Hidden: true}

	masked := MaskImageTokenForPlayer(ApplyTemplateToOverlay(tpl, nil))
	s := masked.Slots[0]
	if s.Type != "empty" || s.Icon != "" || s.ConditionKey != "" || s.ConditionLabel != "" {
		t.Fatalf("hidden seeded slot must be blanked for players, got %+v", s)
	}
	if s.ID == "" {
		t.Fatal("masked slot must keep its id so ring positions do not shift")
	}
}

// The FEATURE-179 gap this function closes: a token was configured (so it already has an overlay)
// and then promoted to the tokens layer after the GM padlocked a position. The locked position's
// config must land on the existing overlay, but the slot's OWN id must survive (it is not a fresh
// token) and its live value must reset like any other enforcement.
func TestApplyTemplateToOverlay_EnforcesLockedPositionOnExistingOverlay(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[3] = &models.ImageTokenSlot{Type: "icon", Icon: "poison", ConditionKey: "poisoned", ConditionLabel: "Poisoned"}

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[3] = models.ImageTokenSlot{ID: "my-own-id", Type: "number", NumberLabel: "Wounds", Number: 12}

	got := ApplyTemplateToOverlay(tpl, overlay)
	if got == nil {
		t.Fatal("expected an overlay back")
	}
	s := got.Slots[3]
	if s.Type != "icon" || s.Icon != "poison" || s.ConditionKey != "poisoned" {
		t.Fatalf("locked position must carry the template's config, got %+v", s)
	}
	if !s.Locked {
		t.Fatalf("enforced position must be marked locked, got %+v", s)
	}
	if s.Number != 0 {
		t.Fatalf("live value must reset, got %+v", s)
	}
	if s.ID != "my-own-id" {
		t.Fatalf("slot must keep its own id, got %q", s.ID)
	}
}

// Positions the template does not lock must survive an enforcement pass untouched, live value
// included — only the locked positions are the rule's business.
func TestApplyTemplateToOverlay_LeavesUnlockedPositionsAlone(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[3] = &models.ImageTokenSlot{Type: "icon", Icon: "poison"}

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[5] = models.ImageTokenSlot{ID: "untouched-id", Type: "number", NumberLabel: "Fate", Number: 4}

	got := ApplyTemplateToOverlay(tpl, overlay)
	s := got.Slots[5]
	if s.ID != "untouched-id" || s.Type != "number" || s.NumberLabel != "Fate" || s.Number != 4 {
		t.Fatalf("unlocked position must be left alone, got %+v", s)
	}
}

// A token configured before the ring size existed (or trimmed some other way) must be padded to
// the fixed 8 positions before enforcement runs, exactly like a fresh seed.
func TestApplyTemplateToOverlay_PadsShortOverlay(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[6] = &models.ImageTokenSlot{Type: "icon", Icon: "shield"}

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots: []models.ImageTokenSlot{
			{ID: "pos-0", Type: "empty"},
		},
	}

	got := ApplyTemplateToOverlay(tpl, overlay)
	if len(got.Slots) != 8 {
		t.Fatalf("want padding to 8 slots, got %d", len(got.Slots))
	}
	if s := got.Slots[6]; s.Type != "icon" || s.Icon != "shield" || !s.Locked {
		t.Fatalf("padded overlay must still get the locked position enforced, got %+v", s)
	}
	if got.Slots[0].ID != "pos-0" {
		t.Fatalf("padding must not disturb an existing slot, got %+v", got.Slots[0])
	}
}

// The overlay handed in is shared state (it comes straight off game.Scenes) — enforcement must
// never write through the caller's pointer.
func TestApplyTemplateToOverlay_DoesNotMutateCallersOverlay(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[3] = &models.ImageTokenSlot{Type: "icon", Icon: "poison"}

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[3] = models.ImageTokenSlot{ID: "my-own-id", Type: "number", NumberLabel: "Wounds", Number: 12}

	got := ApplyTemplateToOverlay(tpl, overlay)
	if got == overlay {
		t.Fatal("enforcement must not return the caller's own overlay pointer when it writes into it")
	}
	if s := overlay.Slots[3]; s.Type != "number" || s.NumberLabel != "Wounds" || s.Number != 12 {
		t.Fatalf("caller's overlay must be untouched after the call, got %+v", s)
	}
	if len(overlay.Slots) != 8 {
		t.Fatalf("caller's overlay slot count must be untouched, got %d", len(overlay.Slots))
	}
}

// FEATURE-179 second half: a slot padlocked at some position, then parked off the tokens layer
// while the GM unlocks that position, then promoted back. The template no longer locks the
// position, so enforcement must clear the stale flag — but config and the live value are the
// token's own and must survive exactly as they were.
func TestApplyTemplateToOverlay_ClearsStaleLockedFlag(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8) // nothing locked any more

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[4] = models.ImageTokenSlot{ID: "stale-id", Type: "number", NumberLabel: "Wounds", Number: 7, Locked: true}

	got := ApplyTemplateToOverlay(tpl, overlay)
	if got == nil {
		t.Fatal("expected an overlay back")
	}
	s := got.Slots[4]
	if s.Locked {
		t.Fatalf("stale locked flag must be cleared, got %+v", s)
	}
	if s.ID != "stale-id" || s.Type != "number" || s.NumberLabel != "Wounds" || s.Number != 7 {
		t.Fatalf("config and live value must survive untouched, got %+v", s)
	}
}

// The call site depends on pointer identity to skip a redundant repository write and WS
// broadcast: a stale flag being cleared is genuine work, so it must come back as a fresh copy,
// never the caller's own pointer.
func TestApplyTemplateToOverlay_ClearingStaleFlagReturnsDifferentPointer(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[4] = models.ImageTokenSlot{ID: "stale-id", Type: "number", Locked: true}

	got := ApplyTemplateToOverlay(tpl, overlay)
	if got == overlay {
		t.Fatal("clearing a stale flag is genuine work; must not return the caller's own pointer")
	}
}

// No stale flag anywhere and an all-nil template: there is genuinely nothing to enforce, so the
// overlay must come back exactly as it went in, pointer included.
func TestApplyTemplateToOverlay_NoStaleFlagsReturnsInputPointer(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots: []models.ImageTokenSlot{
			{ID: "a", Type: "icon", Icon: "shield"},
			{ID: "b", Type: "empty"},
		},
	}

	got := ApplyTemplateToOverlay(tpl, overlay)
	if got != overlay {
		t.Fatalf("no locked position and no stale flag must return the input pointer, got %+v want %+v", got, overlay)
	}
}

// Clearing a stale flag must not write through the caller's shared struct any more than
// enforcing a locked position does.
func TestApplyTemplateToOverlay_ClearingStaleFlagDoesNotMutateCallersOverlay(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[4] = models.ImageTokenSlot{ID: "stale-id", Type: "number", Number: 7, Locked: true}

	ApplyTemplateToOverlay(tpl, overlay)
	if s := overlay.Slots[4]; !s.Locked {
		t.Fatalf("caller's overlay must be untouched after the call, got %+v", s)
	}
}

// Realistic GM scenario: position 2 is locked by the template, position 4 carries a stale
// Locked flag from a rule that no longer applies. One enforcement pass must fix both without
// interfering with each other.
func TestApplyTemplateToOverlay_LockedAndStalePositionsCoexist(t *testing.T) {
	tpl := make([]*models.ImageTokenSlot, 8)
	tpl[2] = &models.ImageTokenSlot{Type: "icon", Icon: "poison"}

	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		Slots:   make([]models.ImageTokenSlot, 8),
	}
	overlay.Slots[2] = models.ImageTokenSlot{ID: "pos-2-id", Type: "empty"}
	overlay.Slots[4] = models.ImageTokenSlot{ID: "pos-4-id", Type: "number", NumberLabel: "Wounds", Number: 9, Locked: true}

	got := ApplyTemplateToOverlay(tpl, overlay)

	s2 := got.Slots[2]
	if !s2.Locked || s2.Icon != "poison" || s2.ID != "pos-2-id" {
		t.Fatalf("template-locked position must be enforced, got %+v", s2)
	}

	s4 := got.Slots[4]
	if s4.Locked {
		t.Fatalf("stale locked position must be cleared, got %+v", s4)
	}
	if s4.ID != "pos-4-id" || s4.NumberLabel != "Wounds" || s4.Number != 9 {
		t.Fatalf("stale position's config and live value must survive, got %+v", s4)
	}
}

// Locking stores config only; unlocking clears the entry and leaves its neighbours alone.
func TestSetTokenSlotTemplateEntry(t *testing.T) {
	tpl := SetTokenSlotTemplateEntry(nil, 3, &models.ImageTokenSlot{
		ID: "token-slot-id", Type: "icon", Icon: "shield", Level: 2, Number: 5,
	})
	if len(tpl) != 8 {
		t.Fatalf("want a normalized 8-entry template, got %d", len(tpl))
	}
	e := tpl[3]
	if e == nil {
		t.Fatal("position 3 must be locked")
	}
	if e.ID != "" || e.Level != 0 || e.Number != 0 {
		t.Fatalf("template entry must carry config only, got %+v", e)
	}
	if !e.Locked || e.Icon != "shield" {
		t.Fatalf("template entry must keep the config and the locked flag, got %+v", e)
	}
	if tpl[0] != nil {
		t.Fatalf("other positions must stay unlocked, got %+v", tpl[0])
	}

	tpl = SetTokenSlotTemplateEntry(tpl, 3, nil)
	if tpl[3] != nil {
		t.Fatalf("unlocking must clear the entry, got %+v", tpl[3])
	}
	if len(tpl) != 8 {
		t.Fatalf("template must stay 8 entries after unlock, got %d", len(tpl))
	}
}

// The scenario the game-wide template exists for: a GM padlocks several ring positions over time,
// one call at a time. Locking a new position must not disturb a position locked earlier, and
// unlocking one position must leave its neighbours untouched.
func TestSetTokenSlotTemplateEntry_PreservesOtherPositions(t *testing.T) {
	tpl := SetTokenSlotTemplateEntry(nil, 3, &models.ImageTokenSlot{
		ID: "token-slot-id", Type: "icon", Icon: "shield", Level: 2, Number: 5,
	})

	tpl = SetTokenSlotTemplateEntry(tpl, 5, &models.ImageTokenSlot{
		ID: "another-token-slot-id", Type: "number", NumberLabel: "Armour", Level: 1, Number: 9,
	})

	// Position 3, locked first, must still carry its original config after position 5 is locked.
	e3 := tpl[3]
	if e3 == nil {
		t.Fatal("position 3 must still be locked after locking position 5")
	}
	if !e3.Locked || e3.Type != "icon" || e3.Icon != "shield" {
		t.Fatalf("locking position 5 must not alter position 3's config, got %+v", e3)
	}

	// Position 5 must carry its own config, independent from position 3.
	e5 := tpl[5]
	if e5 == nil {
		t.Fatal("position 5 must be locked")
	}
	if !e5.Locked || e5.Type != "number" || e5.NumberLabel != "Armour" {
		t.Fatalf("position 5 must carry its own config, got %+v", e5)
	}

	// Unlocking position 5 must clear only position 5 and leave position 3 intact.
	tpl = SetTokenSlotTemplateEntry(tpl, 5, nil)
	if tpl[5] != nil {
		t.Fatalf("unlocking position 5 must clear its entry, got %+v", tpl[5])
	}
	if e3 := tpl[3]; e3 == nil || !e3.Locked || e3.Icon != "shield" {
		t.Fatalf("unlocking position 5 must not touch position 3, got %+v", e3)
	}
}
