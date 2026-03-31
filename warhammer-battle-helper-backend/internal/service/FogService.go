package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type FogService struct {
	fogRepo *repository.FogRepository
	hub     *websocket.Hub
}

func NewFogService(fogRepo *repository.FogRepository, hub *websocket.Hub) *FogService {
	return &FogService{
		fogRepo: fogRepo,
		hub:     hub,
	}
}

func (s *FogService) isGM(gameID string, userID primitive.ObjectID) error {
	game, err := s.fogRepo.GetGame(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can manage fog of war")
	}
	return nil
}

// ToggleFog enables or disables fog of war for a scene
func (s *FogService) ToggleFog(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.ToggleFogRequest) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}

	opacity := req.FogOpacity
	if opacity <= 0 {
		opacity = 0.85
	}

	if err := s.fogRepo.ToggleFog(gameID, sceneID, req.Enabled, opacity); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventFogToggled, map[string]interface{}{
		"sceneId":    sceneID.Hex(),
		"fogEnabled": req.Enabled,
		"fogOpacity": opacity,
	})
	return nil
}

// AddFogPath appends a brush stroke reveal path and broadcasts it
func (s *FogService) AddFogPath(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.AddFogPathRequest) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}

	brushSize := req.BrushSize
	if brushSize <= 0 {
		brushSize = 30
	}

	path := models.FogPath{
		Points:    req.Points,
		BrushSize: brushSize,
		Shape:     req.Shape,
		Cover:     req.Cover,
	}

	if err := s.fogRepo.AddFogPath(gameID, sceneID, path); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventFogPathAdded, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"path":    path,
	})
	return nil
}

// ClearFogPaths removes all reveal paths from a scene
func (s *FogService) ClearFogPaths(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}

	if err := s.fogRepo.ClearFogPaths(gameID, sceneID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventFogCleared, map[string]interface{}{
		"sceneId": sceneID.Hex(),
	})
	return nil
}

// RevealAllFog replaces all paths with a single full-canvas reveal rect
func (s *FogService) RevealAllFog(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}

	if err := s.fogRepo.RevealAllFog(gameID, sceneID); err != nil {
		return err
	}

	fullReveal := models.FogPath{
		Points:    [][2]float64{{-100, -100}, {99999, 99999}},
		BrushSize: 1,
		Shape:     "rect",
		Cover:     false,
	}
	s.hub.BroadcastToGame(gameID, websocket.EventFogRevealedAll, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"path":    fullReveal,
	})
	return nil
}

// UndoLastFogPath removes the last reveal path from a scene
func (s *FogService) UndoLastFogPath(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}

	if err := s.fogRepo.RemoveLastFogPath(gameID, sceneID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventFogPathRemoved, map[string]interface{}{
		"sceneId": sceneID.Hex(),
	})
	return nil
}
