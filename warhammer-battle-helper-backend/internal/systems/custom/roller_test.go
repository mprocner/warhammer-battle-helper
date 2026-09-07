package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"fmt"
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
		// Base (not Current) is the source of truth for skillValue since FEATURE-162: it
		// sums Base+Advances rather than trusting a possibly-stale Current. Base: 10,
		// Advances: 0 gives the same effective value as the old Current: 10 fixture.
		Skills: map[string]AttrValue{"atk": {Base: 10}},
	}
}

// poolRolls flattens a pool formula back to the individual dice results, in roll order.
func poolRolls(parts []gsys.PoolFormulaPart) []int {
	var out []int
	for _, p := range parts {
		out = append(out, p.Rolls...)
	}
	return out
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
		hasThreshold    bool
		want            string
	}{
		{"raw shows numeric roll", "raw", 7, 50, true, "7"},
		// FEATURE-162 finding 1: threshold == 0 used to mean "nothing configured" and
		// forced a raw roll. Since a threshold can now be a real, computed 0 (a fully
		// cancelled skill or attribute), the caller signals "no threshold was determined"
		// with hasThreshold instead of inferring it from the value.
		{"no threshold determined shows numeric roll (genuinely nothing configured)", "above_threshold", 7, 0, false, "7"},
		{"a real threshold of zero still yields a verdict", "above_threshold", 6, 0, true, "regular_success"},
		{"a real threshold of zero fails under below_threshold", "below_threshold", 6, 0, true, "failure"},
		{"above threshold success", "above_threshold", 50, 40, true, "regular_success"},
		{"above threshold failure", "above_threshold", 30, 40, true, "failure"},
		{"below threshold success", "below_threshold", 30, 40, true, "regular_success"},
		{"below threshold failure", "below_threshold", 50, 40, true, "failure"},
		{"default behaves as above", "", 50, 40, true, "regular_success"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &models.RollConfig{SuccessType: tt.successType}
			if got := evalOutcome(cfg, tt.roll, tt.threshold, tt.hasThreshold); got != tt.want {
				t.Errorf("evalOutcome(%q, %d, %d, hasThreshold=%v) = %q, want %q",
					tt.successType, tt.roll, tt.threshold, tt.hasThreshold, got, tt.want)
			}
		})
	}
}

func TestSkillValue(t *testing.T) {
	// FEATURE-162: skillValue sums Base+Advances directly. It no longer trusts Current
	// (which used to be consulted first, falling back to Base only when Current == 0) —
	// that fallback made a permanent penalty that cancels the base (30 + (-30) = 0)
	// indistinguishable from "not computed yet", so the roll silently used the
	// unpenalised base instead of the real 0.
	tests := []struct {
		name string
		v    AttrValue
		want int
	}{
		{"base plus positive advances", AttrValue{Base: 20, Advances: 5}, 25},
		{"advances cancel the base entirely", AttrValue{Base: 30, Advances: -30}, 0},
		{"advances partially offset the base", AttrValue{Base: 30, Advances: -10}, 20},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stats := &Stats{Skills: map[string]AttrValue{"atk": tt.v}}
			if got := skillValue(stats, "atk"); got != tt.want {
				t.Errorf("skillValue() = %d, want %d", got, tt.want)
			}
		})
	}
	if got := skillValue(&Stats{Skills: map[string]AttrValue{}}, "missing"); got != 0 {
		t.Errorf("skillValue(missing) = %d, want 0", got)
	}
}

