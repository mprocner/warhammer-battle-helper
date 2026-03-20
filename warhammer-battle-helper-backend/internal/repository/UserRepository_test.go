package repository

import (
	"battle-helper/internal/models"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestUserRepository_SetResetToken(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("successfully sets reset token", func(mt *mtest.T) {
		repo := &UserRepository{Collection: mt.Coll}
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		id := primitive.NewObjectID()
		expiry := time.Now().Add(1 * time.Hour)
		err := repo.SetResetToken(id, "sometoken", expiry)
		if err != nil {
			t.Errorf("SetResetToken() returned unexpected error: %v", err)
		}
	})
}

func TestUserRepository_FindByResetToken(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("finds user by reset token", func(mt *mtest.T) {
		repo := &UserRepository{Collection: mt.Coll}

		expectedID := primitive.NewObjectID()
		expiry := time.Now().Add(1 * time.Hour)

		mt.AddMockResponses(mtest.CreateCursorResponse(1, "db.users", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: expectedID},
			{Key: "email", Value: "user@example.com"},
			{Key: "resetToken", Value: "abc123"},
			{Key: "resetTokenExpiry", Value: expiry},
			{Key: "active", Value: true},
		}))

		user, err := repo.FindByResetToken("abc123")
		if err != nil {
			t.Fatalf("FindByResetToken() returned unexpected error: %v", err)
		}
		if user.ID != expectedID {
			t.Errorf("user ID = %v, want %v", user.ID, expectedID)
		}
		if user.Email != "user@example.com" {
			t.Errorf("user email = %s, want user@example.com", user.Email)
		}
	})

	mt.Run("returns error when token not found", func(mt *mtest.T) {
		repo := &UserRepository{Collection: mt.Coll}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "db.users", mtest.FirstBatch))

		user, err := repo.FindByResetToken("nonexistent")
		if err == nil {
			t.Error("expected error for nonexistent token, got nil")
		}
		if user != nil {
			t.Errorf("expected nil user, got %v", user)
		}
	})
}

func TestUserRepository_UpdatePasswordAndClearToken(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("updates password and clears reset token", func(mt *mtest.T) {
		repo := &UserRepository{Collection: mt.Coll}
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		id := primitive.NewObjectID()
		err := repo.UpdatePasswordAndClearToken(id, "$2a$10$hashedpassword")
		if err != nil {
			t.Errorf("UpdatePasswordAndClearToken() returned unexpected error: %v", err)
		}
	})
}

func TestUserRepository_FindByEmail(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("finds user by email", func(mt *mtest.T) {
		repo := &UserRepository{Collection: mt.Coll}

		expectedID := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(1, "db.users", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: expectedID},
			{Key: "email", Value: "user@example.com"},
			{Key: "active", Value: true},
		}))

		user, err := repo.FindByEmail("user@example.com")
		if err != nil {
			t.Fatalf("FindByEmail() returned unexpected error: %v", err)
		}
		if user.Email != "user@example.com" {
			t.Errorf("user email = %s, want user@example.com", user.Email)
		}
	})
}

func TestUserRepository_ActivateUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("activates user", func(mt *mtest.T) {
		repo := &UserRepository{Collection: mt.Coll}
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		id := primitive.NewObjectID()
		err := repo.ActivateUser(id)
		if err != nil {
			t.Errorf("ActivateUser() returned unexpected error: %v", err)
		}
	})
}

// Ensure models.User is used in tests to avoid import cycle issues.
var _ = models.User{}
