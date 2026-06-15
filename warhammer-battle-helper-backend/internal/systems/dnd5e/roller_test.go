package dnd5e

import (
	gsys "battle-helper/internal/systems"
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// seqRoller is a strict deterministic Roller: it returns the supplied raw values
// in order and panics if more rolls are requested than provided. Because rollD20
// computes Intn(20)+1, to force a d20 of 15 supply 14.
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
// abilityMod — floor division with negative correction
// ---------------------------------------------------------------------------

func TestAbilityMod(t *testing.T) {
	tests := []struct {
		score int
		want  int
	}{
		{10, 0}, {11, 0}, {12, 1}, {20, 5}, {30, 10},
		{9, -1}, // floor(-0.5) = -1, not 0
		{8, -1}, // -2/2 = -1
		{7, -2}, // floor(-1.5) = -2
		{3, -4}, // floor(-3.5) = -4
		{1, -5}, // floor(-4.5) = -5
	}
	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			if got := abilityMod(tt.score); got != tt.want {
				t.Errorf("abilityMod(%d) = %d, want %d", tt.score, got, tt.want)
			}
		})
	}
}

func TestProficiencyBonus(t *testing.T) {
	tests := []struct {
		level int
		want  int
	}{
		{1, 2}, {4, 2}, {5, 3}, {8, 3}, {9, 4},
		{12, 4}, {13, 5}, {16, 5}, {17, 6}, {20, 6},
	}
	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			if got := proficiencyBonus(tt.level); got != tt.want {
				t.Errorf("proficiencyBonus(%d) = %d, want %d", tt.level, got, tt.want)
			}
		})
	}
}

func TestAbilityModByKey(t *testing.T) {
	a := &Abilities{STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 8, CHA: 18}
	tests := map[string]int{
		"str": 3, "dex": 2, "con": 1, "int": 0, "wis": -1, "cha": 4, "unknown": 0,
	}
	for key, want := range tests {
		if got := abilityModByKey(a, key); got != want {
			t.Errorf("abilityModByKey(%q) = %d, want %d", key, got, want)
		}
	}
}

func TestSaveProfByKey(t *testing.T) {
	sp := &SavingThrowProfs{STR: true, CON: true}
	if !saveProfByKey(sp, "str") || !saveProfByKey(sp, "con") {
		t.Error("expected STR and CON proficiencies to be true")
	}
	if saveProfByKey(sp, "dex") || saveProfByKey(sp, "unknown") {
		t.Error("expected DEX and unknown to be false")
	}
}

// ---------------------------------------------------------------------------
// rollWithAdvantage
// ---------------------------------------------------------------------------

func TestRollWithAdvantage(t *testing.T) {
	t.Run("normal rolls a single d20", func(t *testing.T) {
		p := newTestPlugin(9) // d20 = 10
		roll, all := p.rollWithAdvantage(0)
		if roll != 10 || !reflect.DeepEqual(all, []int{10}) {
			t.Errorf("got roll=%d all=%v, want 10/[10]", roll, all)
		}
	})

	t.Run("advantage takes the higher of two", func(t *testing.T) {
		p := newTestPlugin(4, 14) // 5, 15
		roll, all := p.rollWithAdvantage(1)
		if roll != 15 || !reflect.DeepEqual(all, []int{5, 15}) {
			t.Errorf("got roll=%d all=%v, want 15/[5 15]", roll, all)
		}
	})

	t.Run("disadvantage takes the lower of two", func(t *testing.T) {
		p := newTestPlugin(14, 4) // 15, 5
		roll, all := p.rollWithAdvantage(-1)
		if roll != 5 || !reflect.DeepEqual(all, []int{15, 5}) {
			t.Errorf("got roll=%d all=%v, want 5/[15 5]", roll, all)
		}
	})

	t.Run("advantage on a tie returns first", func(t *testing.T) {
		p := newTestPlugin(9, 9) // 10, 10
		roll, all := p.rollWithAdvantage(1)
		if roll != 10 || !reflect.DeepEqual(all, []int{10, 10}) {
			t.Errorf("got roll=%d all=%v, want 10/[10 10]", roll, all)
		}
	})
}

// ---------------------------------------------------------------------------
// skillKeyToBonus
// ---------------------------------------------------------------------------