func TestSkillHasValue(t *testing.T) {
	// skillHasValue distinguishes "no data for this skill" (fall back to the linked
	// attribute) from "a total that really is zero" (base cancelled by advances — use it).
	// A present-but-all-zero entry (the shape the frontend creates for a freshly added
	// skill_tree node, addCustomSkillNode) must still read as "no data".
	tests := []struct {
		name string
		v    AttrValue
		want bool
	}{
		{"all zero fields reads as absent", AttrValue{}, false},
		{"nonzero base has a value", AttrValue{Base: 30}, true},
		{"nonzero advances alone has a value", AttrValue{Advances: -5}, true},
		{"base cancelled by advances still has a value", AttrValue{Base: 30, Advances: -30}, true},
		// FEATURE-162 fix wave 3, finding 2: skillHasValue deliberately does not consult
		// Current (see the function's doc comment) — base+advances is the whole truth about
		// a skill's value, and a Current that disagrees can only be stale. Without the
		// `|| v.Current != 0` term ever being dropped, this case would wrongly read "has
		// value" from a stale Current alone.
		{"a stale Current alone is not data", AttrValue{Current: 45}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stats := &Stats{Skills: map[string]AttrValue{"atk": tt.v}}
			if got := skillHasValue(stats, "atk"); got != tt.want {
				t.Errorf("skillHasValue() = %v, want %v", got, tt.want)
			}
		})
	}
	if got := skillHasValue(&Stats{Skills: map[string]AttrValue{}}, "missing"); got != false {
		t.Error("skillHasValue(missing) = true, want false")
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
	if got := resolveSkillLabel(template, nil, "atk"); got != "Attack" {
		t.Errorf("resolveSkillLabel(atk) = %q, want Attack", got)
	}
	// Fallback to the key when not found.
	if got := resolveSkillLabel(template, nil, "unknown"); got != "unknown" {
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

// TestRollFromFormula_NegativeAdvancesThreshold covers Finding 2: an empty threshold
// falls back to the skill value only when the skill has data at all, and the fallback
// to the linked attribute fires only for a genuinely absent (or present-but-blank)
// skill — never because the real total happens to be 0 or negative.
func TestRollFromFormula_NegativeAdvancesThreshold(t *testing.T) {
	template := &models.SystemTemplate{}
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d6")},
		SuccessType: "above_threshold",
	}

	t.Run("base 30 advances -30 -> target 0, not the base and not the attribute", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{"atk": {Base: 30, Advances: -30}},
		}
		p := newTestPlugin(5) // d6 -> 6
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0 (the real, cancelled-out skill total)", res.Target)
		}
	})

	t.Run("base 30 advances -10 -> target 20", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{"atk": {Base: 30, Advances: -10}},
		}
		p := newTestPlugin(5)
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 20 {
			t.Errorf("Target = %d, want 20", res.Target)
		}
	})

	t.Run("skill absent from the map -> falls back to the linked attribute", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{},
		}
		p := newTestPlugin(5)
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 40 {
			t.Errorf("Target = %d, want 40 (attribute fallback)", res.Target)
		}
	})

	t.Run("skill present but all-zero -> still falls back to the linked attribute", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{"atk": {}},
		}
		p := newTestPlugin(5)
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 40 {
			t.Errorf("Target = %d, want 40 (attribute fallback — a blank skill entry, not a real zero)", res.Target)
		}
	})

	// Finding 6: Current is never trusted, even when it disagrees with Base+Advances.
	t.Run("Current disagreeing with Base+Advances is ignored", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{"atk": {Base: 30, Advances: -30, Current: 99}},
		}
		p := newTestPlugin(5)
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0 (Base+Advances, ignoring the stale Current=99)", res.Target)
		}
	})
}

