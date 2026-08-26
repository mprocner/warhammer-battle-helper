# FEATURE-182 — Ciche awarie zapisu i rzutu w wyrwanym oknie karty

**Status:** backlog
**Znalezione:** 2026-08-26, podczas przeglądu całego brancha FEATURE-172

## Objaw

W karcie postaci otwartej przez „Otwórz w nowym oknie" (`/character-sheet`) nieudany autozapis
i nieudany rzut **nie dają żadnego sygnału**. Edycje przepadają w ciszy — użytkownik widzi wpisaną
wartość na ekranie i ma prawo sądzić, że jest zapisana.

## Dwie niezależne warstwy problemu

### 1. Kanał raportowania jest zaślepką

`components/CharacterSheetPage.jsx:90`:

```jsx
addLogMessage={() => {}}
```

Karta systemu `custom` raportuje tym kanałem trzy rzeczy:

| Linia | Komunikat |
|---|---|
| `systems/custom/CharacterSheet.jsx:112` | `character.saveFailed` |
| `systems/custom/CharacterSheet.jsx:290` | `combat.rollFailed` |
| `systems/custom/CharacterSheet.jsx:305` | `combat.rollFailed` |

W oknie głównym `addLogMessage` wrzuca wpis do panelu logu sesji. Osobne okno **nie ma panelu logu**,
więc nie ma dokąd tych komunikatów skierować — stąd zaślepka. To był świadomy skrót, nie przeoczenie,
ale przestał być akceptowalny w chwili, gdy karta custom w tym oknie faktycznie zaczęła działać
(FEATURE-172).

### 2. Błąd i tak by nie dotarł

Nawet gdyby kanał był prawdziwy, HTTP-owa porażka rzutu nie odpaliłaby `catch`.
`systems/custom/CharacterSheet.jsx:283`:

```js
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, { ... });
    } catch {
      addLogMessage?.(t('combat.rollFailed'), 'error');
    }
```

`fetch` odrzuca promise **tylko** przy błędzie sieciowym. Odpowiedź 500 albo 403 rozwiązuje go
normalnie, więc `catch` nie startuje. Brakuje `if (!res.ok) throw new Error(...)` — dokładnie tak,
jak robi to `saveCharacter` w tym samym pliku (linia 103). Ta sama luka jest w `handleRollWeapon`.

Warstwa 2 dotyczy **obu** okien, nie tylko wyrwanego.

## Kierunek rozwiązania

Dwie zmiany, niezależne od siebie — można je robić osobno:

1. **Sprawdzanie `res.ok`** w `handleRoll` i `handleRollWeapon`. Małe, samodzielne, poprawia też okno
   główne. Sprawdzić przy okazji, czy pozostałe systemy nie mają tej samej dziury.
2. **Kanał komunikatów dla okna standalone.** Panel logu tam nie pasuje. Rozważyć krótki toast albo
   pasek nad kartą. W repo istnieje już `hooks/useToastQueue.js` — sprawdzić, czy da się użyć bez
   ciągnięcia kontekstu `GameSession`.

## Dlaczego to nie jest kosmetyka

Autozapis w karcie custom jest jedynym sposobem zapisu w tym oknie — gałąź standalone nie renderuje
`headerButtons`, więc nie ma tam nawet przycisku zapisu do ręcznego ponowienia. Nieudany autozapis
oznacza więc utratę pracy bez żadnego śladu i bez możliwości ratunku inaczej niż przepisanie zmian
w oknie głównym.
