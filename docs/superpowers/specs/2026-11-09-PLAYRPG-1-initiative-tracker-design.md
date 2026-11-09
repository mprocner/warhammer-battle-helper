# PLAYRPG-1 — Tracker inicjatywy / kolejność tur

Status: specyfikacja zatwierdzona 2026-11-09 (brainstorming), bez implementacji.
Jira: PLAYRPG-1 (epic PLAYRPG-226 „Game").

## Cel

MG prowadzi walkę na scenie: ustala kolejność uczestników, wskazuje, kto teraz działa, zaznacza,
kto już działał w rundzie, i zamyka rundy. Gracze widzą kolejkę i swoją turę. Tracker obsługuje
zarówno systemy z kolejnością po inicjatywie (SRD5, WFRP4e, CoC7e), jak i systemy, w których tura
nie idzie po kolei (MG aktywuje dowolnego uczestnika).

## Decyzje

| # | Decyzja | Wybrane | Odrzucone i dlaczego |
|---|---|---|---|
| 1 | Uczestnicy | Postacie (rozstawienia na scenie), obrazki z warstwy tokenów, wpisy ręczne (nazwa + wartość) | Tylko postacie — potwory to zwykle obrazki bez karty |
| 2 | Wartość inicjatywy | Wpisywana ręcznie przez MG we wszystkich systemach | Rzut per system i formuła w kreatorze — osobne zadania |
| 3 | Widoczność | MG ukrywa pojedynczego uczestnika **albo** cały tracker. Gracze nie widzą wartości liczbowych | Pełna jawność — zdradza zasadzki |
| 4 | Tura ukrytego uczestnika u gracza | Niewidoczna: podświetlenie zostaje na ostatnim widocznym aktywnym | „???” — zdradza, że ktoś jest w ukryciu |
| 5 | Ukrycie wpisu a `placement.Hidden` | Niezależne flagi; dodanie ukrytego tokena tylko ustawia domyślnie ukryty wpis | Synchronizacja — dwie flagi o różnym znaczeniu |
| 6 | Model tury | Flaga `acted` na wpisie + jedno `activeId`; kolejność to sugestia. Bez trybów | Wskaźnik pozycji — wymusza kolejność; przełącznik trybów — dwie ścieżki kodu |
| 7 | Przekazanie tury | „Zakończ turę" / „Następna" aktywuje następnego niedziałającego; gdy wszyscy działali — nikt aktywny, rundę zamyka MG | Automatyczne zamknięcie rundy — odbiera MG moment na efekty końca rundy |
| 8 | Kto przesuwa turę | MG wszystko; gracz z dostępem do postaci (`CanEditCharacter`) — tylko „Zakończ turę" jej tury | Tylko MG |
| 9 | Komunikaty w czacie | Brak | Zaśmiecają log rzutów |
| 10 | Zakres walki | **Per scena** (`Scene.Combat`) | Na grę — gracze innych scen widzieliby cudzą walkę, brak równoległych walk |
| 11 | Wejście | Przycisk w dolnym pasku narzędzi za pionowym separatorem + „Dodaj do walki" w menu tokena | Zakładka w prawym panelu — zabiera graczom czat w trakcie walki |
| 12 | Ikona | `SportsKabaddi` (MUI) — do zmiany w przyszłości bez konsekwencji | MUI nie ma mieczy ani pięści |
| 13 | Układ | Pasek kolejki nad mapą (wszyscy) + okno „Walka" w Window Managerze (MG) | Rozwijany pasek — zasłania środek mapy |
| 14 | Pozycja paska | Przeciągany za uchwyt, pozycja lokalna per użytkownik | Stała; dokowanie do krawędzi (pion) — osobne zadanie |
| 15 | Zakończ walkę | Czyści listę uczestników i rundę | Zachowanie listy — kolejna walka to zwykle inni przeciwnicy |
| 16 | Przechowywanie | Osadzone w dokumencie gry, `json:"-"`, maskowany endpoint | Osobna kolekcja — sprzątanie bez transakcji; pamięć huba — ginie przy restarcie |

## Cykl życia

1. **Brak walki.** Gracze nic nie widzą (brak przycisku, brak paska). MG: przycisk w pasku narzędzi
   albo „Dodaj do walki" w menu tokena tworzy walkę.
2. **Przygotowanie.** Walka utworzona jest **ukryta** (`visibleToPlayers=false`). MG dodaje
   uczestników i wpisuje wartości. Krok opcjonalny — „Pokaż graczom" od razu.
3. **Walka trwa.** Pasek widzą MG i gracze przypisani do tej sceny. Gracz może zwinąć i przesunąć
   pasek u siebie, nie może go zamknąć.
4. **Zakończ walkę** (MG, z potwierdzeniem) — usuwa walkę ze sceny; powrót do stanu 1.

Walka należy do sceny. Gdy MG przełączy się na inną scenę, widzi walkę tamtej sceny (zwykle
brak); po powrocie walka jest nietknięta. Pasek scen pokazuje MG ikonę przy scenach z trwającą walką.

## Model danych (backend)

```go
// Scene gets:
Combat *Combat `bson:"combat,omitempty" json:"-"`

type Combat struct {
    Round            int                `bson:"round"`
    ActiveID         primitive.ObjectID `bson:"activeId,omitempty"` // zero = nobody active
    // LastVisibleActiveID: last non-hidden entry that was active; shown to players while a hidden one acts.
    // Updated on every activation of a non-hidden entry; cleared by end-round and when that entry is removed.
    LastVisibleActiveID primitive.ObjectID `bson:"lastVisibleActiveId,omitempty"`
    VisibleToPlayers bool               `bson:"visibleToPlayers"`   // false = whole tracker hidden
    Entries          []CombatEntry      `bson:"entries"`            // display order
    StartedAt        time.Time          `bson:"startedAt"`
}

type CombatEntry struct {
    ID         primitive.ObjectID `bson:"_id"`
    Kind       string             `bson:"kind"`               // "character" | "image" | "manual"
    SourceID   primitive.ObjectID `bson:"sourceId,omitempty"` // GameCharacter.ID (placement) | SceneImage.ID
    Name       string             `bson:"name"`               // image + manual; character name resolved live
    Initiative int                `bson:"initiative"`
    Acted      bool               `bson:"acted"`
    Hidden     bool               `bson:"hidden"`
}
```

- Wpis postaci wskazuje **rozstawienie na scenie** (`GameCharacter.ID`), nie `Character.ID`.
  Nazwa i avatar są rozwiązywane na żywo.
- `SceneImage` nie ma nazwy — wpis obrazka trzyma własną `Name`, domyślnie `FileName` bez
  rozszerzenia, edytowalną przez MG.
- Kolejność = kolejność tablicy. Dodanie i zmiana wartości wstawiają wpis wg wartości malejąco
  (przy remisie — za istniejącymi o tej samej wartości). Przeciągnięcie zapisuje ręczną kolejność.
- Ten sam token (rozstawienie / obrazek) może wystąpić w walce tylko raz.
- „Zabity" nie jest stanem trackera: wpis odczytuje stan „zabity" z postaci (`States`) lub obrazka
  (`SceneImage.Killed`).

## API

Prefiks: `/games/:id/scenes/:sceneId/combat`.

| Metoda | Ścieżka | Kto | Działanie |
|---|---|---|---|
| GET | `` | MG; gracz przypisany do sceny | Widok maskowany per widz |
| POST | `` | MG | Start walki (ukryta, runda 1) |
| DELETE | `` | MG | Zakończ walkę |
| PATCH | `` | MG | `visibleToPlayers` |
| POST | `/entries` | MG | Dodaj wpis(y) — także wiele naraz z zaznaczenia; tworzy walkę, jeśli jej nie ma |
| PATCH | `/entries/:entryId` | MG | `name`, `initiative`, `acted`, `hidden` |
| DELETE | `/entries/:entryId` | MG | Usuń wpis |
| PUT | `/order` | MG | Ręczna kolejność (lista ID) |
| POST | `/activate` `{entryId}` | MG | Ustaw aktywnego |
| POST | `/next` `{afterEntryId}` | MG | Aktywny → `acted`, aktywuj następnego niedziałającego (pomija zabitych) |
| POST | `/end-turn` `{entryId}` | MG; `CanEditCharacter` dla wpisu postaci | Jak `/next`, ale tylko gdy `activeId == entryId` |
| POST | `/end-round` | MG | Zeruje `acted`, `round++`, aktywny = pierwszy niezabity |

- `/next` i `/end-turn` to **warunkowy update w Mongo** (`combat.activeId == oczekiwany`). Gdy
  warunek nie pasuje — 409, nic się nie zmienia. Dwa szybkie kliknięcia nie przeskakują uczestnika.
- Każdy endpoint sprawdza, że scena należy do gry, a wpis do sceny (otwarty IDOR w warstwie
  serwisu — nie powielać).
- Maskowanie dla gracza: brak walki gdy `visibleToPlayers=false`; usunięte wpisy `hidden`; brak
  pola `initiative`; `activeId` wskazujący ukryty wpis zastąpiony `lastVisibleActiveId`
  (albo zero, gdy pusty lub sam stał się ukryty). Pole `lastVisibleActiveId` nie trafia do gracza.
- Gracz nieprzypisany do sceny dostaje 403.

**WebSocket:** `SCENE_COMBAT_UPDATED {sceneId}` — klient refetchuje własny, zamaskowany widok.
Emitowany przy każdej zmianie walki oraz przy sprzątaniu wpisu (usunięcie postaci z gry, tokena ze
sceny, obrazka) i zmianie stanu „zabity".

## Frontend

Katalog: `src/components/scene/combat/`.

- **`useSceneCombat(gameId, sceneId)`** — fetch przy montowaniu i zmianie sceny, refetch na
  `SCENE_COMBAT_UPDATED` swojej sceny. Bez pollingu.
- **`CombatToolbarButton`** — dolny pasek narzędzi, za pionowym separatorem, ikona
  `SportsKabaddi`. Nigdy nie ma pełnego wypełnienia „aktywnego trybu". Stany:
  brak walki (zwykły) · walka ukryta (przerywana ramka + odznaka `VisibilityOff`, tylko MG) ·
  walka trwa (złota poświata + odznaka rundy „R2") · tura gracza (zielony puls, także przy
  zwiniętym pasku). U gracza przycisku nie ma, gdy walki nie ma lub jest ukryta.
  Klik MG bez walki: tworzy walkę ukrytą i otwiera okno. W pozostałych stanach: zwija/rozwija pasek
  (lokalnie).
- **`CombatStrip`** — nakładka nad mapą w pozycji ekranowej (zoom/pan jej nie ruszają). Uchwyt
  przeciągania, pozycja w `localStorage` per gra (odczyt/zapis w `try/catch`), przycinana do
  obszaru mapy, podwójny klik w uchwyt = pozycja domyślna (góra, środek). Zawartość: runda,
  portrety (aktywny — złota poświata, działał — wyszarzony, zabity — czaszka, ręczny — kreskowana
  ramka, ukryty — odznaka, tylko MG), u MG „▶ Następna" + ⚙ (otwiera okno), u gracza w turze jego
  postaci „Zakończ turę". Nazwy w portal tooltipie.
- **`CombatWindow`** — okno Window Managera (`kind: 'combat'`). Lista: uchwyt dnd-kit, portret,
  nazwa (klik = aktywuj; edycja nazwy dla obrazka/wpisu ręcznego), pole wartości, przełącznik
  „działał", przełącznik „widoczny", usuń. Stopka: Następna, Koniec rundy, + Wpis, Pokaż/Ukryj
  graczom, Zakończ walkę (`ConfirmModal`). Gdy wszyscy działali — wyróżniony „Koniec rundy".
- **Menu kontekstowe** — „Dodaj do walki" / „Usuń z walki" w menu tokena postaci,
  `SceneImageContextMenu` (warstwa `tokens`) i `SceneTokenMultiContextMenu`.
- **Pasek scen** — ikona `SportsKabaddi` przy scenach z trwającą walką (tylko MG).
- **Token** — aktywny uczestnik ma złotą poświatę na mapie, jeśli widz go widzi.
- i18n: klucze `combat.*` w `en` i `pl`; ikony MUI; tooltipy przez portal.

## Przypadki brzegowe

- Usunięcie aktywnego wpisu (ręcznie lub przez sprzątanie) → nikt aktywny.
- „Następna" bez aktywnego → pierwszy niedziałający niezabity.
- Wszyscy działali → nikt aktywny; runda nie zamyka się sama.
- Ukryci nie są pomijani przez „Następna" (MG nimi gra); gracze nie widzą ich tury.
- Zmiana wartości aktywnego → przesuwa się, pozostaje aktywny.
- Gracz przeniesiony na inną scenę → widzi walkę nowej sceny albo nic.
- Gracz opuszcza grę / wyrzucony → traci `VisibleTo`, nie kończy już tur.
- Usunięcie sceny → walka znika z nią.
- 409 na `/next` lub `/end-turn` → klient refetchuje, bez komunikatu błędu.

## Poza zakresem (osobne zadania)

- Formuła inicjatywy w kreatorze (karta „Inicjatywa" w zakładce Ogólne, gramatyka pola
  wyliczanego) jako wartość domyślna przy dodaniu.
- Rzut inicjatywy z karty / trackera (np. SRD5 k20+DEX), także przez gracza.
- Komunikaty o turze i rundzie w czacie.
- Liczniki efektów („na N rund").
- Przenoszenie / odpinanie walki od sceny.
- Dokowanie paska do krawędzi (układ pionowy).
- „Opóźnij turę" (delay) — częściowo pokryte ręczną aktywacją.

## Kryteria akceptacji

**Start i widoczność**
1. MG bez walki na scenie klika przycisk trackera → powstaje walka ukryta, runda 1, otwiera się okno „Walka"; gracze tej sceny nic nie widzą (ani paska, ani przycisku).
2. „Dodaj do walki" na tokenie postaci, obrazku z warstwy tokenów i zaznaczeniu ramką dodaje wszystkie wskazane tokeny; tworzy walkę, jeśli jej nie było; token już obecny nie jest dublowany, a menu pokazuje dla niego „Usuń z walki".
3. MG dodaje wpis ręczny z nazwą i wartością.
4. „Pokaż graczom" → gracze przypisani do sceny widzą pasek i przycisk; „Ukryj" → znikają.
5. Ukryty wpis nie istnieje dla gracza (pasek, odpowiedź API); gracz nie dostaje wartości inicjatywy w żadnym wpisie.
6. Gdy aktywny jest wpis ukryty, gracz widzi podświetlenie na ostatnim widocznym aktywnym (albo brak).
7. Gracz nieprzypisany do sceny dostaje 403 na `GET .../combat` i nie widzi jej walki.

**Kolejność i tura**
8. Wpisy są posortowane malejąco wg wartości; zmiana wartości przenosi wpis; przeciągnięcie w oknie zapisuje ręczną kolejność u wszystkich.
9. Kliknięcie uczestnika w oknie czyni go aktywnym (u wszystkich, z poświatą na portrecie i na tokenie, o ile widz go widzi).
10. „Następna" oznacza aktywnego jako „działał" i aktywuje pierwszego niedziałającego, pomijając zabitych; gdy wszyscy działali — nikt nie jest aktywny.
11. MG może ręcznie przełączyć „działał" u dowolnego uczestnika.
12. „Koniec rundy" zeruje „działał", zwiększa rundę o 1 i aktywuje pierwszego niezabitego.
13. Gracz z dostępem do aktywnej postaci (`CanEditCharacter`) widzi „Zakończ turę"; inni gracze nie; wpisy obrazków i ręczne kończy tylko MG.
14. Dwa równoczesne „Zakończ turę" (lub podwójne „Następna") przesuwają turę tylko o jednego uczestnika; drugie żądanie zwraca 409 i nie zmienia stanu.

**Sceny i sprzątanie**
15. Walka należy do sceny: MG po przełączeniu sceny widzi walkę tamtej sceny; po powrocie pierwsza walka jest niezmieniona. Dwie sceny mogą mieć walki jednocześnie.
16. Pasek scen pokazuje MG ikonę przy scenach z trwającą walką.
17. Usunięcie tokena ze sceny, obrazka lub postaci z gry usuwa wpis u wszystkich bez odświeżania; jeśli był aktywny — nikt nie jest aktywny.
18. „Zakończ walkę" (z potwierdzeniem) czyści listę i rundę; pasek i przycisk znikają graczom.

**UI**
19. Przycisk trackera stoi za pionowym separatorem w dolnym pasku narzędzi i pokazuje stany: brak walki / ukryta (tylko MG) / trwa z numerem rundy / tura gracza (puls).
20. Pasek da się przeciągnąć za uchwyt; pozycja przetrwa odświeżenie, nie wychodzi poza mapę, podwójny klik w uchwyt ją resetuje; zoom i przesuwanie mapy jej nie zmieniają.
21. Przycisk trackera zwija/rozwija pasek tylko lokalnie.
22. Okno „Walka" przesuwa się, minimalizuje na listwę okien i zamyka jak inne okna Window Managera.
23. Wszystkie teksty w en i pl; ikony MUI; tooltipy przez portal.

**Bezpieczeństwo i jakość**
24. `Scene.Combat` nie wypływa w `GET /games/:id`, snapshocie WS ani liście gier w lobby — pokryte testem.
25. Każdy endpoint weryfikuje przynależność sceny do gry i wpisu do sceny.
26. Testy Go: logika kolejki (next, end-round, wstawianie wg wartości, reorder, pomijanie zabitych), maskowanie per widz, uprawnienia `end-turn`, warunkowy update, sprzątanie wpisów.
27. Testy front: stany przycisku, render paska dla MG i gracza, „Zakończ turę" tylko z dostępem, `localStorage` z `try/catch`, refetch hooka tylko na event swojej sceny.

**Dokumentacja (w tym samym commicie co kod)**
28. Changelog: nowa wersja MINOR w `RELEASES` + teksty en/pl.
29. Baza wiedzy: `06-scena.md` (mechanizm i pułapki: maskowanie, warunkowy update, `json:"-"`) + wiersz w `00-inwentaryzacja.md`.
30. `/help` pl i en: sekcja o trackerze ze stałą kotwicą; samouczek gry sprawdzony pod nowy przycisk (krok z `help`).

## Odstępstwa w implementacji

1. Zapis warunkowy po `Combat.Version` obejmuje każdy zapis (409 przy wyścigu); `next` i `end-turn` dodatkowo sprawdzają, kto jest aktywny.
2. Leniwe sprzątanie `combat.Prune` przy odczycie i zapisie zamiast hooków w ścieżkach usuwania; klient refetchuje walkę na eventach usunięcia.
3. Wskaźnik walki przy scenie pochodzi z `GET /games/:id/combats` (tylko MG).
4. „Dodaj do walki” dla postaci działa przez prawy klik na zaznaczonym tokenie (menu grupowe) oraz listę „Na tej scenie” w oknie.
5. Zabity uczestnik to czerwony krzyżyk, bo MUI nie ma czaszki.
6. Do walki trafiają tylko obrazki z warstwy tokenów — pilnuje tego front i backend.
