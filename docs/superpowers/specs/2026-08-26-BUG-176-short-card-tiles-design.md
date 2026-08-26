# BUG-176 — Skrócona karta postaci (custom): kafelki wg flagi i grupowanie po sekcjach

Data: 2026-08-26
Status: zaakceptowany, do implementacji

## Problem

Na skróconej karcie postaci (`systems/custom/CharacterDetails.jsx`) dla systemu customowego:

1. Renderuje się maksymalnie 6 kafelków — `rollableFields.slice(0, 6)`.
2. Flaga `showOnShortCard`, którą GM zaznacza w kreatorze kart postaci, **nie jest w ogóle czytana**
   przez skróconą kartę. Istnieje w kreatorze (`components/creator/TemplateBuilder.jsx:639`) i w modelu
   backendu (`internal/models/SystemTemplate.go:178`), ale panel filtruje pola po `type === 'attr' && rollable`.
3. Kafelki są jedną płaską siatką — brak podziału na sekcje szablonu.

Oczekiwane: karta pokazuje dokładnie te pola, którym GM zaznaczył flagę, pogrupowane po sekcjach
szablonu (3 kafelki jednej sekcji, odstęp, 4 kafelki następnej).

## Zakres

Zmiana wyłącznie frontowa. `ShowOnShortCard` już jest w `FieldDef` i leci w JSON — backend bez zmian.

## Decyzje projektowe

| Pytanie | Decyzja |
|---|---|
| Co kwalifikuje pole na kartę | **Wyłącznie** `showOnShortCard === true`. Bez limitu ilościowego, bez zależności od `rollable`. |
| Typy pól na karcie | `attr`, `number`, `progress`. `skill_table` / `skill_tree` pomijamy — skille trafiają na kartę przez gwiazdki (ulubione), osobną i działającą ścieżką. |
| Rozdzielenie sekcji | Odstęp + cienka linia (`rgba(201, 151, 91, 0.4)`), bez nagłówków tekstowych. |
| Umiejscowienie pasków `progress` | W swojej sekcji, w kolejności pól z szablonu (nie w osobnym bloku na górze). |

### Świadomy koszt

Istniejące szablony mają `showOnShortCard: false` na polach `progress`, więc paski HP/MP znikną
z panelu dopóki GM ich nie zaznaczy. Zgodnie z zasadą „brak backward compat" z `CLAUDE.md` — bez migracji.

## Rozwiązanie

### Wybór pól

W `systems/custom/CharacterDetails.jsx` `allFields` / `rollableFields` / `progressFields` zastępuje jeden memo:

```js
const SHORT_CARD_TYPES = ['attr', 'number', 'progress'];

const shortCardSections = useMemo(() => (template?.sections || [])
  .map(s => ({
    id: s.id,
    fields: (s.fields || []).filter(f => f.showOnShortCard && SHORT_CARD_TYPES.includes(f.type)),
  }))
  .filter(s => s.fields.length > 0), [template]);
```

Kolejność sekcji i pól = kolejność z szablonu. Sekcje bez zaznaczonych pól odpadają, więc nigdy nie
powstaje pusta grupa ani osierocony separator.

Panel `.character-details` ma już `max-height: 60vh; overflow-y: auto` (`style.css:213`), więc zdjęcie
limitu 6 nie wymaga nowego CSS — nadmiar kafelków się przewija.

### Render

Jedna siatka na sekcję. Pole `progress` rozciąga się na całą szerokość (`grid-column: 1 / -1`), dzięki
czemu zachowuje kolejność z szablonu bez dzielenia sekcji na pod-bloki:

```jsx
{shortCardSections.map(section => (
  <div key={section.id} className="custom-character-details__section">
    {section.fields.map(field =>
      field.type === 'progress'
        ? renderProgress(field)   // istniejący widget −/+
        : renderTile(field)       // attr | number
    )}
  </div>
))}
```

Kafelek: `abbr || label`, wartość, przycisk kości **tylko gdy `field.rollable`**. Typ `number` nigdy nie
jest rzucalny (przełącznik `rollable` w kreatorze dotyczy wyłącznie `attr` / `skill_table` / `skill_tree`,
`TemplateBuilder.jsx:781`), więc dostaje kafelek bez kości.

Źródła wartości:

- `attr` → `stats.attributes[key].current ?? base ?? 0` (backend zawsze wylicza `current = base + advances`)
- `number` → `stats.numbers[key] ?? 0`
- `progress` → `stats.progress[key]` — bez zmian

Sekcje ulubionych skilli i broni zostają na dole nietknięte.

### CSS

```css
.custom-character-details__section {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px;
}
.custom-character-details__section + .custom-character-details__section {
    border-top: 1px solid rgba(201, 151, 91, 0.4);
}
.custom-character-details__resource { grid-column: 1 / -1; }
```

Selektor sąsiedztwa rysuje linię wyłącznie *między* grupami — nigdy nad pierwszą ani pod ostatnią.
Wrapper `.custom-character-details__resources` (wraz z jego `border-bottom`) i
`.custom-character-details__attrs` znikają — po zmianie nikt ich nie używa.

### Sprzątanie w kreatorze

`components/creator/TemplateBuilder.jsx`:

- warunek przy przełączniku `showOnShortCard` (linia 630) zawęzić do `attr | number | progress`
- usunąć `showOnShortCard: false` z fabryk pól `skill_table` (linia 131) i `skill_tree` (linia 133)
- badge `▤` na kanwie (linia 903) zostaje bez zmian — renderuje się z flagi, a flagę mają już tylko właściwe typy

Stare szablony mogą mieć `showOnShortCard: true` na polu skillowym; filtr po typie to ignoruje, migracja
niepotrzebna. `ShowOnShortCard` zostaje w `FieldDef` — to jedna struktura wspólna dla wszystkich typów.

Żadnych nowych kluczy i18n.

## Testy

Nowy plik `systems/custom/CharacterDetails.shortCard.test.jsx`, obok istniejącego `.favorites.test.jsx`.
Kolejność TDD: testy najpierw (czerwone), potem implementacja.

1. Szablon z 8 polami z flagą → renderuje się 8 kafelków (regresja limitu 6).
2. Pole rzucalne bez flagi → nie pojawia się na karcie.
3. Szablon z 2 sekcjami (3 i 4 zaznaczone pola) → dwa elementy `__section` w kolejności z szablonu,
   o odpowiedniej liczbie dzieci.
4. Sekcja bez zaznaczonych pól → nie renderuje się wcale.
5. `attr` z `rollable: false` → kafelek bez przycisku kości; z `rollable: true` → klik otwiera modal modyfikatora.
6. `progress` z flagą → widget `−`/`+` wewnątrz swojej sekcji; `+` wysyła `PUT` z podbitym `current`.

Uruchomienie: pakiet frontowy. Znana bazowa awaria `App.test.js` (błąd ESM w axios) nie jest regresją.

## Pliki

- `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx` — wybór pól i render
- `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.shortCard.test.jsx` — nowy
- `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` — zawężenie flagi
- `warhammer-battle-helper-front/src/style.css` — `__section`, usunięcie `__resources` / `__attrs`
