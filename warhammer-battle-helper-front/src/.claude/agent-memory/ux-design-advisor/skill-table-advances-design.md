---
name: skill-table-advances-design
description: Layout pattern for adding base/advances/total columns to skill_table rows in the character creator's custom system — narrow horizontal grid, not the vertical attr-style stack.
metadata:
  type: project
---

Designed 2026-06-15: `skill_table` field type gets an optional "advances" feature (checkbox
`hasAdvances` + `advancesLabel` text field in PropertyPanel, mirroring `attr.hasAdvances` —
but `skill_tree` explicitly excluded).

**Why a different layout than `attr`**: the existing `attr` field with `hasAdvances` renders
3 stacked vertical rows (base/advances/total) inside `.custom-sheet__attr-rows`. That's fine
for a handful of attributes but `skill_table` can have dozens of rows — stacking 3x per row
would blow up vertical space. Chose instead a **horizontal CSS grid** per row:
`grid-template-columns: 1fr 32px 32px 36px 18px 22px` (name | base | advances | total | star | roll),
with a one-time column-label header (`.custom-sheet__skill-table-header`) shown only when
`hasAdvances` is true, since `advancesLabel` is custom per-template and otherwise unlabeled
columns would be unreadable.

**How to apply**: if asked to design similar "compact multi-value-per-row" features for other
table-like field types (skill_tree, future field types), reuse this horizontal-grid + header-row
pattern rather than the vertical attr-stack pattern — it scales to many rows. New BEM classes:
`.custom-sheet__skill-row--advances`, `.custom-sheet__skill-val-input--base/--adv`,
`.custom-sheet__skill-val-total`, `.custom-sheet__skill-table-header`,
`.custom-sheet__skill-col-label--base/--adv/--total`.

Data model implication: see [[custom-system-data-model]] — `skillsAdvanced` sibling map,
`AttrValue` shape reused.
