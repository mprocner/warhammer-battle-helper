# Inwentaryzacja funkcji

Źródło: kod z 2026-10-26, uzupełnione 2026-11-06 o zmiany z `main` (routing `main.go`, `tabDefinitions.jsx`, `sceneModes.js`,
`FIELD_TYPES` w `TemplateBuilder.jsx`, `chat/commands/commandRegistry`, tłumaczenia `en`).
Pliki w `features/` traktuję tylko jako podpowiedź. Kolumna „Spec” mówi, czy istnieje tam
jakikolwiek opis; jego aktualność sprawdzam dopiero przy pisaniu danego obszaru.

Role: **MG** = mistrz gry (twórca gry), **G** = gracz, **A** = admin, **K** = każdy zalogowany.

## 1. Konto i ustawienia
| Funkcja | Kto | Spec |
|---|---|---|
| Rejestracja, weryfikacja e-mail, logowanie | K | — |
| Przypomnienie i zmiana hasła | K | `PasswordReminder.md`, `PasswordChange.md` |
| Profil, nazwa użytkownika, avatar (z kadrowaniem) | K | `FEATURE-55 - username.md` |
| Ustawienia: konto, statystyki rzutów, gra (kości 3D, zawsze motyw Pergamin), prywatność | K | `Options.md` |
| Statystyki rzutów i czasu online | K | — |
| Baner zgody (cookies), polityka prywatności, regulamin, licencje | K | — |
| Kontakt (`/contact`): błąd/opinia, zgłoszenie treści (§ 4 regulaminu), inne — mail przez SMTP | wszyscy | — |
| Język interfejsu pl / en | K | — |

## 2. Lobby i gry
| Funkcja | Kto | Spec |
|---|---|---|
| Strona startowa (`/`) | wszyscy | — |
| Podgląd linku (Open Graph / Twitter Card), meta tagi, manifest | wszyscy | — |
| Tytuły stron w karcie przeglądarki (w grze: nazwa gry) | wszyscy | — |
| Lista gier (`/games`), tworzenie gry z wyborem systemu (filtr języka) | K | `MultiGamesSystem.md` |
| Filtr ról (Prowadzę / Gram) i wyszukiwarka na liście gier | K | PLAYRPG-298, PLAYRPG-299 |
| Zapraszanie, opuszczanie gry, wyrzucanie graczy | MG / G | `FEATURE-76 - players management.md` |
| Link z zaproszeniem do gry (`/join/<token>`): utwórz, kopiuj, nowy, usuń; wejście z logowaniem / rejestracją | MG / K | PLAYRPG-303 |
| Ustawienia uczestnika w grze: avatar i podpis (z konta, z postaci, własny), rozmiar dymka | G | — |
| Kolor uczestnika w grze: domyślny z palety, picker w ustawieniach; ramka dymka, miarki, pingi, rysowanie, log i toast | K | PLAYRPG-340 |
| Obrazek gry, info o grze, status połączenia (zakładka Ogólne) | MG / G | — |
| Lista graczy online | K | `FEATURE-53 - UsersOnline.md` |

## 3. Systemy gry
| System | Klucz | Spec |
|---|---|---|
| Warhammer Fantasy Roleplay 4e | `warhammer4e` | `Weapons.md`, `MULTI_SYSTEM_*.md` |
| Call of Cthulhu 7e | `coc7e` | `MULTI_SYSTEM_*.md` |
| Call of Cthulhu: Dark Ages | `coc7e_dark_ages` | — |
| SRD 5.2 (D&D 5e) | `srd5` | — |
| Własny system (z szablonu kreatora) | `custom` | — |

## 4. Postacie
| Funkcja | Kto | Spec |
|---|---|---|
| Karta postaci per system, okno popup i osobna karta w zakładce (`/character-sheet`) | MG / G | — |
| Tworzenie, edycja, klonowanie, usuwanie postaci | MG / G | — |
| Widoczność postaci dla graczy | MG | — |
| Stany / warunki (np. krwawienie, ogłuszenie), oznaczenie „zabity” | MG / G | `FEATURE-102 - token conditions.md` |
| Rzuty z karty: cecha, umiejętność, broń, z modyfikatorami | MG / G | `Weapons.md` |
| Ulubione umiejętności i bronie, panel szczegółów postaci | MG / G | — |

