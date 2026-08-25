# FEATURE-172 — Karta postaci custom w osobnym oknie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karta postaci systemu `custom` otwiera się w osobnym oknie przeglądarki, renderuje szablon z bazy i zachowuje wybraną widoczność rzutów.

**Architecture:** Strona `/character-sheet` żyje poza `WindowManagerProvider`, więc karta musi renderować się bez `DraggablePopup` — dodajemy do systemu `custom` gałąź `isStandalone`, którą trzy pozostałe systemy już mają. Ponieważ `custom` trzyma definicję pól w `Game.customSystemTemplate` (baza, nie kod), strona standalone dociąga grę równolegle z postaciami i przekazuje ją jako prop `game`. Ulotny `rollVisibility` przenosimy między oknami parametrem URL.

**Tech Stack:** React 18, react-router-dom (`useSearchParams`), axios, Jest + React Testing Library (CRA), i18next.

**Spec:** `docs/superpowers/specs/2026-08-25-FEATURE-172-custom-sheet-standalone-design.md`

## Global Constraints

- Wszystkie stringi widoczne dla użytkownika przez `t('klucz')` — nigdy dosłowny tekst w JSX. Klucze angielskie, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`.
- Nie dodajemy pollingu — dane przychodzą przez fetch-on-mount plus WebSocket.
- Brak backward compat: martwy kod usuwamy w tej samej zmianie, nie zostawiamy „na wszelki wypadek".
- Katalog roboczy dla wszystkich komend: `warhammer-battle-helper-front/`.
- Testy uruchamiamy nieinteraktywnie: `CI=true npx react-scripts test --testPathPattern=<wzorzec>`.
- `App.test.js` wywala się na ESM-owym axiosie — to znany baseline całego repo, nie regresja. Testy nowych plików mockują `../../api/axios`, tak jak `systems/custom/CharacterDetails.favorites.test.jsx`.
- Commit messages po angielsku, stopka `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Prerequisites

Ta praca toczy się w worktree (`.claude/worktrees/feature-172-custom-sheet-new-window`). Worktree to
świeży checkout — **nie ma w nim `node_modules`**, bo git nie wersjonuje katalogów ignorowanych.
Zanim uruchomisz jakikolwiek test:

```bash
cd warhammer-battle-helper-front
npm install
```

Trwa kilka minut, jednorazowo. Bez tego `npx react-scripts test` ściągnie losową wersję pakietu albo
padnie na braku zależności.

---

## File Structure

| Plik | Odpowiedzialność | Status |
|---|---|---|
| `src/systems/custom/CharacterSheet.jsx` | karta systemu custom; wybiera opakowanie (popup vs standalone) | modyfikacja |
| `src/systems/custom/CharacterSheet.standalone.test.jsx` | dowód, że karta renderuje się bez `WindowManagerProvider` i z szablonem | nowy |
| `src/components/CharacterSheetPage.jsx` | strona `/character-sheet`; dociąga dane i przekazuje kontekst gry do karty | modyfikacja |
| `src/systems/shared/useCharacterSheetActions.js` | `usePopOut` — buduje URL osobnego okna | modyfikacja |
| `src/systems/shared/useCharacterSheetActions.popOut.test.jsx` | dowód, że `rollVisibility` trafia do URL | nowy |

Kolejność zadań: 1 usuwa crash, 2 dostarcza dane, 3 domyka przenoszenie widoczności. Każde kończy się działającym, testowalnym stanem.

---

### Task 1: Gałąź `isStandalone` w karcie systemu custom

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx:341-409`
- Test: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.standalone.test.jsx`

**Interfaces:**
- Consumes: nic z wcześniejszych zadań.
- Produces: `CustomCharacterSheet` honoruje prop `isStandalone: boolean` (domyślnie `false`). Przy `true` nie renderuje `DraggablePopup` i nie woła `useWindowManager`. Zadanie 2 na tym polega.

