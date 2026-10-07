// Package dice is the domain of dice expressions: grammar, validation and evaluation.
// It depends on nothing outside the standard library — persistence, transport and
// game rules live in the layers that call it.
package dice

import "fmt"

// Error codes returned by Parse. The frontend maps each one to the i18n key
// chat.commands.diceErrors.<code>, so renaming a code is a breaking change.
const (
	CodeEmpty               = "empty"
	CodeTooLong             = "too_long"
	CodeUnexpectedToken     = "unexpected_token"
	CodeUnexpectedEnd       = "unexpected_end"
	CodeNoDice              = "no_dice"
	CodePoolMixed           = "pool_mixed"
	CodePoolWithCheck       = "pool_with_check"
	CodeKeepOutOfRange      = "keep_out_of_range"
	CodeThresholdOutOfRange = "threshold_out_of_range"
	CodeSidesOutOfRange     = "sides_out_of_range"
	CodeCountOutOfRange     = "count_out_of_range"
	CodeTooManyDice         = "too_many_dice"
	CodeTooManyTerms        = "too_many_terms"
	CodeNumberOutOfRange    = "number_out_of_range"
)

// Error describes why an expression was rejected.
// Position is a rune offset into the input, or -1 when the problem is not tied to one spot.
type Error struct {
	Code     string
	Position int
	Params   map[string]int
}

func (e *Error) Error() string {
	return fmt.Sprintf("dice: %s at %d", e.Code, e.Position)
}

func newError(code string, position int, params map[string]int) *Error {
	return &Error{Code: code, Position: position, Params: params}
}
