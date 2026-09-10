# Samouczki zakładek prawego panelu

**Status:** zaprojektowane, gotowe do planu implementacji
**Data:** 2026-09-10
**Kontynuacja:** FEATURE-134 (samouczek ekranu gry) — ta sama gałąź `FEATURE-134-game-tutorial-tour`

## Cel

FEATURE-134 dał jeden samouczek orientacyjny po ekranie gry. Ten projekt dokłada osiem samouczków
zakładek prawego panelu — po jednym dla `chat`, `scenes`, `handouts`, `files`, `music`, `notes`,
`players` i `minigames` — uruchamianych **wyłącznie przyciskiem** przy nagłówku zakładki.

Przy okazji kod samouczków zostaje odseparowany od reszty projektu: silnik przestaje znać nazwy
konkretnych kroków, a zakładki nie wiedzą o samouczkach nic poza jednym identyfikatorem.

Zakładka `general` dostaje nagłówek dla spójności, ale **nie** dostaje samouczka: to lista ustawień,
gdzie każde pole ma już własną etykietę i opis — samouczek powielałby to, co widać.

## Stan wyjściowy

### Co dał FEATURE-134

```
src/components/tutorial/
  tourSteps.js      — TOUR_STEPS + stepsForRole + titleKeyFor + bodyKeyFor + isRevealSatisfied
  useGameTour.js    — stan samouczka (bez importu biblioteki)
  GameTour.jsx      — sterowanie react-joyride 3.2.0
  TourTooltip.jsx   — własny dymek
  TabsLegend.jsx    — treść kroku o zakładkach
  GameTour.css
```

Auto-start raz na rolę (`tutorialSeen:gm` / `tutorialSeen:player` w `localStorage`), powtórka
przyciskiem `?` przy nagłówku prawego panelu, brama `screenReady` blokująca auto-start do czasu
złożenia ekranu (`useGameTour.js:24`, `:78`).

### Dlaczego dzisiejsza struktura nie skaluje się na dziewięć samouczków

`tourSteps.js` miesza treść jednego samouczka z regułami silnika. Najostrzej widać to w
`bodyKeyFor` (`tourSteps.js:34`), które rozgałęzia się na `if (step.id === 'sceneControls')` oraz
`if (step.id === 'drawingToolbar')` — **silnik zna nazwy konkretnych kroków**. Przy dziewięciu
samouczkach byłyby to dziesiątki takich warunków w jednym miejscu.

### Nagłówki zakładek — stan faktyczny

Sześć zakładek ma nagłówek z tytułem, dwie nie mają, jedna ma tytuł w podkomponencie:

| zakładka | nagłówek | plik:linia |
|---|---|---|
| `files` | `.files-tab__header` | `tabs/FilesTab.jsx:567` |
| `music` | `.music-tab__header` | `tabs/MusicTab.jsx:582` |
| `notes` | `.notes-tab__header` | `tabs/NotesTab.jsx:251` |
| `scenes` | `.scenes-tab__header` | `tabs/ScenesTab.jsx:290` |
| `players` | `.players-tab__header` | `tabs/PlayersTab.jsx:80` |
| `handouts` | `HandoutTabHeader` | `tabs/HandoutsTab.jsx:533` |
| `minigames` | `.minigame-list__title` | `tabs/minigame/MinigameList.jsx:13` |
| `chat` | **brak** — `LogWindow` zaczyna od listy | `LogWindow.jsx:120` |
| `general` | **brak** — zaczyna od pierwszej sekcji | `tabs/GeneralTab.jsx:171` |

### Puste stany zastępują listy, nie współistnieją z nimi

To jest kluczowe dla kotwic. W `HandoutsTab.jsx:540-556` `.handouts-tab__empty` i
`.handouts-tab__list` są **rodzeństwem w gałęziach ternary** — jeden istnieje albo drugi. Tak samo
`NotesTab.jsx:241` vs `:276`. Nie ma wspólnego kontenera poza korzeniem zakładki, a ten jest za
szeroki na spotlight.

