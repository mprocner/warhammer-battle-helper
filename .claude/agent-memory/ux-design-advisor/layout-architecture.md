---
name: Layout Architecture
description: The overall GameSession layout structure — three-column with collapsible panels
type: project
---

## Top-level layout (GameSession.jsx)
```
[ Left Sidebar (collapsible) ] [ Scene Viewport (flex-grow) ] [ Right Panel (collapsible) ]
```
Both panels have toggle buttons (`PanelToggle`) that slide them off-screen via `left-sidebar--hidden` / `right-panel--hidden` modifiers.

## Left Sidebar (DndContext.jsx)
- `left-sidebar-wrapper` → `left-sidebar`
- Header: `panel-header` with title
- Resizable split via drag handle (`sidebar-resizer`): top half = `CharacterDetailsPanel`, bottom half = character list
- Split starts at 50/50, clamped to 15–85%
- Character list: PC section + NPC section, each collapsible with `▶/▼` toggle
- Character tiles: `character-tile` with `selected` and `on-grid` modifiers
- Tile actions: clone-btn, visibility-btn, delete-character-btn, grid-toggle-btn (all icon buttons with portal tooltips)
- Scene selector bar rendered above viewport (GM-only): `SceneSelector` component with tab-per-scene + player assignment popover

## Center (SceneViewport + FightArea overlay)
- `SceneViewport` handles zoom (wheel), pan (middle-click drag or null-layer drag), scene fit on load
- Layer system: SceneLayer (background images) → FogLayer (canvas, destination-out) → DrawingLayer (canvas, source-over) → character tokens overlay
- `DrawingToolbar` floats inside `fight-grid-wrapper` at zIndex 40
- `OnlineUsersBar` lives inside DndContext, near the scene area
- `PointerPing` components rendered over scene for pointer ping markers

## Right Panel (RightPanel.jsx)
- Vertical tab nav on LEFT side of panel, content to the right
- Tabs (icon + label): Chat, [Scenes GM-only], Handouts, [Files GM-only], [Music GM-only], [Players GM-only], General
- `LogWindow` is the chat tab content (auto-scroll, max 100 messages)
- `DiceRollControls` is ALWAYS visible at the bottom of right panel (persists across tab switches)
- `HandoutsTab` and `MusicTab` are always mounted (display:none when inactive) to preserve state
- Connection indicator is embedded in GeneralTab, not always visible

## Key state in GameSession.jsx
- `editingLayer`: null | 'grid' | 'fog' | 'drawing' — controls DrawingToolbar mode and scene interaction
- `gmViewingSceneId`: GM's selected scene (players auto-assigned)
- `displayScene`: computed from role + assignment
- `leftPanelHidden` / `rightPanelHidden`: panel collapse state
- `pointerPings`: array of {id, x, y, sceneId} — cleared by timer in PointerPing
- All drawing/fog state: `activeTool`, `brushSize`, `drawingColor`, `drawingFontSize`
