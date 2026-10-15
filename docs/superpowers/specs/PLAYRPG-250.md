# PLAYRPG-250 — Regulamin serwisu (PL + EN)

## Cel

PlayRPG nie ma regulaminu. Polskie prawo (UŚUDE art. 8) wymaga, by usługodawca udostępnił
regulamin nieodpłatnie **przed** zawarciem umowy, a serwis hostujący treści użytkowników podlega
DSA (zgłoszenia, uzasadnienia, punkt kontaktowy). Ticket dostarcza:

1. treść regulaminu po polsku i angielsku, opartą na analizie konkurencji (Roll20, Foundry VTT),
2. publiczną stronę `/terms`,
3. obowiązkową akceptację regulaminu przy rejestracji, zapisaną w bazie.

Projekt nie jest poradą prawną — przed publikacją warto, by tekst przejrzał prawnik.

## Analiza konkurencji

| Serwis | Co bierzemy | Czego nie bierzemy |
|---|---|---|
| Roll20 | Próg wieku jako deklaracja (USA 13, UE 16, bez weryfikacji); użytkownik odpowiada za treści; procedura zgłoszeń naruszeń praw autorskich | Szeroka licencja na treści użytkownika; arbitraż i prawo USA (nieważne wobec konsumenta z UE); sekcje płatności, subskrypcji, Marketplace |
| Foundry VTT | Jeden ogólny adres kontaktowy, ten sam dla zgłoszeń treści | Prawo stanu Waszyngton |

Pełny tekst regulaminu Roll20 był niedostępny (strona pomocy zwraca 403) — wnioski o Roll20
oparte na ich stronie pomocy i wynikach wyszukiwania, nie na pełnym dokumencie.

## Decyzje

| Temat | Decyzja |
|---|---|
| Usługodawca | Osoba prywatna: „Mateusz Procner, e-mail: contact@playrpg.net”. Bez adresu — świadomie, ryzyko (UŚUDE art. 5 ust. 2) zaakceptowane przez właściciela. Nie przez JDG: PKD JDG to tworzenie oprogramowania, nie prowadzenie portalu. Wraca przy wprowadzaniu donacji (JDG + PKD + księgowy). |
| Odpłatność | Usługa bezpłatna. Donacje (przyszłe) dobrowolne, nie są zapłatą, nie dają dodatkowych praw → brak sekcji o odstąpieniu od umowy i cenniku. |
| Wiek | 16+ (próg zgody RODO w PL), wyłącznie deklaracja, bez pola daty urodzenia. |
| Akceptacja | Jeden obowiązkowy checkbox: akceptacja regulaminu + oświadczenie o 16 latach. Backend odrzuca rejestrację bez akceptacji. |
| Stare konta | Pominięte — bez modala, bez banera. Mechanizm ponownej akceptacji powstanie przy pierwszej zmianie regulaminu. |
| Moderacja | Notice-and-takedown (DSA art. 6), bez wstępnej moderacji. |
| Kanał zgłoszeń | E-mail `contact@playrpg.net`, bez przycisku „Zgłoś” w aplikacji. Ten sam adres w PL i EN; komunikacja po polsku i angielsku (DSA art. 11–12). |
| Język wiążący | Wersja polska rozstrzyga rozbieżności. Minimum odwołań numerycznych w tekście („zgodnie z §4 ust. 6”) — numeracja generowana z kodu. |
| Znaki osób trzecich | Ogólny disclaimer bez nazw systemów. Wbudowane systemy WFRP/CoC pozostają dostępne tylko dla właściciela przez `system_access` (PLAYRPG-243). Nie wymieniamy wydawcy SRD — licencja SRD zabrania wzmianek poza notą na `/licenses`. |
| Format treści | i18n JSON: `terms.sections` jako tablica `{ title, paragraphs[] }`, czytana przez `returnObjects: true`. |
| Blokady wdrożenia | Brak — ani w `deploy.sh`, ani w testach. |

## Treść regulaminu — szkielet

1. **Postanowienia ogólne** — usługodawca `{{name}}`, `{{email}}`; definicje (Serwis, Konto, Gra,
   Mistrz Gry, Gracz, Treści); wymagania techniczne (aktualna przeglądarka z JavaScript i
   WebSocket, dostęp do internetu, aktywny e-mail); data obowiązywania.
2. **Konto** — 16+ (deklaracja); rejestracja e-mailem i hasłem, aktywacja linkiem; obowiązek
   ochrony hasła; usunięcie konta na prośbę wysłaną na `{{email}}` (brak samoobsługi w aplikacji).
3. **Usługa bezpłatna** — bez opłat; donacje dobrowolne, bez dodatkowych praw; usługa „tak jak
   jest”, bez gwarancji dostępności i kopii danych — zalecenie trzymania własnych kopii; wyłączenie
   odpowiedzialności nie obejmuje szkody wyrządzonej umyślnie.
