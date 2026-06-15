package warhammer4e

import (
	gsys "battle-helper/internal/systems"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// seqRoller is a deterministic Roller: it returns the supplied raw values in
// order, letting tests force exact dice results. Because the plugin's rollD100
// computes Intn(100)+1, to force a roll of 35 supply 34.
//
// It is a *strict* fake: requesting more rolls than were provided panics rather
// than wrapping. A silent wrap would let an unexpected extra roll in production
// code pass unnoticed; a panic surfaces the mismatch between the test's mental
// model and the code's actual behaviour.
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

// newTestPlugin builds a plugin whose randomness is fully controlled by vals.
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

// withCurrent returns Stats with the given current characteristics and empty maps.
func withCurrent(c CharacteristicRow) Stats {
	return Stats{
		Characteristics: CharacteristicsTable{Current: c},
		BasicSkills:     map[string]int{},
		AdvancedSkills:  map[string]int{},
	}
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

func TestOutcome(t *testing.T) {
	tests := []struct {
		name    string
		success bool
		sl      int
		want    string
	}{
		{"critical at SL exactly 6", true, 6, "critical_success"},
		{"critical above 6", true, 9, "critical_success"},
		{"critical even when success flag false but SL high", false, 7, "critical_success"},
		{"regular success", true, 2, "regular_success"},
		{"regular success at SL 0", true, 0, "regular_success"},
		{"failure", false, -3, "failure"},
		{"failure at SL 5 without success", false, 5, "failure"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := outcome(tt.success, tt.sl); got != tt.want {
				t.Errorf("outcome(%v, %d) = %q, want %q", tt.success, tt.sl, got, tt.want)
			}
		})
	}
}

func TestCharacteristicValue(t *testing.T) {
	stats := withCurrent(CharacteristicRow{
		WS: 41, BS: 42, S: 43, T: 44, I: 45, Ag: 46, Dex: 47, Int: 48, WP: 49, Fel: 50,
	})
	tests := []struct {
		characteristic string
		want           int
	}{
		{"WEAPON_SKILL", 41},
		{"BALLISTIC_SKILL", 42},
		{"STRENGTH", 43},
		{"TOUGHNESS", 44},
		{"INITIATIVE", 45},
		{"AGILITY", 46},
		{"DEXTERITY", 47},
		{"INTELLIGENCE", 48},
		{"WILLPOWER", 49},
		{"FELLOWSHIP", 50},
		{"NONEXISTENT", 0},
		{"", 0},
	}
	for _, tt := range tests {
		t.Run(tt.characteristic, func(t *testing.T) {
			if got := characteristicValue(&stats, tt.characteristic); got != tt.want {
				t.Errorf("characteristicValue(%q) = %d, want %d", tt.characteristic, got, tt.want)
			}
		})
	}
}

func TestFindSkill(t *testing.T) {
	p := New()

	t.Run("direct key", func(t *testing.T) {
		got := p.findSkill("ATHLETICS")
		if got == nil || got.Key != "ATHLETICS" {
			t.Fatalf("findSkill(ATHLETICS) = %v, want skill with key ATHLETICS", got)
		}
		if got.Characteristic != "AGILITY" {
			t.Errorf("ATHLETICS characteristic = %q, want AGILITY", got.Characteristic)
		}
	})

	t.Run("compound key resolves to parent", func(t *testing.T) {
		got := p.findSkill("MELEE_BASIC")
		if got == nil || got.Key != "MELEE" {
			t.Fatalf("findSkill(MELEE_BASIC) = %v, want parent skill MELEE", got)
		}
		if got.Characteristic != "WEAPON_SKILL" {
			t.Errorf("MELEE characteristic = %q, want WEAPON_SKILL", got.Characteristic)
		}
	})

	t.Run("unknown key returns nil", func(t *testing.T) {
		if got := p.findSkill("TOTALLY_MADE_UP"); got != nil {
			t.Errorf("findSkill(TOTALLY_MADE_UP) = %v, want nil", got)
		}
	})
}

// ---------------------------------------------------------------------------
// DefaultStats
// ---------------------------------------------------------------------------

func TestDefaultStats(t *testing.T) {
	p := New()
	raw, err := p.DefaultStats()
	if err != nil {
		t.Fatalf("DefaultStats() error: %v", err)
	}

	stats, err := decodeStats(raw)
	if err != nil {
		t.Fatalf("decodeStats(DefaultStats()) error: %v", err)
	}

	// Slices must be non-nil empty so they serialise as [] not null.
	if stats.Talents == nil || len(stats.Talents) != 0 {
		t.Errorf("Talents = %v, want empty non-nil slice", stats.Talents)
	}
	if stats.Weapons == nil || len(stats.Weapons) != 0 {
		t.Errorf("Weapons = %v, want empty non-nil slice", stats.Weapons)
	}
	if stats.BasicSkills == nil {
		t.Error("BasicSkills = nil, want non-nil map")
	}
	if stats.AdvancedSkills == nil {
		t.Error("AdvancedSkills = nil, want non-nil map")
	}
}

// ---------------------------------------------------------------------------
// ComputeDerived
// ---------------------------------------------------------------------------

func TestComputeDerived_WoundsBonuses(t *testing.T) {
	p := New()
	stats := withCurrent(CharacteristicRow{S: 35, T: 42, WP: 33})
	raw := toRaw(t, stats)

	out, err := p.ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, err := decodeStats(out)
	if err != nil {
		t.Fatalf("decode result: %v", err)
	}

	// SB = S/10 = 3; baseTB = T/10 = 4, TB = 2*baseTB = 8; WPB = WP/10 = 3.
	if got.Wounds.SB != 3 {
		t.Errorf("SB = %d, want 3", got.Wounds.SB)
	}
	if got.Wounds.TB != 8 {
		t.Errorf("TB = %d, want 8 (2*baseTB)", got.Wounds.TB)
	}
	if got.Wounds.WPB != 3 {
		t.Errorf("WPB = %d, want 3", got.Wounds.WPB)
	}
	if got.Wounds.Hardy != 0 {
		t.Errorf("Hardy = %d, want 0 (no talent)", got.Wounds.Hardy)
	}
	// Total = SB + TB + WPB + Hardy = 3 + 8 + 3 + 0 = 14
	if got.Wounds.Total != 14 {
		t.Errorf("Total = %d, want 14", got.Wounds.Total)
	}
}

func TestComputeDerived_HardyTalent(t *testing.T) {
	p := New()
	stats := withCurrent(CharacteristicRow{S: 30, T: 40, WP: 30})
	stats.Talents = []Talent{{Key: "HARDY", TimesTaken: 2}}
	raw := toRaw(t, stats)

	out, err := p.ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)

	// baseTB = 40/10 = 4; Hardy adds baseTB * timesTaken = 4 * 2 = 8.
	if got.Wounds.Hardy != 8 {
		t.Errorf("Hardy = %d, want 8 (baseTB*timesTaken)", got.Wounds.Hardy)
	}
	// SB=3, TB=8, WPB=3, Hardy=8 -> Total=22
	if got.Wounds.Total != 22 {
		t.Errorf("Total = %d, want 22", got.Wounds.Total)
	}
}

