# FEATURE-134 — weryfikacja w przeglądarce

Kod jest gotowy (14 commitów na `FEATURE-134-game-tutorial-tour`). Zostały dwa kroki po Twojej
stronie. Nic nie scalam, dopóki nie powiesz, że wygląda dobrze.

## 1. Przebudowa kontenera

Doszła nowa zależność `react-joyride@3.2.0`, więc kontener musi dostać świeże `node_modules`:

```
docker compose up -d --build --renew-anon-volumes frontend
```

W logach nie może być `Module not found: Error: Can't resolve 'react-joyride'`.

## 2. Przejście po ekranie

Flagę „już widziałem" kasujesz w konsoli przeglądarki:
`localStorage.removeItem('tutorialSeen:gm')` (albo `:player`), potem odśwież.

| # | Co sprawdzić | Czego oczekiwać |
|---|---|---|
| 1 | MG wchodzi do gry **ze sceną**, flaga skasowana | Samouczek startuje sam, i to **po** wczytaniu postaci — nie na wpół złożonym ekranie (to był zgłoszony błąd: pokazywały się tylko 2 kroki). **9 kroków** — nie 10: krok o belce okien wypada, dopóki nie masz otwartej żadnej karty postaci (`WindowBar` renderuje się dopiero z oknami). Otwórz kartę, wyczyść flagę, odśwież → 10 kroków. |
| 2 | Schowaj lewy i prawy panel oraz zwiń górne belki **przed** startem | Kroki 1-2 same wysuwają lewy panel, krok o belce rozwija górę, kroki o zakładkach i kościach wysuwają prawy panel. **Patrz, GDZIE ląduje podświetlenie, nie tylko czy się pojawia** — panele animują szerokość przez 0.3 s, a biblioteka mierzy pozycję raz. Najbardziej podejrzany: krok o zakładkach (`.right-panel__tabs-nav` ma stałą szerokość). |
| 3 | Gra **bez sceny** | Odpadają kroki o warstwie i narzędziach. Krok o mapie zostaje — podświetla pusty obszar, to zamierzone. |
| 4 | Konto gracza w tej samej grze | Brak kroku o scenach i o warstwie. Krok o narzędziach mówi o przesuwaniu, miarce i rysowaniu. |
| 5 | Przełącz sterowanie na `classic` (zakładka Ogólne), uruchom przyciskiem `?` | Krok o mapie mówi o **prawym** przycisku myszy. |
| 6 | „Pomiń" w połowie, odśwież stronę | Samouczek **nie** startuje ponownie. |
| 7 | **Escape** w trakcie | Kończy samouczek tak samo jak „Pomiń" (nie przechodzi dalej). Flaga zapisana. |
| 8 | Klik w ciemne tło | **Nic się nie dzieje** — samouczek nie znika. |
| 9 | Przycisk `?` obok nagłówka „Ustawienia" | Uruchamia samouczek mimo ustawionej flagi. Sprawdź też, czy napis „Ustawienia" jest **wyśrodkowany tak samo** jak „Postacie" w lewym panelu (przycisk był wcześniej wypychał tytuł w lewo — poprawione, ale to trzeba zobaczyć). |
| 10 | Zmień język na EN w trakcie samouczka | Teksty zmieniają się bez restartu. Najedź na przyciski dymka — podpowiedzi też mają być w bieżącym języku, nie po angielsku na sztywno. |
| 11 | `localStorage` po skończeniu | Jest `tutorialSeen:gm`, nie ma `tutorialSeen:player` (i odwrotnie dla gracza). |

## 3. Rzeczy czysto wizualne, do oceny okiem

- **Złota obwódka podświetlenia.** `react-joyride` 3.x usunął `spotlightShadow` z 2.x, więc zamiast
  poświaty jest teraz kontur 2 px w kolorze `#c9975b`. Powiedz, jeśli wolisz inaczej — to jedna linia.
- **Strzałka dymka** ma kolor `#f4e8d8`, czyli jaśniejszy koniec gradientu tła. Przy dymkach na dole
  i po prawej może odrobinę odstawać od ciemniejszego `#e8dcc4`.
- Czytelność tekstów: czy 9-pozycyjna legenda zakładek mieści się bez przewijania na Twoim ekranie.

## 4. Samouczki poszczególnych zakładek (Task 8)

- [ ] Przycisk `?` przy nagłówku każdej z ośmiu zakładek; w `general` nagłówek jest, przycisku nie ma.
- [ ] Wysokość nowego nagłówka w czacie — czy nie zjada zbyt wiele miejsca na log.
- [ ] Puste i pełne `files`, `notes`, `handouts`, `scenes`: tekst kroku o liście mówi „tu pojawi się…"
      przy pustej i „to są…" przy pełnej.
- [ ] Konto gracza w `chat`, `handouts`, `notes` — inne teksty niż u MG, brak kroku o tworzeniu
      handoutu.
- [ ] `minigames`: przycisk w widoku listy, brak w konfiguracji rozgrywki.
- [ ] Uruchomienie samouczka zakładki w trakcie trwającego samouczka ogólnego — ogólny ustępuje,
      nic się nie zawiesza.
- [ ] `music` w świeżej grze: krok o odtwarzaniu wypada, dopóki nic nie grało.
- [ ] Po samouczku zakładki `localStorage` **nie** dostaje nowego klucza — zapisywany jest wyłącznie
      samouczek ogólny.

