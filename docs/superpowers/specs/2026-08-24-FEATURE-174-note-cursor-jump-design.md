# FEATURE-174 — Kursor zostaje na miejscu po autozapisie notatki

Data: 2026-08-24

## Cel

Autozapis notatki przestaje ruszać kursorem. Użytkownik pisze w środku długiej notatki,
autozapis leci w tle, karetka i przewinięcie zostają tam, gdzie były. Zmiany innego gracza
nadal docierają do otwartego edytora, ale nie kosztem tekstu pisanego właśnie teraz.

## Stan obecny

Edytor notatek to TipTap v3 (`@tiptap/react ^3.22.3`) osadzony w `NoteEditorModal.jsx`.
Autozapis jest debounce'owany na 1500 ms (`AUTOSAVE_DELAY`) i odpala `onSave`, czyli
`NotesTab.handleSave` (`NotesTab.jsx:186`).

Ścieżka błędu:

1. `doAutoSave` wysyła `PUT /games/:id/notes/:noteId`.
2. Backend sanityzuje HTML — `noteHTMLPolicy.Sanitize(*req.Content)` (`NoteService.go:246`) —
   i zwraca **oczyszczoną** treść.
3. `handleSave` wstawia odpowiedź serwera do listy: `setNotes(prev => prev.map(n => n.id ===
   updated.id ? updated : n))`. Powstaje nowy obiekt notatki.
4. Nowy obiekt trafia propem `note` do otwartego edytora (`NotesTab.jsx:335`).
5. Efekt sync w `NoteEditorModal.jsx:130` porównuje surowe stringi:

   ```js
   if (editor && note.content !== editor.getHTML()) {
     setEditorContent(note.content || '');
   }
   ```

6. Porównanie prawie zawsze wypada na „różne" — sanitizer normalizuje znaczniki niezależnie od
   tego, czy użytkownik cokolwiek zmienił. `setContent` podmienia cały dokument ProseMirror,
   selekcja przepada, karetka ląduje na końcu.

Drugi, niezależny tor tego samego objawu: jeśli użytkownik pisze dalej w czasie 1500 ms +
round-tripu, echo serwera jest starsze niż stan edytora. Nawet bez sanitizera treść by się nie
zgadzała, a `setContent` cofnąłby ostatnio wpisane znaki.

Trzeci, mniej widoczny skutek uboczny — tryb tworzenia notatki. Nowa notatka startuje z
`note = null`. Po pierwszym autozapisie `NotesTab` podpina `editor.noteId` (`NotesTab.jsx:196`),
więc prop `note` nagle staje się obiektem. Efekt sync liczy wtedy
`isNewNote = note.id !== prevNoteIdRef.current` (`NoteEditorModal.jsx:120`) → `true` → resetuje
pozycję okna i wgrywa treść. Po pierwszym autozapisie nowej notatki potrafi skoczyć całe okno,
nie tylko kursor.

WS nie bierze udziału w echu własnego zapisu — `broadcastNote` wyklucza nadawcę
(`NoteService.go:274`), a merge `gameState.notes` w `NotesTab.jsx:96` i tak trzyma lokalną
wersję, gdy jest nie starsza. Echo idzie wyłącznie odpowiedzią HTTP.

## Decyzje

| Pytanie | Decyzja |
|---|---|
| Echo własnego zapisu | Nie dotyka edytora w ogóle — ani treści, ani tytułu, ani pozycji okna |
| Zmiana zdalna, edytor bezczynny | Wchodzi do edytora, selekcja odtwarzana |
| Zmiana zdalna, edytor „brudny" | Odrzucana — mój zapis i tak zaraz nadpisze serwer |
| Rozpoznanie echa | Po `updatedAt` z odpowiedzi serwera, nie po porównaniu treści |
| Kolizja równoległych edycji | Last write wins, świadomie. CRDT poza zakresem |
| Toast o zmianie zdalnej | Nie — informuje o stracie, której i tak nie da się cofnąć |

Odrzucone: normalizacja HTML po stronie klienta przed porównaniem. Goniłaby sanitizer backendu —
każda zmiana `noteHTMLPolicy` w Go po cichu wskrzeszałaby buga, bez testu, który by to złapał.

