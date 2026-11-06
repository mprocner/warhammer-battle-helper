package http

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestLogger is gin's access log without the two personal parts of the default one:
// the client IP and the query string. The query string matters because the WebSocket URL
// carries the JWT (?token=...), and the activation and reset links carry their secret
// tokens the same way. Client IPs are kept only in the reverse proxy's log, which rotates
// on a fixed schedule; the container log rotates by size only, so it cannot promise a
// retention period (see the privacy policy and DEPLOY.md, "Logs and retention").
func RequestLogger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(formatRequestLog)
}

func formatRequestLog(p gin.LogFormatterParams) string {
	path := p.Path
	if p.Request != nil && p.Request.URL != nil {
		path = p.Request.URL.Path
	}
	line := fmt.Sprintf("[GIN] %s | %3d | %13v | %-7s %s\n",
		p.TimeStamp.Format(time.RFC3339), p.StatusCode, p.Latency, p.Method, path)
	if p.ErrorMessage != "" {
		line += p.ErrorMessage
	}
	return line
}
