# FEATURE-157 — Konfigurowalny skok wartości dla pól `attr` i `number`

**Status:** zaprojektowane, gotowe do planu implementacji
**Zgłoszone:** 2026-09-06

## Cel

W kreatorze kart postaci pola typu **atrybut** (`attr`) i **liczba** (`number`) dostają nowe pole
konfiguracji: **Skok**. Wartość mówi, o ile zmienia się wartość pola po użyciu strzałek przy
inpucie na karcie postaci. Domyślnie `1`.

Przykład: atrybut „Zdolność Walki" w systemie procentowym rośnie co 5. GM ustawia skok `5`, gracz
klika strzałkę w górę i wartość idzie `30 → 35`, a nie `30 → 31`.

## Zakres

| Typ pola | Skok |
|---|---|
| `attr` | tak — jeden skok, wspólny dla inputu **Baza** i inputu **Rozwinięcie** |
| `number` | tak |
| `progress` | **nie** — `current`/`max` zostają ze skokiem 1 |
| pozostałe | nie dotyczy (nienumeryczne) |

Poza zakresem: walidacja skoku po stronie Go, migracja istniejących szablonów, osobny skok dla
rozwinięć.

## Decyzje projektowe

### 1. Jeden skok na pole, nie dwa

`attr` z `hasAdvances` ma dwa edytowalne inputy. Osobne „Skok bazy" i „Skok rozwinięcia" zagraciłyby
panel konfiguracji pola dla przypadku, którego nikt nie zgłosił. Jedno pole `step` steruje oboma.

### 2. Natywny atrybut HTML `step`, nie własne przyciski +/−

Natywny `step` **nie dodaje** wartości — snapuje ją do siatki `stepBase + n * step`. Przy
`min=0, step=5` i wartości `3` strzałka w górę daje `5`, nie `8`. Wartość spoza siatki raportuje
`stepMismatch` przez pseudoklasę `:invalid` — ta pseudoklasa i cała walidacja ograniczeń
(constraint validation) działają na inputach niezależnie od tego, czy siedzą w `<form>`, więc
brak formularza tu nic nie tłumaczy. Prawdziwy powód, dla którego w Chrome nic nie widać: żaden
arkusz stylów w projekcie nie stylizuje `:invalid` (sprawdzone — zero wystąpień `:invalid` i
`checkValidity` w `src/`), a Chrome bez własnego CSS nie rysuje niczego z siebie. Firefox jest
inny — jego arkusz UA maluje czerwoną poświatę na `:-moz-ui-invalid` po tym, jak użytkownik
wejdzie w interakcję z polem, więc gracz edytujący wartość spoza siatki (postać założona przed
podniesieniem skoku przez GM, albo GM-owy `Default`, który nie jest wielokrotnością skoku — nic
tego nie wymusza) zobaczy trwały czerwony halo wokół tego inputu w Firefoksie. To zaakceptowana
kosmetyczna konsekwencja wyboru natywnego `step`, nie błąd do naprawienia.

**Decyzja potwierdzona ponownie 2026-09-07, po zobaczeniu jej na żywo.** Zgłoszony przypadek:
`min = 1`, skok `3`, wartość wpisana ręcznie jako `3` — strzałka w górę daje `4`, nie `6`, bo
siatka kotwiczy się na `min` i wygląda tak: `1, 4, 7`. Rozważono przejście na czysty offset
(strzałka = wartość ± skok) i **odrzucono**: GM ma wiedzieć, co ustawia i jakie to niesie
konsekwencje, a jeśli siatka mu przeszkadza, zawsze może ustawić skok `1`.

Odrzucenie było świadome także dlatego, że offset jest znacznie droższy, niż wygląda. Kliknięć
natywnego spinnera **nie da się przechwycić** — żadne zdarzenie nie odróżnia „kliknięto strzałkę"
od „wpisano znak" (`inputType` dla spinnera jest niespójny między przeglądarkami). Offset wymagałby
więc ukrycia natywnego spinnera i narysowania własnych przycisków na czterech ciasnych inputach
(`attr` prosty ma `max-width: 64px`), obsługi `ArrowUp`/`ArrowDown` z `preventDefault`, a przy tym
zostawiłby `progress` z natywnym spinnerem — czyli dwa różne wyglądy strzałek na jednej karcie.

Sprawdzono i odrzucono też dwie próby uratowania natywnych strzałek: usunięcie `min` z inputu
przesuwa kotwicę siatki na `0` (`3 → 6` działa, ale `4 → 6`, nie `7` — snap zostaje), a liczenie
`min` dynamicznie tak, by siatka zawsze zawierała bieżącą wartość, unieruchamia strzałkę w dół,
bo wartość ląduje dokładnie na wyliczonej podłodze.

Wybrano mimo tego, bo:

