package models

import (
	"errors"
	"strings"
	"testing"
)

func validTiersConfig() *SuccessLevelsConfig {
	return &SuccessLevelsConfig{
		Mode:    SuccessLevelsTiers,
		Success: SuccessTier{Label: "Success", Color: "#4a7c59"},
		Failure: SuccessTier{Label: "Failure", Color: "#c94444"},
		Tiers: []SuccessTier{
			{ID: "a", Divisor: 5, Label: "Extreme", Color: "#b8941f"},
			{ID: "b", Divisor: 2, Label: "Hard", Color: "#5a7a4a"},
		},
	}
}

func TestSuccessLevelsValidate(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(c *SuccessLevelsConfig)
		ok     bool
	}{
		{"valid tiers", func(c *SuccessLevelsConfig) {}, true},
		{"valid tens", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsTens; c.Step = 5 }, true},
		{"off keeps stored tiers", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsOff }, true},
		{"step zero reads as default", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsTens; c.Step = 0 }, true},
		// The creator autosaves on every keystroke, so a GM clearing a name to retype it must not get a 400.
		{"empty label allowed", func(c *SuccessLevelsConfig) { c.Tiers[0].Label = ""; c.Success.Label = "" }, true},
		{"empty colour allowed", func(c *SuccessLevelsConfig) { c.Failure.Color = "" }, true},
		{"step at max", func(c *SuccessLevelsConfig) { c.Mode = SuccessLevelsTens; c.Step = 100 }, true},
		{"divisor at min", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 2 }, true},
		{"divisor at max", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 100 }, true},
		{"label at max runes", func(c *SuccessLevelsConfig) { c.Tiers[0].Label = strings.Repeat("ś", 40) }, true},
		{"unknown mode", func(c *SuccessLevelsConfig) { c.Mode = "difference" }, false},
		{"negative step", func(c *SuccessLevelsConfig) { c.Step = -1 }, false},
		{"step over max", func(c *SuccessLevelsConfig) { c.Step = 101 }, false},
		{"divisor one", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 1 }, false},
		{"divisor over max", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 101 }, false},
		{"duplicate divisor", func(c *SuccessLevelsConfig) { c.Tiers[1].Divisor = 5 }, false},
		{"bad colour", func(c *SuccessLevelsConfig) { c.Tiers[0].Color = "gold" }, false},
		{"bad fixed-row colour", func(c *SuccessLevelsConfig) { c.Success.Color = "#12345" }, false},
		{"label too long", func(c *SuccessLevelsConfig) { c.Tiers[0].Label = strings.Repeat("ś", 41) }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := validTiersConfig()
			tc.mutate(c)
			err := c.Validate()
			if tc.ok && err != nil {
				t.Fatalf("Validate() = %v, want nil", err)
			}
			if !tc.ok && !errors.Is(err, ErrInvalidSuccessLevels) {
				t.Fatalf("Validate() = %v, want ErrInvalidSuccessLevels", err)
			}
		})
	}
}

func TestSuccessLevelsValidate_NilIsOff(t *testing.T) {
	var c *SuccessLevelsConfig
	if err := c.Validate(); err != nil {
		t.Fatalf("nil config: got %v, want nil", err)
	}
}

func TestSuccessLevelsError_IsValidationError(t *testing.T) {
	if !IsTemplateValidationError(ErrInvalidSuccessLevels) {
		t.Fatal("ErrInvalidSuccessLevels must map to 400")
	}
}
