package repository

import (
	"battle-helper/internal/models"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type AdminRepository struct {
	Users          *mongo.Collection
	Games          *mongo.Collection
	OnlineSessions *mongo.Collection
}

func NewAdminRepository(users, games, onlineSessions *mongo.Collection) *AdminRepository {
	return &AdminRepository{Users: users, Games: games, OnlineSessions: onlineSessions}
}

// AdminUserSummary is a lightweight user record for admin list view.
type AdminUserSummary struct {
	ID          primitive.ObjectID `bson:"_id" json:"id"`
	Email       string             `bson:"email" json:"email"`
	IsAdmin     bool               `bson:"isAdmin" json:"isAdmin"`
	Active      bool               `bson:"active" json:"active"`
	FilesBytes  int64              `json:"filesBytes"`
	MusicBytes  int64              `json:"musicBytes"`
	FilesCount  int                `json:"filesCount"`
	MusicCount  int                `json:"musicCount"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
	ActivatedAt *time.Time         `bson:"activatedAt,omitempty" json:"activatedAt,omitempty"`
}

// AdminUserDetail extends AdminUserSummary with per-game info.
type AdminUserDetail struct {
	AdminUserSummary
	Games []AdminUserGame `json:"games"`
}

type AdminUserGame struct {
	GameID   string `json:"gameId"`
	GameName string `json:"gameName"`
	Role     string `json:"role"`
	LastSeen *int64 `json:"lastSeen"` // Unix timestamp, nil if never
}

// AdminGameSummary is a lightweight game record for admin list view.
type AdminGameSummary struct {
	ID               primitive.ObjectID `bson:"_id" json:"id"`
	Name             string             `bson:"name" json:"name"`
	GameSystem       string             `bson:"gameSystem" json:"gameSystem"`
	Status           string             `bson:"status" json:"status"`
	GameMasterID     primitive.ObjectID `bson:"gameMasterId" json:"gameMasterId"`
	ParticipantCount int                `json:"participantCount"`
	CreatedAt        time.Time          `bson:"createdAt" json:"createdAt"`
	DeletedAt        *time.Time         `bson:"deletedAt,omitempty" json:"deletedAt,omitempty"`
}

// AdminGameDetail extends AdminGameSummary with participant last-seen info.
type AdminGameDetail struct {
	AdminGameSummary
	Participants []AdminGameParticipant `json:"participants"`
}

type AdminGameParticipant struct {
	UserID   string `json:"userId"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	LastSeen *int64 `json:"lastSeen"` // Unix timestamp of last session EndedAt in this game
}

// StorageEntry holds disk usage per user for the storage dashboard.
type StorageEntry struct {
	ID         primitive.ObjectID `json:"id"`
	Email      string             `json:"email"`
	FilesBytes int64              `json:"filesBytes"`
	MusicBytes int64              `json:"musicBytes"`
	TotalBytes int64              `json:"totalBytes"`
}

// SessionEntry holds aggregated session stats per game for the sessions dashboard.
type SessionEntry struct {
	GameID       string `json:"gameId"`
	GameName     string `json:"gameName"`
	TotalSeconds int64  `json:"totalSeconds"`
	SessionCount int64  `json:"sessionCount"`
}

// --- USER ADMIN METHODS ---

func (r *AdminRepository) ListUsers(ctx context.Context) ([]AdminUserSummary, error) {
	opts := options.Find().SetSort(bson.D{{Key: "email", Value: 1}}).
		SetProjection(bson.M{"password": 0, "activationToken": 0, "resetToken": 0, "resetTokenExpiry": 0})

	cur, err := r.Users.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var users []models.User
	if err := cur.All(ctx, &users); err != nil {
		return nil, err
	}

	result := make([]AdminUserSummary, 0, len(users))
	for _, u := range users {
		var filesBytes, musicBytes int64
		for _, f := range u.Files {
			filesBytes += f.Size
		}
		for _, m := range u.Music {
			musicBytes += m.Size
		}
		result = append(result, AdminUserSummary{
			ID:         u.ID,
			Email:      u.Email,
			IsAdmin:    u.IsAdmin,
			Active:     u.Active,
			FilesBytes: filesBytes,
			MusicBytes: musicBytes,
			FilesCount: len(u.Files),
			MusicCount: len(u.Music),
		})
	}
	return result, nil
}

func (r *AdminRepository) GetUserDetail(ctx context.Context, userID primitive.ObjectID) (*AdminUserDetail, error) {
	var user models.User
	err := r.Users.FindOne(ctx, bson.M{"_id": userID},
		options.FindOne().SetProjection(bson.M{"password": 0, "activationToken": 0, "resetToken": 0, "resetTokenExpiry": 0}),
	).Decode(&user)
	if err != nil {
		return nil, err
	}

	var filesBytes, musicBytes int64
	for _, f := range user.Files {
		filesBytes += f.Size
	}
	for _, m := range user.Music {
		musicBytes += m.Size
	}

	summary := AdminUserSummary{
		ID:         user.ID,
		Email:      user.Email,
		IsAdmin:    user.IsAdmin,
		Active:     user.Active,
		FilesBytes: filesBytes,
		MusicBytes: musicBytes,
		FilesCount: len(user.Files),
		MusicCount: len(user.Music),
	}

	// Find all games where user is a participant
	cur, err := r.Games.Find(ctx, bson.M{
		"participants.userId": userID,
	}, options.Find().SetProjection(bson.M{"_id": 1, "name": 1, "participants": 1}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var games []struct {
		ID           primitive.ObjectID       `bson:"_id"`
		Name         string                   `bson:"name"`
		Participants []models.GameParticipant `bson:"participants"`
	}
	if err := cur.All(ctx, &games); err != nil {
		return nil, err
	}

	// For each game, get last session EndedAt
	userGames := make([]AdminUserGame, 0, len(games))
	for _, g := range games {
		var role string
		for _, p := range g.Participants {
			if p.UserID == userID {
				role = string(p.Role)
				break
			}
		}

		lastSeen := r.lastSeenInGame(ctx, g.ID, userID)
		userGames = append(userGames, AdminUserGame{
			GameID:   g.ID.Hex(),
			GameName: g.Name,
			Role:     role,
			LastSeen: lastSeen,
		})
	}

	return &AdminUserDetail{AdminUserSummary: summary, Games: userGames}, nil
}

func (r *AdminRepository) SetUserActive(ctx context.Context, userID primitive.ObjectID, active bool) error {
	_, err := r.Users.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"active": active}})
	return err
}

