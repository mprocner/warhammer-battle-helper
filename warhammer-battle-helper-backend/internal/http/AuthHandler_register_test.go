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
