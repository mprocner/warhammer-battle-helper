package service

import (
	"context"
	"errors"
	"slices"

	"battle-helper/internal/models"
	"battle-helper/internal/systems/registry"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrUnknownSystem = errors.New("not a configurable game system")
	ErrInvalidUserID = errors.New("invalid user id")
)

// systemAccessStore is the persistence port of SystemAccessService, declared by the consumer
// so tests can pass a stub instead of MongoDB.
type systemAccessStore interface {
	List(ctx context.Context) ([]models.SystemAccess, error)
	Get(ctx context.Context, system string) (*models.SystemAccess, error)
	Upsert(ctx context.Context, system string, allUsers bool, userIDs []primitive.ObjectID) error
	PullUser(ctx context.Context, userID primitive.ObjectID) error
}

// SystemAccessView is one row of the admin "Systems" tab. ID is the system key because
// react-admin requires an `id` field.
type SystemAccessView struct {
	ID         string   `json:"id"`
	AllUsers   bool     `json:"allUsers"`
	UserIDs    []string `json:"userIds"`
	Configured bool     `json:"configured"`
}

// SystemAccessService decides who may create games in each hardcoded system.
// Only creation is gated: existing games stay reachable for their GM and players.
type SystemAccessService struct {
	store systemAccessStore
}

func NewSystemAccessService(store systemAccessStore) *SystemAccessService {
	return &SystemAccessService{store: store}
}

// allowed is the whole access rule. A missing document denies everyone, so a system newly
// added to the registry stays hidden until the admin opens it.
func allowed(doc *models.SystemAccess, userID primitive.ObjectID) bool {
	if doc == nil {
		return false
	}
	return doc.AllUsers || slices.Contains(doc.UserIDs, userID)
}

func isHardcoded(system string) bool {
	return slices.Contains(registry.HardcodedSystems(), system)
}

func (s *SystemAccessService) IsAllowed(ctx context.Context, system string, userID primitive.ObjectID) (bool, error) {
	if system == registry.CustomSystem {
		return true, nil
	}
	doc, err := s.store.Get(ctx, system)
	if err != nil {
		return false, err
	}
	return allowed(doc, userID), nil
}

// AllowedSystems lists the systems userID may create games in, in registry order.
func (s *SystemAccessService) AllowedSystems(ctx context.Context, userID primitive.ObjectID) ([]string, error) {
	docs, err := s.byID(ctx)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, sys := range registry.HardcodedSystems() {
		if allowed(docs[sys], userID) {
			out = append(out, sys)
		}
	}
	return append(out, registry.CustomSystem), nil
}

// AdminList returns one row per hardcoded system, configured or not.
func (s *SystemAccessService) AdminList(ctx context.Context) ([]SystemAccessView, error) {
	docs, err := s.byID(ctx)
	if err != nil {
		return nil, err
	}
	systems := registry.HardcodedSystems()
	out := make([]SystemAccessView, 0, len(systems))
	for _, sys := range systems {
		out = append(out, view(sys, docs[sys]))
	}
	return out, nil
}

func (s *SystemAccessService) AdminGet(ctx context.Context, system string) (*SystemAccessView, error) {
	if !isHardcoded(system) {
		return nil, ErrUnknownSystem
	}
	doc, err := s.store.Get(ctx, system)
	if err != nil {
		return nil, err
	}
	v := view(system, doc)
	return &v, nil
}

// AdminUpdate validates everything before writing, so a bad request never half-applies.
func (s *SystemAccessService) AdminUpdate(ctx context.Context, system string, allUsers bool, userIDs []string) (*SystemAccessView, error) {
	if !isHardcoded(system) {
		return nil, ErrUnknownSystem
	}
	ids := make([]primitive.ObjectID, 0, len(userIDs))
	for _, raw := range userIDs {
		id, err := primitive.ObjectIDFromHex(raw)
		if err != nil {
			return nil, ErrInvalidUserID
		}
		ids = append(ids, id)
	}
	if err := s.store.Upsert(ctx, system, allUsers, ids); err != nil {
		return nil, err
	}
	v := view(system, &models.SystemAccess{System: system, AllUsers: allUsers, UserIDs: ids})
	return &v, nil
}

// RemoveUser drops a deleted account from every system's list, so no orphaned id remains.
func (s *SystemAccessService) RemoveUser(ctx context.Context, userID primitive.ObjectID) error {
	return s.store.PullUser(ctx, userID)
}

func (s *SystemAccessService) byID(ctx context.Context) (map[string]*models.SystemAccess, error) {
	docs, err := s.store.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]*models.SystemAccess, len(docs))
	for i := range docs {
		out[docs[i].System] = &docs[i]
	}
	return out, nil
}

func view(system string, doc *models.SystemAccess) SystemAccessView {
	v := SystemAccessView{ID: system, UserIDs: []string{}}
	if doc == nil {
		return v
	}
	v.Configured = true
	v.AllUsers = doc.AllUsers
	for _, id := range doc.UserIDs {
		v.UserIDs = append(v.UserIDs, id.Hex())
	}
	return v
}
