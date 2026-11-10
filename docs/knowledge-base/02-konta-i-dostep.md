# Konta i dostęp

## Jak to działa

**Rejestracja → aktywacja e-mailem.** `Register` tworzy nieaktywne konto z tokenem aktywacji
i wersją regulaminu (stemplowaną przez serwer, nie przez klienta). Link prowadzi do
`/verify-email`. Reset hasła: `/forgot-password` wysyła link ważny **1 godzinę**,
`/reset-password` ustawia nowe hasło.

**JWT** zawiera `user_id`, `email`, `is_admin` i wygasa po **24 godzinach**. Middleware:
- `JWTAuthMiddleware` — wymaga tokenu,
- `JWTOptionalMiddleware` — parsuje, jeśli jest,
- `AdminAuthMiddleware` — wymaga `is_admin: true` (trasy `/admin/*`),
- `GameParticipantMiddleware` — dla `/games/:id/*` wpuszcza tylko MG i aktualnych uczestników.

**Role w grze.** MG to `Game.GameMasterID`. Gracze to `Participants` z rolą `player`.
Reguły:
- `requireGM` — operacje tylko dla MG (sceny, mgła, muzyka, przypisywanie graczy…),
- `requireGMOrCharacterOwner` — MG albo gracz, który ma postać,
- `CanEditCharacter` — **nie** opiera się na `CreatedBy`, bo to pole przetrwałoby odejście gracza.

**Dostęp do systemów gry** (`SystemAccessService`). Admin decyduje, kto może **tworzyć** gry
w danym systemie wbudowanym: wszyscy albo lista użytkowników. Brak konfiguracji oznacza, że
nikt nie ma dostępu, więc nowy system jest ukryty, dopóki admin go nie otworzy. `custom` nie
podlega tej kontroli. Istniejące gry zostają dostępne niezależnie od zmian.
Front pyta o listę przez `GET /features` → `allowedSystems`.

**Ustawienia użytkownika** (`/settings`): konto (nazwa, avatar, podpis), zmiana hasła,
statystyki rzutów, gra (przełącznik kości 3D), prywatność (zgoda na Google Analytics, o ile instalacja ma je włączone). Tu też trafiają preferencje UI, np. `sceneControlScheme`.

Preferencje UI siedzą w `User.Settings` i zapisuje je `PATCH /settings` częściowym `$set`
(pola wskaźnikowe w `UpdateSettingsRequest`). `diceAnimation` (PLAYRPG-343) jest `*bool` także
w `UserSettings`: `nil` znaczy „nigdy nie wybrano” i wtedy front sam decyduje (włączone, chyba
że system prosi o ograniczenie ruchu). Ten sam klucz zmienia przełącznik w zakładce Ogólne w grze
i sekcja **Gra** na `/settings` (`useDiceAnimationSetting`).

**Kontakt i zgłoszenia** (`/contact`, PLAYRPG-306). Publiczna strona z jednym formularzem
i wyborem typu: błąd/opinia, zgłoszenie treści, inne. Zgłoszenie treści ma pola wymagane przez
§ 4 regulaminu: wskazanie treści, uzasadnienie, imię i nazwisko/nazwa, e-mail i oświadczenie
o dobrej wierze. Imię i e-mail stają się nieobowiązkowe po zaznaczeniu „dotyczy wykorzystywania
seksualnego dzieci”. Front wysyła `POST /contact` (nginx: `/api/contact`). Backend niczego nie
zapisuje w Mongo: składa maila tekstowego i wysyła go przez SMTP na `CONTACT_EMAIL` (domyślnie
`contact@playrpg.net`), z `Reply-To` ustawionym na adres zgłaszającego. Obsługa zgłoszeń dzieje
się w tej skrzynce, panelu admina nie ma. Zalogowanemu front podstawia e-mail z konta, a backend
dopisuje do maila `user_id` i e-mail konta **z JWT** (`JWTOptionalMiddleware`), nie z formularza.

Ochrona endpointu:
- limit **5 wiadomości na IP na 10 minut** (`IPRateLimiter`, okno przesuwne w pamięci procesu;
  restart backendu go zeruje). Przekroczenie daje 429 z `Retry-After`,
- honeypot: ukryte pole `website`. Wypełnione oznacza bota, więc serwer zwraca 200 i nic nie wysyła,
- walidacja i limity długości po stronie serwera (`ContactRequest.validate`, te same reguły
  w `isContactFormValid` na froncie), body ucięte do 64 KB,
- `Reply-To` musi być pojedynczym adresem bez CR/LF, a z tematu CR/LF są wycinane. Temat jest
  kodowany RFC 2047, treść idzie jako quoted-printable.

Brak SMTP daje 503, a błąd wysyłki 502. Formularz pokazuje wtedy zapasowy adres z `legalInfo.js`.

