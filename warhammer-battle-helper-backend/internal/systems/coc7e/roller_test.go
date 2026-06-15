package coc7e

import (
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// seqRoller is a strict deterministic Roller: it returns the supplied raw values
// in order and panics if more rolls are requested than provided. A silent wrap
// would let an unexpected extra roll pass unnoticed. Because rollD100 computes
// Intn(100)+1, to force a roll of 35 supply 34.
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

func toRaw(t *testing.T, s Stats) bson.Raw {
	t.Helper()
	raw, err := bson.Marshal(s)
	if err != nil {
		t.Fatalf("bson.Marshal(stats) failed: %v", err)
	}
	return raw
}

// ---------------------------------------------------------------------------
// outcomeCoC
// ---------------------------------------------------------------------------

func TestOutcomeCoC(t *testing.T) {
	tests := []struct {
		name     string
		roll     int
		skillPct int
		want     string
	}{
		{"natural 1 is critical regardless of skill", 1, 0, "critical_success"},
		{"natural 100 is fumble even at high skill", 100, 100, "fumble"},
		{"low skill fumbles on 96+", 96, 40, "fumble"},
		{"low skill 95 is not a fumble", 95, 40, "failure"},
		{"high skill does not fumble on 96", 96, 60, "failure"},
		{"extreme success at skill/5", 12, 60, "extreme_success"},
		{"hard success at skill/2", 30, 60, "hard_success"},
		{"hard success boundary just above extreme", 13, 60, "hard_success"},
		{"regular success at skill%", 60, 60, "regular_success"},
		{"regular success just above hard", 31, 60, "regular_success"},
		{"failure just above skill", 61, 60, "failure"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := outcomeCoC(tt.roll, tt.skillPct); got != tt.want {
				t.Errorf("outcomeCoC(%d, %d) = %q, want %q", tt.roll, tt.skillPct, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// computeDamageAndBuild
// ---------------------------------------------------------------------------

func TestComputeDamageAndBuild(t *testing.T) {
	tests := []struct {
		str, siz  int
		wantDB    string
		wantBuild int
	}{
		{20, 20, "-2", -2},  // sum 40
		{32, 32, "-2", -2},  // sum 64 (upper boundary)
		{40, 40, "-1", -1},  // sum 80
		{50, 50, "0", 0},    // sum 100
		{80, 80, "+1d4", 1}, // sum 160
		{90, 90, "+1d6", 2}, // sum 180
		{120, 120, "+2d6", 3},
		{150, 150, "+3d6", 4},
		{200, 200, "+4d6", 5},
	}
	for _, tt := range tests {
		t.Run(tt.wantDB, func(t *testing.T) {
			gotDB, gotBuild := computeDamageAndBuild(tt.str, tt.siz)
			if gotDB != tt.wantDB || gotBuild != tt.wantBuild {
				t.Errorf("computeDamageAndBuild(%d,%d) = (%q,%d), want (%q,%d)",
					tt.str, tt.siz, gotDB, gotBuild, tt.wantDB, tt.wantBuild)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// getAttrValue / attrRollName
// ---------------------------------------------------------------------------

func TestGetAttrValue(t *testing.T) {
	stats := &Stats{Attributes: Attributes{
		STR: 51, CON: 52, SIZ: 53, DEX: 54, APP: 55, INT: 56, POW: 57, EDU: 58,
	}}
	tests := []struct {
		name string
		want int
	}{
		{"str", 51}, {"con", 52}, {"siz", 53}, {"dex", 54},
		{"app", 55}, {"int", 56}, {"pow", 57}, {"edu", 58},
		{"unknown", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := getAttrValue(stats, tt.name); got != tt.want {
				t.Errorf("getAttrValue(%q) = %d, want %d", tt.name, got, tt.want)
			}
		})
	}
}

func TestAttrRollName(t *testing.T) {
	tests := map[string]string{
		"str": "Strength", "con": "Constitution", "int": "Intelligence",
		"pow": "Power", "dex": "Dexterity", "app": "Appearance",
		"siz": "Size", "edu": "Education", "xyz": "XYZ",
	}
	for in, want := range tests {
		if got := attrRollName(in); got != want {
			t.Errorf("attrRollName(%q) = %q, want %q", in, got, want)
		}
	}
}

// ---------------------------------------------------------------------------
// skillBaseValue
// ---------------------------------------------------------------------------

func TestSkillBaseValue(t *testing.T) {
	p := New()
	stats := &Stats{Attributes: Attributes{DEX: 60, EDU: 70}}

	t.Run("DEX/2 formula", func(t *testing.T) {
		if got := p.skillBaseValue(stats, "dodge"); got != 30 {
			t.Errorf("dodge base = %d, want 30 (DEX/2)", got)
		}
	})
	t.Run("EDU×5 formula", func(t *testing.T) {
		if got := p.skillBaseValue(stats, "language_own"); got != 350 {
			t.Errorf("language_own base = %d, want 350 (EDU*5)", got)
		}
	})
	t.Run("flat base", func(t *testing.T) {
		if got := p.skillBaseValue(stats, "spot_hidden"); got != 25 {
			t.Errorf("spot_hidden base = %d, want 25", got)
		}
	})
	t.Run("unknown skill", func(t *testing.T) {
		if got := p.skillBaseValue(stats, "not_a_skill"); got != 0 {
			t.Errorf("unknown base = %d, want 0", got)
		}
	})
}

// ---------------------------------------------------------------------------
// rollWithDiceMod — bonus/penalty dice mechanics
// ---------------------------------------------------------------------------

func TestRollWithDiceMod(t *testing.T) {
	t.Run("no dice mod returns main roll only", func(t *testing.T) {
		// main = Intn(100)+1 = 55; no extra dice consumed.
		p := newTestPlugin(54)
		roll, all := p.rollWithDiceMod(0)
		if roll != 55 {
			t.Errorf("roll = %d, want 55", roll)
		}
		if !reflect.DeepEqual(all, []int{55}) {
			t.Errorf("allRolls = %v, want [55]", all)
		}
	})

	t.Run("bonus die picks lowest", func(t *testing.T) {
		// main 55 (units 5); extra tens 2 -> alt 25. min(55,25)=25.
		p := newTestPlugin(54, 2)
		roll, all := p.rollWithDiceMod(1)
		if roll != 25 {
			t.Errorf("roll = %d, want 25 (lowest)", roll)
		}
		if !reflect.DeepEqual(all, []int{55, 25}) {
			t.Errorf("allRolls = %v, want [55 25]", all)
		}
	})

	t.Run("penalty die picks highest", func(t *testing.T) {
		// main 55 (units 5); extra tens 8 -> alt 85. max(55,85)=85.
		p := newTestPlugin(54, 8)
		roll, all := p.rollWithDiceMod(-1)
		if roll != 85 {
			t.Errorf("roll = %d, want 85 (highest)", roll)
		}
		if !reflect.DeepEqual(all, []int{55, 85}) {
			t.Errorf("allRolls = %v, want [55 85]", all)
		}
	})

	t.Run("zero tens with zero units becomes 100", func(t *testing.T) {
		// main 30 (units 0); extra tens 0 -> alt 0 -> 100. penalty max(30,100)=100.
		p := newTestPlugin(29, 0)
		roll, all := p.rollWithDiceMod(-1)
		if roll != 100 {
			t.Errorf("roll = %d, want 100 (00+0 normalises to 100)", roll)
		}
		if !reflect.DeepEqual(all, []int{30, 100}) {
			t.Errorf("allRolls = %v, want [30 100]", all)
		}
	})

	t.Run("two bonus dice consider all candidates", func(t *testing.T) {
		// main 50 (units 0); extras 3->30, 7->70. min(50,30,70)=30.
		p := newTestPlugin(49, 3, 7)
		roll, all := p.rollWithDiceMod(2)
		if roll != 30 {
			t.Errorf("roll = %d, want 30 (lowest of three)", roll)
		}
		if !reflect.DeepEqual(all, []int{50, 30, 70}) {
			t.Errorf("allRolls = %v, want [50 30 70]", all)
		}
	})
}

// ---------------------------------------------------------------------------
// RollSkill — skill resolution paths
// ---------------------------------------------------------------------------

func TestRollSkill_AttributeRolls(t *testing.T) {
	stats := Stats{
		Attributes: Attributes{STR: 65},
		Resources:  Resources{Luck: 70, Sanity: 55},
	}

	t.Run("characteristic attr_str", func(t *testing.T) {
		p := newTestPlugin(49) // roll 50
		res, err := p.RollSkill(toRaw(t, stats), "attr_str", 0, 0, 0)
		if err != nil {
			t.Fatalf("RollSkill() error: %v", err)
		}
		if res.Target != 65 || res.SkillName != "Strength" {
			t.Errorf("got Target=%d SkillName=%q, want 65/Strength", res.Target, res.SkillName)
		}
		if res.Roll != 50 || res.Outcome != "regular_success" {
			t.Errorf("got Roll=%d Outcome=%q, want 50/regular_success", res.Roll, res.Outcome)
		}
	})

	t.Run("attr_luck reads Resources.Luck", func(t *testing.T) {
		p := newTestPlugin(49)
		res, _ := p.RollSkill(toRaw(t, stats), "attr_luck", 0, 0, 0)
		if res.Target != 70 || res.SkillName != "Luck" {
			t.Errorf("got Target=%d SkillName=%q, want 70/Luck", res.Target, res.SkillName)
		}
	})

	t.Run("attr_sanity reads Resources.Sanity", func(t *testing.T) {
		p := newTestPlugin(49)
		res, _ := p.RollSkill(toRaw(t, stats), "attr_sanity", 0, 0, 0)
		if res.Target != 55 || res.SkillName != "Sanity" {
			t.Errorf("got Target=%d SkillName=%q, want 55/Sanity", res.Target, res.SkillName)
		}
	})
}

func TestRollSkill_SkillResolution(t *testing.T) {
	t.Run("stored skill value", func(t *testing.T) {
		stats := Stats{Skills: map[string]int{"spot_hidden": 45}}
		p := newTestPlugin(49) // roll 50
		res, _ := p.RollSkill(toRaw(t, stats), "spot_hidden", 0, 0, 0)
		if res.Target != 45 {
			t.Errorf("Target = %d, want 45 (stored)", res.Target)
		}
		if res.Outcome != "failure" { // 50 > 45
			t.Errorf("Outcome = %q, want failure", res.Outcome)
		}
	})

	t.Run("falls back to base value when not stored", func(t *testing.T) {
		// dodge not in Skills -> base DEX/2 = 30.
		stats := Stats{Attributes: Attributes{DEX: 60}, Skills: map[string]int{}}
		p := newTestPlugin(19) // roll 20
		res, _ := p.RollSkill(toRaw(t, stats), "dodge", 0, 0, 0)
		if res.Target != 30 {
			t.Errorf("Target = %d, want 30 (DEX/2 base)", res.Target)
		}
	})

	t.Run("custom skill", func(t *testing.T) {
		stats := Stats{CustomSkills: []CustomSkill{
			{Key: "custom_1", Name: "Lockpicking", Value: 40},
		}}
		p := newTestPlugin(19) // roll 20
		res, _ := p.RollSkill(toRaw(t, stats), "custom_1", 0, 0, 0)
		if res.Target != 40 || res.SkillName != "Lockpicking" {
			t.Errorf("got Target=%d SkillName=%q, want 40/Lockpicking", res.Target, res.SkillName)
		}
	})

	t.Run("modifier is applied to target", func(t *testing.T) {
		stats := Stats{Skills: map[string]int{"spot_hidden": 45}}
		p := newTestPlugin(49)
		res, _ := p.RollSkill(toRaw(t, stats), "spot_hidden", 20, 0, 0)
		if res.Target != 65 || res.Modifier != 20 {
			t.Errorf("got Target=%d Modifier=%d, want 65/20", res.Target, res.Modifier)
		}
	})
}

func TestRollSkill_BonusDiceIntegration(t *testing.T) {
	stats := Stats{Attributes: Attributes{STR: 65}}
	// diceMod=1: main 55, extra tens 2 -> alt 25; final = min = 25.
	// outcome for 25 vs skill 65: 25 <= 65/2(32) -> hard_success.
	p := newTestPlugin(54, 2)
	res, err := p.RollSkill(toRaw(t, stats), "attr_str", 0, 1, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Roll != 25 || res.DiceMod != 1 {
		t.Errorf("got Roll=%d DiceMod=%d, want 25/1", res.Roll, res.DiceMod)
	}
	if !reflect.DeepEqual(res.AllRolls, []int{55, 25}) {
		t.Errorf("AllRolls = %v, want [55 25]", res.AllRolls)
	}
	if res.Outcome != "hard_success" {
		t.Errorf("Outcome = %q, want hard_success", res.Outcome)
	}
}

func TestRollSkill_DecodeError(t *testing.T) {
	p := newTestPlugin(0)
	// A length prefix claiming 100 bytes for a 5-byte buffer is an invalid document.
	bad := bson.Raw{0x64, 0x00, 0x00, 0x00, 0x00}
	if _, err := p.RollSkill(bad, "attr_str", 0, 0, 0); err == nil {
		t.Error("expected decode error for malformed stats, got nil")
	}
}

// ---------------------------------------------------------------------------
// RollWeapon
// ---------------------------------------------------------------------------

func TestRollWeapon_HitAndDamage(t *testing.T) {
	stats := Stats{
		Skills: map[string]int{"fighting_brawl": 50},
		Combat: Combat{DamageBonus: "0"},
	}
	// hit roll: main 30 (Intn 29). damage "1d6": Intn(6)=3 -> 4.
	p := newTestPlugin(29, 3)
	res, err := p.RollWeapon(toRaw(t, stats), "Fist", "fighting_brawl", "1d6", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if res.RollType != "weapon" || res.WeaponName != "Fist" {
		t.Errorf("metadata mismatch: %+v", res)
	}
	if res.Target != 50 || res.Roll != 30 {
		t.Errorf("got Target=%d Roll=%d, want 50/30", res.Target, res.Roll)
	}
	if res.DamageRoll != 4 {
		t.Errorf("DamageRoll = %d, want 4", res.DamageRoll)
	}
}

func TestRollWeapon_DamageWithBonus(t *testing.T) {
	stats := Stats{
		Skills: map[string]int{"fighting_brawl": 50},
		Combat: Combat{DamageBonus: "+1d4"},
	}
	// hit main 30 (Intn 29). damage "1d3+db": 1d3 Intn(3)=1 ->2; db 1d4 Intn(4)=2 ->3.
	// total = 2 + 3 = 5.
	p := newTestPlugin(29, 1, 2)
	res, err := p.RollWeapon(toRaw(t, stats), "Knife", "fighting_brawl", "1d3+db", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if res.DamageRoll != 5 {
		t.Errorf("DamageRoll = %d, want 5 (2 + db 3)", res.DamageRoll)
	}
}

// ---------------------------------------------------------------------------
// rollDamage / rollDamageBonus
// ---------------------------------------------------------------------------

func TestRollDamage(t *testing.T) {
	t.Run("empty formula", func(t *testing.T) {
		p := newTestPlugin()
		total, breakdown := p.rollDamage("", "0")
		if total != 0 || breakdown != "" {
			t.Errorf("rollDamage(\"\") = (%d,%q), want (0,\"\")", total, breakdown)
		}
	})

	t.Run("single die", func(t *testing.T) {
		p := newTestPlugin(3) // Intn(6)=3 -> 4
		total, _ := p.rollDamage("1d6", "0")
		if total != 4 {
			t.Errorf("rollDamage(1d6) = %d, want 4", total)
		}
	})

	t.Run("dice plus flat bonus", func(t *testing.T) {
		p := newTestPlugin(3, 5) // 2d6 -> 4 + 6 = 10
		total, _ := p.rollDamage("2d6+2", "0")
		if total != 12 {
			t.Errorf("rollDamage(2d6+2) = %d, want 12", total)
		}
	})

	t.Run("Polish K notation parses as dice", func(t *testing.T) {
		p := newTestPlugin(2) // Intn(3)=2 -> 3
		total, _ := p.rollDamage("1K3", "0")
		if total != 3 {
			t.Errorf("rollDamage(1K3) = %d, want 3", total)
		}
	})

	t.Run("db segment uses character damage bonus", func(t *testing.T) {
		// 1d4 main: Intn(4)=1 -> 2; db "+1d6": Intn(6)=4 -> 5. total 7.
		p := newTestPlugin(1, 4)
		total, _ := p.rollDamage("1d4+db", "+1d6")
		if total != 7 {
			t.Errorf("rollDamage(1d4+db, +1d6) = %d, want 7", total)
		}
	})
}

func TestRollDamageBonus(t *testing.T) {
	t.Run("none-like values are zero", func(t *testing.T) {
		p := newTestPlugin()
		for _, db := range []string{"", "0", "None"} {
			if got := p.rollDamageBonus(db); got != 0 {
				t.Errorf("rollDamageBonus(%q) = %d, want 0", db, got)
			}
		}
	})

	t.Run("negative flat bonus", func(t *testing.T) {
		p := newTestPlugin()
		if got := p.rollDamageBonus("-1"); got != -1 {
			t.Errorf("rollDamageBonus(-1) = %d, want -1", got)
		}
	})

	t.Run("positive dice bonus", func(t *testing.T) {
		p := newTestPlugin(3) // 1d4 -> Intn(4)=3 -> 4
		if got := p.rollDamageBonus("+1d4"); got != 4 {
			t.Errorf("rollDamageBonus(+1d4) = %d, want 4", got)
		}
	})
}

// ---------------------------------------------------------------------------
// ComputeDerived
// ---------------------------------------------------------------------------

func TestComputeDerived(t *testing.T) {
	p := New()
	stats := Stats{
		Attributes: Attributes{STR: 80, SIZ: 80, CON: 60, POW: 50},
		Skills:     map[string]int{"cthulhu_mythos": 10},
		Resources:  Resources{Sanity: 95, HP: 99, MP: 99},
	}
	out, err := p.ComputeDerived(toRaw(t, stats))
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, err := decodeStats(out)
	if err != nil {
		t.Fatalf("decode result: %v", err)
	}

	// SanityMax = 99 - cthulhu_mythos(10) = 89; Sanity clamped down to 89.
	if got.Resources.SanityMax != 89 {
		t.Errorf("SanityMax = %d, want 89", got.Resources.SanityMax)
	}
	if got.Resources.Sanity != 89 {
		t.Errorf("Sanity = %d, want 89 (clamped)", got.Resources.Sanity)
	}
	// HPMax = (CON 60 + SIZ 80)/10 = 14; HP clamped to 14.
	if got.Resources.HPMax != 14 || got.Resources.HP != 14 {
		t.Errorf("got HPMax=%d HP=%d, want 14/14", got.Resources.HPMax, got.Resources.HP)
	}
	// MPMax = POW 50 / 5 = 10; MP clamped to 10.
	if got.Resources.MPMax != 10 || got.Resources.MP != 10 {
		t.Errorf("got MPMax=%d MP=%d, want 10/10", got.Resources.MPMax, got.Resources.MP)
	}
	// STR 80 + SIZ 80 = 160 -> +1d4 / build 1.
	if got.Combat.DamageBonus != "+1d4" || got.Combat.Build != 1 {
		t.Errorf("got DamageBonus=%q Build=%d, want +1d4/1", got.Combat.DamageBonus, got.Combat.Build)
	}
}

func TestComputeDerived_InitialisesNilCollections(t *testing.T) {
	p := New()
	out, err := p.ComputeDerived(toRaw(t, Stats{}))
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)
	if got.Skills == nil || got.CustomSkills == nil || got.FavoriteSkills == nil ||
		got.DevelopmentSkills == nil || got.Weapons == nil {
		t.Errorf("expected non-nil collections, got %+v", got)
	}
}

// ---------------------------------------------------------------------------
// DefaultStats + display name (CoC stores no name in stats)
// ---------------------------------------------------------------------------

func TestDefaultStats(t *testing.T) {
	p := New()
	raw, err := p.DefaultStats()
	if err != nil {
		t.Fatalf("DefaultStats() error: %v", err)
	}
	stats, err := decodeStats(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if stats.Skills == nil {
		t.Error("Skills = nil, want non-nil map")
	}
	if stats.Weapons == nil || len(stats.Weapons) != 0 {
		t.Errorf("Weapons = %v, want empty non-nil slice", stats.Weapons)
	}
}

func TestDisplayName_NotEmbedded(t *testing.T) {
	p := New()
	if got := p.GetDisplayName(bson.Raw{1, 2, 3}); got != "" {
		t.Errorf("GetDisplayName() = %q, want empty (CoC has no embedded name)", got)
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
