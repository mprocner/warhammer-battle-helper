# Postacie i systemy gry

## Jak to działa

**Plugin systemów.** Każdy system to implementacja `GameSystem` (backend) i moduł w
`src/systems/<klucz>/` (frontend). Backend:

```go
type GameSystem interface {
    RollSkill(stats bson.Raw, skillKey string, modifier, diceMod, target int) (*RollResult, error)
    RollWeapon(stats bson.Raw, weaponName, weaponSkill, damage string, modifier, diceMod int) (*RollResult, error)
    DefaultStats() (bson.Raw, error)
    ComputeDerived(stats bson.Raw) (bson.Raw, error)
    GetDisplayName(stats bson.Raw) string
    SetDisplayName(stats bson.Raw, name string) (bson.Raw, error)
    TokenFields() []TokenFieldDef   // pola, które można podpiąć pod token
}
```

Rejestracja: `internal/systems/registry/registry.go` (mapa + `systemOrder`).
Frontend: `src/systems/registry.js` → `getSystem(key)` zwraca moduł z `CharacterSheet`,
`CharacterDetails`, `normalizeCharacter`, `buildPayload` i komponentami rzutów do logu.
Nieznany klucz przechodzi na `warhammer4e`.

| Klucz | System | Kość | Uwagi |
|---|---|---|---|
| `warhammer4e` | WFRP 4e | d100 | Poziomy sukcesu (SL) |
| `coc7e` | Call of Cthulhu 7e | d100 | Stopnie sukcesu, kości premii i kary (`diceMod`), poczytalność |
| `coc7e_dark_ages` | CoC: Dark Ages | d100 | Wariant CoC z własną listą umiejętności |
| `srd5` | SRD 5.2 | d20 | Przewaga i utrudnienie, ST (`target`) |
| `custom` | Własny system | dowolna | Wszystko z szablonu, patrz [05-kreator-szablonow.md](05-kreator-szablonow.md) |

**Postać** (`Character`) ma surowe `Stats` (`bson.Raw`). Model nie zna pól żadnego systemu.
`ComputeDerived` przelicza wartości pochodne przy GET listy, tworzeniu, edycji i klonowaniu.
Poza pełnym `PUT` istnieją punktowe edycje do sterowania z tokenu:
- `PATCH /statField` — ± albo wartość jednego liścia `Stats` (np. HP), z przycięciem do zakresu,
- `PATCH /state` — poziom stanu (`CharacterState{Name, Level}`), znika przy poziomie ≤ 0,
- `PATCH /killed` — przekreślenie „martwy” na tokenie.

**Widoczność karty.** MG widzi wszystkie postacie. Gracz widzi tylko te, gdzie jest
w `VisibleTo` („ma kartę”). Widoczność **tokenu** na mapie to osobna rzecz (`Hidden` na
umieszczeniu), opisana w [06-scena.md](06-scena.md).

**Rzuty z karty.** Klik w cechę, umiejętność albo broń → `POST /rollSkill` lub `/rollWeapon`
z `skillKey` (np. `attr_WS`, `MELEE_BASIC`, a w `custom` klucz pola). Serwer losuje, buduje
`RollResult` i publikuje go z widocznością wybraną w czacie (patrz
[07-czat-i-rzuty.md](07-czat-i-rzuty.md)). Dla `custom` rzut idzie przez
`RollWithTemplate` z szablonem osadzonym w grze.

**Okna karty.** Karta otwiera się w przeciąganym popupie albo w osobnej karcie przeglądarki
(`/character-sheet`, `CharacterSheetPage.jsx`). Osobne okno samo pobiera postać i grę, a
widoczność rzutu dostaje w parametrze URL jako migawkę z chwili otwarcia.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Interfejs i wynik rzutu | `internal/systems/interface.go` |
| Implementacje | `internal/systems/<klucz>/` (`roller.go`, `character.go`, `skills.json`) |
| Endpointy postaci | `internal/http/CharacterHandler.go` |
| Rzuty | `GameService.RollSkill` / `RollWeapon` → `executeRoll` |
| Moduły frontu | `src/systems/<klucz>/` (`CharacterSheet.jsx`, `CharacterDetails.jsx`, `rolls/`) |
| Wspólne dla kart | `src/systems/shared/` (`CharacterHeader`, `characterApi`, `useCharacterSheetActions`) |
| Panel szczegółów na siatce | `src/components/CharacterDetailsPanel.jsx` |
| Widoczność, klonowanie | `src/components/CharacterVisibilityModal.jsx`, `CloneCharacterModal.jsx` |

## Pułapki

- Nowy system to: wpis w obu rejestrach, klucz `gameSystems.<klucz>` w en i pl (pilnuje
  `registry.labels.test.js`) i otwarcie go w panelu admina. Bez tego nikt nie może utworzyć gry.
- `CharacterHandler` wysyła dwa różne payloady: pełny tylko do MG i posiadaczy karty, a
  projekcję tokenu do pozostałych. Nie wysyłaj `Stats` przez `BroadcastToGame` do wszystkich.
- `CreatedBy` nie daje prawa edycji (patrz [02-konta-i-dostep.md](02-konta-i-dostep.md)).
- Brak zgodności wstecz: zmiana kształtu `Stats` nie wymaga migracji, stare dane można usunąć.
