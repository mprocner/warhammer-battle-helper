package warhammer

import (
	"encoding/json"
	"fmt"
	"os"
)

type CharacterSheetFactory struct {
}

func (CharacterSheetFactory) Prepare(fileName string) Sheet {
	dat, err := os.ReadFile(fileName)
	ch := Sheet{}
	err = json.Unmarshal(dat, &ch)
	if err != nil {
		panic(err)
	}
	fmt.Printf("%+v\n", ch)
	//fmt.Printf("%s\n", ch.BasicInfo.Name)

	return ch
}

func (CharacterSheetFactory) List(fileNames []string) string {
	var result string
	result = "["
	isFirst := true
	for _, fileName := range fileNames {
		dat, err := os.ReadFile(fileName)
		if err != nil {
			panic(err)
		}
		if !isFirst {
			result += ","
		}
		result += string(dat)
		isFirst = false
	}
	result += "]"
	return result
}
