package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// seqRoller is a strict deterministic Roller: returns supplied raw values in
// order and panics on exhaustion. Dice compute Intn(sides)+1, so to force a
// die result of 4 supply 3.
type seqRoller struct {
	vals []int
	i    int
}

func (s *seqRoller) Intn(int) int {
	if s.i >= len(s.vals) {
		panic("seqRoller: more rolls requested than provided — test expectation is wrong")
	}
	v := s.vals[s.i]
	s.i++
	return v
}

var _ gsys.Roller = (*seqRoller)(nil)

func newTestPlugin(vals ...int) *Plugin {
	p := New()
	p.rng = &seqRoller{vals: vals}
	return p
}

func numBlock(v float64) models.FormulaBlock { return models.FormulaBlock{Type: "const", Num: &v} }
func diceBlock(n string) models.FormulaBlock { return models.FormulaBlock{Type: "dice", Value: n} }
func opBlock(o string) models.FormulaBlock   { return models.FormulaBlock{Type: "op", Value: o} }

func sampleStats() *Stats {
	return &Stats{
		Attributes: map[string]AttrValue{"str": {Current: 8}, "dex": {Current: 5}},
		Skills:     map[string]AttrValue{"atk": {Current: 10}},
	}
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

func TestDiceNotationToSides(t *testing.T) {
	tests := map[string]int{
		"d4": 4, "d6": 6, "d8": 8, "d10": 10, "d12": 12, "d20": 20, "d100": 100,
		"garbage": 6, "": 6,
	}
	for notation, want := range tests {
		if got := diceNotationToSides(notation); got != want {
			t.Errorf("diceNotationToSides(%q) = %d, want %d", notation, got, want)
		}
	}
}

func TestAttrModifier(t *testing.T) {
	// (attr-10)/2 with Go truncation toward zero (no floor correction here).
	tests := []struct {
		attr, want int
	}{
		{10, 0}, {12, 1}, {20, 5}, {8, -1},
		{9, 0},  // -1/2 truncates to 0
		{7, -1}, // -3/2 truncates to -1 (not -2)
	}
	for _, tt := range tests {
		if got := attrModifier(tt.attr); got != tt.want {
			t.Errorf("attrModifier(%d) = %d, want %d", tt.attr, got, tt.want)
		}
	}
}

func TestEvalThreshold(t *testing.T) {
	tests := map[string]int{"5": 5, "  12  ": 12, "": 0, "abc": 0, "-3": -3}
	for expr, want := range tests {
		if got := evalThreshold(expr); got != want {
			t.Errorf("evalThreshold(%q) = %d, want %d", expr, got, want)
		}
	}
}

func TestEvalOutcome(t *testing.T) {
	tests := []struct {
		name            string
		successType     string
		roll, threshold int
		want            string
	}{
		{"raw shows numeric roll", "raw", 7, 50, "7"},
		{"zero threshold shows numeric roll", "above_threshold", 7, 0, "7"},
		{"above threshold success", "above_threshold", 50, 40, "regular_success"},
		{"above threshold failure", "above_threshold", 30, 40, "failure"},
		{"below threshold success", "below_threshold", 30, 40, "regular_success"},
		{"below threshold failure", "below_threshold", 50, 40, "failure"},
		{"default behaves as above", "", 50, 40, "regular_success"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &models.RollConfig{SuccessType: tt.successType}
			if got := evalOutcome(cfg, tt.roll, tt.threshold); got != tt.want {
				t.Errorf("evalOutcome(%q, %d, %d) = %q, want %q",
					tt.successType, tt.roll, tt.threshold, got, tt.want)
			}
		})
	}
}

func TestSkillValue(t *testing.T) {
	stats := &Stats{Skills: map[string]AttrValue{"atk": {Current: 10}}}
	if got := skillValue(stats, "atk"); got != 10 {
		t.Errorf("skillValue(atk) = %d, want 10", got)
	}
	if got := skillValue(stats, "missing"); got != 0 {
		t.Errorf("skillValue(missing) = %d, want 0", got)
	}
}

