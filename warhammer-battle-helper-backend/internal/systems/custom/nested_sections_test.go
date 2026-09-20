package custom

import (
	"testing"

	"battle-helper/internal/models"
)

// nestedTemplate builds a template whose only attribute lives two sections deep, so any
// traversal that stops at the first level simply cannot see it.
func nestedTemplate() *models.SystemTemplate {
	def := 7
	inner := &models.SectionDef{
		ID: "sec_inner", Title: "Inner", Columns: 2,
		Fields: []models.FieldDef{
			// Rollable must be true here: resolveRollConfig's generic (non skill_table/skill_tree)
			// branch requires field.Rollable && field.RollConfig != nil to match a plain field by
			// Key. The brief's original fixture omitted Rollable, which made
			// TestResolveRollConfigFindsNestedField fail with "no roll config found" even after the
			// recursion fix — a discrepancy in the brief's test data, not in production code.
			{Key: "attr_deep", Type: "attr", Label: "Deep", Default: &def, Rollable: true,
				RollConfig: &models.RollConfig{}},
		},
	}
	return &models.SystemTemplate{
		Sections: []models.SectionDef{
			{ID: "sec_root", Title: "Root", Columns: 3, Fields: []models.FieldDef{
				{Key: "sec_inner", Type: "section", Section: inner},
			}},
		},
	}
}

func TestFlattenFieldsReachesNestedSections(t *testing.T) {
	flat := flattenFields(nestedTemplate().Sections[0].Fields)
	if len(flat) != 1 || flat[0].Key != "attr_deep" {
		t.Fatalf("expected the nested attribute, got %+v", flat)
	}
}

func TestDefaultStatsAppliesDefaultsInsideNestedSection(t *testing.T) {
	// The brief's guessed entry point `defaultStatsFor` does not exist. The real one is
	// `(*Plugin).SeedDefaults(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error)`,
	// which seeds a stats document rather than returning one from scratch. `seedBlank` in
	// roller_test.go already wraps this exact call (DefaultStats + SeedDefaults + decode) for
	// tests, so this test reuses it instead of inventing a second helper.
	stats := seedBlank(t, nestedTemplate())
	if got := stats.Attributes["attr_deep"].Base; got != 7 {
		t.Fatalf("expected default 7 for the nested attribute, got %d", got)
	}
}

func TestResolveRollConfigFindsNestedField(t *testing.T) {
	cfg, _, fieldType, err := resolveRollConfig(nestedTemplate(), &Stats{}, "attr_deep")
	if err != nil {
		t.Fatalf("resolveRollConfig: %v", err)
	}
	if cfg == nil || fieldType != "attr" {
		t.Fatalf("expected an attr roll config, got cfg=%v type=%q", cfg, fieldType)
	}
}

func TestResolveSkillLabelFindsNestedField(t *testing.T) {
	if got := resolveSkillLabel(nestedTemplate(), &Stats{}, "attr_deep"); got != "Deep" {
		t.Fatalf("expected the nested label, got %q", got)
	}
}
