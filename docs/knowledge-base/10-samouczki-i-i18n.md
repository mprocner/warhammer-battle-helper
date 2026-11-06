# Samouczki i tłumaczenia

## Jak to działa

### Samouczki (interaktywne „tour”)
Silnik opakowuje `react-joyride` (`src/components/tutorial/engine/`). Treść kroków leży
w `tours/*.js`, a rejestr w `tours/index.js`. Dodanie samouczka to jeden import i jeden wpis
w `TOURS`, bez zmian w silniku.

| Samouczek | Gdzie się uruchamia |
|---|---|
| `gameScreen` | Ekran gry. Startuje sam przy pierwszym wejściu, flaga „widziany” osobno dla roli MG i gracza |
| `chat`, `scenes`, `handouts`, `files`, `music`, `notes`, `players`, `minigames` | Przycisk `?` w nagłówku zakładki |
| `creatorGeneral`, `creatorSheet`, `creatorField` | Kreator szablonów |

Kroki mogą mieć warianty tekstu dla MG i gracza, a w kreatorze także per typ pola
(`byFieldType` z fallbackiem `default`). Krok, którego cel nie istnieje (np. pusta lista),
jest pomijany.

Samouczek ma pole `help`, a pojedynczy krok może je nadpisać (`helpRefFor` w
`stepResolution.js`). Wartość to referencja do przewodnika, `'system-creator#formulas'`, albo
obiekt `{ gm, player }`, gdy MG i gracz potrzebują innej strony (np. handouty). `useTour`
rozwiązuje ją przy starcie, `TourRunner` zamienia na adres i podaje w `data` kroku Joyride, a
`TourTooltip` pokazuje link „Więcej w pomocy” w nowej karcie, żeby nie przerywać gry.

### Strona pomocy `/help`
Publiczna trasa (jak `/privacy`): `/help` to przegląd, `/help/<strona>#<sekcja>` konkretna
sekcja. Treść to przewodnik w Markdownie w `src/help/pl/` i `src/help/en/` — te same nazwy plików
w obu językach. CRA traktuje zaimportowany `.md` jako plik statyczny: import zwraca adres kopii
z hashem w `build/static/media`, a `loadHelpMarkdown` pobiera ją `fetch`em (z cache w pamięci).
Dzięki temu przewodnik jedzie z każdym buildem i nie ma kroku kopiowania przy deployu.
Render robi `markdown-to-jsx` (bez surowego HTML), a linki `NN-plik.md#kotwica` między stronami
zamieniają się na trasy `/help/...`, więc te same pliki dobrze czytają się też na GitHubie.
Język strony = język interfejsu; wszystko poza polskim pokazuje wersję angielską.

### Nawigacja do stron serwisu (PLAYRPG-305)
Regulamin, prywatność, licencje, kontakt, co nowego i pomoc mają być osiągalne z każdego głównego
ekranu. Lista linków to `SITE_LINKS` w `src/components/common/SiteFooter.jsx`, jedno źródło dla
trzech miejsc:
- **stopka** — `App.js` renderuje `SiteFooter` pod każdą trasą poza grą i `/character-sheet`
  (ten sam warunek co nagłówek). Klasa `App--page` robi z `.App` kolumnę na całą wysokość okna,
  więc na krótkich stronach stopka trzyma się dołu. Strona startowa nie ma już własnej stopki,
- **nagłówek prawego panelu w grze** — obok `?` samouczka są ikony przewodnika i co nowego
  (z kropką `ChangelogDot`). Grupa ma klasę `.panel-header__actions`, która jest kotwicą kroku
  `panelHeader` samouczka `gameScreen`,
- **zakładka Ogólne** — sekcja „Linki serwisu” z całym `SITE_LINKS`.

W grze linki otwierają się w nowej karcie, bo przejście w tej samej karcie odmontowałoby
`GameSession` i zerwało WebSocket.

Nagłówki `##`/`###` mają jawne kotwice `{#id}` — angielski slug, ten sam w pl i en. Slug
liczony z tekstu nagłówka byłby inny w każdym języku i link z samouczka działałby tylko w
jednym z nich.

### Tłumaczenia
`i18next`, języki `en` (domyślny i zapasowy) oraz `pl`. Wykrywanie: `localStorage`
(`i18nextLng`), potem język przeglądarki. Pliki: `src/locales/<lang>/translation.json` plus
słowniki danych Warhammera (`skills`, `talents`, `weapons`, `armour`). W kodzie używa się
wyłącznie kluczy angielskich, np. `t('creator.addSection')`. Nazwy systemów są tylko w i18n
(`gameSystems.<klucz>`).

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Silnik | `src/components/tutorial/engine/` (`GameTour`, `TourRunner`, `useTour`, `stepResolution`) |
| Kontekst i przycisk | `src/components/tutorial/TutorialContext.jsx`, `TourButton.jsx` |
| Treść | `src/components/tutorial/tours/*.js`, klucze `tutorial.*` w obu językach |
| Linki do pomocy | pole `help` w `tours/*.js`, `helpRefFor` w `engine/stepResolution.js`, `TourTooltip.jsx` |
| Strona pomocy | `src/components/help/HelpPage.jsx`, `src/help/helpPages.js` (rejestr stron, linki, kotwice, ładowanie) |
| Treść pomocy | `src/help/pl/*.md`, `src/help/en/*.md`, tytuły menu w `help.pages.*` |
| Konfiguracja i18n | `src/i18n.js` |
| Stopka i linki serwisu | `src/components/common/SiteFooter.jsx` (`SITE_LINKS`), `App.js`, `panels/RightPanel.jsx`, `tabs/GeneralTab.jsx` |

## Pułapki

- Testy pilnujące samouczka: `tourTranslations.test.js` (każdy tekst w obu językach, każdy typ
  pola ma `tutorial.creatorField.head.body.<typ>`) i `creatorTour.coverage.test.jsx` (każda
  grupa i karta kreatora ma krok). Nowa grupa w kreatorze bez kroku wywala test.
- Kroki są przypięte do klas CSS. Zmiana klasy kotwicy po cichu usuwa krok, więc po zmianach
  UI sprawdź samouczek.
- `src/help/helpPages.test.js` pilnuje przewodnika: te same pliki, nagłówki i kotwice w pl i en,
  działające linki między stronami, istniejące sekcje dla każdego `help` w samouczkach i tytuł
  menu dla każdej strony. Nowa strona przewodnika to wpis w `HELP_PAGES`, dwa importy w
  `helpPages.js` i klucz `help.pages.<slug>` w obu językach.
- W jest import `.md` daje tylko nazwę pliku (transformer CRA), więc test strony
  (`HelpPage.test.jsx`) mockuje `loadHelpMarkdown` i czyta pliki z dysku.
- Brak klucza w `pl` nie wywala aplikacji, tylko pokazuje tekst angielski. Łatwo to przeoczyć,
  dlatego dodawaj klucze w obu plikach naraz.
- **Log gry tłumaczy się w chwili dodania wpisu.** `addLogMessage(t('log.session.…'))` zapisuje
  gotowy tekst, więc po zmianie języka stare wpisy zostają w poprzednim języku, a nowe idą w
  nowym. Zdarzenia z historii gry (`leave`, `character_add`) tłumaczy `fetchGameState` przy
  wczytaniu. Nie przekazuj do logu angielskich literałów — tak powstał mieszany język w pokoju
  gry (PLAYRPG-309).
- Serwer nie ma locale. Teksty tworzone przez backend, które widzi gracz (np. nazwa domyślnej
  sceny), zostawiamy puste i nazywamy po stronie frontu, a nie zapisujemy po angielsku.
