# FEATURE-164 — Modyfikator rzutu w customowych kartach postaci

**Status:** zaprojektowane, gotowe do planu implementacji
**Data:** 2026-09-08

## Cel

Modyfikator rzutu w karcie customowej jest dziś niekonfigurowalny, znaczy różne rzeczy zależnie
od typu formuły, w trybie puli kości nie działa wcale, a jego popup wyłamuje się ze schematu
kolorów karty. Feature daje MG kontrolę nad tym, czy modyfikator istnieje i co dokładnie robi,
oraz ujednolica jego działanie w obu trybach rzutu.

## Stan wyjściowy

### Backend — cztery różne znaczenia modyfikatora

`RollWithTemplate` (`internal/systems/custom/plugin.go:121`) rozgałęzia się: gdy
`len(rollCfg.Formula) > 0` idzie do nowej ścieżki formuł, inaczej robi `switch` na
`rollCfg.FormulaType` z trzema trybami legacy (`plugin.go:141-149`).

| ścieżka | plik:linia | co robi modyfikator |
|---|---|---|
| `rollFromFormula` (traditional) | `roller.go:15` | `finalRoll = result + modifier` — dodaje do wyniku |
| `rollFromFormulaDicePool` | `roller.go:282` | **ignorowany** — trafia tylko do `RollResult.Modifier`, czyli do loga |
| `rollAttrPlusSkill` (legacy) | `roller.go:477` | dodaje do wyniku |
| `rollFixedD100` (legacy) | `roller.go:512` | `target = threshold + modifier` — dodaje do progu |
| `rollFixedD20` (legacy) | `roller.go:541` | wchodzi do `bonus` razem z modyfikatorem atrybutu i umiejętnością |

Rzut broni (`weapon.go:40`) nie ma własnej obsługi modyfikatora — deleguje do `rollFromFormula`,
więc dziedziczy jej zachowanie. Rzut obrażeń (`weapon.go:52`) woła `evalFormula` bez modyfikatora
i tak zostaje: modyfikator dotyczy trafienia, nie obrażeń.

### Frontend — popup zawsze, w złych kolorach, w dwóch kopiach

Overlay modyfikatora to ten sam markup i te same cztery handlery `setRollModal(null); setModifier(0)`
zduplikowane w `systems/custom/CharacterSheet.jsx:361` i `systems/custom/CharacterDetails.jsx:286`.
Pokazuje się przy **każdym** kliknięciu rzutu, bez możliwości wyłączenia. Input jest nieograniczony
(można wpisać 999). CSS `.custom-roll-overlay__*` (`style.css:7481`) używa ciemnego `#1e1812` z jasnym
tekstem `#e8d5b7` — sprzeczne ze schematem jasnej karty postaci z CLAUDE.md.

### Dane

`RollConfig` (`models/SystemTemplate.go:256`) jest **per pole** (`FieldDef.RollConfig`,
`SystemTemplate.go:190`). `TemplateSettings` (`SystemTemplate.go:29`) to ustawienia globalne karty:
dziś `DiceButtons` i `TokenDisplay`.

## Decyzje projektowe

### D1 — konfiguracja globalna, target zależny od trybu rzutu

Konfiguracja siedzi w `TemplateSettings`, czyli w zakładce General kreatora — jedno miejsce na
kartę. Odrzucone: konfiguracja per pole w `RollConfig` (zero konfliktów, ale MG klika to samo dla
każdej z kilkudziesięciu umiejętności) oraz hybryda global + override per pole (dwa źródła prawdy).

Problem, który to rodzi: `RollMode` (`traditional` vs `dice_pool`) jest per pole, więc jedna karta
może mieszać oba tryby. Rozwiązanie: konfiguracja trzyma **dwa niezależne targety**, po jednym na
tryb. Mechanika rzutu sama wybiera właściwy, więc globalne ustawienie nigdy nie trafia na
niekompatybilne pole.