func TestComputeDerived_Movement(t *testing.T) {
	p := New()

	t.Run("numeric movement derives walk and run", func(t *testing.T) {
		stats := withCurrent(CharacteristicRow{})
		stats.Movement = MovementInfo{Movement: "4"}
		out, err := p.ComputeDerived(toRaw(t, stats))
		if err != nil {
			t.Fatalf("ComputeDerived() error: %v", err)
		}
		got, _ := decodeStats(out)
		if got.Movement.Walk != "8" {
			t.Errorf("Walk = %q, want 8 (2*M)", got.Movement.Walk)
		}
		if got.Movement.Run != "16" {
			t.Errorf("Run = %q, want 16 (4*M)", got.Movement.Run)
		}
	})

	t.Run("non-numeric movement left untouched", func(t *testing.T) {
		stats := withCurrent(CharacteristicRow{})
		stats.Movement = MovementInfo{Movement: "fast", Walk: "keep", Run: "keep"}
		out, err := p.ComputeDerived(toRaw(t, stats))
		if err != nil {
			t.Fatalf("ComputeDerived() error: %v", err)
		}
		got, _ := decodeStats(out)
		if got.Movement.Walk != "keep" || got.Movement.Run != "keep" {
			t.Errorf("Walk/Run = %q/%q, want unchanged keep/keep", got.Movement.Walk, got.Movement.Run)
		}
	})
}

