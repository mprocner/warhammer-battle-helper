package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// Template errors. The messages are stable codes: handlers send them verbatim and the creator
// maps them to translated text (memberErrorKey in TemplateAccessCard.jsx).
var (
	ErrTemplateNotFound        = errors.New("template not found")
	ErrTemplateForbidden       = errors.New("not authorized")
	ErrTemplateVersionRequired = errors.New("version is required")
	ErrTemplateLastOwner       = errors.New("template must keep at least one owner")
	ErrTemplateMemberNotFound  = errors.New("member not found")
	ErrTemplateInvalidRole     = errors.New("invalid role")
	ErrTemplateNotShareable    = errors.New("token config templates cannot be shared")
	ErrShareUserNotFound       = errors.New("user not found")
	ErrShareSelf               = errors.New("cannot share with yourself")
)

// TemplateConflictError rejects a save made against a version somebody else has already
// replaced. It carries what the creator shows before the user picks "load theirs" or "overwrite":
// the version to overwrite with, and who saved it when.
type TemplateConflictError struct {
	Version   int
	UpdatedBy string // email; "" when the account could not be resolved
	UpdatedAt time.Time
}

func (e *TemplateConflictError) Error() string { return "version conflict" }

type TemplateService struct {
	repo     *repository.TemplateRepository
	userRepo *repository.UserRepository
}

func NewTemplateService(repo *repository.TemplateRepository, userRepo *repository.UserRepository) *TemplateService {
	return &TemplateService{repo: repo, userRepo: userRepo}
}

// load reads a template; any read failure is reported as not found, as before PLAYRPG-279.
func (s *TemplateService) load(id string) (*models.SystemTemplate, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrTemplateNotFound
	}
	return t, nil
}

// deny picks the error for a user lacking an action. Somebody who cannot even use the template
// must not learn it exists, so they get "not found" rather than "not authorized".
func deny(t *models.SystemTemplate, userID primitive.ObjectID) error {
	if CanOnTemplate(t, userID, models.ActionUse) {
		return ErrTemplateForbidden
	}
	return ErrTemplateNotFound
}

func (s *TemplateService) loadFor(id string, userID primitive.ObjectID, a models.TemplateAction) (*models.SystemTemplate, error) {
	t, err := s.load(id)
	if err != nil {
		return nil, err
	}
	if !CanOnTemplate(t, userID, a) {
		return nil, deny(t, userID)
	}
	return t, nil
}

// loadForShare is loadFor(ActionShare) that also refuses token-config singletons, which are
// private per user and have no access card.
func (s *TemplateService) loadForShare(id string, callerID primitive.ObjectID) (*models.SystemTemplate, error) {
	t, err := s.loadFor(id, callerID, models.ActionShare)
	if err != nil {
		return nil, err
	}
	if t.BaseSystem != "" {
		return nil, ErrTemplateNotShareable
	}
	return t, nil
}

// stamp sets the per-request role fields that need no database lookup.
func stamp(t *models.SystemTemplate, viewerID primitive.ObjectID) {
	t.MyRole = RoleOf(t, viewerID)
	t.Permissions = PermissionsFor(t, viewerID)
}

