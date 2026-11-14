## Kiedy zadaję Ci pytanie dotyczące kodu, postępuj zgodnie z poniższymi zasadami:

- Najpierw intuicja: Wyjaśnijąc pojęcia zadbaj o zrozumiałość dla osoby, która dopiero się uczy.
- Konkretność i praktyczność: Każde złożone pojęcie abstrakcyjne (formuły, architektura) poprzyj prostym, konkretnym przykładem lub scenariuszem.
- „Dlaczego": Nie wyjaśniaj tylko, jak to działa; wyjaśnij, dlaczego wybraliśmy takie podejście, jakie są związane z tym kompromisy oraz potencjalne błędy/pułapki.
- Szersza perspektywa: Porównuj omawiane pojęcia z innymi technologiami, językami, frameworkami, które inaczej podchodzą do rozwiązywania podobnych problemów, tak abym poznawał alternatywne podejścia do architektury i wzorców.
- Zasada aktywnego uczenia się: Nigdy nie kończ odpowiedzi samym kropką. ZAWSZE kończ konkretnym pytaniem, scenariuszem „co by było, gdyby" lub małym problemem do rozwiązania, aby sprawdzić moje zrozumienie. Nie kontynuuj, dopóki nie udzielę prawidłowej odpowiedzi — jeśli się pomylę, wyjaśnij dlaczego i zapytaj ponownie w inny sposób. Cel: Budowanie intuicji i aktywnego zrozumienia, a nie tylko pasywnej wiedzy.

---

## Architektura projektu

Pełne szczegóły: `docs/knowledge-base/` (aktualna baza wiedzy, zacznij od `README.md`) oraz
`docs/architecture.md` (starszy opis, częściowo nieaktualny — różnice w `docs/knowledge-base/01-architektura.md`)

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
- **Kreator szablonu pokazuje dokładnie to, co gracz zobaczy w grze.** `TemplateBuilder` montuje
  prawdziwy `CustomSheetBody` w prawdziwym wrapperze `.custom-sheet`, nigdy własny podgląd — osobny
  podgląd z własnym chrome ukrywał błąd szerokości treści (FEATURE-212). Dotyczy też afordansów bez
  żywych handlerów (gwiazdka ulubionych, znacznik rzutu, przyciski gracza): renderuj je statycznie
  jako `disabled` przez prop bramkujący (`showAffordances`), nie
  pomijaj. Kontrolka, której kreator nie pokazuje,
  to kontrolka, o której szerokość wiersza kłamie.
- **Skróty klawiszowe tylko przez rejestr** (`src/shortcuts/registry.js`). Handler nie porównuje
  `e.key` sam — używa `useKeyboardShortcut(id, handler, { enabled })`, który pomija pola tekstowe
  i otwarte dialogi. Nowy skrót = wpis w rejestrze + wiersz tabeli `#keyboard-shortcuts`
  w `02-game-screen.md` (pl i en); `shortcutsHelp.test.js` wywala brakujący opis. Wpis pojawia się
  sam w ściądze (`?`).
- **Samouczek linkuje do pomocy.** Samouczek (i opcjonalnie pojedynczy krok) ma pole `help` —
  referencję `'<strona>#<kotwica>'` albo obiekt `{ gm, player }`. Dymek pokazuje wtedy link
  „Więcej w pomocy” otwierany w nowej karcie. Nowy samouczek bez `help` wywala test.
- **Kreator ma tutorial** (`src/components/tutorial/tours/creator*.js` + klucze `tutorial.creator*`
  w en/pl). Przy każdej zmianie w kreatorze — nowy typ pola, nowa grupa w panelu właściwości, nowa
  karta w zakładce Ogólne, zmiana klasy będącej kotwicą kroku, zmiana znaczenia sekcji — sprawdź,
  czy tutorial nie potrzebuje nowego kroku, wariantu tekstu (`byFieldType`, z fallbackiem
  `default`) albo poprawionego selektora. Nowy typ pola wymaga tekstu
  `tutorial.creatorField.head.body.<typ>` (pilnuje `tourTranslations.test.js`); nowa grupa/karta bez
  kroku wywala `creatorTour.coverage.test.jsx`. Sens i aktualność tekstów — tylko Ty.

### Kolory, czcionki, kształt — tylko przez tokeny motywu
Wszystkie kolory, czcionki, zaokrąglenia, rozstrzelenie liter i siła cieni w CSS (i w `sx` /
`style` dla chrome UI) pochodzą z tokenów w `src/theme/tokens.css` — motyw gry (PLAYRPG-270)
nadpisuje je w `:root[data-theme="<id>"]`. Wpisany hex zostaje pergaminowy w każdym motywie.
Strażnik: `src/theme/noRawStyleValues.test.js` (surowe wartości + niezdefiniowane `var()`).
Szczegóły i pułapki: `docs/knowledge-base/13-motywy.md`.

- Wybieraj token według **roli i właściwości**: `color` → `--c-text*` / `--c-heading` /
  `--c-label`, `background` → `--c-surface*` / `--c-input-bg` / `--c-accent-bg*`,
  `border` → `--c-border*`. Przezroczystość: `rgb(var(--c-accent-rgb) / 0.3)`.
- Cień rozmyty: alfa × `var(--shadow-k)`; pierścień focus (bez rozmycia) — bez mnożnika.
- Brak pasującego tokena → dodaj token do `tokens.css` (i do każdego motywu), nie hex.
- **Motyw nigdy nie zmienia wymiarów** (padding, margin, rozmiary, font-size, line-height,
  border-width) — karty z kreatora i kotwice samouczka zależą od stałej geometrii.