func TestComputeDerived_InitialisesNilSlices(t *testing.T) {
	p := New()
	// Stats with all slices nil (zero value).
	raw := toRaw(t, Stats{})
	out, err := p.ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)
	if got.Equipment == nil || got.Spells == nil || got.Weapons == nil ||
		got.Armour == nil || got.Talents == nil {
		t.Errorf("expected all slices non-nil, got equipment=%v spells=%v weapons=%v armour=%v talents=%v",
			got.Equipment, got.Spells, got.Weapons, got.Armour, got.Talents)
	}
}

// ---------------------------------------------------------------------------
// RollSkill
// ---------------------------------------------------------------------------

func TestRollSkill_CharacteristicTest(t *testing.T) {
	// attr_WS path: target = WS(40) + modifier(0) = 40, forced roll = 35.
	p := newTestPlugin(34) // Intn(100)=34 -> roll 35
	stats := withCurrent(CharacteristicRow{WS: 40})

	res, err := p.RollSkill(toRaw(t, stats), "attr_WS", 0, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Roll != 35 {
		t.Errorf("Roll = %d, want 35", res.Roll)
	}
	if res.Target != 40 {
		t.Errorf("Target = %d, want 40", res.Target)
	}
	// SL = target/10 - roll/10 = 4 - 3 = 1
	if res.SuccessLevel != 1 {
		t.Errorf("SuccessLevel = %d, want 1", res.SuccessLevel)
	}
	if res.Outcome != "regular_success" {
		t.Errorf("Outcome = %q, want regular_success", res.Outcome)
	}
	if res.DiceType != 100 || res.RollType != "skill" || res.SkillKey != "attr_WS" {
		t.Errorf("metadata mismatch: %+v", res)
	}
}

func TestRollSkill_ModifierApplied(t *testing.T) {
	// WS 40 + modifier +10 -> target 50.
	p := newTestPlugin(44) // roll 45
	stats := withCurrent(CharacteristicRow{WS: 40})

	res, err := p.RollSkill(toRaw(t, stats), "attr_WS", 10, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Target != 50 {
		t.Errorf("Target = %d, want 50", res.Target)
	}
	if res.Modifier != 10 {
		t.Errorf("Modifier = %d, want 10", res.Modifier)
	}
}

func TestRollSkill_CriticalAndFailure(t *testing.T) {
	t.Run("critical success at SL>=6", func(t *testing.T) {
		// WS 40 + modifier 30 -> target 70; roll 5 -> SL = 7 - 0 = 7.
		p := newTestPlugin(4) // roll 5
		stats := withCurrent(CharacteristicRow{WS: 40})
		res, err := p.RollSkill(toRaw(t, stats), "attr_WS", 30, 0, 0)
		if err != nil {
			t.Fatalf("RollSkill() error: %v", err)
		}
		if res.SuccessLevel != 7 {
			t.Errorf("SuccessLevel = %d, want 7", res.SuccessLevel)
		}
		if res.Outcome != "critical_success" {
			t.Errorf("Outcome = %q, want critical_success", res.Outcome)
		}
	})

	t.Run("failure when roll above target", func(t *testing.T) {
		// WS 40, roll 80 -> SL = 4 - 8 = -4, failure.
		p := newTestPlugin(79) // roll 80
		stats := withCurrent(CharacteristicRow{WS: 40})
		res, err := p.RollSkill(toRaw(t, stats), "attr_WS", 0, 0, 0)
		if err != nil {
			t.Fatalf("RollSkill() error: %v", err)
		}
		if res.Outcome != "failure" {
			t.Errorf("Outcome = %q, want failure", res.Outcome)
		}
		if res.SuccessLevel != -4 {
			t.Errorf("SuccessLevel = %d, want -4", res.SuccessLevel)
		}
	})
}

func TestRollSkill_NamedSkillWithAdvances(t *testing.T) {
	// ATHLETICS uses AGILITY. Ag=35 + advances 10 = 45 target.
	p := newTestPlugin(19) // roll 20
	stats := withCurrent(CharacteristicRow{Ag: 35})
	stats.BasicSkills["ATHLETICS"] = 10

	res, err := p.RollSkill(toRaw(t, stats), "ATHLETICS", 0, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Target != 45 {
		t.Errorf("Target = %d, want 45 (char 35 + advances 10)", res.Target)
	}
	if res.Outcome != "regular_success" {
		t.Errorf("Outcome = %q, want regular_success", res.Outcome)
	}
}

func TestRollSkill_CompoundSkillKey(t *testing.T) {
	// MELEE_BASIC resolves to MELEE (WEAPON_SKILL); advances keyed by full key.
	p := newTestPlugin(29) // roll 30
	stats := withCurrent(CharacteristicRow{WS: 40})
	stats.BasicSkills["MELEE_BASIC"] = 5

	res, err := p.RollSkill(toRaw(t, stats), "MELEE_BASIC", 0, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Target != 45 {
		t.Errorf("Target = %d, want 45 (WS 40 + advances 5)", res.Target)
	}
}

func TestRollSkill_CustomSkill(t *testing.T) {
	p := newTestPlugin(19) // roll 20
	stats := withCurrent(CharacteristicRow{Fel: 33})
	stats.CustomSkills = []CustomSkill{
		{Key: "GAMBLING_TRICKS", Name: "Gambling Tricks", Characteristic: "FELLOWSHIP"},
	}

	res, err := p.RollSkill(toRaw(t, stats), "GAMBLING_TRICKS", 0, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	if res.Target != 33 {
		t.Errorf("Target = %d, want 33", res.Target)
	}
	if res.SkillName != "Gambling Tricks" {
		t.Errorf("SkillName = %q, want Gambling Tricks", res.SkillName)
	}
}

func TestRollSkill_Errors(t *testing.T) {
	p := newTestPlugin(50)

	t.Run("zero characteristic", func(t *testing.T) {
		stats := withCurrent(CharacteristicRow{WS: 0})
		if _, err := p.RollSkill(toRaw(t, stats), "attr_WS", 0, 0, 0); err == nil {
			t.Error("expected error for zero characteristic, got nil")
		}
	})

	t.Run("unknown skill key", func(t *testing.T) {
		stats := withCurrent(CharacteristicRow{WS: 40})
		if _, err := p.RollSkill(toRaw(t, stats), "NOT_A_REAL_SKILL", 0, 0, 0); err == nil {
			t.Error("expected error for unknown skill, got nil")
		}
	})
}

// ---------------------------------------------------------------------------
// RollWeapon
// ---------------------------------------------------------------------------

func TestRollWeapon_HitAndFlatDamage(t *testing.T) {
	// MELEE_BASIC -> WEAPON_SKILL 45; roll 20; flat damage "+4" (no dice).
	p := newTestPlugin(19) // hit roll 20; rollDamage uses no rng for flat values
	stats := withCurrent(CharacteristicRow{WS: 45})

	res, err := p.RollWeapon(toRaw(t, stats), "Sword", "MELEE_BASIC", "+4", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if res.RollType != "weapon" || res.WeaponName != "Sword" {
		t.Errorf("metadata mismatch: %+v", res)
	}
	if res.Target != 45 {
		t.Errorf("Target = %d, want 45", res.Target)
	}
	if res.DamageRoll != 4 {
		t.Errorf("DamageRoll = %d, want 4", res.DamageRoll)
	}
}

func TestRollWeapon_DamageWithDiceAndSL(t *testing.T) {
	// WS 45, roll 20 -> SL = 4 - 2 = 2. Damage "1d10+sl" -> 1d10 + 2.
	// seq: first Intn(100)=19 (hit 20), then Intn(10)=5 (die 6). Damage = 6 + 2 = 8.
	p := newTestPlugin(19, 5)
	stats := withCurrent(CharacteristicRow{WS: 45})

	res, err := p.RollWeapon(toRaw(t, stats), "Bow", "MELEE_BASIC", "1d10+sl", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	if res.SuccessLevel != 2 {
		t.Errorf("SuccessLevel = %d, want 2", res.SuccessLevel)
	}
	if res.DamageRoll != 8 {
		t.Errorf("DamageRoll = %d, want 8 (die 6 + SL 2)", res.DamageRoll)
	}
}

func TestRollWeapon_UnknownSkillError(t *testing.T) {
	p := newTestPlugin(50)
	stats := withCurrent(CharacteristicRow{WS: 45})
	if _, err := p.RollWeapon(toRaw(t, stats), "Sword", "NOT_A_SKILL", "+4", 0, 0); err == nil {
		t.Error("expected error for unknown weapon skill, got nil")
	}
}

// ---------------------------------------------------------------------------
// rollDamage
// ---------------------------------------------------------------------------

func TestRollDamage(t *testing.T) {
	t.Run("empty formula", func(t *testing.T) {
		p := newTestPlugin(0)
		if got := p.rollDamage("", 0); got != 0 {
			t.Errorf("rollDamage(\"\") = %d, want 0", got)
		}
	})

	t.Run("flat bonus", func(t *testing.T) {
		p := newTestPlugin(0)
		if got := p.rollDamage("+4", 0); got != 4 {
			t.Errorf("rollDamage(+4) = %d, want 4", got)
		}
	})

	t.Run("dice plus SL substitution", func(t *testing.T) {
		// 1d10 die forced to 6 (Intn(10)=5), SL=3 -> 6 + 3 = 9.
		p := newTestPlugin(5)
		if got := p.rollDamage("1d10+sl", 3); got != 9 {
			t.Errorf("rollDamage(1d10+sl, 3) = %d, want 9", got)
		}
	})

	t.Run("multiple dice", func(t *testing.T) {
		// 2d6: dice forced to 3 and 4 (Intn->2, Intn->3) -> 7.
		p := newTestPlugin(2, 3)
		if got := p.rollDamage("2d6", 0); got != 7 {
			t.Errorf("rollDamage(2d6) = %d, want 7", got)
		}
	})
}

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

func TestDisplayName(t *testing.T) {
	p := New()

	t.Run("get reads basicInfo.name", func(t *testing.T) {
		stats := Stats{BasicInfo: BasicInfo{Name: "Gunnar"}}
		if got := p.GetDisplayName(toRaw(t, stats)); got != "Gunnar" {
			t.Errorf("GetDisplayName() = %q, want Gunnar", got)
		}
	})

	t.Run("set then get round-trips", func(t *testing.T) {
		stats := Stats{BasicInfo: BasicInfo{Name: "Old"}}
		updated, err := p.SetDisplayName(toRaw(t, stats), "New Name")
		if err != nil {
			t.Fatalf("SetDisplayName() error: %v", err)
		}
		if got := p.GetDisplayName(updated); got != "New Name" {
			t.Errorf("GetDisplayName(after set) = %q, want New Name", got)
		}
	})

	t.Run("empty stats returns empty name", func(t *testing.T) {
		if got := p.GetDisplayName(bson.Raw{}); got != "" {
			t.Errorf("GetDisplayName(empty) = %q, want empty", got)
		}
	})

	t.Run("missing basicInfo returns empty name", func(t *testing.T) {
		raw, err := bson.Marshal(bson.M{"foo": "bar"})
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		if got := p.GetDisplayName(raw); got != "" {
			t.Errorf("GetDisplayName(no basicInfo) = %q, want empty", got)
		}
	})

	t.Run("set on empty stats is a no-op", func(t *testing.T) {
		out, err := p.SetDisplayName(bson.Raw{}, "ignored")
		if err != nil {
			t.Fatalf("SetDisplayName(empty) error: %v", err)
		}
		if len(out) != 0 {
			t.Errorf("SetDisplayName(empty) = %v, want empty raw unchanged", out)
		}
	})
}
