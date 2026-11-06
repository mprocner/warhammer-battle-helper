package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestInviteLinkErrorStatus(t *testing.T) {
	cases := []struct {
		err  error
		want int
	}{
		{service.ErrInviteLinkInvalid, http.StatusNotFound},
		{errors.New("only the game master can manage the invite link"), http.StatusForbidden},
		{errors.New("game not found"), http.StatusNotFound},
		{errors.New("failed to set invite token: boom"), http.StatusInternalServerError},
	}
	for _, c := range cases {
		if got := inviteLinkErrorStatus(c.err); got != c.want {
			t.Errorf("inviteLinkErrorStatus(%q) = %d, want %d", c.err, got, c.want)
		}
	}
}

// postJoin drives JoinByInviteLink with a raw body. A malformed token is rejected by the service
// before any repository is touched, so a zero GameService is safe here.
func postJoin(t *testing.T, body string) (int, map[string]interface{}) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/invites/join", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("jwt", &jwt.Token{Claims: jwt.MapClaims{"user_id": primitive.NewObjectID().Hex(), "email": "a@b"}})

	h := &GameHandler{GameService: &service.GameService{}}
	h.JoinByInviteLink(c)

	var got map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("body is not JSON: %v (%s)", err, w.Body.String())
	}
	return w.Code, got
}

func TestJoinByInviteLinkRejectsMalformedToken(t *testing.T) {
	code, body := postJoin(t, `{"token":"not-a-real-token"}`)
	if code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
	if body["error"] != service.ErrInviteLinkInvalid.Error() {
		t.Fatalf("error = %v, want %q", body["error"], service.ErrInviteLinkInvalid.Error())
	}
	// An invalid link must not hint at any game.
	if _, ok := body["gameId"]; ok {
		t.Fatal("an invalid link must not return a game id")
	}
}

func TestJoinByInviteLinkRequiresToken(t *testing.T) {
	code, _ := postJoin(t, `{}`)
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}
