package warhammer4e

import (
	gsys "battle-helper/internal/systems"
	_ "embed"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
)

//go:embed skills.json
var skillsJSON []byte

// skillDef matches the shape of entries in skills.json
type skillDef struct {
	Key             string   `json:"key"`
	Characteristic  string   `json:"characteristic"`
	Type            string   `json:"type"`
	Grouped         bool     `json:"grouped"`
	Specialisations []string `json:"specialisations"`
}

// Plugin implements the systems.GameSystem interface for Warhammer 4e.
type Plugin struct {
	skills []skillDef
	rng    gsys.Roller
}

// New returns an initialised Warhammer4e plugin.
func New() *Plugin {
	var skills []skillDef
	if err := json.Unmarshal(skillsJSON, &skills); err != nil {
		panic("warhammer4e: failed to parse skills.json: " + err.Error())
	}
	return &Plugin{skills: skills, rng: gsys.DefaultRoller()}
}

// DefaultStats returns an empty Warhammer stats document as bson.Raw.
func (p *Plugin) DefaultStats() (bson.Raw, error) {
	empty := Stats{
		Talents:        []Talent{},
		Weapons:        []Weapon{},
		Armour:         []ArmourItem{},
		Equipment:      []EquipmentItem{},
		Spells:         []Spell{},
		BasicSkills:    map[string]int{},
		AdvancedSkills: map[string]int{},
	}
	raw, err := bson.Marshal(empty)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

// decodeStats deserialises bson.Raw into a Warhammer Stats struct.
func decodeStats(raw bson.Raw) (*Stats, error) {
	var stats Stats
	if err := bson.Unmarshal(raw, &stats); err != nil {
		return nil, fmt.Errorf("warhammer4e: failed to decode stats: %w", err)
	}
	return &stats, nil
}

// rollD100 returns a value in [1, 100].
func (p *Plugin) rollD100() int { return p.rng.Intn(100) + 1 }

// findSkill looks up the skill definition by key or parent key (for compound keys like "MELEE_BASIC").
func (p *Plugin) findSkill(skillKey string) *skillDef {
	for i := range p.skills {
		if p.skills[i].Key == skillKey {
			return &p.skills[i]
		}
	}
	if strings.Contains(skillKey, "_") {
		parent := strings.SplitN(skillKey, "_", 2)[0]
		for i := range p.skills {
			if p.skills[i].Key == parent {
				return &p.skills[i]
			}
		}
	}
	return nil
}

// characteristicValue returns the current value for a characteristic name.
func characteristicValue(stats *Stats, characteristic string) int {
	c := stats.Characteristics.Current
	switch characteristic {
	case "WEAPON_SKILL":
		return c.WS
	case "BALLISTIC_SKILL":
		return c.BS
	case "STRENGTH":
		return c.S
	case "TOUGHNESS":
		return c.T
	case "INITIATIVE":
		return c.I
	case "AGILITY":
		return c.Ag
	case "DEXTERITY":
		return c.Dex
	case "INTELLIGENCE":
		return c.Int
	case "WILLPOWER":
		return c.WP
	case "FELLOWSHIP":
		return c.Fel
	}
	return 0
}

// outcome maps success and SL to a human-readable outcome string.
func outcome(success bool, sl int) string {
	if sl >= 6 {
		return "critical_success"
	}
	if success {
		return "regular_success"
	}
	return "failure"
}

// attrShortToChar maps short characteristic names (used in attr_ prefix) to full names.
var attrShortToChar = map[string]string{
	"WS":  "WEAPON_SKILL",
	"BS":  "BALLISTIC_SKILL",
	"S":   "STRENGTH",
	"T":   "TOUGHNESS",
	"I":   "INITIATIVE",
	"Ag":  "AGILITY",
	"Dex": "DEXTERITY",
	"Int": "INTELLIGENCE",
	"WP":  "WILLPOWER",
	"Fel": "FELLOWSHIP",
}

// RollSkill performs a Warhammer skill/characteristic check.
func (p *Plugin) RollSkill(raw bson.Raw, skillKey string, modifier int, _ int, _ int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	// Resolve skill definition
	skillDef := p.findSkill(skillKey)
	var charValue int
	var skillName string

	if strings.HasPrefix(skillKey, "attr_") {
		// Characteristic test: attr_WS, attr_BS, etc.
		// Leave skillName empty — frontend translates from skillKey using i18n
		shortName := strings.TrimPrefix(skillKey, "attr_")
		if fullChar, ok := attrShortToChar[shortName]; ok {
			charValue = characteristicValue(stats, fullChar)
		}
	} else if skillDef != nil {
		charValue = characteristicValue(stats, skillDef.Characteristic)
		// Leave skillName empty — frontend translates skillKey via i18n
	} else {
		// Try custom skill on character
		for _, cs := range stats.CustomSkills {
			if cs.Key == skillKey {
				charValue = characteristicValue(stats, cs.Characteristic)
				skillName = cs.Name
				break
			}
		}
	}

	if charValue == 0 {
		return nil, fmt.Errorf("warhammer4e: skill/characteristic %q not found or is zero", skillKey)
	}

	// Skill advances
	advances := 0
	if v, ok := stats.BasicSkills[skillKey]; ok {
		advances = v
	} else if v, ok := stats.AdvancedSkills[skillKey]; ok {
		advances = v
	}

	skillValue := charValue + advances
	target := skillValue + modifier
	roll := p.rollD100()
	success := roll <= target
	sl := (target / 10) - (roll / 10)

	return &gsys.RollResult{
		DiceType:     100,
		RollType:     "skill",
		Roll:         roll,
		Target:       target,
		Outcome:      outcome(success, sl),
		SuccessLevel: sl,
		SkillKey:     skillKey,
		SkillName:    skillName,
		Modifier:     modifier,
	}, nil
}

// RollWeapon performs a Warhammer weapon attack (hit test + damage roll).
func (p *Plugin) RollWeapon(raw bson.Raw, weaponName, weaponSkillKey, damage string, modifier int, _ int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	skillDef := p.findSkill(weaponSkillKey)
	if skillDef == nil {
		return nil, fmt.Errorf("warhammer4e: weapon skill %q not found", weaponSkillKey)
	}

	charValue := characteristicValue(stats, skillDef.Characteristic)
	if charValue == 0 {
		return nil, fmt.Errorf("warhammer4e: characteristic for %q not found or zero", weaponSkillKey)
	}

	advances := 0
	if v, ok := stats.BasicSkills[weaponSkillKey]; ok {
		advances = v
	} else if v, ok := stats.AdvancedSkills[weaponSkillKey]; ok {
		advances = v
	}

	skillValue := charValue + advances
	target := skillValue + modifier
	roll := p.rollD100()
	success := roll <= target
	sl := (target / 10) - (roll / 10)

	// Parse and roll damage dice (e.g. "+4", "1d6+3", "2d10")
	damageRoll := p.rollDamage(damage, sl)

	return &gsys.RollResult{
		DiceType:     100,
		RollType:     "weapon",
		Roll:         roll,
		Target:       target,
		Outcome:      outcome(success, sl),
		SuccessLevel: sl,
		WeaponName:   weaponName,
		Damage:       damage,
		DamageRoll:   damageRoll,
		Modifier:     modifier,
	}, nil
}

// ComputeDerived recalculates wounds bonuses (SB/TB/WPB/Hardy/Total) and movement
// (Walk/Run) from primary characteristics and talent data.
func (p *Plugin) ComputeDerived(raw bson.Raw) (bson.Raw, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}

	if stats.Equipment == nil {
		stats.Equipment = []EquipmentItem{}
	}
	if stats.Spells == nil {
		stats.Spells = []Spell{}
	}
	if stats.Weapons == nil {
		stats.Weapons = []Weapon{}
	}
	if stats.Armour == nil {
		stats.Armour = []ArmourItem{}
	}
	if stats.Talents == nil {
		stats.Talents = []Talent{}
	}

	c := stats.Characteristics.Current
	baseTB := c.T / 10
	stats.Wounds.SB = c.S / 10
	stats.Wounds.TB = baseTB * 2 // contribution to wounds formula is 2×TB
	stats.Wounds.WPB = c.WP / 10

	hardyBonus := 0
	for _, talent := range stats.Talents {
		if talent.Key == "HARDY" {
			hardyBonus = baseTB * talent.TimesTaken // Hardy adds TB (not 2×TB) per purchase
			break
		}
	}
	stats.Wounds.Hardy = hardyBonus
	stats.Wounds.Total = stats.Wounds.SB + stats.Wounds.TB + stats.Wounds.WPB + stats.Wounds.Hardy

	// Default current wounds to the full pool when unset, so a freshly created character
	// starts at full HP everywhere (token HP bar, sheet) without waiting for the sheet to
	// lazily initialize it. Only fills the gap — an existing current (incl. 0) is kept.
	if stats.Wounds.Current == nil {
		total := stats.Wounds.Total
		stats.Wounds.Current = &total
	}

	if m, err := strconv.Atoi(stats.Movement.Movement); err == nil && m > 0 {
		stats.Movement.Walk = strconv.Itoa(m * 2)
		stats.Movement.Run = strconv.Itoa(m * 4)
	}

	newRaw, err := bson.Marshal(stats)
	if err != nil {
		return raw, err
	}
	return newRaw, nil
}

