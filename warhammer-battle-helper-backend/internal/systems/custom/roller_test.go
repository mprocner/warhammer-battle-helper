package custom

import (
	"battle-helper/internal/models"
	gsys "battle-helper/internal/systems"
	"reflect"
	"strings"
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
	res, err := p.rollFromFormula(stats, tmplWithModifier(ModTargetRoll, ""), "atk", "str", cfg, 3)
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

// tmplWithModifier builds a template with the modifier enabled and the given targets.
func tmplWithModifier(trad, pool string) *models.SystemTemplate {
	return &models.SystemTemplate{
		Settings: models.TemplateSettings{
			Modifier: &models.ModifierConfig{Enabled: true, TraditionalTarget: trad, PoolTarget: pool},
		},
	}
}

func TestRollFromFormula_ModifierTargets(t *testing.T) {
	stats := sampleStats()
	// Explicit threshold 55, formula d100 — classic roll-under.
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d100")},
		SuccessType: "below_threshold",
		Threshold:   "55",
	}

	t.Run("target roll shifts the result and leaves the threshold alone", func(t *testing.T) {
		p := newTestPlugin(47) // d100 -> 48
		res, err := p.rollFromFormula(stats, tmplWithModifier(ModTargetRoll, ""), "atk", "str", cfg, -20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 28 {
			t.Errorf("Roll = %d, want 28 (48-20)", res.Roll)
		}
		if res.Target != 55 {
			t.Errorf("Target = %d, want 55 (untouched)", res.Target)
		}
		if res.ModifierTarget != ModTargetRoll {
			t.Errorf("ModifierTarget = %q, want %q", res.ModifierTarget, ModTargetRoll)
		}
		if res.Outcome != "regular_success" { // 28 <= 55
			t.Errorf("Outcome = %q, want regular_success", res.Outcome)
		}
		if res.Modifier != -20 {
			t.Errorf("Modifier = %d, want -20 — the reported value must match what was applied", res.Modifier)
		}
	})

	// The point of "threshold": the roll stays raw, the target moves. Without the modifier
	// 48 <= 55 is a success; with -20 the threshold drops to 35 and the same roll is a failure.
	t.Run("target threshold shifts the target and leaves the roll raw", func(t *testing.T) {
		p := newTestPlugin(47) // d100 -> 48
		res, err := p.rollFromFormula(stats, tmplWithModifier(ModTargetThreshold, ""), "atk", "str", cfg, -20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 48 {
			t.Errorf("Roll = %d, want 48 (raw)", res.Roll)
		}
		if res.Target != 35 {
			t.Errorf("Target = %d, want 35 (55-20)", res.Target)
		}
		// Three-part "notation = values = result" is evalFormula's normal shape for a bare die
		// (see gsys.RollResult.FormulaBreakdown doc, e.g. "d6+STR+2 = 3+8+2 = 13") — this is
		// unchanged by the modifier; the point of this assertion is that no "-20"/"+X" fragment
		// from the modifier appears here, since it went to the threshold instead.
		if res.FormulaBreakdown != "d100 = 48 = 48" {
			t.Errorf("FormulaBreakdown = %q, want %q — the modifier does not belong on the roll side", res.FormulaBreakdown, "d100 = 48 = 48")
		}
		if res.Outcome != "failure" {
			t.Errorf("Outcome = %q, want failure", res.Outcome)
		}
		if res.Modifier != -20 {
			t.Errorf("Modifier = %d, want -20 — the raw value always goes to the log", res.Modifier)
		}
	})

	t.Run("no config zeroes a modifier the request tried to smuggle in", func(t *testing.T) {
		p := newTestPlugin(47) // d100 -> 48
		res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, -20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Roll != 48 || res.Target != 55 || res.Modifier != 0 {
			t.Errorf("got roll=%d target=%d modifier=%d, want 48/55/0", res.Roll, res.Target, res.Modifier)
		}
		if res.ModifierTarget != ModTargetNone {
			t.Errorf("ModifierTarget = %q, want empty", res.ModifierTarget)
		}
	})

	// A "raw" threshold has no target to shift — a threshold modifier must not conjure a
	// target out of nothing.
	t.Run("threshold target does nothing when no threshold could be determined", func(t *testing.T) {
		rawCfg := &models.RollConfig{
			Formula:     []models.FormulaBlock{diceBlock("d100")},
			SuccessType: "raw",
		}
		emptyStats := &Stats{Attributes: map[string]AttrValue{}, Skills: map[string]AttrValue{}}
		p := newTestPlugin(47)
		res, err := p.rollFromFormula(emptyStats, tmplWithModifier(ModTargetThreshold, ""), "unknown", "", rawCfg, 20)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if res.Target != 0 {
			t.Errorf("Target = %d, want 0 — no threshold stays no threshold", res.Target)
		}
		if res.Outcome != "48" {
			t.Errorf("Outcome = %q, want raw \"48\"", res.Outcome)
		}
		// The modifier moved nothing, so it must not be reported as applied — the log branches on
		// ModifierTarget and would otherwise print a number that had no effect.
		if res.Modifier != 0 || res.ModifierTarget != ModTargetNone {
			t.Errorf("got modifier=%d target=%q, want 0 and an empty target", res.Modifier, res.ModifierTarget)
		}
	})
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

func TestRollFromFormula_DicePoolModifierTargets(t *testing.T) {
	stats := sampleStats()
	// Pula: 3 kości K6, sukces przy 4+.
	cfg := &models.RollConfig{
		RollMode:             "dice_pool",
		Formula:              []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6")},
		PoolSuccessThreshold: 4,
		PoolSuccessCondition: "gte",
	}

	t.Run("dice_count rolls extra dice", func(t *testing.T) {
		// 3 + 2 = 5 kości: 4, 6, 2, 5, 1 -> sukcesy 4, 6, 5 = 3.
		p := newTestPlugin(3, 5, 1, 4, 0)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetDiceCount), "atk", "str", cfg, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2, 5, 1}) {
			t.Errorf("pool rolls = %v, want [4 6 2 5 1]", got)
		}
		if res.PoolSuccesses != 3 {
			t.Errorf("PoolSuccesses = %d, want 3", res.PoolSuccesses)
		}
		if res.Target != 4 {
			t.Errorf("Target = %d, want 4 (threshold untouched)", res.Target)
		}
		if res.ModifierTarget != ModTargetDiceCount {
			t.Errorf("ModifierTarget = %q, want %q", res.ModifierTarget, ModTargetDiceCount)
		}
	})

	t.Run("dice_count removes dice and never drops below one", func(t *testing.T) {
		// 3 - 9 = -6 kości -> clamp do 1: tylko jeden rzut jest w ogóle wykonany.
		p := newTestPlugin(5)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetDiceCount), "atk", "str", cfg, -9)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{6}) {
			t.Errorf("pool rolls = %v, want [6] — pula nigdy nie schodzi poniżej jednej kości", got)
		}
	})

	t.Run("success_threshold shifts the threshold and leaves the dice count alone", func(t *testing.T) {
		// 3 kości: 4, 6, 2. Próg 4+2 = 6 -> tylko 6 się liczy.
		p := newTestPlugin(3, 5, 1)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetSuccessThreshold), "atk", "str", cfg, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2}) {
			t.Errorf("pool rolls = %v, want [4 6 2] — liczba kości bez zmian", got)
		}
		if res.Target != 6 {
			t.Errorf("Target = %d, want 6 (4+2)", res.Target)
		}
		if res.PoolSuccesses != 1 {
			t.Errorf("PoolSuccesses = %d, want 1", res.PoolSuccesses)
		}
	})

	t.Run("disabled config leaves the pool exactly as configured", func(t *testing.T) {
		p := newTestPlugin(3, 5, 1)
		res, err := p.rollFromFormula(stats, &models.SystemTemplate{}, "atk", "str", cfg, 2)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		if got := poolRolls(res.PoolFormula); !reflect.DeepEqual(got, []int{4, 6, 2}) {
			t.Errorf("pool rolls = %v, want [4 6 2]", got)
		}
		if res.Target != 4 || res.Modifier != 0 {
			t.Errorf("got target=%d modifier=%d, want 4/0", res.Target, res.Modifier)
		}
	})

	// Modyfikator liczby kości wchodzi do pierwszego członu kostkowego — tego, który wyznacza
	// wyświetlany DiceType. Udokumentowane ograniczenie z D3 spec.
	t.Run("dice_count touches only the first die term", func(t *testing.T) {
		multiCfg := &models.RollConfig{
			RollMode:             "dice_pool",
			Formula:              []models.FormulaBlock{numBlock(2), opBlock("d"), diceBlock("d6"), opBlock("+"), numBlock(2), opBlock("d"), diceBlock("d10")},
			PoolSuccessThreshold: 5,
			PoolSuccessCondition: "gte",
		}
		// pierwszy człon: 2+1 = 3 kości K6 (3, 4, 5); drugi: 2 kości K10 (7, 8).
		p := newTestPlugin(2, 3, 4, 6, 7)
		res, err := p.rollFromFormula(stats, tmplWithModifier("", ModTargetDiceCount), "atk", "str", multiCfg, 1)
		if err != nil {
			t.Fatalf("rollFromFormula() error: %v", err)
		}
		var counts []int
		for _, part := range res.PoolFormula {
			if part.Kind == "dice" {
				counts = append(counts, len(part.Rolls))
			}
		}
		if !reflect.DeepEqual(counts, []int{3, 2}) {
			t.Errorf("dice per term = %v, want [3 2]", counts)
		}
	})
}