func TestEvalDicePool(t *testing.T) {
	t.Run("rolls count dice and sums", func(t *testing.T) {
		n := 0
		total, parts := evalDicePool(3, func() int { n++; return n })
		if total != 6 || !reflect.DeepEqual(parts, []string{"1", "2", "3"}) {
			t.Errorf("got total=%d parts=%v, want 6/[1 2 3]", total, parts)
		}
	})
	t.Run("count below 1 is clamped to 1", func(t *testing.T) {
		total, parts := evalDicePool(0, func() int { return 5 })
		if total != 5 || len(parts) != 1 {
			t.Errorf("got total=%d parts=%v, want 5/one element", total, parts)
		}
	})
}

func TestEvalDicePoolInts(t *testing.T) {
	n := 0
	rolls := evalDicePoolInts(2, func() int { n++; return n * 2 })
	if !reflect.DeepEqual(rolls, []int{2, 4}) {
		t.Errorf("evalDicePoolInts = %v, want [2 4]", rolls)
	}
	if got := evalDicePoolInts(-1, func() int { return 9 }); len(got) != 1 {
		t.Errorf("clamped pool len = %d, want 1", len(got))
	}
}

func TestFindLeafLabel(t *testing.T) {
	tree := &models.SkillTreeNode{
		Key: "a", Label: "A",
		Children: []models.SkillTreeNode{
			{Key: "b", Label: "B-Label"},
		},
	}
	if label, ok := findLeafLabel(tree, "a.b", ""); !ok || label != "B-Label" {
		t.Errorf("findLeafLabel(a.b) = %q/%v, want B-Label/true", label, ok)
	}
	if _, ok := findLeafLabel(tree, "a.missing", ""); ok {
		t.Error("findLeafLabel(a.missing) ok = true, want false")
	}
}

func TestResolveSkillLabel(t *testing.T) {
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{Key: "atk", Label: "Attack"}},
		}},
	}
	if got := resolveSkillLabel(template, "atk"); got != "Attack" {
		t.Errorf("resolveSkillLabel(atk) = %q, want Attack", got)
	}
	// Fallback to the key when not found.
	if got := resolveSkillLabel(template, "unknown"); got != "unknown" {
		t.Errorf("resolveSkillLabel(unknown) = %q, want unknown", got)
	}
}

// ---------------------------------------------------------------------------
// evalFormula — the formula interpreter
// ---------------------------------------------------------------------------

func TestEvalFormula_SingleDie(t *testing.T) {
	p := newTestPlugin(3) // d6 -> 4
	res, diceType, label, val, err := p.evalFormula([]models.FormulaBlock{diceBlock("d6")}, sampleStats(), "", "")
	if err != nil {
		t.Fatalf("evalFormula() error: %v", err)
	}
	if res != 4 || diceType != 6 || label != "d6" || val != "4" {
		t.Errorf("got res=%d dice=%d label=%q val=%q, want 4/6/d6/4", res, diceType, label, val)
	}
}

func TestEvalFormula_DiePlusConst(t *testing.T) {
	p := newTestPlugin(3) // d6 -> 4
	blocks := []models.FormulaBlock{diceBlock("d6"), opBlock("+"), numBlock(2)}
	res, _, label, val, err := p.evalFormula(blocks, sampleStats(), "", "")
	if err != nil {
		t.Fatalf("evalFormula() error: %v", err)
	}
	if res != 6 || label != "d6+2" || val != "4+2" {
		t.Errorf("got res=%d label=%q val=%q, want 6/d6+2/4+2", res, label, val)
	}
}

