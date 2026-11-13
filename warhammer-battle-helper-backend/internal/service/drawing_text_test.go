package service

import (
	"strings"
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func textPath(text string) models.DrawingPath {
	return models.DrawingPath{Tool: "text", Text: text, Points: [][2]float64{{10, 20}}, FontSize: 16}
}

func TestNormalizeTextPath(t *testing.T) {
	t.Run("fills defaults and trims", func(t *testing.T) {
		p := textPath("  Rzeka  ")
		if err := normalizeTextPath(&p); err != nil {
			t.Fatal(err)
		}
		if p.Text != "Rzeka" || p.FontFamily != "sans" || p.TextBackdrop != "none" {
			t.Fatalf("got %+v", p)
		}
	})

	t.Run("clamps the font size", func(t *testing.T) {
		p := textPath("a")
		p.FontSize = 999
		_ = normalizeTextPath(&p)
		if p.FontSize != maxDrawingFontSize {
			t.Fatalf("font size %v", p.FontSize)
		}
		p.FontSize = 1
		_ = normalizeTextPath(&p)
		if p.FontSize != minDrawingFontSize {
			t.Fatalf("font size %v", p.FontSize)
		}
	})

	t.Run("folds rotation into (-180, 180]", func(t *testing.T) {
		for in, want := range map[float64]float64{0: 0, 180: 180, -180: 180, 270: -90, -450: -90, 725: 5} {
			p := textPath("a")
			p.Rotation = in
			_ = normalizeTextPath(&p)
			if p.Rotation != want {
				t.Errorf("rotation %v → %v, want %v", in, p.Rotation, want)
			}
		}
	})

	rejects := map[string]func(*models.DrawingPath){
		"empty text":       func(p *models.DrawingPath) { p.Text = "  \n " },
		"too many chars":   func(p *models.DrawingPath) { p.Text = strings.Repeat("ż", maxDrawingTextChars+1) },
		"too many lines":   func(p *models.DrawingPath) { p.Text = strings.Repeat("a\n", maxDrawingTextLines) + "a" },
		"unknown font":     func(p *models.DrawingPath) { p.FontFamily = "Comic Sans" },
		"unknown backdrop": func(p *models.DrawingPath) { p.TextBackdrop = "glow" },
		"bad backdrop hex": func(p *models.DrawingPath) { p.BackdropColor = "red" },
		"no anchor":        func(p *models.DrawingPath) { p.Points = nil },
	}
	for name, mutate := range rejects {
		t.Run("rejects "+name, func(t *testing.T) {
			p := textPath("ok")
			mutate(&p)
			if err := normalizeTextPath(&p); err == nil {
				t.Fatalf("want error, got %+v", p)
			}
		})
	}

	t.Run("accepts a hex backdrop colour and the automatic empty one", func(t *testing.T) {
		for _, c := range []string{"", "#1a2B3c"} {
			p := textPath("a")
			p.BackdropColor = c
			if err := normalizeTextPath(&p); err != nil {
				t.Fatalf("%q: %v", c, err)
			}
		}
	})

	t.Run("an empty backdrop colour in an update resets to automatic", func(t *testing.T) {
		stored := textPath("a")
		stored.BackdropColor = "#ff0000"
		got := applyDrawingPathUpdate(stored, models.UpdateDrawingPathRequest{BackdropColor: strPtr("")})
		if got.BackdropColor != "" {
			t.Fatalf("backdrop colour %q", got.BackdropColor)
		}
	})

	t.Run("accepts exactly the limits", func(t *testing.T) {
		p := textPath(strings.Repeat("ż", maxDrawingTextChars))
		if err := normalizeTextPath(&p); err != nil {
			t.Fatal(err)
		}
		p = textPath(strings.Repeat("a\n", maxDrawingTextLines-1) + "a")
		if err := normalizeTextPath(&p); err != nil {
			t.Fatal(err)
		}
	})
}

func TestUpdateDrawingPath(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	gameID := primitive.NewObjectID()
	sceneID := primitive.NewObjectID()
	textID := primitive.NewObjectID()
	lineID := primitive.NewObjectID()
	gmID := primitive.NewObjectID()
	ownerID := primitive.NewObjectID()
	otherID := primitive.NewObjectID()

	game := func() bson.D {
		return mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: gameID}, {Key: "gameMasterId", Value: gmID},
			{Key: "participants", Value: bson.A{
				bson.D{{Key: "userId", Value: ownerID}, {Key: "status", Value: "active"}},
				bson.D{{Key: "userId", Value: otherID}, {Key: "status", Value: "active"}},
			}},
			{Key: "scenes", Value: bson.A{bson.D{
				{Key: "_id", Value: sceneID},
				{Key: "drawingPaths", Value: bson.A{
					bson.D{{Key: "_id", Value: textID}, {Key: "userId", Value: ownerID}, {Key: "tool", Value: "text"},
						{Key: "text", Value: "Most"}, {Key: "points", Value: bson.A{bson.A{1.0, 2.0}}}, {Key: "fontSize", Value: 16.0},
						{Key: "color", Value: "#ff0000"}, {Key: "fontFamily", Value: "sans"}, {Key: "textBackdrop", Value: "none"}},
					bson.D{{Key: "_id", Value: lineID}, {Key: "userId", Value: ownerID}, {Key: "tool", Value: "line"},
						{Key: "points", Value: bson.A{bson.A{0.0, 0.0}, bson.A{5.0, 5.0}}}},
				}},
			}}},
		})
	}
	newText := "Stary most"
	serif := "serif"
	rot := 270.0

	storedPath := func(mt *mtest.T) bson.Raw {
		mt.GetStartedEvent() // the game read
		update := mt.GetStartedEvent().Command.Lookup("updates").Array().Index(0).Value().Document()
		return update.Lookup("u", "$set", "scenes.$[scene].drawingPaths.$[path]").Document()
	}

	for _, who := range []struct {
		name string
		id   primitive.ObjectID
	}{{"owner", ownerID}, {"GM", gmID}} {
		mt.Run(who.name+" edits and the merged path is normalized", func(mt *mtest.T) {
			svc := &DrawingService{drawingRepo: repository.NewDrawingRepository(mt.Coll), hub: websocket.NewHub()}
			mt.AddMockResponses(game(), wrote)

			req := models.UpdateDrawingPathRequest{Text: &newText, FontFamily: &serif, Rotation: &rot}
			if err := svc.UpdateDrawingPath(gameID.Hex(), sceneID, textID, who.id, req); err != nil {
				t.Fatalf("UpdateDrawingPath: %v", err)
			}
			doc := storedPath(mt)
			if got := doc.Lookup("text").StringValue(); got != newText {
				t.Errorf("text %q", got)
			}
			if got := doc.Lookup("fontFamily").StringValue(); got != "serif" {
				t.Errorf("font %q", got)
			}
			if got := doc.Lookup("rotation").Double(); got != -90 {
				t.Errorf("rotation %v", got)
			}
			// Untouched fields keep their stored value, and ownership never moves to the editor.
			if got := doc.Lookup("color").StringValue(); got != "#ff0000" {
				t.Errorf("color %q", got)
			}
			if got := doc.Lookup("userId").ObjectID(); got != ownerID {
				t.Errorf("owner %v", got)
			}
		})
	}

	rejected := []struct {
		name   string
		user   primitive.ObjectID
		pathID primitive.ObjectID
		req    models.UpdateDrawingPathRequest
	}{
		{"another player's text", otherID, textID, models.UpdateDrawingPathRequest{Text: &newText}},
		{"a non-text shape", ownerID, lineID, models.UpdateDrawingPathRequest{Text: &newText}},
		{"a missing path", ownerID, primitive.NewObjectID(), models.UpdateDrawingPathRequest{Text: &newText}},
		{"an invalid style", ownerID, textID, models.UpdateDrawingPathRequest{FontFamily: strPtr("Papyrus")}},
	}
	for _, c := range rejected {
		mt.Run("rejects "+c.name+" without writing", func(mt *mtest.T) {
			svc := &DrawingService{drawingRepo: repository.NewDrawingRepository(mt.Coll), hub: websocket.NewHub()}
			mt.AddMockResponses(game())
			if err := svc.UpdateDrawingPath(gameID.Hex(), sceneID, c.pathID, c.user, c.req); err == nil {
				t.Fatal("want error")
			}
			mt.GetStartedEvent() // the game read
			if ev := mt.GetStartedEvent(); ev != nil {
				t.Fatalf("unexpected %s", ev.CommandName)
			}
		})
	}
}
