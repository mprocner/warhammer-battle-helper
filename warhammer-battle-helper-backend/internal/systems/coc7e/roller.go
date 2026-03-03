package coc7e

import (
	gsys "battle-helper/internal/systems"
	"fmt"
	"math/rand"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
)

// Plugin implements the systems.GameSystem interface for Call of Cthulhu 7e.
type Plugin struct{}

// New returns an initialised CoC 7e plugin.
func New() *Plugin { return &Plugin{} }

// DefaultStats returns a zero-value CoC stats document as bson.Raw.
func (p *Plugin) DefaultStats() (bson.Raw, error) {
	empty := Stats{
		Skills: map[string]int{},
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

// ComputeDerived is a no-op for CoC 7e — derived stats are computed on the frontend.
func (p *Plugin) ComputeDerived(raw bson.Raw) (bson.Raw, error) {
	return raw, nil
}

// RollSkill performs a CoC 7e skill check.
// skillKey should match a key in Stats.Skills (e.g. "fighting_brawl").
// modifier is applied directly to the skill percentage.
func (p *Plugin) RollSkill(raw bson.Raw, skillKey string, modifier int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	skillPct, ok := stats.Skills[skillKey]
	if !ok {
		return nil, fmt.Errorf("coc7e: skill %q not found on character", skillKey)
	}

	target := skillPct + modifier
	roll := rollD100()
	outcome := outcomeCoC(roll, target)

	return &gsys.RollResult{
		RollType:  "skill",
		Roll:      roll,
		Target:    target,
		Outcome:   outcome,
		SkillKey:  skillKey,
		SkillName: skillKey,
		Modifier:  modifier,
	}, nil
}

// RollWeapon performs a CoC 7e weapon attack (hit test + damage roll).
func (p *Plugin) RollWeapon(raw bson.Raw, weaponName, weaponSkillKey, damage string, modifier int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	skillPct, ok := stats.Skills[weaponSkillKey]
	if !ok {
		return nil, fmt.Errorf("coc7e: weapon skill %q not found on character", weaponSkillKey)
	}

	target := skillPct + modifier
	roll := rollD100()
	outcome := outcomeCoC(roll, target)

	damageRoll := rollDamage(damage, stats.DamageBonus)

	return &gsys.RollResult{
		RollType:   "weapon",
		Roll:       roll,
		Target:     target,
		Outcome:    outcome,
		WeaponName: weaponName,
		Damage:     damage,
		DamageRoll: damageRoll,
		Modifier:   modifier,
	}, nil
}

// rollDamage parses a CoC damage formula like "1d3+db", "1d10", "2d6+1".
// db is substituted by the character's DamageBonus string (e.g. "+1d4", "-1").
func rollDamage(formula, damageBonus string) int {
	if formula == "" {
		return 0
	}
	formula = strings.ToLower(strings.TrimSpace(formula))

	// Substitute damage bonus placeholder
	if strings.Contains(formula, "db") {
		db := rollDamageBonus(damageBonus)
		formula = strings.ReplaceAll(formula, "db", fmt.Sprintf("%d", db))
	}

	return evalDiceFormula(formula)
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

func evalDiceFormula(formula string) int {
	total := 0
	parts := strings.Split(formula, "+")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "d") {
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
