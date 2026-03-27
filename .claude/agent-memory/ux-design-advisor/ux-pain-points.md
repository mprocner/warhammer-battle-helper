---
name: Known UX Pain Points
description: UX issues identified from codebase analysis on 2026-03-27, prioritized by impact
type: project
---

## High impact
1. **No active layer indicator in the scene** — `editingLayer` controls what interaction mode is active (pan, grid, fog, drawing) but there is no persistent HUD element inside the viewport showing the current mode. Users have to look at the small DrawingToolbar tabs to know what mode they are in.
2. **WS connection status is hidden** — `isConnected` is passed to GeneralTab and ScenesTab but there is no persistent always-visible indicator. Players and GMs may not know they are disconnected until actions fail silently.
3. **Loading state is not i18n'd** — "Loading game session..." (GameSession.jsx line 669) is a hardcoded English string, not using i18next.
4. **Polish strings leak into production UI** — `DndContext.jsx` line 739 has a hardcoded Polish string ("Strefa ... jest już zajęta przez") and line 849 has "Ładowanie postaci...". These are not translated.
5. **Character tile density vs discoverability** — The character tile packs name, HP, owner, position status, and 3–4 icon buttons into a small space. On smaller monitors or with many characters, actions become cramped and hard to hit.

## Medium impact
6. **Dice controls visibility selector is a plain `<select>`** — The roll visibility selector (all / gm+roller / gm only) sits above the dice buttons as a plain dropdown with no visual weight. During a live session, accidentally rolling with wrong visibility setting is easy and has real social consequences.
7. **DrawingToolbar tooltip uses inline `<span>` not portal tooltip** — `drawing-toolbar__tooltip` class is an inline child element shown on hover via CSS, not the project's portal tooltip pattern. This means it can be clipped by the toolbar's own overflow.
8. **SceneSelector quick-create uses hardcoded "Scene N" name** — No prompt, no confirmation. Creates a scene with a generic name. GM must immediately go to ScenesTab to rename it.
9. **No empty state for the scene** — When no scene exists yet, the viewport is just blank. There is no call-to-action for the GM to create a first scene.
10. **Character details panel split starts at 50/50** — Not persisted to localStorage. Every session reset means the GM/player must re-drag the resizer.

## Lower impact
11. **`console.log` debug statements in production code** — GameSession.jsx lines 203, 204, 296, 297 log to the console including the full handleWebSocketMessage function reference and fight result data.
12. **LogWindow prop naming inconsistency** — Accepts both `messages` and `logs` props; the branching logic (`logs.length > 0 ? logs : messages`) is a code smell that confuses the data shape.
13. **No keyboard shortcut system** — The drawing toolbar, fog tools, and scene navigation are entirely mouse-dependent. During a session the GM frequently needs to switch between pan/fog/drawing — keyboard shortcuts (e.g. F for fog, D for draw, Esc to pan) would significantly reduce friction.
14. **Right panel tab labels are always shown** — The vertical tab nav shows both icon + label for every tab. This takes horizontal space from the content area. On smaller viewports it may overflow.
