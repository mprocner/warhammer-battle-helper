package models

import "testing"

func withColors(colors ...string) []GameParticipant {
	ps := make([]GameParticipant, len(colors))
	for i, c := range colors {
		ps[i].Color = c
	}
	return ps
}

func TestNextParticipantColor(t *testing.T) {
	p := ParticipantPalette
	cases := []struct {
		name         string
		participants []GameParticipant
		want         string
		wantFree     bool
	}{
		{"empty game gets the first colour", nil, p[0], true},
		{"next in order", withColors(p[0]), p[1], true},
		{"skips a taken colour, fills the gap", withColors(p[1]), p[0], true},
		{"gap left by someone who left", withColors(p[0], p[2]), p[1], true},
		{"custom picker colour takes nothing from the palette", withColors("#123456"), p[0], true},
		{"taken check ignores case", withColors("#E6194B"), p[1], true},
		{"participant without colour (pre-migration) takes nothing", withColors(""), p[0], true},
	}
	for _, c := range cases {
		got, free := NextParticipantColor(c.participants)
		if got != c.want || free != c.wantFree {
			t.Errorf("%s: got (%s, %v), want (%s, %v)", c.name, got, free, c.want, c.wantFree)
		}
	}
}

func TestNextParticipantColorWrapsWhenPaletteExhausted(t *testing.T) {
	full := withColors(ParticipantPalette...)
	got, free := NextParticipantColor(full)
	if free {
		t.Fatal("an exhausted palette cannot offer a free colour")
	}
	if got != ParticipantPalette[0] {
		t.Errorf("first wrap = %s, want %s", got, ParticipantPalette[0])
	}
	got, _ = NextParticipantColor(append(full, GameParticipant{Color: ParticipantPalette[0]}))
	if got != ParticipantPalette[1] {
		t.Errorf("second wrap = %s, want %s", got, ParticipantPalette[1])
	}
	got, _ = NextParticipantColor(append(full, GameParticipant{}))
	if got != ParticipantPalette[0] {
		t.Errorf("an uncoloured participant must not shift the wrap, got %s", got)
	}
}

func TestPaletteIsValidAndDistinct(t *testing.T) {
	seen := map[string]bool{}
	for _, c := range ParticipantPalette {
		norm, ok := NormalizeParticipantColor(c)
		if !ok || norm != c {
			t.Errorf("palette colour %q must be lowercase #rrggbb", c)
		}
		if seen[c] {
			t.Errorf("palette colour %q listed twice", c)
		}
		seen[c] = true
	}
}

func TestNormalizeParticipantColor(t *testing.T) {
	cases := []struct {
		in, want string
		ok       bool
	}{
		{"#a1b2c3", "#a1b2c3", true},
		{"#A1B2C3", "#a1b2c3", true},
		{"", "", false},
		{"a1b2c3", "", false},
		{"#abc", "", false},
		{"#a1b2c3ff", "", false},
		{"#g1b2c3", "", false},
		{"red", "", false},
	}
	for _, c := range cases {
		got, ok := NormalizeParticipantColor(c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("NormalizeParticipantColor(%q) = (%q, %v), want (%q, %v)", c.in, got, ok, c.want, c.ok)
		}
	}
}