### D2 — tryb `traditional`: modyfikator do wyniku albo do progu

Dwie opcje, obie czysto arytmetyczne na liczbach, które w rzucie już istnieją:

- `roll` (domyślny) — `finalRoll = result + modifier`. Zachowanie dzisiejsze. Konwencja
  roll-over/sumująca: próg jest stały, modyfikator rusza rzut (D&D 5e, PbtA, Savage Worlds).
- `threshold` — `finalRoll = result`, `threshold = threshold + modifier`. Konwencja roll-under:
  rzut jest surowy, modyfikator rusza cel (WFRP4e, CoC7e, BRP).

Bez opcji `threshold` nie da się zbudować na karcie customowej systemu roll-under d100, bo
dodanie modyfikatora do rzutu odwraca jego sens: przy progu 55 i rzucie 48 modyfikator +20 dałby
68 > 55, czyli porażkę — plus utrudniłby rzut.

Odrzucony trzeci wariant: „modyfikator do wartości atrybutu", czyli dodanie go do atrybutu **przed**
ewaluacją formuły. Działa tylko wtedy, gdy formuła w ogóle zawiera blok atrybutu (`attr`,
`attr_linked`, `dice_attr`, `dice_skill_attr`) — w pozostałych kartach byłby ustawieniem, które
cicho nic nie robi. Dodatkowo zmienia liczbę ścianek kostki (`d(SIŁ+umiej.)` z SIŁ 10 i umiej. 5 to
`d15`, z modyfikatorem +5 stałoby się `d20`), czego w logu nie odróżnisz od `d20` z surowego
atrybutu.

### D3 — tryb `dice_pool`: modyfikator do liczby kości albo do progu sukcesu

Dziś modyfikator w puli jest ignorowany, co jest najgorszym z wariantów: MG ustawia, gracz widzi
`(+2)` w logu, a wynik jest ten sam. Dwie opcje, analogiczne do D2:

- `dice_count` (domyślny) — modyfikator dodaje/odejmuje kości. Pula `SIŁ K10` przy SIŁ 4 i
  modyfikatorze +2 rzuca 6×K10. Liczba kości clampowana do minimum 1.
- `success_threshold` — modyfikator rusza `PoolSuccessThreshold`. Próg 7 z modyfikatorem +2 →
  sukces przy 9+.

Ograniczenie `dice_count`: gdy formuła puli ma kilka członów kostkowych (np. `K6K10`), modyfikator
dotyka **pierwszego** — tego, który już wyznacza `diceType` do wyświetlania (`roller.go:388`).
Wybór członu per rzut wymagałby konfiguracji per pole, odrzuconej w D1.

### D4 — surowa arytmetyka, znak bez normalizacji

Kuszące byłoby znormalizować znak tak, żeby `+` zawsze znaczyło „łatwiej". Niewykonalne spójnie:
przy targecie `threshold` i `SuccessType == "below_threshold"` plus ułatwia, a przy tym samym
targecie i `above_threshold` — utrudnia. Efekt zależy więc nie tylko od targetu, ale i od
`SuccessType`, który jest per pole.

Decyzja: **zwykłe dodawanie, w każdym targecie**. Zamiast ukrywać arytmetykę, kreator pokazuje żywą
podpowiedź pod wyborem targetu, np. „modyfikator +20 → próg 55 zmienia się na 75". Log zawsze
zgadza się z tym, co gracz widział w popupie.

### D5 — usunięcie ścieżek legacy `formulaType`

Trzy tryby legacy (`attr_plus_skill_die`, `fixed_d100`, `fixed_d20_plus_mod`) nie są przez nic
generowane: `FormulaBuilder` produkuje wyłącznie bloki `formula`, a jedyne wystąpienie
`fixed_d100` w froncie to fixture testowy (`CustomSheetBody.skillTree.test.jsx:28`). Każdy z nich
stosuje modyfikator inaczej, więc bez usunięcia trzeba by przepisać trzy dodatkowe ścieżki pod
`ModifierConfig`. Zgodnie z zasadą „brak backward compat" z CLAUDE.md — usuwamy.

