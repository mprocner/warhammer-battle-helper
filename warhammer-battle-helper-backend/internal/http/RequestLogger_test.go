package http

import (
	"bytes"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestLoggerOmitsClientIPAndQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var buf bytes.Buffer
	r := gin.New()
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: formatRequestLog, Output: &buf}))
	r.GET("/games/:id/ws", func(c *gin.Context) { c.Status(204) })

	req := httptest.NewRequest("GET", "/games/abc/ws?token=secret.jwt.value", nil)
	req.RemoteAddr = "203.0.113.7:51234"
	req.Header.Set("X-Forwarded-For", "198.51.100.9")
	r.ServeHTTP(httptest.NewRecorder(), req)

	line := buf.String()
	if !strings.Contains(line, "GET     /games/abc/ws") || !strings.Contains(line, "204") {
		t.Fatalf("log line lacks method, path or status: %q", line)
	}
	for _, leaked := range []string{"203.0.113.7", "198.51.100.9", "token", "secret.jwt.value"} {
		if strings.Contains(line, leaked) {
			t.Errorf("log line leaks %q: %q", leaked, line)
		}
	}
}
