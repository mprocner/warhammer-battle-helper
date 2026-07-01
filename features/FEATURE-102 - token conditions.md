#FEATURE-102: Token Conditions Feature
---
## Opis funkcjonalności

Funkcjonalność ma na celu konfigurację i wyświetlenie dodatkowych informacji przy tokenach na mapie. 

### Konfiguracja
- Konfiguracja odbywa się na pierwszej zakładce kreatora systemów (zakładka ogólne) Przeanalizuj ponizsza konfiguracje, czy efekt bedzie taki jak na mockupie /Users/mateuszprocner/priv/warhammer-battle-helper/docs/mockups/token-editing/approach-6-radial-on-token-sun.html
- Dla systemów, które są hardkodowane w rejestrze (Warhammer4e, CoC7e) dodajemy możliwość konfiguracji.
  - Wyświetlamy przycisk "Konfiguruj" w kilku miejscach: 
    1. Na modalu dodania nowej gry, przed przyciskiem "Utwórz"
    2. W grze w zakładce "Ogólne" w panelu po prawej stronie, w sekcji Informacje o grze.
  - dla systemów hardkodowanych bedziemy musieli dodac dokument w kolekcji system templates i wskazac na system, ktory jest systemem macierzystym.
  - 
- Konfiguracja zarowno dla systemow hardkodowanych jak i dla systemow customowych bedzie taka sama. 
- Mechanizm konfiguracji
  - Widok konfiguracji powinien wyglądać analogicznie jak na mockupie /Users/mateuszprocner/priv/warhammer-battle-helper/docs/mockups/token-editing/approach-6-radial-on-token-sun.html
  - Na środku pokazujemy przykładowy token. 
  - wokół niego 8 slotów w formie słoneczka (dookoła tokena co 45 stopni)
  - po kliknieciu na slot pokazuje sie modal z możliwością konfiguracji slotu:
    1. Wybór typu slotu (select):
        - pusty (domyslnie)
        - ikona (stan)
        - liczba
        - pole z karty postaci (np. STR, INT, HP) - dla systemów hardkodowanych trzeba stworzyć na sztywno listę pól z karty postaci. Przeanalizuj systemy i stwórz osobne listy pól dla każdego (chyba najlepiej w plikach json, albo w kodzie na backendzie w rejestrze)
        - select
    2. W zależności od wybranego typu slotu pokazują się odpowiednie pola konfiguracyjne:
        - dla ikony: lista ikon do wyboru (material UI icons). Po kliknieciu ikona sie podświetla. Można wybrać tylko jedną.
        - dla liczby: input number i input text, w ktorym wpisujemy nazwe pola, ktora ma sie wyswietlac przy tokenie (np. "STR", "INT", "HP")
        - dla pola z karty postaci: select z listą pól z karty postaci typu atrybut i liczba
        - dla select: input text, w którym wpisujemy opcje oddzielone przecinkami (np. "opcja1,opcja2,opcja3")
    3. Przyciski "Zapisz" i "Anuluj"
  - Pasek HP - do paska HP dodajemy możliwość konfiguracji. Możemy tu przypisać pole typu progress z karty postaci. 
  - Pod tokenem wyświetlają się możliwe do dodania "kwadraty", jak na mockupie /Users/mateuszprocner/priv/warhammer-battle-helper/docs/mockups/token-editing/approach-6-radial-on-token-sun.html
    - Nie mamy określonej liczby kwadratów - domyślnie 0
    - po kliknieciu Dodaj (przycisk tez w ksztalcie podobnego kwadratu ktory powstanie pozniej) dodajemy nowy kwadrat. Pojawi sie modal
      1. Wybór typu slotu (select):
        - liczba
        - pole z karty postaci (np. STR, INT, HP) - dla systemów hardkodowanych trzeba stworzyć na sztywno listę pól z karty postaci. Przeanalizuj systemy i stwórz osobne listy pól dla każdego (chyba najlepiej w plikach json, albo w kodzie na backendzie w rejestrze)
        - select
      2. Podpis wyswietlany pod spodem kwadratu (input text)
      3. Przyciski "Zapisz" i "Anuluj"
### Wyświetlanie
- Wyświetlanie slotów przy tokenach na mapie:
  - Token nieaktywny (nie wybrany, nie kliknięty)
    - Sloty (wszystkie 8 pozycji) wyświetlająsię w formie słoneczka NA tokenie tak jak na mockupie /Users/mateuszprocner/priv/warhammer-battle-helper/docs/mockups/token-editing/approach-6-radial-on-token-sun.html po lewej stronie
    - Pasek HP jest przyklejony do tokena i wyświetla pozostałą ilość HP. Pasek HP jest konfigurowalny i może być przypisany do pola z karty postaci typu progress.
  - Token aktywny (kliknięty, wybrany)
    - Po kliknięciu na token, sloty rozchodzą się i powiększają się ikony, liczby itp. (animacja) i są wyświetlane wokół tokena, jak na /Users/mateuszprocner/priv/warhammer-battle-helper/docs/mockups/token-editing/approach-6-radial-on-token-sun.html po lewej stronie
    - pojawiają się również kwadraty pod tokenem, które są konfigurowalne.
    - powiększa się również pasek HP i wyświetla się jego aktualna wartość. Można edytować wartość aktualną na pasku HP przyciskami + i - jak na /Users/mateuszprocner/priv/warhammer-battle-helper/docs/mockups/token-editing/approach-6-radial-on-token-sun.html Przy edycji zmienia się również wartość przypisanego pola
      