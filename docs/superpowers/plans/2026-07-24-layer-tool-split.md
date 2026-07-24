# Layer/Tool Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozdzielić wybór warstwy obrazu (bg/tokens/gm) od paska narzędzi sceny — nowy pionowy selektor warstw obok odchudzonego `DrawingToolbar`, z scaleniem trybów `grid`+`select` w jedno narzędzie Select/Move.

**Architecture:** `imageEditLayer` (armed layer) przenosi się z pickera wewnątrz `DrawingToolbar` do nowego, stałego komponentu `LayerSelector` (GM-only, pionowy, prawy-dolny róg nad narzędziami). Tryb `grid` znika; jego zdolności (resize/rotate bg/GM, wygaszanie warstw nieuzbrojonych) przechodzą do `select` przez przedefiniowanie `isLayerArmed` w `SceneImage`. `DndContext` owija oba widżety we wspólny kontener `scene-tools`.

**Tech Stack:** React (react-scripts/CRA), `@mui/icons-material`, i18next, jest + @testing-library/react, CSS BEM.

## Global Constraints

- i18n: żadnych stringów w JSX — zawsze `t('klucz')`. Klucze angielskie jako domyślne; en i pl równolegle.
- Ikony wyłącznie z `@mui/icons-material`.
- Tooltip: bez MUI `<Tooltip>`. W obrębie klastra narzędzi używamy CSS-span tooltipu (wzorzec `.drawing-toolbar__tooltip`), by nowy `LayerSelector` był wizualnie spójny z sąsiadem.
- Paleta kart/toolbara: ciemny tekst na jasnym tle, złoty akcent `#c9975b`, brąz `#7a5c42`, ramka `#d4a574`.
- Brak backward-compat — martwe klucze i18n / CSS usuwamy od razu.
- `editingLayer` po zmianie: `null` | `select` | `fog` | `drawing` | `measure`. Wartość `grid` nie może zostać nigdzie w kodzie.

---

### Task 1: Komponent `LayerSelector` (TDD)

Nowy, izolowany widżet — pionowy pasek 3 warstw, GM-only. Idealny do testu jednostkowego.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/LayerSelector.jsx`
- Create: `warhammer-battle-helper-front/src/components/scene/LayerSelector.css`
- Test: `warhammer-battle-helper-front/src/components/scene/LayerSelector.smoke.test.jsx`

**Interfaces:**
- Produces: `LayerSelector` — props `{ imageEditLayer: string, onImageEditLayerChange: (v: string) => void, isGM: boolean }`. Renderuje `null` gdy `!isGM`. Przyciski warstw mają klasę `.layer-selector__btn`, aktywny dodatkowo `.layer-selector__btn--active`. Kolejność: `tokens`, `gm`, `background`. Etykiety krótkie: Tokens / GM / Background (gm używa `layerGmShort`), tooltip pełny (`layerGm` = "GM Layer").

- [ ] **Step 1: Test — GM widzi 3 warstwy, klik woła callback, aktywna oznaczona, non-GM pusto**

Utwórz `LayerSelector.smoke.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import LayerSelector from './LayerSelector';

