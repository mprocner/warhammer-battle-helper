package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Character struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	BasicInfo       BasicInfo          `bson:"basicInfo" json:"basicInfo"`
	Characteristics CharacteristicList `bson:"characteristics" json:"characteristics"`
	Skills          map[string]int     `bson:"skills" json:"skills"`
	Weapons         []Weapon           `bson:"weapons" json:"weapons"`
	Avatar          string             `bson:"avatar" json:"avatar"`
	CreatedAt       time.Time          `bson:"createdat" json:"createdAt"`
	UpdatedAt       time.Time          `bson:"updatedat" json:"updatedAt"`
}

type BasicInfo struct {
	Name       string `bson:"name" json:"name"`
	Race       string `bson:"race" json:"race"`
	Class      string `bson:"class" json:"class"`
	Profession string `bson:"profession" json:"profession"`
	Type       string `bson:"type" json:"type"`
}

type CharacteristicList struct {
	WW  Characteristic `bson:"WW" json:"WW"`
	US  Characteristic `bson:"US" json:"US"`
	S   Characteristic `bson:"S" json:"S"`
	Wt  Characteristic `bson:"Wt" json:"Wt"`
	I   Characteristic `bson:"I" json:"I"`
	Zw  Characteristic `bson:"Zw" json:"Zw"`
	Zr  Characteristic `bson:"Zr" json:"Zr"`
	Int Characteristic `bson:"Int" json:"Int"`
	SW  Characteristic `bson:"SW" json:"SW"`
	Ogd Characteristic `bson:"Ogd" json:"Ogd"`
}

type Characteristic struct {
	Base     int `bson:"base" json:"base"`
	Advances int `bson:"advances" json:"advances"`
}

type Weapon struct {
	Name  string `bson:"name" json:"name"`
	Bonus int    `bson:"bonus" json:"bonus"`
}
