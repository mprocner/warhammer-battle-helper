# BUG-192 — Truncated roll labels in the log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long attribute/skill/weapon names in chat log entries get clipped with an ellipsis and reveal the full name in a hover tooltip, in every game system.

**Architecture:** One CSS fix on `.log-list-item__character-name` gives the class the block context its existing `overflow`/`text-overflow` needs (they are inert on inline elements), plus one new self-contained component `components/log/TruncatedLabel.jsx` that adds the hover tooltip and fires it only when the text is actually clipped. All 23 usages of that class migrate to the component.

**Tech Stack:** React 18, `@testing-library/react` + Jest via CRA, i18next, existing `usePortalTooltip` hook (`components/common/PortalTooltip.jsx`).

**Spec:** `docs/superpowers/specs/BUG-192.md`

## Global Constraints

- Working directory for all frontend commands: `warhammer-battle-helper-front/`.
- Test command: `CI=true npm test -- --watchAll=false` (single file: add `--testPathPattern=<name>`). Bare `npx jest` does not work — CRA owns the config.
- Known baseline failure: `App.test.js` (axios ESM). Not a regression, ignore it.
- No new i18n keys in this change — the tooltip text is the label itself.
- jsdom computes no layout: `scrollWidth` and `clientWidth` always return 0. Any test of the "is clipped" condition must stub both (`fakeWidths` helper, pattern: `systems/custom/CustomSheetBody.smoke.test.jsx:9`).
- `usePortalTooltip` hides on a 100ms `setTimeout`, so any `mouseLeave` assertion needs `jest.useFakeTimers()`.
- Tooltip markup lands in `document.body` via a portal — assert on `document.body.querySelector('.portal-tooltip')`, not on the render container.
- Icon prefixes (`⚔ `, `😱 `) stay part of the tooltip text. Do not add a separate `prefix` prop.

## File Structure

**Create:**
- `src/components/log/TruncatedLabel.jsx` — the only unit that knows "clip the label, and reveal the full text on hover only when clipping happened". Owns its own `usePortalTooltip` instance, hardcodes the log label class, no styling decisions of its own.
- `src/components/log/TruncatedLabel.test.jsx` — behaviour of that component in isolation.

**Modify:**
- `src/components/LogWindow.css:154` — `.log-list-item__character-name` gains block context.
- 10 roll components (labels in `__description` — the bug) and 13 headers (`__header` — missing tooltip), listed per task below.
- `src/systems/custom/rolls/CustomRoll.smoke.test.jsx` — regression test for the reported case.

## Task 1: TruncatedLabel component + CSS fix

**Files:**
- Create: `warhammer-battle-helper-front/src/components/log/TruncatedLabel.jsx`
- Test: `warhammer-battle-helper-front/src/components/log/TruncatedLabel.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/LogWindow.css:154-163`

**Interfaces:**
- Consumes: `usePortalTooltip` from `../common/PortalTooltip` (returns `{ showTooltip(text, element), hideTooltip(), tooltipNode }`).
- Produces: default export `TruncatedLabel({ text, children, as })`.
  - `text: string` — required. Rendered when `children` is absent; **always** the tooltip content.
  - `children?: React.ReactNode` — optional. When given, rendered instead of `text` (for headers that append a `(username)` sub-span). Tooltip still shows `text`.
  - `as?: 'span' | 'strong'` — element to render, default `'span'`.
  - Always emits `className="log-list-item__character-name"`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/log/TruncatedLabel.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import TruncatedLabel from './TruncatedLabel';

// jsdom nie liczy layoutu — scrollWidth i clientWidth zawsze zwracają 0, więc warunek
// "tekst jest przycięty" nigdy sam z siebie nie zadziała. Podstawiamy obie miary na
// konkretnym węźle, żeby przetestować sam WARUNEK, nie zdolność jsdom do renderowania CSS.
function fakeWidths(el, { scrollWidth, clientWidth }) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

const LONG_LABEL = 'Odporność na działanie magii chaosu';

