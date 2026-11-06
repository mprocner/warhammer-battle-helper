# Kreator systemów

Kreator pozwala zbudować własny system RPG: kartę postaci, rzuty, wygląd tokenów na mapie.
Gotowy szablon wybierasz przy tworzeniu gry tak samo jak system wbudowany.

Otwierasz go przyciskiem **Kreator systemów** w nagłówku listy gier.
Gotową kartę możesz obejrzeć bez otwierania kreatora: podgląd karty jest w „Moich szablonach”
oraz na liście systemów przy tworzeniu gry. Wszystko zapisuje się
automatycznie, nie ma przycisku „Zapisz”.

## Dwie zakładki

- **Ogólne** — ustawienia całego systemu: nazwa, opis, język, dostęp, kości pod czatem,
  modyfikator rzutu, poziomy sukcesu, wygląd tokena, szerokość karty.
- **Karta** — budowa karty postaci pole po polu.

## Budowanie karty

1. Zacznij od **sekcji**. Sekcja to ramka z nagłówkiem, która dzieli pola na kolumny. Sekcje
   można zagnieżdżać i przeciągać.
2. Kliknij typ pola w palecie po lewej. Pole trafi do aktywnej sekcji (jej nazwa jest nad
   listą). Kliknięcie dowolnego elementu karty robi jego sekcję aktywną.
3. Najedź na pole, żeby zobaczyć pasek narzędzi: przeciąganie, w górę i w dół, edycja (ołówek),
   duplikowanie, usuwanie. Ołówek otwiera właściwości pola. Znak zapytania w tytule tego okna
   tłumaczy pole, które edytujesz.
4. Ikona oka chowa narzędzia edycji, żeby zobaczyć kartę dokładnie tak, jak zobaczy ją gracz.

Karta w kreatorze ma tę samą szerokość i wygląd co w grze.

## Typy pól

| Grupa | Pole | Do czego |
|---|---|---|
| Układ | Sekcja | Grupuje pola pod nagłówkiem, w kolumnach |
| Postać | Nazwa postaci | Imię na liście postaci i przy tokenie (jedno na kartę) |
| | Avatar | Portret na liście i jako token na mapie (jeden na kartę) |
| | Obrazek | Obrazek wgrywany przez gracza, np. herb |
| Statystyki | Atrybut | Liczba, na którą można rzucać, opcjonalnie podzielona na bazę i rozwinięcia |
| | Tabela atrybutów | Cały zestaw atrybutów z jednym zestawem ustawień |
| | Liczba | Zwykła liczba, np. pieniądze albo doświadczenie |
| | Obliczane | Wartość z formuły, np. suma atrybutów. Gracz jej nie wpisuje |
| | Postęp | Para aktualna/maksymalna jako pasek, np. zdrowie |
| Tekst | Tekst krótki | Jedna linia, np. profesja |
| | Tekst długi | Wiele linii, opcjonalnie z formatowaniem |
| | Etykieta | Stały tekst: nagłówek, podpowiedź, przypomnienie zasady |
| Wybór | Checkbox | Tak/nie |
| | Lista opcji | Wybór z twojej listy, np. rasa |
| Tabele | Tabela umiejętności | Umiejętności z wartościami do rzutów. Gracze mogą dodawać własne, jeśli pozwolisz |
| | Tabela broni | Bronie z twoimi kolumnami, rzutem ataku i formułą obrażeń. Możesz dodać predefiniowane bronie |
| | Tabela danych | Twoje kolumny na wszystko, czego się nie rzuca, np. ekwipunek. Możesz dodać predefiniowane wiersze |
| | Drzewo umiejętności | Umiejętności w hierarchii, np. umiejętność i specjalizacje |

## Formuły

Pole Obliczane i obrażenia broni budujesz z bloków: atrybuty, liczby, stałe, operatory
(`+ − × ÷`), nawiasy i kości. Przykład: obrażenia `d6 + SIŁA + 2` dadzą w logu rozpisanie
`3 + 8 + 2 = 13`. Karta przelicza wartości na bieżąco.

W formule obrażeń kości ogólne i pole gracza (▢) stają się polami, które gracz wypełnia dla
każdej broni. Pole gracza przyjmuje liczbę albo kość, np. `2`, `-1`, `1K4`, `1K6+1`.

