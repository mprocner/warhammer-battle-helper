package service

import (
	"battle-helper/internal/http/requests"
	"battle-helper/internal/http/responses"
	"battle-helper/internal/repository"
	"fmt"
)

type FightService struct {
	CharRepo *repository.CharactersRepository
}

func NewFightService(charRepo *repository.CharactersRepository) *FightService {
	return &FightService{CharRepo: charRepo}
}

func (fs *FightService) Fight(request requests.FightRequest) responses.FightResponse {

	fmt.Printf("Fetching attacker with ID: %s\n", request.Attacker.Id)
	attackerChar, err := fs.CharRepo.GetByID(request.Attacker.Id)
	if err != nil {
		fmt.Printf("Error fetching attacker: %v\n", err)
	} else {
		fmt.Printf("Attacker: %+v\n", attackerChar)
	}
	fmt.Printf("Fetching defender with ID: %s\n", request.Defender.Id)
	defenderChar, err := fs.CharRepo.GetByID(request.Defender.Id)
	if err != nil {
		fmt.Printf("Error fetching defender: %v\n", err)
	} else {
		fmt.Printf("Defender: %+v\n", defenderChar)
	}
	fmt.Println("FightService.Fight called with request:")

	rolls := Dice{Sizes: 100}

	return responses.FightResponse{Messages: rolls.Fight(attackerChar, defenderChar, request.Attacker.Modifier, request.Defender.Modifier)}
}
