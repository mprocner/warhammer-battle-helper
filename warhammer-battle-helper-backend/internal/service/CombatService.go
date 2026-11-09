package service

import (
	"errors"
	"path/filepath"
	"strings"
	"time"

	"battle-helper/internal/combat"
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrCombatForbidden     = errors.New("not allowed to change this combat")
	ErrCombatNotFound      = errors.New("no combat on this scene")
	ErrCombatSceneNotFound = errors.New("scene not found")
	ErrCombatInvalid       = errors.New("invalid combat request")
)

const maxCombatNameLen = 60

type CombatService struct {
	gameRepo *repository.GameRepository
	charRepo *repository.CharactersRepository
	hub      *websocket.Hub
}

func NewCombatService(gameRepo *repository.GameRepository, charRepo *repository.CharactersRepository, hub *websocket.Hub) *CombatService {
	return &CombatService{gameRepo: gameRepo, charRepo: charRepo, hub: hub}
}

// combatCtx is everything one request needs, loaded once.
type combatCtx struct {
	game   *models.Game
	scene  *models.Scene
	chars  map[primitive.ObjectID]*models.Character
	userID primitive.ObjectID
	isGM   bool
}

func (s *CombatService) load(gameID string, sceneID, userID primitive.ObjectID) (*combatCtx, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	var scene *models.Scene
	for i := range game.Scenes {
		if game.Scenes[i].ID == sceneID {
			scene = &game.Scenes[i] // scene looked up inside THIS game: a foreign sceneId is a 404
		}
	}
	if scene == nil {
		return nil, ErrCombatSceneNotFound
	}
	list, err := s.charRepo.GetByGameID(gameID)
	if err != nil {
		return nil, err
	}
	chars := make(map[primitive.ObjectID]*models.Character, len(list))
	for i := range list {
		chars[list[i].ID] = &list[i]
	}
	return &combatCtx{game: game, scene: scene, chars: chars, userID: userID, isGM: game.GameMasterID == userID}, nil
}

// Get returns the viewer's masked view; nil = nothing to show.
func (s *CombatService) Get(gameID string, sceneID, userID primitive.ObjectID) (*CombatView, error) {
	ctx, err := s.load(gameID, sceneID, userID)
	if err != nil {
		return nil, err
	}
	if !ctx.isGM && PlayerSceneID(ctx.game, userID) != sceneID {
		return nil, ErrCombatForbidden
	}
	return BuildCombatView(ctx.scene.Combat, ctx.scene, ctx.chars, userID, ctx.isGM), nil
}

// ListCombatScenes lists scenes with a combat in progress (GM only — it reveals hidden combats).
func (s *CombatService) ListCombatScenes(gameID string, userID primitive.ObjectID) ([]string, error) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return nil, err
	}
	if game.GameMasterID != userID {
		return nil, ErrCombatForbidden
	}
	ids := []string{}
	for _, sc := range game.Scenes {
		if sc.Combat != nil {
			ids = append(ids, sc.ID.Hex())
		}
	}
	return ids, nil
}

type allowFunc func(ctx *combatCtx, current *models.Combat) error
type changeFunc func(ctx *combatCtx, c *models.Combat) (*models.Combat, error)

func gmOnly(ctx *combatCtx, _ *models.Combat) error {
	if !ctx.isGM {
		return ErrCombatForbidden
	}
	return nil
}

func requireCombat(c *models.Combat) error {
	if c == nil {
		return ErrCombatNotFound
	}
	return nil
}

// mutate is the single write path: load, authorize, prune a copy, apply the change, save only if
// nobody wrote in between, broadcast. Every operation below is one allow + one change.
func (s *CombatService) mutate(gameID string, sceneID, userID primitive.ObjectID, allow allowFunc, change changeFunc) error {
	ctx, err := s.load(gameID, sceneID, userID)
	if err != nil {
		return err
	}
	before := ctx.scene.Combat
	if err := allow(ctx, before); err != nil {
		return err
	}
	expected := 0
	work := combat.Clone(before)
	if work != nil {
		expected = before.Version
		combat.Prune(work, ctx.scene, ctx.chars)
	}
	after, err := change(ctx, work)
	if err != nil {
		return err
	}
	if after != nil {
		after.Version = expected + 1
	}
	if err := s.gameRepo.SaveSceneCombat(gameID, sceneID, expected, after); err != nil {
		return err
	}
	s.broadcast(ctx.game, sceneID, before, after)
	return nil
}

