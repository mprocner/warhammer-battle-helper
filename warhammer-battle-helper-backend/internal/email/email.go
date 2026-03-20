package email

import (
	"fmt"
	"net/smtp"
	"os"
)

type EmailService struct {
	host     string
	port     string
	username string
	password string
	from     string
	appURL   string
}

func NewEmailService() *EmailService {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	username := os.Getenv("SMTP_USER")
	password := os.Getenv("SMTP_PASSWORD")
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = username
	}
	appURL := os.Getenv("APP_URL")
	if appURL == "" {
		appURL = "http://localhost:3000"
	}
	return &EmailService{
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     from,
		appURL:   appURL,
	}
}

func (s *EmailService) Configured() bool {
	return s.host != "" && s.username != "" && s.password != ""
}

func (s *EmailService) SendActivationEmail(to, token string) error {
	if !s.Configured() {
		return fmt.Errorf("SMTP not configured")
	}

	activationLink := fmt.Sprintf("%s/verify-email?token=%s", s.appURL, token)

	subject := "Confirm your PlayRPG account"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 10px;">Welcome to PlayRPG!</h1>
  <p style="font-size: 16px;">Thank you for creating your account. You're almost ready to roll the dice!</p>
  <p style="font-size: 16px;">Please confirm your email address by clicking the button below:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="%s"
       style="background-color: #e94560; color: white; padding: 14px 28px; text-decoration: none;
              border-radius: 4px; display: inline-block; font-size: 16px; font-weight: bold;">
      Confirm Email Address
    </a>
  </div>
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 14px; color: #666; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">%s</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="font-size: 12px; color: #999;">If you did not create an account on PlayRPG, you can safely ignore this email.</p>
</body>
</html>`, activationLink, activationLink)

	msg := []byte(fmt.Sprintf(
		"To: %s\r\nFrom: PlayRPG <%s>\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		to, s.from, subject, body,
	))

	addr := fmt.Sprintf("%s:%s", s.host, s.port)
	auth := smtp.PlainAuth("", s.username, s.password, s.host)

	return smtp.SendMail(addr, auth, s.from, []string{to}, msg)
}

func (s *EmailService) SendPasswordResetEmail(to, token string) error {
	if !s.Configured() {
		return fmt.Errorf("SMTP not configured")
	}

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.appURL, token)

	subject := "Reset your PlayRPG password"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 10px;">Password Reset</h1>
  <p style="font-size: 16px;">We received a request to reset the password for your PlayRPG account.</p>
  <p style="font-size: 16px;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="%s"
       style="background-color: #e94560; color: white; padding: 14px 28px; text-decoration: none;
              border-radius: 4px; display: inline-block; font-size: 16px; font-weight: bold;">
      Reset Password
    </a>
  </div>
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 14px; color: #666; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">%s</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="font-size: 12px; color: #999;">If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>
</body>
</html>`, resetLink, resetLink)

	msg := []byte(fmt.Sprintf(
		"To: %s\r\nFrom: PlayRPG <%s>\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		to, s.from, subject, body,
	))

	addr := fmt.Sprintf("%s:%s", s.host, s.port)
	auth := smtp.PlainAuth("", s.username, s.password, s.host)

	return smtp.SendMail(addr, auth, s.from, []string{to}, msg)
}