Pusty stan to zarazem dokładnie ten stan, w którym jest nowy użytkownik — czyli ten, dla którego
robimy samouczek.

## Decyzje projektowe

### Kotwica pytana DOM-u, nie aplikacji

Rozważane były trzy warianty obsługi pustych stanów:

1. kroki bez kotwicy po prostu wypadają (dzisiejsze zachowanie silnika),
2. tekst kroku zależny od tego, czy zakładka **ma zawartość**,
3. kotwiczenie w kontenerze istniejącym zawsze.

Wybrane: **źródło warunku z (3), oba teksty jak w (2)**.

Rozstrzygające było, skąd bierze się warunek. Wariant (2) czytałby go z danych aplikacji, więc
`GameTour` musiałby przyjmować informację o zawartości ośmiu zakładek — katalog `tutorial/`, który
ma być samowystarczalny, stałby się odbiorcą ośmiu strumieni stanu. Wariant (3) pyta DOM: „który
z tych selektorów istnieje?". Tę odpowiedź silnik i tak już zdobywa, bo filtruje kroki bez kotwicy.

Kotwicą jest więc **lista selektorów**: pierwszy istniejący wygrywa. Kolejność ma znaczenie i
**selektor pustego stanu musi stać pierwszy**, bo puste stany są zbudowane niejednolicie: w
`HandoutsTab.jsx:540` `.handouts-tab__empty` zastępuje `.handouts-tab__list`, ale w
`NotesTab.jsx:288`, `FilesTab.jsx:689` i `ScenesTab.jsx:311` pusty stan jest **zagnieżdżony
wewnątrz** kontenera listy — czyli lista istnieje zawsze. Przy odwrotnej kolejności wariant pustego
stanu nigdy by się nie uruchomił w tych trzech zakładkach. Skoro silnik wie, który trafił, krok może na tej podstawie wybrać tekst — zysk wariantu
(2) bez ani jednego propa ze stanem aplikacji. Warunek stoi na DOM, nie na danych.

Wariant tekstu dla pustego stanu jest **regułą, nie wyjątkiem**: krok o liście plików w pustej
zakładce ma mówić „tu pojawi się lista plików, a przez menu kontekstowe zmienisz im nazwę", czyli
w czasie przyszłym.

### Rola wpływa na teksty, rzadko na filtrowanie

Pięć zakładek jest widocznych tylko dla MG, więc ich samouczki nie potrzebują deklaracji `roles`.
W trzech wspólnych (`chat`, `handouts`, `notes`) kontrolki MG nie renderują się graczowi
(np. `HandoutsTab.jsx:544`), więc filtr kotwic wycina te kroki sam.

Teksty to inna sprawa: „handouty, które przekazujesz graczom" wobec „handouty, które udostępnił Ci
MG" to ten sam element i dwa różne zdania. Dlatego oś wariantowania po roli zostaje.

`roles` pozostaje w modelu wyłącznie dla samouczka ogólnego, gdzie krok o scenach musi zniknąć
graczowi mimo istniejącej kotwicy.

### Zapis tylko dla samouczka ogólnego

Samouczki zakładek startują wyłącznie z przycisku, więc nie dotykają `localStorage`. Hook dostaje
flagę wyłączającą zapis; `seenKey` pozostaje wyłączną sprawą samouczka ogólnego.

## Projekt

### Struktura katalogów

```
src/components/tutorial/
  engine/
    useGameTour.js      — stan; przyjmuje tourId zamiast role
    GameTour.jsx        — sterowanie react-joyride
    TourTooltip.jsx     — dymek
    stepResolution.js   — reguły: wybór selektora i budowa klucza tekstu
    GameTour.css
  tours/
    index.js            — rejestr: id -> definicja, getTour(id)
    gameScreen.js       — dotychczasowy samouczek ogólny
    chat.js  scenes.js  handouts.js  files.js
    music.js  notes.js  players.js  minigames.js
    TabsLegend.jsx      — treść jednego kroku gameScreen
  TutorialContext.jsx   — kanał "uruchom samouczek o tym id"
  TourButton.jsx        — to, co wstawiają zakładki
```

