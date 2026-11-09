# Ekran gry

Ekran gry ma cztery główne części:

| Część | Co tam jest |
|---|---|
| **Lista postaci i karta** (po lewej) | Postacie graczy i, dla MG, lista NPC. Kliknięcie kafelka pokazuje krótką kartę postaci z najważniejszymi statystykami i szybkimi rzutami |
| **Mapa** (środek) | Aktualna scena z tokenami, mgłą wojny i rysunkami |
| **Panel boczny** (po prawej) | Zakładki: Czat, Sceny, Handouty, Pliki, Muzyka, Notatki, Gracze, Gry, Ogólne. Gracz widzi tylko Czat, Handouty, Notatki i Ogólne |
| **Pasek u góry** | Kto jest w grze (świecący avatar = połączony) i zminimalizowane okna |

Karty postaci, handouty i notatki otwierają się w osobnych okienkach, które można przesuwać.
Zminimalizowane okno trafia na pasek u góry, więc nic nie ginie za mapą. Kartę postaci można
też otworzyć w osobnej karcie przeglądarki (ikona zwoju przy imieniu), co przydaje się na
drugim monitorze.

## Sterowanie mapą {#map-controls}

Schemat wybierasz w zakładce **Ogólne**:

| | Nowoczesny | Klasyczny |
|---|---|---|
| Zoom | kółko myszy | Ctrl + kółko |
| Przesuwanie mapy | przeciągnij prawym przyciskiem | kółko lub przeciągnięcie prawym przyciskiem |

W obu schematach:
- lewy klik zaznacza token, a przeciągnięcie go przesuwa,
- przeciągnięcie po pustej mapie zaznacza kilka tokenów naraz (z Shiftem dodaje do zaznaczenia),
- środkowy przycisk myszy przełącza kolejne narzędzia.

## Narzędzia mapy {#map-tools}

| Narzędzie | Kto | Do czego |
|---|---|---|
| **Zaznacz / Przesuń** | wszyscy | Wybór i przesuwanie tokenów, obracanie i zmiana rozmiaru |
| **Pomiar odległości** | wszyscy | Linijka w jednostkach gry, opcjonalnie z obszarem działania. Inni widzą twoją linijkę na żywo |
| **Mgła Wojny** | MG | Zakrywanie i odkrywanie mapy przed graczami |
| **Rysowanie** | wszyscy | Odręcznie, linia, prostokąt, koło, strzałka, wielokąt i tekst, widoczne dla wszystkich |

**Warstwy.** Mapa składa się z warstw: tokeny, warstwa MG (widzi ją tylko MG) i tło. Przesuwanie
lub usuwanie obrazków działa tylko na warstwie wybranej w selektorze warstw. Rysowania to nie dotyczy.

**Ping.** Przytrzymaj lewy przycisk w miejscu na pustej mapie przez około pół sekundy, nie
ruszając myszą. Wszyscy zobaczą znacznik w tym miejscu.

## Kolejka tur {#turn-order}

**MG.** Przycisk z dwiema walczącymi postaciami w pasku narzędzi (za kreską) rozpoczyna walkę na
bieżącej scenie. Walka startuje ukryta: dodaj uczestników, wpisz inicjatywę i kliknij
**Pokaż graczom**. Uczestników dodasz z okna „Walka” (lista „Na tej scenie”, wpis ręczny) albo
prawym przyciskiem na tokenie: obrazek ma pozycję **Dodaj do walki** w swoim menu, a token postaci
najpierw zaznacz, potem kliknij prawym.

- Kolejność wynika z inicjatywy (malejąco); przeciągnij wiersz, żeby rozstrzygnąć remis.
- Kliknięcie uczestnika czyni go aktywnym — tura nie musi iść po kolei.
- **Następna tura** oznacza aktywnego jako „działał” i przechodzi do następnego, który jeszcze nie
  działał. **Koniec rundy** zeruje znaczniki i zwiększa licznik rund.
- Oko przy uczestniku ukrywa go przed graczami (zasadzka). Gracze nie widzą wartości inicjatywy.
- Każda scena ma własną walkę; przy nazwie sceny z trwającą walką widzisz ikonę.
- **Zakończ walkę** czyści kolejkę.

**Gracz.** Gdy trwa walka, nad mapą widzisz kolejkę. Gdy przychodzi tura twojej postaci, przycisk
walki pulsuje na zielono, a na pasku pojawia się **Zakończ turę**. Pasek możesz przeciągnąć za
uchwyt albo zwinąć przyciskiem walki.

## Samouczki {#tutorials}

Przy pierwszym wejściu do gry uruchamia się samouczek ekranu. Możesz go powtórzyć znakiem
zapytania w nagłówku panelu. Obok są dwie ikony: książka otwiera ten przewodnik, a gwiazdka
listę zmian (**Co nowego**), obie w nowej karcie. Po najechaniu kursorem każda ikona od razu
pokazuje swoją nazwę. Kontakt, regulamin, politykę prywatności
i licencje znajdziesz na samym dole zakładki **Ogólne**, w sekcji **Linki serwisu**. Zakładki mają własne, krótkie samouczki. Dymek samouczka ma link
**Więcej w pomocy**, który otwiera w nowej karcie odpowiednią sekcję tego przewodnika — gra
zostaje otwarta tam, gdzie była.
