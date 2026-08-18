package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DrawingService struct {
	drawingRepo *repository.DrawingRepository
	hub         *websocket.Hub
}

func NewDrawingService(drawingRepo *repository.DrawingRepository, hub *websocket.Hub) *DrawingService {
	return &DrawingService{
		drawingRepo: drawingRepo,
		hub:         hub,
	}
}

// isParticipant checks whether a user is the GM or an active participant of the game
func (s *DrawingService) isParticipant(gameID string, userID primitive.ObjectID) error {
	game, err := s.drawingRepo.GetGame(gameID)
	if err != nil {
		return err
	}
	if !CanAccessGame(game, userID) {
		return fmt.Errorf("user is not a participant of this game")
	}
	return nil
}

// isGM checks whether a user is the game master
func (s *DrawingService) isGM(gameID string, userID primitive.ObjectID) error {
	game, err := s.drawingRepo.GetGame(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can perform this action")
	}
	return nil
}

// AddDrawingPath saves a new drawing path and broadcasts it to all clients
func (s *DrawingService) AddDrawingPath(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.AddDrawingPathRequest) error {
	if err := s.isParticipant(gameID, userID); err != nil {
		return err
	}

	brushSize := req.BrushSize
	if brushSize <= 0 {
		brushSize = 3
	}
	fontSize := req.FontSize
	if fontSize <= 0 {
		fontSize = 16
	}
	color := req.Color
	if color == "" {
		color = "#ff0000"
	}

	path := models.DrawingPath{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		Tool:      req.Tool,
		Points:    req.Points,
		BrushSize: brushSize,
		Color:     color,
		Text:      req.Text,
		FontSize:  fontSize,
	}

	if err := s.drawingRepo.AddDrawingPath(gameID, sceneID, path); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventDrawingPathAdded, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"path":    path,
	})
	return nil
}

// UndoLastDrawingPath removes the last drawing path belonging to the user.
// GM removes the globally last path; players remove their own last path.
func (s *DrawingService) UndoLastDrawingPath(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID) error {
	if err := s.isParticipant(gameID, userID); err != nil {
		return err
	}

	game, err := s.drawingRepo.GetGame(gameID)
	if err != nil {
		return err
	}

	// Find the target scene
	var targetScene *models.Scene
	for i := range game.Scenes {
		if game.Scenes[i].ID == sceneID {
			targetScene = &game.Scenes[i]
			break
		}
	}
	if targetScene == nil {
		return fmt.Errorf("scene not found")
	}

	paths := targetScene.DrawingPaths
	if len(paths) == 0 {
		return fmt.Errorf("no drawing paths to undo")
	}

	var pathID primitive.ObjectID

	if game.GameMasterID == userID {
		// GM removes the globally last path
		pathID = paths[len(paths)-1].ID
	} else {
		// Player removes their own last path
		found := false
		for i := len(paths) - 1; i >= 0; i-- {
			if paths[i].UserID == userID {
				pathID = paths[i].ID
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("no drawing paths to undo")
		}
	}

	if err := s.drawingRepo.RemoveDrawingPathByID(gameID, sceneID, pathID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventDrawingPathRemoved, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"pathId":  pathID.Hex(),
	})
	return nil
}

// DeleteDrawingPath removes a specific drawing path by ID.
// Only the path owner or the GM can delete it.
func (s *DrawingService) DeleteDrawingPath(gameID string, sceneID primitive.ObjectID, pathID primitive.ObjectID, userID primitive.ObjectID) error {
	game, err := s.drawingRepo.GetGame(gameID)
	if err != nil {
		return err
	}

	// Find the path to verify ownership
	var foundPath *models.DrawingPath
	for i := range game.Scenes {
		if game.Scenes[i].ID != sceneID {
			continue
		}
		for j := range game.Scenes[i].DrawingPaths {
			if game.Scenes[i].DrawingPaths[j].ID == pathID {
				foundPath = &game.Scenes[i].DrawingPaths[j]
				break
			}
		}
		break
	}
	if foundPath == nil {
		return fmt.Errorf("drawing path not found")
	}

	if game.GameMasterID != userID && foundPath.UserID != userID {
		return fmt.Errorf("permission denied: only the path owner or GM can delete it")
	}

	if err := s.drawingRepo.RemoveDrawingPathByID(gameID, sceneID, pathID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventDrawingPathRemoved, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"pathId":  pathID.Hex(),
	})
	return nil
}

// ClearDrawingPaths removes all drawing paths from a scene (GM only)
func (s *DrawingService) ClearDrawingPaths(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}

	if err := s.drawingRepo.ClearDrawingPaths(gameID, sceneID); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventDrawingCleared, map[string]interface{}{
		"sceneId": sceneID.Hex(),
	})
	return nil
}
