package requests

type FightRequest struct {
	Attacker CharacterRequest `json:"attacker"`
	Defender CharacterRequest `json:"defender"`
	ZoneId   string           `json:"zoneId"`
}

type CharacterRequest struct {
	Id       string `json:"id"`
	Modifier int    `json:"modifier"`
}
