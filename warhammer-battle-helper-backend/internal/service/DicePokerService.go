package service

import (
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"
	"math/rand"
	"sync"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DicePokerPhase string

const (
	DicePokerPhaseRolling DicePokerPhase = "rolling"
	DicePokerPhaseReveal  DicePokerPhase = "reveal"
)

type dicePokerPlayer struct {
	UserID    string
	Username  string
	IsNPC     bool
	dice      [5]int
	held      [5]bool
	rollsLeft int
	confirmed bool
	RoundWins int
}

type DicePokerGame struct {
	mu               sync.Mutex
	GameID           string
	GameMasterID     string
	Players          []*dicePokerPlayer
	CurrentPlayerIdx int
	Phase            DicePokerPhase
	RoundsDone       int
	MaxRounds        int
}

type DicePokerRollResult struct {
	Dice      [5]int  `json:"dice"`
	Held      [5]bool `json:"held"`
	RollsLeft int     `json:"rollsLeft"`
}

type DicePokerService struct {
	games    sync.Map
	hub      *websocket.Hub
	gameRepo *repository.GameRepository
}

func NewDicePokerService(gameRepo *repository.GameRepository, hub *websocket.Hub) *DicePokerService {
	return &DicePokerService{gameRepo: gameRepo, hub: hub}
}

func (s *DicePokerService) HasGame(gameID string) bool {
	_, ok := s.games.Load(gameID)
	return ok
}

func (s *DicePokerService) gmID(gameID string, userID primitive.ObjectID) (string, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return "", err
	}
	if game.GameMasterID != userID {
		return "", fmt.Errorf("only the game master can manage mini-games")
	}
	return userID.Hex(), nil
}

func (s *DicePokerService) StartGame(gameID string, userID primitive.ObjectID, players []MinigamePlayer, maxRounds int) error {
	gmIDHex, err := s.gmID(gameID, userID)
	if err != nil {
		return err
	}
	if len(players) < 2 {
		return fmt.Errorf("at least 2 players required")
	}
	if maxRounds < 1 || maxRounds > 20 {
		maxRounds = 5
	}

	gamePlayers := make([]*dicePokerPlayer, len(players))
	for i, p := range players {
		gamePlayers[i] = &dicePokerPlayer{
			UserID:    p.UserID,
			Username:  p.Username,
			IsNPC:     p.IsNPC,
			rollsLeft: 2,
		}
	}

	g := &DicePokerGame{
		GameID:           gameID,
		GameMasterID:     gmIDHex,
		Players:          gamePlayers,
		CurrentPlayerIdx: 0,
		Phase:            DicePokerPhaseRolling,
		MaxRounds:        maxRounds,
	}
	s.games.Store(gameID, g)

	snap := s.snapshot(g, "")
	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStarted, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *DicePokerService) EndGame(gameID string, userID primitive.ObjectID) error {
	if _, err := s.gmID(gameID, userID); err != nil {
		return err
	}
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*DicePokerGame)
	g.mu.Lock()
	results := s.buildResults(g)
	g.mu.Unlock()

	s.games.Delete(gameID)
	s.hub.BroadcastToGame(gameID, websocket.EventMinigameEnded, map[string]interface{}{
		"gameType": "dicepoker",
		"players":  results,
	})
	return nil
}

func (s *DicePokerService) GetGame(gameID string, forUserID string) (map[string]interface{}, error) {
	val, ok := s.games.Load(gameID)
	if !ok {
		return nil, fmt.Errorf("no active minigame")
	}
	g := val.(*DicePokerGame)
	g.mu.Lock()
	defer g.mu.Unlock()
	return s.snapshot(g, forUserID), nil
}

