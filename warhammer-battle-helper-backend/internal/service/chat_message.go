package service

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

// MaxChatMessageLength caps a chat message, counted in runes.
// The frontend holds the same value in components/log/ChatInput.jsx (MAX_MESSAGE_LENGTH).
const MaxChatMessageLength = 500

var (
	ErrChatMessageEmpty   = errors.New("chat message is empty")
	ErrChatMessageTooLong = errors.New("chat message is too long")
)

// blankLineRe matches a run of three or more newlines, treating a line that holds only
// spaces or tabs as blank - otherwise a single space would defeat the collapsing.
var blankLineRe = regexp.MustCompile(`(?:[ \t]*\n){3,}`)

// NormalizeChatMessage cleans up a chat message and enforces its limits.
//
// Order matters: normalization runs BEFORE the length check, so the backend rejects exactly
// the messages the frontend counter shows as over the limit.
//
// Length is measured in runes, not bytes - Polish characters take 2 bytes each, so len()
// would cut messages off at roughly half the stated limit.
func NormalizeChatMessage(msg string) (string, error) {
	msg = strings.ReplaceAll(msg, "\r\n", "\n")
	msg = strings.TrimSpace(msg)
	msg = blankLineRe.ReplaceAllString(msg, "\n\n")

	if msg == "" {
		return "", ErrChatMessageEmpty
	}
	if utf8.RuneCountInString(msg) > MaxChatMessageLength {
		return "", ErrChatMessageTooLong
	}
	return msg, nil
}
