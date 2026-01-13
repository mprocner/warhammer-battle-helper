package responses

type FightResponse struct {
	Result FightResult `json:"result" bson:"result"`
}

type FightResult struct {
	Attacker FightCharacterResult `json:"attacker" bson:"attacker"`
	Defender FightCharacterResult `json:"defender" bson:"defender"`
	Winner   FightWinner          `json:"winner" bson:"winner"`
}

type FightCharacterResult struct {
	CharacterID   string `json:"characterId" bson:"characterId"`
	CharacterName string `json:"characterName" bson:"characterName"`
	Roll          int    `json:"roll" bson:"roll"`
	SuccessLevel  int    `json:"successLevel" bson:"successLevel"`
	TargetValue   int    `json:"targetValue" bson:"targetValue"`
	Modifier      int    `json:"modifier" bson:"modifier"`
	BaseValue     int    `json:"baseValue" bson:"baseValue"`
	IsCritSuccess bool   `json:"isCritSuccess" bson:"isCritSuccess"`
	IsCritFailure bool   `json:"isCritFailure" bson:"isCritFailure"`
}

type FightWinner struct {
	CharacterID     string `json:"characterId" bson:"characterId"`
	CharacterName   string `json:"characterName" bson:"characterName"`
	AttackerWins    bool   `json:"attackerWins" bson:"attackerWins"`
	NetSuccessLevel int    `json:"netSuccessLevel" bson:"netSuccessLevel"`
	Damage          int    `json:"damage" bson:"damage"`
	WeaponName      string `json:"weaponName" bson:"weaponName"`
	WeaponDamage    int    `json:"weaponDamage" bson:"weaponDamage"`
	StrengthBonus   int    `json:"strengthBonus" bson:"strengthBonus"`
}
