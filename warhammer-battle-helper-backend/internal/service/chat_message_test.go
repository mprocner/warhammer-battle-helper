package service

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeChatMessage(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr error
	}{
		{"single line unchanged", "Atakuję gobliny", "Atakuję gobliny", nil},
		{"CRLF converted to LF", "linia1\r\nlinia2", "linia1\nlinia2", nil},
		{"five blank lines collapse to one gap", "a\n\n\n\n\n\nb", "a\n\nb", nil},
		{"single blank line kept", "a\n\nb", "a\n\nb", nil},
		{"blank lines holding spaces collapse too", "a\n \n \n \nb", "a\n\nb", nil},
		{"trailing spaces before a gap are absorbed", "a  \n\n\nb", "a\n\nb", nil},
		{"indentation after a gap is kept", "a\n\n\n    x", "a\n\n    x", nil},
		{"surrounding whitespace trimmed", "  \n tekst \n  ", "tekst", nil},
		{"whitespace-only rejected", "   \n\n\t ", "", ErrChatMessageEmpty},
		{"empty string rejected", "", "", ErrChatMessageEmpty},
		{"500 ASCII characters pass", strings.Repeat("a", 500), strings.Repeat("a", 500), nil},
		{"501 ASCII characters rejected", strings.Repeat("a", 501), "", ErrChatMessageTooLong},
		{"500 Polish characters pass", strings.Repeat("ą", 500), strings.Repeat("ą", 500), nil},
		{"501 Polish characters rejected", strings.Repeat("ą", 501), "", ErrChatMessageTooLong},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeChatMessage(tc.input)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("got = %q, want %q", got, tc.want)
			}
		})
	}
}
