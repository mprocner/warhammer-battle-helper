package coc7e

import (
	"encoding/json"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsontype"
	"go.mongodb.org/mongo-driver/x/bsonx/bsoncore"
)

// FlexInt decodes from either a BSON integer or a BSON string (e.g. "" or "5").
// This handles old data saved before the frontend sent proper ints.
type FlexInt int

func (f FlexInt) MarshalJSON() ([]byte, error) { return json.Marshal(int(f)) }

func (f *FlexInt) UnmarshalBSONValue(t bsontype.Type, b []byte) error {
	switch t {
	case bson.TypeInt32:
		v, _, _ := bsoncore.ReadInt32(b)
		*f = FlexInt(v)
	case bson.TypeInt64:
		v, _, _ := bsoncore.ReadInt64(b)
		*f = FlexInt(v)
	case bson.TypeString:
		s, _, _ := bsoncore.ReadString(b)
		n, _ := strconv.Atoi(strings.TrimSpace(s))
		*f = FlexInt(n)
	case bson.TypeDouble:
		v, _, _ := bsoncore.ReadDouble(b)
		*f = FlexInt(int(v))
	}
	return nil
}

// CustomSkill is a user-defined skill entry. Its runtime value lives in Skills[Key].
type CustomSkill struct {
	Key  string `bson:"key" json:"key"`
	Name string `bson:"name" json:"name"`
	Base int    `bson:"base" json:"base"`
}

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

	// Movement
	MOV int `bson:"mov" json:"mov"`

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

	// Custom skills defined by the player (definition only; values live in Skills map)
	CustomSkills []CustomSkill `bson:"customSkills" json:"customSkills"`

	// Checkbox arrays for skill tracking
	FavoriteSkills    []string `bson:"favoriteSkills" json:"favoriteSkills"`
	DevelopmentSkills []string `bson:"developmentSkills" json:"developmentSkills"`

	// Occupational info
	Occupation string `bson:"occupation" json:"occupation"`
	Age        int    `bson:"age" json:"age"`
	Sex        string `bson:"sex" json:"sex"`
	Residence  string `bson:"residence" json:"residence"`
	Birthplace string `bson:"birthplace" json:"birthplace"`

	// Weapons: simplified list
	Weapons []CoCWeapon `bson:"weapons" json:"weapons"`

	// Equipment & cash
	Equipment     string `bson:"equipment" json:"equipment"`
	SpendingLevel string `bson:"spendingLevel" json:"spendingLevel"`
	Cash          string `bson:"cash" json:"cash"`
	Assets        string `bson:"assets" json:"assets"`

	// Background / flavour text
	PersonalDescription    string `bson:"personalDescription" json:"personalDescription"`
	Ideology               string `bson:"ideology" json:"ideology"`
	SignificantPeople      string `bson:"significantPeople" json:"significantPeople"`
	MeaningfulLocations    string `bson:"meaningfulLocations" json:"meaningfulLocations"`
	Possessions            string `bson:"possessions" json:"possessions"`
	Traits                 string `bson:"traits" json:"traits"`
	InjuriesScars          string `bson:"injuriesScars" json:"injuriesScars"`
	PhobiasManias          string `bson:"phobiasManias" json:"phobiasManias"`
	ArcaneTomes            string `bson:"arcaneTomes" json:"arcaneTomes"`
	EncountersWithEntities string `bson:"encountersWithEntities" json:"encountersWithEntities"`
}

// CoCWeapon is a simple CoC weapon entry (damage dice + skill key).
type CoCWeapon struct {
	Name        string  `bson:"name" json:"name"`
	SkillKey    string  `bson:"skillKey" json:"skillKey"` // e.g. "fighting_brawl"
	Damage      string  `bson:"damage" json:"damage"`     // e.g. "1d3+db"
	Range       string  `bson:"range" json:"range"`
	Attacks     FlexInt `bson:"attacks" json:"attacks"`
	Ammo        FlexInt `bson:"ammo" json:"ammo"`
	Malfunction FlexInt `bson:"malfunction" json:"malfunction"`
	IsFavourite bool    `bson:"isFavourite" json:"isFavourite"`
}
