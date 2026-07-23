package service

import (
	"strings"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

// token_masking.go builds the fully-resolved, leak-free CharacterTokenView sent to a viewer who does
// NOT hold a character's card, for one placement. Everything here runs server-side: values are baked
// (never a raw stats subtree), and any element hidden on this token contributes NOTHING to the
// output — not its value, not its definition, not even its existence. See CharacterTokenView.

// statByPath walks a dot path (e.g. "wounds.current") into a decoded stats doc, tolerating gaps
// (missing → nil), mirroring the frontend's getByPath.
func statByPath(root bson.M, path string) interface{} {
	if root == nil || path == "" {
		return nil
	}
	var cur interface{} = root
	for _, seg := range strings.Split(path, ".") {
		m, ok := cur.(bson.M)
		if !ok {
			// bson.Raw decodes nested docs as bson.M; also tolerate map[string]interface{}.
			mm, ok2 := cur.(map[string]interface{})
			if !ok2 {
				return nil
			}
			m = bson.M(mm)
		}
		cur = m[seg]
	}
	return cur
}

// toFloat coerces a stat value (numbers decode as int32/int64/float64 from BSON) to float64.
func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	case int:
		return float64(n)
	}
	return 0
}

// effectiveSlotAt resolves ring position i for masking: the effective slot (blueprint or per-token
// structural override) and whether it's hidden on this token.
func effectiveSlotAt(i int, blueprint *models.TokenDisplayConfig, gear *models.CharacterTokenGear) (slot models.TokenSlot, hidden bool, value *models.TokenOverlayValue) {
	slot = blueprint.Slots[i]
	if gear != nil {
		if ov, ok := gear.SlotOverrides[slot.ID]; ok {
			if ov.Slot != nil {
				slot = *ov.Slot
			}
			value = ov.Value
			if ov.Hidden != nil {
				return slot, *ov.Hidden, value
			}
		}
	}
	return slot, slot.DefaultHidden, value
}

// buildMaskedTokenView produces the CharacterTokenView for a card-less viewer, or nil when the
// blueprint is absent/disabled (bare avatar+name token, no overlay). stats is the character's raw
// Stats; states its live conditions.
func buildMaskedTokenView(blueprint *models.TokenDisplayConfig, gear *models.CharacterTokenGear, stats bson.Raw, states []models.CharacterState) *models.CharacterTokenView {
	if blueprint == nil || !blueprint.Enabled {
		return nil
	}

	// Decode stats once for field resolution (tolerant of empty/absent).
	var statsDoc bson.M
	if len(stats) > 0 {
		_ = bson.Unmarshal(stats, &statsDoc)
	}

	view := &models.CharacterTokenView{Slots: make([]*models.TokenViewSlot, 8)}
	visibleConditionKeys := map[string]bool{}

	// --- Ring slots (8 fixed positions, overlay applied) ---
	for i := 0; i < 8; i++ {
		slot, hidden, val := effectiveSlotAt(i, blueprint, gear)
		if hidden || slot.Type == "" || slot.Type == "empty" {
			continue // nil entry: nothing renders here
		}
		vs := &models.TokenViewSlot{Slot: &slot}
		switch slot.Type {
		case "icon":
			visibleConditionKeys[slot.ConditionKey] = true // value comes from States
		case "field":
			if slot.Field != nil {
				vs.Value = statByPath(statsDoc, slot.Field.Key)
			}
		case "number":
			if val != nil && val.Number != nil {
				vs.Value = *val.Number
			}
		case "select":
			if val != nil {
				vs.Value = val.Select
			}
		}
		view.Slots[i] = vs
	}

	// Squares are intentionally NOT sent to a card-less player: they're a GM/card-holder detail row
	// with no per-player visibility (by request). Only GM/card-holders (full character) render them.

	// --- HP bars: blueprint bars (visibility override via BarOverrides) + per-token AddedBars ---
	addBar := func(bar models.TokenHPBar, hidden bool) {
		if hidden {
			return
		}
		out := models.TokenViewBar{ID: bar.ID, Label: bar.Label, Color: bar.Color}
		if bar.Field != nil {
			out.Current = toFloat(statByPath(statsDoc, bar.Field.Key))
			if bar.Field.MaxKey != "" {
				out.Max = toFloat(statByPath(statsDoc, bar.Field.MaxKey))
			}
		} else if gear != nil {
			if v, ok := gear.BarValues[bar.ID]; ok {
				out.Current, out.Max = v.Current, v.Max
			}
		}
		view.Bars = append(view.Bars, out)
	}
	for _, bar := range blueprint.HPBars {
		hidden := bar.DefaultHidden
		if gear != nil {
			if v, ok := gear.BarOverrides[bar.ID]; ok {
				hidden = v
			}
		}
		addBar(bar, hidden)
	}
	if gear != nil {
		for _, bar := range gear.AddedBars {
			addBar(bar, bar.DefaultHidden) // added bars have no override layer
		}
	}

	// --- States: only conditions belonging to a visible icon slot ---
	for _, st := range states {
		if visibleConditionKeys[st.Name] {
			view.States = append(view.States, st)
		}
	}

	return view
}