**Predefiniowane bronie i wiersze** to pozycje, które gracze dodają z listy. Te oznaczone
**Dodaj przy tworzeniu postaci** od razu trafiają na kartę każdej nowej postaci jako jej
własne, edytowalne wiersze.

## Rzuty

We właściwościach pola (grupa **Rzut**) zaznacz **Można rzucać** i wybierz **Mechanikę rzutu**:

- **Tradycyjny** — formuła rzutu (np. `d100` albo `2d6+SIŁA`) i **Warunek sukcesu**:
  - **Wynik ≤ atrybut** — rzut pod próg, niższy wynik jest lepszy,
  - **Wynik ≥ atrybut** — rzut nad próg, wyższy wynik jest lepszy,
  - **Surowy wynik** — sama liczba, bez sukcesu i porażki.

  Progiem jest wartość pola. Możesz go zmienić formułą w **Próg (formuła)**, np. `skill*5`
  albo `attr+10`.
- **Pula kości** — rzucasz kilka kości i liczysz te, które spełniły **Warunek sukcesu**
  (**≥** albo **=**) względem **Wartości progu**. Log pokazuje liczbę sukcesów.

Rzut bronią działa tak samo: próg to wartość umiejętności wybranej w kolumnie umiejętności.

## Modyfikator rzutu

Karta **Modyfikator rzutu** w zakładce Ogólne. Po włączeniu **Pytaj o modyfikator przed
rzutem** każdy rzut z karty najpierw otwiera małe okienko. Wyłączone: kliknięcie rzuca od razu.

**Rodzaj modyfikatora** to jedno z dwóch: **Liczba** albo **Kości przewagi i utrudnienia**.
Szablon ma zawsze tylko jeden rodzaj. Przełączenie nie kasuje ustawień drugiego, więc możesz
do nich wrócić.

### Liczba

Gracz wpisuje liczbę (Enter potwierdza, Escape anuluje) albo klika przycisk szybkiego wyboru.

| Ustawienie | Opcje |
|---|---|
| **Rzuty tradycyjne — dokąd trafia modyfikator** | **Do wyniku rzutu**: +20 zmienia rzut 48 na 68, próg zostaje. **Do progu sukcesu**: +20 zmienia próg 55 na 75, rzut zostaje |
| **Pula kości — dokąd trafia modyfikator** | **Do liczby kości**: +2 dorzuca 2 kości, −2 zabiera 2 (zawsze zostaje co najmniej jedna). **Do progu sukcesu**: +2 zmienia próg 7 na 9 |
| **Krok**, **Min**, **Maks** | Krok pola w okienku i zakres. Min i maks równe 0 oznaczają brak ograniczeń |
| **Szybki wybór** | Przyciski z wartością i etykietą, np. `−30` „Bardzo trudny”, `+20` „Łatwy” |

**Wskazówka:** przy rzucie pod próg (**Wynik ≤ atrybut**) dodatni modyfikator dodany **do wyniku**
utrudnia rzut, a dodany **do progu** go ułatwia. Jeśli w Twoim systemie „+20” ma oznaczać
łatwiejszy test, wybierz **Do progu sukcesu**.

### Kości przewagi i utrudnienia

Zamiast liczby gracz wybiera z kolumny przycisków, ile dodatkowych kości rzucić. Przycisk `0`
pojawia się pod kursorem, przewaga jest nad nim, a utrudnienie pod nim.

- **Przewaga** rzuca dodatkowe kości i zostawia **najlepszy** wynik, **utrudnienie** zostawia
  **najgorszy**. Co jest lepsze, wynika z warunku sukcesu pola: przy **Wynik ≤ atrybut** niższy
  wynik, przy **Wynik ≥ atrybut** wyższy.
- **Jak rzucają dodatkowe kości**:
  - **Cała formuła** — każda dodatkowa kość to cała formuła pola rzucona jeszcze raz,
  - **Kość dziesiątek (tylko d100)** — każda dodatkowa kość to tylko nowa cyfra dziesiątek,
    jedności zostają. Działa, gdy formuła pola to samo `d100`.
- **Maks. kości przewagi** i **Maks. kości utrudnienia** — od 0 do 5. Zero wyłącza daną stronę,
  np. 0 i 2 dają tylko utrudnienie.
- Pola z **Surowym wynikiem** i pule kości rzucają bez dodatkowych kości.

W logu przy wyniku pojawia się np. „+2 kości przewagi”.

## Poziomy sukcesu

