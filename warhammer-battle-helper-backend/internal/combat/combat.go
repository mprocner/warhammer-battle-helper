// Package combat holds the pure turn-order rules of a scene's initiative tracker. No I/O: the
// service loads, calls these functions on a copy and saves the result.
package combat

import (
	"errors"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	// ErrConflict: the tracker changed since the caller looked at it (stale version or stale active entry).
	ErrConflict      = errors.New("combat changed meanwhile")
	ErrEntryNotFound = errors.New("combat entry not found")
	ErrBadOrder      = errors.New("order must list every entry exactly once")
)

func indexOf(c *models.Combat, id primitive.ObjectID) int {
	for i := range c.Entries {
		if c.Entries[i].ID == id {
			return i
		}
	}
	return -1
}

// Find returns a pointer into c.Entries.
func Find(c *models.Combat, id primitive.ObjectID) (*models.CombatEntry, bool) {
	if i := indexOf(c, id); i >= 0 {
		return &c.Entries[i], true
	}
	return nil, false
}

func HasSource(c *models.Combat, kind string, sourceID primitive.ObjectID) bool {
	for _, e := range c.Entries {
		if e.Kind == kind && e.SourceID == sourceID {
			return true
		}
	}
	return false
}

// Insert places e by initiative, descending; a tie goes after the entries already holding that value.
func Insert(c *models.Combat, e models.CombatEntry) {
	i := 0
	for i < len(c.Entries) && c.Entries[i].Initiative >= e.Initiative {
		i++
	}
	c.Entries = append(c.Entries, models.CombatEntry{})
	copy(c.Entries[i+1:], c.Entries[i:])
	c.Entries[i] = e
}

func Remove(c *models.Combat, id primitive.ObjectID) error {
	i := indexOf(c, id)
	if i < 0 {
		return ErrEntryNotFound
	}
	c.Entries = append(c.Entries[:i], c.Entries[i+1:]...)
	if c.ActiveID == id {
		c.ActiveID = primitive.NilObjectID
	}
	if c.LastVisibleActiveID == id {
		c.LastVisibleActiveID = primitive.NilObjectID
	}
	return nil
}

// SetInitiative changes the value and moves the entry to its sorted place. The active entry stays active.
func SetInitiative(c *models.Combat, id primitive.ObjectID, v int) error {
	i := indexOf(c, id)
	if i < 0 {
		return ErrEntryNotFound
	}
	e := c.Entries[i]
	c.Entries = append(c.Entries[:i], c.Entries[i+1:]...)
	e.Initiative = v
	Insert(c, e)
	return nil
}

// Reorder applies a manual order (ties, GM's call). ids must be a permutation of the entries.
func Reorder(c *models.Combat, ids []primitive.ObjectID) error {
	if len(ids) != len(c.Entries) {
		return ErrBadOrder
	}
	byID := make(map[primitive.ObjectID]models.CombatEntry, len(c.Entries))
	for _, e := range c.Entries {
		byID[e.ID] = e
	}
	next := make([]models.CombatEntry, 0, len(ids))
	for _, id := range ids {
		e, ok := byID[id]
		if !ok {
			return ErrBadOrder
		}
		delete(byID, id) // a duplicate id finds nothing the second time
		next = append(next, e)
	}
	c.Entries = next
	return nil
}

func Activate(c *models.Combat, id primitive.ObjectID) error {
	i := indexOf(c, id)
	if i < 0 {
		return ErrEntryNotFound
	}
	c.ActiveID = id
	if !c.Entries[i].Hidden {
		c.LastVisibleActiveID = id
	}
	return nil
}

// Next marks the active entry as acted and activates the first entry that has neither acted nor
// died. expected is who the caller believes is active (zero = nobody): a mismatch means someone
// already moved the turn, so the call returns ErrConflict and changes nothing. When everyone has
// acted nobody is active — closing the round is always the GM's explicit call.
func Next(c *models.Combat, expected primitive.ObjectID, killed func(models.CombatEntry) bool) error {
	if c.ActiveID != expected {
		return ErrConflict
	}
	if i := indexOf(c, c.ActiveID); i >= 0 {
		c.Entries[i].Acted = true
	}
	c.ActiveID = primitive.NilObjectID
	for _, e := range c.Entries {
		if !e.Acted && !killed(e) {
			return Activate(c, e.ID)
		}
	}
	return nil
}

// EndRound clears every Acted flag, advances the round and activates the first living entry.
func EndRound(c *models.Combat, killed func(models.CombatEntry) bool) {
	for i := range c.Entries {
		c.Entries[i].Acted = false
	}
	c.Round++
	c.ActiveID = primitive.NilObjectID
	c.LastVisibleActiveID = primitive.NilObjectID
	for _, e := range c.Entries {
		if !killed(e) {
			_ = Activate(c, e.ID)
			return
		}
	}
}

// Prune drops entries whose token is gone: a removed placement, a placement whose character was
// deleted, or a deleted image. No deletion path knows about combat — every read and write prunes
// instead, so a new way of deleting a token cannot leave a ghost in the tracker.
func Prune(c *models.Combat, scene *models.Scene, chars map[primitive.ObjectID]*models.Character) {
	placementChar := make(map[primitive.ObjectID]primitive.ObjectID, len(scene.Characters))
	for _, gc := range scene.Characters {
		placementChar[gc.ID] = gc.CharacterID
	}
	images := make(map[primitive.ObjectID]bool, len(scene.Images))
	for _, img := range scene.Images {
		images[img.ID] = true
	}
	kept := make([]models.CombatEntry, 0, len(c.Entries))
	for _, e := range c.Entries {
		alive := true
		switch e.Kind {
		case models.CombatEntryCharacter:
			charID, ok := placementChar[e.SourceID]
			alive = ok && chars[charID] != nil
		case models.CombatEntryImage:
			alive = images[e.SourceID]
		}
		if alive {
			kept = append(kept, e)
			continue
		}
		if c.ActiveID == e.ID {
			c.ActiveID = primitive.NilObjectID
		}
		if c.LastVisibleActiveID == e.ID {
			c.LastVisibleActiveID = primitive.NilObjectID
		}
	}
	c.Entries = kept
}

// Clone deep-copies c so the stored state is never mutated in place.
func Clone(c *models.Combat) *models.Combat {
	if c == nil {
		return nil
	}
	cp := *c
	cp.Entries = append([]models.CombatEntry(nil), c.Entries...)
	return &cp
}
