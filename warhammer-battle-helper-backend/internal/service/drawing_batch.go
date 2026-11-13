package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/websocket"
	"fmt"
	"math"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Batch operations on drawing paths (PLAYRPG-254): delete, move and paste several paths at once.
// Each batch is all or nothing on permissions — the client only lets a user select paths they may
// delete, so a foreign id in the list is a stale client or a forged request, not a normal case.

// MaxDrawingPathBatch caps the ids of one delete or move request.
const MaxDrawingPathBatch = 200

// MaxPastedDrawingPaths caps one paste request; the client splits a bigger clipboard.
const MaxPastedDrawingPaths = 50

// MaxDrawingMoveDelta bounds a move on each axis, far beyond any scene but short of overflow.
const MaxDrawingMoveDelta = 100000

// translatePoints returns a shifted copy of points. It never touches the input: the input is the
// path as read from the database, and it must stay that way if the write fails.
func translatePoints(points [][2]float64, dx, dy float64) [][2]float64 {
	out := make([][2]float64, len(points))
	for i, p := range points {
		out[i] = [2]float64{p[0] + dx, p[1] + dy}
	}
	return out
}

// buildDrawingPath turns a create request into a stored path owned by userID: defaults for the
// stroke, and text validated by normalizeTextPath. Shared by a single add and a paste.
func buildDrawingPath(req models.AddDrawingPathRequest, userID primitive.ObjectID) (models.DrawingPath, error) {
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
		ID:            primitive.NewObjectID(),
		UserID:        userID,
		Tool:          req.Tool,
		Points:        req.Points,
		BrushSize:     brushSize,
		Color:         color,
		Text:          req.Text,
		FontSize:      fontSize,
		FontFamily:    req.FontFamily,
		Bold:          req.Bold,
		Italic:        req.Italic,
		Rotation:      req.Rotation,
		TextBackdrop:  req.TextBackdrop,
		BackdropColor: req.BackdropColor,
	}
	if path.Tool == "text" {
		if err := normalizeTextPath(&path); err != nil {
			return models.DrawingPath{}, err
		}
	}
	return path, nil
}

// parsePathIDs validates the id list of a batch request: 1..MaxDrawingPathBatch hex ids, no repeats.
func parsePathIDs(raw []string) ([]primitive.ObjectID, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("no drawing paths given")
	}
	if len(raw) > MaxDrawingPathBatch {
		return nil, fmt.Errorf("at most %d drawing paths per request", MaxDrawingPathBatch)
	}
	seen := make(map[primitive.ObjectID]bool, len(raw))
	ids := make([]primitive.ObjectID, 0, len(raw))
	for _, s := range raw {
		id, err := primitive.ObjectIDFromHex(s)
		if err != nil {
			return nil, fmt.Errorf("invalid path ID %q", s)
		}
		if seen[id] {
			return nil, fmt.Errorf("duplicate path ID %q", s)
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, nil
}

// selectOwnedPaths returns the scene's paths named by ids, in scene order. Ids the scene no longer
// holds are skipped (someone deleted them meanwhile — the goal is already met); a path the user
// may not change (not theirs, and they are not the GM) fails the whole batch.
func selectOwnedPaths(game *models.Game, sceneID primitive.ObjectID, ids []primitive.ObjectID, userID primitive.ObjectID) ([]models.DrawingPath, error) {
	if !CanAccessGame(game, userID) {
		return nil, fmt.Errorf("user is not a participant of this game")
	}
	var scene *models.Scene
	for i := range game.Scenes {
		if game.Scenes[i].ID == sceneID {
			scene = &game.Scenes[i]
			break
		}
	}
	if scene == nil {
		return nil, fmt.Errorf("scene not found")
	}

	wanted := make(map[primitive.ObjectID]bool, len(ids))
	for _, id := range ids {
		wanted[id] = true
	}
	var out []models.DrawingPath
	for _, p := range scene.DrawingPaths {
		if !wanted[p.ID] {
			continue
		}
		if game.GameMasterID != userID && p.UserID != userID {
			return nil, fmt.Errorf("permission denied: only the path owner or GM can change it")
		}
		out = append(out, p)
	}
	return out, nil
}

// PasteDrawingPaths creates copies of drawings (the client already placed them) owned by the
// paster, and returns them so the client can select the copies.
func (s *DrawingService) PasteDrawingPaths(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, reqs []models.AddDrawingPathRequest) ([]models.DrawingPath, error) {
	if len(reqs) == 0 {
		return nil, fmt.Errorf("no drawing paths given")
	}
	if len(reqs) > MaxPastedDrawingPaths {
		return nil, fmt.Errorf("at most %d drawing paths per paste", MaxPastedDrawingPaths)
	}
	if err := s.isParticipant(gameID, userID); err != nil {
		return nil, err
	}

	paths := make([]models.DrawingPath, 0, len(reqs))
	for _, req := range reqs {
		path, err := buildDrawingPath(req, userID)
		if err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}

	if err := s.drawingRepo.AddDrawingPaths(gameID, sceneID, paths); err != nil {
		return nil, err
	}
	s.hub.BroadcastToGame(gameID, websocket.EventDrawingPathsAdded, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"paths":   paths,
	})
	return paths, nil
}

