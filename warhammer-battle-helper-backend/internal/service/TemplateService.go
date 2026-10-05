package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"errors"
	"fmt"
	"log"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type TemplateService struct {
	repo     *repository.TemplateRepository
	userRepo *repository.UserRepository
}

func NewTemplateService(repo *repository.TemplateRepository, userRepo *repository.UserRepository) *TemplateService {
	return &TemplateService{repo: repo, userRepo: userRepo}
}

// attachShares fills SharedWithUsers on every template viewerID owns, resolving all their
// recipient ids in ONE FindByIDs across the whole batch — a query per template would turn a
// lobby load into N+1. Templates the viewer does not own are left untouched: who else may use
// somebody's template is the owner's business alone.
//
// An id that resolves to no account is skipped rather than reported. Accounts are not deleted
// anywhere in this codebase today, so this is defence against a hand-edited document, not an
// expected state — and a share list that hides one dead row is better than a creator that
// cannot open.
func (s *TemplateService) attachShares(templates []*models.SystemTemplate, viewerID primitive.ObjectID) error {
	var ids []primitive.ObjectID
	seen := make(map[primitive.ObjectID]bool)
	for _, t := range templates {
		if t.OwnerID != viewerID {
			continue
		}
		for _, id := range t.SharedWith {
			if !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}

	users, err := s.userRepo.FindByIDs(ids)
	if err != nil {
		return err
	}
	emails := make(map[primitive.ObjectID]string, len(users))
	for _, u := range users {
		emails[u.ID] = u.Email
	}

	for _, t := range templates {
		if t.OwnerID != viewerID || len(t.SharedWith) == 0 {
			continue
		}
		shares := make([]models.TemplateShare, 0, len(t.SharedWith))
		for _, id := range t.SharedWith {
			if email, ok := emails[id]; ok {
				shares = append(shares, models.TemplateShare{UserID: id, Email: email})
			}
		}
		t.SharedWithUsers = shares
	}
	return nil
}

// listShares re-reads the template and resolves its recipients, so every share endpoint answers
// with the list as actually stored rather than one the handler assembled optimistically.
// It returns an empty (non-nil) slice for a template shared with nobody, so the client always
// receives [] and never null.
func (s *TemplateService) listShares(id string, ownerID primitive.ObjectID) ([]models.TemplateShare, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	if t.OwnerID != ownerID {
		return nil, fmt.Errorf("not authorized")
	}
	if err := s.attachShares([]*models.SystemTemplate{t}, ownerID); err != nil {
		return nil, err
	}
	if t.SharedWithUsers == nil {
		return []models.TemplateShare{}, nil
	}
	return t.SharedWithUsers, nil
}

// AddShare grants the account behind email read/clone access to a template the caller owns and
// returns the resulting recipient list. The address is resolved here, and a miss is a loud
// error: that is what keeps SharedWith free of ids pointing at nobody, and what makes a typo
// visible to the owner instead of silently granting access to no one.
//
// Ownership is confirmed BEFORE the address is resolved. FindByEmailCI's hit/miss split is
// itself sensitive information ("this address has an account"); resolving it first would let
// any authenticated caller probe arbitrary addresses against any template id — their own,
// someone else's, or a stale one — since the hit/miss answer never depended on owning anything.
// Checking ownership first closes that off at no extra cost to the legitimate path: listShares
// re-reads the template at the end regardless, to answer with state as actually stored.
func (s *TemplateService) AddShare(id string, ownerID primitive.ObjectID, email string) ([]models.TemplateShare, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	if t.OwnerID != ownerID {
		return nil, fmt.Errorf("template not found or not owned by user")
	}

	target, err := s.userRepo.FindByEmailCI(email)
	if err != nil {
		// Only a genuine miss is "user not found" — a user-facing, expected outcome. Any other
		// failure (connection drop, timeout) is an infrastructure problem the owner did nothing
		// to cause and must not be told their address is the problem.
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}
	if target.ID == ownerID {
		return nil, fmt.Errorf("cannot share with yourself")
	}
	if err := s.repo.AddShare(id, ownerID, target.ID); err != nil {
		return nil, err
	}
	return s.listShares(id, ownerID)
}

// RemoveShare revokes one recipient's access and returns the remaining list. It takes a user id,
// not an email: the client already has the id from the list it is showing, so there is nothing
// to resolve and nothing to get wrong.
func (s *TemplateService) RemoveShare(id string, ownerID, targetID primitive.ObjectID) ([]models.TemplateShare, error) {
	if err := s.repo.RemoveShare(id, ownerID, targetID); err != nil {
		return nil, err
	}
	return s.listShares(id, ownerID)
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
	refs := make([]*models.SystemTemplate, len(templates))
	for i := range templates {
		templates[i].IsOwner = templates[i].OwnerID == ownerID
		refs[i] = &templates[i]
	}
	// SharedWithUsers is decoration on the owner's own rows, not the list itself: useTemplates.js
	// (frontend) swallows a fetch error wholesale, so failing ListForUser here would empty the
	// whole lobby over a problem with the recipients column. Log it and answer with templates
	// that simply have no resolved share emails, rather than no templates at all.
	if err := s.attachShares(refs, ownerID); err != nil {
		log.Printf("warn: failed to resolve template shares for user %s: %v", ownerID.Hex(), err)
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
	updated, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	// The creator replaces its whole template object with this response, so anything computed
	// per-request has to be recomputed here. Without SharedWithUsers the debounced save would
	// blank the share list in the UI without touching the database; without IsOwner the manager
	// row would lose its edit and delete buttons until the next refetch.
	updated.IsOwner = updated.OwnerID == ownerID
	if err := s.attachShares([]*models.SystemTemplate{updated}, ownerID); err != nil {
		return nil, err
	}
	return updated, nil
}

// Clone creates a private copy of a visible template (owned or public) for the
// given user. The copy keeps the source's sections and settings, records the
// source via OriginTemplateID, and is always private regardless of the source.
func (s *TemplateService) Clone(sourceID string, ownerID primitive.ObjectID, name string) (*models.SystemTemplate, error) {
	src, err := s.repo.GetByID(sourceID)
	if err != nil {
		return nil, fmt.Errorf("template not found")
	}
	// Visibility guard: GetByID does not filter by visibility, so block cloning a template the
	// requester may not use. One predicate, the same one the game-creation path uses.
	if !CanUseTemplate(src, ownerID) {
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
