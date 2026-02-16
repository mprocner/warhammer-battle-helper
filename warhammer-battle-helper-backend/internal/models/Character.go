package models

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson/bsontype"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/x/bsonx/bsoncore"
)

type Character struct {
	ID              primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	OwnerID         primitive.ObjectID   `bson:"ownerId" json:"ownerId"`
	BasicInfo       BasicInfo            `bson:"basicInfo" json:"basicInfo"`
	Fate            FateInfo             `bson:"fate" json:"fate"`
	Resilience      ResilienceInfo       `bson:"resilience" json:"resilience"`
	Experience      ExperienceInfo       `bson:"experience" json:"experience"`
	Movement        MovementInfo         `bson:"movement" json:"movement"`
	Wounds          WoundsInfo           `bson:"wounds" json:"wounds"`
	Talents         []Talent             `bson:"talents" json:"talents"`
	ArmourPoints    ArmourPoints         `bson:"armourPoints" json:"armourPoints"`
	Weapons         []Weapon             `bson:"weapons" json:"weapons"`
	Armour          []ArmourItem         `bson:"armour" json:"armour"`
	Wealth          WealthInfo           `bson:"wealth" json:"wealth"`
	Equipment       []EquipmentItem      `bson:"equipment" json:"equipment"`
	Encumbrance     EncumbranceInfo      `bson:"encumbrance" json:"encumbrance"`
	Characteristics CharacteristicsTable `bson:"characteristics" json:"characteristics"`
	BasicSkills     map[string]int       `bson:"basicSkills" json:"basicSkills"`
	AdvancedSkills  map[string]int       `bson:"advancedSkills" json:"advancedSkills"`
	FavoriteSkills  []string             `bson:"favoriteSkills,omitempty" json:"favoriteSkills,omitempty"`
	CustomSkills    []CustomSkill        `bson:"customSkills,omitempty" json:"customSkills,omitempty"`
	Spells          []Spell              `bson:"spells" json:"spells"`
	Ambitions       AmbitionsInfo        `bson:"ambitions" json:"ambitions"`
	Party           PartyInfo            `bson:"party" json:"party"`
	Trappings       string               `bson:"trappings" json:"trappings"`
	CreatedAt       time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time            `bson:"updatedAt" json:"updatedAt"`
}

type BasicInfo struct {
	Name        string `bson:"name" json:"name"`
	Species     string `bson:"species" json:"species"`
	Class       string `bson:"class" json:"class"`
	Career      string `bson:"career" json:"career"`
	CareerLevel string `bson:"careerLevel" json:"careerLevel"`
	Status      string `bson:"status" json:"status"`
	CareerPath  string `bson:"careerPath" json:"careerPath"`
	Age         string `bson:"age" json:"age"`
	Height      string `bson:"height" json:"height"`
	Hair        string `bson:"hair" json:"hair"`
	Eyes        string `bson:"eyes" json:"eyes"`
	Type        string `bson:"type" json:"type"` // "ally" or "enemy"
	Avatar      string `bson:"avatar" json:"avatar"`
}

type FateInfo struct {
	Fate    int `bson:"fate" json:"fate"`
	Fortune int `bson:"fortune" json:"fortune"`
}

type ResilienceInfo struct {
	Resilience int    `bson:"resilience" json:"resilience"`
	Resolve    int    `bson:"resolve" json:"resolve"`
	Motivation string `bson:"motivation" json:"motivation"`
}

type ExperienceInfo struct {
	Current int `bson:"current" json:"current"`
	Spent   int `bson:"spent" json:"spent"`
	Total   int `bson:"total" json:"total"`
}

type MovementInfo struct {
	Movement string `bson:"movement" json:"movement"`
	Walk     string `bson:"walk" json:"walk"`
	Run      string `bson:"run" json:"run"`
}

// FlexInt handles both string and int values from BSON/JSON (for backward compatibility)
type FlexInt int

func (fi *FlexInt) UnmarshalJSON(data []byte) error {
	// Try int first
	var i int
	if err := json.Unmarshal(data, &i); err == nil {
		*fi = FlexInt(i)
		return nil
	}
	// Try string
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		if s == "" {
			*fi = 0
			return nil
		}
		val, err := strconv.Atoi(s)
		if err != nil {
			return err
		}
		*fi = FlexInt(val)
		return nil
	}
	return fmt.Errorf("cannot unmarshal %s into FlexInt", string(data))
}

func (fi FlexInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(int(fi))
}

func (fi *FlexInt) UnmarshalBSONValue(t bsontype.Type, data []byte) error {
	switch t {
	case bsontype.Int32:
		i32, _, ok := bsoncore.ReadInt32(data)
		if !ok {
			return fmt.Errorf("cannot read int32")
		}
		*fi = FlexInt(i32)
	case bsontype.Int64:
		i64, _, ok := bsoncore.ReadInt64(data)
		if !ok {
			return fmt.Errorf("cannot read int64")
		}
		*fi = FlexInt(i64)
	case bsontype.Double:
		f, _, ok := bsoncore.ReadDouble(data)
		if !ok {
			return fmt.Errorf("cannot read double")
		}
		*fi = FlexInt(int(f))
	case bsontype.String:
		s, _, ok := bsoncore.ReadString(data)
		if !ok {
			return fmt.Errorf("cannot read string")
		}
		if s == "" {
			*fi = 0
		} else {
			val, err := strconv.Atoi(s)
			if err != nil {
				return err
			}
			*fi = FlexInt(val)
		}
	default:
		*fi = 0
	}
	return nil
}