// playersAffected: players learn about a change only if they could see the tracker before or after.
// Changes to a combat hidden throughout go to the GM alone, so even its existence stays secret.
func playersAffected(before, after *models.Combat) bool {
	return (before != nil && before.VisibleToPlayers) || (after != nil && after.VisibleToPlayers)
}

func (s *CombatService) broadcast(game *models.Game, sceneID primitive.ObjectID, before, after *models.Combat) {
	if s.hub == nil {
		return
	}
	payload := map[string]interface{}{"sceneId": sceneID.Hex()}
	if playersAffected(before, after) {
		s.hub.BroadcastToGame(game.ID.Hex(), websocket.EventSceneCombatUpdated, payload)
		return
	}
	s.hub.BroadcastToUsers(game.ID.Hex(), websocket.EventSceneCombatUpdated, payload, []string{game.GameMasterID.Hex()})
}

func newCombat() *models.Combat {
	return &models.Combat{Round: 1, Entries: []models.CombatEntry{}, StartedAt: time.Now()}
}

func parseID(hex string) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID, ErrCombatInvalid
	}
	return id, nil
}

func cleanName(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n == "" || len([]rune(n)) > maxCombatNameLen {
		return "", ErrCombatInvalid
	}
	return n, nil
}

// buildEntry turns a request into an entry, checking the source lives on this scene. A hidden token
// starts as a hidden entry; after that the two flags are independent.
func buildEntry(scene *models.Scene, req models.CombatSourceRequest) (models.CombatEntry, error) {
	e := models.CombatEntry{ID: primitive.NewObjectID(), Kind: req.Kind, Initiative: req.Initiative, Hidden: req.Hidden}
	switch req.Kind {
	case models.CombatEntryCharacter:
		id, err := parseID(req.SourceID)
		if err != nil {
			return e, err
		}
		for _, gc := range scene.Characters {
			if gc.ID == id {
				e.SourceID, e.Hidden = id, e.Hidden || gc.Hidden
				return e, nil
			}
		}
		return e, ErrCombatInvalid
	case models.CombatEntryImage:
		id, err := parseID(req.SourceID)
		if err != nil {
			return e, err
		}
		for _, img := range scene.Images {
			if img.ID == id {
				e.SourceID, e.Hidden = id, e.Hidden || img.Hidden
				e.Name = strings.TrimSuffix(img.FileName, filepath.Ext(img.FileName))
				if req.Name != "" {
					if e.Name, err = cleanName(req.Name); err != nil {
						return e, err
					}
				}
				return e, nil
			}
		}
		return e, ErrCombatInvalid
	case models.CombatEntryManual:
		name, err := cleanName(req.Name)
		e.Name = name
		return e, err
	}
	return e, ErrCombatInvalid
}

// authorizeEndTurn: the GM, or a player who may edit the entry's character (CanEditCharacter).
// Image and manual entries belong to the GM.
func authorizeEndTurn(ctx *combatCtx, c *models.Combat, entryID primitive.ObjectID) error {
	if err := requireCombat(c); err != nil {
		return err
	}
	e, ok := combat.Find(c, entryID)
	if !ok {
		return combat.ErrEntryNotFound
	}
	if ctx.isGM {
		return nil
	}
	if e.Kind != models.CombatEntryCharacter {
		return ErrCombatForbidden
	}
	for _, gc := range ctx.scene.Characters {
		if gc.ID == e.SourceID && CanEditCharacter(ctx.chars[gc.CharacterID], ctx.userID, false) {
			return nil
		}
	}
	return ErrCombatForbidden
}

func (s *CombatService) Start(gameID string, sceneID, userID primitive.ObjectID) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if c != nil {
			return c, nil // already running: starting again is a no-op
		}
		return newCombat(), nil
	})
}

func (s *CombatService) End(gameID string, sceneID, userID primitive.ObjectID) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		return nil, requireCombat(c)
	})
}

func (s *CombatService) Update(gameID string, sceneID, userID primitive.ObjectID, req models.UpdateCombatRequest) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		if req.VisibleToPlayers != nil {
			c.VisibleToPlayers = *req.VisibleToPlayers
		}
		return c, nil
	})
}

