package http

import "github.com/gin-gonic/gin"

// VaryOrigin marks every response as varying by Origin, whether or not the request
// carried that header.
//
// gin-contrib/cors returns early when a request has no Origin, so it emits neither
// Access-Control-Allow-Origin nor Vary. That is fine for a response nobody caches,
// but the static-file routes send Cache-Control: public, max-age=86400 — and they
// are loaded BOTH ways: an <img src> sends no Origin, while fetch() does. Without
// Vary the browser stores the header-less <img> response as the URL's only variant,
// then serves it to the CORS fetch, which fails for lacking
// Access-Control-Allow-Origin. Cropping a library image hit exactly this, and only
// after its thumbnail had been rendered — hence intermittently.
//
// Register this BEFORE the CORS middleware. That one uses Set for Vary, so on
// requests it does handle it overwrites this with the same value rather than
// appending a duplicate.
func VaryOrigin() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Vary", "Origin")
		c.Next()
	}
}
