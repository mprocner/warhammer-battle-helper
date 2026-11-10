// migrate-participant-colors gives every participant of an existing game a default colour
// (PLAYRPG-340).
//
//	games.participants[].color: unset -> next free palette colour, in JoinedAt order
//
// Participants who already have a colour keep it and count as taken. The write only fills a colour
// that is still unset, so a participant who picked one while the script ran keeps theirs, and a
// second run reports zeros. Run it right after deploying: until then participants of old games
// render with the neutral fallback colour.
//
// Usage:
//
//	MONGO_URI='mongodb://root:example@localhost:27018/?authSource=admin' MONGO_DB=battle_helper go run ./cmd/migrate-participant-colors/
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"
	"time"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// colourAssignment is one participant who needs a colour and the colour they get.
type colourAssignment struct {
	UserID primitive.ObjectID
	Color  string
}

// assignColours picks colours for the participants without one, oldest join first, with the same
// rule a live join uses. The input slice is not modified.
func assignColours(participants []models.GameParticipant) []colourAssignment {
	ps := append([]models.GameParticipant(nil), participants...)
	sort.SliceStable(ps, func(i, j int) bool { return ps[i].JoinedAt.Before(ps[j].JoinedAt) })
	var out []colourAssignment
	for i := range ps {
		if ps[i].Color != "" {
			continue
		}
		ps[i].Color, _ = models.NextParticipantColor(ps)
		out = append(out, colourAssignment{UserID: ps[i].UserID, Color: ps[i].Color})
	}
	return out
}

func migrateGames(ctx context.Context, games *mongo.Collection) (nGames, nParticipants int) {
	cur, err := games.Find(ctx,
		bson.M{"participants": bson.M{"$elemMatch": bson.M{"color": bson.M{"$in": bson.A{nil, ""}}}}},
		options.Find().SetProjection(bson.M{"participants": 1}))
	if err != nil {
		log.Fatalf("find games: %v", err)
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var game struct {
			ID           primitive.ObjectID       `bson:"_id"`
			Participants []models.GameParticipant `bson:"participants"`
		}
		if err := cur.Decode(&game); err != nil {
			log.Printf("decode game: %v", err)
			continue
		}
		touched := false
		for _, a := range assignColours(game.Participants) {
			res, err := games.UpdateOne(ctx,
				bson.M{"_id": game.ID},
				bson.M{"$set": bson.M{"participants.$[p].color": a.Color}},
				options.Update().SetArrayFilters(options.ArrayFilters{Filters: []interface{}{
					bson.M{"p.userId": a.UserID, "p.color": bson.M{"$in": bson.A{nil, ""}}},
				}}))
			if err != nil {
				log.Printf("game %s participant %s: %v", game.ID.Hex(), a.UserID.Hex(), err)
				continue
			}
			if res.ModifiedCount > 0 {
				nParticipants++
				touched = true
			}
		}
		if touched {
			nGames++
		}
	}
	if err := cur.Err(); err != nil {
		log.Fatalf("iterate games: %v", err)
	}
	return nGames, nParticipants
}

func main() {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27018"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		log.Fatal("MONGO_DB env variable is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer client.Disconnect(ctx)

	nGames, nParticipants := migrateGames(ctx, client.Database(dbName).Collection("games"))
	fmt.Printf("games migrated: %d\nparticipants coloured: %d\n", nGames, nParticipants)
}
