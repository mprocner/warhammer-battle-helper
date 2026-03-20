# Password reminder feature specification

## Cel funkcjonalności

Użytkownik, który zapomniał hasła, może je zresetować poprzez link wysłany na zarejestrowany adres e-mail. Nowe hasło zastępuje stare w bazie danych.

---

## Istniejąca infrastruktura (do reużycia)

| Komponent | Plik | Co już działa |
|---|---|---|
| `EmailService` | `internal/email/email.go` | SMTP skonfigurowany, `SendActivationEmail` jako wzorzec |
| `UserRepository` | `internal/repository/UserRepository.go` | `FindByEmail`, `FindByActivationToken`, `ActivateUser` jako wzorzec |
| `AuthHandler` | `internal/http/AuthHandler.go` | `generateActivationToken()` — identyczny mechanizm tokenów |
| `User` model | `internal/models/User.go` | Pola `ActivationToken` jako wzorzec dla reset tokenu |

---

## Zmiany — Backend

### 1. Model `User` (`internal/models/User.go`)

Dodać dwa nowe pola:

```go
ResetToken       string    `bson:"resetToken,omitempty" json:"-"`
ResetTokenExpiry time.Time `bson:"resetTokenExpiry,omitempty" json:"-"`
```

Token wygasa po **1 godzinie** (krócej niż token aktywacyjny — reset hasła to operacja wrażliwa bezpieczeństwowo).

---

### 2. `UserRepository` (`internal/repository/UserRepository.go`)

Dodać 3 metody:

```go
// Ustawia token + czas wygaśnięcia
SetResetToken(id primitive.ObjectID, token string, expiry time.Time) error

// Szuka usera po tokenie (używane przy potwierdzeniu resetu)
FindByResetToken(token string) (*models.User, error)

// Aktualizuje zahashowane hasło i czyści token
UpdatePasswordAndClearToken(id primitive.ObjectID, hashedPassword string) error
```

Implementacja analogiczna do `FindByActivationToken` i `ActivateUser`.

---

### 3. `EmailService` (`internal/email/email.go`)

Dodać metodę `SendPasswordResetEmail(to, token string) error`.

Link w emailu: `{APP_URL}/reset-password?token={token}`

Template HTML analogiczny do `SendActivationEmail` — ten sam styl brandingowy.

---

### 4. `AuthHandler` (`internal/http/AuthHandler.go`)

Dodać dwa endpointy:

#### `POST /forgot-password`

```
Request body: { "email": "user@example.com" }
```

Logika:
1. Znajdź usera po emailu (`FindByEmail`)
2. **Zawsze zwróć `200 OK`** — niezależnie czy email istnieje w bazie (zapobiega user enumeration attack)
3. Jeśli user istnieje i jest aktywny (`Active == true`):
   - Wygeneruj token (`generateActivationToken()` — ta sama funkcja)
   - Ustaw `ResetToken` i `ResetTokenExpiry = now + 1h` w bazie
   - Wyślij email z linkiem resetu

```
Response 200: { "message": "If this email is registered, you will receive a reset link." }
```

#### `POST /reset-password`

```
Request body: { "token": "abc123...", "password": "newPassword" }
```

Logika:
1. Znajdź usera po tokenie (`FindByResetToken`)
2. Jeśli nie znaleziono → `400 Bad Request`
3. Sprawdź czy `ResetTokenExpiry > now` — jeśli nie → `400 Bad Request` z komunikatem "Token expired"
4. Zwaliduj nowe hasło (min. 8 znaków)
5. Zahashuj bcrypt (`bcrypt.DefaultCost`)
6. Zapisz nowe hasło i wyczyść token (`UpdatePasswordAndClearToken`)
7. Zwróć `200 OK`

```
Response 200: { "message": "Password updated successfully." }
Response 400: { "error": "Invalid or expired token." }
Response 400: { "error": "Password must be at least 8 characters." }
```

---

### 5. Routing (`cmd/warhammer-battle-helper/main.go`)

