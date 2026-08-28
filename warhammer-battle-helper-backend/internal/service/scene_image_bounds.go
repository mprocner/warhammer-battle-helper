package service

import (
	"math"

	"battle-helper/internal/models"
)

// CellSizePx mirrors CELL_SIZE in the frontend's constants/scene.js. Scene images are stored in
// pixels, the grid in cells, so every bounds check goes through this factor.
const CellSizePx = 50.0

// SceneImageTouchesGrid reports whether any part of img can appear inside the scene grid.
//
// Rotation is handled via the axis-aligned bounding box of the rotated rect (CSS rotates around
// the element's center, so we do too). The AABB always contains the rotated shape, so an image
// whose corner is visible to the GM is never withheld from players. The reverse error — sending
// an image the player's clip renders down to zero pixels — is accepted: it costs a URL in the
// payload, not a visible spoiler. See docs/superpowers/specs/FEATURE-166.md.
//
// Edge contact does not count: an image whose right edge lands exactly on x=0 shows nothing.
//
// Assumes imgRect.Width and imgRect.Height are non-negative; a negative dimension inverts the
// half-extent comparison and yields a wrong answer instead of a clean false.
func SceneImageTouchesGrid(imgRect models.SceneImage, gridWidth, gridHeight int) bool {
	halfW := imgRect.Width / 2
	halfH := imgRect.Height / 2
	cx := imgRect.X + halfW
	cy := imgRect.Y + halfH

	// Half-extents of the AABB of a rect rotated by theta around its own center.
	rad := imgRect.Rotation * math.Pi / 180
	cos := math.Abs(math.Cos(rad))
	sin := math.Abs(math.Sin(rad))
	extentX := halfW*cos + halfH*sin
	extentY := halfW*sin + halfH*cos

	gridRight := float64(gridWidth) * CellSizePx
	gridBottom := float64(gridHeight) * CellSizePx

	return cx-extentX < gridRight &&
		cx+extentX > 0 &&
		cy-extentY < gridBottom &&
		cy+extentY > 0
}

// PlayerCanSeeSceneImage is the single answer to "should a player hold this image at all".
// Both rules are additive: a hidden image stays hidden wherever it sits, and an image parked in
// the GM's off-scene margin never reaches a player even when it is not flagged hidden.
func PlayerCanSeeSceneImage(imgRect models.SceneImage, gridWidth, gridHeight int) bool {
	return !imgRect.Hidden && SceneImageTouchesGrid(imgRect, gridWidth, gridHeight)
}

// SceneImageBroadcast names what players must receive when a scene image changes, as decided by
// DecideSceneImageBroadcast.
type SceneImageBroadcast int

const (
	// SceneImageGMOnly means players hold nothing before or after; only the GM gets the update.
	SceneImageGMOnly SceneImageBroadcast = iota
	// SceneImageAddForPlayers means players did not hold the image and now must.
	SceneImageAddForPlayers
	// SceneImageDeleteForPlayers means players held the image and now must not.
	SceneImageDeleteForPlayers
	// SceneImageUpdateForPlayers means players held the image before and still do.
	SceneImageUpdateForPlayers
)

// DecideSceneImageBroadcast is the pure routing decision behind UpdateSceneImage: given what an
// image looked like before and after an edit, which of the four rows applies. It answers
// PlayerCanSeeSceneImage for both states and diffs them — Hidden and the scene boundary are
// folded into that single predicate, so a hide/unhide and a drag in/out of the grid are handled
// identically here.
func DecideSceneImageBroadcast(before, after models.SceneImage, gridWidth, gridHeight int) SceneImageBroadcast {
	visibleBefore := PlayerCanSeeSceneImage(before, gridWidth, gridHeight)
	visibleAfter := PlayerCanSeeSceneImage(after, gridWidth, gridHeight)

	switch {
	case !visibleBefore && !visibleAfter:
		return SceneImageGMOnly
	case !visibleBefore && visibleAfter:
		return SceneImageAddForPlayers
	case visibleBefore && !visibleAfter:
		return SceneImageDeleteForPlayers
	default:
		return SceneImageUpdateForPlayers
	}
}

// classifyBatchImageMove is the pure part of one iteration of a batch group-drag: given the
// pre-move snapshot keyed by id and one moved position from the request, it projects the post-move
// image and answers the same before/after question as DecideSceneImageBroadcast. ok is false when
// moved.ID is absent from before — the image belongs to a different scene, or was deleted mid-drag
// — and the caller must skip it entirely rather than trust the zero-value image or decision.
func classifyBatchImageMove(before map[string]models.SceneImage, moved models.BatchImagePos, gridWidth, gridHeight int) (models.SceneImage, SceneImageBroadcast, bool) {
	prev, found := before[moved.ID]
	if !found {
		return models.SceneImage{}, SceneImageGMOnly, false
	}

	after := prev
	after.X = moved.X
	after.Y = moved.Y

	return after, DecideSceneImageBroadcast(prev, after, gridWidth, gridHeight), true
}

// applySceneImageUpdate projects a partial update onto a copy of the image, so callers can ask
// what the image WILL look like before the write lands. Only the fields that move an image across
// the visibility boundary are projected — position, size, rotation and Hidden; the rest never
// change whether a player should hold the image.
func applySceneImageUpdate(imgRect models.SceneImage, req models.UpdateSceneImageRequest) models.SceneImage {
	out := imgRect
	if req.X != nil {
		out.X = *req.X
	}
	if req.Y != nil {
		out.Y = *req.Y
	}
	if req.Width != nil {
		out.Width = *req.Width
	}
	if req.Height != nil {
		out.Height = *req.Height
	}
	if req.Rotation != nil {
		out.Rotation = *req.Rotation
	}
	if req.Hidden != nil {
		out.Hidden = *req.Hidden
	}
	return out
}

// OffSceneMarginCells mirrors OFFSCENE_MARGIN_CELLS in the frontend's constants/scene.js. It sizes
// the staging area the GM can park images in, on every side of the grid.
const OffSceneMarginCells = 100

// SceneImageWithinWorkspace reports whether an image's raw rect fits the GM workspace — the grid
// plus the off-scene margin. Rotation is deliberately ignored: this is a guard against a broken
// client sending absurd coordinates, not a pixel-exact fence, and the frontend clamps the same raw
// rect it stores.
func SceneImageWithinWorkspace(imgRect models.SceneImage, gridWidth, gridHeight int) bool {
	margin := OffSceneMarginCells * CellSizePx
	maxX := float64(gridWidth)*CellSizePx + margin
	maxY := float64(gridHeight)*CellSizePx + margin

	return imgRect.X >= -margin &&
		imgRect.Y >= -margin &&
		imgRect.X+imgRect.Width <= maxX &&
		imgRect.Y+imgRect.Height <= maxY
}
