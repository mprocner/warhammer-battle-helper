package custom

import (
	"bytes"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

func richTextTemplate() *models.SystemTemplate {
	return &models.SystemTemplate{Sections: []models.SectionDef{
		{ID: "s", Columns: 2, Fields: []models.FieldDef{
			{Key: "bio", Type: "text_long", RichText: true},
			{Key: "plain", Type: "text_long"},
			{Key: "short", Type: "text_short", RichText: true},
			{Key: "nested", Type: "section", Section: &models.SectionDef{ID: "in", Columns: 1, Fields: []models.FieldDef{
				{Key: "deep", Type: "text_long", RichText: true},
			}}},
		}},
	}}
}

func statsWithTexts(t *testing.T, texts map[string]string) bson.Raw {
	t.Helper()
	raw, err := bson.Marshal(Stats{
		Attributes: map[string]AttrValue{},
		Skills:     map[string]AttrValue{},
		Texts:      texts,
	})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func sanitizedTexts(t *testing.T, raw bson.Raw, tmpl *models.SystemTemplate) map[string]string {
	t.Helper()
	out, err := New().SanitizeRichTexts(raw, tmpl)
	if err != nil {
		t.Fatal(err)
	}
	s, err := decodeStats(out)
	if err != nil {
		t.Fatal(err)
	}
	return s.Texts
}

func TestSanitizeRichTextsCleansFlaggedField(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"bio": `<p onclick="alert(1)">t<img src=x onerror="alert(1)"></p>`})
	if got := sanitizedTexts(t, raw, richTextTemplate())["bio"]; got != `<p>t</p>` {
		t.Errorf("bio = %q, want %q", got, `<p>t</p>`)
	}
}

func TestSanitizeRichTextsKeepsAllowedFormatting(t *testing.T) {
	in := `<p style="text-align: center"><strong>a</strong> <span style="color: #a8322d">b</span></p>`
	raw := statsWithTexts(t, map[string]string{"bio": in})
	if got := sanitizedTexts(t, raw, richTextTemplate())["bio"]; got != in {
		t.Errorf("bio = %q, want unchanged %q", got, in)
	}
}

// The policy escapes "<" and "&"; running it over a plain field would corrupt what the player typed.
func TestSanitizeRichTextsLeavesPlainFieldsAlone(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{
		"plain": `HP < 10 & stun`,
		"short": `<b>x</b> & y`, // RichText on a non-text_long type is ignored
	})
	got := sanitizedTexts(t, raw, richTextTemplate())
	if got["plain"] != `HP < 10 & stun` {
		t.Errorf("plain = %q", got["plain"])
	}
	if got["short"] != `<b>x</b> & y` {
		t.Errorf("short = %q", got["short"])
	}
}

func TestSanitizeRichTextsReachesNestedSection(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"deep": `<p>x<script>alert(1)</script></p>`})
	if got := sanitizedTexts(t, raw, richTextTemplate())["deep"]; got != `<p>x</p>` {
		t.Errorf("deep = %q, want %q", got, `<p>x</p>`)
	}
}

func TestSanitizeRichTextsLeavesAbsentKeyAbsent(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"plain": "a"})
	if _, ok := sanitizedTexts(t, raw, richTextTemplate())["bio"]; ok {
		t.Error("bio appeared although the character never had it")
	}
}

func TestSanitizeRichTextsWithoutTemplateReturnsInput(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"bio": `<p onclick="x()">t</p>`})
	out, err := New().SanitizeRichTexts(raw, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out, raw) {
		t.Error("nil template must return the stats untouched")
	}
}
