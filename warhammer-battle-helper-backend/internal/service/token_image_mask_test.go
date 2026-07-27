package service

import (
	"testing"

	"battle-helper/internal/models"
)

// A numbers-hidden image bar keeps rendering (pct baked) but ships no raw numbers; a whole-bar-hidden
// bar is zeroed as before; a normal bar is untouched.
func TestMaskImageToken_HideValues(t *testing.T) {
	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		HPBars: []models.ImageTokenHPBar{
			{ID: "hp", Label: "HP", Current: 6, Max: 10},                          // normal
			{ID: "shield", Label: "Shield", Current: 4, Max: 8, HideValues: true}, // numbers hidden
			{ID: "secret", Label: "Secret", Current: 2, Max: 5, Hidden: true},     // whole bar hidden
			{ID: "both", Label: "Both", Current: 3, Max: 6, Hidden: true, HideValues: true}, // hidden + numbers hidden
		},
	}

	masked := MaskImageTokenForPlayer(overlay)
	byID := map[string]models.ImageTokenHPBar{}
	for _, b := range masked.HPBars {
		byID[b.ID] = b
	}

	if b := byID["hp"]; b.Current != 6 || b.Max != 10 || b.HideValues {
		t.Fatalf("normal bar must be untouched, got %+v", b)
	}
	if b := byID["shield"]; !b.HideValues || b.Current != 0 || b.Max != 0 || b.Pct != 50 {
		t.Fatalf("shield numbers must be stripped with pct=50, got %+v", b)
	}
	if b := byID["secret"]; b.Current != 0 || b.Max != 0 {
		t.Fatalf("hidden bar must be zeroed, got %+v", b)
	}
	if b := byID["both"]; b.Current != 0 || b.Max != 0 || b.HideValues {
		t.Fatalf("hidden+hideValues bar must be zeroed with hideValues cleared (so client filter drops it), got %+v", b)
	}
}
