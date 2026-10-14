# PLAYRPG-266 — System „D&D 5e” → „SRD 5.2” (bez znaków towarowych WotC)

## Cel

Nazwy „Dungeons & Dragons” / „D&D” to znaki towarowe Wizards of the Coast — nie wolno ich używać
bez licencji. Mechanika systemu pochodzi z **SRD 5.2**, wydanego na **CC-BY-4.0**: wolno jej używać
(także komercyjnie) pod warunkiem umieszczenia notki atrybucji. CC-BY nie daje praw do znaków
towarowych i nie wolno sugerować poparcia WotC.

Zmiana: system widoczny jako „SRD 5.2”, w kodzie i danych bez śladu „dnd”, z atrybucją CC-BY.

## Audyt treści

Mechanika w kodzie mieści się w SRD 5.2: 6 cech, 18 umiejętności, rzuty obronne,
przewaga/utrudnienie, rzuty przeciw śmierci, sloty czarów, 15 stanów, charakter, „Species”.
Brak list klas/ras/czarów/potworów/nazw settingowych — klasa i rasa to wolne pola tekstowe.
Personality/ideals/bonds/flaws to ogólne słowa. Do zmiany jest wyłącznie nazewnictwo + brakująca
atrybucja.

Poza zakresem (to samo ryzyko, odnotowane): „Warhammer” (Games Workshop), „Call of Cthulhu”
(Chaosium), nazwa aplikacji.

## Decyzje

| Temat | Decyzja |
|---|---|
| ID systemu | `dnd5e` → `srd5`. Stały, nieprzezroczysty klucz — nie zmienia się przy zmianie etykiety. |
| Etykieta | Wyłącznie i18n: `gameSystems.<id>`. `gameSystems.srd5 = "SRD 5.2"` (en i pl). |
| Pole `label` w modułach systemów | Usunięte ze **wszystkich** pięciu modułów — jedno źródło prawdy. |
| Istniejące dane | Migracja skryptem `cmd/migrate-dnd5e-to-srd5`, uruchamianym ręcznie po deployu. |
| Atrybucja | Strona `/licenses` (pełna notka) + stopka w arkuszu SRD z linkiem do niej. |
| Historyczne docs | `docs/superpowers/**` bez zmian (zapis historii). Żywe docs aktualizowane. |

## 1. Etykieta tylko w i18n

Dziś etykiety są zahardkodowane w `systems/*/index.js` (`label: 'D&D 5e'`, `'Własny system'`, …),
a klucze `gameSystems.*` w `translation.json` istnieją, ale nikt ich nie czyta.

- Usunąć `label` z modułów `warhammer4e`, `coc7e`, `coc7e_dark_ages`, `srd5`, `custom`.
- `listSystems()` zwraca `{ value }`.
- Konsumenci liczą etykietę przez `t(\`gameSystems.${id}\`)`:
  - `components/lobby/CreateGameDialog.jsx` (lista systemów, `regularSystems`),
  - `components/lobby/GameCard.jsx:24`,
  - każdy inny czytelnik `.label` modułu systemu (np. zakładka Systems w panelu admina) — ustalić
    grepem w planie.
- `translation.json` en/pl: dodać `gameSystems.srd5`, usunąć `gameSystems.dnd5e`.
- Komentarz przy `systems` w `registry.js`: nowy system wymaga klucza `gameSystems.<id>` w en i pl.

Skutek: przyszła zmiana nazwy = edycja dwóch plików JSON, bez migracji i bez backendu.

## 2. Zmiana nazw w kodzie

### Backend
- `internal/systems/dnd5e/` → `internal/systems/srd5/`, `package dnd5e` → `package srd5`
  (z `roller_test.go`).
- `internal/systems/registry/registry.go`: klucz mapy i `systemOrder`.
- Testy z literałem `"dnd5e"`: `AdminHandler_systems_test.go`, `SystemAccessService_test.go`,
  `registry/defaultstats_smoke_test.go`, `registry/tokenfields_smoke_test.go`.
- Komentarze „D&D 5e” → „SRD 5.2” (m.in. `GameService.go:735`, komentarze w pakiecie).

### Frontend
- `src/systems/dnd5e/` → `src/systems/srd5/`, wpis w `systems/registry.js`.
- Komponenty `DnD5e*` → `Srd5*`: `DnD5eCharacterSheet`, `DnD5eCharacterDetails`,
  `DnD5eAdvantageOverlay`, `DnD5eAdvantageModal`, `DnD5eSkillRoll`, `DnD5eWeaponRoll` oraz
  identyfikator `dnd5e` w `index.js`.
- i18n: namespace `dnd.*` → `srd.*` (blok w en i pl + ~126 wywołań `t('dnd.…')`).
- CSS: klasy `.dnd-*` → `.srd-*` w `style.css` i JSX.
- Komentarz „conditions (PHB)” → „conditions (SRD 5.2)”; `console.error('Error saving D&D
  character')` → „SRD”.
- Komentarze wspominające `dnd5e` w `TruncatedLabel.jsx:16`, `systems/custom/CharacterSheet.jsx:452`.
- `utils/tokenGeometry.js:50`: „D&D 3.5 style” → „alternating 5-10-5 diagonal rule”.
- Testy z `dnd5e`/„D&D 5e”: `CreateGameDialog.test.jsx`, `TruncatedLabel.test.jsx`,
  `WeaponRoll.smoke.test.jsx`, `CustomWeaponRoll.smoke.test.jsx`.

