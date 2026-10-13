package custom

import (
	"strings"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

// attrTableTemplate is one attr_table with two rows. The table carries the shared roll config;
// rows carry only their own identity and limits.
func attrTableTemplate(cfg *models.RollConfig) *models.SystemTemplate {
	return seedTemplate(models.FieldDef{
		Key:           "fld_table",
		Type:          "attr_table",
		Label:         "Cechy",
		HasAdvances:   true,
		Step:          5,
		AdvancesLabel: "Rozw.",
		Rollable:      cfg != nil,
		RollConfig:    cfg,
		AttrRows: []models.AttrRow{
			{ID: "attr_ws", Label: "Walka wręcz", Abbr: "WW", Default: intPtr(31), Min: intPtr(0), Max: intPtr(100), ShowOnShortCard: true},
			{ID: "attr_s", Label: "Siła", Abbr: "S"},
		},
	})
}

func TestFlattenFields_ExpandsAttrTableRows(t *testing.T) {
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}}
	tmpl := attrTableTemplate(cfg)
	got := flattenFields(tmpl.Sections[0].Fields)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2 (one virtual attr per row, no table entry)", len(got))
	}
	ws := got[0]
	if ws.Key != "attr_ws" || ws.Type != "attr" || ws.Label != "Walka wręcz" || ws.Abbr != "WW" {
		t.Errorf("row identity not copied: %+v", ws)
	}
	if ws.Default == nil || *ws.Default != 31 {
		t.Errorf("row default not copied: %v", ws.Default)
	}
	if !ws.HasAdvances || !ws.Rollable || ws.RollConfig != cfg {
		t.Errorf("table-level settings not inherited: %+v", ws)
	}
	if ws.Step != 5 || ws.AdvancesLabel != "Rozw." {
		t.Errorf("table Step/AdvancesLabel not inherited: step=%d label=%q", ws.Step, ws.AdvancesLabel)
	}
	if ws.Min == nil || *ws.Min != 0 || ws.Max == nil || *ws.Max != 100 || !ws.ShowOnShortCard {
		t.Errorf("row Min/Max/ShowOnShortCard not copied: %+v", ws)
	}
}

func TestSeedDefaults_AttrTableRowSeedsBase(t *testing.T) {
	s := seedBlank(t, attrTableTemplate(nil))
	if av, ok := s.Attributes["attr_ws"]; !ok || av.Base != 31 {
		t.Errorf("Attributes[attr_ws] = %+v (present=%v), want Base 31", av, ok)
	}
	if _, ok := s.Attributes["attr_s"]; ok {
		t.Error("a row without Default must not be seeded")
	}
}

func TestRollWithTemplate_AttrTableRowRollsAgainstItself(t *testing.T) {
	tmpl := attrTableTemplate(&models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
	})
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_ws": {Base: 31, Advances: 5, Current: 36}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin(19).RollWithTemplate(raw, tmpl, "attr_ws", 0) // d100 -> 20
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if res.Roll != 20 || res.Target != 36 || res.Outcome != "regular_success" {
		t.Errorf("got roll=%d target=%d outcome=%q, want 20/36/regular_success", res.Roll, res.Target, res.Outcome)
	}
	if res.SkillName != "Walka wręcz" {
		t.Errorf("SkillName = %q, want the row label", res.SkillName)
	}
}

func TestRollWithTemplate_AttrTablePoolOfAttributeDice(t *testing.T) {
	tmpl := attrTableTemplate(&models.RollConfig{
		RollMode:             "dice_pool",
		Formula:              []models.FormulaBlock{{Type: "attr_linked"}, opBlock("d"), diceBlock("d6")},
		PoolSuccessThreshold: 5,
	})
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_s": {Base: 3, Current: 3}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin(4, 0, 5).RollWithTemplate(raw, tmpl, "attr_s", 0) // 5, 1, 6
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if got := poolRolls(res.PoolFormula); len(got) != 3 {
		t.Fatalf("rolled %d dice, want 3 (= attribute value)", len(got))
	}
	if res.PoolSuccesses != 2 {
		t.Errorf("successes = %d, want 2", res.PoolSuccesses)
	}
}

func TestRollWithTemplate_AttrLinkedBreakdownShowsAbbr(t *testing.T) {
	tmpl := attrTableTemplate(&models.RollConfig{
		Formula:     []models.FormulaBlock{{Type: "attr_linked"}, opBlock("+"), diceBlock("d10")},
		SuccessType: "raw",
	})
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_ws": {Base: 36, Current: 36}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin(2).RollWithTemplate(raw, tmpl, "attr_ws", 0) // d10 -> 3
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if !strings.HasPrefix(res.FormulaBreakdown, "WW+d10 = ") {
		t.Errorf("breakdown = %q, want it to start with the row abbr, not its opaque key", res.FormulaBreakdown)
	}
}

// The same label defect hit skills with an assigned attribute before attr_table existed.
func TestRollWithTemplate_SkillAttrLinkedBreakdownShowsAbbr(t *testing.T) {
	tmpl := seedTemplate(
		models.FieldDef{Key: "attr_str", Type: "attr", Label: "Siła", Abbr: "S"},
		models.FieldDef{
			Key: "fld_sk", Type: "skill_table", Rollable: true, AssignAttrToSkill: true,
			Skills:     []models.SkillOption{{ID: "opt_a", Label: "Atletyka", Attr: "attr_str"}},
			RollConfig: &models.RollConfig{Formula: []models.FormulaBlock{{Type: "attr_linked"}}, SuccessType: "raw"},
		},
	)
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"attr_str": {Base: 8, Current: 8}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	res, err := newTestPlugin().RollWithTemplate(raw, tmpl, "fld_sk.opt_a", 0)
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if !strings.HasPrefix(res.FormulaBreakdown, "S = ") {
		t.Errorf("breakdown = %q, want it to start with \"S = \"", res.FormulaBreakdown)
	}
}

func TestAttrLabel(t *testing.T) {
	tmpl := seedTemplate(
		models.FieldDef{Key: "attr_str", Type: "attr", Label: "Siła", Abbr: "S"},
		models.FieldDef{Key: "attr_int", Type: "attr", Label: "Inteligencja"},
		models.FieldDef{Key: "fld_t", Type: "attr_table", AttrRows: []models.AttrRow{{ID: "attr_ws", Label: "Walka", Abbr: "WW"}}},
	)
	cases := map[string]string{"attr_str": "S", "attr_int": "Inteligencja", "attr_ws": "WW", "attr_gone": "attr_gone", "": ""}
	for key, want := range cases {
		if got := attrLabel(tmpl, key); got != want {
			t.Errorf("attrLabel(%q) = %q, want %q", key, got, want)
		}
	}
}