func TestSkillKeyToBonus(t *testing.T) {
	stats := &Stats{
		Info:             CharacterInfo{Level: 5}, // pb = 3
		Abilities:        Abilities{STR: 14, DEX: 16},
		SavingThrowProfs: SavingThrowProfs{DEX: true},
		SkillProfs:       map[string]int{"athletics": 2}, // expertise
	}

	t.Run("initiative uses DEX mod", func(t *testing.T) {
		bonus, name, err := skillKeyToBonus(stats, "initiative")
		if err != nil || bonus != 3 || name != "Initiative" {
			t.Errorf("got bonus=%d name=%q err=%v, want 3/Initiative/nil", bonus, name, err)
		}
	})

	t.Run("ability check is raw mod", func(t *testing.T) {
		bonus, name, _ := skillKeyToBonus(stats, "ability_str")
		if bonus != 2 || name != "Strength Check" {
			t.Errorf("got bonus=%d name=%q, want 2/Strength Check", bonus, name)
		}
	})

	t.Run("proficient save adds proficiency bonus", func(t *testing.T) {
		bonus, name, _ := skillKeyToBonus(stats, "save_dex")
		if bonus != 6 || name != "Dexterity Saving Throw" { // mod 3 + pb 3
			t.Errorf("got bonus=%d name=%q, want 6/Dexterity Saving Throw", bonus, name)
		}
	})

	t.Run("non-proficient save is just the mod", func(t *testing.T) {
		bonus, _, _ := skillKeyToBonus(stats, "save_str")
		if bonus != 2 { // STR mod only
			t.Errorf("got bonus=%d, want 2", bonus)
		}
	})

	t.Run("skill with expertise doubles proficiency", func(t *testing.T) {
		bonus, name, _ := skillKeyToBonus(stats, "skill_athletics")
		if bonus != 8 || name != "Athletics" { // STR mod 2 + pb 3 * 2
			t.Errorf("got bonus=%d name=%q, want 8/Athletics", bonus, name)
		}
	})

	t.Run("unknown skill key errors", func(t *testing.T) {
		if _, _, err := skillKeyToBonus(stats, "skill_made_up"); err == nil {
			t.Error("expected error for unknown skill, got nil")
		}
	})

	t.Run("unrecognised format errors", func(t *testing.T) {
		if _, _, err := skillKeyToBonus(stats, "garbage"); err == nil {
			t.Error("expected error for bad format, got nil")
		}
	})
}

// ---------------------------------------------------------------------------
// RollSkill
// ---------------------------------------------------------------------------

func TestRollSkill_NoDC(t *testing.T) {
	stats := Stats{Info: CharacterInfo{Level: 1}, Abilities: Abilities{STR: 14}}
	p := newTestPlugin(9) // d20 = 10
	res, err := p.RollSkill(toRaw(t, stats), "ability_str", 0, 0, 0)
	if err != nil {
		t.Fatalf("RollSkill() error: %v", err)
	}
	// total = d20 10 + STR mod 2 + modifier 0 = 12
	if res.D20Roll != 10 || res.BonusTotal != 2 || res.Roll != 12 {
		t.Errorf("got D20=%d Bonus=%d Roll=%d, want 10/2/12", res.D20Roll, res.BonusTotal, res.Roll)
	}
	if res.Outcome != "rolled" {
		t.Errorf("Outcome = %q, want rolled (no DC)", res.Outcome)
	}
}

func TestRollSkill_DCOutcomes(t *testing.T) {
	stats := Stats{Info: CharacterInfo{Level: 1}, Abilities: Abilities{STR: 14}} // mod +2

	t.Run("success when total meets DC", func(t *testing.T) {
		p := newTestPlugin(12) // d20 13, total 15
		res, _ := p.RollSkill(toRaw(t, stats), "ability_str", 0, 0, 15)
		if res.Outcome != "success" {
			t.Errorf("Outcome = %q, want success (15>=15)", res.Outcome)
		}
	})

	t.Run("failure when total below DC", func(t *testing.T) {
		p := newTestPlugin(9) // d20 10, total 12
		res, _ := p.RollSkill(toRaw(t, stats), "ability_str", 0, 0, 15)
		if res.Outcome != "failure" {
			t.Errorf("Outcome = %q, want failure (12<15)", res.Outcome)
		}
	})

	t.Run("natural 20 is critical success regardless of total", func(t *testing.T) {
		p := newTestPlugin(19) // d20 = 20
		res, _ := p.RollSkill(toRaw(t, stats), "ability_str", 0, 0, 30)
		if res.Outcome != "critical_success" || !res.IsCriticalHit {
			t.Errorf("got Outcome=%q IsCrit=%v, want critical_success/true", res.Outcome, res.IsCriticalHit)
		}
	})

	t.Run("natural 1 is critical failure", func(t *testing.T) {
		p := newTestPlugin(0) // d20 = 1
		res, _ := p.RollSkill(toRaw(t, stats), "ability_str", 0, 0, 5)
		if res.Outcome != "critical_failure" {
			t.Errorf("Outcome = %q, want critical_failure", res.Outcome)
		}
	})
}

