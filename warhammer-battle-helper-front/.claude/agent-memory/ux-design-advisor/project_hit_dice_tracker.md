---
name: Hit Dice Tracker Design Decision
description: Decision to use pips-as-visual + explicit -/+ buttons as primary interaction for Hit Dice in CombatStatsSection
type: project
---

The original pip-only tracker (click pip to toggle all to its right) was found unintuitive by the user. Recommendation made: hybrid approach — pips as visual-only read state + dedicated `-` and `+` buttons as the sole interaction mechanism. Pips become display-only.

**Why:** Most common action is "use 1 die during short rest" — that's a single decrement. The existing pip toggle logic (clicking a pip sets all pips to its right) is non-obvious. Buttons match the HP sidebar interaction pattern already in the app. Pips still add value as at-a-glance state overview, especially at low levels.

**How to apply:** In CombatStatsSection.jsx, the `.dnd-hit-dice-box__pip` buttons should NOT have onClick. Add a two-button row (RemoveCircleOutline / AddCircleOutline icons) below the pip display. For levels 13+, switch from pips to a compact `X/Y` display only (no row of 13+ pips).

Key threshold: show pips for levels 1-12 (max 12 pips in ~3 rows of 4 fits ~120px box). At level 13+, drop pips entirely — just show the number display + buttons.

i18n keys needed: `dnd.hitDiceUse` and `dnd.hitDiceRestore` already exist. May need `dnd.hitDiceAvailable` for aria-label.