**Kontekst dla implementującego:** `DraggablePopup.jsx:11` woła `useWindowManager()` bezwarunkowo, a `WindowManagerContext.jsx:108` rzuca, gdy nie ma providera. Provider stoi tylko w `GameSession.jsx:990`. Wzorzec do skopiowania: `systems/coc7e/CharacterSheet.jsx:390-398`.

**Uwaga:** w gałęzi standalone `headerButtons` nie są renderowane — tak samo jak w `warhammer4e`, `coc7e` i `dnd5e`. Dla `custom` to bez konsekwencji, bo karta zapisuje się sama (`triggerAutoSave` po każdej zmianie, `CharacterSheet.jsx:105`). Nie dodawaj przycisku zapisu.

- [ ] **Step 1: Napisz test, który ma paść**

Utwórz `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.standalone.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie ESM-only axios, którego jest z konfiguracji CRA nie transformuje —
// bez tego mocka test wywala się na `import`, zanim cokolwiek się wyrenderuje. Karta nie robi
// żadnego requestu przy renderze, więc stałe wartości wystarczą.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = {
  name: 'Mój system',
  sections: [{
    id: 'sec1',
    fields: [{ key: 'fld_origin', type: 'text_short', label: 'Pochodzenie' }],
  }],
};

function renderStandalone() {
  return render(
    <CustomCharacterSheet
      character={{ id: 'c1', name: 'Bohater', stats: {} }}
      onClose={() => {}}
      onCharacterUpdate={() => {}}
      gameId="g1"
      token="t"
      game={{ customSystemTemplate: template }}
      isStandalone
    />
  );
}

describe('CustomCharacterSheet w osobnym oknie', () => {
  // Regresja na FEATURE-172: bez gałęzi isStandalone karta renderowała DraggablePopup,
  // ten wołał useWindowManager, a ten rzucał poza WindowManagerProvider.
  it('renderuje się bez WindowManagerProvider', () => {
    const { container } = renderStandalone();
    expect(container.querySelector('.sheet-standalone')).not.toBeNull();
    // .resize-handle występuje wyłącznie w DraggablePopup (DraggablePopup.jsx:166-173).
    // Sam .character-sheet-popup nie rozstrzyga — nosi go też wrapper standalone.
    expect(container.querySelector('.resize-handle')).toBeNull();
  });

  it('renderuje pola z szablonu przekazanego w propie game', () => {
    const { container } = renderStandalone();
    const labels = [...container.querySelectorAll('.custom-sheet__field-label')];
    expect(labels.map(el => el.textContent)).toContain('Pochodzenie');
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada z właściwego powodu**

Z katalogu `warhammer-battle-helper-front/`:

```bash
CI=true npx react-scripts test --testPathPattern=CharacterSheet.standalone
```

Oczekiwane: oba testy FAIL, komunikat `useWindowManager must be used within a WindowManagerProvider`. Jeśli pada na coś innego — zatrzymaj się, to nie ta przyczyna.

- [ ] **Step 3: Wyciągnij treść karty do zmiennej**

W `systems/custom/CharacterSheet.jsx` obecny `return` zaczyna się w linii 341 od `return (` i `<DraggablePopup`, którego jedynym dzieckiem jest `<div className="custom-sheet">…</div>` (linie 352-406).

Zamień:

```jsx
  return (
    <DraggablePopup
      title={template ? `${template.name} — ${charName || character?.name}` : (character?.name || '')}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={900}
      windowId={`characterSheet:${character.id}`}
      windowKind="characterSheet"
    >
      <div className="custom-sheet">
```

na:

```jsx
  const sheetContent = (
    <div className="custom-sheet">
```

Następnie zamknięcie — obecnie:

```jsx
      </div>
    </DraggablePopup>
  );
}
```

zamień na:

```jsx
    </div>
  );

  // Osobne okno (/character-sheet) żyje poza WindowManagerProvider, więc DraggablePopup
  // — a przez niego useWindowManager — nie może się tam znaleźć. Tak samo robią
  // warhammer4e, coc7e i dnd5e.
  if (isStandalone) {
    return (
      <div className="sheet-standalone character-sheet-popup">
        <div className="sheet-standalone__content">{sheetContent}</div>
      </div>
    );
  }

  return (
    <DraggablePopup
      title={template ? `${template.name} — ${charName || character?.name}` : (character?.name || '')}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={900}
      windowId={`characterSheet:${character.id}`}
      windowKind="characterSheet"
    >
      {sheetContent}
    </DraggablePopup>
  );
}
```

Wewnętrzny JSX (modal rzutu, nagłówek z nazwą postaci, `renderBody()`) przenosisz **bez żadnej zmiany treści** — poprawiasz wyłącznie wcięcia o jeden poziom w lewo. Nie dotykaj `renderBody`, `headerButtons` ani niczego powyżej linii 341.

Klasy `.sheet-standalone` i `.sheet-standalone__content` już istnieją w `src/style.css:2251-2275` — nie dodawaj CSS.

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

```bash
CI=true npx react-scripts test --testPathPattern=CharacterSheet.standalone
```

Oczekiwane: 2 passed.

- [ ] **Step 5: Sprawdź, że nie zepsułeś istniejących testów systemu custom**

```bash
CI=true npx react-scripts test --testPathPattern=systems/custom
```

Oczekiwane: wszystkie passed.

- [ ] **Step 6: Commit**

```bash
git add src/systems/custom/CharacterSheet.jsx src/systems/custom/CharacterSheet.standalone.test.jsx
git commit -m "$(cat <<'EOF'
fix(front): FEATURE-172 render custom sheet without the window manager

