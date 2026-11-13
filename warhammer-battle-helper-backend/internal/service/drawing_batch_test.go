package service

import (
	"testing"

	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestTranslatePoints(t *testing.T) {
	in := [][2]float64{{10, 20}, {30, 40}}
	got := translatePoints(in, 5, -10)
	want := [][2]float64{{15, 10}, {35, 30}}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("point %d = %v, want %v", i, got[i], want[i])
		}
	}
	// The input is the stored path; a failed write must leave it as read.
	if in[0] != [2]float64{10, 20} || in[1] != [2]float64{30, 40} {
		t.Errorf("input mutated: %v", in)
	}
	if out := translatePoints(nil, 1, 1); len(out) != 0 {
		t.Errorf("nil input → %v", out)
	}
}

func TestParsePathIDs(t *testing.T) {
	a, b := primitive.NewObjectID(), primitive.NewObjectID()
	if ids, err := parsePathIDs([]string{a.Hex(), b.Hex()}); err != nil || len(ids) != 2 || ids[0] != a {
		t.Fatalf("valid ids: %v %v", ids, err)
	}
	tooMany := make([]string, MaxDrawingPathBatch+1)
	for i := range tooMany {
		tooMany[i] = primitive.NewObjectID().Hex()
	}
	for name, in := range map[string][]string{
		"empty":     {},
		"too many":  tooMany,
		"bad hex":   {"nope"},
		"duplicate": {a.Hex(), a.Hex()},
	} {
		if _, err := parsePathIDs(in); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
}

// drawingBatchFixture is one scene holding a line and a text label by the owner and a line by the GM.
type drawingBatchFixture struct {
	gameID, sceneID, gmID, ownerID, otherID primitive.ObjectID
	ownLine, ownText, gmLine                primitive.ObjectID
}

func newDrawingBatchFixture() drawingBatchFixture {
	return drawingBatchFixture{
		gameID: primitive.NewObjectID(), sceneID: primitive.NewObjectID(),
		gmID: primitive.NewObjectID(), ownerID: primitive.NewObjectID(), otherID: primitive.NewObjectID(),
		ownLine: primitive.NewObjectID(), ownText: primitive.NewObjectID(), gmLine: primitive.NewObjectID(),
	}
}

func (f drawingBatchFixture) game() bson.D {
	line := func(id, owner primitive.ObjectID) bson.D {
		return bson.D{{Key: "_id", Value: id}, {Key: "userId", Value: owner}, {Key: "tool", Value: "line"},
			{Key: "points", Value: bson.A{bson.A{0.0, 0.0}, bson.A{10.0, 20.0}}}, {Key: "color", Value: "#00ff00"}}
	}
	return mtest.CreateCursorResponse(0, "db.games", mtest.FirstBatch, bson.D{
		{Key: "_id", Value: f.gameID}, {Key: "gameMasterId", Value: f.gmID},
		{Key: "participants", Value: bson.A{
			bson.D{{Key: "userId", Value: f.ownerID}, {Key: "status", Value: "active"}},
			bson.D{{Key: "userId", Value: f.otherID}, {Key: "status", Value: "active"}},
		}},
		{Key: "scenes", Value: bson.A{bson.D{
			{Key: "_id", Value: f.sceneID},
			{Key: "drawingPaths", Value: bson.A{
				line(f.ownLine, f.ownerID),
				bson.D{{Key: "_id", Value: f.ownText}, {Key: "userId", Value: f.ownerID}, {Key: "tool", Value: "text"},
					{Key: "text", Value: "Most"}, {Key: "points", Value: bson.A{bson.A{100.0, 50.0}}}, {Key: "rotation", Value: 45.0}},
				line(f.gmLine, f.gmID),
			}},
		}}},
	})
}

func newDrawingSvc(mt *mtest.T) *DrawingService {
	return &DrawingService{drawingRepo: repository.NewDrawingRepository(mt.Coll), hub: websocket.NewHub()}
}

// noWrite fails when any command follows the game read.
func noWrite(t *testing.T, mt *mtest.T) {
	t.Helper()
	mt.GetStartedEvent() // the game read
	if ev := mt.GetStartedEvent(); ev != nil {
		t.Fatalf("unexpected %s", ev.CommandName)
	}
}

func TestDeleteDrawingPaths(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	f := newDrawingBatchFixture()

	for _, c := range []struct {
		name string
		user primitive.ObjectID
		ids  []primitive.ObjectID
		want int // ids left in the $pull after skipping the missing one
	}{
		{"owner removes own paths and skips a missing id", f.ownerID, []primitive.ObjectID{f.ownLine, f.ownText, primitive.NewObjectID()}, 2},
		{"GM removes anyone's paths", f.gmID, []primitive.ObjectID{f.ownLine, f.gmLine}, 2},
	} {
		mt.Run(c.name, func(mt *mtest.T) {
			svc := newDrawingSvc(mt)
			mt.AddMockResponses(f.game(), wrote)
			if err := svc.DeleteDrawingPaths(f.gameID.Hex(), f.sceneID, c.user, hexes(c.ids)); err != nil {
				t.Fatalf("DeleteDrawingPaths: %v", err)
			}
			mt.GetStartedEvent() // the game read
			update := mt.GetStartedEvent().Command.Lookup("updates").Array().Index(0).Value().Document()
			in := update.Lookup("u", "$pull", "scenes.$.drawingPaths", "_id", "$in").Array()
			if vals, _ := in.Values(); len(vals) != c.want {
				t.Errorf("$pull $in has %d ids, want %d", len(vals), c.want)
			}
		})
	}

	mt.Run("a player with someone else's id deletes nothing", func(mt *mtest.T) {
		svc := newDrawingSvc(mt)
		mt.AddMockResponses(f.game())
		if err := svc.DeleteDrawingPaths(f.gameID.Hex(), f.sceneID, f.ownerID, hexes([]primitive.ObjectID{f.ownLine, f.gmLine})); err == nil {
			t.Fatal("want error")
		}
		noWrite(t, mt)
	})

	mt.Run("only missing ids write nothing", func(mt *mtest.T) {
		svc := newDrawingSvc(mt)
		mt.AddMockResponses(f.game())
		if err := svc.DeleteDrawingPaths(f.gameID.Hex(), f.sceneID, f.ownerID, hexes([]primitive.ObjectID{primitive.NewObjectID()})); err != nil {
			t.Fatalf("want no error, got %v", err)
		}
		noWrite(t, mt)
	})
}

func TestMoveDrawingPaths(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	f := newDrawingBatchFixture()

	mt.Run("each path gets its own $set with translated points", func(mt *mtest.T) {
		svc := newDrawingSvc(mt)
		mt.AddMockResponses(f.game(), wrote)
		req := models.MoveDrawingPathsRequest{PathIDs: hexes([]primitive.ObjectID{f.ownLine, f.ownText}), DX: 5, DY: -10}
		if err := svc.MoveDrawingPaths(f.gameID.Hex(), f.sceneID, f.ownerID, req); err != nil {
			t.Fatalf("MoveDrawingPaths: %v", err)
		}
		mt.GetStartedEvent() // the game read
		updates, _ := mt.GetStartedEvent().Command.Lookup("updates").Array().Values()
		if len(updates) != 2 {
			t.Fatalf("want 2 updates in one bulk write, got %d", len(updates))
		}
		first := updates[0].Document()
		pts := first.Lookup("u", "$set", "scenes.$[scene].drawingPaths.$[path].points").Array()
		end, _ := pts.Index(1).Value().Array().Values()
		if end[0].Double() != 15 || end[1].Double() != 10 {
			t.Errorf("line end at (%v, %v), want (15, 10)", end[0], end[1])
		}
		filters, _ := first.Lookup("arrayFilters").Array().Values()
		if got := filters[1].Document().Lookup("path._id").ObjectID(); got != f.ownLine {
			t.Errorf("first update targets %v, want the line", got)
		}
		// A label moves by its anchor only; rotation is not part of the write.
		text := updates[1].Document().Lookup("u", "$set")
		if _, err := text.Document().LookupErr("scenes.$[scene].drawingPaths.$[path].rotation"); err == nil {
			t.Error("rotation must not be written by a move")
		}
	})

	for _, c := range []struct {
		name string
		req  models.MoveDrawingPathsRequest
	}{
		{"someone else's path", models.MoveDrawingPathsRequest{PathIDs: hexes([]primitive.ObjectID{f.ownLine, f.gmLine}), DX: 1}},
		{"a huge delta", models.MoveDrawingPathsRequest{PathIDs: hexes([]primitive.ObjectID{f.ownLine}), DX: MaxDrawingMoveDelta + 1}},
	} {
		mt.Run("rejects "+c.name+" without writing", func(mt *mtest.T) {
			svc := newDrawingSvc(mt)
			mt.AddMockResponses(f.game())
			if err := svc.MoveDrawingPaths(f.gameID.Hex(), f.sceneID, f.ownerID, c.req); err == nil {
				t.Fatal("want error")
			}
			// The delta check runs before the read; then no command is recorded at all.
			for ev := mt.GetStartedEvent(); ev != nil; ev = mt.GetStartedEvent() {
				if ev.CommandName != "find" {
					t.Fatalf("unexpected %s", ev.CommandName)
				}
			}
		})
	}
}

func TestPasteDrawingPaths(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	f := newDrawingBatchFixture()
	line := models.AddDrawingPathRequest{Tool: "line", Points: [][2]float64{{0, 0}, {5, 5}}, Color: "#123456"}
	text := models.AddDrawingPathRequest{Tool: "text", Points: [][2]float64{{1, 1}}, Text: "  Most  "}

	mt.Run("pushes every copy at once with fresh ids owned by the paster", func(mt *mtest.T) {
		svc := newDrawingSvc(mt)
		// The participant read, then the null-array init and the $push.
		mt.AddMockResponses(f.game(), wrote, wrote)
		created, err := svc.PasteDrawingPaths(f.gameID.Hex(), f.sceneID, f.otherID, []models.AddDrawingPathRequest{line, text})
		if err != nil {
			t.Fatalf("PasteDrawingPaths: %v", err)
		}
		if len(created) != 2 || created[0].ID.IsZero() || created[0].ID == created[1].ID {
			t.Fatalf("want two paths with distinct fresh ids, got %+v", created)
		}
		if created[0].UserID != f.otherID || created[1].Text != "Most" {
			t.Errorf("owner %v, text %q", created[0].UserID, created[1].Text)
		}
		mt.GetStartedEvent() // the game read
		mt.GetStartedEvent() // the null-array init
		each, _ := mt.GetStartedEvent().Command.Lookup("updates").Array().Index(0).Value().Document().
			Lookup("u", "$push", "scenes.$.drawingPaths", "$each").Array().Values()
		if len(each) != 2 {
			t.Errorf("want one $push of 2 paths, got %d", len(each))
		}
	})

	tooMany := make([]models.AddDrawingPathRequest, MaxPastedDrawingPaths+1)
	for i := range tooMany {
		tooMany[i] = line
	}
	for name, paths := range map[string][]models.AddDrawingPathRequest{
		"too many paths":  tooMany,
		"an empty label":  {line, {Tool: "text", Points: [][2]float64{{1, 1}}, Text: "   "}},
		"no paths at all": {},
	} {
		mt.Run("rejects "+name+" without writing", func(mt *mtest.T) {
			svc := newDrawingSvc(mt)
			mt.AddMockResponses(f.game())
			if _, err := svc.PasteDrawingPaths(f.gameID.Hex(), f.sceneID, f.ownerID, paths); err == nil {
				t.Fatal("want error")
			}
			for ev := mt.GetStartedEvent(); ev != nil; ev = mt.GetStartedEvent() {
				if ev.CommandName != "find" {
					t.Fatalf("unexpected %s", ev.CommandName)
				}
			}
		})
	}
}

func hexes(ids []primitive.ObjectID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = id.Hex()
	}
	return out
}