// decorate fills every per-request field for viewerID, resolving all needed emails in ONE
// FindByIDs across the batch — a query per template would turn a lobby load into N+1.
// MembersView goes only to viewers who may share; OwnerEmails only to members below owner.
// Role and permissions are set before the lookup, so a failed lookup costs the emails, never the
// gating: callers log the error and still answer.
func (s *TemplateService) decorate(templates []*models.SystemTemplate, viewerID primitive.ObjectID) error {
	var ids []primitive.ObjectID
	seen := make(map[primitive.ObjectID]bool)
	for _, t := range templates {
		stamp(t, viewerID)
		for _, m := range t.Members {
			wanted := t.Permissions.Share || (t.MyRole != "" && m.Role == models.RoleOwner)
			if wanted && !seen[m.UserID] {
				seen[m.UserID] = true
				ids = append(ids, m.UserID)
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
		if t.Permissions.Share {
			views := make([]models.TemplateMemberView, 0, len(t.Members))
			for _, m := range t.Members {
				// An id with no account behind it is skipped: a list hiding one dead row beats a
				// creator that cannot open.
				if email, ok := emails[m.UserID]; ok {
					views = append(views, models.TemplateMemberView{UserID: m.UserID, Email: email, Role: m.Role, IsMe: m.UserID == viewerID})
				}
			}
			t.MembersView = views
			continue
		}
		if t.MyRole == "" {
			continue
		}
		for _, m := range t.Members {
			if email, ok := emails[m.UserID]; ok && m.Role == models.RoleOwner {
				t.OwnerEmails = append(t.OwnerEmails, email)
			}
		}
	}
	return nil
}

func (s *TemplateService) decorateOrLog(templates []*models.SystemTemplate, viewerID primitive.ObjectID) {
	if err := s.decorate(templates, viewerID); err != nil {
		log.Printf("warn: failed to resolve template member emails for user %s: %v", viewerID.Hex(), err)
	}
}

// listMembers re-reads the template and answers with its members as stored, never a list the
// handler assembled optimistically. Always a non-nil slice, so the client gets [] and not null.
func (s *TemplateService) listMembers(id string, callerID primitive.ObjectID) ([]models.TemplateMemberView, error) {
	t, err := s.load(id)
	if err != nil {
		return nil, err
	}
	if err := s.decorate([]*models.SystemTemplate{t}, callerID); err != nil {
		return nil, err
	}
	if t.MembersView == nil {
		return []models.TemplateMemberView{}, nil
	}
	return t.MembersView, nil
}

// explainNoMatch names the condition that made a conditional member write match nothing, by
// re-reading the template: gone, caller lost the share role, target is no member, or — the
// remaining guard in the filter — the write would have left no owner. A zero targetID is a write
// with no target guard (visibility, add): once share holds, only a concurrent delete is left.
func (s *TemplateService) explainNoMatch(id string, callerID, targetID primitive.ObjectID) error {
	t, err := s.load(id)
	if err != nil {
		return ErrTemplateNotFound
	}
	if !CanOnTemplate(t, callerID, models.ActionShare) {
		return deny(t, callerID)
	}
	if targetID.IsZero() {
		return ErrTemplateNotFound
	}
	if RoleOf(t, targetID) == "" {
		return ErrTemplateMemberNotFound
	}
	return ErrTemplateLastOwner
}

func (s *TemplateService) ListForUser(viewerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	templates, err := s.repo.ListVisibleToMember(viewerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	refs := make([]*models.SystemTemplate, len(templates))
	for i := range templates {
		refs[i] = &templates[i]
	}
	// Emails are decoration: useTemplates.js swallows a fetch error wholesale, so failing here
	// would empty the whole lobby over a problem with one column.
	s.decorateOrLog(refs, viewerID)
	return templates, nil
}

// Get reads a template with no access check. Internal callers only (game creation checks
// CanOnTemplate itself; SyncTemplate re-reads the template a game was created from, which its GM
// keeps the right to do even after losing access). HTTP reads go through GetForUser.
func (s *TemplateService) Get(id string) (*models.SystemTemplate, error) {
	return s.load(id)
}

// GetForUser reads a template the viewer may use. Without access it is "not found", so ids
// cannot be probed for existence.
func (s *TemplateService) GetForUser(id string, viewerID primitive.ObjectID) (*models.SystemTemplate, error) {
	t, err := s.loadFor(id, viewerID, models.ActionUse)
	if err != nil {
		return nil, err
	}
	s.decorateOrLog([]*models.SystemTemplate{t}, viewerID)
	return t, nil
}

func (s *TemplateService) Create(ownerID primitive.ObjectID, req models.CreateTemplateRequest) (*models.SystemTemplate, error) {
	if req.Sections == nil {
		req.Sections = []models.SectionDef{}
	}
	if err := models.NormalizeTemplateAbout(req.BaseSystem, req.Description, req.Language); err != nil {
		return nil, err
	}
	t := &models.SystemTemplate{
		Members:     []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}},
		Name:        req.Name,
		Sections:    req.Sections,
		Description: derefOr(req.Description),
		Language:    derefOr(req.Language),
		Settings:    models.TemplateSettings{DiceButtons: models.DefaultDiceButtons()},
		// BaseSystem marks this as a named token-display variant of a hardcoded system
		// (FEATURE-102); "" keeps it a genuine custom template. Sections are ignored
		// when BaseSystem is set — the sheet comes from the Go plugin.
		BaseSystem: req.BaseSystem,
	}
	// Token-display variants (BaseSystem != "") carry no sheet, so only genuine custom
	// templates are checked.
	if t.BaseSystem == "" {
		if err := t.ValidateSingletonFields(); err != nil {
			return nil, err
		}
	}
	if err := s.repo.Create(t); err != nil {
		return nil, fmt.Errorf("failed to create template: %w", err)
	}
	// Without the per-request fields the fresh row would be filed under "public" by the client.
	s.decorateOrLog([]*models.SystemTemplate{t}, ownerID)
	return t, nil
}

// GetVersionsByIDs returns the current version of each still-existing template in ids.
func (s *TemplateService) GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	return s.repo.GetVersionsByIDs(ids)
}

