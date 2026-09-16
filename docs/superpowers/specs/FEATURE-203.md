# FEATURE-203 — Zgodność pluginu D&D 5e z licencją CC-BY SRD 5.2

**Status:** do zaplanowania
**Dotyczy:** `warhammer-battle-helper-front/src/systems/dnd5e/index.js`, `src/locales/{en,pl}/translation.json`, nowy widok licencji
**Powiązane:** decyzja o systemach wysyłanych jako wbudowane (Chaosium/C7 w toku)

## Kontekst

Plugin `dnd5e` opiera się na System Reference Document 5.2.1 wydanym przez Wizards of the Coast
na licencji **Creative Commons Attribution 4.0 International**. Licencja dopuszcza użycie
komercyjne i jest nieodwołalna, ale stawia dwa warunki, z których aplikacja nie spełnia żadnego.

Audyt zawartości wypadł dobrze: wysyłamy 18 umiejętności z przypisaniem do cech, modyfikatory,
bonus biegłości, rzuty obronne i DC zaklęć — czyli samą mechanikę. Klasa, podklasa, zaklęcia
i cechy specjalne to pola tekstowe wypełniane przez gracza, więc nie dystrybuujemy żadnych
opisów ani tabel spoza SRD. Brakuje wyłącznie warstwy prawnej wokół tego.

## Zakres

**1. Atrybucja CC-BY.** Licencja wymaga podania tytułu dokumentu, autora, odnośnika do licencji
i informacji o wprowadzonych zmianach. WotC drukuje gotową formułę w samym SRD 5.2.1 —
przepisujemy ją **dosłownie**, nie układamy własnej parafrazy.

Aplikacja nie ma dziś miejsca na taką treść: nie istnieje stopka ani ekran „O aplikacji", jedyny
komponent o charakterze prawnym to `ConsentBanner`. Potrzebny jest osobny widok „Licencje",
dostępny z menu głównego, zaprojektowany pod **wiele wpisów** — dojdą do niego BRP na licencji
ORC i ewentualnie Zew Cthulhu, jeśli Chaosium odpowie przychylnie. Jeden wpis na system, treść
przez `t('klucz')` w obu językach.

**2. Nazwa systemu w interfejsie.** `index.js:66` ma `label: 'D&D 5e'`. Licencja CC-BY obejmuje
**treść SRD, nie znaki towarowe** — „Dungeons & Dragons" i „D&D" nimi są. Nazwanie tak własnego
modułu to użycie znaku jako szyldu; deklaracja zgodności broni się znacznie lepiej.

Nowa etykieta: `SRD 5.2`. Wchodzi do listy systemów w lobby i wszędzie, gdzie pokazujemy nazwę
systemu gry.

## Kluczowa pułapka

**Zmieniamy wyłącznie etykietę wyświetlaną, nigdy klucza systemu.** String `dnd5e` siedzi
w `Game.GameSystem` i `Character.GameSystem` w bazie, rozstrzyga go `registry.Get()` po stronie
Go i `getSystem()` po stronie React. Podmiana klucza wywala każdą istniejącą grę na `getSystem()`
z fallbackiem do `warhammer4e`. Klucz zostaje, zmienia się `label` i klucze i18n.

## Kryteria akceptacji

- Widok „Licencje" osiągalny z menu głównego, po polsku i angielsku, z wpisem dla SRD 5.2
  zawierającym formułę atrybucji przepisaną z dokumentu źródłowego wraz z odnośnikiem do licencji
  i informacją o zmianach.
- Struktura widoku przyjmuje kolejne wpisy bez przebudowy.
- Nigdzie w interfejsie nie pada „D&D" ani „Dungeons & Dragons" jako nazwa systemu — ani w lobby,
  ani w liście systemów, ani w karcie postaci.
- Istniejące gry z `gameSystem: "dnd5e"` działają bez zmian; klucz nie został ruszony.
- Komplet tłumaczeń w `en` i `pl`.

## Poza zakresem

Rozszerzanie zawartości pluginu o dane z SRD (zaklęcia, potwory, tabele klas). Osobny temat,
osobne ryzyko — dziś świadomie nie wysyłamy żadnych treści opisowych i ten stan jest
bezpieczniejszy niż konieczność pilnowania granicy SRD przy każdym wpisie.
