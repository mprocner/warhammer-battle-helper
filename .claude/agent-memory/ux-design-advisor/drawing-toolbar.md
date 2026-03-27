---
name: DrawingToolbar Design
description: How the floating drawing/fog toolbar works — layer tabs, tool sets, and GM vs player split
type: project
---

## Component: `DrawingToolbar.jsx`
- Floats at `zIndex: 40` inside `fight-grid-wrapper` (rendered in DndContext.jsx)
- CSS: `DrawingToolbar.css`, BEM block `drawing-toolbar`

## Layer mode tabs (GM only)
Four tabs in `drawing-toolbar__tabs`:
- Pan (PanToolIcon) → `editingLayer = null`
- Scene/Grid (ImageIcon) → `editingLayer = 'grid'`
- Fog (CloudIcon) → `editingLayer = 'fog'`
- Drawing (EditIcon) → `editingLayer = 'drawing'`

Player sees only a single toggle button (EditIcon) that switches between drawing on/off.

## Tool filtering
Each tool has `fogCompat: bool` and `fogOnly: bool` flags:
- In fog mode: show only `fogCompat: true` tools (freehand, line, rect, circle, polygon)
- In drawing mode: show all except `fogOnly: true` tools (hides polygon)
- Polygon is fog-only (used for fog reveal/cover areas)

## Controls shown per mode
- Fog mode: tool buttons + Reveal/Cover ToggleButtonGroup + brush size slider + undo + reveal all (GM) + cover all (GM)
- Drawing mode: tool buttons + color swatches + custom color picker + brush size + font size (text tool only) + undo + clear all (GM) + delete selected

## Tooltip pattern in this component
Uses inline `<span className="drawing-toolbar__tooltip">` shown via CSS hover — NOT the project's portal tooltip pattern. This is an inconsistency to be aware of when modifying this component.

## State ownership
All toolbar state lives in `GameSession.jsx` and is passed down through `DndContext` → `DrawingToolbar` as props. This is correct — state needs to be shared with `SceneViewport` for the actual drawing behavior.
