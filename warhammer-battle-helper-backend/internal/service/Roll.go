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

func (d Dice) RollMany(count int) []int {
	results := make([]int, count)
	for i := range results {
		results[i] = d.Roll()
	}
	return results
}