func TestEvalFormula_DicePool(t *testing.T) {
	// "2 d d6": const 2 becomes the count; pool rolls two d6.
	p := newTestPlugin(3, 5) // 4, 6
	blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), diceBlock("d6")}
	res, diceType, label, val, err := p.evalFormula(blocks, sampleStats(), "", "")
	if err != nil {
		t.Fatalf("evalFormula() error: %v", err)
	}
	if res != 10 || diceType != 6 || label != "2d6" || val != "4+6" {
		t.Errorf("got res=%d dice=%d label=%q val=%q, want 10/6/2d6/4+6", res, diceType, label, val)
	}
}

func TestEvalFormula_Operators(t *testing.T) {
	tests := []struct {
		name string
		op   string
		want int // 6 <op> 2
	}{
		{"subtraction", "-", 4},
		{"multiplication", "*", 12},
		{"division", "/", 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := newTestPlugin() // no dice -> no rng needed
			blocks := []models.FormulaBlock{numBlock(6), opBlock(tt.op), numBlock(2)}
			res, _, _, _, err := p.evalFormula(blocks, sampleStats(), "", "")
			if err != nil {
				t.Fatalf("evalFormula() error: %v", err)
			}
			if res != tt.want {
				t.Errorf("6 %s 2 = %d, want %d", tt.op, res, tt.want)
			}
		})
	}
}

func TestEvalFormula_Errors(t *testing.T) {
	p := newTestPlugin()

	t.Run("empty formula", func(t *testing.T) {
		if _, _, _, _, err := p.evalFormula(nil, sampleStats(), "", ""); err == nil {
			t.Error("expected error for empty formula, got nil")
		}
	})

	t.Run("division by zero", func(t *testing.T) {
		blocks := []models.FormulaBlock{numBlock(6), opBlock("/"), numBlock(0)}
		if _, _, _, _, err := p.evalFormula(blocks, sampleStats(), "", ""); err == nil {
			t.Error("expected division-by-zero error, got nil")
		}
	})
}

func TestEvalFormula_AttributeAndSkillBlocks(t *testing.T) {
	stats := sampleStats() // str=8, atk skill=10, dex=5
	p := newTestPlugin()

	t.Run("attr block reads attribute value", func(t *testing.T) {
		blocks := []models.FormulaBlock{{Type: "attr", Key: "str", Label: "STR"}}
		res, _, label, _, _ := p.evalFormula(blocks, stats, "", "")
		if res != 8 || label != "STR" {
			t.Errorf("got res=%d label=%q, want 8/STR", res, label)
		}
	})

	t.Run("skill block reads skill value", func(t *testing.T) {
		blocks := []models.FormulaBlock{{Type: "skill"}}
		res, _, _, _, _ := p.evalFormula(blocks, stats, "atk", "")
		if res != 10 {
			t.Errorf("skill block res = %d, want 10", res)
		}
	})

	t.Run("attr_linked reads the linked attribute", func(t *testing.T) {
		blocks := []models.FormulaBlock{{Type: "attr_linked"}}
		res, _, label, _, _ := p.evalFormula(blocks, stats, "", "dex")
		if res != 5 || label != "dex" {
			t.Errorf("got res=%d label=%q, want 5/dex", res, label)
		}
	})
}

func TestEvalFormula_DiceAttr(t *testing.T) {
	// dice_attr: die face count equals the attribute value (str=8).
	stats := sampleStats()
	p := newTestPlugin(6) // Intn(8)=6 -> 7
	blocks := []models.FormulaBlock{{Type: "dice_attr", Key: "str", Label: "STR"}}
	res, diceType, _, _, err := p.evalFormula(blocks, stats, "", "")
	if err != nil {
		t.Fatalf("evalFormula() error: %v", err)
	}
	if res != 7 || diceType != 8 {
		t.Errorf("got res=%d dice=%d, want 7/8", res, diceType)
	}
}

// ---------------------------------------------------------------------------
// rollFromFormula (traditional mode)
// ---------------------------------------------------------------------------

