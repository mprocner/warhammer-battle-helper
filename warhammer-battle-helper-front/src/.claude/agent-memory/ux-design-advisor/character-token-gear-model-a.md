---
name: character-token-gear-model-a
description: Approved design (Model A) for splitting character token config into per-system Blueprint vs per-token Gear popup; key reuse-of-existing-icon-language decisions.
metadata:
  type: project
---

Approved direction (2026-07-22): character token configuration splits into two layers, modeled on
GM prep-vs-play workflow:

1. **Blueprint** (per game-system, unchanged location): ring-slot structure (which of 8 slots exist,
   what they bind to), HP bar definitions, squares, and DEFAULT player-visibility per element. For
   custom systems this is `TokenDisplayBuilder` inside `TemplateBuilder` (components/creator/), next
   to `DiceConfigBuilder` — already correct, no change needed. For hardcoded systems (warhammer4e,
   coc7e) the blueprint is the existing per-user singleton reached via `POST /systems/:system/tokenConfig`
   + `/publish` — today opened from a button in `GeneralTab.jsx` (`openTokenConfig`/`closeTokenConfig`).
   That GeneralTab button and its publish-on-close flow are being REMOVED; the only remaining entry
   point becomes an "Edit blueprint" shortcut inside the new Gear popup (see below), which still calls
   the same tokenConfig/publish endpoints under the hood — just relocated, not replaced.

2. **Gear** (NEW, per character token on the map, GM only): a popup analogous to
   `ImageTokenConfigPanel.jsx`, opened from a new gear (Settings icon) button on the character token's
   ring, LEFT equator (9 o'clock) — mirrors where `ImageTokenOverlay` already places its gear button,
   opposite the skull/kill-toggle. Lets the GM override, per token: HP bar values/binding, per-slot and
   per-square player visibility, and manual values. Structure changes should still be rare/blueprint-side;
   gear is about visibility + per-token values.

**CORRECTED 2026-07-22 (same day, user override of my first draft) — no lock icon, no detach at all.**
The user explicitly rejected the ImageTokenConfigPanel lock/unlock (shared-vs-detached) metaphor for
this feature. Final rule: **blueprint structure is read-only from the Gear popup, period** — there is
no "detach this slot from the blueprint" action anywhere. The only two things Gear can do to a
blueprint-inherited bar/slot/square are (a) toggle its per-token player visibility (eye, unchanged
meaning) and (b) edit its live manual value if the slot's blueprint-defined type is `number` (the
already-existing manual-counter type) — nothing else is editable on an inherited element.