- jeden atrybut na input, zero własnej logiki i zero stanu do zsynchronizowania,
- działa jednocześnie dla strzałek spinnera, strzałek klawiatury i scrolla na sfokusowanym polu,
- alternatywa (czysty offset `+/- step`) wymaga własnych przycisków albo `onKeyDown` na
  `ArrowUp`/`ArrowDown` z `preventDefault`, bo natywnych strzałek nie da się przechwycić —
  więcej kodu, więcej testów, w zamian tylko brak efektu „przyklejania" do siatki.

Konsekwencja do zaakceptowania: wartość wpisana ręcznie poza siatką przyklei się do niej przy
pierwszym użyciu strzałki.

### 3. Kotwica siatki różni się między Bazą a Rozwinięciem

Przeglądarka kotwiczy siatkę na atrybucie `min`, a przy jego braku na `0`.

- Baza ma `min={field.min ?? undefined}` → przy `min=3, step=5` chodzi po `3, 8, 13`.
- Rozwinięcia mają `min={0}` na sztywno → chodzą po `0, 5, 10`.

To jest celowe: rozwinięcia są przyrostem liczonym od zera, nie wartością w zakresie atrybutu.

### 4. `Step int`, nie `*int`

`Min`, `Max` i `Default` są pointerami, bo `0` jest dla nich legalną wartością i `omitempty`
skasowałoby ją z dokumentu. Dla skoku `0` jest nielegalne, więc pointer nie chroni przed niczym —
dodaje tylko `*` w każdym użyciu.

Odrzucone też: wyliczanie skoku z `min`/`max` (np. zakres 0–100 → skok 5). Magia, GM bez kontroli.

## Backend

`internal/models/SystemTemplate.go`, struktura `FieldDef`, obok `Min`/`Max`/`Default`:

```go
// Step is the arrow-key / spinner increment for "attr" and "number" inputs on the sheet.
// 0 or absent means 1 — it is a plain int, not a pointer, because 0 is not a legal step,
// so omitempty cannot erase a meaningful value the way it could for Default.
Step int `bson:"step,omitempty" json:"step,omitempty"`
```

To pole czysto prezentacyjne. Żadna logika Go go nie czyta: `SeedDefaults`
(`internal/systems/custom/plugin.go:63`), rollery i `ComputeDerived` zostają nietknięte.
`FieldDef` deserializuje się w całości, a publish i clone szablonu nie whitelistują propsów —
więc samo dodanie pola wystarcza, żeby przeszło całą ścieżkę.

Brak migracji: w starych szablonach `step` jest nieobecny w dokumencie, więc po deserializacji
`FieldDef.Step` ma wartość zerową, a `omitempty` wycina ją z JSON-a — front dostaje `undefined`
i podmienia na `1`.

## Frontend — kreator

`components/creator/TemplateBuilder.jsx`:

1. `makeDefaultField` (`:130`, `:131`) — `attr` i `number` dostają `step: 1`, żeby nowe pola miały
   jawną wartość w dokumencie.
2. Nowy wiersz zaraz po wierszu Min/Max/Domyślna (`:654`), pod tym samym warunkiem
   `field.type === 'attr' || field.type === 'number'`:

```jsx
          <TextField
            size="small"
            label={t('creator.fieldStep')}
            helperText={t('creator.fieldStepHint')}
            type="number"
            value={field.step ?? ''}
            onChange={e => up({ step: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))) })}
            onBlur={() => {
              // Pole nietknięte (undefined — szablon sprzed feature'a) zostaje nietknięte:
              // sam focus + blur bez edycji nie może odpalić `up()`, bo to zastępuje cały
              // obiekt pola i planuje PATCH całego szablonu (BUG scenariusz z finalnego review).
              if (field.step === undefined) return;
              const clamped = field.step == null || field.step < 1 ? 1 : field.step;
              if (clamped !== field.step) up({ step: clamped });
            }}
            sx={{ flex: '0 0 140px' }}
            InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1, min: 1 } }}
          />
```

Wrapper to MUI `<Box sx>`, tak jak wiersz wyżej — panel kreatora nie używa tu klas BEM.

**`Math.trunc` jest obowiązkowy, nie kosmetyczny.** `type="number"` odrzuca tylko znaki
nienumeryczne, nie ułamki. Wartość `2.5` doszłaby do backendu jako `int` i wywaliła **cały** PATCH
szablonu na 400, a `saveTemplate` połyka ten błąd po cichu — od tego momentu każda kolejna edycja
szablonu znikałaby bez widocznej przyczyny. Ten sam powód stoi za truncem w Min/Max/Domyślna
(komentarz w `TemplateBuilder.jsx:650`).

**Clamp na `onBlur`, nie na `onChange`.** Clamp w locie psuje pisanie: wpisujesz `0` z zamiarem
`05`, stan natychmiast skacze na `1`, kolejny znak daje `15`. Trunc zostaje w `onChange` (spójnie
z Min/Max/Domyślna), a podniesienie `<1` do `1` dzieje się po wyjściu z pola.

