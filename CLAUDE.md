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

### Konwencje UI
- i18n: wszystkie stringi w kodzie używają **angielskich kluczy** (np. `t('creator.addSection')`). Angielskie tłumaczenia to "domyślny" język — `src/locales/en/translation.json`. Polskie odpowiedniki dodawane równolegle w `src/locales/pl/translation.json`. Nigdy nie wpisuj polskich ani angielskich stringów bezpośrednio w JSX — zawsze `t('klucz')`.
- Ikony: zawsze używaj ikon z `@mui/icons-material` (Material UI Icons), nigdy SVG inline ani innych bibliotek ikon
- Tooltipy: nigdy MUI `<Tooltip>`. Używaj custom portal tooltip z `createPortal` do `document.body`. Stan: `useState(null)` dla `{top, left, text}`. Globalne klasy CSS: `.portal-tooltip` + `.portal-tooltip__arrow` w `style.css`. Wzorzec: `onMouseEnter={e => showTooltip(text, e.currentTarget)}` + `onMouseLeave={hideTooltip}` z `useRef` dla timeout. Tooltip pozycjonowany na lewo od elementu (`translateX(-100%)`), strzałka po prawej stronie.

### Schemat kolorów — karty postaci (jasne tło)
Popup `.character-sheet-popup` ma jasne kremowe tło: `linear-gradient(135deg, #f4e8d8, #e8dcc4)`.
Wszystkie karty postaci (Warhammer, CoC, Custom) używają **ciemnego tekstu na jasnym tle** — nigdy jasnego tekstu (`#e8d5b7`) bezpośrednio w popupie.

| Rola | Kolor |
|---|---|
| Tło inputów | `#fff9f0` — ciepła biel |
| Tekst w inputach / główny tekst | `#3a2f1f` — ciemny brąz |
| Ramki inputów (normal) | `#c4a882` — jasny złoty brąz |
| Ramki inputów (focus) / border popup | `#7a5c42` — ciemny brąz |
| Etykiety pól / kategorie | `#7a5c42` — ciemny brąz |
| Akcenty / sekcje / ikony | `#c9975b` — złoty |
| Tło popupu | `linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)` |
| Border popupu | `#7a5c42` |

### Kluczowe konwencje
- `Character.Stats` = `bson.Raw` — surowe dane systemu, nie ma pól Warhammer-specyficznych w modelu
- `ComputeDerived` wywoływane na: GET list, Create, Update, Clone
- Roll endpoint: `POST /games/:id/rollSkill` z `skillKey` (np. `attr_WS`, `MELEE_BASIC`)
- WS broadcasts: hub wysyła do wszystkich w grze → klient robi `fetchGameState()`
- Plik Game.go zawiera osadzone tablice: Scenes → RevealPaths (fog), DrawingPaths, Images
- Brak backward compat — stare dane można usunąć

### Zdarzenia myszy na scenie

Scena ma gęstą konkurencję o prawy przycisk (`SceneImage`, menu grupy, `FogLayer`, `DrawingLayer`)
i o środkowy (`isModeCycleClick` cykluje tryby). Zanim dodasz cokolwiek na tych przyciskach:

- **Kolejność `contextmenu` różni się między systemami.** macOS/Chrome wysyła je na `mousedown`,
  Windows **po** `mouseup`. Nigdy nie buduj logiki zakładającej jedną z tych kolejności — to
  wywaliło FEATURE-142 (commity `548d6ca` / `3267a75`).
- **Chrome na macOS nie wysyła `mouseup` dla prawego przycisku, dopóki natywne menu może się
  otworzyć** — gdy `contextmenu` jest `preventDefault`owany, `mouseup` jednak przychodzi. Mimo to
  gesty prawym przyciskiem muszą używać Pointer Events — nie polegaj na `mouseup` tam, gdzie
  suppression jeszcze nie jest w grze.
- **Ctrl+lewy klik na macOS** to systemowa emulacja prawego: przeglądarka wysyła `contextmenu`
  z `button === 0` **oraz** `mousedown` z `button === 0`, w kolejności, której spec nie ustala.
  Fizyczny prawy przycisk daje `contextmenu` z `button === 2` — tym je rozróżniasz.
