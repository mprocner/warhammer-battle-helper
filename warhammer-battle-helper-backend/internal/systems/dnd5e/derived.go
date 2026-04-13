package dnd5e

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
)

//go:embed skills.json
var skillsJSON []byte

type skillDef struct {
	Key     string `json:"key"`
	Ability string `json:"ability"`
	Label   string `json:"label"`
}

var skillDefs []skillDef

func init() {
	if err := json.Unmarshal(skillsJSON, &skillDefs); err != nil {
		panic("dnd5e: failed to parse skills.json: " + err.Error())
	}
}

// abilityMod computes the D&D 5e ability modifier using floor division.
// Go's integer division truncates toward zero, so negative scores need correction.
func abilityMod(score int) int {
	diff := score - 10
	mod := diff / 2
	// Correct truncation-toward-zero for negative odd differences
	if diff < 0 && diff%2 != 0 {
		mod--
	}
	return mod
}

// proficiencyBonus returns the proficiency bonus for a given character level (SRD table).
func proficiencyBonus(level int) int {
	switch {
	case level <= 4:
		return 2
	case level <= 8:
		return 3
	case level <= 12:
		return 4
	case level <= 16:
		return 5
	default:
		return 6
	}
}

func decodeStats(raw bson.Raw) (*Stats, error) {
	var stats Stats
	if err := bson.Unmarshal(raw, &stats); err != nil {
		return nil, fmt.Errorf("dnd5e: failed to decode stats: %w", err)
	}
	return &stats, nil
}

// abilityModByKey returns the ability modifier for a given ability key string.
func abilityModByKey(a *Abilities, key string) int {
	switch key {
	case "str":
		return abilityMod(a.STR)
	case "dex":
		return abilityMod(a.DEX)
	case "con":
		return abilityMod(a.CON)
	case "int":
		return abilityMod(a.INT)
	case "wis":
		return abilityMod(a.WIS)
	case "cha":
		return abilityMod(a.CHA)
	}
	return 0
}

// saveProfByKey returns whether the character is proficient in a saving throw.
func saveProfByKey(sp *SavingThrowProfs, key string) bool {
	switch key {
	case "str":
		return sp.STR
	case "dex":
		return sp.DEX
	case "con":
		return sp.CON
	case "int":
		return sp.INT
	case "wis":
		return sp.WIS
	case "cha":
		return sp.CHA
	}
	return false
}

// ComputeDerived recalculates all derived values from the base stats.
func (p *Plugin) ComputeDerived(raw bson.Raw) (bson.Raw, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	// Ensure nil maps/slices are initialised
	if stats.SkillProfs == nil {
		stats.SkillProfs = map[string]int{}
	}
	if stats.Weapons == nil {
		stats.Weapons = []Weapon{}
	}
	if stats.Features == nil {
		stats.Features = []Feature{}
	}
	if stats.SpellSlots == nil {
		stats.SpellSlots = []SpellSlot{}
	}
	if stats.FavoriteSkills == nil {
		stats.FavoriteSkills = []string{}
	}
	if stats.FavoriteWeapons == nil {
		stats.FavoriteWeapons = []string{}
	}
	if stats.Spells == nil {
		stats.Spells = []Spell{}
	}

	a := &stats.Abilities
	pb := proficiencyBonus(stats.Info.Level)

	// Ability modifiers
	mods := AbilityMods{
		STR: abilityMod(a.STR),
		DEX: abilityMod(a.DEX),
		CON: abilityMod(a.CON),
		INT: abilityMod(a.INT),
		WIS: abilityMod(a.WIS),
		CHA: abilityMod(a.CHA),
	}

	// Saving throws = ability mod + proficiency bonus (if proficient)
	sp := &stats.SavingThrowProfs
	abilityKeys := []string{"str", "dex", "con", "int", "wis", "cha"}
	saveMods := AbilityMods{}
	for _, key := range abilityKeys {
		mod := abilityModByKey(a, key)
		if saveProfByKey(sp, key) {
			mod += pb
		}
		switch key {
		case "str":
			saveMods.STR = mod
		case "dex":
			saveMods.DEX = mod
		case "con":
			saveMods.CON = mod
		case "int":
			saveMods.INT = mod
		case "wis":
			saveMods.WIS = mod
		case "cha":
			saveMods.CHA = mod
		}
	}

	// Skill totals
	skillTotals := make(map[string]int, len(skillDefs))
	for _, def := range skillDefs {
		base := abilityModByKey(a, def.Ability)
		prof := stats.SkillProfs[def.Key] // 0, 1, or 2
		skillTotals[def.Key] = base + pb*prof
	}

	// Passive Perception = 10 + perception skill total
	passivePerception := 10 + skillTotals["perception"]

	// Spell attack / save DC
	spellSaveDC := 0
	spellAttackBonus := 0
	if stats.IsSpellcaster && stats.SpellcastingAbility != "" {
		scMod := abilityModByKey(a, stats.SpellcastingAbility)
		spellSaveDC = 8 + pb + scMod
		spellAttackBonus = pb + scMod
	}

	// Clamp HP to max (never overwrite max itself — that is a manual input)
	if stats.Resources.HP > stats.Resources.HPMax && stats.Resources.HPMax > 0 {
		stats.Resources.HP = stats.Resources.HPMax
	}

	stats.Derived = Derived{
		ProficiencyBonus:  pb,
		AbilityMods:       mods,
		SavingThrows:      saveMods,
		Skills:            skillTotals,
		Initiative:        mods.DEX,
		PassivePerception: passivePerception,
		SpellSaveDC:       spellSaveDC,
		SpellAttackBonus:  spellAttackBonus,
	}

	out, err := bson.Marshal(stats)
	if err != nil {
		return nil, err
	}
	return out, nil
}
