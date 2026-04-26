package service

import (
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"
	"math/rand"
	"sync"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MinigamePlayer is the common player input type used by all minigame services.
type MinigamePlayer struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	IsNPC    bool   `json:"isNpc"`
}

type YahtzeePlayer struct {
	UserID   string          `json:"userId"`
	Username string          `json:"username"`
	IsNPC    bool            `json:"isNpc"`
	Scores   map[string]*int `json:"scores"`
}

type YahtzeeGame struct {
	mu               sync.Mutex
	GameID           string          `json:"gameId"`
	Players          []YahtzeePlayer `json:"players"`
	CurrentPlayerIdx int             `json:"currentPlayerIdx"`
	Dice             [5]int          `json:"dice"`
	Held             [5]bool         `json:"held"`
	RollsLeft        int             `json:"rollsLeft"`
	RoundsDone       int             `json:"roundsDone"`
	MaxRounds        int             `json:"maxRounds"`
}

type YahtzeeService struct {
	games    sync.Map
	hub      *websocket.Hub
	gameRepo *repository.GameRepository
}

func NewYahtzeeService(gameRepo *repository.GameRepository, hub *websocket.Hub) *YahtzeeService {
	return &YahtzeeService{gameRepo: gameRepo, hub: hub}
}

func (s *YahtzeeService) HasGame(gameID string) bool {
	_, ok := s.games.Load(gameID)
	return ok
}

func (s *YahtzeeService) isGM(gameID string, userID primitive.ObjectID) error {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return err
	}
	if game.GameMasterID != userID {
		return fmt.Errorf("only the game master can manage mini-games")
	}
	return nil
}

func (s *YahtzeeService) StartGame(gameID string, userID primitive.ObjectID, players []YahtzeePlayer, maxRounds int) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}
	if len(players) < 2 {
		return fmt.Errorf("at least 2 players required")
	}
	if maxRounds < 1 || maxRounds > 13 {
		maxRounds = 13
	}

	for i := range players {
		players[i].Scores = make(map[string]*int)
	}

	game := &YahtzeeGame{
		GameID:           gameID,
		Players:          players,
		CurrentPlayerIdx: 0,
		RollsLeft:        3,
		MaxRounds:        maxRounds,
	}
	s.games.Store(gameID, game)

	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStarted, map[string]interface{}{
		"game": s.snapshot(game),
	})
	return nil
}

func (s *YahtzeeService) EndGame(gameID string, userID primitive.ObjectID) error {
	if err := s.isGM(gameID, userID); err != nil {
		return err
	}
	return s.finishGame(gameID)
}

func (s *YahtzeeService) GetGame(gameID string) (map[string]interface{}, error) {
	val, ok := s.games.Load(gameID)
	if !ok {
		return nil, fmt.Errorf("no active minigame")
	}
	g := val.(*YahtzeeGame)
	g.mu.Lock()
	defer g.mu.Unlock()
	return s.snapshot(g), nil
}

func (s *YahtzeeService) Roll(gameID string, userID primitive.ObjectID) error {
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*YahtzeeGame)
	g.mu.Lock()

	if err := s.validateTurn(g, userID); err != nil {
		g.mu.Unlock()
		return err
	}
	if g.RollsLeft <= 0 {
		g.mu.Unlock()
		return fmt.Errorf("no rolls left, please choose a category")
	}

	for i := range g.Dice {
		if !g.Held[i] {
			g.Dice[i] = rand.Intn(6) + 1
		}
	}
	g.RollsLeft--

	snap := s.snapshot(g)
	g.mu.Unlock()
	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *YahtzeeService) SetHeld(gameID string, userID primitive.ObjectID, held [5]bool) error {
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*YahtzeeGame)
	g.mu.Lock()

	if err := s.validateTurn(g, userID); err != nil {
		g.mu.Unlock()
		return err
	}
	if g.RollsLeft == 3 {
		g.mu.Unlock()
		return fmt.Errorf("must roll at least once before holding")
	}

	g.Held = held
	snap := s.snapshot(g)
	g.mu.Unlock()
	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *YahtzeeService) Score(gameID string, userID primitive.ObjectID, category string) error {
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*YahtzeeGame)
	g.mu.Lock()

	if err := s.validateTurn(g, userID); err != nil {
		g.mu.Unlock()
		return err
	}
	if g.RollsLeft == 3 {
		g.mu.Unlock()
		return fmt.Errorf("must roll at least once before scoring")
	}
	if !isValidCategory(category) {
		g.mu.Unlock()
		return fmt.Errorf("invalid category: %s", category)
	}

	player := &g.Players[g.CurrentPlayerIdx]
	if _, alreadyScored := player.Scores[category]; alreadyScored {
		g.mu.Unlock()
		return fmt.Errorf("category already scored")
	}

	points := computeScore(category, g.Dice)
	player.Scores[category] = &points

	g.CurrentPlayerIdx = (g.CurrentPlayerIdx + 1) % len(g.Players)
	g.RollsLeft = 3
	g.Held = [5]bool{}
	g.Dice = [5]int{}
	g.RoundsDone++

	if g.RoundsDone >= len(g.Players)*g.MaxRounds {
		players := make([]YahtzeePlayer, len(g.Players))
		copy(players, g.Players)
		g.mu.Unlock()
		s.games.Delete(gameID)
		s.hub.BroadcastToGame(gameID, websocket.EventMinigameEnded, map[string]interface{}{
			"gameType": "yahtzee",
			"players":  players,
		})
		return nil
	}

	snap := s.snapshot(g)
	g.mu.Unlock()
	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *YahtzeeService) CleanupGame(gameID string) {
	s.games.Delete(gameID)
}

