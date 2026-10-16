# PLAYRPG-265 — Tutorial kreatora kart postaci

## Cel

Kreator kart postaci (`TemplateBuilder`) dostaje tutoriale na tym samym mechanizmie co ekran gry
(`react-joyride` 3.x, rejestr `tutorial/tours/`, klucze `tutorial.*`):

1. Tutorial zakładki **Ogólne** i zakładki **Karta** — przeprowadza po każdej sekcji konfiguracji
   na ekranie.
2. Tutorial **pola/sekcji** w popupie właściwości — ikona „?” w pasku tytułu popupu, kroki
   dopasowane do typu edytowanego pola.
3. Reguła w `CLAUDE.md`: przy zmianach w kreatorze sprawdzać, czy tutorial nie wymaga zmian.

Praca na gałęzi `PLAYRPG-265`.

## Decyzje

| Temat | Decyzja |
|---|---|
| Start tutoriali zakładek | Automatycznie przy pierwszym wejściu na daną zakładkę (osobna flaga „widziane” na zakładkę w `localStorage`), potem tylko przez „?”. „Karta” startuje przy pierwszym przełączeniu na nią, nie przy otwarciu kreatora. |
| Tutorial pola | Tylko na żądanie („?” w popupie). Bez flagi „widziane”. |
| Szczegółowość tutoriala pola | Krok nagłówka (opis typu pola, tekst per typ) + po kroku na każdą widoczną grupę panelu; tekst grupy z wariantem per typ tam, gdzie znaczy co innego. |
| Architektura | Wspólny silnik: `TourRunner` + `useTour`; gra (`GameTour`) i kreator (`CreatorTour`) to cienkie warstwy. |
| Kotwice | Selektory klas CSS, jak w grze. Brakujące klasy dodane do elementów kreatora. |
| Fokus w Dialogu MUI | `disableEnforceFocus` na pełnoekranowym `Dialog` kreatora tylko w trakcie tutorialu. |

## 1. Wspólny silnik (`components/tutorial/engine/`)

### `TourRunner.jsx` (nowy)

Przejmuje z `GameTour` całą część niezależną od gry:

- `Joyride` z `TOUR_OPTIONS` (`zIndex: 20000`, kolory, `skipBeacon`, `skipScroll`,
  `overlayClickAction: false`) i `TOUR_STYLES`, `tooltipComponent={TourTooltip}`;
- `locale` z kluczy `tutorial.back|skip|done|next|button`;
- `handleEvent` z trzema drogami zakończenia: Skip/Done (`STATUS.FINISHED|SKIPPED`), Escape
  (`STEP_AFTER` + `ACTIONS.CLOSE`), brak kotwicy (`TARGET_NOT_FOUND` → `goTo(index + 1)`).

Props: `{ tourId, steps, stepIndex, running, goTo, finish, contentFor(step) }`. Tytuł kroku jak
dziś: `t(titleKeyFor(step, tourId))`. Treść daje wywołujący przez `contentFor` — gra wstawia tam
`TabsLegend`, kreator zwykły tekst.

### `useTour.js` (dzisiejsze `useGameTour.js`, uogólnione)

- `role` opcjonalna; krok bez `roles` przechodzi zawsze.
- `panels` domyślnie `{}` (wszystko odsłonięte), `onReveal` domyślnie no-op.
- `persist` + zapis po `role` zastąpione przez `storageKey`: klucz flagi „widziane” w
  `localStorage`; `null` = brak zapisu i brak odczytu. Gra przekazuje dotychczasowy
  `tutorialSeen:<role>` — flagi graczy się nie resetują. Kreator: `tutorialSeen:creator:general`,
  `tutorialSeen:creator:sheet`.
- `autoStart`, `screenReady`, `onFinish`, `queryTarget` — bez zmian.

### `GameTour.jsx`

Cienka warstwa: domyślny `gameScreen`, rola, panele, `startSignal`, `contentFor` z `TabsLegend` i
`bodyKeysFor`; reszta przez `useTour` + `TourRunner`. Zachowanie gry bez zmian.

### Warianty tekstu (`stepResolution.js`)

- Nowa oś `byFieldType: (ctx) => ctx.fieldType` w `VARIANT_AXES`.
- `bodyKeysFor(step, tourId, ctx)` zwraca łańcuch kluczy od najbardziej szczegółowego do
  ogólnego (`[base.a.b, base.a, base]`); renderer woła `t(keys)` — i18next bierze pierwszy
  istniejący. Typ pola bez własnego tekstu dostaje tekst ogólny grupy. W grze, gdzie wszystkie
  klucze istnieją, wynik bez zmian. `bodyKeyFor` zostaje (używa go test tłumaczeń) jako pierwszy
  element łańcucha.

