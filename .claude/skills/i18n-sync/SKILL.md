---
name: i18n-sync
description: >-
  Synchronizuje tłumaczenia i18n między en/ i pl/ w warhammer-battle-helper-front.
  Używaj gdy: dodano nowy klucz t('...') i trzeba go uzupełnić w obu językach,
  pliki en/pl się rozjechały, albo trzeba znaleźć stringi zahardkodowane w JSX
  zamiast t('klucz'). Część mechaniczną (diff kluczy) liczy skrypt, nie model.
---

# i18n-sync

Konwencja projektu (z CLAUDE.md): wszystkie stringi w kodzie używają **angielskich
kluczy** przez `t('klucz')`. `en/` jest językiem domyślnym (źródło prawdy dla
istnienia klucza), `pl/` musi mieć **dokładnie ten sam zbiór kluczy**. Nigdy nie
wpisuj stringów wprost w JSX.

Pliki: `warhammer-battle-helper-front/src/locales/{en,pl}/<namespace>.json`
Namespace'y: `translation`, `skills`, `talents`, `weapons`, `armour` (zagnieżdżony JSON).

## Tryb A — synchronizacja kluczy (domyślny)

1. **Zmierz rozjazd (mechanicznie, nie na oko):**
   ```bash
   python3 .claude/skills/i18n-sync/compare_keys.py
   ```
   Skrypt wypisuje per namespace klucze „brak w pl" i „brak w en". Exit 0 = OK.

2. **Dla każdego „brak w pl: X":**
   - odczytaj wartość źródłową z `en/<ns>.json` pod kluczem X,
   - przetłumacz ją na polski (zachowaj placeholdery `{{var}}`, interpolacje, formatowanie),
   - wstaw klucz X do `pl/<ns>.json` **w tym samym zagnieżdżeniu i miejscu** co w en
     (ten sam obiekt-rodzic, sąsiednie klucze — żeby diff plików był czysty).

3. **Dla każdego „brak w en: X"** (osierocony klucz w pl):
   - to zwykle pozostałość po usuniętym/zmienionym kluczu. **Nie zgaduj** —
     ustal z użytkownikiem: dodać brakujący odpowiednik do `en`, czy usunąć z `pl`?

4. **Zweryfikuj:** uruchom skrypt ponownie — musi zwrócić exit 0 (wszystko OK).

## Tryb B — wykryj zahardkodowane stringi w JSX

Gdy użytkownik prosi o znalezienie złamań konwencji (string wprost w JSX, nie `t(...)`):

```bash
# Tekst między tagami JSX (>...<) zaczynający się od litery, pomijając {wyrażenia}.
# [[:alpha:]] łapie też polskie znaki (zależnie od locale). Wynik filtruj okiem.
grep -rnE '>[[:space:]]*[[:alpha:]][^<>{}]*<' \
  warhammer-battle-helper-front/src --include='*.jsx' | grep -vE "t\(['\"]"
```

Wynik to *kandydaci* (mogą być fałszywe trafienia — np. liczby, ikony). Dla każdego
realnego stringa: zaproponuj klucz w odpowiednim namespace, dodaj go do `en` i `pl`,
zamień string w JSX na `t('klucz')`. To krok wymagający OSĄDU — przejrzyj kandydatów,
nie zamieniaj ślepo.

## Zasady

- **Nie tłumacz kluczy** — klucze są identyczne w obu językach, tłumaczy się wartości.
- Placeholdery i18next (`{{name}}`, `$t(...)`) muszą przetrwać tłumaczenie 1:1.
- Po każdej zmianie kończ uruchomieniem `compare_keys.py` — zielony exit 0 = gotowe.
- Nie ruszaj namespace'ów, które skrypt zgłasza jako OK.