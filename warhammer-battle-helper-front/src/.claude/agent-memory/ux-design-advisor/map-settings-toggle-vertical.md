---
name: map-settings-toggle-vertical
description: Design decision for distance-metric selector in GeneralTab (Map Settings) — vertical segmented control instead of shortening labels
metadata:
  type: project
---

`GeneralTab.jsx` Map Settings section (GM-only) has two segmented controls sharing `.map-settings-toggle` / `.map-settings-toggle__option` (`GeneralTab.css` ~L716-756): token positioning (2 options, horizontal, fine) and distance measurement metric (3 options: `euclidean`/`chebyshev`/`alternating`, horizontal — labels wrapped badly in the ~250-320px wide tab column).

**Decision**: recommended a `.map-settings-toggle--vertical` modifier (just `grid-auto-flow: row` instead of `column`, plus `justify-content: flex-start` on options) for the 3-option metric selector, keeping full untruncated i18n labels — root cause was column width, not label length, so shortening labels was unnecessary. Positioning selector stays horizontal (2 short options fit fine) — intentional asymmetry, not inconsistency, since both still use the same container/active-state visual language (gold `--active` fill, tan border/bg container) so they read as siblings despite different orientation.

Recommended icons (avoiding collision with `GridOn`/`GridOff` already used by the positioning toggle above it): `Straighten` (euclidean/ruler), `Grid3x3` (chebyshev — NOT `GridOn`, that's taken), `AltRoute` (alternating/5-10-5, literally "alternate route").

**Why:** Project has an established pain point — plain `<select>` for mode toggles caused live-session mistakes, so segmented control (glanceable active state) was chosen deliberately over dropdowns. Any redesign of these toggles must preserve at-a-glance visibility of the current choice; vertical segmented preserves this while horizontal-with-shortened-labels or icon+tooltip-only approaches would not (see [[custom-system-data-model]] for unrelated but similar "keep existing conventions, minimal-diff fix" pattern reasoning in this codebase).

**How to apply:** When any future settings toggle in this narrow tab panel has 3+ options or long i18n labels, default to vertical segmented (stack) over shortening labels or moving meaning into hover-only tooltips — tooltips are fine as *supplementary* mechanic explanation, never as the only way to distinguish options.