func TestRollSkill_Advantage(t *testing.T) {
	stats := Stats{Info: CharacterInfo{Level: 1}, Abilities: Abilities{STR: 14}}
	p := newTestPlugin(4, 19) // 5, 20 -> advantage takes 20
	res, _ := p.RollSkill(toRaw(t, stats), "ability_str", 0, 1, 15)
	if res.D20Roll != 20 || !res.IsAdvantage {
		t.Errorf("got D20=%d IsAdvantage=%v, want 20/true", res.D20Roll, res.IsAdvantage)
	}
	if !reflect.DeepEqual(res.AllRolls, []int{5, 20}) {
		t.Errorf("AllRolls = %v, want [5 20]", res.AllRolls)
	}
	if res.Outcome != "critical_success" {
		t.Errorf("Outcome = %q, want critical_success", res.Outcome)
	}
}

func TestRollSkill_Error(t *testing.T) {
	stats := Stats{Info: CharacterInfo{Level: 1}}
	p := newTestPlugin(9)
	if _, err := p.RollSkill(toRaw(t, stats), "not_a_valid_key", 0, 0, 0); err == nil {
		t.Error("expected error for invalid skillKey, got nil")
	}
}

// ---------------------------------------------------------------------------
// RollWeapon
// ---------------------------------------------------------------------------

func TestRollWeapon_ProficientHitNoAC(t *testing.T) {
	stats := Stats{
		Info:      CharacterInfo{Level: 1}, // pb 2
		Abilities: Abilities{STR: 16},      // mod 3
		Weapons:   []Weapon{{Name: "Longsword", Proficient: true}},
	}
	// d20: Intn(20)=9 -> 10. damage 1d8: Intn(8)=5 -> 6.
	p := newTestPlugin(9, 5)
	res, err := p.RollWeapon(toRaw(t, stats), "Longsword", "str", "1d8", 0, 0)
	if err != nil {
		t.Fatalf("RollWeapon() error: %v", err)
	}
	// attackBonus = STR mod 3 + pb 2 = 5; attackTotal = 10 + 5 = 15.
	if res.BonusTotal != 5 || res.Roll != 15 {
		t.Errorf("got Bonus=%d Roll=%d, want 5/15", res.BonusTotal, res.Roll)
	}
	if res.Outcome != "rolled" {
		t.Errorf("Outcome = %q, want rolled (no AC)", res.Outcome)
	}
	// damage = die 6 + ability mod 3 (NOT attackBonus) = 9.
	if res.DamageRoll != 9 {
		t.Errorf("DamageRoll = %d, want 9 (die 6 + ability 3)", res.DamageRoll)
	}
}

func TestRollWeapon_CriticalHitDoublesDice(t *testing.T) {
	stats := Stats{
		Info:      CharacterInfo{Level: 1},
		Abilities: Abilities{STR: 16}, // mod 3
		Weapons:   []Weapon{{Name: "Axe", Proficient: false}},
	}
	// d20 = 20 -> crit. 1d8 doubled to 2 dice: Intn(8)=5->6, Intn(8)=7->8 = 14; + ability 3 = 17.
	p := newTestPlugin(19, 5, 7)
	res, _ := p.RollWeapon(toRaw(t, stats), "Axe", "str", "1d8", 0, 0)
	if res.Outcome != "critical_hit" || !res.IsCriticalHit {
		t.Errorf("got Outcome=%q IsCrit=%v, want critical_hit/true", res.Outcome, res.IsCriticalHit)
	}
	if res.DamageRoll != 17 {
		t.Errorf("DamageRoll = %d, want 17 (2x1d8 = 14 + ability 3)", res.DamageRoll)
	}
}

