package dice

// Limits bound an expression so a single chat line cannot make the server roll
// millions of dice. Kept as a value so tests can tighten or loosen them.
type Limits struct {
	MaxLength      int // runes
	MaxTerms       int
	MaxDicePerTerm int
	MaxDiceTotal   int
	MinSides       int
	MaxSides       int
	MaxConstant    int
	MaxCheckTarget int
}

// DefaultLimits mirrors the chat roll limits agreed in PLAYRPG-231.
// MaxDicePerTerm matches the cap of the older POST /roll endpoint.
func DefaultLimits() Limits {
	return Limits{
		MaxLength:      100,
		MaxTerms:       10,
		MaxDicePerTerm: 20,
		MaxDiceTotal:   50,
		MinSides:       2,
		MaxSides:       1000,
		MaxConstant:    1000,
		MaxCheckTarget: 10000,
	}
}
