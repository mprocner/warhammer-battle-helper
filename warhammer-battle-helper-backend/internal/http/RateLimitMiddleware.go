package http

import (
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// IPRateLimiter is a sliding-window limiter keyed by client IP, kept in process memory.
// It is deliberately small: one backend instance, a handful of public endpoints. State is lost on
// restart and is not shared between instances — acceptable for spam protection, not for quotas.
type IPRateLimiter struct {
	mu        sync.Mutex
	limit     int
	window    time.Duration
	hits      map[string][]time.Time
	lastPrune time.Time
	now       func() time.Time
}

func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	return &IPRateLimiter{
		limit:  limit,
		window: window,
		hits:   make(map[string][]time.Time),
		now:    time.Now,
	}
}

// Allow records a hit for key and reports whether it fits in the window. When it does not, the
// second value says how long until the oldest hit in the window expires.
func (l *IPRateLimiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if now.Sub(l.lastPrune) > l.window {
		l.pruneLocked(now)
	}

	recent := l.recentLocked(key, now)
	if len(recent) >= l.limit {
		l.hits[key] = recent
		return false, recent[0].Add(l.window).Sub(now)
	}
	l.hits[key] = append(recent, now)
	return true, 0
}

// recentLocked returns the key's hits that are still inside the window.
func (l *IPRateLimiter) recentLocked(key string, now time.Time) []time.Time {
	hits := l.hits[key]
	cutoff := now.Add(-l.window)
	i := 0
	for i < len(hits) && !hits[i].After(cutoff) {
		i++
	}
	return hits[i:]
}

// prune drops keys whose hits have all expired, so the map does not grow with every IP ever seen.
func (l *IPRateLimiter) prune() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pruneLocked(l.now())
}

func (l *IPRateLimiter) pruneLocked(now time.Time) {
	for key := range l.hits {
		if recent := l.recentLocked(key, now); len(recent) == 0 {
			delete(l.hits, key)
		} else {
			l.hits[key] = recent
		}
	}
	l.lastPrune = now
}

// RateLimitMiddleware rejects requests over the limiter's budget with 429 and Retry-After. It keys
// on c.ClientIP(), which is only meaningful once ConfigureClientIP has been applied to the engine.
func RateLimitMiddleware(l *IPRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, retry := l.Allow(c.ClientIP())
		if !ok {
			c.Header("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests"})
			return
		}
		c.Next()
	}
}

// DefaultTrustedProxies covers loopback and the private ranges. In production nginx reaches the
// container through Docker's port mapping, so the TCP peer the backend sees is the Docker bridge
// gateway (a 172.16/12 address), never a public IP. A request that reaches the published port
// directly from the internet keeps its public source address and is therefore not trusted.
var DefaultTrustedProxies = []string{"127.0.0.1/8", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}

// ConfigureClientIP makes c.ClientIP() return the real client behind nginx. Forwarding headers are
// honoured only when the TCP peer is one of the trusted proxies; X-Real-IP comes first because
// nginx overwrites it with $remote_addr, whereas X-Forwarded-For keeps whatever the client sent.
func ConfigureClientIP(r *gin.Engine, trustedProxies []string) error {
	r.RemoteIPHeaders = []string{"X-Real-IP", "X-Forwarded-For"}
	return r.SetTrustedProxies(trustedProxies)
}

// ParseTrustedProxies reads a comma-separated list (the TRUSTED_PROXIES env var); empty = defaults.
func ParseTrustedProxies(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 {
		return DefaultTrustedProxies
	}
	return out
}
