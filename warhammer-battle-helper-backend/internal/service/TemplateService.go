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
	templates, err := s.repo.ListByOwner(ownerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
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
	if err := s.repo.Update(id, req.Name, req.Sections); err != nil {
		return nil, err
	}
	return s.repo.GetByID(id)
}

func (s *TemplateService) Delete(id string, ownerID primitive.ObjectID) error {
	return s.repo.Delete(id, ownerID)
}
