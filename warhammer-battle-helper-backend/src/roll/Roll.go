package roll

import (
	"fmt"
	"math"
	"math/rand"
	"test/warhammer"
)

type Dice struct {
	Sizes int
}

func (d Dice) Roll() int {
	return rand.Intn(d.Sizes) + 1
}

func (d Dice) Fight(attacker warhammer.Sheet, defender warhammer.Sheet) {
	attackerResult := d.Roll()
	defenderResult := d.Roll()

	attackerSuccessLevel := d.calculateSuccessLevel(attackerResult, attacker.Characteristics.WW)
	defenderSuccessLevel := d.calculateSuccessLevel(defenderResult, defender.Characteristics.WW)

	absSuccessLevels := int(math.Round(math.Abs(float64(attackerSuccessLevel) - float64(defenderSuccessLevel))))

	if attackerSuccessLevel > defenderSuccessLevel {
		d.prepareFightOutput(attacker, absSuccessLevels)
	} else if defenderSuccessLevel > attackerSuccessLevel {
		d.prepareFightOutput(defender, absSuccessLevels)
	} else {
		if attacker.Characteristics.WW > defender.Characteristics.WW {
			d.prepareFightOutput(attacker, absSuccessLevels)
		} else {
			d.prepareFightOutput(defender, absSuccessLevels)
		}
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

func (Dice) prepareFightOutput(winner warhammer.Sheet, successLevel int) {
	damages := successLevel + winner.Weapon.Bonus + int(math.Floor(float64(winner.Characteristics.S/10)))
	fmt.Printf("%s wins, SL: %d, hits by: %s for: %d\n", winner.BasicInfo.Name, successLevel, winner.Weapon.Name, damages)
}
