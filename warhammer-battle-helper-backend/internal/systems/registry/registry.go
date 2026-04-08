package registry

import (
	"battle-helper/internal/systems"
	"battle-helper/internal/systems/coc7e"
	"battle-helper/internal/systems/dnd5e"
	"battle-helper/internal/systems/warhammer4e"
	"fmt"
)

var registry = map[string]systems.GameSystem{
	"warhammer4e": warhammer4e.New(),
	"coc7e":       coc7e.New(),
	"dnd5e":       dnd5e.New(),
}

// Get returns the plugin for the given system identifier.
// Returns an error if the system is unknown.
func Get(gameSystem string) (systems.GameSystem, error) {
	s, ok := registry[gameSystem]
	if !ok {
		return nil, fmt.Errorf("unknown game system: %q", gameSystem)
	}
	return s, nil
}
