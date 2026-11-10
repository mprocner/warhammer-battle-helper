package models

import (
	"regexp"
	"strings"
)

// ParticipantPalette is the single source of default participant colours (PLAYRPG-340): saturated,
// mutually distinct hues that stay readable on a battle map. The frontend keeps a copy as picker
// suggestions only, so a mismatch there never changes what a participant is assigned.
var ParticipantPalette = []string{
	"#e6194b", // red
	"#3cb44b", // green
	"#4363d8", // blue
	"#f58231", // orange
	"#911eb4", // purple
	"#42d4f4", // cyan
	"#f032e6", // magenta
	"#bfef45", // lime
	"#ffe119", // yellow
	"#469990", // teal
	"#9a6324", // brown
	"#dcbeff", // lavender
}

// NextParticipantColor returns the first palette colour no participant holds yet. When the palette
// is exhausted it wraps around (count of coloured participants modulo palette size) and free is
// false: the colour is then necessarily shared, so callers must not demand that it be unique.
// Participants without a colour are ignored, so the migration can colour a game one by one.
func NextParticipantColor(participants []GameParticipant) (color string, free bool) {
	taken := make(map[string]bool, len(participants))
	coloured := 0
	for _, p := range participants {
		if p.Color != "" {
			taken[strings.ToLower(p.Color)] = true
			coloured++
		}
	}
	for _, c := range ParticipantPalette {
		if !taken[c] {
			return c, true
		}
	}
	return ParticipantPalette[coloured%len(ParticipantPalette)], false
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// NormalizeParticipantColor validates a picker colour (#rrggbb) and lowercases it, so a colour
// typed in upper case still counts as taken by NextParticipantColor.
func NormalizeParticipantColor(color string) (string, bool) {
	if !hexColor.MatchString(color) {
		return "", false
	}
	return strings.ToLower(color), true
}