Do usunięcia:

- `rollAttrPlusSkill` (`roller.go:477`), `rollFixedD100` (`roller.go:512`), `rollFixedD20`
  (`roller.go:541`).
- `attrModifier` (`roller.go:607`) — używane wyłącznie przez `rollFixedD20`.
- `switch` na `FormulaType` w `plugin.go:141-149`. Po usunięciu `RollWithTemplate` zwraca błąd, gdy
  pole nie ma formuły — dokładnie tak, jak `RollWeaponWithTemplate` już to robi (`weapon.go:32`).
- pole `FormulaType` w `RollConfig` (`SystemTemplate.go:277`).
- testy: `TestAttrModifier` (`roller_test.go:77`), `TestRollAttrPlusSkill` (`:695`),
  `TestRollFixedD100` (`:744`), `TestRollFixedD20` (`:783`) oraz podtest dispatchu
  `"dispatches to fixed_d20 formula type"` (`:844`).
- fixture'y z `FormulaType` do przepisania na `Formula` (nie usunięcia — same testy sprawdzają
  żywą logikę): `TestRollWithTemplate` (`roller_test.go:826`),
  `TestResolveRollConfig_SkillTree` (`:1098`), `TestResolveRollConfig_SkillTableAssignsAttr`
  (`:1123`), `TestRollWithTemplate_AttrFieldUsesKeyAsLinkedAttr` (`:1199`) oraz
  `CustomSheetBody.skillTree.test.jsx:28` we froncie.

**`RollConfig.LinkedAttr` zostaje.** Wygląda na legacy, ale `resolveRollConfig` czyta je w żywej
ścieżce formuł jako fallback, gdy właściwe źródło atrybutu jest puste — `plugin.go:191` (liść
drzewa), `:198` (skill dodany przez gracza), `:209` (skill_table), `:221` (pole płaskie).
Prawdziwe źródła to `SkillTreeNode.LinkedAttr`, `SkillOption.Attr` przy `AssignAttrToSkill` oraz
`CustomSkillNodes[].LinkedAttr` w statsach, a `defaultRollConfig()`
(`TemplateBuilder.jsx:373`) faktycznie nie zapisuje `linkedAttr` — ale usunięcie pola zmieniłoby
te cztery fallbacki na puste, a `attr_linked`/`dice_skill_attr` w starych szablonach liczyłyby
się wtedy z atrybutu 0. Poza zakresem tego feature.

## Model danych

```go
// ModifierConfig konfiguruje popup modyfikatora rzutu karty customowej. nil == wyłączony,
// czyli każdy istniejący szablon startuje z modyfikatorem wyłączonym bez migracji.
type ModifierConfig struct {
	Enabled bool `bson:"enabled" json:"enabled"`

	// TraditionalTarget: "roll" (do wyniku, domyślnie) | "threshold" (do progu sukcesu)
	TraditionalTarget string `bson:"traditionalTarget,omitempty" json:"traditionalTarget,omitempty"`
	// PoolTarget: "dice_count" (liczba kości, domyślnie) | "success_threshold" (próg sukcesu)
	PoolTarget string `bson:"poolTarget,omitempty" json:"poolTarget,omitempty"`

	Step int `bson:"step,omitempty" json:"step,omitempty"` // krok inputu, 0 → 1
	Min  int `bson:"min,omitempty" json:"min,omitempty"`
	Max  int `bson:"max,omitempty" json:"max,omitempty"`

	Presets []ModifierPreset `bson:"presets,omitempty" json:"presets,omitempty"`
}

// ModifierPreset to jeden przycisk szybkiego wyboru w popupie, np. {-30, "Bardzo trudny"}.
type ModifierPreset struct {
	Value int    `bson:"value" json:"value"`
	Label string `bson:"label,omitempty" json:"label,omitempty"`
}
```

