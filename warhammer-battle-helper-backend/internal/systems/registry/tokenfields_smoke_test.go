package registry

import "testing"

func TestTokenFieldsBySystemSmoke(t *testing.T) {
	m := TokenFieldsBySystem()
	for _, sys := range []string{"warhammer4e", "coc7e", "coc7e_dark_ages", "dnd5e", "custom"} {
		if _, ok := m[sys]; !ok {
			t.Fatalf("missing system %q in token fields map", sys)
		}
	}
	if len(m["warhammer4e"]) == 0 || len(m["coc7e"]) == 0 || len(m["dnd5e"]) == 0 {
		t.Fatalf("expected non-empty field lists for hardcoded systems")
	}
	if len(m["custom"]) != 0 {
		t.Fatalf("expected empty field list for custom, got %d", len(m["custom"]))
	}
	// dark ages reuses coc7e plugin → same list
	if len(m["coc7e_dark_ages"]) != len(m["coc7e"]) {
		t.Fatalf("coc7e_dark_ages should mirror coc7e")
	}
	// spot-check a progress field carries a max key
	var foundHP bool
	for _, f := range m["coc7e"] {
		if f.Key == "resources.hp" {
			foundHP = true
			if f.Category != "progress" || f.ProgressMaxKey != "resources.hpMax" {
				t.Fatalf("coc7e HP field misconfigured: %+v", f)
			}
		}
	}
	if !foundHP {
		t.Fatal("coc7e HP field not found")
	}
}