// rollDamage parses a WFRP damage string and returns the total rolled value.
// Damage formulas can be "+SL", "1d10+SL", "1d6+3" etc.
// SL is passed in so we can substitute it.
func (p *Plugin) rollDamage(formula string, sl int) int {
	if formula == "" {
		return 0
	}
	formula = strings.ToLower(strings.TrimSpace(formula))

	// Substitute "+SL" placeholder
	formula = strings.ReplaceAll(formula, "+sl", fmt.Sprintf("+%d", sl))
	formula = strings.ReplaceAll(formula, "sl", fmt.Sprintf("%d", sl))

	total := 0
	parts := strings.Split(formula, "+")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "d") {
			// XdY
			var num, sides int
			if _, err := fmt.Sscanf(part, "%dd%d", &num, &sides); err == nil && sides > 0 {
				for i := 0; i < num; i++ {
					total += p.rng.Intn(sides) + 1
				}
			}
		} else {
			var v int
			fmt.Sscanf(part, "%d", &v)
			total += v
		}
	}
	return total
}

// GetDisplayName extracts the character name from stats.basicInfo.name.
func (p *Plugin) GetDisplayName(stats bson.Raw) string {
	if len(stats) == 0 {
		return ""
	}
	var statsMap bson.M
	if err := bson.Unmarshal(stats, &statsMap); err != nil {
		return ""
	}
	basicInfo, ok := statsMap["basicInfo"].(bson.M)
	if !ok {
		return ""
	}
	name, _ := basicInfo["name"].(string)
	return name
}

// SetDisplayName writes name into stats.basicInfo.name and returns updated BSON.
func (p *Plugin) SetDisplayName(stats bson.Raw, name string) (bson.Raw, error) {
	if len(stats) == 0 {
		return stats, nil
	}
	var statsMap bson.M
	if err := bson.Unmarshal(stats, &statsMap); err != nil {
		return stats, err
	}
	basicInfo, ok := statsMap["basicInfo"].(bson.M)
	if !ok {
		return stats, nil
	}
	basicInfo["name"] = name
	updated, err := bson.Marshal(statsMap)
	if err != nil {
		return stats, err
	}
	return updated, nil
}
