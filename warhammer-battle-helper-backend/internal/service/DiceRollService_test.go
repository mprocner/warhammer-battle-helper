package service

import (
	"errors"
	"testing"

	"battle-helper/internal/dice"
	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type stubGameLookup struct {
	game  *models.Game
	calls int
}

func (s *stubGameLookup) GetByID(id string) (*models.Game, error) {
	s.calls++
	if s.game == nil {
		return nil, errors.New("not found")
	}
	return s.game, nil
}

type stubEventLog struct{ events []models.GameEvent }

func (s *stubEventLog) AddEvent(gameID string, e models.GameEvent) error {
	s.events = append(s.events, e)
	return nil
}

type publishedRoll struct {
	eventType  string
	visibility string
	payload    map[string]interface{}
}

type stubPublisher struct{ published []publishedRoll }

func (s *stubPublisher) Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID) {
	s.published = append(s.published, publishedRoll{eventType, visibility, payload})
}

type stubNames struct{}

func (stubNames) DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string {
	return "Ania"
}

type stubStats struct{ recorded []*models.RollStat }

func (s *stubStats) Record(stat *models.RollStat) error {
	s.recorded = append(s.recorded, stat)
	return nil
}

// stubRoller returns face values in order (Intn yields value-1).
type stubRoller struct {
	values []int
	i      int
}

func (r *stubRoller) Intn(n int) int {
	v := r.values[r.i]
	r.i++
	return v - 1
}

type diceRollFixture struct {
	svc       *DiceRollService
	games     *stubGameLookup
	events    *stubEventLog
	publisher *stubPublisher
	stats     *stubStats
	gameID    string
	actor     RollActor
}

func newDiceRollFixture(values ...int) diceRollFixture {
	f := diceRollFixture{
		games:     &stubGameLookup{game: &models.Game{GameMasterID: primitive.NewObjectID()}},
		events:    &stubEventLog{},
		publisher: &stubPublisher{},
		stats:     &stubStats{},
		gameID:    primitive.NewObjectID().Hex(),
		actor:     RollActor{UserID: primitive.NewObjectID(), Email: "ania@x"},
	}
	f.svc = NewDiceRollService(f.games, f.events, f.publisher, stubNames{}, f.stats, &stubRoller{values: values})
	f.svc.runAsync = func(fn func()) { fn() } // make stats recording observable in the test
	return f
}

func TestRollExpression_InvalidExpressionTouchesNothing(t *testing.T) {
	f := newDiceRollFixture()

	_, err := f.svc.RollExpression(f.gameID, "2x6", f.actor, "")

	var de *dice.Error
	if !errors.As(err, &de) || de.Code != dice.CodeUnexpectedToken {
		t.Fatalf("want *dice.Error unexpected_token, got %v", err)
	}
	if f.games.calls != 0 || len(f.events.events) != 0 || len(f.publisher.published) != 0 || len(f.stats.recorded) != 0 {
		t.Errorf("a rejected expression must not read or write anything")
	}
}

func TestRollExpression_PayloadShape(t *testing.T) {
	f := newDiceRollFixture(4, 2, 3)

	payload, err := f.svc.RollExpression(f.gameID, "2d6 + 1d4 - 1", f.actor, "")
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]interface{}{
		"rollType":     "expression",
		"expression":   "2d6+1d4-1",
		"mode":         "sum",
		"total":        8,
		"username":     "Ania",
		"visibility":   "all",
		"rollerUserId": f.actor.UserID.Hex(),
	}
	for k, v := range want {
		if payload[k] != v {
			t.Errorf("payload[%q] = %v, want %v", k, payload[k], v)
		}
	}
	if _, has := payload["check"]; has {
		t.Errorf("payload must not carry check without vs")
	}

	terms := payload["terms"].([]map[string]interface{})
	if len(terms) != 3 {
		t.Fatalf("want 3 terms, got %d", len(terms))
	}
	first := terms[0]
	if first["count"] != 2 || first["sides"] != 6 || first["subtotal"] != 6 || first["sign"] != 1 {
		t.Errorf("first term = %v", first)
	}
	firstDice := first["dice"].([]map[string]interface{})
	if len(firstDice) != 2 || firstDice[0]["value"] != 4 || firstDice[0]["kept"] != true {
		t.Errorf("first term dice = %v", firstDice)
	}
	if terms[2]["constant"] != 1 || terms[2]["sign"] != -1 {
		t.Errorf("constant term = %v", terms[2])
	}

	if len(f.events.events) != 1 {
		t.Fatalf("want one stored event, got %d", len(f.events.events))
	}
	ev := f.events.events[0]
	if ev.Type != models.EventTypeDiceRoll || ev.Username != "Ania" || ev.Visibility != "all" || ev.RollerUserID != f.actor.UserID {
		t.Errorf("stored event = %+v", ev)
	}
	if len(f.publisher.published) != 1 || f.publisher.published[0].eventType != websocket.EventDiceRolled {
		t.Errorf("want one DICE_ROLLED broadcast, got %+v", f.publisher.published)
	}
}

func TestRollExpression_ForwardsVisibility(t *testing.T) {
	f := newDiceRollFixture(3)

	if _, err := f.svc.RollExpression(f.gameID, "d6", f.actor, "gm_only"); err != nil {
		t.Fatal(err)
	}
	if f.publisher.published[0].visibility != "gm_only" || f.events.events[0].Visibility != "gm_only" {
		t.Errorf("visibility not forwarded: %+v / %+v", f.publisher.published[0], f.events.events[0])
	}
	// The frontend's lock icon and toast read this payload field.
	if f.publisher.published[0].payload["visibility"] != "gm_only" {
		t.Errorf("payload visibility = %v", f.publisher.published[0].payload["visibility"])
	}
}

func TestRollExpression_RecordsEveryRolledDie(t *testing.T) {
	f := newDiceRollFixture(1, 2, 3, 4)

	if _, err := f.svc.RollExpression(f.gameID, "4d6kh3+2", f.actor, ""); err != nil {
		t.Fatal(err)
	}
	if len(f.stats.recorded) != 4 {
		t.Fatalf("want 4 stats (dropped die included), got %d", len(f.stats.recorded))
	}
	for i, st := range f.stats.recorded {
		if st.DieType != 6 || st.Result != i+1 || st.RollType != "generic" || st.UserID != f.actor.UserID || st.GameID == nil {
			t.Errorf("stat %d = %+v", i, st)
		}
	}
}

func TestRollExpression_CheckInPayload(t *testing.T) {
	f := newDiceRollFixture(55)

	payload, err := f.svc.RollExpression(f.gameID, "d100-10 vs 45", f.actor, "")
	if err != nil {
		t.Fatal(err)
	}
	check, ok := payload["check"].(map[string]interface{})
	if !ok || check["target"] != 45 || check["success"] != true {
		t.Errorf("check = %v", payload["check"])
	}
}

func TestRollExpression_GameNotFound(t *testing.T) {
	f := newDiceRollFixture(3)
	f.games.game = nil

	_, err := f.svc.RollExpression(f.gameID, "d6", f.actor, "")

	var de *dice.Error
	if err == nil || errors.As(err, &de) {
		t.Fatalf("want a plain error, got %v", err)
	}
	if len(f.events.events) != 0 {
		t.Errorf("nothing may be stored for a missing game")
	}
}