Odrzucone: edytor jako wyłączny właściciel dokumentu na cały czas otwarcia (zmiany zdalne tylko
po jawnym „przeładuj"). Najprostsze, ale w trakcie sesji chcemy widzieć, co dopisał MG.

## Rozwiązanie

### Kontrakt

Prop `note` przestaje być jednocześnie kanałem zmian zdalnych i echem własnego zapisu. Modal
sam rozstrzyga, czym jest przychodząca rewizja, na podstawie stempla `updatedAt` nadanego przez
serwer w jednym miejscu (`NoteService.go:236`, `now := time.Now()`). Ta sama wartość wraca w
odpowiedzi HTTP i w broadcaście, więc porównanie jest dokładne.

### `NotesTab.jsx`

`handleSave` zwraca zapisaną notatkę: `return updated` w gałęzi update, `return created` w
gałęzi create. Dziś nie zwraca nic. Poza tym bez zmian.

### `src/utils/noteSync.js` (nowy)

Czysta decyzja, wyjęta z komponentu, żeby dała się przetestować bez ProseMirror:

```js
export function shouldApplyRemoteNote({ incomingUpdatedAt, ownSaveStamp, isDirty }) {
  if (ownSaveStamp && incomingUpdatedAt === ownSaveStamp) return false; // echo własnego zapisu
  if (isDirty) return false;                                            // piszę właśnie teraz
  return true;
}
```

### `NoteEditorModal.jsx`

Nowe refy:

- `ownSaveStampRef` — `updatedAt` ostatniego zapisu wykonanego przez ten edytor.
- `isSavingRef` — lustro stanu `isSaving`, żeby predykat nie czytał stale'owanego state.

`doAutoSave`:

- na wejściu zeruje `autoSaveTimerRef.current = null` (dziś zostaje niezerowy po odpaleniu),
- przechwytuje wynik: `const saved = await onSaveRef.current({...})`,
- po sukcesie ustawia `ownSaveStampRef.current = saved.updatedAt`,
- jeśli to był pierwszy zapis nowej notatki, ustawia też `prevNoteIdRef.current = saved.id`,
  żeby przyjście propu nie wyglądało na otwarcie nowego dokumentu i nie resetowało pozycji okna.

Kolejność ma znaczenie: refy są ustawiane synchronicznie po `await`, zanim React zdąży
przerenderować z nowym propem. `setNotes` w rodzicu jest wołane wewnątrz `handleSave`, czyli
przed rozwiązaniem promisy, a React 18 planuje render poza bieżącym mikrozadaniem — efekt sync
zobaczy już zaktualizowane refy.

Predykat „brudny": `autoSaveTimerRef.current !== null || isSavingRef.current`. Tyka timer albo
leci request → nie wpuszczamy zmian zdalnych.

Efekt sync rozdziela dwie sprawy, które dziś robi jednym ciągiem:

- **tożsamość i pozycja okna** — reset pozycji tylko dla notatki faktycznie nowo otwartej,
- **treść, tytuł, prywatność** — aplikowane tylko gdy `shouldApplyRemoteNote(...)` zwróci `true`.

Aplikowanie zmiany zdalnej z zachowaniem karetki:

```js
const applyRemoteContent = useCallback((content) => {
  const ed = editorRef.current;
  if (!ed || content === ed.getHTML()) return;
  const hadFocus = ed.isFocused;
  const { from } = ed.state.selection;
  ed.commands.setContent(content || '', { emitUpdate: false });
  if (hadFocus) {
    ed.commands.setTextSelection(Math.min(from, ed.state.doc.content.size));
  }
}, []);
```

Selekcja jest odtwarzana tylko wtedy, gdy edytor miał focus — inaczej ukradłaby kursor z pola
tytułu. Pozycja jest klamrowana do rozmiaru nowego dokumentu, bo zdalna wersja może być krótsza.

### Porządki przy okazji

`editor.commands.setContent(content, false)` (`NoteEditorModal.jsx:107`) używa sygnatury z
TipTap v2. W v3 drugi argument to obiekt opcji, a `emitUpdate` domyślnie jest `true`
(`@tiptap/core`: `setContent = (content, { ..., emitUpdate = true, ... } = {})`). Przekazanie
`false` nie wyłącza zdarzenia — destrukturyzacja boolean-a daje same `undefined`, więc wchodzi
domyślne `true`. Dlatego `isProgrammaticUpdateRef` (`NoteEditorModal.jsx:38`, 58, 105) jest dziś
kodem działającym, nie martwym: to on powstrzymuje `onUpdate` przed zaplanowaniem autozapisu z
treści wgranej programowo.

Po przejściu na `{ emitUpdate: false }` ta gimnastyka staje się zbędna i znika razem z refem —
w jednej zmianie, nie „na później".

## Obsługa błędów

- Zapis nieudany: `saveError` jak dziś, `ownSaveStampRef` bez zmian. Edytor zachowuje treść,
  następne naciśnięcie klawisza planuje kolejny autozapis.
- Notatka usunięta zdalnie: bez zmian — `NotesTab.jsx:118` zamyka edytor.
- Precyzja `updatedAt`: BSON tnie czas do milisekund, więc notatka odczytana z Mongo (pełny
  `gameState`) ma stempel krótszy niż ten z odpowiedzi HTTP (nanosekundy). Nie psuje to guardu:
  merge w `NotesTab.jsx:104` porównuje `new Date(...)`, obcięta wartość nigdy nie jest nowsza od
  lokalnej, więc echo z tej strony nie wchodzi.

## Testy

Konwencja repo: logika czysta w `src/utils/*` z testem obok, komponenty testowane wyjątkowo
(`HandoutsTab.wsRace.test.jsx`).

`src/utils/noteSync.test.js`:

- echo własnego zapisu (`incomingUpdatedAt === ownSaveStamp`) → `false`,
- brudny edytor, stempel obcy → `false`,
- czysty edytor, stempel obcy → `true`,
- brak `ownSaveStamp` (nic jeszcze nie zapisano), czysty edytor → `true`.

`src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx` — `useEditor` z
`@tiptap/react` zamockowany atrapą edytora, asercja: po autozapisie, gdy prop `note` wraca ze
stemplem własnego zapisu, `setContent` nie zostaje wywołane ani razu.

Weryfikacja ręczna (lokalny docker stack): długa notatka, kursor w środku akapitu, pisanie przez
kilka cykli autozapisu — karetka i przewinięcie bez zmian; drugie okno przeglądarki edytuje tę
samą publiczną notatkę — zmiana pojawia się u pierwszego użytkownika, gdy ten przestanie pisać.