Dopisane do `TemplateSettings` jako `Modifier *ModifierConfig`. `Min == 0 && Max == 0` znaczy
„bez ograniczeń". Reguła patrzy na **parę** granic, nie na każdą osobno — dlatego sufit na zerze
jest wyrażalny: `{Min: -60, Max: 0}` zabrania dodatnich modyfikatorów, a `{0, 0}` to przypadek
nieskonfigurowany. Jedyne, czego tak nie zapiszesz, to „przytnij wszystko do zera" — a to robi już
wyłącznik `Enabled`. Stąd zwykłe `int`, nie `*int`: żadne pole nie musi odróżniać „nieustawione"
od „zero".

Konfiguracja dociera do rollera bez zmiany żadnej sygnatury: `RollWithTemplate` i
`RollWeaponWithTemplate` dostają już `template`, więc czytają `template.Settings.Modifier`.
Front analogicznie czyta `template.settings?.modifier` z propa `template`, który oba komponenty
karty już mają.

## Zachowanie rzutu po zmianie

Rozstrzyganie targetu żyje w **jednym** miejscu — nowej funkcji, która z konfiguracji i trybu
rzutu zwraca, gdzie modyfikator ma pójść. `rollFromFormula` i `rollFromFormulaDicePool` pytają ją
o decyzję, zamiast każda trzymać własną regułę (to właśnie rozjechanie się takich reguł jest
dzisiejszym problemem).

`Modifier == nil` lub `Enabled == false` → rzut jak dziś z modyfikatorem 0. Front i tak nie ma
skąd wziąć niezerowego modyfikatora, ale backend nie ufa frontowi: wyłączona konfiguracja
**zeruje** przysłany modyfikator, zamiast go stosować.

| tryb | target | efekt |
|---|---|---|
| traditional | `roll` | `finalRoll = result + modifier`; breakdown dokleja `+N` po stronie rzutu (dziś) |
| traditional | `threshold` | `finalRoll = result`; `threshold += modifier`; breakdown pokazuje modyfikator po stronie celu |
| dice_pool | `dice_count` | liczba kości pierwszego członu `+= modifier`, clamp do min. 1 |
| dice_pool | `success_threshold` | `threshold = cfg.PoolSuccessThreshold + modifier` |

`RollResult.Modifier` niesie do loga wartość, która **faktycznie została zastosowana**, a
`ModifierTarget` mówi gdzie. Jest jeden przypadek, w którym oba są zerowane mimo niezerowego
żądania: target `threshold` na polu bez rozstrzygalnego progu (np. `successType: "raw"`). Próg,
którego nie ma, nie może zostać przesunięty — a raportowanie modyfikatora jako zastosowanego
kazałoby logowi wypisać liczbę, która nie ruszyła ani rzutu, ani celu. To wprost wynika z D4: log
zawsze zgadza się z tym, co gracz widział.

## Frontend

### Nowy komponent `systems/custom/RollModifierOverlay.jsx`

Wyciągnięty z duplikatu w `CharacterSheet.jsx:361` i `CharacterDetails.jsx:286`. Props:
`{ label, config, onConfirm, onCancel }`. Trzyma własny stan wartości modyfikatora, więc oba
komponenty karty tracą `useState(modifier)` i cztery powtórzone resety.

Zachowanie:
- `config.enabled !== true` → overlay **nie renderuje się wcale**; `onRoll` strzela rzutem
  natychmiast z `modifier: 0`.
- Presety renderują się jako rząd chipów nad inputem, tylko gdy `config.presets` jest niepuste.
  Klik chipa potwierdza rzut od razu (jak `ModifierSelectionModal.jsx` w WFRP), bo osobne
  „wybierz, potem zatwierdź" to dwa kliknięcia na tę samą decyzję.
- Input respektuje `step`, `min`, `max` z konfiguracji.
- Enter zatwierdza, Escape zamyka — jak dziś.

