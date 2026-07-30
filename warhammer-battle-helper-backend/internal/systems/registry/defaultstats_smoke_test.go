package registry

import "testing"

// Character creation now seeds stats from the system's own DefaultStats, so every plugin must
// be able to read back what it writes. This guards the bug where new characters were born with
// a Warhammer-shaped stats blob regardless of system, and the custom plugin (weapons stored as
// a map, not an array) then failed to decode them on every roll.
func TestDefaultStatsRoundTripPerSystem(t *testing.T) {
	for _, name := range []string{"warhammer4e", "coc7e", "coc7e_dark_ages", "dnd5e", "custom"} {
		sys, err := Get(name)
		if err != nil {
			t.Fatalf("%s: registry.Get failed: %v", name, err)
		}

		stats, err := sys.DefaultStats()
		if err != nil {
			t.Fatalf("%s: DefaultStats failed: %v", name, err)
		}

		named, err := sys.SetDisplayName(stats, "Nowa Postać")
		if err != nil {
			t.Fatalf("%s: SetDisplayName on default stats failed: %v", name, err)
		}

		if _, err := sys.ComputeDerived(named); err != nil {
			t.Fatalf("%s: ComputeDerived on default stats failed: %v", name, err)
		}
	}
}
