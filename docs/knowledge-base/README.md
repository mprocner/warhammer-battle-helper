# Baza wiedzy — Warhammer Battle Helper

Wewnętrzna dokumentacja dla developerów: jak działa aplikacja, gdzie leży kod każdej funkcji
i na co uważać. Wersja dla użytkowników powstaje z tej bazy i leży w `docs/user-guide/`.

**Źródłem prawdy jest kod.** Te pliki opisują go, gdy zostały napisane (październik 2026).
Pliki w `features/` to historyczne specyfikacje z pracy nad funkcjami i mogą być nieaktualne.
`docs/architecture.md` jest częściowo nieaktualny, a różnice opisuje
[01-architektura.md](01-architektura.md).

## Spis treści

| Plik | Obszar |
|---|---|
| [00-inwentaryzacja.md](00-inwentaryzacja.md) | Lista wszystkich funkcji z podziałem na role |
| [01-architektura.md](01-architektura.md) | Przepływ requestu, WebSocket, filtrowanie widoczności, storage |
| [02-konta-i-dostep.md](02-konta-i-dostep.md) | Rejestracja, JWT, uprawnienia MG / gracz / admin, dostęp do systemów |
| [03-gry-i-uczestnicy.md](03-gry-i-uczestnicy.md) | Lobby, tworzenie gry, zaproszenia, ustawienia uczestnika, online |
| [04-postacie-i-systemy.md](04-postacie-i-systemy.md) | Plugin systemów gry, postacie, widoczność kart, rzuty z karty |
| [05-kreator-szablonow.md](05-kreator-szablonow.md) | Własny system: szablon, pola, formuły, modyfikatory, wygląd tokena, udostępnianie |
| [06-scena.md](06-scena.md) | Sceny, warstwy, tryby, tokeny, mgła, rysowanie, miarka, sterowanie |
| [07-czat-i-rzuty.md](07-czat-i-rzuty.md) | Czat, komendy, wyrażenia kości, widoczność rzutów, statystyki |
| [08-materialy-gry.md](08-materialy-gry.md) | Handouty, pliki, muzyka, notatki |
| [09-minigry.md](09-minigry.md) | Yahtzee i kościany poker |
| [10-samouczki-i-i18n.md](10-samouczki-i-i18n.md) | Interaktywne samouczki, tłumaczenia |
| [11-deploy-i-testy.md](11-deploy-i-testy.md) | Uruchamianie, deploy, testy |

## Jak utrzymywać bazę

1. Zmieniasz zachowanie funkcji? Najpierw popraw plik obszaru tutaj, potem odpowiednie strony
   w `docs/user-guide/pl/` i `docs/user-guide/en/`.
2. Zmiana czysto techniczna (refaktor, nowy test, poprawka wydajności) dotyka tylko tej bazy,
   i to tylko wtedy, gdy zmienia opisany mechanizm albo pułapkę.
3. Nowa funkcja to nowy wiersz w `00-inwentaryzacja.md` i sekcja w pliku obszaru.

Każdy plik obszaru ma ten sam układ: **Jak to działa**, **Kluczowe pliki**, **Pułapki**.
