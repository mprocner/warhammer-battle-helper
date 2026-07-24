# FEATURE-144 — Bar Labels on Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pokazać label paska HP/zasobu na tokenie (image + character), w tracku z lewej gdy token zaznaczony, z tooltipem pełnego labela na hover.

**Architecture:** Label renderowany w współdzielonym `TokenHpBar` (chrome paska). Widoczny wewnątrz tracku, z lewej; wartość dosunięta do prawej; tylko gdy `selected`. Tooltip przez istniejący `usePortalTooltip` dostępny w `TokenRingChrome` — przekazany do `renderHp` tak jak już jest do `renderExtras`. Trzy call-sites (2 w TokenOverlay, 1 w ImageTokenOverlay) przekazują `label`/`selected`/tooltip-fns.

**Tech Stack:** React, MUI, CSS BEM (`style.css`). Brak frameworka testowego dla token chrome — weryfikacja manualna w działającej apce (docker stack, recepta e2e w pamięci projektu).

## Global Constraints

- Brak nowych kluczy i18n — label to dane użytkownika (`bar.label`), nie `t()`. Nie hardcodować żadnych stringów UI.
- Tooltip: wyłącznie istniejący portal tooltip (`usePortalTooltip` z `common/PortalTooltip`), nigdy MUI `<Tooltip>`.
- Zmiana czysto frontendowa — zero zmian w backendzie/modelu. Backend baked `TokenViewBar` już niesie `Label`.
- Oba typy tokenów (image + character) i obie ścieżki widoku (live GM + baked player) muszą działać.
- Usuwać martwy kod od razu; częste commity.

---

### Task 1: TokenHpBar — label w tracku + tooltip + CSS

Rozszerza współdzielony `TokenHpBar` o label i hover-tooltip oraz dodaje CSS trybu „labeled". Po tym tasku żaden wrapper jeszcze nie podaje labela, więc feature niewidoczny — cel tasku: chrome gotowe, istniejące paski renderują się bez regresji.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx` (TokenHpBar ~18-34; wywołanie `renderHp` ~139)
- Modify: `warhammer-battle-helper-front/src/style.css` (po `.token-hp__text` ~10503)

**Interfaces:**
- Produces: `TokenHpBar` przyjmuje dodatkowo `label?: string`, `selected?: boolean`, `showTooltip?: (text, el) => void`, `hideTooltip?: () => void`. Brak tych propsów = zachowanie jak dziś (wartość wyśrodkowana, brak tooltipa).
- Produces: `renderHp` jest teraz wołane jako `renderHp({ showTooltip, hideTooltip })` (wcześniej bez argumentów).
- Produces CSS: klasy `.token-hp__row`, `.token-hp__label` (współdzielone przez oba stacki, bo image reużywa `.token-hp__*`).

- [ ] **Step 1: Rozszerz `TokenHpBar` w `TokenRingChrome.jsx`**

Zamień całą funkcję `TokenHpBar` (linie ~18-34) na:

```jsx
// Inner HP bar visual (track + fill + value + optional ± buttons). Shared by both HP models.
// When selected AND a label is present, the track shows the label on the left and the value on
// the right (labeled row); otherwise the value stays centered as before. Hovering a labelled bar
// shows the full label via the caller-supplied portal tooltip (survives ellipsis truncation).
export function TokenHpBar({ current, max, pct, tone, color, canEdit, onStep, label, selected, showTooltip, hideTooltip }) {
  const hasLabel = !!label;
  const showLabel = selected && hasLabel;
  const valueText = `${current}${max ? ` / ${max}` : ''}`;
  return (
    <>
      {canEdit && (
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
            <span className="token-hp__text">{valueText}</span>
          </div>
        ) : (
          <span className="token-hp__text">{valueText}</span>
        )}
      </div>
      {canEdit && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(1); }}>+</button>
      )}
    </>
  );
}
```

- [ ] **Step 2: Przekaż tooltip-fns do `renderHp`**

W `TokenRingChrome.jsx` znajdź (linia ~139):

```jsx
      {renderHp && renderHp()}
```

Zamień na:

```jsx
      {renderHp && renderHp({ showTooltip, hideTooltip })}
```

- [ ] **Step 3: Dodaj CSS trybu labeled w `style.css`**

Wstaw bezpośrednio po regule `.token-hp--expanded .token-hp__text { font-size: 8px; }` (linia ~10503):

```css
/* Labeled bar (selected + label): label left, value right, over the fill.
   Value has priority (never truncates); label ellipsises. Shared by both token stacks. */
.token-hp__row {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: space-between; gap: 4px; padding: 0 4px;
}
.token-hp__row .token-hp__text { position: static; inset: auto; flex: 0 0 auto; }
.token-hp__label {
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 8px; font-weight: 700; color: rgba(255,255,255,0.95);
  text-shadow: 0 1px 1px rgba(0,0,0,0.6);
}
```

- [ ] **Step 4: Weryfikacja regresji — build + render bez labela**

Uruchom lint/build:

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: build przechodzi bez błędów.

Manualnie (docker stack, GM + token z ≥1 paskiem, jeszcze bez labela w kodzie wrapperów): zaznacz token — paski renderują się jak dotąd (wartość wyśrodkowana), brak crashy, brak zmian wizualnych. To potwierdza brak regresji przed podpięciem wrapperów.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx warhammer-battle-helper-front/src/style.css
git commit -m "feat(token): TokenHpBar supports in-track label + tooltip (FEATURE-144)"
```

---

### Task 2: Podepnij label w 3 call-sites

Przekazuje `label`/`selected`/tooltip-fns do `TokenHpBar` we wszystkich trzech miejscach renderujących paski — dopiero to uwidacznia feature.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/TokenOverlay.jsx` (player path ~106-117; GM path ~204-216)
- Modify: `warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx` (~81-93)