To zmiana zachowania: dziś popup wyskakuje zawsze, a modyfikator jest domyślnie wyłączony, więc
istniejące karty customowe przestaną go pokazywać, dopóki MG go nie włączy w kreatorze.

### Wygląd — paleta jasnej karty

Przepisanie `.custom-roll-overlay__*` (`style.css:7481-7560+`) na schemat z CLAUDE.md:

| element | dziś | po |
|---|---|---|
| tło karty | `#1e1812` | `linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)` |
| border karty | `#c9975b` | `#7a5c42` |
| tytuł i tekst | `#e8d5b7` | `#3a2f1f` |
| etykieta | `rgba(232,213,183,.6)` | `#7a5c42` |
| tło inputu | `rgba(255,255,255,.06)` | `#fff9f0` |
| border inputu | `rgba(201,151,91,.4)` | `#c4a882`, focus `#7a5c42` |
| akcent (ikona kostki, chipy) | — | `#c9975b` |

Backdrop `rgba(0,0,0,.55)` zostaje.

### Kreator — `components/creator/ModifierConfigBuilder.jsx`

Nowa karta `creator__settings-card` w zakładce General, wstawiona po karcie kostek
(`TemplateBuilder.jsx:1568`), zapisywana istniejącym `updateSettings(patch)`
(`TemplateBuilder.jsx:1307`) — czyli automatycznie objęta debounce'owanym zapisem szablonu.

Zawartość: checkbox włączenia, dwa selecty targetów (traditional / pula) z żywą podpowiedzią z D4,
pola `step`/`min`/`max`, edytor presetów (wartość + etykieta, dodaj/usuń wiersz).

## Sprzątanie w zakresie

- `components/buttons/ModifierInput.jsx` — martwy kod, zero importerów w całym froncie. Usunąć
  razem z jego regułą CSS `.modifier-input` (`style.css:1996`). Uwaga: `.modifier-input-container`
  (`style.css:536`) **zostaje** — używa go `systems/warhammer4e/CharacterDetails.jsx:453`.
- Ścieżki legacy z D5.

## Testy

Backend (`internal/systems/custom/roller_test.go`):
- traditional × `roll` — wynik przesunięty, próg nietknięty.
- traditional × `threshold` — próg przesunięty, wynik surowy; osobno przypadek roll-under, gdzie
  wynik bez modyfikatora byłby sukcesem, a z modyfikatorem `-20` jest porażką.
- pool × `dice_count` — liczba wylosowanych kości rośnie o modyfikator; clamp do 1 przy dużym
  ujemnym modyfikatorze.
- pool × `success_threshold` — próg przesunięty, liczba kości nietknięta.
- `Modifier == nil` oraz `Enabled == false` — rzut identyczny jak z modyfikatorem 0, także gdy
  handler przyśle niezerowy modyfikator.
- rzut broni (`weapon_test.go`) — atak dziedziczy target, obrażenia zostają bez modyfikatora.
- usunięcie legacy: `RollWithTemplate` na polu bez formuły zwraca błąd.

Frontend:
- `RollModifierOverlay.test.jsx` — render presetów, klik chipa potwierdza z jego wartością,
  Enter/Escape, respektowanie `min`/`max`.
- ścieżka „wyłączony" — brak overlaya, rzut strzela od razu z `modifier: 0`.
- `ModifierConfigBuilder` smoke test — przełączenie targetu woła `onChange` z właściwym patchem.

i18n: nowe klucze `creator.modifier.*` (tytuł karty, hinty, etykiety targetów, edytor presetów)
równolegle w `locales/en/translation.json` i `locales/pl/translation.json`.

## Poza zakresem

- **Modyfikacja warunku sukcesu** (`SuccessType`) przez modyfikator — osobne zadanie.
- Konfiguracja modyfikatora per pole.
- Modyfikator dla systemów zaszytych (warhammer4e, coc7e, dnd5e) — mają własne mechanizmy.
- Modyfikator obrażeń broni.
