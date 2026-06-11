---
name: custom-dice-roll-design
description: Layout/interaction design for "custom XdY dice roll" feature added to DiceRollControls.jsx (popup + multiplier badges + new MultiDiceRoll log entry)
metadata:
  type: project
---

Designed 2026-06-11 for `DiceRollControls.jsx` (panel width = `--panel-right-width: 420px`, ~388px usable after padding).

Key decisions:
- **Drop-down popup over sideways flyout**: for controls anchored near the left edge of a right-docked panel, a flyout risks viewport overflow. A drop-down anchored to the toggle's left edge (`position: absolute; top: 100%; left: 0`) stays in-bounds with a fixed small width (~190-220px). Use this pattern for any future "compact toggle -> small form popup" needs in this panel.
- **Local positioned div over portal for small in-panel popups**: portal tooltips ([[ui-conventions]]) are for hover tooltips that must escape clipping containers. For click-toggled popups anchored within a panel that has no `overflow: hidden`, a simple `useState(false)` + absolutely-positioned div (mirrors ScenesTab music picker) is lighter and sufficient. Reserve portals for hover tooltips specifically.
- **Multiplier badge on every preset button, not just the toggle icon**: when a "roll X dice" multiplier is armed via a popup, show `×N` badges on ALL affected action buttons (not just the toggle that set it), because the consequence happens at the point of clicking those buttons — users shouldn't need to remember an armed state from a different UI element.
- **New multi-roll log entries need single-column layout**, not the icon+content two-column layout `SimpleDiceRoll.jsx` uses — a row of N dice tokens (42px wax-seal tokens, `flex-wrap`) doesn't fit a fixed icon slot. Header line (notation + username + timestamp) on top, token row + sum below.
- **Hard cap on multi-roll dice count (suggested 20)**: not just a layout guard — large rolls flood the *shared* log for all players. Cap protects collective log readability, not just individual rendering.
- **Validation defaults**: X empty -> treat as 1 (no badge). Y empty -> disable Roll, don't guess a default size. X=0 -> clamp to 1 on blur (0 dice is more confusing than helpful). Persist last-used X/Y values in popup across opens to support "set multiplier once, click presets repeatedly" workflow.

i18n key added to vocabulary: `dice.dieNotation` = "D" (en) / "K" (pl) — the localized die-notation letter, used to compose headers like "3D6"/"3K6".
