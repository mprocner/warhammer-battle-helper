package coc7e_dark_ages

import (
	_ "embed"

	"battle-helper/internal/systems/coc7e"
)

//go:embed skills.json
var skillsJSON []byte

// New returns a CoC Dark Ages plugin reusing all coc7e logic with Dark Ages skill list.
func New() *coc7e.Plugin {
	return coc7e.NewWithSkills(skillsJSON)
}
