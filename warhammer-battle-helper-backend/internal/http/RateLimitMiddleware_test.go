package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// fakeClock is a manually advanced time source for the limiter.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newTestLimiter(limit int, window time.Duration) (*IPRateLimiter, *fakeClock) {
	clock := &fakeClock{t: time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)}
	l := NewIPRateLimiter(limit, window)
	l.now = clock.now
	return l, clock
}

func TestIPRateLimiter_AllowsUpToLimitPerKey(t *testing.T) {
	l, _ := newTestLimiter(3, 10*time.Minute)
	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("1.1.1.1"); !ok {
			t.Fatalf("request %d rejected, want allowed", i+1)
		}
	}
	if ok, retry := l.Allow("1.1.1.1"); ok || retry <= 0 {
		t.Fatalf("4th request: ok=%v retry=%v, want rejected with a positive retry", ok, retry)
	}
	if ok, _ := l.Allow("2.2.2.2"); !ok {
		t.Fatal("another IP was rejected; limits must be per key")
	}
}

// The window slides: a slot frees up when its oldest hit is older than the window.
func TestIPRateLimiter_SlidingWindow(t *testing.T) {
	l, clock := newTestLimiter(2, 10*time.Minute)
	l.Allow("ip")
	clock.advance(6 * time.Minute)
	l.Allow("ip")
	if ok, retry := l.Allow("ip"); ok || retry != 4*time.Minute {
		t.Fatalf("ok=%v retry=%v, want rejected with retry 4m", ok, retry)
	}
	clock.advance(4 * time.Minute)
	if ok, _ := l.Allow("ip"); !ok {
		t.Fatal("request after the oldest hit expired was rejected")
	}
}

func TestIPRateLimiter_PrunesIdleKeys(t *testing.T) {
	l, clock := newTestLimiter(1, time.Minute)
	l.Allow("a")
	l.Allow("b")
	clock.advance(2 * time.Minute)
	l.prune()
	if len(l.hits) != 0 {
		t.Fatalf("hits has %d keys after prune, want 0", len(l.hits))
	}
}

func TestRateLimitMiddleware_Returns429WithRetryAfter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	l, _ := newTestLimiter(1, 10*time.Minute)
	r := gin.New()
	r.POST("/contact", RateLimitMiddleware(l), func(c *gin.Context) { c.Status(http.StatusOK) })

	send := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/contact", nil)
		req.RemoteAddr = "203.0.113.7:5555"
		r.ServeHTTP(w, req)
		return w
	}

	if w := send(); w.Code != http.StatusOK {
		t.Fatalf("first status = %d, want 200", w.Code)
	}
	w := send()
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") != "600" {
		t.Errorf("Retry-After = %q, want 600", w.Header().Get("Retry-After"))
	}
}

// Behind nginx the TCP peer is the proxy; the limiter must key on the client it forwards, and
// only when the peer is a trusted proxy — otherwise anyone could pick their own key.
func TestRateLimitMiddleware_KeysOnClientIPBehindTrustedProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	l, _ := newTestLimiter(1, 10*time.Minute)
	r := gin.New()
	ConfigureClientIP(r, DefaultTrustedProxies)
	r.POST("/contact", RateLimitMiddleware(l), func(c *gin.Context) { c.Status(http.StatusOK) })

	send := func(peer, realIP string) int {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/contact", nil)
		req.RemoteAddr = peer
		req.Header.Set("X-Real-IP", realIP)
		r.ServeHTTP(w, req)
		return w.Code
	}

	// Two different clients through the same proxy each get their own budget.
	if code := send("172.18.0.1:4000", "198.51.100.1"); code != http.StatusOK {
		t.Fatalf("client 1: %d", code)
	}
	if code := send("172.18.0.1:4001", "198.51.100.2"); code != http.StatusOK {
		t.Fatalf("client 2: %d", code)
	}
	if code := send("172.18.0.1:4002", "198.51.100.1"); code != http.StatusTooManyRequests {
		t.Fatalf("client 1 again: %d, want 429", code)
	}

	// A direct (untrusted) peer cannot dodge the limit by rotating X-Real-IP.
	if code := send("203.0.113.9:1", "10.0.0.1"); code != http.StatusOK {
		t.Fatalf("direct 1: %d", code)
	}
	if code := send("203.0.113.9:2", "10.0.0.2"); code != http.StatusTooManyRequests {
		t.Fatalf("direct 2 with a spoofed header: %d, want 429", code)
	}
}
