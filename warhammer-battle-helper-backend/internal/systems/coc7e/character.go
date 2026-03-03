package coc7e

// Stats holds all Call of Cthulhu 7e character data.
// It is serialised as BSON and stored in Character.Stats.
type Stats struct {
	// Core attributes (base values, e.g. 3d6*5 for STR)
	STR int `bson:"str" json:"str"`
	CON int `bson:"con" json:"con"`
	SIZ int `bson:"siz" json:"siz"`
	DEX int `bson:"dex" json:"dex"`
	APP int `bson:"app" json:"app"`
	INT int `bson:"int" json:"int"`
	POW int `bson:"pow" json:"pow"`
	EDU int `bson:"edu" json:"edu"`

	// Derived / tracked values
	HP        int `bson:"hp" json:"hp"`
	HPMax     int `bson:"hpMax" json:"hpMax"`
	MP        int `bson:"mp" json:"mp"`
	MPMax     int `bson:"mpMax" json:"mpMax"`
	Sanity    int `bson:"sanity" json:"sanity"`
	SanityMax int `bson:"sanityMax" json:"sanityMax"`
	Luck      int `bson:"luck" json:"luck"`

	// Damage Bonus & Build
	DamageBonus string `bson:"damageBonus" json:"damageBonus"`
	Build       int    `bson:"build" json:"build"`

	// Skills: key -> current percentage (e.g. "fighting_brawl" -> 65)
	Skills map[string]int `bson:"skills" json:"skills"`

	// Occupational info
	Occupation string `bson:"occupation" json:"occupation"`
	Age        int    `bson:"age" json:"age"`
	Sex        string `bson:"sex" json:"sex"`
	Residence  string `bson:"residence" json:"residence"`
	Birthplace string `bson:"birthplace" json:"birthplace"`

	// Weapons: simplified list
	Weapons []CoCWeapon `bson:"weapons" json:"weapons"`

	// Background / flavour text
	PersonalDescription    string `bson:"personalDescription" json:"personalDescription"`
	Ideology               string `bson:"ideology" json:"ideology"`
	Traits                 string `bson:"traits" json:"traits"`
	InjuriesScars          string `bson:"injuriesScars" json:"injuriesScars"`
	PhobiasManias          string `bson:"phobiasManias" json:"phobiasManias"`
	ArcaneTomes            string `bson:"arcaneTomes" json:"arcaneTomes"`
	Possessions            string `bson:"possessions" json:"possessions"`
	Spells                 string `bson:"spells" json:"spells"`
	EncountersWithEntities string `bson:"encountersWithEntities" json:"encountersWithEntities"`
}

// CoCWeapon is a simple CoC weapon entry (damage dice + skill key).
type CoCWeapon struct {
	Name     string `bson:"name" json:"name"`
	SkillKey string `bson:"skillKey" json:"skillKey"` // e.g. "fighting_brawl"
	Damage   string `bson:"damage" json:"damage"`     // e.g. "1d3+db"
	Range    string `bson:"range" json:"range"`
	Ammo     int    `bson:"ammo" json:"ammo"`
}
