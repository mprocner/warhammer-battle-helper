package http

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// newVaryEngine builds a router shaped like main.go's: VaryOrigin first, the CORS
// middleware second, then a cacheable static-file style handler.
func newVaryEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(VaryOrigin())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		AllowCredentials: true,
		AllowWildcard:    true,
	}))
	r.GET("/user-files/:filename", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=86400")
		c.Data(200, "image/png", []byte("not-really-a-png"))
	})
	return r
}

// An <img src> load sends no Origin header, so gin-contrib/cors returns early and
// adds nothing. Without Vary the browser caches that header-less response as the
// only variant of the URL, and a later CORS fetch of the same file is served from
// cache and rejected for having no Access-Control-Allow-Origin.
func TestVaryOrigin_SetWhenRequestHasNoOrigin(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/user-files/x.png", nil)

	newVaryEngine().ServeHTTP(w, req)

	if got := w.Header().Values("Vary"); len(got) != 1 || got[0] != "Origin" {
		t.Fatalf("Vary = %v, want exactly [Origin]", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty without an Origin request header", got)
	}
}

// With an Origin header the CORS middleware sets Vary itself. It uses Set rather
// than Add, so ours must not survive as a duplicate.
func TestVaryOrigin_NotDuplicatedWhenCorsAlsoSetsIt(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/user-files/x.png", nil)
	req.Header.Set("Origin", "http://localhost:3000")

	newVaryEngine().ServeHTTP(w, req)

	if got := w.Header().Values("Vary"); len(got) != 1 || got[0] != "Origin" {
		t.Fatalf("Vary = %v, want exactly [Origin]", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want http://localhost:3000", got)
	}
}
