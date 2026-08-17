package websocket

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// isClosed reports whether ch is closed. A buffered, empty, open channel hits the default
// branch; a closed one yields ok == false.
func isClosed(ch chan []byte) bool {
	select {
	case _, ok := <-ch:
		return !ok
	default:
		return false
	}
}

func TestHub_DisconnectUser(t *testing.T) {
	h := NewHub()

	target := primitive.NewObjectID()
	bystander := primitive.NewObjectID()

	tabOne := &Client{ID: target, GameID: "g1", Send: make(chan []byte, 1)}
	tabTwo := &Client{ID: target, GameID: "g1", Send: make(chan []byte, 1)}
	other := &Client{ID: bystander, GameID: "g1", Send: make(chan []byte, 1)}
	elsewhere := &Client{ID: target, GameID: "g2", Send: make(chan []byte, 1)}

	h.Games["g1"] = map[*Client]bool{tabOne: true, tabTwo: true, other: true}
	h.Games["g2"] = map[*Client]bool{elsewhere: true}

	h.DisconnectUser("g1", target)

	if !isClosed(tabOne.Send) || !isClosed(tabTwo.Send) {
		t.Error("every tab of the target user in that game must be closed")
	}
	if isClosed(other.Send) {
		t.Error("another user in the same game must be left alone")
	}
	if isClosed(elsewhere.Send) {
		t.Error("the same user in a different game must be left alone")
	}

	if len(h.Games["g1"]) != 1 {
		t.Errorf("game g1 holds %d clients, want 1", len(h.Games["g1"]))
	}
	if _, still := h.Games["g1"][tabOne]; still {
		t.Error("disconnected client must be removed from the game room")
	}
}

func TestHub_DisconnectUser_UnknownGame(t *testing.T) {
	h := NewHub()

	// Must not panic on a game with no clients registered.
	h.DisconnectUser("nope", primitive.NewObjectID())
}
