---
name: custom-system-data-model
description: Conventions for the custom game system's Stats model (Go backend) and matching frontend `edited` state shape — relevant when adding new per-field-type data to character sheets.
metadata:
  type: project
---

The custom game system's `Stats` struct (`warhammer-battle-helper-backend/internal/systems/custom/character.go`)
keeps a **separate map per field type**: `Attributes map[string]AttrValue`, `Skills map[string]int`,
`Numbers map[string]int`, `Progress map[string]ProgressValue`, `Texts`, `CustomSkillNodes`, `FavoriteSkills`.

`AttrValue{Base, Advances, Current int}` is the canonical shape for any "base + advances = current"
mechanic. `Current` is always recomputed server-side in `ComputeDerived` (plugin.go), never trusted from client.

**How to apply**: when adding an "advances" feature to a new field type (e.g. skill_table), do NOT make
the existing map polymorphic (e.g. `Skills map[string]interface{}`). Instead add a new sibling map of
type `map[string]AttrValue` (e.g. `SkillsAdvanced`, `omitempty`), keyed by the same key scheme as the
simple map. Frontend mirrors this with a sibling key in `edited` state (e.g. `edited.skillsAdvanced`).
Rollers must check the advanced map first via a helper like `skillValue()` so formula evaluation
(`case "skill":` in roller.go, appears in both `evalFormula` and `evalFormulaDicePool`) picks up `.Current`.

This keeps each map homogeneous/typed and matches the project's "no backward compat needed" stance —
switching a field's hasAdvances flag on/off just changes which map is read/written; old data in the
other map is harmlessly orphaned (omitempty).

See [[skill-table-advances-design]] for the concrete feature this was derived for.