**Interfaces:**
- Consumes: `TokenHpBar({ ..., label, selected, showTooltip, hideTooltip })` oraz `renderHp({ showTooltip, hideTooltip })` z Task 1.
- Consumes: `bar.label` — obecne na `tokenView.bars` (baked, niesie Label), `composedBars` (spread `...bar` z config.hpBars/addedBars) oraz image `bars` (z overlay.hpBars).

- [ ] **Step 1: TokenOverlay — player baked path**

Znajdź blok (linie ~106-117):

```jsx
        renderHp={() => (tokenView.bars || []).length > 0 ? (
          <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
            {tokenView.bars.map(bar => {
              const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
              return (
                <div key={bar.id} className="token-hp">
                  <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color} canEdit={false} onStep={() => {}} />
                </div>
              );
            })}
          </div>
        ) : null}
```

Zamień na:

```jsx
        renderHp={({ showTooltip, hideTooltip }) => (tokenView.bars || []).length > 0 ? (
          <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
            {tokenView.bars.map(bar => {
              const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
              return (
                <div key={bar.id} className="token-hp">
                  <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color} canEdit={false} onStep={() => {}}
                    label={bar.label} selected={selected} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                </div>
              );
            })}
          </div>
        ) : null}
```

- [ ] **Step 2: TokenOverlay — GM live path**

Znajdź blok (linie ~204-216):

```jsx
      renderHp={() => (overlayEnabled && composedBars.length > 0) ? (
        <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
          {composedBars.map(bar => {
            const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
            return (
              <div key={bar.id} className="token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color}
                  canEdit={selected && canEdit && bar.manual} onStep={(d) => stepBar(bar.id, d)} />
              </div>
            );
          })}
        </div>
      ) : null}
```

Zamień na:

```jsx
      renderHp={({ showTooltip, hideTooltip }) => (overlayEnabled && composedBars.length > 0) ? (
        <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
          {composedBars.map(bar => {
            const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
            return (
              <div key={bar.id} className="token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color}
                  canEdit={selected && canEdit && bar.manual} onStep={(d) => stepBar(bar.id, d)}
                  label={bar.label} selected={selected} showTooltip={showTooltip} hideTooltip={hideTooltip} />
              </div>
            );
          })}
        </div>
      ) : null}
```

- [ ] **Step 3: ImageTokenOverlay — paski image**

Znajdź blok (linie ~81-93):

```jsx
      renderHp={() => bars.length > 0 ? (
        <div className={`img-token-hp-stack ${selected ? 'img-token-hp-stack--expanded' : ''}`} style={{ transform: hpTransform }}>
          {bars.map(bar => {
            const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
            return (
              <div key={bar.id} className="img-token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpTone(pct)} color={bar.color}
                  canEdit={selected && canEdit} onStep={(d) => stepHP(bar.id, d)} />
              </div>
            );
          })}
        </div>
      ) : null}
```

Zamień na:

```jsx
      renderHp={({ showTooltip, hideTooltip }) => bars.length > 0 ? (
        <div className={`img-token-hp-stack ${selected ? 'img-token-hp-stack--expanded' : ''}`} style={{ transform: hpTransform }}>
          {bars.map(bar => {
            const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
            return (
              <div key={bar.id} className="img-token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpTone(pct)} color={bar.color}
                  canEdit={selected && canEdit} onStep={(d) => stepHP(bar.id, d)}
                  label={bar.label} selected={selected} showTooltip={showTooltip} hideTooltip={hideTooltip} />
              </div>
            );
          })}
        </div>
      ) : null}
```

- [ ] **Step 4: Weryfikacja manualna pełnego zachowania**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: build przechodzi.

W działającej apce (docker stack), oba typy tokenów:

1. Character token z ≥1 paskiem + label w kreatorze/popupie → zaznacz: label z lewej w tracku, wartość z prawej. W spoczynku: sama wartość wyśrodkowana.
2. Kilka pasków z różnymi labelami → każdy rozróżnialny.
3. Długi label → obcięty ellipsisem, wartość pełna; hover na pasku → tooltip pełnego labela.
4. Pasek bez labela → brak tekstu z lewej, wartość wyśrodkowana, brak tooltipa.
5. Image token — te same 4 sprawdzenia.
6. Widok gracza (baked): label ukrytego paska nie wycieka (pasek w ogóle niewidoczny), labele jawnych pasków widoczne.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/TokenOverlay.jsx warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx
git commit -m "feat(token): show bar labels on image + character tokens (FEATURE-144)"
```

---

## Notatki weryfikacyjne

- Brak automatycznych testów dla token chrome w repo — weryfikacja manualna wg recepty e2e (JWT na lokalnym docker stack: wyczyść `activationToken`, konto nieaktywne). `npm run build` jako bramka regresji składni/JSX.
- `bar.label` w ImageTokenOverlay: potwierdzone — `bars = overlay.hpBars` (linia 28), każdy bar to surowy `ImageTokenHPBar` z polem `label`. Dla gracza `overlay` jest maskowany server-side (ukryte paski usunięte), więc labele tylko jawnych pasków.
