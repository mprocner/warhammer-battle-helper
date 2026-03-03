## Kiedy zadaję Ci pytanie dotyczące kodu, postępuj zgodnie z poniższymi zasadami:

- Najpierw intuicja: Wyjaśnijąc pojęcia zadbaj o zrozumiałość dla osoby, która dopiero się uczy.
- Konkretność i praktyczność: Każde złożone pojęcie abstrakcyjne (formuły, architektura) poprzyj prostym, konkretnym przykładem lub scenariuszem.
- „Dlaczego": Nie wyjaśniaj tylko, jak to działa; wyjaśnij, dlaczego wybraliśmy takie podejście, jakie są związane z tym kompromisy oraz potencjalne błędy/pułapki.
- Szersza perspektywa: Porównuj omawiane pojęcia z innymi technologiami, językami, frameworkami, które inaczej podchodzą do rozwiązywania podobnych problemów, tak abym poznawał alternatywne podejścia do architektury i wzorców.
- Zasada aktywnego uczenia się: Nigdy nie kończ odpowiedzi samym kropką. ZAWSZE kończ konkretnym pytaniem, scenariuszem „co by było, gdyby" lub małym problemem do rozwiązania, aby sprawdzić moje zrozumienie. Nie kontynuuj, dopóki nie udzielę prawidłowej odpowiedzi — jeśli się pomylę, wyjaśnij dlaczego i zapytaj ponownie w inny sposób. Cel: Budowanie intuicji i aktywnego zrozumienia, a nie tylko pasywnej wiedzy.

---

## Architektura projektu

Pełne szczegóły: `docs/architecture.md`

**Stack**: Go + Gin + MongoDB (backend) | React + DnD Kit + i18next (frontend)
**Katalogi**: `warhammer-battle-helper-backend/` | `warhammer-battle-helper-front/src/`

### Kluczowe ścieżki — backend
```
internal/
  models/         — Character.go (Stats bson.Raw), Game.go (embedded scenes/fog/drawing)
  systems/        — interface.go, registry/registry.go, warhammer4e/, coc7e/
  http/           — CharacterHandler, GameHandler, SceneHandler, FogHandler, DrawingHandler
  repository/     — MongoDB $push/$pull/$set z arrayFilters
  service/        — walidacja, logika biznesowa, broadcast WS
  websocket/      — hub.go (BroadcastToGame)
cmd/warhammer-battle-helper/main.go  — entry point, routing
```

### Kluczowe ścieżki — frontend
```
src/
  systems/        — registry.js + warhammer4e/ + coc7e/ (CharacterSheet, CharacterDetails, rolls/)
  components/
    GameSession.jsx              — główny widok multiplayer, cały stan gry
    CharacterDetailsPanel.jsx    — panel postaci na siatce (system-agnostic)
    character-sheet/             — CharacterSheetPopup + hooks/ + sections/ (Warhammer4e)
    scene/                       — SceneViewport, FogLayer, DrawingLayer, DrawingToolbar
    log/                         — AttributeRoll, SkillRoll, WeaponRoll, FightResult
    tabs/                        — FilesTab, HandoutsTab, MusicTab, ScenesTab
  locales/en/ + locales/pl/      — i18n tłumaczenia
  style.css                      — globalne style BEM
```

### Plugin pattern — systemy gry
```go
// Każdy system implementuje interface:
type GameSystem interface {
    RollSkill(stats bson.Raw, skillKey string, modifier int) (*RollResult, error)
    RollWeapon(stats bson.Raw, weaponName, skill, damage string, mod int) (*RollResult, error)
    ComputeDerived(stats bson.Raw) (bson.Raw, error)
    DefaultStats() (bson.Raw, error)
}
// Rejestracja: registry.Get("warhammer4e") | registry.Get("coc7e")
```
```js
// Frontend odpowiednik:
const system = getSystem(game.gameSystem); // zwraca { CharacterSheet, CharacterDetails, rolls }
```

### Kluczowe konwencje
- `Character.Stats` = `bson.Raw` — surowe dane systemu, nie ma pól Warhammer-specyficznych w modelu
- `ComputeDerived` wywoływane na: GET list, Create, Update, Clone
- Roll endpoint: `POST /games/:id/rollSkill` z `skillKey` (np. `attr_WS`, `MELEE_BASIC`)
- WS broadcasts: hub wysyła do wszystkich w grze → klient robi `fetchGameState()`
- Plik Game.go zawiera osadzone tablice: Scenes → RevealPaths (fog), DrawingPaths, Images
- Brak backward compat — stare dane można usunąć

---

## Postęp nauki

### Sesja 1 — 2026-02-24 — React hooks na podstawie FilesTab.jsx

Przerobione tematy (rozumie dobrze):
- `useState` — pamięć komponentu, zmiana triggeruje re-render
- `useEffect` — odpala się po renderze, służy do efektów ubocznych (fetch, subskrypcje)
- `useCallback` — zapamiętuje referencję funkcji, zapobiega pętli z useEffect
- `useMemo` — zapamiętuje wynik obliczeń, przydatne przy kosztownych operacjach
- `useRef` — wskaźnik do DOM, zmiana nie triggeruje re-renderu
- Functional updates (`prev =>`) — bezpieczna aktualizacja gdy nowy stan zależy od poprzedniego
- Optimistic updates — aktualizuj lokalny stan zamiast refetchować po każdej operacji
- Lifting state up — rodzic zarządza stanem, dziecko dostaje callbacki przez props
- Dwie warstwy walidacji — frontend (UX) + backend (bezpieczeństwo)
- Tablice zależności w hookach — React obserwuje co Ty zadeklarujesz, nie czyta kodu funkcji

Tematy do przerobienia w kolejnych sesjach:
- DnD (`useDraggable`/`useDroppable`) z biblioteki `@dnd-kit`
- React Context jako alternatywa dla przekazywania props przez wiele poziomów
- Backend w Go — jak obsługuje requesty od strony API
