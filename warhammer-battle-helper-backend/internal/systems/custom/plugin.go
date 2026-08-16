package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"fmt"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
)

// Plugin implements systems.GameSystem for custom template-driven game systems.
// Generic interface methods (RollSkill, RollWeapon) return an error directing
// callers to use RollWithTemplate instead — the GameService handles this dispatch.
type Plugin struct {
	rng gsys.Roller
}

// New returns an initialised custom plugin.
func New() *Plugin { return &Plugin{rng: gsys.DefaultRoller()} }

// TokenFields returns nil for the custom system: bindable token fields (FEATURE-102)
// come from the template's own Sections/FieldDef at request time, not the registry.
func (p *Plugin) TokenFields() []gsys.TokenFieldDef { return nil }

// DefaultStats returns an empty custom stats document.
func (p *Plugin) DefaultStats() (bson.Raw, error) {
	empty := Stats{
		Attributes: map[string]AttrValue{},
		Skills:     map[string]AttrValue{},
		Texts:      map[string]string{},
		Progress:   map[string]ProgressValue{},
	}
	raw, err := bson.Marshal(empty)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

// ComputeDerived recomputes current = base + advances for every attribute and skill.
// Skills without advances (skill_tree nodes, plain skill_table rows) simply get current == base.
func (p *Plugin) ComputeDerived(raw bson.Raw) (bson.Raw, error) {
	s, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}
	for key, av := range s.Attributes {
		av.Current = av.Base + av.Advances
		s.Attributes[key] = av
	}
	for key, sv := range s.Skills {
		sv.Current = sv.Base + sv.Advances
		s.Skills[key] = sv
	}
	out, err := bson.Marshal(s)
	if err != nil {
		return raw, err
	}
	return out, nil
}

// SeedDefaults writes each field's FieldDef.Default into a stats document, which is how a
// freshly created character starts with GM-chosen values instead of blanks (FEATURE-158).
// Attr fields land in Attributes[key].Base with Advances left at 0 — advances are earned in
// play, not granted at creation — so a later ComputeDerived sets current = base. Number fields
// land in Numbers[key]. Fields with a nil Default, and every type other than "attr"/"number",
// are left untouched: nil means "no default", which is not the same as a default of 0.
//
// This hangs off *Plugin rather than the systems.GameSystem interface for the same reason as
// RollWithTemplate: only the custom system has a template to read.
func (p *Plugin) SeedDefaults(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error) {
	if tmpl == nil {
		return raw, nil
	}
	s, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}
	if s.Numbers == nil {
		s.Numbers = map[string]int{}
	}
	for _, section := range tmpl.Sections {
		for _, field := range section.Fields {
			if field.Default == nil {
				continue
			}
			switch field.Type {
			case "attr":
				s.Attributes[field.Key] = AttrValue{Base: *field.Default}
			case "number":
				s.Numbers[field.Key] = *field.Default
			}
		}
	}
	out, err := bson.Marshal(s)
	if err != nil {
		return raw, err
	}
	return out, nil
}

// GetDisplayName returns "" — name is stored on Character, not in stats.
func (p *Plugin) GetDisplayName(_ bson.Raw) string { return "" }

// SetDisplayName returns stats unchanged.
func (p *Plugin) SetDisplayName(stats bson.Raw, _ string) (bson.Raw, error) { return stats, nil }

// RollSkill is not used for custom systems; GameService calls RollWithTemplate instead.
func (p *Plugin) RollSkill(_ bson.Raw, _ string, _ int, _ int, _ int) (*gsys.RollResult, error) {
	return nil, fmt.Errorf("custom: use RollWithTemplate for custom game systems")
}

// RollWeapon is not used for custom systems.
func (p *Plugin) RollWeapon(_ bson.Raw, _, _, _ string, _ int, _ int) (*gsys.RollResult, error) {
	return nil, fmt.Errorf("custom: weapon rolls not yet supported for custom systems")
}

