package service

import (
	"math/rand"
)

type Dice struct {
	Sizes int
}

func (d Dice) Roll() int {
	return rand.Intn(d.Sizes) + 1
}