```go
// Publiczne (bez JWT middleware) — obok /register i /login
r.POST("/forgot-password", authHandler.ForgotPassword)
r.POST("/reset-password", authHandler.ResetPassword)
```

---

## Zmiany — Frontend

### 1. Strona logowania — link "Forgot password?"

**Plik**: `src/components/auth/LoginPage.jsx` (lub odpowiednik)

Dodać link pod formularzem logowania → nawiguje do `/forgot-password`.

---

### 2. Widok `ForgotPasswordPage` (`src/components/auth/ForgotPasswordPage.jsx`)

Nowy widok (nowa trasa React Router).

**Trasa**: `/forgot-password`

**UI**:
- Input: adres email
- Button: "Send reset link"
- Po wysłaniu: wyświetl komunikat sukcesu (niezależnie od odpowiedzi — jak w backendzie, bez info czy email istnieje)
- Link powrotu do logowania

**i18n klucze** (`auth.forgotPassword.*`):
```json
"title": "Forgot password?",
"description": "Enter your email address and we'll send you a reset link.",
"emailLabel": "Email address",
"submitButton": "Send reset link",
"successMessage": "If this email is registered, you will receive a reset link shortly.",
"backToLogin": "Back to login"
```

---

### 3. Widok `ResetPasswordPage` (`src/components/auth/ResetPasswordPage.jsx`)

Nowy widok dostępny z linku w emailu.

**Trasa**: `/reset-password?token=abc123`

**UI**:
- Input: nowe hasło
- Input: potwierdź hasło (walidacja po stronie frontendu — czy oba pola są identyczne)
- Button: "Set new password"
- Po sukcesie: komunikat + link do logowania
- Po błędzie (token wygasły/nieprawidłowy): komunikat błędu + link do `/forgot-password`

**i18n klucze** (`auth.resetPassword.*`):
```json
"title": "Set new password",
"newPasswordLabel": "New password",
"confirmPasswordLabel": "Confirm password",
"submitButton": "Set new password",
"successMessage": "Password updated successfully. You can now log in.",
"errorInvalidToken": "This link is invalid or has expired. Please request a new one.",
"errorPasswordMismatch": "Passwords do not match.",
"errorPasswordTooShort": "Password must be at least 8 characters.",
"requestNewLink": "Request new reset link"
```

---

### 4. React Router — nowe trasy

Dodać trasy w głównym pliku routingu (App.jsx lub odpowiednik):

```jsx
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
```

---

## Bezpieczeństwo

| Zagrożenie | Mitygacja |
|---|---|
| User enumeration | `POST /forgot-password` zawsze zwraca `200` |
| Brute-force tokenów | Token 32-bajtowy hex (256 bit entropy), jednorazowy |
| Expired token reuse | `ResetTokenExpiry` sprawdzane po stronie backendu |
| Token z poprzedniego resetu | Nowy reset nadpisuje `ResetToken` — stary token staje się nieważny |
| Słabe hasło | Walidacja min. 8 znaków (frontend + backend) |

---

## Kolejność implementacji

1. Model — dodać pola `ResetToken`, `ResetTokenExpiry`
2. Repository — 3 nowe metody
3. EmailService — `SendPasswordResetEmail`
4. AuthHandler — `ForgotPassword`, `ResetPassword`
5. Routing backend — 2 nowe trasy
6. i18n — klucze EN + PL
7. Frontend — `ForgotPasswordPage`
8. Frontend — `ResetPasswordPage`
9. Frontend — link na stronie logowania + trasy React Router


## Notatki implementacyjne:

1. Zunifikuj nazwe funkji generującej tokeny — `generateActivationToken()` może być używana do obu celów (aktywacja i reset). Zmienmy jej nazwe na generyczną
2. Upewnij się, że w obu miejscach (rejestracja i reset) hasła mają takie same wymagania (min. 8 znaków) — spójność UX
3. Dodaj testy jednostkowedla plikow `UserRepository` i `EmailService` — mockowanie bazy danych i SMTP