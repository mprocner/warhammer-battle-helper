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
| Konfiguracja i18n | `src/i18n.js` |

## Pułapki

- Testy pilnujące samouczka: `tourTranslations.test.js` (każdy tekst w obu językach, każdy typ
  pola ma `tutorial.creatorField.head.body.<typ>`) i `creatorTour.coverage.test.jsx` (każda
  grupa i karta kreatora ma krok). Nowa grupa w kreatorze bez kroku wywala test.
- Kroki są przypięte do klas CSS. Zmiana klasy kotwicy po cichu usuwa krok, więc po zmianach
  UI sprawdź samouczek.
- Brak klucza w `pl` nie wywala aplikacji, tylko pokazuje tekst angielski. Łatwo to przeoczyć,
  dlatego dodawaj klucze w obu plikach naraz.
