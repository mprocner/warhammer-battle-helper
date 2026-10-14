package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
)

// Every case here is rejected before the store is touched, so the nil store is safe.
func adminSystemsRequest(t *testing.T, method, system, body string, handle func(*AdminHandler, *gin.Context)) int {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/admin/systems/"+system, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: system}}
	handle(&AdminHandler{SystemAccess: service.NewSystemAccessService(nil)}, c)
	return w.Code
}

func TestUpdateSystemRejectsBadInput(t *testing.T) {
	cases := []struct {
		name, system, body string
	}{
		{"custom is not configurable", "custom", `{"allUsers":true,"userIds":[]}`},
		{"unknown system", "pf2e", `{"allUsers":true,"userIds":[]}`},
		{"malformed user id", "srd5", `{"allUsers":false,"userIds":["nope"]}`},
		{"missing allUsers", "srd5", `{"userIds":[]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code := adminSystemsRequest(t, http.MethodPatch, tc.system, tc.body, (*AdminHandler).UpdateSystem)
			if code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", code)
			}
		})
	}
}

func TestGetSystemUnknownIs404(t *testing.T) {
	code := adminSystemsRequest(t, http.MethodGet, "custom", "", (*AdminHandler).GetSystem)
	if code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", code)
	}
}
