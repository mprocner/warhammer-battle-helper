package http

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ContactSender is the part of email.EmailService the contact form needs; tests use a fake.
type ContactSender interface {
	Configured() bool
	SendContactMessage(to, replyTo, subject, body string) error
}

// ContactHandler serves the public contact form (bug reports, content reports per terms §4, other
// messages). Nothing is stored: the message goes straight to the service mailbox (Recipient).
type ContactHandler struct {
	Sender    ContactSender
	Recipient string
}

// Length caps in characters. contactBodyMaxBytes bounds the whole JSON body before decoding.
const (
	contactNameMax      = 200
	contactEmailMax     = 254
	contactSubjectMax   = 150
	contactMessageMax   = 5000
	contactLocationMax  = 1000
	contactBodyMaxBytes = 64 << 10
)

const (
	contactTypeBug     = "bug"
	contactTypeContent = "content"
	contactTypeOther   = "other"
)

var contactTypeLabels = map[string]string{
	contactTypeBug:     "Bug report / feedback",
	contactTypeContent: "Content report",
	contactTypeOther:   "Other",
}

type ContactRequest struct {
	Type            string `json:"type"`
	Name            string `json:"name"`
	Email           string `json:"email"`
	Subject         string `json:"subject"`
	Message         string `json:"message"`
	ContentLocation string `json:"contentLocation"`
	Justification   string `json:"justification"`
	GoodFaith       bool   `json:"goodFaith"`
	ChildAbuse      bool   `json:"childAbuse"`
	// Website is a honeypot: the form hides it from people, so only bots fill it in.
	Website string `json:"website"`
}

// contactAccount identifies the logged-in sender, taken from the JWT, never from the form.
type contactAccount struct{ userID, email string }

func (r *ContactRequest) trim() {
	for _, f := range []*string{&r.Type, &r.Name, &r.Email, &r.Subject, &r.Message, &r.ContentLocation, &r.Justification, &r.Website} {
		*f = strings.TrimSpace(*f)
	}
}

func tooLong(s string, max int) bool { return utf8.RuneCountInString(s) > max }

// validate enforces the same rules as the form. For a content report it mirrors terms §4: the
// content, a justification and a good-faith declaration are always required; the reporter's name
// and e-mail are required unless the report concerns child sexual abuse.
func (r *ContactRequest) validate() error {
	if _, ok := contactTypeLabels[r.Type]; !ok {
		return errors.New("unknown type")
	}
	if tooLong(r.Name, contactNameMax) || tooLong(r.Email, contactEmailMax) || tooLong(r.Subject, contactSubjectMax) ||
		tooLong(r.Message, contactMessageMax) || tooLong(r.ContentLocation, contactLocationMax) ||
		tooLong(r.Justification, contactMessageMax) {
		return errors.New("field too long")
	}
	if r.Email != "" {
		addr, err := mail.ParseAddress(r.Email)
		// Equality rejects display-name forms ("Jan <j@x>") and anything with CR/LF.
		if err != nil || addr.Address != r.Email {
			return errors.New("invalid email")
		}
	}

	if r.Type != contactTypeContent {
		if r.Message == "" {
			return errors.New("message is required")
		}
		return nil
	}
	if r.ContentLocation == "" {
		return errors.New("contentLocation is required")
	}
	if r.Justification == "" {
		return errors.New("justification is required")
	}
	if !r.GoodFaith {
		return errors.New("goodFaith declaration is required")
	}
	if !r.ChildAbuse && (r.Name == "" || r.Email == "") {
		return errors.New("name and email are required")
	}
	return nil
}

func valueOrDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func yesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

// compose renders the e-mail. It is in English: the mailbox is read by the operator, not the user.
func (r *ContactRequest) compose(account *contactAccount) (subject, body string) {
	label := contactTypeLabels[r.Type]
	subject = "[PlayRPG] " + label
	if r.Subject != "" {
		subject += ": " + r.Subject
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Type: %s\n", label)
	fmt.Fprintf(&b, "Name: %s\n", valueOrDash(r.Name))
	fmt.Fprintf(&b, "E-mail: %s\n", valueOrDash(r.Email))
	if account != nil {
		fmt.Fprintf(&b, "Account: user id %s (account e-mail %s)\n", account.userID, valueOrDash(account.email))
	} else {
		b.WriteString("Account: Not logged in\n")
	}
	if r.Subject != "" {
		fmt.Fprintf(&b, "Subject: %s\n", r.Subject)
	}
	if r.Type == contactTypeContent {
		fmt.Fprintf(&b, "Child sexual abuse report: %s\n", yesNo(r.ChildAbuse))
		b.WriteString("Good-faith declaration: confirmed\n")
		fmt.Fprintf(&b, "\nReported content:\n%s\n", r.ContentLocation)
		fmt.Fprintf(&b, "\nJustification:\n%s\n", r.Justification)
	}
	if r.Message != "" {
		fmt.Fprintf(&b, "\nMessage:\n%s\n", r.Message)
	}
	return subject, b.String()
}

func accountFromContext(c *gin.Context) *contactAccount {
	raw, ok := c.Get("jwt")
	if !ok {
		return nil
	}
	token, ok := raw.(*jwt.Token)
	if !ok {
		return nil
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil
	}
	userID, _ := claims["user_id"].(string)
	if userID == "" {
		return nil
	}
	email, _ := claims["email"].(string)
	return &contactAccount{userID: userID, email: email}
}

// Submit handles POST /contact. Public; JWTOptionalMiddleware adds the account when logged in.
func (h *ContactHandler) Submit(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, contactBodyMaxBytes)
	var req ContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	req.trim()

	if req.Website != "" {
		c.JSON(http.StatusOK, gin.H{"status": "sent"})
		return
	}
	if err := req.validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !h.Sender.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "contact form unavailable"})
		return
	}

	subject, body := req.compose(accountFromContext(c))
	if err := h.Sender.SendContactMessage(h.Recipient, req.Email, subject, body); err != nil {
		log.Printf("contact form: send failed: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "could not send the message"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "sent"})
}
