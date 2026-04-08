---
name: DnD5e Sheet Layout Redesign
description: Decision to redesign the 3-column sheet to top-band + 2-column layout, prioritizing char info + abilities + skills
type: project
---

Original layout: 3-column grid (210px abilities | 270px saves+skills | 1fr combat). User disliked it — felt character info, attributes, and skills were buried.

Redesign decision: Top horizontal band (CharacterInfo + AbilityScores prominently) + 2-column lower body (SavingThrows+Skills left | CombatStats+rest right).

**Why:** User mental model is: "who am I, what can I do, then how do I fight." The 3-column layout treated all sections as equal weight.

**How to apply:** When suggesting future sheet layout changes, default to the top-band model. AbilityScores should be horizontal (3+3) when displayed in the top band to avoid vertical stacking.

Key measurements:
- Popup width: 1100px (unchanged)
- Top band: ~260px tall, full width, split CharacterInfo (avatar+fields) left / AbilityScores (6 boxes horizontal) right
- Bottom: 2 columns, left ~320px (SavingThrows + Skills), right 1fr (Combat + rest)
- AbilityScores in top band: 6 boxes in a row (grid 3+3 or single row), each ~120px wide
- Skills section: scrollable at ~340px max-height OR 2-column internal grid — 18 rows at ~26px each = ~468px
