package dnd5e

import "battle-helper/internal/systems"

// TokenFields lists the D&D 5e character-sheet values bindable to a map-token slot,
// square or HP bar (FEATURE-102). Keys are paths relative to the Character's `stats`
// subdocument (matching the bson/json tags in character.go).
func (p *Plugin) TokenFields() []systems.TokenFieldDef {
	return []systems.TokenFieldDef{
		// Ability scores — attributes.
		{Key: "abilities.str", Label: "STR", Category: "attribute"},
		{Key: "abilities.dex", Label: "DEX", Category: "attribute"},
		{Key: "abilities.con", Label: "CON", Category: "attribute"},
		{Key: "abilities.int", Label: "INT", Category: "attribute"},
		{Key: "abilities.wis", Label: "WIS", Category: "attribute"},
		{Key: "abilities.cha", Label: "CHA", Category: "attribute"},

		// Hit points — progress (HP-bar candidate).
		{Key: "resources.hp", Label: "HP", Category: "progress", ProgressMaxKey: "resources.hpMax"},

		// Plain numbers.
		{Key: "armorClass", Label: "AC", Category: "number"},
		{Key: "speed", Label: "Speed", Category: "number"},
		{Key: "resources.tempHp", Label: "Temp HP", Category: "number"},
		{Key: "derived.proficiencyBonus", Label: "Prof", Category: "number"},
		{Key: "derived.initiative", Label: "Init", Category: "number"},
		{Key: "derived.passivePerception", Label: "Pass.Perc", Category: "number"},
		{Key: "info.level", Label: "Level", Category: "number"},
	}
}