Zakładka wstawia `<TourButton tourId="files" />` i nie wie nic o krokach, kotwicach ani zapisie
stanu. `GameSession` montuje `TutorialProvider` obok istniejącego `GameTour`.

**Dlaczego kontekst.** `TourButton` siedzi w zakładce (`GameSession` → `RightPanel` → `FilesTab`),
a `GameTour` w `GameSession`. Bez kontekstu trzeba by przewiercić `onStartTour` przez `RightPanel`
do ośmiu zakładek — dokładnie to sprzężenie, którego ten projekt ma się pozbyć. Projekt ma już ten
wzorzec: `WindowManagerProvider` w `GameSession.jsx`.

Kontekst przenosi **wyłącznie** identyfikator samouczka do uruchomienia. Treść kroków płynie
rejestrem, nie kontekstem.

### Model kroku

```js
// tours/files.js
export default {
  id: 'files',
  steps: [
    { id: 'upload',   target: '.files-tab__actions' },
    { id: 'fileList', target: ['.files-tab__list', '.files-tab__empty'],
                      variants: ['byTarget'] },
    { id: 'folders',  target: '.files-tab__breadcrumb' },
  ],
};
```

`target` jako **tablica** to lista alternatyw w kolejności preferencji; silnik bierze pierwszą
istniejącą, a brak którejkolwiek wycina krok. Tablica, nie string z przecinkami, bo silnik musi
wiedzieć, **która** trafiła — z wyniku `querySelector` na złączonym selektorze tego nie odczytasz.

`variants` to lista osi wariantowania, rozwiązywana w `stepResolution.js`:

| oś | skąd warunek | przyrostek klucza |
|---|---|---|
| `byTarget` | indeks trafionego selektora | `.0` / `.1` |
| `byRole` | rola użytkownika | `.gm` / `.player` |
| `byScheme` | `controlScheme` | `.modern` / `.classic` |

Przyrostki doklejane w kolejności deklaracji: `tutorial.files.fileList.body.1` dla pustego stanu,
`tutorial.handouts.list.body.0.gm` przy dwóch osiach. Bez `variants` — `tutorial.files.upload.body`.

To usuwa z silnika warunki na nazwach kroków. Samouczek ogólny przechodzi na
`variants: ['byScheme']` i `variants: ['byRole']`, a jego klucze migrują z `tutorial.steps.*` na
`tutorial.gameScreen.*` — jednolicie z ośmioma nowymi.

### Rejestr

`tours/index.js` to mapa `id -> definicja` plus `getTour(id)`. `TourButton` woła go po `tourId`;
nieznane id zwraca `null`, a przycisk się nie renderuje — zamiast wywalić panel.

### Przycisk

`TourButton`: ikona `HelpOutlineIcon`, podpowiedź przez atrybut `title` (nigdy MUI `Tooltip`),
klasa `.tour-button`. Wchodzi do siedmiu istniejących nagłówków z tabeli wyżej oraz do dwóch nowych.

`minigames` dostaje przycisk **tylko w widoku listy**. `MinigameSetup.jsx:53` ma własny tytuł, ale
to ekran konfiguracji konkretnej rozgrywki — samouczek o zakładce byłby tam nie na miejscu.

### Dwa nowe nagłówki

`chat` i `general` dostają nagłówek w tym samym wzorcu co reszta:
`<div className="X-tab__header"><h3 className="X-tab__title">`. Tytuły z istniejących kluczy
`rightPanel.tabs.chat` i `rightPanel.tabs.general` — bez nowych kluczy.

`general` dostaje nagłówek, ale bez przycisku.

Ryzyko do sprawdzenia w przeglądarce: nagłówek w chacie zabiera pionową przestrzeń w widoku, gdzie
liczy się każda linia loga. Padding taki sam jak w pozostałych zakładkach.