### Rejestr (`tours/index.js`)

Nowe wpisy: `creatorGeneral`, `creatorSheet`, `creatorField`.

## 2. Wpięcie w kreator

### Provider i montowanie

`TemplateBuilder` owija swoją zawartość własnym `TutorialProvider` (kreator otwiera się też z
lobby, poza `GameSession`). Wewnątrz `CreatorTour` (`components/creator/CreatorTour.jsx`):
`useTour` + `TourRunner`; wybiera tutorial na podstawie stanu kreatora (aktywna zakładka, wariant
systemu wbudowanego, otwarty popup i typ edytowanego pola).

### Pasek tytułu

- „?” (`HelpOutlineIcon`, `IconButton`, klasa `creator__tour-btn`) obok oka podglądu —
  uruchamia `creatorGeneral` albo `creatorSheet` zależnie od aktywnej zakładki.
- Start automatyczny: pierwsze wejście na zakładkę, z flagą „widziane” per zakładka.
- Zmiana zakładki w trakcie tutorialu jawnie go kończy (kotwice znikają).
- `Dialog` dostaje `disableEnforceFocus` tylko gdy tutorial działa — inaczej focus trap Dialogu
  zabiera fokus przyciskom dymka Joyride (portal w `body`).

### Kotwice — zakładka Ogólne

Karty `.creator__settings-card` dostają modyfikatory: `--visibility`, `--sheet-width`, `--dice`,
`--modifier`, `--token`. Pole nazwy szablonu: `creator__name-input`. Nawigacja zakładek:
`creator__tab-nav--two-tabs` — modyfikator tylko gdy są obie zakładki, więc krok `tabs` podświetla
obie i znika przy wariancie.

Kroki `creatorGeneral`: `name`, `tabs`, `visibility`, `sheetWidth`, `dice`, `modifier`, `token`,
`help`. Przy wariancie systemu wbudowanego (tylko karta tokenu) kroki bez kotwic znikają same.

### Kotwice — zakładka Karta

Kroki `creatorSheet` (ostatni, `help`, jak w zakładce Ogólne):

1. `palette` — `.creator__palette`: kliknięcie typu dodaje pole do aktywnej sekcji (paleta nie
   obsługuje przeciągania); grupy palety.
2. `canvas` — płótno: karta wygląda dokładnie tak, jak zobaczy ją gracz; edycja przez ołówek na
   pasku elementu (najechanie), nie przez kliknięcie.
3. `section` — pierwsza sekcja na płótnie: kolumny, zagnieżdżanie, przeciąganie (tylko gdy jest
   sekcja).
4. `field` — pierwsze pole: pasek narzędzi, ołówek otwiera popup właściwości z własnym „?”
   (tylko gdy jest pole; dawny osobny krok `properties` scalony tutaj).
5. `preview` — oko: czysty podgląd bez elementów edycji (klasa `creator__preview-toggle`).
6. `status` — licznik sekcji/pól i wskaźnik zapisu: zapis automatyczny (klasa
   `creator__status`).

Dokładne selektory kroków 2–4 ustala plan na podstawie istniejących klas płótna i chrome'u.

### Popup właściwości

- `PropertyPopup` przyjmuje `headerButtons` i przekazuje je do `DraggablePopup`; `TemplateBuilder`
  podaje „?” uruchamiające `creatorField` z kontekstem `fieldType` (dla sekcji `'section'`).
- `PropsGroup` dostaje prop `id` → klasa `creator__props-group--<id>`. Identyfikatory:
  `display`, `basics`, `values`, `attrRows`, `formula`, `content`, `roll`.
- Kroki pola (kolejność panelu): `head` (`.creator__props-title` — tytuł popupu, który nazywa typ pola; wariant `byFieldType`), potem
  `display`, `basics`, `values`, `attrRows`, `formula`, `content`, `roll` — pokazują się tylko
  grupy, które typ ma.
- Panel sekcji (`SectionPropertyPanel`) nie ma grup — kroki `head` (wariant `section`),
  `sectionTitle`, `sectionColumns`, `sectionActions` (kolejność i usuwanie to jeden pasek
  przycisków `.creator__props-danger`).
- Zamknięcie popupu albo przełączenie na inne pole w trakcie tutorialu go kończy.

## 3. Treść

