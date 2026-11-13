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
lub usuwanie obrazków działa tylko na warstwie wybranej w selektorze warstw (ikony po prawej; nazwa
warstwy pojawia się po najechaniu). Rysowania to nie dotyczy.

**Ping.** Przytrzymaj lewy przycisk w miejscu na pustej mapie przez około pół sekundy, nie
ruszając myszą. Wszyscy zobaczą znacznik w tym miejscu.

## Skróty klawiszowe {#keyboard-shortcuts}

W grze naciśnij `?` albo wybierz **Skróty klawiszowe** z menu pod znakiem zapytania w nagłówku
panelu, żeby zobaczyć ściągę. Na
macOS zamiast Ctrl używasz ⌘. Skróty nie działają, gdy piszesz w polu tekstowym (np. na czacie)
albo gdy otwarte jest okno.

| Skrót | Kiedy | Co robi |
|---|---|---|
| `?` | zawsze | Pokazuje listę skrótów |
| `Ctrl + C` | zaznaczanie (MG) | Kopiuje zaznaczone obrazy, także kilka naraz; tokeny postaci są pomijane |
| `Ctrl + V` | zaznaczanie (MG) | Wkleja skopiowane obrazy pod kursorem, także na innej scenie; kopie zostają zaznaczone |
| `Delete` / `Backspace` | zaznaczanie (MG) | Usuwa zaznaczone tokeny (zablokowane obrazy zostają) |
| `Esc` | zaznaczanie | Odznacza wszystko |
| `Delete` / `Backspace` | rysowanie, narzędzie zaznaczania | Usuwa zaznaczony rysunek |
| `Esc` | mgła wojny, wielokąt (MG) | Anuluje rysowany wielokąt |

Kopia zachowuje warstwę, ukrycie przed graczami, etykietę i pierścień tokenu, ale zaczyna się
odblokowana i żywa. Gdy kursor nie jest nad mapą, kopia ląduje tuż obok oryginału.

Gesty myszy (środkowy przycisk, przesuwanie mapy, Shift przy zaznaczaniu, ping) opisuje sekcja
[Sterowanie mapą](02-game-screen.md#map-controls).

## Kolejka tur {#turn-order}

**MG.** Przycisk z dwiema walczącymi postaciami w pasku narzędzi (za kreską) rozpoczyna walkę na
bieżącej scenie. Walka startuje ukryta: dodaj uczestników, wpisz inicjatywę i kliknij
**Pokaż** (oko) w oknie „Walka”. Uczestników dodasz z okna „Walka” albo prawym przyciskiem na tokenie (obrazek ma
pozycję **Dodaj do walki** w swoim menu, a token postaci najpierw zaznacz, potem kliknij prawym).

W oknie „Walka”, w części **Dodaj uczestników** pod kolejką, kandydaci są zawsze widoczni,
pogrupowani i posortowani alfabetycznie; grupa znika, gdy wszyscy
z niej już walczą. Kliknięcie dodaje jedną pozycję, **Wszyscy** przy nagłówku — całą grupę:

- **Postacie** — postacie graczy z lewego panelu, na mapie czy nie. Postać to zawsze jeden wpis:
  gdy jest aktywna, podświetlają się wszystkie jej tokeny na scenie.
- **BN** — bohaterowie niezależni z lewego panelu, tak samo jeden wpis na postać. Wpis nie ukrywa
  się sam razem z tokenem — ukrytego BN ukryj okiem przy wpisie.
- **Tokeny** — obrazki z warstwy tokenów stojące na mapie, pod swoją etykietą (bez etykiety —
  pod nazwą pliku). Wpis zachowuje nazwę z chwili dodania; zmienisz ją w oknie „Walka”.
- **Wpis ręczny** — sama nazwa i inicjatywa.

- Kolejność wynika z inicjatywy (malejąco); przeciągnij wiersz, żeby rozstrzygnąć remis.
- Kliknięcie uczestnika czyni go aktywnym — tura nie musi iść po kolei.
- **Następna tura** oznacza aktywnego jako „działał” i przechodzi do następnego, który jeszcze nie
  działał. **Koniec rundy** zeruje znaczniki i zwiększa licznik rund.
- Przygotowaną walkę prowadzisz z samego paska nad mapą, bez otwierania okna: strzałka to
  **Następna tura**, a gdy wszyscy już działali, zamienia się w złoty przycisk **Koniec rundy**
  (opis po najechaniu). Kliknięcie portretu oddaje turę temu uczestnikowi.
- Oko przy uczestniku ukrywa go przed graczami (zasadzka). Gracze nie widzą wartości inicjatywy.
- Każda scena ma własną walkę; przy nazwie sceny z trwającą walką widzisz ikonę.
- **Zakończ walkę** czyści kolejkę.

**Gracz.** Gdy trwa walka, nad mapą widzisz kolejkę. Gdy przychodzi tura twojej postaci, przycisk
walki pulsuje na zielono, a na pasku pojawia się **Zakończ turę**. Pasek możesz przeciągnąć za
uchwyt w dowolne miejsce ekranu, także na panel boczny (dwuklik na uchwycie przywraca go nad mapę),
albo zwinąć przyciskiem walki.

## Samouczki {#tutorials}

Przy pierwszym wejściu do gry uruchamia się samouczek ekranu. Znak zapytania w nagłówku panelu
otwiera menu **Pomoc i skróty**: ten przewodnik i listę zmian (**Co nowego**), obie w nowej
karcie, [skróty klawiszowe](02-game-screen.md#keyboard-shortcuts) oraz ponowne uruchomienie
samouczka. Kropka na znaku zapytania oznacza nowości od ostatniej wizyty w **Co nowego**. Kontakt, regulamin, politykę prywatności
i licencje znajdziesz na samym dole zakładki **Ogólne**, w sekcji **Linki serwisu**. Zakładki mają własne, krótkie samouczki. Dymek samouczka ma link
**Więcej w pomocy**, który otwiera w nowej karcie odpowiednią sekcję tego przewodnika — gra
zostaje otwarta tam, gdzie była.
