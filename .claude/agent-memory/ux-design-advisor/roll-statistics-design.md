---
name: Roll Statistics Design
description: Design decisions for dice roll statistics feature — in-session GeneralTab panel and cross-game settings page section
type: project
---

## Two surfaces: GeneralTab (session-scoped) + SettingsPage (account-scoped)

**GeneralTab**: Shows statistics only for THIS game session. Collapsed by default (progressive disclosure). Shows stats for ALL visible participants (not just self), grouped by player. GM and players see same data — no privilege split needed here. Data source: derived from existing `logs` array already available in GameSession state.

**SettingsPage**: Shows lifetime statistics across all games. New `RollStatisticsForm` component added to SECTIONS array in SettingsSidebar. Data requires a new backend endpoint. Granularity: per die type (d4/d6/d8/d10/d12/d20/d100), with game system sub-grouping only as secondary filter (not primary).

## Key design decision: no damage dice in primary stats

Damage dice (1d6 from formulas like `2d6+3`) should be shown separately from skill check dice. Warhammer4e skill checks are always d100. CoC7e is also d100 for skills, d6 for damage. Primary display = skill check dice (d100, d20). Damage dice = secondary section, collapsed by default. Rationale: mixing d100 skill checks with 1d6 damage dice produces meaningless averages.

## Data shape needed from backend

For GeneralTab (derived client-side from logs):
- Filter `logs` array for entries where `msg.data.rollType` exists + `msg.data.roll` is a number
- Group by `data.sides` (from SimpleDiceRoll) or infer from roll type (d100 for skill/weapon rolls)
- Per die type: count, average, min count (result === 1), max count (result === sides), success rate (where applicable)

For SettingsPage (new endpoint needed):
- `GET /users/me/roll-stats` → `{ byDie: { d100: { count, avg, min1s, max100s, successRate }, d20: {...}, ... } }`

## What NOT to show (deliberate omissions)
- Streaks / luck tracking: too complex, high noise, confusing during live session
- Player comparison leaderboard: creates social tension during play, not valuable
- Per-skill breakdown: belongs in character sheet, not a general stats panel
- Trend charts: overkill for a panel that competes for space with Game Info and Volume controls

## Success rate display
- For d100 (Warhammer/CoC skill checks): show success rate as `{successes}/{total}` with a bar
- For damage dice: show average only, no success rate concept
- Success is determined by `data.outcome !== 'failure' && outcome !== 'fumble'` (already in SkillRoll.jsx)

**Why:** Success rate is the most meaningful stat for skill check dice in both systems. Average roll alone is misleading — rolling 45 on d100 with target 50 is a success, but rolling 45 with target 30 is a failure.

**How to apply:** When designing stat cards for d100, always show `{successes}/{total} (X%)` as the primary metric, with average as secondary. For damage dice (d6, d8, d10), show average as primary.

## Redesign (2026-04-09) — Histogram + Crit/Fumble Stamp system

**Tabs per die type:** Single `<DiceTabStrip>` with pill-shaped tabs. One tab per die type present. Tab label = "d100", "d20" etc. If only one die type, no tabs rendered — content directly.

**Histogram (pure CSS, 10 buckets for d100):** Vertical bars in a flex row. Each bar is a `<div>` with `height` set inline as `calc(Xpx * ratio)` — max height 48px (compact) / 72px (settings). Bucket 1 and 10 get `.die-histogram__bar--crit` (gold border) and `.die-histogram__bar--fumble` (red/purple border). Base color: `rgba(201, 166, 107, 0.35)`, bucket fill: `#c9a66b`. Generic dice: all 6 buckets equal styling (no crit/fumble distinction).

**Crit/Fumble stamps:** Two circular "seal" elements flanking the histogram. Reuse wax-seal-token visual language at 36px (compact) / 52px (settings). Gold radial gradient for crits (mirrors `--crit-success` token). Purple radial gradient for fumbles (mirrors `--crit-failure` token). Count number centered in the seal. The count IS the visual — no surrounding text label needed in compact mode (portal tooltip for context).

**Layout difference: compact vs settings:**
- Compact (280px): stacked — die meta row → histogram → seal row below
- Settings: two-column — left = histogram + meta, right = seal pair side by side

**What stays the same:** success rate bar, total count, average, BEM class prefix pattern, useTranslation, refresh button.

**New i18n keys needed:**
- `stats.bucket` (for histogram axis label tooltip: "Bucket {{from}}-{{to}}")
- `stats.critZone` ("Critical zone (1-10)")
- `stats.fumbleZone` ("Fumble zone (91-100)")
- `stats.outcomeBreakdown` ("Outcome breakdown")
- `stats.critCount` (rename from `stats.critSuccesses` — shorter)
- `stats.fumbleCount` (rename from `stats.fumbles` — shorter)
- `stats.noRollsForDie` ("No rolls for this die type yet")
