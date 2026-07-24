# Rozdzielenie selektora warstw od paska narzędzi sceny

Data: 2026-07-24
Status: zaakceptowany do implementacji

## Problem

Dziś `DrawingToolbar.jsx` miesza dwie ortogonalne osie w jednym stanie `editingLayer`:

- **oś narzędzia/trybu**: `pan (null)` / `grid` (Images) / `fog` / `drawing` / `measure` / `select`
- **oś warstwy obrazu** (`imageEditLayer`): `background` / `tokens` / `gm`

Selektor warstwy obrazu (MUI `ToggleButtonGroup` z `IMAGE_LAYERS`) pojawia się w DWÓCH trybach — `grid` ORAZ `select` — więc kliknięcie warstwy obrazów i kliknięcie narzędzia multi-select prowadzą do tego samego pickera. Jest to mylące i splata wybór warstwy z wyborem narzędzia.

## Cel

Dwa osobne menu:

1. **Selektor warstw** — dedykowany, pionowy pasek 3 ikon (tokeny / gm / tło), GM-only, zawsze widoczny, w prawym-dolnym rogu **nad** paskiem narzędzi.
2. **Pasek narzędzi** — czyste akcje: `pan | select | fog | drawing | measure`. Bez pickera warstw.

Efekt: czytelniejszy podział, jedno miejsce na warstwy, jedno na narzędzia.

## Decyzje projektowe (zaakceptowane)

- **Model: warstwa = kontekst, narzędzie osobno.** Kafelek `grid` (Images) **znika**. Edycja obrazów = uzbrojona warstwa + narzędzie `select`.
- **Jedno narzędzie `Select/Move`.** Scala dotychczasowe `grid` + `select`: klik obrazu = zaznacz/rusz pojedynczy (+ uchwyty resize/rotate dla bg/GM), drag po pustym = marquee grupowy. Wszystko na uzbrojonej warstwie.
- **Selektor warstw zawsze widoczny (GM).** Odsprzężony od narzędzia — klik ustawia tylko `imageEditLayer`, **nie** przełącza narzędzia. Uzasadnienie: w przyszłości warstwa może dotyczyć też fog/draw; nie budujemy tej logiki teraz, ale nie wiążemy widżetu na sztywno z jednym trybem. Dziś `imageEditLayer` realnie wpływa tylko na `select`.
- **Układ: pionowy pasek, ten sam róg (prawy-dolny), nad narzędziami.** Wybrany po przeglądzie alternatyw (lewy rail VTT, poziomy segment) — najmniejszy ruch myszy warstwa→narzędzie, zgodny z intuicją usera.

## Oś narzędzia po zmianie

`editingLayer` przyjmuje: `null` (pan) | `select` | `fog` | `drawing` | `measure`. Wartość `grid` usunięta całkowicie.

## Zmiany w plikach

### 1. Nowy `components/scene/LayerSelector.jsx` + `LayerSelector.css`
- Pionowy pasek, GM-only (`isGM` — inaczej `return null`).
- 3 przyciski z ikonami (kolejność jak w mockupie: tokeny / gm / tło), `@mui/icons-material`: `GroupsIcon`, `AdminPanelSettingsIcon`, `WallpaperIcon`.
- Props: `imageEditLayer`, `onImageEditLayerChange`, `isGM`.
- Aktywna warstwa wyróżniona (złoty akcent, schemat kolorów kart / toolbara).
- Tooltipy: portal tooltip wg konwencji projektu (nie MUI `<Tooltip>`), klucze `scenes.layerTokens` / `scenes.layerGm` / `scenes.layerBackground`.

### 2. `components/scene/DrawingToolbar.jsx`
- Usuń kafelek `grid` (Images) z rzędu zakładek GM.
- Usuń blok `ToggleButtonGroup` warstw (dziś gated `editingLayer === 'grid' || 'select'`) oraz stałą `IMAGE_LAYERS`.
- Usuń nieużywane importy: `ImageIcon`, `WallpaperIcon`, `GroupsIcon`, `AdminPanelSettingsIcon`, `ToggleButton`/`ToggleButtonGroup` (jeśli reveal/cover ich nie potrzebuje — reveal/cover ZOSTAJE, więc `ToggleButton*` zostają).
- Usuń propsy `imageEditLayer`, `onImageEditLayerChange` (przechodzą do `LayerSelector`).
- Usuń `.drawing-toolbar__layer-caption` (stempel warstwy przy kafelku Images) — zbędny, warstwę pokazuje teraz `LayerSelector`.
- Rząd narzędzi GM: `pan | select | fog | drawing | measure`.

