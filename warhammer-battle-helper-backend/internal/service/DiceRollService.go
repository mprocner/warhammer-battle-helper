package service

import (
	"fmt"
	"log"

	"battle-helper/internal/dice"
	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Ports of DiceRollService. Declared here, by the consumer, so the service depends on
// what it uses rather than on concrete repositories — and tests can pass stubs.
type gameLookup interface {
	GetByID(id string) (*models.Game, error)
}

type eventAppender interface {
	AddEvent(gameID string, event models.GameEvent) error
}

type rollPublisher interface {
	Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID)
}

type displayNameResolver interface {
	DisplayName(game *models.Game, userID primitive.ObjectID, fallback string) string
}

type rollStatsRecorder interface {
	Record(stat *models.RollStat) error
}

// RollActor is the user who rolls, as read from the JWT.
type RollActor struct {
	UserID primitive.ObjectID
	Email  string
}

// DiceRollService rolls free-form dice expressions typed in chat.
type DiceRollService struct {
	games     gameLookup
	events    eventAppender
	publisher rollPublisher
	names     displayNameResolver
	stats     rollStatsRecorder
	rng       dice.Roller
	limits    dice.Limits
	runAsync  func(func()) // stats are written off the request path; tests run them inline
}

func NewDiceRollService(games gameLookup, events eventAppender, publisher rollPublisher, names displayNameResolver, stats rollStatsRecorder, rng dice.Roller) *DiceRollService {
	return &DiceRollService{
		games:     games,
		events:    events,
		publisher: publisher,
		names:     names,
		stats:     stats,
		rng:       rng,
		limits:    dice.DefaultLimits(),
		runAsync:  func(fn func()) { go fn() },
	}
}

// RollExpression parses, rolls, stores and broadcasts one expression.
// The expression is parsed before the game is loaded: a malformed line costs no database read.
func (s *DiceRollService) RollExpression(gameID, input string, actor RollActor, visibility string) (map[string]interface{}, error) {
	expr, err := dice.Parse(input, s.limits)
	if err != nil {
		return nil, err
	}
	game, err := s.games.GetByID(gameID)
	if err != nil {
		return nil, fmt.Errorf("game not found: %w", err)
	}
	outcome := dice.Evaluate(expr, s.rng)

	if visibility == "" {
		visibility = "all"
	}
	displayName := s.names.DisplayName(game, actor.UserID, actor.Email)

	payload := outcomeToPayload(outcome)
	payload["username"] = displayName
	payload["visibility"] = visibility
	payload["rollerUserId"] = actor.UserID.Hex()

	event := models.GameEvent{
		Type:         models.EventTypeDiceRoll,
		CreatedBy:    actor.UserID,
		Username:     displayName,
		Visibility:   visibility,
		RollerUserID: actor.UserID,
		Data:         payload,
	}
	if err := s.events.AddEvent(gameID, event); err != nil {
		return nil, err
	}

	s.publisher.Publish(gameID, websocket.EventDiceRolled, payload, visibility, actor.UserID, game.GameMasterID)
	s.recordStats(gameID, actor.UserID, outcome)
	return payload, nil
}

// outcomeToPayload maps the domain result to the event/HTTP shape. It lives here, not in
// the dice package, because the domain must not know about JSON or Mongo documents.
func outcomeToPayload(o dice.Outcome) map[string]interface{} {
	terms := make([]map[string]interface{}, 0, len(o.Terms))
	for _, t := range o.Terms {
		term := map[string]interface{}{"sign": t.Sign, "subtotal": t.Subtotal}
		if t.Spec == nil {
			term["constant"] = t.Subtotal
			terms = append(terms, term)
			continue
		}
		term["count"] = t.Spec.Count
		term["sides"] = t.Spec.Sides
		if t.Spec.Keep != nil {
			term["keep"] = map[string]interface{}{"highest": t.Spec.Keep.Highest, "count": t.Spec.Keep.Count}
		}
		if t.Spec.Threshold != nil {
			term["threshold"] = *t.Spec.Threshold
		}
		rolled := make([]map[string]interface{}, len(t.Dice))
		for i, d := range t.Dice {
			rolled[i] = map[string]interface{}{"value": d.Value, "kept": d.Kept, "success": d.Success}
		}
		term["dice"] = rolled
		terms = append(terms, term)
	}

	payload := map[string]interface{}{
		"rollType":   "expression",
		"expression": o.Canonical,
		"mode":       string(o.Mode),
		"terms":      terms,
		"total":      o.Total,
	}
	if o.Check != nil {
		payload["check"] = map[string]interface{}{"target": o.Check.Target, "success": o.Check.Success}
	}
	return payload
}

// recordStats stores one RollStat per physically rolled die, dropped ones included,
// under RollType "generic" — the same bucket as the dice buttons.
func (s *DiceRollService) recordStats(gameID string, userID primitive.ObjectID, o dice.Outcome) {
	gameObjID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return
	}
	var stats []*models.RollStat
	for _, t := range o.Terms {
		if t.Spec == nil {
			continue
		}
		for _, d := range t.Dice {
			stats = append(stats, &models.RollStat{
				UserID:   userID,
				GameID:   &gameObjID,
				DieType:  t.Spec.Sides,
				Result:   d.Value,
				RollType: "generic",
			})
		}
	}
	s.runAsync(func() {
		for _, st := range stats {
			if err := s.stats.Record(st); err != nil {
				log.Printf("roll stats record failed: %v", err)
			}
		}
	})
}