- **Mysz to JEDEN pointer — drugi przycisk nie daje własnego `pointerdown`.** Wciśnięcie prawego
  przy trzymanym lewym generuje `pointermove` (`buttons` 1→3), a puszczenie go — znowu
  `pointermove` (3→1). `pointerdown` leci tylko dla pierwszego wciśniętego przycisku, `pointerup`
  dopiero po puszczeniu ostatniego. Gest oparty na parze `pointerdown`/`pointerup` **nie zadziała**
  w trakcie innego gestu — użyj `buttons` (bitmaska: 1 lewy, 2 prawy, 4 środkowy), nie `button`.
  Zmierzone wartości `buttons` na `contextmenu`: `2` samodzielny prawy klik, `0` po puszczeniu
  (kolejność Windows), `3` z trzymanym lewym, `6` ze środkowym.
- **Faza capture idzie z góry w dół:** `window` → `document` → `html` → `body` → … → target.
  `bubbles` steruje **wyłącznie** fazą bubble; capture przebiega zawsze, także przy `bubbles: false`.
  React 17+ podpina handlery do root containera (`#root`), więc **każdy listener na `document`
  w capture wyprzedza dowolny handler React** — `onXCapture` nie ma szans go zatrzymać.
- **Konflikty propagacji rozwiązuj usuwając nadmiarowego słuchacza, nie wchodząc wyżej w drzewo.**
  Listener na `window` w capture zadziała, ale dławi zdarzenia z całej aplikacji. Wyścig na
  wysokość zawsze wygra ktoś inny.
- Warunki podejmuj na **własnościach samego zdarzenia** (`isTrusted`, `button`), nie na fladze
  ustawionej w innym zdarzeniu ani na `setTimeout` — wtedy nie ma czego się ścigać.

### Testy frontendu — ograniczenia jsdom

Uruchamianie: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`
(pojedynczy plik: `--testPathPattern=<nazwa>`). Gołe `npx jest` **nie działa** — konfiguracją
zarządza CRA. Znany baseline fail: `App.test.js`, axios ESM — nie jest regresją.

- `window.PointerEvent` **nie istnieje**; `fireEvent.pointerDown` gubi `button` i `clientX`.
  Działa `MouseEvent` z nazwą typu pointerowego, przepuszczony przez `fireEvent(node, event)`:
  ```js
  const mouse = (type, init) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window, ...init });
  fireEvent(node, mouse('pointerdown', { button: 2, clientX: 10, clientY: 10 }));
  ```
- `document.elementFromPoint` **nie istnieje** — stubuj w teście.
- `isTrusted` jest **non-configurable** — `Object.defineProperty` rzuca
  `TypeError: Cannot redefine property: isTrusted` nawet z `configurable: true`. Trusted zdarzenia
  nie da się zasymulować przez DOM; predykat testuj wywołując handler bezpośrednio obiektem `{ isTrusted, button, preventDefault, stopPropagation }`.
- `getBoundingClientRect` zwraca zera (brak layoutu) — stubuj (wzorzec: `useTokenRotate.test.jsx`).
- `scrollLeft` / `scrollTop` **są** zwykłymi zapisywalnymi właściwościami — działają normalnie.
- i18n w testach renderujących: `import '../../i18n';` (side-effect, bez providera) na górze pliku
  (wzorzec: `ModeSwitchLabel.test.jsx`, `LayerSelector.smoke.test.jsx`, `ConsentBanner.test.jsx` i
  inne — to dominująca konwencja). Formę `import i18n from '../../i18n';` bierz tylko gdy test
  faktycznie używa obiektu `i18n` (np. `i18n.t(...)` w `DrawingToolbar.smoke.test.jsx`) — inaczej
  ESLint zgłosi `no-unused-vars`.
- Hooki testuj harnessem gdy hook potrzebuje realnego elementu albo bounding box (wzorzec:
  `useTokenRotate.test.jsx`); `renderHook` wystarcza, gdy hook to czysty stan bez zależności od DOM
  (wzorzec: `useDrawingTextInput.test.jsx`).
- Komponenty sceny mają testy renderujące: `ModeSwitchLabel.test.jsx`,
  `SceneContextMenu.dismiss.test.jsx`, plus smoke testy toolbara i selektora warstw. Bez pokrycia
  zostają warstwy canvasowe (`FogLayer`, `DrawingLayer`) i `SceneViewport`.

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