func TestRollWeapon_CriticalMissRollsNoDamage(t *testing.T) {
	stats := Stats{
		Info:      CharacterInfo{Level: 1},
		Abilities: Abilities{STR: 16},
		Weapons:   []Weapon{{Name: "Axe", Proficient: true}},
	}
	// d20 = 1 -> critical_miss; isHit false -> damage NOT rolled.
	// Strict roller proves no extra roll: only one value supplied.
	p := newTestPlugin(0)
	res, _ := p.RollWeapon(toRaw(t, stats), "Axe", "str", "1d8", 0, 0)
	if res.Outcome != "critical_miss" {
		t.Errorf("Outcome = %q, want critical_miss", res.Outcome)
	}
	if res.DamageRoll != 0 {
		t.Errorf("DamageRoll = %d, want 0 (no damage on miss)", res.DamageRoll)
	}
}

func TestRollWeapon_HitMissByAC(t *testing.T) {
	stats := Stats{
		Info:      CharacterInfo{Level: 1},
		Abilities: Abilities{STR: 16}, // mod 3
		Weapons:   []Weapon{{Name: "Mace", Proficient: true}},
	}

	t.Run("miss when total below AC", func(t *testing.T) {
		// d20 10 + bonus 5 = 15 vs AC 20 -> miss, no damage (one roll only).
		p := newTestPlugin(9)
		res, _ := p.RollWeapon(toRaw(t, stats), "Mace", "str", "1d6", 20, 0)
		if res.Outcome != "miss" || res.DamageRoll != 0 {
			t.Errorf("got Outcome=%q Damage=%d, want miss/0", res.Outcome, res.DamageRoll)
		}
	})

	t.Run("hit when total meets AC", func(t *testing.T) {
		// d20 10 + bonus 5 = 15 vs AC 12 -> hit; damage 1d6 Intn(6)=3->4 + ability 3 = 7.
		p := newTestPlugin(9, 3)
		res, _ := p.RollWeapon(toRaw(t, stats), "Mace", "str", "1d6", 12, 0)
		if res.Outcome != "hit" || res.DamageRoll != 7 {
			t.Errorf("got Outcome=%q Damage=%d, want hit/7", res.Outcome, res.DamageRoll)
		}
	})
}

func TestRollWeapon_SpellcastingAbility(t *testing.T) {
	stats := Stats{
		Info:                CharacterInfo{Level: 1},
		Abilities:           Abilities{INT: 18}, // mod 4
		SpellcastingAbility: "int",
	}
	// weaponSkill "spellcasting" -> uses INT mod 4; not proficient (weapon not listed).
	p := newTestPlugin(9, 2) // d20 10; damage 1d10 Intn(10)=2 -> 3
	res, _ := p.RollWeapon(toRaw(t, stats), "Firebolt", "spellcasting", "1d10", 0, 0)
	if res.BonusTotal != 4 {
		t.Errorf("BonusTotal = %d, want 4 (INT mod)", res.BonusTotal)
	}
	if res.DamageRoll != 7 { // die 3 + ability 4
		t.Errorf("DamageRoll = %d, want 7", res.DamageRoll)
	}
}

// ---------------------------------------------------------------------------
// rollDamage
// ---------------------------------------------------------------------------

func TestRollDamage(t *testing.T) {
	t.Run("empty formula", func(t *testing.T) {
		p := newTestPlugin()
		total, breakdown := p.rollDamage("", 0, false)
		if total != 0 || breakdown != "" {
			t.Errorf("got (%d,%q), want (0,\"\")", total, breakdown)
		}
	})

	t.Run("single die plus ability mod", func(t *testing.T) {
		p := newTestPlugin(5) // Intn(8)=5 -> 6
		total, _ := p.rollDamage("1d8", 3, false)
		if total != 9 {
			t.Errorf("rollDamage(1d8, +3) = %d, want 9", total)
		}
	})

	t.Run("dice plus flat plus ability", func(t *testing.T) {
		// 2d6: 4 + 6 = 10; flat +3; ability +2 -> 15.
		p := newTestPlugin(3, 5)
		total, _ := p.rollDamage("2d6+3", 2, false)
		if total != 15 {
			t.Errorf("rollDamage(2d6+3, +2) = %d, want 15", total)
		}
	})

	t.Run("critical doubles the dice but not the modifier", func(t *testing.T) {
		// 1d8 crit -> 2 dice: 6 + 8 = 14; ability +3 (added once) -> 17.
		p := newTestPlugin(5, 7)
		total, _ := p.rollDamage("1d8", 3, true)
		if total != 17 {
			t.Errorf("rollDamage(1d8, +3, crit) = %d, want 17", total)
		}
	})

	t.Run("negative ability modifier", func(t *testing.T) {
		p := newTestPlugin(3) // Intn(6)=3 -> 4
		total, _ := p.rollDamage("1d6", -1, false)
		if total != 3 {
			t.Errorf("rollDamage(1d6, -1) = %d, want 3", total)
		}
	})
}

