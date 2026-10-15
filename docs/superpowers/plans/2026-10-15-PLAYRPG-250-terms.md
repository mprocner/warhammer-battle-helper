# PLAYRPG-250 Terms of Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a PL/EN terms of service page at `/terms` and require accepting it (plus a 16+ declaration) at registration, recorded server-side.

**Architecture:** Terms text lives in i18n JSON as an array of `{ title, paragraphs[] }` sections, rendered by a new `TermsOfService` page that generates the § / paragraph numbering. Provider data and dates are JS constants interpolated into translations. The backend rejects registration without `acceptedTerms: true` and stamps `termsAcceptedAt` + `termsVersion` from a Go constant.

**Tech Stack:** Go + Gin (validator binding), MongoDB; React 18 + MUI 7 + react-i18next 16 (`<Trans>`, `returnObjects`), Jest + Testing Library (CRA).

Spec: `docs/superpowers/specs/PLAYRPG-250.md`. Branch: `PLAYRPG-250` (already checked out — no worktree).

## Global Constraints

- Provider: `Mateusz Procner`, contact `contact@playrpg.net`. No postal address anywhere.
- Terms version / effective date: `2026-10-15` (Go `TermsVersion`, JS `TERMS_EFFECTIVE_DATE` — each comment points at the other).
- Age: 16+, declaration only, no birth date field.
- One required checkbox at registration: accept terms + 16+ declaration. Link opens `/terms` in a new tab.
- Existing accounts: untouched — no modal, no banner, no migration.
- No deploy guard, no placeholder test.
- Terms must not name third-party game systems (Warhammer, Call of Cthulhu, D&D) nor the SRD publisher.
- Polish version prevails; avoid numeric cross-references inside the text.
- Code comments in English. All UI strings via `t()`; EN and PL keys added together.
- Icons from `@mui/icons-material` only.
- Frontend tests: run from `warhammer-battle-helper-front/` with `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Known baseline failure: `App.test.js` (axios ESM) — not a regression.
- Backend tests: run from `warhammer-battle-helper-backend/` with `go test ./internal/http/ -run <Name> -v`.

## File Structure

| File | Responsibility |
|---|---|
| `warhammer-battle-helper-backend/internal/models/User.go` | `TermsVersion` const + `TermsAcceptedAt`, `TermsVersion` fields |
| `warhammer-battle-helper-backend/internal/http/AuthHandler.go` | `AcceptedTerms` in request; `newRegisteredUser` builds the user incl. terms stamp |
| `warhammer-battle-helper-backend/internal/http/AuthHandler_register_test.go` | binding rejects missing/false; builder stamps terms |
| `warhammer-battle-helper-front/src/legal/legalInfo.js` | `PROVIDER_NAME`, `CONTACT_EMAIL`, `TERMS_EFFECTIVE_DATE` |
| `warhammer-battle-helper-front/src/components/TermsOfService.jsx` | `/terms` page, numbering, interpolation |
| `warhammer-battle-helper-front/src/components/TermsOfService.test.jsx` | render + PL/EN structural parity |
| `warhammer-battle-helper-front/src/components/Register.jsx` | terms checkbox, `acceptedTerms` in payload |
| `warhammer-battle-helper-front/src/components/Register.test.jsx` | button gating + payload |
| `warhammer-battle-helper-front/src/components/PrivacyPolicy.jsx` | interpolate controller name + contact email |
| `warhammer-battle-helper-front/src/components/PrivacyPolicy.test.jsx` | controller + email rendered |
| `warhammer-battle-helper-front/src/App.js` | `/terms` route |
| `warhammer-battle-helper-front/src/components/Navigation.jsx` | terms icon |
| `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` | `terms.*`, `navigation.terms`, `auth.acceptTerms`, `privacy.contactBody` |

---

### Task 1: Backend — require and record terms acceptance

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/User.go` (struct at lines 43-63)
- Modify: `warhammer-battle-helper-backend/internal/http/AuthHandler.go` (lines 23-27 and 53-87)
- Test: `warhammer-battle-helper-backend/internal/http/AuthHandler_register_test.go` (create)

**Interfaces:**
- Produces: `models.TermsVersion` (string const `"2026-10-15"`); `models.User.TermsAcceptedAt *time.Time`, `models.User.TermsVersion string`; JSON request field `acceptedTerms` (bool, must be `true`); `func newRegisteredUser(req RegisterRequest, passwordHash, activationToken string, now time.Time) *models.User`.

- [ ] **Step 1: Write the failing tests**

Create `warhammer-battle-helper-backend/internal/http/AuthHandler_register_test.go`:

```go
package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"battle-helper/internal/models"

	"github.com/gin-gonic/gin"
)

// postRegister drives Register with a raw JSON body. Bodies that fail binding return before
// the repository is touched, so the nil UserRepo is safe for these cases.
func postRegister(t *testing.T, body string) int {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	h := &AuthHandler{}
	h.Register(c)
	return w.Code
}

func TestRegister_RejectsMissingTermsAcceptance(t *testing.T) {
	status := postRegister(t, `{"email":"a@b.pl","password":"12345678"}`)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", status)
	}
}

func TestRegister_RejectsDeclinedTerms(t *testing.T) {
	status := postRegister(t, `{"email":"a@b.pl","password":"12345678","acceptedTerms":false}`)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", status)
	}
}

func TestNewRegisteredUser_StampsTermsAcceptance(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	req := RegisterRequest{Email: "a@b.pl", Password: "12345678", Signature: "Gm", AcceptedTerms: true}

	u := newRegisteredUser(req, "hash", "token", now)

	if u.TermsAcceptedAt == nil || !u.TermsAcceptedAt.Equal(now) {
		t.Errorf("TermsAcceptedAt = %v, want %v", u.TermsAcceptedAt, now)
	}
	if u.TermsVersion != models.TermsVersion {
		t.Errorf("TermsVersion = %q, want %q", u.TermsVersion, models.TermsVersion)
	}
	if u.Email != "a@b.pl" || u.Password != "hash" || u.ActivationToken != "token" || u.Signature != "Gm" || u.Active {
		t.Errorf("unexpected user fields: %+v", u)
	}
	if !u.CreatedAt.Equal(now) || !u.UpdatedAt.Equal(now) {
		t.Errorf("timestamps = %v / %v, want %v", u.CreatedAt, u.UpdatedAt, now)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/http/ -run 'TestRegister_|TestNewRegisteredUser' -v`
Expected: build failure — `unknown field AcceptedTerms`, `undefined: newRegisteredUser`, `undefined: models.TermsVersion`.

- [ ] **Step 3: Add the model fields and constant**

In `warhammer-battle-helper-backend/internal/models/User.go`, directly above `type User struct {`:

```go
// TermsVersion identifies the terms of service a new account accepts. Keep in sync with
// TERMS_EFFECTIVE_DATE in warhammer-battle-helper-front/src/legal/legalInfo.js.
const TermsVersion = "2026-10-15"
```

Inside `User`, after the `ActivatedAt` field:

```go
	// Nil for accounts created before terms existed; those are deliberately left as they are.
	TermsAcceptedAt *time.Time `bson:"termsAcceptedAt,omitempty" json:"-"`
	TermsVersion    string     `bson:"termsVersion,omitempty" json:"-"`
```

- [ ] **Step 4: Add the request field and the builder**

In `AuthHandler.go`, `RegisterRequest` becomes:

```go
type RegisterRequest struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	Signature string `json:"signature"`
	// "required" on a bool rejects false as well as a missing field — exactly what we want here.
	AcceptedTerms bool `json:"acceptedTerms" binding:"required"`
}
```

Add below `generateSecureToken`:

```go
// newRegisteredUser builds an inactive account awaiting e-mail activation. The terms version is
// stamped by the server, never taken from the client.
func newRegisteredUser(req RegisterRequest, passwordHash, activationToken string, now time.Time) *models.User {
	return &models.User{
		Email:           req.Email,
		Password:        passwordHash,
		Active:          false,
		ActivationToken: activationToken,
		Signature:       req.Signature,
		CreatedAt:       now,
		UpdatedAt:       now,
		TermsAcceptedAt: &now,
		TermsVersion:    models.TermsVersion,
	}
}
```

In `Register`, replace the block from `now := time.Now()` through the closing `}` of the `user := &models.User{...}` literal with:

```go
	user := newRegisteredUser(req, string(hash), token, time.Now())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/http/ -run 'TestRegister_|TestNewRegisteredUser' -v`
Expected: 3 PASS.

Then the whole backend: `go vet ./... && go test ./...`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/User.go warhammer-battle-helper-backend/internal/http/AuthHandler.go warhammer-battle-helper-backend/internal/http/AuthHandler_register_test.go
git commit -m "feat: PLAYRPG-250 require terms acceptance at registration

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Frontend — terms text and `/terms` page

**Files:**
- Create: `warhammer-battle-helper-front/src/legal/legalInfo.js`
- Create: `warhammer-battle-helper-front/src/components/TermsOfService.jsx`
- Create: `warhammer-battle-helper-front/src/components/TermsOfService.test.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (add `terms` object after `privacy`; add `navigation.terms`)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (same keys)
- Modify: `warhammer-battle-helper-front/src/App.js` (import + route next to `/privacy`, line ~182)
- Modify: `warhammer-battle-helper-front/src/components/Navigation.jsx` (icon import lines 14-22, button after the licenses one)

**Interfaces:**
- Produces: `legalInfo.js` exports `PROVIDER_NAME`, `CONTACT_EMAIL`, `TERMS_EFFECTIVE_DATE` (strings); default export `TermsOfService` component; route `/terms`; i18n keys `terms.title`, `terms.effectiveDate` (`{{date}}`), `terms.sections` (array of `{ title, paragraphs: string[] }`, placeholders `{{name}}`, `{{email}}`), `navigation.terms`.

- [ ] **Step 1: Create the constants**

`warhammer-battle-helper-front/src/legal/legalInfo.js`:

```js
// Legal identity of the service, interpolated into the terms and the privacy policy.
// Kept out of translation files so both languages always show the same values.
export const PROVIDER_NAME = 'Mateusz Procner';
export const CONTACT_EMAIL = 'contact@playrpg.net';

