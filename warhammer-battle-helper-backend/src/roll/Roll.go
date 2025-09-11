package roll

import (
	"battle-helper/domain/models"
	"fmt"
	"math"
	"math/rand"
)

type Dice struct {
	Sizes int
}

func (d Dice) Roll() int {
	return rand.Intn(d.Sizes) + 1
}

func (d Dice) Fight(attacker *models.Character, defender *models.Character, modifier int, defenderModifier int) []string {
	var messages []string

	attackerResult := d.Roll()
	defenderResult := d.Roll()

	attackerWS := attacker.Characteristics.WW.Base + attacker.Characteristics.WW.Advances
	attackerWSWithModifier := attackerWS + modifier

	defenderWS := defender.Characteristics.WW.Base + defender.Characteristics.WW.Advances
	defenderWSWithModifier := defenderWS + defenderModifier

	attackerSuccessLevel := d.calculateSuccessLevel(attackerResult, attackerWSWithModifier)
	messages = append(messages, fmt.Sprintf("%s attack and rolls: %d, success level: %d, WW(%d): %d", attacker.BasicInfo.Name, attackerResult, attackerSuccessLevel, modifier, attackerWSWithModifier))
	defenderSuccessLevel := d.calculateSuccessLevel(defenderResult, defenderWSWithModifier)
	messages = append(messages, fmt.Sprintf("%s rolls: %d, success level: %d, WW(%d): %d", defender.BasicInfo.Name, defenderResult, defenderSuccessLevel, defenderModifier, defenderWSWithModifier))

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

		damages := successLevel + winner.Weapons[0].Bonus + int(math.Floor(float64((winner.Characteristics.S.Base+winner.Characteristics.S.Advances)/10)))
		return fmt.Sprintf("%s wins, hits by: %s for: %d(SL: %d, BS: %d, Weapon bonus: %d)",
			winner.BasicInfo.Name,
			winner.Weapons[0].Name,
			damages,
			successLevel,
			int(math.Round(float64(winner.Characteristics.S.Base+winner.Characteristics.S.Advances)/10)),
			winner.Weapons[0].Bonus)
	} else {
		return fmt.Sprintf("%s wins and defends", winner.BasicInfo.Name)
	}
}
