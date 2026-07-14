package warhammer4e

import "battle-helper/internal/systems"

// TokenFields lists the WFRP4e character-sheet values bindable to a map-token slot,
// square or HP bar (FEATURE-102). Keys are paths relative to the Character's `stats`
// subdocument (matching the bson/json tags in character.go).
func (p *Plugin) TokenFields() []systems.TokenFieldDef {
	return []systems.TokenFieldDef{
		// Characteristics (effective "current" row) — attributes.
		{Key: "characteristics.current.WS", Label: "WS", Category: "attribute"},
		{Key: "characteristics.current.BS", Label: "BS", Category: "attribute"},
		{Key: "characteristics.current.S", Label: "S", Category: "attribute"},
		{Key: "characteristics.current.T", Label: "T", Category: "attribute"},
		{Key: "characteristics.current.I", Label: "I", Category: "attribute"},
		{Key: "characteristics.current.Ag", Label: "Ag", Category: "attribute"},
		{Key: "characteristics.current.Dex", Label: "Dex", Category: "attribute"},
		{Key: "characteristics.current.Int", Label: "Int", Category: "attribute"},
		{Key: "characteristics.current.WP", Label: "WP", Category: "attribute"},
		{Key: "characteristics.current.Fel", Label: "Fel", Category: "attribute"},

		// Pools — progress (HP-bar candidates).
		{Key: "wounds.current", Label: "Wounds", Category: "progress", ProgressMaxKey: "wounds.total"},
		{Key: "fate.fortune", Label: "Fortune", Category: "progress", ProgressMaxKey: "fate.fate"},
		{Key: "resilience.resolve", Label: "Resolve", Category: "progress", ProgressMaxKey: "resilience.resilience"},

		// Plain numbers.
		{Key: "wounds.sb", Label: "SB", Category: "number"},
		{Key: "wounds.tb", Label: "TB", Category: "number"},
		{Key: "wounds.wpb", Label: "WPB", Category: "number"},
		{Key: "experience.current", Label: "XP", Category: "number"},
		{Key: "armourPoints.head", Label: "AP Head", Category: "number"},
		{Key: "armourPoints.body", Label: "AP Body", Category: "number"},
		{Key: "armourPoints.leftArm", Label: "AP L.Arm", Category: "number"},
		{Key: "armourPoints.rightArm", Label: "AP R.Arm", Category: "number"},
		{Key: "armourPoints.leftLeg", Label: "AP L.Leg", Category: "number"},
		{Key: "armourPoints.rightLeg", Label: "AP R.Leg", Category: "number"},
		{Key: "armourPoints.shield", Label: "Shield", Category: "number"},
	}
}
