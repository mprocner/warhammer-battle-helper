package service

import (
	"testing"
)

func TestDice_Roll(t *testing.T) {
	tests := []struct {
		name     string
		diceSize int
	}{
		{"D6", 6},
		{"D10", 10},
		{"D20", 20},
		{"D100", 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dice := Dice{Sizes: tt.diceSize}

			// Roll multiple times to test range
			for i := 0; i < 100; i++ {
				result := dice.Roll()

				if result < 1 || result > tt.diceSize {
					t.Errorf("Roll() = %d, want value between 1 and %d", result, tt.diceSize)
				}
			}
		})
	}
}
