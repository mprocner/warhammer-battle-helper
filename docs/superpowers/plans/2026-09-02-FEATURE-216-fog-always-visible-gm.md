# FEATURE-216 — Mgła wojny zawsze widoczna u MG — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MG widzi mgłę wojny zawsze, gdy jest włączona w ustawieniach sceny — niezależnie od wybranego narzędzia — jako półprzezroczysty cień, którego krycie ustawia własnym suwakiem.

**Architecture:** Decyzja „kto widzi mgłę" przenosi się z dwóch zduplikowanych warunków do jednej czystej funkcji `fogVisibleFor` w `FogLayer`; `SceneViewport` montuje warstwę bezwarunkowo, jak sąsiedni `DrawingLayer`. Krycie podglądu MG staje się preferencją per-użytkownik na backendzie (`User.Settings.FogGmOpacity`), sterowaną suwakiem w `DrawingToolbar` — wzorem istniejącego `sceneControlScheme`. Martwe pole `scene.fogOpacity` znika z całego stosu.

**Tech Stack:** Go 1.24.4 + Gin + MongoDB (mtest do testów repozytorium) | React + CRA/Jest + i18next

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-02-FEATURE-216-fog-always-visible-gm-design.md`
- Testy frontendu uruchamiaj **wyłącznie** z `warhammer-battle-helper-front/` komendą `CI=true npm test -- --watchAll=false` (pojedynczy plik: `--testPathPattern=<nazwa>`). Gołe `npx jest` nie działa — konfiguracją zarządza CRA.
- **Znany baseline fail:** `App.test.js` wywala się na ESM w axios. To nie jest regresja — nie naprawiaj go i nie licz jako porażki.
- Żadnych stringów wpisanych wprost w JSX — każdy tekst przez `t('klucz')`, klucz **angielski**, tłumaczenie dodane równolegle w `src/locales/en/translation.json` **i** `src/locales/pl/translation.json`.
- Brak backward compat — usuwane pola znikają w całości, bez migracji i bez odczytu starych danych.
- Nie używaj MUI `<Tooltip>`. Ikony wyłącznie z `@mui/icons-material`.
- **Kod, komentarze i nazwy przypadków testowych w plikach źródłowych: angielski.** Dotyczy też plików, które dziś mają komentarze polskie (`FogLayer.jsx`, `FogLayer.test.js`, `DrawingToolbar.jsx`) — nowy kod jest angielski, istniejącego nie tłumaczymy. Proza planu i teksty UI to osobna sprawa.
- Nie dokładaj `pointerEvents` ani listenerów na warstwie mgły — wymaganie „nie łapać zdarzeń poza trybem mgły" jest już spełnione przez istniejące `pointerEvents: isEditingFog ? 'auto' : 'none'`. Zadanie polega na **niezepsuciu** tego.
- Commity w konwencji repo: `feat(front): FEATURE-216 …`, `refactor(back): FEATURE-216 …`.

---

### Task 1: Jeden gate widoczności mgły

Dziś warunek montażu jest rozpisany w dwóch plikach naraz (`SceneViewport.jsx:881` i `FogLayer.jsx:404-405`) i trzeba go zmieniać w obu zgodnie. To zadanie scala go w jedną eksportowaną, czystą funkcję i przy okazji realizuje właściwy feature: MG widzi włączoną mgłę w każdym trybie.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx:26,47-51,403-408`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:881`
- Test: `warhammer-battle-helper-front/src/components/scene/FogLayer.test.js`

**Interfaces:**
- Consumes: nic z wcześniejszych zadań.
- Produces: `export const fogVisibleFor = ({ isGM, fogEnabled, inFogMode }) => boolean` w `FogLayer.jsx`. Zadanie 4 opiera się na tym, że `FogLayer` po tej zmianie liczy `cssOpacity` w jednym miejscu, bez odczytu ze sceny.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dopisz na końcu `warhammer-battle-helper-front/src/components/scene/FogLayer.test.js` i **zmień pierwszą linię importu** na `import { canClosePolygon, fogVisibleFor } from './FogLayer';`:

```js
// Full truth table — the predicate must be total, including combinations today's caller
// never produces (a player never has inFogMode).
describe('fogVisibleFor', () => {
  it('a player sees fog only when the scene has it enabled', () => {
    expect(fogVisibleFor({ isGM: false, fogEnabled: true, inFogMode: false })).toBe(true);
    expect(fogVisibleFor({ isGM: false, fogEnabled: false, inFogMode: false })).toBe(false);
  });

  it('the GM sees enabled fog in every mode — this is the feature', () => {
    expect(fogVisibleFor({ isGM: true, fogEnabled: true, inFogMode: false })).toBe(true);
    expect(fogVisibleFor({ isGM: true, fogEnabled: true, inFogMode: true })).toBe(true);
  });

  it('with fog disabled the GM sees the layer only in fog mode — painting ahead of time', () => {
    expect(fogVisibleFor({ isGM: true, fogEnabled: false, inFogMode: true })).toBe(true);
    expect(fogVisibleFor({ isGM: true, fogEnabled: false, inFogMode: false })).toBe(false);
  });

  it('the fog-mode flag reveals nothing to a player', () => {
    expect(fogVisibleFor({ isGM: false, fogEnabled: false, inFogMode: true })).toBe(false);
    expect(fogVisibleFor({ isGM: false, fogEnabled: true, inFogMode: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź porażkę**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer
```

Oczekiwane: FAIL — `TypeError: (0 , _FogLayer.fogVisibleFor) is not a function`.

- [ ] **Step 3: Dodaj predykat do `FogLayer.jsx`**

Pod istniejącym `export const canClosePolygon = ...` (linia 26) dopisz:

```js
/**
 * Who sees the fog layer. The single place this decision is made — SceneViewport mounts
 * FogLayer unconditionally, exactly like the neighbouring DrawingLayer.
 * The `|| inFogMode` term preserves painting ahead of time: with fog disabled for players
 * the GM still sees the layer once in fog mode and can prepare the reveals.
 */
export const fogVisibleFor = ({ isGM, fogEnabled, inFogMode }) =>
  isGM ? (fogEnabled || inFogMode) : fogEnabled;
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FogLayer
```

Oczekiwane: PASS, 9 testów (5 istniejących `canClosePolygon` + 4 nowe).

- [ ] **Step 5: Podłącz predykat w `FogLayer.jsx`**

Usuń linię 51 w całości (pole jest martwe, a po tej zmianie nikt go nie czyta — zostawione wywoła `no-unused-vars`):

```js
  const fogOpacity = scene?.fogOpacity || 0.85;
```

Zastąp komentarz z linii 47-49 wraz z `inFogMode`:

```js
  // The GM always sees fog that the scene has enabled; fog mode only adds visibility for
  // fog that is disabled. The `pan` tool suspends painting, not visibility.
  const inFogMode = isGM && editingLayer === 'fog';
  const isEditingFog = inFogMode && fogTool !== 'pan';
```

Zastąp linie 403-408 (dwa `return null` plus komentarz i wyliczenie `cssOpacity`):

```js
  if (!fogVisibleFor({ isGM, fogEnabled, inFogMode })) return null;

  // Players get full, opaque fog. The GM always gets see-through fog — otherwise, with fog
  // visible in every mode, the map underneath would be lost.
  // The 0.5 constant is replaced by a user preference in Task 4.
  const cssOpacity = isGM ? 0.5 : 1.0;
```

- [ ] **Step 6: Zdejmij zduplikowany gate w `SceneViewport.jsx`**

Linia 881 — zamień:

```jsx
                {(isGM ? editingLayer === 'fog' : displayedScene?.fogEnabled) && (
```

na:

```jsx
                {displayedScene && (
```

Reszta bloku (`<FogLayer … />` i domykający `)}`) bez zmian. `isGM` i `editingLayer` lecą do `FogLayer` propsami, więc nadal są używane w tym pliku — nic nie osieroci.

- [ ] **Step 7: Uruchom testy sceny**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='FogLayer|SceneContextMenu|ModeSwitchLabel|LayerSelector|DrawingToolbar|sceneModes'
```

Oczekiwane: PASS we wszystkich pasujących plikach.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.test.js \
        warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx
git commit -m "feat(front): FEATURE-216 fog of war visible to GM in every mode"
```

---

### Task 2: Usunięcie martwego `scene.fogOpacity`

Pole nigdy nie wpływało na render (gracz miał twardo `1.0`, gałąź MG była nieosiągalna) i nie ma dla niego UI. Task 1 usunął ostatni odczyt — teraz znika cała ścieżka, którą było przenoszone: model, repozytorium, serwis, broadcast WS i dwa miejsca po stronie frontu.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go:398,549`
- Modify: `warhammer-battle-helper-backend/internal/repository/FogRepository.go:23-41`
- Modify: `warhammer-battle-helper-backend/internal/service/FogService.go:35-56`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:700-710`
- Modify: `warhammer-battle-helper-front/src/components/tabs/ScenesTab.jsx:193-203`

**Interfaces:**
- Consumes: `FogLayer` po Task 1 nie czyta już `scene.fogOpacity`.
- Produces: `FogRepository.ToggleFog(gameID string, sceneID primitive.ObjectID, enabled bool) error` — bez parametru `opacity`. Payload `EventFogToggled` ma dokładnie dwa klucze: `sceneId`, `fogEnabled`.

- [ ] **Step 1: Usuń pole z modelu**

`internal/models/Game.go` — skasuj linię 398 w strukturze sceny:

```go
	FogOpacity      float64              `bson:"fogOpacity" json:"fogOpacity"`
```

`internal/models/Game.go:547-550` — `ToggleFogRequest` ma zostać:

```go
// ToggleFogRequest is the request body for toggling fog of war
type ToggleFogRequest struct {
	Enabled bool `json:"enabled"`
}
```

- [ ] **Step 2: Usuń parametr z repozytorium**

`internal/repository/FogRepository.go:23-41` — podmień komentarz, sygnaturę i budowę `setFields`:

```go
// ToggleFog sets fogEnabled on a scene
func (r *FogRepository) ToggleFog(gameID string, sceneID primitive.ObjectID, enabled bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(gameID)
	if err != nil {
		return fmt.Errorf("invalid game ID: %w", err)
	}

	setFields := bson.M{
		"scenes.$.fogEnabled": enabled,
		"scenes.$.updatedAt":  time.Now(),
		"updatedAt":           time.Now(),
	}
```

Reszta funkcji (filter, update, UpdateOne, obsługa błędu) bez zmian. Blok `if opacity > 0 { … }` znika.

- [ ] **Step 3: Usuń domyślkę i klucz broadcastu z serwisu**

`internal/service/FogService.go` — ciało `ToggleFog` po `isGM` ma wyglądać tak:

```go
	if err := s.fogRepo.ToggleFog(gameID, sceneID, req.Enabled); err != nil {
		return err
	}

	s.hub.BroadcastToGame(gameID, websocket.EventFogToggled, map[string]interface{}{
		"sceneId":    sceneID.Hex(),
		"fogEnabled": req.Enabled,
	})
	return nil
```

Trzylinijkowa domyślka `opacity := req.FogOpacity; if opacity <= 0 { opacity = 0.85 }` znika w całości.

- [ ] **Step 4: Zbuduj backend i sprawdź, że nic nie zostało**

```bash
cd warhammer-battle-helper-backend && go build ./... && go vet ./... && grep -rn "FogOpacity\|fogOpacity" --include="*.go" .
```

Oczekiwane: build i vet bez wyjścia, `grep` bez żadnego trafienia (kod wyjścia 1).

- [ ] **Step 5: Usuń pole z obsługi zdarzenia WS**

`warhammer-battle-helper-front/src/components/GameSession.jsx:700-710` — case `FOG_TOGGLED` ma wyglądać tak:

```jsx
      case WS_EVENTS.FOG_TOGGLED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, fogEnabled } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, fogEnabled } : s
            ),
          };
        });
        break;
```

- [ ] **Step 6: Usuń pole z ciała requestu**

`warhammer-battle-helper-front/src/components/tabs/ScenesTab.jsx:196` — zamień:

```jsx
      await toggleFog(gameId, selectedSceneId, { enabled, fogOpacity: selectedScene?.fogOpacity || 0.85 });
```

na:

```jsx
      await toggleFog(gameId, selectedSceneId, { enabled });
```

`selectedScene` jest dalej używany w tym pliku (checkbox `fogEnabled`, linia 424) — nie usuwaj go.

- [ ] **Step 7: Sprawdź, że po stronie frontu też nic nie zostało**

```bash
cd warhammer-battle-helper-front/src && grep -rn "fogOpacity" . ; cd .. && CI=true npm test -- --watchAll=false --testPathPattern='FogLayer|DrawingToolbar'
```

Oczekiwane: `grep` bez trafień, testy PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/Game.go \
        warhammer-battle-helper-backend/internal/repository/FogRepository.go \
        warhammer-battle-helper-backend/internal/service/FogService.go \
        warhammer-battle-helper-front/src/components/GameSession.jsx \
        warhammer-battle-helper-front/src/components/tabs/ScenesTab.jsx
git commit -m "refactor: FEATURE-216 drop dead scene.fogOpacity field"
```

---

### Task 3: Preferencja `fogGmOpacity` w ustawieniach użytkownika (backend)

Nowe pole idzie tam, gdzie już mieszka `sceneControlScheme` — w `User.Settings`, za `GET/PATCH /settings`. Po drodze naprawiamy błąd, który dziś śpi: `UpdateSettings` robi `$set` na **całym** poddokumencie `settings`, więc PATCH z jednym polem wyzerowałby drugie. Front zawsze wysyła jedno pole naraz (`useControlScheme` PATCHuje `{ sceneControlScheme }`), więc z dwoma polami błąd staje się natychmiastowy: ustawienie krycia mgły skasowałoby schemat sterowania.

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/User.go:30-32`
- Modify: `warhammer-battle-helper-backend/internal/repository/UserRepository.go:72-80`
- Modify: `warhammer-battle-helper-backend/internal/http/AuthHandler.go:338-360`
- Create: `warhammer-battle-helper-backend/internal/repository/settings_update_fields_test.go`

**Interfaces:**
- Consumes: nic z wcześniejszych zadań.
- Produces:
  - `models.UserSettings` z polem `FogGmOpacity float64` (`json:"fogGmOpacity,omitempty"`) — to czyta `GET /settings`, czyli hook z Task 4.
  - `models.UpdateSettingsRequest{ SceneControlScheme *string; FogGmOpacity *float64 }` — ciało `PATCH /settings`.
  - `settingsUpdateFields(req models.UpdateSettingsRequest) bson.M` (nieeksportowana, pakiet `repository`).
  - `(*UserRepository).UpdateSettings(id primitive.ObjectID, req models.UpdateSettingsRequest) error`.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `warhammer-battle-helper-backend/internal/repository/settings_update_fields_test.go`:

```go
package repository

import (
	"battle-helper/internal/models"
	"testing"
)

// PATCH /settings carries one field at a time — that is how the frontend saves preferences.
// The write must therefore touch only the keys that were sent: a whole-document $set on the
// `settings` subdocument wiped the neighbouring field.
func TestSettingsUpdateFields(t *testing.T) {
	scheme := "classic"
	opacity := 0.35

	t.Run("fogGmOpacity alone leaves sceneControlScheme untouched", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{FogGmOpacity: &opacity})
		if len(fields) != 1 {
			t.Fatalf("expected exactly 1 field, got %d: %v", len(fields), fields)
		}
		if fields["settings.fogGmOpacity"] != 0.35 {
			t.Errorf("settings.fogGmOpacity = %v, want 0.35", fields["settings.fogGmOpacity"])
		}
		if _, ok := fields["settings.sceneControlScheme"]; ok {
			t.Error("settings.sceneControlScheme should be absent")
		}
	})

	t.Run("sceneControlScheme alone leaves fogGmOpacity untouched", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{SceneControlScheme: &scheme})
		if len(fields) != 1 {
			t.Fatalf("expected exactly 1 field, got %d: %v", len(fields), fields)
		}
		if fields["settings.sceneControlScheme"] != "classic" {
			t.Errorf("settings.sceneControlScheme = %v, want classic", fields["settings.sceneControlScheme"])
		}
	})

	t.Run("both fields sent, both written", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{
			SceneControlScheme: &scheme,
			FogGmOpacity:       &opacity,
		})
		if len(fields) != 2 {
			t.Fatalf("expected 2 fields, got %d: %v", len(fields), fields)
		}
	})

	t.Run("an empty request has nothing to write", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{})
		if len(fields) != 0 {
			t.Fatalf("expected empty map, got %v", fields)
		}
	})
}
```

- [ ] **Step 2: Uruchom test i potwierdź porażkę**

```bash
cd warhammer-battle-helper-backend && go test ./internal/repository/ -run TestSettingsUpdateFields
```

Oczekiwane: FAIL na kompilacji — `undefined: settingsUpdateFields` oraz `undefined: models.UpdateSettingsRequest`.

- [ ] **Step 3: Dodaj pole i DTO do modelu**

`internal/models/User.go` — zastąp `UserSettings` i dopisz DTO pod spodem:

```go
type UserSettings struct {
	SceneControlScheme string  `bson:"sceneControlScheme,omitempty" json:"sceneControlScheme,omitempty"`
	FogGmOpacity       float64 `bson:"fogGmOpacity,omitempty" json:"fogGmOpacity,omitempty"`
}