// TestRollFromFormula_CancelledThresholdProducesRealVerdict covers Finding 1: a threshold
// that computes to exactly 0 (a fully cancelled skill or attribute) used to fall through
// evalOutcome's `threshold == 0` sentinel and print the raw roll number instead of a verdict.
func TestRollFromFormula_CancelledThresholdProducesRealVerdict(t *testing.T) {
	template := &models.SystemTemplate{}

	t.Run("skill fully cancelled, below_threshold -> a real failure verdict, not the raw roll", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{"atk": {Base: 30, Advances: -30}},
		}
		cfg := &models.RollConfig{
			Formula:     []models.FormulaBlock{diceBlock("d6")},
			SuccessType: "below_threshold",
		}
		p := newTestPlugin(5) // d6 -> 6
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0", res.Target)
		}
		if res.Outcome != "failure" { // 6 is never <= 0
			t.Errorf("Outcome = %q, want failure (a real verdict, not the raw roll %q)", res.Outcome, "6")
		}
	})

	t.Run("skill fully cancelled, above_threshold -> a real success verdict the frontend's OUTCOME_MAP knows", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 40}},
			Skills:     map[string]AttrValue{"atk": {Base: 30, Advances: -30}},
		}
		cfg := &models.RollConfig{
			Formula:     []models.FormulaBlock{diceBlock("d6")},
			SuccessType: "above_threshold",
		}
		p := newTestPlugin(5) // d6 -> 6
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		// above_threshold: any roll beats a target of 0 -> automatic success (Finding 8).
		if res.Outcome != "regular_success" {
			t.Errorf("Outcome = %q, want regular_success", res.Outcome)
		}
	})

	t.Run("attribute-driven threshold cancelled to zero -> a real verdict", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Base: 20, Advances: -20, Current: 0}},
			Skills:     map[string]AttrValue{},
		}
		cfg := &models.RollConfig{
			Formula:     []models.FormulaBlock{diceBlock("d6")},
			SuccessType: "above_threshold",
		}
		p := newTestPlugin(5) // d6 -> 6
		res, err := p.rollFromFormula(stats, template, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0 (the real, cancelled-out attribute total)", res.Target)
		}
		if res.Outcome != "regular_success" {
			t.Errorf("Outcome = %q, want regular_success (a real verdict, not the raw roll)", res.Outcome)
		}
	})

	t.Run("genuinely nothing configured -> raw roll behaviour is unchanged", func(t *testing.T) {
		// No cfg.Threshold, no skill data, and no linked attribute at all — the case the
		// old threshold==0 sentinel existed to serve. It must keep working.
		stats := &Stats{
			Attributes: map[string]AttrValue{},
			Skills:     map[string]AttrValue{},
		}
		cfg := &models.RollConfig{
			Formula:     []models.FormulaBlock{diceBlock("d6")},
			SuccessType: "above_threshold",
		}
		p := newTestPlugin(5) // d6 -> 6
		res, err := p.rollFromFormula(stats, template, "", "", cfg, 0)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Outcome != "6" {
			t.Errorf("Outcome = %q, want the raw roll %q", res.Outcome, "6")
		}
	})
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
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2}) {
			t.Errorf("pool rolls = %v, want [4 6 2]", got)
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

func TestRollFromFormula_DicePoolFormulaParts(t *testing.T) {
	stats := sampleStats()
	cfg := &models.RollConfig{
		RollMode: "dice_pool",
		Formula: []models.FormulaBlock{
			diceBlock("d6"), opBlock("+"), diceBlock("d10"), opBlock("+"), diceBlock("d10"),
		},
		PoolSuccessThreshold: 5,
	}
	// d6 -> 4, d10 -> 7, d10 -> 2
	p := newTestPlugin(3, 6, 1)
	res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, 0)
	if err != nil {
		t.Fatalf("rollFromFormula() error: %v", err)
	}
	want := []gsys.PoolFormulaPart{
		{Kind: "dice", Sides: 6, Rolls: []int{4}},
		{Kind: "text", Text: "+"},
		{Kind: "dice", Sides: 10, Rolls: []int{7}},
		{Kind: "text", Text: "+"},
		{Kind: "dice", Sides: 10, Rolls: []int{2}},
	}
	if !reflect.DeepEqual(res.PoolFormula, want) {
		t.Errorf("PoolFormula = %+v, want %+v", res.PoolFormula, want)
	}
	if res.FormulaBreakdown != "" {
		t.Errorf("FormulaBreakdown = %q, want empty (pool mode uses PoolFormula)", res.FormulaBreakdown)
	}
}

// ---------------------------------------------------------------------------
// Legacy formula types
// ---------------------------------------------------------------------------

func TestRollAttrPlusSkill(t *testing.T) {
	t.Run("threshold falls back to skill value", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 5}},
			Skills:     map[string]AttrValue{"atk": {Base: 10}},
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
		if res.Outcome != "failure" { // roll 8 < threshold 10, above_threshold fails
			t.Errorf("Outcome = %q, want failure", res.Outcome)
		}
	})

	t.Run("a skill cancelled to zero still yields a verdict, not a raw roll", func(t *testing.T) {
		// FEATURE-162 fix wave 3, finding 3: roller.go:493 sets hasThreshold from
		// skillHasValue, not from `threshold != 0` — a skill present but cancelled out
		// (base 30, advances -30) must still produce a real verdict against threshold 0,
		// not fall through to a raw roll.
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 5}},
			Skills:     map[string]AttrValue{"atk": {Base: 30, Advances: -30}},
		}
		cfg := &models.RollConfig{SuccessType: "above_threshold"}
		// diceSize = attr 5 + skill 0 = 5; Intn(5)=2 -> roll 3.
		p := newTestPlugin(2)
		res, err := p.rollAttrPlusSkill(stats, &models.SystemTemplate{}, "atk", "str", cfg, 0)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0", res.Target)
		}
		if res.Outcome != "regular_success" { // roll 3 >= threshold 0
			t.Errorf("Outcome = %q, want regular_success (a real verdict, not a raw roll)", res.Outcome)
		}
	})
}

