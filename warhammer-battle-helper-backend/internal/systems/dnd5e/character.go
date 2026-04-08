package dnd5e

// Abilities holds the six core D&D 5e ability scores (input values).
type Abilities struct {
	STR int `bson:"str" json:"str"`
	DEX int `bson:"dex" json:"dex"`
	CON int `bson:"con" json:"con"`
	INT int `bson:"int" json:"int"`
	WIS int `bson:"wis" json:"wis"`
	CHA int `bson:"cha" json:"cha"`
}

// AbilityMods holds derived ability modifiers (floor((score-10)/2) per ability).
type AbilityMods struct {
	STR int `bson:"str" json:"str"`
	DEX int `bson:"dex" json:"dex"`
	CON int `bson:"con" json:"con"`
	INT int `bson:"int" json:"int"`
	WIS int `bson:"wis" json:"wis"`
	CHA int `bson:"cha" json:"cha"`
}

// SavingThrowProfs marks which saving throws the character is proficient in.
type SavingThrowProfs struct {
	STR bool `bson:"str" json:"str"`
	DEX bool `bson:"dex" json:"dex"`
	CON bool `bson:"con" json:"con"`
	INT bool `bson:"int" json:"int"`
	WIS bool `bson:"wis" json:"wis"`
	CHA bool `bson:"cha" json:"cha"`
}

// Resources holds current/max tracked values.
type Resources struct {
	HP                 int `bson:"hp"              json:"hp"`
	HPMax              int `bson:"hpMax"           json:"hpMax"`
	TempHP             int `bson:"tempHp"          json:"tempHp"`
	HitDiceUsed        int `bson:"hitDiceUsed"     json:"hitDiceUsed"`
	DeathSaveSuccesses int `bson:"deathSaveSuccesses" json:"deathSaveSuccesses"`
	DeathSaveFailures  int `bson:"deathSaveFailures"  json:"deathSaveFailures"`
}

// Derived holds all computed values. Written by ComputeDerived — never stored as input.
type Derived struct {
	ProficiencyBonus  int            `bson:"proficiencyBonus" json:"proficiencyBonus"`
	AbilityMods       AbilityMods    `bson:"abilityMods"      json:"abilityMods"`
	SavingThrows      AbilityMods    `bson:"savingThrows"     json:"savingThrows"`
	Skills            map[string]int `bson:"skills"           json:"skills"`
	Initiative        int            `bson:"initiative"       json:"initiative"`
	PassivePerception int            `bson:"passivePerception" json:"passivePerception"`
	SpellSaveDC       int            `bson:"spellSaveDc"      json:"spellSaveDc"`
	SpellAttackBonus  int            `bson:"spellAttackBonus" json:"spellAttackBonus"`
}

// Weapon represents a single weapon or attack entry.
type Weapon struct {
	Name          string `bson:"name"          json:"name"`
	AttackAbility string `bson:"attackAbility" json:"attackAbility"` // "str"|"dex"|"spellcasting"
	Damage        string `bson:"damage"        json:"damage"`        // e.g. "1d8"
	DamageType    string `bson:"damageType"    json:"damageType"`    // "slashing"|"piercing"|etc.
	Proficient    bool   `bson:"proficient"    json:"proficient"`
	Range         string `bson:"range"         json:"range"`
	Properties    string `bson:"properties"    json:"properties"`
	IsFavourite   bool   `bson:"isFavourite"   json:"isFavourite"`
}

// Feature represents a class feature, racial trait, or background feature.
type Feature struct {
	Name        string `bson:"name"        json:"name"`
	Source      string `bson:"source"      json:"source"` // "Class"|"Species"|"Background"|"Feat"
	Description string `bson:"description" json:"description"`
}

// SpellSlot tracks available/used spell slots per spell level.
type SpellSlot struct {
	Level int `bson:"level" json:"level"` // 1–9
	Total int `bson:"total" json:"total"`
	Used  int `bson:"used"  json:"used"`
}

// CharacterInfo holds narrative/identity fields.
type CharacterInfo struct {
	Class      string `bson:"class"      json:"class"`
	Subclass   string `bson:"subclass"   json:"subclass"`
	Species    string `bson:"species"    json:"species"`
	Background string `bson:"background" json:"background"`
	Level      int    `bson:"level"      json:"level"`
	XP         int    `bson:"xp"         json:"xp"`
	Alignment  string `bson:"alignment"  json:"alignment"`
}

// Stats is the top-level document stored in Character.Stats for D&D 5e.
type Stats struct {
	Info      CharacterInfo `bson:"info"    json:"info"`
	Abilities Abilities     `bson:"abilities" json:"abilities"`

	// Proficiency inputs
	SavingThrowProfs SavingThrowProfs `bson:"savingThrowProfs" json:"savingThrowProfs"`
	// SkillProfs maps skill key → 0 (none), 1 (proficient), 2 (expertise)
	SkillProfs map[string]int `bson:"skillProfs" json:"skillProfs"`

	// Combat inputs
	ArmorClass          int    `bson:"armorClass"          json:"armorClass"`
	Speed               int    `bson:"speed"               json:"speed"`
	HitDie              string `bson:"hitDie"              json:"hitDie"`              // "d10"
	SpellcastingAbility string `bson:"spellcastingAbility" json:"spellcastingAbility"` // "int"|"wis"|"cha"
	IsSpellcaster       bool   `bson:"isSpellcaster"       json:"isSpellcaster"`

	Resources  Resources   `bson:"resources"  json:"resources"`
	Derived    Derived     `bson:"derived"    json:"derived"`
	SpellSlots []SpellSlot `bson:"spellSlots" json:"spellSlots"`
	Weapons    []Weapon    `bson:"weapons"    json:"weapons"`
	Features   []Feature   `bson:"features"   json:"features"`

	FavoriteSkills  []string `bson:"favoriteSkills"  json:"favoriteSkills"`
	FavoriteWeapons []string `bson:"favoriteWeapons" json:"favoriteWeapons"`

	Equipment string `bson:"equipment" json:"equipment"`
	Notes     string `bson:"notes"     json:"notes"`
}