// UpdateSettingsRequest is the PATCH /settings body. Pointers distinguish "field absent"
// from "field sent with a zero value", so the repository can write a partial $set —
// a PATCH carrying one preference must never wipe the others.
type UpdateSettingsRequest struct {
	SceneControlScheme *string  `json:"sceneControlScheme"`
	FogGmOpacity       *float64 `json:"fogGmOpacity"`
}
```

- [ ] **Step 4: Przepisz zapis w repozytorium na częściowy `$set`**

`internal/repository/UserRepository.go:72-80` — zastąp całą funkcję `UpdateSettings` dwiema:

```go
// settingsUpdateFields builds a partial $set document — one key per field present in the
// request. An empty map means the caller sent nothing worth writing.
func settingsUpdateFields(req models.UpdateSettingsRequest) bson.M {
	fields := bson.M{}
	if req.SceneControlScheme != nil {
		fields["settings.sceneControlScheme"] = *req.SceneControlScheme
	}
	if req.FogGmOpacity != nil {
		fields["settings.fogGmOpacity"] = *req.FogGmOpacity
	}
	return fields
}

func (r *UserRepository) UpdateSettings(id primitive.ObjectID, req models.UpdateSettingsRequest) error {
	fields := settingsUpdateFields(req)
	if len(fields) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": fields},
	)
	return err
}
```

- [ ] **Step 5: Zbinduj nowe DTO w handlerze**

`internal/http/AuthHandler.go:339` — zamień:

```go
	var req models.UserSettings
