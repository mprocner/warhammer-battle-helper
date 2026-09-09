# FEATURE-134 — Samouczek ekranu gry (spotlight tour)

**Status:** zaprojektowane, gotowe do planu implementacji
**Data:** 2026-09-09

## Cel

Przed pierwszym wydaniem nowy użytkownik wchodzi na ekran gry i nie wie, co gdzie leży —
szczególnie MG, który widzi trzy panele, dwie belki, dziewięć zakładek i pasek narzędzi sceny.
Feature daje samouczek orientacyjny: prowadzony krok po kroku obieg po ekranie, osobny dla MG
i dla gracza, w PL i EN.

Zakres to **wyłącznie orientacja** — „co gdzie jest". Samouczki zadaniowe (jak uruchomić pierwszą
grę, tutorial per zakładka) to osobne feature'y na później; ten projekt ma im nie wchodzić w drogę
ani nie duplikować ich treści.

## Stan wyjściowy

Brak jakiegokolwiek onboardingu. `grep -rilE 'tutorial|onboard|walkthrough|firstVisit|hasSeen'`
po `src/` trafia tylko w `locales/en/talents.json` (fałszywy trop — talent o nazwie zawierającej
słowo). W `package.json` nie ma żadnej biblioteki typu tour.

### Layout, w który się wpinamy

| obszar | plik:linia | uwagi |
|---|---|---|
| lewy panel | `components/DndContext.jsx:993` | `.left-sidebar`, chowany przez `isHidden` |
| skrócona karta postaci | `components/DndContext.jsx:1001` | `CharacterDetailsPanel` |
| lista postaci | `components/DndContext.jsx:1014` | `CharacterSidebarList` |
| górne belki | `components/GameSession.jsx:1027` | `.top-bars`, zwijane przez `topBarsCollapsed` |
| lista okien | `components/GameSession.jsx:1028` | `WindowBar` |
| lista scen | `components/GameSession.jsx:1030` | `SceneSelector`, **tylko `isGM`** |
| zalogowani gracze | `components/DndContext.jsx:1051` | `OnlineUsersBar` |
| narzędzia sceny | `components/DndContext.jsx:1069` | `.scene-tools`, renderowane **tylko gdy `currentScene`** |
| wybór warstwy | `components/scene/LayerSelector.jsx:21` | `if (!isGM) return null` |
| scena | `components/DndContext.jsx:1119` | `SceneViewport` |
| prawy panel | `components/panels/RightPanel.jsx:231` | chowany przez `isHidden` |
| nagłówek „Ustawienia" | `components/panels/RightPanel.jsx:233` | `.panel-header` + `rightPanel.title` |
| zakładki | `components/panels/RightPanel.jsx:239` | `.right-panel__tabs-nav` |
| kości / widoczność rzutów | `components/panels/RightPanel.jsx:290` | `DiceRollControls` |

Zakładki (`RightPanel.jsx:122-143`): MG ma dziewięć — `chat`, `scenes`, `handouts`, `files`,
`music`, `notes`, `players`, `minigames`, `general`. Gracz cztery — `chat`, `handouts`, `notes`,
`general`.

### Trzy stany, które psują statyczną planszę

1. `leftPanelHidden`, `rightPanelHidden`, `topBarsCollapsed` (`GameSession.jsx:46-49`) —
   panel schowany zostaje w DOM, ale jest przesunięty poza ekran.
2. `controlScheme` (`components/scene/ControlSchemeSelector.jsx:8-9`) ma dwie wartości: `modern`
   i `classic`. Sterowanie sceną działa w nich inaczej, więc jeden opis byłby nieprawdziwy dla
   połowy użytkowników.
3. `currentScene` może nie istnieć — w świeżo założonej grze pasek narzędzi i wybór warstwy
   w ogóle się nie renderują.

## Decyzje projektowe

