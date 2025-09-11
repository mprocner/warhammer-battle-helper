package fight

import (
	"battle-helper/http/requests"
	"battle-helper/infrastructure/repositories"
	"battle-helper/roll"
	"fmt"
)

type FightService struct {
}

func (FightService) Fight(request requests.FightRequest) FightResponse {

	repo := repositories.NewCharactersRepository()
	fmt.Printf("Fetching attacker with ID: %s\n", request.Attacker.Id)
	attackerChar, err := repo.GetByID(request.Attacker.Id)
	if err != nil {
		fmt.Printf("Error fetching attacker: %v\n", err)
	} else {
		fmt.Printf("Attacker: %+v\n", attackerChar)
	}
	fmt.Printf("Fetching defender with ID: %s\n", request.Defender.Id)
	defenderChar, err := repo.GetByID(request.Defender.Id)
	if err != nil {
		fmt.Printf("Error fetching defender: %v\n", err)
	} else {
		fmt.Printf("Defender: %+v\n", defenderChar)
	}
	fmt.Println("FightService.Fight called with request:")
	// factory := warhammer.CharacterSheetFactory{}

	// m := make(map[string]string)
	// m["1"] = "LudgerCharacterSheet.json"
	// m["2"] = "WalterCharacterSheet.json"

	rolls := roll.Dice{Sizes: 100}
	// attacker := factory.Prepare(m[request.Attacker.Id])
	// defender := factory.Prepare(m[request.Defender.Id])

	return FightResponse{Messages: rolls.Fight(attackerChar, defenderChar, request.Attacker.Modifier, request.Defender.Modifier)}
}
