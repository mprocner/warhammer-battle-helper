package dnd5e

import (
	gsys "battle-helper/internal/systems"
	"fmt"
	"math/rand"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
)

// Plugin implements the systems.GameSystem interface for D&D 5e.
type Plugin struct{}

// New returns an initialised D&D 5e plugin.
func New() *Plugin { return &Plugin{} }

// DefaultStats returns a zero-value D&D 5e stats document as bson.Raw.
func (p *Plugin) DefaultStats() (bson.Raw, error) {
	empty := Stats{
		Info:             CharacterInfo{Level: 1},
		Abilities:        Abilities{STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10},
		SavingThrowProfs: SavingThrowProfs{},
		SkillProfs:       map[string]int{},
		Resources:        Resources{HP: 10, HPMax: 10},
		Derived:          Derived{Skills: map[string]int{}},
		SpellSlots:       []SpellSlot{},
		Weapons:          []Weapon{},
		Features:         []Feature{},
		FavoriteSkills:   []string{},
		FavoriteWeapons:  []string{},
		ArmorClass:       10,
		Speed:            30,
		HitDie:           "d8",
	}
	raw, err := bson.Marshal(empty)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

// GetDisplayName returns "" — D&D 5e does not embed the name inside stats.
func (p *Plugin) GetDisplayName(_ bson.Raw) string { return "" }

// SetDisplayName returns stats unchanged — D&D 5e does not embed the name inside stats.
func (p *Plugin) SetDisplayName(stats bson.Raw, _ string) (bson.Raw, error) { return stats, nil }

func rollD20() int { return rand.Intn(20) + 1 }

// rollWithAdvantage rolls one or two d20s based on diceMod.
// diceMod=1 → advantage (roll 2d20, take highest)
// diceMod=-1 → disadvantage (roll 2d20, take lowest)
// diceMod=0 → normal (roll 1d20)
// Returns the final roll and all rolls made.
func rollWithAdvantage(diceMod int) (int, []int) {
	r1 := rollD20()
	if diceMod == 0 {
		return r1, []int{r1}
	}
	r2 := rollD20()
	if diceMod > 0 {
		// advantage: take higher
		if r2 > r1 {
			return r2, []int{r1, r2}
		}
		return r1, []int{r1, r2}
	}
	// disadvantage: take lower
	if r2 < r1 {
		return r2, []int{r1, r2}
	}
	return r1, []int{r1, r2}
}

// skillKeyToBonus resolves a D&D 5e skillKey to the total bonus from stats.
// skillKey formats:
//
//	"ability_str"     → raw STR modifier
//	"save_dex"        → DEX saving throw total
//	"skill_athletics" → Athletics skill total
//	"initiative"      → DEX modifier
func skillKeyToBonus(stats *Stats, skillKey string) (int, string, error) {
	a := &stats.Abilities
	pb := proficiencyBonus(stats.Info.Level)

	if skillKey == "initiative" {
		return abilityMod(a.DEX), "Initiative", nil
	}

	if strings.HasPrefix(skillKey, "ability_") {
		key := strings.TrimPrefix(skillKey, "ability_")
		mod := abilityModByKey(a, key)
		return mod, abilityLabelByKey(key) + " Check", nil
	}

	if strings.HasPrefix(skillKey, "save_") {
		key := strings.TrimPrefix(skillKey, "save_")
		mod := abilityModByKey(a, key)
		if saveProfByKey(&stats.SavingThrowProfs, key) {
			mod += pb
		}
		return mod, abilityLabelByKey(key) + " Saving Throw", nil
	}

	if strings.HasPrefix(skillKey, "skill_") {
		key := strings.TrimPrefix(skillKey, "skill_")
		for _, def := range skillDefs {
			if def.Key == key {
				base := abilityModByKey(a, def.Ability)
				prof := stats.SkillProfs[def.Key]
				return base + pb*prof, def.Label, nil
			}
		}
		return 0, key, fmt.Errorf("dnd5e: unknown skill key: %s", key)
	}

	return 0, skillKey, fmt.Errorf("dnd5e: unrecognised skillKey format: %s", skillKey)
}

func abilityLabelByKey(key string) string {
	switch key {
	case "str":
		return "Strength"
	case "dex":
		return "Dexterity"
	case "con":
		return "Constitution"
	case "int":
		return "Intelligence"
	case "wis":
		return "Wisdom"
	case "cha":
		return "Charisma"
	}
	return strings.ToUpper(key)
}

// RollSkill performs a D&D 5e skill/ability/save check.
// diceMod=1 → advantage, diceMod=-1 → disadvantage, diceMod=0 → normal.
// modifier is a flat situational bonus/penalty added to the total.
// target is the DC (0 = no DC check, just show the total).
func (p *Plugin) RollSkill(raw bson.Raw, skillKey string, modifier int, diceMod int, target int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	bonus, skillName, err := skillKeyToBonus(stats, skillKey)
	if err != nil {
		return nil, err
	}

	d20, allRolls := rollWithAdvantage(diceMod)
	total := d20 + bonus + modifier

	var outcome string
	switch {
	case target > 0 && d20 == 20:
		outcome = "critical_success"
	case target > 0 && d20 == 1:
		outcome = "critical_failure"
	case target > 0 && total >= target:
		outcome = "success"
	case target > 0 && total < target:
		outcome = "failure"
	default:
		outcome = "rolled"
	}

	return &gsys.RollResult{
		RollType:       "skill",
		Roll:           total,
		Target:         target,
		Outcome:        outcome,
		SkillKey:       skillKey,
		SkillName:      skillName,
		Modifier:       modifier,
		DiceMod:        diceMod,
		AllRolls:       allRolls,
		D20Roll:        d20,
		BonusTotal:     bonus,
		IsAdvantage:    diceMod > 0,
		IsDisadvantage: diceMod < 0,
		IsCriticalHit:  d20 == 20,
	}, nil
}

// RollWeapon performs a D&D 5e attack roll (hit check + damage).
// weaponSkill is the attack ability key ("str"|"dex"|"spellcasting").
// modifier is used as the target AC (0 = no hit/miss determination).
// diceMod=1 → advantage, diceMod=-1 → disadvantage, diceMod=0 → normal.
func (p *Plugin) RollWeapon(raw bson.Raw, weaponName, weaponSkill, damage string, modifier int, diceMod int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	a := &stats.Abilities
	pb := proficiencyBonus(stats.Info.Level)

	// Resolve attack bonus
	var abilityBonus int
	if weaponSkill == "spellcasting" && stats.SpellcastingAbility != "" {
		abilityBonus = abilityModByKey(a, stats.SpellcastingAbility)
	} else {
		abilityBonus = abilityModByKey(a, weaponSkill)
	}

	// Find weapon to check proficiency
	proficient := false
	for _, w := range stats.Weapons {
		if w.Name == weaponName {
			proficient = w.Proficient
			break
		}
	}
	attackBonus := abilityBonus
	if proficient {
		attackBonus += pb
	}

	d20, allRolls := rollWithAdvantage(diceMod)
	attackTotal := d20 + attackBonus

	isCrit := d20 == 20
	isCritMiss := d20 == 1

	// Determine hit outcome
	targetAC := modifier
	var outcome string
	switch {
	case isCrit:
		outcome = "critical_hit"
	case isCritMiss:
		outcome = "critical_miss"
	case targetAC > 0 && attackTotal >= targetAC:
		outcome = "hit"
	case targetAC > 0 && attackTotal < targetAC:
		outcome = "miss"
	default:
		outcome = "rolled" // no AC provided
	}

	isHit := outcome == "hit" || outcome == "critical_hit" || outcome == "rolled"

	// Roll damage on hit
	var damageRoll int
	var damageBreakdown string
	if isHit && damage != "" {
		if isCrit {
			damageRoll, damageBreakdown = rollDamage(damage, abilityBonus, true)
		} else {
			damageRoll, damageBreakdown = rollDamage(damage, abilityBonus, false)
		}
	}

	return &gsys.RollResult{
		RollType:        "weapon",
		Roll:            attackTotal,
		Target:          targetAC,
		Outcome:         outcome,
		WeaponName:      weaponName,
		Damage:          damage,
		DamageRoll:      damageRoll,
		DamageBreakdown: damageBreakdown,
		Modifier:        modifier,
		DiceMod:         diceMod,
		AllRolls:        allRolls,
		D20Roll:         d20,
		BonusTotal:      attackBonus,
		IsAdvantage:     diceMod > 0,
		IsDisadvantage:  diceMod < 0,
		IsCriticalHit:   isCrit,
	}, nil
}

// rollDamage rolls a damage formula like "1d8", "2d6", "1d4+2".
// abilityMod is added to the total. On critical hit, all dice are doubled.
func rollDamage(formula string, abilityMod int, isCrit bool) (int, string) {
	formula = strings.TrimSpace(strings.ToLower(formula))
	if formula == "" {
		return 0, ""
	}

	total := 0
	var parts []string

	for _, seg := range strings.Split(formula, "+") {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		if strings.Contains(seg, "d") {
			if strings.HasPrefix(seg, "d") {
				seg = "1" + seg
			}
			var num, sides int
			if _, err := fmt.Sscanf(seg, "%dd%d", &num, &sides); err == nil && sides > 0 {
				rolls := num
				if isCrit {
					rolls *= 2
				}
				partTotal := 0
				var diceResults []string
				for i := 0; i < rolls; i++ {
					r := rand.Intn(sides) + 1
					partTotal += r
					diceResults = append(diceResults, strconv.Itoa(r))
				}
				total += partTotal
				label := fmt.Sprintf("%dd%d(%s)", rolls, sides, strings.Join(diceResults, ","))
				parts = append(parts, label)
			}
		} else {
			var v int
			fmt.Sscanf(seg, "%d", &v)
			if v != 0 {
				total += v
				parts = append(parts, strconv.Itoa(v))
			}
		}
	}

	if abilityMod != 0 {
		total += abilityMod
		parts = append(parts, strconv.Itoa(abilityMod))
	}

	if len(parts) == 0 {
		return 0, ""
	}
	return total, strings.Join(parts, " + ") + " = " + strconv.Itoa(total)
}
