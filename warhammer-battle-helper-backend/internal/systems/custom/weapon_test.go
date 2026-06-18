package custom

import (
	"battle-helper/internal/models"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// weaponTemplate builds a weapons_table whose attack is a d20 roll-under the chosen
// skill, and whose damage is "[count]d[faces] + STR" with count/faces left for the
// player to fill per row.
func weaponTemplate() (*models.SystemTemplate, []byte) {
	count := 1.0
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Key:      "weapons",
				Type:     "weapons_table",
				Label:    "Weapons",
				Rollable: true,
				RollConfig: &models.RollConfig{
					Formula:     []models.FormulaBlock{diceBlock("d20")},
					RollMode:    "traditional",
					SuccessType: "below_threshold",
				},
				Columns: []models.WeaponColumn{
					{Key: "name", Label: "Name", Type: "text"},
					{Key: "skill", Label: "Skill", Type: "select", OptionsFromSkills: true},
				},
				DamageFormula: []models.FormulaBlock{
					{ID: "c1", Type: "const", Num: &count},
					{Type: "op", Value: "d"},
					{ID: "d1", Type: "dice", Value: "d10"},
					{Type: "op", Value: "+"},
					{Type: "attr", Key: "str", Label: "STR"},
				},
			}},
		}},
	}

	stats := Stats{
		Attributes: map[string]AttrValue{"str": {Current: 8}},
		Skills:     map[string]AttrValue{"atk": {Current: 10}},
		Weapons: map[string][]WeaponRow{
			"weapons": {{
				ID:    "w1",
				Cells: map[string]string{"name": "Sword", "skill": "atk"},
				// Player overrides: roll 2d6 instead of the GM default 1d10.
				Damage: map[string]float64{"c1": 2, "d1": 6},
			}},
		},
	}
	raw, _ := bson.Marshal(stats)
	return template, raw
}

func TestRollWeaponWithTemplate_SuccessRollsDamage(t *testing.T) {
	template, raw := weaponTemplate()
	// rng order: attack d20 first, then the two damage dice.
	// attack Intn=4 -> roll 5 (<=10 threshold => success);
	// damage 2d6: Intn 3->4, Intn 5->6 => 10; + STR 8 => 18.
	p := newTestPlugin(4, 3, 5)

	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "w1", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.RollType != "weapon" {
		t.Errorf("RollType = %q, want weapon", res.RollType)
	}
	if res.WeaponName != "Sword" {
		t.Errorf("WeaponName = %q, want Sword", res.WeaponName)
	}
	if res.Roll != 5 {
		t.Errorf("Roll = %d, want 5", res.Roll)
	}
	if !strings.Contains(res.Outcome, "success") {
		t.Errorf("Outcome = %q, want a success", res.Outcome)
	}
	if res.DamageRoll != 18 {
		t.Errorf("DamageRoll = %d, want 18 (2d6=10 + STR 8)", res.DamageRoll)
	}
	if res.DamageBreakdown == "" {
		t.Error("DamageBreakdown should be populated on success")
	}
}

func TestRollWeaponWithTemplate_FailureSkipsDamage(t *testing.T) {
	template, raw := weaponTemplate()
	// attack Intn=19 -> roll 20 (>10 threshold => failure). Damage must not be rolled,
	// so the seqRoller is given exactly one value and must not be asked for more.
	p := newTestPlugin(19)

	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "w1", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if strings.Contains(res.Outcome, "success") {
		t.Errorf("Outcome = %q, want a failure", res.Outcome)
	}
	if res.DamageRoll != 0 {
		t.Errorf("DamageRoll = %d, want 0 on failure", res.DamageRoll)
	}
	if res.DamageBreakdown != "" {
		t.Errorf("DamageBreakdown = %q, want empty on failure", res.DamageBreakdown)
	}
}

func TestRollWeaponWithTemplate_AlwaysOnPresetRollsFromTemplate(t *testing.T) {
	template, raw := weaponTemplate()
	// Attach an AlwaysOn preset that does NOT exist in stats.Weapons. Rolling it must resolve
	// the row straight from the template, proving GM-owned weapons need no per-player copy.
	template.Sections[0].Fields[0].PresetWeapons = []models.PresetWeapon{{
		ID:       "preset_fists",
		Cells:    map[string]string{"name": "Fists", "skill": "atk"},
		Damage:   map[string]float64{"c1": 1, "d1": 4}, // 1d4
		AlwaysOn: true,
	}}
	// attack d20 Intn=2 -> roll 3 (<=10 => success); damage 1d4: Intn 2 -> 3; + STR 8 => 11.
	p := newTestPlugin(2, 2)

	res, err := p.RollWeaponWithTemplate(raw, template, "weapons", "preset_fists", 0)
	if err != nil {
		t.Fatalf("RollWeaponWithTemplate() error: %v", err)
	}
	if res.WeaponName != "Fists" {
		t.Errorf("WeaponName = %q, want Fists", res.WeaponName)
	}
	if !strings.Contains(res.Outcome, "success") {
		t.Errorf("Outcome = %q, want a success", res.Outcome)
	}
	if res.DamageRoll != 11 {
		t.Errorf("DamageRoll = %d, want 11 (1d4=3 + STR 8)", res.DamageRoll)
	}
}

func TestRollWeaponWithTemplate_Errors(t *testing.T) {
	template, raw := weaponTemplate()
	p := newTestPlugin()

	if _, err := p.RollWeaponWithTemplate(raw, template, "nonexistent", "w1", 0); err == nil {
		t.Error("expected error for unknown field key")
	}
	if _, err := p.RollWeaponWithTemplate(raw, template, "weapons", "nope", 0); err == nil {
		t.Error("expected error for unknown weapon row id")
	}
}
