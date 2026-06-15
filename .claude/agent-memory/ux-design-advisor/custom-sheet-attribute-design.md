---
name: custom-sheet-attribute-design
description: Visual redesign of the attribute field (base/advances/total/roll) on the custom-system character sheet
metadata:
  type: project
---

Redesigned `.custom-sheet__field--attribute` (CustomSheetBody.jsx, `case 'attr'`, ~line 293) to fix lack of visual hierarchy between base/advances/total.

## Decision
"Capsule with embedded modifier" concept — one joined-looking control per attribute:
- **Total** (mode with `hasAdvances`) or **Base** (mode without advances) is the "hero" element: bold, larger font (~1.05rem), background `#f4e8d8`, border `1.5px solid #c9975b` (gold accent, NOT the standard `#c4a882` input border), inset shadow to read as an engraved plate, `cursor: default`.
- **Base input** (when advances exist) shrinks to ~2.2em, lighter border `#d9c4a0` — secondary/recedes.
- **Advances** becomes a small chip: no full border, just `border-bottom: 1px dashed #c4a882`, smaller font (0.75rem), static `+` sign as a sibling span (CSS `::before` doesn't work on `<input>`).
- Segments sit in a tight flex row (`gap: 2px`), only outer corners rounded — reads as one joined pill, not 2-4 separate boxes. This is what unifies the with/without-advances modes: mode B is just the joined control collapsed to one (hero) segment.
- Drop visible sublabels ("Bazowa"/"Rozwinięcie"/"∑") entirely — replace with `aria-label`/`title` + portal tooltip on hover.

## Narrow column fallback (6-col grid, ~70-90px cells)
Use `container-type: inline-size` + container query (or per-`--N-col` class since col count is known at render): below ~90px, wrap to two rows — Total takes full width on top (`order: 1`, `flex: 1 1 100%`), base+advances shrink (`transform: scale(0.85)`) and wrap below as secondary annotation. Total always wins visual priority regardless of density.

## Rejected alternatives
- Always-stacked "D&D ability score box" style (big total over small base) — too tall for dense 6-col custom sheets as the *default*; only used as the narrow-column fallback.
- WaxSealToken styling for Total — reserved for roll *results* in the log; reusing for static derived stats would blur "this just happened" vs "this is your current stat".

## Files
- `/Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (lines 293-358)
- `/Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-front/src/style.css` (~7684-8101, replace `.custom-sheet__advances-*` rules and `.custom-sheet__field--number-advances`)
- New i18n keys needed: `customSheet.baseValue`, `customSheet.advances`, `customSheet.total` (en + pl)
