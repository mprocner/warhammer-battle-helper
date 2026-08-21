# FEATURE-171 — Ostrzeżenie `react-hooks/exhaustive-deps` w `HandoutViewerModal` blokuje build z `CI=true`

**Status:** backlog
**Znalezione:** 2026-08-21, podczas realizacji FEATURE-100
**Uwaga:** oczywista poprawka jest błędna i już raz wysadziła commit. Przeczytaj sekcję „Pułapka" przed dotknięciem pliku.

## Objaw

`CI=true npx react-scripts build` kończy się błędem. Bez `CI=true` build przechodzi z ostrzeżeniem.

`react-scripts` przy `CI=true` podnosi ostrzeżenia ESLint do rangi błędów. Repozytorium ma jedno takie
ostrzeżenie — `react-hooks/exhaustive-deps` w `warhammer-battle-helper-front/src/components/tabs/handouts/HandoutViewerModal.jsx`.

Dziś nic tego nie blokuje, bo build lokalny odpalamy bez `CI=true`. Zapali się w momencie, w którym
ktoś podłączy prawdziwy pipeline CI.

## Stan faktyczny

| Miejsce | Co tam jest |
|---|---|
| `HandoutViewerModal.jsx:84` | `useEffect(...)` rejestrujący listener `wheel` |
| `HandoutViewerModal.jsx:92` | ciało efektu woła `clampImagePan(...)` |
| `HandoutViewerModal.jsx:96` | tablica zależności — **bez** `clampImagePan`, stąd ostrzeżenie |
| `HandoutViewerModal.jsx:100` | `const clampImagePan = useCallback(...)` — **poniżej** efektu |

## Pułapka

Podczas FEATURE-100 implementer „naprawił" to dopisując `clampImagePan` do tablicy zależności w linii 96,
razem z wyciszeniem reguły `no-use-before-define`. Commit trafił do gałęzi i został zrewertowany
(`214a23f`, revert `5009c4a`).

Ta poprawka wywala komponent. **Tablica zależności jest wyliczana w trakcie renderu**, w miejscu
wywołania `useEffect` — czyli w linii 96, zanim wykona się linia 100. `clampImagePan` to `const`, więc
odwołanie do niego w linii 96 trafia w temporal dead zone: `ReferenceError: Cannot access 'clampImagePan'
before initialization` przy **każdym** renderze `HandoutViewerModal`.

Sygnał ostrzegawczy: konieczność wyciszenia `no-use-before-define`, żeby lint przepuścił własną poprawkę.

Dla kontrastu — **ciało** efektu (linia 92) może bezpiecznie odwoływać się do `clampImagePan`, bo wykonuje
się po commicie renderu, długo po inicjalizacji `const`. To jest różnica, którą łatwo przeoczyć:
ciało domknięcia ≠ tablica zależności.

## Poprawne rozwiązanie

1. Przenieść `const clampImagePan = useCallback(...)` (dziś linie 100-113) **powyżej** efektu z linii 84.
2. Dopiero wtedy dopisać `clampImagePan` do tablicy zależności.
3. Usunąć wyciszenie reguły — po przestawieniu nie jest potrzebne.

Sprawdzić przy okazji, czy `clampImagePan` ma stabilną referencję (`useCallback` z poprawnymi zależnościami).
Jeśli nie, efekt będzie się przepinał przy każdym renderze — listener `wheel` odpinany i podpinany
w kółko. Wtedy zależności `useCallback` też wymagają przeglądu.

## Weryfikacja

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts build   # ma przejść bez błędów
```
Plus ręcznie: otworzyć handout, przybliżyć kółkiem, przesunąć obraz — sprawdzić, że zoom i pan działają
i że nic nie leci do konsoli.
