package email

import (
	"mime"
	"net/smtp"
	"strings"
	"testing"
)

// captured records what a fake SMTP transport was asked to send.
type captured struct {
	addr string
	from string
	to   []string
	msg  string
}

func configuredService(c *captured) *EmailService {
	return &EmailService{
		host: "smtp.example.com", port: "587", username: "noreply@playrpg.net", password: "secret",
		from: "noreply@playrpg.net",
		sendMail: func(addr string, _ smtp.Auth, from string, to []string, msg []byte) error {
			c.addr, c.from, c.to, c.msg = addr, from, to, string(msg)
			return nil
		},
	}
}

// header returns the raw value of the first header with the given name, or "" when absent.
func header(msg, name string) string {
	head := strings.SplitN(msg, "\r\n\r\n", 2)[0]
	for _, line := range strings.Split(head, "\r\n") {
		if strings.HasPrefix(line, name+": ") {
			return strings.TrimPrefix(line, name+": ")
		}
	}
	return ""
}

func TestSendContactMessage_NotConfigured(t *testing.T) {
	err := (&EmailService{}).SendContactMessage("contact@playrpg.net", "", "Hi", "body")
	if err == nil || !strings.Contains(err.Error(), "SMTP not configured") {
		t.Fatalf("err = %v, want SMTP not configured", err)
	}
}

func TestSendContactMessage_BuildsPlainTextMail(t *testing.T) {
	var c captured
	svc := configuredService(&c)

	if err := svc.SendContactMessage("contact@playrpg.net", "reporter@example.com", "Zgłoszenie błędu", "Linia 1\nLinia 2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if c.addr != "smtp.example.com:587" || c.from != "noreply@playrpg.net" {
		t.Errorf("addr/from = %q/%q", c.addr, c.from)
	}
	if len(c.to) != 1 || c.to[0] != "contact@playrpg.net" {
		t.Errorf("to = %v, want [contact@playrpg.net]", c.to)
	}
	if got := header(c.msg, "Reply-To"); got != "<reporter@example.com>" {
		t.Errorf("Reply-To = %q", got)
	}
	subject, err := new(mime.WordDecoder).DecodeHeader(header(c.msg, "Subject"))
	if err != nil || subject != "Zgłoszenie błędu" {
		t.Errorf("Subject decodes to %q (err %v)", subject, err)
	}
	if !strings.Contains(header(c.msg, "Content-Type"), "text/plain; charset=UTF-8") {
		t.Errorf("Content-Type = %q", header(c.msg, "Content-Type"))
	}
	if header(c.msg, "Content-Transfer-Encoding") != "quoted-printable" {
		t.Errorf("Content-Transfer-Encoding = %q", header(c.msg, "Content-Transfer-Encoding"))
	}
	body := strings.SplitN(c.msg, "\r\n\r\n", 2)[1]
	if !strings.Contains(body, "Linia 1\r\nLinia 2") {
		t.Errorf("body = %q, want CRLF line breaks", body)
	}
}

func TestSendContactMessage_OmitsReplyToWhenEmpty(t *testing.T) {
	var c captured
	if err := configuredService(&c).SendContactMessage("contact@playrpg.net", "", "Hi", "b"); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(c.msg, "Reply-To:") {
		t.Errorf("message has a Reply-To header: %q", c.msg)
	}
}

// A CR/LF smuggled into a header value would let the sender add headers (Bcc) or start the body.
func TestSendContactMessage_RejectsHeaderInjection(t *testing.T) {
	var c captured
	svc := configuredService(&c)

	if err := svc.SendContactMessage("contact@playrpg.net", "a@example.com\r\nBcc: victim@example.com", "Hi", "b"); err == nil {
		t.Error("expected an error for a Reply-To with CR/LF")
	}
	if c.msg != "" {
		t.Error("message was sent despite the invalid Reply-To")
	}

	if err := svc.SendContactMessage("contact@playrpg.net", "", "Hi\r\nBcc: victim@example.com", "b"); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(c.msg, "\r\nBcc:") {
		t.Errorf("subject injected a header: %q", c.msg)
	}
}