func TestRollFixedD100(t *testing.T) {
	t.Run("verdict against a configured attr+skill threshold", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 30}},
			Skills:     map[string]AttrValue{"atk": {Base: 25}},
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
	})

	t.Run("an unconfigured roll with a non-zero modifier is raw, not a verdict against the bare modifier", func(t *testing.T) {
		// FEATURE-162 fix wave 3, finding 4: roller.go:519-524 decides raw-vs-verdict from
		// hasThreshold, evaluated BEFORE modifier is added. Old behaviour decided from
		// `threshold + modifier == 0`, so an unconfigured d100 roll with a non-zero
		// modifier used to produce a verdict against the bare modifier; it must now stay
		// raw, because a modifier alone is not a threshold.
		stats := &Stats{} // no attribute, no skill data at all — hasThreshold stays false
		cfg := &models.RollConfig{SuccessType: "below_threshold"}
		// Intn(100)=24 -> roll 25. threshold = attr 0 + skill 0 = 0; target = 0 + modifier 5 = 5.
		p := newTestPlugin(24)
		res, _ := p.rollFixedD100(stats, &models.SystemTemplate{}, "atk", "str", cfg, 5)
		if res.Target != 5 {
			t.Errorf("Target = %d, want 5 (threshold 0 + modifier 5)", res.Target)
		}
		wantOutcome := fmt.Sprintf("%d", res.Roll)
		if res.Outcome != wantOutcome {
			t.Errorf("Outcome = %q, want %q (raw roll, not a verdict against the modifier)", res.Outcome, wantOutcome)
		}
	})
}