// FindTokenConfig returns the user's token-display config singleton for a hardcoded system, or
// nil when not yet configured. Read-only — used when assembling game state.
func (s *TemplateService) FindTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	t, err := s.repo.FindTokenConfig(ownerID, baseSystem)
	if err != nil {
		return nil, err
	}
	if t != nil {
		stamp(t, ownerID)
	}
	return t, nil
}

// GetOrCreateTokenConfig returns the user's single token-display config for a hardcoded system,
// creating an empty one on first use. Sections stay empty; only Settings are meaningful.
func (s *TemplateService) GetOrCreateTokenConfig(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	existing, err := s.repo.FindTokenConfig(ownerID, baseSystem)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		stamp(existing, ownerID)
		return existing, nil
	}
	t := &models.SystemTemplate{
		Members:    []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}},
		Name:       baseSystem + " tokens",
		Sections:   []models.SectionDef{},
		Settings:   models.TemplateSettings{DiceButtons: models.DefaultDiceButtons()},
		BaseSystem: baseSystem,
	}
	if err := s.repo.Create(t); err != nil {
		return nil, fmt.Errorf("failed to create token config: %w", err)
	}
	stamp(t, ownerID)
	return t, nil
}

// Update saves content for a member who may edit. Order matters: permission first (a demoted
// editor with the creator still open gets 403, not a conflict), then the version.
func (s *TemplateService) Update(id string, editorID primitive.ObjectID, req models.UpdateTemplateRequest) (*models.SystemTemplate, error) {
	t, err := s.loadFor(id, editorID, models.ActionEdit)
	if err != nil {
		return nil, err
	}
	if req.Version == nil {
		return nil, ErrTemplateVersionRequired
	}
	if t.BaseSystem == "" {
		incoming := &models.SystemTemplate{Sections: req.Sections}
		if err := incoming.ValidateSingletonFields(); err != nil {
			return nil, err
		}
	}
	if err := models.NormalizeTemplateAbout(t.BaseSystem, req.Description, req.Language); err != nil {
		return nil, err
	}
	if req.Settings != nil {
		if err := req.Settings.SuccessLevels.Validate(); err != nil {
			return nil, err
		}
	}
	err = s.repo.UpdateContent(id, editorID, req, templateContentChanged(t, req))
	if errors.Is(err, repository.ErrTemplateNoMatch) {
		return nil, s.saveRejection(id, editorID)
	}
	if err != nil {
		return nil, err
	}
	updated, err := s.load(id)
	if err != nil {
		return nil, err
	}
	// The creator replaces its template object with this response, so every per-request field
	// must be recomputed here or the UI would lose its members and permissions until a refetch.
	s.decorateOrLog([]*models.SystemTemplate{updated}, editorID)
	return updated, nil
}

