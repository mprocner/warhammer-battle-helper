package models

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

// templateLanguagesPath is the list the front end imports; both sides must hold the same codes.
// The backend container does not mount the front end, so run this on the host.
const templateLanguagesPath = "../../../warhammer-battle-helper-front/src/utils/templateLanguages.json"

func TestSupportedTemplateLanguagesMatchFrontEnd(t *testing.T) {
	raw, err := os.ReadFile(templateLanguagesPath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var codes []string
	if err := json.Unmarshal(raw, &codes); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if !reflect.DeepEqual(codes, SupportedTemplateLanguages) {
		t.Errorf("front end has %v, Go has %v", codes, SupportedTemplateLanguages)
	}
}

func strp(s string) *string { return &s }

func TestNormalizeTemplateAbout(t *testing.T) {
	t.Run("unspecified and listed languages pass", func(t *testing.T) {
		for _, code := range []string{"", "pl", "ko"} {
			if err := NormalizeTemplateAbout("", nil, strp(code)); err != nil {
				t.Errorf("%q: %v", code, err)
			}
		}
	})
	t.Run("unknown language is rejected", func(t *testing.T) {
		err := NormalizeTemplateAbout("", nil, strp("xx"))
		if !errors.Is(err, ErrInvalidTemplateLanguage) {
			t.Errorf("err = %v, want ErrInvalidTemplateLanguage", err)
		}
	})
	t.Run("description is sanitized in place", func(t *testing.T) {
		d := strp(`<p>Ala<script>alert(1)</script></p>`)
		if err := NormalizeTemplateAbout("", d, nil); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(*d, "script") || !strings.Contains(*d, "Ala") {
			t.Errorf("description = %q", *d)
		}
	})
	t.Run("limit counts the sanitized form", func(t *testing.T) {
		// The script body is stripped, so this is far under the limit once sanitized.
		d := strp("<p>x</p><script>" + strings.Repeat("a", MaxTemplateDescriptionBytes) + "</script>")
		if err := NormalizeTemplateAbout("", d, nil); err != nil {
			t.Errorf("err = %v, want nil", err)
		}
		long := strp("<p>" + strings.Repeat("a", MaxTemplateDescriptionBytes) + "</p>")
		if err := NormalizeTemplateAbout("", long, nil); !errors.Is(err, ErrTemplateDescriptionTooLong) {
			t.Errorf("err = %v, want ErrTemplateDescriptionTooLong", err)
		}
	})
	t.Run("variant rejects non-empty values, accepts empty ones", func(t *testing.T) {
		if err := NormalizeTemplateAbout("warhammer4e", strp(""), strp("")); err != nil {
			t.Errorf("empty: %v", err)
		}
		if err := NormalizeTemplateAbout("warhammer4e", nil, strp("pl")); !errors.Is(err, ErrTemplateAboutOnVariant) {
			t.Errorf("language: err = %v", err)
		}
		if err := NormalizeTemplateAbout("warhammer4e", strp("<p>x</p>"), nil); !errors.Is(err, ErrTemplateAboutOnVariant) {
			t.Errorf("description: err = %v", err)
		}
	})
	t.Run("errors are validation errors", func(t *testing.T) {
		for _, err := range []error{ErrInvalidTemplateLanguage, ErrTemplateDescriptionTooLong, ErrTemplateAboutOnVariant} {
			if !IsTemplateValidationError(err) {
				t.Errorf("%v is not a validation error", err)
			}
		}
	})
}
