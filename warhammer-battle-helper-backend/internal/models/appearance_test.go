package models

import "testing"

func TestIsValidGameTheme(t *testing.T) {
	cases := []struct {
		id   string
		want bool
	}{
		{"default", true},
		{"scifi", true},
		{"twenties", true},
		{"", false},      // a PATCH must name a theme; "" is only the stored "never set"
		{"Scifi", false}, // ids are exact, not case-folded
		{"cyberpunk", false},
	}
	for _, c := range cases {
		if got := IsValidGameTheme(c.id); got != c.want {
			t.Errorf("IsValidGameTheme(%q) = %v, want %v", c.id, got, c.want)
		}
	}
}
