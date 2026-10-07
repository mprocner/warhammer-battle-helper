package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"battle-helper/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// postRollExpression drives the handler with a raw JSON body. An invalid expression fails in
// dice.Parse before any service port is touched, so the nil ports are safe.
func postRollExpression(t *testing.T, body string) (int, map[string]interface{}) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/games/x/rollExpression", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: primitive.NewObjectID().Hex()}}
	c.Set("jwt", &jwt.Token{Claims: jwt.MapClaims{"user_id": primitive.NewObjectID().Hex(), "email": "a@b"}})

	h := &DiceRollHandler{DiceRollService: service.NewDiceRollService(nil, nil, nil, nil, nil, nil)}
	h.RollExpression(c)

	var got map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("body is not JSON: %v (%s)", err, w.Body.String())
	}
	return w.Code, got
}

// The frontend adapter (src/api/diceRolls.js) reads these exact keys.
func TestRollExpression_InvalidExpressionBodyContract(t *testing.T) {
	status, got := postRollExpression(t, `{"expression":"3d6kh4"}`)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d", status)
	}
	want := map[string]interface{}{
		"error":    "invalid_expression",
		"code":     "keep_out_of_range",
		"position": float64(0),
		"params":   map[string]interface{}{"max": float64(3)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("body = %v, want %v", got, want)
	}
}

func TestRollExpression_InvalidExpressionNullParams(t *testing.T) {
	status, got := postRollExpression(t, `{"expression":"2x6"}`)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d", status)
	}
	if got["error"] != "invalid_expression" || got["code"] != "unexpected_token" || got["position"] != float64(1) {
		t.Errorf("body = %v", got)
	}
	if p, present := got["params"]; !present || p != nil {
		t.Errorf("params = %v (present=%v), want JSON null", p, present)
	}
}

func TestRollExpression_MissingExpressionIsBindingError(t *testing.T) {
	status, got := postRollExpression(t, `{}`)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d", status)
	}
	if got["error"] == "invalid_expression" {
		t.Errorf("binding error must not look like a dice error: %v", got)
	}
}