## Znane ograniczenia (świadome, nie błędy)

- Flaga siedzi w `localStorage`, więc ten sam MG na innym komputerze dostanie samouczek jeszcze raz.
  Drugi użytkownik na tej samej przeglądarce nie zobaczy go wcale. Przeniesienie na konto to osobny
  feature, tak ustaliliśmy.
- Jeśli kotwica kroku zniknie **w trakcie jego wyświetlania** (np. skasujesz podświetloną scenę),
  dymek znika i samouczek zostaje bez wyjścia — ratunek to odświeżenie strony. Naprawa wymaga
  `MutationObserver`, uznałem to za nieopłacalne przy takim wyzwalaczu.


---

# Samouczki zakładek — druga tura weryfikacji

Doszło osiem samouczków zakładek (przycisk `?` przy nagłówku) plus refaktor silnika. Kod gotowy,
625 testów zielonych. Poniżej to, czego testy nie rozstrzygają.

Kontener przebuduj tak samo jak poprzednio:
`docker compose up -d --build --renew-anon-volumes frontend`

## Przyciski i nagłówki

| # | Co sprawdzić | Czego oczekiwać |
|---|---|---|
| 1 | Przycisk `?` przy nagłówku ośmiu zakładek | Jest w: czat, sceny, handouty, pliki, muzyka, notatki, gracze, minigry. W **Ogólnych** jest sam nagłówek, bez przycisku — celowo. |
| 2 | Czy przycisk czegoś nie przesunął | W notatkach i scenach obok `?` stoi „+ Dodaj". Ten przycisk ma zostać przy prawej krawędzi, nie wjechać na środek. |
| 3 | Handouty na koncie MG i gracza | Przycisk `?` w **tym samym miejscu** u obu. MG widzi obok „+ Dodaj handout" i „+ Nowy folder", gracz tylko `?`. |
| 4 | Nowy nagłówek czatu | Czy nie zjada za dużo miejsca na log. Ma pasować do pozostałych zakładek. |
| 5 | Nagłówek w Ogólnych | Ten sam styl co reszta. |
| 6 | Minigry | `?` w widoku listy gier; po wejściu w konfigurację rozgrywki przycisku **nie ma**. |

## Treść samouczków

| # | Co sprawdzić | Czego oczekiwać |
|---|---|---|
| 7 | Pliki, notatki, sceny, handouty — **puste** i **pełne** | Przy pustej zakładce tekst mówi „tu pojawi się…", przy pełnej opisuje, co widać. Włącz oba stany. |
| 8 | Konto gracza: czat, handouty, notatki | Inne teksty niż u MG. W handoutach **nie ma** kroku o tworzeniu. |
| 9 | Krok o kościach (czat) | Mówi o rozwijanej liście na końcu wiersza — **nie** o ikonie oka. Sprawdź, czy opis zgadza się z tym, co widzisz. |
| 10 | Krok o głośności (muzyka) | Mówi, że suwak MG ustawia głośność **całego stołu**, a każdy gracz ma dodatkowo własny. |
| 11 | Samouczek ogólny, krok o zakładkach | Na końcu zdanie, że większość zakładek ma własny samouczek pod `?`. |

## Zachowanie

| # | Co sprawdzić | Czego oczekiwać |
|---|---|---|
| 12 | **Przełącz zakładkę w trakcie samouczka zakładki** | Samouczek się kończy. Potem kliknij `?` przy „Ustawienia" — ma ruszyć **samouczek ogólny**, nie ten porzucony. To była najpoważniejsza naprawiona usterka. |
| 13 | To samo dla **handoutów, notatek i muzyki** | Osobny punkt, bo te trzy zakładki zostają zamontowane w tle. Podejrzenie: dymek może się przykleić do niewidocznego elementu zamiast zniknąć. Tego nie da się sprawdzić inaczej niż w przeglądarce. |
| 14 | Escape w trakcie samouczka zakładki | Kończy go. Potem `?` przy „Ustawienia" znów daje samouczek ogólny. |
| 15 | Ten sam przycisk `?` zakładki dwa razy | Za drugim razem samouczek startuje od nowa, nie ignoruje kliknięcia. |
| 16 | Samouczek zakładki a `localStorage` | Po jego zakończeniu **nie** przybywa żaden klucz. Zapisywany jest wyłącznie samouczek ogólny. |
| 17 | Kliknij `?` zakładki **zaraz po wejściu do gry**, zanim wszystko się wczyta | Po zakończeniu tego samouczka nie powinien sam wystartować pełny samouczek ogólny. Wąski przypadek, ale wart sprawdzenia. |
| 18 | Oba języki | Przełącz na EN i przejdź kilka samouczków. Podpowiedzi na przyciskach też mają być w bieżącym języku. |

## Znane ograniczenia (świadome)

- Samouczki zakładek nie zapisują się nigdzie — zawsze na przycisk. Tylko ogólny pamięta, że go widziałeś.
- Przy zmienionej nazwie klasy CSS krok po cichu wypada z samouczka. Test to łapie tylko dla części
  selektorów — patrz uwaga o strażniku w raporcie.
- „Powrót do trwającej minigry" w zakładce minigier nie działa (`onReopenMinigameBoard` to pusta
  operacja). To osobny błąd produktu, nie samouczka — teksty samouczka już tego nie obiecują.
