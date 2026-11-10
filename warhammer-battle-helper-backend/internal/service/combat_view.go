package service

import (
	"battle-helper/internal/combat"
	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CombatEntryView is one participant as a given viewer may see it.
type CombatEntryView struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	SourceID   string `json:"sourceId,omitempty"`
	Name       string `json:"name"`
	Avatar     string `json:"avatar,omitempty"`
	Initiative *int   `json:"initiative,omitempty"` // GM only
	Acted      bool   `json:"acted"`
	Hidden     bool   `json:"hidden,omitempty"` // GM only (players never receive hidden entries)
	Killed     bool   `json:"killed,omitempty"`
	CanEndTurn bool   `json:"canEndTurn,omitempty"`
}

type CombatView struct {
	Version          int               `json:"version"`
	Round            int               `json:"round"`
	ActiveID         string            `json:"activeId,omitempty"`
	VisibleToPlayers bool              `json:"visibleToPlayers"`
	Entries          []CombatEntryView `json:"entries"`
}

// PlayerSceneID mirrors the frontend's displayScene rule for a player: the assigned scene, else the
// default scene, else the first one. A player sees only this scene's combat.
func PlayerSceneID(game *models.Game, userID primitive.ObjectID) primitive.ObjectID {
	for _, s := range game.Scenes {
		for _, p := range s.AssignedPlayers {
			if p == userID {
				return s.ID
			}
		}
	}
	for _, s := range game.Scenes {
		if s.IsDefault {
			return s.ID
		}
	}
	if len(game.Scenes) > 0 {
		return game.Scenes[0].ID
	}
	return primitive.NilObjectID
}

// combatKilledFunc reports "dead" from the token's own state: Character.Killed for a character
// entry, SceneImage.Killed for an image. The tracker has no dead state of its own.
func combatKilledFunc(scene *models.Scene, chars map[primitive.ObjectID]*models.Character) func(models.CombatEntry) bool {
	placementChar := combat.PlacementCharacters(scene)
	imageKilled := map[primitive.ObjectID]bool{}
	for _, img := range scene.Images {
		imageKilled[img.ID] = img.Killed
	}
	return func(e models.CombatEntry) bool {
		switch e.Kind {
		case models.CombatEntryCharacter, models.CombatEntryGameCharacter:
			id, _ := combat.EntryCharacterID(e, placementChar)
			ch := chars[id]
			return ch != nil && ch.Killed
		case models.CombatEntryImage:
			return imageKilled[e.SourceID]
		}
		return false
	}
}

// BuildCombatView is the only way combat data leaves the server. nil = the viewer sees no combat
// (none exists, or the whole tracker is hidden from a player). For players it drops hidden entries
// and initiative values, and while a hidden entry acts it reports the last visible active entry.
// For players CanEndTurn is set only on the entry that is really active (never the substitute).
func BuildCombatView(c *models.Combat, scene *models.Scene, chars map[primitive.ObjectID]*models.Character, viewerID primitive.ObjectID, isGM bool) *CombatView {
	if c == nil {
		return nil
	}
	cp := combat.Clone(c)
	combat.Prune(cp, scene, chars)
	if !isGM && !cp.VisibleToPlayers {
		return nil
	}

	placementChar := combat.PlacementCharacters(scene)
	images := map[primitive.ObjectID]models.SceneImage{}
	for _, img := range scene.Images {
		images[img.ID] = img
	}

	view := &CombatView{Version: cp.Version, Round: cp.Round, VisibleToPlayers: cp.VisibleToPlayers, Entries: []CombatEntryView{}}
	for _, e := range cp.Entries {
		if !isGM && e.Hidden {
			continue
		}
		ev := CombatEntryView{ID: e.ID.Hex(), Kind: e.Kind, Name: e.Name, Acted: e.Acted, CanEndTurn: isGM}
		if !e.SourceID.IsZero() {
			ev.SourceID = e.SourceID.Hex()
		}
		switch e.Kind {
		case models.CombatEntryCharacter, models.CombatEntryGameCharacter:
			// Prune above guarantees the character exists.
			id, _ := combat.EntryCharacterID(e, placementChar)
			ch := chars[id]
			ev.Name = ch.Name
			ev.Avatar = characterTokenAvatar(ch)
			ev.Killed = ch.Killed
			// A player ends only the turn that is really running: while a hidden entry acts, the
			// substituted active entry below must not offer a stale "End turn".
			ev.CanEndTurn = isGM || (e.ID == cp.ActiveID && CanEditCharacter(ch, viewerID, false))
		case models.CombatEntryImage:
			img := images[e.SourceID]
			ev.Avatar = img.FileURL
			ev.Killed = img.Killed
		}
		if isGM {
			v := e.Initiative
			ev.Initiative = &v
			ev.Hidden = e.Hidden
		}
		view.Entries = append(view.Entries, ev)
	}

	active := cp.ActiveID
	if !isGM {
		if e, ok := combat.Find(cp, active); ok && e.Hidden {
			active = cp.LastVisibleActiveID
			if last, ok := combat.Find(cp, active); !ok || last.Hidden {
				active = primitive.NilObjectID
			}
		}
	}
	if !active.IsZero() {
		view.ActiveID = active.Hex()
	}
	return view
}
