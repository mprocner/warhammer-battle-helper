# FEATURE-100 — Przełączanie trybów mapy środkowym przyciskiem myszy

Data: 2026-08-21
Status: zaakceptowany projekt, do implementacji

## Cel

Kliknięcie środkowym przyciskiem myszy (kółkiem) nad sceną przełącza tryb mapy
na następny w kolejności paska narzędzi. Po ostatnim trybie cykl wraca do
pierwszego.

Skrót ma być odruchowy: ręka zostaje na mapie, wzrok zostaje przy kursorze.

## Zakres

W cyklu biorą udział wyłącznie **tryby sceny** (`editingLayer`) — te same,
które pokazuje pasek zakładek w `DrawingToolbar`. Narzędzia wewnątrz trybu
rysowania i mgły (pędzel, linia, prostokąt, …) **nie** wchodzą do cyklu.

Powód: płaska lista trybów i narzędzi miałaby ~13 pozycji, a zestawy narzędzi
mgły i rysowania są rozłączne (`fogCompat` / `fogOnly`), więc lista musiałaby
zmieniać długość w trakcie cyklu. Osobny skrót na narzędzia (np.
Shift+środkowy) można dołożyć później — nie jest częścią tego zadania.

## Wymóg rozszerzalności

Dodanie nowego trybu w przyszłości ma polegać **wyłącznie** na dopisaniu
pozycji do jednej stałej. Bez zmian w logice przełączania, bez zmian w
renderowaniu paska, bez aktualizacji liczników w testach.

Realizacja: jedna tablica `SCENE_MODES` jest źródłem prawdy zarówno dla
przycisków paska (`.map()`), jak i dla cyklu (`nextMode`). Test paska liczy
oczekiwaną liczbę przycisków z tej samej tablicy, więc nowa pozycja nie psuje
zestawu testów.

## Tryby i kolejność

| Kolejność | `editingLayer` | Klucz i18n | Tylko GM |
|---|---|---|---|
| 1 | `null` | `scenes.panLayer` | nie |
| 2 | `'select'` | `scenes.selectLayer` | tak |
| 3 | `'measure'` | `scenes.measureLayer` | nie |
| 4 | `'fog'` | `scenes.fogLayer` | tak |
| 5 | `'drawing'` | `scenes.drawingLayer` | nie |

GM cyklu ma 5 pozycji. Gracz 3: `null` → `measure` → `drawing` → `null`.

Wszystkie klucze i18n już istnieją w `locales/en` i `locales/pl` — zadanie nie
dodaje żadnych tłumaczeń.

### Zmiany w pasku gracza wynikające z jednej listy

1. **Zmienia się kolejność przycisków gracza.** Dziś gracz widzi rysowanie,
   potem miarkę. Po zmianie: przesuwanie, miarka, rysowanie. Kolejność musi być
   wspólna, inaczej cykl gracza szedłby wbrew temu, co gracz widzi na pasku.
2. **Gracz zyskuje jawny przycisk „Przesuń".** Dziś ma go tylko GM; gracz
   wychodzi z trybu klikając aktywny przycisk.
3. **Style `__toggle` i `__tab` scalają się w `__tab`.** Klasa
   `drawing-toolbar__toggle` (ikona 24px, własne tło) znika z JSX i z CSS.

Wszystkie trzy zaakceptowane w trakcie projektowania.

Semantyka kliknięcia przycisku pozostaje bez zmian: kliknięcie nieaktywnego
trybu ustawia go, kliknięcie aktywnego wraca do `null` (przesuwanie).
Dotychczasowe `handleToggle` gracza znika — po ujednoliceniu jest tylko jedna
ścieżka `onEditingLayerChange(value === editingLayer ? null : value)`, wspólna
dla obu ról. Dla przycisku `null` obie gałęzie dają `null`, więc zachowuje się
jak dziś zakładka „Przesuń" GM-a.

## Architektura

### Nowe pliki

| Plik | Rola |
|---|---|
| `warhammer-battle-helper-front/src/components/scene/sceneModes.js` | Źródło prawdy: `SCENE_MODES`, `modesForRole`, `cycleNext`, `nextMode`, `isModeCycleClick`. Czysty JS, bez Reacta |
| `warhammer-battle-helper-front/src/components/scene/ModeSwitchLabel.jsx` | Etykieta nazwy trybu przy kursorze |
| `warhammer-battle-helper-front/src/components/scene/ModeSwitchLabel.css` | Styl etykiety + animacja zaniku |
| `warhammer-battle-helper-front/src/components/scene/sceneModes.test.js` | Testy jednostkowe czystego modułu |

### Zmieniane pliki

