# FEATURE-139 Hide Bar Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-bar toggle that keeps a token HP bar visible to players but hides its numeric `current / max` text, leak-safe (raw numbers never reach a card-less player).

**Architecture:** A new `hideValues` flag rides on each bar. Server-side masking bakes a `pct` fill fraction and zeroes `current/max` for a numbers-hidden bar, so the player payload never contains the numbers. The shared `TokenHpBar` gains a `valuesHidden` prop that suppresses the text while still drawing the fill. Config panels get a `PinOutlined` toggle next to the existing visibility eye, disabled (greyed) while the whole bar is hidden.

**Tech Stack:** Go (backend models + masking), React + MUI (frontend), i18next, Jest + @testing-library (frontend tests), Go `testing` (backend tests).

## Global Constraints

- All UI strings use English i18n keys via `t('key')`; add both `en` and `pl`. Never hardcode strings in JSX.
- Icons come from `@mui/icons-material` only.
- Character-sheet / popup colour scheme: hidden/off = `#b5482f`, visible/on = `#5a7a42`, disabled = `#bbb`.
- No backward-compat shims — new struct fields with `omitempty` are fine; old data simply reads as `false`/`0`.
- The blueprint editor (`TokenDisplayBuilder` / `TemplateBuilder`) is OUT OF SCOPE — do not add a blueprint-level default toggle.

---

### Task 1: Backend model fields + character masking

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:56-62` (`TokenHPBar`)
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go:150-163` (`CharacterTokenGear`), `Game.go:212-218` (`TokenViewBar`)
- Modify: `warhammer-battle-helper-backend/internal/service/token_masking.go:120-150` (`buildMaskedTokenView` addBar)
- Test: `warhammer-battle-helper-backend/internal/service/token_masking_test.go`

**Interfaces:**
- Consumes: existing `buildMaskedTokenView(blueprint, gear, stats, states)`.
- Produces:
  - `models.TokenHPBar.DefaultHideValues bool` (json/bson `defaultHideValues`)
  - `models.CharacterTokenGear.BarHideValues map[string]bool` (json/bson `barHideValues`)
  - `models.TokenViewBar.HideValues bool` (json `hideValues`), `Pct float64` (json `pct`)
  - `func barPct(cur, max float64) float64` in `token_masking.go` (0–100, clamped)

- [ ] **Step 1: Write the failing test**

Add to `token_masking_test.go`:

```go
// A numbers-hidden bar stays visible but ships NO raw numbers: current/max are zeroed and a baked
// pct carries the fill. Covers both the per-token override (blueprint bar) and an added bar's flag.
func TestMask_HideValuesBar(t *testing.T) {
	blueprint := sampleBlueprint() // bpWounds bar = field wounds.current / wounds.max, visible
	stats := statsRaw(t, bson.M{"wounds": bson.M{"current": 6, "max": 10}, "corruption": 1})
	gear := &models.CharacterTokenGear{
		BarHideValues: map[string]bool{"bpWounds": true},
		AddedBars: []models.TokenHPBar{
			{ID: "rage", Label: "Rage", DefaultHideValues: true},
		},
		BarValues: map[string]models.HPBarValue{"rage": {Current: 3, Max: 4}},
	}

	view := buildMaskedTokenView(blueprint, gear, stats, nil)

	byID := map[string]models.TokenViewBar{}
	for _, b := range view.Bars {
		byID[b.ID] = b
	}

	wounds, ok := byID["bpWounds"]
	if !ok {
		t.Fatal("wounds bar must still be present (visible, numbers hidden)")
	}
	if !wounds.HideValues || wounds.Current != 0 || wounds.Max != 0 {
		t.Fatalf("wounds numbers must be stripped, got %+v", wounds)
	}
	if wounds.Pct != 60 {
		t.Fatalf("wounds pct should be 60 (6/10), got %v", wounds.Pct)
	}

	rage, ok := byID["rage"]
	if !ok {
		t.Fatal("added rage bar must be present")
	}
	if !rage.HideValues || rage.Current != 0 || rage.Max != 0 || rage.Pct != 75 {
		t.Fatalf("rage bar wrong: %+v", rage)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestMask_HideValuesBar -v`
Expected: FAIL — compile error `unknown field BarHideValues` / `DefaultHideValues` / `HideValues` / `Pct`.

- [ ] **Step 3: Add the model fields**

In `SystemTemplate.go`, `TokenHPBar` becomes:

```go
type TokenHPBar struct {
	ID            string        `bson:"id" json:"id"`
	Label         string        `bson:"label" json:"label"`
	Color         string        `bson:"color,omitempty" json:"color,omitempty"`
	Field         *FieldBinding `bson:"field,omitempty" json:"field,omitempty"`
	DefaultHidden bool          `bson:"defaultHidden,omitempty" json:"defaultHidden,omitempty"`
	// DefaultHideValues: hide the numeric current/max text while keeping the bar's fill visible.
	// For added bars this is the literal (only) flag; blueprint bars override it per-token via
	// CharacterTokenGear.BarHideValues.
	DefaultHideValues bool `bson:"defaultHideValues,omitempty" json:"defaultHideValues,omitempty"`
}
```

In `Game.go`, `CharacterTokenGear` gains a map (place next to `BarOverrides`):

```go
	BarOverrides  map[string]bool       `bson:"barOverrides,omitempty" json:"barOverrides,omitempty"`
	BarHideValues map[string]bool       `bson:"barHideValues,omitempty" json:"barHideValues,omitempty"`
	BarValues     map[string]HPBarValue `bson:"barValues,omitempty" json:"barValues,omitempty"`
	AddedBars     []TokenHPBar          `bson:"addedBars,omitempty" json:"addedBars,omitempty"`
```

In `Game.go`, `TokenViewBar` becomes:

```go
type TokenViewBar struct {
	ID         string  `json:"id"`
	Label      string  `json:"label,omitempty"`
	Color      string  `json:"color,omitempty"`
	Current    float64 `json:"current"`
	Max        float64 `json:"max"`
	// HideValues: the bar's numbers are intentionally stripped for this viewer; Pct carries the
	// fill fraction (0–100) so the client can still draw the bar without the raw numbers leaking.
	HideValues bool    `json:"hideValues,omitempty"`
	Pct        float64 `json:"pct,omitempty"`
}
```

- [ ] **Step 4: Implement the masking logic**

In `token_masking.go`, add the helper (above `buildMaskedTokenView`):

```go
// barPct is the clamped 0–100 fill fraction baked into a numbers-hidden bar so the client draws the
// fill without ever receiving the raw current/max.
func barPct(cur, max float64) float64 {
	if max <= 0 {
		return 0
	}
	p := cur / max * 100
	if p < 0 {
		return 0
	}
	if p > 100 {
		return 100
	}
	return p
}
```

Replace the `addBar` closure and its two call sites (currently `token_masking.go:120-150`):

```go
	addBar := func(bar models.TokenHPBar, hidden, hideValues bool) {
		if hidden {
			return
		}
		out := models.TokenViewBar{ID: bar.ID, Label: bar.Label, Color: bar.Color}
		if bar.Field != nil {
			out.Current = toFloat(statByPath(statsDoc, bar.Field.Key))
			if bar.Field.MaxKey != "" {
				out.Max = toFloat(statByPath(statsDoc, bar.Field.MaxKey))
			}
		} else if gear != nil {
			if v, ok := gear.BarValues[bar.ID]; ok {
				out.Current, out.Max = v.Current, v.Max
			}
		}
		if hideValues {
			out.Pct = barPct(out.Current, out.Max)
			out.Current, out.Max, out.HideValues = 0, 0, true
		}
		view.Bars = append(view.Bars, out)
	}
	for _, bar := range blueprint.HPBars {
		hidden := bar.DefaultHidden
		hideValues := bar.DefaultHideValues
		if gear != nil {
			if v, ok := gear.BarOverrides[bar.ID]; ok {
				hidden = v
			}
			if v, ok := gear.BarHideValues[bar.ID]; ok {
				hideValues = v
			}
		}
		addBar(bar, hidden, hideValues)
	}
	if gear != nil {
		for _, bar := range gear.AddedBars {
			addBar(bar, bar.DefaultHidden, bar.DefaultHideValues) // added bars have no override layer
		}
	}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestMask -v`
Expected: PASS (all `TestMask_*` including the new one).

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/models/Game.go warhammer-battle-helper-backend/internal/service/token_masking.go warhammer-battle-helper-backend/internal/service/token_masking_test.go
git commit -m "feat(token): character bar hideValues masking (FEATURE-139)"
```

---

### Task 2: Backend image-token masking

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go:330-337` (`ImageTokenHPBar`)
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:2333-2361` (`MaskImageTokenForPlayer`)
- Create: `warhammer-battle-helper-backend/internal/service/token_image_mask_test.go`

**Interfaces:**
- Consumes: `barPct` from Task 1 (same `service` package), `MaskImageTokenForPlayer(overlay *models.ImageTokenOverlay)`.
- Produces: `models.ImageTokenHPBar.HideValues bool` (json/bson `hideValues`), `Pct float64` (json/bson `pct`).

- [ ] **Step 1: Write the failing test**

Create `token_image_mask_test.go`:

```go
package service