describe('TruncatedLabel', () => {
  it('keeps the full text in the DOM, because the clipping is visual and not textual', () => {
    const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
    const label = container.querySelector('.log-list-item__character-name');

    expect(label).not.toBeNull();
    expect(label.tagName).toBe('SPAN');
    expect(label.textContent).toBe(LONG_LABEL);
  });

  it('renders a <strong> when as="strong"', () => {
    const { container } = render(<TruncatedLabel as="strong" text={LONG_LABEL} />);

    expect(container.querySelector('.log-list-item__character-name').tagName).toBe('STRONG');
  });

  it('shows the full text in a tooltip when the label is clipped', () => {
    const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
    const label = container.querySelector('.log-list-item__character-name');

    fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(LONG_LABEL);
  });

  it('shows no tooltip when the label fits, because there is nothing hidden to reveal', () => {
    const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
    const label = container.querySelector('.log-list-item__character-name');

    fakeWidths(label, { scrollWidth: 100, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    expect(document.body.querySelector('.portal-tooltip')).toBeNull();
  });

  it('renders children instead of text, but still tooltips the text', () => {
    // Nagłówki coc7e/dnd5e dopisują "(username)" obok nazwy postaci. Renderujemy więc
    // gotowy JSX, ale w tooltipie ma zostać sama nazwa — inaczej hover powtarzałby to,
    // co i tak widać w linii.
    const { container } = render(
      <TruncatedLabel text="Grimhild">
        Grimhild<span> (player1)</span>
      </TruncatedLabel>
    );
    const label = container.querySelector('.log-list-item__character-name');
    expect(label.textContent).toBe('Grimhild (player1)');

    fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    expect(document.body.querySelector('.portal-tooltip').textContent).toContain('Grimhild');
  });

  it('hides the tooltip after mouseLeave, once usePortalTooltip\'s debounce timer fires', () => {
    // usePortalTooltip chowa tooltip przez setTimeout 100ms (PortalTooltip.jsx), więc
    // assert potrzebuje deterministycznego zegara zamiast realnego sleepa.
    jest.useFakeTimers();
    try {
      const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
      const label = container.querySelector('.log-list-item__character-name');
      fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });

      fireEvent.mouseEnter(label);
      expect(document.body.querySelector('.portal-tooltip')).not.toBeNull();

      fireEvent.mouseLeave(label);
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(document.body.querySelector('.portal-tooltip')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TruncatedLabel
```

Expected: FAIL — `Cannot find module './TruncatedLabel' from 'src/components/log/TruncatedLabel.test.jsx'`.

- [ ] **Step 3: Write the component**

Create `warhammer-battle-helper-front/src/components/log/TruncatedLabel.jsx`:

```jsx
import React from 'react';
import { usePortalTooltip } from '../common/PortalTooltip';

// Etykieta wpisu w logu: obcinana z ellipsis (klasa .log-list-item__character-name w
// LogWindow.css), z pełną treścią w tooltipie na hover.
//
// Tooltip odpala się TYLKO gdy tekst faktycznie został ucięty. Ellipsis jest sygnałem
// "jest więcej do przeczytania", więc etykieta, która się mieści, nie potrzebuje hinta.
// scrollWidth to szerokość nieobciętej treści, clientWidth widocznego boksa — różnią się
// dokładnie wtedy, gdy overflow:hidden coś uciął.
//
// Komponent trzyma własny usePortalTooltip zamiast brać handlery z propsów: z 23 miejsc
// użycia tylko CustomRoll ma dziś ten hook, więc plumbing propsów przez pozostałe 22
// pliki byłby czystym kosztem.
//
// children służy nagłówkom coc7e/dnd5e, które dopisują "(username)" obok nazwy postaci:
// renderujemy wtedy gotowy JSX, ale tooltip pokazuje samo `text`.
function TruncatedLabel({ text, children, as = 'span' }) {
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  const Tag = as;

  return (
    <>
      <Tag
        className="log-list-item__character-name"
        onMouseEnter={e => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth) showTooltip(text, el);
        }}
        onMouseLeave={hideTooltip}
      >
        {children ?? text}
      </Tag>
      {tooltipNode}
    </>
  );
}

export default TruncatedLabel;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TruncatedLabel
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Fix the CSS**

In `warhammer-battle-helper-front/src/components/LogWindow.css`, replace the `.log-list-item__character-name` block (lines 154-163):

```css
.log-list-item__character-name {
  font-family: var(--log-font-display);
  font-weight: 600;
  color: var(--log-brown-dark);
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

with:

```css
/* BUG-192: overflow i text-overflow są bezskuteczne na elemencie inline (CSS Overflow §2),
   a w .log-list-item__description ta klasa siedziała właśnie na inline <strong> — zostawał
   sam nowrap, czyli zakaz zawijania bez obiecanego skrócenia. inline-block daje im kontekst
   blokowy. W __header (flex-item) jest to no-op: flex i tak blokifikuje dzieci.
   vertical-align: bottom to korekta, nie kosmetyka — inline-block z overflow != visible ma
   baseline na dolnej krawędzi marginesu (CSS2.1 §10.8.1), więc bez tego etykieta osiadłaby
   niżej niż sąsiedni tekst w linii opisu. */
.log-list-item__character-name {
  font-family: var(--log-font-display);
  font-weight: 600;
  color: var(--log-brown-dark);
  font-size: 13px;
  display: inline-block;
  max-width: 100%;
  vertical-align: bottom;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 6: Run the full frontend suite**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Expected: PASS except the known `App.test.js` axios ESM baseline failure.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/log/TruncatedLabel.jsx \
        warhammer-battle-helper-front/src/components/log/TruncatedLabel.test.jsx \
        warhammer-battle-helper-front/src/components/LogWindow.css
git commit -m "fix: BUG-192 add TruncatedLabel and give log labels block context"
```

---

## Task 2: Migrate the custom system (the reported case)

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx:76-84`
- Modify: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomWeaponRoll.jsx:65-71`
- Test: `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.smoke.test.jsx` (append)

**Interfaces:**
- Consumes: `TruncatedLabel({ text, children, as })` from Task 1, default export at `../../../components/log/TruncatedLabel`.
- Produces: nothing new. `CustomRoll` keeps its own `usePortalTooltip` — it drives the pool dice tooltips at `CustomRoll.jsx:105` and is **not** dead code after this migration.

- [ ] **Step 1: Write the failing regression test**

Append to `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.smoke.test.jsx`, inside the existing `describe('CustomRoll', ...)` block:

```jsx
  // BUG-192: nazwa atrybutu z customowej karty jest wpisywana przez gracza, więc bywa długa.
  // jsdom nie liczy layoutu — podstawiamy szerokości, żeby przetestować warunek obcięcia.
  it('shows the full attribute name in a tooltip when the label is clipped', () => {
    const LONG_SKILL = 'Odporność na działanie magii chaosu';
    const data = { outcome: 'regular_success', roll: 45, target: 55, skillName: LONG_SKILL };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const label = container.querySelector('.log-list-item__description .log-list-item__character-name');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe(LONG_SKILL);

    Object.defineProperty(label, 'scrollWidth', { value: 300, configurable: true });
    Object.defineProperty(label, 'clientWidth', { value: 100, configurable: true });
    fireEvent.mouseEnter(label);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(LONG_SKILL);
  });
```

Update the import line at the top of that file from `import { render } from '@testing-library/react';` to:

```jsx
import { render, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomRoll.smoke
```

Expected: FAIL on `expect(tooltip).not.toBeNull()` — the label is a bare `<strong>` with no hover handler, so no `.portal-tooltip` is created.

- [ ] **Step 3: Migrate `CustomRoll.jsx`**

Add the import after the existing `usePortalTooltip` import:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace the header span (lines 76-78):

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')} />
```

Replace the description label (line 84):

```jsx
          {skillLabel && <strong className="log-list-item__character-name">{skillLabel}</strong>}
```

with:

```jsx
          {skillLabel && <TruncatedLabel as="strong" text={skillLabel} />}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomRoll
```

Expected: PASS — `CustomRoll.smoke.test.jsx` and `CustomRoll.modifier.test.jsx` both green.

- [ ] **Step 5: Migrate `CustomWeaponRoll.jsx`**

Add the import after the last `../` import at the top of the file:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace the header span (lines 65-67):

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')} />
```

Replace the description label (line 71):

```jsx
          <strong className="log-list-item__character-name">⚔ {weaponLabel}</strong>{' '}
```

with:

```jsx
          <TruncatedLabel as="strong" text={`⚔ ${weaponLabel}`} />{' '}
```

- [ ] **Step 6: Run the custom system tests**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=systems/custom
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/rolls/
git commit -m "fix: BUG-192 truncate custom roll labels in the log"
```

---

## Task 3: Migrate warhammer4e and the shared log components

Plain-string labels only — every site here renders a single expression, so no `children` prop is involved.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/warhammer4e/rolls/AttributeRoll.jsx:37-45`
- Modify: `warhammer-battle-helper-front/src/systems/warhammer4e/rolls/SkillRoll.jsx:37-45`
- Modify: `warhammer-battle-helper-front/src/systems/warhammer4e/rolls/WeaponRoll.jsx:46-54`
- Modify: `warhammer-battle-helper-front/src/components/log/MultiDiceRoll.jsx:13-15`
- Modify: `warhammer-battle-helper-front/src/components/log/SimpleDiceRoll.jsx:15-17`
- Modify: `warhammer-battle-helper-front/src/components/ToastStack.jsx:34`

**Interfaces:**
- Consumes: `TruncatedLabel({ text, as })` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Migrate `warhammer4e/rolls/AttributeRoll.jsx`**

Add after line 4:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 37-39:

```jsx
                    <span className="log-list-item__character-name">
                        {data.characterName || t('log.character')}
                    </span>
```

with:

```jsx
                    <TruncatedLabel text={data.characterName || t('log.character')} />
```

Replace line 45:

```jsx
                    <strong className="log-list-item__character-name">{attributeName}</strong>
```

with:

```jsx
                    <TruncatedLabel as="strong" text={attributeName} />
```

- [ ] **Step 2: Migrate `warhammer4e/rolls/SkillRoll.jsx`**

Add after line 4:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 37-39:

```jsx
                    <span className="log-list-item__character-name">
                        {characterName || t('log.character')}
                    </span>
```

with:

```jsx
                    <TruncatedLabel text={characterName || t('log.character')} />
```

Replace line 45:

```jsx
                    <strong className="log-list-item__character-name">{skillName}</strong>
```

with:

```jsx
                    <TruncatedLabel as="strong" text={skillName} />
```

- [ ] **Step 3: Migrate `warhammer4e/rolls/WeaponRoll.jsx`**

Add after line 4:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 46-48:

```jsx
                    <span className="log-list-item__character-name">
                        {characterName || t('log.character')}
                    </span>
```

with:

```jsx
                    <TruncatedLabel text={characterName || t('log.character')} />
```

Replace line 54:

```jsx
                    <strong className="log-list-item__character-name">{weaponName}</strong>
```

with:

```jsx
                    <TruncatedLabel as="strong" text={weaponName} />
```

- [ ] **Step 4: Migrate `components/log/MultiDiceRoll.jsx`**

Add a `TruncatedLabel` import next to the existing imports at the top:

```jsx
import TruncatedLabel from './TruncatedLabel';
```

Replace lines 13-15:

```jsx
                <span className="log-list-item__character-name">
                    {username || t('log.character')}
                </span>
```

with:

```jsx
                <TruncatedLabel text={username || t('log.character')} />
```

- [ ] **Step 5: Migrate `components/log/SimpleDiceRoll.jsx`**

Add next to the existing imports at the top:

```jsx
import TruncatedLabel from './TruncatedLabel';
```

Replace lines 15-17:

```jsx
                    <span className="log-list-item__character-name">
                        {username || t('log.character')}
                    </span>
```

with:

```jsx
                    <TruncatedLabel text={username || t('log.character')} />
```

- [ ] **Step 6: Migrate `components/ToastStack.jsx`**

Add next to the existing imports at the top:

```jsx
import TruncatedLabel from './log/TruncatedLabel';
```

Replace line 34:

```jsx
          <span className="log-list-item__character-name">{actorName}</span>
```

with:

```jsx
          <TruncatedLabel text={actorName} />
```

- [ ] **Step 7: Run the suite**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Expected: PASS except the known `App.test.js` baseline failure.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/warhammer4e/rolls/ \
        warhammer-battle-helper-front/src/components/log/MultiDiceRoll.jsx \
        warhammer-battle-helper-front/src/components/log/SimpleDiceRoll.jsx \
        warhammer-battle-helper-front/src/components/ToastStack.jsx
git commit -m "fix: BUG-192 truncate warhammer4e and shared log labels"
```

---

## Task 4: Migrate coc7e and dnd5e

These five headers append an optional `(username)` sub-span next to the character name, so they are the `children` case: the JSX is rendered as-is, while the tooltip carries only the character name.

`coc7e_dark_ages` has no `rolls/` directory of its own — it imports the coc7e components (`systems/coc7e_dark_ages/index.js:5-6`), so it inherits this change with no edit.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/coc7e/rolls/SkillRoll.jsx:61-73`
- Modify: `warhammer-battle-helper-front/src/systems/coc7e/rolls/WeaponRoll.jsx:23-35`
- Modify: `warhammer-battle-helper-front/src/systems/coc7e/rolls/SanityRoll.jsx:23-37`
- Modify: `warhammer-battle-helper-front/src/systems/dnd5e/rolls/SkillRoll.jsx:96-104`
- Modify: `warhammer-battle-helper-front/src/systems/dnd5e/rolls/WeaponRoll.jsx:70-78`

**Interfaces:**
- Consumes: `TruncatedLabel({ text, children, as })` from Task 1. When `children` is passed, `text` is tooltip-only.
- Produces: nothing new.

- [ ] **Step 1: Migrate `coc7e/rolls/SkillRoll.jsx`**

Add after line 6:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 61-67:

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')}>
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </TruncatedLabel>
```

Replace line 73:

```jsx
          <strong className="log-list-item__character-name">{displayName}</strong>
```

with:

```jsx
          <TruncatedLabel as="strong" text={displayName} />
```

- [ ] **Step 2: Migrate `coc7e/rolls/WeaponRoll.jsx`**

Add after line 5:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 23-29:

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')}>
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </TruncatedLabel>
```

Replace line 35:

```jsx
          <strong className="log-list-item__character-name">⚔ {data.weaponName}</strong>
```

with:

```jsx
          <TruncatedLabel as="strong" text={`⚔ ${data.weaponName}`} />
```

- [ ] **Step 3: Migrate `coc7e/rolls/SanityRoll.jsx`**

Add after line 5:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 23-29:

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')}>
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </TruncatedLabel>
```

Replace lines 35-37:

```jsx
          <strong className="log-list-item__character-name">
            😱 {t('coc.sanityRoll')}
          </strong>
```

with:

```jsx
          <TruncatedLabel as="strong" text={`😱 ${t('coc.sanityRoll')}`} />
```

- [ ] **Step 4: Migrate `dnd5e/rolls/SkillRoll.jsx`**

Add after line 5:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 96-99:

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && <span style={{ fontWeight: 400 }}> ({data.username})</span>}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')}>
            {data.characterName || t('log.character')}
            {data.username && <span style={{ fontWeight: 400 }}> ({data.username})</span>}
          </TruncatedLabel>
```

Replace line 104:

```jsx
          <strong className="log-list-item__character-name">{translateSkillKey(data.skillKey, t)}</strong>
```

with:

```jsx
          <TruncatedLabel as="strong" text={translateSkillKey(data.skillKey, t)} />
```

- [ ] **Step 5: Migrate `dnd5e/rolls/WeaponRoll.jsx`**

Add after line 5:

```jsx
import TruncatedLabel from '../../../components/log/TruncatedLabel';
```

Replace lines 70-73:

```jsx
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && <span style={{ fontWeight: 400 }}> ({data.username})</span>}
          </span>
```

with:

```jsx
          <TruncatedLabel text={data.characterName || t('log.character')}>
            {data.characterName || t('log.character')}
            {data.username && <span style={{ fontWeight: 400 }}> ({data.username})</span>}
          </TruncatedLabel>
```

Replace line 78:

```jsx
          <strong className="log-list-item__character-name">⚔ {data.weaponName}</strong>
```

with:

```jsx
          <TruncatedLabel as="strong" text={`⚔ ${data.weaponName}`} />
```

- [ ] **Step 6: Verify no bare usages of the class are left in JSX**

```bash
cd warhammer-battle-helper-front/src && grep -rn "className=\"log-list-item__character-name\"" --include="*.jsx" . | grep -v TruncatedLabel.jsx
```

Expected: no output. The only remaining occurrences of that class name in JSX are inside `components/log/TruncatedLabel.jsx` (the component itself), plus test files that query by the class, which this grep ignores because they use `querySelector('.log-list-item__character-name')`, not a `className=` attribute.

- [ ] **Step 7: Run the suite**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Expected: PASS except the known `App.test.js` baseline failure.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/coc7e/rolls/ \
        warhammer-battle-helper-front/src/systems/dnd5e/rolls/
git commit -m "fix: BUG-192 truncate coc7e and dnd5e log labels"
```

---

## Task 5: Visual verification of the baseline risk

The spec flags one risk that no jsdom test can catch: `inline-block` + `overflow: hidden` moves the element's baseline to its bottom margin edge (CSS2.1 §10.8.1), so the label could sit lower than the surrounding text in the description line. `vertical-align: bottom` is the correction, and only a browser can confirm it landed right.

**Files:**
- Possibly modify: `warhammer-battle-helper-front/src/components/LogWindow.css` (only if the baseline is visibly off)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing.

- [ ] **Step 1: Run the app**

Use the project's docker stack, or `cd warhammer-battle-helper-front && npm start`. If working in a git worktree, note the CORS/mount constraint — read the `worktree-browser-testing` note before serving a worktree branch on :3000.

- [ ] **Step 2: Create a custom character with a long attribute name**

On a custom character card, add an attribute field named `Odporność na działanie magii chaosu`, then roll it. Check the log entry.

Expected:
- The name is cut with a visible `…`.
- The roll value and `vs <target>` wrap to a second line of the same entry.
- Nothing overflows the log panel's right edge.
- The label's text baseline lines up with the rest of the description text, with no visible 1-2px drop.

- [ ] **Step 3: Hover the clipped label**

Expected: the portal tooltip appears with the full name.

- [ ] **Step 4: Check a short label for regressions**

Roll a normal Warhammer skill (e.g. `Percepcja`). Expected: the entry looks exactly as before — no ellipsis, roll value on the same line, no vertical shift.

- [ ] **Step 5: If the baseline is visibly off, switch the correction**

In `LogWindow.css`, change `vertical-align: bottom;` to `vertical-align: text-bottom;` inside `.log-list-item__character-name`, then repeat Steps 2 and 4.

- [ ] **Step 6: Commit only if Step 5 changed something**

```bash
git add warhammer-battle-helper-front/src/components/LogWindow.css
git commit -m "fix: BUG-192 align clipped log label to text-bottom"
```

---

## Self-Review

**Spec coverage:**
- Root cause (inline `overflow`) → Task 1 Step 5.
- New `TruncatedLabel` component with clip-conditional tooltip → Task 1 Steps 1-4.
- All 10 `__description` call sites → Task 2 (2), Task 3 (3), Task 4 (5).
- All 13 `__header` call sites → Task 2 (2), Task 3 (6), Task 4 (5).
- `coc7e_dark_ages` inherits via import → stated in Task 4, no edit needed.
- `CustomRoll` keeps its `usePortalTooltip` for pool dice → stated in Task 2 Interfaces.
- Layout decision (label up to 100%, tail wraps) → `max-width: 100%` in Task 1 Step 5, verified in Task 5 Step 2.
- Test list from the spec → Task 1 Step 1 (items 1-4) + Task 2 Step 1 (the `CustomRoll` regression).
- Baseline risk → Task 5.
- Existing-tests risk → covered by the full-suite runs in Tasks 1, 3, 4.
- No new i18n keys → Global Constraints.

**Placeholder scan:** none — every code step carries the literal before/after text.

**Type consistency:** `TruncatedLabel({ text, children, as })` is defined once in Task 1 and every later call site uses exactly `text`, `children`, `as="strong"`. No `className` prop exists anywhere, matching the component that hardcodes the class.