func TestRollFromFormula_ThresholdAndOutcome(t *testing.T) {
	stats := sampleStats() // atk skill = 10
	template := &models.SystemTemplate{}
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d6")},
		SuccessType: "above_threshold",
	}
	p := newTestPlugin(5) // d6 -> 6
	res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	// Threshold empty -> falls back to skill value 10.
	if res.Target != 10 {
		t.Errorf("Target = %d, want 10 (skill fallback)", res.Target)
	}
	if res.Roll != 6 {
		t.Errorf("Roll = %d, want 6", res.Roll)
	}
	if res.Outcome != "failure" { // 6 < 10
		t.Errorf("Outcome = %q, want failure", res.Outcome)
	}
}

func TestRollFromFormula_ModifierInBreakdown(t *testing.T) {
	stats := sampleStats()
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d6")},
		SuccessType: "above_threshold",
	}
	p := newTestPlugin(5) // d6 -> 6
	res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, 3)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	if res.Roll != 9 { // 6 + modifier 3
		t.Errorf("Roll = %d, want 9", res.Roll)
	}
	if res.FormulaBreakdown != "d6+3 = 6+3 = 9" {
		t.Errorf("FormulaBreakdown = %q, want %q", res.FormulaBreakdown, "d6+3 = 6+3 = 9")
	}
}

// ---------------------------------------------------------------------------
// Dice-pool mode
// ---------------------------------------------------------------------------

func TestRollFromFormula_DicePool(t *testing.T) {
	stats := sampleStats()
	baseCfg := func(threshold int, cond string) *models.RollConfig {
		return &models.RollConfig{
			RollMode:             "dice_pool",
			Formula:              []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6")},
			PoolSuccessThreshold: threshold,
			PoolSuccessCondition: cond,
		}
	}

	t.Run("gte counts every die at or above threshold", func(t *testing.T) {
		// three d6 -> 4, 6, 2; threshold 4 gte -> 4 and 6 succeed = 2.
		p := newTestPlugin(3, 5, 1)
		res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", baseCfg(4, "gte"), 0)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if res.PoolSuccesses != 2 || res.Roll != 2 {
			t.Errorf("got successes=%d roll=%d, want 2/2", res.PoolSuccesses, res.Roll)
		}
		if !reflect.DeepEqual(res.PoolRolls, []int{4, 6, 2}) {
			t.Errorf("PoolRolls = %v, want [4 6 2]", res.PoolRolls)
		}
		if res.Outcome != "regular_success" {
			t.Errorf("Outcome = %q, want regular_success", res.Outcome)
		}
	})

	t.Run("eq counts only exact matches", func(t *testing.T) {
		// three d6 -> 4, 6, 6; threshold 6 eq -> two exact 6s.
		p := newTestPlugin(3, 5, 5)
		res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", baseCfg(6, "eq"), 0)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if res.PoolSuccesses != 2 || res.PoolSuccessCondition != "eq" {
			t.Errorf("got successes=%d cond=%q, want 2/eq", res.PoolSuccesses, res.PoolSuccessCondition)
		}
	})

	t.Run("zero successes is a failure", func(t *testing.T) {
		// three d6 -> 1, 2, 3; threshold 5 gte -> none.
		p := newTestPlugin(0, 1, 2)
		res, _ := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", baseCfg(5, "gte"), 0)
		if res.PoolSuccesses != 0 || res.Outcome != "failure" {
			t.Errorf("got successes=%d outcome=%q, want 0/failure", res.PoolSuccesses, res.Outcome)
		}
	})
}

// ---------------------------------------------------------------------------
// Legacy formula types
// ---------------------------------------------------------------------------

func TestRollAttrPlusSkill(t *testing.T) {
	stats := &Stats{
		Attributes: map[string]AttrValue{"str": {Current: 5}},
		Skills:     map[string]AttrValue{"atk": {Current: 10}},
	}
	cfg := &models.RollConfig{SuccessType: "above_threshold"}
	// diceSize = attr 5 + skill 10 = 15; Intn(15)=7 -> roll 8.
	p := newTestPlugin(7)
	res, err := p.rollAttrPlusSkill(stats, &models.SystemTemplate{}, "atk", "str", cfg, 0)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if res.DiceType != 15 || res.Roll != 8 {
		t.Errorf("got DiceType=%d Roll=%d, want 15/8", res.DiceType, res.Roll)
	}
	if res.Target != 10 { // threshold falls back to skill value
		t.Errorf("Target = %d, want 10", res.Target)
	}
}