// DeleteDrawingPaths removes the listed paths (owner or GM, all or nothing).
func (s *DrawingService) DeleteDrawingPaths(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, rawIDs []string) error {
	ids, err := parsePathIDs(rawIDs)
	if err != nil {
		return err
	}
	game, err := s.drawingRepo.GetGame(gameID)
	if err != nil {
		return err
	}
	paths, err := selectOwnedPaths(game, sceneID, ids, userID)
	if err != nil {
		return err
	}
	if len(paths) == 0 {
		return nil
	}

	removed := make([]primitive.ObjectID, len(paths))
	for i, p := range paths {
		removed[i] = p.ID
	}
	if err := s.drawingRepo.RemoveDrawingPaths(gameID, sceneID, removed); err != nil {
		return err
	}
	s.broadcastPathsRemoved(gameID, sceneID, removed)
	return nil
}

// MoveDrawingPaths shifts the listed paths by (dx, dy). The new points are computed here from the
// stored ones and written as values; last write wins, like a label edit.
func (s *DrawingService) MoveDrawingPaths(gameID string, sceneID primitive.ObjectID, userID primitive.ObjectID, req models.MoveDrawingPathsRequest) error {
	if math.Abs(req.DX) > MaxDrawingMoveDelta || math.Abs(req.DY) > MaxDrawingMoveDelta {
		return fmt.Errorf("move too large")
	}
	ids, err := parsePathIDs(req.PathIDs)
	if err != nil {
		return err
	}
	game, err := s.drawingRepo.GetGame(gameID)
	if err != nil {
		return err
	}
	paths, err := selectOwnedPaths(game, sceneID, ids, userID)
	if err != nil {
		return err
	}
	if len(paths) == 0 {
		return nil
	}

	for i := range paths {
		paths[i].Points = translatePoints(paths[i].Points, req.DX, req.DY)
	}
	if err := s.drawingRepo.SetDrawingPathPoints(gameID, sceneID, paths); err != nil {
		return err
	}
	s.hub.BroadcastToGame(gameID, websocket.EventDrawingPathsUpdated, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"paths":   paths,
	})
	return nil
}

func (s *DrawingService) broadcastPathsRemoved(gameID string, sceneID primitive.ObjectID, ids []primitive.ObjectID) {
	hexIDs := make([]string, len(ids))
	for i, id := range ids {
		hexIDs[i] = id.Hex()
	}
	s.hub.BroadcastToGame(gameID, websocket.EventDrawingPathsRemoved, map[string]interface{}{
		"sceneId": sceneID.Hex(),
		"pathIds": hexIDs,
	})
}