// RollWithTemplate performs a skill roll using the template definition.
// skillKey is either a FieldDef key (for flat fields) or a dot-path into a skill tree
// (e.g. "bron_biala.jednorecz.miecz"). modifier is added to the result.
func (p *Plugin) RollWithTemplate(raw bson.Raw, template *models.SystemTemplate, skillKey string, modifier int) (*gsys.RollResult, error) {
	stats, err := decodeStats(raw)
	if err != nil {
		return nil, err
	}

	rollCfg, linkedAttr, fieldType, err := resolveRollConfig(template, stats, skillKey)
	if err != nil {
		return nil, err
	}

	if fieldType == "attr" {
		linkedAttr = skillKey
	}

	if len(rollCfg.Formula) > 0 {
		return p.rollFromFormula(stats, template, skillKey, linkedAttr, rollCfg, modifier)
	}

	switch rollCfg.FormulaType {
	case "attr_plus_skill_die":
		return p.rollAttrPlusSkill(stats, template, skillKey, linkedAttr, rollCfg, modifier)
	case "fixed_d100":
		return p.rollFixedD100(stats, template, skillKey, linkedAttr, rollCfg, modifier)
	case "fixed_d20_plus_mod":
		return p.rollFixedD20(stats, template, skillKey, linkedAttr, rollCfg, modifier)
	default:
		return nil, fmt.Errorf("custom: unknown formulaType %q", rollCfg.FormulaType)
	}
}

func decodeStats(raw bson.Raw) (*Stats, error) {
	var s Stats
	if err := bson.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("custom: failed to decode stats: %w", err)
	}
	if s.Attributes == nil {
		s.Attributes = map[string]AttrValue{}
	}
	if s.Skills == nil {
		s.Skills = map[string]AttrValue{}
	}
	if s.Weapons == nil {
		s.Weapons = map[string][]WeaponRow{}
	}
	return &s, nil
}

// resolveRollConfig finds the RollConfig for the given skillKey by scanning all section fields.
// Returns cfg, linkedAttr, fieldType ("attr" | "skill_table" | "skill_tree" | …), error.
// For skill_tree fields the frontend stores keys as "fieldKey.node_xxx.node_yyy…", so we iterate
// the root's Children with field.Key as the starting prefix (skipping the root node itself).
// Custom player-added skills are not in the template tree; they fall back to the field-level RollConfig,
// but use their individual LinkedAttr from stats.CustomSkillNodes if available.
func resolveRollConfig(template *models.SystemTemplate, stats *Stats, skillKey string) (*models.RollConfig, string, string, error) {
	for _, section := range template.Sections {
		for _, field := range section.Fields {
			if field.Type == "skill_tree" && field.Tree != nil {
				// Search template-defined leaves with field.Key as path prefix.
				for i := range field.Tree.Children {
					if cfg, attr, ok := findLeafConfig(&field.Tree.Children[i], skillKey, field.Key); ok {
						if cfg == nil && field.RollConfig != nil {
							cfg = field.RollConfig
						}
						if cfg == nil {
							return nil, "", "", fmt.Errorf("custom: skill tree leaf %q has no roll config", skillKey)
						}
						linkedAttr := attr
						if linkedAttr == "" {
							linkedAttr = cfg.LinkedAttr
						}
						return cfg, linkedAttr, "skill_tree", nil
					}
				}
				// Fallback for player-added custom skills (not in template tree).
				if strings.HasPrefix(skillKey, field.Key+".") && field.Rollable && field.RollConfig != nil {
					linkedAttr := field.RollConfig.LinkedAttr
					if stats.CustomSkillNodes != nil {
						if node, ok := stats.CustomSkillNodes[skillKey]; ok && node.LinkedAttr != "" {
							linkedAttr = node.LinkedAttr
						}
					}
					return field.RollConfig, linkedAttr, "skill_tree", nil
				}
				continue
			}
			if field.Type == "skill_table" && strings.HasPrefix(skillKey, field.Key+".") && field.Rollable && field.RollConfig != nil {
				linkedAttr := field.RollConfig.LinkedAttr
				if field.AssignAttrToSkill {
					suffix := skillKey[len(field.Key)+1:]
					for _, opt := range field.Skills {
						if opt.ID == suffix {
							linkedAttr = opt.Attr
							break
						}
					}
				}
				return field.RollConfig, linkedAttr, "skill_table", nil
			}
			if field.Key == skillKey && field.Rollable && field.RollConfig != nil {
				return field.RollConfig, field.RollConfig.LinkedAttr, field.Type, nil
			}
		}
	}
	return nil, "", "", fmt.Errorf("custom: no roll config found for skill key %q", skillKey)
}

// findLeafConfig recursively searches the tree for a node with the matching full dot-path key.
// path is the accumulated dot-path so far.
func findLeafConfig(node *models.SkillTreeNode, target, path string) (*models.RollConfig, string, bool) {
	current := path + "." + node.Key
	if current == target {
		return nil, node.LinkedAttr, true
	}
	for i := range node.Children {
		if cfg, attr, ok := findLeafConfig(&node.Children[i], target, current); ok {
			return cfg, attr, true
		}
	}
	return nil, "", false
}
