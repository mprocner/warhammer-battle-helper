package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"fmt"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type TemplateService struct {
	repo *repository.TemplateRepository
}

func NewTemplateService(repo *repository.TemplateRepository) *TemplateService {
	return &TemplateService{repo: repo}
}

func (s *TemplateService) Create(ownerID primitive.ObjectID, req models.CreateTemplateRequest) (*models.SystemTemplate, error) {
	if req.Sections == nil {
		req.Sections = []models.SectionDef{}
	}
	t := &models.SystemTemplate{
		OwnerID:  ownerID,
		Name:     req.Name,
		Sections: req.Sections,
		Settings: models.TemplateSettings{DiceButtons: models.DefaultDiceButtons()},
		// BaseSystem marks this as a named token-display variant of a hardcoded system
		// (FEATURE-102); "" keeps it a genuine custom template. Sections are ignored
		// when BaseSystem is set — the sheet comes from the Go plugin.
		BaseSystem: req.BaseSystem,
	}
	if err := s.repo.Create(t); err != nil {
		return nil, fmt.Errorf("failed to create template: %w", err)
	}
	return t, nil
}

func (s *TemplateService) Get(id string) (*models.SystemTemplate, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	return t, nil
}

// FindTokenConfig returns the user's token-display config singleton for a hardcoded
// system, or nil when not yet configured. Read-only (no creation) — used by the
// resolve-on-read path when assembling game state.
func (s *TemplateService) FindTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	t, err := s.repo.FindByOwnerAndBaseSystem(ownerID, baseSystem)
	if err != nil {
		return nil, err
	}
	if t != nil {
		t.IsOwner = t.OwnerID == ownerID
	}
	return t, nil
}

// GetOrCreateTokenConfig returns the user's single token-display config for a
// hardcoded system, creating an empty one on first use. Enforces the singleton per
// (owner, baseSystem): the sheet/rolls come from the Go plugin, so Sections stay
// empty and only Settings (dice + token display) are meaningful.
func (s *TemplateService) GetOrCreateTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	existing, err := s.repo.FindByOwnerAndBaseSystem(ownerID, baseSystem)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		existing.IsOwner = true
		return existing, nil
	}
	t := &models.SystemTemplate{
		OwnerID:    ownerID,
		Name:       baseSystem + " tokens",
		Sections:   []models.SectionDef{},
		Settings:   models.TemplateSettings{DiceButtons: models.DefaultDiceButtons()},
		BaseSystem: baseSystem,
	}
	if err := s.repo.Create(t); err != nil {
		return nil, fmt.Errorf("failed to create token config: %w", err)
	}
	t.IsOwner = true
	return t, nil
}

func (s *TemplateService) ListForUser(ownerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	templates, err := s.repo.ListVisibleToUser(ownerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	for i := range templates {
		templates[i].IsOwner = templates[i].OwnerID == ownerID
	}
	return templates, nil
}

func (s *TemplateService) Update(id string, ownerID primitive.ObjectID, req models.UpdateTemplateRequest) (*models.SystemTemplate, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	if t.OwnerID != ownerID {
		return nil, fmt.Errorf("not authorized")
	}
	if err := s.repo.Update(id, req.Name, req.Sections, req.Settings, req.IsPublic); err != nil {
		return nil, err
	}
	return s.repo.GetByID(id)
}

// Clone creates a private copy of a visible template (owned or public) for the
// given user. The copy keeps the source's sections and settings, records the
// source via OriginTemplateID, and is always private regardless of the source.
func (s *TemplateService) Clone(sourceID string, ownerID primitive.ObjectID, name string) (*models.SystemTemplate, error) {
	src, err := s.repo.GetByID(sourceID)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	// Visibility guard: GetByID does not filter by visibility, so block cloning
	// private templates the requester does not own.
	if !src.IsPublic && src.OwnerID != ownerID {
		return nil, fmt.Errorf("not authorized")
	}

	cloneName := name
	if cloneName == "" {
		cloneName = src.Name
	}

	clone := &models.SystemTemplate{
		OwnerID:          ownerID,
		Name:             cloneName,
		Sections:         src.Sections,
		Settings:         src.Settings,
		IsPublic:         false,
		OriginTemplateID: src.ID,
	}
	if err := s.repo.Create(clone); err != nil {
		return nil, fmt.Errorf("failed to clone template: %w", err)
	}
	clone.IsOwner = true
	return clone, nil
}

func (s *TemplateService) Delete(id string, ownerID primitive.ObjectID) error {
	return s.repo.Delete(id, ownerID)
}