// finishGame ends the game and broadcasts final results
func (s *YahtzeeService) finishGame(gameID string) error {
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*YahtzeeGame)
	g.mu.Lock()
	players := make([]YahtzeePlayer, len(g.Players))
	copy(players, g.Players)
	g.mu.Unlock()

	s.games.Delete(gameID)
	s.hub.BroadcastToGame(gameID, websocket.EventMinigameEnded, map[string]interface{}{
		"gameType": "yahtzee",
		"players":  players,
	})
	return nil
}

func (s *YahtzeeService) validateTurn(g *YahtzeeGame, userID primitive.ObjectID) error {
	if g.CurrentPlayerIdx >= len(g.Players) {
		return fmt.Errorf("invalid game state")
	}
	current := g.Players[g.CurrentPlayerIdx]
	// NPCs have empty UserID — only GM can act for them (GM check happens in handler)
	if current.IsNPC {
		return nil
	}
	if current.UserID != userID.Hex() {
		return fmt.Errorf("not your turn")
	}
	return nil
}

// snapshot builds a JSON-serializable copy (without the mutex)
func (s *YahtzeeService) snapshot(g *YahtzeeGame) map[string]interface{} {
	players := make([]interface{}, len(g.Players))
	for i, p := range g.Players {
		scores := make(map[string]interface{})
		for k, v := range p.Scores {
			scores[k] = v
		}
		players[i] = map[string]interface{}{
			"userId":   p.UserID,
			"username": p.Username,
			"isNpc":    p.IsNPC,
			"scores":   scores,
		}
	}
	return map[string]interface{}{
		"gameType":         "yahtzee",
		"gameId":           g.GameID,
		"players":          players,
		"currentPlayerIdx": g.CurrentPlayerIdx,
		"dice":             g.Dice,
		"held":             g.Held,
		"rollsLeft":        g.RollsLeft,
		"roundsDone":       g.RoundsDone,
		"maxRounds":        g.MaxRounds,
	}
}

func isValidCategory(cat string) bool {
	valid := map[string]bool{
		"ones": true, "twos": true, "threes": true, "fours": true, "fives": true, "sixes": true,
		"threeOfAKind": true, "fourOfAKind": true, "fullHouse": true,
		"smallStraight": true, "largeStraight": true, "yahtzee": true, "chance": true,
	}
	return valid[cat]
}

func computeScore(category string, dice [5]int) int {
	counts := [7]int{}
	sum := 0
	for _, d := range dice {
		counts[d]++
		sum += d
	}

	switch category {
	case "ones":
		return counts[1] * 1
	case "twos":
		return counts[2] * 2
	case "threes":
		return counts[3] * 3
	case "fours":
		return counts[4] * 4
	case "fives":
		return counts[5] * 5
	case "sixes":
		return counts[6] * 6
	case "threeOfAKind":
		for _, c := range counts {
			if c >= 3 {
				return sum
			}
		}
		return 0
	case "fourOfAKind":
		for _, c := range counts {
			if c >= 4 {
				return sum
			}
		}
		return 0
	case "fullHouse":
		hasThree, hasTwo := false, false
		for _, c := range counts {
			if c == 3 {
				hasThree = true
			}
			if c == 2 {
				hasTwo = true
			}
		}
		if hasThree && hasTwo {
			return 25
		}
		return 0
	case "smallStraight":
		straights := [][4]int{{1, 2, 3, 4}, {2, 3, 4, 5}, {3, 4, 5, 6}}
		for _, s := range straights {
			if counts[s[0]] > 0 && counts[s[1]] > 0 && counts[s[2]] > 0 && counts[s[3]] > 0 {
				return 30
			}
		}
		return 0
	case "largeStraight":
		if (counts[1] > 0 && counts[2] > 0 && counts[3] > 0 && counts[4] > 0 && counts[5] > 0) ||
			(counts[2] > 0 && counts[3] > 0 && counts[4] > 0 && counts[5] > 0 && counts[6] > 0) {
			return 40
		}
		return 0
	case "yahtzee":
		for _, c := range counts {
			if c == 5 {
				return 50
			}
		}
		return 0
	case "chance":
		return sum
	}
	return 0
}