| Plik | Zmiana |
|---|---|
| `components/scene/DrawingToolbar.jsx` | Zakładki GM (linie 88-135) i przyciski gracza (137-155) zastąpione jednym `modesForRole(isGM).map()` |
| `components/scene/DrawingToolbar.css` | Usunięcie bloków `__toggle`, `__toggle--on`, `__toggle:hover`, `__toggle--on:hover` (linie 76-115) i selektora `__toggle` z reguł wspólnych (27-28, 68-69) |
| `components/scene/SceneViewport.jsx` | Gałąź środkowego klika w `handleViewportMouseDown` (274-292); render `<ModeSwitchLabel>`; nowy props `onEditingLayerChange` |
| `components/DndContext.jsx` | Przekazanie `onEditingLayerChange` do `<SceneViewport>` (linia 1115) — props jest już przyjmowany przez `DragAndDropContext` (linia 38), tylko nie schodzi niżej |
| `components/scene/DrawingToolbar.smoke.test.jsx` | Asercja liczby i kolejności przycisków trybu, liczona z `modesForRole` |

### Kształt `sceneModes.js`

```js
export const SCENE_MODES = [
  { value: null,      Icon: PanToolIcon,      labelKey: 'scenes.panLayer'                   },
  { value: 'select',  Icon: HighlightAltIcon, labelKey: 'scenes.selectLayer',  gmOnly: true },
  { value: 'measure', Icon: StraightenIcon,   labelKey: 'scenes.measureLayer'               },
  { value: 'fog',     Icon: CloudIcon,        labelKey: 'scenes.fogLayer',     gmOnly: true },
  { value: 'drawing', Icon: EditIcon,         labelKey: 'scenes.drawingLayer'               },
];

export const modesForRole = (isGM) => SCENE_MODES.filter(m => isGM || !m.gmOnly);

// Wydzielone z nextMode, żeby dało się przetestować na zmyślonej liście —
// dowód, że cykl nie zna liczby trybów.
export const cycleNext = (list, current) => {
  const i = list.findIndex(m => m.value === current);
  return list[(i + 1) % list.length].value;   // i === -1 → pozycja 0
};

export const nextMode = (current, isGM) => cycleNext(modesForRole(isGM), current);

export const isModeCycleClick = (e, activeElement) => {
  if (e.button !== 1) return false;
  if (e.buttons & 3) return false;                    // trzymany lewy lub prawy
  if (!/^(INPUT|TEXTAREA)$/.test(activeElement?.tagName || '')) return true;
  // Blokuje tylko pole tekstowe należące do mapy — czat czy notatki w panelu
  // bocznym są poza zakresem.
  return !activeElement.closest?.('.scene-viewport, .drawing-toolbar');
};
```

Gdy `current` nie występuje na liście roli (np. gracz zapamiętany w trybie
`fog`), `findIndex` zwraca `-1`, `(-1 + 1) % len` daje `0` — cykl resetuje się
do `null` zamiast utknąć. Zachowanie celowe, nie efekt uboczny.

## Przepływ

```
środkowy klik na .scene-viewport
  └─ handleViewportMouseDown (faza capture)
       ├─ isModeCycleClick(e, document.activeElement) === false → dalej starą ścieżką
       ├─ e.preventDefault()                      (blokada natywnego autoscroll)
       ├─ onEditingLayerChange(nextMode(editingLayer, isGM))
       │    └─ setEditingLayer w useFogTools → re-render paska i warstw
       └─ setSwitchLabel({ x: e.clientX, y: e.clientY, labelKey, seq: ++n })
            └─ <ModeSwitchLabel> → createPortal do document.body
```

### Kolejność sprawdzeń w handlerze

Gałąź środkowego klika musi być **przed** istniejącym
`if (schemeRef.current !== 'modern') return;` (linia 277). Inaczej skrót
przestaje działać w schemacie sterowania „Klasyczne", a przełączanie trybów nie
ma powodu zależeć od tego, jak użytkownik woli przesuwać mapę.

## Feedback wizualny — `ModeSwitchLabel`

Pływająca etykieta z nazwą trybu, pojawia się w punkcie kliknięcia, znika po
około 800 ms.

- Renderowana przez `createPortal` do `document.body`, `position: fixed`,
  współrzędne z `e.clientX` / `e.clientY`. Zgodne z konwencją tooltipów z
  `CLAUDE.md`.
- **Nie** jako dziecko `.scene-viewport` — ten element nie ma
  `position: relative`, a dodanie go przestawiłoby istniejące absolutne
  potomki (`__sizer`, `__content`).
- **Nie** wewnątrz `.scene-viewport__content` jak `PointerPing`. Ping *ma*
  skalować się z zoomem, bo wskazuje punkt na mapie; etykieta trybu to element
  interfejsu i ma być zawsze tego samego rozmiaru na ekranie.
