package registry

import (
	"slices"
	"testing"
)

// HardcodedSystems is the set an admin configures access for; custom must never be in it,
// or the access gate would start hiding user-authored templates.
func TestHardcodedSystemsExcludesCustom(t *testing.T) {
	got := HardcodedSystems()
	if slices.Contains(got, "custom") {
		t.Fatalf("HardcodedSystems() contains custom: %v", got)
	}
	var want []string
	for _, s := range ListSystems() {
		if s != "custom" {
			want = append(want, s)
		}
	}
	if !slices.Equal(got, want) {
		t.Fatalf("HardcodedSystems() = %v, want %v", got, want)
	}
}
