package warhammer

type Sheet struct {
	Id              string          `json:"id"`
	BasicInfo       BasicInfo       `json:"basicInfo"`
	Characteristics Characteristics `json:"characteristics"`
	Weapon          Weapon          `json:"weapon"`

}

type BasicInfo struct {
	Name       string `json:"name"`
	Race       string `json:"race"`
	Class      string `json:"class"`
	Profession string `json:"profession"`
	Type       string `json:"type"`
}

type Characteristics struct {
	WW  int `json:"WW"`
	US  int `json:"US"`
	S   int `json:"S"`
	Wt  int `json:"Wt"`
	I   int `json:"I"`
	Zw  int `json:"Zw"`
	Zr  int `json:"Zr"`
	Int int `json:"Int"`
	SW  int `json:"SW"`
	Ogd int `json:"Ogd"`
}

type Weapon struct {
	Name  string
	Bonus int
}