4. **Treści użytkowników**
   - treści należą do użytkownika;
   - licencja dla usługodawcy: niewyłączna, nieodpłatna, wyłącznie do świadczenia usługi
     (przechowywanie, wyświetlanie uczestnikom gry, kopie zapasowe); wygasa z usunięciem treści
     lub konta (kopie zapasowe — do ich rotacji);
   - użytkownik oświadcza, że ma prawa do treści lub korzysta z nich legalnie;
   - za treść odpowiada wyłącznie użytkownik, który ją udostępnił; zwalnia usługodawcę z
     roszczeń osób trzecich w granicach prawa;
   - treści zakazane: naruszające prawa autorskie i inne prawa osób trzecich, nielegalne,
     wykorzystujące seksualnie małoletnich, nawołujące do nienawiści, złośliwe oprogramowanie,
     dane osobowe osób trzecich bez podstawy prawnej; fikcja RPG (przemoc, horror) dozwolona;
   - zgłoszenia (DSA art. 16): każdy, także bez konta, na `{{email}}`; zgłoszenie zawiera
     wskazanie treści, uzasadnienie, dane zgłaszającego i oświadczenie o dobrej wierze;
   - po zgłoszeniu usługodawca niezwłocznie blokuje dostęp do treści, potem ją ocenia;
   - uzasadnienie (DSA art. 17): użytkownik dostaje informację, co zablokowano, dlaczego i jak
     się odwołać; po usunięciu naruszenia dostęp może zostać przywrócony.
5. **Własność intelektualna** — kod, wygląd i oznaczenia Serwisu należą do usługodawcy; zakaz
   kopiowania Serwisu i automatycznego pobierania danych; nazwy i znaki gier osób trzecich
   należą do właścicieli, Serwis nie jest z nimi powiązany; materiały na licencjach otwartych
   (np. SRD) — na warunkach ze strony Licencje.
6. **Zasady korzystania** — zakaz nękania, spamu, podszywania się, obchodzenia zabezpieczeń,
   przeciążania Serwisu.
7. **Reklamacje** — na `{{email}}`; opis problemu i dane kontaktowe; odpowiedź w ciągu 14 dni.
8. **Blokada i usunięcie konta** — użytkownik: w każdej chwili, na prośbę; usługodawca: przy
   rażącym lub powtarzającym się naruszeniu, z uzasadnieniem i możliwością odwołania.
9. **Zmiany regulaminu** — informacja z 14-dniowym wyprzedzeniem; brak zgody = możliwość
   usunięcia konta.
10. **Postanowienia końcowe** — prawo polskie, bez pozbawiania konsumenta ochrony z kraju
    zamieszkania (Rzym I art. 6); sąd właściwy według przepisów ogólnych; wersja polska wiążąca.

Platformy ODR nie linkujemy — UE wyłączyła ją w lipcu 2025.

## Backend

- `RegisterRequest` (`AuthHandler.go`): `AcceptedTerms bool json:"acceptedTerms" binding:"required"`.
  `required` na `bool` odrzuca zarówno brak pola, jak i `false` — tu zamierzone.
- `User` (`models/User.go`): `TermsAcceptedAt *time.Time` (`bson:"termsAcceptedAt,omitempty"`,
  `json:"-"`) i `TermsVersion string` (`bson:"termsVersion,omitempty"`, `json:"-"`). Wskaźnik:
  `nil` = brak akceptacji (stare konta), nie zerowa data.
- Stała `TermsVersion = "2026-10-15"` po stronie Go; serwer stempluje wersję i czas, klient
  wysyła tylko `true`. Komentarz wskazuje na `TERMS_EFFECTIVE_DATE` we froncie.
- Testy handlera: brak pola → 400, `false` → 400, `true` → zapisane oba pola.

## Frontend

- `src/legal/legalInfo.js`: `PROVIDER_NAME`, `CONTACT_EMAIL`, `TERMS_EFFECTIVE_DATE` (komentarz
  wskazuje na stałą Go). Wartości interpolowane do tłumaczeń (`{{name}}`, `{{email}}`, `{{date}}`).
- `TermsOfService.jsx`, trasa `/terms` (publiczna, układ jak `PrivacyPolicy.jsx`): nagłówek
  „§ n. Tytuł”, akapity jako `<ol>`, na górze data obowiązywania.
- `Register.jsx`: `Checkbox` + `FormControlLabel`; przycisk wyłączony bez zaznaczenia; payload
  `acceptedTerms: true`; reset checkboxa po sukcesie. Etykieta przez `<Trans>` z komponentem
  linku (`<link>…</link>`), link otwiera `/terms` w nowej karcie. Pierwsze użycie `<Trans>` w
  projekcie — całe zdanie w jednym kluczu, bo szyk różni się między językami.
- `Navigation.jsx`: trzecia ikona obok Policy i Gavel — `DescriptionIcon`, `t('navigation.terms')`.
- `/privacy`: `contactBody` przez `{{email}}` (zamiast `noreply@playrpg.net`) + zdanie o
  administratorze danych `{{name}}` (RODO art. 13).
- Klucze i18n w `en/` i `pl/` równolegle.

## Testy frontendu

- `TermsOfService.test.jsx`: sekcje się renderują; e-mail i nazwa wstawione; brak surowych `{{`
  ani kluczy; **parzystość PL/EN** — ta sama liczba sekcji i akapitów w każdej sekcji
  (`i18n-sync` porównuje klucze, nie struktury tablic).
- `Register.test.jsx`: przycisk wyłączony bez checkboxa; payload zawiera `acceptedTerms: true`.

## Poza zakresem (osobne tickety)

- Skrzynka `contact@playrpg.net` — zakłada właściciel; musi działać przed publikacją.
- Zmiana nazwy publicznego repo `mprocner/warhammer-battle-helper` (znak Games Workshop).
- Przegląd kodu wbudowanych systemów pod kątem tekstu przepisanego z podręczników.
- Narzędzie admina do blokowania udostępniania cudzego systemu (dziś ręcznie w Mongo).
- Samoobsługowe usunięcie konta.
- Mechanizm ponownej akceptacji przy zmianie regulaminu.
