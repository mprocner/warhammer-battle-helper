package service

import (
	"testing"

	"battle-helper/internal/models"
)

// A custom game embeds its own template, so the blueprint resolves with no TemplateService at all.
func TestResolveTokenBlueprint_CustomGameUsesEmbeddedTemplate(t *testing.T) {
	want := &models.TokenDisplayConfig{Enabled: true}
	game := &models.Game{
		GameSystem: "custom",
		CustomSystemTemplate: &models.SystemTemplate{
			Settings: models.TemplateSettings{TokenDisplay: want},
		},
	}

	s := &GameService{}
	if got := s.ResolveTokenBlueprint(game); got != want {
		t.Errorf("custom game must resolve to its embedded TokenDisplay, got %#v", got)
	}
}

// A hardcoded system needs the TemplateService. Without it the resolver must return nil rather than
// panic — a nil blueprint means "render bare token", which buildMaskedTokenView already handles.
func TestResolveTokenBlueprint_HardcodedWithoutTemplateServiceIsNil(t *testing.T) {
	game := &models.Game{GameSystem: "warhammer4e"}

	s := &GameService{}
	if got := s.ResolveTokenBlueprint(game); got != nil {
		t.Errorf("want nil without a TemplateService, got %#v", got)
	}
}

func TestResolveTokenBlueprint_NilGame(t *testing.T) {
	s := &GameService{}
	if got := s.ResolveTokenBlueprint(nil); got != nil {
		t.Errorf("want nil for a nil game, got %#v", got)
	}
}

// A custom game with no template at all must not panic.
func TestResolveTokenBlueprint_CustomGameWithoutTemplate(t *testing.T) {
	s := &GameService{}
	if got := s.ResolveTokenBlueprint(&models.Game{GameSystem: "custom"}); got != nil {
		t.Errorf("want nil for a custom game with no template, got %#v", got)
	}
}
