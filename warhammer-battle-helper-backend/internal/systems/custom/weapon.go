package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"fmt"
	"math"
	"strconv"
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
	row, ok := findWeaponRow(stats, fieldKey, rowID)
	if !ok {
		return nil, fmt.Errorf("custom: weapon row %q not found", rowID)
	}
	if field.RollConfig == nil || len(field.RollConfig.Formula) == 0 {
		return nil, fmt.Errorf("custom: weapons_table %q has no attack roll formula", fieldKey)
	}

	// Parse errors are deterministic, so reject a broken damage formula — or a player entry the
	// grammar rejects — before the attack is rolled instead of rolling and then discarding it.
	damageBlocks, err := applyDamageOverrides(field.DamageFormula, row.Damage)
	if err != nil {
		return nil, fmt.Errorf("custom: damage: %w", err)
	}
	if len(damageBlocks) > 0 {
		if _, err := parseFormula(damageBlocks); err != nil {
			return nil, fmt.Errorf("custom: damage formula: %w", err)
		}
	}

	skillKey, linkedAttr, baseFromAttr := resolveWeaponSkill(template, stats, field, row)

	// Attack roll reuses the skill-roll formula evaluator; the "skill" block resolves to
	// skillValue(stats, skillKey, linkedAttr, baseFromAttr) — i.e. the weapon's chosen skill.
	atk, err := p.rollFromFormula(stats, template, skillKey, linkedAttr, baseFromAttr, field.RollConfig, modifier)
	if err != nil {
		return nil, err
	}
	atk.RollType = "weapon"
	atk.WeaponName = weaponDisplayName(field, row)
	atk.SkillKey = ""
	atk.SkillName = ""

	// Damage only on a successful attack (CoC-style output).
	if isSuccessOutcome(atk.Outcome) && len(damageBlocks) > 0 {
		dmg, _, dLabel, dValue, derr := p.evalFormula(damageBlocks, stats, skillKey, linkedAttr, attrLabel(template, linkedAttr), baseFromAttr)
		if derr != nil {
			// Stats-dependent failures (division by zero, too many dice) surface to the caller.
			return nil, fmt.Errorf("custom: damage formula eval: %w", derr)
		}
		atk.DamageRoll = dmg
		if dLabel == dValue {
			atk.DamageBreakdown = fmt.Sprintf("%s = %d", dLabel, dmg)
		} else {
			atk.DamageBreakdown = fmt.Sprintf("%s = %s = %d", dLabel, dValue, dmg)
		}
	}

	return atk, nil
}

// resolveWeaponSkill returns the skill key chosen in the row's "from skills" select
// column (empty if none), the linked attribute of that skill (used for threshold
// fallback and attr_linked/dice_skill_attr blocks in the attack formula), and whether
// that skill derives its base from that attribute.
func resolveWeaponSkill(template *models.SystemTemplate, stats *Stats, field *models.FieldDef, row WeaponRow) (string, string, bool) {
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
	baseFromAttr := false
	if skillKey != "" {
		// The weapon rolls the chosen skill, so it inherits that skill's attribute AND whether that
		// skill derives its base from it — otherwise the attack would roll on advances alone.
		if target, err := resolveRollConfig(template, stats, skillKey); err == nil {
			if target.linkedAttr != "" {
				linkedAttr = target.linkedAttr
			}
			baseFromAttr = target.baseFromAttr
		}
	}
	return skillKey, linkedAttr, baseFromAttr
}

// applyDamageOverrides clones the GM-authored damage blocks and substitutes what the player
// entered per weapon row (keyed by block id): a die's faces, an overridden constant, and the ▢
// (const_input) expression. A ▢ expands into its parsed blocks wrapped in parentheses, so the
// breakdown shows it as one group and evalFormula needs no awareness of it. Attribute/skill blocks
// are left untouched — they resolve from stats at roll time.
func applyDamageOverrides(blocks []models.FormulaBlock, overrides map[string]string) ([]models.FormulaBlock, error) {
	out := make([]models.FormulaBlock, 0, len(blocks))
	for _, b := range blocks {
		ov := strings.TrimSpace(overrides[b.ID])
		switch b.Type {
		case "const":
			if ov != "" {
				v, err := strconv.ParseFloat(ov, 64)
				if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
					return nil, fmt.Errorf("%w: %q", ErrInvalidDamageExpr, ov)
				}
				b.Num = &v
			}
		case "dice":
			if ov != "" {
				sides, err := strconv.Atoi(ov)
				if err != nil || sides < 1 {
					return nil, fmt.Errorf("%w: %q", ErrInvalidDamageExpr, ov)
				}
				b.Value = fmt.Sprintf("d%d", sides)
			}
		case "const_input":
			// Unfilled falls back to 0 (the sheet blocks rolling with an empty ▢, so this is only
			// a safety net).
			if ov == "" {
				zero := 0.0
				out = append(out, models.FormulaBlock{ID: b.ID, Type: "const", Num: &zero})
				continue
			}
			expr, err := parseDamageExpr(ov, b.ID)
			if err != nil {
				return nil, err
			}
			out = append(out, models.FormulaBlock{ID: b.ID + ".open", Type: "paren_open"})
			out = append(out, expr...)
			out = append(out, models.FormulaBlock{ID: b.ID + ".close", Type: "paren_close"})
			continue
		}
		out = append(out, b)
	}
	return out, nil
}

// findWeaponFieldInFields recursively searches a field list for a weapons_table field
// with the given key, descending into nested sections. Unlike flattenFields (which
// returns copies), this returns a pointer into the template's own backing array so
// callers can read and mutate the field's GM-authored presets without copies.
// A section field (type == "section") is a wrapper: we descend into it but do not
// return it as a match, only leaf fields with type == "weapons_table".
func findWeaponFieldInFields(fields []models.FieldDef, fieldKey string) *models.FieldDef {
	for i := range fields {
		f := &fields[i]
		if f.Key == fieldKey && f.Type == "weapons_table" {
			return f
		}
		// Descend into nested sections
		if f.Type == "section" && f.Section != nil {
			if found := findWeaponFieldInFields(f.Section.Fields, fieldKey); found != nil {
				return found
			}
		}
	}
	return nil
}

func findWeaponField(template *models.SystemTemplate, fieldKey string) (*models.FieldDef, bool) {
	for si := range template.Sections {
		if f := findWeaponFieldInFields(template.Sections[si].Fields, fieldKey); f != nil {
			return f, true
		}
	}
	return nil, false
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
