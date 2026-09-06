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

func TestHub_BroadcastExceptUsers(t *testing.T) {
	h := NewHub()

	excluded := primitive.NewObjectID()
	included := primitive.NewObjectID()
	otherGame := primitive.NewObjectID()

	gmTab := &Client{ID: excluded, GameID: "g1", Send: make(chan []byte, 1)}
	playerTab := &Client{ID: included, GameID: "g1", Send: make(chan []byte, 1)}
	elsewhere := &Client{ID: otherGame, GameID: "g2", Send: make(chan []byte, 1)}

	h.Games["g1"] = map[*Client]bool{gmTab: true, playerTab: true}
	h.Games["g2"] = map[*Client]bool{elsewhere: true}

	h.BroadcastExceptUsers("g1", "SOME_EVENT", map[string]interface{}{"k": "v"}, []string{excluded.Hex()})

	if len(gmTab.Send) != 0 {
		t.Error("an excluded user must receive nothing")
	}
	if len(playerTab.Send) != 1 {
		t.Errorf("a non-excluded user in the game must receive the message, got %d", len(playerTab.Send))
	}
	if len(elsewhere.Send) != 0 {
		t.Error("a client in another game must receive nothing")
	}
}

func TestHub_BroadcastExceptUsers_EmptyExclusionReachesEveryone(t *testing.T) {
	h := NewHub()

	a := &Client{ID: primitive.NewObjectID(), GameID: "g1", Send: make(chan []byte, 1)}
	b := &Client{ID: primitive.NewObjectID(), GameID: "g1", Send: make(chan []byte, 1)}
	h.Games["g1"] = map[*Client]bool{a: true, b: true}

	h.BroadcastExceptUsers("g1", "SOME_EVENT", map[string]interface{}{}, nil)

	if len(a.Send) != 1 || len(b.Send) != 1 {
		t.Error("an empty exclusion list must reach every client in the game")
	}
}