type WoundsInfo struct {
	SB      FlexInt `bson:"sb" json:"sb"`
	TB      FlexInt `bson:"tb" json:"tb"`
	WPB     FlexInt `bson:"wpb" json:"wpb"`
	Hardy   FlexInt `bson:"hardy" json:"hardy"`
	Total   FlexInt `bson:"total" json:"total"`
	Current *int    `bson:"current,omitempty" json:"current,omitempty"`
}

type Talent struct {
	Key         string `bson:"key" json:"key"`
	Name        string `bson:"name,omitempty" json:"name,omitempty"`
	TimesTaken  int    `bson:"timesTaken" json:"timesTaken"`
	Description string `bson:"description,omitempty" json:"description,omitempty"`
}

type ArmourPoints struct {
	Head     string `bson:"head" json:"head"`
	LeftArm  string `bson:"leftArm" json:"leftArm"`
	RightArm string `bson:"rightArm" json:"rightArm"`
	Body     string `bson:"body" json:"body"`
	LeftLeg  string `bson:"leftLeg" json:"leftLeg"`
	RightLeg string `bson:"rightLeg" json:"rightLeg"`
	Shield   string `bson:"shield" json:"shield"`
}

type Weapon struct {
	Name        string `bson:"name" json:"name"`
	Group       string `bson:"group" json:"group"`
	Enc         string `bson:"enc" json:"enc"`
	Range       string `bson:"range" json:"range"`
	Damage      string `bson:"damage" json:"damage"`
	Qualities   string `bson:"qualities" json:"qualities"`
	Skill       string `bson:"skill,omitempty" json:"skill,omitempty"`
	IsFavourite bool   `bson:"isFavourite,omitempty" json:"isFavourite,omitempty"`
}

type ArmourItem struct {
	Name      string `bson:"name" json:"name"`
	Locations string `bson:"locations" json:"locations"`
	Enc       string `bson:"enc" json:"enc"`
	AP        string `bson:"ap" json:"ap"`
	Qualities string `bson:"qualities" json:"qualities"`
}

type WealthInfo struct {
	Brass  string `bson:"brass" json:"brass"`
	Silver string `bson:"silver" json:"silver"`
	Gold   string `bson:"gold" json:"gold"`
}

type EquipmentItem struct {
	Name        string `bson:"name" json:"name"`
	Enc         string `bson:"enc" json:"enc"`
	Description string `bson:"description" json:"description"`
}

type EncumbranceInfo struct {
	Weapons   string `bson:"weapons" json:"weapons"`
	Armour    string `bson:"armour" json:"armour"`
	Trappings string `bson:"trappings" json:"trappings"`
	MaxEnc    string `bson:"maxEnc" json:"maxEnc"`
	Total     string `bson:"total" json:"total"`
}

type CharacteristicsTable struct {
	Initial  CharacteristicRow `bson:"initial" json:"initial"`
	Advances CharacteristicRow `bson:"advances" json:"advances"`
	Current  CharacteristicRow `bson:"current" json:"current"`
}

type CharacteristicRow struct {
	WS  int `bson:"WS" json:"WS"`
	BS  int `bson:"BS" json:"BS"`
	S   int `bson:"S" json:"S"`
	T   int `bson:"T" json:"T"`
	I   int `bson:"I" json:"I"`
	Ag  int `bson:"Ag" json:"Ag"`
	Dex int `bson:"Dex" json:"Dex"`
	Int int `bson:"Int" json:"Int"`
	WP  int `bson:"WP" json:"WP"`
	Fel int `bson:"Fel" json:"Fel"`
}

type Skill struct {
	Name           string `bson:"name" json:"name"`
	Characteristic string `bson:"characteristic" json:"characteristic"`
	Advances       int    `bson:"advances" json:"advances"`
	Skill          int    `bson:"skill" json:"skill"`
}

type CustomSkill struct {
	Key            string `bson:"key" json:"key"`
	Name           string `bson:"name" json:"name"`
	Characteristic string `bson:"characteristic" json:"characteristic"`
	Description    string `bson:"description,omitempty" json:"description,omitempty"`
}

type Spell struct {
	Name     string `bson:"name" json:"name"`
	CN       string `bson:"cn" json:"cn"`
	Range    string `bson:"range" json:"range"`
	Target   string `bson:"target" json:"target"`
	Duration string `bson:"duration" json:"duration"`
	Effect   string `bson:"effect" json:"effect"`
}

type AmbitionsInfo struct {
	ShortTerm string `bson:"shortTerm" json:"shortTerm"`
	LongTerm  string `bson:"longTerm" json:"longTerm"`
}

type PartyInfo struct {
	Name    string `bson:"name" json:"name"`
	Members string `bson:"members" json:"members"`
}