func (r *AdminRepository) DeleteUser(ctx context.Context, userID primitive.ObjectID) error {
	_, err := r.Users.DeleteOne(ctx, bson.M{"_id": userID})
	return err
}

// --- GAME ADMIN METHODS ---

func (r *AdminRepository) ListGames(ctx context.Context) ([]AdminGameSummary, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetProjection(bson.M{
			"name": 1, "gameSystem": 1, "status": 1,
			"gameMasterId": 1, "createdAt": 1, "deletedAt": 1,
			"participants": 1,
		})

	cur, err := r.Games.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var raw []struct {
		ID           primitive.ObjectID       `bson:"_id"`
		Name         string                   `bson:"name"`
		GameSystem   string                   `bson:"gameSystem"`
		Status       string                   `bson:"status"`
		GameMasterID primitive.ObjectID       `bson:"gameMasterId"`
		Participants []models.GameParticipant `bson:"participants"`
		CreatedAt    time.Time                `bson:"createdAt"`
		DeletedAt    *time.Time               `bson:"deletedAt,omitempty"`
	}
	if err := cur.All(ctx, &raw); err != nil {
		return nil, err
	}

	result := make([]AdminGameSummary, 0, len(raw))
	for _, g := range raw {
		result = append(result, AdminGameSummary{
			ID:               g.ID,
			Name:             g.Name,
			GameSystem:       g.GameSystem,
			Status:           g.Status,
			GameMasterID:     g.GameMasterID,
			ParticipantCount: len(g.Participants),
			CreatedAt:        g.CreatedAt,
			DeletedAt:        g.DeletedAt,
		})
	}
	return result, nil
}

func (r *AdminRepository) GetGameDetail(ctx context.Context, gameID primitive.ObjectID) (*AdminGameDetail, error) {
	var raw struct {
		ID           primitive.ObjectID       `bson:"_id"`
		Name         string                   `bson:"name"`
		GameSystem   string                   `bson:"gameSystem"`
		Status       string                   `bson:"status"`
		GameMasterID primitive.ObjectID       `bson:"gameMasterId"`
		Participants []models.GameParticipant `bson:"participants"`
		CreatedAt    time.Time                `bson:"createdAt"`
		DeletedAt    *time.Time               `bson:"deletedAt,omitempty"`
	}

	err := r.Games.FindOne(ctx, bson.M{"_id": gameID},
		options.FindOne().SetProjection(bson.M{
			"name": 1, "gameSystem": 1, "status": 1,
			"gameMasterId": 1, "createdAt": 1, "deletedAt": 1,
			"participants": 1,
		}),
	).Decode(&raw)
	if err != nil {
		return nil, err
	}

	// Batch-fetch emails from users collection as authoritative source
	userIDs := make([]primitive.ObjectID, 0, len(raw.Participants))
	for _, p := range raw.Participants {
		userIDs = append(userIDs, p.UserID)
	}
	emailByID := r.emailsByIDs(ctx, userIDs)

	summary := AdminGameSummary{
		ID:               raw.ID,
		Name:             raw.Name,
		GameSystem:       raw.GameSystem,
		Status:           raw.Status,
		GameMasterID:     raw.GameMasterID,
		ParticipantCount: len(raw.Participants),
		CreatedAt:        raw.CreatedAt,
		DeletedAt:        raw.DeletedAt,
	}

	participants := make([]AdminGameParticipant, 0, len(raw.Participants))
	for _, p := range raw.Participants {
		email := emailByID[p.UserID]
		if email == "" {
			email = p.Email // fallback to embedded value
		}
		lastSeen := r.lastSeenInGame(ctx, gameID, p.UserID)
		participants = append(participants, AdminGameParticipant{
			UserID:   p.UserID.Hex(),
			Email:    email,
			Role:     string(p.Role),
			LastSeen: lastSeen,
		})
	}

	return &AdminGameDetail{AdminGameSummary: summary, Participants: participants}, nil
}