### Pułapka: dnd-kit
Biblioteka drag-and-drop **dnd-kit** nie ma związku z D&D. **Nie ruszać**: klasy `.dnd-context`
(jedyna kolizja prefiksu w `style.css`, używana przez `components/DndContext.jsx`), samego
`DndContext.jsx`, „DnD Kit” w README/CLAUDE.md. Rename robić per katalog i po jawnej liście
prefiksów, nigdy ślepym `s/dnd/srd/`.

### Dokumentacja
Aktualizować żywe: `docs/architecture.md`, `MULTI_SYSTEM_ANALYSIS.md`, CLAUDE.md jeśli wymienia
`dnd5e`. `docs/superpowers/**` i `.claude/agent-memory/**` zostają.

## 3. Migracja danych

`warhammer-battle-helper-backend/cmd/migrate-dnd5e-to-srd5/main.go`, wzór:
`cmd/migrate-token-display-hpbar`. Uruchomienie:

```
MONGO_URI=... MONGO_DB=... go run ./cmd/migrate-dnd5e-to-srd5/
```

| Kolekcja | Operacja |
|---|---|
| `games` | `updateMany({gameSystem:"dnd5e"}, {$set:{gameSystem:"srd5"}})` |
| `characters` | `updateMany({gameSystem:"dnd5e"}, {$set:{gameSystem:"srd5"}})` |
| `system_templates` | `updateMany({baseSystem:"dnd5e"}, {$set:{baseSystem:"srd5"}})` |
| `system_access` | `_id` niezmienne → wstaw kopię `dnd5e` jako `_id:"srd5"` (tylko gdy `srd5` nie istnieje), potem usuń `dnd5e` |

- Decyzja dla `system_access` w czystej funkcji `planAccessMove(dnd, srd *models.SystemAccess)
  (insert *models.SystemAccess, deleteOld bool)` — testowalna bez Mongo. Gdy admin zdążył ustawić
  `srd5` w panelu, jego ustawienie wygrywa; `dnd5e` i tak jest usuwany.
- Wypisuje liczbę zmian per kolekcja. Idempotentny: drugie uruchomienie = same zera.
- `rollType` i `roll_stats` nie zawierają klucza systemu — bez zmian.

**Wdrożenie:** deploy → natychmiast skrypt na prod. Między nimi stare gry D&D chwilowo nie działają
(nowy kod nie zna `dnd5e`; frontend `getSystem()` cicho spada na Warhammera). To samo lokalnie.

## 4. Atrybucja CC-BY

### Strona `/licenses`
- Nowy `components/Licenses.jsx` na wzór `PrivacyPolicy.jsx`; trasa anonimowa w `App.js` obok
  `/privacy`; link w `Navigation.jsx` obok linku do polityki prywatności.
- Oficjalna notka atrybucji SRD 5.2 **po angielsku, dosłownie**, jako stała w JSX z komentarzem
  wyjaśniającym, czemu jest poza i18n (tekstu prawnego się nie tłumaczy). Brzmienie zweryfikować
  ze źródłem WotC przy implementacji. Oczekiwany tekst:
  > This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of
  > the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the
  > Creative Commons Attribution 4.0 International License, available at
  > https://creativecommons.org/licenses/by/4.0/legalcode.
- Nagłówek strony i zdanie wyjaśnienia przez i18n (en + pl).

### Stopka w arkuszu SRD
- `.srd-sheet__attribution` na dole `Srd5CharacterSheet`: `t('srd.attribution')`
  („Zawiera materiały z SRD 5.2 · CC-BY-4.0” / „Includes material from SRD 5.2 · CC-BY-4.0”) +
  `<a href="/licenses" target="_blank" rel="noopener noreferrer">`.
- Nowa karta, bo arkusz żyje w popupie sesji i w oknie `/character-sheet` — nawigacja w miejscu
  wyrzuciłaby gracza.
- Kolor `#7a5c42`, mała czcionka. Tylko arkusz `srd5`.

## 5. Testy

Istniejące (pokryją rename): smoke testy rejestru Go (iterują `systemOrder`), `roller_test.go`,
`standaloneRender.test.jsx` (iteruje `listSystems()`), `CreateGameDialog.test`,
`systemOptions.test`, smoke `WeaponRoll`.

Nowe:
1. Front: każdy `listSystems()` ma `gameSystems.<id>` w en **i** pl.
2. Go: `planAccessMove` — tabela: tylko `dnd5e` / oba / tylko `srd5` / żaden.
3. Front: arkusz `srd5` renderuje link `/licenses` z `target="_blank"`.

Grep końcowy: `dnd5e|D&D|DnD5e|\.dnd-|t\('dnd\.` w `warhammer-battle-helper-front/src`,
`warhammer-battle-helper-backend`, żywych docs — dozwolone wyłącznie dnd-kit (`.dnd-context`,
`DndContext`).

Pełne suity: `go test ./...`, `CI=true npm test -- --watchAll=false` (baseline fail `App.test.js`).

Ręcznie: gra D&D na starym kodzie → nowy kod + skrypt → otwiera się z arkuszem SRD; etykieta w
lobby i kreatorze (en/pl); stopka w popupie i oknie standalone; `/licenses` po wylogowaniu.
