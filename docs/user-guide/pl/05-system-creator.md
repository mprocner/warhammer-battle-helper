# Kreator systemów

Kreator pozwala zbudować własny system RPG: kartę postaci, rzuty, wygląd tokenów na mapie.
Gotowy szablon wybierasz przy tworzeniu gry tak samo jak system wbudowany.

Otwierasz go z listy gier kafelkiem **Kreator systemów**. Wszystko zapisuje się
automatycznie, nie ma przycisku „Zapisz”.

## Dwie zakładki

- **Ogólne** — ustawienia całego systemu: nazwa, opis, język, dostęp, kości, modyfikatory,
  wygląd tokena, szerokość karty.
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
| | Tabela broni | Bronie z twoimi kolumnami, rzutem ataku i formułą obrażeń |
| | Tabela danych | Twoje kolumny na wszystko, czego się nie rzuca, np. ekwipunek |
| | Drzewo umiejętności | Umiejętności w hierarchii, np. umiejętność i specjalizacje |

## Formuły

Pole Obliczane i obrażenia broni budujesz z bloków: atrybuty, liczby, stałe, operatory
(`+ − × ÷`), nawiasy i kości. Przykład: obrażenia `d6 + SIŁA + 2` dadzą w logu rozpisanie
`3 + 8 + 2 = 13`. Karta przelicza wartości na bieżąco.

## Rzuty

We właściwościach pola wybierasz, czy można na nie rzucać i jak:
- **tradycyjnie** — wynik porównany z progiem (np. rzut d100 poniżej wartości umiejętności),
- **pula kości** — liczy się kości, które spełniły warunek sukcesu.

Możesz też ustawić poziomy sukcesu.

**Modyfikator rzutu** (zakładka Ogólne): po włączeniu każdy rzut z karty najpierw pyta gracza
o premię lub karę. Możesz dodać gotowe przyciski, np. „−30 Bardzo trudny”.

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
