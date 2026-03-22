# Zmiana hasła (Password Change)

## Opis funkcjonalności

Zalogowany użytkownik może zmienić swoje hasło z poziomu strony ustawień konta, dostępnej przez ikonę w prawym górnym rogu paska nawigacyjnego na stronie listy gier.

Formularz zmiany hasła wymaga:
1. Podania **aktualnego hasła** — weryfikacja po stronie backendu, że użytkownik zna stare hasło (zabezpieczenie przed nieautoryzowaną zmianą np. przez kogoś przy otwartej sesji)
2. Podania **nowego hasła** dwa razy — klasyczna walidacja zgodności przed wysłaniem

Po udanej zmianie wyświetlamy komunikat sukcesu w tym samym widoku (bez przekierowania). Token JWT pozostaje ważny — hasło nie invaliduje sesji.

---

## Dokumentacja techniczna

### Backend

#### Nowy endpoint

```
PATCH /change-password
Authorization: Bearer <token>   ← chroniony JWTAuthMiddleware
```

**Request body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Responses:**
| Status | Body | Kiedy |
|--------|------|-------|
| 200 | `{"message": "Password changed successfully"}` | Sukces |
| 400 | `{"error": "..."}` | Brak pól / nowe hasło < 8 znaków |
| 401 | `{"error": "Invalid current password"}` | Złe aktualne hasło |
| 500 | `{"error": "..."}` | Błąd bazy / bcrypt |

**Logika (AuthHandler.ChangePassword):**
1. Wyciągnij `user_id` z JWT claims (`c.Get("jwt")`)
2. `ShouldBindJSON` → walidacja obecności pól
3. Walidacja: `len(newPassword) >= 8`
4. `UserRepository.FindByID(userID)` → pobierz użytkownika
5. `bcrypt.CompareHashAndPassword(user.Password, currentPassword)` → zweryfikuj stare hasło
6. `bcrypt.GenerateFromPassword(newPassword, bcrypt.DefaultCost)` → zahaszuj nowe
7. `UserRepository.UpdatePassword(userID, hashedPassword)` → zaktualizuj w MongoDB

**Nowa metoda repozytorium — `UserRepository.UpdatePassword`:**
```go
func (r *UserRepository) UpdatePassword(id primitive.ObjectID, hashedPassword string) error {
    _, err := r.collection.UpdateOne(
        ctx,
        bson.M{"_id": id},
        bson.M{"$set": bson.M{"password": hashedPassword}},
    )
    return err
}
```

> Reużywa istniejące: `JWTAuthMiddleware`, `UserRepository.FindByID`, strukturę `AuthHandler`, wzorzec bcrypt z `Register`/`ResetPassword`.

**Routing (`main.go`):**
```go
protected.PATCH("/change-password", authHandler.ChangePassword)
```
(dodać do grupy z `JWTAuthMiddleware()`)

---

### Frontend

#### Nowa strona: `/settings`

Chroniona przez `ProtectedRoute` (reużywa istniejący komponent).

**Nowe pliki:**
```
src/components/settings/
  SettingsPage.jsx          — strona-kontener, routing target
  ChangePasswordForm.jsx    — formularz ze stanem i logiką fetch
  ChangePasswordFields.jsx  — pola formularza (prezentacyjny)
```

#### `SettingsPage.jsx`
- Kontener strony, nagłówek „Ustawienia konta"
- Renderuje `<ChangePasswordForm />`
- Layout analogiczny do `Login.jsx` / `Register.jsx` (MUI Container + Paper + Box)

#### `ChangePasswordForm.jsx`
- Zarządza stanem: `currentPassword`, `newPassword`, `confirmPassword`, `loading`, `error`, `success`
- Walidacja frontendowa:
  - `newPassword.length >= 8` → wyświetla helper text
  - `newPassword === confirmPassword` → błąd przed wysłaniem
- `handleSubmit`: `PATCH /change-password` przez `axiosInstance` (reużywa istniejący interceptor JWT)
- Po sukcesie: czyści pola, ustawia `success = true`
- Renderuje `<ChangePasswordFields>` przekazując props + callbacki

#### `ChangePasswordFields.jsx`
- Czysto prezentacyjny — tylko MUI `<TextField>` dla 3 pól
- Props: `currentPassword`, `newPassword`, `confirmPassword`, `onChange`, `errors`
- Reużywa wzorzec z `Register.jsx` i `ResetPassword.jsx`

#### Wyświetlanie wyników
- Sukces: MUI `<Alert severity="success">` (wzorzec z pozostałych komponentów auth)
- Błąd: MUI `<Alert severity="error">`
- Loading: `<CircularProgress>` w przycisku (wzorzec z `Login.jsx`)

#### Nawigacja — `Navigation.jsx`

Dodać ikonę ustawień obok przycisku wylogowania gdy użytkownik jest zalogowany:

```jsx
// Istniejący fragment w Navigation.jsx (zalogowany użytkownik):
<IconButton onClick={() => navigate('/settings')} title={t('navigation.settings')}>
  <SettingsIcon />
</IconButton>
```

Ikona: `SettingsIcon` z `@mui/icons-material/Settings` (zgodnie z konwencją MUI Icons z CLAUDE.md).

#### Routing — `App.js`

```jsx
<Route
  path="/settings"
  element={
    <ProtectedRoute user={user}>
      <SettingsPage />
    </ProtectedRoute>
  }
/>
```

---

### i18n

**Klucze do dodania w `en/translation.json` i `pl/translation.json`:**

```json
"settings": {
  "title": "Account Settings",
  "changePassword": {
    "title": "Change Password",
    "currentPasswordLabel": "Current Password",
    "newPasswordLabel": "New Password",
    "confirmPasswordLabel": "Confirm New Password",
    "submitButton": "Change Password",
    "submitting": "Changing...",
    "successMessage": "Password changed successfully",
    "errorCurrentPassword": "Current password is incorrect",
    "errorPasswordTooShort": "Password must be at least 8 characters",
    "errorPasswordMismatch": "Passwords do not match"
  }
},
"navigation": {
  "settings": "Settings"
}
```

---

### Podsumowanie zależności

| Co reużywamy | Skąd |
|---|---|
| `JWTAuthMiddleware` | `internal/http/JWTMiddleware.go` |
| `UserRepository.FindByID` | `internal/repository/UserRepository.go` |
| `AuthHandler` struct | `internal/http/AuthHandler.go` |
| bcrypt pattern | `AuthHandler.Register` / `ResetPassword` |
| `axiosInstance` (JWT interceptor) | `src/api/axios.js` |
| `ProtectedRoute` | `src/components/ProtectedRoute.jsx` |
| MUI TextField/Alert/Button/CircularProgress pattern | `Login.jsx`, `Register.jsx`, `ResetPassword.jsx` |
| Layout pattern (Container+Paper+Box) | `Login.jsx` |
