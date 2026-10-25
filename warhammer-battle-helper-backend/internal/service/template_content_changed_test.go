package service

import (
	"testing"

	"battle-helper/internal/models"
)

func TestTemplateContentChanged(t *testing.T) {
	current := &models.SystemTemplate{
		Name:        "Krypta",
		Sections:    []models.SectionDef{{ID: "s1", Title: "Attrs"}},
		Settings:    models.TemplateSettings{},
		Description: "<p>a</p>", Language: "pl",
	}
	str := func(s string) *string { return &s }

	cases := []struct {
		name string
		req  models.UpdateTemplateRequest
		want bool
	}{
		{"identical full body (no-op autosave)", models.UpdateTemplateRequest{
			Name: str("Krypta"), Sections: []models.SectionDef{{ID: "s1", Title: "Attrs"}},
			Settings: &models.TemplateSettings{}}, false},
		{"name changed", models.UpdateTemplateRequest{Name: str("Krypta 2")}, true},
		{"section title changed", models.UpdateTemplateRequest{
			Sections: []models.SectionDef{{ID: "s1", Title: "Attributes"}}}, true},
		{"section added", models.UpdateTemplateRequest{
			Sections: []models.SectionDef{{ID: "s1", Title: "Attrs"}, {ID: "s2"}}}, true},
		{"settings changed", models.UpdateTemplateRequest{
			Settings: &models.TemplateSettings{SheetWidth: 900}}, true},
		{"description changed", models.UpdateTemplateRequest{Description: str("<p>b</p>")}, true},
		{"language changed", models.UpdateTemplateRequest{Language: str("en")}, true},
		{"same description and language", models.UpdateTemplateRequest{
			Description: str("<p>a</p>"), Language: str("pl")}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := templateContentChanged(current, c.req); got != c.want {
				t.Errorf("templateContentChanged() = %v, want %v", got, c.want)
			}
		})
	}
}