func TestRollFixedD20(t *testing.T) {
	t.Run("threshold falls back to attribute value", func(t *testing.T) {
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 14}},
			Skills:     map[string]AttrValue{"atk": {Base: 3}},
		}
		cfg := &models.RollConfig{SuccessType: "above_threshold"}
		// bonus = attrModifier(14)=2 + skill 3 + modifier 2 = 7; Intn(20)=9 -> roll 10; final 17.
		p := newTestPlugin(9)
		res, _ := p.rollFixedD20(stats, &models.SystemTemplate{}, "atk", "str", cfg, 2)
		if res.D20Roll != 10 || res.BonusTotal != 7 || res.Roll != 17 {
			t.Errorf("got D20=%d Bonus=%d Roll=%d, want 10/7/17", res.D20Roll, res.BonusTotal, res.Roll)
		}
		if res.Outcome != "regular_success" { // final roll 17 >= threshold 14
			t.Errorf("Outcome = %q, want regular_success", res.Outcome)
		}
	})

	t.Run("an attribute cancelled to zero still yields a verdict, not a raw roll", func(t *testing.T) {
		// FEATURE-162 fix wave 3, finding 3: roller.go:553 sets hasThreshold from attrOK,
		// not from `threshold != 0` — an attribute present with Current 0 must still
		// produce a real verdict against threshold 0, not fall through to a raw roll.
		stats := &Stats{
			Attributes: map[string]AttrValue{"str": {Current: 0}},
			Skills:     map[string]AttrValue{"atk": {Base: 3}},
		}
		cfg := &models.RollConfig{SuccessType: "above_threshold"}
		// bonus = attrModifier(0)=-5 + skill 3 + modifier 0 = -2; Intn(20)=9 -> roll 10; final 8.
		p := newTestPlugin(9)
		res, _ := p.rollFixedD20(stats, &models.SystemTemplate{}, "atk", "str", cfg, 0)
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0", res.Target)
		}
		if res.Outcome != "regular_success" { // final roll 8 >= threshold 0
			t.Errorf("Outcome = %q, want regular_success (a real verdict, not a raw roll)", res.Outcome)
		}
	})
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
		Skills:     map[string]AttrValue{"stealth": {Base: 3}},
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
		parts, diceType, err := p.evalFormulaDicePool([]models.FormulaBlock{{Type: "dice_attr", Key: "str"}}, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{4}) || diceType != 8 {
			t.Errorf("got rolls=%v dice=%d, want [4]/8", got, diceType)
		}
	})

	t.Run("dice_attr pool collects all rolls", func(t *testing.T) {
		p := newTestPlugin(3, 5) // 4, 6
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_attr", Key: "str"}}
		parts, _, _ := p.evalFormulaDicePool(blocks, stats, "", "")
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{4, 6}) {
			t.Errorf("rolls = %v, want [4 6]", got)
		}
	})

	t.Run("dice_skill_attr pool", func(t *testing.T) {
		p := newTestPlugin(7, 9) // sides 18 -> 8, 10
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_skill_attr"}}
		parts, _, _ := p.evalFormulaDicePool(blocks, stats, "atk", "str")
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{8, 10}) {
			t.Errorf("rolls = %v, want [8 10]", got)
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
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "atk", "dex")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if got := poolRolls(parts); len(got) != 0 {
			t.Errorf("rolls = %v, want empty (no dice blocks)", got)
		}
	})

	t.Run("empty formula errors", func(t *testing.T) {
		p := newTestPlugin()
		if _, _, err := p.evalFormulaDicePool(nil, stats, "", ""); err == nil {
			t.Error("expected error for empty pool formula, got nil")
		}
	})

	t.Run("count form keeps one term with every roll", func(t *testing.T) {
		p := newTestPlugin(3, 5, 1) // 4, 6, 2
		blocks := []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6")}
		parts, diceType, err := p.evalFormulaDicePool(blocks, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{{Kind: "dice", Sides: 6, CountLabel: "3", Rolls: []int{4, 6, 2}}}
		if !reflect.DeepEqual(parts, want) || diceType != 6 {
			t.Errorf("got parts=%+v dice=%d, want %+v/6", parts, diceType, want)
		}
	})

	t.Run("computed faces keep their source label", func(t *testing.T) {
		p := newTestPlugin(3) // d8 -> 4
		blocks := []models.FormulaBlock{{Type: "dice_attr", Key: "str", Label: "STR"}}
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{{Kind: "dice", Sides: 8, SidesLabel: "STR", Rolls: []int{4}}}
		if !reflect.DeepEqual(parts, want) {
			t.Errorf("parts = %+v, want %+v", parts, want)
		}
	})

	t.Run("die used as the count stays in the formula", func(t *testing.T) {
		// d6 -> 2 decides the count, then two d10 -> 7, 3.
		p := newTestPlugin(1, 6, 2)
		blocks := []models.FormulaBlock{diceBlock("d6"), opBlock("d"), diceBlock("d10")}
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "")
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		want := []gsys.PoolFormulaPart{
			{Kind: "dice", Sides: 6, Rolls: []int{2}},
			{Kind: "dice", Sides: 10, Rolls: []int{7, 3}},
		}
		if !reflect.DeepEqual(parts, want) {
			t.Errorf("parts = %+v, want %+v", parts, want)
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
				Skills: []models.SkillOption{
					{ID: "opt_fire", Label: "Fire Bolt", Attr: "int"},
				},
			}},
		}},
	}

	// AssignAttrToSkill maps the matching option's Attr (matched by stable id) over the field default.
	_, linkedAttr, fieldType, err := resolveRollConfig(template, &Stats{}, "spells.opt_fire")
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
	if got := resolveSkillLabel(template, nil, "weapons.sword"); got != "Sword" {
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
		Skills:     map[string]AttrValue{"atk": {Base: 4}},
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

// ---------------------------------------------------------------------------
// SeedDefaults (FEATURE-158)
// ---------------------------------------------------------------------------

func intPtr(v int) *int { return &v }

// seedTemplate builds a one-section template out of the given fields.
func seedTemplate(fields ...models.FieldDef) *models.SystemTemplate {
	return &models.SystemTemplate{
		Sections: []models.SectionDef{{ID: "s1", Title: "Stats", Columns: 1, Fields: fields}},
	}
}

// seedBlank runs SeedDefaults over a fresh DefaultStats() document and decodes the result.
func seedBlank(t *testing.T, tmpl *models.SystemTemplate) *Stats {
	t.Helper()
	p := New()
	blank, err := p.DefaultStats()
	if err != nil {
		t.Fatalf("DefaultStats() error: %v", err)
	}
	out, err := p.SeedDefaults(blank, tmpl)
	if err != nil {
		t.Fatalf("SeedDefaults() error: %v", err)
	}
	s, err := decodeStats(out)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	return s
}

func TestSeedDefaults_AttrSeedsBaseAdvancesStayZero(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(5)}))

	av, ok := s.Attributes["attr_1"]
	if !ok {
		t.Fatal("expected Attributes[\"attr_1\"] to be seeded")
	}
	if av.Base != 5 {
		t.Errorf("base = %d, want 5", av.Base)
	}
	if av.Advances != 0 {
		t.Errorf("advances = %d, want 0", av.Advances)
	}
}

