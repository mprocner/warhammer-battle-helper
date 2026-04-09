---
name: UI Conventions & Visual Language
description: Core UI rules for icons, tooltips, CSS methodology, i18n, and the medieval parchment theme used across the app
type: project
---

Icons: ONLY from `@mui/icons-material`. Never inline SVG or other icon libraries.

Tooltips: NEVER MUI `<Tooltip>`. Always custom portal tooltip via `createPortal` to `document.body`. CSS classes: `.portal-tooltip` + `.portal-tooltip__arrow`. Positioned LEFT of target with right-side arrow. State pattern: `useState(null)` for `{top, left, text}` + `useRef` for timeout.

CSS: BEM naming in per-component `.css` files (not global `style.css`). Block, element, modifier pattern.

i18n: All user-facing strings via `useTranslation()` hook. Keys must exist in both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.

**Medieval parchment color palette (verified from GeneralTab.css and LogWindow.css):**
- Background: `#f5ebe0` / `#ede0ce` / `#fdf8f2`
- Border gold: `#c9a66b` / `#8b6b3d`
- Text dark brown: `#4a3728` / `#6b4423`
- Brown medium: `#7a5c42`
- Success green: `#5a8a5a` / `#5a7a4a`
- Danger red: `#c0392b` / `#8b2424`
- Gold: `#b8941f` / `#d4af37`

**CSS variables (defined in LogWindow.css :root):**
- `--log-gold-dark: #8b6914`, `--log-gold-medium: #b8941f`, `--log-gold-light: #d4af37`
- `--log-green-dark: #4a5a3a`, `--log-green-medium: #5a7a4a`
- `--log-red-dark: #8b2424`, `--log-red-medium: #a93434`
- `--log-brown-dark: #6b4423`, `--log-brown-light: #c9975b`
- `--log-purple-dark: #3a1a5c`, `--log-purple-medium: #6b3fa0`
- `--log-bg-parchment: #f9f3e8`, `--log-bg-parchment-dark: #ece3d4`

**Typography:**
- Display/headers: `font-family: 'Cinzel', serif`
- Body: `font-family: 'Crimson Text', serif`

**Wax seal token pattern (WaxSealToken.jsx):**
- Circular div, 42x42px, radial gradient fills
- Variants: `--crit-success` (gold glow), `--crit-failure` (purple), `--success` (green), `--failure` (red)
- Used in chat log for roll results — reusable visual pattern for badges

**GeneralTab collapsible section pattern:**
- `.general-tab__section--collapsible` with `padding: 0; overflow: hidden`
- Header button `.general-tab__section-header` with `aria-expanded`
- Content rendered only when open (conditional render, no CSS animation)

**Why:** Established visual grammar. Deviating from it (e.g., using MUI Tooltip or modern gray palettes) creates jarring inconsistency between views — as seen with RollStatisticsSettings.jsx which currently uses plain modern styles.
