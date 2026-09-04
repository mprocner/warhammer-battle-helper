package service

import (
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// token_slot_template.go holds the pure half of the game-wide padlock rule (FEATURE-179): what a
// locked ring position stores, and what a fresh tokens-layer image starts with because of it. The
// service wiring that persists and fans it out lives in GameService.

// tokenSlotTemplateSize is the fixed number of ring positions on a token overlay. The ring angle is
// derived from the index (-90 + i*45), so the slice length is part of the layout, not a capacity.
const tokenSlotTemplateSize = 8

// SetTokenSlotTemplateEntry returns the game template with one ring position locked to slot's
// config, or unlocked when slot is nil. The stored entry is config only: the id and the live
// Level/Number belong to each token and are generated when a token seeds from the template. The
// result is always normalized to tokenSlotTemplateSize entries.
func SetTokenSlotTemplateEntry(tpl []*models.ImageTokenSlot, position int, slot *models.ImageTokenSlot) []*models.ImageTokenSlot {
	out := make([]*models.ImageTokenSlot, tokenSlotTemplateSize)
	copy(out, tpl)
	if position < 0 || position >= tokenSlotTemplateSize {
		return out
	}
	if slot == nil {
		out[position] = nil
		return out
	}
	cfg := *slot
	cfg.ID = ""
	cfg.Level = 0
	cfg.Number = 0
	cfg.Locked = true
	out[position] = &cfg
	return out
}

// ApplyTemplateToOverlay is authoritative over Locked on every one of the 8 ring positions, not
// just the ones the template locks: after it runs, slot.Locked at position i always equals
// tpl[i] != nil. A locked position gets the template's config, each slot keeping its own id (a
// fresh one when it has none), and the live Level/Number reset. A position the template does NOT
// lock is left alone except for a stale Locked: true, which is cleared — config and the live
// value are the token's own and survive untouched; only the flag is the rule's business.
//
// The stale case is the mirror of the locked one: a slot can be padlocked, then parked on a
// non-tokens layer while the GM unlocks that position (the padlock's fan-out in
// GameService.ApplyImageTokenSlot only reaches images already on the tokens layer), then promoted
// back. Without this, the stale flag would survive the promotion and the config panel would show
// a closed padlock the game no longer enforces.
//
// Returns the input overlay pointer verbatim only when there is genuinely nothing to do: no
// template position is locked AND no slot already in the overlay carries a stale Locked: true
// (nil overlay trivially qualifies). That is the call site's signal to skip a redundant
// repository write and WS broadcast — see UpdateSceneImage. Otherwise overlay is never mutated in
// place — the caller's struct is shared state (it comes straight off game.Scenes) — a copy is
// built and returned instead, padded to the fixed 8 ring positions first if it was shorter. HP
// bars are never touched: they have no padlock of their own.
//
// ApplyTemplateToOverlay(tpl, nil) is exactly the old fresh-token seed (formerly
// SeedOverlayFromTemplate, deleted — this function now covers both cases): the enforcement pass
// below fills every ring position from scratch when there was nothing to start from.
func ApplyTemplateToOverlay(tpl []*models.ImageTokenSlot, overlay *models.ImageTokenOverlay) *models.ImageTokenOverlay {
	locked := false
	for i := 0; i < len(tpl) && i < tokenSlotTemplateSize; i++ {
		if tpl[i] != nil {
			locked = true
			break
		}
	}

	stale := false
	if overlay != nil {
		for i, s := range overlay.Slots {
			if s.Locked && (i >= len(tpl) || tpl[i] == nil) {
				stale = true
				break
			}
		}
	}

	if !locked && !stale {
		return overlay
	}

	var out models.ImageTokenOverlay
	if overlay != nil {
		out = *overlay
		out.Slots = append([]models.ImageTokenSlot(nil), overlay.Slots...)
	} else {
		out.Enabled = true
	}

	for len(out.Slots) < tokenSlotTemplateSize {
		out.Slots = append(out.Slots, models.ImageTokenSlot{ID: primitive.NewObjectID().Hex(), Type: "empty"})
	}

	for i := 0; i < tokenSlotTemplateSize; i++ {
		if i < len(tpl) && tpl[i] != nil {
			id := out.Slots[i].ID
			if id == "" {
				id = primitive.NewObjectID().Hex()
			}
			s := *tpl[i]
			s.ID = id
			s.Level = 0
			s.Number = 0
			s.Locked = true
			out.Slots[i] = s
			continue
		}
		out.Slots[i].Locked = false
	}

	return &out
}
