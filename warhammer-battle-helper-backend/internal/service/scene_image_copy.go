package service

import (
	"fmt"

	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MaxPastedSceneImages caps one paste, like the duplicate count cap.
const MaxPastedSceneImages = 20

// copySceneImageInto adds a copy of src to target at (x, y) and broadcasts it. Shared by
// duplicate (same scene, cascaded) and paste (any scene of the game, at the cursor). The copy
// keeps the source's appearance, layer, Hidden flag, label and token overlay, and starts unlocked
// and alive.
func (s *GameService) copySceneImageInto(game *models.Game, target *models.Scene, src models.SceneImage, x, y float64) (*models.SceneImage, error) {
	gameID := game.ID.Hex()

	// Workspace is the grid plus the off-scene margin on every side (matches
	// SceneImageWithinWorkspace) — NOT just the grid. Clamping to the grid alone would drag a copy
	// of an image staged in the margin onto the grid, which is a reveal: PlayerCanSeeSceneImage
	// below would then broadcast the copy to every player in full.
	margin := OffSceneMarginCells * CellSizePx
	minX, minY := -margin, -margin
	maxX := max(minX, float64(target.GridWidth)*CellSizePx+margin-src.Width)
	maxY := max(minY, float64(target.GridHeight)*CellSizePx+margin-src.Height)

	dup := src
	dup.ID = primitive.NilObjectID // AddSceneImage assigns a fresh id + timestamps
	dup.X = min(max(x, minX), maxX)
	dup.Y = min(max(y, minY), maxY)
	dup.Locked = false
	dup.Killed = false
	dup.TokenOverlay = cloneImageTokenOverlay(src.TokenOverlay)

	created, err := s.gameRepo.AddSceneImage(gameID, target.ID, dup)
	if err != nil {
		return nil, err
	}

	gmID := game.GameMasterID.Hex()
	s.hub.BroadcastToUsers(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
		"sceneId": target.ID.Hex(),
		"image":   created,
	}, []string{gmID})

	// The clamp above confines every copy to the workspace (grid + margin), not the grid, so a
	// copy of a staged image stays staged. This gate is what actually keeps it from players —
	// it also still blocks a copy of a Hidden original from reaching them.
	if PlayerCanSeeSceneImage(*created, target.GridWidth, target.GridHeight) {
		maskedImg := *created
		maskedImg.TokenOverlay = MaskImageTokenForPlayer(created.TokenOverlay)
		s.hub.BroadcastToGameExcept(gameID, websocket.EventSceneImageAdded, map[string]interface{}{
			"sceneId": target.ID.Hex(),
			"image":   maskedImg,
		}, gmID)
	}
	return created, nil
}

// PasteSceneImages copies images from one scene of the game into targetSceneID (GM only) — the
// GM's Ctrl+V. Every item is validated before the first write, so a bad request copies nothing.
func (s *GameService) PasteSceneImages(gameID string, targetSceneID, userID primitive.ObjectID, req models.PasteSceneImagesRequest) ([]models.SceneImage, error) {
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("nothing to paste")
	}
	if len(req.Items) > MaxPastedSceneImages {
		return nil, fmt.Errorf("at most %d images can be pasted at once", MaxPastedSceneImages)
	}

	game, err := s.requireGM(gameID, userID, "paste scene images")
	if err != nil {
		return nil, err
	}

	sceneByID := func(id primitive.ObjectID) *models.Scene {
		for i := range game.Scenes {
			if game.Scenes[i].ID == id {
				return &game.Scenes[i]
			}
		}
		return nil
	}
	target := sceneByID(targetSceneID)
	sourceID, err := primitive.ObjectIDFromHex(req.SourceSceneID)
	if err != nil {
		return nil, fmt.Errorf("invalid source scene ID")
	}
	source := sceneByID(sourceID)
	if target == nil || source == nil {
		return nil, fmt.Errorf("scene not found")
	}

	sources := make([]models.SceneImage, len(req.Items))
	for i, item := range req.Items {
		found := false
		for _, img := range source.Images {
			if img.ID.Hex() == item.ImageID {
				sources[i], found = img, true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("image not found")
		}
	}

	created := make([]models.SceneImage, 0, len(req.Items))
	for i, item := range req.Items {
		img, err := s.copySceneImageInto(game, target, sources[i], item.X, item.Y)
		if err != nil {
			return created, err
		}
		created = append(created, *img)
	}
	return created, nil
}
