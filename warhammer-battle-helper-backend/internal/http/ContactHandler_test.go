package http

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type sentMail struct{ to, replyTo, subject, body string }

// fakeContactSender records messages instead of talking to SMTP.
type fakeContactSender struct {
	configured bool
	err        error
	sent       []sentMail
}

func (f *fakeContactSender) Configured() bool { return f.configured }
func (f *fakeContactSender) SendContactMessage(to, replyTo, subject, body string) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, sentMail{to, replyTo, subject, body})
	return nil
}

func postContact(t *testing.T, sender *fakeContactSender, body string, claims jwt.MapClaims) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/contact", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	if claims != nil {
		c.Set("jwt", &jwt.Token{Claims: claims, Valid: true})
	}
	h := &ContactHandler{Sender: sender, Recipient: "contact@playrpg.net"}
	h.Submit(c)
	return w
}

func TestContact_SendsBugReportWithReplyTo(t *testing.T) {
	sender := &fakeContactSender{configured: true}
	w := postContact(t, sender, `{"type":"bug","email":"a@example.com","subject":"Mapa","message":"Nie działa mgła"}`, nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
	}
	if len(sender.sent) != 1 {
		t.Fatalf("sent %d messages, want 1", len(sender.sent))
	}
	m := sender.sent[0]
	if m.to != "contact@playrpg.net" || m.replyTo != "a@example.com" {
		t.Errorf("to/replyTo = %q/%q", m.to, m.replyTo)
	}
	if !strings.Contains(m.subject, "Bug") || !strings.Contains(m.subject, "Mapa") {
		t.Errorf("subject = %q", m.subject)
	}
	if !strings.Contains(m.body, "Nie działa mgła") || !strings.Contains(m.body, "Not logged in") {
		t.Errorf("body = %q", m.body)
	}
}

func TestContact_IncludesAccountOfLoggedInUser(t *testing.T) {
	sender := &fakeContactSender{configured: true}
	claims := jwt.MapClaims{"user_id": "64aa00000000000000000001", "email": "gm@example.com"}
	w := postContact(t, sender, `{"type":"other","message":"Hello"}`, claims)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	body := sender.sent[0].body
	if !strings.Contains(body, "64aa00000000000000000001") || !strings.Contains(body, "gm@example.com") {
		t.Errorf("body lacks the account: %q", body)
	}
	if sender.sent[0].replyTo != "" {
		t.Errorf("replyTo = %q, want empty when the form has no e-mail", sender.sent[0].replyTo)
	}
}

func TestContact_ContentReportCarriesTermsFields(t *testing.T) {
	sender := &fakeContactSender{configured: true}
	w := postContact(t, sender, `{"type":"content","name":"Jan Kowalski","email":"jan@example.com",
		"contentLocation":"Gra Smoki, scena 2","justification":"Skan podręcznika","goodFaith":true}`, nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
	}
	body := sender.sent[0].body
	for _, want := range []string{"Jan Kowalski", "jan@example.com", "Gra Smoki, scena 2", "Skan podręcznika", "Good-faith declaration: confirmed"} {
		if !strings.Contains(body, want) {
			t.Errorf("body lacks %q: %q", want, body)
		}
	}
	if !strings.Contains(sender.sent[0].subject, "Content report") {
		t.Errorf("subject = %q", sender.sent[0].subject)
	}
}

func TestContact_ChildAbuseReportNeedsNoIdentity(t *testing.T) {
	sender := &fakeContactSender{configured: true}
	w := postContact(t, sender, `{"type":"content","childAbuse":true,"contentLocation":"Gra X",
		"justification":"...","goodFaith":true}`, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(sender.sent[0].body, "Child sexual abuse report: yes") {
		t.Errorf("body = %q", sender.sent[0].body)
	}
}

func TestContact_RejectsInvalidRequests(t *testing.T) {
	long := strings.Repeat("x", contactMessageMax+1)
	cases := map[string]string{
		"unknown type":                 `{"type":"spam","message":"hi"}`,
		"bug without message":          `{"type":"bug","message":"   "}`,
		"malformed e-mail":             `{"type":"bug","message":"hi","email":"not-an-email"}`,
		"e-mail with a line break":     `{"type":"bug","message":"hi","email":"a@example.com\r\nBcc: x@example.com"}`,
		"message too long":             `{"type":"bug","message":"` + long + `"}`,
		"report without location":      `{"type":"content","name":"J","email":"j@example.com","justification":"j","goodFaith":true}`,
		"report without justification": `{"type":"content","name":"J","email":"j@example.com","contentLocation":"l","goodFaith":true}`,
		"report without good faith":    `{"type":"content","name":"J","email":"j@example.com","contentLocation":"l","justification":"j"}`,
		"report without name":          `{"type":"content","email":"j@example.com","contentLocation":"l","justification":"j","goodFaith":true}`,
		"report without e-mail":        `{"type":"content","name":"J","contentLocation":"l","justification":"j","goodFaith":true}`,
		"not json":                     `type=bug`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			sender := &fakeContactSender{configured: true}
			if w := postContact(t, sender, body, nil); w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", w.Code)
			}
			if len(sender.sent) != 0 {
				t.Error("an invalid request was sent")
			}
		})
	}
}

// Bots fill every input, including the one hidden from people. They get a success response so
// they do not learn to skip the field, but nothing is sent.
func TestContact_HoneypotSwallowsTheMessage(t *testing.T) {
	sender := &fakeContactSender{configured: true}
	w := postContact(t, sender, `{"type":"bug","message":"buy now","website":"http://spam.example"}`, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if len(sender.sent) != 0 {
		t.Error("honeypot submission was sent")
	}
}

func TestContact_UnavailableWithoutSMTP(t *testing.T) {
	w := postContact(t, &fakeContactSender{configured: false}, `{"type":"bug","message":"hi"}`, nil)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}

func TestContact_SendFailureIs502(t *testing.T) {
	w := postContact(t, &fakeContactSender{configured: true, err: errors.New("smtp down")}, `{"type":"bug","message":"hi"}`, nil)
	if w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", w.Code)
	}
}

func TestContact_RejectsOversizedBody(t *testing.T) {
	sender := &fakeContactSender{configured: true}
	huge := `{"type":"bug","message":"hi","name":"` + strings.Repeat("x", contactBodyMaxBytes) + `"}`
	if w := postContact(t, sender, huge, nil); w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}