func TestRollFixedD100(t *testing.T) {
	stats := &Stats{
		Attributes: map[string]AttrValue{"str": {Current: 30}},
		Skills:     map[string]AttrValue{"atk": {Current: 25}},
	}
	cfg := &models.RollConfig{SuccessType: "below_threshold"}
	// threshold = attr 30 + skill 25 = 55; +modifier 5 -> target 60. Intn(100)=39 -> roll 40.
	p := newTestPlugin(39)
	res, _ := p.rollFixedD100(stats, &models.SystemTemplate{}, "atk", "str", cfg, 5)
	if res.DiceType != 100 || res.Roll != 40 || res.Target != 60 {
		t.Errorf("got DiceType=%d Roll=%d Target=%d, want 100/40/60", res.DiceType, res.Roll, res.Target)
	}
	if res.Outcome != "regular_success" { // 40 <= 60
		t.Errorf("Outcome = %q, want regular_success", res.Outcome)
	}
}

func TestRollFixedD20(t *testing.T) {
	stats := &Stats{
		Attributes: map[string]AttrValue{"str": {Current: 14}},
		Skills:     map[string]AttrValue{"atk": {Current: 3}},
	}
	cfg := &models.RollConfig{SuccessType: "above_threshold"}
	// bonus = attrModifier(14)=2 + skill 3 + modifier 2 = 7; Intn(20)=9 -> roll 10; final 17.
	p := newTestPlugin(9)
	res, _ := p.rollFixedD20(stats, &models.SystemTemplate{}, "atk", "str", cfg, 2)
	if res.D20Roll != 10 || res.BonusTotal != 7 || res.Roll != 17 {
		t.Errorf("got D20=%d Bonus=%d Roll=%d, want 10/7/17", res.D20Roll, res.BonusTotal, res.Roll)
	}
}

// ---------------------------------------------------------------------------
// RollWithTemplate dispatch
// ---------------------------------------------------------------------------

func TestRollWithTemplate(t *testing.T) {
	cfg := &models.RollConfig{FormulaType: "fixed_d20_plus_mod", LinkedAttr: "agility", SuccessType: "above_threshold"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Key: "stealth", Type: "number", Label: "Stealth", Rollable: true, RollConfig: cfg,
			}},
		}},
	}
	stats := Stats{
		Attributes: map[string]AttrValue{"agility": {Current: 14}},
		Skills:     map[string]AttrValue{"stealth": {Current: 3}},
	}
	raw, err := bson.Marshal(stats)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	t.Run("dispatches to fixed_d20 formula type", func(t *testing.T) {
		p := newTestPlugin(9) // d20 -> 10
		res, err := p.RollWithTemplate(raw, template, "stealth", 2)
		if err != nil {
			t.Fatalf("RollWithTemplate() error: %v", err)
		}
		// bonus = attrModifier(14)=2 + skill 3 + modifier 2 = 7; final = 10 + 7 = 17.
		if res.Roll != 17 || res.SkillName != "Stealth" {
			t.Errorf("got Roll=%d SkillName=%q, want 17/Stealth", res.Roll, res.SkillName)
		}
	})

	t.Run("unknown skill key errors", func(t *testing.T) {
		p := newTestPlugin(9)
		if _, err := p.RollWithTemplate(raw, template, "nonexistent", 0); err == nil {
			t.Error("expected error for unknown skill key, got nil")
		}
	})
}

// ---------------------------------------------------------------------------
// Plugin interface methods
// ---------------------------------------------------------------------------

