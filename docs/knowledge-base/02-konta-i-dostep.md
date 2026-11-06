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
statystyki rzutów, prywatność (zgoda na Google Analytics, o ile instalacja ma je włączone). Tu też trafiają preferencje UI, np. `sceneControlScheme`.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Rejestracja, logowanie, profil, ustawienia | `internal/http/AuthHandler.go` |
| Middleware | `internal/http/JWTMiddleware.go`, `GameAccessMiddleware.go` |
| Reguły uprawnień | `internal/service/authz.go`, `internal/service/access.go` |
| Dostęp do systemów | `internal/service/SystemAccessService.go` |
| E-maile | `internal/email/email.go` |
| Front: logowanie, rejestracja, reset | `src/components/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `EmailVerification.jsx` |
| Front: ustawienia | `src/components/settings/` |
| Zgoda na cookies, strony prawne | `src/components/consent/`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Licenses.jsx` |
| Panel admina | `warhammer-battle-helper-admin/src/` (users, games, stats, systems) |

## Pułapki

- Nowa trasa pod `/games/:id` musi być w grupie z `GameParticipantMiddleware`. Bez tego gracz
  wyrzucony z gry zachowuje dostęp przez sam JWT.
- Sprawdzanie MG zawsze przez `requireGM`, a nie przez porównanie w handlerze, żeby komunikaty
  błędów były spójne.
- Starsze gry mogą nie mieć MG w `Participants`, dlatego `CanAccessGame` sprawdza go osobno.
- Usunięcie konta musi wyczyścić je też z list dostępu do systemów (`RemoveUser`).
