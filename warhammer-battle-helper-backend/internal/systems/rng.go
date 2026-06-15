package systems

import "math/rand"

// Roller is the minimal source of randomness a game system needs.
//
// Production code uses the default roller, which delegates to the package-level
// math/rand functions (internally mutex-protected, so safe for the single plugin
// instance shared across concurrent requests). Tests inject a deterministic
// implementation to control exact roll values.
//
// *rand.Rand also satisfies this interface, but note it is NOT safe for
// concurrent use — do not hand a shared *rand.Rand to a plugin singleton.
type Roller interface {
	Intn(n int) int
}

// globalRoller delegates to the global, mutex-protected math/rand source.
type globalRoller struct{}

func (globalRoller) Intn(n int) int { return rand.Intn(n) }

// DefaultRoller returns the production randomness source. It is concurrency-safe
// because it forwards to the locked package-level rand.Intn.
func DefaultRoller() Roller { return globalRoller{} }
