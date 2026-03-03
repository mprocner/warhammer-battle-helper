Chcę dodać obsługę wielu gier w systemie. Każda gra będzie miała swoje unikalne zasady. 
Na początek chcę obsłużyć Call of Cthulhu. 
W porównaniu do obecnej gry, Call of Cthulhu będzie miało:
- inną kartę postaci z innymi atrybutami, skillami. 
- karta postaci do każdego systemu będzie unikalna
- inna będzie też logika dotycząca testów umiejętności, rzutów, liczenia sukcesów, obrażeń itp.
- inne będzie też wizualne wyświetlanie wyników na zakładce czatu

Zakladki sceny, handoutów, muzyki, plików i toolbary będą wspólne dla wszystkich gier

Aby to osiągnąć, planuję:
1. Wprowadzić pojęcie "systemu gry" w bazie danych, który będzie definiował unikalne atrybuty, umiejętności i logikę dla każdej gry.
2. Dostosować model postaci, aby mógł obsługiwać