## 5. Kreator szablonów (własny system)
| Funkcja | Kto | Spec |
|---|---|---|
| Budowanie karty z sekcji i pól (18 typów: sekcja, imię, avatar, obrazek, atrybut, tabela atrybutów, liczba, pole wyliczane z formułą, pasek postępu, tekst krótki/długi, checkbox, lista wyboru, tabela umiejętności, tabela broni, tabela danych, drzewo umiejętności, etykieta) | K | `CREATOR-10 weapons table.md`, `creator-mockups/` |
| Kości pod czatem; modyfikator rzutu: liczba (cel, zakres, szybki wybór) albo kości przewagi i utrudnienia | K | `docs/superpowers/specs/2026-09-08-FEATURE-164-*`, `PLAYRPG-294.md` |
| Poziomy sukcesu: co krok (PS) albo nazwane progi z kolorami | K | `docs/superpowers/specs/PLAYRPG-289.md` |
| Predefiniowane bronie i wiersze, dodawane przy tworzeniu postaci; obrażenia z kośćmi wpisywane przez gracza | K | `docs/superpowers/specs/PLAYRPG-288.md` |
| Podgląd karty szablonu (Moje szablony, wybór systemu) | K | — |
| Wygląd tokena (sloty, paski) | K | — |
| Opis, widoczność, udostępnianie członkom, klonowanie szablonu | K | — |
| Synchronizacja szablonu z grą | MG | — |

## 6. Scena (mapa)
| Funkcja | Kto | Spec |
|---|---|---|
| Wiele scen, przypisywanie aktywnej sceny | MG | `Scenes.md` |
| Siatka, rozmiar komórki, jednostki odległości, przyciąganie do siatki | MG | — |
| Tryby: zaznaczanie, miarka, mgła wojny (tylko MG), rysowanie | MG / G | — |
| Tokeny postaci i obrazków: przesuwanie, zaznaczanie ramką, obrót, skalowanie, duplikowanie | MG / G | `SCENE - unifikacja renderowania tokenow….md` |
| Nakładki na tokenach: HP, sloty, paski, widoczność | MG | `FEATURE-102 - token conditions.md` |
| Ping wskaźnikiem, przesuwanie mapy prawym przyciskiem, schemat sterowania | MG / G | — |
| Kolejka tur (tracker inicjatywy) per scena: wpisy z tokenów i ręczne, ukrywanie, rundy, „Zakończ turę” gracza | MG / G | `docs/superpowers/specs/2026-11-09-PLAYRPG-1-initiative-tracker-design.md` |

## 7. Panel boczny (zakładki)
| Zakładka | Kto | Spec |
|---|---|---|
| Czat i log rzutów (komendy `/roll` `/r`, `/gmroll` `/gmr`, `/help`) | MG / G | `FEATURE-75 - GM roll.md` |
| Kości 3D na scenie z dźwiękiem, w kolorze rzucającego; wyłącznik w zakładce Ogólne i na `/settings` | K | PLAYRPG-339 / 343 |
| Motyw gry (Pergamin / Sci-fi / Lata 20. / Dark fantasy): wybór MG w zakładce Ogólne → Wygląd; opt-out gracza w Ogólne i na `/settings` | MG / K | PLAYRPG-270 (346–350) |
| Sceny | MG | `Scenes.md` |
| Handouty (foldery, kolejność, udostępnianie) | MG / G | `Handouts.md` |
| Pliki (biblioteka obrazków, foldery, użycie pliku) | MG | `Files.md` |
| Muzyka (biblioteka, playlisty, odtwarzanie dla wszystkich, pętla, głośność) | MG | `Music.md` |
| Notatki | MG / G | `Notes.md` |
| Gracze | MG | `FEATURE-76 - players management.md` |
| Minigry: Yahtzee, kościany poker | MG | `minigame-archetypes.md` |
| Ogólne | MG / G | `Options.md` |

## 8. Pomoc w aplikacji
| Funkcja | Kto | Spec |
|---|---|---|
| Interaktywne samouczki: ekran gry, czat, sceny, handouty, pliki, muzyka, notatki, gracze, minigry, kreator | K | — |
| Strona pomocy `/help` (przewodnik pl/en, publiczna) i linki „Więcej w pomocy” z dymków samouczka | każdy, także bez konta | — |
| Stopka serwisu (regulamin, prywatność, licencje, kontakt, co nowego, pomoc) na każdej stronie poza grą; w grze przewodnik i co nowego przy `?` panelu, wszystkie linki w zakładce Ogólne | każdy, także bez konta | — |

## 9. Panel administratora (osobna aplikacja)
| Funkcja | Kto | Spec |
|---|---|---|
| Użytkownicy, gry, statystyki miejsca na dysku i sesji, włączanie systemów gry | A | — |

## 10. Techniczne (tylko wersja dla devów)
Multiplayer przez WebSocket (`hub.BroadcastToGame` → klient robi `fetchGameState()`), plugin
systemów gry (backend i frontend), przechowywanie plików (S3 / Wasabi), deploy (Docker, nginx,
autopull), testy.

## Ustalenia (2026-10-27)
1. Lista jest kompletna. Jeśli czegoś zabraknie, dopiszemy.
2. Panel admina nie trafia do wersji dla użytkowników.
3. Przewodnik użytkownika nie opisuje systemów gry. Systemy będą głównie tworzone przez
   użytkowników, więc przewodnik skupia się na kreatorze szablonów.