```

na:

```go
	var req models.UpdateSettingsRequest
```

Reszta `UpdateSettings` (bind, odczyt claimów, `h.UserRepo.UpdateSettings(userID, req)`, `c.JSON(http.StatusOK, req)`) bez zmian. `GetSettings` zostaje nietknięty — dalej zwraca `user.Settings`.

- [ ] **Step 6: Uruchom test i potwierdź, że przechodzi**

```bash
cd warhammer-battle-helper-backend && go test ./internal/repository/ -run TestSettingsUpdateFields -v
```

Oczekiwane: PASS, cztery podtesty.

- [ ] **Step 7: Zbuduj i przetestuj cały backend**

```bash
cd warhammer-battle-helper-backend && go build ./... && go vet ./... && go test ./...
```

Oczekiwane: build i vet bez wyjścia, wszystkie pakiety `ok` lub `no test files`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/User.go \
        warhammer-battle-helper-backend/internal/repository/UserRepository.go \
        warhammer-battle-helper-backend/internal/repository/settings_update_fields_test.go \
        warhammer-battle-helper-backend/internal/http/AuthHandler.go
git commit -m "feat(back): FEATURE-216 fogGmOpacity user setting with partial settings update"
```

---

### Task 4: Suwak krycia podglądu mgły (frontend)

