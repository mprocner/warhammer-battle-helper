package http

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"battle-helper/internal/combat"
	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
)

func TestWriteCombatError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		err  error
		code int
	}{
		{service.ErrCombatInvalid, http.StatusBadRequest},
		{combat.ErrBadOrder, http.StatusBadRequest},
		{service.ErrCombatForbidden, http.StatusForbidden},
		{combat.ErrConflict, http.StatusConflict},
		{fmt.Errorf("wrapped: %w", combat.ErrConflict), http.StatusConflict},
		{service.ErrCombatNotFound, http.StatusNotFound},
		{service.ErrCombatSceneNotFound, http.StatusNotFound},
		{combat.ErrEntryNotFound, http.StatusNotFound},
		{errors.New("mongo: connection refused at 10.0.0.5"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		writeCombatError(c, tc.err)
		if w.Code != tc.code {
			t.Errorf("%v: status %d, want %d", tc.err, w.Code, tc.code)
		}
		if tc.code == http.StatusInternalServerError && strings.Contains(w.Body.String(), "10.0.0.5") {
			t.Errorf("internal error leaked to the client: %s", w.Body.String())
		}
	}
}