// saveRejection explains an UpdateContent that matched nothing: the template is gone, the editor
// lost the role between read and write, or — the usual case — somebody saved first.
func (s *TemplateService) saveRejection(id string, editorID primitive.ObjectID) error {
	current, err := s.load(id)
	if err != nil {
		return ErrTemplateNotFound
	}
	if !CanOnTemplate(current, editorID, models.ActionEdit) {
		return deny(current, editorID)
	}
	conflict := &TemplateConflictError{Version: current.Version, UpdatedAt: current.UpdatedAt}
	if !current.UpdatedBy.IsZero() {
		if users, err := s.userRepo.FindByIDs([]primitive.ObjectID{current.UpdatedBy}); err == nil && len(users) == 1 {
			conflict.UpdatedBy = users[0].Email
		}
	}
	return conflict
}

// SetVisibility switches isPublic for a member who may share.
func (s *TemplateService) SetVisibility(id string, callerID primitive.ObjectID, isPublic bool) (*models.SystemTemplate, error) {
	if _, err := s.loadForShare(id, callerID); err != nil {
		return nil, err
	}
	if err := s.repo.SetVisibility(id, callerID, isPublic); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return nil, s.explainNoMatch(id, callerID, primitive.NilObjectID)
		}
		return nil, err
	}
	updated, err := s.load(id)
	if err != nil {
		return nil, err
	}
	s.decorateOrLog([]*models.SystemTemplate{updated}, callerID)
	return updated, nil
}

// AddMember grants the account behind email the given role and returns the member list. Adding
// somebody who is already a member changes their role instead.
//
// The share permission is confirmed BEFORE the address is resolved: FindByEmailCI's hit/miss split
// is itself sensitive ("this address has an account"), and resolving first would let any caller
// probe arbitrary addresses against any template id.
func (s *TemplateService) AddMember(id string, callerID primitive.ObjectID, email, role string) ([]models.TemplateMemberView, error) {
	if !models.IsValidRole(role) {
		return nil, ErrTemplateInvalidRole
	}
	t, err := s.loadForShare(id, callerID)
	if err != nil {
		return nil, err
	}
	target, err := s.userRepo.FindByEmailCI(email)
	if err != nil {
		// Only a genuine miss is "user not found"; an infrastructure failure must not be blamed
		// on the address the owner typed.
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrShareUserNotFound
		}
		return nil, err
	}
	if target.ID == callerID {
		return nil, ErrShareSelf
	}
	if RoleOf(t, target.ID) != "" {
		return s.SetMemberRole(id, callerID, target.ID, role)
	}
	err = s.repo.AddMember(id, callerID, models.TemplateMember{UserID: target.ID, Role: role})
	if errors.Is(err, repository.ErrTemplateNoMatch) {
		// Lost a race to another owner adding the same person: that is a role change now.
		if current, rerr := s.load(id); rerr == nil && RoleOf(current, target.ID) != "" {
			return s.SetMemberRole(id, callerID, target.ID, role)
		}
		return nil, s.explainNoMatch(id, callerID, primitive.NilObjectID)
	}
	if err != nil {
		return nil, err
	}
	return s.listMembers(id, callerID)
}

// SetMemberRole changes a member's role and returns the member list.
func (s *TemplateService) SetMemberRole(id string, callerID, targetID primitive.ObjectID, role string) ([]models.TemplateMemberView, error) {
	if !models.IsValidRole(role) {
		return nil, ErrTemplateInvalidRole
	}
	t, err := s.loadForShare(id, callerID)
	if err != nil {
		return nil, err
	}
	if RoleOf(t, targetID) == "" {
		return nil, ErrTemplateMemberNotFound
	}
	if err := s.repo.SetMemberRole(id, callerID, targetID, role); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return nil, s.explainNoMatch(id, callerID, targetID)
		}
		return nil, err
	}
	return s.listMembers(id, callerID)
}

