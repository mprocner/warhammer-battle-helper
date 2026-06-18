package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"fmt"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
)

// RollWeaponWithTemplate performs a weapon attack for a custom-system character.
// fieldKey identifies the weapons_table field; rowID identifies the player's weapon row
// (already persisted in the character's stats via autosave). The attack uses the field's
// RollConfig formula — a "skill" token resolves to the skill picked in the row's
// OptionsFromSkills column. On success, the field's DamageFormula is evaluated with the
// per-row numbers the player filled into its editable blocks.
func (p *Plugin) RollWeaponWithTemplate(raw bson.Raw, template *models.SystemTemplate, fieldKey, rowID string, modifier int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	field, ok := findWeaponField(template, fieldKey)
	if !ok {
		return nil, fmt.Errorf("custom: weapons_table field %q not found", fieldKey)
	}
	row, ok := resolveWeaponRow(stats, field, fieldKey, rowID)
	if !ok {
		return nil, fmt.Errorf("custom: weapon row %q not found", rowID)
	}
	if field.RollConfig == nil || len(field.RollConfig.Formula) == 0 {
		return nil, fmt.Errorf("custom: weapons_table %q has no attack roll formula", fieldKey)
	}

	skillKey, linkedAttr := resolveWeaponSkill(template, stats, field, row)

	// Attack roll reuses the skill-roll formula evaluator; the "skill" block resolves
	// to skillValue(stats, skillKey) — i.e. the weapon's chosen skill.
	atk, err := p.rollFromFormula(stats, template, skillKey, linkedAttr, field.RollConfig, modifier)
	if err != nil {
		return nil, err
	}
	atk.RollType = "weapon"
	atk.WeaponName = weaponDisplayName(field, row)
	atk.SkillKey = ""
	atk.SkillName = ""

	// Damage only on a successful attack (CoC-style output).
	if isSuccessOutcome(atk.Outcome) && len(field.DamageFormula) > 0 {
		blocks := applyDamageOverrides(field.DamageFormula, row.Damage)
		dmg, _, dLabel, dValue, derr := p.evalFormula(blocks, stats, skillKey, linkedAttr)
		if derr == nil {
			atk.DamageRoll = dmg
			if dLabel == dValue {
				atk.DamageBreakdown = fmt.Sprintf("%s = %d", dLabel, dmg)
			} else {
				atk.DamageBreakdown = fmt.Sprintf("%s = %s = %d", dLabel, dValue, dmg)
			}
		}
	}

	return atk, nil
}

// resolveWeaponSkill returns the skill key chosen in the row's "from skills" select
// column (empty if none) and the linked attribute of that skill, used for threshold
// fallback and attr_linked/dice_skill_attr blocks in the attack formula.
func resolveWeaponSkill(template *models.SystemTemplate, stats *Stats, field *models.FieldDef, row WeaponRow) (string, string) {
	var skillKey string
	for i := range field.Columns {
		col := field.Columns[i]
		if col.Type == "select" && col.OptionsFromSkills {
			skillKey = row.Cells[col.Key]
			break
		}
	}

	linkedAttr := ""
	if field.RollConfig != nil {
		linkedAttr = field.RollConfig.LinkedAttr
	}
	if skillKey != "" {
		if _, attr, _, err := resolveRollConfig(template, stats, skillKey); err == nil && attr != "" {
			linkedAttr = attr
		}
	}
	return skillKey, linkedAttr
}

// applyDamageOverrides clones the GM-authored damage blocks and substitutes the numbers
// the player entered per weapon row (keyed by block id): player die faces and player flat
// numbers (const_input). GM-fixed blocks (const, fixed dice) and attribute/skill blocks are
// left untouched — they resolve from their authored value or from stats at roll time.
// A const_input collapses to a plain const so evalFormula needs no awareness of it.
func applyDamageOverrides(blocks []models.FormulaBlock, overrides map[string]float64) []models.FormulaBlock {
	out := make([]models.FormulaBlock, len(blocks))
	copy(out, blocks)
	for i := range out {
		ov, ok := overrides[out[i].ID]
		switch out[i].Type {
		case "const":
			if ok {
				v := ov
				out[i].Num = &v
			}
		case "dice":
			if ok {
				out[i].Value = fmt.Sprintf("d%d", int(ov))
			}
		case "const_input":
			// Player-filled flat number; falls back to 0 if unfilled (the sheet blocks
			// rolling with an empty input, so this is only a safety net).
			v := 0.0
			if ok {
				v = ov
			}
			out[i].Type = "const"
			out[i].Num = &v
		}
	}
	return out
}

func findWeaponField(template *models.SystemTemplate, fieldKey string) (*models.FieldDef, bool) {
	for si := range template.Sections {
		for fi := range template.Sections[si].Fields {
			f := &template.Sections[si].Fields[fi]
			if f.Key == fieldKey && f.Type == "weapons_table" {
				return f, true
			}
		}
	}
	return nil, false
}

// resolveWeaponRow finds the weapon to roll, looking first among the player's own rows in
// stats and then — falling back — among the field's GM-authored presets (AlwaysOn weapons
// live only in the template, never in stats, so a GM edit reaches every player). A matched
// preset is synthesized into a WeaponRow so the rest of the roll path treats both identically.
func resolveWeaponRow(stats *Stats, field *models.FieldDef, fieldKey, rowID string) (WeaponRow, bool) {
	if row, ok := findWeaponRow(stats, fieldKey, rowID); ok {
		return row, true
	}
	for i := range field.PresetWeapons {
		p := field.PresetWeapons[i]
		if p.ID == rowID {
			return WeaponRow{ID: p.ID, Cells: p.Cells, Damage: p.Damage}, true
		}
	}
	return WeaponRow{}, false
}

func findWeaponRow(stats *Stats, fieldKey, rowID string) (WeaponRow, bool) {
	for _, r := range stats.Weapons[fieldKey] {
		if r.ID == rowID {
			return r, true
		}
	}
	return WeaponRow{}, false
}

// weaponDisplayName picks a human label for the weapon: the first text column's value,
// then any non-empty cell, falling back to the field label.
func weaponDisplayName(field *models.FieldDef, row WeaponRow) string {
	for i := range field.Columns {
		col := field.Columns[i]
		if col.Type == "text" {
			if v := strings.TrimSpace(row.Cells[col.Key]); v != "" {
				return v
			}
		}
	}
	for i := range field.Columns {
		if v := strings.TrimSpace(row.Cells[field.Columns[i].Key]); v != "" {
			return v
		}
	}
	return field.Label
}

// isSuccessOutcome reports whether an outcome string represents any kind of success.
func isSuccessOutcome(outcome string) bool {
	return strings.Contains(outcome, "success")
}