// ---------------------------------------------------------------------------
// ComputeDerived
// ---------------------------------------------------------------------------

func TestComputeDerived(t *testing.T) {
	p := New()
	stats := Stats{
		Info:                CharacterInfo{Level: 5}, // pb 3
		Abilities:           Abilities{STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 13, CHA: 8},
		SavingThrowProfs:    SavingThrowProfs{STR: true},
		SkillProfs:          map[string]int{"athletics": 1, "perception": 2},
		IsSpellcaster:       true,
		SpellcastingAbility: "wis",
		Resources:           Resources{HP: 50, HPMax: 40},
	}
	out, err := p.ComputeDerived(toRaw(t, stats))
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, err := decodeStats(out)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	d := got.Derived

	if d.ProficiencyBonus != 3 {
		t.Errorf("ProficiencyBonus = %d, want 3", d.ProficiencyBonus)
	}
	if d.AbilityMods.STR != 3 || d.AbilityMods.CHA != -1 {
		t.Errorf("AbilityMods STR/CHA = %d/%d, want 3/-1", d.AbilityMods.STR, d.AbilityMods.CHA)
	}
	// STR save: mod 3 + pb 3 = 6 (proficient); DEX save: mod 2 (not proficient).
	if d.SavingThrows.STR != 6 || d.SavingThrows.DEX != 2 {
		t.Errorf("SavingThrows STR/DEX = %d/%d, want 6/2", d.SavingThrows.STR, d.SavingThrows.DEX)
	}
	// athletics: STR 3 + pb 3 * 1 = 6; perception: WIS 1 + pb 3 * 2 = 7.
	if d.Skills["athletics"] != 6 || d.Skills["perception"] != 7 {
		t.Errorf("Skills athletics/perception = %d/%d, want 6/7", d.Skills["athletics"], d.Skills["perception"])
	}
	if d.PassivePerception != 17 { // 10 + perception 7
		t.Errorf("PassivePerception = %d, want 17", d.PassivePerception)
	}
	if d.Initiative != 2 { // DEX mod
		t.Errorf("Initiative = %d, want 2", d.Initiative)
	}
	// Spell DC = 8 + pb 3 + WIS mod 1 = 12; spell attack = pb 3 + 1 = 4.
	if d.SpellSaveDC != 12 || d.SpellAttackBonus != 4 {
		t.Errorf("got SpellSaveDC=%d SpellAttackBonus=%d, want 12/4", d.SpellSaveDC, d.SpellAttackBonus)
	}
	// HP clamped to max.
	if got.Resources.HP != 40 {
		t.Errorf("HP = %d, want 40 (clamped to max)", got.Resources.HP)
	}
}

func TestComputeDerived_InitialisesNilCollections(t *testing.T) {
	p := New()
	out, err := p.ComputeDerived(toRaw(t, Stats{}))
	if err != nil {
		t.Fatalf("ComputeDerived() error: %v", err)
	}
	got, _ := decodeStats(out)
	if got.SkillProfs == nil || got.Weapons == nil || got.Features == nil ||
		got.SpellSlots == nil || got.Spells == nil {
		t.Errorf("expected non-nil collections, got %+v", got)
	}
}

// ---------------------------------------------------------------------------
// DefaultStats + display name
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
	if stats.Info.Level != 1 {
		t.Errorf("Level = %d, want 1", stats.Info.Level)
	}
	if stats.Abilities.STR != 10 {
		t.Errorf("STR = %d, want 10", stats.Abilities.STR)
	}
	if stats.SkillProfs == nil || stats.Weapons == nil {
		t.Error("expected SkillProfs and Weapons non-nil")
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
