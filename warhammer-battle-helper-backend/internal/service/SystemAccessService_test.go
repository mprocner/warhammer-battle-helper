package service

import (
	"context"
	"errors"
	"slices"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubAccessStore struct {
	docs     map[string]*models.SystemAccess
	err      error
	calls    int
	upserted *models.SystemAccess
	pulled   primitive.ObjectID
}

func (s *stubAccessStore) List(ctx context.Context) ([]models.SystemAccess, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	out := []models.SystemAccess{}
	for _, d := range s.docs {
		out = append(out, *d)
	}
	return out, nil
}

func (s *stubAccessStore) Get(ctx context.Context, system string) (*models.SystemAccess, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return s.docs[system], nil
}

func (s *stubAccessStore) Upsert(ctx context.Context, system string, allUsers bool, userIDs []primitive.ObjectID) error {
	s.calls++
	s.upserted = &models.SystemAccess{System: system, AllUsers: allUsers, UserIDs: userIDs}
	return s.err
}

func (s *stubAccessStore) PullUser(ctx context.Context, userID primitive.ObjectID) error {
	s.calls++
	s.pulled = userID
	return s.err
}

func TestAllowed(t *testing.T) {
	me := primitive.NewObjectID()
	other := primitive.NewObjectID()
	cases := []struct {
		name string
		doc  *models.SystemAccess
		want bool
	}{
		{"no document is fail-closed", nil, false},
		{"all users", &models.SystemAccess{AllUsers: true}, true},
		{"all users ignores the list", &models.SystemAccess{AllUsers: true, UserIDs: []primitive.ObjectID{other}}, true},
		{"on the list", &models.SystemAccess{UserIDs: []primitive.ObjectID{other, me}}, true},
		{"not on the list", &models.SystemAccess{UserIDs: []primitive.ObjectID{other}}, false},
		{"empty list means nobody", &models.SystemAccess{UserIDs: []primitive.ObjectID{}}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := allowed(tc.doc, me); got != tc.want {
				t.Errorf("allowed = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestIsAllowedCustomSkipsStore(t *testing.T) {
	store := &stubAccessStore{}
	ok, err := NewSystemAccessService(store).IsAllowed(context.Background(), "custom", primitive.NewObjectID())
	if err != nil || !ok {
		t.Fatalf("IsAllowed(custom) = %v, %v; want true, nil", ok, err)
	}
	if store.calls != 0 {
		t.Errorf("store touched %d times for custom", store.calls)
	}
}

func TestIsAllowedReadsDocument(t *testing.T) {
	me := primitive.NewObjectID()
	store := &stubAccessStore{docs: map[string]*models.SystemAccess{
		"srd5": {System: "srd5", UserIDs: []primitive.ObjectID{me}},
	}}
	svc := NewSystemAccessService(store)
	if ok, _ := svc.IsAllowed(context.Background(), "srd5", me); !ok {
		t.Error("listed user denied srd5")
	}
	if ok, _ := svc.IsAllowed(context.Background(), "warhammer4e", me); ok {
		t.Error("unconfigured warhammer4e allowed")
	}
}

func TestIsAllowedPropagatesStoreError(t *testing.T) {
	store := &stubAccessStore{err: errors.New("db down")}
	ok, err := NewSystemAccessService(store).IsAllowed(context.Background(), "srd5", primitive.NewObjectID())
	if err == nil || ok {
		t.Fatalf("IsAllowed = %v, %v; want false, error", ok, err)
	}
}

func TestAllowedSystems(t *testing.T) {
	me := primitive.NewObjectID()
	store := &stubAccessStore{docs: map[string]*models.SystemAccess{
		"srd5":        {System: "srd5", UserIDs: []primitive.ObjectID{me}},
		"warhammer4e": {System: "warhammer4e", AllUsers: true},
		"coc7e":       {System: "coc7e", UserIDs: []primitive.ObjectID{primitive.NewObjectID()}},
	}}
	got, err := NewSystemAccessService(store).AllowedSystems(context.Background(), me)
	if err != nil {
		t.Fatal(err)
	}
	// Registry order, custom always last.
	want := []string{"warhammer4e", "srd5", "custom"}
	if !slices.Equal(got, want) {
		t.Errorf("AllowedSystems = %v, want %v", got, want)
	}
}

func TestAllowedSystemsEmptyStoreLeavesOnlyCustom(t *testing.T) {
	got, err := NewSystemAccessService(&stubAccessStore{}).AllowedSystems(context.Background(), primitive.NewObjectID())
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got, []string{"custom"}) {
		t.Errorf("AllowedSystems = %v, want [custom]", got)
	}
}

func TestAdminListReturnsEveryHardcodedSystem(t *testing.T) {
	u := primitive.NewObjectID()
	store := &stubAccessStore{docs: map[string]*models.SystemAccess{
		"srd5": {System: "srd5", UserIDs: []primitive.ObjectID{u}},
	}}
	rows, err := NewSystemAccessService(store).AdminList(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 4 {
		t.Fatalf("got %d rows, want 4: %+v", len(rows), rows)
	}
	for _, r := range rows {
		if r.UserIDs == nil {
			t.Errorf("%s: userIds is nil, must serialize as []", r.ID)
		}
		switch r.ID {
		case "srd5":
			if !r.Configured || !slices.Equal(r.UserIDs, []string{u.Hex()}) {
				t.Errorf("srd5 row = %+v", r)
			}
		case "custom":
			t.Error("custom must not be listed")
		default:
			if r.Configured || r.AllUsers || len(r.UserIDs) != 0 {
				t.Errorf("unconfigured row = %+v", r)
			}
		}
	}
}

func TestAdminGetRejectsNonHardcoded(t *testing.T) {
	svc := NewSystemAccessService(&stubAccessStore{})
	for _, sys := range []string{"custom", "pf2e"} {
		if _, err := svc.AdminGet(context.Background(), sys); !errors.Is(err, ErrUnknownSystem) {
			t.Errorf("AdminGet(%q) err = %v, want ErrUnknownSystem", sys, err)
		}
	}
}

func TestAdminUpdate(t *testing.T) {
	u := primitive.NewObjectID()
	store := &stubAccessStore{}
	row, err := NewSystemAccessService(store).AdminUpdate(context.Background(), "srd5", false, []string{u.Hex()})
	if err != nil {
		t.Fatal(err)
	}
	if store.upserted == nil || store.upserted.System != "srd5" || !slices.Equal(store.upserted.UserIDs, []primitive.ObjectID{u}) {
		t.Errorf("upserted = %+v", store.upserted)
	}
	if !row.Configured || !slices.Equal(row.UserIDs, []string{u.Hex()}) {
		t.Errorf("row = %+v", row)
	}
}

func TestAdminUpdateValidatesBeforeWriting(t *testing.T) {
	store := &stubAccessStore{}
	svc := NewSystemAccessService(store)
	if _, err := svc.AdminUpdate(context.Background(), "custom", true, nil); !errors.Is(err, ErrUnknownSystem) {
		t.Errorf("custom: err = %v, want ErrUnknownSystem", err)
	}
	if _, err := svc.AdminUpdate(context.Background(), "srd5", false, []string{"nope"}); !errors.Is(err, ErrInvalidUserID) {
		t.Errorf("bad id: err = %v, want ErrInvalidUserID", err)
	}
	if store.calls != 0 {
		t.Errorf("store touched %d times on invalid input", store.calls)
	}
}

func TestRemoveUser(t *testing.T) {
	u := primitive.NewObjectID()
	store := &stubAccessStore{}
	if err := NewSystemAccessService(store).RemoveUser(context.Background(), u); err != nil {
		t.Fatal(err)
	}
	if store.pulled != u {
		t.Errorf("pulled = %v, want %v", store.pulled, u)
	}
}
