package coc7e

import (
	gsys "battle-helper/internal/systems"
	_ "embed"
	"encoding/json"
	"fmt"
	"math/rand"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
)

//go:embed skills.json
var skillsJSON []byte

type skillDef struct {
	Key         string `json:"key"`
	Base        int    `json:"base"`
	BaseFormula string `json:"baseFormula"`
}

var skillDefaults map[string]skillDef

func init() {
	var defs []skillDef
	if err := json.Unmarshal(skillsJSON, &defs); err != nil {
		panic("coc7e: failed to parse skills.json: " + err.Error())
	}
	skillDefaults = make(map[string]skillDef, len(defs))
	for _, d := range defs {
		skillDefaults[d.Key] = d
	}
}

// skillBaseValue returns the base percentage for a skill when not stored on the character.
func skillBaseValue(stats *Stats, key string) int {
	def, ok := skillDefaults[key]
	if !ok {
		return 0
	}
	switch def.BaseFormula {
	case "DEX/2":
		return stats.Attributes.DEX / 2
	case "EDU×5":
		return stats.Attributes.EDU * 5
	default:
		return def.Base
	}
}

// Plugin implements the systems.GameSystem interface for Call of Cthulhu 7e.
type Plugin struct{}

// New returns an initialised CoC 7e plugin.
func New() *Plugin { return &Plugin{} }

