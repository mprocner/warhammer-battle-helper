---
name: token-gear-redesign-plan
description: "Model A plan (2026-07-22, NOT yet implemented) for per-token character gear: per-ring-position slot overlay + append-list bar overlay — 4 rounds of user corrections same day"
metadata:
  type: project
---

Design discussed 2026-07-22, NOT IMPLEMENTED, refined across 4 correction rounds same day. Full spec
(model diffs, endpoints, WS, masking algorithm step-by-step, migration, file list) lives in the
user's cross-session memory at `token-gear-redesign-plan.md` (path:
`~/.claude-private/projects/-Users-mateuszprocner-priv-warhammer-battle-helper/memory/`) — read that
for implementation detail. This entry is the decision summary + correction history.

**Round 1 — blueprint publish flow is KEPT, not removed:** my first draft proposed folding
`GeneralTab.jsx`'s "Configure tokens" button + `GameHandler.EnsureTokenConfig`/`PublishTokenConfig`
into the generic template Create/Update endpoints. User rejected ("nic z powyższego nie usuwamy") —
all of that stays exactly as today. Lesson: don't assume the brief's own suggestion implies removing
an existing entry point.

**Round 2 — dropped attach/detach/padlock UI entirely; added per-token elements (later revised by
round 4, see below).** Plain eye-icon visibility toggle instead of a padlock metaphor, no
reconciliation-policy question.

**Round 3 — card-holder masking CONFIRMED:** VisibleTo holders treated exactly like GM (full view,
no dimming) — was previously "recommended, unconfirmed."

**Round 4 — SLOT model corrected from "append" to "per-ring-POSITION overlay" (supersedes round 2's
slot part; bars unaffected).** The ring is a FIXED 8 positions (`blueprint.Slots[8]`), so a per-token
slot customization can only ever REPLACE one of those 8, never append a 9th — "adding a slot"
dissolves into "overriding an existing/empty position." `GameCharacter.TokenGear.AddedSlots
[]TokenSlot` is GONE. Replaced by:
```go
SlotOverrides map[string]SlotOverride // keyed by the BLUEPRINT slot's stable id at that position
type SlotOverride struct {
    Slot   *TokenSlot         // nil = blueprint's slot at this position; non-nil = per-token replacement
    Hidden *bool              // nil = inherit effective slot's DefaultHidden; non-nil = force
    Value  *TokenOverlayValue // nil = no manual value (blank/0); non-nil = manual value at this position
}
```
Three axes independently optional — a token can override just value, just visibility, just
structure, or any combination, via ONE map entry per position. BARS are unaffected by round 4 — a
bar list has no fixed capacity, so `AddedBars []TokenHPBar` (append model, `DefaultHidden` = literal
hidden flag since no override layer sits above an added bar) stays exactly as round 2 designed it.
This slot/bar asymmetry (fixed-grid-overlay vs unbounded-list-append) is intentional.

Icon slot condition VALUES still always come from shared `Character.States` (card-level), regardless
of whether the ring position's effective slot is blueprint or per-token-overridden — the correction
only changes *what occupies a ring position*, never *where condition state lives*.

**Masking (position-first now):** compute the effective slot per position (blueprint + override)
FIRST, then determine hidden, THEN decide what's in the stats/state projection — not the old
"blueprint element vs added element" flat loop. A hidden position is omitted from the masked
`SlotOverrides` map entirely (no entry at all, not even empty) — no leaking existence/structure/value.
A visible position only gets a masked entry when there's something beyond the shared, unmasked
blueprint to convey (a structural override and/or a manual value); `Hidden` is never sent to a
masked viewer (it never recomputes visibility).

**Endpoints — slots and bars now have DIFFERENT shapes** (bars keep round-2's create/edit/delete
list shape; slots become upsert/delete-by-position, no create/limit since 8 positions is already the
natural cap):
```
PATCH  .../tokenGear/slots/:slotId/value        {number?, select?}
PATCH  .../tokenGear/slots/:slotId/visibility   {hidden}
PUT    .../tokenGear/slots/:slotId/structure    TokenSlot | null
DELETE .../tokenGear/slots/:slotId              # full reset, all 3 axes

PATCH  .../tokenGear/bars/:barId/visibility     {hidden}
PATCH  .../tokenGear/bars/:barId/value          {delta?, value?}
POST   .../tokenGear/bars                       (create AddedBar, 400 if >4 total)
PATCH  .../tokenGear/bars/:barId/structure       (edit AddedBar definition)
DELETE .../tokenGear/bars/:barId
```
All GM-only, keyed by placement `_id`.

**Placement CONFIRMED FINAL 2026-07-22:** per-token gear lives on `GameCharacter.TokenGear` (the
scene placement), not `Character` — no longer an open question, this is settled.

See [[token-config-singleton]] (singleton mechanism, unchanged), [[image-token-overlay]] (the
per-instance masking + WS-exception precedent this design mirrors), and
[[custom-system-surrogate-keys]] (blueprint slot position ids and `AddedBars` ids are both
opaque/generated-once — why keying `SlotOverrides` by blueprint slot id is safe as a position key).
