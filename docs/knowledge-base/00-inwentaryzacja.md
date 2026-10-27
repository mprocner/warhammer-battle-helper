# Inwentaryzacja funkcji

Źródło: kod na gałęzi z 2026-10-26 (routing `main.go`, `tabDefinitions.jsx`, `sceneModes.js`,
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
| Ustawienia: konto, statystyki rzutów, prywatność | K | `Options.md` |
| Statystyki rzutów i czasu online | K | — |
| Baner zgody (cookies), polityka prywatności, regulamin, licencje | K | — |
| Język interfejsu pl / en | K | — |

## 2. Lobby i gry
| Funkcja | Kto | Spec |
|---|---|---|
| Lista gier, tworzenie gry z wyborem systemu (filtr języka) | K | `MultiGamesSystem.md` |
| Zapraszanie, opuszczanie gry, wyrzucanie graczy | MG / G | `FEATURE-76 - players management.md` |
| Ustawienia uczestnika w grze: avatar i podpis (z konta, z postaci, własny), rozmiar dymka | G | — |
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
| Konfiguracja kości i modyfikatorów rzutów, presety | K | — |
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

## 7. Panel boczny (zakładki)
| Zakładka | Kto | Spec |
|---|---|---|
| Czat i log rzutów (komendy `/roll` `/r`, `/gmroll` `/gmr`, `/help`) | MG / G | `FEATURE-75 - GM roll.md` |
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
