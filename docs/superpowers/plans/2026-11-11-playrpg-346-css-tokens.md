# PLAYRPG-346 CSS Tokens + Default Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline, batch by batch — decided with the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every visual value in the game view's CSS that a theme may change (colour, font, radius, shadow strength, tracking, display-font capitalisation) comes from a CSS custom property defined on `:root`, with default values that reproduce today's look.

**Architecture:** One `src/theme/tokens.css` defines the default theme. A one-off Python codemod (`scripts/theme-tokens/`) rewrites CSS declarations by *property family*: `color` → text tokens, `background*` → surface tokens, `border*`/`outline` → border tokens, `rgba()` → rgb-triplet tokens. Each value snaps to the nearest token of its family (CIE76 ΔE in Lab), decided with the user: "no noticeable change", not pixel-exact. A Jest test forbids raw values afterwards. MUI moves to `cssVariables` mode so a theme can override `--mui-palette-*`.

**Tech Stack:** CSS custom properties, Python 3 (codemod only), Jest via CRA, MUI 7 `cssVariables`.

## Global Constraints

- Default theme must look the same to the eye; snapped colour deltas are accepted (decision 2026-11-11).
- Theme tokens never cover dimensions: padding, margin, gap, width/height, font-size, line-height, border-width.
- Transparency: `rgb(var(--c-x-rgb) / <alpha>)` — never `color-mix()`, never `rgba(var())`.
- Blurred shadows: alpha multiplied by `var(--shadow-k)` (default 1). Spread-only rings (blur 0, focus rings) are NOT multiplied.
- `letter-spacing: X` → `calc(X * var(--tracking-k))` (default 1).
- Display-font rules without explicit `text-transform` get `text-transform: var(--display-transform)` (default `none`).
- Radius snapping: 1–2px→`--radius-xs`(2px), 3→`--radius-sm`(3px), 4–5→`--radius-md`(4px), 6–7→`--radius-lg`(6px), 8–10→`--radius-xl`(8px), 11–16→`--radius-2xl`(12px), ≥17→`--radius-pill`(20px); `0`, `50%`, `inherit` stay literal.
- Fonts: `'Cinzel'`→`var(--font-display)`, `'Crimson Text'`→`var(--font-body)`, `'Roboto'`→`var(--font-ui)`, `monospace` stays.
- Code comments in English. Commit per batch on `main` (check branch in the same command).
- Spec: PLAYRPG-270 sections "Architektura frontendu 1, 3", "Niezmienniki".

## Files

- Create `warhammer-battle-helper-front/src/theme/tokens.css` — default token values (generated from `palette.py`, then hand-kept).
- Create `warhammer-battle-helper-front/scripts/theme-tokens/palette.py` — family → tokens table (done).
- Create `warhammer-battle-helper-front/scripts/theme-tokens/tokenize.py` — codemod; `--check` prints a report, `--write` rewrites.
- Create `warhammer-battle-helper-front/scripts/theme-tokens/gen_tokens_css.py` — writes `tokens.css` from `palette.py`.
- Create `warhammer-battle-helper-front/src/theme/noRawStyleValues.test.js` — the guard.
- Modify `src/index.js` — import `./theme/tokens.css` before `./index.css`.
- Modify all 37 `src/**/*.css` (batches below), `src/theme.js`, JSX `sx`/inline chrome colours.
- Delete `scripts/theme-tokens/` in the final task.

## Verification method (every batch)

Computed-style diff in the real app (`localhost:3000`, docker frontend serves the main checkout with live reload). A snippet run through the browser automation walks every element of the open view and records `color`, `background-color`, `background-image`, `border-*-color`, `box-shadow`, `border-radius`, `font-family`, `letter-spacing`, `text-transform`. Dump before the batch, dump after, diff. Expected differences: only snapped colours (ΔE < ~15) and 1–2px radius snaps. Anything else (missing background, transform change, font change) is a bug to fix before committing.

Views to dump: lobby, game session (GM) with log + right panel + scene toolbar, Warhammer sheet popup, CoC sheet popup, custom-system sheet, template builder, a modal (confirm), tooltip.

---

### Task 1: Tokens file + codemod + guard test (red)

