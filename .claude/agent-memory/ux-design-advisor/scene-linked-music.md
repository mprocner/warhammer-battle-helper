---
name: Scene-Linked Music Design
description: Design decisions and rationale for linking music tracks/playlists to scenes, auto-triggering on player scene switch
type: project
---

## Core design decision: WHERE to configure
Scene music should be configured in **ScenesTab settings panel** (the `scenes-tab__settings` section), NOT in MusicTab and NOT in SceneSelector. Rationale: the GM's mental model when setting up a scene is additive — they configure name, grid, fog, players, and now also music as scene properties, all in one place.

## What can be linked
Support linking **both a single track OR a playlist** — same interface, same field. A scene has at most one linked music item (a `sceneMusicId` + `sceneMusicType: 'track' | 'playlist'`). Linking one replaces the previous.

## Transition behavior
- **Hard cut** when switching (no fade) — fades require precise timing coordination across WS latency and add complexity for minimal UX gain during live sessions
- When switching to a scene WITH music: stop current → start linked music immediately
- When switching to a scene WITHOUT music: **keep current music playing** — do not stop it. Silence is jarring; if the GM wants silence they stop manually.

## Trigger rule (critical GM vs player distinction)
- Music ONLY triggers on `PLAYER_SCENE_CHANGED` WS event (real assignment change), NOT when GM previews a scene via `gmViewingSceneId`. GM should be able to browse scenes silently without affecting player experience.

## Override / manual control
After scene music auto-starts, GM retains full manual control (pause, skip, volume). If GM manually changes music after scene switch, that override is treated as intentional — the next scene switch will still respect the new scene's linked music (override is ephemeral, not stored).

## Visual indicators
- `MusicNoteIcon` (from @mui/icons-material) shown on the `scene-selector__tab` button for scenes that have music linked
- In `scenes-tab__settings`, a compact "Linked music" row shows the track/playlist name with an unlink button (CloseIcon)
- In MusicTab, individual tracks and playlists show a small indicator if they are currently linked to any scene

## Empty state behavior
New scenes have no linked music. No badge on tab, no icon in settings. First-time setup prompt is NOT needed — the field in ScenesTab is sufficient discoverability.

## Data model change needed
Add to Scene struct (Go): `SceneMusicId string`, `SceneMusicType string` (`"track"` | `"playlist"` | `""`)

## i18n keys to add (en + pl)
- `scenes.linkedMusic` — "Linked music"
- `scenes.linkMusic` — "Link music to scene"
- `scenes.noMusicLinked` — "No music linked"
- `scenes.unlinkMusic` — "Unlink music"
- `scenes.musicLinked` — "Music linked" (tooltip for icon on scene tab)