func TestGenericRollMethodsReturnError(t *testing.T) {
	p := New()
	if _, err := p.RollSkill(bson.Raw{}, "x", 0, 0, 0); err == nil {
		t.Error("RollSkill should return an error directing to RollWithTemplate")
	}
	if _, err := p.RollWeapon(bson.Raw{}, "x", "y", "z", 0, 0); err == nil {
		t.Error("RollWeapon should return an error")
	}
}

func TestDefaultStats(t *testing.T) {
	p := New()
	raw, err := p.DefaultStats()
	if err != nil {
		t.Fatalf("DefaultStats() error: %v", err)
	}
	s, err := decodeStats(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if s.Attributes == nil || s.Skills == nil {
		t.Error("expected Attributes and Skills non-nil maps")
	}
}

func TestComputeDerived_CurrentIsBasePlusAdvances(t *testing.T) {
	p := New()
	stats := Stats{
		Attributes: map[string]AttrValue{
			"str": {Base: 3, Advances: 2},
			"dex": {Base: 4, Advances: 0},
		},
	}
	raw, _ := bson.Marshal(stats)
	out, err := p.ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)
	if got.Attributes["str"].Current != 5 {
		t.Errorf("str current = %d, want 5 (3+2)", got.Attributes["str"].Current)
	}
	if got.Attributes["dex"].Current != 4 {
		t.Errorf("dex current = %d, want 4", got.Attributes["dex"].Current)
	}
}

func TestDisplayName_NotEmbedded(t *testing.T) {
	p := New()
	if got := p.GetDisplayName(bson.Raw{1, 2, 3}); got != "" {
		t.Errorf("GetDisplayName() = %q, want empty", got)
	}
	in := bson.Raw{4, 5, 6}
	out, err := p.SetDisplayName(in, "Anything")
	if err != nil {
		t.Fatalf("SetDisplayName() error: %v", err)
	}
	if !reflect.DeepEqual(out, in) {
		t.Errorf("SetDisplayName returned %v, want unchanged %v", out, in)
	}
}

// ---------------------------------------------------------------------------
// evalFormula — remaining block-type branches
// ---------------------------------------------------------------------------

func TestEvalFormula_DiceSkillAttr(t *testing.T) {
	stats := sampleStats() // str=8, atk skill=10

	t.Run("single die sized by attribute + skill", func(t *testing.T) {
		// sides = attr(str 8) + skill(atk 10) = 18; Intn(18)=7 -> 8.
		p := newTestPlugin(7)
		blocks := []models.FormulaBlock{{Type: "dice_skill_attr"}}
		res, diceType, _, _, err := p.evalFormula(blocks, stats, "atk", "str")
		if err != nil {
			t.Fatalf("evalFormula() error: %v", err)
		}
		if res != 8 || diceType != 18 {
			t.Errorf("got res=%d dice=%d, want 8/18", res, diceType)
		}
	})

	t.Run("pool of attr+skill dice", func(t *testing.T) {
		// count 2, sides 18: two dice 8 and 10 -> total 18.
		p := newTestPlugin(7, 9)
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_skill_attr"}}
		res, _, _, val, err := p.evalFormula(blocks, stats, "atk", "str")
		if err != nil {
			t.Fatalf("evalFormula() error: %v", err)
		}
		if res != 18 || val != "8+10" {
			t.Errorf("got res=%d val=%q, want 18/8+10", res, val)
		}
	})
}

func TestEvalFormula_DiceAttrPool(t *testing.T) {
	stats := sampleStats() // str=8
	// count 2, sides=str(8): two d8 -> 4 and 6 = 10.
	p := newTestPlugin(3, 5)
	blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_attr", Key: "str", Label: "STR"}}
	res, diceType, _, val, err := p.evalFormula(blocks, stats, "", "")
	if err != nil {
		t.Fatalf("evalFormula() error: %v", err)
	}
	if res != 10 || diceType != 8 || val != "4+6" {
		t.Errorf("got res=%d dice=%d val=%q, want 10/8/4+6", res, diceType, val)
	}
}

