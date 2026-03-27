---
name: GM vs Player UI Distinctions
description: What UI surfaces are GM-only vs player-visible, and the design intent behind each split
type: project
---

## GM-only surfaces
- `SceneSelector` bar (tab per scene + player assignment popover + quick create)
- Right panel tabs: Scenes, Files, Music, Players
- DrawingToolbar: fog layer tab, "reveal all" / "cover all" fog actions, clear-all drawing button
- Character tile actions: clone button, visibility button (manage who sees this character)
- Character visibility modal (`CharacterVisibilityModal`)
- Clone character modal (`CloneCharacterModal`)
- Fog layer editing: `editingLayer === 'fog'` only accessible via GM tab in DrawingToolbar

## Player surfaces
- DrawingToolbar: single toggle button (drawing only, no fog/grid/scene layer tabs)
- Character list: only own characters are selectable; GM characters not owned by player are not selectable
- Right panel: Chat, Handouts, General only
- Scene: whatever the GM has assigned them to (`assignedPlayers` array on Scene)
- Online users bar: visible to all

## Design intent
- Players need focus and simplicity — they manage one character at a time
- GM needs overview and control — multi-scene management, fog, file/music management
- `isGM` derived from JWT: `gameState.gameMasterId === userId`
- Scene assignment: GM pushes players to scenes; players cannot choose their scene
