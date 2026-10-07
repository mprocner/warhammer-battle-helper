package service

import "go.mongodb.org/mongo-driver/bson/primitive"

// hubBroadcaster is the slice of websocket.Hub that roll routing needs.
type hubBroadcaster interface {
	BroadcastToGame(gameID, messageType string, payload map[string]interface{})
	BroadcastToUsers(gameID, messageType string, payload map[string]interface{}, userIDs []string)
}

// RollPublisher sends a roll or chat event to exactly the users its visibility allows.
type RollPublisher struct {
	hub hubBroadcaster
}

func NewRollPublisher(hub hubBroadcaster) *RollPublisher {
	return &RollPublisher{hub: hub}
}

// Publish routes by visibility: "all" | "gm_only" | "gm_and_roller" | a target user id.
func (p *RollPublisher) Publish(gameID, eventType string, payload map[string]interface{}, visibility string, rollerID, gmID primitive.ObjectID) {
	switch visibility {
	case "gm_only":
		p.hub.BroadcastToUsers(gameID, eventType, payload, []string{gmID.Hex()})
	case "gm_and_roller":
		targets := []string{gmID.Hex()}
		if rollerID != gmID {
			targets = append(targets, rollerID.Hex())
		}
		p.hub.BroadcastToUsers(gameID, eventType, payload, targets)
	case "all", "":
		p.hub.BroadcastToGame(gameID, eventType, payload)
	default: // targeted to a specific user id — only the roller and that user receive it (GM excluded)
		targets := []string{rollerID.Hex()}
		if visibility != rollerID.Hex() {
			targets = append(targets, visibility)
		}
		p.hub.BroadcastToUsers(gameID, eventType, payload, targets)
	}
}
