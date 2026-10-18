package custom

import (
	"battle-helper/internal/models"
	"battle-helper/internal/sanitize"

	"go.mongodb.org/mongo-driver/bson"
)

// SanitizeRichTexts runs every text_long field with RichText through the shared rich-text HTML
// policy (PLAYRPG-256). Only those keys are touched: the policy escapes "<" and "&", which would
// corrupt the plain text every other text field stores. When nothing changes, the input is
// returned as is, so a save with clean HTML costs no re-encode.
//
// Like SeedDefaults it hangs off *Plugin rather than the GameSystem interface: only the custom
// system has a template saying which fields hold HTML.
func (p *Plugin) SanitizeRichTexts(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error) {
	if tmpl == nil {
		return raw, nil
	}
	s, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}
	changed := false
	for _, section := range tmpl.Sections {
		for _, field := range flattenFields(section.Fields) {
			if field.Type != "text_long" || !field.RichText {
				continue
			}
			value, ok := s.Texts[field.Key]
			if !ok {
				continue
			}
			if clean := sanitize.RichHTML(value); clean != value {
				s.Texts[field.Key] = clean
				changed = true
			}
		}
	}
	if !changed {
		return raw, nil
	}
	out, err := bson.Marshal(s)
	if err != nil {
		return raw, err
	}
	return out, nil
}