### 3. `components/scene/SceneImage.jsx` (scalenie grid→select)
- `isLayerArmed` → `editingLayer === 'select' && image.layer === imageEditLayer` (przejmuje rolę dzisiejszego `isSelectArmed`).
- `isLayerInert` → `editingLayer === 'select' && image.layer !== imageEditLayer`.
- Usuń osobne `isSelectArmed` (złożone w `isLayerArmed`); `canDragImage` uprość do `isLayerArmed || (image.layer === 'tokens' && (editingLayer === null || activeTool === 'pan'))`.
- Uchwyty resize/rotate dla bg/GM (`isLayerArmed`) będą teraz widoczne w `select` — to zamierzone (Select/Move = pełna manipulacja).
- Zaktualizuj komentarze (odwołania do 'grid'/'Images mode').

### 4. `components/DndContext.jsx`
- Owiń `LayerSelector` + `DrawingToolbar` we wspólny kontener `scene-tools` (`absolute; bottom-right; flex-column; align-items:flex-end`); selektor u góry stosu, toolbar pod nim. Pozycjonowanie `absolute bottom/right` przenieś z `.drawing-toolbar` na `.scene-tools`.
- Renderuj `<LayerSelector imageEditLayer=... onImageEditLayerChange=... isGM=... />`; przestań przekazywać te propsy do `DrawingToolbar`.
- Zmień domyślną wartość parametru `editingLayer = 'grid'` → `editingLayer = null` (realny stan startowy w `useFogTools` to już `null`; to tylko fallback propa).

### 5. `hooks/useFogTools.js`
- Bez zmian w stanie (`editingLayer` init `null`, `imageEditLayer` init `'background'` — zostają).
- Zaktualizuj komentarze wspominające tryb `grid`.

### 6. i18n
- Usuń osierocony klucz `scenes.imageLayers` z `locales/en/translation.json` i `locales/pl/translation.json` (używany tylko w tooltipie kafelka Images).
- Klucze `scenes.layerTokens` / `scenes.layerGm` / `scenes.layerBackground` — zostają, używane przez `LayerSelector`.

### 7. CSS
- Nowy `LayerSelector.css` (pionowy pasek, ikony, stan aktywny, spójny z paletą toolbara).
- `DrawingToolbar.css`: przenieś `position/bottom/right` na `.scene-tools`; usuń reguły `.drawing-toolbar__layer-caption` i stylowanie kafelka Images jeśli osierocone.

## Poza zakresem (bez zmian)

- Backend — zero zmian.
- `MapCharacterToken.jsx` — już bramkuje przeciąganie char-tokenów na `select` + `imageEditLayer === 'tokens'`; działa dalej.
- Logika fog / drawing / measure — nietknięta.
- Realne użycie warstw w fog/draw — świadomie NIE implementowane teraz (tylko widżet gotowy pod przyszłość).

## Ryzyka / pułapki

- **Parytet uchwytów w select**: `isLayerArmed` jest prawdziwe dla WSZYSTKICH obrazów uzbrojonej warstwy → 8 uchwytów pojawi się na każdym obrazie bg/GM tej warstwy (jak dziś w `grid`). Zachowujemy parytet z `grid`; ewentualne zawężenie do `selected` — osobno, poza tym feature.
- **Kolizja rozwijanych kontrolek**: kontrolki toolbara rosną w górę; kontener `flex-column` bottom-anchored sprawia, że selektor jest naturalnie wypychany w górę, brak nakładania.
- **Pozostałe defaulty `'grid'`**: zweryfikować przy implementacji `grep -rn "'grid'"` czy nie ma innego fallbacku propa poza `DndContext` (np. w `GameSession`).
