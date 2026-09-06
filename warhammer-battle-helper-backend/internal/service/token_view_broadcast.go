package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/websocket"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// token_view_broadcast.go delivers the masked CharacterTokenView LIVE to players who do not hold a
// character's card. Without it those players render a token built during their last full game GET
// and never see the GM's value changes (FEATURE-183).
//
// The whole design rests on one property of token_masking.go: buildMaskedTokenView takes no userID.
// Card-less players are ONE class receiving byte-identical payloads, so the mask is computed once
// per placement and the only per-user work is addressing — expressed by negation, see
// tokenViewExclusions.

// TokenViewEntry is one placement's payload entry. Beyond the mask it carries the three
// character-derived fields a card-less client can only learn through the placement, because it never
// receives the Character document. Mirrors the enrichment loop in enrichSceneCharacters.
type TokenViewEntry struct {
	SceneID     string                     `json:"sceneId"`
	PlacementID string                     `json:"placementId"`
	Name        string                     `json:"name"`
	Avatar      string                     `json:"avatar"`
	Killed      bool                       `json:"killed"`
	TokenView   *models.CharacterTokenView `json:"tokenView"`
}

// characterTokenAvatar is the avatar a token placement shows. Some systems (e.g. warhammer4e) keep
// it in stats.basicInfo.avatar rather than the top-level field; a card-less player only ever sees
// the placement avatar, so the fallback has to be resolved server-side or their token shows a
// placeholder. Shared by enrichSceneCharacters (read path) and the token-view broadcast.
func characterTokenAvatar(ch *models.Character) string {
	if ch == nil {
		return ""
	}
	if ch.Avatar != "" || len(ch.Stats) == 0 {
		return ch.Avatar
	}
	var statsDoc bson.M
	if bson.Unmarshal(ch.Stats, &statsDoc) != nil {
		return ""
	}
	if a, ok := statByPath(statsDoc, "basicInfo.avatar").(string); ok {
		return a
	}
	return ""
}

// buildTokenViewEntries builds the card-less payload for one character's placements. Pure: no repo,
// no hub, no clock. onlyPlacement != nil narrows to a single placement (the gear path); nil covers
// every placement of the character in every scene (the character path — PatchState only knows a
// charId, so its change radiates to all of them, each masked against its OWN gear).
//
// A placement flagged Hidden is skipped entirely: the event's mere existence would reveal a token
// the card-less viewer must not know about — the rule keepSceneCharacterForViewer enforces on read.
func buildTokenViewEntries(game *models.Game, ch *models.Character, blueprint *models.TokenDisplayConfig, onlyPlacement *primitive.ObjectID) []TokenViewEntry {
	if game == nil || ch == nil {
		return nil
	}
	avatar := characterTokenAvatar(ch)
	var out []TokenViewEntry
	for si := range game.Scenes {
		for _, gc := range game.Scenes[si].Characters {
			if gc.CharacterID != ch.ID {
				continue
			}
			if onlyPlacement != nil && gc.ID != *onlyPlacement {
				continue
			}
			if gc.Hidden {
				continue
			}
			out = append(out, TokenViewEntry{
				SceneID:     game.Scenes[si].ID.Hex(),
				PlacementID: gc.ID.Hex(),
				Name:        ch.Name,
				Avatar:      avatar,
				Killed:      ch.Killed,
				TokenView:   buildMaskedTokenView(blueprint, gc.TokenGear, ch.Stats, ch.States),
			})
		}
	}
	return out
}

// tokenViewExclusions lists the users who must NOT receive the masked view: the GM and every holder
// of this character's card. Both already get the raw TokenGear through their own broadcast; sending
// them a second, weaker copy would only invite the client to pick the wrong one. Everyone else in
// the game is card-less for this character and is exactly the masked event's audience.
func tokenViewExclusions(game *models.Game, ch *models.Character) []string {
	out := []string{game.GameMasterID.Hex()}
	for _, v := range ch.VisibleTo {
		out = append(out, v.Hex())
	}
	return out
}

// broadcastTokenViewsFrom sends the masked token view to every player who does not hold this
// character's card, using a game and character the caller has already loaded. The mask is computed
// ONCE (it does not depend on userID) and addressed by negation, so a +/- click costs no extra
// database read beyond what the caller already did.
//
// An empty entry list means every matching placement is hidden from card-less viewers — send nothing.
func (s *GameService) broadcastTokenViewsFrom(game *models.Game, ch *models.Character, onlyPlacement *primitive.ObjectID) {
	if game == nil || ch == nil {
		return
	}
	entries := buildTokenViewEntries(game, ch, s.ResolveTokenBlueprint(game), onlyPlacement)
	if len(entries) == 0 {
		return
	}
	s.hub.BroadcastExceptUsers(game.ID.Hex(), websocket.EventSceneCharacterTokenViewUpdated, map[string]interface{}{
		"views": entries,
	}, tokenViewExclusions(game, ch))
}

// BroadcastTokenViewsForCharacter is the character path: a change on the CARD (condition level,
// killed, a stat leaf) radiates to every placement of that character, in every scene. Called from
// CharacterHandler, which knows only a charId.
func (s *GameService) BroadcastTokenViewsForCharacter(gameID string, charID primitive.ObjectID) {
	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return
	}
	ch, err := s.charRepo.GetByID(charID.Hex())
	if err != nil || ch == nil {
		return
	}
	s.broadcastTokenViewsFrom(game, ch, nil)
}