func TestEvalFormula_AttrLinkedEmpty(t *testing.T) {
	// With no linked attribute, attr_linked contributes 0 and labels as "0".
	p := newTestPlugin()
	blocks := []models.FormulaBlock{{Type: "attr_linked"}}
	res, _, label, _, _ := p.evalFormula(blocks, sampleStats(), "", "")
	if res != 0 || label != "0" {
		t.Errorf("got res=%d label=%q, want 0/0", res, label)
	}
}

// ---------------------------------------------------------------------------
// evalFormulaDicePool — block-type branches in pool mode
// ---------------------------------------------------------------------------

func TestEvalFormulaDicePool_BlockTypes(t *testing.T) {
	stats := sampleStats() // str=8, atk=10

	t.Run("single dice_attr collects one roll", func(t *testing.T) {
		p := newTestPlugin(3) // d8 -> 4
		rolls, diceType, _, err := p.evalFormulaDicePool([]models.FormulaBlock{{Type: "dice_attr", Key: "str"}}, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if !reflect.DeepEqual(rolls, []int{4}) || diceType != 8 {
			t.Errorf("got rolls=%v dice=%d, want [4]/8", rolls, diceType)
		}
	})

	t.Run("dice_attr pool collects all rolls", func(t *testing.T) {
		p := newTestPlugin(3, 5) // 4, 6
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_attr", Key: "str"}}
		rolls, _, _, _ := p.evalFormulaDicePool(blocks, stats, "", "")
		if !reflect.DeepEqual(rolls, []int{4, 6}) {
			t.Errorf("rolls = %v, want [4 6]", rolls)
		}
	})

	t.Run("dice_skill_attr pool", func(t *testing.T) {
		p := newTestPlugin(7, 9) // sides 18 -> 8, 10
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_skill_attr"}}
		rolls, _, _, _ := p.evalFormulaDicePool(blocks, stats, "atk", "str")
		if !reflect.DeepEqual(rolls, []int{8, 10}) {
			t.Errorf("rolls = %v, want [8 10]", rolls)
		}
	})

	t.Run("non-dice blocks contribute no rolls", func(t *testing.T) {
		// attr/skill/const/attr_linked/op only affect die-count segments.
		p := newTestPlugin()
		blocks := []models.FormulaBlock{
			{Type: "attr", Key: "str", Label: "STR"},
			opBlock("+"),
			{Type: "skill"},
			{Type: "attr_linked"},
			numBlock(2),
		}
		rolls, _, _, err := p.evalFormulaDicePool(blocks, stats, "atk", "dex")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if len(rolls) != 0 {
			t.Errorf("rolls = %v, want empty (no dice blocks)", rolls)
		}
	})

	t.Run("empty formula errors", func(t *testing.T) {
		p := newTestPlugin()
		if _, _, _, err := p.evalFormulaDicePool(nil, stats, "", ""); err == nil {
			t.Error("expected error for empty pool formula, got nil")
		}
	})
}

// ---------------------------------------------------------------------------
// resolveRollConfig — skill_tree and skill_table resolution
// ---------------------------------------------------------------------------

func TestResolveRollConfig_SkillTree(t *testing.T) {
	cfg := &models.RollConfig{FormulaType: "fixed_d100", SuccessType: "below_threshold"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_tree", Key: "weapons", Rollable: true, RollConfig: cfg,
				Tree: &models.SkillTreeNode{
					Key: "root",
					Children: []models.SkillTreeNode{
						{Key: "melee", Label: "Melee", LinkedAttr: "str", Rollable: true},
					},
				},
			}},
		}},
	}

	gotCfg, linkedAttr, fieldType, err := resolveRollConfig(template, &Stats{}, "weapons.melee")
	if err != nil {
		t.Fatalf("resolveRollConfig() error: %v", err)
	}
	if gotCfg != cfg || linkedAttr != "str" || fieldType != "skill_tree" {
		t.Errorf("got cfg=%v attr=%q type=%q, want field cfg/str/skill_tree", gotCfg, linkedAttr, fieldType)
	}
}