func (s *DicePokerService) Roll(gameID string, userID primitive.ObjectID) (*DicePokerRollResult, error) {
	val, ok := s.games.Load(gameID)
	if !ok {
		return nil, fmt.Errorf("no active minigame")
	}
	g := val.(*DicePokerGame)
	g.mu.Lock()

	if err := s.validateTurn(g, userID); err != nil {
		g.mu.Unlock()
		return nil, err
	}
	if g.Phase != DicePokerPhaseRolling {
		g.mu.Unlock()
		return nil, fmt.Errorf("not in rolling phase")
	}

	p := g.Players[g.CurrentPlayerIdx]
	if p.rollsLeft <= 0 {
		g.mu.Unlock()
		return nil, fmt.Errorf("no rolls left, please confirm your hand")
	}

	for i := range p.dice {
		if !p.held[i] {
			p.dice[i] = rand.Intn(6) + 1
		}
	}
	p.rollsLeft--

	result := &DicePokerRollResult{Dice: p.dice, Held: p.held, RollsLeft: p.rollsLeft}
	snap := s.snapshot(g, "")
	g.mu.Unlock()

	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return result, nil
}

func (s *DicePokerService) SetHeld(gameID string, userID primitive.ObjectID, held [5]bool) error {
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*DicePokerGame)
	g.mu.Lock()

	if err := s.validateTurn(g, userID); err != nil {
		g.mu.Unlock()
		return err
	}
	if g.Phase != DicePokerPhaseRolling {
		g.mu.Unlock()
		return fmt.Errorf("not in rolling phase")
	}

	p := g.Players[g.CurrentPlayerIdx]
	if p.rollsLeft == 2 {
		g.mu.Unlock()
		return fmt.Errorf("must roll at least once before holding")
	}

	p.held = held
	snap := s.snapshot(g, "")
	g.mu.Unlock()

	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *DicePokerService) Confirm(gameID string, userID primitive.ObjectID) error {
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*DicePokerGame)
	g.mu.Lock()

	if err := s.validateTurn(g, userID); err != nil {
		g.mu.Unlock()
		return err
	}
	if g.Phase != DicePokerPhaseRolling {
		g.mu.Unlock()
		return fmt.Errorf("not in rolling phase")
	}

	p := g.Players[g.CurrentPlayerIdx]
	if p.rollsLeft == 2 {
		g.mu.Unlock()
		return fmt.Errorf("must roll at least once before confirming")
	}

	p.confirmed = true
	g.CurrentPlayerIdx = (g.CurrentPlayerIdx + 1) % len(g.Players)

	allConfirmed := true
	for _, pl := range g.Players {
		if !pl.confirmed {
			allConfirmed = false
			break
		}
	}
	if allConfirmed {
		g.Phase = DicePokerPhaseReveal
	}

	snap := s.snapshot(g, "")
	g.mu.Unlock()

	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *DicePokerService) NextRound(gameID string, userID primitive.ObjectID) error {
	if _, err := s.gmID(gameID, userID); err != nil {
		return err
	}
	val, ok := s.games.Load(gameID)
	if !ok {
		return fmt.Errorf("no active minigame")
	}
	g := val.(*DicePokerGame)
	g.mu.Lock()

	if g.Phase != DicePokerPhaseReveal {
		g.mu.Unlock()
		return fmt.Errorf("not in reveal phase")
	}

	// Score round: find best hand, award wins
	bestRank := -1
	for _, p := range g.Players {
		r := classifyPokerHand(p.dice)
		if r > bestRank {
			bestRank = r
		}
	}
	for _, p := range g.Players {
		if classifyPokerHand(p.dice) == bestRank {
			p.RoundWins++
		}
	}

	g.RoundsDone++

	if g.RoundsDone >= g.MaxRounds {
		results := s.buildResults(g)
		g.mu.Unlock()
		s.games.Delete(gameID)
		s.hub.BroadcastToGame(gameID, websocket.EventMinigameEnded, map[string]interface{}{
			"gameType": "dicepoker",
			"players":  results,
		})
		return nil
	}

	// Reset for new round
	for _, p := range g.Players {
		p.dice = [5]int{}
		p.held = [5]bool{}
		p.rollsLeft = 2
		p.confirmed = false
	}
	g.CurrentPlayerIdx = 0
	g.Phase = DicePokerPhaseRolling

	snap := s.snapshot(g, "")
	g.mu.Unlock()

	s.hub.BroadcastToGame(gameID, websocket.EventMinigameStateUpdated, map[string]interface{}{
		"game": snap,
	})
	return nil
}