**Floor w `onChange` (`Math.max(0, …)`).** Kreator autosave'a wystrzeluje PATCH 1200 ms po zmian
zaraz po `onChange` (TemplateBuilder.jsx:1178), podczas gdy clamp `<1 → 1` dopiero na `onBlur`.
Bez floora GM może wpisać `-5` i zrobić pauzę, powodując PATCH z ujemnym skokiem, który Go akceptuje,
a Mongo przechowuje. Floor na `0`, nie `1`, bo musi pozwolić na `0` jako stan przejściowy pomiędzy
`onChange` a `onBlur` (scenariusz „GM wpisuje 0 z zamiarem 05"). Przechowywane `0` jest wycinane
przez `omitempty` i czytane z powrotem jako brak, który karta uobecnia jako `1` przez `|| 1`.

**Guard `if (field.step === undefined) return` w `onBlur`.** Pole sprzed feature'a ma `step: undefined`
w szablonie. Samo focus + blur bez edycji nie powinno zapisywać tego pola — `up()` zastępuje cały
obiekt pola i planuje PATCH całego szablonu (potencjalny bug z finalnego review). Pole zawierające
wartość spoza zakresu (np. `-5` z autosave'a) jest `defined`, więc guard przepuszcza, clamp go
podnosi do `1`, i ten samoszczędzący się write odbywa się na `blur`. To harmless i pożądane.

3. Chip na kanwie (`:904`) — obok zakresu `0 – 100` dochodzi `co 5` (klucz
   `creator.canvasStepChip` z interpolacją), renderowany tylko gdy `field.step > 1`. Dzieli
   istniejącą klasę `.creator__canvas-field-range` (`style.css:8895`), więc nowe CSS nie jest
   potrzebne. Bez chipa konfiguracja jest niewidoczna, dopóki GM nie kliknie pola.

## Frontend — karta postaci

`systems/custom/CustomSheetBody.jsx` — `step={field.step || 1}` na czterech inputach:

| Linia | Input |
|---|---|
| `:491` | `attr` baza, wariant z rozwinięciami |
| `:503` | `attr` rozwinięcia |
| `:528` | `attr` baza, wariant prosty |
| `:546` | `number` |

`|| 1`, nie `?? 1`. Musi złapać dwa źródła:

- `undefined` — stary szablon sprzed feature'a. Oba operatory by to załatwiły.
- `0` — **stan lokalny kreatora**. GM wpisuje `0` w pole Skok, `onChange` robi `Math.trunc(0) = 0`
  i dopóki nie wyjdzie z inputu, `field.step === 0` żyje w stanie Reacta. `TemplateBuilder.jsx:1113`
  renderuje `<CustomSheetBody sections={sections} />` jako live preview na dokładnie tym stanie,
  więc to zero rzeczywiście dociera do prawdziwej ścieżki renderu i dałoby `step={0}`.

To dotarcie samo w sobie nie jest widocznym błędem: live preview kreatora jest **read-only**
(`CustomSheetBody.jsx:180` liczy `readOnly = !onChange`, a `TemplateBuilder.jsx:1113` renderuje
komponent bez `onChange`). Read-only input numeryczny i tak jest zablokowany na edycję przez
użytkownika, a Chrome nie rysuje na nim strzałek spinnera, więc `step="0"` na takim inpucie jest
martwe — nic go tam nie odczyta ani nie zasnapuje. `|| 1` zostaje mimo to właściwym wyborem: to
defensywny floor na wartości, która legalnie występuje w stanie (nawet jeśli akurat w tym
konkretnym miejscu renderu nieszkodliwie), i jedyny z dwóch operatorów, który przy okazji łapie
też `undefined`. `?? 1` przepuściłoby zero dalej — bez tu widocznych skutków, ale bez powodu,
żeby to ryzykować.

Zero **nie** przychodzi z Go: `omitempty` wycina je i z JSON-a, i z BSON-a, więc wartość `0` nie
przekroczy drutu ani nie wyląduje w Mongo.

## i18n

Do `locales/en/translation.json` i `locales/pl/translation.json`, w sekcji `creator`:

| Klucz | en | pl |
|---|---|---|
| `creator.fieldStep` | `Step` | `Skok` |
| `creator.fieldStepHint` | `How much the input arrows change the value` | `O ile zmieniają wartość strzałki przy polu` |
| `creator.canvasStepChip` | `step {{step}}` | `co {{step}}` |

## Testy

Katalog `components/creator/` nie ma testów i ten feature ich nie wprowadza. Pokrycie idzie do
`systems/custom/CustomSheetBody.smoke.test.jsx` — nowy blok, trzy przypadki:

1. `attr` z `hasAdvances: true` i `step: 5` → oba inputy mają `step="5"`.
2. `attr` prosty ze `step: 10` → `step="10"` (drugie miejsce renderu bazy, osobna gałąź kodu).
3. `number` ze `step: 5` → `step="5"`.
4. `number` bez `step` → `step="1"`.
5. `number` ze `step: 0` → `step="1"` (zero ze stanu kreatora przed clampem w `onBlur`).

jsdom czyta `input.getAttribute('step')` normalnie — bez layoutu i bez stubów.

Uruchomienie: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody` z
`warhammer-battle-helper-front/`.