Klucze en + pl, krótko (1–3 zdania na krok), w tonie tutoriali gry:

- `tutorial.creatorGeneral.<krok>.title|body`, `tutorial.creatorSheet.<krok>.title|body`.
- `tutorial.creatorField.head.title` + `tutorial.creatorField.head.body.<typ>` — **obowiązkowy**
  wariant dla każdego typu z `FIELD_TYPES` (`section`, `char_name`, `char_avatar`, `image`,
  `attr`, `attr_table`, `number`, `computed`, `progress`, `text_short`, `text_long`, `checkbox`,
  `select`, `skill_table`, `weapons_table`, `data_table`, `skill_tree`, `label`); bez tekstu
  ogólnego.
- `tutorial.creatorField.<grupa>.title|body` — tekst ogólny grupy; opcjonalnie
  `….body.<typ>`. Warianty: Treść — `select`, `skill_table`, `skill_tree`, `weapons_table`,
  `data_table`; Wartości — `attr`, `number`, `skill_table` (pasek postępu nie ma grupy Wartości); Wyświetlanie — `skill_table`,
  `skill_tree`, `weapons_table`, `data_table`; Rzut — `weapons_table`.
- Kroki sekcji: `tutorial.creatorField.section<Krok>.title|body`.

## 4. Testy

- `tourTranslations.test.js`: oś `byFieldType` — dla kroku `head` klucz dla każdego typu z
  `FIELD_TYPES` + `section`, w obu językach; dla kroków grup wymagany tekst ogólny.
- **Test-strażnik** `creatorTour.coverage.test.jsx`: renderuje `PropertyPanel` dla każdego typu
  pola, zbiera klasy `creator__props-group--*`; każdy `PropsGroup` musi mieć `id`, a każde `id`
  musi mieć krok w `creatorField`. Każda `.creator__settings-card` zakładki Ogólne musi mieć
  modyfikator z krokiem w `creatorGeneral`.
- `useTour`: `storageKey` (zapis; `null` = brak zapisu), krok bez `roles` przy braku roli.
- `stepResolution`: `bodyKeysFor` — łańcuch fallbacku, oś `byFieldType`.
- Testy gry (`GameTour.smoke`, `useGameTour` → `useTour`, `TourButton.integration`,
  `tourTranslations`) zielone bez zmian asercji poza nazwą importu.
- Kreator (render): „?” startuje tutorial bieżącej zakładki; pierwsze wejście na zakładkę
  startuje go automatycznie, drugie nie; „?” w popupie startuje `creatorField` dla typu
  edytowanego pola; zmiana zakładki kończy tutorial; `disableEnforceFocus` tylko w trakcie.

## 5. CLAUDE.md

W „Konwencjach UI”:

> **Kreator ma tutorial** (`tutorial/tours/creator*.js` + klucze `tutorial.creator*` w en/pl).
> Przy każdej zmianie w kreatorze — nowy typ pola, nowa grupa w panelu właściwości, nowa karta w
> zakładce Ogólne, zmiana klasy będącej kotwicą kroku, zmiana znaczenia sekcji — sprawdź, czy
> tutorial nie potrzebuje nowego kroku, wariantu tekstu (`byFieldType`) albo poprawionego
> selektora. Część reguły pilnuje test-strażnik (`creatorTour.coverage.test.jsx`); teksty i sens
> kroków — tylko Ty.

## Poza zakresem

- Tutorial edytora wyświetlania tokenu (osobne okno z karty „Wyświetlanie tokenu”) i okien
  wewnątrz popupu (formuła, kości) — krok o danej karcie/grupie opisuje je jednym zdaniem.

## Ustalenia z implementacji

- `CreatorTour` jest ostatnim dzieckiem `Dialog`a kreatora, z `key={activeTab}`. Pod
  `ConfirmModal` siedziałby w `DndContext` zakładki Karta i nie montowałby się na Ogólnych; obok
  `Dialog`a startowałby, zanim portal Dialogu zamontuje kotwice.
- Dymek Joyride jest portalem Reacta wewnątrz drzewa Dialogu, więc focus trap MUI i tak uznaje go
  za „wewnątrz”. `disableEnforceFocus` w trakcie tutorialu zostaje dla fokusu spoza obu drzew;
  test pilnuje obu kierunków.
- Test kotwic (`tours/index.test.js`) przyjmuje modyfikator BEM budowany z szablonu
  (`blok--${…}`) po rdzeniu nazwy; pełne nazwy grup pilnuje `creatorTour.coverage.test.jsx`.
