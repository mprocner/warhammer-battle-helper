# FEATURE-181 — Martwy łańcuch `isGM` w kartach postaci

**Status:** backlog
**Znalezione:** 2026-08-26, podczas przeglądu całego brancha FEATURE-172

## Objaw

Prop `isGM` jest przekazywany przez trzy poziomy komponentów i **nikt go nie czyta**. Nic go nie
waliduje, więc gdyby wyliczenie było błędne, żaden test ani ręczne sprawdzenie by tego nie pokazało.

## Dowód

| Miejsce | Co robi z `isGM` |
|---|---|
| `components/DndContext.jsx:1131` | przekazuje do `CharacterSheetHost` |
| `components/CharacterSheetHost.jsx:19,50` | przyjmuje i przekazuje do karty systemu |
| `systems/coc7e/CharacterSheet.jsx:20` | destrukturyzuje, **nie używa** |
| `systems/custom/CharacterSheet.jsx:17` | destrukturyzuje, **nie używa** |
| `systems/dnd5e/CharacterSheet.jsx:22` | destrukturyzuje, **nie używa** |
| `systems/warhammer4e/CharacterSheet.jsx:27,37` | destrukturyzuje i podaje dalej do `useAutoSave` |
| `systems/warhammer4e/hooks/useAutoSave.js:14` | bierze jako parametr, **nie czyta go ani razu** |

Weryfikacja: `grep -n "isGM" systems/warhammer4e/hooks/useAutoSave.js` zwraca dokładnie jedną linię —
deklarację parametru.

`CharacterSheetPage` (osobne okno) przestał go wyliczać i przekazywać w commicie `26cb0b4`, właśnie
dlatego, że dokładał kolejne ogniwo do łańcucha prowadzącego donikąd.

Uwaga: `CharacterDetails` w każdym systemie też przyjmuje `isGM` — to **osobna sprawa**, tam nie
sprawdzano, czy jest używany. Nie wrzucać obu do jednego worka bez ponownego sprawdzenia.

## Czego nie wiemy

Najciekawsze pytanie nie brzmi „czy usunąć", tylko **dlaczego to tam jest**.

Parametr `isGM` w `useAutoSave` sugeruje, że autozapis kiedyś zachowywał się inaczej dla MG — na
przykład MG mógł zapisywać cudze karty, a gracz tylko swoją, albo odwrotnie: karta gracza zapisywana
przez MG nie miała nadpisywać czegoś. Jeśli tak było, to funkcja **zginęła po cichu** przy jakimś
refaktorze i mamy do czynienia z regresją, a nie z nadmiarowym kodem.

Zanim skasujesz łańcuch, sprawdź historię:

```bash
git log -p --follow -- warhammer-battle-helper-front/src/systems/warhammer4e/hooks/useAutoSave.js \
  | grep -n "isGM" -B5 -A15
```

Jeśli `isGM` był kiedyś czytany — to jest zgłoszenie błędu, nie sprzątanie.
Jeśli nigdy nie był — usuń cały łańcuch (`DndContext` → `CharacterSheetHost` → cztery karty →
`useAutoSave`) w jednej zmianie.

## Dlaczego to nie jest kosmetyka

Martwy parametr w sygnaturze funkcji czyta się jak kontrakt: „to zachowanie zależy od tego, czy
jesteś MG". Następna osoba, która będzie modyfikować autozapis, uwierzy w ten kontrakt i będzie
ostrożna tam, gdzie nie trzeba — albo, gorzej, dopisze logikę pod flagę, która nigdy nie dociera
z sensowną wartością.
