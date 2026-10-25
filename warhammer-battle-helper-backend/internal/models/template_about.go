package models

import (
	"errors"

	"battle-helper/internal/sanitize"
)

// SupportedTemplateLanguages are the ISO 639-1 codes a template may declare. Kept equal to
// warhammer-battle-helper-front/src/utils/templateLanguages.json (pinned by a test).
var SupportedTemplateLanguages = []string{
	"pl", "en", "de", "fr", "es", "it", "pt", "cs", "sk", "uk", "ru", "hu", "ja", "zh", "ko",
}

// MaxTemplateDescriptionBytes caps the description after sanitizing, so stripped markup does
// not count against the author.
const MaxTemplateDescriptionBytes = 20000

var (
	ErrInvalidTemplateLanguage    = errors.New("template_invalid_language")
	ErrTemplateDescriptionTooLong = errors.New("template_description_too_long")
	ErrTemplateAboutOnVariant     = errors.New("template_about_on_variant")
)

func isSupportedTemplateLanguage(code string) bool {
	if code == "" {
		return true
	}
	for _, c := range SupportedTemplateLanguages {
		if c == code {
			return true
		}
	}
	return false
}

// NormalizeTemplateAbout validates the about fields of a save and sanitizes the description in
// place. A nil pointer means the field is not part of the save and is skipped. A token-display
// variant has no sheet of its own to describe, so it may only carry empty values.
func NormalizeTemplateAbout(baseSystem string, description, language *string) error {
	if description != nil {
		*description = sanitize.RichHTML(*description)
	}
	if baseSystem != "" {
		if (description != nil && *description != "") || (language != nil && *language != "") {
			return ErrTemplateAboutOnVariant
		}
		return nil
	}
	if language != nil && !isSupportedTemplateLanguage(*language) {
		return ErrInvalidTemplateLanguage
	}
	if description != nil && len(*description) > MaxTemplateDescriptionBytes {
		return ErrTemplateDescriptionTooLong
	}
	return nil
}
