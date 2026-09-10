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

## Znane ograniczenia (świadome, nie błędy)

- Flaga siedzi w `localStorage`, więc ten sam MG na innym komputerze dostanie samouczek jeszcze raz.
  Drugi użytkownik na tej samej przeglądarce nie zobaczy go wcale. Przeniesienie na konto to osobny
  feature, tak ustaliliśmy.
- Jeśli kotwica kroku zniknie **w trakcie jego wyświetlania** (np. skasujesz podświetloną scenę),
  dymek znika i samouczek zostaje bez wyjścia — ratunek to odświeżenie strony. Naprawa wymaga
  `MutationObserver`, uznałem to za nieopłacalne przy takim wyzwalaczu.