Wartość z Task 3 trzeba pobrać, przekazać przez łańcuch komponentów do `FogLayer` i dać MG suwak. Łańcuch: `GameSession` (hook) → `DndContext` → `DrawingToolbar` (suwak) oraz `DndContext` → `SceneViewport` → `FogLayer` (odczyt). Dokładnie tą samą drogą chodzi już `brushSize`.

**Files:**
- Create: `warhammer-battle-helper-front/src/hooks/useFogGmOpacity.js`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:55-56,1061`
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx:39,1081,1102`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:42,882`
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx:28-40,405`
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx:43-68,204`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:853`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (klucz `scenes.fogCoverAll`)
- Test: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx`

**Interfaces:**
- Consumes: `GET/PATCH /settings` z polem `fogGmOpacity` (Task 3); `FogLayer` po Task 1 liczy `cssOpacity` w jednym miejscu.
- Produces: hook `useFogGmOpacity()` zwracający parę `[opacity: number, setOpacity: (v: number) => void]` oraz stałą `DEFAULT_FOG_GM_OPACITY = 0.5`. Prop `fogGmOpacity: number` w `FogLayer`, `SceneViewport`, `DndContext`, `DrawingToolbar`; prop `onFogGmOpacityChange: (v: number) => void` w `DndContext` i `DrawingToolbar`.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dopisz na końcu `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx`:

```jsx
describe('fog preview opacity slider', () => {
  const fogProps = { fogGmOpacity: 0.5, onFogGmOpacityChange: () => {} };

  // In drawing mode with the `select` tool only the brushSize slider is visible (the
  // fontSize slider appears for the `text` tool alone), so the slider count tells the
  // modes apart without reaching for labels.
  it('appears in fog mode only', () => {
    const { container, rerender } = render(
      <DrawingToolbar {...baseProps} {...fogProps} editingLayer="drawing" />
    );
    expect(container.querySelectorAll('input[type="range"]').length).toBe(1);

    rerender(<DrawingToolbar {...baseProps} {...fogProps} editingLayer="fog" />);
    expect(container.querySelectorAll('input[type="range"]').length).toBe(2);
  });

  it('reports a number, not the input string', () => {
    const calls = [];
    const { container } = render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="fog"
        fogGmOpacity={0.5}
        onFogGmOpacityChange={v => calls.push(v)}
      />
    );
    const slider = container.querySelectorAll('input[type="range"]')[1];
    fireEvent.change(slider, { target: { value: '0.3' } });
    expect(calls).toEqual([0.3]);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź porażkę**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=DrawingToolbar
```

Oczekiwane: FAIL — pierwszy test dostaje `1` zamiast `2` w trybie mgły, drugi wywala się na `Cannot read properties of undefined` przy `fireEvent.change` na nieistniejącym suwaku.

- [ ] **Step 3: Dodaj klucze i18n**

`src/locales/en/translation.json` — w sekcji `scenes`, po `"fogCoverAll"`:

```json
    "fogGmOpacity": "Fog preview opacity (only you)",
```

`src/locales/pl/translation.json` — w tej samej sekcji, po odpowiedniku `fogCoverAll`:

```json
    "fogGmOpacity": "Krycie podglądu mgły (tylko Ty)",
```

- [ ] **Step 4: Dodaj suwak do `DrawingToolbar.jsx`**

Do listy propsów (linie 43-68) dopisz po `onBrushSizeChange`:

```jsx
  fogGmOpacity = 0.5,
  onFogGmOpacityChange,
```

Bezpośrednio po bloku `{/* Brush size — zawsze widoczny */}` (kończy się na linii 204) wstaw:

```jsx
          {/* Fog preview opacity — a GM preference, not a scene setting.
              Changes only what the GM sees; players always get full fog. */}
          {isFogMode && (
            <div className="drawing-toolbar__slider-row">
              <span className="drawing-toolbar__label">{Math.round(fogGmOpacity * 100)}%</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={fogGmOpacity}
                onChange={e => onFogGmOpacityChange(Number(e.target.value))}
                className="drawing-toolbar__slider"
                title={t('scenes.fogGmOpacity')}
              />
            </div>
          )}
```

Dolna granica to `0.1`, nie `0`: przy zerze warstwa byłaby niewidoczna, a wciąż przechwytywałaby zdarzenia w trybie mgły — MG malowałby w ciemno.

- [ ] **Step 5: Uruchom test i potwierdź, że przechodzi**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=DrawingToolbar
```

Oczekiwane: PASS, wszystkie testy w pliku.

- [ ] **Step 6: Napisz hook `useFogGmOpacity`**

Utwórz `warhammer-battle-helper-front/src/hooks/useFogGmOpacity.js`:

```js
import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings } from '../api/settings';

// Matches the constant FogLayer used to hardcode — a user with no saved preference sees
// the fog exactly as before this change.
export const DEFAULT_FOG_GM_OPACITY = 0.5;

export function useFogGmOpacity() {
  const [opacity, setOpacityState] = useState(DEFAULT_FOG_GM_OPACITY);

  useEffect(() => {
    getSettings().then(s => {
      if (s.fogGmOpacity) setOpacityState(s.fogGmOpacity);
    }).catch(() => {});
  }, []);

  const setOpacity = useCallback((val) => {
    setOpacityState(val);
    updateSettings({ fogGmOpacity: val }).catch(() => {});
  }, []);

  return [opacity, setOpacity];
}
```

- [ ] **Step 7: Podłącz hook w `GameSession.jsx`**

Pod linią 55 (`const [controlScheme, setControlScheme] = useControlScheme();`) dopisz:

```jsx
  const [fogGmOpacity, setFogGmOpacity] = useFogGmOpacity();
```

Dodaj import obok istniejącego importu `useControlScheme`:

```jsx
import { useFogGmOpacity } from '../hooks/useFogGmOpacity';
```

W liście propsów przekazywanych do `DragAndDropContext`, po `onBrushSizeChange={setBrushSize}` (linia 1062):

```jsx
            fogGmOpacity={fogGmOpacity}
            onFogGmOpacityChange={setFogGmOpacity}
```

- [ ] **Step 8: Przepuść propsy przez `DndContext.jsx`**

W liście parametrów `DragAndDropContext` (linia 39) dopisz przed zamykającym `}`:

```
, fogGmOpacity = 0.5, onFogGmOpacityChange
```

W `<DrawingToolbar …>` po `onBrushSizeChange={onBrushSizeChange}` (linia 1082):

```jsx
                fogGmOpacity={fogGmOpacity}
                onFogGmOpacityChange={onFogGmOpacityChange}
```

W jednolinijkowym `<SceneViewport … />` (linia 1102) dopisz atrybut zaraz po `brushSize={brushSize}`:

```
fogGmOpacity={fogGmOpacity}
```

`SceneViewport` nie dostaje settera — nie ma tam czego ustawiać.

- [ ] **Step 9: Przepuść wartość przez `SceneViewport.jsx` do `FogLayer`**

W liście parametrów (linia 42) dopisz po `brushSize = 10,`:

```jsx
  fogGmOpacity = 0.5,
```

W `<FogLayer …>` (blok od linii 882) dopisz prop po `brushSize={brushSize}`:

```jsx
                    fogGmOpacity={fogGmOpacity}
```

- [ ] **Step 10: Zużyj wartość w `FogLayer.jsx`**

W liście propsów (linie 28-40) dopisz po `brushSize = 30,`:

```jsx
  fogGmOpacity = 0.5,
```

Zastąp wyliczenie `cssOpacity` z Task 1:

```js
  // Players get full, opaque fog — the GM's slider cannot reveal the map to them.
  const cssOpacity = isGM ? fogGmOpacity : 1.0;
```

Skasuj towarzyszący komentarz o stałej `0.5` znikającej w Task 4 — właśnie zniknęła.

- [ ] **Step 11: Uruchom testy frontendu**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Oczekiwane: PASS wszędzie **poza** `App.test.js` (znany baseline fail na ESM w axios — patrz Global Constraints).

- [ ] **Step 12: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useFogGmOpacity.js \
        warhammer-battle-helper-front/src/components/GameSession.jsx \
        warhammer-battle-helper-front/src/components/DndContext.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(front): FEATURE-216 GM fog preview opacity slider"
```

---

### Task 5: Regresja ręczna w przeglądarce

`pointerEvents` nie jest testowalne w jsdom, a to właśnie ta własność decyduje o wymaganiu „warstwa mgły nie łapie zdarzeń na innych narzędziach". Mgła jest teraz widoczna w każdym trybie, więc leży nad sceną tam, gdzie wcześniej jej nie było — to jedyne miejsce, w którym ten feature może zepsuć cudze narzędzie. Trzeba to sprawdzić rękami.

**Files:** żadnych zmian w kodzie — to zadanie weryfikacyjne.

**Interfaces:**
- Consumes: pełną funkcjonalność z Tasków 1-4.
- Produces: potwierdzenie gotowości do merge'a albo listę usterek.

- [ ] **Step 1: Uruchom stos i wejdź do gry jako MG**

Podnieś stos (`docker compose up` z katalogu głównego repo) i otwórz sesję gry na koncie MG pod `http://localhost:3000`. Wybierz scenę, w `ScenesTab` **włącz** „Enable Fog of War" i w trybie mgły odsłoń fragment mapy, żeby było widać różnicę między obszarem zakrytym a odsłoniętym.

- [ ] **Step 2: Sprawdź widoczność w każdym trybie**

Przełącz `editingLayer` przez wszystkie tryby (pan, select, measure, fog, drawing — środkowy przycisk myszy cykluje). W każdym z nich mgła musi być widoczna jako półprzezroczysty cień, z odsłoniętym fragmentem na swoim miejscu.

- [ ] **Step 3: Sprawdź, że inne narzędzia nie straciły zdarzeń**

Przy **włączonej** mgle i trybie innym niż mgła sprawdź kolejno:
- przeciągnięcie tokena postaci lewym przyciskiem po obszarze zakrytym mgłą,
- rysowanie kreski w trybie rysowania po obszarze zakrytym mgłą,
- pomiar linijką w trybie measure,
- przeciąganie widoku prawym przyciskiem (drag-to-pan),
- prawy klik na tokenie — menu kontekstowe ma się otworzyć.

Każde z tych działań musi zachowywać się tak samo jak przy mgle wyłączonej.

- [ ] **Step 4: Sprawdź suwak**

Wejdź w tryb mgły, przesuń suwak krycia. Cień MG ma zmieniać intensywność natychmiast. Wyjdź z trybu mgły — nowa wartość ma obowiązywać dalej. Odśwież stronę — wartość ma się utrzymać (zapis w ustawieniach użytkownika).

- [ ] **Step 5: Sprawdź, że schemat sterowania przeżył zapis krycia**

To test naprawy z Task 3. W `GeneralTab` ustaw schemat sterowania na inny niż domyślny, potem w trybie mgły ruszaj suwakiem krycia, potem odśwież stronę. Schemat sterowania **musi** zostać taki, jak go ustawiłeś — jeśli wrócił do `modern`, częściowy `$set` nie działa.

- [ ] **Step 6: Sprawdź widok gracza**

Na drugim koncie (gracz przypisany do sceny) potwierdź, że mgła jest pełna i nieprześwitująca, niezależnie od tego, jak MG ustawił swój suwak.

- [ ] **Step 7: Sprawdź malowanie „na zapas"**

Jako MG **wyłącz** mgłę w `ScenesTab`. Poza trybem mgły warstwy ma nie być. Wejdź w tryb mgły — warstwa ma się pojawić i dać się malować.

---

## Uwagi do wykonania

- Zadania 1-2 dotykają tylko warstwy mgły, 3 tylko backendu ustawień, 4 spina jedno z drugim. Kolejność jest istotna: Task 2 zakłada, że Task 1 usunął ostatni odczyt `scene.fogOpacity`, a Task 4 zakłada gotowy endpoint z Taska 3.
- Praca w izolowanym worktree: uruchamianie brancha z worktree pod `:3000` ma w tym repo jeden działający przepis (whitelist CORS + montowanie kontenera) — sprawdź go przed Taskiem 5.
- Nowa zależność npm nie jest potrzebna, więc `--renew-anon-volumes` nie wchodzi w grę.
