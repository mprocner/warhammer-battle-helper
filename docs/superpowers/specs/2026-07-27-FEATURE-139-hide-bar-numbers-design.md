# FEATURE-139 — Hide numeric values on token bars

## Problem

Token bars (character + image) can currently be hidden as a whole from players (per-bar
eye toggle). We want a finer control: keep the bar visible (player still sees the coloured
fill) but hide the numeric text (`current / max`). Adds a second per-bar toggle next to the
existing eye.

## UI decisions

- New per-bar toggle icon: `@mui/icons-material/PinOutlined` (a "123" glyph in a rounded
  frame), placed next to the existing visibility eye in both config panels.
- Colour mirrors the eye: red `#b5482f` = numbers hidden, green `#5a7a42` = numbers visible.
- When the whole bar is hidden (eye off), the new toggle is **greyed out and disabled**
  (`disabled`), not removed — layout stays stable, the stored state is preserved for when the
  bar is shown again.

## Leak-safe masking (core constraint)

`token_masking.go` philosophy: anything hidden from a card-less player must contribute
**nothing** to the payload — not even its existence. A number that ships in the JSON and is
merely hidden in JSX leaks through devtools. Therefore raw `current/max` must never reach a
player for a numbers-hidden bar.

Rule (both masking paths): for a bar that is **visible but numbers-hidden**, the backend
computes `pct = clamp((current/max)*100, 0, 100)`, then emits `Current=0, Max=0,
HideValues=true, Pct=pct`. The fill still renders from `Pct`; the numbers are gone.

`Pct` equals the visible fill — that is exactly what the player already sees, so it is not a
leak. Rounding `Pct` is deliberately out of scope (YAGNI).

## Data model

### Backend

- `models.ImageTokenHPBar`: `+ HideValues bool` (`json/bson:"hideValues"`), `+ Pct float64`
  (`json/bson:"pct"`, baked only in the masked projection).
- `models.TokenHPBar` (blueprint + added bars): `+ DefaultHideValues bool`
  (`json/bson:"defaultHideValues"`). Used for character **added** bars.
- `models.CharacterTokenGear`: `+ BarHideValues map[string]bool`
  (`json/bson:"barHideValues"`) — per-token override for blueprint bars, mirrors the existing
  `BarOverrides` map used for whole-bar hiding.
- `models.TokenViewBar`: `+ HideValues bool`, `+ Pct float64`.

### Frontend

Same fields carried through via JSON (`hideValues`, `pct`, `defaultHideValues`,
`barHideValues`). No new client-only state.

## Masking implementation

### `buildMaskedTokenView` (character, `token_masking.go`)

`addBar` gains a resolved `hideValues`:

- blueprint bar → `gear.BarHideValues[bar.ID]` if present, else `bar.DefaultHideValues`.
- added bar → `bar.DefaultHideValues`.

When `!hidden && hideValues`: compute current/max as today, then set
`out.Pct = clamp((current/max)*100)`, `out.Current = 0`, `out.Max = 0`,
`out.HideValues = true`. When not hiding values, behaviour is unchanged.

### `MaskImageTokenForPlayer` (image, `GameService.go`)

For each bar with `!Hidden && HideValues`: compute `pct`, set `Current=0, Max=0, Pct=pct`,
keep `HideValues=true`. Whole-bar-hidden bars keep their current behaviour (`Current=Max=0`,
filtered out client-side).

## Render

### `TokenHpBar` (`TokenRingChrome.jsx`)

`+ valuesHidden` prop. When `true`: fill still renders (caller supplies `pct`); the
`current / max` text is suppressed. In the selected labelled row, only the label name remains;
in the centred branch, nothing renders. The `±` step buttons are also suppressed (players
never edit anyway).

### `TokenOverlay.jsx` — card-less `tokenView` branch

Masked `TokenViewBar` only carries `HideValues=true` for players, so:

- `valuesHidden = !!bar.hideValues`
- `pct = bar.hideValues ? bar.pct : (bar.max ? (bar.current/bar.max)*100 : 0)`

GM / card-holder branch (composed blueprint + gear) is unchanged — GM always sees numbers.

### `ImageTokenOverlay.jsx`

- Filter change: `bars = overlay.hpBars.filter(b => Number(b.max) > 0 || b.hideValues)`
  (a numbers-hidden bar has `max=0` in the masked payload but must still render).
- `pct = b.hideValues ? b.pct : (b.max ? (b.current/b.max)*100 : 0)`
- `valuesHidden = b.hideValues && !canEdit` — the GM (`canEdit`) still sees the real numbers
  even though the flag is set on the bar config.

## Config panels

### `ImageTokenConfigPanel.jsx` (per-bar, single scope)

Next to the existing eye (≈ line 186): a `PinOutlined` `IconButton`.

- `onClick={() => updateBar(bar.id, { hideValues: !bar.hideValues })}`
- `disabled={bar.hidden}` + greyed styling when disabled.
- colour: `bar.hideValues ? '#b5482f' : '#5a7a42'`.
- `defaultBars()` seed each bar with `hideValues: false`; `addBar` new bars `hideValues: false`.

### `CharacterTokenGearPanel.jsx`

- blueprint bars: toggle a per-token override via `BarHideValues` map (mirror of the
  `setBarOverride` / `barHidden` pattern → add `setBarHideValues` / `barValuesHidden`).
- added bars: toggle `defaultHideValues` on the bar object.
- `disabled={barHidden(bar)}` in both rows; greyed styling; same colour rule.

### Out of scope

The blueprint editor (`TokenDisplayBuilder` / `TemplateBuilder`) is **not** changed — no
blueprint-level default for hide-values. If wanted later, it is an additive follow-up.

## i18n

New keys in `en/translation.json` + `pl/translation.json`:

- `imageToken.hideValues` — tooltip when numbers currently visible ("Hide numbers" /
  "Ukryj liczby").
- `imageToken.showValues` — tooltip when numbers currently hidden ("Show numbers" /
  "Pokaż liczby").

## Tests

- `token_masking_test.go`: add a case — a bar with `hideValues` (via `BarHideValues` and via
  added-bar `DefaultHideValues`) yields a `TokenViewBar` with `HideValues=true`, `Pct`
  populated (> 0 for a non-empty bar), and `Current==0 && Max==0`. A whole-bar-hidden bar
  still contributes nothing.
- If an image-masking test exists, mirror the case for `MaskImageTokenForPlayer`; otherwise
  add a focused one.

## Non-goals

- No blueprint-editor default toggle.
- No rounding / fuzzing of `Pct`.
- No change to whole-bar visibility behaviour.