func (r *AdminRepository) DeleteGame(ctx context.Context, gameID primitive.ObjectID) error {
	_, err := r.Games.DeleteOne(ctx, bson.M{"_id": gameID})
	return err
}

// --- STATS METHODS ---

func (r *AdminRepository) StorageStats(ctx context.Context) ([]StorageEntry, error) {
	opts := options.Find().SetProjection(bson.M{
		"email": 1, "files.size": 1, "music.size": 1,
	})
	cur, err := r.Users.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var users []models.User
	if err := cur.All(ctx, &users); err != nil {
		return nil, err
	}

	result := make([]StorageEntry, 0, len(users))
	for _, u := range users {
		var filesBytes, musicBytes int64
		for _, f := range u.Files {
			filesBytes += f.Size
		}
		for _, m := range u.Music {
			musicBytes += m.Size
		}
		result = append(result, StorageEntry{
			ID:         u.ID,
			Email:      u.Email,
			FilesBytes: filesBytes,
			MusicBytes: musicBytes,
			TotalBytes: filesBytes + musicBytes,
		})
	}
	return result, nil
}

func (r *AdminRepository) SessionStats(ctx context.Context) ([]SessionEntry, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"endedAt": bson.M{"$ne": nil}}}},
		{{Key: "$group", Value: bson.M{
			"_id":          "$gameId",
			"totalSeconds": bson.M{"$sum": "$duration"},
			"sessionCount": bson.M{"$sum": 1},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "totalSeconds", Value: -1}}}},
		{{Key: "$limit", Value: 50}},
		{{Key: "$lookup", Value: bson.M{
			"from":         "games",
			"localField":   "_id",
			"foreignField": "_id",
			"as":           "game",
		}}},
		{{Key: "$unwind", Value: bson.M{"path": "$game", "preserveNullAndEmptyArrays": true}}},
		{{Key: "$project", Value: bson.M{
			"gameId":       bson.M{"$toString": "$_id"},
			"gameName":     "$game.name",
			"totalSeconds": 1,
			"sessionCount": 1,
		}}},
	}

	cur, err := r.OnlineSessions.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var raw []struct {
		GameID       string `bson:"gameId"`
		GameName     string `bson:"gameName"`
		TotalSeconds int64  `bson:"totalSeconds"`
		SessionCount int64  `bson:"sessionCount"`
	}
	if err := cur.All(ctx, &raw); err != nil {
		return nil, err
	}

	result := make([]SessionEntry, 0, len(raw))
	for _, r := range raw {
		result = append(result, SessionEntry{
			GameID:       r.GameID,
			GameName:     r.GameName,
			TotalSeconds: r.TotalSeconds,
			SessionCount: r.SessionCount,
		})
	}
	return result, nil
}

// emailsByIDs returns a map of userID → email fetched from the users collection.
func (r *AdminRepository) emailsByIDs(ctx context.Context, ids []primitive.ObjectID) map[primitive.ObjectID]string {
	result := make(map[primitive.ObjectID]string, len(ids))
	if len(ids) == 0 {
		return result
	}
	cur, err := r.Users.Find(ctx,
		bson.M{"_id": bson.M{"$in": ids}},
		options.Find().SetProjection(bson.M{"email": 1}),
	)
	if err != nil {
		return result
	}
	defer cur.Close(ctx)
	var users []struct {
		ID    primitive.ObjectID `bson:"_id"`
		Email string             `bson:"email"`
	}
	_ = cur.All(ctx, &users)
	for _, u := range users {
		result[u.ID] = u.Email
	}
	return result
}

// lastSeenInGame returns the Unix timestamp of the most recent EndedAt for a user in a game.
// Returns nil if no closed session exists.
func (r *AdminRepository) lastSeenInGame(ctx context.Context, gameID, userID primitive.ObjectID) *int64 {
	opts := options.FindOne().
		SetSort(bson.D{{Key: "endedAt", Value: -1}}).
		SetProjection(bson.M{"endedAt": 1})

	var session struct {
		EndedAt *time.Time `bson:"endedAt"`
	}
	err := r.OnlineSessions.FindOne(ctx, bson.M{
		"gameId":  gameID,
		"userId":  userID,
		"endedAt": bson.M{"$ne": nil},
	}, opts).Decode(&session)
	if err != nil || session.EndedAt == nil {
		return nil
	}
	ts := session.EndedAt.Unix()
	return &ts
}