- Rosnący licznik jako `key` w Reakcie, żeby dwa kliknięcia pod rząd
  restartowały animację zamiast ją kontynuować. Bez tego drugi klik w to samo
  miejsce nie miga.
- `pointer-events: none`, żeby etykieta nigdy nie przechwyciła kolejnego klika.

Odrzucone warianty: sam highlight zakładki na pasku (zmusza do przeniesienia
wzroku w bok przy każdym kliku — czyli dokładnie ten koszt, który skrót ma
usunąć) oraz toast przez `useToastQueue` (trafia w róg ekranu i miesza się z
powiadomieniami o rzutach i dołączaniu graczy, przez co traci znaczenie „to
była moja akcja").

## Przypadki brzegowe

| Sytuacja | Zachowanie |
|---|---|
| Środkowy klik przy trzymanym lewym (przeciąganie tokena, kreska, obrót) | Ignorowany — `e.buttons & 3` |
| Fokus w polu tekstowym wewnątrz `.scene-viewport` lub `.drawing-toolbar` (narzędzie `text`, pola paska) | Ignorowany |
| Fokus w polu tekstowym poza mapą (czat, notatki w panelu bocznym) | Nie blokuje — `mousedown` odpala przed przeniesieniem fokusu, więc globalna blokada wyciszałaby pierwszy klik po pisaniu |
| Schemat sterowania „Klasyczne" | Działa identycznie jak „Nowoczesne" |
| Klik na tokenie, obrazku, mgle, rysunku | Przełącza — to skrót globalny mapy |
| Klik poza `.scene-viewport` (pasek, panel boczny) | Handler nie odpala |
| Gracz w trybie spoza swojej listy | Reset do `null` |
| Wyjście z `select` z zaznaczonymi żetonami | Identycznie jak przy kliknięciu zakładki — cykl wchodzi tą samą ścieżką `onEditingLayerChange` |

Strażnik `e.buttons & 3` wystarcza za komunikację z `DrawingLayer`,
`FogLayer` i `useTokenRotate`, bo **każda** operacja w toku na mapie wymaga
trzymanego lewego przycisku. Zero nowego stanu dzielonego między komponentami.

`e.preventDefault()` na `mousedown` z `button === 1` jest konieczne: bez niego
Chrome i Firefox na Windows i Linux odpalają natywny autoscroll (ikona kółka,
mapa jadąca za kursorem).

## Testy

Komponenty sceny nie mają w tym projekcie testów renderujących, więc cała
logika trafia do czystego modułu i jest testowana bez DOM-u.

`sceneModes.test.js` (nowy):
- `modesForRole(true)` → 5 pozycji w kolejności `null, select, measure, fog, drawing`
- `modesForRole(false)` → 3 pozycje, bez `select` i `fog`
- `nextMode` przechodzi pełny cykl GM i zawija na `null`
- `nextMode` przechodzi pełny cykl gracza i zawija na `null`
- `nextMode('fog', false)` → `null` (tryb spoza listy roli)
- `cycleNext` na zmyślonej liście — cykl nie zna liczby trybów
- `isModeCycleClick`: `{button:1, buttons:4}` → `true`; `{button:1, buttons:5}` →
  `false`; `{button:0, buttons:1}` → `false`; fokus na `<input>` → `false`

`DrawingToolbar.smoke.test.jsx` (rozszerzenie):
- liczba przycisków trybu === `modesForRole(isGM).length` — asercja liczona z
  listy, nie wpisana na sztywno
- kolejność etykiet przycisków === kolejność `modesForRole(isGM)`
- pasek gracza nie zawiera `select` ani `fog`

Ostatnie asercje realizują wymóg rozszerzalności: po dopisaniu pozycji do
`SCENE_MODES` przycisk pojawia się sam i wchodzi do cyklu, a gdyby ktoś
zahardkodował gdzieś liczbę trybów, testy padną.

Weryfikacja ręczna na lokalnym stacku: przejść pełny cykl jako GM i jako
gracz, sprawdzić oba schematy sterowania, sprawdzić że środkowy klik w połowie
przeciągania tokena nic nie robi.

## Znane ograniczenie weryfikacji

Blokady natywnego autoscroll **nie da się sprawdzić na macOS** — ten mechanizm
istnieje tylko w Chrome i Firefox na Windows i Linux. `preventDefault()` wchodzi
do kodu na podstawie dokumentacji zdarzenia, nie na podstawie testu ręcznego.
Do sprawdzenia przy najbliższej okazji na Windowsie.

## Poza zakresem

- Cykl po narzędziach wewnątrz trybu rysowania i mgły
- Cykl wstecz (Shift+środkowy klik)
- `LayerSelector` (`imageEditLayer`) — bez zmian
- Zapamiętywanie ostatniego trybu między sesjami
