package registry

import (
	"battle-helper/internal/systems"
	"battle-helper/internal/systems/coc7e"
	coc7e_dark_ages "battle-helper/internal/systems/coc7e_dark_ages"
	"battle-helper/internal/systems/dnd5e"
	"battle-helper/internal/systems/warhammer4e"
	"fmt"
)

var registry = map[string]systems.GameSystem{
	"warhammer4e":     warhammer4e.New(),
	"coc7e":           coc7e.New(),
	"coc7e_dark_ages": coc7e_dark_ages.New(),
	"dnd5e":           dnd5e.New(),
}

var systemOrder = []string{"warhammer4e", "coc7e", "coc7e_dark_ages", "dnd5e"}

// Get returns the plugin for the given system identifier.
// Returns an error if the system is unknown.
func Get(gameSystem string) (systems.GameSystem, error) {
	s, ok := registry[gameSystem]
	if !ok {
		return nil, fmt.Errorf("unknown game system: %q", gameSystem)
	}
	return s, nil
}

// ListSystems returns all registered system keys in a stable order.
func ListSystems() []string {
	out := make([]string, 0, len(systemOrder))
	for _, k := range systemOrder {
		if _, ok := registry[k]; ok {
			out = append(out, k)
		}
	}
	return out
}