The custom system was the only one missing the isStandalone branch, so
popping a sheet out to /character-sheet rendered DraggablePopup, which
calls useWindowManager outside its provider and throws.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Strona standalone dociąga grę, `isGM` i `rollVisibility`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/CharacterSheetPage.jsx` (cały plik)

**Interfaces:**
- Consumes: `CustomCharacterSheet` z zadania 1 honorujący `isStandalone`.
- Produces: strona czyta z query stringa `characterId`, `gameId` oraz opcjonalny `rollVisibility` (domyślnie `'all'`). Zadanie 3 zapisuje ten ostatni parametr.

**Kontekst dla implementującego:** `systems/custom/CharacterSheet.jsx:23` czyta `game?.customSystemTemplate`. Bez propa `game` karta pokaże komunikat `creator.noTemplate` zamiast pól — systemy z polami zaszytymi w kodzie tego propa nie potrzebują, `custom` tak. `GET /games/:id` (`main.go:222`, handler `GameHandler.go:174`) zwraca cały obiekt gry razem z `customSystemTemplate` i `gameMasterId`.

Trzy rzeczy zmieniają się przy okazji i każda ma powód:

1. Fallback `: '/characters'` znika — backend nie ma gołego `GET /characters` (jest tylko `game.GET("/characters")` w grupie `/games/:id`, `main.go:240`), a `usePopOut` jest wołany wyłącznie wewnątrz `GameSession`, gdzie `gameId` istnieje. Gałąź jest nieosiągalna.
2. `setLoading(false)` przenosi się tak, by strona bez `characterId` pokazała „Character not found" zamiast wisieć na „Loading..." — dziś `finally` nie wykonuje się wcale, bo fetch nie startuje.
3. `token` przestaje być czytany dwa razy z `localStorage` — jest już w zmiennej.

- [ ] **Step 1: Podmień zawartość pliku**

Zastąp całą treść `src/components/CharacterSheetPage.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axiosInstance from '../api/axios';
import { getSystem, normalizeCharacter } from '../systems/registry';
import useWebSocket from '../hooks/useWebSocket';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * Karta postaci wyrwana do osobnego okna przeglądarki (route /character-sheet).
 *
 * Okno jest samowystarczalne: nie ma dostępu do stanu GameSession, więc dociąga
 * postać i grę samo. Gra jest potrzebna systemowi `custom`, który trzyma definicję
 * pól w bazie (Game.customSystemTemplate), a nie w kodzie komponentu.
 *
 * rollVisibility przyjeżdża parametrem URL, bo w GameSession jest ulotnym useState —
 * osobny kontekst JS nie ma jak go odczytać. To snapshot z chwili otwarcia okna.
 */
