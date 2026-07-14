package coc7e

import "battle-helper/internal/systems"

// TokenFields lists the CoC7e character-sheet values bindable to a map-token slot,
// square or HP bar (FEATURE-102). Keys are paths relative to the Character's `stats`
// subdocument (matching the bson/json tags in character.go). coc7e_dark_ages reuses
// this Plugin, so it inherits the same list.
func (p *Plugin) TokenFields() []systems.TokenFieldDef {
	return []systems.TokenFieldDef{
		// Characteristics — attributes.
		{Key: "attributes.str", Label: "STR", Category: "attribute"},
		{Key: "attributes.con", Label: "CON", Category: "attribute"},
		{Key: "attributes.siz", Label: "SIZ", Category: "attribute"},
		{Key: "attributes.dex", Label: "DEX", Category: "attribute"},
		{Key: "attributes.app", Label: "APP", Category: "attribute"},
		{Key: "attributes.int", Label: "INT", Category: "attribute"},
		{Key: "attributes.pow", Label: "POW", Category: "attribute"},
		{Key: "attributes.edu", Label: "EDU", Category: "attribute"},

		// Pools — progress (HP-bar candidates).
		{Key: "resources.hp", Label: "HP", Category: "progress", ProgressMaxKey: "resources.hpMax"},
		{Key: "resources.sanity", Label: "Sanity", Category: "progress", ProgressMaxKey: "resources.sanityMax"},
		{Key: "resources.mp", Label: "MP", Category: "progress", ProgressMaxKey: "resources.mpMax"},

		// Plain numbers.
		{Key: "resources.luck", Label: "Luck", Category: "number"},
		{Key: "attributes.mov", Label: "MOV", Category: "number"},
		{Key: "combat.build", Label: "Build", Category: "number"},
	}
}
