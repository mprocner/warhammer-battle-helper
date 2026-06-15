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