// ---------------------------------------------------------------------------
// RollWithTemplate dispatch
// ---------------------------------------------------------------------------

func TestRollWithTemplate(t *testing.T) {
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			ID: "sec1",
			Fields: []models.FieldDef{{
				Key:      "atk",
				Type:     "skill_table",
				Label:    "Atak",
				Rollable: true,
				Skills:   []models.SkillOption{{ID: "sword", Label: "Miecz"}},
				RollConfig: &models.RollConfig{
					Formula:     []models.FormulaBlock{diceBlock("d20")},
					SuccessType: "above_threshold",
					Threshold:   "10",
				},
			}},
		}},
	}
	raw, err := bson.Marshal(Stats{
		Attributes: map[string]AttrValue{"agility": {Current: 12}},
		Skills:     map[string]AttrValue{"atk.sword": {Base: 5}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	t.Run("dispatches to the formula path", func(t *testing.T) {
		p := newTestPlugin(14) // d20 -> 15
		res, err := p.RollWithTemplate(raw, template, "atk.sword", 0)
		if err != nil {
			t.Fatalf("RollWithTemplate() error: %v", err)
		}
		if res.Roll != 15 || res.Target != 10 || res.Outcome != "regular_success" {
			t.Errorf("got roll=%d target=%d outcome=%q, want 15/10/regular_success", res.Roll, res.Target, res.Outcome)
		}
		if res.SkillName != "Miecz" {
			t.Errorf("SkillName = %q, want Miecz", res.SkillName)
		}
	})

	t.Run("unknown skill key errors", func(t *testing.T) {
		p := newTestPlugin()
		if _, err := p.RollWithTemplate(raw, template, "nope", 0); err == nil {
			t.Error("expected an error for an unknown skill key")
		}
	})
}

// Po usunięciu ścieżek legacy pole bez formuły nie ma czym rzucić — musi to powiedzieć wprost,
// tak jak RollWeaponWithTemplate robi od zawsze (weapon.go:32).
func TestRollWithTemplate_NoFormulaErrors(t *testing.T) {
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			ID: "sec1",
			Fields: []models.FieldDef{{
				Key:        "atk",
				Type:       "attr",
				Rollable:   true,
				RollConfig: &models.RollConfig{SuccessType: "above_threshold"},
			}},
		}},
	}
	raw, err := bson.Marshal(Stats{Attributes: map[string]AttrValue{"atk": {Current: 10}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	p := newTestPlugin()
	_, err = p.RollWithTemplate(raw, template, "atk", 0)
	if err == nil {
		t.Fatal("expected an error for a field with no formula")
	}
	// Assert the TEXT, not just err != nil. evalFormula and evalFormulaDicePool also error on an
	// empty block list ("formula is empty"), so an err-only assertion would still pass with the
	// plugin.go guard deleted — it would guard the contract, not the code enforcing it.
	if !strings.Contains(err.Error(), "has no roll formula") {
		t.Errorf("error = %q, want it to mention \"has no roll formula\"", err)
	}
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
		parts, diceType, err := p.evalFormulaDicePool([]models.FormulaBlock{{Type: "dice_attr", Key: "str"}}, stats, "", "", 0)
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
		parts, _, _ := p.evalFormulaDicePool(blocks, stats, "", "", 0)
		if got := poolRolls(parts); !reflect.DeepEqual(got, []int{4, 6}) {
			t.Errorf("rolls = %v, want [4 6]", got)
		}
	})

	t.Run("dice_skill_attr pool", func(t *testing.T) {
		p := newTestPlugin(7, 9) // sides 18 -> 8, 10
		blocks := []models.FormulaBlock{numBlock(2), opBlock("d"), {Type: "dice_skill_attr"}}
		parts, _, _ := p.evalFormulaDicePool(blocks, stats, "atk", "str", 0)
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
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "atk", "dex", 0)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if got := poolRolls(parts); len(got) != 0 {
			t.Errorf("rolls = %v, want empty (no dice blocks)", got)
		}
	})

	t.Run("empty formula errors", func(t *testing.T) {
		p := newTestPlugin()
		if _, _, err := p.evalFormulaDicePool(nil, stats, "", "", 0); err == nil {
			t.Error("expected error for empty pool formula, got nil")
		}
	})

	t.Run("count form keeps one term with every roll", func(t *testing.T) {
		p := newTestPlugin(3, 5, 1) // 4, 6, 2
		blocks := []models.FormulaBlock{numBlock(3), opBlock("d"), diceBlock("d6")}
		parts, diceType, err := p.evalFormulaDicePool(blocks, stats, "", "", 0)
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
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "", 0)
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
		parts, _, err := p.evalFormulaDicePool(blocks, stats, "", "", 0)
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
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, SuccessType: "below_threshold"}
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
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d20")}, LinkedAttr: "dex"}
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
	// For an "attr" field the linked attribute is the skillKey itself — the attr_linked block
	// must therefore resolve to the field's own value.
	cfg := &models.RollConfig{
		Formula:     []models.FormulaBlock{diceBlock("d20"), opBlock("+"), {Type: "attr_linked"}},
		SuccessType: "above_threshold",
	}
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
	if res.Roll != 24 { // d20 10 + attr_linked (str = 14)
		t.Errorf("Roll = %d, want 24", res.Roll)
	}
	// Threshold falls back to the attribute (the skill key "str" has no skill entry), so a
	// roll of 24 against 14 is a success.
	if res.Target != 14 || res.Outcome != "regular_success" {
		t.Errorf("got target=%d outcome=%q, want 14/regular_success", res.Target, res.Outcome)
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