- [ ] `gen_tokens_css.py` emits `:root { ... }` with every family token, every `-rgb` triplet (`--c-accent-rgb: 201 151 91;`), radius scale, `--shadow-k: 1; --tracking-k: 1; --display-transform: none;`, font stacks:
  `--font-display: 'Cinzel', serif; --font-body: 'Crimson Text', Georgia, serif; --font-ui: 'Roboto', sans-serif;`
- [ ] Import in `src/index.js` before `index.css`.
- [ ] `tokenize.py`: per-family nearest-token replacement, rgba→triplet, shadow-k for blurred layers, radius/tracking/font/display-transform rules from Global Constraints; skips custom-property declarations (`--x:`) and `tokens.css`; prints per-file report of replacements and of ΔE ≥ 15 snaps for manual review.
- [ ] `noRawStyleValues.test.js`: for every `src/**/*.css` except `src/theme/tokens.css`, fail on hex, `rgb(`/`rgba(` without `var(`, named colours `white|black` in colour properties, raw px `border-radius`, `letter-spacing` without `var(`, `font-family` naming Cinzel/Crimson/Roboto. Message lists file:line. Run → FAIL (red) with ~3500 hits.

### Task 2..N: Batches (one commit each)

Each batch: dump before → `python3 scripts/theme-tokens/tokenize.py --write <files>` → review report and `git diff` (spot-check ΔE ≥ 15 snaps, fix by hand) → dump after, diff → commit `refactor(theme): tokens in <area> (PLAYRPG-346)`.

1. Small component CSS: `src/components/**/*.css` except LogWindow (36 files minus 1).
2. `LogWindow.css` + `log/*.css` — replace the local `--log-*` palette: each `--log-x: #hex` becomes `--log-x: var(--c-…)` (kept as aliases only if >3 uses, else inline the global token and delete the alias — memory: clean unused).
3. `style.css` lines 1–2121 (global, sidebar, grid, modals, buttons, log). Body texture → `--bg-texture` (default = today's SVG noise + gradient), `body::before` grid lines → `rgb(var(--c-leather-rgb) / 0.03)`.
4. `style.css` 2122–4386 (character sheet popup, modifiers, tooltips, CoC sheet).
5. `style.css` 4387–7346 (online bar, spells, minigames).
6. `style.css` 7347–10117 (custom system).
7. `style.css` 10118–13242 (template builder, general tab, landing, tab header).

### Task N+1: JSX + MUI

- [ ] `theme.js`: `createTheme({ cssVariables: true, ... })`; palette keeps hex (MUI derives channels from them); every `styleOverrides` colour/shadow/radius string uses `var(--c-…)` tokens; typography `fontFamily: 'var(--font-display)'`.
- [ ] JSX chrome colours (`sx`, `style={{}}`) in: `CharacterTokenGearPanel.jsx`, `ImageTokenConfigPanel.jsx`, `TokenDisplayBuilder.jsx`, `GameCard.jsx`, `TokenSlotConfigModal.jsx`, `TemplateBuilder.jsx`, `DrawingToolbar.jsx`, `TemplateAccessCard.jsx`, `TemplateAboutCard.jsx`, `SpellsSection.jsx`, `LanguageFilter.jsx`, `CreateGameDialog.jsx`, `LandingLightbox.jsx`, `TourRunner.jsx`, `FilesTab.jsx`, warhammer4e sections. Content colours (participant palette, drawing colours, rich-text palette, success-level colours, dice) stay literal — list them in the guard test's JS allowlist comment.
- [ ] Canvas chrome colours stay for PLAYRPG-348 (it adds redraw on theme change).

### Task N+2: Docs + cleanup

- [ ] Knowledge base: new `docs/knowledge-base/13-motywy.md` (tokens, families, rgb triplets, shadow-k/tracking-k/display-transform, guard test, why `data-theme` on `<html>` — mechanism lands in 348), link from `README.md`.
- [ ] `CLAUDE.md`: colour table for sheets → tokens; rule "new CSS uses tokens only; themes never change dimensions".
- [ ] Delete `scripts/theme-tokens/`.
- [ ] Full suite: `CI=true npm test -- --watchAll=false` → only the known `App.test.js` baseline failure.
- [ ] Commit `refactor(theme): CSS tokens for themes, default theme (PLAYRPG-346)`.

Not user-visible → no changelog, no `/help`.