**Tour krok po kroku, nie jedna statyczna plansza.** Plansza z etykietami wskazywałaby puste
miejsca przy schowanym panelu i nie dałaby narracji („najpierw wybierz warstwę, potem narzędzie").
Tour prowadzi jedną ścieżką i sam ustawia UI tak, żeby omawiany element był widoczny.

**Biblioteka `react-joyride@3.2.0`, nie własny komponent.** Peer `react: 16.8 - 19` zgadza się
z `react: ^19.1.0` w projekcie. Gotowe: pozycjonowanie dymka przy krawędzi ekranu, scroll do
elementu, focus trap, obsługa klawiatury, re-pomiar przy resize. Przy planowanych kolejnych
samouczkach własna implementacja wymagałaby dopisania tego wszystkiego.

**Dlaczego nie `driver.js`** (lżejszy, zero zależności): renderuje popover poza drzewem Reacta,
treść przyjmuje jako HTML string. Dymki mają zawierać `t('tutorial...')` i ikony
z `@mui/icons-material` — string HTML wyklucza jedno i drugie.

**Dlaczego nie `@reactour/tour`:** też pasuje, ale ostatni release 2025-05 wobec 2026-07
u `react-joyride`, a tryb sterowany (`stepIndex` + `callback`) jest u joyride lepiej
udokumentowany — i jest tu kluczowy, bo tour musi między krokami zmieniać stan `GameSession`.

**Zakładki jako jeden krok z legendą, nie krok na zakładkę.** Dziewięć kroków na same zakładki
zmieniłoby orientację w szkolenie i zjadło treść przyszłych samouczków per zakładka. Jeden krok
podświetla całą nawigację, dymek wylicza ikonę + zdanie na zakładkę.

**Pamięć w `localStorage`, nie w bazie.** Świadomy kompromis: ten sam MG na innym komputerze
dostanie samouczek ponownie. Pole na modelu `User` byłoby trwałe i skalowałoby się na kolejne
samouczki, ale wymaga endpointu i migracji — przenosimy to na później.

## Projekt

### Nowe pliki

```
src/components/tutorial/
  GameTour.jsx        — osadza <Joyride> w trybie sterowanym, brama localStorage
  TourTooltip.jsx     — własny dymek: paleta projektu + ikony MUI
  useGameTour.js      — buduje i filtruje kroki, trzyma stepIndex
  tourSteps.js        — deklaratywna lista kroków
  GameTour.css
```

### Kotwice

Na elementach `data-tour="<id>"`. **Nie selektory klas** — `.panel-header` istnieje w obu
panelach (`DndContext.jsx:996` i `RightPanel.jsx:233`), więc selektor klasowy trafiłby w zły.

Identyfikatory: `character-card`, `character-list`, `scene-selector`, `window-bar`,
`scene-viewport`, `layer-selector`, `drawing-toolbar`, `online-users`, `tabs-nav`,
`dice-controls`.

### Kroki

Kolejność to obieg wzrokiem: lewa → góra → środek → prawa. Kończy się przy prawym panelu, czyli
tam, gdzie stoi przycisk wznawiający samouczek.

| # | kotwica | treść | role |
|---|---|---|---|
| 1 | `character-card` | skrócona karta wybranej postaci, klik otwiera pełną | MG + gracz |
| 2 | `character-list` | lista BG/NPC, przeciągnięcie na scenę | MG + gracz |
| 3 | `scene-selector` | sceny: wybór, tworzenie, przypisanie graczom | MG |
| 4 | `window-bar` | otwarte okna, powrót do zminimalizowanych | MG + gracz |
| 5 | `scene-viewport` | sterowanie sceną — tekst zależny od `controlScheme` | MG + gracz |
| 6 | `layer-selector` | warstwa, na której działasz | MG |
| 7 | `drawing-toolbar` | narzędzia (MG: przesuwanie, wybór, miarka, mgła, rysowanie; gracz: przesuwanie, miarka, rysowanie) | MG + gracz |
| 8 | `online-users` | kto jest online | MG + gracz |
| 9 | `tabs-nav` | legenda zakładek (MG 9, gracz 4) | MG + gracz |
| 10 | `dice-controls` | kości, widoczność rzutu, filtr „tylko moje" | MG + gracz |

MG dostaje 10 kroków, gracz 8.

Wybór warstwy jest **przed** narzędziami, bo w `.scene-tools` `LayerSelector` stoi nad
`DrawingToolbar` (`DndContext.jsx:1069-1078`), a bez wybranej warstwy część narzędzi nie ma na
czym działać — kolejność dymków ma odpowiadać kolejności czynności.

`tourSteps.js` trzyma jedną tablicę `{ id, target, roles, titleKey, bodyKey, onEnter }`. Wersja
gracza to `steps.filter(s => s.roles.includes(role))` — bez drugiej listy do utrzymania.

### Sterowanie krokami

`<Joyride stepIndex={index} callback={handleCallback} disableOverlayClose />`.

W callbacku na `EVENTS.STEP_BEFORE` odpala się `onEnter` kroku, np.:

- krok 4 → `setTopBarsCollapsed(false)`
- kroki 9 i 10 → `setRightPanelHidden(false)`
- kroki 1 i 2 → `setLeftPanelHidden(false)`

Indeks kroku podbija się **dopiero po commicie tej zmiany stanu** — przez efekt zależny od
`leftPanelHidden` / `rightPanelHidden` / `topBarsCollapsed`, nigdy przez `setTimeout` dobrany pod
czas animacji. Zgadywanie czasu to ta sama klasa wyścigu, którą CLAUDE.md opisuje przy zdarzeniach
myszy na scenie: warunek stawiamy na faktycznym stanie, nie na timerze.

### Osadzenie

`GameTour` renderowany w `GameSession.jsx` obok `ToastStack`. Ten poziom, bo tylko stąd widać
wszystkie trzy przełączniki paneli oraz `setActiveTab`.

`RightPanel` dostaje nowy prop `onStartTutorial`. `.panel-header` (`RightPanel.jsx:233`) dostaje
`justify-content: space-between`, a obok tytułu ląduje przycisk z `HelpOutlineIcon`.

Nagłówek znika razem z panelem (`rightPanelHidden`), ale `PanelToggle` jest widoczny zawsze, więc
panel da się wysunąć — drugiego przycisku nie robimy.

### Start i pamięć

`GameTour` na mount czyta `localStorage.getItem('tutorialSeen:' + (isGM ? 'gm' : 'player'))`.
Brak wpisu → auto-start. Osobne klucze dla ról, bo role widzą inne UI.

Zapis flagi na `STATUS.FINISHED` **i** `STATUS.SKIPPED` — kto pominął, też nie ma tego dostawać
przy każdym wejściu. Escape kończy tak samo jak „Pomiń". Start z przycisku ignoruje flagę.

Auto-start bramkowany na obecność `gameState` — `isGM` liczy się dopiero w `GameSession.jsx:877`,
a start przed tym dałby MG samouczek gracza.

### i18n

Nowa gałąź `tutorial` w `locales/en/translation.json` i `locales/pl/translation.json`:

```
tutorial.button
tutorial.next / back / skip / done / progress
tutorial.steps.<id>.title
tutorial.steps.<id>.body
tutorial.steps.sceneControls.body.modern
tutorial.steps.sceneControls.body.classic
tutorial.steps.tools.body.gm / .player
tutorial.tabs.<tabId>
```

Nazwy zakładek w legendzie biorą się z istniejących `rightPanel.tabs.*` — nie duplikujemy ich.
W gałęzi `tutorial` siedzi tylko zdanie opisu na zakładkę.

Kroki budowane w `useMemo` z zależnością od `i18n.language`, więc przełączenie języka w trakcie
przebudowuje teksty bez restartu samouczka.

## Przypadki brzegowe

**Brak sceny.** `.scene-tools` renderuje się tylko przy `currentScene` (`DndContext.jsx:1068`) —
a świeżo założona gra sceny nie ma, więc trafi na to dokładnie ten nowy MG, dla którego robimy
samouczek. Przed startem filtrujemy kroki przez `document.querySelector('[data-tour=...]')`;
te bez kotwicy wypadają. Joyride dostaje już przyciętą listę, więc licznik postępu się zgadza.

**Schowane panele.** Panel schowany to klasa `--hidden` (transform) — element zostaje w DOM,
więc `querySelector` go znajdzie, ale spotlight wskazałby miejsce poza ekranem. Rozwiązuje to
`onEnter` opisany wyżej.

**Zniknięcie kotwicy w trakcie.** WS wywołuje `fetchGameState()`, komponenty się przerenderowują.
Joyride zgłasza wtedy `error:target_not_found` — łapiemy w callbacku i przechodzimy krok dalej,
zamiast zostawić overlay na pustym miejscu.

**Klik w tło.** `disableOverlayClose` — przypadkowy klik nie kasuje samouczka.

## Testy

`getBoundingClientRect` w jsdom zwraca zera, więc pozycjonowania spotlightu nie da się sprawdzić
testem i nie próbujemy. Pokrywamy części czyste:

- `tourSteps` — filtr po roli: MG 10 pozycji, gracz 8, brak `scene-selector` i `layer-selector`
  u gracza
- wybór klucza tekstu sceny dla `modern` vs `classic`
- brama `localStorage`: pierwszy raz startuje, po zapisie nie, ręczny start ignoruje flagę
  (`renderHook` — hook bez zależności od DOM)
- smoke render `TourTooltip` z `import '../../i18n';`

Uruchomienie: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Baseline `App.test.js` (axios ESM) dalej czerwony — to nie regresja.

Weryfikacja ręczna: docker lokalnie, dwie przeglądarki (MG + gracz), oba języki, gra bez sceny
i ze sceną, `localStorage.removeItem` między przebiegami.

## Uwagi wdrożeniowe

Nowa zależność npm wymaga przebudowy kontenera frontendu z `--renew-anon-volumes` — inaczej
kontener nie rozwiąże `react-joyride`.

## Poza zakresem

- samouczki per zakładka
- samouczek zadaniowy „jak uruchomić pierwszą grę"
- trwały zapis stanu samouczka na modelu `User`
- samouczki innych ekranów (lobby, kreator postaci)
