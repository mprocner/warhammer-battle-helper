package service

import (
	"battle-helper/internal/repository"
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type OnlineSessionService struct {
	repo *repository.OnlineSessionRepository
}

func NewOnlineSessionService(repo *repository.OnlineSessionRepository) *OnlineSessionService {
	return &OnlineSessionService{repo: repo}
}

func (s *OnlineSessionService) Open(gameID string, userID primitive.ObjectID) {
	gid, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		fmt.Printf("OnlineSession.Open: invalid gameID %s: %v\n", gameID, err)
		return
	}
	if err := s.repo.Open(gid, userID, time.Now()); err != nil {
		fmt.Printf("OnlineSession.Open error: %v\n", err)
	}
}

func (s *OnlineSessionService) Close(gameID string, userID primitive.ObjectID) {
	gid, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		fmt.Printf("OnlineSession.Close: invalid gameID %s: %v\n", gameID, err)
		return
	}
	if err := s.repo.Close(gid, userID, time.Now()); err != nil {
		fmt.Printf("OnlineSession.Close error: %v\n", err)
	}
}

func (s *OnlineSessionService) CloseAll() {
	if err := s.repo.CloseAll(); err != nil {
		fmt.Printf("OnlineSession.CloseAll error: %v\n", err)
	}
}

func (s *OnlineSessionService) GetStats(ctx context.Context, gameID, userID primitive.ObjectID) (*repository.OnlineStatsSummary, error) {
	return s.repo.GetForGame(ctx, gameID, userID)
}

func (s *OnlineSessionService) GetUserStats(ctx context.Context, userID primitive.ObjectID) (*repository.OnlineStatsSummary, error) {
	return s.repo.GetForUser(ctx, userID)
}
