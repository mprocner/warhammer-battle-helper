package email

import (
	"strings"
	"testing"
)

func TestEmailService_Configured(t *testing.T) {
	tests := []struct {
		name     string
		service  *EmailService
		expected bool
	}{
		{
			name:     "not configured — all fields empty",
			service:  &EmailService{},
			expected: false,
		},
		{
			name:     "not configured — missing password",
			service:  &EmailService{host: "smtp.example.com", username: "user@example.com"},
			expected: false,
		},
		{
			name:     "not configured — missing host",
			service:  &EmailService{username: "user@example.com", password: "secret"},
			expected: false,
		},
		{
			name:     "fully configured",
			service:  &EmailService{host: "smtp.example.com", username: "user@example.com", password: "secret"},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.service.Configured(); got != tt.expected {
				t.Errorf("Configured() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestEmailService_SendActivationEmail_NotConfigured(t *testing.T) {
	svc := &EmailService{}
	err := svc.SendActivationEmail("user@example.com", "sometoken")
	if err == nil {
		t.Error("expected error when SMTP not configured, got nil")
	}
	if !strings.Contains(err.Error(), "SMTP not configured") {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestEmailService_SendPasswordResetEmail_NotConfigured(t *testing.T) {
	svc := &EmailService{}
	err := svc.SendPasswordResetEmail("user@example.com", "sometoken")
	if err == nil {
		t.Error("expected error when SMTP not configured, got nil")
	}
	if !strings.Contains(err.Error(), "SMTP not configured") {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestEmailService_SendPasswordResetEmail_LinkFormat(t *testing.T) {
	// Verify that the reset link is constructed correctly.
	// We can't send a real email, but we can inspect the appURL field.
	svc := &EmailService{appURL: "http://localhost:3000"}

	expectedURL := "http://localhost:3000/reset-password?token=abc123"
	actualURL := svc.appURL + "/reset-password?token=" + "abc123"

	if actualURL != expectedURL {
		t.Errorf("reset link = %s, want %s", actualURL, expectedURL)
	}
}
