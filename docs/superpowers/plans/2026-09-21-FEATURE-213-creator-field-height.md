# FEATURE-213 — Karta pola nie rozciąga się do wysokości zagnieżdżonej sekcji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karta pola w siatce kreatora szablonu przestaje rozciągać się do wysokości
zagnieżdżonej sekcji stojącej obok niej w tym samym wierszu.

**Architecture:** Jedna deklaracja CSS — `align-self: start` na `.creator__canvas-field`.
Siatka `.creator__fields-grid` zostaje na domyślnym `align-items: stretch`, więc zagnieżdżone
sekcje nadal wyrównują się wzajemnie; tylko karta liścia wypisuje się z rozciągania.
Zero zmian w JSX, zero zmian w modelu danych, zero zmian w backendzie.

**Tech Stack:** CSS Grid (`align-self`), plik `warhammer-battle-helper-front/src/style.css`.

## Global Constraints

- Spec: `docs/superpowers/specs/FEATURE-213.md` — czytaj przed zaczęciem.
- Komentarze w kodzie ZAWSZE po angielsku (backend i frontend, bez wyjątków).
- Nie dotykamy `.custom-sheet__*` — podgląd i prawdziwa karta postaci są poza zakresem.
- Nie dodajemy `align-items` do `.creator__fields-grid` — to celowo odrzucona alternatywa,
  psuje wyrównanie dwóch zagnieżdżonych sekcji w jednym wierszu.
- Nie zmieniamy `min-height: 62px` na `height` — warianty karty (abbr + label, chip zakresu)
  mają różną naturalną wysokość.
- Nie piszemy testu jednostkowego: jsdom nie liczy layoutu, `getBoundingClientRect` zwraca zera,
  a wyliczonej wysokości elementu siatki nie da się tam odczytać. Weryfikacja jest wizualna
  (Task 2) plus brak regresji w istniejącej suicie (Task 1, krok 4).
- Znany baseline fail suity frontendu: `App.test.js` (axios ESM). To nie jest regresja.

---

### Task 1: `align-self: start` na karcie pola

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css` — reguła `.creator__canvas-field`
  (w okolicy linii 8905, sekcja `/* ── Field cards (in section canvas) ── */`)

**Interfaces:**
- Consumes: nic — zmiana nie ma zależności od wcześniejszych zadań.
- Produces: nic, na czym opiera się kod. Task 2 weryfikuje wizualnie efekt tej reguły.

- [ ] **Step 1: Przeczytaj obecną regułę**

Run:
```bash
cd warhammer-battle-helper-front && grep -n -A 12 '^\.creator__canvas-field {' src/style.css
```

Expected (dokładnie ta treść — jeśli się różni, zatrzymaj się i zgłoś rozbieżność):
```css
.creator__canvas-field {
    background: rgba(255, 255, 255, 0.55);
    border: 1.5px solid rgba(201, 151, 91, 0.22);
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    position: relative;
    min-height: 62px;
    display: flex;
    flex-direction: column;
}
```

- [ ] **Step 2: Dodaj deklarację razem z komentarzem**

Wstaw `align-self: start;` po `min-height: 62px;`, a komentarz **nad** całą regułą
(styl komentarzy w tym pliku: blok `/* … */` poprzedzający regułę, patrz
`.creator__section--nested` i `.creator__canvas-field--drop-beside::before`).

Docelowy fragment:
```css
/* align-self:start is load-bearing. .creator__fields-grid is a plain grid, so its items
   default to align-items:stretch and every item takes the height of its row — and the row is
   as tall as its tallest item, which is a nested section (FEATURE-211). min-height only sets
   the floor, it does not opt out of the stretch, so a text field sitting next to a nested
   section was drawn as a tall empty box. The sheet has the same stretch but no visible box,
   which is why the preview always looked right.
   Only the leaf card opts out: nested sections keep stretching, so two of them in one row stay
   the same height. Putting align-items:start on the grid instead would break that. */
