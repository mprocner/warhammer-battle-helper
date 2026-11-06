package email

import (
	"bytes"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net/mail"
	"strings"
)

// SendContactMessage delivers a contact-form message as plain text to the service's own mailbox.
// replyTo is the reporter's address (empty = no Reply-To). Every header value that may carry user
// input is either rejected (replyTo) or stripped of CR/LF (subject), so a submission cannot add
// headers such as Bcc or start the body early.
func (s *EmailService) SendContactMessage(to, replyTo, subject, body string) error {
	if !s.Configured() {
		return fmt.Errorf("SMTP not configured")
	}

	var head strings.Builder
	fmt.Fprintf(&head, "To: %s\r\n", to)
	fmt.Fprintf(&head, "From: PlayRPG <%s>\r\n", s.from)
	if replyTo != "" {
		addr, err := parseSingleAddress(replyTo)
		if err != nil {
			return fmt.Errorf("invalid reply-to: %w", err)
		}
		fmt.Fprintf(&head, "Reply-To: <%s>\r\n", addr)
	}
	// RFC 2047 encoding keeps non-ASCII subjects (Polish diacritics) intact in every client.
	fmt.Fprintf(&head, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", stripLineBreaks(subject)))
	head.WriteString("MIME-Version: 1.0\r\n")
	head.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	head.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")

	var encoded bytes.Buffer
	qp := quotedprintable.NewWriter(&encoded)
	// The text-mode writer turns "\n" into CRLF, which SMTP requires.
	if _, err := qp.Write([]byte(body)); err != nil {
		return err
	}
	if err := qp.Close(); err != nil {
		return err
	}

	return s.send([]string{to}, append([]byte(head.String()), encoded.Bytes()...))
}

// parseSingleAddress accepts exactly one bare address and returns it without a display name.
func parseSingleAddress(raw string) (string, error) {
	if strings.ContainsAny(raw, "\r\n") {
		return "", fmt.Errorf("address contains a line break")
	}
	addr, err := mail.ParseAddress(raw)
	if err != nil {
		return "", err
	}
	return addr.Address, nil
}

func stripLineBreaks(s string) string {
	return strings.NewReplacer("\r", " ", "\n", " ").Replace(s)
}