// AddEntries starts a (hidden) combat if there is none. A token already in combat is skipped.
func (s *CombatService) AddEntries(gameID string, sceneID, userID primitive.ObjectID, req models.AddCombatEntriesRequest) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		if c == nil {
			c = newCombat()
		}
		for _, r := range req.Entries {
			e, err := buildEntry(ctx.scene, r)
			if err != nil {
				return nil, err
			}
			if e.Kind != models.CombatEntryManual && combat.HasSource(c, e.Kind, e.SourceID) {
				continue
			}
			combat.Insert(c, e)
		}
		return c, nil
	})
}

func (s *CombatService) UpdateEntry(gameID string, sceneID, userID primitive.ObjectID, entryHex string, req models.UpdateCombatEntryRequest) error {
	entryID, err := parseID(entryHex)
	if err != nil {
		return err
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		e, ok := combat.Find(c, entryID)
		if !ok {
			return nil, combat.ErrEntryNotFound
		}
		if req.Name != nil {
			if e.Kind == models.CombatEntryCharacter {
				return nil, ErrCombatInvalid // a character's name comes from its sheet
			}
			name, err := cleanName(*req.Name)
			if err != nil {
				return nil, err
			}
			e.Name = name
		}
		if req.Acted != nil {
			e.Acted = *req.Acted
		}
		if req.Hidden != nil {
			e.Hidden = *req.Hidden
		}
		// Last: SetInitiative re-slices Entries, which would leave e pointing at a stale slot.
		if req.Initiative != nil {
			if err := combat.SetInitiative(c, entryID, *req.Initiative); err != nil {
				return nil, err
			}
		}
		return c, nil
	})
}

func (s *CombatService) RemoveEntry(gameID string, sceneID, userID primitive.ObjectID, entryHex string) error {
	entryID, err := parseID(entryHex)
	if err != nil {
		return err
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		return c, combat.Remove(c, entryID)
	})
}

func (s *CombatService) Reorder(gameID string, sceneID, userID primitive.ObjectID, req models.ReorderCombatRequest) error {
	ids := make([]primitive.ObjectID, 0, len(req.EntryIDs))
	for _, h := range req.EntryIDs {
		id, err := parseID(h)
		if err != nil {
			return err
		}
		ids = append(ids, id)
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		if err := combat.Reorder(c, ids); err != nil {
			// The stored list changed (an entry was added, removed or pruned) since the client drew it.
			return nil, combat.ErrConflict
		}
		return c, nil
	})
}

func (s *CombatService) Activate(gameID string, sceneID, userID primitive.ObjectID, req models.CombatEntryRefRequest) error {
	entryID, err := parseID(req.EntryID)
	if err != nil {
		return err
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(_ *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		return c, combat.Activate(c, entryID)
	})
}

func (s *CombatService) Next(gameID string, sceneID, userID primitive.ObjectID, req models.NextTurnRequest) error {
	expected := primitive.NilObjectID
	if req.AfterEntryID != "" {
		id, err := parseID(req.AfterEntryID)
		if err != nil {
			return err
		}
		expected = id
	}
	return s.mutate(gameID, sceneID, userID, gmOnly, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		return c, combat.Next(c, expected, combatKilledFunc(ctx.scene, ctx.chars))
	})
}

func (s *CombatService) EndTurn(gameID string, sceneID, userID primitive.ObjectID, req models.CombatEntryRefRequest) error {
	entryID, err := parseID(req.EntryID)
	if err != nil {
		return err
	}
	allow := func(ctx *combatCtx, c *models.Combat) error { return authorizeEndTurn(ctx, c, entryID) }
	return s.mutate(gameID, sceneID, userID, allow, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		return c, combat.Next(c, entryID, combatKilledFunc(ctx.scene, ctx.chars))
	})
}

func (s *CombatService) EndRound(gameID string, sceneID, userID primitive.ObjectID) error {
	return s.mutate(gameID, sceneID, userID, gmOnly, func(ctx *combatCtx, c *models.Combat) (*models.Combat, error) {
		if err := requireCombat(c); err != nil {
			return nil, err
		}
		combat.EndRound(c, combatKilledFunc(ctx.scene, ctx.chars))
		return c, nil
	})
}
