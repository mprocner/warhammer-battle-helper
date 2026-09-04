# FEATURE-179 — Locked slot config applies to newly added tokens

## Problem

Reproduction:

1. GM adds an ImageToken to a scene.
2. Sets a ring slot to a condition icon.
3. Clicks the padlock — "set for all tokens".
4. Every existing token on the scene picks the slot up. Correct.
5. GM adds a **new** token — it has no such slot.

Root cause: the padlock is a one-shot fan-out, not a stored rule.
`GameService.ApplyImageTokenSlot` (`GameService.go:2352`) loops over `scene.Images` and writes the
config into every existing image; nothing is persisted above the image level.
`AddImageToScene` (`GameService.go:1791`) builds a `SceneImage` with no `TokenOverlay` — the code
comment at `:1826` even states it is always nil. A new token has nowhere to read the config from.

## Decision

The padlock becomes a **persistent, game-wide rule**: "ring position *i* always carries this slot".
It applies to every tokens-layer image in every scene of the game — present and future.

Game-wide rather than scene-wide because the rule follows the GM's prep, not the map: goblins get an
armour-points slot on scene 1, and the ork added later on scene 2 must already have that slot, with
only its value left to fill in.

Config stays duplicated on each token (a template entry is the seed, not the live source of truth).
The alternative — the template being the only home of the config, with tokens holding just values —
was rejected: it rewrites masking, the slot-id PATCH path and the frontend render for a divergence
that is already handled in one place (`ImageTokenConfigPanel.jsx:118-127` re-applies on edit).

## Scope

In:

- Locked **ring slots** on tokens-layer scene images.
- Seeding on image add and on a layer change to `tokens`.
- Fan-out widened from one scene to the whole game.

Out:

- **HP bars** (`ImageTokenOverlay.HPBars`) — they have no padlock at all; giving them one is a
  separate feature.
- **Character tokens** (`GameCharacter.TokenGear`) — a different mechanism.
- `DuplicateSceneImage` — it already copies the whole overlay including live values, which is
  exactly the intended "set a value, then duplicate" flow. Unchanged.

## Model

New field on `Game` (`models/Game.go`):

```go
// TokenSlotTemplate is the game-wide locked-position rule: index = ring position (0..7),
// nil = that position is not locked. Every tokens-layer image in every scene seeds its slots
// from it. Entries carry config only — ID/Level/Number are per-token, generated on seed.
TokenSlotTemplate []*ImageTokenSlot `bson:"tokenSlotTemplate,omitempty" json:"tokenSlotTemplate,omitempty"`
```

Length is 0 or 8, never in between — normalised on write, the way `ApplyImageTokenSlot` already pads
a token's slots to eight.

No migration. A game with no `tokenSlotTemplate` decodes to nil, the seed returns nil, and behaviour
is what it is today until the GM clicks the padlock once.

## Seeding

One function in `service`, next to `MaskImageTokenForPlayer`:

```go
// SeedOverlayFromTemplate returns the overlay a fresh tokens-layer image starts with: one slot
// per ring position, config copied from the game template, a fresh id and a zeroed live value.
// nil when no position is locked — a token under no rule keeps no overlay at all.
func SeedOverlayFromTemplate(tpl []*models.ImageTokenSlot) *models.ImageTokenOverlay
```

Copies `Type` / `Icon` / `ConditionKey` / `ConditionLabel` / `NumberLabel` / `Hidden`, sets
`Locked = true`, generates a fresh `ID`, zeroes `Level` and `Number`. A position with no rule becomes
`{ID: <fresh>, Type: "empty"}`. No HP bars.

### Where it is called

**Add** — `AddImageToScene`:

```go
if req.Layer == "tokens" {
    image.TokenOverlay = SeedOverlayFromTemplate(game.TokenSlotTemplate)
}
```

**Layer promotion** — `UpdateSceneImage`, before the repository write:

```go
if req.Layer != nil && *req.Layer == "tokens" && current != nil && current.TokenOverlay == nil {
    req.TokenOverlay = SeedOverlayFromTemplate(game.TokenSlotTemplate)
}
```

An image can be added on any layer (`FilesTab.jsx:86` — the GM picks it) and moved between layers
later (`SceneImage.jsx:352`). Without the second call site, a background image promoted to `tokens`
reproduces the original symptom by another route.

The overlay is injected into `req` rather than written separately, so every existing broadcast branch
below keeps working untouched: `applySceneImageUpdate` sees the overlay, the `SceneImageAddForPlayers`
branch masks via `req.TokenOverlay` (`:2047`), and the `if req.TokenOverlay != nil` tail (`:2091`)
splits full-to-GM / masked-to-players.

## Writes to the template

All of them live in `ApplyImageTokenSlot`, which gets two changes:

1. Persist the rule — `tpl[position] = req.Slot` when `Locked` is true, `nil` when false; one `$set`.
2. The fan-out loops over `game.Scenes` × `scene.Images`, not one scene.
   `broadcastImageTokenUpdated` already takes `sceneID` as a parameter, so the loop passes the
   current scene's id, and `PlayerCanSeeSceneImage` gets that scene's `GridWidth`/`GridHeight`.

| Action | Template | Tokens (all scenes) |
|---|---|---|
| Lock position *i* | `tpl[i] = config` | config applied, `Locked = true`, `Level`/`Number` reset to 0 |
| Unlock position *i* | `tpl[i] = nil` | `Locked = false`; config and values kept |
| Edit a locked slot | `tpl[i] = new config` | same as lock |

The third row needs no new code: after editing a locked slot the panel already calls
`applyImageTokenSlot(..., locked: true)` (`ImageTokenConfigPanel.jsx:118-127`), which lands in the
same service method. Handler, API client and route are unchanged — `ApplyImageTokenSlotRequest`
already carries everything.

Repository: `UpdateGameTokenSlotTemplate(gameID, tpl)` — a flat `$set` on the game document, no
`arrayFilters`.

## Frontend

Four i18n strings only, `en` + `pl`: `imageToken.shareAll`, `unshareAll`, `shareAllConfirm`,
`unshareAllConfirm` change "on the scene" to "in the whole game". No component changes.

The wording matters: the fan-out resets `Level`/`Number`, so editing a locked slot on scene 2 clears
the armour values of every goblin on scene 1 — a scene the GM is not looking at. The reset is already
today's padlock behaviour; only its reach grows, and the confirm dialog has to say so.

## Security

A seeded slot can carry `Hidden = true`. The comment at `GameService.go:1826-1829` claiming a
freshly created image never has an overlay to mask stops being true, so the player-facing broadcast
in `AddImageToScene` must go through `MaskImageTokenForPlayer` and the comment must be rewritten.
Without that, adding a token would leak a hidden slot's definition to players.

## Tests

`internal/service/token_slot_template_test.go` — pure functions, no Mongo (pattern:
`scene_image_bounds_test.go`):

- `SeedOverlayFromTemplate`: empty template → nil; partial template → 8 slots, unlocked positions
  are `empty`.
- Fresh unique `ID` per slot; `Level`/`Number` zeroed even when the template entry carries values.
- `Hidden` propagates from the template, and `MaskImageTokenForPlayer` on the seeded overlay blanks
  that slot — the regression test for the `AddImageToScene` leak above.

Manual check on the local docker stack: scene 1 goblin → padlock → a new token on scene 2 carries the
slot; a `background` image promoted to `tokens` carries it too.