function CharacterSheetPage() {
    const [searchParams] = useSearchParams();
    const characterId = searchParams.get('characterId');
    const gameId = searchParams.get('gameId');
    const rollVisibility = searchParams.get('rollVisibility') || 'all';
    const token = localStorage.getItem('token');
    const { userId } = useCurrentUser(token);

    const [character, setCharacter] = useState(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!characterId || !gameId) {
            setLoading(false);
            return;
        }
        const fetchAll = async () => {
            try {
                // Requesty są niezależne — równolegle.
                const [charsRes, gameRes] = await Promise.all([
                    axiosInstance.get(`/games/${gameId}/characters`),
                    axiosInstance.get(`/games/${gameId}`),
                ]);
                const char = charsRes.data.map(normalizeCharacter).find(c => c.id === characterId);
                if (!char) throw new Error('Character not found');
                setCharacter(char);
                setGame(gameRes.data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [characterId, gameId]);

    const handleWsMessage = useCallback((message) => {
        if (message.type === 'CHARACTER_UPDATED') {
            const updated = message.payload?.character;
            if (updated && updated.id === characterId) {
                setCharacter(normalizeCharacter(updated));
            }
        }
    }, [characterId]);

    useWebSocket(gameId, token, handleWsMessage);

    const handleCharacterUpdate = (updated) => {
        setCharacter(normalizeCharacter(updated));
    };

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;
    if (!character) return <div style={{ padding: 20 }}>Character not found</div>;

    const system = getSystem(character.gameSystem);
    const CharacterSheet = system.CharacterSheet;
    const isGM = !!(game && userId && game.gameMasterId === userId);

    return (
        <CharacterSheet
            character={character}
            onClose={() => window.close()}
            onCharacterUpdate={handleCharacterUpdate}
            addLogMessage={() => {}}
            gameId={gameId}
            token={token}
            game={game}
            isGM={isGM}
            rollVisibility={rollVisibility}
            isStandalone
        />
    );
}

export default CharacterSheetPage;
```

- [ ] **Step 2: Sprawdź, że eslint nie zgłasza zastrzeżeń**

```bash
npx eslint --no-eslintrc --config .eslintrc.plan.json src/components/CharacterSheetPage.jsx
```

Jeśli plik konfiguracyjny nie istnieje, utwórz go jednorazowo w `warhammer-battle-helper-front/`:

```json
{
  "extends": ["react-app"],
  "rules": { "react-hooks/exhaustive-deps": "error" }
}
```

Oczekiwane: brak wyjścia. Ostrzeżenie o zależnościach hooka traktuj jako błąd — `useEffect` czyta
`characterId` i `gameId`, oba są w tablicy zależności; jeśli eslint chce czegoś więcej, przeczytaj,
czego, zanim to dopiszesz. Plik `.eslintrc.plan.json` jest pomocniczy — **nie commituj go**.

- [ ] **Step 3: Sprawdź, że nic w zestawie testów się nie posypało**

```bash
CI=true npx react-scripts test --testPathPattern="src/(components|systems)"
```

Oczekiwane: wszystkie passed. `App.test.js` nie wchodzi w ten wzorzec — jego awaria na ESM axiosa to znany baseline.

- [ ] **Step 4: Weryfikacja ręczna na lokalnym stacku**

Ten plik to warstwa fetchująca — testu jednostkowego nie dopisujemy (decyzja ze specu). Zamiast tego sprawdź w przeglądarce:

1. Wystartuj lokalny stack i zaloguj się.
2. Otwórz grę w systemie `custom`, otwórz kartę postaci.
3. Kliknij „Otwórz w nowym oknie".
4. Oczekiwane: nowe okno pokazuje **pola z szablonu** (nie komunikat o braku szablonu), konsola czysta — żadnego `useWindowManager must be used within a WindowManagerProvider`.
5. Zmień wartość w polu w nowym oknie, odczekaj sekundę, odśwież okno główne — wartość ma się zgadzać (autosave).

- [ ] **Step 5: Commit**

```bash
git add src/components/CharacterSheetPage.jsx
git commit -m "$(cat <<'EOF'
fix(front): FEATURE-172 give the standalone sheet its game context

The custom system reads its field definitions from Game.customSystemTemplate,
so the standalone page has to fetch the game alongside the characters. Also
derives isGM from gameMasterId, reads rollVisibility from the query string,
and drops the unreachable /characters fallback — the backend has no such
endpoint and pop-out always runs inside a game.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `usePopOut` przenosi `rollVisibility` do nowego okna

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/shared/useCharacterSheetActions.js:7-13`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx:305`
- Modify: `warhammer-battle-helper-front/src/systems/warhammer4e/CharacterSheet.jsx:117`
- Modify: `warhammer-battle-helper-front/src/systems/coc7e/CharacterSheet.jsx:319`
- Modify: `warhammer-battle-helper-front/src/systems/dnd5e/CharacterSheet.jsx:434`
- Test: `warhammer-battle-helper-front/src/systems/shared/useCharacterSheetActions.popOut.test.jsx`

**Interfaces:**
- Consumes: strona z zadania 2, czytająca `rollVisibility` z query stringa.
- Produces: `usePopOut(characterId, gameId, rollVisibility)` — trzeci argument opcjonalny; wartość inna niż `'all'` ląduje w URL jako `rollVisibility`.

**Kontekst dla implementującego:** `systems/custom/CharacterSheet.jsx:272` wysyła `visibility: rollVisibility` przy każdym rzucie. Bez tej zmiany rzut z wyrwanego okna zawsze leci jako `'all'` — gracz, który ustawił „tylko MG", traci prywatność bez ostrzeżenia. Dozwolone wartości pochodzą z selektora `components/log/DiceRollControls.jsx:123-131`: `all`, `gm_and_roller`, `gm_only` albo `userId` konkretnego gracza. `usePopOut` przepisuje wartość bez interpretacji — walidację robi backend.

`'all'` pomijamy w URL, bo strona i tak przyjmuje je jako domyślne — krótszy URL, jedno źródło prawdy o domyślnej wartości.

- [ ] **Step 1: Napisz test, który ma paść**

Utwórz `warhammer-battle-helper-front/src/systems/shared/useCharacterSheetActions.popOut.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { usePopOut } from './useCharacterSheetActions';

// Komponent-sonda: hooka nie da się wywołać poza renderem, więc wieszamy go na przycisku.
function PopOutProbe({ characterId, gameId, rollVisibility }) {
  const popOut = usePopOut(characterId, gameId, rollVisibility);
  return <button onClick={popOut}>pop</button>;
}

function clickPopOut(props) {
  const { getByText } = render(<PopOutProbe {...props} />);
  fireEvent.click(getByText('pop'));
  return window.open.mock.calls[0][0];
}

describe('usePopOut', () => {
  beforeEach(() => {
    window.open = jest.fn();
  });

  it('przenosi rollVisibility do URL osobnego okna', () => {
    const url = clickPopOut({ characterId: 'c1', gameId: 'g1', rollVisibility: 'gm_only' });
    expect(url).toContain('characterId=c1');
    expect(url).toContain('gameId=g1');
    expect(url).toContain('rollVisibility=gm_only');
  });

  // 'all' to wartość domyślna strony standalone — doklejanie jej tylko wydłuża URL.
  it('pomija rollVisibility, gdy jest domyślne', () => {
    const url = clickPopOut({ characterId: 'c1', gameId: 'g1', rollVisibility: 'all' });
    expect(url).not.toContain('rollVisibility');
  });

  it('pomija rollVisibility, gdy nie podano go wcale', () => {
    const url = clickPopOut({ characterId: 'c1', gameId: 'g1' });
    expect(url).not.toContain('rollVisibility');
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

```bash
CI=true npx react-scripts test --testPathPattern=useCharacterSheetActions.popOut
```

Oczekiwane: pierwszy test FAIL (`rollVisibility=gm_only` nie występuje w URL), dwa pozostałe PASS — obecna implementacja i tak nie dokleja parametru.

- [ ] **Step 3: Rozszerz `usePopOut`**

W `src/systems/shared/useCharacterSheetActions.js` zamień:

```js
export function usePopOut(characterId, gameId) {
    return useCallback(() => {
        const params = new URLSearchParams({ characterId });
        if (gameId) params.set('gameId', gameId);
        window.open(`/character-sheet?${params.toString()}`, '_blank', 'width=1400,height=900,noopener');
    }, [characterId, gameId]);
}
```

na:

```js
// rollVisibility jest w GameSession ulotnym useState — nowe okno to osobny kontekst JS
// i nie ma jak go odczytać, więc przenosimy go parametrem URL. Snapshot z chwili
// otwarcia: zmiana ustawienia w oknie głównym nie dotrze do już otwartego okna.
export function usePopOut(characterId, gameId, rollVisibility = 'all') {
    return useCallback(() => {
        const params = new URLSearchParams({ characterId });
        if (gameId) params.set('gameId', gameId);
        // 'all' jest domyślne po stronie CharacterSheetPage — nie zaśmiecamy URL.
        if (rollVisibility && rollVisibility !== 'all') params.set('rollVisibility', rollVisibility);
        window.open(`/character-sheet?${params.toString()}`, '_blank', 'width=1400,height=900,noopener');
    }, [characterId, gameId, rollVisibility]);
}
```

- [ ] **Step 4: Przekaż `rollVisibility` we wszystkich czterech systemach**

Każdy system ma już prop `rollVisibility` w sygnaturze komponentu — dokładasz go tylko do wywołania hooka.

`src/systems/custom/CharacterSheet.jsx:305`:

```js
  const handlePopOut = usePopOut(character?.id, gameId, rollVisibility);
```

`src/systems/warhammer4e/CharacterSheet.jsx:117`:

```js
    const handlePopOut = usePopOut(character.id, gameId, rollVisibility);
```

`src/systems/coc7e/CharacterSheet.jsx:319`:

```js
  const handlePopOut = usePopOut(character.id, gameId, rollVisibility);
```

`src/systems/dnd5e/CharacterSheet.jsx:434`:

```js
  const handlePopOut = usePopOut(character.id, gameId, rollVisibility);
```

- [ ] **Step 5: Uruchom test i potwierdź, że przechodzi**

```bash
CI=true npx react-scripts test --testPathPattern=useCharacterSheetActions.popOut
```

Oczekiwane: 3 passed.

- [ ] **Step 6: Uruchom cały zestaw testów frontu**

```bash
CI=true npx react-scripts test --testPathPattern="src/(components|systems|hooks)"
```

Oczekiwane: wszystkie passed.

- [ ] **Step 7: Weryfikacja ręczna**

1. W grze `custom` ustaw w panelu kości widoczność na „tylko MG".
2. Otwórz kartę postaci, kliknij „Otwórz w nowym oknie".
3. Sprawdź, że URL nowego okna zawiera `rollVisibility=gm_only`.
4. Rzuć umiejętnością z nowego okna.
5. Oczekiwane: rzut widoczny tylko dla MG i rzucającego, nie dla pozostałych graczy.

- [ ] **Step 8: Commit**

```bash
git add src/systems/shared/useCharacterSheetActions.js src/systems/shared/useCharacterSheetActions.popOut.test.jsx src/systems/custom/CharacterSheet.jsx src/systems/warhammer4e/CharacterSheet.jsx src/systems/coc7e/CharacterSheet.jsx src/systems/dnd5e/CharacterSheet.jsx
git commit -m "$(cat <<'EOF'
fix(front): FEATURE-172 carry roll visibility into the popped-out sheet

rollVisibility is ephemeral useState in GameSession, so a separate browser
window had no way to read it and every roll went out as 'all'. A player who
picked "GM only" silently lost that. Pass it through the pop-out URL.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Poza zakresem

Zmiana szablonu przez `POST /games/:id/syncTemplate` nie odświeży otwartego okna — WS w `CharacterSheetPage` obsługuje wyłącznie `CHARACTER_UPDATED`. Osobny temat, nie dokładaj go tutaj.