func TestSeedDefaults_AttrZeroIsSeeded(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(0)}))

	av, ok := s.Attributes["attr_1"]
	if !ok {
		t.Fatal("a default of 0 must still create the key — nil and zero are different states")
	}
	if av.Base != 0 {
		t.Errorf("base = %d, want 0", av.Base)
	}
}

func TestSeedDefaults_NilDefaultLeavesKeyAbsent(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr"}))

	if _, ok := s.Attributes["attr_1"]; ok {
		t.Error("field without a Default must not be seeded")
	}
}

func TestSeedDefaults_NumberSeedsNumbersMap(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{Key: "num_1", Type: "number", Default: intPtr(7)}))

	if got := s.Numbers["num_1"]; got != 7 {
		t.Errorf("Numbers[\"num_1\"] = %d, want 7", got)
	}
	if _, ok := s.Attributes["num_1"]; ok {
		t.Error("a number field must not land in Attributes")
	}
}

func TestSeedDefaults_OtherTypesIgnored(t *testing.T) {
	s := seedBlank(t, seedTemplate(
		models.FieldDef{Key: "prog_1", Type: "progress", Default: intPtr(3)},
		models.FieldDef{Key: "txt_1", Type: "text_short", Default: intPtr(3)},
		models.FieldDef{Key: "tbl_1", Type: "skill_table", Default: intPtr(3)},
	))

	if len(s.Attributes) != 0 {
		t.Errorf("Attributes = %v, want empty", s.Attributes)
	}
	if len(s.Numbers) != 0 {
		t.Errorf("Numbers = %v, want empty", s.Numbers)
	}
}

func TestSeedDefaults_AllSectionsAreVisited(t *testing.T) {
	tmpl := &models.SystemTemplate{Sections: []models.SectionDef{
		{ID: "s1", Fields: []models.FieldDef{{Key: "attr_1", Type: "attr", Default: intPtr(1)}}},
		{ID: "s2", Fields: []models.FieldDef{{Key: "attr_2", Type: "attr", Default: intPtr(2)}}},
	}}

	s := seedBlank(t, tmpl)

	if s.Attributes["attr_1"].Base != 1 || s.Attributes["attr_2"].Base != 2 {
		t.Errorf("attributes = %v, want attr_1 base 1 and attr_2 base 2", s.Attributes)
	}
}

func TestSeedDefaults_NilTemplateIsANoOp(t *testing.T) {
	p := New()
	blank, _ := p.DefaultStats()

	out, err := p.SeedDefaults(blank, nil)
	if err != nil {
		t.Fatalf("SeedDefaults(nil template) error: %v", err)
	}
	s, _ := decodeStats(out)
	if len(s.Attributes) != 0 || len(s.Numbers) != 0 {
		t.Errorf("expected untouched stats, got attributes=%v numbers=%v", s.Attributes, s.Numbers)
	}
}

func TestSeedDefaults_ComputeDerivedMakesCurrentEqualBase(t *testing.T) {
	p := New()
	blank, _ := p.DefaultStats()
	tmpl := seedTemplate(models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(5)})

	seeded, err := p.SeedDefaults(blank, tmpl)
	if err != nil {
		t.Fatalf("SeedDefaults() error: %v", err)
	}
	derived, err := p.ComputeDerived(seeded)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	s, _ := decodeStats(derived)
	if s.Attributes["attr_1"].Current != 5 {
		t.Errorf("current = %d, want 5", s.Attributes["attr_1"].Current)
	}
}

// A label field is template-only decoration (FEATURE-156). Even if a stale Default survives on
// it from an earlier field type, seeding must not create a stats key for it — otherwise every
// character would carry a phantom value nothing reads.
func TestSeedDefaults_LabelFieldIsNeverSeeded(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{
		Key:     "label_1",
		Type:    "label",
		Text:    "Uwaga: mgła",
		Default: intPtr(3),
	}))

	if _, ok := s.Attributes["label_1"]; ok {
		t.Error("a label field must not land in Attributes")
	}
	if _, ok := s.Numbers["label_1"]; ok {
		t.Error("a label field must not land in Numbers")
	}
	if _, ok := s.Texts["label_1"]; ok {
		t.Error("a label field must not land in Texts")
	}
}
