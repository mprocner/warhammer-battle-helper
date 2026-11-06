# Kreator szablonów (własny system)

Główna droga do treści w aplikacji: większość systemów będą tworzyć użytkownicy w kreatorze,
a nie programiści w kodzie.

## Jak to działa

**Szablon** (`SystemTemplate`) to definicja karty postaci: `Sections` (sekcje z polami
`FieldDef`), `Settings` (ustawienia całego szablonu), nazwa, opis, język, widoczność i
członkowie. Kreator otwiera się z lobby (przycisk „Kreator systemów” w nagłówku) albo z zakładki Ogólne w grze
(konfiguracja wyglądu tokenów).

**Dwie zakładki kreatora:**
- **Karta** — paleta pól po lewej, karta pośrodku, panel właściwości wybranego pola.
  Karta to prawdziwy `CustomSheetBody` w wrapperze `.custom-sheet`, a nie osobny podgląd.
  Ikona oka wyłącza ramki edycji, żeby zobaczyć kartę oczami gracza.
- **Ogólne** — karty: o szablonie (opis, język), dostęp (publiczny, członkowie), kości pod
  czatem (`DiceButtons`), modyfikator rzutu (`ModifierConfig`), poziomy sukcesu (`SuccessLevelsConfig`), wygląd tokena
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

**Tryby rzutu** są ustawiane per pole: `traditional` (wynik kontra próg, `successType`:
`below_threshold` | `above_threshold` | `raw`) i `dice_pool` (liczenie sukcesów).

**Modyfikator rzutu** (`Settings.Modifier`, FEATURE-164 + PLAYRPG-294) jest per szablon i ma
rodzaj `Kind`: `number` (także pusty, czyli każdy starszy szablon) albo `dice`. Rodzaje się
wykluczają i niosą tę samą liczbę `modifier` w requeście rzutu:
- `number` — osobny cel dla każdego trybu: `roll` / `threshold` dla tradycyjnego,
  `dice_count` / `success_threshold` dla puli; do tego `Step`, `Min`, `Max` (oba 0 = bez limitu)
  i `Presets` (szybki wybór),
- `dice` — kości przewagi (`+N`) i utrudnienia (`−N`), `MaxEdge` / `MaxSetback` (0–5, serwer
  i tak tnie do 5), `DiceMode`: `formula` (cała formuła N+1 razy) albo `tens` (nowa cyfra
  dziesiątek, tylko gdy formuła to samo `d100`). Kierunek „lepszego” wynika z `successType`.
  `raw` i pule rzucają bez kości, bez błędu.

Na karcie wybór okna robi `RollPrompt`: `RollModifierOverlay` dla liczby, `EdgeDiceOverlay`
(kolumna przycisków z `0` pod kursorem) dla kości.

**Poziomy sukcesu** (`Settings.SuccessLevels`, PLAYRPG-289) są liczone na backendzie
w `applySuccessLevels` (`successlevel.go`) po `evalOutcome`, na progu **po** modyfikatorze, tylko
dla `traditional` z progiem. Tryby: `""` (wyłączone, progi zostają zapisane), `tens`
(`SL = ⌊próg/krok⌋ − ⌊rzut/krok⌋`, dla `above` odwrotnie, krok domyślnie 10) i `tiers` (dzielniki
2–100 sprawdzane od największego, stałe wiersze Sukces i Porażka; przy `above` tylko one).
Wynik (`HasSuccessLevel`, `SuccessLevel`, `TierLabel`, `TierColor`) zapisuje się w zdarzeniu jako
snapshot, więc historia logu nie zmienia się po edycji szablonu. `Outcome` zostaje binarne.

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
| Rzuty i formuły | `internal/systems/custom/` (`roller.go`, `formula*.go`, `modifier.go`, `edgedice.go`, `successlevel.go`, `weapon.go`, `damage_expr.go`) |
| Karty ustawień rzutu | `src/components/creator/ModifierConfigBuilder.jsx`, `EdgeDiceConfigFields.jsx`, `ModifierPresetEditor.jsx`, `SuccessLevelsBuilder.jsx` |
| Okno przed rzutem, log | `src/systems/custom/RollPrompt.jsx`, `RollModifierOverlay.jsx`, `EdgeDiceOverlay.jsx`, `useRollPrompt.js`, `modifierConfig.js`, `successLevels.js`, `rolls/successLevelDisplay.js` |
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
- Kolumna kości przewagi pokazuje się także przy polach, na które nie działa (`raw`, pula, tryb
  `tens` z formułą inną niż `d100`). Front nie zna rozwiązanego `rollConfig`, a serwer po prostu
  ignoruje wtedy wybór. Przeniesienie tej reguły do JS odrzucono, bo byłby to kolejny niezmiennik
  Go↔JS bez wspólnego testu.
- Poziomy sukcesu dzielą przez `floorDiv`, nie przez `/` z Go, bo `/` obcina do zera, a progi
  mogą być ujemne (FEATURE-162). Nowe obliczenia na progach rób tak samo.
- `RollConfig.CritSuccess` / `CritFail` istnieją w modelu, ale `evalOutcome` ich nie czyta.
  Rzuty własnych systemów nie mają dziś krytyków ani pechowych rzutów.
- Nazwa progu może być pusta (autosave nie może dostać 400, gdy MG czyści pole). Pusta nazwa
  w logu = zwykła etykieta wyniku z kolorem progu.