Karta **Poziomy sukcesu** w zakładce Ogólne decyduje, jak log ocenia rzut. Dotyczy każdego
rzutu tradycyjnego z progiem (**Wynik ≤ atrybut** albo **Wynik ≥ atrybut**), także trafienia
bronią. Nie dotyczy **Surowego wyniku** ani puli kości. Liczy się zawsze próg **po** modyfikatorze.

| Tryb | Co pokazuje log |
|---|---|
| **Wyłączone** | Tylko sukces albo porażkę |
| **Poziomy co krok** | Wynik z liczbą poziomów sukcesu (PS), np. „Sukces! · +1 PS” |
| **Progi** | Nazwę osiągniętego progu w jego kolorze, np. „Trudny sukces” |

### Poziomy co krok

Ustawiasz **Krok** (od 1 do 100, domyślnie 10). Przy kroku 10 poziom to różnica cyfr dziesiątek
progu i rzutu. Porażka liczy w dół. Przykłady dla progu 45 i rzutu pod próg:

| Rzut | Wynik |
|---|---|
| 38 | Sukces · +1 PS |
| 44 | Sukces · +0 PS |
| 47 | Porażka · −0 PS |
| 72 | Porażka · −3 PS |

Przy rzucie nad próg kierunek jest odwrócony. Kreator pokazuje żywy przykład dla wybranego kroku.

### Progi

Próg to ułamek wartości, przy którym rzut osiąga dany poziom. Przy pierwszym wejściu
w ten tryb dostajesz gotowy zestaw, który możesz zmienić:

| Ułamek | Nazwa | Przykład dla progu 60 |
|---|---|---|
| 1/5 | Ekstremalny sukces | rzut 12 lub mniej |
| 1/2 | Trudny sukces | rzut 30 lub mniej |
| 1/1 | Sukces | rzut 60 lub mniej |
| — | Porażka | rzut powyżej 60 |

- **Dodaj próg** dodaje kolejny ułamek, a **Usuń próg** go usuwa. Ułamki mogą mieć wartość od 1/2
  do 1/100 i każdy musi być inny. Błędna wartość podświetla się na czerwono i nie zapisuje się.
- Kolejności nie ustawiasz: najtrudniejszy próg (najmniejszy ułamek) jest sprawdzany pierwszy.
- Wiersze **Sukces** i **Porażka** są zawsze. Możesz zmienić ich nazwę i kolor, ale nie da się
  ich usunąć.
- Każdy wiersz ma własny **Kolor**, którym log barwi wynik.
- Progi działają tylko przy rzucie **pod próg**. Rzut nad próg pokazuje sam sukces albo porażkę.

### Dobrze wiedzieć

- Wyłączenie poziomów zachowuje skonfigurowane progi. Po powrocie do trybu **Progi** wracają.
- Wpisy już zapisane w logu nie zmieniają się po edycji szablonu, bo ocena zapisuje się
  w chwili rzutu.
- W istniejącej grze nowe ustawienia zaczną działać po **Synchronizuj** (patrz niżej).
- Karta jest dostępna tylko dla własnych systemów. Warianty systemów wbudowanych liczą
  rzuty po swojemu.

## Wygląd tokena

W zakładce Ogólne decydujesz, co pokazuje token postaci na mapie: do 8 pozycji na pierścieniu
(stany z poziomami, liczniki), kwadraty i paski (np. zdrowie z pola Postęp). Każdy
element może być domyślnie ukryty przed graczami.

## Udostępnianie

| Rola | Może |
|---|---|
| Przeglądający | Używać szablonu w grach i go klonować |
| Edytor | To samo i edytować |
| Właściciel | To samo, zarządzać dostępem i usunąć szablon |

**Publiczny** szablon może wykorzystać każdy zalogowany użytkownik, ale edytować go mogą tylko
członkowie. Opis i język pomagają innym znaleźć szablon przy tworzeniu gry.

Jeśli w czasie edycji ktoś inny zapisał zmiany albo straciłeś dostęp, kreator przestaje
zapisywać i pyta, co zrobić.

## Po zmianach w szablonie

Gry korzystają z kopii szablonu. Żeby gra dostała nową wersję, mistrz gry klika
**Synchronizuj** na karcie gry na liście gier. Wartości pól usuniętych z szablonu przepadną.
Zmiana nazwy pola jest bezpieczna: pole ma stały identyfikator niezależny od nazwy.