- Kolory treści (palety pasków HP, etykiet, rysunków, uczestników) zostają dosłowne.

Karty postaci (Warhammer, CoC, Custom) w motywie default: ciemny tekst (`--c-text`) na jasnym
tle popupu (`--c-surface` → `--c-surface-alt`), inputy `--c-input-bg` z ramką `--c-border`
(focus `--c-border-strong`), etykiety `--c-label`, akcenty `--c-text-accent` /
`--c-border-accent`. Nigdy jasnego tekstu bezpośrednio na tle popupu.

### Funkcja jest gotowa dopiero z dokumentacją

Każda nowa funkcja i każda zmiana widoczna dla użytkownika (także poprawka błędu) to w **tym samym
commicie** co kod — nie w osobnym PR „na później":

1. **Changelog** — punkt w najnowszej wersji `RELEASES` + teksty en/pl (szczegóły: „Changelog"
   niżej).
2. **Baza wiedzy** — plik obszaru w `docs/knowledge-base/`, a dla nowej funkcji także wiersz
   w `00-inwentaryzacja.md` (szczegóły: „Baza wiedzy idzie razem z kodem" niżej).
3. **Przewodnik `/help`** — odpowiednie strony w `src/help/pl/` **i** `src/help/en/`.

Dotyczy też merge'a cudzego brancha: brakujące wpisy dopisz przed mergem. Pomijasz tylko zmiany
czysto techniczne (refaktor, testy) — te ruszają bazę wiedzy wyłącznie, gdy zmieniają opisany
mechanizm albo pułapkę.

### Ukryte systemy — WFRP i CoC nigdzie publicznie

Warhammer Fantasy Roleplay 4e oraz Call of Cthulhu (7e, Dark Ages) zostają w kodzie, ale są
**ukryte** — używane wyłącznie prywatnie, za bramką dostępu do systemów (PLAYRPG-243). Powód:
licencje (cudze IP). Publicznie istnieją tylko **SRD 5.2** (CC-BY) i **własne szablony**.

- Nigdy nie wymieniaj ich nazw ani nie opisuj ich mechanik (cechy WS/BS, Fortune, Sanity itp.)
  w treściach widocznych dla użytkownika: landing, FAQ, changelog (`changelog.json`), przewodnik
  `/help` (`src/help/`), meta/OG, zrzuty ekranu, opisy funkcji.
- Przykłady w changelogu i pomocy buduj na SRD albo na własnym szablonie.
- Zrzuty ekranu do materiałów publicznych rób w grze na SRD lub własnym szablonie.
- Nazwy w UI za bramką (`gameSystems.*` w `translation.json`, sam kod systemów) zostają — widzi je
  tylko konto z dostępem.

### Kluczowe konwencje
- **Komentarze w kodzie ZAWSZE po angielsku** — backend i frontend, bez wyjątków. Dotyczy nowych
  i modyfikowanych komentarzy; istniejących polskich nie tłumaczymy hurtem, tylko przy okazji
  pracy nad danym fragmentem. Rozmowa i dokumentacja (`docs/`) zostają po polsku.
- `Character.Stats` = `bson.Raw` — surowe dane systemu, nie ma pól Warhammer-specyficznych w modelu
- `ComputeDerived` wywoływane na: GET list, Create, Update, Clone
- Roll endpoint: `POST /games/:id/rollSkill` z `skillKey` (np. `attr_WS`, `MELEE_BASIC`)
- WS broadcasts: hub wysyła do wszystkich w grze → klient robi `fetchGameState()`
- Plik Game.go zawiera osadzone tablice: Scenes → RevealPaths (fog), DrawingPaths, Images
- Brak backward compat — stare dane można usunąć
- **Baza wiedzy idzie razem z kodem.** Zmiana zachowania funkcji (nowa funkcja, zmiana tego, co
  widzi lub może zrobić użytkownik) = aktualizacja pliku obszaru w `docs/knowledge-base/`, a potem
  odpowiednich stron przewodnika w `warhammer-battle-helper-front/src/help/pl/` **i** `.../en/`
  (to treść strony `/help` w aplikacji). Nowa funkcja to też
  wiersz w `docs/knowledge-base/00-inwentaryzacja.md`. Zmiany czysto techniczne (refaktor, testy)
  ruszają tylko bazę, i to tylko gdy zmieniają opisany mechanizm albo pułapkę.
- **Przewodnik ma stałe kotwice.** Każdy nagłówek `##`/`###` kończy się `{#id}` (angielski slug),
  identycznym w pl i en — na nich wiszą linki z dymków samouczka (`help` w `tours/*.js`).
  Nowa sekcja = ta sama kotwica w obu językach, w tej samej kolejności; zmiana nazwy kotwicy =
  poprawka referencji w samouczkach. Pilnuje tego `src/help/helpPages.test.js`.
- **Changelog**: zmiana widoczna dla użytkownika dopisuje punkt do nowej wersji na początku
  `RELEASES` (`warhammer-battle-helper-front/src/changelog/releases.js`, sekcje `added` /
  `changed` / `fixed`, SemVer: PATCH poprawki, MINOR funkcje) oraz teksty w
  `src/locales/{en,pl}/changelog.json` — w tym samym commicie. `releases.test.js` pilnuje
  kolejności wersji i kompletności tłumaczeń.

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
- **TipTap działa w jsdom** dzięki `jest.transformIgnorePatterns` w `package.json` (transpiluje ESM
  `@tiptap/*` i `prosemirror-*`). Instancję edytora bierz z węzła: `container.querySelector('.tiptap').editor`
  (wzorzec: `RichTextEditor.test.jsx`). Testy toolbara zostają na `createFakeEditor`.
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
