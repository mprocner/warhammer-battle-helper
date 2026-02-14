package service

import (
	"battle-helper/internal/http/responses"
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

// isDoublet checks if a d100 roll is a doublet (both dice show the same number).
// Doublets: 11, 22, 33, 44, 55, 66, 77, 88, 99, and 100 (00 on real dice).
func isDoublet(roll int) bool {
	return roll == 100 || (roll >= 11 && roll <= 99 && roll%11 == 0)
}

func (d Dice) Fight(attacker *models.Character, defender *models.Character, modifier int, defenderModifier int) responses.FightResult {
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
	defenderSuccessLevel := d.calculateSuccessLevel(defenderResult, defenderWSWithModifier)

	// Create attacker result
	attackerFightResult := responses.FightCharacterResult{
		CharacterID:   attacker.ID.Hex(),
		CharacterName: attacker.BasicInfo.Name,
		Roll:          attackerResult,
		SuccessLevel:  attackerSuccessLevel,
		TargetValue:   attackerWSWithModifier,
		Modifier:      modifier,
		BaseValue:     attackerWS,
		IsCritSuccess: isDoublet(attackerResult) && attackerSuccessLevel >= 0,
		IsCritFailure: isDoublet(attackerResult) && attackerSuccessLevel < 0,
	}

	// Create defender result
	defenderFightResult := responses.FightCharacterResult{
		CharacterID:   defender.ID.Hex(),
		CharacterName: defender.BasicInfo.Name,
		Roll:          defenderResult,
		SuccessLevel:  defenderSuccessLevel,
		TargetValue:   defenderWSWithModifier,
		Modifier:      defenderModifier,
		BaseValue:     defenderWS,
		IsCritSuccess: isDoublet(defenderResult) && defenderSuccessLevel >= 0,
		IsCritFailure: isDoublet(defenderResult) && defenderSuccessLevel < 0,
	}

	// Determine winner
	absSuccessLevels := int(math.Round(math.Abs(float64(attackerSuccessLevel) - float64(defenderSuccessLevel))))
	var winner *models.Character
	var attackerWins bool

	if attackerSuccessLevel > defenderSuccessLevel {
		winner = attacker
		attackerWins = true
	} else if defenderSuccessLevel > attackerSuccessLevel {
		winner = defender
		attackerWins = false
	} else {
		if attackerWS > defenderWS {
			winner = attacker
			attackerWins = true
		} else {
			winner = defender
			attackerWins = false
		}
	}

	// Calculate damage if attacker wins
	var damage, strengthBonus, weaponDamage int
	weaponName := "Unarmed"

	if attackerWins {
		strength := winner.Characteristics.Current.S
		if strength == 0 {
			strength = 30
		}
		strengthBonus = int(math.Floor(float64(strength / 10)))

		if len(winner.Weapons) > 0 {
			weaponName = winner.Weapons[0].Name
			weaponDamage = parseInt(winner.Weapons[0].Damage)
		}

		damage = absSuccessLevels + weaponDamage + strengthBonus
	}

	winnerResult := responses.FightWinner{
		CharacterID:     winner.ID.Hex(),
		CharacterName:   winner.BasicInfo.Name,
		AttackerWins:    attackerWins,
		NetSuccessLevel: absSuccessLevels,
		Damage:          damage,
		WeaponName:      weaponName,
		WeaponDamage:    weaponDamage,
		StrengthBonus:   strengthBonus,
	}

	return responses.FightResult{
		Attacker: attackerFightResult,
		Defender: defenderFightResult,
		Winner:   winnerResult,
	}
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
