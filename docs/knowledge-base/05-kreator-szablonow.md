# Kreator szablonów (własny system)

Główna droga do treści w aplikacji: większość systemów będą tworzyć użytkownicy w kreatorze,
a nie programiści w kodzie.

## Jak to działa

**Szablon** (`SystemTemplate`) to definicja karty postaci: `Sections` (sekcje z polami
`FieldDef`), `Settings` (ustawienia całego szablonu), nazwa, opis, język, widoczność i
członkowie. Kreator otwiera się z lobby (kafelek kreatora) albo z zakładki Ogólne w grze
(konfiguracja wyglądu tokenów).

**Dwie zakładki kreatora:**
- **Karta** — paleta pól po lewej, karta pośrodku, panel właściwości wybranego pola.
  Karta to prawdziwy `CustomSheetBody` w wrapperze `.custom-sheet`, a nie osobny podgląd.
  Ikona oka wyłącza ramki edycji, żeby zobaczyć kartę oczami gracza.
- **Ogólne** — karty: o szablonie (opis, język), dostęp (publiczny, członkowie), kości pod
  czatem (`DiceButtons`), modyfikatory rzutów (`ModifierConfig` + presety), wygląd tokena
  (`TokenDisplay`), szerokość okna karty (`SheetWidth`).

**18 typów pól**, w grupach palety:

| Grupa | Typy |
|---|---|
| Układ | `section` (sekcje można zagnieżdżać) |
| Postać | `char_name`, `char_avatar`, `image` |
| Statystyki | `attr`, `attr_table`, `number`, `computed`, `progress` |
| Tekst | `text_short`, `text_long` (rich text), `label` |
| Wybór | `checkbox`, `select` |
| Tabele | `skill_table`, `weapons_table`, `data_table`, `skill_tree` |

Imię i avatar postaci mogą wystąpić tylko raz (`SINGLETON_FIELD_TYPES` w `src/utils/templateSections.js`).

**Formuły** (pole `computed`, obrażenia broni, rzuty) składa się z bloków: wartości, atrybuty,
stałe, operatory, nawiasy, kości. Parser to rekurencyjne zejście
(`expression → term → factor → atom`) zaimplementowane **dwa razy**: w Go
(`internal/systems/custom/formula.go`) i w JS (`src/systems/custom/formula/`). Oba trzymają się
wspólnych przypadków testowych w `src/systems/custom/formula/formula_cases.json`.

**Tryby rzutu** są ustawiane per pole: `traditional` (wynik kontra próg) i `dice_pool`
(liczenie sukcesów). Modyfikator jest ustawiany per szablon i ma osobny cel dla każdego trybu:
`roll` / `threshold` dla tradycyjnego, `dice_count` / `success_threshold` dla puli.

**Atrybuty i umiejętności** przechowują `base` + `advances`, a `current` wylicza
`ComputeDerived`. Klucze są stabilnymi id (np. `SkillOption.ID`), nie wynikają z etykiety, więc
zmiana nazwy nie gubi wartości. Węzły drzewa umiejętności mają klucze z kropkami
(`bron_biala.jednorecz.miecz`).

**Autosave z kontrolą wersji.** Zapis idzie 1200 ms po zmianie. Każdy zapis wysyła `version`,
a serwer odrzuca nieaktualną. Zapisy idą w łańcuchu, po jednym. Gdy ktoś inny zapisał
wcześniej, użytkownik stracił uprawnienia albo szablon zniknął, autosave się zatrzymuje i
`TemplateSaveBanner` pyta, co zrobić.

**Udostępnianie.** Role członków: `viewer` (użyj, sklonuj), `editor` (+ edycja), `owner`
(+ udostępnianie, usuwanie). Jedyne źródło prawdy to `rolePermissions` w
`models/template_roles.go`. `IsPublic` pozwala każdemu zalogowanemu użyć szablonu, ale do
edycji nadal trzeba mieć rolę.

**Warianty systemów wbudowanych.** Szablon z ustawionym `BaseSystem` to nazwany wariant np.
Warhammera: kartę daje plugin w Go, a w kreatorze edytuje się tylko zakładkę Ogólne (wygląd
tokena, kości). Konfiguracja tokena MG dla systemu wbudowanego jest doklejana do gry przy
odczycie (`attachTokenConfig`), nie kopiowana.

**Gra trzyma kopię szablonu** — patrz `syncTemplate` w [03-gry-i-uczestnicy.md](03-gry-i-uczestnicy.md).

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Kreator | `src/components/creator/TemplateBuilder.jsx` (+ edytory w `creator/`) |
| Render karty | `src/systems/custom/CustomSheetBody.jsx`, `src/systems/custom/fields/` |
| Model | `internal/models/SystemTemplate.go`, `template_roles.go`, `template_about.go` |
| API | `internal/http/TemplateHandler.go`, `internal/service/TemplateService.go` |
| Rzuty i formuły | `internal/systems/custom/` (`roller.go`, `formula*.go`, `modifier.go`, `weapon.go`) |
| Samouczek kreatora | `src/components/tutorial/tours/creator*.js` |

## Pułapki

- Kreator ma pokazywać dokładnie to, co gracz. Nie rób osobnego podglądu. Przyciski bez
  działania renderuj jako `disabled` przez `showAffordances` (przyczyna: FEATURE-212).
- Nowy typ pola wymaga: wpisu w `FIELD_TYPES` i grupie palety, renderu w `CustomSheetBody`,
  obsługi w Go (`ComputeDerived`, rzuty, jeśli dotyczy), tekstu samouczka
  `tutorial.creatorField.head.body.<typ>` (pilnuje `tourTranslations.test.js`) i tłumaczeń en/pl.
- Zmiana formuły po jednej stronie bez drugiej wywali test drugiej strony. To celowe.
- Opis szablonu to rich text sanityzowany na serwerze (`internal/sanitize/richhtml.go`).
  Każdy znacznik edytora musi być tam dozwolony, inaczej formatowanie zniknie po zapisie.
- Kolory etykiet są z zamkniętej palety, bo dowolny kolor (np. biały) znika na kremowym tle.
