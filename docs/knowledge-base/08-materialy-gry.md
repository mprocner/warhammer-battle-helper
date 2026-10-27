# Materiały gry: handouty, pliki, muzyka, notatki

## Jak to działa

### Pliki (zakładka MG)
Biblioteka obrazków należy do **użytkownika**, nie do gry. Jest osadzona w dokumencie `User`
(`Files`, `Folders`), więc MG ma te same pliki we wszystkich swoich grach. Pliki można
grupować w foldery, przenosić i zmieniać im nazwę. `GET /files/:id/usage` pokazuje, w których
grach plik jest użyty, zanim się go usunie. Z biblioteki przeciąga się obrazki na scenę.
Obrazki są zmniejszane w przeglądarce przed wysłaniem. Limit serwera to 15 MB, typy
JPEG, PNG, WebP.

### Handouty (MG tworzy, gracze czytają)
Handout należy do gry (`Game.Handouts`): tytuł, opis, typ, opcjonalny plik (obrazek, PDF, TXT),
folder i kolejność. `Visibility` to lista: `"all"` albo id graczy. Gracz dostaje tylko te
handouty, które są dla wszystkich lub dla niego. Foldery i kolejność zmienia się przeciąganiem.

### Muzyka (zakładka MG)
Biblioteka utworów, folderów i playlist też jest osadzona w `User`. MP3 i WAV, do 50 MB, czas
trwania jest odczytywany z pliku. Stan odtwarzania należy do gry (`Game.Music`): utwór lub
playlista, indeks, pętla, głośność, `CurrentTrackStartedAt` i `Version`. Serwer liczy pozycję
przy odczycie, więc gracz, który dołącza w trakcie, słyszy utwór od właściwego miejsca.
MG steruje dla wszystkich (play, pause, stop, next, volume, loop), a każdy gracz ma też własną
głośność (zakładka Ogólne). Scena może mieć przypisaną **muzykę sceny** (utwór albo playlistę
w pętli).

### Notatki (wszyscy)
Notatki należą do gry (`Game.Notes`) i są pisane w edytorze rich text (TipTap). Notatka może
być prywatna (`IsPrivate`, widzi ją tylko autor) albo wspólna. Kolejność zmienia się przeciąganiem.
HTML jest sanityzowany na serwerze (`internal/sanitize/richhtml.go`).

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Zakładki | `src/components/tabs/FilesTab.jsx`, `HandoutsTab.jsx`, `MusicTab.jsx`, `NotesTab.jsx` (+ podkatalogi) |
| Odtwarzacz | `src/hooks/useGameMusic.js` |
| API frontu | `src/api/files.js`, `handouts.js`, `music.js`, `notes.js` |
| Backend | `internal/http/FileHandler.go`, `HandoutHandler.go`, `MusicHandler.go`, `NoteHandler.go`, `internal/service/NoteService.go` |
| Storage | `internal/storage/local.go` (typy, limity), `audio_duration.go` |
| Edytor rich text | `src/components/common/richText/` |

## Pułapki

- Biblioteka plików i muzyki rośnie w dokumencie `User`. Przy bardzo dużych bibliotekach
  warto ją przenieść do osobnej kolekcji.
- Pliki handoutów trafiają do tego samego magazynu co avatary (`HandoutHandler{Storage: avatarStorage}`
  w `main.go`), czyli do wolumenu `backend-avatars`. Przy porządkach w avatarach nie usuń handoutów.
- Pliki leżą na lokalnym dysku serwera. Backup bazy bez katalogów z plikami to niepełny backup.
- Nowy znacznik w edytorze rich text musi trafić do polityki w `richhtml.go`, inaczej serwer go
  usunie, a echo przez WS skasuje formatowanie u autora.
- Przy dopisywaniu handoutu z delty WS sprawdzaj id (refetch mógł go już przynieść).
- Koniec utworu wykrywa **każdy** klient i każdy woła `POST /music/next` z `version`. Optymistyczna
  blokada sprawia, że utwór przesuwa tylko pierwszy z nich. Bez `version` playlista
  przeskoczyłaby o tyle utworów, ilu jest graczy.
