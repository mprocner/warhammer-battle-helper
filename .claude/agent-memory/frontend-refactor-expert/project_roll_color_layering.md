---
name: roll-color-layering
description: getResultColor is a shared 3-state helper for all game systems; system-specific tiered colors live in that system's own map
metadata:
  type: project
---

`getResultColor`/`getResultColorClass` in `src/components/log/rollUtils.js` are GENERIC, 3-state helpers (isCritSuccess/isCritFailure/isSuccess) consumed by multiple systems: warhammer4e (3 roll files), dnd5e (2 files), and coc7e SanityRoll. Their signature must stay stable.

Systems with more than 3 success tiers must NOT push their extra states into `getResultColor`. CoC 7e has 6 tiers; its colors live in `OUTCOME_MAP` in `src/systems/coc7e/utils.js` (each entry has `color` for result text + optional `sealColor` flat seal background; `getOutcomeConfig(outcome)` resolves with a `failure` fallback). CoC SanityRoll is binary so it correctly still uses the generic `getResultColor`.

Log result colors are CSS custom properties in `LogWindow.css` (`--log-success`, `--log-gold-medium`, `--log-purple`, `--log-red-light`, `--log-blue` for CoC hard_success) — never raw hex in JSX.

`WaxSealToken` (`src/components/log/WaxSealToken.jsx`) picks a gradient class from the 3 boolean flags; `overrideColor` prop replaces that gradient with a flat background. Pass `overrideColor` ONLY for tiers lacking their own gradient class (e.g. CoC hard_success → blue) — passing it for every tier would flatten all the gradients.

**Why:** Tier concepts like hard_success/extreme_success are CoC-specific; putting them in the shared helper would leak system knowledge into the generic layer and break the plugin pattern.

**How to apply:** When adding/refactoring per-system roll colors, extend that system's outcome map; touch `rollUtils.getResultColor` only for genuinely cross-system changes.