**IP klienta za nginx.** Gin domyślnie ufa `X-Forwarded-For` od każdego, więc `c.ClientIP()`
zwracałby to, co wpisze klient. `ConfigureClientIP` w `main.go` ustawia zaufane proxy
(`TRUSTED_PROXIES`, domyślnie loopback i sieci prywatne) oraz kolejność nagłówków: najpierw
`X-Real-IP`, bo nginx nadpisuje go `$remote_addr`, dopiero potem `X-Forwarded-For`. Nginx na
hoście łączy się z kontenerem przez mapowanie portu Dockera, więc backend widzi go jako bramę
sieci Dockera (172.16.0.0/12). Ruch na opublikowany port 8080 prosto z internetu ma publiczny
adres źródłowy, nie jest zaufany i nie może podmienić IP nagłówkiem.

**Strony prawne.** Regulamin (`/terms`) i polityka prywatności (`/privacy`) mają ten sam
kształt danych: `terms.sections` / `privacy.sections` w `translation.json`, tablica
`{ title, paragraphs[] }`, numeracja generowana w komponencie. Tożsamość usługodawcy
(`PROVIDER_NAME`, `CONTACT_EMAIL`) i daty (`TERMS_EFFECTIVE_DATE`, `PRIVACY_EFFECTIVE_DATE`)
leżą w `src/legal/legalInfo.js`, nie w tłumaczeniach, żeby obie wersje językowe pokazywały
to samo. Polityka opisuje dane na serwerze (konto, profil, pliki, gry, szablony, statystyki
rzutów i czasu online, dostęp do systemów), localStorage, logi, korespondencję, GA4, podstawy
prawne, odbiorców (OVH, Google), retencję i prawa z RODO. Prawa (usunięcie konta, eksport)
realizujemy ręcznie po e-mailu na `contact@` — w aplikacji nie ma samoobsługi. Na dole
`/privacy` jest `PrivacySettings`, żeby zgodę dało się wycofać bez logowania.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Rejestracja, logowanie, profil, ustawienia | `internal/http/AuthHandler.go` |
| Middleware | `internal/http/JWTMiddleware.go`, `GameAccessMiddleware.go` |
| Reguły uprawnień | `internal/service/authz.go`, `internal/service/access.go` |
| Dostęp do systemów | `internal/service/SystemAccessService.go` |
| E-maile | `internal/email/email.go`, `internal/email/contact.go` (mail z formularza) |
| Formularz kontaktowy, limit per IP | `internal/http/ContactHandler.go`, `internal/http/RateLimitMiddleware.go` |
| Front: kontakt | `src/components/Contact.jsx` |
| Front: logowanie, rejestracja, reset | `src/components/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `EmailVerification.jsx` |
| Front: ustawienia | `src/components/settings/` |
| Zgoda na cookies, strony prawne | `src/components/consent/`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Licenses.jsx` — mechanizm zgody i GA: [12-prywatnosc-i-seo.md](12-prywatnosc-i-seo.md) |
| Panel admina | `warhammer-battle-helper-admin/src/` (users, games, stats, systems) |

## Pułapki

- Nowa trasa pod `/games/:id` musi być w grupie z `GameParticipantMiddleware`. Bez tego gracz
  wyrzucony z gry zachowuje dostęp przez sam JWT.
- Sprawdzanie MG zawsze przez `requireGM`, a nie przez porównanie w handlerze, żeby komunikaty
  błędów były spójne.
- Starsze gry mogą nie mieć MG w `Participants`, dlatego `CanAccessGame` sprawdza go osobno.
- Usunięcie konta musi wyczyścić je też z list dostępu do systemów (`RemoveUser`).
- `c.ClientIP()` ma sens tylko dzięki `ConfigureClientIP`. Nowy reverse proxy przed backendem
  (inna sieć Dockera, CDN) wymaga dopisania jego adresu do `TRUSTED_PROXIES`, inaczej wszyscy
  klienci dzielą jeden limit IP proxy.
- Limit formularza żyje w pamięci jednego procesu. Przy kilku instancjach backendu każda liczy
  osobno.
- Zgłoszenie treści nie przyjmuje załączników. Zrzut ekranu zgłaszający dosyła mailem, a
  podpowiedź pod polem „Gdzie jest ta treść?” mówi mu, jak to zrobić.
- **Polityka prywatności obiecuje, że jest kompletna.** Nowe pole z danymi użytkownika
  w modelu, nowa kolekcja, nowy podmiot zewnętrzny (np. CDN, usługa e-mail) albo nowy klucz
  w localStorage = aktualizacja `privacy.sections` w en **i** pl oraz `PRIVACY_EFFECTIVE_DATE`.
  `PrivacyPolicy.test.jsx` pilnuje tylko równej liczby akapitów w obu językach, nie treści.
- **Usunięcie konta w panelu admina (`AdminRepository.DeleteUser`) kasuje tylko dokument
  użytkownika** — nie postacie, gry, pliki na dysku, `roll_stats` ani `online_sessions`.
  Polityka i regulamin obiecują usunięcie powiązanych danych, więc przy żądaniu usunięcia
  resztę trzeba dziś posprzątać ręcznie.
- Gra usunięta przez MG to soft delete (`deletedAt`); trwale znika dopiero przez panel admina.
  Polityka mówi o tym wprost — zmiana mechanizmu to zmiana jej tekstu.
- `TermsVersion` (Go) i `TERMS_EFFECTIVE_DATE` (JS) zmieniają się razem; nowa wersja
  regulaminu bez zmiany stałej Go stempluje nowym kontom starą wersję.