import (
	"testing"

	"battle-helper/internal/models"
)

// A numbers-hidden image bar keeps rendering (pct baked) but ships no raw numbers; a whole-bar-hidden
// bar is zeroed as before; a normal bar is untouched.
func TestMaskImageToken_HideValues(t *testing.T) {
	overlay := &models.ImageTokenOverlay{
		Enabled: true,
		HPBars: []models.ImageTokenHPBar{
			{ID: "hp", Label: "HP", Current: 6, Max: 10},                       // normal
			{ID: "shield", Label: "Shield", Current: 4, Max: 8, HideValues: true}, // numbers hidden
			{ID: "secret", Label: "Secret", Current: 2, Max: 5, Hidden: true},   // whole bar hidden
		},
	}

	masked := MaskImageTokenForPlayer(overlay)
	byID := map[string]models.ImageTokenHPBar{}
	for _, b := range masked.HPBars {
		byID[b.ID] = b
	}

	if b := byID["hp"]; b.Current != 6 || b.Max != 10 || b.HideValues {
		t.Fatalf("normal bar must be untouched, got %+v", b)
	}
	if b := byID["shield"]; !b.HideValues || b.Current != 0 || b.Max != 0 || b.Pct != 50 {
		t.Fatalf("shield numbers must be stripped with pct=50, got %+v", b)
	}
	if b := byID["secret"]; b.Current != 0 || b.Max != 0 {
		t.Fatalf("hidden bar must be zeroed, got %+v", b)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestMaskImageToken_HideValues -v`
Expected: FAIL — compile error `unknown field HideValues` / `Pct` in `ImageTokenHPBar`.

- [ ] **Step 3: Add the model fields**

In `Game.go`, `ImageTokenHPBar` becomes:

```go
type ImageTokenHPBar struct {
	ID      string  `bson:"id" json:"id"`
	Label   string  `bson:"label" json:"label"`
	Current float64 `bson:"current" json:"current"`
	Max     float64 `bson:"max" json:"max"`
	Color   string  `bson:"color,omitempty" json:"color,omitempty"`
	Hidden  bool    `bson:"hidden,omitempty" json:"hidden,omitempty"`
	// HideValues: keep the bar visible to players but strip its numeric text. Masked server-side
	// (see MaskImageTokenForPlayer): current/max are zeroed and Pct carries the fill fraction.
	HideValues bool    `bson:"hideValues,omitempty" json:"hideValues,omitempty"`
	Pct        float64 `bson:"pct,omitempty" json:"pct,omitempty"`
}
```

- [ ] **Step 4: Implement the masking logic**

In `GameService.go`, update the HP-bar loop inside `MaskImageTokenForPlayer` (currently `2341-2346`):

```go
		for i := range bars {
			if bars[i].Hidden {
				bars[i].Current = 0
				bars[i].Max = 0
			} else if bars[i].HideValues {
				bars[i].Pct = barPct(bars[i].Current, bars[i].Max)
				bars[i].Current = 0
				bars[i].Max = 0
			}
		}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestMaskImageToken -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/Game.go warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/service/token_image_mask_test.go
git commit -m "feat(token): image bar hideValues masking (FEATURE-139)"
```

---

### Task 3: `TokenHpBar` valuesHidden rendering

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx:21-49` (`TokenHpBar`)
- Create: `warhammer-battle-helper-front/src/components/token-display/TokenHpBar.test.jsx`

**Interfaces:**
- Consumes: existing `TokenHpBar({ current, max, pct, tone, color, canEdit, onStep, label, selected, showTooltip, hideTooltip })`.
- Produces: `TokenHpBar` gains a `valuesHidden` prop (bool). When true: fill still renders from `pct`; the `current / max` text is suppressed; the `±` buttons are suppressed.

- [ ] **Step 1: Write the failing test**

Create `TokenHpBar.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import { TokenHpBar } from './TokenRingChrome';

test('valuesHidden suppresses the numeric text but keeps the fill width', () => {
  const { container } = render(
    <div>
      <TokenHpBar current={0} max={0} pct={60} tone="good" canEdit={false} onStep={() => {}} valuesHidden />
    </div>
  );
  expect(container.querySelector('.token-hp__text')).toBeNull();
  expect(container.querySelector('.token-hp__fill').style.width).toBe('60%');
});

test('shows the numeric text when valuesHidden is not set', () => {
  const { container } = render(
    <div>
      <TokenHpBar current={6} max={10} pct={60} tone="good" canEdit={false} onStep={() => {}} />
    </div>
  );
  expect(container.querySelector('.token-hp__text').textContent).toBe('6 / 10');
});

test('valuesHidden hides the step buttons even when canEdit is true', () => {
  const { container } = render(
    <div>
      <TokenHpBar current={0} max={0} pct={20} tone="danger" canEdit={true} onStep={() => {}} valuesHidden />
    </div>
  );
  expect(container.querySelector('.token-hp__btn')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && npx jest src/components/token-display/TokenHpBar.test.jsx`
Expected: FAIL — the numeric text still renders (`.token-hp__text` present) because `valuesHidden` is ignored.

- [ ] **Step 3: Implement**

Replace the `TokenHpBar` function body (`TokenRingChrome.jsx:21-49`):

```jsx
export function TokenHpBar({ current, max, pct, tone, color, canEdit, onStep, label, selected, showTooltip, hideTooltip, valuesHidden = false }) {
  const hasLabel = !!label;
  const showLabel = selected && hasLabel;
  const showValue = !valuesHidden;
  const showSteps = canEdit && !valuesHidden;
  const valueText = `${current}${max ? ` / ${max}` : ''}`;
  return (
    <>
      {showSteps && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(-1); }}>−</button>
      )}
      <div className="token-hp__track"
        onMouseEnter={hasLabel && showTooltip ? (e) => showTooltip(label, e.currentTarget) : undefined}
        onMouseLeave={hasLabel && hideTooltip ? hideTooltip : undefined}>
        <div className={`token-hp__fill token-hp__fill--${tone}`}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
        {showLabel ? (
          <div className="token-hp__row">
            <span className="token-hp__label">{label}</span>
            {showValue && <span className="token-hp__text">{valueText}</span>}
          </div>
        ) : (
          showValue && <span className="token-hp__text">{valueText}</span>
        )}
      </div>
      {showSteps && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(1); }}>+</button>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && npx jest src/components/token-display/TokenHpBar.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx warhammer-battle-helper-front/src/components/token-display/TokenHpBar.test.jsx
git commit -m "feat(token): TokenHpBar valuesHidden prop (FEATURE-139)"
```

---

### Task 4: Wire both overlays to `valuesHidden`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/TokenOverlay.jsx:106-118` (card-less `tokenView` bar render)
- Modify: `warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx:28` (bar filter) and `83-92` (bar render)

**Interfaces:**
- Consumes: `TokenHpBar` `valuesHidden` prop (Task 3); masked bar fields `bar.hideValues`, `bar.pct` (Tasks 1–2).
- Produces: no new exports — behaviour wiring only.

- [ ] **Step 1: Update `TokenOverlay.jsx` card-less branch**

Replace the `renderHp` block at `TokenOverlay.jsx:106-118`:

```jsx
        renderHp={({ showTooltip, hideTooltip }) => (tokenView.bars || []).length > 0 ? (
          <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
            {tokenView.bars.map(bar => {
              const pct = bar.hideValues ? (bar.pct || 0) : (bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0);
              return (
                <div key={bar.id} className="token-hp">
                  <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color} canEdit={false} onStep={() => {}}
                    label={bar.label} selected={selected} valuesHidden={!!bar.hideValues} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                </div>
              );
            })}
          </div>
        ) : null}
```

- [ ] **Step 2: Update `ImageTokenOverlay.jsx` filter**

Replace line `28` (`const bars = ...`):

```jsx
  // A whole-bar-hidden bar is masked to max 0 (filtered out); a numbers-hidden bar also arrives with
  // max 0 but must still render (its fill comes from the baked pct), so keep it via hideValues.
  const bars = enabled ? (overlay.hpBars || []).filter(b => Number(b.max) > 0 || b.hideValues) : [];
```

- [ ] **Step 3: Update `ImageTokenOverlay.jsx` bar render**

Replace the `bars.map` block at `ImageTokenOverlay.jsx:83-92`:

```jsx
          {bars.map(bar => {
            // GM (canEdit) always sees the real numbers even when hideValues is set on the config;
            // only the masked player payload carries the zeroed current/max + baked pct.
            const valuesHidden = !!bar.hideValues && !canEdit;
            const pct = bar.hideValues && !canEdit ? (bar.pct || 0) : (bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0);
            return (
              <div key={bar.id} className="img-token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpTone(pct)} color={bar.color}
                  canEdit={selected && canEdit} onStep={(d) => stepHP(bar.id, d)}
                  label={bar.label} selected={selected} valuesHidden={valuesHidden} showTooltip={showTooltip} hideTooltip={hideTooltip} />
              </div>
            );
          })}
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/token-display/TokenOverlay.jsx src/components/token-display/ImageTokenOverlay.jsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/TokenOverlay.jsx warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx
git commit -m "feat(token): overlays honour bar valuesHidden (FEATURE-139)"
```

---

### Task 5: Config-panel toggles + i18n

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/ImageTokenConfigPanel.jsx` (imports, `defaultBars`, `addBar`, bar row)
- Modify: `warhammer-battle-helper-front/src/components/token-display/CharacterTokenGearPanel.jsx` (imports, `draftFrom`, mutators, helpers, blueprint bar row, added-bar row, `addBar`)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (imageToken block)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (imageToken block)

**Interfaces:**
- Consumes: `bar.hideValues` (image) / `CharacterTokenGear.barHideValues` + `TokenHPBar.defaultHideValues` (character), persisted through the existing `updateSceneImage` PUT (image) and `saveGear` PUT of the whole gear (character) — no new endpoints.
- Produces: no exports.

- [ ] **Step 1: Add the i18n keys (en)**

In `src/locales/en/translation.json`, inside the `"imageToken"` block (next to `hiddenFromPlayers` ≈ line 1583), add:

```json
    "hideValues": "Hide numbers",
    "showValues": "Show numbers",
```

- [ ] **Step 2: Add the i18n keys (pl)**

In `src/locales/pl/translation.json`, inside the `"imageToken"` block (≈ line 1583), add:

```json
    "hideValues": "Ukryj liczby",
    "showValues": "Pokaż liczby",
```

- [ ] **Step 3: Update `ImageTokenConfigPanel.jsx`**

Add the icon import after the existing MUI icon imports (near `ImageTokenConfigPanel.jsx:13`):

```jsx
import PinOutlinedIcon from '@mui/icons-material/PinOutlined';
```

In `defaultBars()`, add `hideValues: false` to each seed bar:

```jsx
const defaultBars = () => [
  { id: `bar_${genId()}`, label: '', current: '', max: '', color: '#2f9e44', hidden: true, hideValues: false },
  { id: `bar_${genId()}`, label: '', current: '', max: '', color: '#1971c2', hidden: true, hideValues: false },
  { id: `bar_${genId()}`, label: '', current: '', max: '', color: '#e03131', hidden: true, hideValues: false },
];
```

In `addBar`, add `hideValues: false` to the new bar object:

```jsx
    setDraft(d => ({ ...d, hpBars: [...d.hpBars, { id: `bar_${genId()}`, label: '', current: 10, max: 10, color: '#c9975b', hidden: true, hideValues: false }] }));
```

In the bar row, insert the toggle immediately before the existing eye `IconButton` (before `ImageTokenConfigPanel.jsx:186`):

```jsx
              <IconButton size="small" disabled={bar.hidden}
                title={bar.hideValues ? t('imageToken.showValues') : t('imageToken.hideValues')}
                onClick={() => updateBar(bar.id, { hideValues: !bar.hideValues })}
                sx={{ color: bar.hidden ? '#bbb' : (bar.hideValues ? '#b5482f' : '#5a7a42') }}>
                <PinOutlinedIcon fontSize="small" />
              </IconButton>
```

- [ ] **Step 4: Update `CharacterTokenGearPanel.jsx` (state + helpers)**

Add the icon import (near `CharacterTokenGearPanel.jsx:15`):

```jsx
import PinOutlinedIcon from '@mui/icons-material/PinOutlined';
```

In `draftFrom`, add the `barHideValues` map (next to `barOverrides`):

```jsx
  return {
    slotOverrides: JSON.parse(JSON.stringify(g.slotOverrides || {})),
    barOverrides: { ...(g.barOverrides || {}) },
    barHideValues: { ...(g.barHideValues || {}) },
    barValues: JSON.parse(JSON.stringify(g.barValues || {})),
    addedBars: JSON.parse(JSON.stringify(g.addedBars || [])),
  };
```

Add a mutator next to `setBarOverride` (after `CharacterTokenGearPanel.jsx:92`):

```jsx
  const setBarHideValues = (id, hv) => setDraft(d => ({ ...d, barHideValues: { ...d.barHideValues, [id]: hv } }));
```

Add a helper next to `barHidden` (after `CharacterTokenGearPanel.jsx:112`):

```jsx
  const barValuesHidden = (bar, isAdded) => {
    if (isAdded) return !!bar.defaultHideValues;
    const ov = draft.barHideValues[bar.id];
    return ov != null ? ov : !!bar.defaultHideValues;
  };
```

In `addBar` (line 105), add `defaultHideValues: false`:

```jsx
  const addBar = () => setDraft(d => ({ ...d, addedBars: [...d.addedBars, { id: genId(), label: '', color: BAR_COLORS[0], defaultHidden: false, defaultHideValues: false }] }));
```

- [ ] **Step 5: Update `CharacterTokenGearPanel.jsx` (blueprint bar row)**

In the blueprint bars map, compute `valuesHidden` after `const hidden = barHidden(bar, false);` (line 171):

```jsx
            const valuesHidden = barValuesHidden(bar, false);
```

Insert the toggle immediately before the existing eye `IconButton` (before `CharacterTokenGearPanel.jsx:193`):

```jsx
                <IconButton size="small" disabled={hidden}
                  title={valuesHidden ? t('imageToken.showValues') : t('imageToken.hideValues')}
                  onClick={() => setBarHideValues(bar.id, !valuesHidden)}
                  sx={{ color: hidden ? '#bbb' : (valuesHidden ? '#b5482f' : '#5a7a42') }}>
                  <PinOutlinedIcon fontSize="small" />
                </IconButton>
```

- [ ] **Step 6: Update `CharacterTokenGearPanel.jsx` (added-bar row)**

In the added-bars map, insert the toggle immediately before the existing eye `IconButton` (before `CharacterTokenGearPanel.jsx:224`), reusing the row's `hidden` const:

```jsx
                <IconButton size="small" disabled={hidden}
                  title={bar.defaultHideValues ? t('imageToken.showValues') : t('imageToken.hideValues')}
                  onClick={() => updateAddedBar(bar.id, { defaultHideValues: !bar.defaultHideValues })}
                  sx={{ color: hidden ? '#bbb' : (bar.defaultHideValues ? '#b5482f' : '#5a7a42') }}>
                  <PinOutlinedIcon fontSize="small" />
                </IconButton>
```

- [ ] **Step 7: Lint the changed files**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/token-display/ImageTokenConfigPanel.jsx src/components/token-display/CharacterTokenGearPanel.jsx`
Expected: no errors.

- [ ] **Step 8: Verify i18n parity**

Run: `cd warhammer-battle-helper-front && node -e "const en=require('./src/locales/en/translation.json').imageToken, pl=require('./src/locales/pl/translation.json').imageToken; for (const k of ['hideValues','showValues']) if(!en[k]||!pl[k]) throw new Error('missing '+k); console.log('ok');"`
Expected: prints `ok`.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/ImageTokenConfigPanel.jsx warhammer-battle-helper-front/src/components/token-display/CharacterTokenGearPanel.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(token): hide-numbers toggle in bar config panels (FEATURE-139)"
```

---

### Task 6: End-to-end verification

**Files:** none (manual verification against the running stack).

- [ ] **Step 1: Full test suites pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/...`
Expected: PASS.

Run: `cd warhammer-battle-helper-front && npx jest src/components/token-display`
Expected: PASS.

- [ ] **Step 2: Manual GM + player check**

Using the local e2e recipe (see memory: JWT via cleared `activationToken`), with a scene containing a character token and an image token that have HP bars:

1. As GM, open each config/gear panel. Confirm the `PinOutlined` toggle sits next to the eye and is greyed + non-clickable while the bar's eye is off; clickable (green) once the bar is visible.
2. Turn a visible bar's numbers off (red pin). As GM the numbers still show on the token.
3. In a second browser as a card-less player, confirm the same bar renders its coloured fill but no `current / max` text, and that the raw numbers are absent from the network payload (devtools → the `bars`/`hpBars` entry has `current:0, max:0, pct:<n>`).

- [ ] **Step 3: Final branch review**

Invoke `superpowers:requesting-code-review` for the full diff, then `superpowers:finishing-a-development-branch`.