func TestResolveRollConfig_SkillTableAssignsAttr(t *testing.T) {
	cfg := &models.RollConfig{FormulaType: "fixed_d20_plus_mod", LinkedAttr: "dex"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_table", Key: "spells", Rollable: true, RollConfig: cfg,
				AssignAttrToSkill: true,
				Options: []models.FlexOption{
					{Label: "Fire Bolt", Attr: "int"},
				},
			}},
		}},
	}

	// AssignAttrToSkill maps the matching option's Attr over the field default.
	_, linkedAttr, fieldType, err := resolveRollConfig(template, &Stats{}, "spells.fire_bolt")
	if err != nil {
		t.Fatalf("resolveRollConfig() error: %v", err)
	}
	if linkedAttr != "int" || fieldType != "skill_table" {
		t.Errorf("got attr=%q type=%q, want int/skill_table", linkedAttr, fieldType)
	}
}

func TestResolveSkillLabel_SkillTree(t *testing.T) {
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_tree", Key: "weapons",
				Tree: &models.SkillTreeNode{
					Key: "weapons",
					Children: []models.SkillTreeNode{
						{Key: "sword", Label: "Sword"},
					},
				},
			}},
		}},
	}
	if got := resolveSkillLabel(template, "weapons.sword"); got != "Sword" {
		t.Errorf("resolveSkillLabel(weapons.sword) = %q, want Sword", got)
	}
}

// ---------------------------------------------------------------------------
// RollWithTemplate — formula path and attr field type
// ---------------------------------------------------------------------------

func TestRollWithTemplate_FormulaPath(t *testing.T) {
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d6")},
		SuccessType: "above_threshold",
		LinkedAttr:  "str",
	}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Key: "atk", Type: "number", Label: "Attack", Rollable: true, RollConfig: cfg,
			}},
		}},
	}
	stats := Stats{
		Attributes: map[string]AttrValue{"str": {Current: 8}},
		Skills:     map[string]AttrValue{"atk": {Current: 4}},
	}
	raw, _ := bson.Marshal(stats)

	p := newTestPlugin(5) // d6 -> 6
	res, err := p.RollWithTemplate(raw, template, "atk", 0)
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	if res.Roll != 6 || res.FormulaBreakdown == "" {
		t.Errorf("got Roll=%d breakdown=%q, want 6/non-empty", res.Roll, res.FormulaBreakdown)
	}
}

func TestRollWithTemplate_AttrFieldUsesKeyAsLinkedAttr(t *testing.T) {
	// For an "attr" field the linked attribute is the skillKey itself.
	cfg := &models.RollConfig{FormulaType: "fixed_d20_plus_mod", SuccessType: "above_threshold"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Key: "str", Type: "attr", Label: "Strength", Rollable: true, RollConfig: cfg,
			}},
		}},
	}
	stats := Stats{Attributes: map[string]AttrValue{"str": {Current: 14}}}
	raw, _ := bson.Marshal(stats)

	p := newTestPlugin(9) // d20 -> 10
	res, err := p.RollWithTemplate(raw, template, "str", 0)
	if err != nil {
		t.Fatalf("RollWithTemplate() error: %v", err)
	}
	// bonus = attrModifier(14)=2 + skill(str as skill key, absent ->0) + 0 = 2; final = 12.
	if res.Roll != 12 {
		t.Errorf("Roll = %d, want 12 (d20 10 + attrMod 2)", res.Roll)
	}
}

func TestRollWithTemplate_UnknownFormulaType(t *testing.T) {
	cfg := &models.RollConfig{FormulaType: "made_up_type"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Key: "x", Type: "number", Rollable: true, RollConfig: cfg,
			}},
		}},
	}
	raw, _ := bson.Marshal(Stats{})
	p := newTestPlugin()
	if _, err := p.RollWithTemplate(raw, template, "x", 0); err == nil {
		t.Error("expected error for unknown formulaType, got nil")
	}
}