describe('LayerSelector', () => {
  it('renders three layer buttons for GM', () => {
    render(<LayerSelector imageEditLayer="background" onImageEditLayerChange={() => {}} isGM />);
    expect(document.querySelectorAll('.layer-selector__btn')).toHaveLength(3);
  });

  it('renders nothing for non-GM', () => {
    const { container } = render(
      <LayerSelector imageEditLayer="background" onImageEditLayerChange={() => {}} isGM={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('marks the armed layer active', () => {
    render(<LayerSelector imageEditLayer="tokens" onImageEditLayerChange={() => {}} isGM />);
    const active = document.querySelectorAll('.layer-selector__btn--active');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('Tokens');
  });

  it('calls onImageEditLayerChange when a layer is clicked', () => {
    const onChange = jest.fn();
    render(<LayerSelector imageEditLayer="background" onImageEditLayerChange={onChange} isGM />);
    // label 'GM' comes from scenes.layerGmShort; getAllByText because the tooltip span
    // ('GM Layer' from scenes.layerGm) also lives in the same button — take the label node.
    fireEvent.click(screen.getByText('GM').closest('.layer-selector__btn'));
    expect(onChange).toHaveBeenCalledWith('gm');
  });
});
```

> Zweryfikowane wartości en: `layerTokens='Tokens'`, `layerGmShort='GM'`, `layerGm='GM Layer'`, `layerBackground='Background'`. Etykieta gm = `layerGmShort` ('GM'), więc `getByText('GM')` łapie węzeł etykiety (tooltip ma osobny tekst 'GM Layer').

- [ ] **Step 2: Uruchom test — ma failować (brak modułu)**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/components/scene/LayerSelector.smoke.test.jsx --watchAll=false`
Expected: FAIL — `Cannot find module './LayerSelector'`.

- [ ] **Step 3: Implementacja `LayerSelector.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import GroupsIcon from '@mui/icons-material/Groups';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import WallpaperIcon from '@mui/icons-material/Wallpaper';
import './LayerSelector.css';

// Armed image layer picker — split out of DrawingToolbar so choosing a layer
// (bg/tokens/gm) is independent from picking a tool. GM-only; always visible.
// Order top→bottom matches the tool cluster mockup: tokens / gm / background.
// labelKey = krótka etykieta na pasku; titleKey = pełny tekst w tooltipie
// (domyślnie ten sam co label). gm ma krótkie 'GM' + tooltip 'GM Layer'.
const LAYERS = [
  { value: 'tokens',     Icon: GroupsIcon,             labelKey: 'scenes.layerTokens' },
  { value: 'gm',         Icon: AdminPanelSettingsIcon, labelKey: 'scenes.layerGmShort', titleKey: 'scenes.layerGm' },
  { value: 'background', Icon: WallpaperIcon,          labelKey: 'scenes.layerBackground' },
];

const LayerSelector = ({ imageEditLayer, onImageEditLayerChange, isGM }) => {
  const { t } = useTranslation();
  if (!isGM) return null;

  return (
    <div className="layer-selector">
      {LAYERS.map(({ value, Icon, labelKey, titleKey }) => (
        <button
          key={value}
          className={`layer-selector__btn ${imageEditLayer === value ? 'layer-selector__btn--active' : ''}`}
          onClick={() => onImageEditLayerChange(value)}
        >
          <Icon style={{ fontSize: 20 }} />
          <span className="layer-selector__label">{t(labelKey)}</span>
          <span className="layer-selector__tooltip">{t(titleKey || labelKey)}</span>
        </button>
      ))}
    </div>
  );
};

export default LayerSelector;
```

> `.layer-selector__label` jest po to, by test `textContent` łapał nazwę warstwy i by ikona miała podpis; w CSS możesz go schować wizualnie (patrz niżej) lub zostawić widoczny — decyzja wizualna w Step 4.

- [ ] **Step 4: Implementacja `LayerSelector.css`**

```css
/* =====================================================
   LayerSelector — pionowy pasek warstw obrazu (GM)
   Spójny z pergaminowym motywem DrawingToolbar.
   ===================================================== */

.layer-selector {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  pointer-events: auto;
}

.layer-selector__btn {
  position: relative;
  overflow: visible;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #d4a574;
  border-radius: 6px;
  background: linear-gradient(135deg, #f9f3e8 0%, #f4e8d8 100%);
  color: #6b4423;
  font-family: 'Cinzel', serif;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease-out, border-color 0.15s ease-out;
}

.layer-selector__btn:hover {
  background: linear-gradient(135deg, #ffffff 0%, #fff9f0 100%);
}

.layer-selector__btn--active {
  background: linear-gradient(135deg, #c9975b 0%, #a67c52 100%);
  color: #fff;
  border-color: #7a5c42;
}

.layer-selector__label {
  white-space: nowrap;
}

/* Tooltip — ten sam wzorzec co DrawingToolbar (CSS span, po lewej przycisku). */
.layer-selector__tooltip {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #fff9f0 0%, #f4e8d8 100%);
  color: #3a2f1f;
  padding: 5px 9px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Cinzel', serif;
  white-space: nowrap;
  pointer-events: none;
  border: 1px solid #c9975b;
  box-shadow: 0 2px 8px rgba(107, 68, 35, 0.25);
  z-index: 200;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.15s ease-out, visibility 0.15s ease-out;
}

.layer-selector__btn:hover .layer-selector__tooltip {
  visibility: visible;
  opacity: 1;
}
```

> Etykieta obok ikony jest widoczna (pasek jest wąski, 3 pozycje) — tooltip pełni rolę pomocniczą i można go pominąć wizualnie, ale zostaje dla spójności/hoveru. Jeśli w Step 5 pasek okaże się za szeroki, ukryj `.layer-selector__label` (`position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0);`) i zostaw sam tooltip — wtedy popraw asercję z `textContent` w teście na `title`/aria zamiast tekstu.

- [ ] **Step 5: Uruchom test — ma przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/components/scene/LayerSelector.smoke.test.jsx --watchAll=false`
Expected: PASS (4 testy).

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/LayerSelector.jsx warhammer-battle-helper-front/src/components/scene/LayerSelector.css warhammer-battle-helper-front/src/components/scene/LayerSelector.smoke.test.jsx
git commit -m "feat(scene): LayerSelector — dedicated armed-layer picker (GM)"
```

---

### Task 2: Odchudzenie `DrawingToolbar` — usunięcie trybu `grid` i pickera warstw

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.css`
- Test: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx` (create)

**Interfaces:**
- Consumes: nic nowego.
- Produces: `DrawingToolbar` bez propsów `imageEditLayer`, `onImageEditLayerChange`. Rząd zakładek GM: `pan (null) | fog | drawing | measure | select`. Brak zakładki `grid` i brak `ToggleButtonGroup` warstw.

- [ ] **Step 1: Test — brak zakładki Images, pozostałe narzędzia obecne**

Utwórz `DrawingToolbar.smoke.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import DrawingToolbar from './DrawingToolbar';

const baseProps = {
  editingLayer: null,
  onEditingLayerChange: () => {},
  activeTool: 'select',
  onActiveToolChange: () => {},
  brushSize: 10,
  onBrushSizeChange: () => {},
  drawingColor: '#ff0000',
  onDrawingColorChange: () => {},
  drawingFontSize: 16,
  onDrawingFontSizeChange: () => {},
  onUndoDrawing: () => {}, onClearDrawing: () => {},
  onUndoFog: () => {}, onClearFog: () => {}, onRevealAllFog: () => {},
  onDeleteSelected: () => {},
  isGM: true, canUndo: false, canUndoFog: false,
};

describe('DrawingToolbar after layer split', () => {
  it('no longer renders the Images (grid) tab', () => {
    render(<DrawingToolbar {...baseProps} />);
    expect(screen.queryByText('Image layers')).toBeNull();
  });

  it('renders the select tab', () => {
    render(<DrawingToolbar {...baseProps} />);
    // select tab tooltip uses scenes.selectLayer = 'Select tokens'
    expect(screen.getByText('Select tokens')).toBeInTheDocument();
  });
});
```

> Zweryfikowane wartości en: `imageLayers='Image layers'` (usuwany w Task 4), `selectLayer='Select tokens'`.

- [ ] **Step 2: Uruchom test — pierwszy przypadek failuje (grid jeszcze jest)**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/components/scene/DrawingToolbar.smoke.test.jsx --watchAll=false`
Expected: FAIL — `queryByText('Image layers')` znajduje węzeł (zakładka Images wciąż renderowana).

- [ ] **Step 3: Usuń zakładkę `grid` z rzędu zakładek GM**

W `DrawingToolbar.jsx` usuń cały blok `<div className="drawing-toolbar__tab-wrap">…</div>` (zakładka Images + `drawing-toolbar__layer-caption`), tj. obecne linie ~109–121:

```jsx
          <div className="drawing-toolbar__tab-wrap">
            <button
              className={`drawing-toolbar__tab ${editingLayer === 'grid' ? 'drawing-toolbar__tab--active' : ''}`}
              onClick={() => onEditingLayerChange(editingLayer === 'grid' ? null : 'grid')}
            >
              <ImageIcon style={{ fontSize: 22 }} />
              <span className="drawing-toolbar__tooltip">{t('scenes.imageLayers')}</span>
            </button>
            <span className="drawing-toolbar__layer-caption">
              {t(IMAGE_LAYERS.find(l => l.value === imageEditLayer)?.captionKey || 'scenes.layerBackground')}
            </span>
          </div>
```

Skasuj ten fragment w całości.

- [ ] **Step 4: Usuń picker warstw (`ToggleButtonGroup` z `IMAGE_LAYERS`)**

Usuń cały blok gated `editingLayer === 'grid' || editingLayer === 'select'` (obecne linie ~170–213), od komentarza `{/* Image-layer picker … */}` do zamykającego `)}` tego bloku.

- [ ] **Step 5: Usuń stałą `IMAGE_LAYERS` i martwe importy/propsy**

- Usuń stałą `const IMAGE_LAYERS = [ … ];` (linie ~32–37) wraz z komentarzem nad nią.
- Usuń importy używane tylko przez usunięte fragmenty: `ImageIcon`, `WallpaperIcon`, `GroupsIcon`, `AdminPanelSettingsIcon`.
  - ZOSTAW `ToggleButton`, `ToggleButtonGroup`, `VisibilityIcon`, `VisibilityOffIcon` — używa ich nadal toggle Reveal/Cover w trybie fog.
- Usuń z sygnatury props `imageEditLayer = 'background'` oraz `onImageEditLayerChange` (nie są już używane).

- [ ] **Step 6: Usuń martwy CSS**

W `DrawingToolbar.css` usuń reguły `.drawing-toolbar__layer-caption` oraz `.drawing-toolbar__tab-wrap` (jeśli występują). Zostaw resztę.

Run (weryfikacja że nie ma już odwołań):
`cd warhammer-battle-helper-front && grep -rn "layer-caption\|tab-wrap\|IMAGE_LAYERS\|imageEditLayer" src/components/scene/DrawingToolbar.jsx src/components/scene/DrawingToolbar.css`
Expected: brak wyników.

- [ ] **Step 7: Uruchom testy — mają przejść**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test src/components/scene/DrawingToolbar.smoke.test.jsx --watchAll=false`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx warhammer-battle-helper-front/src/components/scene/DrawingToolbar.css warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx
git commit -m "refactor(scene): drop Images tab + layer picker from DrawingToolbar"
```

---

### Task 3: Scalenie `grid`→`select` w `SceneImage`

Przeniesienie zdolności trybu Images (drag + resize/rotate bg/GM + wygaszanie) do trybu `select`. Zmiana interakcyjna — weryfikacja manualna w Tasku 5; tu dokładne diffy + build.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx`

**Interfaces:**
- Consumes: `editingLayer` (już `select`, bez `grid`), `imageEditLayer`.
- Produces: `isLayerArmed` = obraz na uzbrojonej warstwie w trybie `select`; steruje drag + uchwytami resize/rotate. `isSelectArmed` przestaje istnieć (złożone w `isLayerArmed`).

- [ ] **Step 1: Przedefiniuj flagi warstwy**

W `SceneImage.jsx` (linie ~16–27) zamień:

```jsx
  // In Images ('grid') mode only the armed layer is manipulable; images on other layers
  // are dimmed + inert. Outside grid mode nothing here is armed.
  const isLayerArmed = editingLayer === 'grid' && image.layer === imageEditLayer;
  const isLayerInert = editingLayer === 'grid' && image.layer !== imageEditLayer;
  // A token-layer image can be dragged both when its layer is armed (Images mode) AND in Pan
  // mode (editingLayer null) — like a character token, tokens are the interactive pieces you
  // move around the map. Resize/rotate stay gated to Images mode to avoid clutter; background
  // and GM images are only editable when their layer is armed.
  // In Select mode the armed layer's images are draggable too (single move, like Pan/Images mode),
  // so you can reposition one without leaving Select. Marquee starts only on empty/locked/non-armed.
  const isSelectArmed = editingLayer === 'select' && image.layer === imageEditLayer;
  const canDragImage = isGM && !image.locked && (isLayerArmed || isSelectArmed || (image.layer === 'tokens' && (editingLayer === null || activeTool === 'pan')));
```

na:

```jsx
  // Select/Move mode: only the armed image layer is manipulable — its images drag, resize and
  // rotate (bg/GM show handles); images on other layers are dimmed + inert and act as a marquee
  // backdrop. Token-layer images are also draggable in Pan mode (editingLayer null / pan tool),
  // like character tokens — the interactive pieces you move around the map.
  const isLayerArmed = editingLayer === 'select' && image.layer === imageEditLayer;
  const isLayerInert = editingLayer === 'select' && image.layer !== imageEditLayer;
  const canDragImage = isGM && !image.locked && (isLayerArmed || (image.layer === 'tokens' && (editingLayer === null || activeTool === 'pan')));
```

- [ ] **Step 2: Sprawdź komentarz przy `handleMouseDown`**

Linia ~104–105 zawiera komentarz `(canDragImage now includes Select mode via isSelectArmed)`. Zmień na:

```jsx
      // Otherwise an armed-layer image: fall through to the normal single-image drag below
      // (canDragImage covers the armed layer via isLayerArmed).
```

(Logika `if (editingLayer === 'select') { … }` w tym handlerze zostaje bez zmian — nadal odróżnia group-drag/marquee od single-drag.)

- [ ] **Step 3: Zweryfikuj brak pozostałości `isSelectArmed`/`'grid'` w pliku**

Run: `cd warhammer-battle-helper-front && grep -n "isSelectArmed\|'grid'" src/components/scene/SceneImage.jsx`
Expected: brak wyników.

- [ ] **Step 4: Build — kompiluje się bez błędów**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts build 2>&1 | tail -20`
Expected: `Compiled successfully` (ostrzeżenia lint OK; brak `Failed to compile`).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImage.jsx
git commit -m "refactor(scene): merge grid manipulation into select mode in SceneImage"
```

---

### Task 4: Podpięcie w `DndContext` + kontener `scene-tools` + sprzątanie i18n

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.css`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `LayerSelector` (Task 1) props `{ imageEditLayer, onImageEditLayerChange, isGM }`; `DrawingToolbar` (Task 2) bez propsów warstwy.

- [ ] **Step 1: Import `LayerSelector`**

W `DndContext.jsx` dodaj przy imporcie DrawingToolbar (linia 8):

```jsx
import LayerSelector from './scene/LayerSelector';
```

- [ ] **Step 2: Zmień domyślny fallback propa `editingLayer`**

W sygnaturze `DragAndDropContext` (linia ~36) zmień `editingLayer = 'grid'` na `editingLayer = null` (realny stan startowy w `useFogTools` to już `null`; usuwamy martwy fallback wskazujący na nieistniejący tryb).

- [ ] **Step 3: Owiń oba widżety w `scene-tools` i przenieś propsy warstwy do `LayerSelector`**

Zamień blok renderujący DrawingToolbar (linie ~1102–1132):

```jsx
          {/* Drawing toolbar — floats over the scene, visible to all */}
          {currentScene && (
            <DrawingToolbar
              editingLayer={editingLayer}
              onEditingLayerChange={onEditingLayerChange}
              imageEditLayer={imageEditLayer}
              onImageEditLayerChange={onImageEditLayerChange}
              fogCoverMode={fogCoverMode}
              …
            />
          )}
```

na (usuwając `imageEditLayer`/`onImageEditLayerChange` z DrawingToolbar, dodając `LayerSelector` nad nim w kontenerze):

```jsx
          {/* Scene tools — armed-layer picker (GM) stacked above the tool bar, bottom-right */}
          {currentScene && (
            <div className="scene-tools">
              <LayerSelector
                imageEditLayer={imageEditLayer}
                onImageEditLayerChange={onImageEditLayerChange}
                isGM={isGM}
              />
              <DrawingToolbar
                editingLayer={editingLayer}
                onEditingLayerChange={onEditingLayerChange}
                fogCoverMode={fogCoverMode}
                onFogCoverModeChange={onFogCoverModeChange}
                aoeEnabled={aoeMeasure}
                onAoeToggle={() => setAoeMeasure(v => !v)}
                activeTool={activeTool}
                onActiveToolChange={onActiveToolChange}
                brushSize={brushSize}
                onBrushSizeChange={onBrushSizeChange}
                drawingColor={drawingColor}
                onDrawingColorChange={onDrawingColorChange}
                drawingFontSize={drawingFontSize}
                onDrawingFontSizeChange={onDrawingFontSizeChange}
                onUndoDrawing={handleUndoDrawing}
                onClearDrawing={handleClearDrawing}
                onUndoFog={handleUndoFog}
                onClearFog={handleClearFog}
                onRevealAllFog={handleRevealAllFog}
                selectedPathId={selectedDrawingPathId}
                onDeleteSelected={handleDeleteSelectedDrawing}
                isGM={isGM}
                canUndo={(currentScene?.drawingPaths || []).length > 0}
                canUndoFog={(currentScene?.revealPaths || []).length > 0}
              />
            </div>
          )}
```

- [ ] **Step 4: CSS — pozycjonowanie przenieś na `.scene-tools`, `.drawing-toolbar` staje się static**

W `DrawingToolbar.css` zmień blok `.drawing-toolbar` (linie 5–15):

```css
.drawing-toolbar {
  position: absolute;
  bottom: 8px;
  right: 16px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: auto;
}
```

na:

```css
.scene-tools {
  position: absolute;
  bottom: 8px;
  right: 16px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none; /* dziury między widżetami przepuszczają klik na scenę */
}

.drawing-toolbar {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: auto;
}
```

(`.layer-selector` ma już `pointer-events: auto` z Taska 1.)

- [ ] **Step 5: Usuń osierocony klucz i18n `scenes.imageLayers`**

W `locales/en/translation.json` i `locales/pl/translation.json` usuń wpis `"imageLayers": …` z sekcji `scenes` (linia ~796 w obu). Zweryfikuj brak innych użyć:

Run: `cd warhammer-battle-helper-front && grep -rn "imageLayers" src`
Expected: brak wyników.

- [ ] **Step 6: Build**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts build 2>&1 | tail -20`
Expected: `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/DndContext.jsx warhammer-battle-helper-front/src/components/scene/DrawingToolbar.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(scene): mount LayerSelector above tool bar; drop grid default + imageLayers i18n"
```

---

### Task 5: Sprzątanie referencji `grid` + weryfikacja E2E

**Files:**
- Modify (komentarze): `warhammer-battle-helper-front/src/hooks/useFogTools.js`
- Verify: całe repo front

- [ ] **Step 1: Zaktualizuj komentarze w `useFogTools.js`**

Linie ~6 i ~9 wspominają tryb `grid` ("editing while in the 'grid' (Images) mode"). Zmień wzmianki `'grid' (Images)` na `Select/Move` tak, by opis `imageEditLayer` odpowiadał nowemu modelowi. Stan (`useState(null)`, `useState('background')`) bez zmian.

- [ ] **Step 2: Globalny grep — żadnego martwego `'grid'` jako editingLayer ani `imageLayers`**

Run:
```bash
cd warhammer-battle-helper-front && grep -rn "=== 'grid'\|== 'grid'\|'grid' :\|editingLayer = 'grid'\|imageLayers\|isSelectArmed" src
```
Expected: brak wyników. (Uwaga: `display: 'grid'` w GameLobby/GameCard to CSS — NIE dotyczy; powyższe wzorce ich nie łapią.)

- [ ] **Step 3: Pełny build + testy**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts build 2>&1 | tail -5 && CI=true npx react-scripts test --watchAll=false 2>&1 | tail -15`
Expected: `Compiled successfully`; wszystkie testy PASS.

- [ ] **Step 4: Weryfikacja manualna (uruchom stack, zaloguj jako GM)**

Zgodnie z lokalnym recipe (JWT: wyczyść `activationToken`, konto nie `active`). Sprawdź na scenie z obrazami na ≥2 warstwach:

1. Selektor warstw widoczny w prawym-dolnym rogu nad narzędziami; 3 pozycje (tokeny/gm/tło); aktywna wyróżniona.
2. Rząd narzędzi: `pan | select | fog | drawing | measure` — brak kafelka Images.
3. Uzbrój `background`, wejdź w `select`: obraz tła daje się przeciągnąć, pokazuje uchwyty resize + rotate.
4. Uzbrój `tokens`: obraz tła wygaszony (inert), klik+drag na nim = marquee (nie rusza obrazem).
5. Marquee grupowy + group-drag na uzbrojonej warstwie dalej działa.
6. Zmiana warstwy w selektorze NIE zmienia aktywnego narzędzia.
7. Gracz (nie-GM): selektor warstw niewidoczny; jego pasek narzędzi (drawing/measure) bez zmian.
8. Fog/drawing/measure: brak regresji.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useFogTools.js
git commit -m "docs(scene): update useFogTools comments for layer/tool split"
```

---

## Self-Review

**Spec coverage:**
- Model warstwa=kontekst, `grid` usunięty → Task 2 (tab), Task 3 (SceneImage), Task 4 (default), Task 5 (grep). ✅
- Jedno narzędzie Select/Move (scalenie) → Task 3. ✅
- Nowy `LayerSelector`, GM-only, zawsze widoczny, odsprzężony → Task 1 + Task 4 (mount). ✅
- DrawingToolbar odchudzony → Task 2. ✅
- Layout `scene-tools` bottom-right, selektor nad narzędziami → Task 4. ✅
- i18n: usunięcie `scenes.imageLayers`, zachowanie `layer*` → Task 4. ✅
- CSS: przeniesienie pozycji, martwe reguły → Task 2 + Task 4. ✅
- Poza zakresem (backend, MapCharacterToken, fog/draw logic) → nietknięte, potwierdzone grepem Task 5. ✅

**Placeholder scan:** brak TBD/TODO; każdy krok kodu ma kod, komendy mają oczekiwany wynik. ✅

**Type consistency:** `LayerSelector` props `{imageEditLayer, onImageEditLayerChange, isGM}` spójne Task 1↔Task 4. `isLayerArmed`/`isLayerInert` spójne Task 3. Nazwy klas `.layer-selector*`, `.scene-tools` spójne Task 1/4. ✅
