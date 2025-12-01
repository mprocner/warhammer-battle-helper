package service

import (
	"battle-helper/internal/models"
	"fmt"
	"math"
	"math/rand"
	"strconv"
)

type Dice struct {
	Sizes int
}

func (d Dice) Roll() int {
	return rand.Intn(d.Sizes) + 1
}

// Helper function to parse int from string, returns 0 if invalid
func parseInt(s string) int {
	val, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return val
}

func (d Dice) Fight(attacker *models.Character, defender *models.Character, modifier int, defenderModifier int) []string {
	var messages []string

	attackerResult := d.Roll()
	defenderResult := d.Roll()

	// Get WS from current characteristics (use 30 as default if not set)
	attackerWS := attacker.Characteristics.Current.WS
	if attackerWS == 0 {
		attackerWS = 30
	}
	attackerWSWithModifier := attackerWS + modifier

	defenderWS := defender.Characteristics.Current.WS
	if defenderWS == 0 {
		defenderWS = 30
	}
	defenderWSWithModifier := defenderWS + defenderModifier

	attackerSuccessLevel := d.calculateSuccessLevel(attackerResult, attackerWSWithModifier)
	messages = append(messages, fmt.Sprintf("%s attack and rolls: %d, success level: %d, WS(%d): %d", attacker.BasicInfo.Name, attackerResult, attackerSuccessLevel, modifier, attackerWSWithModifier))
	defenderSuccessLevel := d.calculateSuccessLevel(defenderResult, defenderWSWithModifier)
	messages = append(messages, fmt.Sprintf("%s rolls: %d, success level: %d, WS(%d): %d", defender.BasicInfo.Name, defenderResult, defenderSuccessLevel, defenderModifier, defenderWSWithModifier))

	absSuccessLevels := int(math.Round(math.Abs(float64(attackerSuccessLevel) - float64(defenderSuccessLevel))))

	if attackerSuccessLevel > defenderSuccessLevel {
		messages = append(messages, d.prepareFightOutput(attacker, absSuccessLevels, true))
	} else if defenderSuccessLevel > attackerSuccessLevel {
		messages = append(messages, d.prepareFightOutput(defender, absSuccessLevels, false))
	} else {
		if attackerWS > defenderWS {
			messages = append(messages, d.prepareFightOutput(attacker, absSuccessLevels, true))
		} else {
			messages = append(messages, d.prepareFightOutput(defender, absSuccessLevels, false))
		}
	}

	return messages

}

func (Dice) calculateSuccessLevel(rollResult int, attribute int) int {

	successLevel := int(math.Floor(float64(attribute/10)) - math.Floor(float64(rollResult/10)))
	if rollResult <= attribute {
		fmt.Println("Success! ", successLevel)
	} else {
		fmt.Println("Failure! ", successLevel)
	}
	return successLevel
}

func (Dice) prepareFightOutput(winner *models.Character, successLevel int, attackerWins bool) string {
	if attackerWins {
		// Parse Strength from current characteristics (use 30 as default)
		strength := winner.Characteristics.Current.S
		if strength == 0 {
			strength = 30
		}
		strengthBonus := int(math.Floor(float64(strength / 10)))

		// Get weapon damage (use default weapon if none specified)
		weaponName := "Unarmed"
		weaponDamage := 0
		if len(winner.Weapons) > 0 {
			weaponName = winner.Weapons[0].Name
			// Try to parse damage as integer, default to 0 if it's a complex string like "SB+4"
			weaponDamage = parseInt(winner.Weapons[0].Damage)
		}

		damages := successLevel + weaponDamage + strengthBonus
		return fmt.Sprintf("%s wins, hits by: %s for: %d(SL: %d, SB: %d, Weapon damage: %d)",
			winner.BasicInfo.Name,
			weaponName,
			damages,
			successLevel,
			strengthBonus,
			weaponDamage)
	} else {
		return fmt.Sprintf("%s wins and defends", winner.BasicInfo.Name)
	}
}