// RemoveMember revokes a member's access and returns the remaining list.
func (s *TemplateService) RemoveMember(id string, callerID, targetID primitive.ObjectID) ([]models.TemplateMemberView, error) {
	t, err := s.loadForShare(id, callerID)
	if err != nil {
		return nil, err
	}
	if RoleOf(t, targetID) == "" {
		return nil, ErrTemplateMemberNotFound
	}
	if err := s.repo.RemoveMember(id, callerID, targetID); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return nil, s.explainNoMatch(id, callerID, targetID)
		}
		return nil, err
	}
	return s.listMembers(id, callerID)
}

// Leave removes the caller from a template's members. Leaving twice is not an error.
func (s *TemplateService) Leave(id string, userID primitive.ObjectID) error {
	t, err := s.load(id)
	if err != nil {
		return err
	}
	if RoleOf(t, userID) == "" {
		return ErrTemplateNotFound
	}
	if err := s.repo.Leave(id, userID); err != nil {
		if !errors.Is(err, repository.ErrTemplateNoMatch) {
			return err
		}
		current, rerr := s.load(id)
		if rerr != nil || RoleOf(current, userID) == "" {
			return nil
		}
		return ErrTemplateLastOwner
	}
	return nil
}

// Clone creates a private copy of a template the caller may use, owned by the caller alone.
func (s *TemplateService) Clone(sourceID string, ownerID primitive.ObjectID, name string) (*models.SystemTemplate, error) {
	src, err := s.loadFor(sourceID, ownerID, models.ActionUse)
	if err != nil {
		return nil, err
	}
	cloneName := name
	if cloneName == "" {
		cloneName = src.Name
	}
	clone := &models.SystemTemplate{
		Members:          []models.TemplateMember{{UserID: ownerID, Role: models.RoleOwner}},
		Name:             cloneName,
		Sections:         src.Sections,
		Settings:         src.Settings,
		IsPublic:         false,
		OriginTemplateID: src.ID,
		Description:      src.Description,
		Language:         src.Language,
	}
	if err := s.repo.Create(clone); err != nil {
		return nil, fmt.Errorf("failed to clone template: %w", err)
	}
	s.decorateOrLog([]*models.SystemTemplate{clone}, ownerID)
	return clone, nil
}

// Delete removes a template for a member who may delete it.
func (s *TemplateService) Delete(id string, callerID primitive.ObjectID) error {
	if _, err := s.loadFor(id, callerID, models.ActionDelete); err != nil {
		return err
	}
	if err := s.repo.DeleteAsMember(id, callerID); err != nil {
		if errors.Is(err, repository.ErrTemplateNoMatch) {
			return ErrTemplateNotFound
		}
		return err
	}
	return nil
}

// RemoveUserEverywhere drops a deleted account from every template's members.
func (s *TemplateService) RemoveUserEverywhere(userID primitive.ObjectID) error {
	return s.repo.PullMemberEverywhere(userID)
}

// templateContentChanged reports whether req alters what players see (name, sections, settings, description, language).
// The creator sends the whole body on every save — visibility toggles and no-op autosaves
// included — so "field present" says nothing; only a value comparison does. JSON is the
// comparison form because encoding/json sorts map keys (TemplateSettings carries maps),
// which bson does not guarantee.
func templateContentChanged(current *models.SystemTemplate, req models.UpdateTemplateRequest) bool {
	if req.Name != nil && *req.Name != current.Name {
		return true
	}
	if req.Sections != nil && !sameJSON(req.Sections, current.Sections) {
		return true
	}
	if req.Settings != nil && !sameJSON(*req.Settings, current.Settings) {
		return true
	}
	if req.Description != nil && *req.Description != current.Description {
		return true
	}
	if req.Language != nil && *req.Language != current.Language {
		return true
	}
	return false
}

// sameJSON compares two values by their JSON encoding. A marshal error counts as "different",
// so a failure can only cause a spurious version bump, never hide a real change.
func sameJSON(a, b interface{}) bool {
	ja, errA := json.Marshal(a)
	jb, errB := json.Marshal(b)
	return errA == nil && errB == nil && bytes.Equal(ja, jb)
}

// derefOr returns *s, or "" for a field the request left out.
func derefOr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
