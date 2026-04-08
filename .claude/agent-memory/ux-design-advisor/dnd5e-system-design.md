---
name: D&D 5e System Design Decisions
description: Layout, interaction, and component decisions for D&D 5e character sheet and roll log in warhammer-battle-helper
type: project
---

D&D 5e is the third game system added to the plugin/registry architecture alongside Warhammer4e and CoC7e.

## Character Sheet Layout Decision
Two-column layout matching Warhammer4e's `two-page-layout` pattern (`.dnd-sheet-layout` with `.dnd-sheet__left` + `.dnd-sheet__right`). NOT tabbed — tabbed navigation adds cognitive cost during live play. Three-tab structure (Stats / Combat / Traits) was rejected in favor of a dense two-column scrollable layout.

Left column: CharacterInfoSection, AbilityScoresSection, SavingThrowsSection, DeathSavesSection, CombatStatsSection, AttacksSection
Right column: SkillsSection, FeaturesSection, SpellSlotsSection (conditional), EquipmentSection, NotesSection

## Ability Score Display
Classic D&D box: large modifier on top (e.g. +3), small score below (e.g. 16). Modifier is primary because that is what players reference during play. Score is editable inline; modifier is derived (read-only). Click on modifier triggers roll (d20 + ability mod). BEM: `.dnd-ability-score`, `.dnd-ability-score__mod`, `.dnd-ability-score__value`, `.dnd-ability-score__label`.

## Skills Layout
18 skills split into two columns (9 each, sorted by ability grouping: STR/DEX/CON/INT/WIS/CHA). Each row: proficiency dot (click to toggle) + expertise dot + skill name (clickable to roll) + total value (read-only). Proficiency indicator uses a filled/empty circle SVG via CSS, not an <input type="checkbox"> to match the dark theme. BEM: `.dnd-skill-row`, `.dnd-skill-row__prof-dot`, `.dnd-skill-row__name`, `.dnd-skill-row__value`.

## Roll Interaction Pattern
Reuses Warhammer4e ModifierSelectionModal pattern on click. D&D adds a second step: advantage/disadvantage selection BEFORE the modifier modal. A small 3-button inline popup appears at cursor: [Disadvantage | Normal | Advantage]. This replaces the modifier modal step 1. After selecting advantage mode, the modifier (+/- flat bonus) modal appears second. This two-step flow mirrors how D&D 5e actually works.

Alternative rejected: A single combined modal with advantage toggle + modifier spinner. Too many controls for a live-play interaction.

## Attack Roll Log Entry
One combined entry per attack (hit + damage together, not two separate log items). Reasoning: two separate entries would visually fragment the attack event and create scroll noise in the log window. Damage is shown conditionally (only on hit) below the hit result, just like Warhammer4e's WeaponRoll.jsx pattern. Critical hit (nat 20) shows doubled damage dice prominently.

## Advantage/Disadvantage in Log
When rolled with advantage or disadvantage, show both d20 values inline like CoC's allRolls pattern — both dice displayed, the active one bold/underlined. The inactive die is dimmed. Token still shows the final result.

## WaxSealToken reuse
D&D roll log components reuse WaxSealToken. Mapping: crit hit (nat 20) = isCritSuccess, critical miss (nat 1) = isCritFailure, hit = isSuccess, miss = not isSuccess. The token shows the d20 roll value (not the total) for immediate visual recognition.

**Why:** The token is a quick-scan element — players scan the log for red/green circles. Showing the raw d20 number inside the token matches CoC's pattern and gives instant information.

**How to apply:** Always pass the d20 roll as the `symbol` prop to WaxSealToken for D&D rolls. Show the full formula (roll + mod = total) in the description line.