.creator__canvas-field {
    background: rgba(255, 255, 255, 0.55);
    border: 1.5px solid rgba(201, 151, 91, 0.22);
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    position: relative;
    min-height: 62px;
    align-self: start;
    display: flex;
    flex-direction: column;
}
```

- [ ] **Step 3: Sprawdź, że zmiana trafiła w jedno miejsce i nigdzie indziej**

Run:
```bash
cd warhammer-battle-helper-front && git diff --stat src/style.css && grep -c 'align-self: start' src/style.css
```

Expected: `1 file changed`, dokładnie `9 insertions(+)` (8 linii komentarza + 1 deklaracja),
`0 deletions(-)`. Wynik `grep -c` to liczba wystąpień `align-self: start` w całym pliku —
zanotuj ją i sprawdź `git diff`, że dokładnie jedno z nich jest nowe.

- [ ] **Step 4: Uruchom suitę frontendu (kontrola regresji)**

Run:
```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false 2>&1 | tail -25
```

Expected: identyczny wynik jak przed zmianą — jedyny fail to `App.test.js` z błędem
importu ESM axios. Żaden test kreatora (`TemplateBuilder.sheetWidth.test.jsx`,
`TemplatePreview.test.jsx`, `CustomSheetBody.nestedSections.test.jsx`) nie może się wywalić.
Gdyby coś innego padło — to regresja, zatrzymaj się.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "fix: FEATURE-213 keep creator field cards out of the row stretch

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Weryfikacja wizualna w kreatorze

**Files:** żadnych — to zadanie tylko potwierdza efekt Task 1 w działającej aplikacji.

**Interfaces:**
- Consumes: regułę `align-self: start` z Task 1.
- Produces: nic.

- [ ] **Step 1: Podnieś aplikację**

Run:
```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && docker compose up -d
```

Expected: kontenery wstają, frontend odpowiada na `http://localhost:3000`.
Jeśli pracujesz w worktree, obowiązuje osobny przepis na uruchomienie brancha pod `:3000` —
zapytaj użytkownika, zamiast improwizować przy CORS i montowaniu wolumenów.

- [ ] **Step 2: Zbuduj układ, który ujawniał błąd**

W kreatorze szablonu:
1. Dodaj sekcję.
2. W jej panelu właściwości ustaw liczbę kolumn na **2**.
3. W pierwszej kolumnie dodaj pole typu `text`.
4. W drugiej dodaj pole typu `section` (zagnieżdżona sekcja) i wrzuć do niej 3–4 pola.

- [ ] **Step 3: Sprawdź główny efekt**

Expected: karta pola `text` jest niska (≈62px) i przylega do **górnej** krawędzi swojej
komórki. Sekcja obok zachowuje swoją pełną wysokość. Pod kartą pola jest pusta przestrzeń
siatki, bez tła i bez ramki.

- [ ] **Step 4: Sprawdź brak regresji — dwie sekcje w wierszu**

Usuń pole `text` z pierwszej kolumny, wstaw tam drugą zagnieżdżoną sekcję z inną liczbą pól
(np. 2 wobec 5 w sąsiedniej).

Expected: obie ramki sekcji mają **równą** wysokość — dolne krawędzie w jednej linii.
To jest dokładnie to, co zepsułoby `align-items: start` na siatce, więc ten krok jest
obowiązkowy, nie opcjonalny.

- [ ] **Step 5: Sprawdź brak regresji — drag & drop**

Przeciągnij pole z jednej zagnieżdżonej sekcji do drugiej.

Expected: przeciąganie działa jak wcześniej; podczas najechania na kartę w innej sekcji
po jej lewej krawędzi pojawia się pionowa złota kreska wskaźnika wstawienia, wysokości
tej karty (nie wysokości wiersza). Podświetlenie „drop into" całej sekcji nadal działa.

- [ ] **Step 6: Sprawdź, że podgląd się nie zmienił**

Otwórz podgląd karty postaci dla tego samego szablonu.

Expected: bez zmian względem stanu sprzed Task 1 — pole obok zagnieżdżonej sekcji wygląda
tak jak zawsze. Jeśli cokolwiek się ruszyło, zmiana wyciekła poza `.creator__*` — zatrzymaj się.

- [ ] **Step 7: Zaznacz weryfikację w specu**

Zmień nagłówek `**Status:**` w `docs/superpowers/specs/FEATURE-213.md` z `do zaplanowania`
na `zaimplementowane 2026-09-21`.

```bash
git add docs/superpowers/specs/FEATURE-213.md
git commit -m "docs: FEATURE-213 mark spec as implemented

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