func (s *DicePokerService) validateTurn(g *DicePokerGame, userID primitive.ObjectID) error {
	if g.CurrentPlayerIdx >= len(g.Players) {
		return fmt.Errorf("invalid game state")
	}
	p := g.Players[g.CurrentPlayerIdx]
	if p.IsNPC {
		if userID.Hex() != g.GameMasterID {
			return fmt.Errorf("only the game master can act for NPCs")
		}
		return nil
	}
	if p.UserID != userID.Hex() {
		return fmt.Errorf("not your turn")
	}
	return nil
}

// snapshot returns a JSON-serializable state with dice masked for players other than forUserID.
// forUserID="" masks all players.
func (s *DicePokerService) snapshot(g *DicePokerGame, forUserID string) map[string]interface{} {
	players := make([]interface{}, len(g.Players))
	for i, p := range g.Players {
		dice := p.dice
		held := p.held

		if g.Phase == DicePokerPhaseRolling {
			isOwn := forUserID != "" && p.UserID == forUserID
			isNPCForGM := forUserID != "" && p.IsNPC && p.UserID == "" && forUserID == g.GameMasterID && i == g.CurrentPlayerIdx
			if !isOwn && !isNPCForGM {
				dice = [5]int{}
				held = [5]bool{}
			}
		}

		players[i] = map[string]interface{}{
			"userId":    p.UserID,
			"username":  p.Username,
			"isNpc":     p.IsNPC,
			"dice":      dice,
			"held":      held,
			"rollsLeft": p.rollsLeft,
			"confirmed": p.confirmed,
			"roundWins": p.RoundWins,
		}
	}
	return map[string]interface{}{
		"gameType":         "dicepoker",
		"gameId":           g.GameID,
		"players":          players,
		"currentPlayerIdx": g.CurrentPlayerIdx,
		"phase":            string(g.Phase),
		"roundsDone":       g.RoundsDone,
		"maxRounds":        g.MaxRounds,
	}
}

func (s *DicePokerService) buildResults(g *DicePokerGame) []map[string]interface{} {
	results := make([]map[string]interface{}, len(g.Players))
	for i, p := range g.Players {
		results[i] = map[string]interface{}{
			"userId":    p.UserID,
			"username":  p.Username,
			"isNpc":     p.IsNPC,
			"roundWins": p.RoundWins,
		}
	}
	return results
}

// classifyPokerHand returns a hand rank (higher = better).
// 0=high card, 1=one pair, 2=two pair, 3=three of a kind,
// 4=straight, 5=full house, 6=four of a kind, 7=five of a kind
func classifyPokerHand(dice [5]int) int {
	counts := [7]int{}
	for _, d := range dice {
		if d >= 1 && d <= 6 {
			counts[d]++
		}
	}

	// Straight: 1-2-3-4-5 or 2-3-4-5-6
	if counts[1] > 0 && counts[2] > 0 && counts[3] > 0 && counts[4] > 0 && counts[5] > 0 {
		return 4
	}
	if counts[2] > 0 && counts[3] > 0 && counts[4] > 0 && counts[5] > 0 && counts[6] > 0 {
		return 4
	}

	maxCount := 0
	pairCount := 0
	for i := 1; i <= 6; i++ {
		if counts[i] > maxCount {
			maxCount = counts[i]
		}
		if counts[i] == 2 {
			pairCount++
		}
	}

	switch {
	case maxCount == 5:
		return 7
	case maxCount == 4:
		return 6
	case maxCount == 3 && pairCount == 1:
		return 5
	case maxCount == 3:
		return 3
	case pairCount == 2:
		return 2
	case pairCount == 1:
		return 1
	default:
		return 0
	}
}
