package service

import (
	"testing"

	"battle-helper/internal/models"
)

// Grid used across these tests: 10x10 cells = 500x500 px.
const testGridW, testGridH = 10, 10

func mkImg(x, y, w, h, rot float64) models.SceneImage {
	return models.SceneImage{X: x, Y: y, Width: w, Height: h, Rotation: rot}
}

func TestSceneImageTouchesGrid(t *testing.T) {
	cases := []struct {
		name string
		in   models.SceneImage
		want bool
	}{
		{"fully inside", mkImg(100, 100, 50, 50, 0), true},
		{"fully left of grid", mkImg(-200, 100, 50, 50, 0), false},
		{"fully right of grid", mkImg(600, 100, 50, 50, 0), false},
		{"fully above grid", mkImg(100, -200, 50, 50, 0), false},
		{"fully below grid", mkImg(100, 600, 50, 50, 0), false},
		{"straddles left edge", mkImg(-25, 100, 50, 50, 0), true},
		{"straddles bottom edge", mkImg(100, 475, 50, 50, 0), true},
		// Edge-touch is NOT an intersection: right edge lands exactly on x=0.
		{"touches left edge only", mkImg(-50, 100, 50, 50, 0), false},
		// Same convention on the far side: left edge lands exactly on x=500.
		{"touches right edge only", mkImg(500, 100, 50, 50, 0), false},
		// Same convention on the vertical axis: bottom edge lands exactly on y=0.
		{"touches top edge only", mkImg(100, -50, 50, 50, 0), false},
		// And the far side: top edge lands exactly on y=500.
		{"touches bottom edge only", mkImg(100, 500, 50, 50, 0), false},
		// A 200x200 square rotated 45 degrees has an AABB of ~283px, so it reaches
		// ~41px further left than the raw rect. Raw rect misses the grid; AABB does not.
		{"rotated corner reaches in", mkImg(-220, 150, 200, 200, 45), true},
		// Same square, far enough out that even the AABB misses.
		{"rotated but still fully out", mkImg(-320, 150, 200, 200, 45), false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := SceneImageTouchesGrid(c.in, testGridW, testGridH); got != c.want {
				t.Fatalf("SceneImageTouchesGrid(%+v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestPlayerCanSeeSceneImage_HiddenAlwaysWins(t *testing.T) {
	inside := mkImg(100, 100, 50, 50, 0)
	if !PlayerCanSeeSceneImage(inside, testGridW, testGridH) {
		t.Fatal("a visible image inside the grid must be player-visible")
	}

	hidden := inside
	hidden.Hidden = true
	if PlayerCanSeeSceneImage(hidden, testGridW, testGridH) {
		t.Fatal("Hidden must win over position: an image inside the grid but hidden stays invisible")
	}

	outside := mkImg(-200, 100, 50, 50, 0)
	if PlayerCanSeeSceneImage(outside, testGridW, testGridH) {
		t.Fatal("an image fully outside the grid must not be player-visible")
	}
}

func TestDecideSceneImageBroadcast(t *testing.T) {
	inside := mkImg(100, 100, 50, 50, 0)
	outside := mkImg(-200, 100, 50, 50, 0)

	insideHidden := inside
	insideHidden.Hidden = true

	outsideHidden := outside
	outsideHidden.Hidden = true

	insideMoved := mkImg(150, 150, 50, 50, 0)

	cases := []struct {
		name   string
		before models.SceneImage
		after  models.SceneImage
		want   SceneImageBroadcast
	}{
		{"visible to visible: image moves within the grid", inside, insideMoved, SceneImageUpdateForPlayers},
		{"invisible to visible: image slides in from the off-scene margin", outside, inside, SceneImageAddForPlayers},
		{"visible to invisible: image dragged off the grid", inside, outside, SceneImageDeleteForPlayers},
		{"invisible to invisible: image moves within the margin", outside, mkImg(-250, 100, 50, 50, 0), SceneImageGMOnly},
		// Original bug this feature fixes: unhiding an off-scene image must NOT look like an add.
		{"hidden to unhidden while outside the grid stays GM-only", outsideHidden, outside, SceneImageGMOnly},
		// The mirror case: hiding an on-scene image must delete it from players, same as moving it out.
		{"unhidden to hidden while inside the grid is a delete", inside, insideHidden, SceneImageDeleteForPlayers},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := DecideSceneImageBroadcast(c.before, c.after, testGridW, testGridH)
			if got != c.want {
				t.Fatalf("DecideSceneImageBroadcast(before=%+v, after=%+v) = %v, want %v", c.before, c.after, got, c.want)
			}
		})
	}
}

func TestClassifyBatchImageMove(t *testing.T) {
	inside := mkImg(100, 100, 50, 50, 0)
	outside := mkImg(-200, 100, 50, 50, 0)

	t.Run("unknown id is skipped", func(t *testing.T) {
		before := map[string]models.SceneImage{}
		_, _, ok := classifyBatchImageMove(before, models.BatchImagePos{ID: "missing", X: 1, Y: 1}, testGridW, testGridH)
		if ok {
			t.Fatal("an id absent from before must report ok=false so the caller skips it")
		}
	})

	t.Run("visible to visible", func(t *testing.T) {
		before := map[string]models.SceneImage{"img1": inside}
		after, decision, ok := classifyBatchImageMove(before, models.BatchImagePos{ID: "img1", X: 150, Y: 150}, testGridW, testGridH)
		if !ok {
			t.Fatal("known id must report ok=true")
		}
		if decision != SceneImageUpdateForPlayers {
			t.Fatalf("decision = %v, want SceneImageUpdateForPlayers", decision)
		}
		if after.X != 150 || after.Y != 150 {
			t.Fatalf("projected image must carry the moved x/y, got (%v, %v)", after.X, after.Y)
		}
	})

	t.Run("invisible to visible", func(t *testing.T) {
		before := map[string]models.SceneImage{"img1": outside}
		after, decision, ok := classifyBatchImageMove(before, models.BatchImagePos{ID: "img1", X: 100, Y: 100}, testGridW, testGridH)
		if !ok {
			t.Fatal("known id must report ok=true")
		}
		if decision != SceneImageAddForPlayers {
			t.Fatalf("decision = %v, want SceneImageAddForPlayers", decision)
		}
		if after.X != 100 || after.Y != 100 {
			t.Fatalf("projected image must carry the moved x/y, got (%v, %v)", after.X, after.Y)
		}
	})

	t.Run("visible to invisible", func(t *testing.T) {
		before := map[string]models.SceneImage{"img1": inside}
		after, decision, ok := classifyBatchImageMove(before, models.BatchImagePos{ID: "img1", X: -200, Y: 100}, testGridW, testGridH)
		if !ok {
			t.Fatal("known id must report ok=true")
		}
		if decision != SceneImageDeleteForPlayers {
			t.Fatalf("decision = %v, want SceneImageDeleteForPlayers", decision)
		}
		if after.X != -200 || after.Y != 100 {
			t.Fatalf("projected image must carry the moved x/y, got (%v, %v)", after.X, after.Y)
		}
	})

	t.Run("invisible to invisible", func(t *testing.T) {
		before := map[string]models.SceneImage{"img1": outside}
		after, decision, ok := classifyBatchImageMove(before, models.BatchImagePos{ID: "img1", X: -250, Y: 100}, testGridW, testGridH)
		if !ok {
			t.Fatal("known id must report ok=true")
		}
		if decision != SceneImageGMOnly {
			t.Fatalf("decision = %v, want SceneImageGMOnly", decision)
		}
		if after.X != -250 || after.Y != 100 {
			t.Fatalf("projected image must carry the moved x/y, got (%v, %v)", after.X, after.Y)
		}
	})

	t.Run("hidden image stays GM-only wherever it lands", func(t *testing.T) {
		hidden := inside
		hidden.Hidden = true
		before := map[string]models.SceneImage{"img1": hidden}

		// Moved to another on-grid spot, still hidden.
		_, decision, ok := classifyBatchImageMove(before, models.BatchImagePos{ID: "img1", X: 200, Y: 200}, testGridW, testGridH)
		if !ok {
			t.Fatal("known id must report ok=true")
		}
		if decision != SceneImageGMOnly {
			t.Fatalf("hidden image moved within the grid: decision = %v, want SceneImageGMOnly", decision)
		}

		// Moved off-grid too, still hidden.
		_, decision2, ok2 := classifyBatchImageMove(before, models.BatchImagePos{ID: "img1", X: -200, Y: 100}, testGridW, testGridH)
		if !ok2 {
			t.Fatal("known id must report ok=true")
		}
		if decision2 != SceneImageGMOnly {
			t.Fatalf("hidden image moved off-grid: decision = %v, want SceneImageGMOnly", decision2)
		}
	})
}

func TestApplySceneImageUpdate(t *testing.T) {
	base := models.SceneImage{X: 10, Y: 20, Width: 50, Height: 60, Rotation: 15, Hidden: false}

	newX := 999.0
	hidden := true
	got := applySceneImageUpdate(base, models.UpdateSceneImageRequest{X: &newX, Hidden: &hidden})

	if got.X != 999 {
		t.Errorf("X must follow the request, got %v", got.X)
	}
	if !got.Hidden {
		t.Error("Hidden must follow the request")
	}
	if got.Y != 20 || got.Width != 50 || got.Height != 60 || got.Rotation != 15 {
		t.Errorf("fields absent from the request must be preserved, got %+v", got)
	}
	if base.X != 10 || base.Hidden {
		t.Error("the source image must not be mutated")
	}
}

func TestSceneImageWithinWorkspace(t *testing.T) {
	// Grid 10x10 = 500x500 px, margin 100 cells = 5000 px → workspace is [-5000, 5500] on both axes.
	cases := []struct {
		name string
		in   models.SceneImage
		want bool
	}{
		{"inside the grid", mkImg(100, 100, 50, 50, 0), true},
		{"deep in the left margin", mkImg(-4000, 100, 50, 50, 0), true},
		{"flush against the left limit", mkImg(-5000, 100, 50, 50, 0), true},
		{"past the left limit", mkImg(-5001, 100, 50, 50, 0), false},
		{"flush against the right limit", mkImg(5450, 100, 50, 50, 0), true},
		{"past the right limit", mkImg(5451, 100, 50, 50, 0), false},
		{"past the top limit", mkImg(100, -5001, 50, 50, 0), false},
		{"past the bottom limit", mkImg(100, 5451, 50, 50, 0), false},
		{"flush against the top limit", mkImg(100, -5000, 50, 50, 0), true},
		{"flush against the bottom limit", mkImg(100, 5450, 50, 50, 0), true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := SceneImageWithinWorkspace(c.in, testGridW, testGridH); got != c.want {
				t.Fatalf("SceneImageWithinWorkspace(%+v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}
