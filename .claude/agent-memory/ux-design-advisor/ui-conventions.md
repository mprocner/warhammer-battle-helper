---
name: UI Conventions
description: Hard constraints on icons, tooltips, CSS naming, and i18n that must be respected in every design decision
type: project
---

- Icons: ONLY from `@mui/icons-material`. Never inline SVG or other libraries.
- Tooltips: NEVER MUI `<Tooltip>`. Always `createPortal` to `document.body`. CSS classes: `.portal-tooltip` + `.portal-tooltip__arrow`. Positioned LEFT of target (`translateX(-100%)`), arrow on right side. Pattern: `useState(null)` for `{top, left, text}`, `useRef` for timeout, `onMouseEnter`/`onMouseLeave`.
- CSS: BEM in `style.css` — block, element (`__`), modifier (`--`) pattern. Component-specific CSS files also used (e.g. `DrawingToolbar.css`, `ScenesTab.css`, `RightPanel.css`, `SceneViewport.css`).
- i18n: ALL user-facing strings via i18next. Keys must exist in both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Theme: Parchment/fantasy aesthetic. Background `#e8dcc4`, text `#3a2f1f`, accent `#7a5c42` / `#c9975b`. Font: 'Crimson Text' body, 'Cinzel' headings/labels. NOT a dark theme — it is a warm parchment theme.
- MUI usage: Only `@mui/icons-material` icons and minimal MUI components (ToggleButton in DrawingToolbar). No MUI Tooltip, no MUI Box/Typography in new components.

**Why:** Consistency with existing visual language; MUI Tooltip had z-index and portal conflicts; BEM enforces maintainability.