// DefaultStats returns a zero-value CoC stats document as bson.Raw.
func (p *Plugin) DefaultStats() (bson.Raw, error) {
	empty := Stats{
		Skills:            map[string]int{},
		CustomSkills:      []CustomSkill{},
		FavoriteSkills:    []string{},
		DevelopmentSkills: []string{},
		Weapons:           []CoCWeapon{},
		BasicInfo:         BasicInfo{},
		Attributes:        Attributes{},
		Resources:         Resources{},
		Combat:            Combat{},
		Finances:          Finances{},
		Background:        Background{},
	}
	raw, err := bson.Marshal(empty)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

func decodeStats(raw bson.Raw) (*Stats, error) {
	var stats Stats
	if err := bson.Unmarshal(raw, &stats); err != nil {
		return nil, fmt.Errorf("coc7e: failed to decode stats: %w", err)
	}
	return &stats, nil
}

func rollD100() int { return rand.Intn(100) + 1 }

// rollWithDiceMod rolls a D100 applying CoC 7e bonus/penalty dice mechanics.
// diceMod > 0 = bonus dice (pick lowest), diceMod < 0 = penalty dice (pick highest).
// Returns the final roll and all candidate values.
func rollWithDiceMod(diceMod int) (int, []int) {
	main := rollD100()
	units := main % 10
	alts := []int{main}
	for i := 0; i < abs(diceMod); i++ {
		extraTens := rand.Intn(10) // 0–9
		alt := extraTens*10 + units
		if alt == 0 {
			alt = 100 // 00+0 = 100 (fumble)
		}
		alts = append(alts, alt)
	}
	var final int
	if diceMod > 0 {
		final = minSlice(alts)
	} else if diceMod < 0 {
		final = maxSlice(alts)
	} else {
		final = main
	}
	return final, alts
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func minSlice(s []int) int {
	m := s[0]
	for _, v := range s[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

func maxSlice(s []int) int {
	m := s[0]
	for _, v := range s[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

// outcomeCoC returns a CoC 7e outcome string based on the roll and skill percentage.
func outcomeCoC(roll, skillPct int) string {
	// Critical / Impale
	if roll == 1 {
		return "critical_success"
	}
	// Fumble
	if skillPct < 50 && roll >= 96 {
		return "fumble"
	}
	if roll == 100 {
		return "fumble"
	}
	// Extreme success (≤ skill/5)
	if roll <= skillPct/5 {
		return "extreme_success"
	}
	// Hard success (≤ skill/2)
	if roll <= skillPct/2 {
		return "hard_success"
	}
	// Regular success (≤ skill%)
	if roll <= skillPct {
		return "regular_success"
	}
	return "failure"
}

// computeDamageAndBuild returns the DamageBonus string and Build integer
// derived from STR + SIZ per the CoC 7e table (BRP SRD Table I).
func computeDamageAndBuild(str, siz int) (string, int) {
	sum := str + siz
	switch {
	case sum <= 64:
		return "-2", -2
	case sum <= 84:
		return "-1", -1
	case sum <= 124:
		return "0", 0
	case sum <= 164:
		return "+1d4", 1
	case sum <= 204:
		return "+1d6", 2
	case sum <= 284:
		return "+2d6", 3
	case sum <= 364:
		return "+3d6", 4
	default:
		return "+4d6", 5
	}
}

// ComputeDerived recalculates SanityMax and the Damage Bonus / Build stats.
func (p *Plugin) ComputeDerived(raw bson.Raw) (bson.Raw, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	if stats.Skills == nil {
		stats.Skills = map[string]int{}
	}
	if stats.CustomSkills == nil {
		stats.CustomSkills = []CustomSkill{}
	}
	if stats.FavoriteSkills == nil {
		stats.FavoriteSkills = []string{}
	}
	if stats.DevelopmentSkills == nil {
		stats.DevelopmentSkills = []string{}
	}
	if stats.Weapons == nil {
		stats.Weapons = []CoCWeapon{}
	}

	cthulhuMythos := 0
	if v, ok := stats.Skills["cthulhu_mythos"]; ok {
		cthulhuMythos = v
	}
	stats.Resources.SanityMax = 99 - cthulhuMythos
	if stats.Resources.Sanity > stats.Resources.SanityMax {
		stats.Resources.Sanity = stats.Resources.SanityMax
	}

	stats.Resources.HPMax = (stats.Attributes.CON + stats.Attributes.SIZ) / 10
	if stats.Resources.HP > stats.Resources.HPMax {
		stats.Resources.HP = stats.Resources.HPMax
	}

	stats.Resources.MPMax = stats.Attributes.POW / 5
	if stats.Resources.MP > stats.Resources.MPMax {
		stats.Resources.MP = stats.Resources.MPMax
	}

	stats.Combat.DamageBonus, stats.Combat.Build = computeDamageAndBuild(stats.Attributes.STR, stats.Attributes.SIZ)

	out, err := bson.Marshal(stats)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// getAttrValue returns the raw attribute value from Stats by lowercase name.
func getAttrValue(stats *Stats, attrName string) int {
	a := stats.Attributes
	switch attrName {
	case "str":
		return a.STR
	case "con":
		return a.CON
	case "siz":
		return a.SIZ
	case "dex":
		return a.DEX
	case "app":
		return a.APP
	case "int":
		return a.INT
	case "pow":
		return a.POW
	case "edu":
		return a.EDU
	}
	return 0
}

// attrRollName returns the full characteristic name for a given attribute key.
func attrRollName(attrName string) string {
	switch attrName {
	case "str":
		return "Strength"
	case "con":
		return "Constitution"
	case "int":
		return "Intelligence"
	case "pow":
		return "Power"
	case "dex":
		return "Dexterity"
	case "app":
		return "Appearance"
	case "siz":
		return "Size"
	case "edu":
		return "Education"
	}
	return strings.ToUpper(attrName)
}

// RollSkill performs a CoC 7e skill check.
// skillKey should match a key in Stats.Skills (e.g. "fighting_brawl"),
// or use "attr_<name>" prefix for characteristic rolls (e.g. "attr_str" → STR×5).
// modifier is applied directly to the skill percentage.
// diceMod: +1/+2 bonus dice (pick lowest), -1/-2 penalty dice (pick highest).
func (p *Plugin) RollSkill(raw bson.Raw, skillKey string, modifier int, diceMod int, _ int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	var skillPct int
	var skillName string

	if strings.HasPrefix(skillKey, "attr_") {
		attrName := strings.TrimPrefix(skillKey, "attr_")
		if attrName == "luck" {
			skillPct = stats.Resources.Luck
			skillName = "Luck"
		} else if attrName == "sanity" {
			skillPct = stats.Resources.Sanity
			skillName = "Sanity"
		} else {
			// CoC attributes are stored as percentages already (e.g. STR=65 means 65%)
			skillPct = getAttrValue(stats, attrName)
			skillName = attrRollName(attrName)
		}
	} else if strings.HasPrefix(skillKey, "custom_") {
		for _, cs := range stats.CustomSkills {
			if cs.Key == skillKey {
				skillPct = cs.Value
				if cs.Name != "" {
					skillName = cs.Name
				} else {
					skillName = skillKey
				}
				break
			}
		}
	} else {
		val, ok := stats.Skills[skillKey]
		if !ok {
			val = skillBaseValue(stats, skillKey)
		}
		skillPct = val
		skillName = skillKey
	}

	target := skillPct + modifier
	roll, allRolls := rollWithDiceMod(diceMod)
	outcome := outcomeCoC(roll, target)

	return &gsys.RollResult{
		RollType:  "skill",
		Roll:      roll,
		Target:    target,
		Outcome:   outcome,
		SkillKey:  skillKey,
		SkillName: skillName,
		Modifier:  modifier,
		DiceMod:   diceMod,
		AllRolls:  allRolls,
	}, nil
}

// RollWeapon performs a CoC 7e weapon attack (hit test + damage roll).
// diceMod: +1/+2 bonus dice (pick lowest), -1/-2 penalty dice (pick highest).
func (p *Plugin) RollWeapon(raw bson.Raw, weaponName, weaponSkillKey, damage string, modifier int, diceMod int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	skillPct, ok := stats.Skills[weaponSkillKey]
	if !ok {
		skillPct = skillBaseValue(stats, weaponSkillKey)
	}

	target := skillPct + modifier
	roll, allRolls := rollWithDiceMod(diceMod)
	outcome := outcomeCoC(roll, target)

	damageRoll, damageBreakdown := rollDamage(damage, stats.Combat.DamageBonus)

	return &gsys.RollResult{
		RollType:        "weapon",
		Roll:            roll,
		Target:          target,
		Outcome:         outcome,
		WeaponName:      weaponName,
		Damage:          damage,
		DamageRoll:      damageRoll,
		DamageBreakdown: damageBreakdown,
		Modifier:        modifier,
		DiceMod:         diceMod,
		AllRolls:        allRolls,
	}, nil
}

// rollDamage parses a CoC damage formula like "1d3+db", "1K3+MO", "1d10", "2d6+1".
// Returns the total damage and a human-readable breakdown, e.g. "1K3(2) + MO(1) = 3".
func rollDamage(formula, damageBonus string) (int, string) {
	if formula == "" {
		return 0, ""
	}
	formula = strings.ToLower(strings.TrimSpace(formula))
	formula = strings.ReplaceAll(formula, "k", "d")   // Polish K notation (1K3 → 1d3)
	formula = strings.ReplaceAll(formula, "mo", "db") // Polish MO placeholder → db
	formula = strings.ReplaceAll(formula, " ", "")    // strip spaces

	var breakParts []string
	total := 0

	for _, seg := range strings.Split(formula, "+") {
		if seg == "" {
			continue
		}
		if seg == "db" {
			dbVal := rollDamageBonus(damageBonus)
			breakParts = append(breakParts, formatDamageBonusPart(damageBonus, dbVal))
			total += dbVal
		} else if strings.Contains(seg, "d") {
			if strings.HasPrefix(seg, "d") {
				seg = "1" + seg
			}
			var num, sides int
			if _, err := fmt.Sscanf(seg, "%dd%d", &num, &sides); err == nil && sides > 0 {
				partTotal := 0
				for i := 0; i < num; i++ {
					partTotal += rand.Intn(sides) + 1
				}
				breakParts = append(breakParts, fmt.Sprintf("%dK%d(%d)", num, sides, partTotal))
				total += partTotal
			}
		} else {
			var v int
			fmt.Sscanf(seg, "%d", &v)
			if v != 0 {
				breakParts = append(breakParts, strconv.Itoa(v))
				total += v
			}
		}
	}

	if len(breakParts) == 0 {
		return 0, ""
	}
	return total, strings.Join(breakParts, " + ") + " = " + strconv.Itoa(total)
}

// rollDamageBonus evaluates the character's damage bonus string (e.g. "+1d4", "-1", "0").
func rollDamageBonus(db string) int {
	if db == "" || db == "0" || db == "None" {
		return 0
	}
	db = strings.TrimSpace(db)
	// Handle leading sign
	sign := 1
	if strings.HasPrefix(db, "-") {
		sign = -1
		db = db[1:]
	} else if strings.HasPrefix(db, "+") {
		db = db[1:]
	}
	return sign * evalDiceFormula(strings.ToLower(db))
}

// formatDamageBonusPart returns a human-readable label for the damage bonus component,
// e.g. "+1d4" → "1K4(3)", "-1" → "-1", "" → "0".
func formatDamageBonusPart(db string, result int) string {
	if db == "" || db == "0" || db == "None" {
		return "0"
	}
	db = strings.TrimSpace(db)
	sign := ""
	stripped := db
	if strings.HasPrefix(db, "-") {
		sign = "-"
		stripped = db[1:]
	} else if strings.HasPrefix(db, "+") {
		stripped = db[1:]
	}
	stripped = strings.ToLower(stripped)
	var num, sides int
	if _, err := fmt.Sscanf(stripped, "%dd%d", &num, &sides); err == nil && sides > 0 {
		return fmt.Sprintf("%s%dK%d(%d)", sign, num, sides, result)
	}
	return strconv.Itoa(result)
}

func evalDiceFormula(formula string) int {
	total := 0
	parts := strings.Split(formula, "+")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "d") {
			// Support "d10" (no leading number) as shorthand for "1d10"
			if strings.HasPrefix(part, "d") {
				part = "1" + part
			}
			var num, sides int
			if _, err := fmt.Sscanf(part, "%dd%d", &num, &sides); err == nil && sides > 0 {
				for i := 0; i < num; i++ {
					total += rand.Intn(sides) + 1
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

// GetDisplayName returns "" — CoC does not embed the name inside stats.
func (p *Plugin) GetDisplayName(_ bson.Raw) string { return "" }

// SetDisplayName returns stats unchanged — CoC does not embed the name inside stats.
func (p *Plugin) SetDisplayName(stats bson.Raw, _ string) (bson.Raw, error) { return stats, nil }