Instead there are two structurally different categories, and the fix for "how do you tell them apart"
is **explicit grouping into two labeled subsections**, not a badge/lock on a shared row template:
- **"From blueprint"** subsection: rows/slots carry a small non-interactive pill badge (icon:
  `DesignServicesOutlined`, muted `#a89272`, portal tooltip "Defined in blueprint — edit structure
  there") — deliberately NOT clickable, no confirm dialog, nothing to detach.
- **"Added on this token"** subsection: rows/slots are fully editable here (bar: label/color/
  from-card-checkbox/current-max; slot: full `TokenSlotConfigModal` incl. type) and carry a delete
  (trash) icon instead of the pill — removing one is a pure local delete, no confirm needed (mirrors
  `ImageTokenConfigPanel.removeBar`, no dialog there either).
- Applies to **bars and ring slots only**. Squares can NEVER be added per-token — only inherited
  squares exist, editable for visibility/manual-value exactly like an inherited bar/slot; there is no
  "+ add square" affordance in Gear (square set is 100% blueprint-owned).
- Combined caps (blueprint + added together): bars ≤ 4 total, ring slots ≤ 8 total (the fixed 8 ring
  positions already double as the affordance for "add slot" — clicking an empty position opens
  `TokenSlotConfigModal` to create an added slot there; once all 8 positions are filled by blueprint
  and/or additions, no more can be added — no separate "+ Add slot" button needed, unlike bars which
  do get an explicit "+ Add bar" button since they're a plain vertical list, not fixed positions).
- Gold accent (`border: 2px solid #c9975b` / left accent bar) marks "added on this token" rows/slots;
  standard cream/`#c4a882` border marks inherited ones. This color pairing is reused from the accent
  color already used for card sections, not a new hue.

**Two distinct visibility mechanisms — do not conflate in any future work**:
- Whole-token visibility: the eye stacked under the skull at the RIGHT equator on `TokenRingChrome`
  (already implemented, `canManageVisibility`/`onToggleVisibility` in `TokenOverlay.jsx` /
  `ImageTokenOverlay.jsx`) — controls whether the token appears on the map at all for players.
- Per-slot/bar/square visibility (this feature): only meaningful when the token itself is visible;
  composes as AND (token visible AND slot not hidden). Any Gear UI must carry a hint that toggling
  a slot's eye does nothing for players if the token's own eye is off.

**CORRECTED again 2026-07-22 (same day, second round) — two more changes:**

1. **Blueprint editor and Gear popup must look visually identical** — same radial 8-slot "sun", same
   HP-bar list, same squares grid, same cream/gold styling. One shared presentational component
   (suggested name `TokenLayoutEditor`) parameterized by `mode: 'blueprint' | 'gear'`:
   - `mode="blueprint"`: no inherited/added distinction anywhere (everything IS the blueprint) — every
     bar/slot/square is fully structurally editable, freely add/remove bars and **squares** (squares
     are only ever added here, never in gear), and the per-element eye toggle means "visible to players
     **by default**" (new tooltip copy, not "visible to players"). Used by `TokenDisplayBuilder` (custom
     systems, inside `TemplateBuilder`) and by the hardcoded-system blueprint screen.
   - `mode="gear"`: per-token, as described below/above.
   - **Reversal of my earlier recommendation**: the coordinator's phrasing implies the GeneralTab
     "Configure token" button is **kept** (relabeled, opens the now-unified blueprint editor) rather
     than removed — it sits alongside the "Edit blueprint ↗" shortcut inside Gear as a second entry
     point to the same screen. Treat my original "remove the GeneralTab button" note as superseded;
     confirm with the user before actually deleting that button in implementation.

2. **Ring slots switched from "two subsections" to a per-position override model** — this replaces
   the "From blueprint / Added on this token" subsection split for slots ONLY (bars keep the two-
   subsection split described above; squares stay blueprint-only, no change). New rule: the 8 ring
   positions are fixed; render = `blueprint.slot[i]` unless a token-level override exists at position
   `i`, in which case the override wins completely — even if the blueprint already had something
   configured there. One sun widget, not two lists. Per position, in Gear:
   - Override present → gold ring/border, top-left badge is now a **restore action**
     (`RestartAltIcon`, muted `#7a5c42`, tooltip `token.gear.restoreFromBlueprint` = "Restore from
     blueprint", no confirm dialog) instead of a delete/trash icon — clicking it discards the
     per-token override and falls back to whatever the blueprint has (configured or empty) at that
     position. Clicking the slot body opens `TokenSlotConfigModal` to edit the override.
   - No override, blueprint has a slot there → 📐 badge (non-interactive, same as before) + eye
     (per-token visibility — independent of override state, always a lightweight per-token value) +
     inline-editable manual value if the blueprint type is `number`. Clicking the slot body still
     opens `TokenSlotConfigModal`, but doing so **creates** a new override at that position (seeded
     from the blueprint's current config as a starting point) — there is no separate "detach" step,
     editing IS how you fork a position into an override.
   - Neither → dashed ⊕, click creates a fresh override.
   - The 8 fixed positions are therefore the only limit needed; no separate "added slots" counter.

See also [[custom-system-data-model]] for the `Progress`/`AttrValue` shape that HP-bar-from-card
binding reads from on custom systems.
