package service

import (
	"battle-helper/internal/models"
	"math/rand"
	"testing"
)

// Helper function to create a test character
func createTestCharacter(name string, ww int, wwAdvances int, strength int, strengthAdvances int, weaponName string, weaponBonus int) *models.Character {
	return &models.Character{
		BasicInfo: models.BasicInfo{
			Name: name,
		},
		Characteristics: models.CharacteristicList{
			WW: models.Characteristic{
				Base:     ww,
				Advances: wwAdvances,
			},
			S: models.Characteristic{
				Base:     strength,
				Advances: strengthAdvances,
			},
		},
		Weapons: []models.Weapon{
			{
				Name:  weaponName,
				Bonus: weaponBonus,
			},
		},
	}
}

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

func TestDice_calculateSuccessLevel(t *testing.T) {
	dice := Dice{Sizes: 100}

	tests := []struct {
		name       string
		rollResult int
		attribute  int
		want       int
	}{
		{
			name:       "Critical success - rolled 01 with attribute 50",
			rollResult: 1,
			attribute:  50,
			want:       5, // floor(50/10) - floor(1/10) = 5 - 0 = 5
		},
		{
			name:       "Success - rolled 35 with attribute 50",
			rollResult: 35,
			attribute:  50,
			want:       2, // floor(50/10) - floor(35/10) = 5 - 3 = 2
		},
		{
			name:       "Exact match - rolled 50 with attribute 50",
			rollResult: 50,
			attribute:  50,
			want:       0, // floor(50/10) - floor(50/10) = 5 - 5 = 0
		},
		{
			name:       "Failure - rolled 60 with attribute 50",
			rollResult: 60,
			attribute:  50,
			want:       -1, // floor(50/10) - floor(60/10) = 5 - 6 = -1
		},
		{
			name:       "Critical failure - rolled 99 with attribute 30",
			rollResult: 99,
			attribute:  30,
			want:       -6, // floor(30/10) - floor(99/10) = 3 - 9 = -6
		},
		{
			name:       "Low attribute success - rolled 5 with attribute 15",
			rollResult: 5,
			attribute:  15,
			want:       1, // floor(15/10) - floor(5/10) = 1 - 0 = 1
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := dice.calculateSuccessLevel(tt.rollResult, tt.attribute)
			if got != tt.want {
				t.Errorf("calculateSuccessLevel(%d, %d) = %d, want %d", tt.rollResult, tt.attribute, got, tt.want)
			}
		})
	}
}

func TestDice_prepareFightOutput(t *testing.T) {
	dice := Dice{Sizes: 100}

	tests := []struct {
		name         string
		character    *models.Character
		successLevel int
		attackerWins bool
		wantContains []string
	}{
		{
			name:         "Attacker wins with 2 success levels",
			character:    createTestCharacter("Hero", 40, 5, 30, 0, "Sword", 7),
			successLevel: 2,
			attackerWins: true,
			wantContains: []string{"Hero", "wins", "Sword", "hits by"},
		},
		{
			name:         "Defender wins",
			character:    createTestCharacter("Villain", 50, 10, 40, 5, "Axe", 5),
			successLevel: 1,
			attackerWins: false,
			wantContains: []string{"Villain", "wins", "defends"},
		},
		{
			name:         "High damage win",
			character:    createTestCharacter("Warrior", 60, 0, 50, 10, "Greatsword", 10),
			successLevel: 5,
			attackerWins: true,
			wantContains: []string{"Warrior", "wins", "Greatsword"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := dice.prepareFightOutput(tt.character, tt.successLevel, tt.attackerWins)

			for _, want := range tt.wantContains {
				if !contains(got, want) {
					t.Errorf("prepareFightOutput() output %q does not contain %q", got, want)
				}
			}
		})
	}
}

func TestDice_Fight(t *testing.T) {
	// Set a seed for deterministic testing
	rand.Seed(42)

	dice := Dice{Sizes: 100}

	tests := []struct {
		name             string
		attacker         *models.Character
		defender         *models.Character
		modifier         int
		defenderModifier int
		wantMessageCount int
	}{
		{
			name:             "Basic fight - equal opponents",
			attacker:         createTestCharacter("Fighter A", 40, 0, 30, 0, "Sword", 7),
			defender:         createTestCharacter("Fighter B", 40, 0, 30, 0, "Sword", 7),
			modifier:         0,
			defenderModifier: 0,
			wantMessageCount: 3, // attacker roll, defender roll, result
		},
		{
			name:             "Fight with modifiers",
			attacker:         createTestCharacter("Knight", 50, 10, 40, 5, "Lance", 10),
			defender:         createTestCharacter("Goblin", 20, 0, 15, 0, "Dagger", 3),
			modifier:         10,
			defenderModifier: -10,
			wantMessageCount: 3,
		},
		{
			name:             "High skill attacker vs low skill defender",
			attacker:         createTestCharacter("Master", 70, 15, 50, 10, "Rapier", 8),
			defender:         createTestCharacter("Novice", 25, 0, 20, 0, "Club", 2),
			modifier:         0,
			defenderModifier: 0,
			wantMessageCount: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			messages := dice.Fight(tt.attacker, tt.defender, tt.modifier, tt.defenderModifier)

			if len(messages) != tt.wantMessageCount {
				t.Errorf("Fight() returned %d messages, want %d", len(messages), tt.wantMessageCount)
			}

			// Verify first message mentions attacker
			if !contains(messages[0], tt.attacker.BasicInfo.Name) {
				t.Errorf("First message should mention attacker %q, got %q", tt.attacker.BasicInfo.Name, messages[0])
			}

			// Verify second message mentions defender
			if !contains(messages[1], tt.defender.BasicInfo.Name) {
				t.Errorf("Second message should mention defender %q, got %q", tt.defender.BasicInfo.Name, messages[1])
			}

			// Verify third message mentions a winner
			if !contains(messages[2], "wins") {
				t.Errorf("Third message should mention a winner, got %q", messages[2])
			}
		})
	}
}

func TestDice_Fight_DeterministicOutcome(t *testing.T) {
	// This test uses a controlled dice roll scenario
	// We can't control rand.Intn directly in the current implementation,
	// but we can test the logic with fixed rolls by seeding

	rand.Seed(123) // Fixed seed for reproducible results

	dice := Dice{Sizes: 100}
	attacker := createTestCharacter("Hero", 50, 0, 35, 0, "Sword", 7)
	defender := createTestCharacter("Monster", 30, 0, 40, 0, "Claws", 5)

	messages := dice.Fight(attacker, defender, 0, 0)

	// Basic sanity checks
	if len(messages) != 3 {
		t.Fatalf("Expected 3 messages, got %d", len(messages))
	}

	// All messages should be non-empty
	for i, msg := range messages {
		if msg == "" {
			t.Errorf("Message %d is empty", i)
		}
	}
}

// Helper function to check if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