// Keep in sync with TermsVersion in warhammer-battle-helper-backend/internal/models/User.go.
export const TERMS_EFFECTIVE_DATE = '2026-10-15';
```

- [ ] **Step 2: Write the failing test**

`warhammer-battle-helper-front/src/components/TermsOfService.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import en from '../locales/en/translation.json';
import pl from '../locales/pl/translation.json';
import TermsOfService from './TermsOfService';
import { CONTACT_EMAIL, PROVIDER_NAME, TERMS_EFFECTIVE_DATE } from '../legal/legalInfo';

describe('TermsOfService', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it.each(['en', 'pl'])('renders numbered sections with interpolated values (%s)', async (lng) => {
    await i18n.changeLanguage(lng);
    const { container } = render(<TermsOfService />);

    const sections = (lng === 'en' ? en : pl).terms.sections;
    expect(screen.getByRole('heading', { name: `§ 1. ${sections[0].title}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `§ ${sections.length}. ${sections[sections.length - 1].title}` }))
      .toBeInTheDocument();

    const text = container.textContent;
    expect(text).toContain(PROVIDER_NAME);
    expect(text).toContain(CONTACT_EMAIL);
    expect(text).toContain(TERMS_EFFECTIVE_DATE);
    expect(text).not.toContain('{{');
    expect(text).not.toContain('terms.');
  });

  // i18n-sync compares keys only; an array has the same key in both languages, so a paragraph
  // added to one version would slip through without this check.
  it('has the same section and paragraph structure in PL and EN', () => {
    const shape = (sections) => sections.map((s) => s.paragraphs.length);
    expect(shape(pl.terms.sections)).toEqual(shape(en.terms.sections));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TermsOfService`
Expected: FAIL — `Cannot find module './TermsOfService'`.

- [ ] **Step 4: Add the translations**

In `src/locales/en/translation.json`, add `"terms": "Terms of service"` to the `navigation` object (after `"licenses"`), and add this top-level object right after the `privacy` object:

```json
"terms": {
  "title": "Terms of Service",
  "effectiveDate": "Effective from {{date}}",
  "sections": [
    {
      "title": "General provisions",
      "paragraphs": [
        "These Terms of Service set out the rules for using PlayRPG, available at playrpg.net (the \"Service\"), a tool for running tabletop role-playing sessions online.",
        "The Service is provided by {{name}}, e-mail: {{email}} (the \"Provider\"). We correspond in Polish and English.",
        "Definitions: User — a person using the Service; Account — the data of a User registered in the Service; Game — a virtual session in the Service; Game Master — the User who created a Game; Player — a User taking part in a Game; Content — any material shared by Users, in particular images, files, music, notes, messages, character sheets and game system templates.",
        "Using the Service requires a device with internet access, an up-to-date web browser with JavaScript and WebSocket enabled, and an active e-mail address.",
        "These Terms are available free of charge at playrpg.net/terms in a form that allows them to be saved and printed. The processing of personal data is described in the Privacy Policy."
      ]
    },
    {
      "title": "Account",
      "paragraphs": [
        "An Account may be created by a person who is at least 16 years old. By creating an Account, the User declares that they meet this requirement.",
        "Registration requires an e-mail address and a password, acceptance of these Terms and confirmation of the e-mail address via the activation link. Once the Account is activated, an agreement for the provision of electronic services is concluded for an indefinite period.",
        "The User is responsible for keeping their password secret and for actions taken using their Account.",
        "The User may request deletion of their Account at any time by writing to {{email}} from the e-mail address linked to the Account. Deleting the Account terminates the agreement and deletes the Content linked to it, except for backup copies, which are removed as backups rotate."
      ]
    },
    {
      "title": "Free service",
      "paragraphs": [
        "Using the Service is free of charge.",
        "The Provider may offer a way to voluntarily support the Service. Support is not payment for the service and grants no additional rights in the Service.",
        "The Service is a project developed by a private individual and provided as is. The Provider makes efforts to keep the Service running without interruption but does not guarantee its continuous availability or the permanence of stored Content. Users should keep copies of important material outside the Service.",
        "The Provider may temporarily suspend the Service, in particular for maintenance, updates or to fix failures.",
        "Provisions limiting the Provider's liability do not apply to damage caused intentionally or to other cases in which limiting liability is not permitted by law."
      ]
    },
    {
      "title": "User Content",
      "paragraphs": [
        "Content belongs to the User who shared it or to its rightful owners. The Provider acquires no rights to it.",
        "By sharing Content, the User grants the Provider a non-exclusive, royalty-free licence to store, reproduce and display it solely to the extent necessary to provide the service, in particular to the Game participants with whom the User shares it, and in backup copies. The licence expires when the Content or the Account is deleted; backup copies are removed as backups rotate.",
        "The User declares that they hold the rights to the Content they share or use it lawfully, and that sharing it does not infringe the rights of third parties.",
        "The User who shared Content is solely responsible for it. If a third party brings a claim against the Provider concerning a User's Content, the User undertakes, to the extent permitted by law, to indemnify the Provider and cover the costs the Provider incurs.",
        "It is forbidden to share Content that: infringes copyright or other rights of third parties (including scans and excerpts of rulebooks without the rights holder's consent); is unlawful; depicts the sexual abuse of minors; incites hatred or violence against real persons or groups; contains malware; or contains personal data of third parties without a legal basis. Fictional content typical of role-playing games, such as violence or horror, is allowed.",
        "The Provider does not review Content before it is shared.",
        "Anyone, including a person without an Account, may report Content they consider unlawful or contrary to these Terms by writing to {{email}}. A report should include: identification of the Content (e.g. the Game name and a description or screenshot), an explanation, the reporter's name and e-mail address (not required for reports concerning the sexual abuse of children), and a statement that the report is made in good faith and the information in it is true.",
        "The Provider handles reports without undue delay. Where there are reasonable doubts about the legality of Content, the Provider may block access to it while it is being assessed. The reporter is informed of the decision.",
        "If the Provider removes Content, blocks access to it or restricts an Account, the User receives, at the Account's e-mail address, a statement of reasons indicating what the decision concerns, its grounds and how to appeal. An appeal may be sent to {{email}} within 6 months; the Provider handles it within 14 days. Once the infringement is removed, access to the Content may be restored."
      ]
    },
    {
      "title": "Intellectual property",
      "paragraphs": [
        "The Service, in particular its code, design and branding, is protected by law and belongs to the Provider. Using the Service grants the User no rights to these elements beyond the right to use the Service in accordance with these Terms.",
        "Copying the Service or any part of it and automated collection of data from the Service (e.g. scraping) without the Provider's consent are forbidden.",
        "Names and trademarks of third-party role-playing games belong to their owners. The Service is not affiliated with or endorsed by any game publisher.",
        "Material made available under open licences (e.g. the SRD) is used under the terms of those licences, described on the Licenses page."
      ]
    },
    {
      "title": "Rules of use",
      "paragraphs": [
        "Users use the Service in accordance with the law, these Terms and good practice.",
        "In particular, it is forbidden to harass other Users, send spam, impersonate others, attempt to gain unauthorised access to Accounts or Games, circumvent the Service's security, or overload the Service."
      ]
    },
    {
      "title": "Complaints",
      "paragraphs": [
        "Complaints about how the Service works may be sent to {{email}}.",
        "A complaint should include the Account's e-mail address and a description of the problem.",
        "The Provider responds to a complaint within 14 days of receiving it, to the e-mail address it was sent from."
      ]
    },
    {
      "title": "Blocking and termination",
      "paragraphs": [
        "The User may terminate the agreement at any time by requesting deletion of their Account.",
        "The Provider may block or delete an Account in the event of a serious or repeated breach of these Terms or the law. The User receives a statement of reasons and may appeal under the rules described in the section on User Content.",
        "The Provider may terminate the agreement for other important reasons, in particular if the Service is discontinued, with 30 days' notice sent to the Account's e-mail address."
      ]
    },
    {
      "title": "Changes to the Terms",
      "paragraphs": [
        "The Provider may change these Terms for important reasons, in particular changes in the law or changes to the Service's features.",
        "Users are informed of a change by e-mail or by a notice in the Service at least 14 days before it takes effect. A User who does not accept the changes may terminate the agreement before that date by requesting deletion of their Account."
      ]
    },
    {
      "title": "Final provisions",
      "paragraphs": [
        "The agreement is governed by Polish law. This choice of law does not deprive a consumer of the protection afforded by the mandatory provisions of the law of the country of their habitual residence.",
        "Disputes are resolved by the common courts having jurisdiction under general rules.",
        "These Terms are available in Polish and English. In the event of any discrepancy, the Polish version prevails."
      ]
    }
  ]
},
```

In `src/locales/pl/translation.json`, add `"terms": "Regulamin"` to `navigation` (after `"licenses"`), and this object right after `privacy`:

```json
"terms": {
  "title": "Regulamin",
  "effectiveDate": "Obowiązuje od {{date}}",
  "sections": [
    {
      "title": "Postanowienia ogólne",
      "paragraphs": [
        "Niniejszy regulamin określa zasady korzystania z serwisu PlayRPG dostępnego pod adresem playrpg.net (dalej: „Serwis”) — narzędzia do prowadzenia sesji gier fabularnych przez internet.",
        "Usługodawcą jest {{name}}, e-mail: {{email}} (dalej: „Usługodawca”). Korespondencję prowadzimy w języku polskim i angielskim.",
        "Definicje: Użytkownik — osoba korzystająca z Serwisu; Konto — dane Użytkownika zarejestrowanego w Serwisie; Gra — wirtualna sesja w Serwisie; Mistrz Gry — Użytkownik, który utworzył Grę; Gracz — Użytkownik uczestniczący w Grze; Treści — wszelkie materiały udostępniane przez Użytkowników, w szczególności obrazy, pliki, muzyka, notatki, wiadomości, karty postaci i szablony systemów gier.",
        "Do korzystania z Serwisu potrzebne są: urządzenie z dostępem do internetu, aktualna przeglądarka internetowa z włączoną obsługą JavaScript i WebSocket oraz aktywny adres e-mail.",
        "Regulamin jest udostępniany nieodpłatnie pod adresem playrpg.net/terms w sposób umożliwiający jego zapisanie i wydrukowanie. Zasady przetwarzania danych osobowych opisuje Polityka prywatności."
      ]
    },
    {
      "title": "Konto",
      "paragraphs": [
        "Konto może założyć osoba, która ukończyła 16 lat. Zakładając Konto, Użytkownik oświadcza, że spełnia ten warunek.",
        "Rejestracja wymaga podania adresu e-mail i hasła, akceptacji Regulaminu oraz potwierdzenia adresu e-mail przez link aktywacyjny. Z chwilą aktywacji Konta zostaje zawarta umowa o świadczenie usług drogą elektroniczną na czas nieokreślony.",
        "Użytkownik odpowiada za zachowanie hasła w tajemnicy i za działania wykonane z użyciem jego Konta.",
        "Użytkownik może w każdej chwili zażądać usunięcia Konta, pisząc na {{email}} z adresu e-mail przypisanego do Konta. Usunięcie Konta rozwiązuje umowę i oznacza usunięcie powiązanych z nim Treści, z wyjątkiem kopii zapasowych, usuwanych w ramach ich rotacji."
      ]
    },
    {
      "title": "Usługa bezpłatna",
      "paragraphs": [
        "Korzystanie z Serwisu jest bezpłatne.",
        "Usługodawca może umożliwić dobrowolne wsparcie Serwisu. Wsparcie nie jest zapłatą za usługę i nie daje dodatkowych uprawnień w Serwisie.",
        "Serwis jest projektem rozwijanym przez osobę prywatną i udostępnianym w stanie, w jakim się znajduje. Usługodawca dokłada starań, aby Serwis działał nieprzerwanie, ale nie gwarantuje jego ciągłej dostępności ani trwałości przechowywanych Treści. Użytkownik powinien przechowywać kopie ważnych materiałów poza Serwisem.",
        "Usługodawca może czasowo wstrzymać działanie Serwisu, w szczególności w celu konserwacji, aktualizacji lub usunięcia awarii.",
        "Postanowienia ograniczające odpowiedzialność Usługodawcy nie dotyczą szkody wyrządzonej umyślnie ani innych przypadków, w których ograniczenie odpowiedzialności jest niedopuszczalne z mocy prawa."
      ]
    },
    {
      "title": "Treści Użytkowników",
      "paragraphs": [
        "Treści należą do Użytkownika, który je udostępnił, lub do ich prawowitych właścicieli. Usługodawca nie nabywa do nich praw.",
        "Udostępniając Treści, Użytkownik udziela Usługodawcy niewyłącznej, nieodpłatnej licencji na ich przechowywanie, zwielokrotnianie i wyświetlanie wyłącznie w zakresie niezbędnym do świadczenia usługi, w szczególności uczestnikom Gry, z którymi Użytkownik je współdzieli, oraz w kopiach zapasowych. Licencja wygasa z chwilą usunięcia Treści lub Konta; kopie zapasowe są usuwane w ramach ich rotacji.",
        "Użytkownik oświadcza, że przysługują mu prawa do udostępnianych Treści albo korzysta z nich zgodnie z prawem, oraz że ich udostępnienie nie narusza praw osób trzecich.",
        "Za Treści odpowiada wyłącznie Użytkownik, który je udostępnił. Jeżeli osoba trzecia wystąpi przeciwko Usługodawcy z roszczeniem dotyczącym Treści Użytkownika, Użytkownik zobowiązuje się, w granicach przewidzianych prawem, zwolnić Usługodawcę z odpowiedzialności i pokryć poniesione przez niego koszty.",
        "Zakazane jest udostępnianie Treści: naruszających prawa autorskie lub inne prawa osób trzecich (w tym skanów i fragmentów podręczników bez zgody uprawnionego), niezgodnych z prawem, przedstawiających wykorzystywanie seksualne małoletnich, nawołujących do nienawiści lub przemocy wobec rzeczywistych osób lub grup, zawierających złośliwe oprogramowanie oraz zawierających dane osobowe osób trzecich bez podstawy prawnej. Fikcyjne treści typowe dla gier fabularnych, takie jak przemoc czy horror, są dozwolone.",
        "Usługodawca nie przegląda Treści przed ich udostępnieniem.",
        "Każdy, także osoba bez Konta, może zgłosić Treść, którą uważa za nielegalną lub sprzeczną z Regulaminem, pisząc na {{email}}. Zgłoszenie powinno zawierać: wskazanie Treści (np. nazwę Gry oraz opis lub zrzut ekranu), uzasadnienie, imię i nazwisko lub nazwę oraz adres e-mail zgłaszającego (niewymagane przy zgłoszeniach dotyczących wykorzystywania seksualnego dzieci), a także oświadczenie, że zgłoszenie jest składane w dobrej wierze, a zawarte w nim informacje są prawdziwe.",
        "Usługodawca rozpatruje zgłoszenia niezwłocznie. W razie uzasadnionych wątpliwości co do legalności Treści może zablokować do niej dostęp na czas oceny. Zgłaszający otrzymuje informację o podjętej decyzji.",
        "Jeżeli Usługodawca usunie Treść, zablokuje do niej dostęp lub ograniczy Konto, Użytkownik otrzymuje na adres e-mail Konta uzasadnienie wskazujące, czego dotyczy decyzja, jej podstawę oraz sposób odwołania. Odwołanie można przesłać na {{email}} w ciągu 6 miesięcy; Usługodawca rozpatruje je w ciągu 14 dni. Po usunięciu naruszenia dostęp do Treści może zostać przywrócony."
      ]
    },
    {
      "title": "Własność intelektualna",
      "paragraphs": [
        "Serwis, w szczególności jego kod, wygląd i oznaczenia, jest chroniony prawem i należy do Usługodawcy. Korzystanie z Serwisu nie daje Użytkownikowi żadnych praw do tych elementów poza prawem korzystania z Serwisu zgodnie z Regulaminem.",
        "Zakazane jest kopiowanie Serwisu lub jego części oraz automatyczne pobieranie danych z Serwisu (np. scraping) bez zgody Usługodawcy.",
        "Nazwy i znaki gier fabularnych osób trzecich należą do ich właścicieli. Serwis nie jest powiązany z wydawcami gier ani przez nich wspierany.",
        "Materiały udostępnione na licencjach otwartych (np. SRD) są wykorzystywane na warunkach tych licencji, opisanych na stronie Licencje."
      ]
    },
    {
      "title": "Zasady korzystania",
      "paragraphs": [
        "Użytkownik korzysta z Serwisu zgodnie z prawem, Regulaminem i dobrymi obyczajami.",
        "Zakazane jest w szczególności: nękanie innych Użytkowników, wysyłanie spamu, podszywanie się pod inne osoby, próby uzyskania nieuprawnionego dostępu do Kont lub Gier, obchodzenie zabezpieczeń Serwisu oraz działania przeciążające Serwis."
      ]
    },
    {
      "title": "Reklamacje",
      "paragraphs": [
        "Reklamacje dotyczące działania Serwisu można przesyłać na {{email}}.",
        "Reklamacja powinna zawierać adres e-mail Konta i opis problemu.",
        "Usługodawca odpowiada na reklamację w ciągu 14 dni od jej otrzymania, na adres e-mail, z którego ją przesłano."
      ]
    },
    {
      "title": "Blokada i rozwiązanie umowy",
      "paragraphs": [
        "Użytkownik może rozwiązać umowę w każdej chwili, żądając usunięcia Konta.",
        "Usługodawca może zablokować lub usunąć Konto w razie rażącego lub powtarzającego się naruszenia Regulaminu albo prawa. Użytkownik otrzymuje uzasadnienie decyzji i może się od niej odwołać na zasadach opisanych w części o Treściach Użytkowników.",
        "Usługodawca może rozwiązać umowę z innych ważnych przyczyn, w szczególności w razie zakończenia działania Serwisu, z 30-dniowym wyprzedzeniem przekazanym na adres e-mail Konta."
      ]
    },
    {
      "title": "Zmiany Regulaminu",
      "paragraphs": [
        "Usługodawca może zmienić Regulamin z ważnych przyczyn, w szczególności w razie zmiany przepisów prawa lub zmiany funkcji Serwisu.",
        "O zmianie Użytkownik zostaje poinformowany e-mailem lub komunikatem w Serwisie co najmniej 14 dni przed jej wejściem w życie. Użytkownik, który nie akceptuje zmian, może przed tym terminem rozwiązać umowę, żądając usunięcia Konta."
      ]
    },
    {
      "title": "Postanowienia końcowe",
      "paragraphs": [
        "Do umowy stosuje się prawo polskie. Wybór prawa nie pozbawia konsumenta ochrony przyznanej mu przez bezwzględnie obowiązujące przepisy prawa państwa jego zwykłego pobytu.",
        "Spory rozstrzygają sądy powszechne właściwe według przepisów ogólnych.",
        "Regulamin jest dostępny w języku polskim i angielskim. W razie rozbieżności rozstrzyga wersja polska."
      ]
    }
  ]
},
```

Validate both files parse: `node -e "for (const l of ['en','pl']) JSON.parse(require('fs').readFileSync('src/locales/'+l+'/translation.json','utf8'))"` (from `warhammer-battle-helper-front/`). Expected: no output.

- [ ] **Step 5: Create the page**

`warhammer-battle-helper-front/src/components/TermsOfService.jsx`:

```jsx
import React from 'react';
import { Container, Box, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PROVIDER_NAME, CONTACT_EMAIL, TERMS_EFFECTIVE_DATE } from '../legal/legalInfo';

// Section and paragraph numbers are generated here, not written in the text, so inserting a
// section never leaves stale numbering behind.
const TermsOfService = () => {
    const { t } = useTranslation();
    const sections = t('terms.sections', {
        returnObjects: true,
        name: PROVIDER_NAME,
        email: CONTACT_EMAIL,
    });

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
                        {t('terms.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {t('terms.effectiveDate', { date: TERMS_EFFECTIVE_DATE })}
                    </Typography>

                    {sections.map((section, index) => (
                        <Box key={section.title} component="section" sx={{ mb: 3 }}>
                            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                                {`§ ${index + 1}. ${section.title}`}
                            </Typography>
                            <Box component="ol" sx={{ pl: 3, m: 0 }}>
                                {section.paragraphs.map((paragraph) => (
                                    <Typography key={paragraph} component="li" variant="body2" sx={{ mb: 1 }}>
                                        {paragraph}
                                    </Typography>
                                ))}
                            </Box>
                        </Box>
                    ))}
                </Paper>
            </Box>
        </Container>
    );
};

export default TermsOfService;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=TermsOfService`
Expected: 3 PASS (en, pl, parity). If the `{{` assertion fails, nested values were not interpolated — check that `name` and `email` sit in the same options object as `returnObjects: true`.

- [ ] **Step 7: Wire the route and navigation icon**

`src/App.js`: add `import TermsOfService from './components/TermsOfService';` after the `PrivacyPolicy` import, and after `<Route path="/privacy" element={<PrivacyPolicy />} />`:

```jsx
                        <Route path="/terms" element={<TermsOfService />} />
```

`src/components/Navigation.jsx`: extend the icon import with `Description as DescriptionIcon` (after `Gavel as GavelIcon`, add a comma to the previous line), and after the licenses `IconButton` (the one with `<GavelIcon />`):

```jsx
                        <IconButton
                            color="inherit"
                            onClick={() => navigate('/terms')}
                            title={t('navigation.terms')}
                        >
                            <DescriptionIcon />
                        </IconButton>
```

- [ ] **Step 8: Run the full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: all PASS except the known `App.test.js` axios ESM baseline failure.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/legal/legalInfo.js warhammer-battle-helper-front/src/components/TermsOfService.jsx warhammer-battle-helper-front/src/components/TermsOfService.test.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json warhammer-battle-helper-front/src/App.js warhammer-battle-helper-front/src/components/Navigation.jsx
git commit -m "feat: PLAYRPG-250 terms of service page in PL and EN

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Frontend — terms checkbox at registration

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/Register.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (`auth.acceptTerms`)
- Test: `warhammer-battle-helper-front/src/components/Register.test.jsx` (create)

**Interfaces:**
- Consumes: route `/terms` (Task 2); backend field `acceptedTerms` (Task 1).
- Produces: i18n key `auth.acceptTerms` containing a `<link>…</link>` tag.

- [ ] **Step 1: Add the translations**

`en` → in `auth`, after `"signaturePlaceholder"`:

```json
"acceptTerms": "I accept the <link>Terms of Service</link> and declare that I am at least 16 years old.",
```

`pl` → in `auth`, after `"signaturePlaceholder"`:

```json
"acceptTerms": "Akceptuję <link>Regulamin</link> i oświadczam, że mam ukończone 16 lat.",
```

- [ ] **Step 2: Write the failing test**

`warhammer-battle-helper-front/src/components/Register.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import i18n from '../i18n';
import Register from './Register';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});
jest.mock('../api/axios', () => ({ getApiUrl: () => 'http://api.test', getApiHeaders: () => ({}) }));
jest.mock('../analytics/gtag', () => ({ trackEvent: jest.fn() }));

const fillForm = () => {
  fireEvent.change(document.getElementById('email'), { target: { name: 'email', value: 'a@b.pl' } });
  fireEvent.change(document.getElementById('password'), { target: { name: 'password', value: '12345678' } });
  fireEvent.change(document.getElementById('confirmPassword'), { target: { name: 'confirmPassword', value: '12345678' } });
};

const submitButton = () => screen.getByRole('button', { name: i18n.t('auth.registerButton') });

describe('Register — terms acceptance', () => {
  beforeEach(() => axios.post.mockReset());

  it('keeps submit disabled until the terms checkbox is ticked', () => {
    render(<Register addLogMessage={jest.fn()} />);
    fillForm();
    expect(submitButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submitButton()).toBeEnabled();
  });

  it('links the terms page in a new tab', () => {
    render(<Register addLogMessage={jest.fn()} />);
    const link = screen.getByRole('link', { name: 'Terms of Service' });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('sends acceptedTerms with the registration request', async () => {
    axios.post.mockResolvedValue({ data: {} });
    render(<Register addLogMessage={jest.fn()} />);
    fillForm();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submitButton());

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post.mock.calls[0][1]).toEqual(expect.objectContaining({ acceptedTerms: true }));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=Register.test`
Expected: FAIL — no checkbox / no `Terms of Service` link found.

- [ ] **Step 4: Implement the checkbox**

In `Register.jsx`:

1. Import: change `import { useTranslation } from 'react-i18next';` to `import { useTranslation, Trans } from 'react-i18next';` and add `Checkbox,` and `FormControlLabel,` to the `@mui/material` import list.
2. State: `confirmPassword: ''` / `signature: ''` stay; add a separate state below `success`:
   ```jsx
   const [acceptedTerms, setAcceptedTerms] = useState(false);
   ```
3. Payload: add `acceptedTerms,` after `password: formData.password,` in the `axios.post` body.
4. Reset after success: after the `setFormData({...})` call add `setAcceptedTerms(false);`.
5. Render: after the signature `TextField` and before `{error && (`:
   ```jsx
                        <FormControlLabel
                            sx={{ mt: 1 }}
                            control={
                                <Checkbox
                                    required
                                    checked={acceptedTerms}
                                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                                    disabled={isLoading}
                                />
                            }
                            label={
                                <Typography variant="body2">
                                    {/* A link inside a label does not toggle the checkbox: clicks on
                                        interactive content are excluded from label activation. */}
                                    <Trans
                                        i18nKey="auth.acceptTerms"
                                        components={{
                                            link: <Link href="/terms" target="_blank" rel="noopener noreferrer" />,
                                        }}
                                    />
                                </Typography>
                            }
                        />
   ```
6. Submit button: `disabled={isLoading}` becomes `disabled={isLoading || !acceptedTerms}`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=Register.test`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/Register.jsx warhammer-battle-helper-front/src/components/Register.test.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-250 terms and age checkbox at registration

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Privacy policy — data controller and real contact address

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/PrivacyPolicy.jsx` (the `SECTIONS.map` body, line ~35)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (`privacy.contactBody`)
- Test: `warhammer-battle-helper-front/src/components/PrivacyPolicy.test.jsx` (create)

**Interfaces:**
- Consumes: `PROVIDER_NAME`, `CONTACT_EMAIL` from `src/legal/legalInfo.js` (Task 2).

- [ ] **Step 1: Write the failing test**

`warhammer-battle-helper-front/src/components/PrivacyPolicy.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../i18n';
import { ConsentProvider } from '../analytics/ConsentContext';
import PrivacyPolicy from './PrivacyPolicy';
import { CONTACT_EMAIL, PROVIDER_NAME } from '../legal/legalInfo';

describe('PrivacyPolicy', () => {
  it('names the data controller and the monitored contact address', () => {
    const { container } = render(<ConsentProvider><PrivacyPolicy /></ConsentProvider>);
    const text = container.textContent;
    expect(text).toContain(PROVIDER_NAME);
    expect(text).toContain(CONTACT_EMAIL);
    expect(text).not.toContain('noreply@');
    expect(text).not.toContain('{{');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=PrivacyPolicy`
Expected: FAIL — text lacks `Mateusz Procner`, contains `noreply@`.

- [ ] **Step 3: Update translations and component**

`en` `privacy.contactBody`:
```json
"contactBody": "The data controller is {{name}}. Questions about your data: {{email}}"
```
`pl` `privacy.contactBody`:
```json
"contactBody": "Administratorem danych jest {{name}}. Pytania o Twoje dane: {{email}}"
```

`PrivacyPolicy.jsx`: add `import { PROVIDER_NAME, CONTACT_EMAIL } from '../legal/legalInfo';` and change the body line inside `SECTIONS.map` to:

```jsx
                                {t(`privacy.${section}Body`, { name: PROVIDER_NAME, email: CONTACT_EMAIL })}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=PrivacyPolicy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/PrivacyPolicy.jsx warhammer-battle-helper-front/src/components/PrivacyPolicy.test.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-250 privacy policy names the controller and contact address

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Final verification

- [ ] **Step 1: i18n parity** — run the `i18n-sync` skill's key diff for `translation.json`; expected: no missing keys between `en` and `pl`.
- [ ] **Step 2: Full suites** — `cd warhammer-battle-helper-backend && go vet ./... && go test ./...` (all PASS); `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false` (only the `App.test.js` baseline failure).
- [ ] **Step 3: Lint** — `cd warhammer-battle-helper-front && npx eslint src/components/TermsOfService.jsx src/components/Register.jsx src/components/PrivacyPolicy.jsx src/legal/legalInfo.js src/components/Navigation.jsx` — no errors.
- [ ] **Step 4: Forbidden names** — from `warhammer-battle-helper-front/`:
  `node -e "for (const l of ['en','pl']) { const t = JSON.stringify(require('./src/locales/'+l+'/translation.json').terms); const hit = t.match(/warhammer|cthulhu|wizards|d&d|dungeons/i); console.log(l, hit ? 'FOUND ' + hit[0] : 'clean'); }"`
  Expected: `en clean`, `pl clean`.
- [ ] **Step 5: Live registration check** (local docker stack, see memory `local-e2e-verification-recipe`): `curl -s -o /dev/null -w '%{http_code}' -X POST <backend-url-from-recipe>/register -H 'Content-Type: application/json' -d '{"email":"t250@example.com","password":"12345678"}'` → `400`; with `"acceptedTerms":true` → `201` (or `500` only if the activation mail cannot be sent locally — then check Mongo: `termsVersion: "2026-10-15"` and `termsAcceptedAt` set on `t250@example.com`). Delete the test user afterwards.