### Kroki samouczków

| samouczek | kroki |
|---|---|
| `chat` | log rzutów i wiadomości · kości i widoczność rzutu · filtr „tylko moje" |
| `files` | wgrywanie · lista plików *(wariant pusty)* · foldery i ścieżka |
| `scenes` | lista scen *(wariant pusty)* · ustawienia sceny · przypisanie graczom |
| `handouts` | lista *(wariant pusty, wariant roli)* · tworzenie *(MG)* · foldery |
| `music` | playlisty · sterowanie odtwarzaniem · głośność MG a głośność gracza |
| `notes` | lista *(wariant pusty, wariant roli)* · dodawanie · filtr |
| `players` | zaproszenie · lista uczestników · uprawnienia i wyrzucanie |
| `minigames` | lista gier · uruchomienie rozgrywki · powrót do trwającej |

### Zmiana w samouczku ogólnym

Krok `tabsNav` dostaje na końcu zdanie, że każda zakładka ma własny samouczek pod ikoną `?` przy
jej nagłówku. Jeden nowy klucz w obu językach.

## Przypadki brzegowe

**Jeden samouczek naraz.** `GameTour` to jedna instancja, a kontekst trzyma jeden aktywny
identyfikator. Kliknięcie przycisku zakładki w trakcie trwającego samouczka ogólnego go zastępuje —
bez kolejkowania i bez blokowania przycisku.

**Przełączenie zakładki w trakcie.** Kotwice znikają, biblioteka zgłasza `TARGET_NOT_FOUND`, silnik
przechodzi dalej i samouczek dobiega końca. Akceptowalne — użytkownik sam odszedł.

**Brama `screenReady` nie dotyczy.** Blokuje wyłącznie auto-start (`useGameTour.js:78`). Ręczny
start był i pozostaje bezwarunkowy, a przycisk zakładki klika się z ekranu już złożonego.

**Brak `reveal`.** Cała treść zakładki jest w otwartym prawym panelu — nie ma czego odsłaniać.

## Testy

Trzy pierwsze chronią przed błędami, które faktycznie wystąpiły w FEATURE-134.

- **Kompletność rejestru:** każda zakładka z przyciskiem ma definicję, każda definicja ma niepuste
  kroki.
- **Kompletność tłumaczeń:** istniejący test iteruje po rejestrze zamiast po jednej tablicy —
  wszystkie samouczki × wszystkie kombinacje wariantów × oba języki. Nadal przez
  `i18n.getResource`, żeby `fallbackLng: 'en'` nie przykrył braków w polskim.
- **Straż przed dryfem:** rozszerzenie testu z FEATURE-134 — każdy selektor z **każdego** samouczka
  musi występować w `src/`. To ten test łapie wycięcie kroku przez przemianowanie klasy CSS.
- **`stepResolution` jednostkowo:** budowa klucza dla zera, jednej i wielu osi wariantowania; wybór
  pierwszego istniejącego selektora z listy.
- **Render `TourButton`:** uruchamia właściwy samouczek; nie renderuje się dla nieznanego `tourId`.

Uruchamianie: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Baseline `App.test.js` (axios ESM) pozostaje czerwony — to nie regresja.

Weryfikacja ręczna (dopisywana do `VISUAL-CHECK.md`): wysokość nowego nagłówka w chacie; oba stany
(pusty i pełny) w `files`, `notes`, `handouts` i `scenes`; konto gracza w trzech wspólnych
zakładkach; przycisk w `minigames` obecny w liście i nieobecny w konfiguracji rozgrywki.

## Poza zakresem

- samouczek zakładki `general`
- samouczek zadaniowy „jak uruchomić pierwszą grę"
- trwały zapis stanu samouczków na modelu `User` (nadal `localStorage`, i tylko dla ogólnego)
- samouczki innych ekranów (lobby, kreator postaci)
