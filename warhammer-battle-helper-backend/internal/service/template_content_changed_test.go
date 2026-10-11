package service

import (
	"testing"

	"battle-helper/internal/models"
)

func TestTemplateContentChanged(t *testing.T) {
	current := &models.SystemTemplate{
		Name:     "Krypta",
		Sections: []models.SectionDef{{ID: "s1", Title: "Attrs"}},
		Settings: models.TemplateSettings{},
	}
	str := func(s string) *string { return &s }
	yes := true

	cases := []struct {
		name string
		req  models.UpdateTemplateRequest
		want bool
	}{
		{"identical full body (no-op autosave)", models.UpdateTemplateRequest{
			Name: str("Krypta"), Sections: []models.SectionDef{{ID: "s1", Title: "Attrs"}},
			Settings: &models.TemplateSettings{}, IsPublic: &yes}, false},
		{"visibility only", models.UpdateTemplateRequest{IsPublic: &yes}, false},
		{"name changed", models.UpdateTemplateRequest{Name: str("Krypta 2")}, true},
		{"section title changed", models.UpdateTemplateRequest{
			Sections: []models.SectionDef{{ID: "s1", Title: "Attributes"}}}, true},
		{"section added", models.UpdateTemplateRequest{
			Sections: []models.SectionDef{{ID: "s1", Title: "Attrs"}, {ID: "s2"}}}, true},
		{"settings changed", models.UpdateTemplateRequest{
			Settings: &models.TemplateSettings{SheetWidth: 900}}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := templateContentChanged(current, c.req); got != c.want {
				t.Errorf("templateContentChanged() = %v, want %v", got, c.want)
			}
		})
	}
}
